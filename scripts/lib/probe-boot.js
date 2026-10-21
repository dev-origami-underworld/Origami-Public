/**
 * probe-boot.js — the shared boot gate. AI 2, 2026-08-10.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────────
 * Measured at HEAD fcb8428, three boots, headless and headed:
 *
 *     window.__engineReady === true   at  ~2.2 s
 *     window._loopStarted  === true   at ~12.9 s      <- a ~10.7 SECOND GAP
 *
 * `__engineReady` fires early. `startLoop()` is the LAST thing the boot sequence
 * does (Engine9 ~:45911), after segment staging, the lazy drain (10/10) and the
 * prewarm ladder. In between, the engine renders but `loop()` has never been
 * called: `v8Clock.tick` never runs, so NOTHING inside it is live — heal-over-time,
 * combat, monster AI, timers, karma, permits, the whole tick body.
 *
 * Every probe in this repo waits on `__engineReady` and then measures. Any of them
 * asserting tick-dependent behaviour has been reading a game that had not started.
 * That is how a 6-second GOHAN meal measured 0 HP of healing and looked like a bug
 * in GOHAN. It was a bug in the harness.
 *
 * ⚠ CORRECTION, recorded on purpose: AI 2 first reported this as "loop() NEVER
 * runs" after waiting only 2 s. That was wrong — it runs at ~12.9 s. The defect is
 * the WAIT, not the engine. Kept here because the wrong version reached a commit
 * message and the other seat, and the next reader deserves the retraction next to
 * the fact.
 *
 * ── USE ────────────────────────────────────────────────────────────────────────
 *     const { bootAndStart } = require('./lib/probe-boot');
 *     const { page, eng, timings } = await bootAndStart(browser);
 *     // from here, v8Clock.tick is live and tick-dependent assertions are valid
 *
 * Anything that measures gameplay MUST come through here. Anything that measures
 * only renderer-side counts (programs, lights, draws) may use `__engineReady`, but
 * should say so explicitly.
 */

const DEFAULT_URL = process.env.PROBE_URL || 'http://127.0.0.1:5501/OrigamiUnderworld.html';

/**
 * Boot the game and return only once the game LOOP is actually running.
 *
 * @returns {{page, eng, timings:{readyMs:number, loopMs:number, gapMs:number}, pageerrors:string[]}}
 * @throws if the loop never starts — a timeout here is a real failure, never something to swallow.
 */
