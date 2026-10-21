#!/usr/bin/env node
/**
 * probe-low-speed-profile.js — verifies the fixed, player-selected Low Speed renderer preset.
 *
 * Requires the local game server (default http://127.0.0.1:5501). This is intentionally a
 * configuration probe, not an FPS benchmark: headless timing cannot prove on-device playability.
 * It proves that both a live switch and a fresh saved-mode boot apply the same bounded render work.
 *
 * Usage: node scripts/probe-low-speed-profile.js
 *        ORIGAMI_URL=http://127.0.0.1:5501 node scripts/probe-low-speed-profile.js
 *        ORIGAMI_EMULATE_MOBILE=1 node scripts/probe-low-speed-profile.js
 *        ORIGAMI_EMULATE_MOBILE=1 ORIGAMI_MOBILE_TIER=premium node scripts/probe-low-speed-profile.js
 */
const { chromium } = require('playwright');

const BASE_URL = (process.env.ORIGAMI_URL || 'http://127.0.0.1:5501').replace(/\/$/, '');
const ENTRY_URL = `${BASE_URL}/OrigamiUnderworld.html`;
const BASE_ORIGIN = new URL(BASE_URL).origin;
const EMULATE_MOBILE = process.env.ORIGAMI_EMULATE_MOBILE === '1';
const MOBILE_TIER_OVERRIDE = process.env.ORIGAMI_MOBILE_TIER || null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForEngine(page) {
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  const frame = page.frames().find(f => /Engine9\.html/.test(f.url()));
  assert(frame, 'Engine9 iframe was not found');
  // The shell's ready flag precedes the engine's asset/bootstrap completion. Wait for the actual
  // single RAF loop as well, otherwise Panels can still overwrite the requested mode with its
  // initial saved setting and no PiP frame exists to measure.
  await frame.waitForFunction(() =>
    typeof window._setPipRenderTargetSize === 'function' && typeof window._engineLoopT0 === 'number',
  null, { timeout: 120000 });
  return frame;
}

async function waitForPanels(page, { requireVisible = true } = {}) {
  const frame = page.frames().find(f => /Panels\.html/.test(f.url()));
  assert(frame, 'Panels iframe was not found');
  await frame.waitForSelector('.perf-settings-btn', {
    state: requireVisible ? 'visible' : 'attached',
    timeout: 60000,
  });
  return frame;
}

async function perfControlState(panelFrame) {
  return panelFrame.locator('.perf-settings-btn').evaluate(el => {
    const header = el.closest('.perf-header');
    const monitor = document.getElementById('aaa-perf-monitor');
    const rect = el.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      visible: !!(rect.width && rect.height && getComputedStyle(el).visibility !== 'hidden' &&
        getComputedStyle(el).display !== 'none' && (!header || getComputedStyle(header).display !== 'none')),
      buttonDisplay: getComputedStyle(el).display,
      headerDisplay: header ? getComputedStyle(header).display : null,
      monitorDisplay: monitor ? getComputedStyle(monitor).display : null,
      pointerEvents: getComputedStyle(el).pointerEvents,
      topAtCenter: top ? { tag: top.tagName, id: top.id || '', className: typeof top.className === 'string' ? top.className : '' } : null,
      rect: { width: rect.width, height: rect.height },
    };
  });
}

async function dismissGuideIfOpen(panelFrame) {
  // The welcome guide is a legitimate modal and must sit above every HUD control while onboarding.
  // Put the probe into the same post-guide gameplay state in which a player can adjust graphics; do
  // not synthesize a profile message or mutate renderer state directly.
  const dismissed = await panelFrame.evaluate(() => {
    const overlay = document.getElementById('welcome-guide-overlay');
    if (!overlay || !overlay.classList.contains('is-open')) return false;
    const guide = window.playerGuide || window.welcomeGuide;
    if (!guide || typeof guide.hide !== 'function') throw new Error('welcome guide is open but has no hide() API');
    guide.hide({ isFromLoad: true });
    return true;
  });
  if (dismissed) {
    await panelFrame.waitForFunction(() => !document.getElementById('welcome-guide-overlay')?.classList.contains('is-open'),
      null, { timeout: 10000 });
  }
}

async function toggleProfile(panelFrame, targetMode) {
  const label = panelFrame.locator('.perf-settings-btn span');
  const targetLabel = targetMode === 'low' ? 'LOW SPEED' : 'AAA (120)';
  const before = (await label.textContent() || '').trim();
  if (before !== targetLabel) {
    const control = panelFrame.locator('.perf-settings-btn');
    if (EMULATE_MOBILE) await control.tap({ force: true });
    else await control.click({ force: true });
  }
  await label.waitFor({ state: 'visible', timeout: 10000 });
  await panelFrame.waitForFunction(expected =>
    (document.querySelector('.perf-settings-btn span')?.textContent || '').trim() === expected,
  targetLabel, { timeout: 10000 });
  // Four PiP ticks are enough to observe the Low Speed cadence without making the test slow.
  await sleep(targetMode === 'low' ? 1100 : 250);
}

