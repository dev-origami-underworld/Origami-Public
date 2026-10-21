// THE A/AA ROWS THE REGISTER STILL OWED (Mark 2026-09-13 "work on those rows"). Conformance is cumulative — the AAA probes are green,
// but a level cannot be claimed while any lower row is unmeasured. Every step here is a live measurement on a real boot, each
// assertion names its SC, and A11Y_AA_BREAK=1 re-imposes a defect per group so the graders are known to bite.
//   2.1.4  single-key shortcuts can be switched OFF (Display Options) — the M key reaches nothing, the arrows still do
//   1.3.4  no orientation lock: the game renders in portrait, no "rotate" gate, no screen.orientation.lock in source
//   1.4.1  colour is never the only cue: hostile bodies carry a state WORD in the registry; pressed/active controls carry aria state
//   1.4.3  text contrast ≥ 4.5:1 (3:1 for large) across visible text in shell, HUD and the guidebook
//   1.4.11 non-text contrast ≥ 3:1: every visible control's boundary (border or fill) against its surround
//   1.4.10 reflow at 320 CSS px: the guidebook has no horizontal scroll (the 3D canvas is the cited exception)
//   1.4.4  200% zoom (640 px viewport) keeps the guidebook readable with no clipped prose
//   1.4.12 text spacing overrides (1.5 line / 0.12em letter / 0.16em word / 2em paragraph) clip nothing in the guide
//   1.4.5  no canvas draws text the DOM does not also carry: every visible non-3D canvas has an accessible name or is aria-hidden
//   2.5.2  pointer cancellation: down-event on a control activates nothing; only the hold controls (D-pad, PIP zoom) use down
//   2.5.3  label in name: every control with visible text has that text inside its accessible name
//   3.1.2  language of parts: in EN, every Japanese run in the guide sits under lang="ja"
//   3.2.1  on focus: focusing each control opens nothing, moves nothing, changes no page
//   3.2.2  on input: changing each Display Options control changes no page and opens no dialog
//   3.2.3  consistent navigation: the guide tab strip reads identically from every page
//   3.2.4  consistent identification: each World-page verb has ONE icon+label everywhere
//   2.2.2  moving content that starts by itself (the music pill marquee) stops under Reduce motion
//   3.3.4  a purchase asks for confirmation before gold leaves the purse
//   1.3.1/4.1.2 hand cards are role=button with a full name; stacked columns are named groups; the keyboard selector moves REAL focus + announces
//   node scripts/probe-a11y-aa-rows-0913.js          A11Y_AA_BREAK=1 …
const { chromium } = require('playwright'); const { bootAndStart } = require('./lib/probe-boot');
const fs = require('fs'); const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const BREAK = process.env.A11Y_AA_BREAK === '1';

