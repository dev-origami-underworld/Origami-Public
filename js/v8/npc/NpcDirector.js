/* NpcDirector.js: the engine-agnostic half of the special-NPC template. Guide: knowledge/design/SPECIAL_NPC_TEMPLATE.md
 *
 * Gameplay code reports what happened with ONE call, emit(npcId, event, ctx); the spec says which line that event plays.
 * The director then applies the voice policy (once per fight, one voice at a time, no looping, a gap between lines), plays the
 * sound through the adapter, and drives subtitle bubbles cue by cue from the real playback time, so what is printed is what is being said.
 * It owns no timers and no frame loop: the engine calls tick() from its existing per-frame monster tick.
 *
 * Everything the director needs from the game goes through an adapter object (see makeNpcEngineAdapter in js/v8/npc/engineAdapter.js):
 *   adapter.playVoice(line, body, info) -> { currentTime(): seconds, ended(): boolean, stop() } | null   (null: nothing audible, subtitles still show)
 *   adapter.showBubble(body, lines, opts) -> boolean            adapter.fx(name, ctx)
 *   adapter.beat(body, info)                                      adapter.anomaly(kind, detail)
 * With the adapter faked, the whole director runs under plain node (scripts/npc/npc.test.mjs).
 */
import { createCueScheduler } from '../audio/Srt.js';
import { validateSpec } from './NpcSpec.js';

