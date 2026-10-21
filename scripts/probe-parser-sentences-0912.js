// FULL SENTENCES THROUGH THE REAL RAIL (Mark 2026-09-12 "advanced parser? full sentences?" → "yes awesome. go").
// Two layers, both measured:
//   A. the grammar alone (no boot): 40 sentences a kid actually types — politeness, filler, pronouns, chains, questions, JA — each
//      must parse to the intended verb + target; 6 sentences that MUST NOT parse (conversation stays conversation).
//   B. the booted game: typed into the real command box, the reply lands in the live region — including the typo path
//      ("look at the lanturn" → "Did you mean…") and a chain ("look at the X then look at the Y" → two replies, in order).
//   node scripts/probe-parser-sentences-0912.js            PARSER_BREAK=1 … (the filler stripper is disabled → layer A goes red)
const path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
global.window = {}; require(path.join(__dirname, '..', 'js/v8/a11y/CommandGrammar.js')); const G = global.window.A11yGrammar;
if (process.env.PARSER_BREAK === '1') { console.log('  ⚠ BREAK: normalize() disabled'); G.normalize = t => t; const _d = G.detect; G.detect = t => _d.call(G, t); G._detectOne = ((o) => (raw) => o.call(G, raw))(G._detectOne); G.detect = (t) => { const got = G._detectOne(String(t || '').trim()); if (got && got.targetName) G.remember(got.targetName); return got; }; }

// ── A. grammar
const A = [
  ['can you please look at the bed for me?', 'LOOK', 'bed'], ['Could you pick up the lantern please', 'PICK_UP', 'lantern'],
  ['i want to smash that barrel', 'SMASH', 'barrel'], ['hey um go to the cabaret now', 'GO_TO_ROOM', 'cabaret'],
  ['would you mind opening the gate', 'OPEN', 'gate'], ["let's use the machine", 'USE', 'machine'],
  ['tell me about the mimic', 'LOOK', 'mimic'], ['is there a door?', 'LOOK', 'door'], ['where is the sake machine', 'LOOK', 'sake machine'],
  ["where's the lantern", 'LOOK', 'lantern'], ['who is that?', 'LIST_NEARBY', null], ['what is in here', 'LIST_NEARBY', null],
  ['anyone here?', 'LIST_NEARBY', null], ['what room am i in', 'WHERE_AM_I', null], ['what can i do', 'HELP', null],
  ['ok now look at the lantern', 'LOOK', 'lantern'], ['now pick it up', 'PICK_UP', 'lantern'], ['take it please', 'PICK_UP', 'lantern'],
  ['could you pick that up for me', 'PICK_UP', 'lantern'], ['smash it!', 'SMASH', 'lantern'], ['i need to read the sign', 'READ', 'sign'],
  ['please please go north', 'WALK', 'north'], ['just walk to the bed', 'WALK_TO?', 'bed'], ['try to buy the sake', 'BUY', 'sake'],
  ['ランタンを拾ってください', 'PICK_UP', 'ランタン'], ['ベッドを調べてほしい', 'LOOK', 'ベッド'], ['樽を壊してくれる？', 'SMASH', '樽'],
  ['それを壊して', 'SMASH', '樽'], ['誰かいる？', 'LIST_NEARBY', null], ['ここは何の部屋？', 'WHERE_AM_I', null], ['ミミックについて教えて', 'LOOK', 'ミミック'],
  ['ランタンはどこ', 'LOOK', 'ランタン'], ['look', 'LIST_NEARBY', null], ['l', 'LIST_NEARBY', null], ['search', 'SEARCH', null],
  ['3', 'RESOLVE_CANDIDATE', '3'], ['examine the mimic card', 'LOOK', 'mimic card'], ['get card', 'PICK_UP', 'card'],
  ['can i see the stage', 'LOOK', 'stage'], ['do you see a lantern', 'LOOK', 'lantern'],
];
let aOk = 0; const aBad = [];
for (const [t, cmd, tgt] of A) { const g = G.detect(t); const cmdOk = g && (cmd.endsWith('?') ? /^(WALK|WALK_TO)$/.test(g.cmd) : g.cmd === cmd); const tOk = g && (tgt === null ? g.targetName == null : g.targetName === tgt); if (cmdOk && tOk) aOk++; else aBad.push(`"${t}" → ${JSON.stringify(g)} (wanted ${cmd} ${tgt})`); }
ok(aOk === A.length, `A: ${aOk}/${A.length} kid sentences parse to the intended verb + target${aBad.length ? '\n     ' + aBad.join('\n     ') : ''}`);
const chains = [['look at the bed then pick up the lantern', ['LOOK:bed', 'PICK_UP:lantern']], ['pick up the lantern and then go north', ['PICK_UP:lantern', 'WALK:north']], ['ベッドを調べて、それからランタンを拾って', ['LOOK:ベッド', 'PICK_UP:ランタン']], ['look at the bed then flibber the wug', ['LOOK:bed']]];
let cOk = 0; const cBad = [];
for (const [t, want] of chains) { const got = G.detectAll(t).map(x => x.cmd + ':' + x.targetName); if (JSON.stringify(got) === JSON.stringify(want)) cOk++; else cBad.push(`"${t}" → ${JSON.stringify(got)}`); }
ok(cOk === chains.length, `A2: ${cOk}/${chains.length} chained sentences give one intent per clause in order, and a clause that cannot parse stops the chain${cBad.length ? '\n     ' + cBad.join('\n     ') : ''}`);
const NOT = ['i had a bad day', 'do you like me', 'hello starlette', 'sing me a song', 'i am scared', 'what is your name'];
const notBad = NOT.filter(t => G.detect(t));
ok(notBad.length === 0, `A3: ${NOT.length - notBad.length}/${NOT.length} conversation lines stay conversation (no verb fired)${notBad.length ? ': ' + notBad.map(t => '"' + t + '"→' + G.detect(t).cmd).join(', ') : ''}`);

