/* NpcSpec.js: validation for special-NPC specs (js/v8/npc/specs/*.js). Pure: no DOM, no engine globals.
 *
 * A spec is plain data: who the NPC is, how it looks (world and panel), what it says and when, how its cuts and countdown behave.
 * validateSpec returns { ok, errors, warnings } and never throws, so the director can register what it can and report the rest once.
 * Guide: knowledge/design/SPECIAL_NPC_TEMPLATE.md
 */
import { checkCues } from '../audio/Srt.js';

export const PHASES = Object.freeze(['dormant', 'intro', 'warn', 'fight', 'countdown', 'boom', 'defeat']);
export const PER_LINE = Object.freeze(['once-per-fight', 'cooldown', 'always']);
export const ON_BUSY = Object.freeze(['drop', 'queue1']);
export const CUT_PARTS = Object.freeze(['arm', 'leg', 'head']);

// Shader code lives in the engine's shared patches, not in specs: a spec that carries it is rejected.
const FORBIDDEN_KEYS = Object.freeze(['onBeforeCompile', 'customProgramCacheKey', 'vertexShader', 'fragmentShader']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isRgb = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => isNum(x) && x >= 0 && x <= 1);

function scanForbidden(value, path, errors, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.includes(key)) errors.push(path + '.' + key + ': specs carry no shader code');
    scanForbidden(value[key], path + '.' + key, errors, seen);
  }
}

