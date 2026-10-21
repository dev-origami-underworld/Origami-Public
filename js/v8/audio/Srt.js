/* Srt.js: SRT parsing, cue checks and a cue scheduler. Pure: no DOM, no engine globals, so it runs in the browser and under node. [REF#AU-00309]
 *
 * Part of the special-NPC template (knowledge/design/SPECIAL_NPC_TEMPLATE.md). The engine has three older SRT parsers (the cabaret caption
 * system, the dream loader, UserSongs.js); this module is the shared one the NPC director uses, and the older three are not touched.
 *
 * A cue is { index, start, end, lines } with start and end in seconds and lines as the text lines of the block, in file order.
 * Time source: the scheduler asks `now()` for seconds on the playback timeline: an audio element's currentTime, or a clock
 * offset when the sound is muted, so subtitles still show for a player who cannot hear the voice.
 */

/** "HH:MM:SS,mmm" (or with a dot) to seconds. Returns NaN when the text is not a timestamp. [REF#AU-00310] */
export function parseTimestamp(value) {
  const m = /^\s*(\d+):(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?\s*$/.exec(String(value == null ? '' : value));
  if (!m) return NaN;
  const ms = m[4] ? Number((m[4] + '00').slice(0, 3)) : 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms / 1000;
}

/** Seconds to "HH:MM:SS,mmm". [REF#AU-00311] */
export function formatTimestamp(seconds) {
  const t = Math.max(0, Number(seconds) || 0);
  const whole = Math.floor(t);
  let ms = Math.round((t - whole) * 1000);
  let s = whole;
  if (ms === 1000) { ms = 0; s += 1; }
  const p = (n, w) => String(n).padStart(w, '0');
  return p(Math.floor(s / 3600), 2) + ':' + p(Math.floor((s % 3600) / 60), 2) + ':' + p(s % 60, 2) + ',' + p(ms, 3);
}

const stripTags = (line) => String(line).replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();

/** Parses SRT text. Blocks without a timing line, with end <= start, or without text are skipped. [REF#AU-00312] */
export function parseSrt(raw) {
  const blocks = String(raw == null ? '' : raw).replace(/^﻿/, '').split(/\r?\n\s*\r?\n/);
  const cues = [];
  for (const block of blocks) {
    const rows = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const t = rows.findIndex((l) => l.includes('-->'));
    if (t < 0) continue;
    const range = rows[t].split('-->');
    const start = parseTimestamp(range[0]);
    const end = parseTimestamp(String(range[1] || '').trim().split(/\s+/)[0]);
    const lines = rows.slice(t + 1).map(stripTags).filter(Boolean);
    if (!(end > start) || !lines.length) continue;
    cues.push({ index: cues.length, start, end, lines });
  }
  return cues;
}

/** Cues back to SRT text (1-based numbering, blank line between blocks). [REF#AU-00313] */
export function serializeSrt(cues) {
  return (cues || []).map((c, i) => (i + 1) + '\n' + formatTimestamp(c.start) + ' --> ' + formatTimestamp(c.end) + '\n' + c.lines.join('\n')).join('\n\n') + '\n';
}

/** Names the lines of a cue by position, e.g. mapLangs(cue, ['ja', 'en']) gives { ja: 'ここで…', en: 'What…' }. Extra lines join the last name. [REF#AU-00314] */
export function mapLangs(cue, order) {
  const out = {};
  const names = Array.isArray(order) && order.length ? order : ['en'];
  names.forEach((name, i) => {
    out[name] = i === names.length - 1 ? cue.lines.slice(i).join(' ') : (cue.lines[i] || '');
  });
  return out;
}

/** [REF#AU-00315]
 * Problems in a cue list. Returns an array of { kind, index, detail }.
 *  kinds: 'empty' · 'order' (a cue starts before the previous one ends) · 'past-audio' (ends after the file) ·
 *         'past-speech' (a cue stays up more than `slackSec` after the last speech inside it) · 'no-speech' (a cue sits where nobody speaks)
 * opts.durationSec: audio length. opts.speech: [[start, end], ...] measured speech windows. opts.slackSec: default 0.35.
 */
export function checkCues(cues, opts = {}) {
  const problems = [];
  const slack = typeof opts.slackSec === 'number' ? opts.slackSec : 0.35;
  const speech = Array.isArray(opts.speech) ? opts.speech : null;
  if (!cues || !cues.length) { problems.push({ kind: 'empty', index: -1, detail: 'no cues' }); return problems; }
  cues.forEach((c, i) => {
    if (i > 0 && c.start < cues[i - 1].end - 1e-6) problems.push({ kind: 'order', index: i, detail: 'starts at ' + c.start + ' before the previous cue ends at ' + cues[i - 1].end });
    if (typeof opts.durationSec === 'number' && c.end > opts.durationSec + 0.05) problems.push({ kind: 'past-audio', index: i, detail: 'ends at ' + c.end + ' but the audio is ' + opts.durationSec + ' s' });
    if (speech) {
      const inside = speech.filter((w) => w[1] > c.start && w[0] < c.end);
      if (!inside.length) { problems.push({ kind: 'no-speech', index: i, detail: 'no speech between ' + c.start + ' and ' + c.end }); return; }
      const lastSpeech = Math.max(...inside.map((w) => Math.min(w[1], c.end)));
      if (c.end - lastSpeech > slack) problems.push({ kind: 'past-speech', index: i, detail: 'stays up ' + (c.end - lastSpeech).toFixed(2) + ' s after the last speech (' + lastSpeech.toFixed(2) + ')' });
    }
  });
  return problems;
}

/** [REF#AU-00316]
 * A cue scheduler. Each tick() asks `now()` for the playback time and reports transitions:
 *   onCueStart(cue) when a cue becomes the active one, onCueEnd(cue) when it stops being active, onDone() once after the last cue.
 * It holds no timers: call tick() from one shared per-frame tick. A cue whose whole window passed between two ticks is skipped
 * (reported to onSkip if given), because a bubble that would be on screen for zero frames is not a bubble.
 */
export function createCueScheduler({ cues, now, onCueStart, onCueEnd, onDone, onSkip } = {}) {
  const list = Array.isArray(cues) ? cues : [];
  const lastEnd = list.length ? Math.max(...list.map((c) => c.end)) : 0;
  let active = -1;
  let done = false;
  let stopped = false;
  const seen = new Set();

  const activeAt = (t) => list.findIndex((c) => t >= c.start && t < c.end);

  function tick() {
    if (done) return false;
    const t = Number(now ? now() : 0);
    if (!(t === t)) return true;
    const idx = activeAt(t);
    if (idx !== active) {
      if (active >= 0 && onCueEnd) onCueEnd(list[active]);
      // report cues that were entirely skipped on the way to the new position [REF#AU-00317]
      list.forEach((c, i) => { if (!seen.has(i) && c.end <= t && (idx < 0 || i < idx)) { seen.add(i); if (onSkip) onSkip(c); } });
      active = idx;
      if (idx >= 0) { seen.add(idx); if (onCueStart) onCueStart(list[idx]); }
    }
    if (t >= lastEnd && active < 0) { done = true; if (onDone) onDone(); }
    return !done;
  }

  function stop() {
    if (done) return;
    stopped = true;
    if (active >= 0 && onCueEnd) onCueEnd(list[active]);
    active = -1;
    done = true;
    if (onDone) onDone();
  }

  return { tick, stop, isDone: () => done, wasStopped: () => stopped, activeIndex: () => active, lastEnd: () => lastEnd };
}
