/** [REF#AI-00206]
 * jester-ai.js — Oni-Baba's dedicated marionette director for the Portal Jester.
 * The engine reports observations and executes orders; this controller owns intent.
 */
(function installJesterAI(global) {
    'use strict';

    class JesterAI {
        constructor(oni) {
            this.oni = oni;
            this.session = null;
            this.report = null;
            this.relocateAt = 0;
        }

        locationLine(room) {
            if (!room) return null;
            const lines = {
                cabaret: room.active ? 'The cabaret is coming to life. Bring cards to power it up!' : 'This is the cabaret. It needs bringing back to life.',
                dressing: "This is Starlette's dressing room.",
                manager: "The manager's office is here.",
                guard: room.stairsDown ? 'The guardpost is here. These stairs lead down.' : 'This is the guardpost. Watch the guards.',
                bathhouse: 'Here is the bathhouse.',
                store: 'This is 7-Eternal, the shop.',
                cafeteria: 'This is the cafeteria.',
                factory: 'Here is the factory.',
                storage: 'This is the warehouse.',
                secret: room.portal ? 'This portal leads to other dimensions. Care to visit?' : null
            };
            return lines[room.kind] || null;
        }

        observe(d) {
            if (!d || !Number.isFinite(d.activeSeconds) || !Number.isInteger(d.sequence)) return;
            if (this.session !== d.session) {
                this.session = d.session; this.lastSequence = -1; this.seen = new Set(); this.report = null;
                this.returnAt = null; this.returning = false; this.hadActor = false;
                this.lastSpeech = -30; this.greeted = false; this.relocateAt = 0;
                this.location = null; this.locationAt = d.activeSeconds;
                this.playerRoom = null; this.previousRoom = null;
            }
            if (d.sequence <= this.lastSequence) return;
            this.lastSequence = d.sequence;
            if (d.spoken && !this.seen.has(d.spoken)) { this.seen.add(d.spoken); this.lastSpeech = d.activeSeconds; }
            if (d.greetingDone) this.greeted = true;
            if (Number.isInteger(d.trail?.roomId) && d.trail.roomId >= 0) {
                if (this.playerRoom !== null && this.playerRoom !== d.trail.roomId) this.previousRoom = this.playerRoom;
                this.playerRoom = d.trail.roomId;
            }

            // Oni-Baba's private spy report: the latest player state observed by her Jester puppet. [REF#AI-00207]
            const visible = d.canSeePlayer === true;
            this.report = {
                at: d.activeSeconds,
                session: d.session,
                actor: d.actor,
                visible,
                player: visible ? d.player || null : this.report?.player || null,
                activity: visible ? d.playerActivity || 'idle' : 'unseen',
                selected: visible && !!d.playerSelectedJester,
                watching: visible && !!d.playerWatchingJester
            };
            this.oni.jesterReport = this.report;

            const roomLine = this.locationLine(d.room);
            const location = d.sealedDoor ? 'sealed-doors' : roomLine ? 'room:' + d.room.id : null;
            if (location !== this.location) { this.location = location; this.locationAt = d.activeSeconds; }
            const noticed = visible && !!(d.playerSelectedJester || d.playerWatchingJester);
            // HARD TO HIT (2026-10-19, Mark: "there are plenty of times for player just to leave him alone, so dont make it easy for them to hit jester - he dodges out of [REF#AI-00208]
            //    the way"): Oni-Baba's dodge odds for her puppet, melee 70 % / ranged 85 % (were 35 / 60). The engine rolls them in _applyMonsterDamage.
            const p = { mode:'hold', meleeDodge:0, rangedDodge:1,
                // THE JESTER-TILT LAW rides every order (2026-10-19): Oni-Baba decided tilt / straighten in OniBaba8._jesterTiltLaw; this only carries it. [REF#AI-00209]
                leanBack:noticed || !!this.oni.jesterTilt?.straighten, tilt:this.oni.jesterTilt?.tilt===true, tiltWhy:this.oni.jesterTilt?.why||null,
                relocate:false, sprint:false, spy:this.report,
                spyRoom:this.previousRoom ?? d.actorRoom, spyTarget:d.trail || null };

            if (d.alive) {
                this.hadActor = true;
                if (this.returning) { this.returning = false; this.returnAt = null; this.seen.delete('return'); }
                // Mark 2026-10-20: attacks take priority over guide scenes and spying. [REF#AI-00210]
                if (d.attacked || d.limbLost || d.departing) p.mode = 'escape';
                else if (d.samAttacked) p.mode = 'sam-warning';
                // THE CABARET LESSON OUTRANKS SPY-ONLY (2026-10-19, Mark: "jester failed to launch jester-spy + jester-caberet.mp3 when player had reached portal"): [REF#AI-00211]
                //    a Jester back from a realm is spy-only, and spy-only used to win here, so the closed-cabaret line never played for him. Spying does not silence his help.
                else if (d.entranceDone && (d.cabaretNear || d.cabaretSceneActive) && !d.cabaretDone) p.mode = 'cabaret';
                else if (d.spyOnly) p.mode = 'watch';
                else if (!d.entranceDone) p.mode = 'entrance';
                else if (d.cabaretDone) p.mode = 'watch';
                else if (!this.greeted && d.guideClosed) p.mode = 'intro';
                else if (d.playerInPortal || d.portalEntrance) p.mode = this.greeted ? 'home' : 'intro';
                else if (this.greeted) p.mode = 'watch';
                else p.mode = d.busy || d.portalPassed || (location && !this.seen.has(location)) ? 'follow' : 'home';
                // Being watched straightens the puppet; it does not send him sprinting away. [REF#AI-00212]
            } else if (this.hadActor && !d.loading && !d.returnPending) {
                if (this.returnAt === null) this.returnAt = d.activeSeconds + 60;
                if (!visible && d.portalReady) { p.mode = 'return'; this.returning = true; }
            }
            p.invite=!d.spyOnly && visible && !!(d.playerWatchingJester || d.playerWatchingSamurai) && d.nearPlayer
                && d.guideClosed && d.entranceDone && !d.busy && !d.attacked && !d.departing
                && !['intro','entrance','cabaret','escape','sam-warning'].includes(p.mode) && d.room?.kind!=='cabaret';
            p.limbEscape = d.alive && !!d.limbLost;
            p.attackEscape = d.alive && !!d.attacked;
            // Spying does not silence his help. Explain newly observed rooms between voiced scenes. [REF#AI-00213]
            if (d.alive && visible && d.guideClosed && d.entranceDone && !d.busy && !p.invite
                && p.mode==='watch' && roomLine && d.room.kind!=='cabaret' && !d.sealedDoor
                && !this.seen.has(location) && d.activeSeconds-this.locationAt>=1.5
                && d.activeSeconds-this.lastSpeech>=12) {
                p.say={key:location,text:roomLine};
            }
            this.oni._post({ type:'ONIBABA_ORDER', order:'jester', session:d.session,
                sequence:d.sequence, actor:d.actor, params:p });
        }
    }

    global.JesterAI = JesterAI;
})(window);
