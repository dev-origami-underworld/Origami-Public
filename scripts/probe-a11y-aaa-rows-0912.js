// WCAG 2.2 AAA — THE MEASURABLE ROWS, MEASURED (Mark 2026-09-12 "fix the last accessibility rows"). Real boot, every frame
// (shell / panels / engine / guidebook open). For EVERY visible focusable element it measures, not cites:
//   2.4.13 Focus Appearance   — focus it, read the computed outline (and box-shadow ring); the ring must be ≥2px, and its
//                               colour must contrast ≥3:1 with the colour behind the element (the unfocused pixels it replaces).
//   2.5.5  Target Size 44×44  — bounding box; the exception WCAG allows: an EQUIVALENT ≥44px control on the same page, or a
//                               control that is inline in text. We list the misses so the exception is claimed per element.
//   2.4.12 Focus Not Obscured — after focus(), elementFromPoint at the four corners and the centre must land on the element or a
//                               descendant (nothing fixed sits on top of it).
//   2.4.10 Section Headings   — every guidebook page has an h1/h2/h3 above its prose.
//   2.4.9  Link Purpose       — every <a href> has a non-empty accessible name that is not "here"/"click".
//   2.3.3  Animation          — with the in-app Reduce-motion pref on, every frame's <html> carries a11y-reduced-motion and a
//                               sampled animated element reports a ~0 animation/transition duration.
//   7. the Minimap twins in Display Options really drive the moondial: zoom posts PIP_ZOOM to the shell, a view preset lands on the
//      real .pip-persp-btn (active ring + body.topdown-mode) — the 2.5.5 "equivalent" is a working control, not a decoy.
//   node scripts/probe-a11y-aaa-rows-0912.js            (grade)
//   node scripts/probe-a11y-aaa-rows-0912.js --census   (print every miss — the work list)
//   A11Y_ROWS_BREAK=1 node scripts/probe-a11y-aaa-rows-0912.js   (red-first proof: injects a ringless button, a 20px twin and a
//                                                                 1s animation under the calm class → 2.4.13, 2.5.5, 2.3.3 must go red)
const { chromium } = require('playwright'); const { bootAndStart } = require('./lib/probe-boot');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CENSUS = process.argv.includes('--census');
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };

