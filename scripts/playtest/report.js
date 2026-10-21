/**
 * report.js — turns a playtest journal into the three answers Mark asked for, numbers first, words after.
 * Claude (the only AI), 2026-09-16. Every sentence in the "feeling" section is derived from a number that is
 * printed beside it — a reader can disagree with the word and still trust the figure.
 */
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0) + '%';

function floorStats(J, F) {
  const t0 = F.t0, t1 = F.t1 ?? (J.end && J.end.t) ?? t0;
  const S = J.samples.filter(s => s.t >= t0 && s.t <= t1 && s.floor === F.floor);
  const P = J.pilot.filter(e => e.floor === F.floor);
  const story = J.story.filter(r => r.floor === F.floor);
  const fights = P.filter(e => e.kind === 'fight-start');
  const fightMs = P.filter(e => e.kind === 'fight-end').reduce((a, e) => a + (e.ms || 0), 0);
  const stalls = P.filter(e => e.kind === 'stall');
  const stuck = P.filter(e => e.kind === 'stuck');
  const hps = S.map(s => s.hp).filter(h => typeof h === 'number');
  const fps = S.map(s => s.fps).filter(f => f > 0);
  const tens = S.map(s => s.tension).filter(v => typeof v === 'number');
  const sil = S.map(s => s.silence).filter(v => typeof v === 'number');
  const musicOff = S.filter(s => s.music === false).length;
  const combatSamples = S.filter(s => s.inCombat).length;
  const kills = (S.length && typeof S[S.length - 1].kills === 'number' && typeof F.kills0 === 'number') ? S[S.length - 1].kills - F.kills0 : null;
  const dmg = (typeof F.hp0 === 'number' && hps.length) ? Math.max(0, F.hp0 - Math.min(...hps)) : null;
  const firstFight = fights.length ? fights[0].tt - t0 : null;
  const surprises = story.filter(r => /mimic|ambush|wakes|woke|springs|Watch out/i.test(r.text || '')).length;
  const guide = story.filter(r => /^(WELCOME_GUIDE_|OPEN_GUIDE|GUIDE_)/.test(r.type)).length;
  const narr = story.filter(r => r.type === 'LOG_EVENT').length;
  return { ms: t1 - t0, fights: fights.length, fightMs, stalls: stalls.length, stuck: stuck.length, hpMin: hps.length ? Math.min(...hps) : null, hpEnd: hps.length ? hps[hps.length - 1] : null,
           fpsMin: fps.length ? Math.min(...fps) : null, fpsAvg: fps.length ? +(fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1) : null,
           tensionMax: tens.length ? +Math.max(...tens).toFixed(2) : null, silenceMax: sil.length ? +Math.max(...sil).toFixed(2) : null,
           musicOffPct: S.length ? pct(musicOff, S.length) : '—', combatPct: S.length ? pct(combatSamples, S.length) : '—', kills, dmg, firstFight, surprises, guide, narr, samples: S.length,
           anomalies: story.filter(r => r.type === 'ENGINE_ANOMALY').length };
}

function feelingWords(fs, F) {
  const w = [];
  if (fs.firstFight == null) w.push('no fight at all');
  else if (fs.firstFight < 45000) w.push('a fight inside the first minute (' + mmss(fs.firstFight) + ')');
  else if (fs.firstFight < 150000) w.push('a quiet start, first fight at ' + mmss(fs.firstFight));
  else w.push('a long quiet stretch before the first fight (' + mmss(fs.firstFight) + ')');
  if (fs.fights >= 4) w.push('busy — ' + fs.fights + ' fights');
  else if (fs.fights >= 1) w.push(fs.fights + ' fight' + (fs.fights > 1 ? 's' : ''));
  if (typeof fs.hpMin === 'number' && typeof F.hp0 === 'number') {
    const r = fs.hpMin / Math.max(1, F.hp0);
    if (r < 0.25) w.push('genuinely dangerous — hp fell to ' + fs.hpMin);
    else if (r < 0.6) w.push('tense — hp fell to ' + fs.hpMin);
    else if (fs.fights) w.push('never in real danger (hp never below ' + fs.hpMin + ')');
  }
  if (fs.stalls) w.push(fs.stalls + ' stall' + (fs.stalls > 1 ? 's' : '') + ' where the player stood still 20 s+ — the "what do I do now?" moments');
  if (fs.stuck >= 3) w.push('the way there fought back (' + fs.stuck + ' replans at doors/bodies)');
  if (fs.surprises) w.push(fs.surprises + ' surprise' + (fs.surprises > 1 ? 's' : '') + ' (a mimic sprang / something woke)');
  if (fs.musicOffPct !== '—' && parseInt(fs.musicOffPct) > 15) w.push('music silent ' + fs.musicOffPct + ' of the time (RULE #1 says never)');
  if (fs.fpsMin != null && fs.fpsMin < 30) w.push('frame rate dipped to ' + fs.fpsMin + ' fps');
  if (fs.narr === 0) w.push('the game said nothing to the player the whole floor');
  else if (fs.narr > 60) w.push('the log talked a lot (' + fs.narr + ' lines)');
  return w.join('; ');
}