async function bootAndStart(browser, opts = {}) {
  const {
    url = DEFAULT_URL,
    viewport = { width: 1280, height: 800 },
    deviceScaleFactor = 1,
    readyTimeout = 120000,
    // Generous on purpose: measured ~12.9s on an idle machine, and a probe run that
    // overlaps another headless Chrome or a Live-Server save is far slower. A false
    // timeout here would send the next reader hunting a boot bug that is not there.
    loopTimeout = 180000,
    // ⭐ THE WELCOME DIALOG IS SUPPRESSED BY DEFAULT, AND THIS IS A CURE, NOT A CONVENIENCE.
    //   MEASURED 2026-09-04 and confirmed by eye on a screenshot: this library did NOT set
    //   `origami_tc_accepted`, only individual probes did — so EVERY probe booting through the bare
    //   lib has been measuring the game through a full-screen WELCOME TRAVELER dialog with the T&C
    //   unchecked. The `click(640,400) + Shift` ritual performed across this fleet does NOT dismiss it
    //   (measured: the overlay was still showing after it). THE FLAG IS THE MECHANISM; THE CLICK WAS
    //   ALWAYS CARGO. Setting it here fixes every caller at once instead of each one remembering.
    //   Set `acceptTerms: false` to test the welcome flow ITSELF — that is the only reason to.
    //   ⚠ NOT DONE VIA localStorage: that flag is never read (see the dismissal block below).
    acceptTerms = true,
    // Opt out of the dialog assertion below. Only for a probe that intends to run with one up.
    allowOverlay = false,
  } = opts;

  const page = await browser.newPage({ viewport, deviceScaleFactor });
  const pageerrors = [];
  page.on('pageerror', e => pageerrors.push(e.message));
  // ── CONSOLE CAPTURE, ARMED BEFORE goto() ─────────────────────────────────────────────────────
  //   A probe that attaches its own console listener AFTER bootAndStart returns cannot see the boot
  //   — which is the only window most boot-time warnings live in. Measured 2026-09-04: an anomaly
  //   census reported "0 warnings on a clean boot" from a listener that had not been listening, and
  //   the run before it had shown render_overload and [POKER] warnings in exactly that window.
  //   ⚠ A ZERO FROM A LISTENER THAT WAS NOT LISTENING READS AS ABSENCE WHEN IT IS BLINDNESS.
  //   Attached here, beside pageerror and above the navigation, so `consoleLogs` covers the whole
  //   boot. Returned to every caller; existing callers ignoring it are unaffected.
  const consoleLogs = [];
  page.on('console', m => {
    try { consoleLogs.push({ type: m.type(), text: String(m.text()).slice(0, 400), t: Date.now() }); } catch (_) {}
  });

  const t0 = Date.now();
  await page.goto(url, { timeout: 60000 });

  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: readyTimeout });
  const readyMs = Date.now() - t0;

  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (!eng) throw new Error('boot gate: engine frame not found (Engine9.html)');

  // THE GATE. `_loopStarted` is set by startLoop() (Engine9 ~:69865) and is the only
  // honest "the game is running" signal the engine publishes.
  try {
    await eng.waitForFunction(() => window._loopStarted === true, null, { timeout: loopTimeout });
  } catch (e) {
    const diag = await eng.evaluate(() => ({
      loopStarted: window._loopStarted ?? null,
      lazyDone: window._lazyDrainDone ?? null,
      lazyTotal: window._lazyDrainTotal ?? null,
      prewarmPending: window._bootHitchPrewarmPending ?? null,
    })).catch(() => ({}));
    throw new Error(
      `boot gate: _loopStarted never became true within ${loopTimeout}ms. ` +
      `This is a real boot failure, not a slow machine — diag ${JSON.stringify(diag)}, ` +
      `pageerrors ${JSON.stringify(pageerrors.slice(0, 3))}`);
  }
  const loopMs = Date.now() - t0;

  // ── NO PROBE MEASURES THROUGH A DIALOG ────────────────────────────────────────────────────────
  //   Wired here only because `acceptTerms` above makes a healthy boot genuinely clear. Shipped inert
  //   first, on purpose: with the old baseline this assertion would have redded the entire fleet for
  //   the RIGHT reason and been reverted for the wrong one.
  // ── DISMISS THE WELCOME DIALOG THROUGH ITS OWN API ────────────────────────────────────────────
  //   ⛔⛔ `localStorage.origami_tc_accepted` IS CARGO — PlayerGuide NEVER READS IT. It appears once in
  //     that file, in a `removeItem` reset path, and there is no `getItem` for it anywhere. Every probe
  //     in this fleet sets it; it has never suppressed anything. Neither has the `click(640,400) +
  //     Shift` ritual (measured: overlay still showing after it). BOTH "dismissals" were decoration,
  //     which is why the dialog was up in runs everyone believed were clean.
  //   ⭐ THE REAL MECHANISM IS THE GUIDE'S OWN API: `window.playerGuide` (Panels ~:9379) with
  //     `acceptTC(true)` — which is what the T&C checkbox calls — then `hide()`. Using the object's own
  //     close path means this cannot drift from however the dialog decides to close.
  if (acceptTerms !== false) {
    const pan0 = page.frames().find(f => /Panels/.test(f.url()));
    if (pan0) {
      try {
        await pan0.evaluate(() => {
          try { if (window.playerGuide && window.playerGuide.acceptTC) window.playerGuide.acceptTC(true); } catch (_) {}
          try { if (window.playerGuide && window.playerGuide.hide) window.playerGuide.hide(); } catch (_) {}
        });
      } catch (_) {}
      await page.waitForTimeout(600);
    }
  }

  const overlay = await assertOverlayGone(page);
  if (!overlay.clear && !allowOverlay) {
    throw new Error('BOOT BLOCKED BY A DIALOG — ' + JSON.stringify(overlay) +
      '. A run taken through a dialog measures the dialog. Pass allowOverlay:true only if that is ' +
      'the intent, or acceptTerms:false if you are testing the welcome flow itself.');
  }

  return { page, eng, timings: { readyMs, loopMs, gapMs: loopMs - readyMs }, pageerrors, consoleLogs, overlay };
}