// runs inside a frame: measure every visible focusable element
const MEASURE = `(() => {
  const lum = (r, g, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = s => { const m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; };
  const contrast = (a, b) => { const la = lum(...a), lb = lum(...b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const blend = (fg, bg) => fg[3] >= 1 ? fg : [0, 1, 2].map(i => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3]))).concat([1]);
  // colour behind an element = walk up until a non-transparent background; default = page black
  const behind = el => { let n = el.parentElement; while (n) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0.05) return blend(c, [0, 0, 0, 1]); n = n.parentElement; } return [0, 0, 0, 1]; };
  const SEL = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"]';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (el.disabled || el.getAttribute('aria-hidden') === 'true') continue;
    // a form control wrapped by / bound to a <label> is activated by the whole label — that label IS the pointer target (WCAG 2.5.5 note on labels)
    const lab = (el.tagName === 'INPUT' || el.tagName === 'SELECT') ? (el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]'))) : null;
    let r0 = el.getBoundingClientRect(); if (r0.width < 1 || r0.height < 1) continue;
    // below the fold of a scrolling page (the guide's pages scroll) → bring it in, then measure where it lands
    // (2026-09-13) the viewport test alone missed an element inside a half-scrolled page: in the viewport, clipped by its own scroll box, hit-test landing on the footer beneath — so always bring it to 'nearest'
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {} r0 = el.getBoundingClientRect();
    let r = r0; if (lab) { const lr = lab.getBoundingClientRect(); if (lr.width >= r0.width && lr.height >= r0.height) r = lr; }
    // a transparent ::before/::after hit-area extension (position:absolute + negative inset) grows the pointer target without moving a pixel
    let ext = null;
    for (const ps of ['::before', '::after']) { const pc = getComputedStyle(el, ps); if (pc.content !== 'none' && pc.content !== 'normal' && pc.position === 'absolute') { const t = parseFloat(pc.top), l = parseFloat(pc.left), b = parseFloat(pc.bottom), rr = parseFloat(pc.right); if ([t, l, b, rr].every(v => !isNaN(v)) && (t < 0 || l < 0 || b < 0 || rr < 0)) { ext = { w: r0.width - l - rr, h: r0.height - t - b }; } } }
    if (ext && !lab) r = { left: r0.left, top: r0.top, right: r0.right, bottom: r0.bottom, width: Math.max(r0.width, ext.w), height: Math.max(r0.height, ext.h) };
    const cs0 = getComputedStyle(el); if (cs0.visibility === 'hidden' || cs0.display === 'none' || +cs0.opacity === 0) continue;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    // must actually be hittable (not under a closed overlay)
    const hitC = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hitC || !(el === hitC || el.contains(hitC))) continue;
    const id = (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''));
    const name = (el.getAttribute('aria-label') || el.title || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
    const inline = ['A', 'SPAN'].includes(el.tagName) && el.parentElement && /^(P|LI|TD|SPAN|EM|STRONG|SMALL)$/.test(el.parentElement.tagName) && el.parentElement.textContent.trim().length > (el.textContent || '').trim().length + 8;
    // focus it — :focus-visible fires for programmatic focus after a keyboard event; nudge with a keydown first
    try { el.focus({ preventScroll: true }); } catch (_) {}
    const focused = document.activeElement === el;
    const cs = getComputedStyle(el);
    const ow = parseFloat(cs.outlineWidth) || 0, os = cs.outlineStyle, oc = parse(cs.outlineColor);
    const bs = cs.boxShadow || 'none';
    // a box-shadow ring counts when it is a solid spread (0 0 0 Npx colour)
    // any solid spread ring (0 0 0 Npx colour) anywhere in a multi-shadow list counts as an indicator
    let bsm = null; for (const part of bs.split(/,(?![^(]*\\))/)) { const m = /(rgba?\\([^)]+\\))\\s+0px\\s+0px\\s+0px\\s+([\\d.]+)px/.exec(part.trim()); if (m && parseFloat(m[2]) > 0) { bsm = { w: parseFloat(m[2]), c: parse(m[1]) }; break; } }
    let ringW = (os !== 'none' && ow > 0) ? ow : 0, ringC = ringW ? oc : null;
    if (!ringW && bsm) { ringW = bsm.w; ringC = bsm.c; }
    const bg = behind(el);
    const ringContrast = ringC ? contrast(blend(ringC, bg), bg) : 0;
    // obscured? corners + centre after focus
    // 20% insets, not the literal corners — a round control's corners are outside its own circle
    const ix = r0.width * 0.2, iy = r0.height * 0.2;
    const pts = [[r0.left + ix, r0.top + iy], [r0.right - ix, r0.top + iy], [r0.left + ix, r0.bottom - iy], [r0.right - ix, r0.bottom - iy], [r0.left + r0.width / 2, r0.top + r0.height / 2]];
    const covered = pts.filter(([x, y]) => { const h = document.elementFromPoint(x, y); return h && !(el === h || el.contains(h) || h.contains(el)); }).length;
    out.push({ id, name, w: Math.round(r.width), h: Math.round(r.height), inline, focused, ringW, ringContrast: +ringContrast.toFixed(2), covered, viaLabel: !!lab && r !== r0, viaExt: !!ext && r !== r0 });
    try { el.blur(); } catch (_) {}
  }
  return out;
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
  const { page, eng } = await bootAndStart(browser); await sleep(2000);
  const pan = page.frames().find(f => /Panels\.html/.test(f.url()));
  const frames = [['shell', page.mainFrame()], ['panels', pan], ['engine', eng]];
  if (process.env.A11Y_ROWS_BREAK === '1') {
    console.log('  ⚠ BREAK mode: injecting a ringless avatar button, 20px minimap twins and a 1s calm-class animation');
    await pan.evaluate(() => { const st = document.createElement('style'); st.textContent = '#player-avatar-container:focus-visible{outline:none!important;box-shadow:none!important} #welcome-guide-overlay .wg-mm-btn{min-width:20px!important;min-height:20px!important;width:20px;height:20px;padding:0}'; document.head.appendChild(st); });
    await page.evaluate(() => { const st = document.createElement('style'); st.textContent = 'html.a11y-reduced-motion #a11y-skip:not(#nope1):not(#nope2){transition-duration:1s!important}'; document.head.appendChild(st); });
  }
  // a keyboard event first so :focus-visible matches programmatic focus in Chromium
  for (const [, f] of frames) await f.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
  const all = [];
  for (const [nm, f] of frames) { const rows = await f.evaluate(MEASURE); rows.forEach(r => { r.frame = nm; all.push(r); }); }
  // guidebook open → its controls
  await pan.evaluate(() => { window.welcomeGuide.show({ browse: true }); }); await sleep(900);
  const tabNames = await pan.evaluate(() => [...document.querySelectorAll('#welcome-guide-overlay .wg-tab')].map(t => (t.textContent || '').trim()).filter(Boolean));
  const seen = new Set(all.map(a => a.frame + '|' + a.id + '|' + a.name));
  for (const tn of ['(open page)', ...tabNames, 'Display Options']) {
    if (tn === 'Display Options') {
      // no tab of its own — page through with Next until the Minimap twins are on screen (the 2.5.5 equivalents live there)
      await pan.evaluate(() => { const g = window.welcomeGuide; for (let i = 0; i < 24; i++) { const b = document.querySelector('#welcome-guide-overlay .wg-mm-btn'); if (b && b.getBoundingClientRect().width > 0) break; g.nextSlide(); } });
      await sleep(400);
    } else if (tn !== '(open page)') { await pan.evaluate(n => { const t = [...document.querySelectorAll('#welcome-guide-overlay .wg-tab')].find(x => (x.textContent || '').trim() === n); if (t) t.click(); }, tn); await sleep(350); }
    const gRows = await pan.evaluate(MEASURE);
    gRows.forEach(r => { const k = 'panels|' + r.id + '|' + r.name; if (seen.has(k)) return; seen.add(k); r.frame = 'guide:' + tn.slice(0, 10); all.push(r); });
  }
  const say = (label, list) => { if (CENSUS && list.length) { console.log(`  -- ${label} (${list.length})`); list.forEach(r => console.log(`     ${r.frame}\t${r.id}\t"${r.name}"\t${r.w}×${r.h}${r.viaLabel ? ' (label)' : ''}${r.viaExt ? ' (ext)' : ''}\tring ${r.ringW}px @${r.ringContrast}:1\tcovered ${r.covered}`)); } };
  console.log(`  measured ${all.length} focusable, visible, hittable controls (${frames.map(([n]) => n).join('/')}/guide)`);

  // 2.4.13
  const badRing = all.filter(r => r.focused && (r.ringW < 2 || r.ringContrast < 3));
  say('2.4.13 focus ring < 2px or < 3:1', badRing);
  ok(badRing.length === 0, `2.4.13 Focus Appearance: every focused control shows a ≥2px ring at ≥3:1 (${all.length - badRing.length}/${all.length}; misses ${badRing.length})`);
  // 2.5.5 — misses that are not inline text links
  // WCAG 2.5.5 "Equivalent" exception — the same function is available through a ≥44px control on the same page. Claimed per
  // element and PROVED here: the equivalent must itself measure ≥44 in this run, or the exception does not apply.
  const EQUIV = [
    [/^button\.wg-dot/, /^button\.wg-nav-btn/, 'page dots → Prev/Next buttons'],
    [/^button\.pip-zoom-btn/, /^button\.wg-mm-btn\.wg-mm-zoom/, 'minimap ± in the moondial → Display Options → Minimap zoom'],
    [/^button\.pip-persp-btn/, /^button\.wg-mm-btn\.wg-mm-view/, 'minimap view presets in the moondial → Display Options → Minimap view'],
  ];
  const big = r => r.w >= 44 && r.h >= 44;
  const equivOk = r => { const e = EQUIV.find(([a]) => a.test(r.id)); if (!e) return null; const twins = all.filter(x => e[1].test(x.id)); return twins.length && twins.every(big) ? e[2] : false; };
  const small = all.filter(r => !r.inline && !big(r) && !equivOk(r));
  const claimed = all.filter(r => !r.inline && !big(r) && equivOk(r));
  if (claimed.length) console.log('  2.5.5 equivalent-exception claimed and proved for ' + claimed.length + ' controls: ' + [...new Set(claimed.map(r => equivOk(r)))].join(' · '));
  say('2.5.5 target < 44×44', small);
  ok(small.length === 0, `2.5.5 Target Size (Enhanced): every non-inline control ≥ 44×44 CSS px (misses ${small.length}${small.length ? ": " + small.slice(0, 8).map(x => (x.frame || "") + " " + (x.sel || x.id || JSON.stringify(x)).toString().slice(0, 60) + " " + (x.w || "") + "×" + (x.h || "")).join("; ") : ""})`);
  // 2.4.12
  const cov = all.filter(r => r.focused && r.covered > 0);
  say('2.4.12 focused control partly covered', cov);
  ok(cov.length === 0, `2.4.12 Focus Not Obscured (Enhanced): no focused control has any corner under another element (misses ${cov.length})`);
  // 2.4.10 — guidebook pages: each has a heading before its prose
  const pages = await pan.evaluate(() => {
    const g = window.welcomeGuide; const ids = (g && g._pages) ? Object.keys(g._pages) : [];
    const res = [];
    const root = document.getElementById('welcome-guide-overlay');
    const tabs = [...root.querySelectorAll('.wg-tab, [role="tab"]')];
    for (const t of tabs) { if (!(t.textContent || '').trim()) continue; t.click(); const pane = root.querySelector('.wg-slide.active') || root; const h = pane.querySelector('h1,h2,h3,h4'); const p = pane.querySelector('p'); res.push({ tab: (t.textContent || '').trim().slice(0, 24), heading: h ? h.textContent.trim().slice(0, 40) : null, prose: !!p, headingFirst: !!(h && p && (h.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING)) }); }
    return { ids, res };
  });
  const noHead = pages.res.filter(p => p.prose && !p.headingFirst);
  if (CENSUS) pages.res.forEach(p => console.log(`     tab "${p.tab}" → heading ${JSON.stringify(p.heading)} prose ${p.prose} headingFirst ${p.headingFirst}`));
  ok(pages.res.length > 3 && noHead.length === 0, `2.4.10 Section Headings: every guidebook tab with prose opens with a heading (${pages.res.length} tabs, misses ${noHead.length})`);
  // 2.4.9
  const links = [];
  for (const [nm, f] of frames) { const l = await f.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => a.getBoundingClientRect().width > 0).map(a => ({ href: a.getAttribute('href'), name: (a.getAttribute('aria-label') || a.title || a.textContent || '').trim().replace(/\s+/g, ' ') }))); l.forEach(x => { x.frame = nm; links.push(x); }); }
  const badLink = links.filter(l => !l.name || /^(here|click|link|read more|more)$/i.test(l.name));
  say('2.4.9 link without a purpose in its own text', badLink.map(l => ({ frame: l.frame, id: l.href, name: l.name, w: 0, h: 0, ringW: 0, ringContrast: 0, covered: 0 })));
  ok(badLink.length === 0, `2.4.9 Link Purpose (Link Only): ${links.length} visible links, every one named by its own text (misses ${badLink.length})`);
  // 2.3.3 — in-app Reduce motion → every frame calmed
  await pan.evaluate(() => { window.welcomeGuide.hide && window.welcomeGuide.hide(); const cb = document.getElementById('wg-reduced-motion'); if (cb && !cb.checked) { cb.click(); } else if (window.welcomeGuide._setA11yPref) window.welcomeGuide._setA11yPref('reducedMotion', true); });
  await sleep(600);
  const rm = {};
  for (const [nm, f] of frames) rm[nm] = await f.evaluate(() => {
    const cls = document.documentElement.classList.contains('a11y-reduced-motion');
    // sample: the first element that declares a keyframe animation or a transition in its computed style
    let sample = null;
    for (const el of document.querySelectorAll('body *')) { const cs = getComputedStyle(el); if (cs.animationName !== 'none' || (cs.transitionDuration && cs.transitionDuration !== '0s')) { sample = { tag: el.tagName + (el.id ? '#' + el.id : ''), anim: cs.animationDuration, trans: cs.transitionDuration }; break; } }
    const calm = !sample || (parseFloat(sample.anim) <= 0.002 && (sample.trans.split(',').every(t => parseFloat(t) <= 0.002)));
    return { cls, sample, calm };
  });
  console.log('  reduce-motion per frame', JSON.stringify(rm));
  ok(Object.values(rm).every(v => v.cls && v.calm), `2.3.3 Animation from Interactions: the in-app Reduce motion pref stamps a11y-reduced-motion on shell + panels + engine and their sampled animations read ~0 duration`);
  // 7. the twins work — same rail as the moondial buttons
  await pan.evaluate(() => { window.welcomeGuide.show({ browse: true }); const g = window.welcomeGuide; for (let i = 0; i < 24; i++) { const b = document.querySelector('#welcome-guide-overlay .wg-mm-btn'); if (b && b.getBoundingClientRect().width > 0) break; g.nextSlide(); } });
  await sleep(400);
  await page.evaluate(() => { window.__pipMsgs = []; window.addEventListener('message', e => { if (e.data && (e.data.type === 'PIP_ZOOM' || e.data.type === 'PIP_PERSPECTIVE')) window.__pipMsgs.push(e.data); }); });
  await pan.evaluate(() => { document.querySelector('#welcome-guide-overlay .wg-mm-btn[data-mm="zoom-in"]').click(); document.querySelector('#welcome-guide-overlay .wg-mm-btn[data-mm="flat"]').click(); });
  await sleep(500);
  const twin = { msgs: await page.evaluate(() => window.__pipMsgs), live: await pan.evaluate(() => ({ flatActive: !!document.querySelector('.pip-persp-btn[data-preset="flat"].active'), topdown: document.body.classList.contains('topdown-mode'), pressed: document.querySelector('#welcome-guide-overlay .wg-mm-btn[data-mm="flat"]').getAttribute('aria-pressed') })) };
  console.log('  minimap twins', JSON.stringify(twin));
  ok(twin.msgs.some(m => m.type === 'PIP_ZOOM' && m.delta === -1) && twin.msgs.some(m => m.type === 'PIP_PERSPECTIVE' && m.preset === 'flat') && twin.live.flatActive && twin.live.topdown && twin.live.pressed === 'true',
     '7: Display Options → Minimap twins drive the moondial (PIP_ZOOM delta -1 reached the shell; Top-down → real button active + topdown-mode + aria-pressed)');
  await pan.evaluate(() => { const b = document.querySelector('#welcome-guide-overlay .wg-mm-btn[data-mm="iso"]'); if (b) b.click(); });
  await browser.close();
  console.log(fails ? `\n  FAIL ${fails}` : '\n  PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('  ❌ crashed:', e && e.message || e); process.exit(2); });
