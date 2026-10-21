#!/usr/bin/env node
/*
 * probe-caption-a11y.js — ARE THE HAIKU CAPTION BOXES WCAG 2.2 AAA?
 *
 * Mark 2026-07-31: "100% accuracy and timing of those caption boxes we use with english and kanji with
 * the words being said for wcag 2.2/aaa compliance".
 *
 * ── THE CONTRAST PROBLEM THIS IS BUILT AROUND ───────────────────────────────────────────────────
 * #chat-overlay's background is TRANSLUCENT — rgba(10,16,22,0.74) with a backdrop blur, floating over
 * whatever the 3D scene happens to be rendering. So there is no single "background colour" to measure
 * against, and a naive check that reads the CSS background and calls it opaque will report a
 * comfortable number that the player never actually sees. A lantern, a fire, a white wall behind her
 * all raise the composited background and drag the ratio down.
 *
 * The honest test is therefore the WORST CASE: composite the box over WHITE (the brightest thing the
 * scene can put behind it) and require 7:1 even then. Pass that and the caption is AAA everywhere;
 * pass only against the CSS colour and you have proved nothing about the game.
 *
 * ── AND THE PART MOST CAPTION CHECKERS CANNOT DO ────────────────────────────────────────────────
 * A caption can be perfectly legible and still wrong, because it is on screen when nothing is being
 * sung. Every cue is checked against the MEASURED vocal windows in SongCatalog (signal level on the
 * demucs-isolated stem, not a transcript's opinion), so "the words appear while the words are sung"
 * is a gate rather than an assumption. That is 1.2.2's actual intent.
 *
 * Also gated, from the caption conventions AAA leans on (BBC/Ofcom/DCMP):
 *   · reading rate — Latin ≤ 21 chars/s, Japanese ≤ 8 chars/s (a kanji carries far more per glyph)
 *   · ≤ 2 lines of caption, ≤ 42 Latin chars per line (1.4.8 caps at 80; 42 is the subtitle norm)
 *   · minimum 1.0 s on screen — below that a caption cannot be read at any size
 *   · no overlapping or out-of-order cues
 *
 * Usage: node scripts/probe-caption-a11y.js
 */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(12000);

    const steps = {}, detail = {};

    // ── CONTRAST, measured from the LIVE computed styles of a real caption ──────────────────────
    // The box is shown with real content first, so every value below comes from what the browser
    // actually resolved — inherited colour, opacity, font-size — rather than from re-reading the
    // stylesheet and hoping the cascade agreed.
    const contrast = await page.evaluate(() => {
        const box = document.getElementById('chat-overlay');
        if (!box) return { error: 'no #chat-overlay' };
        box.innerHTML = '<span class="hk-speaker">♪ 歌に息</span>'
                      + '<span class="hk-body">星さえ歌う'
                      + '<span class="hk-en">Now the silent stars can sing</span></span>';
        // Kill the fade-in transition before reading anything: #chat-overlay animates opacity 0 -> 1 over
        // 350ms, and a computed opacity sampled mid-fade poisons every ratio below (the first run of this
        // probe divided by it and reported NaN for all three layers).
        box.style.transition = 'none';
        box.classList.add('on');
        box.style.opacity = '1';

        const srgb = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
        const parse = s => { const m = String(s).match(/-?[\d.]+/g) || []; return { rgb: m.slice(0, 3).map(Number), a: m.length > 3 ? +m[3] : 1 }; };
        // src over dst, both 0-255 triples, alpha 0..1
        const over = (src, a, dst) => src.map((c, i) => c * a + dst[i] * (1 - a));

        // Opacity of a text layer RELATIVE TO THE BOX — walk up to the box and stop. Going all the way to
        // <html> and dividing by the box's own chain is what produced NaN: the box is opacity:0 until its
        // .on transition finishes, so the divisor was zero.
        const relOpacity = (el, stop) => { let o = 1, n = el; while (n && n !== stop) { o *= parseFloat(getComputedStyle(n).opacity || '1'); n = n.parentElement; } return o; };

        // ⚠ THE BOX'S BACKGROUND IS A GRADIENT, NOT A COLOUR. #chat-overlay paints with
        // linear-gradient(...), which lands in background-IMAGE; background-COLOR computes to
        // rgba(0,0,0,0). Reading backgroundColor therefore measures the text against bare white and
        // reports ~1.1:1 — a catastrophic failure that does not exist. (The first run of this probe did
        // exactly that.) Parse the gradient's stops and take the LIGHTEST one, since a lighter backdrop
        // is the worse case for light text.
        const csBox = getComputedStyle(box);
        const stops = (csBox.backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(parse);
        const solid = parse(csBox.backgroundColor);
        const candidates = stops.length ? stops : [solid];
        const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
        // Worst case = whichever stop composites LIGHTEST over white.
        const compOverWhite = candidates.map(c => over(c.rgb, c.a, WHITE));
        const bgOverWhite = compOverWhite.reduce((m, c) => (lum(c) > lum(m) ? c : m), compOverWhite[0]);
        const bgOverBlack = candidates.map(c => over(c.rgb, c.a, BLACK))
                                      .reduce((m, c) => (lum(c) < lum(m) ? c : m), over(candidates[0].rgb, candidates[0].a, BLACK));

        const layers = [];
        for (const [label, sel] of [['speaker', '.hk-speaker'], ['japanese', '.hk-body'], ['english', '.hk-en']]) {
            const el = box.querySelector(sel);
            if (!el) continue;
            const cs = getComputedStyle(el);
            const col = parse(cs.color);
            const op = relOpacity(el, box);
            const px = parseFloat(cs.fontSize);
            const weight = parseInt(cs.fontWeight, 10) || 400;
            // Text drawn at reduced opacity blends toward the background it sits on.
            const onWhite = over(col.rgb, col.a * op, bgOverWhite);
            const onBlack = over(col.rgb, col.a * op, bgOverBlack);
            // WCAG "large text" relaxes AAA to 4.5:1 — 18.66px bold, or 24px at any weight.
            const large = px >= 24 || (px >= 18.66 && weight >= 700);
            layers.push({
                label, fontPx: +px.toFixed(1), weight, opacity: +op.toFixed(2), large,
                worstCaseRatio: +ratio(onWhite, bgOverWhite).toFixed(2),
                overBlackRatio: +ratio(onBlack, bgOverBlack).toFixed(2),
                requiredAAA: large ? 4.5 : 7.0,
            });
        }
        return { boxBackgroundImage: csBox.backgroundImage.slice(0, 120),
                 gradientStops: candidates.map(c => `rgba(${c.rgb.join(',')},${c.a})`),
                 worstBackdropOverWhite: bgOverWhite.map(v => Math.round(v)), layers };
    });
    detail.contrast = contrast;
    const layers = contrast.layers || [];
    steps.everyTextLayerMeetsAAAContrast = layers.length > 0
        && layers.every(l => l.worstCaseRatio >= l.requiredAAA);

    // ── THE CUES THEMSELVES ─────────────────────────────────────────────────────────────────────
    const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
    if (!eng) { console.log('❌ engine frame not found'); await browser.close(); process.exit(1); }
    await eng.evaluate(() => window._cabaretCaptionReady).catch(() => {});

    const data = await eng.evaluate(() => {
        const w = window;
        const cues = {};
        for (const [track, list] of Object.entries(w._cabaretCaptionCues || {}))
            cues[track] = (list || []).map(c => ({ i: c.index, s: c.start, e: c.end, jp: c.jp, en: c.en }));
        return { cues, vocal: w._songVocalWindows || null };
    });

    // MAX_LINE (2026-09-13): the subtitle norm is ≤42 chars PER RENDERED LINE and ≤2 lines; the box wraps its span, and the
    // SRT is positional (JA / EN / FR) so a wrapped English line cannot be expressed as two lines — allow two rendered lines.
    const LATIN_CPS = 21, JP_CPS = 8, MIN_S = 1.0, MAX_LINE = 84;
    const isJP = s => /[぀-ヿ㐀-鿿]/.test(s);
    const findings = [];
    let cueCount = 0;
    for (const [track, list] of Object.entries(data.cues)) {
        for (const c of list) {
            cueCount++;
            const dur = c.e - c.s;
            const where = `${track} #${c.i + 1} @${c.s.toFixed(1)}s`;
            if (dur < MIN_S) findings.push({ rule: 'min-duration', where, detail: `${dur.toFixed(2)}s < ${MIN_S}s` });
            for (const [lang, text] of [['jp', c.jp], ['en', c.en]]) {
                if (!text) { findings.push({ rule: 'missing-line', where, detail: `${lang} line empty` }); continue; }
                const cap = isJP(text) ? JP_CPS : LATIN_CPS;
                const cps = text.length / Math.max(0.001, dur);
                if (cps > cap) findings.push({ rule: 'reading-rate', where, detail: `${lang} ${cps.toFixed(1)} cps > ${cap}` });
                if (!isJP(text) && text.length > MAX_LINE)
                    findings.push({ rule: 'line-length', where, detail: `${lang} ${text.length} chars > ${MAX_LINE}` });
            }
        }
        for (let i = 1; i < list.length; i++)
            if (list[i].s < list[i - 1].e - 0.001)
                findings.push({ rule: 'overlap', where: `${track} #${i + 1}`, detail: `starts ${(list[i - 1].e - list[i].s).toFixed(2)}s before previous ends` });
    }

    // ── SYNCHRONISATION against MEASURED vocal, not against a transcript's opinion ───────────────
    let syncChecked = 0, syncBad = 0;
    if (data.vocal) {
        for (const [track, list] of Object.entries(data.cues)) {
            const win = data.vocal[track];
            if (!Array.isArray(win) || !win.length) continue;
            // ± TOLERANCE, AND THE NUMBER IS MEASURED. A caption legitimately leads a note in and hangs
            // past it — that is subtitling practice, not desync. Checked against the ONE track with
            // human-written lyrics: of 21 hand-authored 黄泉の宿 cues, 19 sit squarely inside a measured
            // window and the two that do not are both the held phrase 出たくない, missing by 1.15s and
            // 0.10s as the note decays under the RMS gate. So 1.5s admits every human cue on the one
            // reference we have while still catching a caption stranded in an instrumental passage —
            // the failure this gate exists for, which is tens of seconds wide, not one.
            const TOL = 1.5;
            for (const c of list) {
                syncChecked++;
                const overlaps = win.some(([a, b]) => c.e > a - TOL && c.s < b + TOL);
                if (!overlaps) {
                    const gap = Math.min(...win.map(([a, b]) => Math.min(Math.abs(c.s - b), Math.abs(a - c.e))));
                    syncBad++;
                    findings.push({ rule: 'caption-without-vocal', where: `${track} #${c.i + 1} @${c.s.toFixed(1)}s`,
                                    detail: `nearest measured singing is ${gap.toFixed(2)}s away` });
                }
            }
        }
    }
    detail.cueCount = cueCount;
    detail.syncChecked = syncChecked;
    detail.findings = findings;
    detail.vocalWindowsPresent = !!data.vocal;

    steps.everyCueHasBothLanguages = !findings.some(f => f.rule === 'missing-line');
    steps.readingRateIsWithinAAA = !findings.some(f => f.rule === 'reading-rate');
    steps.noCaptionIsTooBriefToRead = !findings.some(f => f.rule === 'min-duration');
    steps.lineLengthWithinSubtitleNorm = !findings.some(f => f.rule === 'line-length');
    steps.noOverlappingCues = !findings.some(f => f.rule === 'overlap');
    steps.vocalWindowsArePublished = !!data.vocal;
    steps.everyCaptionLandsOnRealSinging = syncChecked > 0 && syncBad === 0;

    detail.pageErrors = errs.slice(0, 5);
    steps.noPageErrors = errs.length === 0;

    const pass = Object.values(steps).filter(Boolean).length, total = Object.keys(steps).length;
    console.log('\n── CAPTION ACCESSIBILITY (WCAG 2.2 AAA) ─────────────────────────');
    for (const [k, v] of Object.entries(steps)) console.log(`  ${v ? '✅' : '❌'} ${k}`);
    console.log('\ncontrast (worst case = box composited over WHITE):');
    for (const l of layers)
        console.log(`  ${l.worstCaseRatio >= l.requiredAAA ? '✅' : '❌'} ${l.label.padEnd(9)} ${String(l.fontPx).padStart(5)}px w${l.weight} op${l.opacity}  ${String(l.worstCaseRatio).padStart(5)}:1  (needs ${l.requiredAAA}:1)`);
    if (findings.length) {
        console.log(`\n${findings.length} caption findings:`);
        for (const f of findings.slice(0, 25)) console.log(`  · ${f.rule.padEnd(24)} ${f.where}  — ${f.detail}`);
        if (findings.length > 25) console.log(`  … and ${findings.length - 25} more`);
    }
    console.log('\n' + JSON.stringify({ cueCount, syncChecked, vocalWindowsPresent: detail.vocalWindowsPresent, pageErrors: detail.pageErrors }, null, 2));
    console.log(`\n${pass}/${total}`);
    await browser.close();
    process.exit(pass === total ? 0 : 1);
})();
