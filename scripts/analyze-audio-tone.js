#!/usr/bin/env node
/*
 * analyze-audio-tone.js — MEASURE HARD vs SOFT AND DARK vs LIGHT FROM THE AUDIO ITSELF.
 *
 * Mark 2026-08-05: "you can grab them and I will have the slider, unless you can fucking detect tone in
 * the songs somehow and understand a light beat from a dark beat".
 *
 * Yes — both axes are measurable, and neither needs an opinion. What follows is what is actually being
 * computed, so the numbers can be argued with instead of trusted.
 *
 * ── HARDNESS (0..1) ─────────────────────────────────────────────────────────────────────────────
 *   · ONSET DENSITY — spectral flux peaks per second. How often something is struck. This is the
 *     single strongest "hard" cue: a driving EDM track fires 4-8 onsets/sec, a ballad under 2.
 *   · CREST FACTOR (peak ÷ RMS, inverted) — how COMPRESSED the master is. Loud, dense, modern-mastered
 *     tracks sit near their peak constantly (low crest); a gentle performance breathes (high crest).
 *   · HIGH-BAND ENERGY (>4 kHz share) — cymbals, distortion and transient bite live up there.
 *
 * ── KARMA LEAN (-1 dark .. +1 light) ────────────────────────────────────────────────────────────
 *   · SPECTRAL CENTROID — the textbook measure of timbral BRIGHTNESS: the centre of mass of the
 *     spectrum. A dark, bass-heavy mix has a low centroid; an airy one is high. This is the honest
 *     core of "light beat vs dark beat".
 *   · MODE ESTIMATE (major/minor) — a 12-bin chroma is folded from the spectrum and correlated against
 *     the Krumhansl-Schmuckler major and minor key profiles across all 12 rotations. Whichever wins,
 *     and by how much, gives a signed major-ness. This is the closest thing to "does it sound happy",
 *     and it is a real, standard method rather than a vibe.
 *
 * ⚠ WHAT THIS HONESTLY CANNOT DO. It hears TIMBRE and HARMONY, not meaning. A cheerful-sounding song
 *   about something awful will read light. Lyrics are not considered — there is no transcription here.
 *   So these are a strong STARTING POINT, and Mark's slider/selector always overrides: the numbers go
 *   into the catalog as seeds, and any value he sets in game wins over them.
 *
 * No new dependencies: ffmpeg decodes to raw mono PCM, and the FFT below is ~30 lines.
 *
 * Usage: node scripts/analyze-audio-tone.js            (prints the table)
 *        node scripts/analyze-audio-tone.js --write    (also writes js/v8/data/ToneAnalysis.js)
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = process.cwd();
const SR = 22050, FFT = 2048, HOP = 512;
const WINDOWS = 6;          // sample this many 8s windows spread across the track, not the whole file
const WIN_S = 8;

// ── a compact iterative radix-2 FFT (in-place, real+imag arrays) ───────────────────────────────
function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cwr = 1, cwi = 0;
            for (let k = 0; k < len / 2; k++) {
                const ur = re[i + k], ui = im[i + k];
                const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
                const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
                re[i + k] = ur + vr; im[i + k] = ui + vi;
                re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
                const nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr;
            }
        }
    }
}

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const corr = (a, b) => {
    const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return (da && db) ? num / Math.sqrt(da * db) : 0;
};

function decode(file, startS, durS) {
    try {
        const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(startS), '-t', String(durS),
            '-i', path.join(ROOT, file), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
            { maxBuffer: 1 << 28 });
        return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
    } catch (_) { return null; }
}

function analyse(file, seconds) {
    const dur = seconds || 60;
    const starts = [];
    for (let i = 0; i < WINDOWS; i++) starts.push(Math.max(0, (dur * (i + 0.5) / WINDOWS) - WIN_S / 2));

    let sumCentroid = 0, sumHigh = 0, nFrames = 0, onsets = 0, totalS = 0;
    let peak = 0, sumSq = 0, nSamp = 0;
    const chroma = new Array(12).fill(0);
    let prevMag = null;

    for (const st of starts) {
        const pcm = decode(file, st, WIN_S);
        if (!pcm || pcm.length < FFT) continue;
        totalS += pcm.length / SR;
        for (let i = 0; i < pcm.length; i++) { const v = Math.abs(pcm[i]); if (v > peak) peak = v; sumSq += pcm[i] * pcm[i]; nSamp++; }

        for (let off = 0; off + FFT <= pcm.length; off += HOP) {
            const re = new Float64Array(FFT), im = new Float64Array(FFT);
            for (let i = 0; i < FFT; i++) re[i] = pcm[off + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT - 1)));
            fft(re, im);
            const half = FFT >> 1;
            const mag = new Float64Array(half);
            let wsum = 0, csum = 0, hi = 0, all = 0;
            for (let k = 1; k < half; k++) {
                const m = Math.hypot(re[k], im[k]);
                mag[k] = m;
                const f = k * SR / FFT;
                wsum += m; csum += m * f; all += m;
                if (f > 4000) hi += m;
                // fold into chroma (A4=440 → midi 69)
                if (f > 55 && f < 5000) {
                    const midi = 69 + 12 * Math.log2(f / 440);
                    chroma[((Math.round(midi) % 12) + 12) % 12] += m;
                }
            }
            if (wsum > 1e-9) { sumCentroid += csum / wsum; sumHigh += hi / (all || 1); nFrames++; }
            // spectral flux → onset
            if (prevMag) {
                let flux = 0;
                for (let k = 1; k < half; k++) { const d = mag[k] - prevMag[k]; if (d > 0) flux += d; }
                if (flux > (prevMag._thr || 0)) onsets++;
                mag._thr = flux * 1.35 + (prevMag._thr || 0) * 0.6;   // adaptive, cheap
            }
            prevMag = mag;
        }
        prevMag = null;
    }

    if (!nFrames || !nSamp) return null;
    const centroid = sumCentroid / nFrames;
    const highShare = sumHigh / nFrames;
    const rms = Math.sqrt(sumSq / nSamp);
    const crest = peak > 0 && rms > 0 ? peak / rms : 4;
    const onsetRate = totalS > 0 ? onsets / totalS : 0;

    // mode: best major vs best minor correlation over all 12 rotations
    const c = chroma.slice();
    const tot = c.reduce((s, v) => s + v, 0) || 1;
    for (let i = 0; i < 12; i++) c[i] /= tot;
    let bestMaj = -1, bestMin = -1;
    for (let r = 0; r < 12; r++) {
        const rot = c.slice(r).concat(c.slice(0, r));
        bestMaj = Math.max(bestMaj, corr(rot, KS_MAJOR));
        bestMin = Math.max(bestMin, corr(rot, KS_MINOR));
    }
    const majorness = bestMaj - bestMin;          // >0 major-ish, <0 minor-ish

    // RAW FEATURES ONLY. The mapping to the two axes happens AFTER the whole corpus is measured —
    // see calibrate() and the note there. Absolute thresholds were tried first and were wrong.
    return {
        centroidHz: Math.round(centroid),
        onsetRate: Math.round(onsetRate * 100) / 100,
        crest: Math.round(crest * 100) / 100,
        highShare: Math.round(highShare * 1000) / 1000,
        majorness: Math.round(majorness * 1000) / 1000,
    };
}

/**
 * ── CALIBRATE AGAINST THE COLLECTION, NOT AGAINST ABSOLUTE THRESHOLDS ───────────────────────────
 * The first version mapped raw features through fixed cutoffs (centroid 700-3200 Hz etc.) and produced
 * a library where nearly everything read "light" — including 地獄越え, a track literally called CROSSING
 * HELL from the StrongEDM folder, at +0.56. The features were fine; the CALIBRATION was wrong.
 *
 * The reason is worth writing down: this collection is almost entirely modern, brightly-mastered AI
 * pop/EDM, so absolute brightness measures the MASTERING, not the mood — the centroids cluster at
 * 3000-3500 Hz and cannot separate anything. What actually discriminates is where a track sits
 * RELATIVE TO ITS SIBLINGS.
 *
 * So both axes are percentile-ranked across the corpus: the hardest thing Mark owns is 1.0, the darkest
 * is -1.0, and the sliders sweep across real, evenly-spread content instead of bunching at one end.
 * Re-running after adding tracks re-calibrates, which is correct — "hard for this game" is a statement
 * about this library.
 *
 * Karma additionally leans on MAJORNESS more than brightness, for the same reason: brightness here is
 * largely a mastering artefact, while major/minor survives it.
 */