/**
 * Prove the tick is genuinely advancing, not merely that startLoop() was called.
 *
 * ⛔⛔ CORRECTED 2026-09-03 — THIS FUNCTION VERDICTED OFF `renderer.info.render.frame`, AND A MOVING
 *   FRAME COUNTER DOES NOT MEAN THE TICK IS RUNNING. This very file's header says the engine
 *   "renders but loop() has never been called": rendering and ticking are different loops, so the
 *   frame counter advances happily inside the 25-second dead window this module exists to keep
 *   probes out of. **The anti-stopped-clock helper could pass on a stopped clock**, and 28 probes
 *   trusted that verdict. Found while three seats chased phantom readings for a day; the honest
 *   signal (`_playerHot`, stamped every tick pass) was already being READ here and thrown away.
 *   MEASURED the same day: `ready 6231ms · loop 31218ms · gap 24987ms`, and this repo's own
 *   probe-boot-gate.js failing its claim C with `_playerHot._last NULL` printed directly beside
 *   `render frame 129 -> 196 · advancing: true`.
 *
 * ⚠ IT PLANTS A HEAL RECORD IF ONE IS ABSENT, and that is a deliberate mutation: without a live
 *   `_playerHot` there is nothing tick-stamped to watch, and a probe that cannot see the tick must
 *   say so rather than fall back to a signal that lies. It only plants when the field is empty.
 * ⚠ A CONSUMED RECORD COUNTS AS PROOF. The engine may clear `_playerHot` when the heal completes —
 *   something processed it, which is exactly what we are asking about.
 * `frameMoved` is still reported, as EVIDENCE, never as the verdict.
 */
async function assertTickAdvancing(eng, ms = 800) {
  await eng.evaluate(() => {
    if (!window._playerHot) {
      window._playerHot = { total: 1000, left: 1000, perMs: 1000 / 5000, frac: 0,
                            label: 'TICKPROOF', startedAt: performance.now() };
    }
  });
  const read = () => eng.evaluate(() => ({
    t0: window._engineLoopT0 ?? null,
    hot: window._playerHot ? (window._playerHot._last ?? null) : null,
    frac: window._playerHot ? (window._playerHot.frac ?? null) : null,
    cleared: window._playerHot == null,
    // THE STATE-INDEPENDENT WITNESS. `_delivery.ticks++` is the first statement of _tickDelivery
    // (Engine9 ~:30001), ahead of its own `_deliveryQuest === false` early return, and the tick body
    // calls it unconditionally (~:85406). It needs no plant, no damage, and no heal to be readable.
    ticks: (window._delivery && typeof window._delivery.ticks === 'number') ? window._delivery.ticks : null,
    frame: (window.renderer && window.renderer.info && window.renderer.info.render)
      ? window.renderer.info.render.frame : null,
  }));
  const a = await read();
  await eng.evaluate(d => new Promise(r => setTimeout(r, d)), ms);
  const b = await read();
  // ⚠ MEASURED 2026-09-04, four boots, alternating: the heal-record branches are HP-DEPENDENT and
  //   only ever ONE of them can fire. At full HP the engine nulls the planted record on the first
  //   pass, so `cleared` carries the verdict and `hot`/`frac` can never move; when damaged, the
  //   record survives and `cleared` can never fire. In 4/4 runs the verdict rode `cleared` alone —
  //   a verdict with one live branch is one engine change away from reading red on a healthy game.
  //   `ticksMoved` is OR-ed in as a third witness that depends on no player state at all. It can
  //   only widen the true-positives: the counter has exactly two writers, this tick and the explicit
  //   `_tickDeliveryOnce` stepper, so it cannot advance while the tick is stopped.
  const ticksMoved = typeof a.ticks === 'number' && typeof b.ticks === 'number' && b.ticks > a.ticks;
  const tickMoved = ticksMoved
    || b.cleared
    || (b.hot !== null && b.hot !== a.hot)
    || (typeof b.frac === 'number' && typeof a.frac === 'number' && b.frac > a.frac);
  const frameMoved = b.frame !== null && b.frame !== a.frame;
  const advancing = a.t0 !== null && tickMoved;
  return { advancing, tickMoved, ticksMoved, frameMoved, before: a, after: b };
}