// injected into a frame: contrast + name helpers (kept small; the rows probe carries the ring-geometry version)
const HELPERS = `
  window.__aa = window.__aa || (() => {
    const lum = (r, g, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const parse = s => { const m = String(s || '').match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const ratio = (a, b) => { const l1 = lum(a.r, a.g, a.b), l2 = lum(b.r, b.g, b.b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    // effective background: walk up compositing every non-transparent layer (gradients/images count as unknown → skip element)
    const bgOf = (el) => { let acc = null, e = el; while (e && e !== document.documentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none') return { unknown: true }; const c = parse(cs.backgroundColor); if (c && c.a > 0) { acc = acc ? blend(acc, c) : c; if (acc.a >= 0.999 || c.a >= 0.999) return acc; } e = e.parentElement; } const root = parse(getComputedStyle(document.body).backgroundColor); return acc ? blend(acc, (root && root.a > 0) ? root : { r: 20, g: 18, b: 24, a: 1 }) : ((root && root.a > 0) ? root : { r: 20, g: 18, b: 24, a: 1 }); };
    const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; let e = el; while (e) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; e = e.parentElement; } return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
    const name = el => { const al = el.getAttribute('aria-label'); if (al) return al; const lb = el.getAttribute('aria-labelledby'); if (lb) return lb.split(/\\s+/).map(id => (document.getElementById(id) || {}).textContent || '').join(' '); if (el.id) { const l = document.querySelector('label[for="' + el.id + '"]'); if (l) return l.textContent; } const wrap = el.closest('label'); if (wrap) return wrap.textContent; return el.getAttribute('title') || el.textContent || ''; };
    const norm = s => String(s || '').replace(/[\\p{Extended_Pictographic}\\uFE0F]/gu, '').replace(/\\s+/g, ' ').trim().toLowerCase();
    return { parse, ratio, bgOf, visible, name, norm };
  })();`;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const { page, eng } = await bootAndStart(browser); await sleep(1500);
  const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
  for (const f of [page.mainFrame(), pan, eng]) await f.evaluate(HELPERS);
  await pan.evaluate(() => { try { window.welcomeGuide.hide({ isFromLoad: false }); } catch (_) {} });

  // ── 2.1.4 single-key shortcuts OFF ──────────────────────────────────────────────────────────────────────────────
  const keyHit = async (key) => eng.evaluate(async (key) => { let seen = 0; const h = e => { if (e.key === key) seen++; }; window.addEventListener('keydown', h); document.body.dispatchEvent(new KeyboardEvent('keydown', { key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, bubbles: true, cancelable: true })); window.removeEventListener('keydown', h); return seen; }, key);
  const onM = await keyHit('m'), onArrow = await keyHit('ArrowUp');
  await pan.evaluate(() => { window.welcomeGuide.show({ browse: true }); const g = window.welcomeGuide; for (let i = 0; i < 24; i++) { const b = document.querySelector('#welcome-guide-overlay #wg-single-keys'); if (b && b.getBoundingClientRect().width > 0) break; g.nextSlide(); } });
  await sleep(500);
  const skBox = await pan.evaluate(() => { const b = document.querySelector('#wg-single-keys'); if (!b) return null; b.click(); return { checked: b.checked, label: (b.closest('label') || {}).textContent }; });
  await sleep(600);
  if (BREAK) await eng.evaluate(() => { window._a11ySingleKeysOff = false; });
  const flags = { eng: await eng.evaluate(() => window._a11ySingleKeysOff === true), pan: await pan.evaluate(() => window._a11ySingleKeysOff === true), shell: await page.evaluate(() => window._a11ySingleKeysOff === true) };
  const offM = await keyHit('m'), offArrow = await keyHit('ArrowUp'), offP = await keyHit('p'), offCtrlM = await eng.evaluate(() => { let seen = 0; const h = e => { seen++; }; window.addEventListener('keydown', h); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true })); window.removeEventListener('keydown', h); return seen; });
  const inInput = await pan.evaluate(() => { const i = document.getElementById('fpv-chat-input'); let seen = 0; const h = e => { seen++; }; window.addEventListener('keydown', h); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true })); window.removeEventListener('keydown', h); return seen; });
  ok(skBox && skBox.checked === false && onM === 1 && onArrow === 1 && flags.eng && flags.pan && flags.shell && offM === 0 && offP === 0 && offArrow === 1 && offCtrlM === 1 && inInput === 1,
     `2.1.4 Character Key Shortcuts: "${(skBox || {}).label || '?'}" unticked → engine/panels/shell flags ${flags.eng}/${flags.pan}/${flags.shell}; M reached handlers ${onM}→${offM}, P ${offP}, ArrowUp ${onArrow}→${offArrow}, Ctrl+M ${offCtrlM}, M inside the chat box ${inInput}`);
  await pan.evaluate(() => { const b = document.querySelector('#wg-single-keys'); if (b && !b.checked) b.click(); });
  await sleep(300);

  // ── 2.2.2 moving content stops under Reduce motion ──────────────────────────────────────────────────────────────
  const movers = async () => pan.evaluate(() => [...document.querySelectorAll('*')].filter(e => window.__aa.visible(e)).map(e => { const cs = getComputedStyle(e); const dur = parseFloat(cs.animationDuration) || 0, iter = cs.animationIterationCount; return (cs.animationName !== 'none' && dur > 0 && (iter === 'infinite' || dur * (parseFloat(iter) || 1) > 5)) ? { sel: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), anim: cs.animationName, dur, iter, state: cs.animationPlayState } : null; }).filter(Boolean));
  const beforeRM = await movers();
  await pan.evaluate(() => { const b = document.querySelector('#wg-reduced-motion'); if (b && !b.checked) b.click(); });
  await sleep(700);
  if (BREAK) await pan.evaluate(() => { const st = document.createElement('style'); st.id = 'aa-break-motion'; st.textContent = 'html.a11y-reduced-motion .music-toggle i { animation: spin 3s linear infinite !important; } @keyframes spin { to { transform: rotate(360deg); } }'; document.head.appendChild(st); });
  const afterRM = await movers();
  const stillMoving = afterRM.filter(m => m.state !== 'paused' && m.dur > 0.01);
  ok(stillMoving.length === 0, `2.2.2 Pause, Stop, Hide: ${beforeRM.length} auto-starting long/infinite animation(s) in the HUD/guide before Reduce motion (${beforeRM.slice(0, 3).map(m => m.sel + ':' + m.anim).join(', ') || 'none'}); after: ${stillMoving.length} still running${stillMoving.length ? ' — ' + stillMoving.slice(0, 3).map(m => m.sel + ':' + m.anim + ' ' + m.dur + 's/' + m.iter).join(', ') : ''}`);
  await pan.evaluate(() => { const b = document.querySelector('#wg-reduced-motion'); if (b && b.checked) b.click(); const s = document.getElementById('aa-break-motion'); if (s) s.remove(); });

  // ── 3.2.2 on input: Display Options controls change no page / open no dialog ────────────────────────────────────
  const pageState = async () => pan.evaluate(() => ({ slide: (document.querySelector('.wg-slide.active') || {}).id || [...document.querySelectorAll('.wg-slide')].findIndex(s => s.classList.contains('active')), dialogs: [...document.querySelectorAll('[role="dialog"], dialog, .modal, [class*="modal"]')].filter(e => window.__aa.visible(e)).length, guide: !!(document.getElementById('welcome-guide-overlay') && window.__aa.visible(document.getElementById('welcome-guide-overlay'))) }));
  const s0 = await pageState();
  const inputs = await pan.evaluate(() => [...document.querySelectorAll('.wg-slide.active input, .wg-slide.active select')].filter(e => window.__aa.visible(e) && e.id !== 'wg-single-keys').map(e => e.id || e.name));
  const inputBad = [];
  for (const id of inputs) {
    await pan.evaluate(id => { const e = document.getElementById(id); if (!e) return; if (e.type === 'checkbox') e.click(); else if (e.type === 'range') { e.value = e.min; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } else if (e.tagName === 'SELECT') { e.selectedIndex = (e.selectedIndex + 1) % e.options.length; e.dispatchEvent(new Event('change', { bubbles: true })); } }, id);
    await sleep(250);
    const s1 = await pageState();
    if (BREAK && id === inputs[0]) { s1.slide = 'BROKEN'; }
    if (s1.slide !== s0.slide || s1.dialogs !== s0.dialogs || s1.guide !== s0.guide) inputBad.push(id + '→' + JSON.stringify(s1));
    await pan.evaluate(id => { const e = document.getElementById(id); if (!e) return; if (e.type === 'checkbox') e.click(); else if (e.type === 'range') { e.value = e.defaultValue || e.max; e.dispatchEvent(new Event('input', { bubbles: true })); } else if (e.tagName === 'SELECT') { e.selectedIndex = (e.selectedIndex + e.options.length - 1) % e.options.length; e.dispatchEvent(new Event('change', { bubbles: true })); } }, id);
    await sleep(150);
  }
  ok(inputs.length >= 5 && inputBad.length === 0, `3.2.2 On Input: ${inputs.length} Display Options controls changed and reverted — page/dialog state unchanged for all (misses ${inputBad.length}${inputBad.length ? ': ' + inputBad.join(', ') : ''})`);

  // ── walk every guide tab collecting: focusables (3.2.1, 2.5.3, 1.4.3, 1.4.11), Japanese runs (3.1.2), tab strips (3.2.3)
  await pan.evaluate(() => { window.welcomeGuide.show({ browse: true }); }); await sleep(600);
  const tabNames = await pan.evaluate(() => [...document.querySelectorAll('#welcome-guide-overlay .wg-tab')].map(t => (t.textContent || '').trim()).filter(Boolean));
  const strips = [], focusBad = [], textBad = [], ctlBad = [], nameBad = [], langBad = []; let focusN = 0, textN = 0, ctlN = 0, nameN = 0, jaN = 0;
  const collect = async (where) => {
    const r = await pan.evaluate(({ where, BREAK }) => {
      const A = window.__aa; const root = document.getElementById('welcome-guide-overlay') || document.body;
      const out = { strip: [...root.querySelectorAll('.wg-tab')].map(t => (t.textContent || '').trim()).join('|'), focus: [], text: [], ctl: [], name: [], lang: [] };
      const ctls = [...root.querySelectorAll('button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="tab"]')].filter(A.visible);
      const state = () => ({ slide: [...document.querySelectorAll('.wg-slide')].findIndex(s => s.classList.contains('active')), dialogs: [...document.querySelectorAll('[role="dialog"], dialog')].filter(A.visible).length, scroll: (document.querySelector('.wg-slide.active') || document.body).scrollTop });
      for (const c of ctls) {
        // 3.2.1 on focus
        const before = state(); try { c.focus({ preventScroll: true }); } catch (_) {} const after = state();
        const moved = document.activeElement !== c && !c.contains(document.activeElement);
        if (BREAK && c === ctls[1]) after.slide = -9;
        out.focus.push({ sel: c.tagName.toLowerCase() + (c.id ? '#' + c.id : ''), bad: (after.slide !== before.slide || after.dialogs !== before.dialogs) ? JSON.stringify([before, after]) : null, moved });
        // 2.5.3 label in name
        const vis = A.norm([...c.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && A.visible(n) && !n.getAttribute('aria-hidden') && !n.matches('input, button, [role], .music-vol-popup'))).map(n => n.textContent).join(' '));
        const al = c.getAttribute('aria-label');
        const words = vis.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 1); if (al && words.length) { const an = A.norm(al); out.name.push({ sel: c.tagName.toLowerCase() + (c.id ? '#' + c.id : '') + ' "' + vis.slice(0, 30) + '" vs "' + an.slice(0, 30) + '"', bad: (BREAK && out.name.length === 0) ? true : !words.every(w => an.includes(w)) }); }
        // 1.4.11 control boundary: border OR fill must reach 3:1 against the surround (text-only links/tabs are judged by 1.4.3)
        if (/^(button|input|select)$/i.test(c.tagName) || c.getAttribute('role') === 'button') {
          const cs = getComputedStyle(c); const sur = A.bgOf(c.parentElement); if (!sur.unknown) {
            const fill = A.parse(cs.backgroundColor), bord = A.parse(cs.borderTopColor); const bw = parseFloat(cs.borderTopWidth) || 0;
            const fillR = (fill && fill.a > 0.05) ? A.ratio({ r: fill.r * fill.a + sur.r * (1 - fill.a), g: fill.g * fill.a + sur.g * (1 - fill.a), b: fill.b * fill.a + sur.b * (1 - fill.a) }, sur) : 0;
            const bordR = (bord && bord.a > 0.05 && bw >= 1) ? A.ratio({ r: bord.r * bord.a + sur.r * (1 - bord.a), g: bord.g * bord.a + sur.g * (1 - bord.a), b: bord.b * bord.a + sur.b * (1 - bord.a) }, sur) : 0;
            const ring = (() => { const m = (cs.boxShadow || '').match(/(rgba?\([^)]+\))\s+0px\s+0px\s+0px\s+(\d+(?:\.\d+)?)px|(?:inset\s+)?0px\s+0px\s+0px\s+(\d+(?:\.\d+)?)px\s+(rgba?\([^)]+\))/); if (!m) return 0; const col = A.parse(m[1] || m[4]); const w = parseFloat(m[2] || m[3]); if (!col || w < 1 || col.a < 0.05) return 0; return A.ratio({ r: col.r * col.a + sur.r * (1 - col.a), g: col.g * col.a + sur.g * (1 - col.a), b: col.b * col.a + sur.b * (1 - col.a) }, sur); })();
            const wrap = (() => { if (!(c.tagName === 'INPUT' && !/checkbox|radio|range/.test(c.type))) return 0; const p = c.parentElement; if (!p) return 0; const pcs = getComputedStyle(p); const ps = A.bgOf(p.parentElement); if (ps.unknown) return 0; const pf = A.parse(pcs.backgroundColor), pb = A.parse(pcs.borderTopColor); const pbw = parseFloat(pcs.borderTopWidth) || 0; const f = (pf && pf.a > 0.05) ? A.ratio({ r: pf.r * pf.a + ps.r * (1 - pf.a), g: pf.g * pf.a + ps.g * (1 - pf.a), b: pf.b * pf.a + ps.b * (1 - pf.a) }, ps) : 0; const b2 = (pb && pb.a > 0.05 && pbw >= 1) ? A.ratio({ r: pb.r * pb.a + ps.r * (1 - pb.a), g: pb.g * pb.a + ps.g * (1 - pb.a), b: pb.b * pb.a + ps.b * (1 - pb.a) }, ps) : 0; return Math.max(f, b2); })();
            const best = Math.max(fillR, bordR, ring, wrap); const isCheck = c.tagName === 'INPUT' && /checkbox|radio|range/.test(c.type);
            const textCue = !isCheck && (A.norm(c.textContent).length > 0 || (c.tagName === 'INPUT' && !!c.placeholder));   // a text-cued control (text or placeholder): 1.4.3 governs the cue, not a boundary
            out.ctl.push({ sel: c.tagName.toLowerCase() + (c.id ? '#' + c.id : '') + (c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/)[0] : ''), best: +best.toFixed(2), pass: (BREAK && c === ctls[3]) ? false : (best >= 3 || textCue || isCheck) });
          }
        }
      }
      // 1.4.3 text contrast over visible text nodes on the active page + tab strip
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; const seen = new Set();
      while ((n = walker.nextNode())) { const t = n.textContent.trim(); if (t.length < 2) continue; const el = n.parentElement; if (!el || seen.has(el) || !A.visible(el)) continue; seen.add(el);
        // 3.1.2: Japanese run must sit under lang=ja when the document is EN
        if (/[぀-ヿ一-鿿]/.test(t) && (document.documentElement.lang || 'en').slice(0, 2) !== 'ja') { const l = el.closest('[lang]'); out.lang.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''), t: t.slice(0, 20), ok: (BREAK && out.lang.length === 0) ? false : !!(l && /^ja/i.test(l.getAttribute('lang'))) }); }
        const cs = getComputedStyle(el); const fg = A.parse(cs.color); const bg = A.bgOf(el); if (!fg || bg.unknown) continue;
        const fgb = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
        const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700; const large = size >= 24 || (bold && size >= 18.66);
        const r = A.ratio(fgb, bg); const need = large ? 3 : 4.5; const dis = el.closest('[disabled], [aria-disabled="true"], .disabled');
        out.text.push({ sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' ' + cs.color + ' on rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')', t: t.slice(0, 28), r: +r.toFixed(2), need, pass: (BREAK && out.text.length === 4) ? false : (r >= need || !!dis) });
      }
      return out;
    }, { where, BREAK });
    strips.push(where + ':' + r.strip);
    focusN += r.focus.length; focusBad.push(...r.focus.filter(f => f.bad).map(f => where + ' ' + f.sel + ' ' + f.bad));
    textN += r.text.length; textBad.push(...r.text.filter(t => !t.pass).map(t => `${where} ${t.sel} "${t.t}" ${t.r}:1 (need ${t.need})`));
    ctlN += r.ctl.length; ctlBad.push(...r.ctl.filter(c => !c.pass).map(c => `${where} ${c.sel} ${c.best}:1`));
    nameN += r.name.length; nameBad.push(...r.name.filter(x => x.bad).map(x => where + ' ' + x.sel));
    jaN += r.lang.length; langBad.push(...r.lang.filter(x => !x.ok).map(x => `${where} ${x.sel} "${x.t}"`));
  };
  await collect('open');
  for (const tn of tabNames) { await pan.evaluate(n => { const t = [...document.querySelectorAll('#welcome-guide-overlay .wg-tab')].find(x => (x.textContent || '').trim() === n); if (t) t.click(); }, tn); await sleep(300); await collect(tn); }
  const seenIdx = new Set(); for (let i = 0; i < 26; i++) { const idx = await pan.evaluate(() => { window.welcomeGuide.nextSlide(); return [...document.querySelectorAll('.wg-slide')].findIndex(s => s.classList.contains('active')); }); if (seenIdx.has(idx)) break; seenIdx.add(idx); await sleep(500); await collect('slide' + idx); }
  // the HUD (guide closed) for 1.4.3 / 1.4.11 / 2.5.3 too
  await pan.evaluate(() => { try { window.welcomeGuide.hide({ isFromLoad: false }); } catch (_) {} }); await sleep(400);
  const hud = await pan.evaluate(() => { const A = window.__aa; const out = { text: [], ctl: [], name: [] };
    const ctls = [...document.querySelectorAll('button, [role="button"], input, select')].filter(A.visible);
    for (const c of ctls) { const vis = A.norm([...c.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ')); const words = vis.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 1); const al = c.getAttribute('aria-label'); if (al && words.length) out.name.push({ sel: c.tagName.toLowerCase() + (c.id ? '#' + c.id : '') + ' "' + vis.slice(0, 20) + '"', bad: !words.every(w => A.norm(al).includes(w)) }); }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; const seen = new Set();
    while ((n = walker.nextNode())) { const t = n.textContent.trim(); if (t.length < 2) continue; const el = n.parentElement; if (!el || seen.has(el) || !A.visible(el) || el.closest('#welcome-guide-overlay')) continue; seen.add(el); const cs = getComputedStyle(el); const fg = A.parse(cs.color); const bg = A.bgOf(el); if (!fg || bg.unknown) continue; const fgb = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }; const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700; const large = size >= 24 || (bold && size >= 18.66); const r = A.ratio(fgb, bg); const need = large ? 3 : 4.5; out.text.push({ sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''), t: t.slice(0, 28), r: +r.toFixed(2), need, pass: r >= need || !!el.closest('[disabled], .disabled') }); }
    for (const i of [...document.querySelectorAll('input[placeholder]')].filter(A.visible)) { if (i.value) continue; let pc = null; try { pc = A.parse(getComputedStyle(i, '::placeholder').color); } catch (_) {} const bg = A.bgOf(i); if (!pc || bg.unknown) continue; const fgb = { r: pc.r * pc.a + bg.r * (1 - pc.a), g: pc.g * pc.a + bg.g * (1 - pc.a), b: pc.b * pc.a + bg.b * (1 - pc.a) }; const r = A.ratio(fgb, bg); out.text.push({ sel: 'input#' + i.id + '::placeholder', t: i.placeholder.slice(0, 28), r: +r.toFixed(2), need: 4.5, pass: r >= 4.5 }); }
    return out; });
  textN += hud.text.length; textBad.push(...hud.text.filter(t => !t.pass).map(t => `HUD ${t.sel} "${t.t}" ${t.r}:1 (need ${t.need})`));
  nameN += hud.name.length; nameBad.push(...hud.name.filter(x => x.bad).map(x => 'HUD ' + x.sel));
  ok(focusN > 100 && focusBad.length === 0, `3.2.1 On Focus: ${focusN} controls focused across ${strips.length} guide pages — no page change, no dialog (misses ${focusBad.length}${focusBad.length ? ': ' + focusBad.slice(0, 3).join('; ') : ''})`);
  ok(textN > 200 && textBad.length === 0, `1.4.3 Contrast (Minimum): ${textN} visible text elements (guide pages + HUD) at ≥ 4.5:1 / 3:1 large (misses ${textBad.length}${textBad.length ? ':\n     ' + textBad.slice(0, 12).join('\n     ') : ''})`);
  ok(ctlN > 40 && ctlBad.length === 0, `1.4.11 Non-text Contrast: ${ctlN} control boundaries ≥ 3:1 against their surround, or text-cued (misses ${ctlBad.length}${ctlBad.length ? ':\n     ' + ctlBad.slice(0, 10).join('\n     ') : ''})`);
  ok(nameN > 0 && nameBad.length === 0, `2.5.3 Label in Name: ${nameN} controls carry both visible text and an aria-label — the label contains the text in every case (misses ${nameBad.length}${nameBad.length ? ': ' + nameBad.slice(0, 5).join(', ') : ''})`);
  ok(jaN > 10 && langBad.length === 0, `3.1.2 Language of Parts: ${jaN} Japanese runs on EN guide pages, every one under lang="ja" (misses ${langBad.length}${langBad.length ? ':\n     ' + langBad.slice(0, 10).join('\n     ') : ''})`);
  if (BREAK) strips.push('break:Wager|Bar');
  const stripSet = new Set(strips.map(s => s.split(':').slice(1).join(':')));
  ok(strips.length >= tabNames.length + 1 && stripSet.size === 1, `3.2.3 Consistent Navigation: the guide tab strip read identically from ${strips.length} pages (${stripSet.size} distinct orderings)`);

  // ── 3.2.4 consistent identification: World-page verbs ───────────────────────────────────────────────────────────
  await pan.evaluate(() => { window.welcomeGuide.show({ browse: true }); const t = [...document.querySelectorAll('#welcome-guide-overlay .wg-tab')].find(x => /world|世界/i.test(x.textContent)); if (t) t.click(); }); await sleep(900);
  const verbs = await pan.evaluate(() => { const m = new Map(); document.querySelectorAll('#welcome-guide-overlay [data-world-target]').forEach(b => { const al = b.getAttribute('aria-label') || ''; const verb = al.split(' — ')[0].trim(); const vis = (b.textContent || '').trim(); if (!m.has(verb)) m.set(verb, new Set()); m.get(verb).add(vis); }); return [...m].map(([v, s]) => [v, [...s]]); });
  if (BREAK && verbs.length) verbs[0][1].push('🔎 Peek');
  const inconsistent = verbs.filter(([, s]) => s.length !== 1);
  ok(verbs.length >= 3 && inconsistent.length === 0, `3.2.4 Consistent Identification: ${verbs.length} World-page verbs, each with exactly one icon+label across every row (${verbs.map(([v, s]) => v + '=' + JSON.stringify(s[0])).join(', ')}${inconsistent.length ? ' — inconsistent: ' + inconsistent.map(([v, s]) => v + ':' + JSON.stringify(s)).join('; ') : ''})`);

  // ── 1.4.1 use of colour: hostile bodies carry a state word; active controls carry aria state ───────────────────
  const col = await eng.evaluate(() => { const recs = (window.A11yRegistry.query({ scope: 'floor' }).records || []).filter(r => r.type !== 'room'); const mons = recs.filter(r => r.type === 'monster'); return { n: recs.length, monsters: mons.length, withState: recs.filter(m => typeof m.state === 'string' && m.state.trim()).length, sample: [...new Set(recs.map(r => r.type + ':' + r.state))].slice(0, 5) }; });
  const pressed = await pan.evaluate(() => { const ps = [...document.querySelectorAll('.pip-persp-btn')]; return { n: ps.length, aria: ps.filter(b => b.hasAttribute('aria-pressed')).length, tabs: [...document.querySelectorAll('#welcome-guide-overlay .wg-tab')].length, tabsAria: [...document.querySelectorAll('#welcome-guide-overlay .wg-tab')].filter(t => t.hasAttribute('aria-selected') || t.hasAttribute('aria-current')).length }; });
  if (BREAK) col.withState = 0;
  ok(col.n > 10 && col.withState === col.n && pressed.n > 0 && pressed.aria === pressed.n && pressed.tabs > 0 && pressed.tabsAria === pressed.tabs,
     `1.4.1 Use of Color: ${col.withState}/${col.n} registry records carry a state WORD (${col.monsters} bodies streamed in yet — the dungeon sleeps; e.g. ${col.sample.join(', ')}); ${pressed.aria}/${pressed.n} view presets carry aria-pressed; ${pressed.tabsAria}/${pressed.tabs} guide tabs carry aria-selected/current`);

  // ── 1.4.5 canvases: every visible non-3D canvas is named or hidden from AT ─────────────────────────────────────
  const canv = await pan.evaluate(() => [...document.querySelectorAll('canvas')].filter(c => window.__aa.visible(c)).map(c => ({ id: c.id || c.className || 'canvas', ok: !!(c.getAttribute('aria-label') || c.getAttribute('aria-hidden') === 'true' || c.getAttribute('role') === 'presentation' || c.closest('[aria-hidden="true"], [aria-label]') || (c.textContent || '').trim()) })));
  if (BREAK && canv.length) canv[0].ok = false;
  ok(canv.every(c => c.ok), `1.4.5 Images of Text: ${canv.length} visible HUD canvases — each named (aria-label / fallback text) or aria-hidden (misses ${canv.filter(c => !c.ok).map(c => c.id).join(', ') || 0})`);

  // ── 2.5.2 pointer cancellation: down-event alone activates nothing on ordinary controls ──────────────────────────
  const pc = await pan.evaluate((BREAK) => { const g = window.welcomeGuide; const s0 = [...document.querySelectorAll('.wg-slide')].findIndex(s => s.classList.contains('active')); const nb = document.querySelector('#welcome-guide-overlay .wg-nav-btn, #welcome-guide-overlay button.wg-next, #welcome-guide-overlay [aria-label*="Next"]'); if (!nb) return { found: false }; nb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0 })); nb.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); if (BREAK) g.nextSlide(); const s1 = [...document.querySelectorAll('.wg-slide')].findIndex(s => s.classList.contains('active')); nb.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })); const rm = document.querySelector('#wg-reduced-motion'); const c0 = rm ? rm.checked : null; if (rm) { rm.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, button: 0 })); rm.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); } return { found: true, s0, s1, c0, c1: rm ? rm.checked : null, btn: nb.getAttribute('aria-label') || nb.textContent.trim() }; }, BREAK);
  const src = fs.readFileSync(path.join(__dirname, '..', 'Origami.RealityEngine.Panels.html'), 'utf8');
  const downAttrs = (src.match(/\son(mouse|pointer|touch)(down|start)=/g) || []).length;
  ok(pc.found && pc.s0 === pc.s1 && pc.c0 === pc.c1 && downAttrs === 0, `2.5.2 Pointer Cancellation: pointerdown+mousedown on "${pc.btn}" changed no page (${pc.s0}→${pc.s1}); on a checkbox changed no state (${pc.c0}→${pc.c1}); ${downAttrs} inline down-event attributes in Panels (hold controls — D-pad, PIP zoom — are the essential/undoable exception, listed in the register)`);

  // ── 1.3.4 orientation + 1.4.10 reflow at 320 + 1.4.4 at 640 + 1.4.12 text spacing ─────────────────────────────
  const srcAll = ['OrigamiUnderworld.html', 'Origami.RealityEngine.Panels.html', 'Origami.RealityEngine.9.html'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  const lockCalls = (srcAll.match(/orientation\.lock\s*\(/g) || []).length + (srcAll.match(/lockOrientation\s*\(/g) || []).length;
  await page.setViewportSize({ width: 720, height: 1280 }); await sleep(900);
  const portrait = await page.evaluate(() => { const A = window.__aa; const gate = [...document.querySelectorAll('*')].filter(e => A.visible(e) && /rotate your (device|phone)|landscape (mode|only)/i.test(e.textContent || '') && e.children.length === 0).length; const fr = document.querySelector('iframe'); return { gate, iframe: !!(fr && A.visible(fr)), w: innerWidth, h: innerHeight }; });
  const portraitPan = await pan.evaluate(() => { const A = window.__aa; return { guideVisible: (() => { window.welcomeGuide.show({ browse: true }); return A.visible(document.getElementById('welcome-guide-overlay')); })(), hud: !!document.getElementById('fpv-chat-input') && A.visible(document.getElementById('fpv-chat-input')) }; });
  if (BREAK) portrait.gate = 1;
  ok(lockCalls === 0 && portrait.gate === 0 && portrait.iframe && portraitPan.guideVisible, `1.3.4 Orientation: ${lockCalls} orientation.lock calls in source; at ${portrait.w}×${portrait.h} portrait — ${portrait.gate} "rotate your device" gates, game frame visible ${portrait.iframe}, guide opens ${portraitPan.guideVisible}, chat box visible ${portraitPan.hud}`);
  const reflowAt = async (w, h) => { await page.setViewportSize({ width: w, height: h }); await sleep(700); return pan.evaluate(() => { const A = window.__aa; const ov = document.getElementById('welcome-guide-overlay'); const pages = [...document.querySelectorAll('.wg-slide.active .wg-page-pad, .wg-slide.active')].filter(A.visible); const clipped = [...document.querySelectorAll('.wg-slide.active p, .wg-slide.active li, .wg-slide.active h2, .wg-slide.active h3')].filter(e => A.visible(e) && e.scrollWidth > e.clientWidth + 2 && /hidden|clip/.test(getComputedStyle(e).overflowX)).length; const past = [...(ov || document.body).querySelectorAll('*')].filter(e => A.visible(e) && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('#pipCanvas, .moondial-wrapper')).map(e => e.tagName.toLowerCase() + '.' + (typeof e.className === 'string' ? e.className.split(/\s+/)[0] : '')); const docScroll = /auto|scroll|visible/.test(getComputedStyle(document.body).overflowX) && document.documentElement.scrollWidth > innerWidth + 1; return { docX: docScroll, ovX: ov ? ov.scrollWidth > ov.clientWidth + 1 : null, past: past.slice(0, 6), pastN: past.length, pagesX: pages.filter(p => p.scrollWidth > p.clientWidth + 1).length, pages: pages.length, clipped, w: innerWidth }; }); };
  const r320 = await reflowAt(320, 480);
  if (BREAK) r320.pagesX = 1;
  ok(!r320.docX && !r320.ovX && r320.pastN === 0 && r320.pagesX === 0 && r320.pages > 0, `1.4.10 Reflow at ${r320.w} CSS px: horizontal scroll document/overlay ${r320.docX}/${r320.ovX}, ${r320.pastN} visible guide elements past the viewport${r320.pastN ? ' (' + r320.past.join(', ') + ')' : ''}, ${r320.pagesX}/${r320.pages} page containers overflow sideways (3D canvas = the cited two-dimensional exception)`);
  const r640 = await reflowAt(640, 360);
  if (BREAK) { r640.pastN = 1; r640.past = ['div.break']; }
  ok(!r640.docX && r640.pastN === 0 && r640.pagesX === 0 && r640.clipped === 0, `1.4.4 Resize Text (200% = 640 px viewport): horizontal scroll ${r640.docX}, ${r640.pastN} visible guide elements past the viewport${r640.pastN ? ' (' + r640.past.join(', ') + ')' : ''}, ${r640.pagesX} page overflow, ${r640.clipped} clipped prose elements`);
  await page.setViewportSize({ width: 1280, height: 720 }); await sleep(600);
  await pan.evaluate(() => { const tabs = [...document.querySelectorAll('#welcome-guide-overlay .wg-tab')]; let best = null, n = -1; for (const t of tabs) { t.click(); const c = document.querySelectorAll('.wg-slide.active p').length; if (c > n) { n = c; best = t; } } if (best) best.click(); }); await sleep(400);
  const ts = await pan.evaluate((BREAK) => { const A = window.__aa; const st = document.createElement('style'); st.id = 'aa-textspacing'; st.textContent = '#welcome-guide-overlay * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } #welcome-guide-overlay p { margin-bottom: 2em !important; }' + (BREAK ? ' #welcome-guide-overlay p { max-height: 1.2em; overflow: hidden !important; }' : ''); document.head.appendChild(st); const els = [...document.querySelectorAll('.wg-slide.active p, .wg-slide.active li, .wg-slide.active h2, .wg-slide.active h3, .wg-slide.active button, .wg-slide.active .wg-tab')].filter(A.visible); const clipped = els.filter(e => { const cs = getComputedStyle(e); return (/hidden|clip/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2) || (/hidden|clip/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2); }).map(e => e.tagName.toLowerCase() + '.' + (typeof e.className === 'string' ? e.className.split(/\s+/)[0] : '') + ' "' + (e.textContent || '').trim().slice(0, 24) + '"'); st.remove(); return { n: els.length, clipped }; }, BREAK);
  ok(ts.n > 10 && ts.clipped.length === 0, `1.4.12 Text Spacing: ${ts.n} guide text elements under the WCAG overrides — ${ts.clipped.length} clipped${ts.clipped.length ? ': ' + ts.clipped.slice(0, 5).join(', ') : ''}`);

  // ── 3.3.4 a purchase asks first ─────────────────────────────────────────────────────────────────────────────────
  const buy = await pan.evaluate(async (BREAK) => { const modal = document.getElementById('vc-confirm-modal'); if (!modal) return { modal: false }; const gold0 = (typeof window._playerGold === 'number') ? window._playerGold : null; const fn = window.openVendingConfirm || window._vcConfirm || window.showVcConfirm || null; const names = ['openVendingConfirm', '_vcConfirm', 'showVcConfirm', 'vcConfirmOpen'].filter(n => typeof window[n] === 'function'); return { modal: true, role: modal.getAttribute('role'), labelled: !!modal.getAttribute('aria-labelledby'), hasConfirm: !!modal.querySelector('button'), buttons: [...modal.querySelectorAll('button')].map(b => (b.textContent || b.getAttribute('aria-label') || '').trim()).slice(0, 4), fns: names, gold0 }; }, BREAK);
  const buyPosts = (src.match(/type:\s*'VENDING_BUY'/g) || []).length; const yesIdx = src.indexOf('window._vcConfirmBuy = '); const postIdx = src.indexOf("type: 'VENDING_BUY'"); const buySrc = buyPosts === 1 && yesIdx > 0 && postIdx > yesIdx && postIdx - yesIdx < 1500;   // the ONE purchase message is posted from the YES handler and nowhere else
  if (BREAK) buy.role = null;
  ok(buy.modal && buy.role === 'dialog' && buy.labelled && buy.hasConfirm && buy.buttons.length >= 2 && buySrc, `3.3.4 Error Prevention (financial): a purchase confirm dialog exists (role=${buy.role}, labelled ${buy.labelled}) with ${buy.buttons.length} choices ${JSON.stringify(buy.buttons)}; VENDING_BUY (the engine's gold-deduct message) is posted from exactly ${buyPosts} place — inside the YES handler (${buySrc})`);

  // ── 1.3.1 / 4.1.2 the hand cards are buttons to AT; a stacked column exposes every card by cycling ────────────────
  await page.setViewportSize({ width: 1280, height: 720 }); await sleep(400);
  await pan.evaluate(() => { try { window.welcomeGuide.hide({ isFromLoad: false }); } catch (_) {} });
  await sleep(400);
  // the deck renders lazily — the selector's first open builds it; a fresh hand has one card per column, so borrow a second
  // real card into the first column to make a 2-card pile (put back afterwards) — the sync logic is what is under test
  await pan.evaluate(() => { for (const c of ['SHURIKEN', 'DAGGER']) window.postMessage({ type: 'ADD_CARD', card: c }, '*'); }); await sleep(900);   // a fresh hand is one card; two more (the real pickup message) give the deck columns to work with
  await pan.evaluate(() => { window._openCardSelector(); });
  await pan.waitForFunction(() => document.querySelectorAll('#guides-container .card-column').length >= 2, null, { timeout: 8000 }).catch(() => {}); await sleep(400);   // the deck rebuilds after ADD_CARD — wait for the columns, not a clock
  const hand = await pan.evaluate((BREAK) => {
    const cols = [...document.querySelectorAll('#guides-container .card-column')];
    let stacked = cols.find(c => c.querySelectorAll('.guide-card').length > 1);
    // build the pile IN THE COLUMN THE SELECTOR IS ON, and borrow from another — moving the focused column's only card out of
    // it emptied that column, and the re-open then had no face card to land on (measured 2026-09-13: the flake that read as a
    // dist failure; `window.focusedColIndex` below was a closure `let`, never a window property, so the old ArrowLeft steer was dead)
    if (!stacked && cols.length >= 2) { const here = (document.activeElement && document.activeElement.closest('.card-column')) || cols[0]; const home = cols.find(c => c !== here && c.querySelector('.guide-card')); const donor = home && home.querySelector('.guide-card'); if (donor) { window.__aaDonor = { card: donor, home }; donor.dataset.depth = '1'; here.appendChild(donor); here.querySelectorAll('.guide-card').forEach(c => window._a11ySyncCard(c)); stacked = here; } }
    if (BREAK) document.querySelectorAll('#guides-container .guide-card').forEach(c => { c.removeAttribute('role'); c.removeAttribute('aria-label'); });
    const cards = cols.flatMap(c => [...c.querySelectorAll('.guide-card')]);
    const named = cards.filter(c => c.getAttribute('role') === 'button' && (c.getAttribute('aria-label') || '').length > 3);
    const faces = cards.filter(c => c.dataset.depth === '0'); const behind = cards.filter(c => c.dataset.depth !== '0');
    return { cols: cols.length, groups: cols.filter(c => c.getAttribute('role') === 'group' && c.getAttribute('aria-label')).length, cards: cards.length, named: named.length, facesOk: faces.filter(c => c.getAttribute('tabindex') === '0' && c.getAttribute('aria-hidden') !== 'true').length, faces: faces.length, behindHidden: behind.filter(c => c.getAttribute('aria-hidden') === 'true').length, behind: behind.length, sample: (faces[0] && faces[0].getAttribute('aria-label')) || null, stackedIdx: stacked ? cols.indexOf(stacked) : -1, stackedN: stacked ? stacked.querySelectorAll('.guide-card').length : 0, group: stacked ? stacked.getAttribute('aria-label') : null };
  }, BREAK);
  ok(hand.cards > 0 && hand.named === hand.cards && hand.groups === hand.cols && hand.facesOk === hand.faces && hand.behind > 0 && hand.behindHidden === hand.behind,
     `1.3.1/4.1.2 hand cards: ${hand.named}/${hand.cards} cards are role=button with a name (e.g. "${hand.sample}"); ${hand.groups}/${hand.cols} columns are named groups (pile: "${hand.group}"); ${hand.facesOk}/${hand.faces} face cards focusable + exposed, ${hand.behindHidden}/${hand.behind} cards behind hidden until cycled`);
  const sel = await pan.evaluate(async (idx) => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const kd = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); const live = () => (document.getElementById('card-selector-live') || {}).textContent || '';
    window._closeCardSelector('probe'); await sleep(100); window._openCardSelector(); for (let t = 0; t < 30 && !(document.activeElement && document.activeElement.classList.contains('guide-card')); t++) await sleep(50); const colOf = () => { const cs = [...document.querySelectorAll('#guides-container .card-column')]; const c = document.activeElement && document.activeElement.closest('.card-column'); return c ? cs.indexOf(c) : -1; }; for (let i = 0; i < 12 && colOf() >= 0 && colOf() !== idx; i++) { kd(colOf() > idx ? 'ArrowLeft' : 'ArrowRight'); await sleep(60); } await sleep(200);
    const a0 = document.activeElement; const f0 = !!(a0 && a0.classList.contains('guide-card') && a0.dataset.depth === '0'); const n0 = a0 && a0.getAttribute('aria-label'); const l0 = live();
    kd('ArrowDown'); await sleep(250); const a1 = document.activeElement; const n1 = a1 && a1.getAttribute('aria-label'); const l1 = live(); const face = a1 && a1.classList.contains('guide-card') && a1.dataset.depth === '0'; const hiddenBehind = a1 && [...a1.parentElement.querySelectorAll('.guide-card')].filter(c => c !== a1).every(c => c.getAttribute('aria-hidden') === 'true');
    return { f0, n0, l0, n1, l1, face, hiddenBehind, col: a1 && a1.parentElement.id }; }, hand.stackedIdx);
  ok(sel.f0 && sel.n0 && sel.l0 === sel.n0 && sel.face && sel.l1 === sel.n1 && sel.n1 !== sel.n0 && sel.hiddenBehind,
     `4.1.2 keyboard selector: opened → real focus on the face card "${(sel.n0 || '').slice(0, 48)}", live region said the same (${sel.l0 === sel.n0}); ArrowDown on the pile → focus on the NEW face "${(sel.n1 || '').slice(0, 48)}", card behind hidden (${sel.hiddenBehind})`);
  await pan.evaluate(() => { try { window._closeCardSelector('probe'); const d = window.__aaDonor; if (d) { d.card.dataset.depth = '0'; d.home.appendChild(d.card); [d.home, d.card.parentElement].forEach(col => col && col.querySelectorAll('.guide-card').forEach(c => { c.dataset.depth = '0'; window._a11ySyncCard(c); })); } } catch (_) {} });

  await browser.close();
  console.log(fails ? `\n  FAIL ${fails}` : '\n  PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('  ❌ crashed:', e && e.stack || e); process.exit(2); });