const FUN_RULES = [
  { key: 'mimic springs',   re: /mimic|MIMIC/i,                              w: 3 },
  { key: 'kill',            re: /is defeated|slain|SLAIN|falls\b|dies\b/i,   w: 3 },
  { key: 'level up',        re: /LEVEL UP|level up|Level \d+/i,               w: 3 },
  { key: 'crit / dismember',re: /CRIT|crit!|severed|limb|forehead|chop/i,     w: 2 },
  { key: 'ogre charge',     re: /charge|plants his feet|lurches up/i,         w: 2 },
  { key: 'song / cabaret',  re: /song|sing|Starlette|cabaret|♪/i,             w: 2 },
  { key: 'wager',           re: /wager|WAGER|bet\b|House wins|You win/i,       w: 2 },
  { key: 'selfie / new ally', re: /selfie|SELFIE|NEW ALLY|friends now|won respect|bankrupt/i, w: 4 },
  { key: 'loot',            re: /Looted|Picked up|\+\d+ gold|\+\d+ XP/i,      w: 1 },
  { key: 'woke something',  re: /wakes|woke|HOSTILE/i,                        w: 1 },
];
function funBoring(J) {
  const WIN = 45000;
  const t0 = J.floors.length ? J.floors[0].t0 : 0; const tEnd = J.end && J.end.t ? J.end.t : (J.samples.length ? J.samples[J.samples.length - 1].t : 0);
  const windows = [];
  for (let a = t0; a < tEnd; a += WIN) {
    const b = Math.min(a + WIN, tEnd);
    const story = J.story.filter(r => r.t >= a && r.t < b && r.type === 'LOG_EVENT');
    const pil = J.pilot.filter(e => e.t >= a && e.t < b);
    const S = J.samples.filter(s => s.t >= a && s.t < b);
    const floor = (S[0] && S[0].floor) || (pil[0] && pil[0].floor) || (J.floors.find(F => F.t0 <= a && (F.t1 || Infinity) >= a) || {}).floor || '?';
    let fun = 0, boring = 0; const why = [], bwhy = [], lines = []; const tally = {};
    for (const R of FUN_RULES) { const hits = story.filter(r => R.re.test(r.text || '')); if (hits.length) { fun += R.w * Math.min(hits.length, 3); tally[R.key] = hits.length; why.push(R.key + (hits.length > 1 ? ' ×' + hits.length : '')); if (lines.length < 3) lines.push(String(hits[0].text || '').replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').slice(0, 80)); } }
    const fights = pil.filter(e => e.kind === 'fight-start').length; if (fights) { fun += 2 * Math.min(fights, 3); why.unshift('fights ×' + fights); }
    const rooms = J.story.filter(r => r.t >= a && r.t < b && r.type === 'ROOM_ENTER').length; if (rooms) { fun += Math.min(rooms, 3); why.push('new rooms ×' + rooms); }
    const rests = pil.filter(e => e.kind === 'rest').length; if (rests) { boring += 2 * rests; bwhy.push('resting ×' + rests); }
    const stuck = pil.filter(e => e.kind === 'stuck').length; if (stuck) { boring += 2 * stuck; bwhy.push('stuck at a body or door ×' + stuck); }
    const gave = pil.filter(e => e.kind === 'gave-up' || e.kind === 'unreachable').length; if (gave) { boring += 3 * gave; bwhy.push('gave up on a goal'); }
    if ((b - a) >= 20000 && story.length <= 1 && !fights) { boring += 3; bwhy.push('the game said ' + (story.length ? 'one line' : 'nothing') + ' in 45 s'); }
    if (S.length && S.every(s => !s.hostileNear && !s.inCombat) && !rooms && !tally.loot) { boring += 1; bwhy.push('nobody near, nothing found'); }
    const goal = (J.pilot.slice().reverse().find(e => e.t < b && e.goal) || {}).goal;
    const doing = pil.some(e => e.kind === 'stuck') ? 'stuck' : rests ? 'resting' : pil.some(e => e.kind === 'flee') ? 'fleeing' : (goal ? 'walking to ' + goal : 'walking');
    windows.push({ t0: a - t0, t1: b - t0, floor, fun, boring, why, bwhy, lines, doing, tally });
  }
  const funW = windows.filter(w => w.fun > w.boring && w.fun >= 4), boringW = windows.filter(w => w.boring > w.fun && w.boring >= 3);
  const mins = (arr) => Math.round(arr.reduce((n, w) => n + (w.t1 - w.t0), 0) / 60000);
  const tally = {}; for (const w of windows) for (const [k, n] of Object.entries(w.tally)) tally[k] = (tally[k] || 0) + n;
  // what DROVE the fun windows: each fun-rule key by how many fun windows it appeared in and how often; the boring causes the same way
  const drivers = FUN_RULES.map(R => ({ key: R.key, n: tally[R.key] || 0, windows: funW.filter(w => w.tally[R.key]).length })).filter(d => d.windows).sort((x, y) => y.windows - x.windows || y.n - x.n);
  const fightsInFun = funW.reduce((n, w) => n + (parseInt((w.why.find(s => /^fights/.test(s)) || '').replace(/\D/g, ''), 10) || 0), 0);
  if (fightsInFun) drivers.unshift({ key: 'fights', n: fightsInFun, windows: funW.filter(w => w.why.some(s => /^fights/.test(s))).length });
  const dragMap = {}; for (const w of boringW) for (const b of w.bwhy) { const k = b.replace(/ ×\d+$/, ''); dragMap[k] = (dragMap[k] || 0) + 1; }
  const drags = Object.entries(dragMap).map(([key, n]) => ({ key, n })).sort((x, y) => y.n - x.n);
  const wish = [];
  if (drivers.length) wish.push('More of the top three — ' + drivers.slice(0, 3).map(d => d.key).join(', ') + ' — closer together: they carried the fun windows.');
  if (dragMap['nobody near, nothing found'] || dragMap['the game said nothing in 45 s'] || dragMap['the game said one line in 45 s']) wish.push('The boring stretches were walks with nobody near and nothing said — put one of the fun things on the way (a sleeper, a card, a voice), not only in the rooms.');
  if (dragMap['stuck at a body or door']) wish.push('Bodies and doors that block the walk read as boring, not hard — the pilot stood still there.');
  if (dragMap['resting']) wish.push('Resting is dead time: a heal in the hand beats a rest on the floor (the priest rests far less).');
  return {
    drivers, drags, wish,
    windows, funMin: mins(funW), boringMin: mins(boringW), neutralMin: Math.max(0, mins(windows) - mins(funW) - mins(boringW)),
    funPct: windows.length ? Math.round(100 * funW.length / windows.length) : 0, boringPct: windows.length ? Math.round(100 * boringW.length / windows.length) : 0,
    fun: funW.slice().sort((x, y) => y.fun - x.fun).slice(0, 4),
    boring: boringW.slice().sort((x, y) => y.boring - x.boring).slice(0, 4).map(w => ({ ...w, why: w.bwhy })),
    tally,
  };
}

function render(J) {
  const L = [];
  const total = J.end ? J.end.t : 0;
  L.push('# PLAYTEST — a stranger plays Origami Underworld');
  L.push('');
  L.push('`' + J.stamp + '` · commit `' + J.commit + '` · seed `' + J.seed + '` · role ' + J.role + ' · ' + mmss(total) + ' played · ' + J.url);
  L.push('');
  // ── 1. did it complete?
  const floors = J.floors.map(f => f.floor);
  const deepest = floors.length ? Math.max(...floors) : 0;
  L.push('## 1 · Did the game complete?');
  L.push('');
  L.push('**' + (J.outcome || 'unknown') + '.** Floors played: ' + (floors.join(' → ') || 'none') + ' · deepest ' + deepest + ' of ' + ((J.endingExists && J.endingExists.maxFloor) || 7) + '.');
  L.push('');
  L.push('| Floor | Rooms | Exit | Objectives | Outcome | Time |');
  L.push('|---|---|---|---|---|---|');
  for (const F of J.floors) L.push('| ' + F.floor + ' | ' + (F.rooms ?? '?') + ' | ' + (F.barred ? 'barred' : 'open') + ' | ' + (F.objectives || []).map(o => (o.ok ? '✅ ' : '❌ ') + o.what + (o.why && !o.ok ? ' (' + o.why + ')' : '')).join('<br>') + ' | ' + (F.outcome || '—') + ' | ' + mmss((F.t1 ?? total) - F.t0) + ' |');
  L.push('');
  if (J.endingExists) {
    L.push('Is there an ending to reach? `_maxFloor` = ' + J.endingExists.maxFloor + '; the stairs on the last floor resolve to `min(_maxFloor, floor+1)` = the same floor (Engine9 ~97850), and no `_gameComplete` / `_victory` / `_endingState` exists on the engine window (' + (J.endingExists.gameComplete ? 'FOUND' : 'measured: none') + '). '
           + (J.endingExists.gameComplete ? '' : '**A run cannot "complete" today — it can only end by death, by quitting, or by the player deciding floor 7 was the bottom.** The Steam plan (§0, §8) already records this; it is the 1.0 gap.'));
    L.push('');
  }
  // ── 2. did it make sense?
  L.push('## 2 · Did it make sense?');
  L.push('');
  const guideOpens = J.story.filter(r => /^(WELCOME_GUIDE_OPEN|OPEN_GUIDE|GUIDE_OPEN)/.test(r.type));
  const narr = J.story.filter(r => r.type === 'LOG_EVENT');
  const objs = J.floors.flatMap(F => (F.objectives || []).map(o => ({ floor: F.floor, ...o })));
  const failed = objs.filter(o => !o.ok);
  L.push('- The game opened the guidebook ' + guideOpens.length + ' time' + (guideOpens.length === 1 ? '' : 's') + (guideOpens.length ? ' (' + guideOpens.map(g => (g.room || g.name || g.type)).join(', ') + ')' : '') + ' and wrote ' + narr.length + ' lines to the log.');
  L.push('- Objectives the player was given by the game\'s own rules: ' + objs.length + ' · reached ' + (objs.length - failed.length) + ' · not reached ' + failed.length + (failed.length ? ' — ' + failed.map(o => 'floor ' + o.floor + ': ' + o.what + ' (' + (o.why || 'no') + ')').join('; ') : '') + '.');
  const stalls = J.pilot.filter(e => e.kind === 'stall');
  L.push('- Stalls (20 s+ standing still with nothing to fight): ' + stalls.length + (stalls.length ? ' — ' + stalls.map(s => 'floor ' + s.floor + ' at ' + JSON.stringify(s.tile) + ' heading for ' + s.goal + ' (shots/f' + s.floor + '-stall-*.png)').join('; ') : '') + '.');
  const unreach = J.pilot.filter(e => e.kind === 'unreachable' || e.kind === 'gave-up');
  L.push('- Places the map showed but the player could not walk to: ' + unreach.length + (unreach.length ? ' — ' + unreach.map(u => 'floor ' + u.floor + ': ' + JSON.stringify(u.goal)).join('; ') : '') + '.');
  const armedEver = J.samples.some(s => s.armed === true); const punches = J.story.filter(r => /Unarmed!/.test(r.text || '')).length;
  if (punches) L.push('- **The player swung without a weapon ' + punches + ' time' + (punches > 1 ? 's' : '') + '** ("Unarmed! You throw a desperate punch") — the hand showed a KATANA card, but the engine only counts a katana as owned after it is looted or bought (`window.ownedKatana`, set at loot pickup ~54676 and the vending machine ~60139). ' + (armedEver ? 'It became armed later in the run.' : 'It never became armed in this run.') + ' A stranger reads a sword on the table as a sword in the hand.');
  L.push('- Engine anomalies reported to Oni-Baba: ' + J.anomalies.length + (J.anomalies.length ? ' — ' + Object.entries(J.anomalies.reduce((m, a) => { m[a.kind || a.subsystem || '?'] = (m[a.kind || a.subsystem || '?'] || 0) + 1; return m; }, {})).map(([k, v]) => k + ' ×' + v).join(', ') : '') + '. Page errors: ' + J.pageerrors.length + (J.pageerrors.length ? ' — ' + J.pageerrors.slice(0, 3).map(e => e.msg).join(' | ') : '') + '.');
  L.push('');
  L.push('The story as the player read it (first 60 log lines, then the last 10):');
  L.push('');
  const lines = narr.map(r => '- `' + mmss(r.t) + '` f' + r.floor + ' ' + (r.logType ? '[' + r.logType + '] ' : '') + r.text);
  L.push(...lines.slice(0, 60)); if (lines.length > 70) { L.push('- …'); L.push(...lines.slice(-10)); } else if (lines.length > 60) L.push(...lines.slice(60));
  L.push('');
  // ── 3. what was the feeling?
  L.push('## 3 · What was the feeling?');
  L.push('');
  L.push('| Floor | Time | Fights | In combat | Kills | Damage taken | HP low | Stalls | Surprises | FPS min/avg | Music off | Tension max | Log lines |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const words = [];
  for (const F of J.floors) {
    const fs = floorStats(J, F);
    L.push('| ' + F.floor + ' | ' + mmss(fs.ms) + ' | ' + fs.fights + ' | ' + fs.combatPct + ' | ' + (fs.kills ?? '?') + ' | ' + (fs.dmg ?? '?') + ' | ' + (fs.hpMin ?? '?') + ' | ' + fs.stalls + ' | ' + fs.surprises + ' | ' + (fs.fpsMin ?? '?') + '/' + (fs.fpsAvg ?? '?') + ' | ' + fs.musicOffPct + ' | ' + (fs.tensionMax ?? '?') + ' | ' + fs.narr + ' |');
    words.push('- **Floor ' + F.floor + ':** ' + feelingWords(fs, F) + '.');
  }
  L.push('');
  L.push(...words);
  L.push('');
  const allHp = J.samples.map(s => s.hp).filter(h => typeof h === 'number');
  const deaths = J.outcome && /died/.test(J.outcome) ? 1 : 0;
  L.push('Whole run: ' + mmss(total) + ' · ' + J.pilot.filter(e => e.kind === 'fight-start').length + ' fights · ' + (J.end && J.end.kills != null ? J.end.kills + ' kills' : '? kills') + ' · hp low-water ' + (allHp.length ? Math.min(...allHp) : '?') + ' · deaths ' + deaths + ' · gold at the end ' + (J.end && J.end.gold != null ? J.end.gold : '?') + ' · level ' + (J.end && J.end.level != null ? J.end.level : '?') + '.');
  L.push('');
  // ── 4. what was fun, what was boring — Mark 2026-09-16: "ask the player what the funnest parts were … and what seemed boring".
  //    The pilot cannot feel, so this is MEASURED: the run is cut into 45 s windows and each window is scored from what the game
  //    said and what the pilot did in it. Fun = things happening TO the player (a fight, a kill, a mimic springing, loot, a level,
  //    a song, a charge, a wager, a new room). Boring = nothing happening (rest, stuck, replans, giving up, a window with hardly a
  //    log line, walking with nobody near). The top windows are quoted so a human can judge the score, not just read it.
  L.push('## 4 · What was fun, what was boring?');
  L.push('');
  const fb = funBoring(J);
  if (!fb.windows.length) L.push('Not enough of a run to say.');
  else {
    L.push('Scored over ' + fb.windows.length + ' windows of 45 s: **' + fb.funMin + ' min fun · ' + fb.boringMin + ' min boring · ' + fb.neutralMin + ' min in between**' + (fb.boringPct >= 40 ? ' — more than a third of the run had nothing happening.' : fb.funPct >= 50 ? ' — most of the run had something happening.' : '.'));
    L.push('');
    L.push('**The funnest parts** (what the game was doing at the time):');
    for (const w of fb.fun) L.push('- `' + mmss(w.t0) + '–' + mmss(w.t1) + '` f' + w.floor + ' · ' + w.why.join(', ') + (w.lines.length ? ' — "' + w.lines.join('" · "') + '"' : ''));
    L.push('');
    L.push('**What seemed boring** (what the player was doing, and what the game was NOT doing):');
    for (const w of fb.boring) L.push('- `' + mmss(w.t0) + '–' + mmss(w.t1) + '` f' + w.floor + ' · ' + w.why.join(', ') + (w.doing ? ' — the pilot was ' + w.doing : ''));
    L.push('');
    L.push('Fun events over the whole run: ' + Object.entries(fb.tally).filter(([, n]) => n).map(([k, n]) => k + ' ' + n).join(' · ') + '.');
    L.push('');
    // Mark 2026-09-16: "that way we can do more of what was fun - add more quantity and number and quality of those funnest parts"
    L.push('**Do more of this** (what lit up the fun windows, most first): ' + (fb.drivers.length ? fb.drivers.map(d => '**' + d.key + '** (' + d.n + '×, in ' + d.windows + ' of ' + fb.windows.length + ' windows)').join(' · ') : 'nothing scored') + '.');
    L.push('**Do less of this** (what the boring stretches were made of): ' + (fb.drags.length ? fb.drags.map(d => d.key + ' (' + d.n + '×)').join(' · ') : 'nothing scored') + '.');
    if (fb.wish.length) L.push('**So:** ' + fb.wish.join(' '));
  }
  L.push('');
  // ── 5. the non-violent run (STYLE=pacifist) — Mark 2026-09-16: "adventurer trying a non-violent solution to reach floor 7 …
  //    see if they can gamble to win their way : see if the selfie fun stuff works" · "their opinion of the selfie modal".
  if (J.style === 'pacifist') {
    L.push('## 5 · The non-violent run — did the camera and the felt get the adventurer through?');
    L.push('');
    const T = J.tallies || {}; const cam = T.cam || {}, wg = T.wager || {}, sf = T.selfie || {};
    const kills = J.end && typeof J.end.kills === 'number' ? J.end.kills : (J.samples.map(s => s.kills).filter(k => typeof k === 'number').pop() ?? '?');
    const allies = J.end && typeof J.end.allies === 'number' ? J.end.allies : '?';
    const evs = J.pilot; const n = (k) => evs.filter(e => e.kind === k).length;
    const alliesBy = { wager: evs.filter(e => e.kind === 'ally' && e.by === 'wager').length, selfie: J.story.filter(r => /friends now|友だちになった/.test(r.text || '')).length };
    const goldStart = (J.samples.find(s => typeof s.gold === 'number') || {}).gold, goldEnd = J.end && J.end.gold;
    const permitsOnFelt = J.story.filter(r => /lays the .* on the felt|felt/.test(r.text || '') && /PERMIT|permit/i.test(r.text || '')).length;
    const blinds = J.story.filter(r => /BLINDED/.test(r.text || '')).length;
    L.push('| Kills | Allies made | …by wager | …by selfie | Flashes | Reloads | Blinded | Wager sessions | Rounds won / lost | Refused | Gold start → end | Permits won at the table | Deepest floor |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    L.push('| **' + kills + '** | ' + allies + ' | ' + alliesBy.wager + ' | ' + alliesBy.selfie + ' | ' + (cam.flashes ?? n('flash')) + ' | ' + (cam.reloads ?? n('reload')) + ' | ' + blinds + ' | ' + (wg.sessions ?? n('wager-open')) + ' | ' + (wg.won ?? '?') + ' / ' + (wg.lost ?? '?') + ' | ' + (wg.refused ?? n('wager-refused')) + ' | ' + goldStart + ' → ' + goldEnd + ' | ' + permitsOnFelt + ' | ' + ((J.floors[J.floors.length - 1] || {}).floor || 1) + ' of 7 |');
    L.push('');
    const verdict = [];
    verdict.push(kills === 0 ? 'Not one kill — the adventurer never swung.' : kills + ' kill(s) happened on a run that was not supposed to have any — read the story for who died (an ally\'s kill or a mimic bite counts against the player\'s own count only if the engine says so).');
    if (n('wager-open')) verdict.push('The felt: ' + (wg.sessions ?? n('wager-open')) + ' session(s), ' + (wg.won ?? '?') + ' rounds won and ' + (wg.lost ?? '?') + ' lost' + (alliesBy.wager ? ', ' + alliesBy.wager + ' dealer(s) gambled down into allies' : ', nobody bankrupted') + (permitsOnFelt ? ', ' + permitsOnFelt + ' room permit(s) laid on the felt' : '') + '.'); else verdict.push('The felt was never opened — ' + (goldStart < 50 ? 'the adventurer never held the 50 gold a stake needs.' : 'no willing dealer came within reach while it had the gold.'));
    verdict.push('The camera: ' + (cam.flashes ?? n('flash')) + ' shutter(s), ' + blinds + ' BLINDED line(s), ' + (J.selfieCount | 0) + ' selfie(s)' + (J.selfieForced ? ' (the first one FORCED by the harness so the modal could be judged)' : '') + '.');
    L.push(verdict.join(' '));
    L.push('');
    // the selfie modal, measured
    const modals = evs.filter(e => e.kind === 'selfie-modal');
    if (modals.length) {
      L.push('**The selfie modal, as the player met it** (Mark: "their opinion of the selfie modal"):');
      modals.forEach((m, i) => {
        const flashBefore = evs.filter(e => e.kind === 'flash' && e.t < m.t).pop();
        const closed = evs.find(e => e.kind === 'selfie-closed' && e.t > m.t); const kept = evs.find(e => e.kind === 'selfie-kept' && e.t > m.t);
        const lag = flashBefore ? ((m.t - flashBefore.t) / 1000).toFixed(1) : '?';
        L.push('- selfie ' + (i + 1) + ' with **' + (m.with || '?') + '** · the polaroid popped **' + lag + ' s after the shutter** (the glide over, 3·2·1·CHEESE, the flash) · shown ' + (closed ? (closed.shownMs / 1000).toFixed(1) + ' s' : '?') + (kept ? ' · the player pressed KEEP' : ' · closed by itself (9 s auto-close)') + (m.hostileNear ? ' · ⚠ a hostile was within 6 tiles when it opened — the photo stood between the player and a fight' : ' · nothing hostile nearby — a safe moment') + ' · shot: shots/selfie-' + (i + 1) + '.png');
      });
      const lags = modals.map(m => { const f = evs.filter(e => e.kind === 'flash' && e.t < m.t).pop(); return f ? (m.t - f.t) / 1000 : null; }).filter(x => x != null);
      const avg = lags.length ? (lags.reduce((a, b) => a + b, 0) / lags.length) : null;
      L.push('- measured, not felt: ' + (avg != null ? 'about ' + avg.toFixed(1) + ' s from shutter to polaroid' : 'no shutter matched') + ', two buttons (KEEP · CLOSE), Esc closes, auto-closes after 9 s, the game keeps running behind it (the pilot stood still while it showed).' + (modals.some(m => m.hostileNear) ? ' The one thing to weigh: it can open while something else is still hostile nearby.' : ''));
    } else if (J.selfieCount) L.push('A selfie happened (' + J.selfieCount + ') but the pilot never saw the modal open — check window._selfieOpen / #selfie-modal.');
    else L.push('No selfie this run: ' + (cam.flashes ?? n('flash')) + ' flashes at a ' + Math.round(100 * 0.05) + '%+1%/level roll — run longer, or SELFIE_FORCE=1 for the modal alone.');
    L.push('');
    L.push('Camera recharge between takes: 10 s (the engine\'s `_weaponCdMs.camera`, Mark 2026-08-04 "the flash needs 10 second recharges").');
    L.push('');
  }
  L.push('How to read this: the pilot walks and fights like a first-time player who follows the game\'s own rule ("the exit is barred — take the Supervisor\'s key"); it does not read the guidebook, gamble, sing, or shop, so anything the game only explains in those places is invisible to it. A stall is the pilot standing still with nothing to fight for 20 s — the closest thing to a human "what do I do now?". Screenshots in shots/.');
  L.push('');
  L.push('Written by scripts/playtest/playtest.js — Claude (the only AI).');
  return L.join('\n') + '\n';
}
module.exports = { render, floorStats, funBoring };
// re-render a finished run with the current renderer:  node scripts/playtest/report.js scripts/playtest/out/<stamp>
if (require.main === module && process.argv[2]) {
  const fs = require('fs'), path = require('path'); const dir = process.argv[2];
  const J = JSON.parse(fs.readFileSync(path.join(dir, 'journal.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'report.md'), render(J)); console.log('re-rendered ' + path.join(dir, 'report.md'));
}
