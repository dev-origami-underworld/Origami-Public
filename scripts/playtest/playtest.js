#!/usr/bin/env node
/**
 * playtest.js — a stranger plays Origami Underworld, start to finish, and writes down what happened.
 * Claude (the only AI), 2026-09-16. Mark: "create playtesting playwright testing, did the game complete? did it
 * make sense? what was the feeling?"
 *
 * WHAT IT IS. A Playwright run that boots the real game (the shell + the engine + the panels, as a player gets
 * them), picks a role, and then plays each floor the way the game tells you to: find the way down; on floors 2+
 * the exit is barred until the Supervisor's LEVEL KEY, so it goes to the casino, fights the Supervisor, takes the
 * key, and descends. It fights whatever comes at it with the KATANA card through Panels' own emitAction, heals
 * when the HUD says it should, and never teleports or edits game state (scripts/playtest/pilot.js).
 *
 * WHAT IT WRITES (scripts/playtest/out/<stamp>/): report.md — three answers with the numbers under them —
 *   DID IT COMPLETE?   floors reached, how the run ended (completed / died / timed out / stuck), and whether an
 *                      ending exists to reach at all (measured on the tree, not assumed);
 *   DID IT MAKE SENSE? the story the player was told (every LOG_EVENT / guide open, in order) against what the
 *                      player could actually do: objectives found or not, stalls with screenshots, anomalies,
 *                      page errors, prompts that pointed at nothing;
 *   WHAT WAS THE FEELING? per-floor pacing: minutes, fights, damage, hp low-water mark, kills, time in combat vs
 *                      exploring vs stalled, fps, music silence, Oni-Baba's sensors, surprises — and a plain-words
 *                      reading of those numbers (the numbers stay next to the words).
 * plus journal.json (everything) and shots/ (a screenshot at every floor start, every stall, the end).
 *
 *   PROBE_URL=http://127.0.0.1:5611/OrigamiUnderworld.html node scripts/playtest/playtest.js
 *   env: STYLE (fighter | pacifist — the adventurer's camera + wagers, never a swing) · SELFIE_FORCE=1 (harness: force the first selfie) · ROLE (priest; pacifist → archer/adventurer) · FLOOR_BUDGET_S (420) · TOTAL_BUDGET_S (2400) · SEED (fresh) · HEADED=1 to watch
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { bootAndStart } = require(path.join(__dirname, '..', 'lib', 'probe-boot'));

const URL = process.env.PROBE_URL || 'http://127.0.0.1:5611/OrigamiUnderworld.html';
// STYLE=pacifist (Mark 2026-09-16: "play testing on adventurer trying a non-violent solution to reach floor 7 … see if they can
// gamble to win their way : see if the selfie fun stuff works"): the adventurer (role id 'archer' — the camera role) never swings.
const STYLE = (process.env.STYLE || 'fighter').toLowerCase();
const ROLE = process.env.ROLE || (STYLE === 'pacifist' ? 'archer' : 'priest');   // Mark 2026-09-16: "use priest roles so they can heal all the time"
const SELFIE_FORCE = process.env.SELFIE_FORCE === '1';   // harness knob, not the game: the first flash's selfie roll is forced so the modal is exercised on a short run
const FLOOR_BUDGET = (+process.env.FLOOR_BUDGET_S || 420) * 1000;
const TOTAL_BUDGET = (+process.env.TOTAL_BUDGET_S || 2400) * 1000;
const SEED = process.env.SEED || null;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join(__dirname, 'out', STAMP);
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now();
const since = () => ((Date.now() - T0) / 1000).toFixed(0) + 's';
const log = (...a) => { const line = '[' + since() + '] ' + a.join(' '); console.log(line); J.console.push(line); };
const J = { url: URL, role: ROLE, style: STYLE, stamp: STAMP, commit: null, seed: null, floors: [], story: [], samples: [], pilot: [], console: [], pageerrors: [], anomalies: [], outcome: null, endingExists: null };
try { J.commit = require('child_process').execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).trim(); } catch (_) {}
const PILOT_SRC = fs.readFileSync(path.join(__dirname, 'pilot.js'), 'utf8');

// ── the shell tap: every postMessage the player's UI saw, in order ────────────────────────────────
const TAP_SRC = `(() => { if (window.top !== window) return; window.__tap = []; window.__tapStats = {}; window.__tapT0 = performance.now();
  window.addEventListener('message', (e) => { try { const d = e.data; if (!d || !d.type) return;
    if (d.type === 'SYNC_STATS') { Object.assign(window.__tapStats, d); return; }
    if (!/^(LOG_EVENT|WELCOME_GUIDE_|OPEN_GUIDE|GUIDE_|FLOOR_UPDATE|DESCEND_REQUEST|ENGINE_ANOMALY|SHOW_COMBAT|HIDE_COMBAT|WAGER_INVITE|WAGER_CLOSE|DEFEAT_BLINK|PLAYER_CONTEXT|ROOM_ENTER|QUEST_|LEVEL_UP|MIMIC|OGRE|SONG_|CABARET_|PLAYER_DEATH|GAME_OVER|ENGINE_LOAD_PROGRESS)/.test(d.type)) return;
    if (d.type === 'ENGINE_LOAD_PROGRESS' && d.progress < 100) return;
    const rec = { t: Math.round(performance.now() - window.__tapT0), type: d.type };
    if (d.text) rec.text = String(d.text).replace(/<[^>]+>/g, '').slice(0, 300);
    if (d.logType) rec.logType = d.logType; if (d.kind) rec.kind = d.kind; if (d.subsystem) rec.subsystem = d.subsystem;
    if (d.floor != null) rec.floor = d.floor; if (d.room != null) rec.room = d.room; if (d.roomKey) rec.room = d.roomKey; if (d.ctx) rec.ctx = d.ctx;
    if (d.name) rec.name = d.name; if (d.monster) rec.monster = (d.monster.name || d.monster.nameKey || d.monster.id);
    window.__tap.push(rec); if (window.__tap.length > 5000) window.__tap.splice(0, 1000);
  } catch (_) {} }); })();`;

async function drainTap(page) {
  const got = await page.evaluate(() => { const t = window.__tap || []; const out = t.slice(); t.length = 0; return out; }).catch(() => []);
  for (const r of got) { r.floor = r.floor ?? CUR.floor; J.story.push(r); if (r.type === 'ENGINE_ANOMALY') J.anomalies.push(r); }
  return got;
}
const CUR = { floor: 1, eng: null, page: null, pan: null };

async function findEngine(page, floor, timeoutMs) {
  const t1 = Date.now();
  while (Date.now() - t1 < timeoutMs) {
    for (const f of page.frames()) {
      if (!/Engine9\.html/.test(f.url())) continue;
      const ok = await f.evaluate((n) => window._loopStarted === true && window._currentFloor === n && window._playerDead !== true, floor).catch(() => false);
      if (ok) return f;
    }
    await sleep(1000);
  }
  return null;
}
async function installPilot(eng) {
  await eng.evaluate((style) => { window.__playtestStyle = style; }, STYLE);
  if (SELFIE_FORCE) await eng.evaluate(() => { if (window.__selfieForced) return; window._selfieBase = 1; window._selfieMax = 1; window.__selfieForced = true; window.__selfieForceReset = setInterval(() => { if ((window._selfieCount | 0) >= 1) { delete window._selfieBase; delete window._selfieMax; clearInterval(window.__selfieForceReset); } }, 500); });
  await eng.evaluate(PILOT_SRC);
}
async function pilot(eng, expr) { return eng.evaluate('(() => { const p = window.__pilot; return p ? (' + expr + ') : null; })()'); }
async function sample(eng, page) {
  const s = await eng.evaluate(() => {
    const p = (window._playerPoseProbe && window._playerPoseProbe()) || {};
    const G = window.GRID || 2;
    const ob = window._lastOniBabaStats || {}; const sn = ob.sensors || {};
    const mus = (() => { try { const a = document.querySelector('audio'); return a ? (!a.paused && !a.ended) : null; } catch (_) { return null; } })();
    return { floor: window._currentFloor, tile: [Math.round(p.x / G), Math.round(p.z / G)], room: p.room ?? -1, fps: +(window._smoothedFps || 0).toFixed(1),
             inCombat: window._inCombat === true, dead: window._playerDead === true, kills: window._killCount ?? null, armed: window.ownedKatana === true,
             tension: sn.tension ?? null, silence: sn.silence ?? null, cruelty: sn.cruelty ?? null, desperation: sn.desperation ?? null, karma: ob.karma ?? null,
             music: mus, hostileNear: (window.monsterWrappers || []).filter(w => w && w.userData && !w.userData.isDead && (w.userData.isHostile || w.userData.aiState === 'hostile' || w.userData.aiState === 'chase') && Math.hypot(w.position.x - p.x, w.position.z - p.z) / G < 8).length };
  }).catch(() => null);
  if (!s) return null;
  const st = await page.evaluate(() => window.__tapStats || {}).catch(() => ({}));
  s.hp = st.hp ?? null; s.maxHp = st.maxHp ?? null; s.gold = st.gold ?? null; s.xp = st.xp ?? null; s.level = st.playerLevel ?? null; s.t = Date.now() - T0;
  s.allies = await eng.evaluate(() => (window.monsterWrappers || []).filter(w => w && w.userData && w.userData.isAlly && !w.userData.isDead && !w.userData.isPet).length).catch(() => null);
  // the selfie modal is up: one screenshot per selfie, while it shows (Mark 2026-09-16: "their opinion of the selfie modal")
  try { const up = await eng.evaluate(() => window.__pilotSelfieUp === true && window._selfieOpen === true); if (up) { const n = (J.selfieShots = (J.selfieShots | 0) + 1); if (n <= 6) await shot(page, 'selfie-' + n); } } catch (_) {}
  J.samples.push(s);
  return s;
}
async function shot(page, name) { try { await page.screenshot({ path: path.join(OUT, 'shots', name + '.png') }); } catch (_) {} }

// walk to a tile and wait until the pilot arrives, gives up, or the budget ends; fights happen inside the pilot
async function walkTo(eng, page, gx, gz, label, budgetMs) {
  const r = await pilot(eng, `p.goTo(${gx}, ${gz}, ${JSON.stringify(label)})`);
  if (!r || !r.ok) { log('  cannot plan a way to ' + label + ' (' + (r && r.why) + ')'); return { ok: false, why: r && r.why }; }
  log('  → ' + label + ' (' + r.steps + ' steps)');
  const t1 = Date.now(); let lastTile = null, lastMove = Date.now(), stalls = 0, fled = 0;
  while (Date.now() - t1 < budgetMs) {
    await sleep(1500);
    const s = await sample(eng, page); await drainTap(page);
    if (!s) return { ok: false, why: 'engine gone' };
    if (s.dead) return { ok: false, why: 'died' };
    const st = await pilot(eng, 'p.state()');
    if (!st) return { ok: false, why: 'pilot gone' };
    if (JSON.stringify(st.tile) !== lastTile) { lastTile = JSON.stringify(st.tile); lastMove = Date.now(); }
    else if (!st.fighting && Date.now() - lastMove > 20000) {
      stalls++; log('  STALL ' + stalls + ' at ' + lastTile + ' (' + Math.round((Date.now() - lastMove) / 1000) + 's without moving)');
      J.pilot.push({ t: Date.now() - T0, kind: 'stall', floor: CUR.floor, tile: st.tile, goal: label, s: Math.round((Date.now() - lastMove) / 1000) });
      await shot(page, 'f' + CUR.floor + '-stall-' + stalls);
      lastMove = Date.now();
      if (stalls >= 3) return { ok: false, why: 'stalled' };
      await pilot(eng, `p.goTo(${gx}, ${gz}, ${JSON.stringify(label)})`);   // replan from here
    }
    if (st.flee) { lastMove = Date.now(); continue; }   // running home is not a stall
    if (!st.active && !st.fighting) {
      const evs = await pilot(eng, 'p.events.splice(0)'); for (const e of (evs || [])) J.pilot.push(Object.assign({ floor: CUR.floor, tt: Date.now() - T0 }, e));
      const kinds = (evs || []).map(e => e.kind);
      if (kinds.includes('gave-up')) return { ok: false, why: 'gave-up' };
      const d = Math.abs(st.tile[0] - gx) + Math.abs(st.tile[1] - gz);
      if (d <= 1) return { ok: true, why: 'arrived' };
      if (kinds.includes('flee-end') || st.goal === 'home (fleeing)') { fled++; log('  fled (' + fled + ') — hp ' + st.hp + '% — going back'); if (fled > 3) return { ok: false, why: 'kept fleeing' }; await pilot(eng, `p.goTo(${gx}, ${gz}, ${JSON.stringify(label)})`); continue; }
      return { ok: false, why: 'stopped ' + d + ' tiles short' };
    }
  }
  return { ok: false, why: 'budget' };
}

async function playFloor(page, floor, deadline) {
  const eng = await findEngine(page, floor, 150000);
  if (!eng) { log('floor ' + floor + ': engine never reported _loopStarted — giving up'); return { floor, outcome: 'no-engine' }; }
  CUR.eng = eng; CUR.floor = floor;
  await installPilot(eng);
  const F = { floor, t0: Date.now() - T0, fights: 0, kills0: null, outcome: null, objectives: [] };
  J.floors.push(F);
  await sleep(2500); await drainTap(page);
  const s0 = await sample(eng, page); F.kills0 = s0 && s0.kills; F.hp0 = s0 && s0.hp;
  await shot(page, 'f' + floor + '-start');
  const rooms = await pilot(eng, 'p.rooms()');
  const stairs = await pilot(eng, "p.findTile('stairs_down')");
  const barred = await eng.evaluate(() => !!window._dungeonChainFloor && (window._casinoLoop !== false) && !window._exitUnlocked && window._descentIsGuard !== true).catch(() => false);
  F.rooms = rooms ? rooms.length : 0; F.stairs = stairs && stairs[0]; F.barred = barred;
  log('floor ' + floor + ': ' + F.rooms + ' rooms · stairs at ' + JSON.stringify(F.stairs) + ' · exit ' + (barred ? 'BARRED (needs the Supervisor\'s key or the booth)' : 'open'));
  const budget = () => Math.min(FLOOR_BUDGET - (Date.now() - T0 - F.t0), deadline - Date.now());

  // objective 1 — the key, when the exit is barred: go to the casino and fight what guards it
  if (barred) {
    const cas = (rooms || []).find(r => r.casino);
    if (cas) {
      const r1 = await walkTo(eng, page, cas.cx, cas.cz, 'the casino (Supervisor)', Math.max(30000, budget() * 0.6));
      F.objectives.push({ what: 'reach the casino', ...r1 });
      if (r1.why === 'died') { F.outcome = 'died'; return F; }
      // stand and fight until the LEVEL KEY drops (the pilot fights anything hostile that closes in); go and get it
      const t1 = Date.now(); let key = null;
      while (Date.now() - t1 < Math.max(20000, budget() * 0.5)) {
        await sleep(2000); const s = await sample(eng, page); await drainTap(page);
        if (!s || s.dead) { F.outcome = 'died'; return F; }
        const loot = await pilot(eng, 'p.loot()');
        key = (loot || []).find(c => /LEVEL KEY/i.test(c.id || c.name));
        const unlocked = await eng.evaluate(() => window._exitUnlocked === true).catch(() => false);
        if (unlocked) break;
        if (key) { const rk = await walkTo(eng, page, key.tile[0], key.tile[1], 'the LEVEL KEY', 60000); F.objectives.push({ what: 'take the LEVEL KEY', ...rk }); if (rk.why === 'died') { F.outcome = 'died'; return F; } break; }
        // nothing dropped yet and nobody near? walk the room a little so the guards notice us
        const h = await pilot(eng, 'p.nearestHostile(12)');
        if (!h) { const hs = await eng.evaluate(() => { const p = window._playerPoseProbe(); const G = window.GRID || 2; let best = null, bd = 1e9; for (const w of (window.monsterWrappers || [])) { const ud = w && w.userData; if (!ud || ud.isDead || !(ud.isSupervisor || ud.isBoss)) continue; const d = Math.hypot(w.position.x - p.x, w.position.z - p.z); if (d < bd) { bd = d; best = [Math.round(w.position.x / G), Math.round(w.position.z / G), ud.name]; } } return best; }).catch(() => null);
          if (hs) { await walkTo(eng, page, hs[0], hs[1], 'the Supervisor (' + hs[2] + ')', 45000); } }
      }
      const unlocked = await eng.evaluate(() => window._exitUnlocked === true).catch(() => false);
      F.objectives.push({ what: 'exit unlocked', ok: unlocked });
      if (!unlocked) log('  the exit is still barred after ' + Math.round((Date.now() - t1) / 1000) + 's — going to the stairs anyway to see what the game says');
    } else { F.objectives.push({ what: 'find the casino', ok: false, why: 'no casino room on this floor' }); }
  }
  // objective 1b — a LOCKED stairs room (the 番所 guard post): the game's own rule is "stand in the cafeteria, the factory
  // and the storage room and the door opens" (Engine9 SECTION KEYS, Mark 2026-09-02). Visit what the map flags.
  if (F.stairs) {
    const lk = await pilot(eng, `p.lockedAt(${F.stairs[0]}, ${F.stairs[1]})`);
    F.stairsLocked = !!(lk && lk.locked); F.lockOwner = lk && lk.owner;
    if (F.stairsLocked) {
      const specials = (rooms || []).filter(r => r.cafeteria || r.factory || r.storage);
      log('  the stairs room is LOCKED (' + F.lockOwner + ') — ' + specials.length + ' key rooms flagged: ' + specials.map(r => r.name + (r.cafeteria ? ' [cafeteria]' : r.factory ? ' [factory]' : ' [storage]')).join(', '));
      // MEASURED 2026-09-16 (first runs): a key does NOT turn by standing in the room — the room's inspector (an ogre) wakes,
      // its PERMIT "pops free" when it falls, and the room switches on when the player carries the permit to the glowing mark
      // at the room's centre ("🔑 CAFETERIA stirs. 2 of 3 still sealed"). So: go to the centre, survive what wakes, take the
      // permit off the floor, stand on the mark again, and read the key.
      // up to three passes over the key rooms while floor budget remains — a room the pilot fled from or gave up on the first
      // time is usually reachable once the fight has moved on (measured 2026-09-16: a single pass ended runs at 5 min of 60)
      for (let pass = 0; pass < 3 && budget() > 60000; pass++) {
      const keysNow = (await pilot(eng, 'p.keys()')) || {};
      const todo = specials.filter(r => !(r.section != null && keysNow[r.section] === true));
      if (!todo.length) break;
      if (pass) log('  pass ' + (pass + 1) + ' over the key rooms still sealed: ' + todo.map(r => r.name).join(', '));
      for (const r of todo) {
        if (budget() < 20000) break;
        const inside = await pilot(eng, `p.interior(${r.id})`);
        const rr = await walkTo(eng, page, inside[0], inside[1], r.name + ' (key room)', Math.max(30000, budget() * 0.25));
        F.objectives.push({ what: 'reach ' + r.name + (pass ? ' [pass ' + (pass + 1) + ']' : ''), ...rr });
        if (rr.why === 'died') { F.outcome = 'died'; return F; }
        const sec = r.section; const t2 = Date.now(); let turned = false, permitSeen = false;
        while (Date.now() - t2 < Math.max(30000, budget() * 0.25)) {
          await sleep(2000); const s = await sample(eng, page); await drainTap(page);
          if (!s || s.dead) { F.outcome = 'died'; return F; }
          const keys = await pilot(eng, 'p.keys()'); if (keys && sec != null && keys[sec] === true) { turned = true; break; }
          const h = await pilot(eng, 'p.nearestHostile(8)'); if (h) continue;   // still fighting / being chased — the pilot handles it
          const permit = ((await pilot(eng, 'p.loot()')) || []).find(c => /PERMIT/i.test(c.name || '') || /PERMIT/i.test(c.id || ''));
          if (permit) { permitSeen = true; log('  a permit is on the floor: ' + permit.name + ' at ' + permit.tile + ' — taking it to the mark');
            const rp = await walkTo(eng, page, permit.tile[0], permit.tile[1], permit.name, 45000); if (rp.why === 'died') { F.outcome = 'died'; return F; }
            const rm = await walkTo(eng, page, inside[0], inside[1], r.name + ' mark', 45000); if (rm.why === 'died') { F.outcome = 'died'; return F; }
            await sleep(3000); continue; }
          if (!permitSeen && Date.now() - t2 > 25000) break;   // nothing woke, nothing dropped — this room's rule is not the one we know
        }
        F.objectives.push({ what: 'switch on ' + r.name + ' (key ' + sec + ')' + (pass ? ' [pass ' + (pass + 1) + ']' : ''), ok: turned, why: turned ? 'key turned' : (permitSeen ? 'permit carried but no key' : 'no permit appeared') });
        log('  ' + r.name + ': ' + (turned ? 'KEY TURNED' : (permitSeen ? 'permit carried, key not turned' : 'no permit appeared')));
      }
      }
      const keys = await pilot(eng, 'p.keys()'); const lk2 = await pilot(eng, `p.lockedAt(${F.stairs[0]}, ${F.stairs[1]})`);
      F.objectives.push({ what: 'guard post unlocked', ok: !(lk2 && lk2.locked), why: 'keys ' + JSON.stringify(keys) });
      log('  keys turned: ' + JSON.stringify(keys) + ' · stairs room ' + (lk2 && lk2.locked ? 'still locked' : 'OPEN'));
    }
  }
  // objective 2 — the stairs
  if (F.stairs) {
    const r2 = await walkTo(eng, page, F.stairs[0], F.stairs[1], 'the stairs down', Math.max(30000, budget()));
    F.objectives.push({ what: 'reach the stairs down', ...r2 });
    if (r2.why === 'died') { F.outcome = 'died'; return F; }
    if (r2.ok) {
      // step onto them and wait for the descent (the engine reloads into the next floor)
      const t2 = Date.now(); let descended = false;
      while (Date.now() - t2 < 60000) {
        await sleep(1500); await drainTap(page);
        const req = J.story.some(r => r.type === 'DESCEND_REQUEST' && r.floor === floor) || J.story.some(r => r.type === 'FLOOR_UPDATE' && r.floor === floor + 1);
        const gone = await eng.evaluate(() => window._currentFloor).catch(() => null);
        if (req || gone == null || gone !== floor) { descended = true; break; }
        const barredNow = await eng.evaluate(() => !!window._dungeonChainFloor && (window._casinoLoop !== false) && !window._exitUnlocked && window._descentIsGuard !== true).catch(() => false);
        if (barredNow) { await sleep(3000); break; }
      }
      F.outcome = descended ? 'descended' : 'stairs-no-descent';
    } else F.outcome = 'stairs-unreached (' + r2.why + ')';
  } else F.outcome = 'no-stairs-on-map';
  return F;
}

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(TAP_SRC);
  if (SEED) await ctx.addInitScript((seed) => { try { sessionStorage.setItem('origami.v8.seed', seed); } catch (_) {} }, SEED);
  const { page, eng, pageerrors } = await bootAndStart(ctx, { url: URL, viewport: { width: 1400, height: 900 } });
  CUR.page = page; J.pageerrorsRef = pageerrors;
  page.on('pageerror', e => J.pageerrors.push({ t: Date.now() - T0, floor: CUR.floor, msg: String(e.message).slice(0, 300) }));
  const pan = page.frames().find(f => /Panels/.test(f.url())); CUR.pan = pan;
  await sleep(1500);
  await pan.evaluate((role) => { window.selectRole(role); }, ROLE).catch(() => {});
  await sleep(3000);
  J.seed = await eng.evaluate(() => String(window._origamiGameSeed)).catch(() => null);
  J.endingExists = await eng.evaluate(() => ({ maxFloor: window._maxFloor, gameComplete: typeof window._gameComplete !== 'undefined' || typeof window._victory !== 'undefined' || typeof window._endingState !== 'undefined' })).catch(() => null);
  log('booted: commit ' + J.commit + ' · seed ' + J.seed + ' · role ' + ROLE + ' · maxFloor ' + (J.endingExists && J.endingExists.maxFloor));
  await drainTap(page);
  const deadline = T0 + TOTAL_BUDGET;
  let floor = 1; const LIVES = +process.env.LIVES || 3; let deaths = 0; J.deaths = [];
  while (Date.now() < deadline && floor <= 7) {
    const F = await playFloor(page, floor, deadline);
    log('floor ' + floor + ' → ' + F.outcome + ' (' + Math.round((Date.now() - T0 - F.t0) / 1000) + 's)');
    F.t1 = Date.now() - T0;
    const evs = await pilot(CUR.eng, 'p.events.splice(0)').catch(() => []); for (const e of (evs || [])) J.pilot.push(Object.assign({ floor, tt: Date.now() - T0 }, e));
    if (F.outcome === 'died') {
      deaths++; const killer = [...J.pilot].reverse().find(e => e.kind === 'fight-start'); J.deaths.push({ floor, t: F.t1, by: killer && killer.name, tile: (J.samples.slice(-1)[0] || {}).tile });
      await shot(page, 'f' + floor + '-death-' + deaths);
      if (deaths >= LIVES) { J.outcome = 'died on floor ' + floor + ' (' + deaths + ' lives spent)'; break; }
      // a stranger clicks RETRY — the run resumes from the floor's checkpoint (the soft refresh: fresh at the stairs)
      const retried = await pan.evaluate(async () => { for (let i = 0; i < 40; i++) { const b = document.querySelector('#defeat-retry'); if (b && b.offsetParent !== null) { b.click(); return true; } await new Promise(r => setTimeout(r, 500)); } return false; }).catch(() => false);
      log('  died (' + deaths + '/' + LIVES + ') to ' + (killer && killer.name) + ' — ' + (retried ? 'RETRY clicked, resuming floor ' + floor : 'no RETRY button appeared'));
      if (!retried) { J.outcome = 'died on floor ' + floor + ' and the defeat screen offered no retry'; break; }
      await sleep(4000);
      continue;   // same floor, the engine reloads → playFloor finds the new frame
    }
    if (F.outcome !== 'descended') { J.outcome = (F.outcome.startsWith('stairs') || F.outcome === 'no-stairs-on-map' ? 'stuck' : F.outcome) + ' on floor ' + floor + ' (' + F.outcome + ')'; break; }
    if (floor === 7) { J.outcome = 'reached the bottom of floor 7 and took the stairs — nothing below'; break; }
    floor++;
  }
  if (!J.outcome) J.outcome = 'out of time on floor ' + floor;
  await shot(page, 'end');
  await drainTap(page);
  const last = await sample(CUR.eng || eng, page);
  J.end = { t: Date.now() - T0, floor: CUR.floor, hp: last && last.hp, kills: last && last.kills, gold: last && last.gold, level: last && last.level, allies: last && last.allies };
  J.style = STYLE; J.selfieForced = SELFIE_FORCE;
  try { J.tallies = await pilot(CUR.eng || eng, 'p.tallies()'); J.selfieCount = await (CUR.eng || eng).evaluate(() => window._selfieCount | 0); } catch (_) {}
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'journal.json'), JSON.stringify(J, null, 1));
  const report = require('./report').render(J);
  fs.writeFileSync(path.join(OUT, 'report.md'), report);
  console.log('\n' + report);
  console.log('\nwrote ' + path.relative(process.cwd(), OUT) + '/report.md');
})().catch(e => { console.error('PLAYTEST ERROR', e); try { fs.writeFileSync(path.join(OUT, 'journal.json'), JSON.stringify(J, null, 1)); } catch (_) {} process.exit(2); });