async function snapshot(frame) {
  return frame.evaluate(() => ({
    profile: window._graphicsProfile,
    low: window._lowSpeedProfile === true,
    dpr: typeof renderer !== 'undefined' ? renderer.getPixelRatio() : null,
    shadows: typeof renderer !== 'undefined' ? renderer.shadowMap.enabled : null,
    preserveDrawingBuffer: typeof renderer !== 'undefined'
      ? renderer.getContext().getContextAttributes().preserveDrawingBuffer
      : null,
    pipRtSize: window._pipRtSizeActive,
    pipFps: window._pipFps,
    pipCadenceHz: window._lastPipCadenceHz,
    pipForceTopDown: window._pipForceTopDown === true,
    pipDepth1: window._pipDepth1 === true,
    pipRoomPlus1: window._pipRoomPlus1 === true,
    monsterBloom: window._monsterBloom,
    mobile: window._mobileGpuProfile === true,
    mobileVisualTier: window._mobileVisualTier,
    mobilePremiumVisuals: window._mobilePremiumVisuals === true,
    mobileCapability: window._mobileCapabilitySnapshot || null,
    mobileTexCap: window._mobileTexCap,
    sucCircleRes: window._sucCircleRes,
    configuredPipRtSize: window._pipRtSize,
    mobileSignals: {
      maxTouchPoints: navigator.maxTouchPoints || 0,
      coarsePointer: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
      screen: { width: window.screen.width, height: window.screen.height },
    },
    maxDpr: Math.min(window.devicePixelRatio || 1, 2),
    pipDisabled: window._pipDisabled === true,
    loopStarted: typeof window._engineLoopT0 === 'number',
    smoothedFps: window._smoothedFps || 0,
  }));
}

