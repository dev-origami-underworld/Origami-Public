#!/usr/bin/env node
/*
 * probe-srt-sync.js — DO THE LYRICS LAND WHERE SHE ACTUALLY SINGS?
 *
 * Mark 2026-08-04: "starlettes lyrics arent matching up to the song srt file anymore, the time is all
 * wrong."
 *
 * ── HOW THIS IS ANSWERABLE WITHOUT EARS ───────────────────────────────────────────────────────────
 * The catalog carries `vocalWindows` for each track: MEASURED spans of where there is singing, derived
 * from the audio itself, not authored by hand. That makes them ground truth independent of the SRT. So
 * a caption is "right" if it lands inside a vocal window and "wrong" if it lands over silence — and the
 * question stops being a matter of opinion.
 *
 * Three numbers per track, and the third is the one that names the fix:
 *   · COVERAGE      — what share of cues start inside a vocal window. Low = desynced.
 *   · DURATION      — the SRT's last cue vs the file's real length (ffprobe). A last cue past the end of
 *                     the audio means the SRT was written for a DIFFERENT, longer cut of the song.
 *   · BEST OFFSET   — the single shift that maximises coverage, searched over ±90s. If some offset scores
 *                     far better than 0, the SRT is not wrong, it is DISPLACED — and by exactly that much.
 *                     That distinction decides the repair: re-time by hand, or add one constant.
 *
 * Usage: node scripts/probe-srt-sync.js
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = process.cwd();

const parseSrt = (txt) => {
  const cues = [];
  const re = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/g;
  let m;
  while ((m = re.exec(txt))) {
    const s = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    const e = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
    cues.push([s, e]);
  }
  return cues;
};

const durationOf = (file) => {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' });
    const d = parseFloat(out.trim());
    return isFinite(d) ? d : null;
  } catch (_) { return null; }
};

// A cue counts as covered if its START sits inside any vocal window. Start, not midpoint: captions are
// deliberately held past the last note (good practice), so judging the whole span would punish that.
const coverage = (cues, windows, shift) => {
  if (!cues.length || !windows.length) return 0;
  let hit = 0;
  for (const [s] of cues) {
    const t = s + shift;
    if (windows.some(([a, b]) => t >= a - 0.35 && t <= b + 0.35)) hit++;
  }
  return hit / cues.length;
};

(async () => {
  const cat = await import('file://' + path.join(ROOT, 'js/v8/data/SongCatalog.js'));
  const rows = [];

  for (const song of cat.SONGS) {
    // Each track can carry a main SRT and a continuation SRT; they are separate timelines and must be
    // judged separately — part 2's cues are relative to part 2's own start.
    const parts = [
      { tag: '', srt: song.captions, file: song.file, win: song.vocalWindows },
      { tag: ' (part 2)', srt: song.continuationCaptions, file: song.continuation, win: song.continuationVocalWindows },
    ];
    for (const p of parts) {
      if (!p.srt) continue;
      const srtPath = path.join(ROOT, p.srt.replace(/^\.\//, ''));
      const audPath = p.file ? path.join(ROOT, p.file.replace(/^\.\//, '')) : null;
      const row = { id: song.id + p.tag, srt: p.srt, ok: true, notes: [] };
      if (!fs.existsSync(srtPath)) { row.ok = false; row.notes.push('SRT MISSING on disk'); rows.push(row); continue; }
      const cues = parseSrt(fs.readFileSync(srtPath, 'utf8'));
      row.cues = cues.length;
      if (!cues.length) { row.ok = false; row.notes.push('SRT parsed to ZERO cues'); rows.push(row); continue; }
      row.lastCue = cues[cues.length - 1][1];
      row.firstCue = cues[0][0];

      if (audPath && fs.existsSync(audPath)) {
        row.dur = durationOf(audPath);
        if (row.dur && row.lastCue > row.dur + 0.5) {
          row.ok = false;
          row.notes.push(`last cue ${row.lastCue.toFixed(1)}s runs PAST the audio (${row.dur.toFixed(1)}s) by ${(row.lastCue - row.dur).toFixed(1)}s — this SRT was written for a different cut`);
        }
      } else if (audPath) { row.notes.push('audio file missing: ' + p.file); }

      const win = Array.isArray(p.win) ? p.win : null;
      if (!win || !win.length) {
        row.notes.push('no vocalWindows in the catalog — cannot judge placement, only length');
      } else {
        row.cov0 = coverage(cues, win, 0);
        // Search a single global shift. Coarse then fine, so a 90s window stays cheap.
        let best = { shift: 0, cov: row.cov0 };
        for (let s = -90; s <= 90; s += 0.5) {
          const c = coverage(cues, win, s);
          if (c > best.cov + 1e-9) best = { shift: s, cov: c };
        }
        for (let s = best.shift - 0.5; s <= best.shift + 0.5; s += 0.05) {
          const c = coverage(cues, win, s);
          if (c > best.cov + 1e-9) best = { shift: s, cov: c };
        }
        row.best = best;
        if (row.cov0 < 0.8) {
          row.ok = false;
          row.notes.push(`only ${(row.cov0 * 100).toFixed(0)}% of cues land where she sings`);
          if (best.cov >= 0.8 && Math.abs(best.shift) > 0.2)
            row.notes.push(`⇒ DISPLACED, NOT WRONG: shifting every cue by ${best.shift > 0 ? '+' : ''}${best.shift.toFixed(2)}s lifts it to ${(best.cov * 100).toFixed(0)}%`);
          else
            row.notes.push('⇒ no single shift repairs it — the cues are individually mistimed, not offset');
        }
      }
      rows.push(row);
    }
  }

  console.log('\n── SRT vs WHERE SHE ACTUALLY SINGS ────────────────────────────────────\n');
  let bad = 0;
  for (const r of rows) {
    const head = r.ok ? '  ✓' : '  ✗';
    const cov = (r.cov0 == null) ? '   —  ' : `${(r.cov0 * 100).toFixed(0)}%`.padStart(5);
    console.log(`${head} ${r.id.padEnd(22)} cues:${String(r.cues ?? '-').padStart(3)}  in-vocal:${cov}  ` +
                `span ${r.firstCue != null ? r.firstCue.toFixed(1) : '-'}–${r.lastCue != null ? r.lastCue.toFixed(1) : '-'}s` +
                `${r.dur ? `  audio ${r.dur.toFixed(1)}s` : ''}`);
    for (const n of r.notes) console.log(`      ${n}`);
    if (!r.ok) bad++;
  }
  // Songs with no captions at all are a separate, quieter gap — named so they are not mistaken for passing.
  const noCap = cat.SONGS.filter(s => !s.captions).map(s => s.id);
  if (noCap.length) console.log(`\n  (no SRT at all, so nothing to desync: ${noCap.join(', ')})`);
  console.log(bad ? `\n  ✗ ${bad} track(s) desynced\n` : '\n  ✓ every SRT lands on the vocals\n');
  process.exit(bad ? 1 : 0);
})();
