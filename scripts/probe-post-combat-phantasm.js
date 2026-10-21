#!/usr/bin/env node
/** Deterministic Composer falsifier for post-combat Phantasm + section-stable BG. */
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless:true });
    const page = await browser.newPage();
    try {
        const source = fs.readFileSync('js/v8/audio/Composer.js', 'utf8');
        const result = await page.evaluate(async (moduleSource) => {
            const url = URL.createObjectURL(new Blob([moduleSource], { type:'text/javascript' }));
            const { createComposer } = await import(url);
            URL.revokeObjectURL(url);
            class FakeAudio {
                constructor(){ this.src=''; this.currentSrc=''; this.loop=true; this.paused=true; this.volume=0; this.currentTime=0; this.duration=10; }
                load(){ this.currentSrc=this.src; }
                play(){ this.paused=false; return Promise.resolve(); }
                pause(){ this.paused=true; }
            }
            window._bgAfterCabaret = false;
            window._bgAfterCombat = './assets/sounds/BG-OLD/BG-Phantasm.mp3';
            window._bgMusicPool = ['section-0.mp3', 'section-1.mp3'];
            window._bgBySection = { 0:'section-0.mp3', 1:'section-1.mp3' };
            window._combatMinHoldMs = 0; window._combatTailMs = 5000;
            const events = [];
            const c = createComposer({ mkAudio:() => new FakeAudio(), onCue:e => events.push(e) });
            const s = { inCombat:false, hostilesNear:false, combatTail:false, segmentId:0, level:1, karma:0, guideOpen:false };
            const tick = (now) => { c.tick(s, now, 16); return c.state(); };
            s.inCombat=true; s.hostilesNear=true; let st = tick(400);
            const combat = st.cue === 'COMBAT';
            s.inCombat=true; s.hostilesNear=false; s.combatTail=true; st=tick(1000);
            const tailHeld = st.cue === 'COMBAT';
            s.inCombat=false; s.combatTail=false; st=tick(6000);
            const phantasm = st.cue === 'POST_COMBAT' && String(st.track).endsWith('BG-Phantasm.mp3');
            const postTrack = st.track;
            s.inCombat=true; s.hostilesNear=true; st=tick(6400);
            const combatDoesNotInterrupt = st.cue === 'POST_COMBAT' && st.track === postTrack;
            const active = window._bgMusicEl;
            active.currentTime = active.duration - 0.1; tick(6800);
            active.currentTime = 0; st=tick(7200);
            const combatReturnsAfterFullPass = st.cue === 'COMBAT';

            // No combat: Phantasm finishes, then section BG resumes. Room changes inside a section must not retarget it.
            s.inCombat=false; s.hostilesNear=false; s.combatTail=false; s.segmentId=0; st=tick(7600);
            // Force one fresh post-combat episode for the no-combat completion branch.
            s.inCombat=true; s.hostilesNear=true; tick(8000);
            s.inCombat=false; s.hostilesNear=false; s.combatTail=false; st=tick(14000);
            const post2 = st.cue === 'POST_COMBAT';
            const post2Track = st.track;
            s.roomId=99; st=tick(14400);
            const roomStable = st.cue === 'POST_COMBAT' && st.track === post2Track;
            const active2 = window._bgMusicEl;
            active2.currentTime = active2.duration - 0.1; tick(14800); active2.currentTime=0; st=tick(15200);
            const bgAfterPass = st.cue === 'SECTION_BG' && String(st.track).endsWith('section-0.mp3');
            s.segmentId=1; s.roomId=100; st=tick(15600);
            const newSectionRotates = st.cue === 'SECTION_BG' && String(st.track).endsWith('section-1.mp3');
            return { combat, tailHeld, phantasm, combatDoesNotInterrupt, combatReturnsAfterFullPass, post2, roomStable, bgAfterPass, newSectionRotates, events };
        }, source);
        for (const [k,v] of Object.entries(result)) if (typeof v === 'boolean') console.log(`  ${v ? '✓' : '✗'} ${k}`);
        const checks = Object.entries(result).filter(([,v]) => typeof v === 'boolean').map(([,v]) => v);
        const pass = checks.every(Boolean);
        if (!pass) console.log('  transitions:', result.events.map(e => `${e.from || '—'}→${e.cue}:${String(e.track || '').split('/').pop()}`).join(' | '));
        console.log(`\n[probe-post-combat-phantasm] ${pass ? 'PASS' : 'FAIL'} — ${checks.filter(Boolean).length}/${checks.length}`);
        await browser.close(); process.exit(pass ? 0 : 1);
    } catch (e) {
        console.error('[probe-post-combat-phantasm] HARNESS ERROR:', e.stack || e.message);
        try { await browser.close(); } catch (_) {} process.exit(2);
    }
})();