(async () => {
  assert(!MOBILE_TIER_OVERRIDE || ['balanced', 'premium'].includes(MOBILE_TIER_OVERRIDE),
    `ORIGAMI_MOBILE_TIER must be balanced or premium, received ${MOBILE_TIER_OVERRIDE}`);
  assert(!MOBILE_TIER_OVERRIDE || EMULATE_MOBILE,
    'ORIGAMI_MOBILE_TIER is only valid with ORIGAMI_EMULATE_MOBILE=1');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist',
      '--disable-gpu-vsync', '--disable-frame-rate-limit',
      '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
    ],
  });
  const errors = [];
  try {
    // Exercise a 2× desktop or iPhone-like 3× touch context. In both cases Low Speed must
    // visibly reduce rendering to 1×, while AAA restores the engine's capped 2× maximum.
    // The phone profile is selected solely by browser touch/coarse-pointer/screen signals;
    // the probe does not inject or override any application graphics state.
    const deviceProfile = EMULATE_MOBILE
      ? {
          viewport: { width: 390, height: 844 },
          screen: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        }
      : {
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 2,
        };
    const context = await browser.newContext({
      ...deviceProfile,
      // Seed exactly the durable user preference, then load once. This proves the cold-boot
      // path without reloading a WebGL-heavy page in the middle of the UI relay test.
      storageState: {
        cookies: [],
        origins: [{
          origin: BASE_ORIGIN,
          localStorage: [{ name: 'origami_perf_mode', value: 'low' }],
        }],
      },
    });
    if (MOBILE_TIER_OVERRIDE) {
      // Test only: set the public pre-boot QA override before every frame document starts. It does
      // not inject a render setting or message; the engine still performs its normal static tier setup.
      await context.addInitScript(tier => { window._mobileVisualTierOverride = tier; }, MOBILE_TIER_OVERRIDE);
    }
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error.message)));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(ENTRY_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const engine = await waitForEngine(page);
    const panels = await waitForPanels(page, { requireVisible: !EMULATE_MOBILE });
    await dismissGuideIfOpen(panels);
    await sleep(1100);

    const savedLowBoot = await snapshot(engine);
    const savedBootLabel = (await panels.locator('.perf-settings-btn span').textContent() || '').trim();
    const controlState = await perfControlState(panels);
    console.log('[low-speed-profile] saved boot:', JSON.stringify(savedLowBoot));
    console.log('[low-speed-profile] perf control:', JSON.stringify(controlState));
    assert(savedLowBoot.profile === 'low' && savedLowBoot.low, 'saved Low Speed mode was not restored at boot');
    assert(savedLowBoot.dpr === 1 && savedLowBoot.shadows === false,
      'saved Low Speed boot did not apply DPR/shadow reductions');
    assert(savedLowBoot.pipRtSize === 160 && savedLowBoot.pipFps === 4,
      'saved Low Speed boot did not apply the 160px/4Hz PiP budget');
    assert(Math.abs(savedLowBoot.pipCadenceHz - 4) < 0.01,
      `saved Low Speed boot cadence should be 4Hz, received ${savedLowBoot.pipCadenceHz}`);
    assert(savedLowBoot.preserveDrawingBuffer === false,
      'saved Low Speed boot did not disable preserveDrawingBuffer for the new WebGL context');
    assert(savedBootLabel === 'LOW SPEED', `saved Low Speed boot label should be LOW SPEED, received ${savedBootLabel}`);
    if (EMULATE_MOBILE) {
      assert(savedLowBoot.mobile,
        `phone emulation did not activate the mobile GPU profile: ${JSON.stringify(savedLowBoot.mobileSignals)}`);
      assert(savedLowBoot.mobileSignals.coarsePointer || savedLowBoot.mobileSignals.maxTouchPoints > 1,
        `phone emulation did not expose a mobile touch/coarse signal: ${JSON.stringify(savedLowBoot.mobileSignals)}`);
      assert(controlState.visible,
        `Low Speed is not reachable on phone viewport: ${JSON.stringify(controlState)}`);
      if (MOBILE_TIER_OVERRIDE) {
        assert(savedLowBoot.mobileVisualTier === MOBILE_TIER_OVERRIDE,
          `mobile tier override did not apply: ${JSON.stringify(savedLowBoot.mobileCapability)}`);
      }
    }

    // Use the real HUD relay in both directions; no direct message injection.
    await toggleProfile(panels, 'aaa');
    const aaa = await snapshot(engine);
    console.log('[low-speed-profile] AAA restore:', JSON.stringify(aaa));
    assert(aaa.profile === 'aaa' && !aaa.low, 'AAA restore did not clear Low Speed profile');
    assert(aaa.dpr === aaa.maxDpr, `AAA did not restore DPR ${aaa.maxDpr}; received ${aaa.dpr}`);
    const expectedAaaPipRt = aaa.mobilePremiumVisuals ? 384 : 320;
    assert(aaa.pipRtSize === expectedAaaPipRt,
      `AAA did not restore the ${expectedAaaPipRt}px PiP target; received ${aaa.pipRtSize}`);
    assert(aaa.pipFps === 30, `AAA did not restore the 30Hz PiP setting; received ${aaa.pipFps}`);
    assert(!aaa.pipForceTopDown, 'AAA left the PiP forced to top-down');
    assert(aaa.monsterBloom === true, 'AAA did not restore the normal monster glow after a Low Speed boot');
    assert(aaa.shadows === (!aaa.mobile || aaa.mobilePremiumVisuals),
      aaa.mobile && !aaa.mobilePremiumVisuals
        ? 'AAA incorrectly restored shadow maps on the balanced phone profile'
        : 'AAA did not restore shadow maps on the premium/desktop profile');
    if (aaa.mobilePremiumVisuals) {
      assert(aaa.mobileTexCap === 2048 && aaa.sucCircleRes === 2048 && aaa.configuredPipRtSize === 384,
        `premium phone visual assets were not configured: ${JSON.stringify(aaa)}`);
    }

    await toggleProfile(panels, 'low');
    const liveLow = await snapshot(engine);
    console.log('[low-speed-profile] live switch:', JSON.stringify(liveLow));
    assert(liveLow.profile === 'low' && liveLow.low, 'live Low Speed switch did not set the profile');
    assert(liveLow.dpr === 1, `Low Speed DPR should be 1, received ${liveLow.dpr}`);
    assert(liveLow.shadows === false, 'Low Speed left shadows enabled');
    assert(liveLow.pipRtSize === 160, `Low Speed PiP target should be 160px, received ${liveLow.pipRtSize}`);
    assert(liveLow.pipFps === 4, `Low Speed PiP target should be 4Hz, received ${liveLow.pipFps}`);
    assert(Math.abs(liveLow.pipCadenceHz - 4) < 0.01,
      `Low Speed PiP cadence should be 4Hz, received ${liveLow.pipCadenceHz}`);
    assert(liveLow.pipForceTopDown && liveLow.pipDepth1 && liveLow.pipRoomPlus1,
      'Low Speed PiP did not enforce top-down, depth-1, room-plus-one culling');
    assert(liveLow.monsterBloom === false, 'Low Speed left monster bloom sprites enabled');
    assert(await page.evaluate(() => localStorage.getItem('origami_perf_mode')) === 'low',
      'HUD Low Speed selection was not persisted to Local Storage');

    const relevantErrors = errors.filter(message => /sendPipFrame|LOW_SPEED_PIP_RESIZE|ReferenceError/i.test(message));
    assert(relevantErrors.length === 0, `renderer errors during profile test: ${relevantErrors.join(' | ')}`);

    console.log('[low-speed-profile] PASS');
    console.log(JSON.stringify({ liveLow, aaa, savedLowBoot }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('[low-speed-profile] FAIL:', error.stack || error);
  process.exitCode = 1;
});