function calibrate(rows) {
    const rank = (vals, v) => {
        let below = 0;
        for (const x of vals) if (x < v) below++;
        return vals.length > 1 ? below / (vals.length - 1) : 0.5;
    };
    const onset = rows.map(r => r.onsetRate), comp = rows.map(r => -r.crest), high = rows.map(r => r.highShare);
    const cent = rows.map(r => r.centroidHz), maj = rows.map(r => r.majorness);
    for (const r of rows) {
        const h = 0.50 * rank(onset, r.onsetRate) + 0.30 * rank(comp, -r.crest) + 0.20 * rank(high, r.highShare);
        r.hardness = Math.round(Math.max(0, Math.min(1, h)) * 100) / 100;
        const brightR = rank(cent, r.centroidHz);      // 0..1 within the corpus
        const majR    = rank(maj, r.majorness);        // 0..1 within the corpus
        const lean = (brightR - 0.5) * 2 * 0.45 + (majR - 0.5) * 2 * 0.55;
        r.karmaLean = Math.round(Math.max(-1, Math.min(1, lean)) * 100) / 100;
    }
    return rows;
}

(async () => {
    const man = await import('file://' + path.join(ROOT, 'js/v8/data/AudioManifest.js'));
    const files = man.MUSIC_FILES;
    const out = [];
    console.log(`\nanalysing ${files.length} tracks (${WINDOWS}×${WIN_S}s windows each)…\n`);
    console.log('  hard  lean   cent  onset crest  maj    track');
    for (const f of files) {
        const a = analyse(f.file.replace(/^\.\//, ''), f.seconds);
        if (!a) { console.log(`  (decode failed) ${f.name}`); continue; }
        out.push({ file: f.file, name: f.name, ...a });
    }
    calibrate(out);
    out.sort((x, y) => x.karmaLean - y.karmaLean);
    for (const a of out) {
        const lean = a.karmaLean >= 0.3 ? 'light' : a.karmaLean <= -0.3 ? 'DARK ' : 'mid  ';
        console.log(`  ${a.hardness.toFixed(2)}  ${String(a.karmaLean.toFixed(2)).padStart(5)} ${lean} ${String(a.centroidHz).padStart(5)} ${String(a.onsetRate.toFixed(1)).padStart(5)} ${String(a.crest.toFixed(1)).padStart(5)} ${String(a.majorness.toFixed(2)).padStart(6)}  ${a.name}`);
    }

    if (process.argv.includes('--write')) {
        const dst = path.join(ROOT, 'js/v8/data/ToneAnalysis.js');
        fs.writeFileSync(dst, `/**
 * ToneAnalysis.js — GENERATED by scripts/analyze-audio-tone.js. Do not hand-edit.
 *
 * Mark 2026-08-05: "unless you can fucking detect tone in the songs somehow and understand a light beat
 * from a dark beat". These are measured from the audio, not guessed:
 *   hardness  = onset density + compression (inverse crest) + high-band share
 *   karmaLean = spectral centroid (timbral brightness) + major/minor via Krumhansl chroma correlation
 *
 * ⚠ It hears TIMBRE and HARMONY, never meaning — no lyrics are read. A cheerful-sounding song about
 *   something awful reads light. These are SEEDS; anything Mark sets in game overrides them.
 *
 * ${out.length} track(s) analysed.
 */
export const TONE = Object.freeze({
${out.map(t => `    ${JSON.stringify(t.file)}: { hardness: ${t.hardness}, karmaLean: ${t.karmaLean}, centroidHz: ${t.centroidHz}, onsetRate: ${t.onsetRate}, crest: ${t.crest}, majorness: ${t.majorness} },`).join('\n')}
});
export default TONE;
`);
        console.log(`\nwrote js/v8/data/ToneAnalysis.js — ${out.length} tracks\n`);
    }
})();
