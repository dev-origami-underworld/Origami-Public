/* engineAdapter.js: the one place the special-NPC director meets the engine. Guide: knowledge/design/SPECIAL_NPC_TEMPLATE.md
 *
 * Same pattern as js/v8/ai/MonsterAI.engineAdapter.js: the engine hands over the handles it already has, this file wraps them in the
 * small port the director expects, and nothing else in js/v8/npc knows an engine function name. Not wired in yet (rollout phase 2).
 *
 * handles (all optional; a missing one degrades quietly):
 *   playSfxFile(path, volume, trimFrac, opts) -> audio element | undefined      the engine's _playSfxFile
 *   playMonsterSfx(tag, body)                                                  the engine's _playMonsterSfx (no element back)
 *   spawnChatBubble(body, lines, opts) -> boolean                              the engine's _spawnChatBubble
 *   fx: { snipPop(ctx), cranes(ctx), kaboom(ctx) }                             small engine effects keyed by name
 *   post(message)                                                              defaults to window.parent.postMessage
 */
export function makeNpcEngineAdapter(handles = {}) {
  const post = (message) => {
    try {
      if (typeof handles.post === 'function') handles.post(message);
      else if (typeof window !== 'undefined' && window.parent) window.parent.postMessage(message, '*');
    } catch (_) { /* reporting must not break the game */ }
  };
  const norm = (p) => './' + String(p || '').replace(/^\.?\//, '');

  return {
    // Returns a handle whose currentTime() is the real playback position, so subtitles follow the sound. null: nothing audible.
    playVoice(line, body) {
      try {
        if (typeof handles.playSfxFile === 'function') {
          const at = body && body.position ? { at: { x: body.position.x, z: body.position.z } } : {};
          const a = handles.playSfxFile(norm(line.mp3), typeof line.volume === 'number' ? line.volume : 0.88, undefined, at);
          if (a && typeof a === 'object' && 'currentTime' in a) {
            return { currentTime: () => a.currentTime, ended: () => !!a.ended, stop: () => { try { a.pause(); } catch (_) { /* already gone */ } } };
          }
          return null;
        }
        if (typeof handles.playMonsterSfx === 'function' && line.sfxKey) handles.playMonsterSfx(line.sfxKey, body);
      } catch (e) {
        post({ type: 'ENGINE_ANOMALY', kind: 'NPC_VOICE', subsystem: 'npc-adapter', error: String((e && e.message) || e) });
      }
      return null;
    },
    showBubble(body, lines, opts) {
      return typeof handles.spawnChatBubble === 'function' ? !!handles.spawnChatBubble(body, lines, opts) : false;
    },
    fx(name, ctx) {
      const f = handles.fx && handles.fx[name];
      if (typeof f === 'function') f(ctx);
    },
    beat(body, info) {
      const ud = body && body.userData;
      post({ type: 'MONSTER_LIFE_BEAT', id: (ud && ud.id) || info.npcId, name: (ud && ud.name) || info.npcId, activity: info.activity, kind: 'npc', state: info.line || '' });
    },
    anomaly(kind, detail) {
      post({ type: 'ENGINE_ANOMALY', kind, subsystem: 'npc-director', error: String(detail) });
    },
  };
}
