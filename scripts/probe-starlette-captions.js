/**
 * Starlette bilingual-caption falsifier.
 * Verifies both supplied SRTs are fetched by the production parser and that
 * each audio part resolves captions against its own local clock.
 */
const { chromium } = require('playwright');

const URL_ = 'http://127.0.0.1:5501/OrigamiUnderworld.html';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 220)));
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
  const engine = page.frames().find(frame => /Engine9\.html/.test(frame.url()));
  if (!engine) throw new Error('engine frame not found');
  await engine.waitForFunction(() => window._cabaretCaptionReady !== undefined, null, { timeout: 30000 });
  const result = await engine.evaluate(async () => {
    const ready = await window._cabaretCaptionReady;
    const one = window._cabaretCaptionCues?.['Starlette-EDM黄泉の宿-1.mp3'] || [];
    const two = window._cabaretCaptionCues?.['Starlette-EDM黄泉の宿-2.mp3'] || [];
    const atOne = window._cabaretCaptionAt?.('Starlette-EDM黄泉の宿-1.mp3', 20);
    const atTwo = window._cabaretCaptionAt?.('Starlette-EDM黄泉の宿-2.mp3', 20);
    return {
      ready,
      counts: [one.length, two.length],
      first: [one[0]?.jp, one[0]?.en],
      last: [two.at(-1)?.jp, two.at(-1)?.en],
      atOne: [atOne?.jp, atOne?.en, atOne?.start, atOne?.end],
      atTwo: [atTwo?.jp, atTwo?.en, atTwo?.start, atTwo?.end],
      continuation: window._cabSetContinuation?.['./assets/sounds/BG-OLD/Starlette-EDM黄泉の宿-1.mp3'],
    };
  });
  const failures = [];
  if (result.ready !== true) failures.push('SRT assets did not load');
  if (result.counts?.[0] !== 6 || result.counts?.[1] !== 15) failures.push(`cue counts ${JSON.stringify(result.counts)} != [6,15]`);
  if (!result.first?.[0] || !result.first?.[1] || !result.last?.[0] || !result.last?.[1]) failures.push('JP/EN text missing at transcript edges');
  if (!result.atOne?.[0] || !result.atTwo?.[0]) failures.push('local caption lookup failed for one or both parts');
  if (result.continuation !== './assets/sounds/BG-OLD/Starlette-EDM黄泉の宿-2.mp3') failures.push('audio continuation mapping missing');
  if (pageErrors.length) failures.push(`${pageErrors.length} page error(s)`);

  console.log('\n══ STARLETTE BILINGUAL CAPTIONS ══\n');
  console.log(`  assets ready: ${result.ready} · cues: ${(result.counts || []).join(' + ')}`);
  console.log(`  part 1 @20s: ${result.atOne?.[0] || '(none)'} / ${result.atOne?.[1] || '(none)'}`);
  console.log(`  part 2 @20s: ${result.atTwo?.[0] || '(none)'} / ${result.atTwo?.[1] || '(none)'}`);
  console.log(`  continuation: ${result.continuation || '(missing)'}`);
  console.log('\n  VERDICT: ' + (failures.length ? '✗ FALSIFIED' : '✓ SURVIVES'));
  for (const failure of failures) console.log('    - ' + failure);
  console.log(`  pageerrors: ${pageErrors.length}\n`);
  await browser.close();
  process.exitCode = failures.length ? 1 : 0;
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