// ── B. the booted game
(async () => {
  const { chromium } = require('playwright'); const { bootAndStart } = require('./lib/probe-boot');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const { page, eng } = await bootAndStart(browser); await sleep(2000);
  const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
  await pan.evaluate(() => { try { window.welcomeGuide.hide({ isFromLoad: false }); } catch (_) {} });
  const near = await eng.evaluate(() => (window.A11yRegistry.query({ scope: 'room' }).records || []).filter(r => r.type !== 'monster').map(r => r.nameEn).slice(0, 3));
  const type = async (t) => { const before = await pan.evaluate(() => (document.getElementById('event-log-container') || {}).textContent || ''); await pan.evaluate(t => { const inp = document.getElementById('fpv-chat-input'); inp.focus(); inp.value = t; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); }, t); await sleep(2600); const after = await pan.evaluate(() => (document.getElementById('event-log-container') || {}).textContent || ''); return after.slice(before.length).replace(/\s+/g, ' '); };
  const obj = near[0] || 'bed';
  const r1 = await type(`can you please look at the ${obj.toLowerCase()} for me?`);
  ok(r1.toLowerCase().includes(obj.toLowerCase().split(' ')[0]) && !/Nothing named/i.test(r1), `B1: "can you please look at the ${obj.toLowerCase()} for me?" → "${r1.slice(0, 100)}"`);
  const typo = obj.toLowerCase().replace(/([a-z])([a-z])/, '$2$1');   // swap two letters
  const r2 = await type(`look at the ${typo}`);
  ok(/Did you mean/i.test(r2) && r2.toLowerCase().includes(obj.toLowerCase().split(' ')[0]), `B2: typo "${typo}" → "${r2.slice(0, 110)}"`);
  const obj2 = near[1] || obj;
  const r3 = await type(`look at the ${obj.toLowerCase()} then look at the ${obj2.toLowerCase()}`);
  const i1 = r3.toLowerCase().indexOf(obj.toLowerCase().split(' ')[0]), i2 = r3.toLowerCase().lastIndexOf(obj2.toLowerCase().split(' ')[0]);
  ok(i1 >= 0 && i2 > i1 && (r3.match(/🔍|Detail|—/g) || []).length >= 2, `B3: chain → two replies in order: "${r3.slice(0, 140)}"`);
  const r4 = await type('now pick it up');
  ok(r4.length > 5 && !/Nothing named/i.test(r4) && !/🗣️ now pick it up\s*$/.test(r4.trim()), `B4: "now pick it up" (it = ${obj2}) → "${r4.slice(0, 100)}"`);
  await browser.close();
  console.log(fails ? `\n  FAIL ${fails}` : '\n  PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('  ❌ crashed:', e && e.message || e); process.exit(2); });
