#!/usr/bin/env node
/* FALSIFY: Settings hub restructuring — verify tabs, music toggle, navigation (2026-08-08) */
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const b = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));

    await p.goto('http://127.0.0.1:5501/OrigamiUnderworld.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.__engineReady === true, null, { timeout: 120000 });
    await sleep(10000);

    const pan = p.frames().find(f => /Panels\.html/.test(f.url()));
    if (!pan) { console.log('FAIL: no panels frame'); await b.close(); return; }

    const r = await pan.evaluate(async () => {
        const out = { passed: [], failed: [] };

        // 1. Settings Hub accessible
        if (!window.welcomeGuide || typeof window.welcomeGuide.SETTINGS_HUB_SLIDE !== 'number') {
            out.failed.push('SETTINGS_HUB_SLIDE not found');
        } else {
            out.passed.push(`SETTINGS_HUB_SLIDE = ${window.welcomeGuide.SETTINGS_HUB_SLIDE}`);
        }

        // 2. Open settings hub
        try {
            window.openSettingsHub();
            await new Promise(r => setTimeout(r, 500));
            out.passed.push('openSettingsHub() succeeded');
        } catch (e) {
            out.failed.push('openSettingsHub() threw: ' + e.message);
        }

        // 3. Check current slide
        const curSlide = window.welcomeGuide ? window.welcomeGuide.currentSlide : null;
        const expected = window.welcomeGuide ? window.welcomeGuide.SETTINGS_HUB_SLIDE : null;
        if (curSlide === expected) {
            out.passed.push(`Current slide = ${curSlide} (Settings Hub)`);
        } else {
            out.failed.push(`Current slide ${curSlide} ≠ expected ${expected}`);
        }

        // 4. Tab bar structure — check for dividers
        const tabs = Array.from(document.querySelectorAll('.wg-tab, .wg-tab-divider'));
        const dividerCount = Array.from(document.querySelectorAll('.wg-tab-divider')).length;
        out.passed.push(`Tab bar: ${tabs.length} items (${dividerCount} dividers)`);

        // 5. Settings CTA buttons exist
        const settingsCTAs = document.querySelectorAll('.wg-settings-cta');
        if (settingsCTAs.length > 0) {
            out.passed.push(`Found ${settingsCTAs.length} settings CTAs`);
        } else {
            out.failed.push('No settings CTA buttons found');
        }

        // 6. Music Settings toggle exists
        const musicToggle = document.querySelector('#wg-bg-music-enable');
        if (musicToggle) {
            out.passed.push('Music toggle checkbox found');

            // 7. Toggle the checkbox and verify _bgMusicEarned is set
            musicToggle.checked = true;
            musicToggle.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 100));

            if (window._bgMusicEarned === true) {
                out.passed.push('Music toggle sets window._bgMusicEarned = true');
            } else {
                out.failed.push(`Music toggle did not set _bgMusicEarned (got ${window._bgMusicEarned})`);
            }
        } else {
            out.failed.push('Music toggle checkbox #wg-bg-music-enable not found');
        }

        // 8. Navigate via Settings CTA
        const musicSettingsCTA = Array.from(settingsCTAs).find(b => b.textContent.includes('Music'));
        if (musicSettingsCTA) {
            const targetSlide = parseInt(musicSettingsCTA.dataset.slide, 10);
            try {
                window.welcomeGuide.setSlide(targetSlide);
                await new Promise(r => setTimeout(r, 300));
                if (window.welcomeGuide.currentSlide === targetSlide) {
                    out.passed.push(`Settings CTA navigation works (→ slide ${targetSlide})`);
                } else {
                    out.failed.push(`Settings CTA navigation failed`);
                }
            } catch (e) {
                out.failed.push('Settings CTA navigation threw: ' + e.message);
            }
        }

        // 9. Slide indices are correct
        const slideChecks = [
            ['SETTINGS_HUB_SLIDE', 13],
            ['MUSIC_SETTINGS_SLIDE', 14],
            ['AUDIO_SETTINGS_SLIDE', 15],
            ['DISPLAY_SETTINGS_SLIDE', 16]
        ];
        slideChecks.forEach(([name, expected]) => {
            const actual = window.welcomeGuide[name];
            if (actual === expected) {
                out.passed.push(`${name} = ${actual} ✓`);
            } else {
                out.failed.push(`${name} = ${actual}, expected ${expected}`);
            }
        });

        return out;
    });

    console.log('\n=== SETTINGS HUB FALSIFICATION ===');
    console.log(`\nPASSED (${r.passed.length}):`);
    r.passed.forEach(p => console.log(`  ✓ ${p}`));

    if (r.failed.length > 0) {
        console.log(`\nFAILED (${r.failed.length}):`);
        r.failed.forEach(f => console.log(`  ✗ ${f}`));
    }

    console.log(`\npageerrors: ${errs.length ? errs : 'none'}`);
    console.log(`\n${r.failed.length === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    await b.close();
})();