/**
 * Prove no dialog is standing between the probe and the game.
 *
 * ⭐ SETTLED 2026-09-04 AND NOW WIRED INTO `bootAndStart`. It shipped INERT first, and that was the
 *   right call: three cuts each red-tested, and the third still read RED on what everyone believed was
 *   a healthy boot. The tie-breaker was a screenshot — the dialog WAS up. **The detector was honest in
 *   all three cuts; the "healthy boot" baseline was the lie.** Wiring it before `acceptTerms` existed
 *   would have redded the whole fleet for the right reason and been reverted for the wrong one.
 *   ⚠ THE DISCRIMINATION IT LACKED CAME FROM FIXING THE BASELINE, NOT THE DETECTOR — worth remembering
 *     the next time a check "over-reports": confirm what it is being compared against before tuning it.
 * ⚠ IT REPORTS WHICH BLOCKER, BY NAME. "Something is in the way" costs the next seat the same hour.
 * Returns { clear, guideOpen, modalOverlay } and throws only when `opts.throwOnBlocked` is set, so a
 * probe can choose between refusing and recording.
 */
async function assertOverlayGone(page, opts = {}) {
  let guideOpen = null;
  const eng = page.frames().find(f => /Engine9\.html/.test(f.url()));
  if (eng) {
    try { guideOpen = await eng.evaluate(() => window._guideOpen === true); } catch (_) {}
  }
  // ⛔ THE WELCOME DIALOG IS `#welcome-guide-overlay.is-open`, AND FINDING THAT COST A RED TEST.
  //   My first cut checked `window._guideOpen` and `#modal-overlay` and read CLEAR on a boot with the
  //   welcome dialog plainly up — so the guard would have shipped protecting nothing. The identity is
  //   PlayerGuide's own container (`containerId = 'welcome-guide-overlay'`, PlayerGuide.js ~:333) with
  //   the `is-open` class its open path adds. `_guideOpen` and `#modal-overlay` are KEPT as additional
  //   named blockers — they are real dialogs, just not this one.
  //   ⚠ CHECKED IN EVERY FRAME. PlayerGuide is referenced from all three documents, so a shell-only or
  //     panels-only lookup can miss the instance that is actually up.
  const named = { guideOpen, welcomeGuide: false, modalOverlay: false };
  // ⛔⛔ IDENTITY ALONE WAS NOT ENOUGH EITHER, AND THIS IS THE THIRD CUT. Checking only for
  //   `#welcome-guide-overlay.is-open` + computed style flagged a HEALTHY boot as blocked: the element
  //   carries `is-open` and is not display:none even when it is not in the way. That is the same
  //   over-reporting as my first attempt flagging `ui-viewport` — a different costume, same disease.
  //   ⭐ SO THE TEST IS IDENTITY *AND* EFFECT: the element must be NAMED (never "some overlay") AND
  //     must actually cover the viewport centre, via elementFromPoint. Both halves are load-bearing —
  //     identity alone flags inert dialogs, effect alone flags the game's own canvas.
  const blockingById = () => (
    (s, c) => {
      const el = document.querySelector(s);
      if (!el) return false;
      if (c && !el.classList.contains(c)) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const hit = document.elementFromPoint(Math.floor(innerWidth / 2), Math.floor(innerHeight / 2));
      return !!hit && (hit === el || el.contains(hit));
    }
  );
  const visibleById = blockingById;
  for (const f of page.frames()) {
    try {
      if (!named.welcomeGuide) named.welcomeGuide = await f.evaluate(visibleById(), ['#welcome-guide-overlay', 'is-open']);
    } catch (_) {}
    try {
      if (!named.modalOverlay) named.modalOverlay = await f.evaluate(visibleById(), ['#modal-overlay', null]);
    } catch (_) {}
  }
  const clear = named.guideOpen !== true && named.welcomeGuide !== true && named.modalOverlay !== true;
  if (!clear && opts.throwOnBlocked) {
    throw new Error('BLOCKED BY A DIALOG — ' +
      (named.guideOpen === true ? 'PlayerGuide reports open (window._guideOpen). ' : '') +
      (named.welcomeGuide === true ? '#welcome-guide-overlay.is-open is showing. ' : '') +
      (named.modalOverlay === true ? '#modal-overlay is visible. ' : '') +
      'Dismiss it before measuring; a run taken through a dialog measures the dialog.');
  }
  return { clear, ...named };
}