export function createNpcDirector({ adapter, now = () => performance.now(), onProblem } = {}) {
  const npcs = new Map();

  const problem = (kind, detail) => {
    try { if (onProblem) onProblem(kind, detail); } catch (_) { /* a reporter that throws must not stop the game */ }
    try { if (adapter && adapter.anomaly) adapter.anomaly(kind, detail); } catch (_) { /* same */ }
  };
  const safe = (label, fn) => { try { return fn(); } catch (e) { problem(label, String((e && e.message) || e)); return undefined; } };
  const freshFight = () => ({ played: new Map(), cutCount: 0, startedAt: now() });

  function register(spec, opts) {
    const v = validateSpec(spec, opts);
    if (!v.ok) { problem('NPC_SPEC_INVALID', (spec && spec.id ? spec.id + ': ' : '') + v.errors[0]); return v; }
    npcs.set(spec.id, { spec, body: null, phase: (spec.phases && spec.phases[0]) || 'dormant', fight: freshFight(), voice: null, queued: null, lastEndAt: -Infinity });
    return v;
  }

  const get = (id) => npcs.get(id) || null;

  function bubble(n, lines, extra) {
    safe('NPC_BUBBLE', () => adapter && adapter.showBubble && adapter.showBubble(n.body, lines.filter(Boolean), Object.assign({ force: true, combat: true }, extra)));
  }
  function beat(n, key, lineId) {
    safe('NPC_BEAT', () => adapter && adapter.beat && adapter.beat(n.body, { npcId: n.spec.id, activity: 'npc:' + key, line: lineId }));
  }

  function allowed(n, lineId, t) {
    const pol = n.spec.voice.policy;
    const last = n.fight.played.get(lineId);
    if (pol.perLine === 'once-per-fight') return last === undefined;
    if (pol.perLine === 'cooldown') return last === undefined || (t - last) >= pol.cooldownMs;
    return true;
  }

  function finish(n, lineId) {
    if (n.voice && n.voice.lineId === lineId && !n.voice.done) { n.voice.done = true; n.lastEndAt = now(); }
  }

  function start(n, lineId, key) {
    const spec = n.spec;
    const line = spec.voice.lines[lineId];
    const text = spec.voice.textOnly && spec.voice.textOnly[lineId];
    const t = now();
    n.fight.played.set(lineId, t);
    if (!line) {                                   // text-only line: a bubble, no sound
      const ttl = (text && text.ttlMs) || 4200;
      bubble(n, [text.en, text.ja], { ttlMs: ttl });
      n.voice = { lineId, textOnly: true, done: false, endsAt: t + ttl, scheduler: null, handle: null, hardEndAt: t + ttl };
      beat(n, key, lineId);
      return { played: true, textOnly: true };
    }
    const handle = safe('NPC_VOICE', () => (adapter && adapter.playVoice ? adapter.playVoice(line, n.body, { npcId: spec.id, key, lineId }) : null)) || null;
    const timeNow = () => {
      if (handle && typeof handle.currentTime === 'function') {
        const c = handle.currentTime();
        if (Number.isFinite(c) && c > 0) return c;
      }
      return (now() - t) / 1000;                   // muted, blocked or not started yet: subtitles follow the clock instead
    };
    const hold = typeof line.holdMs === 'number' ? line.holdMs : 250;
    const sch = createCueScheduler({
      cues: line.cues.map((c, i) => ({ index: i, start: c.start, end: c.end, lines: [c.en, c.ja], en: c.en, ja: c.ja })),
      now: timeNow,
      onCueStart: (cue) => bubble(n, [cue.en, cue.ja], { ttlMs: Math.max(300, (cue.end - cue.start) * 1000 + hold) }),
      onDone: () => finish(n, lineId),
    });
    n.voice = { lineId, scheduler: sch, handle, done: false, hardEndAt: t + (line.durationSec + 1.5) * 1000, startedAt: t };
    beat(n, key, lineId);
    sch.tick();
    return { played: true };
  }

  function trySay(n, lineId, key) {
    const spec = n.spec;
    if (!spec.voice.lines[lineId] && !(spec.voice.textOnly && spec.voice.textOnly[lineId])) return { played: false, reason: 'unknown-line' };
    const t = now();
    if (!allowed(n, lineId, t)) return { played: false, reason: 'policy' };
    if (n.voice && !n.voice.done && n.voice.lineId === lineId) return { played: false, reason: 'same-line-playing' };
    const pol = spec.voice.policy;
    const busy = !!(n.voice && !n.voice.done);
    if (busy || (t - n.lastEndAt) < pol.gapMs) {
      if (pol.onBusy === 'queue1' && !n.queued) { n.queued = { lineId, key }; return { played: false, queued: true, reason: busy ? 'busy' : 'gap' }; }
      return { played: false, reason: 'busy' };
    }
    return start(n, lineId, key);
  }

  /** Gameplay reports an event. Returns { played, queued, textOnly, reason, key, line }. Unknown NPCs and unmapped events are quiet no-ops. */
  function emit(npcId, event, ctx = {}) {
    const n = get(npcId);
    if (!n) return { played: false, reason: 'unknown-npc' };
    if (ctx.body) n.body = ctx.body;
    const events = n.spec.events || {};
    let key = event;
    if (event === 'cut') {
      n.fight.cutCount += 1;
      const pop = n.spec.cuts && n.spec.cuts.snipPop;
      if (pop) safe('NPC_FX', () => adapter && adapter.fx && adapter.fx('snipPop', { body: n.body, part: ctx.part, n: n.fight.cutCount, label: (pop && pop.label) || 'SNIP!' }));
      key = 'cut.n' + n.fight.cutCount;
      if (!(key in events)) key = 'cut';
    }
    const target = events[key];
    if (target == null) return { played: false, reason: 'no-mapping', key };
    let last = { played: false, reason: 'no-candidate' };
    for (const lineId of (Array.isArray(target) ? target : [target])) {
      last = trySay(n, lineId, key);
      if (last.played || last.queued) return Object.assign({ key, line: lineId }, last);
    }
    return Object.assign({ key }, last);
  }

  /** Plays one named line directly, through the same policy. */
  function say(npcId, lineId, ctx = {}) {
    const n = get(npcId);
    if (!n) return { played: false, reason: 'unknown-npc' };
    if (ctx.body) n.body = ctx.body;
    return Object.assign({ line: lineId }, trySay(n, lineId, 'say'));
  }

  function setPhase(npcId, phase, ctx = {}) {
    const n = get(npcId);
    if (!n) return { played: false, reason: 'unknown-npc' };
    if (n.spec.phases && !n.spec.phases.includes(phase)) { problem('NPC_PHASE', n.spec.id + ': unknown phase ' + phase); return { played: false, reason: 'unknown-phase' }; }
    n.phase = phase;
    return emit(npcId, 'phase.' + phase, ctx);
  }

  function startFight(npcId, body) {
    const n = get(npcId);
    if (!n) return false;
    if (n.voice && n.voice.scheduler && !n.voice.done) n.voice.scheduler.stop();
    n.fight = freshFight();
    n.voice = null; n.queued = null; n.lastEndAt = -Infinity;
    if (body) n.body = body;
    n.phase = (n.spec.phases && n.spec.phases[0]) || 'dormant';
    return true;
  }

  function endFight(npcId) {
    const n = get(npcId);
    if (!n) return false;
    if (n.voice && n.voice.scheduler && !n.voice.done) n.voice.scheduler.stop();
    n.queued = null;
    return true;
  }

  /** Call once per frame from the engine's existing monster tick. */
  function tick() {
    const t = now();
    for (const n of npcs.values()) {
      const v = n.voice;
      if (v && !v.done) {
        if (v.textOnly) { if (t >= v.endsAt) finish(n, v.lineId); }
        else {
          if (v.scheduler) v.scheduler.tick();
          const audioOver = v.handle && typeof v.handle.ended === 'function' && v.handle.ended();
          if (!v.done && (t >= v.hardEndAt || audioOver) && v.scheduler) v.scheduler.stop();
        }
      }
      if (n.queued && !(n.voice && !n.voice.done) && (t - n.lastEndAt) >= n.spec.voice.policy.gapMs) {
        const q = n.queued; n.queued = null;
        trySay(n, q.lineId, q.key);
      }
    }
  }

  function stats() {
    const out = {};
    for (const [id, n] of npcs) {
      out[id] = { phase: n.phase, cuts: n.fight.cutCount, played: [...n.fight.played.keys()], speaking: n.voice && !n.voice.done ? n.voice.lineId : null, queued: n.queued ? n.queued.lineId : null };
    }
    return out;
  }

  return { register, has: (id) => npcs.has(id), emit, say, setPhase, startFight, endFight, tick, stats };
}