export function validateSpec(spec, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileExists = typeof opts.fileExists === 'function' ? opts.fileExists : null;
  if (!spec || typeof spec !== 'object') return { ok: false, errors: ['spec is not an object'], warnings };
  const isTemplate = spec.template === true;
  const where = 'spec.' + (spec.id || '?');

  if (typeof spec.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(spec.id)) errors.push('spec.id must be lowercase letters, digits and dashes');
  if (typeof spec.nameKey !== 'string' || !spec.nameKey) errors.push(where + '.nameKey is required');
  if (typeof spec.displayName !== 'string' || !spec.displayName) errors.push(where + '.displayName is required');
  scanForbidden(spec, where, errors);

  // ── voice
  const voice = spec.voice || {};
  const pol = voice.policy || {};
  if (!PER_LINE.includes(pol.perLine)) errors.push(where + '.voice.policy.perLine must be one of ' + PER_LINE.join(', '));
  if (pol.overlap !== false) errors.push(where + '.voice.policy.overlap must be false (one voice at a time)');
  if (pol.loop !== false) errors.push(where + '.voice.policy.loop must be false (no looping)');
  if (!isNum(pol.gapMs) || pol.gapMs < 0) errors.push(where + '.voice.policy.gapMs must be a number >= 0');
  if (!ON_BUSY.includes(pol.onBusy)) errors.push(where + '.voice.policy.onBusy must be one of ' + ON_BUSY.join(', '));
  if (pol.perLine === 'cooldown' && !(isNum(pol.cooldownMs) && pol.cooldownMs > 0)) errors.push(where + '.voice.policy.cooldownMs is required for perLine "cooldown"');

  const lines = voice.lines || {};
  const textOnly = voice.textOnly || {};
  for (const [id, line] of Object.entries(lines)) {
    const at = where + '.voice.lines.' + id;
    if (!line || typeof line !== 'object') { errors.push(at + ' is not an object'); continue; }
    if (typeof line.mp3 !== 'string' || !/^\.?\/?assets\//.test(line.mp3)) errors.push(at + '.mp3 must be an assets/ path');
    if (!isNum(line.durationSec) || line.durationSec <= 0) errors.push(at + '.durationSec must be a positive number');
    if (!Array.isArray(line.cues) || !line.cues.length) errors.push(at + '.cues needs at least one cue');
    else {
      line.cues.forEach((c, i) => {
        if (!isNum(c.start) || !isNum(c.end) || !(c.end > c.start)) errors.push(at + '.cues[' + i + '] needs numeric start < end');
        if (typeof c.en !== 'string' || !c.en) errors.push(at + '.cues[' + i + '].en is required');
        if (typeof c.ja !== 'string' || !c.ja) warnings.push(at + '.cues[' + i + '].ja is missing');
      });
      const asCues = line.cues.map((c, i) => ({ index: i, start: c.start, end: c.end, lines: [c.en] }));
      const problems = checkCues(asCues, { durationSec: line.durationSec, speech: isTemplate ? null : line.speech });
      for (const p of problems) errors.push(at + '.cues[' + p.index + '] ' + p.kind + ': ' + p.detail);
    }
    if (!isTemplate && !Array.isArray(line.speech)) warnings.push(at + '.speech (measured speech windows) is missing, so cue timing cannot be checked');
    if (fileExists && !isTemplate) {
      if (typeof line.mp3 === 'string' && !fileExists(line.mp3)) errors.push(at + '.mp3 file not found: ' + line.mp3);
      if (line.srt && !fileExists(line.srt)) errors.push(at + '.srt file not found: ' + line.srt);
    }
  }
  for (const [id, t] of Object.entries(textOnly)) {
    if (!t || typeof t.en !== 'string' || !t.en) errors.push(where + '.voice.textOnly.' + id + '.en is required');
    if (lines[id]) errors.push(where + '.voice.textOnly.' + id + ' clashes with a voice line of the same id');
  }

  // ── events: every target must exist
  const events = spec.events || {};
  for (const [ev, target] of Object.entries(events)) {
    if (!/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/.test(ev)) errors.push(where + '.events key "' + ev + '" is not a dotted event name');
    const list = Array.isArray(target) ? target : [target];
    for (const id of list) if (typeof id !== 'string' || !(lines[id] || textOnly[id])) errors.push(where + '.events["' + ev + '"] points at unknown line "' + id + '"');
  }

  // ── phases, cuts, countdown, look
  if (spec.phases != null) {
    if (!Array.isArray(spec.phases) || !spec.phases.length) errors.push(where + '.phases must be a non-empty array');
    else for (const p of spec.phases) if (!PHASES.includes(p)) errors.push(where + '.phases has unknown phase "' + p + '"');
  }
  if (spec.cuts) {
    const parts = spec.cuts.parts;
    if (!Array.isArray(parts) || !parts.length || !parts.every((p) => CUT_PARTS.includes(p))) errors.push(where + '.cuts.parts must list some of ' + CUT_PARTS.join(', '));
    if (spec.cuts.cooldownMs != null && !(isNum(spec.cuts.cooldownMs) && spec.cuts.cooldownMs >= 0)) errors.push(where + '.cuts.cooldownMs must be a number >= 0');
  }
  const cd = spec.countdown;
  if (cd) {
    if (!(isNum(cd.steps) && cd.steps >= 1)) errors.push(where + '.countdown.steps must be >= 1');
    if (!(isNum(cd.beatMs) && cd.beatMs >= 100)) errors.push(where + '.countdown.beatMs must be >= 100');
    if (Array.isArray(cd.labels) && cd.labels.length !== cd.steps) errors.push(where + '.countdown.labels must have one label per step');
    if (!cd.boom || !(isNum(cd.boom.radiusTiles) && cd.boom.radiusTiles > 0)) errors.push(where + '.countdown.boom.radiusTiles must be > 0');
    if (cd.voice && !lines[cd.voice]) errors.push(where + '.countdown.voice points at unknown line "' + cd.voice + '"');
  }
  const look = spec.look;
  if (look) {
    const m = look.material || {};
    if (m.bodyRGB != null && !isRgb(m.bodyRGB)) errors.push(where + '.look.material.bodyRGB must be three numbers in 0..1');
    if (m.emissiveRGB != null && !isRgb(m.emissiveRGB)) errors.push(where + '.look.material.emissiveRGB must be three numbers in 0..1');
    if (m.nullMaps != null && !Array.isArray(m.nullMaps)) errors.push(where + '.look.material.nullMaps must be an array');
    if (look.model && look.model.url && !/\.glb(\?|$)/.test(look.model.url)) errors.push(where + '.look.model.url must be a .glb');
  }

  return { ok: errors.length === 0, errors, warnings };
}