/**
 * Residency snapshot / re-check around a teleport.
 *
 * ⚠ THE LAW THIS ENFORCES, measured 2026-09-04: `window._tp` ORPHANS BODIES FROM SEGMENT RESIDENCY.
 *   Teleporting to a monster — even ONTO ITS OWN TILE — can leave it `parented:false, inArray:false`
 *   within ~2.5s, because the crossing retires its segment and `_unloadDungeonSegmentEntities` removes
 *   the wrapper from worldGroup. A probe then "fights" a body that has left the world: hp never moves
 *   and `hostilesNear` is CORRECTLY false. Three staging styles died this way before the cause was
 *   found, and any teleport-staged conclusion about MONSTER STATE is suspect until it is re-checked.
 * ⭐ THE FIX IS ORDERING, NOT AVOIDANCE: bind the target AFTER the settle, never across it. Take a
 *   snapshot, teleport, settle, then call the check — it names the bodies that left the world so the
 *   probe can re-pick instead of measuring a ghost.
 */
async function snapshotResidency(eng) {
  return eng.evaluate(() => (window.monsterWrappers || []).map(w => ({
    name: (w.userData && (w.userData.displayName || w.userData.name)) || '?',
    parented: !!w.parent,
  })));
}

async function assertResidencyIntact(eng, before, opts = {}) {
  const after = await eng.evaluate(() => ({
    live: (window.monsterWrappers || []).length,
    parented: (window.monsterWrappers || []).filter(w => !!w.parent).length,
  }));
  const lostLive = Math.max(0, (before || []).length - after.live);
  const intact = lostLive === 0 && after.parented === after.live;
  if (!intact && opts.throwOnLost) {
    throw new Error('RESIDENCY CHANGED ACROSS THE TELEPORT — live ' + (before || []).length +
      ' -> ' + after.live + ', parented ' + after.parented + '. Re-pick the target AFTER the settle; ' +
      'a body bound before the crossing may have left the world.');
  }
  return { intact, before: (before || []).length, after: after.live, parented: after.parented, lostLive };
}

module.exports = { bootAndStart, assertTickAdvancing, assertOverlayGone,
                   snapshotResidency, assertResidencyIntact, DEFAULT_URL };
