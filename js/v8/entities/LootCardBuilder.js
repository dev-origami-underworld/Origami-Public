/** [REF#EN-00043]
 * LootCardBuilder.js — T0.1.E extraction from NewOrigami.Engine9.html
 *
 * Pure 3D geometry + Canvas 2D builders for loot cards.
 * No shared mutable state. THREE is bound from window.THREE (CDN global).
 *
 * Exports:
 *   getCardThemeColor(catId, elId)        → CSS color string
 *   getCardEdgeColor(elId, catId)         → hex number
 *   buildLegacyCardCanvas(opts)           → { canvas, cleanCardURL }
 *   buildLegacyLootIcon(opts)             → { iconMesh, customUpdate }
 *   GLASS_BUBBLE_GEO                      → THREE.SphereGeometry (shared)
 *   GLASS_BUBBLE_MAT                      → THREE.MeshPhysicalMaterial (shared)
 */

import { buildShortLauncher, buildRocketPack } from './BazookaModelBuilder.js?v=8.4.1537-stamped';   // WAND OF FIREBALLS + ROCKETS pictures, shared with the hand card [REF#EN-00760]

const THREE = window.THREE;

// Module-level caches for procedural fallback bow textures [REF#EN-00044]
let _lootBowTextureShort = null;
let _lootBowTextureLong = null;

// ── Shared glass bubble (single allocation — every card reuses these) ───────── [REF#EN-00045]
export const GLASS_BUBBLE_GEO = new THREE.SphereGeometry(0.2, 32, 32);
export const GLASS_BUBBLE_MAT = new THREE.MeshPhysicalMaterial({
    color: 0xe0f0ff, transparent: true,
    // Reflection cut ~75% (Mark 2026-07-08 "remove all reflection from poker card by 75% its whiteout"): the mirror-white [REF#EN-00046]
    // glare came from clearcoat 1.0 + roughness 0.05 (a sharp specular coat) + full envMap. Drop the reflective terms to
    // ~1/4 and roughen so the card/medallion reads THROUGH the bubble instead of whiting out. Shared mat → all loot cards.
    // A FURTHER −50% (Mark 2026-08-02: "reduce reflective light from cards by 50% its whitewashing"): every reflective
    // term halved AGAIN from the 07-08 values (clearcoat 0.25→0.125, envMap 0.25→0.125, metalness 0.075→0.04) and the
    // remaining specular spread wider (roughness 0.30→0.42) so what's left is a sheen, not a hotspot.
    // FOURTH CUT (Mark 2026-08-02, "3rd request to reduce reflection on cards"): the remaining glare
    // was mostly the aura halos (dialed in Engine9 _addMagicCardAura), but the bubble takes its own
    // final halving too — sheen terms at 1/16th of the 07-08 originals, film thinned 0.55→0.46.
    // FIFTH CUT (Mark 2026-08-13: "reduce its reflectivity on all cards"). Same halving as every pass
    // before it — clearcoat 0.06→0.03, envMapIntensity 0.06→0.03, metalness 0.02→0.01 — with roughness
    // 0.5→0.6 to spread what specular remains instead of concentrating it into a point.
    // ⚠ OPACITY IS DELIBERATELY NOT TOUCHED. 0.46 is the film's THICKNESS, not its reflectivity; thinning
    //   it again would fade the glass itself rather than the glare, and the bubble is meant to read as
    //   glass. Every previous cut moved the specular terms and left the body of the material alone.
    // ⚠ AND THIS IS ONLY HALF THE GLARE. The 08-02 pass already found the larger remaining source is the
    //   AURA HALOS (_addMagicCardAura, Engine9 ~:35992), not this bubble — so if the cards still read hot
    //   after this, that is the next place to look and another cut here will not fix it.
    roughness: 0.6, metalness: 0.01,
    clearcoat: 0.03, clearcoatRoughness: 0.5, ior: 1.5,
    envMapIntensity: 0.03, opacity: 0.46,
    depthWrite: false
});
// SIXTH CUT — THE BUBBLE GOES UNLIT (Mark 2026-09-12: "reduce reflection from cards please. its too much and makes [REF#EN-00631]
// cards white out when flashlight or lantern is on them"). MEASURED the same day (scripts/shot-mac9-card.js, lantern
// on): five specular cuts left a LIT physical film whose DIFFUSE still saturates under a point light a tile away — the
// ball became a flat grey disc and swallowed the model inside it. A painted face was made unlit on 08-02 for the same
// reason; the glass gets the same treatment. MeshBasic: no diffuse, no specular, nothing for a lantern to catch — a
// faint fixed tint at a lower opacity so the model reads THROUGH it. Revert to the lit film: window._bubbleLit = true.
export const GLASS_BUBBLE_MAT_UNLIT = new THREE.MeshBasicMaterial({
    color: 0xcfe0f0, transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false
});
export const bubbleMat = () => (window._bubbleLit === true ? GLASS_BUBBLE_MAT : GLASS_BUBBLE_MAT_UNLIT);

// ── Theme color map — 1:1 from legacy CSS var mapping ──────────────────────── [REF#EN-00047]
// ── QUEST SONG CARDS (Mark 2026-07-30) ────────────────────────────────────────
// "these will be special solid gold LOOT CARDS … Some music is LEGENDARY … the rest are just SONGS and
// are solid silver with black text."
//
// MATCHED BY AN EXPLICIT TITLE LIST, NOT A REGEX — for exactly the reason the ARMOUR block below spells
// out in blood: a near-miss here is invisible. The card still builds, it just comes out the wrong metal
// with a grey box inside, and "the model is wrong" looks identical to "the model is missing". The list
// is the one in js/v8/data/SongCatalog.js; it is duplicated as a plain array rather than imported so
// this module keeps its zero-import property (it is loaded by both the engine and the panels).
// ADD A SONG IN SongCatalog.js **AND** here.
// ── TITLES ARE SUNO'S, NOT MINE (Mark 2026-08-13: "why are you not using the sunu titles for the
//    songs?") ────────────────────────────────────────────────────────────────────────────────────
// Every title below is the `og:title` scraped from the track's own Suno share page, so the name on the
// card is the name Mark sees in his library. I had invented English titles for the new tracks ('A SONG
// PICKED UP', 'SOMEBODY'S VOICE', …) which made the card and the source impossible to match by eye —
// the exact tracking problem the sunoUrl field was added to solve, reintroduced one field over.
// ⚠ THIS MAP IS A DELIBERATE DUPLICATE of SongCatalog's titles and the two MUST move together. A title
//   changed in only one place renders the song card in the wrong metal and NOTHING GOES RED.
const _SONG_TITLES = {
    'BREATH INTO SONG': 'SONG',          // 歌に息 — the cabaret's opening number [REF#EN-00048]
    // ⚠ THERE ARE NOW EXACTLY **TWO** LEGENDARIES, BY MARK'S 2026-08-17 RULING ("heart to heart = [REF#EN-00050]
    //   Second Legendary Card"). The 08-13 rule this note used to state — "there is only 1 legendary -
    //   too cute for this game plays only with this legendary card" — is SUPERSEDED, not forgotten.
    //   Kept verbatim here because it is repeated across this repo as though permanent, and a seat
    //   finding only that line would demote HEART TO HEART back to silver. Two, not three: these two
    //   below were gold from the 07-30 pass and stay SONG, because a fourth and fifth gold card make
    //   the cards that matter look like ordinary loot. Do not promote a track for being long or intense.
    'THE INN AT YOMI': 'SONG',
    'CROSSING HELL': 'SONG',
    'TOO CUTE FOR THIS GAME': 'LEGENDARY',  // ★ Legendary Card 1 of TWO (Heart to heart is the other, Mark 2026-08-17) — was 'the only gold' until then [REF#EN-00051]
    'LEGENDARY SONG': 'LEGENDARY',       // kept as an ALIAS: Mark named it this on 2026-08-09 and old [REF#EN-00052]
                                         // saves + the summons beacon still carry that string. Dropping [REF#EN-00053]
                                         // it would silently demote a legendary already in a hand.
    // ── ⛔ CABERET 5 IS NOT A CARD (Mark 2026-08-17) ─────────────────────────────────────────────
    //    "the caberet has its own music and doesn't need any cards to play them so remove those cards
    //     from inventory like Caberet 5 and (French) those are BG caberet songs."
    //    REMOVED FROM THIS MAP, NOT FROM THE GAME. Both are still `setList: true` in SongCatalog and
    //    still play — they are the cabaret's own background bed, which is exactly Mark's point: the
    //    room's music is not something you collect. Only their CARD identity is gone.
    //    ⚠ 歌に息 (French) needed no line here — it was never in this map, so it already had no card
    //      face. Its catalog entry keeps `encoreAfterRotation: true`; it stays her encore.
    //    ⚠ NEITHER WAS EVER DUNGEON LOOT — both are `questGift: false` (measured), so the placer never
    //      hid them in the floor. If a Caberet 5 card is still turning up in a hand, it came from a
    //      SAVE written before this change, not from the placer — check the save before re-opening this.
    //    RESTORE: put 'CABERET 5': 'SONG' back on a line here.
    //    …AND 'CABERET SOUNDS' GOES WITH IT (Mark 2026-08-17, same instruction — "those are BG caberet
    //    songs", a CLASS, not two names). Startup loop 1 is the same thing as Caberet 5: bus 'cabaret',
    //    setList true, a bed the room plays for itself. It was held back one round only because he named
    //    two titles explicitly; flagged to him twice, then removed on his go.
    //    ⚠ REMOVING A LINE FROM THIS MAP NOW DOES **TWO** THINGS, NOT ONE (song-i18n seat, b6589e49).
    //      Song localization is gated on SONG_RARITY_OF(title) — deliberately, so weapon/armour/permit
    //      titles can never reach it (for those, the title regex IS the damage table). So a title dropped
    //      here loses its metal AND stops localizing, falling back to raw English. HARMLESS IN THIS CASE
    //      and that is the whole test: these two are not cards at all any more, so there is no card face
    //      left to translate. If a future removal is of something that SHOULD still show Japanese, it
    //      needs a different gate — do not just delete the line.
    'HEART TO HEART': 'LEGENDARY',       // ★ the SECOND Legendary Card (Mark 2026-08-17) — twinned with SongCatalog's rarity: RARITY.LEGENDARY [REF#EN-00054]
    'ORIGAMIUNDERWORLD.1': 'LEGENDARY',  // ★ Card 1 — LEGENDARY since 2026-09-29 (a room guard carries it) [REF#EN-00055]
    'WINNING': 'SONG',                   // ★ Card 2 — 勝ち [REF#EN-00056]
    'A FINE DAY': 'SONG',                // ★ Card 3 [REF#EN-00057]
    'MERCI MERCY': 'SONG',               // ★ Card 4 (Mark 2026-08-13, replacing 紅い扇子 (Remastered)) [REF#EN-00058]
    // songs v2 (2026-09-29): every catalog song other than her starting three is a findable card, so these three get a card face too [REF#EN-00761]
    'BREATH INTO SONG': 'SONG',
    'MERCI MERCY (TAKE B)': 'SONG',
    '秘密のダンス': 'SONG',               // floor 2 (Stariko); without this line its card was built as a plain ITEM card (2026-09-30) [REF#EN-00762]
};

/** 'LEGENDARY' | 'SONG' | null — the single authority for "is this card a song, and how rare". [REF#EN-00059] */
export function SONG_RARITY_OF(title) {
    const t = String(title || '').replace(/\s*x\d+$/i, '').trim().toUpperCase();
    // THE MUSIC PAGE'S ROLE FIRST (2026-09-30): a host that knows the song roles (the engine's window._songMetalOf) answers for a [REF#EN-00763]
    // catalog title, 'LEGENDARY' for the LEGENDARY role and 'SONG' for TO FIND, so a song moved on the Music page changes metal with
    // it. Any other answer falls through to the list above.
    try { const f = (typeof globalThis !== 'undefined') ? globalThis._songMetalOf : undefined;
          if (typeof f === 'function') { const r = f(t); if (r === 'LEGENDARY' || r === 'SONG') return r; } } catch (_) {}
    if (_SONG_TITLES[t]) return _SONG_TITLES[t];
    // elId/catId route, for callers that carry the tag instead of the title [REF#EN-00060]
    if (t === 'SONG_LEGENDARY') return 'LEGENDARY';
    if (t === 'SONG') return 'SONG';
    return null;
}

// Award metal, not costume jewellery. The face is a solid sheet of the metal; the canvas layer picks [REF#EN-00061]
// black text off these (see buildLegacyCardCanvas) because black on silver is the only pairing in the
// deck that survives being shrunk to a vending thumbnail.
export const SONG_GOLD_FACE = '#d4a017';   // solid gold — legendary [REF#EN-00062]
export const SONG_GOLD_RIM  = 0xffd700;
export const SONG_SILVER_FACE = '#c8ccd0'; // solid silver — ordinary songs [REF#EN-00063]
export const SONG_SILVER_RIM  = 0xdfe4e8;

// ── ROOM PERMITS — GOLD SKILL CARDS (Mark 2026-07-30) ──────────────────────── [REF#EN-00064]
// "add a GOLD SKILL card called SINGING" · "everything needs a permit -- inspectors came in and shut
// down the inn." These are the Dungeon-Keeper keys that switch a dead room back on (the authority for
// which permit opens which room is js/v8/data/RoomPermits.js).
//
// They ride the SAME award metal as a legendary song, deliberately: in the fiction a permit and a
// legendary track are both treasure that changes what the dungeon can DO, so they should read alike
// across a dark room. Aliased rather than hard-coded to the song constants so the two can diverge
// later with a one-line change instead of a hunt.
//
// Explicit title set, same discipline as _SONG_TITLES and the ARMOUR list below — a near-miss here is
// invisible, because the card still builds, just in the wrong metal.
// ADD A PERMIT IN RoomPermits.js **AND** here.
// ── PERMITS ARE SILVER (Mark 2026-07-31) ──────────────────────────────────────────────────────────
// "singing cards = they will be solid silver unless they are legendary, including permits, just so
//  they doing all look like coin cards."
//
// GOLD HAD TO BE SPENT MORE CAREFULLY. Gold already means GOLD_COIN — actual money on the floor. With
// permits and songs also minted gold, a room with a purse, a permit and a song in it read as three
// piles of coins, and the one card that mattered stopped standing out. Silver is the default metal
// for anything quest-shaped; gold is now reserved for LEGENDARY, so when it does appear it means
// something. This is a palette decision, not a rarity change: permits are exactly as important as
// they were, they just stop shouting in the same voice as the loose change.
//
// The GOLD_* names are kept as deprecated aliases so nothing that imports them breaks mid-refactor;
// both now resolve to silver. Prefer PERMIT_FACE / PERMIT_RIM in new code.
// ── PERMITS ARE SOLID GOLD AGAIN (Mark 2026-08-19) ────────────────────────────────────────────────
// "lets make quest cards : solid gold with gold text" — asked twice, second time as "why is singing
// card permit not solid gold as I asked?".
//
// THIS REVERSES HIS OWN 07-31 RULING ABOVE, DELIBERATELY AND ON HIS INSTRUCTION. That note is kept
// intact rather than deleted because its reasoning is still the risk to watch: gold also means
// GOLD_COIN, so a room holding a purse, a permit and a legendary song now shows three gold faces. What
// changed is the priority — a quest item is the thing that CHANGES WHAT THE DUNGEON CAN DO, and Mark
// wants it to read as treasure on sight. Loose change can be the one that blends in.
// Back to SILVER in one line: window._permitGoldFace = false.
// ⛔ SUPERSEDED 2026-09-30 — see the DISABLED-FEATURES REGISTER at the top of Origami.RealityEngine.9.html for the order and who
//    gave it. The gold above is retired: a permit's face, rim, lettering, medal and aura are the green of the player's ground circle
//    (engine pBaseMat, 0x4CAF50) with black lettering (7.56:1), so gold means a legendary song and nothing else.
//    The 08-19 gold again, read each time a card is built: window._permitGreen = false.
export const PERMIT_FACE = '#4CAF50';
export const PERMIT_RIM  = 0x4CAF50;
export const PERMIT_GOLD_FACE = SONG_GOLD_FACE;   // the retired gold, for the restore knob [REF#EN-00065]
export const PERMIT_GOLD_RIM  = SONG_GOLD_RIM;
/** true while permits wear the player's green (the default); false restores the 08-19 gold. [REF#EN-00764] */
export function permitGreenOn() { return typeof window === 'undefined' || window._permitGreen !== false; }
// ⛔ SUPERSEDED 2026-09-30, later the same day — see the DISABLED-FEATURES REGISTER (permits are washi paper with a red 許可 stamp): [REF#EN-00765]
//    the green read badly on the card. A permit is an ivory washi sheet stamped 許可 in vermilion with black lettering (17:1); its
//    medal and the SINGING note are vermilion lacquer. The green again: window._permitWashi = false · the gold: window._permitGreen = false.
export const PERMIT_WASHI_FACE = '#F2E8D5';
export const PERMIT_WASHI_RIM  = 0xB89B72;
export const PERMIT_STAMP      = '#C8321F';
export const PERMIT_STAMP_HEX  = 0xC8321F;
// ⛔ SUPERSEDED 2026-09-30, the evening — see the DISABLED-FEATURES REGISTER (permits are green again, in jade): washi is the [REF#EN-00766]
//    knob window._permitWashi = true.
/** 'green' (the default, jade) · 'washi' (window._permitWashi = true) · 'gold' (window._permitGreen = false). Read each time a card is built. [REF#EN-00767] */
export function permitStyle() {
    if (typeof window === 'undefined') return 'green';
    if (window._permitGreen === false) return 'gold';
    return window._permitWashi === true ? 'washi' : 'green';
}
// ── JADE (2026-09-30, the evening; register entry at the top of Origami.RealityEngine.9.html) ───────────────────────────────── [REF#EN-00768]
//    The green permit is jade (翡翠): a diagonal face #86D6B6 → #5CC39C → #3AA882 inside a thin deep-jade line, a deep jade rim,
//    black lettering (7.1:1 at the darkest corner, 11.9:1 at the lightest). The flat ground-circle green: window._permitJade = false.
export const PERMIT_JADE_TOP  = '#86D6B6';
export const PERMIT_JADE_MID  = '#5CC39C';
export const PERMIT_JADE_LOW  = '#3AA882';
export const PERMIT_JADE_HEX  = 0x3AA882;
export const PERMIT_JADE_RIM  = 0x2E8F6C;
export const PERMIT_JADE_GLOW = 0xBFE9D6;
export const PERMIT_JADE_PALE = '#CFF0E2';
export function permitJadeOn() { return typeof window === 'undefined' || window._permitJade !== false; }
// ── BRIGHT APPLE GREEN, WHITE LETTERING (2026-09-30; register entry at the top of the engine) ──────────── [REF#EN-00769]
//    The permit is a bright apple-green card with white text. Jade read as a soft mint and the order was for
//    something brighter. Same diagonal face as the jade build, so only the three stops and the ink change.
//    ⚠ WHITE ON APPLE GREEN IS A LOW-CONTRAST PAIRING — about 2.2:1 on the mid stop, under the 4.5:1 this
//    project holds itself to elsewhere. The white is the order, so the legibility is bought back with a dark
//    outline on the lettering rather than by darkening the face. A darker green that carries white on its own
//    is one line: window._permitAppleMid = '#4E8F22'.
//    Back to jade: window._permitApple = false. Back to the flat ground-circle green: _permitJade = false.
export const PERMIT_APPLE_TOP  = '#9FE05A';
export const PERMIT_APPLE_MID  = '#7CC63C';
export const PERMIT_APPLE_LOW  = '#5FA82A';
export const PERMIT_APPLE_HEX  = 0x5FA82A;
export const PERMIT_APPLE_RIM  = 0x4E8F22;
export const PERMIT_APPLE_PALE = '#E8F8CE';
export const PERMIT_APPLE_INK_STROKE = '#2F5A10';
export function permitAppleOn() { return typeof window === 'undefined' || window._permitApple !== false; }
// ── THE CABARET'S SINGING PERMIT IS BLACK WITH GOLD (2026-09-30; register entry at the top of the engine) ────── [REF#EN-00770]
//    SINGING is the one permit that is not a room's work pass — it is the licence to take the cabaret stage, so
//    it is drawn as a solid black plate with gold lettering, a gold inner line, a gold type pill and a gold ♪.
//    The other permits are untouched and stay apple green; this is matched on the title alone.
//    Gold on black measures 15.3:1, so the lettering needs no outline to hold (the apple-green face did).
//    Back to apple green: window._permitSingBlack = false. Face dial: window._permitSingFace.
export const PERMIT_SING_FACE     = '#000000';
export const PERMIT_SING_GOLD     = '#FFD700';
export const PERMIT_SING_GOLD_DIM = 'rgba(255,215,0,0.70)';
export const PERMIT_SING_LINE     = 'rgba(255,215,0,0.55)';
export const PERMIT_SING_HEX      = 0xFFD700;
export const PERMIT_SING_RIM      = 0xC9971F;
export function permitSingBlackOn() { return typeof window === 'undefined' || window._permitSingBlack !== false; }
// ⛔ SUPERSEDED 2026-09-30 — EVERY permit is this black-and-gold card, not only the cabaret's SINGING. [REF#EN-00771]
//    The first build scoped it to SINGING by title and left the room permits apple green, which made the
//    one card the exception instead of the rule. The palette and the knob are unchanged; only the match
//    widened, so there is one permit look in the game again.
//    Back to apple green for all of them: window._permitSingBlack = false.
/** true ONLY for the cabaret's SINGING permit. Titles reach the face builder as raw English, so this holds in JA. [REF#EN-00772] */
export function IS_SINGING_PERMIT(t) {
    return String(t || '').replace(/\s*x\d+$/i, '').trim().toUpperCase() === 'SINGING';
}
function _singFaceC() { return (typeof window !== 'undefined' && typeof window._permitSingFace === 'string') ? window._permitSingFace : PERMIT_SING_FACE; }
function _knob(n, d) { return (typeof window !== 'undefined' && typeof window[n] === 'string') ? window[n] : d; }
export function permitTopC()  { return permitAppleOn() ? _knob('_permitAppleTop', PERMIT_APPLE_TOP) : PERMIT_JADE_TOP; }
export function permitMidC()  { return permitAppleOn() ? _knob('_permitAppleMid', PERMIT_APPLE_MID) : PERMIT_JADE_MID; }
export function permitLowC()  { return permitAppleOn() ? _knob('_permitAppleLow', PERMIT_APPLE_LOW) : PERMIT_JADE_LOW; }
export function permitPaleC() { return permitAppleOn() ? PERMIT_APPLE_PALE : PERMIT_JADE_PALE; }
export function permitHexC()  { return permitAppleOn() ? PERMIT_APPLE_HEX : PERMIT_JADE_HEX; }
export function permitRimC()  { return permitAppleOn() ? PERMIT_APPLE_RIM : PERMIT_JADE_RIM; }
export function permitGreenFace() { return permitJadeOn() ? permitMidC() : PERMIT_FACE; }
export function permitGreenRim() { return permitJadeOn() ? permitRimC() : PERMIT_RIM; }
// ── GAMING CARDS ARE GOLD (2026-09-30, register entry at the top of Origami.RealityEngine.9.html) ────────────────────────────── [REF#EN-00773]
//    POKER, BLACKJACK, DICE and the table's DICE GAME, CARD GAME, SLOT MACHINE and CONTRACTS wear the legendary song's solid gold
//    with black lettering. Their bottom strip reads "… PERMIT", which is how the permit look took them over: they are matched
//    before any permit test. The old purple / green again: window._gamingGold = false.
const _GAMING_TITLES = new Set(['POKER', 'POKER GAME', 'LEARN POKER', 'BLACKJACK', 'BLACK JACK', '21', 'TWENTY-ONE', 'DICE', 'DICE GAME',
                                'DICE_GAME', 'CARD GAME', 'CARD_GAME', 'SLOT MACHINE', 'SLOT MACHINES', 'CONTRACTS']);
function _gamingGoldOn() { return typeof window === 'undefined' || window._gamingGold !== false; }
/** true for a gaming card, by title or by the GAMING / GAMING_CARD tag a caller may carry instead. [REF#EN-00774] */
export function IS_GAMING_CARD(title) {
    if (!_gamingGoldOn()) return false;
    const t = String(title || '').replace(/\s*x\d+$/i, '').trim().toUpperCase();
    return _GAMING_TITLES.has(t) || t === 'GAMING' || t === 'GAMING_CARD';
}
const _PERMIT_TITLES = new Set(['SINGING', 'KITCHEN PERMIT', 'STORE PERMIT', 'FACTORY PERMIT', 'WORKS PERMIT', 'STORAGE PERMIT',
                                'LABORATORY PERMIT', 'GUARD POST PERMIT',
                                'ARMORY PERMIT', 'ARCHERY PERMIT', 'PRISON PERMIT']);   // floor 2 (js/v8/data/RoomPermits.js); drawn as plain SKILL cards until 2026-09-30 [REF#EN-00775]

/** true for a room-permit card, by title or by a tag-carrying elId. [REF#EN-00066] */
export function IS_PERMIT_CARD(title) {
    const t = String(title || '').replace(/\s*x\d+$/i, '').trim().toUpperCase();
    return _PERMIT_TITLES.has(t) || t === 'SKILL_PERMIT';
}

export function IS_MAC9_CARD(title) {
    return /^MAGIC AUTO MISSILE(\s+x\d+)?$/i.test(String(title || '').trim());
}

export function getCardThemeColor(catId, elId, title) {
    // Songs win over every other rule — a song is always its metal, whatever category carries it. [REF#EN-00067]
    const songRarity = SONG_RARITY_OF(title) || SONG_RARITY_OF(elId);
    if (songRarity) return songRarity === 'LEGENDARY' ? SONG_GOLD_FACE : SONG_SILVER_FACE;
    // Permits win over the SKILL green below for the same reason: the metal IS the rarity signal. [REF#EN-00068]
    if (IS_GAMING_CARD(title) || IS_GAMING_CARD(elId) || IS_GAMING_CARD(catId)) return SONG_GOLD_FACE;   // gaming cards are gold (2026-09-30) [REF#EN-00776]
    if (permitSingBlackOn() && (IS_PERMIT_CARD(title) || IS_PERMIT_CARD(elId))) return _singFaceC();   // every permit is black [REF#EN-00777]
    if (IS_PERMIT_CARD(title) || IS_PERMIT_CARD(elId)) { const _ps = permitStyle(); return _ps === 'washi' ? PERMIT_WASHI_FACE : (_ps === 'green' ? permitGreenFace() : PERMIT_GOLD_FACE); }
    // SKILL/bonus cards (THRUST, …) — looted passive melee buffs. Vivid green [REF#EN-00069]
    // with a gold rim (see getCardEdgeColor) so they read as a distinct 5th type.
    if (catId === 'SKILL' || elId === 'SKILL')                         return '#7fe060';
    if (catId === 'GAMING' || elId === 'GAMING' || catId === 'GAMING_CARD' || elId === 'GAMING_CARD') return '#a78bfa';
    // Magical artefacts (PISTOL, MAGIC LANTERN) share a distinct [REF#EN-00070]
    // gunmetal-purple. PISTOL is a magical firearm so it stays purple
    // even though it's technically a missile. All other ranged weapons
    // (SHURIKEN/DAGGER/BOWS/CROSSBOW) get a dark-blue treatment.
    if (elId === 'PISTOL' || elId === 'MAGIC_LANTERN')                 return '#c79bff';
    if (elId === 'CAMERA' || String(title || '').toUpperCase().replace(/\s+x\d+$/, '') === 'CAMERA') return '#c79bff';   // the magic camera is the third artefact (Mark 2026-09-20: "same purple color as magic lantern and magic missile") [REF#PENDING]
    // MAGIC AUTO MISSILE (the MAC-9) ships with el 'RANGED' and fell to the steel-blue family below while its [REF#EN-00622]
    // twin MAGIC MISSILE resolves to PISTOL purple. Mark 2026-09-11: "loot card for Magic Auto Missile should
    // match the colors of Magic Missile 1:1". Keyed on the title (with any " xN" qty suffix) so every spawn
    // path agrees without touching elId, which other systems route on.
    if (IS_MAC9_CARD(title))                                           return '#c79bff';
    // THE BULLY CLUB IS MAGICAL (Mark 2026-09-27: "Bully Club should be Magical. and be glowing ethereal blue outline. so make card Purple [REF#EN-00714]
    // loot and playing card") — the artefact purple of the lantern / missile / camera, not the KATANA red its catId would give it.
    if (String(title || '').toUpperCase().replace(/\s+x\d+$/, '') === 'BULLY CLUB') return '#c79bff';
    // THE BAZOOKA AND ITS ROCKETS ARE MAGIC CARDS (2026-09-29): the same artefact purple, keyed on the title like the club above. [REF#EN-00778]
    if (/^(WAND OF FIREBALLS|ROCKETS)$/.test(String(title || '').toUpperCase().replace(/\s+x\d+$/, ''))) return '#c79bff';
    if (catId === 'WIND' || catId === 'SPELL')                         return '#b0bec5';
    if (elId === 'EARTH')                                              return '#5C4033';
    if (catId === 'ITEM' || catId === 'SHIELD' || catId === 'DEFEND')  return '#5c6bc0';
    if (catId === 'WATER' || catId === 'THRUST')                       return '#0d6efd';
    if (catId === 'FIRE' || catId === 'SLASH' || catId === 'KATANA')   return '#ef5350';
    if (catId === 'MISSILE' || catId === 'RANGED')                     return '#2c5ba8'; // dark steel blue [REF#EN-00071]
    if (catId === 'GOLD_COIN')                                         return '#b8860b';
    return '#66bb6a'; // SCROLL / default [REF#EN-00072]
}

// ── Edge color map — what the extruded card shell rim looks like ────────────── [REF#EN-00073]
export function getCardEdgeColor(elId, catId, title) {
    const songRarity = SONG_RARITY_OF(title) || SONG_RARITY_OF(elId);
    if (songRarity) return songRarity === 'LEGENDARY' ? SONG_GOLD_RIM : SONG_SILVER_RIM;
    if (IS_GAMING_CARD(title) || IS_GAMING_CARD(elId) || IS_GAMING_CARD(catId)) return SONG_GOLD_RIM;
    if (permitSingBlackOn() && (IS_PERMIT_CARD(title) || IS_PERMIT_CARD(elId))) return PERMIT_SING_RIM;   // gold edge, so a black card still has a silhouette [REF#EN-00779]
    if (IS_PERMIT_CARD(title) || IS_PERMIT_CARD(elId)) { const _ps = permitStyle(); return _ps === 'washi' ? PERMIT_WASHI_RIM : (_ps === 'green' ? permitGreenRim() : PERMIT_GOLD_RIM); }
    if (IS_MAC9_CARD(title)) return 0xc79bff;   // same rim as MAGIC MISSILE (Mark 2026-09-11, see getCardThemeColor) [REF#EN-00623]
    if (String(title || '').toUpperCase().replace(/\s+x\d+$/, '') === 'BULLY CLUB') return 0xc79bff;   // the magical Bully Club (Mark 2026-09-27)
    if (String(title || '').toUpperCase().replace(/\s+x\d+$/, '') === 'CAMERA') return 0xc79bff;   // magic camera rim = lantern/missile purple (Mark 2026-09-20) [REF#PENDING]
    if (/^(WAND OF FIREBALLS|ROCKETS)$/.test(String(title || '').toUpperCase().replace(/\s+x\d+$/, ''))) return 0xc79bff;   // bazooka + rockets rim (2026-09-29)
    const m = { EARTH: 0x5C4033, WATER: 0x0d6efd, FIRE: 0xb71c1c, WIND: 0x37474f,
                SCROLL: 0x1b5e20, GOLD_COIN: 0xffd700,
                PISTOL: 0xc79bff, MAGIC_LANTERN: 0xc79bff, CAMERA: 0xc79bff,
                MISSILE: 0x2c5ba8, RANGED: 0x2c5ba8,
                SKILL: 0xe0b020,   // SKILL/bonus cards — gold rim around the green face [REF#EN-00074]
                GAMING: 0x7c3aed, GAMING_CARD: 0x7c3aed };
    return m[elId] || m[catId] || 0x444444;
}

// ── Canvas text helper ───────────────────────────────────────────────────────── [REF#EN-00075]
// ── MAX 2 LINES, EVERY TEXT, EVERY CARD (Mark 2026-08-02: "condense the text to be max of 2 lines
// of any text for any cards"). Both call sites (desc + label strip) route through here, so the rule
// is enforced in ONE place. Strategy: shrink the font (keeping the caller's weight/family) until the
// wrap fits 2 lines, floor 11px; if it still cannot fit, the 2nd line ends in an ellipsis — smaller
// but complete beats spilling into the plastic ball. Knob: window._cardMaxTextLines.
// `bandTop`/`bandBot` (optional): centre the whole wrapped BLOCK inside that vertical band instead of
// hanging it from `y`. Needed because a fixed `y` cannot be right for both a 1-line and a 2-line desc —
// the block grows downward, so one of the two is always off by half a line. See the desc call site.
function _wrapText(ctx, text, x, y, maxWidth, lineHeight, bandTop, bandBot) {
    const maxLines = (typeof window !== 'undefined' && typeof window._cardMaxTextLines === 'number') ? window._cardMaxTextLines : 2;
    const words = String(text).split(' ').filter(Boolean);
    const _linesAt = () => {   // wrap simulation with the CURRENT ctx.font [REF#EN-00076]
        const out = []; let line = '';
        for (let n = 0; n < words.length; n++) {
            const t = line + words[n] + ' ';
            if (ctx.measureText(t).width > maxWidth && n > 0) { out.push(line.trim()); line = words[n] + ' '; }
            else line = t;
        }
        if (line.trim()) out.push(line.trim());
        return out;
    };
    const fm = ctx.font.match(/(\d+(?:\.\d+)?)px/);
    let px = fm ? parseFloat(fm[1]) : 16;
    const px0 = px;
    let lines = _linesAt();
    while (lines.length > maxLines && px > 11) {
        px -= 1; ctx.font = ctx.font.replace(/\d+(?:\.\d+)?px/, px + 'px');
        lines = _linesAt();
    }
    if (lines.length > maxLines) {   // still too long at the floor — clamp with an ellipsis [REF#EN-00077]
        lines = lines.slice(0, maxLines);
        let last = lines[maxLines - 1] + '…';
        while (ctx.measureText(last).width > maxWidth && last.length > 2) last = last.slice(0, -2) + '…';
        lines[maxLines - 1] = last;
    }
    const lh = lineHeight * (px / px0);   // line height tracks the shrink [REF#EN-00078]
    // Centre the BLOCK in the band when one is given. Block height for n baseline-middle lines is [REF#EN-00079]
    // (n-1)*lh; the first line's centre therefore sits half that above the band's centre.
    let y0 = y;
    if (typeof bandTop === 'number' && typeof bandBot === 'number' && bandBot > bandTop) {
        y0 = (bandTop + bandBot) / 2 - ((lines.length - 1) * lh) / 2;
    }
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y0 + i * lh);
}

// Memoization cache for generated playing card canvases [REF#EN-00080]
const _canvasCache = {};

// ── Build the BLACK playing-card canvas face (1:1 legacy) ───────────────────── [REF#EN-00081]
// `resolutionScale` multiplies the backing-canvas DPI without changing any of
// the drawing coordinates — pass 4 (or 8) when the card will be sampled at
// small on-screen size (mini vending cards) so text + edges stay crisp.
// ── THE PORTHOLE'S ONE TRUE CENTRE (Mark 2026-08-02: "need the card layout alignment fixed") ──
// Measured ink bands on the old face: title 76-100, desc 107-129, hole 163-283, then FIFTY-ONE pixels
// of dead card, then the label strip at 334 — against only 34px of breathing room above the hole. The
// composition hung high with a gap under it. Centring the hole in the band it actually lives in
// (desc-bottom → strip-top) balances 34/51 to ~42/42.
//
// ⚠ THIS NUMBER IS SHARED WITH THE 3D CARD. Engine9 places the icon + glass bubble at the plane-space
// Y this fraction implies (CARD_PORTHOLE_Y below); the canvas hole and the physical ball MUST agree or
// the medallion floats off its socket. Both now read ONE constant instead of two hand-tuned literals
// (H*0.58 here, -0.096 there) that could silently drift apart — which is exactly how a "fixed" layout
// breaks again three edits later.
export const CARD_PORTHOLE_FRAC = 0.603;                       // hole centre, as a fraction of card height [REF#EN-00082]
export const CARD_PORTHOLE_Y = 0.6 - CARD_PORTHOLE_FRAC * 1.2; // same point in the 0.8x1.2 card plane [REF#EN-00083]

export function buildLegacyCardCanvas({ title, displayKanji, displayDesc, displayAttr,
                                        displayTypePill, catId, themeColor,
                                        isShopItem = false, price = 50,
                                        resolutionScale = 1, isPermit = false, isGaming = false }) {
    // isPermit: the caller's English-title verdict. A Japanese build hands this function a translated title and attr, which the [REF#EN-00084]
    // title tests below cannot recognise, so the engine passes the permit decision in (2026-09-30).
    // Localize the type pill (RANGED/MELEE/SPELLS/ITEM → 遠隔/近接/呪文/道具) via the shared cardcat_* keys; [REF#EN-00084]
    // falls back to the raw pill for unmapped categories. window.t/currentLang come from i18n.js (loaded in the engine).
    const _pillKey = 'cardcat_' + (catId === 'GOLD_COIN' ? 'gold' : String(displayTypePill || '').toLowerCase());
    const _pillRaw = (catId === 'GOLD_COIN') ? 'GOLD' : displayTypePill;
    const _pillT = window.t ? window.t(_pillKey, window.currentLang) : _pillRaw;
    const _pillTxt = (_pillT && _pillT !== _pillKey) ? _pillT : _pillRaw;  // guard: window.t returns the KEY for unmapped pills [REF#EN-00085]
    // ── SONG TITLES + DESCS ARE LOCALIZED (Mark 2026-08-17: "why are no songs localized?") ────────── [REF#EN-00086]
    //    They never had i18n keys at all — SongCatalog carries literal English strings, and a card face
    //    is a CANVAS TEXTURE, which data-i18n cannot see (the same trap as the capsule gauge: the
    //    texture has to be rebuilt, not re-marked). So the lookup happens here, at draw time.
    //    ⚠ DISPLAY ONLY. `title` stays the raw English everywhere else in this function and is NOT
    //      reassigned, because it is LOAD-BEARING LOGIC: SONG_RARITY_OF(title) decides gold vs silver
    //      metal and IS_PERMIT_CARD(title) decides the permit face, both by matching the uppercased
    //      string — and for weapons the title regex IS the damage table (LootTables ~:97, "THE NAME IS
    //      THE STATS"). Localizing the variable would silently demote the legendary to silver.
    //    ⚠ GATED ON SONG_RARITY_OF so ONLY song cards are touched. Weapons, armour and permits keep
    //      rendering their raw titles; this cannot reach the regex paths even by accident.
    //    Falls back to the raw string on any miss, so an untranslated song looks exactly like today.
    //    ⚠ SongCatalog.js is NOT edited — another seat has it staged. Keys live in js/data/i18n.js.
    const _songSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const _i18nOr = (key, raw) => { const v = window.t ? window.t(key, window.currentLang) : null; return (v && v !== key) ? v : raw; };
    const _slug = _songSlug(title);
    const _isSongCard = !!SONG_RARITY_OF(title);
    const _titleTxt = (_isSongCard && _slug) ? _i18nOr('song_' + _slug, title) : title;
    const _descTxt  = (_isSongCard && _slug) ? _i18nOr('songd_' + _slug, displayDesc) : displayDesc;
    //    Both resolved strings join the cache key: switching language changes them, which changes the [REF#EN-00087]
    //    key, which rebuilds the canvas. Without this a card built in EN would stay EN forever — which
    //    is exactly why one of Mark's two screenshots showed `ITEM` and the other `道具`.
    const cacheKey = `${title}||${displayKanji}||${_descTxt}||${displayAttr}||${_pillTxt}||${_titleTxt}||${catId}||${isShopItem}||${price}||${resolutionScale}||${isPermit}||${permitStyle()}||${permitJadeOn()}||${isGaming}||${_gamingGoldOn()}||${permitSingBlackOn()}`;
    if (_canvasCache[cacheKey]) {
        return _canvasCache[cacheKey];
    }

    const W = 256, H = 384;
    const canvas = document.createElement('canvas');
    canvas.width = W * resolutionScale; canvas.height = H * resolutionScale;
    const ctx = canvas.getContext('2d');
    if (resolutionScale !== 1) ctx.scale(resolutionScale, resolutionScale);
    // Crisper text rendering at high DPI [REF#EN-00088]
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';

    // ── SONG CARDS ARE A SOLID SHEET OF METAL, NOT A DARK CARD WITH A THEMED RIM ────────────── [REF#EN-00089]
    // Mark: "solid gold cards, shiny like an award … the rest are just SONGS and are solid silver
    // with black text." Every other card in the deck is the dark #232527 stock with a coloured trim,
    // so a song has to break that silhouette on sight — across a dim room, at vending-thumbnail size,
    // the read is "metal" before any text is legible. The award look is a diagonal polish sweep:
    // dark metal at the corners, a hot specular band across the middle. Ink goes BLACK on both metals
    // (white on silver is unreadable, and it is what he asked for), matching the GOLD_COIN precedent
    // that already flips the pill text black on its light face.
    const _songRarity = SONG_RARITY_OF(title);
    // ── A PERMIT IS A SOLID SHEET OF GOLD, THE SAME AS A LEGENDARY SONG (Mark 2026-08-19) ───────── [REF#EN-00090]
    //    It used to take the flat #232527 stock with a silver theme rim, which is why his 興行許可証
    //    screenshot is a DARK card with a gold trinket on it rather than the award he asked for.
    //    Routing it through the same metal path means one gradient, one silhouette, no second look.
    //    Off: window._permitGoldFace = false → straight back to the 07-31 silver behaviour.
    // isGaming: the caller's English-title verdict, like isPermit. A gaming card is tested FIRST: its strip says "… PERMIT".
    const _isGamingCard = (isGaming && _gamingGoldOn()) || IS_GAMING_CARD(title) || IS_GAMING_CARD(catId);
    const _isPermitCard = !_isGamingCard && (isPermit || IS_PERMIT_CARD(title) || /PERMIT/i.test(String(displayAttr || '')))
                          && (typeof window === 'undefined' || window._permitGoldFace !== false);
    const _isSong = !!_songRarity || _isPermitCard || _isGamingCard;
    const _pStyle = permitStyle();
    const _flatPermit = _isPermitCard && _pStyle !== 'gold';   // a flat face and black lettering: washi (the default) or the green [REF#EN-00780]
    const _washiPermit = _isPermitCard && _pStyle === 'washi';
    const _singPermit  = _isPermitCard && _pStyle !== 'gold' && permitSingBlackOn();
    const _goldFace = (_isPermitCard && !_flatPermit) || _songRarity === 'LEGENDARY' || _isGamingCard;
    // ── GOLD TEXT ON THE GOLD (Mark 2026-08-19: "solid gold with gold text") ────────────────────── [REF#EN-00091]
    //    A song's ink is black. A permit's is GOLD, which on a gold face would be invisible — so it is
    //    drawn as ENGRAVED metal: bright gold fill over a dark stroke, the way lettering on a real
    //    award plate reads. The stroke is what keeps it legible; without it this is a blank card.
    //    Dials: window._permitInk (fill) · window._permitInkStroke (outline).
    // the apple-green permit letters in WHITE, outlined so they hold against a bright face
    const _appleInk = _flatPermit && !_singPermit && _pStyle === 'green' && permitJadeOn() && permitAppleOn();
    const _permitInk = (typeof window !== 'undefined' && typeof window._permitInk === 'string') ? window._permitInk : (_singPermit ? PERMIT_SING_GOLD : (_appleInk ? '#ffffff' : (_flatPermit ? '#000000' : '#ffe89a')));
    const _permitInkStroke = (typeof window !== 'undefined' && typeof window._permitInkStroke === 'string') ? window._permitInkStroke : (_singPermit ? null : (_appleInk ? PERMIT_APPLE_INK_STROKE : (_flatPermit ? null : '#4a3208')));
    const _ink = _isPermitCard ? _permitInk : (_isSong ? '#000000' : '#ffffff');
    /** Engraved lettering — call right before a fillText on a permit. No-op on every other card. [REF#EN-00092] */
    const _engrave = (on) => {
        if (!_isPermitCard || !_permitInkStroke) { ctx.lineWidth = 0; ctx.strokeStyle = 'transparent'; return false; }
        if (!on) return false;
        ctx.lineJoin = 'round'; ctx.miterLimit = 2;
        ctx.strokeStyle = _permitInkStroke;
        return true;
    };
    if (_flatPermit) {
        if (_singPermit) ctx.fillStyle = _singFaceC();                                                         // SINGING: a solid black plate [REF#EN-00781]
        else if (_washiPermit || !permitJadeOn()) ctx.fillStyle = _washiPermit ? PERMIT_WASHI_FACE : PERMIT_FACE;   // flat: washi paper, or the ground-circle green [REF#EN-00782]
        else { const _jg = ctx.createLinearGradient(0, 0, W, H); _jg.addColorStop(0, permitTopC()); _jg.addColorStop(0.5, permitMidC()); _jg.addColorStop(1, permitLowC()); ctx.fillStyle = _jg; }   // apple green (jade: _permitApple = false) [REF#EN-00783]
    } else if (_isSong) {
        const legendary = _goldFace;
        const g = ctx.createLinearGradient(0, 0, W, H);
        if (legendary) {
            g.addColorStop(0.00, '#7a5510'); g.addColorStop(0.22, '#c9971f');
            g.addColorStop(0.44, '#ffe89a');                       // specular band — the "award" glint [REF#EN-00093]
            g.addColorStop(0.52, '#f0c33c'); g.addColorStop(0.78, '#a8761a');
            g.addColorStop(1.00, '#6d4a0d');
        } else {
            g.addColorStop(0.00, '#6f767c'); g.addColorStop(0.22, '#aab2b9');
            g.addColorStop(0.44, '#f4f7f9');
            g.addColorStop(0.52, '#d3dae0'); g.addColorStop(0.78, '#949ca3');
            g.addColorStop(1.00, '#646b71');
        }
        ctx.fillStyle = g;
    } else {
        ctx.fillStyle = '#232527';                                 // base dark background (dark-mode CSS) [REF#EN-00094]
    }
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, W, H, 24); else ctx.rect(0, 0, W, H);
    ctx.fill();
    if (_flatPermit && !_washiPermit && permitJadeOn()) {   // jade: a thin deep-jade line inside the edge [REF#EN-00784]
        ctx.save(); ctx.strokeStyle = _singPermit ? PERMIT_SING_LINE : 'rgba(30,110,82,0.6)'; ctx.lineWidth = 3; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(9, 9, W - 18, H - 18, 17); else ctx.rect(9, 9, W - 18, H - 18);
        ctx.stroke(); ctx.restore();
    }
    if (_washiPermit) {
        // WASHI: faint fibres and a soft deckled edge, then the 許可 seal in the free top-right corner (kanji left, pill centre, the [REF#EN-00785]
        // porthole below). Seeded from the title so a card redraws the same. Everything is under 12% ink, so black type keeps 17:1.
        let _sd = 0; for (const ch of String(title || '')) _sd = (_sd * 31 + ch.charCodeAt(0)) >>> 0;
        const _rnd = () => { _sd = (_sd * 1664525 + 1013904223) >>> 0; return _sd / 4294967296; };
        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 0; i < 70; i++) {
            const x = _rnd() * W, y = _rnd() * H, a = _rnd() * Math.PI, L = 6 + _rnd() * 22;
            ctx.strokeStyle = (i % 3) ? 'rgba(140,110,70,0.10)' : 'rgba(255,255,255,0.45)'; ctx.lineWidth = 0.6 + _rnd() * 0.8;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + (_rnd() - 0.5) * 6, y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.stroke();
        }
        const _edge = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.62);
        _edge.addColorStop(0, 'rgba(120,90,50,0)'); _edge.addColorStop(1, 'rgba(120,90,50,0.16)');
        ctx.fillStyle = _edge; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0, 0, W, H, 24); else ctx.rect(0, 0, W, H); ctx.fill();
        // the seal: a vermilion square, 許 over 可, a few flecks of bare paper so it reads as stamped [REF#EN-00786]
        const _stamp = (typeof window !== 'undefined' && typeof window._permitStampColor === 'string') ? window._permitStampColor : PERMIT_STAMP;
        ctx.translate(218, 40); ctx.rotate(-0.14);
        ctx.globalAlpha = 0.92; ctx.strokeStyle = _stamp; ctx.lineWidth = 3.2;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-22, -22, 44, 44, 5); else ctx.rect(-22, -22, 44, 44); ctx.stroke();
        ctx.fillStyle = _stamp; ctx.font = '900 17px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('許', 0, -9); ctx.fillText('可', 0, 10);
        ctx.globalAlpha = 1; ctx.fillStyle = PERMIT_WASHI_FACE;
        for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.arc((_rnd() - 0.5) * 44, (_rnd() - 0.5) * 44, 0.5 + _rnd() * 1.1, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
    }

    // Thin theme-colored outer border (inset 1px to avoid corner tearing) [REF#EN-00095]
    ctx.strokeStyle = themeColor; ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(1, 1, W-2, H-2, 23); else ctx.rect(1, 1, W-2, H-2);
    ctx.stroke();
    // Subtle inner highlight ring [REF#EN-00096]
    ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(2, 2, W-4, H-4, 22); else ctx.rect(2, 2, W-4, H-4);
    ctx.stroke();

    // Kanji (theme-colored, top-left — but BLACK on a metal song card, where themeColor IS the face) [REF#EN-00097]
    // ── THE KANJI MUST NOT RUN UNDER THE TYPE PILL (Mark 2026-08-17: "why is the symbol clipped?") ──
    //    MEASURED, not guessed. The kanji is drawn LEFT-aligned from x=20 with no width guard; the type
    //    pill below is a 90px plate drawn CENTRED at W/2, i.e. x 83..173, and it is painted AFTER this,
    //    so it covers whatever ran under it. At 32px a four-glyph title like 黄泉の宿 measures ~128px and
    //    reaches x≈148 — a third of it is behind the plate. Two glyphs already touch it.
    //    Auto-scale into the gap, the same way the TITLE below does, rather than passing fillText's
    //    maxWidth: that argument CRUSHES glyphs horizontally, which on kanji reads as a broken font.
    //    Real card kanji are 1-4 glyphs: 歌 stays a full 32px, 黄泉の宿 lands at 13px. The floor is 10,
    //    not 12, so that even a 5-glyph tag keeps the full 8px gap instead of creeping into it —
    //    measured by probe-song-card-i18n.js, where a 12px floor left このゲーム 5px short.
    //    Derived from the pill's own geometry (W/2 - 45) so moving the pill moves this with it.
    const _kGap = 8;
    const _kMaxW = (W / 2 - 45) - 20 - _kGap;
    let _kSize = 32;
    ctx.font = '900 ' + _kSize + 'px sans-serif';
    while (_kSize > 10 && ctx.measureText(displayKanji).width > _kMaxW) {
        _kSize -= 1;
        ctx.font = '900 ' + _kSize + 'px sans-serif';
    }
    ctx.fillStyle = _isSong ? _ink : themeColor;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (_engrave(true)) { ctx.lineWidth = Math.max(3, _kSize * 0.14); ctx.strokeText(displayKanji, 20, 20); }
    ctx.fillText(displayKanji, 20, 20);

    // Type pill (theme-colored bg, top-center). On a song the pill would be face-on-face and vanish, [REF#EN-00098]
    // so it inverts to an ink plate with metal lettering — the one place the metal reads as the text.
    // ── PERMITS: GOLD PLATE, BLACK PRINT (Mark 2026-08-02: "make the skill label on singing gold
    //    with black print"). The permit pill took the theme path — silver-on-silver with white type,
    //    the blown-white chip in his screenshot. Now a solid gold plate with ink lettering, matching
    //    the gold title + gold attr strip so the permit face speaks one metal. Same two-key permit
    //    match as everywhere else. Dial: window._permitPillGold (bg) — black print is fixed.
    const _permitPill = !_isGamingCard && (isPermit || IS_PERMIT_CARD(title) || /PERMIT/i.test(String(displayAttr || '')));
    // ⚠ THE PILL FLIPS WITH THE FACE. It was a GOLD plate with black print, which was right on the old [REF#EN-00099]
    //    dark stock and is invisible now that the whole card is gold — plate-on-plate. A permit pill is
    //    now the DARK plate every metal card uses, carrying gold letters like the rest of the type.
    //    Dial: window._permitPillGold still forces a specific plate colour if Mark wants the old look.
    ctx.fillStyle = _permitPill
        ? ((typeof window !== 'undefined' && typeof window._permitPillGold === 'string') ? window._permitPillGold : (_singPermit ? PERMIT_SING_GOLD : 'rgba(0,0,0,0.72)'))
        : (_isSong ? 'rgba(0,0,0,0.72)' : themeColor);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(W/2 - 45, 20, 90, 30, 8); else ctx.rect(W/2-45, 20, 90, 30);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = '800 16px sans-serif';
    ctx.fillStyle = _permitPill ? (_flatPermit ? ((typeof window !== 'undefined' && typeof window._permitPillInk === 'string') ? window._permitPillInk : (_singPermit ? '#000000' : (_washiPermit ? PERMIT_WASHI_FACE : (permitJadeOn() ? permitPaleC() : '#a5d6a7')))) : _permitInk)
                  : _isSong ? ((_songRarity === 'LEGENDARY' || _isGamingCard) ? SONG_GOLD_FACE : SONG_SILVER_FACE)
                            : ((catId === 'GOLD_COIN') ? '#000000' : '#ffffff');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(_pillTxt, W/2, 35);

    // Title (auto-scaling to prevent overflow) [REF#EN-00100]
    ctx.fillStyle = _ink;
    // ── GOLD TITLES ON PERMITS (Mark 2026-08-02: "make the permits have GOLD text TITLES to seperate [REF#EN-00101]
    //    them from normal cards") — the same two keys as the green label strip below (room-permit
    //    title set + a "… PERMIT" label), and the same gold as the old label standard so a permit's
    //    face reads one voice: gold name, green permit strip. Every other card's title stays _ink —
    //    the 07-19 white-title hierarchy note below is superseded FOR PERMITS ONLY.
    //    Dial: window._permitTitleColor.
    if (!_isGamingCard && (isPermit || IS_PERMIT_CARD(title) || /PERMIT/i.test(String(displayAttr || ''))))
        ctx.fillStyle = (typeof window !== 'undefined' && typeof window._permitTitleColor === 'string') ? window._permitTitleColor : (_flatPermit ? _ink : '#FFD700');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let titleSize = 32;
    ctx.font = `900 ${titleSize}px sans-serif`;
    while (ctx.measureText(_titleTxt).width > W*0.85 && titleSize > 12) {
        titleSize -= 1;
        ctx.font = `900 ${titleSize}px sans-serif`;
    }
    // ── A LONG NAME BREAKS ONTO TWO LINES INSTEAD OF SHRINKING TO A WHISPER (Mark 2026-09-11: "magic auto [REF#EN-00628]
    //    missile title = looks stupid compared to our other cards, how about Magic Auto Missile (two lines)").
    //    The single-line shrink above is kept for names that only need a nudge; when it would have to drop
    //    under 24px and the name has a space, the name is split at the space nearest its middle and drawn as
    //    two lines around the same y=90 centre, each line sized to fit. Knob: window._cardTitleTwoLineBelow (24).
    let _titleLines = [_titleTxt], _titleGap = 0;
    const _twoBelow = (typeof window !== 'undefined' && typeof window._cardTitleTwoLineBelow === 'number') ? window._cardTitleTwoLineBelow : 24;
    if (titleSize < _twoBelow && /\s/.test(_titleTxt.trim())) {
        const words = _titleTxt.trim().split(/\s+/); let best = null, bestDiff = Infinity;
        for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '); const d = Math.abs(a.length - b.length); if (d < bestDiff) { bestDiff = d; best = [a, b]; } }
        if (best) {
            titleSize = 28; ctx.font = `900 ${titleSize}px sans-serif`;
            while (Math.max(ctx.measureText(best[0]).width, ctx.measureText(best[1]).width) > W*0.85 && titleSize > 14) { titleSize -= 1; ctx.font = `900 ${titleSize}px sans-serif`; }
            _titleLines = best; _titleGap = titleSize * 1.02;
        }
    }
    for (let i = 0; i < _titleLines.length; i++) {
        const _ty = 90 + (i - (_titleLines.length - 1) / 2) * _titleGap;
        if (_engrave(true)) { ctx.lineWidth = Math.max(3, titleSize * 0.16); ctx.strokeText(_titleLines[i], W/2, _ty); }
        ctx.fillText(_titleLines[i], W/2, _ty);   // localized for SONG cards only; raw `title` everywhere logic reads it [REF#EN-00102]
    }

    // Desc (gray, centered, wrapped). Mark 2026-07-12 "better align the text so it doesn't clip the plastic balls": pulled [REF#EN-00103]
    // up 130→112 + tighter line-height 22→20 so the (up to 2-line) desc sits clear ABOVE the porthole/ball (porthole top =
    // H*0.58−60 ≈ 163; the 3D bubble bulges above it into the old 152 line). Title is at y=90 so there's still headroom.
    // #999999 is tuned for the dark stock; on a bright metal face it is the one value that disappears
    // completely (grey on silver). Songs get soft black instead — still subordinate to the title, still legible.
    // SIZE: Mark 2026-08-04 — "that was supposed to have been text reduced and centered properly". The
    // desc is flavour text under a 32px title; at 17px it competed with the title and filled the card
    // width edge to edge. 15px keeps it comfortably legible for kids while reading as subordinate.
    // Because the band below is DERIVED, changing this size re-centres the block automatically — that is
    // the whole point of the change, and it is why this number is now safe to dial.
    // Knob: window._cardDescSize.
    const _descPx = (typeof window !== 'undefined' && typeof window._cardDescSize === 'number') ? window._cardDescSize : 15;
    ctx.font = `500 ${_descPx}px sans-serif`; ctx.fillStyle = _singPermit ? PERMIT_SING_GOLD_DIM : (_flatPermit ? '#000000' : (_isSong ? 'rgba(0,0,0,0.66)' : '#999999'));
    // ── THE DESC IS CENTRED IN ITS BAND, AND THE BAND IS DERIVED (Mark 2026-08-04, reported 12+ times [REF#EN-00104]
    //    as "fixed" and never was: "the text is not properly vertically aligned - its jammed too much
    //    to the top"). MEASURED off the rendered 256x384 canvas, which is how this was finally caught:
    //      title band [76,100] · desc block [107,129] centre 118 · HOLE TOP 186 · hole centre 231.6
    //    The band the desc may occupy is title-bottom(100) -> hole-top(186), centre 143. The block sat
    //    at 118 — TWENTY-FIVE PIXELS HIGH — which is exactly the jam Mark keeps reporting.
    //    ⚠ WHY EVERY HAND-RETUNE FAILED. The old literal `112` came from a 2026-07-12 pull-up "130->112
    //    so the desc sits clear ABOVE the porthole (porthole top = H*0.58-60 ~= 163)". The porthole
    //    fraction has since moved to CARD_PORTHOLE_FRAC = 0.603, so its real top is 186, not 163 — the
    //    justification went stale and the literal stayed. Re-tuning the literal by hand just re-runs the
    //    same drift; this file already warns about exactly that failure mode next to CARD_PORTHOLE_FRAC
    //    ("which is exactly how a 'fixed' layout breaks again three edits later"). So the desc no longer
    //    carries a magic Y: it is CENTRED between the title and the hole, both derived. Move the
    //    porthole again and the text follows on its own.
    //    Fixed-Y is kept as the fallback arg so a caller without a band still behaves as before.
    //    0.32 is MEASURED, not a half-em guess: the title renders as band [76,100] around its
    //    baseline-middle y=90 at titleSize 32, so its visible bottom sits ~0.32*size below centre, not
    //    the 0.5 a font's em-box would imply. Using 0.5 put the band top at 106 and landed the block at
    //    147 against an ideal 143 — right, but 4px shy, and this card has been "nearly right" enough
    //    times already.
    const _titleBottom = 90 + (_titleLines.length - 1) / 2 * _titleGap + titleSize * 0.32;   // title is baseline-middle at y=90; a two-line title's bottom is half a gap lower [REF#EN-00105]
    const _holeTop = H * CARD_PORTHOLE_FRAC - (H * 0.1172);     // hole half-height, measured: 231.6-186 [REF#EN-00106]
    _wrapText(ctx, _descTxt, W/2, 112, W*0.8, 20, _titleBottom, _holeTop);   // localized for SONG cards only [REF#EN-00107]

    // cleanCardURL is dead code — setting to empty string to avoid heavy CPU/GPU read-back stalls (toDataURL) [REF#EN-00108]
    const cleanCardURL = '';

    // Deep icon-cavity (porthole) hole cutout [REF#EN-00109]
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(W/2, H*CARD_PORTHOLE_FRAC, 60, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Inner shadow gradient around the hole — gives the porthole depth [REF#EN-00110]
    const holeGrad = ctx.createRadialGradient(W/2, H*CARD_PORTHOLE_FRAC, 45, W/2, H*CARD_PORTHOLE_FRAC, 60);
    holeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    holeGrad.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = holeGrad;
    ctx.beginPath(); ctx.arc(W/2, H*CARD_PORTHOLE_FRAC, 60, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 3; ctx.stroke();

    // Solid black bottom block for attribute (no separator line) [REF#EN-00111]
    // ── NOT ON A PERMIT (2026-09-30) ─────────────────────────────────────────────────────────────
    //    This plate is inset 1px from each edge and rounded at radius 23, so against a dark face it is
    //    invisible EXCEPT for that inset — which reads as a broken line across the bottom of the card
    //    and a seam at each lower corner. It earns its keep on a dark card where the gold attribute
    //    needs a plate; a permit already has its own face and does not.
    //    Restore it: window._permitBottomBlock = true.
    const _bottomBlock = !(_isPermitCard && (typeof window === 'undefined' || window._permitBottomBlock !== true));
    if (_bottomBlock) {
        ctx.fillStyle = 'rgba(10, 10, 12, 0.8)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(1, H-50, W-2, 49, [0, 0, 23, 23]);
        else ctx.rect(1, H-50, W-2, 49);
        ctx.fill();
    }

    // Attribute text inside the black block — GOLD on EVERY loot card (Mark 2026-07-19: "SKILL CARDS NEED TO [REF#EN-00112]
    // HAVE GOLD LABELS ALL LOOT CARDS TOO"). This is the bottom label strip — (GAMBLE) · DICE PERMIT ·
    // (DMG x 2DICE) · (HEAL) — and it was plain white on the black block. Applied here rather than per-branch
    // so it lands on every card the builder makes at once: loot on the floor, the vending mini-cards and the
    // inventory faces all render through this same canvas.
    // Matches the price line below (already #FFD700), so a card's two readouts now share one accent.
    // The TITLE above stays white on purpose — it is the item's name, and white-on-gold-on-dark keeps the
    // hierarchy readable. Say the word and it goes gold too. Dial: window._cardLabelColor.
    ctx.font = '800 18px sans-serif';
    // GREEN LABEL ON EVERY PERMIT (Mark 2026-08-02: first "singing card needs green label", then same [REF#EN-00113]
    // day "add that green color to all skill cards that are permits - do it for them all"). An
    // exception to his 07-19 "gold labels on all loot cards" rule above; both rulings recorded.
    // TWO keys, because permits arrive two ways: room permits by TITLE (_PERMIT_TITLES — SINGING,
    // TAVERN PERMIT, …) and the gambling trio (DICE/POKER/BLACKJACK) whose titles are game names but
    // whose label strip literally says "… PERMIT". Either match ⇒ green. Dial: window._permitLabelColor.
    // ── ALL-GOLD A/B (Mark 2026-08-02 evening: "lets make all skill attributes golden text, see if
    //    it looks better") — the green permit strips were the ONLY non-gold attribute text left, so
    //    this trial returns them to the 07-19 all-gold standard. The green ruling is NOT deleted:
    //    window._permitLabelGreen = true restores it exactly (color still dialed by _permitLabelColor).
    //    Both same-day rulings recorded above; whichever look wins, flip the one knob.
    const _permitGreen = (typeof window !== 'undefined' && window._permitLabelGreen === true
                          && (isPermit || IS_PERMIT_CARD(title) || /PERMIT/i.test(String(displayAttr || ''))))
        ? ((typeof window._permitLabelColor === 'string') ? window._permitLabelColor : '#3EE07D')
        : null;
    // ⚠ WITHOUT THE PLATE, THE ATTRIBUTE SITS ON THE FACE ITSELF, so it takes that face's own ink. [REF#EN-00787]
    //   Gold was chosen to read on the dark plate above; on the apple-green permit, with the plate gone,
    //   gold on green is about 2:1 and the strip would be the least legible thing on the card. The black
    //   SINGING permit keeps gold, because gold on black is 15.3:1 — the same `_permitInk` either way,
    //   which is why this reads it rather than picking a second colour that could drift from the title.
    ctx.fillStyle = (!_bottomBlock && _isPermitCard) ? _permitInk
                  : (_permitGreen || ((typeof window !== 'undefined' && typeof window._cardLabelColor === 'string') ? window._cardLabelColor : '#FFD700'));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    _wrapText(ctx, displayAttr, W/2, H-25, W*0.9, 22);

    if (isShopItem) {
        ctx.font = '900 24px sans-serif';
        // y=308 is ABOVE the black block (which starts at H-50=334), so this sits on bare card. Gold-on-gold [REF#EN-00114]
        // would erase the price on a legendary song sold at the vending machine.
        ctx.fillStyle = _isSong ? _ink : '#FFD700';
        ctx.fillText(price + ' Gold', W/2, 308);
    }

    const result = { canvas, cleanCardURL };
    _canvasCache[cacheKey] = result;
    return result;
}

/* ── ARMOUR SLOT RESOLVER — NOW DERIVED, NOT RESTATED (Mark 2026-07-28: "link them all together") ──── [REF#EN-00115]
   This used to be its own hand-kept list of titles, which meant armour was described in THREE files that
   had to agree and were linked by nothing. It now reads the SAME table the drops come from
   (js/v8/data/LootTables.js), so adding a piece there gives it a model here automatically and the classic
   failure — a new piece silently rendering as a grey cube — cannot happen by omission any more.
   Loaded lazily and cached: LootTables is pure data with no imports of its own (no cycle, lint:imports
   confirms), but this module is imported by the engine during boot and a static import would pull the loot
   database into that critical path for a function that is only ever called when a card is built.
   FALLBACK IS DELIBERATE AND NOT DEAD CODE: if the import has not resolved on the very first card of a
   session, the inline map answers instead. Losing a model on card #1 because a fetch was in flight would
   be a visible bug for a purely structural change. */
let _armourSlotFn = null;
const _ARMOUR_FALLBACK = {
    'CHEST ARMOR': 'chest', 'CHEST ARMOUR': 'chest', 'ARMOR': 'chest', 'ARMOUR': 'chest', 'CUIRASS': 'chest',
    'DO': 'chest', 'DOMARU': 'chest', 'HARAMAKI': 'chest', 'OYOROI': 'chest', 'YOROI': 'chest',
    'JINGASA': 'head', 'HACHIGANE': 'head', 'WAR HAT': 'head', 'HEADBAND': 'head',
    'GREAVES': 'legs', 'SUNEATE': 'legs', 'HAIDATE': 'legs', 'SHIN GUARDS': 'legs',
    'GAUNTLETS': 'arms', 'GAUNTLET': 'arms', 'KOTE': 'arms', 'SODE': 'arms', 'BRACERS': 'arms', 'BRACER': 'arms', 'GLOVES': 'arms',
    'BOOTS': 'feet', 'WARAJI': 'feet', 'TABI': 'feet', 'SANDALS': 'feet',
};
try {
    import('../data/LootTables.js?v=8.4.1537-stamped')
        .then(m => { if (m && typeof m.ARMOUR_SLOT_OF === 'function') _armourSlotFn = m.ARMOUR_SLOT_OF; })
        .catch(() => {});   // fallback below already covers this [REF#EN-00116]
} catch (_) {}
export function ARMOUR_SLOT_OF(title) {
    if (_armourSlotFn) { try { return _armourSlotFn(title); } catch (_) {} }
    const t = String(title || '').replace(/\s*x\d+$/i, '').replace(/\s*\+\d+\s*/, '').trim().toUpperCase();
    if (!t || t.includes('SHIELD')) return null;
    return _ARMOUR_FALLBACK[t] || null;
}

// ── GUNMETAL, NOT CHROME (Mark 2026-09-11: "tune down the silver color of them for a more realistic texture on those [REF#EN-00624 → see REF#PN-02167]
//    models"). One pass for every Sketchfab gun on a card (both guns, deck row AND world ball — same text in
//    Origami.RealityEngine.Panels.html). A neutral-grey untextured material (the .38's frame, sRGB ~#a9a9a9) is pulled toward
//    gunmetal and given a metal/rough pair so the card light shades it instead of flooding it; a textured material
//    (the Stinger's near-black albedo, mean #333) is dimmed and made MATTE — its deck-rig light grey measured as specular,
//    unchanged with glow 0, so roughness 0.75 / metalness ≤0.15 is what darkens it. Self-light is a FRACTION of each material's own colour —
//    the old flat 0.28 emissive on every material is what read as chrome. Knobs: window._gunSilverTone (0.58, lower =
//    darker silver), window._gunGlow (0.30 of own colour; textured guns get half).
const _gunmetalPass = (s, o) => {
  const black = !!(o && o.black);
  // ⛔ SUPERSEDED 2026-09-12 (same day) by Mark: "that mac-9 smg model needs same color texture as that magic lantern [REF#EN-00637]
  //    has - that reflective black." The earlier "total matte black" (roughness 1, no metal) vanished into the dark
  //    ring in his screenshot. `lantern` = the MAGIC LANTERN's own body material, verbatim (~:1286: 0x111111,
  //    metalness 0.8, roughness 0.2) — a lit glossy black that catches the lantern light the way the flashlight does.
  //    Maps dropped so the silver texture cannot come back through the gloss. Revert to matte: window._gunMatte = true.
  const lantern = !!(o && (o.lantern || o.matte)) && window._gunMatte !== true;
  if (lantern) {
    s.traverse(o => {
      if (!(o.isMesh && o.material)) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m.color) continue;
        m.map = null; m.metalnessMap = null; m.roughnessMap = null; m.normalMap = null; m.emissiveMap = null; m.envMap = null;
        m.color.setHex(0x111111);
        if ('roughness' in m) { m.roughness = 0.2; m.metalness = 0.8; }
        if ('envMapIntensity' in m) m.envMapIntensity = 1.0;
        if (m.emissive) { m.emissive.setHex(0x000000); m.emissiveIntensity = 1; }
        m.needsUpdate = true;
      }
    });
    return s;
  }
  const matte = !!(o && o.matte);   // Mark 2026-09-12 "make model for mack-9 total matte black": drop the texture map entirely — one flat near-black, roughness 1, no metal, a whisper of self-light so it reads against the dark ball [REF#EN-00632]
  if (matte) {
    const flat = (typeof window._gunMatteTone === 'number') ? window._gunMatteTone : 0.06;
    s.traverse(o => {
      if (!(o.isMesh && o.material)) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m.color) continue;
        m.map = null; m.metalnessMap = null; m.roughnessMap = null; m.normalMap = null; m.emissiveMap = null; m.envMap = null;
        m.color.setRGB(flat, flat, flat);
        if ('roughness' in m) { m.roughness = 1.0; m.metalness = 0.0; }
        if ('envMapIntensity' in m) m.envMapIntensity = 0.0;
        if (m.emissive) { m.emissive.setRGB(flat * 1.4, flat * 1.4, flat * 1.4); m.emissiveIntensity = 1; }   // self-light ~8% grey: still reads as matte black, never vanishes in a dark ball [REF#EN-00633]
        m.needsUpdate = true;
      }
    });
    return s;
  }   // Mark 2026-09-11 on the MAC-9: "Make it black not silver texture gun model" — near-black albedo, matte, almost no self-light [REF#EN-00629 → see REF#PN-02173]
  const tone = (typeof window._gunSilverTone === 'number') ? window._gunSilverTone : 0.58;
  const glow = (typeof window._gunGlow === 'number') ? window._gunGlow : 0.30;
  s.traverse(o => {
    if (!(o.isMesh && o.material)) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (!m.color || !m.emissive) continue;
      const c = m.color, grey = Math.abs(c.r - c.g) < 0.06 && Math.abs(c.g - c.b) < 0.06;
      if (!m.map && grey && c.r > 0.22) { c.multiplyScalar(black ? 0.12 : tone); if ('metalness' in m) { m.metalness = black ? 0.0 : 0.55; m.roughness = black ? 0.92 : 0.50; } }
      else if (m.map) { c.multiplyScalar(black ? 0.12 : 0.80); if ('roughness' in m) { m.roughness = black ? 0.92 : Math.max(m.roughness || 0, 0.75); m.metalness = black ? 0.0 : Math.min(m.metalness || 0, 0.15); } }   // MEASURED 2026-09-11 (deck rig, glow 0): the Stinger's grey was SPECULAR, not self-light — its albedo averages #333 [REF#EN-00625 → see REF#PN-02168]
      m.emissive.copy(c).multiplyScalar(black ? glow * 0.2 : (m.map ? glow * 0.5 : glow)); m.emissiveIntensity = 1;
      m.needsUpdate = true;
    }
  });
  return s;
};

// ── THE BOB IS RELATIVE TO WHERE THE CARD PUT THE ICON, NEVER ABSOLUTE ───────────────────────────── [REF#EN-00626]
//    MEASURED 2026-09-11 (scripts/probe-gun-in-bubble-0911.js, live game): the .38 sat +59% of the ball
//    radius above centre, the MAC-9 +50%, x dead-centred. Cause: these updates wrote `m.position.y =
//    sin(t)*amp` onto the card's frontIcon, whose resting y is CARD_PORTHOLE_Y (-0.124) — every frame the
//    porthole offset was overwritten with ~0 and the whole icon rode 0.12 wu (62% of radius) high. Two
//    seats then "centred" the guns with negative icon-space offsets measured off screenshots and never
//    got back to the middle. Bob around the rest y the parent chose; the parent's choice is the truth.
const _bobRestY = (m) => { if (m.userData._bobRestY === undefined) m.userData._bobRestY = m.position.y; return m.userData._bobRestY; };

// The established Samurai Helmet card model, shared unchanged with Nemesis. [REF#EN-00788]
export function buildSamuraiHelmetModel() {
    const group = new THREE.Group();
    group.name = 'SamuraiKabutoModel';
    const addOutline = (mesh) => {
        const edges = new THREE.EdgesGeometry(mesh.geometry);
        mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
        })));
    };
    const helmetMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.3,
        side: THREE.DoubleSide,
    });
    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        metalness: 0.8,
        roughness: 0.2,
        side: THREE.DoubleSide,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), helmetMat);
    dome.position.y = -0.2;
    addOutline(dome);
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.4, 16, 1, false, Math.PI * 0.75, Math.PI * 1.5), helmetMat);
    guard.position.y = -0.4;
    addOutline(guard);
    const hornShape = new THREE.Shape();
    hornShape.moveTo(0, 0);
    hornShape.quadraticCurveTo(0.8, 0.8, 1.2, 1.8);
    hornShape.quadraticCurveTo(0.8, 0.4, 0.2, 0.2);
    hornShape.lineTo(0, 0);
    const hornGeo = new THREE.ExtrudeGeometry(hornShape, {
        depth: 0.1,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 2,
    });
    const horn1 = new THREE.Mesh(hornGeo, goldMat);
    horn1.position.set(0, 0.3, 0.9);
    horn1.rotation.z = -0.3;
    horn1.rotation.y = 0.2;
    addOutline(horn1);
    const horn2 = new THREE.Mesh(hornGeo, goldMat);
    horn2.position.set(0, 0.3, 0.9);
    horn2.rotation.y = Math.PI - 0.2;
    horn2.rotation.z = -0.3;
    addOutline(horn2);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), goldMat);
    boss.position.set(0, 0.4, 1.0);
    addOutline(boss);
    group.add(dome, guard, horn1, horn2, boss);
    group.scale.set(1.0, 1.0, 0.1);
    return group;
}

export function buildLegacyLootIcon({ catId, elId, originalTitle }) {
    const iconMesh = new THREE.Group();
    let customUpdate = null;
    const titleClean = String(originalTitle || '').replace(/\s*x\d+$/i, '').trim().toUpperCase();
    // ⚠ ARMOUR IS MATCHED BY AN EXPLICIT TITLE LIST, NOT A WORD-BOUNDARY REGEX. The first attempt used [REF#EN-00117]
    // /\b(...|GAUNTLET|...|YOROI|...)\b/ and it silently dropped SIX pieces to the fallback cube, including
    // GAUNTLETS — the ORIGINAL armour card — because \bGAUNTLET\b cannot match the plural, and OYOROI has no
    // word boundary before YOROI. A miss here is invisible: the card still builds, it is just a grey box, and
    // "the model is wrong" looks exactly like "the model is missing". An explicit list cannot half-match.
    // ADD NEW ARMOUR HERE **AND** in EQUIPMENT_POOL (LootTables.js) **AND** in window._AC_TABLE (Panels) —
    // probe-armor.js walks all three against each other precisely because nothing links them mechanically.

    // ── SPELL ELEMENT RESOLUTION (Mark 2026-06-14: vending machine spell cards showed [REF#EN-00118]
    //    a blank CUBE instead of the element model). Every caller passes elId = catId,
    //    which for spell cards is the CATEGORY 'SPELLS' — that matches none of the
    //    EARTH/FIRE/WIND/WATER branches below, so the icon fell through to the default
    //    BoxGeometry cube (~line 1368). Loot never tripped this (loot drops are weapons/
    //    potions, never spells); the vending machine is the first surface that sells
    //    spells. Fix: derive the real element from the card NAME. Only rewrites elId for
    //    known spell names — all other cards (weapons/items/SHURIKEN) pass through unchanged.
    const _SPELL_EL = {
        FIREBALL:'FIRE', PYROBLAST:'FIRE', COMET:'FIRE', EMBER:'FIRE',
        BOULDER:'EARTH', FISSURE:'EARTH', QUAKE:'EARTH',
        GALE:'WIND', CYCLONE:'WIND', GUST:'WIND',
        TIDE:'WATER', SURGE:'WATER', FROST:'WATER',
    };
    if (_SPELL_EL[titleClean]) elId = _SPELL_EL[titleClean];

    // ── THE RICE BOWL (Mark 2026-07-27: "create two food loot cards (steaming bowl of rice 3d model)") ────── [REF#EN-00119]
    //    ONE builder, TWO states, because they are the same object at two temperatures and the delivery job
    //    turns one into the other after a minute. `cold` swaps the steam for frost and the warm rim for a
    //    blue-white glaze — the silhouette stays identical so a player reads it instantly as "my delivery,
    //    ruined". Procedural on purpose: no GLB to fetch, nothing for the loader to miss, and it costs the
    //    scene a handful of tiny meshes rather than a download.
    //    Checked BEFORE the generic branches so a food card never falls through to the default cube.
    // GOHAN and FOOD DELIVERY share this model on purpose (Mark 2026-07-27) — the meal you carry for a
    // sleeping worker and the meal you eat yourself are the same bowl of rice, and they should look it.
    // ── THE SIX ATTRIBUTE CARDS (Mark 2026-09-12: "Add loot cards that add attributes (STRENGTH, …") — a lacquered
    //    training coin: red disc, gold rim, the score's kanji. Canvas texture on MeshBasic (unlit — the 09-12 glare law),
    //    a slow spin so it reads as a coin and not a sticker. Zero lights, one Basic program already in the family.
    // ── REBUILT 2026-09-23 (Mark: "fix this model - create a better medalian for attribute blessing card", screenshot of
    //    the 力 card): the old coin was R 1.25 × scale 1.9 = 2.38 wu hung at y −0.85, so it overflowed the porthole
    //    (~1.62, see the legendary record) and the ball sliced its right and bottom edges; a flat sticker with a "+1"
    //    under the kanji. Now it is a coin that fits: R 1.30 centred in the ball, a raised gold torus rim and reeded edge
    //    with the metal shading baked into a strip texture (still MeshBasic, still zero lights), an embossed gold kanji on
    //    lacquer, the name engraved round the top and 祝福 (blessing) round the bottom, a bail ring on top. Each score
    //    has its own lacquer so the six read apart at a glance. Face textures are cached per kanji (no canvas spam);
    //    faces are opaque (no transparent overdraw). Knobs: window._attrCoinScale · window._attrCoinOneColour = true (all red).
    const _ATTR_KANJI = { STRENGTH: '力', DEXTERITY: '巧', CONSTITUTION: '体', INTELLIGENCE: '知', WISDOM: '智', CHARISMA: '魅' };
    if (_ATTR_KANJI[titleClean]) {
        const kanji = _ATTR_KANJI[titleClean];
        const LACQUER = { STRENGTH: ['#d42a2f', '#5c0a10'], DEXTERITY: ['#1f9a6a', '#08382a'], CONSTITUTION: ['#c9701f', '#4a2206'],
                          INTELLIGENCE: ['#3566d6', '#0e1c52'], WISDOM: ['#8446cc', '#260c4a'], CHARISMA: ['#d8418c', '#520f30'] };
        const [hi, lo] = (window._attrCoinOneColour === true) ? LACQUER.STRENGTH : LACQUER[titleClean];
        const cache = _canvasCache.__attrCoin || (_canvasCache.__attrCoin = {});
        if (!cache.gold) {   // the metal: a strip whose V runs round the torus tube / up the edge — dark, hot highlight, dark, warm bounce [REF#EN-00702]
            const gc = document.createElement('canvas'); gc.width = 64; gc.height = 256; const gx = gc.getContext('2d');
            const gg = gx.createLinearGradient(0, 0, 0, 256);
            [[0, '#6b4a10'], [0.18, '#f7df8a'], [0.26, '#fff6d0'], [0.36, '#c99a2e'], [0.55, '#5a3c0a'], [0.75, '#b8862a'], [0.9, '#e9c860'], [1, '#6b4a10']]
                .forEach(([o, c]) => gg.addColorStop(o, c));
            gx.fillStyle = gg; gx.fillRect(0, 0, 64, 256);
            gx.fillStyle = 'rgba(40,24,0,.28)'; for (let x = 0; x < 64; x += 4) gx.fillRect(x, 0, 1.5, 256);   // reeding lines along U [REF#EN-00703]
            cache.gold = new THREE.CanvasTexture(gc); cache.gold.wrapS = cache.gold.wrapT = THREE.RepeatWrapping; cache.gold.repeat.set(24, 1);
        }
        const faceKey = kanji + hi;
        if (!cache[faceKey]) {
            const S = 512, C = S / 2, cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d');
            const g = ctx.createRadialGradient(C - 60, C - 70, 30, C, C, C); g.addColorStop(0, hi); g.addColorStop(1, lo);
            ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
            ctx.save(); ctx.translate(C, C);   // sunburst guilloché — fine rays that catch the eye as the coin turns [REF#EN-00704]
            for (let i = 0; i < 96; i++) { ctx.rotate(Math.PI * 2 / 96); ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.06)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -C); ctx.lineTo(6, -C); ctx.fill(); }
            ctx.restore();
            const ring = (r, w, c) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(C, C, r, 0, Math.PI * 2); ctx.stroke(); };
            ring(236, 14, '#8a6414'); ring(236, 5, '#f3d57a');            // inner lip under the torus [REF#EN-00705]
            ring(196, 3, '#f3d57a'); ring(160, 2, 'rgba(243,213,122,.75)');  // the engraved band between them [REF#EN-00706]
            for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; if (Math.abs(Math.sin(a)) < 0.35) continue; // beads on the sides, text top and bottom [REF#EN-00707]
                ctx.fillStyle = '#f3d57a'; ctx.beginPath(); ctx.arc(C + Math.cos(a) * 178, C + Math.sin(a) * 178, 4, 0, Math.PI * 2); ctx.fill(); }
            const arcText = (txt, top, font, step0) => {   // letters set round the band, upright for the reader top and bottom [REF#EN-00708]
                ctx.font = font; ctx.fillStyle = '#f7e2a0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const step = (top ? 1 : -1) * (step0 || Math.min(0.13, 1.5 / txt.length)); const a0 = (top ? -Math.PI / 2 : Math.PI / 2) - step * (txt.length - 1) / 2;
                for (let i = 0; i < txt.length; i++) { const a = a0 + step * i; ctx.save(); ctx.translate(C + Math.cos(a) * 178, C + Math.sin(a) * 178);
                    ctx.rotate(a + (top ? Math.PI / 2 : -Math.PI / 2)); ctx.fillText(txt[i], 0, 0); ctx.restore(); }
            };
            arcText(titleClean, true, '800 26px "Nunito", "Helvetica Neue", sans-serif');
            arcText('祝福', false, '700 30px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif', 0.2);
            const sheen = ctx.createRadialGradient(C - 70, C - 90, 10, C - 40, C - 60, 170);   // baked lacquer highlight [REF#EN-00709]
            sheen.addColorStop(0, 'rgba(255,255,255,.22)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheen; ctx.beginPath(); ctx.arc(C, C, 158, 0, Math.PI * 2); ctx.fill();
            // THE KANJI, EMBOSSED: shadow below-right, light above-left, gold body, dark hairline [REF#EN-00710]
            ctx.font = '700 240px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "Hiragino Sans", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const ky = C + 8;
            ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(kanji, C + 5, ky + 6);
            ctx.fillStyle = 'rgba(255,248,215,.85)'; ctx.fillText(kanji, C - 3, ky - 3);
            const kg = ctx.createLinearGradient(0, ky - 100, 0, ky + 100);
            [[0, '#fff3c0'], [0.35, '#f0c85a'], [0.62, '#a8761c'], [1, '#e8c060']].forEach(([o, c]) => kg.addColorStop(o, c));
            ctx.fillStyle = kg; ctx.fillText(kanji, C, ky);
            ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(70,40,0,.6)'; ctx.strokeText(kanji, C, ky);
            const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; cache[faceKey] = t;
        }
        const R = 1.30, HALF = 0.075;
        const goldMat = new THREE.MeshBasicMaterial({ map: cache.gold, toneMapped: false });
        const faceMat = new THREE.MeshBasicMaterial({ map: cache[faceKey], toneMapped: false });
        const coin = new THREE.Group();
        const face = new THREE.Mesh(new THREE.CircleGeometry(R, 64), faceMat); face.position.z = HALF;
        const back = face.clone(); back.position.z = -HALF; back.rotation.y = Math.PI;
        const edge = new THREE.Mesh(new THREE.CylinderGeometry(R, R, HALF * 2, 64, 1, true), goldMat); edge.rotation.x = Math.PI / 2;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 12, 72), goldMat);    // raised lip, proud of both faces [REF#EN-00711]
        const bail = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 24), goldMat); bail.position.y = R + 0.2; bail.rotation.y = Math.PI / 2;
        coin.add(edge, face, back, rim, bail); coin.position.y = -0.08;   // bail top lands at ~1.62, the face's edge [REF#EN-00712]
        coin.scale.setScalar(window._attrCoinScale || 1.0); iconMesh.add(coin);   // R 1.30 + rim 0.12 + bail = inside the ~1.62 face [REF#EN-00713]
        customUpdate = (t, m) => { coin.rotation.y = Math.sin(t * 0.8) * 0.75; coin.rotation.x = Math.sin(t * 0.55) * 0.08; m.position.y = _bobRestY(m) + Math.sin(t * 1.5) * 0.02; };
        return { iconMesh, customUpdate };   // like the food branch: return here or the DICE fallback at the end adds its cube on top [REF#EN-00635]
    }
    // ── ANT EGG / ROYAL EGG (Mark 2026-09-26: "can you design a Ant Egg loot card with a white grain of rice looking egg? :)") ── [REF#PENDING] [REF#EN-00715]
    //    Laid by an ant for every card it eats (Engine9 `_antEats`). A grain of rice that is alive: long pearly shell, the germ notch at
    //    one tip, faint grain streaks, the larva's curl showing through, and a shiver every ~3 s. ROYAL EGG: cream, gold-flecked, a
    //    little crown floating over it. Same recipe as the deck card (Panels el 'ANTEGG'/'ROYALEGG' — that file never imports this one).
    //    ~2.3 units tall → the caller's EXACT_SCALE 0.07 seats it in the dome like the tin. Must precede RICE: nothing here says RICE.
    else if (titleClean === "ANT EGG" || titleClean === "ROYAL EGG" || /\b(ANT|ROYAL) EGG\b/.test(titleClean) || /\b(ANT|ROYAL) EGG\b/.test(String(originalTitle || '').toUpperCase())) {
      const _royal = /ROYAL/.test(titleClean) || /ROYAL/.test(String(originalTitle || '').toUpperCase());
      const _E = new THREE.Group();
      // THE SHELL — a unit sphere pulled into a grain of rice: ~2.4x longer than wide, flattened a little, the top end slimmer, and the [REF#EN-00716 → see REF#PN-02658]
      // germ notch (the little bite at one tip of every rice grain) pressed in on one side.
      const _eGeo = new THREE.SphereGeometry(1, 48, 32);
      { const P = _eGeo.attributes.position;
        for (let i = 0; i < P.count; i++){ let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
          const u = (y + 1) / 2, w = 1 - 0.18 * Math.pow(u, 2.2);
          x *= 0.48 * w; z *= 0.40 * w; y *= 1.15;
          const dx = x - 0.20, dy = y - 1.0, d = Math.sqrt(dx * dx + dy * dy + z * z);
          if (d < 0.28){ const k = 1 - d / 0.28; x -= 0.11 * k * k; y -= 0.06 * k * k; }
          P.setXYZ(i, x, y, z); }
        _eGeo.computeVertexNormals(); }
      // the skin: pearly white with faint lengthwise grain streaks and, very faint, the curl of the larva inside [REF#EN-00717 → see REF#PN-02659]
      const _eCv = document.createElement('canvas'); _eCv.width = 256; _eCv.height = 512;
      { const g = _eCv.getContext('2d');
        const bg = g.createLinearGradient(0, 0, 0, 512);
        bg.addColorStop(0, _royal ? '#fff3cf' : '#fbfaf5'); bg.addColorStop(0.5, _royal ? '#fffaf0' : '#ffffff'); bg.addColorStop(1, _royal ? '#f6e6bb' : '#f1efe6');
        g.fillStyle = bg; g.fillRect(0, 0, 256, 512);
        for (let x = 0; x < 256; x += 9){ g.fillStyle = 'rgba(176,168,148,' + (0.10 + (x % 27 === 0 ? 0.10 : 0)) + ')'; g.fillRect(x, 0, 2, 512); }
        g.save(); g.filter = 'blur(10px)'; g.strokeStyle = _royal ? 'rgba(170,120,40,.34)' : 'rgba(140,128,110,.34)'; g.lineWidth = 34; g.lineCap = 'round';
        g.beginPath(); g.arc(64, 262, 58, -0.6, Math.PI * 1.25); g.stroke(); g.restore();
        if (_royal){ for (let i = 0; i < 70; i++){ g.fillStyle = 'rgba(214,160,40,' + (0.35 + Math.random() * 0.5) + ')'; g.beginPath(); g.arc(Math.random() * 256, 40 + Math.random() * 432, 1 + Math.random() * 3.2, 0, Math.PI * 2); g.fill(); } } }
      const _eTex = new THREE.CanvasTexture(_eCv); _eTex.anisotropy = 4;
      const _shell = new THREE.Mesh(_eGeo, new THREE.MeshStandardMaterial({ map: _eTex, color: 0xffffff, roughness: 0.36, metalness: 0.0,
        emissive: _royal ? 0x3a2a08 : 0x2a2824, emissiveIntensity: _royal ? 0.45 : 0.22 }));
      _E.add(_shell);
      let _crown = null;
      if (_royal){
        // gold flecks proud of the shell, and a little crown floating over the tip [REF#EN-00718 → see REF#PN-02660]
        const _gold = new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.25, metalness: 0.5, emissive: 0x6a4400, emissiveIntensity: 0.7 });
        for (let i = 0; i < 16; i++){ const a = Math.random() * Math.PI * 2, v = Math.random() * 1.6 - 0.8;
          const r = 1 - 0.18 * Math.pow((v / 1.15 + 1) / 2, 2.2);
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.025, 6, 5), _gold);
          f.position.set(Math.cos(a) * 0.48 * r * Math.sqrt(Math.max(0, 1 - (v / 1.15) ** 2)), v, Math.sin(a) * 0.40 * r * Math.sqrt(Math.max(0, 1 - (v / 1.15) ** 2))); _E.add(f); }
        _crown = new THREE.Group();
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.14, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.25, metalness: 0.5, emissive: 0x6a4400, emissiveIntensity: 0.7, side: THREE.DoubleSide }));
        _crown.add(band);
        for (let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2; const pt = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 8), _gold);
          pt.position.set(Math.cos(a) * 0.23, 0.15, Math.sin(a) * 0.23); _crown.add(pt);
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), _gold); b.position.set(Math.cos(a) * 0.23, 0.25, Math.sin(a) * 0.23); _crown.add(b); }
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshStandardMaterial({ color: 0xd0203a, roughness: 0.2, emissive: 0x6a0010, emissiveIntensity: 0.8 }));
        gem.position.set(0, 0.02, 0.24); _crown.add(gem);
        _crown.position.y = 1.36; _E.add(_crown);
      }
      _E.rotation.z = 0.32;   // lying a little on its side, the way a grain of rice rests [REF#EN-00719 → see REF#PN-02661]
      // it WRIGGLES: every ~3 s a quick shiver that dies away — something is alive in there [REF#EN-00720 → see REF#PN-02662]
      const _eggUpdate = (t) => {
        const ph = t % 3.1, tw = ph < 0.5 ? Math.sin(ph * 38) * 0.14 * (1 - ph / 0.5) : 0;
        _E.rotation.z = 0.32 + tw; _E.rotation.y = t * 0.7;
        if (_crown){ _crown.position.y = 1.36 + Math.sin(t * 2.0) * 0.06; _crown.rotation.y = -t * 1.4; }
      };
      _E.traverse((o) => { if (o.isMesh) { o.userData.keepDepth = true; o.renderOrder = 22; } });
      _E.position.y = 0.05; iconMesh.add(_E);
      customUpdate = (t) => { _eggUpdate(t); _E.position.y = 0.05 + Math.sin(t * 2.2) * 0.06; };
    }
    // ── BULLY CLUB (Mark 2026-09-26: "it also drops, call it Bully Club - a Police Baton model for it loot / playing card") ── [REF#PENDING] [REF#EN-00721]
    //    The floor half of the engine's _makeBullyClub: black side-handle baton, steel cap + knob, three violet rune bands (emissive, no
    //    light). Above the KATANA branch, which would otherwise draw a sword for catId KATANA.
    else if (titleClean === "BULLY CLUB" || /BULLY CLUB/.test(String(originalTitle || '').toUpperCase())) {
      const _B = new THREE.Group(), L = 1.9, r = L * 0.045;
      const _blk = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.4, metalness: 0.4 });
      const _grp = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 });
      const _stl = new THREE.MeshStandardMaterial({ color: 0xc8ccd8, roughness: 0.22, metalness: 0.9 });
      const _run = new THREE.MeshStandardMaterial({ color: 0x8a4dff, emissive: 0xa46bff, emissiveIntensity: 1.8, roughness: 0.4 });
      const _sh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, L, 18), _blk); _sh.position.y = L * 0.38; _B.add(_sh);
      const _hd = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, L * 0.24, 14), _grp); _hd.rotation.z = Math.PI / 2; _hd.position.set(L * 0.12, -L * 0.02, 0); _B.add(_hd);
      const _kn = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 12, 8), _stl); _kn.position.set(L * 0.24, -L * 0.02, 0); _B.add(_kn);
      const _cp = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), _stl); _cp.position.y = L * 0.88; _B.add(_cp);
      const _bt = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.12, L * 0.05, 14), _stl); _bt.position.y = -L * 0.12; _B.add(_bt);
      for (const f of [0.52, 0.64, 0.76]){ const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.12, r * 0.22, 6, 20), _run); band.rotation.x = Math.PI / 2; band.position.y = L * f; _B.add(band); }
      // GLOWING ETHEREAL BLUE OUTLINE (Mark 2026-09-27): a back-face shell a little larger than each body part, additive ice blue, pulsing. [REF#EN-00722]
      const _glow = new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.75, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
      for (const _p of [_sh, _hd, _kn, _cp, _bt]){ const _o = new THREE.Mesh(_p.geometry, _glow); if (_p.geometry.type === 'CylinderGeometry') _o.scale.set(1.45, 1.03, 1.45); else _o.scale.setScalar(1.3); _p.add(_o); }
      _B.traverse((o) => { if (o.isMesh) { o.userData.keepDepth = true; o.renderOrder = 22; } });
      _B.position.set(0, -0.55, 0); _B.rotation.z = -0.5; iconMesh.add(_B);
      customUpdate = (t) => { _B.rotation.y = t * 0.9; _run.emissiveIntensity = 1.4 + Math.sin(t * 3.2) * 0.6; _glow.opacity = 0.62 + Math.sin(t * 2.6) * 0.15; _B.position.y = -0.55 + Math.sin(t * 2.0) * 0.05; };
    }
    // ── WAND OF FIREBALLS = THE SHORT LAUNCHER · ROCKETS = TWO ROUNDS (2026-09-29) ────────────────────────────────────── [REF#EN-00789]
    //    Both fell through to the DICE cube at the end of the second chain, which reads black in the unlit porthole. The
    //    picture now comes from BazookaModelBuilder.js, the builder the hand card draws too (Panels scenes 'BAZOOKA' and
    //    'ROCKETS'), so the two cannot drift. It is ONE merged mesh with its shading painted into vertex colours: one draw,
    //    no light. Radius 1.55 keeps every vertex inside the ~1.62 face. Returns here, like the rice bowl, so the second
    //    chain never adds its cube on top. Deep doc: knowledge/design/BAZOOKA_AND_EXPLOSION_2026-09-29.md §8
    else if (titleClean === "WAND OF FIREBALLS" || titleClean === "BAZOOKA" || titleClean === "ROCKETS") {
      const _o = { radius: 1.55, backdrop: { r: 3.0, z: -0.9 } };   // the disc (r 3.0 vs the hole's ~2.0) backs the see-through porthole even at a slant [REF#EN-00790]
      const _L = (titleClean === "ROCKETS") ? buildRocketPack(THREE, _o) : buildShortLauncher(THREE, _o);
      _L.userData.keepDepth = true; _L.renderOrder = 22;   // solid volume: keep the depth buffer (the DICE lesson in the caller) [REF#EN-00791]
      iconMesh.add(_L);
      customUpdate = (t, m) => { _L.rotation.y = Math.sin(t * 0.7) * 0.14; m.position.y = _bobRestY(m) + Math.sin(t * 1.5) * 0.02; };
      return { iconMesh, customUpdate };
    }
    else if (titleClean.includes('RICE') || titleClean.includes('GOHAN') || titleClean.includes('FOOD DELIVERY')) {
        // ⚠ NEVER TEST FOR 'ICE' HERE. "RICE".includes("ICE") is TRUE, so a bare substring check marks the [REF#EN-00120]
        //    STEAMING bowl cold and silently deletes its steam — the card still builds, still looks like a
        //    bowl of rice, and simply never animates. Measured: both variants came back identical (34 meshes,
        //    no customUpdate) before this was caught. Match whole distinguishing words instead.
        const cold = /\b(COLD|FROZEN|ICECUBE|ICE CUBE)\b/.test(titleClean);
        const bowlG = new THREE.Group();
        // LACQUER BOWL — a lathe profile, so the wall has real thickness and an inner curve you can see into. [REF#EN-00121]
        const prof = [];
        for (let i = 0; i <= 10; i++){ const t = i / 10;
            prof.push(new THREE.Vector2(0.06 + Math.pow(t, 0.72) * 0.40, t * 0.30)); }
        prof.push(new THREE.Vector2(0.455, 0.315), new THREE.Vector2(0.40, 0.30));   // rolled rim, then back down inside [REF#EN-00122]
        for (let i = 10; i >= 1; i--){ const t = i / 10;
            prof.push(new THREE.Vector2(0.03 + Math.pow(t, 0.72) * 0.37, t * 0.30 + 0.012)); }
        const bowl = new THREE.Mesh(
            new THREE.LatheGeometry(prof, 40),
            new THREE.MeshStandardMaterial({ color: cold ? 0x2c3d52 : 0x3a1410, roughness: 0.32, metalness: 0.12,
                                             emissive: cold ? 0x0a1420 : 0x120404, emissiveIntensity: 0.5, side: THREE.DoubleSide }));
        bowlG.add(bowl);
        // A gold rim line — the konbini's little dignity. Warm gold hot, pale silver once it has gone cold. [REF#EN-00123]
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.435, 0.022, 8, 40),
            new THREE.MeshStandardMaterial({ color: cold ? 0x9fb4c4 : 0xd4a843, roughness: 0.3, metalness: 0.85 }));
        rim.rotation.x = Math.PI / 2; rim.position.y = 0.315; bowlG.add(rim);
        // THE RICE — a mounded dome of packed grains. [REF#EN-00124]
        const mound = new THREE.Mesh(new THREE.SphereGeometry(0.335, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
            new THREE.MeshStandardMaterial({ color: cold ? 0xdfe7ef : 0xfdfbf4, roughness: cold ? 0.45 : 0.88,
                                             metalness: 0, emissive: cold ? 0x2a3a4a : 0x141210, emissiveIntensity: 0.35 }));
        mound.position.y = 0.245; bowlG.add(mound);
        for (let i = 0; i < 26; i++){                                  // individual grains catching the light [REF#EN-00125]
            const g = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5),
                new THREE.MeshStandardMaterial({ color: cold ? 0xeaf2fa : 0xfffdf6, roughness: cold ? 0.4 : 0.95 }));
            const a = (i / 26) * Math.PI * 2 * 3.4, r = 0.06 + (i % 5) * 0.055;
            g.position.set(Math.cos(a) * r, 0.30 + Math.cos(r * 3.6) * 0.055, Math.sin(a) * r);
            g.scale.set(1, 0.62, 1.5); g.rotation.y = a; bowlG.add(g);
        }
        const wisps = [];
        if (cold) {
            // FROZEN: ice cubes sitting on the rice + a frost sheen. Mark's "icecube bowl of rice" — the joke [REF#EN-00126]
            // reads best when it is unmistakably ICE, not just a paler bowl.
            const iceMat = new THREE.MeshStandardMaterial({ color: 0xcfe9ff, roughness: 0.06, metalness: 0.0,
                transparent: true, opacity: 0.72, emissive: 0x6fb4e8, emissiveIntensity: 0.55 });
            for (let i = 0; i < 5; i++){
                const c = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), iceMat);
                const a = (i / 5) * Math.PI * 2 + 0.4;
                c.position.set(Math.cos(a) * 0.16, 0.40 + (i % 2) * 0.07, Math.sin(a) * 0.16);
                c.rotation.set(a * 0.7, a, a * 0.35); bowlG.add(c);
            }
        } else {
            // STEAMING: three wisps that rise, fade and restart — the whole point of the hot card. [REF#EN-00127]
            const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.30, depthWrite: false });
            for (let i = 0; i < 3; i++){
                const w = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), steamMat.clone());
                w.position.set((i - 1) * 0.13, 0.44 + i * 0.05, 0);
                w.userData._phase = i * 0.66; bowlG.add(w); wisps.push(w);
            }
        }
        // ── THE CHOPSTICKS (Mark 2026-08-06: "a large big steaming bowl of rice with 2 chopsticks in [REF#EN-00128]
        //    it. cute photo realistic model") ──────────────────────────────────────────────────────
        //    ⚠ CULTURAL NOTE, DELIBERATE AND WORTH KEEPING: chopsticks stood upright IN the rice is
        //      立て箸 / 仏箸 — the offering laid at a Japanese funeral altar, and a hard taboo at any
        //      normal meal. In a game literally named for 黄泉 (Yomi, the land of the dead), that is
        //      not an error to sand off; it is the single most on-theme detail this bowl could carry,
        //      and it is what Mark asked for in as many words. Recorded here so no future seat
        //      "corrects" it to a polite pair resting on the rim. To get the polite version anyway:
        //      window._gohanRestingSticks = true.
        //    Two tapered sticks (real chopsticks are square-topped and round-tipped — a 4-sided lathe
        //    reads correctly at card scale and costs 2 meshes). They share ONE material, so this adds
        //    a single program-free MeshStandardMaterial to the card.
        const _polite = (typeof window !== 'undefined' && window._gohanRestingSticks === true);
        const stickMat = new THREE.MeshStandardMaterial({
            color: cold ? 0xa89880 : 0xc8a170, roughness: 0.62, metalness: 0.04,
            emissive: 0x140d06, emissiveIntensity: 0.35,
        });
        for (const _s of [-1, 1]) {
            // shorter, thicker, planted (Mark 2026-09-14 "put chopsticks for GOHAN model in the rice") — the deck twin in Panels [REF#EN-00642]
            // (~:12245) carries the same numbers; both or neither
            const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.05, 0.70, 5), stickMat);
            if (_polite) {
                // resting across the rim, the everyday way [REF#EN-00129]
                stick.position.set(_s * 0.05, 0.36, 0.10);
                stick.rotation.set(Math.PI / 2 - 0.06, 0, 0.16 + _s * 0.03);
            } else {
                // STANDING IN THE RICE — planted deep enough that the taper disappears into the mound, [REF#EN-00130]
                // with a slight splay so they read as two sticks rather than one thick post.
                stick.position.set(_s * 0.075, 0.58, -0.02 + _s * 0.02);
                stick.rotation.set(0.07 * _s, 0.5, _s * 0.12);
                for (let k = 0; k < 4; k++){ const gr2 = new THREE.Mesh(new THREE.SphereGeometry(0.036, 6, 5), mound.material); const ak = k * 1.6 + _s; gr2.position.set(_s * 0.075 + Math.cos(ak) * 0.06, 0.585 + (k % 2) * 0.012, -0.02 + _s * 0.02 + Math.sin(ak) * 0.06); gr2.scale.set(1, 0.6, 1.4); gr2.rotation.y = ak; bowlG.add(gr2); }   // grains heaped at the stick's foot [REF#EN-00643 → see REF#PN-02272]
            }
            bowlG.add(stick);
        }
        // BIGGER — Mark's "large big". The bowl sat at 1.15 with a 0.455 outer radius, i.e. ~0.52 in [REF#EN-00131]
        // card space, which reads small against the other card models (the legendary record fills to
        // R≈1.62). Knob: window._gohanBowlScale.
        // 1.75 → 2.7 (Mark 2026-09-14 "bigger ricebowl model", screenshot of the card with the bowl a small lump under the
        // bubble's highlight): the bowl's outer diameter goes from 14 % of the porthole to ~43 %, the presence the medal and
        // the record have. Seated a little low so the mound and the planted sticks take the upper half of the hole.
        bowlG.scale.setScalar((typeof window !== 'undefined' && window._gohanBowlScale) || 2.7);
        bowlG.position.y -= 0.55;
        iconMesh.add(bowlG);
        if (wisps.length) {
            customUpdate = (t) => {
                for (const w of wisps){
                    const p = ((t * 0.55) + w.userData._phase) % 1;      // 0→1 rise cycle [REF#EN-00132]
                    w.position.y = 0.42 + p * 0.42;
                    w.scale.setScalar(0.6 + p * 1.5);                    // billows as it climbs [REF#EN-00133]
                    w.material.opacity = 0.34 * (1 - p) * (p < 0.12 ? p / 0.12 : 1);   // fade in fast, out slow [REF#EN-00134]
                    w.position.x += Math.sin(t * 1.7 + w.userData._phase * 4) * 0.0012;
                }
            };
        }
        return { iconMesh, customUpdate };
    }

    // ── POKER SKILL (Mark 2026-07-05 "loot card that lets players LEARN POKER — plastic circle with 5 cards [REF#EN-00135]
    //    animated"). A fanned hand of 5 playing cards that riffles open/closed inside the loot medallion.
    //    Checked BEFORE the generic SKILL blade so the poker skill card shows CARDS, not a sword. ──
    // THIS `if` STARTS A SECOND CHAIN. The Bully Club (drawn in the chain above) has catId KATANA, so it fell through to the KATANA branch
    // below and got a sword beside its baton (measured 2026-09-27 on the loot icon). It stops here.
    if (titleClean === "BULLY CLUB") { /* baton drawn above */ }
    else if (titleClean.includes('POKER')) {   // POKER / POKER GAME / LEARN POKER all get the 5-card medallion (Mark 2026-07-06 renamed the card "POKER GAME") [REF#EN-00136]
      const fan = new THREE.Group();
      const N = 5, cardGeo = new THREE.PlaneGeometry(0.5, 0.72);
      // ROYAL FLUSH (Mark 2026-07-06 "make them a royal flush"): 10 · J · Q · K · A, all ONE suit (spades). [REF#EN-00137]
      const ranks = ['10', 'J', 'Q', 'K', 'A'];
      const suit = '♠', suitCol = '#141414';
      const cards = [];
      for (let i = 0; i < N; i++) {
        // PHOTOREAL CARD FACE (Mark 2026-07-06 "no red border, make it nicer photoreal"): rounded-corner ivory [REF#EN-00138]
        // stock with a soft top-lit sheen, a hairline cool-gray edge (NOT red), a big centre suit and classic
        // corner indices (rank over suit, mirrored bottom-right). Transparent outside the rounded rect → a real
        // card silhouette on the flat plane.
        const CW = 210, CH = 300, R = 20, M = 10;
        const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
        const cx = cv.getContext('2d');
        cx.clearRect(0, 0, CW, CH);
        const _round = (x, y, w, h, r) => { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); };
        // face + soft drop shadow (depth for the overlapping fan) [REF#EN-00139]
        cx.save(); cx.shadowColor = 'rgba(0,0,0,0.33)'; cx.shadowBlur = 9; cx.shadowOffsetY = 4;
        _round(M, M, CW - 2 * M, CH - 2 * M, R);
        const g = cx.createLinearGradient(0, M, 0, CH - M); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#fbfbf9'); g.addColorStop(1, '#e9e9e6');
        cx.fillStyle = g; cx.fill(); cx.restore();
        // hairline cool-gray rim (replaces the red border) [REF#EN-00140]
        _round(M, M, CW - 2 * M, CH - 2 * M, R); cx.lineWidth = 2.5; cx.strokeStyle = 'rgba(38,42,50,0.28)'; cx.stroke();
        cx.fillStyle = suitCol;
        // big centre suit [REF#EN-00141]
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.font = '600 132px Georgia, "Times New Roman", serif'; cx.fillText(suit, CW / 2, CH / 2 + 4);
        // corner index (rank over suit) — top-left, mirrored bottom-right [REF#EN-00142]
        const _corner = () => { cx.textAlign = 'center'; cx.textBaseline = 'alphabetic'; cx.font = '700 44px Georgia, serif'; cx.fillText(ranks[i], 34, 56); cx.font = '600 34px Georgia, serif'; cx.fillText(suit, 34, 92); };
        _corner();
        cx.save(); cx.translate(CW, CH); cx.rotate(Math.PI); _corner(); cx.restore();
        const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
        // SOLID CARDS IN THE BALL (Mark 2026-07-06 "let the cards not be transparent inside the circles"): alphaTest CUTOUT [REF#EN-00143]
        // (not alpha-blend) → each card face is fully OPAQUE with clean rounded edges, so it reads solid instead of veiled.
        // Pairs with the matte-plastic ball (no clearcoat glare) so the royal flush is clearly visible inside the medallion.
        const card = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
        card.userData._slot = i - (N - 1) / 2;                                // -2..+2 fan position [REF#EN-00144]
        fan.add(card); cards.push(card);
      }
      // FILL THE BALL, don't overflow it (Mark 2026-07-06 "cards INSIDE the plastic ball"). 5× overflowed the glass; [REF#EN-00145]
      // ~2.8 fills the medallion like a normal loot icon while staying contained. Tunable: window._pokerFanScale.
      fan.scale.setScalar(window._pokerFanScale ?? 2.8);
      iconMesh.add(fan);
      customUpdate = (t) => {
        const spread = 0.34 + Math.sin(t * 1.3) * 0.20;                       // fan opens & closes [REF#EN-00146]
        for (let i = 0; i < N; i++) {
          const c = cards[i], s = c.userData._slot;
          c.rotation.z = -s * spread;
          c.position.x = s * 0.17 * (0.55 + spread);
          c.position.y = -Math.abs(s) * 0.06 + Math.sin(t * 2.1 + i * 0.7) * 0.02;   // arc + tiny riffle bob [REF#EN-00147]
          c.position.z = i * 0.006;                                           // stack depth (no z-fight) [REF#EN-00148]
        }
        fan.rotation.y = Math.sin(t * 0.6) * 0.25;                           // slow 3D tilt [REF#EN-00149]
      };
    }
    // ⚠ POSITION IS LOAD-BEARING: this block MUST stay up here with POKER and BLACKJACK, ABOVE the generic [REF#EN-00150]
    // SKILL blade branch. Mark 2026-07-19 renamed the card to SKILL/'DICE GAME' (from ITEM/'DICE'), and it
    // immediately rendered a blade instead of dice: the generic SKILL branch matches on catId and fired
    // first, so the title-based dice branch further down was never reached. The POKER note below already
    // records this exact hazard — 'Checked BEFORE the generic SKILL blade'. Moving it, not re-guarding it.
    // As ITEM/'DICE' the title chain DID reach it, which is why it worked before the rename and not after.
    // ── DICE — a real pair of pipped dice, rolling slowly ────────────────────
    // Mark 2026-07-19: "needs real 3d dice its just a block of fast moving dice — add two slowly rolling dice
    // there" + "the 3d model for dice needs to have a higher z-index for view".
    // WHY HE SAW A BLOCK: this branch only matched the exact strings "DICE GAME"/"DICE_GAME", and the tavern
    // loot card added the same day is titled plain "DICE" — so it never matched and fell through to the generic
    // ITEM icon. Same silent-string-mismatch class as 'Hip_Hop_Dance' and 'cab-succubus'. Matched loosely now.
    // WHAT CHANGED beyond the match:
    //   · REAL DICE — ivory casino stock with recessed dark pips on ALL SIX faces, in the correct opposing
    //     layout (1-6, 2-5, 3-4 each sum to seven). The old pair had four dots total, stuck on one face each,
    //     so any rotation showed blank sides — which is precisely what reads as "a block".
    //   · SLOW ROLL — angular speed cut ~4x (2.2/1.5 rad/s -> 0.55/0.38) and the bounce halved, so they tumble
    //     like thrown dice settling instead of buzzing.
    //   · FORWARD IN THE CIRCLE — the group sits proud on +Z (window._diceCardZ, default 0.30) so the pair
    //     reads clearly through the plastic bubble instead of sinking into it. That is the "z-index" ask;
    //     there is no true z-index in 3D, so it is depth plus a small scale bump.
    else if (titleClean === "DICE" || titleClean === "DICE GAME" || titleClean === "DICE_GAME" || titleClean.includes("DICE")) {
      const diceGroup = new THREE.Group();
      const S = (typeof window !== 'undefined' && typeof window._diceEdge === 'number') ? window._diceEdge : 1.24;   // Mark 2026-07-19 "100% bigger" — was 0.62 [REF#EN-00151]
      const H = S / 2;
      const dieGeo = new THREE.BoxGeometry(S, S, S);
      // Casino ivory: bright, low metalness. The old pair was neon purple/teal at metalness 0.8, which under the [REF#EN-00152]
      // card's single fill light read as two glowing blocks rather than dice.
      // NO GLARE (Mark 2026-07-19 "remove reflective glare from the dice model mesh"): roughness to near-matte,
      // metalness and envMapIntensity to ZERO. At 0.34/0.05 the flat box faces caught the card's fill light as a
      // hard specular sheet — a bright wash across whichever face pointed at the lamp, which is the glare he saw.
      // A real casino die is matte cellulose; 0.92 roughness is that. emissive dropped too (it was lifting blacks).
      // ⛔ SUPERSEDED 2026-09-19 by Mark: "dice are there - they just have turned off illumination - fix that model".
      //    The "emissive dropped" line above left the dice with NO self-light, so wherever the card sits away from
      //    a lamp (the permit desk) they render black. Ivory now carries its own glow at 0.45 — matte stays matte,
      //    the specular sheet is still gone — so the pair reads in the dark. Knob: window._diceSelfLight (0.45).
      const _dsl = (typeof window !== 'undefined' && typeof window._diceSelfLight === 'number') ? window._diceSelfLight : 0.45;
      const mkBody = (tint) => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.0,
                                                                 emissive: tint, emissiveIntensity: _dsl });
      const die1 = new THREE.Mesh(dieGeo, mkBody(0xfaf6ec));   // ivory [REF#EN-00153]
      const die2 = new THREE.Mesh(dieGeo, mkBody(0xf3ece0));   // faintly warmer, so the pair reads as two objects [REF#EN-00154]
      const pipGeo = new THREE.SphereGeometry(S * 0.085, 10, 8);
      const pipMat = new THREE.MeshStandardMaterial({ color: 0x18120c, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.0,
                                                      emissive: 0x18120c, emissiveIntensity: _dsl * 0.6 });   // pips keep their contrast against the lit body [REF#EN-00682]
      // Standard pip layouts in face-local (u,v), unit square. Opposing faces sum to 7. [REF#EN-00155]
      const PIPS = {
        1: [[0, 0]],
        2: [[-1, 1], [1, -1]],
        3: [[-1, 1], [0, 0], [1, -1]],
        4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
        5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
        6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
      };
      const SPREAD = S * 0.26, OUT = H + S * 0.045;      // pip inset from centre, and how far proud of the face [REF#EN-00156]
      // face: axis + sign. Maps the 2D pip grid onto that face's plane. [REF#EN-00157]
      const FACES = [
        { n: [0, 0, 1],  u: [1, 0, 0], v: [0, 1, 0], val: 1 },
        { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], val: 6 },
        { n: [1, 0, 0],  u: [0, 0, -1], v: [0, 1, 0], val: 2 },
        { n: [-1, 0, 0], u: [0, 0, 1],  v: [0, 1, 0], val: 5 },
        { n: [0, 1, 0],  u: [1, 0, 0], v: [0, 0, -1], val: 3 },
        { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1],  val: 4 },
      ];
      // ⚠ PIPS ARE MERGED INTO ONE GEOMETRY — DO NOT GO BACK TO A MESH PER PIP. [REF#EN-00158]
      // My first version added each pip as its own THREE.Mesh. A die carries 21 pips (1+2+3+4+5+6), so a pair is
      // 42 meshes and two dice cards in the scene is 84 DRAW CALLS. Mark's census caught it within the hour —
      // "84 x Mesh·Standard·Sphere" against a healthy scene of ~250 total draws, alongside an Oni-Baba FPS protest
      // (49.6 -> 31.5 avg). Merging them costs one BufferGeometry per die at build time and turns 42 draws into 1.
      // Falls back to per-pip meshes ONLY if BufferGeometryUtils is unavailable, which would be a broken vendor
      // bundle, not a normal path.
      // ⚠ PIPS ARE ONE InstancedMesh PER DIE — DO NOT GO BACK TO A MESH PER PIP, AND DO NOT USE
      // BufferGeometryUtils HERE. Two failures already, both mine, both in this spot:
      //   1. A Mesh per pip = 21 draws per die, 84 for two dice cards. Mark's census caught it as
      //      "84 x Mesh·Standard·Sphere" against a healthy scene of ~250 total draws.
      //   2. The obvious fix — mergeBufferGeometries — THROWS in this vendored r128:
      //      "Cannot read properties of undefined (reading 'mergeBufferAttributes')". The outer function
      //      exists, so an `if (THREE.BufferGeometryUtils.mergeBufferGeometries)` guard passes, then it dies
      //      on an internal reference. That took the whole DICE card down with it (the tavern spawn and the
      //      prewarm both logged the throw). Checking for the outer symbol is NOT enough in this bundle.
      // InstancedMesh needs neither: core THREE, one draw call for all 21 pips, and no geometry surgery.
      const _dummy = new THREE.Object3D();
      const dressDie = (die) => {
        const spots = [];
        for (const f of FACES) {
          for (const [pu, pv] of PIPS[f.val]) {
            spots.push([
              f.n[0] * OUT + f.u[0] * pu * SPREAD + f.v[0] * pv * SPREAD,
              f.n[1] * OUT + f.u[1] * pu * SPREAD + f.v[1] * pv * SPREAD,
              f.n[2] * OUT + f.u[2] * pu * SPREAD + f.v[2] * pv * SPREAD,
            ]);
          }
        }
        try {
          const inst = new THREE.InstancedMesh(pipGeo, pipMat, spots.length);
          spots.forEach((s, i) => { _dummy.position.set(s[0], s[1], s[2]); _dummy.updateMatrix(); inst.setMatrixAt(i, _dummy.matrix); });
          inst.instanceMatrix.needsUpdate = true;
          inst.frustumCulled = false;              // it rides inside the card medallion; its own bounds are meaningless there [REF#EN-00159]
          die.add(inst);
        } catch (e) {
          // Last-resort only. Costs 21 draws per die, but a visible die beats a thrown card — the whole [REF#EN-00160]
          // medallion (and the loot card carrying it) is lost if this function throws.
          for (const s of spots) { const pip = new THREE.Mesh(pipGeo, pipMat); pip.position.set(s[0], s[1], s[2]); die.add(pip); }
        }
      };
      dressDie(die1); dressDie(die2);
      // ── KEEP THEM APART — THIS IS GEOMETRY, NOT TASTE (Mark 2026-07-19 "keep them apart dont let them merge") ── [REF#EN-00161]
      // A cube's bounding sphere has radius S*sqrt(3)/2, so two dice CANNOT intersect at any rotation only while
      // their centres are further apart than S*sqrt(3) = 2.15 at S=1.24. The old pair sat 0.735 apart with a
      // combined 1.07 reach — they were ALWAYS interpenetrating, at every angle. That is the "merge".
      // If you retune S or these offsets, re-check: |die1-die2| MUST exceed S*sqrt(3), and the y-bob in
      // customUpdate swings each centre by 0.07, so budget 0.14 of closing slack on top.
      const SEP = S * 0.866 * 1.08;                       // 1.16 at S=1.24 → centres 2.32 apart vs the 2.15 floor [REF#EN-00162]
      die1.position.set(-SEP * 0.707,  SEP * 0.707, 0);
      die2.position.set( SEP * 0.707, -SEP * 0.707, 0);
      die1.rotation.set(0.5, 0.8, 0.2);                  // start mid-tumble so neither shows a flat face on spawn [REF#EN-00163]
      die2.rotation.set(-0.9, 0.3, -0.4);
      diceGroup.add(die1, die2);
      diceGroup.position.z = (typeof window !== 'undefined' && typeof window._diceCardZ === 'number') ? window._diceCardZ : 0.30;   // proud of the bubble — Mark's "higher z-index" [REF#EN-00164]
      diceGroup.scale.setScalar((typeof window !== 'undefined' && typeof window._diceCardScale === 'number') ? window._diceCardScale : 1.0);
      // ── DEPTH OPT-OUT — the real cause of the "zindex error" ────────────────────────────────────────────── [REF#EN-00165]
      // The loot-card builder in Engine9 (~17200) traverses every icon mesh and forces transparent=true +
      // depthWrite=false, so the medallion reads through the glass dome. For a flat emblem that is right. For two
      // SOLID tumbling cubes it is fatal: with no depth buffer between them, the renderer sorts whole objects by
      // centre distance, so the far die's pips and body punch straight through the near die — they read as one
      // fused lump. Tagging them keepDepth makes that traverse leave their depth state alone (see Engine9).
      diceGroup.traverse(o => { if (o.isMesh) { o.userData.keepDepth = true; o.renderOrder = 22; } });
      iconMesh.add(diceGroup);

      customUpdate = (t, m) => {
        const sp = (typeof window !== 'undefined' && typeof window._diceRollSpeed === 'number') ? window._diceRollSpeed : 1;
        die1.rotation.x = 0.5 + t * 0.55 * sp;           // ~4x slower than the old 2.2 — a settling tumble, not a buzz [REF#EN-00166]
        die1.rotation.y = 0.8 + t * 0.38 * sp;
        die1.position.y = SEP * 0.707 + Math.sin(t * 1.4) * 0.07;
        die2.rotation.x = -0.9 - t * 0.42 * sp;
        die2.rotation.z = -0.4 + t * 0.50 * sp;
        die2.position.y = -SEP * 0.707 + Math.cos(t * 1.2) * 0.07;
        m.rotation.y = t * 0.22;                          // the medallion's own drift, also slowed [REF#EN-00167]
      };
    }
    // ── CARD GAME — deck box with expanding card planes ────────────────────── [REF#EN-00168]
    // ── BLACKJACK / 21 SKILL (Mark 2026-07-07 "blackjack loot card — 2 cards, one Ace and one Queen,
    //    animated inside the plastic ball → opens a 21 table game"). Two playing cards (A♠ + Q♥) that
    //    riffle open/closed inside the loot medallion — a NATURAL 21. Checked before the generic SKILL
    //    blade so the blackjack skill card shows CARDS, not a sword. Mirrors the POKER fan (2 cards). ──
    else if (titleClean.includes('BLACKJACK') || titleClean.includes('BLACK JACK') || titleClean === '21' || titleClean.includes('TWENTY-ONE')) {
      const fan = new THREE.Group();
      const cardGeo = new THREE.PlaneGeometry(0.5, 0.72);
      const faces = [ { rank: 'A', suit: '♠', col: '#141414' }, { rank: 'Q', suit: '♥', col: '#c21807' } ];   // Ace + a ten-value = a natural blackjack [REF#EN-00169]
      const cards = [];
      for (let i = 0; i < faces.length; i++) {
        const F = faces[i];
        // Same photoreal ivory card face as the POKER medallion (rounded stock, top-lit sheen, hairline [REF#EN-00170]
        // cool-gray rim, big centre pip + mirrored corner indices), so both game cards read consistent.
        const CW = 210, CH = 300, R = 20, M = 10;
        const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
        const cx = cv.getContext('2d'); cx.clearRect(0, 0, CW, CH);
        const _round = (x, y, w, h, r) => { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); };
        cx.save(); cx.shadowColor = 'rgba(0,0,0,0.33)'; cx.shadowBlur = 9; cx.shadowOffsetY = 4;
        _round(M, M, CW - 2 * M, CH - 2 * M, R);
        const g = cx.createLinearGradient(0, M, 0, CH - M); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#fbfbf9'); g.addColorStop(1, '#e9e9e6');
        cx.fillStyle = g; cx.fill(); cx.restore();
        _round(M, M, CW - 2 * M, CH - 2 * M, R); cx.lineWidth = 2.5; cx.strokeStyle = 'rgba(38,42,50,0.28)'; cx.stroke();
        cx.fillStyle = F.col; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.font = '600 128px Georgia, "Times New Roman", serif'; cx.fillText(F.suit, CW / 2, CH / 2 + 4);
        const _corner = () => { cx.textAlign = 'center'; cx.textBaseline = 'alphabetic'; cx.font = '700 46px Georgia, serif'; cx.fillText(F.rank, 34, 56); cx.font = '600 34px Georgia, serif'; cx.fillText(F.suit, 34, 92); };
        _corner(); cx.save(); cx.translate(CW, CH); cx.rotate(Math.PI); _corner(); cx.restore();
        const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
        const card = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
        card.userData._slot = i - (faces.length - 1) / 2;                     // -0.5 .. +0.5 [REF#EN-00171]
        fan.add(card); cards.push(card);
      }
      fan.scale.setScalar(window._blackjackFanScale ?? 2.6);                  // fill the medallion without overflowing the glass [REF#EN-00172]
      iconMesh.add(fan);
      customUpdate = (t) => {
        const spread = 0.5 + Math.sin(t * 1.3) * 0.28;                       // the two cards fan open & closed [REF#EN-00173]
        for (let i = 0; i < cards.length; i++) {
          const c = cards[i], s = c.userData._slot;
          c.rotation.z = -s * spread;
          c.position.x = s * 0.42 * (0.7 + spread);
          c.position.y = -Math.abs(s) * 0.05 + Math.sin(t * 2.1 + i * 0.9) * 0.02;   // gentle riffle bob [REF#EN-00174]
          c.position.z = i * 0.008;                                          // stack depth (no z-fight) [REF#EN-00175 → see REF#EN-00148]
        }
        fan.rotation.y = Math.sin(t * 0.6) * 0.28;                           // slow 3D tilt [REF#EN-00176 → see REF#EN-00149]
      };
    }
    // ── NINJA STEALTH — OWL EYES IN A HOOD (Mark 2026-08-13: "change this model ; should be owl eyes [REF#EN-00177]
    //    and the outline of a hood") ─────────────────────────────────────────────────────────────────
    //    WHAT WAS THERE: nothing. There was no NINJA STEALTH branch at all, so the card fell through to
    //    the generic SKILL blade and rendered as an unreadable green shape in a dark ball — which is why
    //    it says nothing about vanishing. This is a NEW branch, not an edited one.
    //
    //    ⚠ POSITION IS LOAD-BEARING, exactly like the BLACKJACK note above: it MUST sit ABOVE the generic
    //      SKILL blade branch or the sword wins the match again and nothing here is ever built.
    //
    //    MATCHED ON THREE SPELLINGS ON PURPOSE. The internal action name is 'NINJA STEALTH' (what
    //    spawnLootCard and the Panels deck pass), but i18n DISPLAYS it as plain 'STEALTH'
    //    (js/data/i18n.js:491, ninja_stealth) and its attr line is 'VANISH 60S'. A single-spelling test is
    //    the near-miss this file's own header warns about in blood — the card still builds, just wrong.
    //
    //    THE HOOD IS AN OUTLINE, LITERALLY — a stroked silhouette on a transparent plane, not a solid
    //    cowl. Mark asked for "the outline of a hood", and an outline is also the honest read for a
    //    vanish skill: there is no one in the hood. Two eyes float in the dark where a face is not.
    //    Cheap: 1 canvas texture + 4 small spheres, no lights (E15 light-count law — a glow here would
    //    cost a program recompile for set dressing), and the eyes are MeshBasicMaterial so they stay
    //    bright inside a dim medallion instead of going out with the room.
    else if (titleClean.includes('NINJA STEALTH') || titleClean === 'STEALTH' || titleClean.includes('VANISH')) {
      const hoodGrp = new THREE.Group();

      // ── the hood, as REAL GEOMETRY ─────────────────────────────────────────── [REF#EN-00178]
      // ⚠ v2 2026-08-13 — Mark: "fix the stealth card 3d model as requested". My first pass drew the
      //   hood as a STROKED CANVAS on a flat PlaneGeometry. That is 2D art standing up in a 3D card: it
      //   has no depth, it goes edge-on and vanishes as the medallion turns, and it is not a model. He
      //   asked for a 3D model and this is that — extruded tubes on 3D curves, so the outline has real
      //   thickness, real occlusion and a real silhouette from every angle the medallion drifts through.
      //
      //   WHY TUBES AND NOT A SOLID COWL: "the outline of a hood" is the instruction. A tube swept along
      //   the hood's edge IS an outline that exists in space — it reads as a drawn line from the front
      //   and as a rounded rim in three-quarter, which a flat plane never does and a solid hood is not.
      //
      //   ⚠ MeshBasicMaterial WITH NO MAP is deliberate: unlit, so the outline holds its brightness
      //     inside a dim medallion, and no light is added (E15 light-count law — a glow here would cost
      //     a program recompile for set dressing). TubeGeometry is built once per card, like every other
      //     medallion in this file.
      const LINE_R = 0.022;                                   // outline thickness in medallion units [REF#EN-00179]
      const hoodMat = new THREE.MeshBasicMaterial({ color: 0xd8f0ff });
      const V = (x, y, z) => new THREE.Vector3(x, y, z);

      // ⚠ v3 — THREE HOOPS, NOT ONE ARCH. v2's cowl was a single curve whose z only moved −0.20..+0.14 [REF#EN-00180]
      //   against an x span of ±0.46: near enough to planar that the near-profile view collapsed it to a
      //   thin sliver with the eyes gone. Caught by rendering the model at three yaw angles side by side
      //   (0 / 0.62 / 1.25 rad) instead of only face-on — a flat thing looks perfect until you turn it.
      //   The fix is structural: a FRONT ring plus a SAGITTAL arc over the crown plus TWO LATERAL arcs
      //   sweeping to the back. Three mutually perpendicular hoops means at least one always presents
      //   broadside, so the hood keeps its silhouette through the medallion's whole drift.
      // ⚠ v4 — A LATHED COWL, NOT A CAGE OF HOOPS. v3 tried three perpendicular tube hoops to survive
      //   profile; they did, but from the FRONT the lateral arcs cut straight across the face opening and
      //   the whole thing read as a tangle of wire. Both failures were found the same way: rendering the
      //   model at three yaw angles (0 / 0.62 / 1.25 rad) side by side in an isolated harness, which is
      //   the only way a flat-or-tangled model gives itself away. Face-on alone looked fine every time.
      //
      //   THE SHAPE IS A LATHE PROFILE: pointed at the crown, flaring to the shoulders. That is what
      //   makes it read HOOD rather than the sphere an earlier pass produced, and being a surface of
      //   revolution it has a correct silhouette from every angle for free.
      const prof = [[0.015, 0.52], [0.10, 0.44], [0.20, 0.32], [0.28, 0.16],
                    [0.33, 0.00], [0.37, -0.18], [0.42, -0.34], [0.46, -0.46]]
                   .map(p => new THREE.Vector2(p[0], p[1]));
      const GAP = Math.PI * 0.62;                              // the wedge left open for the face [REF#EN-00181]
      const shellGeo = new THREE.LatheGeometry(prof, 36, GAP / 2, Math.PI * 2 - GAP);
      hoodGrp.add(new THREE.Mesh(shellGeo,
        new THREE.MeshBasicMaterial({ color: 0x0a0d12, side: THREE.DoubleSide })));

      // THE OUTLINE IS AN INVERTED HULL — a slightly larger copy drawn BackSide, so it shows exactly [REF#EN-00182]
      // where the hood turns away from the eye. That is a true 3D silhouette rather than a drawn line,
      // and it is what makes "the outline of a hood" survive rotation.
      //   ⚠ TWO CORRECTIONS THE STRIP FORCED, both invisible face-on:
      //     · the hull needs a WIDER face gap than the shell (×1.42) or you look straight through the
      //       opening at its bright inner surface and the hood fills in solid white;
      //     · and it must be TRANSLUCENT, because at nine-o'clock the shell no longer occludes it and an
      //       opaque hull became a white slab. At 0.42 it reads as the cloth catching light instead.
      const HGAP = GAP * 1.42;
      const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 36, HGAP / 2, Math.PI * 2 - HGAP),
        new THREE.MeshBasicMaterial({ color: 0xd8f0ff, side: THREE.BackSide,
                                      transparent: true, opacity: 0.42, depthWrite: false }));
      hull.scale.set(1.07, 1.045, 1.07);
      hoodGrp.add(hull);

      const tube = (pts, closed, r) =>
        hoodGrp.add(new THREE.Mesh(new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(pts, !!closed, 'catmullrom', 0.5), closed ? 56 : 40, r, 8, !!closed),
          hoodMat));

      // The face opening, as a bright rim following the lathe's cut edge — the crisp line the eye lands [REF#EN-00183]
      // on first, and the frame the owl eyes sit inside.
      tube([ V(0.00, 0.30, 0.20), V(0.22, 0.16, 0.24), V(0.26, -0.10, 0.27),
             V(0.00, -0.24, 0.30), V(-0.26, -0.10, 0.27), V(-0.22, 0.16, 0.24) ], true, LINE_R * 0.9);

      // The shoulder fall — cloth dropping from the opening's lower corners, so it reads as WORN. [REF#EN-00184]
      for (const sx of [-1, 1]) {
        tube([ V(sx * 0.24, -0.22, 0.26), V(sx * 0.40, -0.40, 0.16), V(sx * 0.50, -0.50, 0.04) ],
             false, LINE_R * 0.8);
      }

      // ── the owl eyes ───────────────────────────────────────────────────────── [REF#EN-00185]
      // Big, round, forward-facing and close-set — that is what makes an eye read OWL rather than cat.
      // Amber ring + a wide black pupil, held slightly proud of the hood plane so they catch the eye first.
      const eyes = [];
      for (let s = -1; s <= 1; s += 2) {
        const eye = new THREE.Group();
        // SIZED TO THE OPENING, MEASURED NOT GUESSED: the face ring spans ±0.26 in x, so two eyes at [REF#EN-00186]
        // ±0.105 with r=0.085 occupy 0.38 of the available 0.52 and sit clear of the rim tube. The first
        // pass used r=0.115 at ±0.135 — a 0.50 span inside a 0.52 hole, i.e. eyes jammed against the edge.
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 16),
          new THREE.MeshBasicMaterial({ color: 0xffb63c }));                    // amber iris [REF#EN-00187]
        const rim = new THREE.Mesh(new THREE.SphereGeometry(0.094, 20, 16),
          new THREE.MeshBasicMaterial({ color: 0x2a1a06, transparent: true, opacity: 0.55, side: THREE.BackSide }));
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0x080604 }));
        pupil.position.z = 0.046;                                               // sits on the front of the iris [REF#EN-00188]
        eye.add(rim); eye.add(ball); eye.add(pupil);
        // Spread WIDER than the first pass's ±0.105, which read as two googly eyes touching in the [REF#EN-00189]
        // middle, and pushed FORWARD to z 0.20 so they sit inside the lathe's mouth rather than behind
        // its rim. Wide-set forward-facing eyes are the owl tell.
        eye.position.set(s * 0.125, 0.02, 0.20);
        eye.userData = { pupil, phase: s > 0 ? 1.7 : 0.0 };                      // the two eyes never blink in lockstep [REF#EN-00190]
        hoodGrp.add(eye); eyes.push(eye);
      }

      hoodGrp.scale.setScalar(window._stealthHoodScale ?? 2.15);                 // fill the porthole without touching the glass [REF#EN-00191]
      iconMesh.add(hoodGrp);

      customUpdate = (t) => {
        // A slow watchful sway — an owl tracking something, not a spinning trinket. [REF#EN-00192]
        hoodGrp.rotation.y = Math.sin(t * 0.5) * 0.30;
        hoodGrp.rotation.x = Math.sin(t * 0.37) * 0.08;
        hoodGrp.position.y = Math.sin(t * 0.8) * 0.02;
        for (const eye of eyes) {
          const u = eye.userData;
          // BLINK: a hard squash for ~90ms out of every ~3.1s, offset per eye. Driven off the shared [REF#EN-00193]
          // clock rather than a timer so it cannot drift out of sync with the rest of the medallion.
          const cyc = ((t + u.phase) % 3.1) / 3.1;
          const blink = cyc > 0.965 ? 0.06 : 1;
          eye.scale.set(1, blink, 1);
          // The pupil widens as it turns away from centre — the dark-adapting tell that sells an owl. [REF#EN-00194]
          const dilate = 1 + Math.abs(Math.sin(t * 0.5)) * 0.22;
          u.pupil.scale.setScalar(dilate);
        }
      };
    }
    // ── SKILL/bonus card (THRUST, …) — a spinning gold-hilted blade thrusting up ─ [REF#EN-00195]
    // ── PERMITS AND SONGS FALL THROUGH (Mark 2026-08-02: "it has a golden musical note for its 3d
    //    model inside its plastic ball" — it did NOT). Room permits spawn with catId 'SKILL', so this
    //    branch was eating SINGING and every other permit and handing them the SWORD icon; the gold
    //    beamed-note branch further down (search "PERMITS GET THE NOTE TOO") is unreachable for
    //    anything tagged SKILL. Runtime-proven: the live card's bubble held ConeGeometry blades, zero
    //    0xffd11a meshes. The 08-02 "wtf is it a dagger" report was THIS blade, not the note's profile.
    //    Guarded here rather than reordered so the sword keeps first claim on every real melee skill.
    else if ((catId === 'SKILL' || elId === 'SKILL')
             && !IS_PERMIT_CARD(originalTitle) && !SONG_RARITY_OF(originalTitle)) {
      const grp = new THREE.Group();
      // Blade — long tapered cone pointing up (pale green steel) [REF#EN-00196]
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 1.5, 8),
        new THREE.MeshBasicMaterial({ color: 0xd8ffb0 }),
      );
      blade.position.y = 0.45;
      grp.add(blade);
      // Crossguard + pommel — gold, matching the card rim [REF#EN-00197]
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xe0b020 }),
      );
      guard.position.y = -0.32;
      grp.add(guard);
      const pommel = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xe0b020 }),
      );
      pommel.position.y = -0.62;
      grp.add(pommel);
      iconMesh.add(grp);
      customUpdate = (t) => {
        grp.rotation.y = t * 1.6;
        grp.position.y = Math.sin(t * 2.4) * 0.12;
      };
    }
    // ── MAGIC LANTERN — flashlight w/ emissive lens ────────────────────────── [REF#EN-00198]
    else if (originalTitle === "MAGIC LANTERN" || titleClean === "MAGIC LANTERN") {
      const flashlight = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.6, 16),
        new THREE.MeshStandardMaterial({
          color: 0x111111,
          metalness: 0.8,
          roughness: 0.2,
        }),
      );
      flashlight.position.y = -0.1;
      const head = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.1, 0.25, 16),
        new THREE.MeshStandardMaterial({
          color: 0x222222,
          metalness: 0.9,
          roughness: 0.1,
        }),
      );
      head.position.y = 0.42;
      flashlight.add(head);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffee,
          emissiveIntensity: 2.0,
        }),
      );
      lens.position.y = 0.13;
      head.add(lens);
      iconMesh.add(flashlight);
      const lanternLight = new THREE.PointLight(0xfff5e0, 2.0, 10);
      lanternLight.position.set(0, 1, 1.5);
      iconMesh.add(lanternLight);
      customUpdate = (t, m) => {
        m.rotation.x = Math.sin(t * 1.5) * 0.1;
        m.rotation.y = t * 1.0;
        m.rotation.z = Math.PI / 4; // slanted [REF#EN-00199]
      };
    }
    // ── EARTH — bouncing dodecahedron ───────────────────────────────────────── [REF#EN-00200]
    else if (elId === "EARTH") {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.6, 1),
        // Unlit so the icon stays a saturated craggy brown; reactive [REF#EN-00201]
        // materials were getting whitewashed by the panels iframe's lighting.
        new THREE.MeshBasicMaterial({ color: 0x5c4033 }),
      );
      iconMesh.add(rock);
      customUpdate = (t) => {
        rock.rotation.x = t * 1.8;
        rock.position.y = Math.abs(Math.sin(t * 3)) * 1.2;
      };
    }
    // ── FIRE — icosahedron core + swirling flame tetrahedra ────────────────── [REF#EN-00202]
    // Halved the flame count (60→30) and switched both materials to unlit
    // basic so the icon doesn't blow out white under panels lighting.
    else if (elId === "FIRE") {
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.85, 1),
        new THREE.MeshBasicMaterial({ color: 0xb71c1c }),
      );
      iconMesh.add(core);
      const flames = [];
      for (let i = 0; i < 30; i++) {
        const flameColor =
          i % 3 === 0 ? 0xffea00 : i % 2 === 0 ? 0xff4500 : 0xb71c1c;
        const s = new THREE.Mesh(
          new THREE.TetrahedronGeometry(0.28, 0),
          new THREE.MeshBasicMaterial({
            color: flameColor,
            transparent: true,
            opacity: 0.92,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const ang = (i / 30) * Math.PI * 2,
          rad = 0.2 + Math.random() * 0.45;
        s.position.set(Math.cos(ang) * rad, 0.3, Math.sin(ang) * rad);
        iconMesh.add(s);
        flames.push({
          m: s,
          s: 3 + Math.random() * 6,
          o: Math.random() * Math.PI,
          rs: (Math.random() - 0.5) * 2,
        });
      }
      customUpdate = (t) => {
        core.rotation.y = t * 0.25;
        core.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
        flames.forEach((f) => {
          f.m.rotation.x += f.rs * 0.005;
          f.m.rotation.y += f.rs * 0.005;
          f.m.position.y = 0.3 + (Math.sin(t * (f.s * 0.5) + f.o) + 1) * 0.8;
          const sc = Math.max(0.1, 1 - f.m.position.y / 1.5);
          f.m.scale.set(sc * 1.5, sc * 2.5, sc * 1.5);
        });
      };
    }
    // ── WIND — twin-spiral tornado made of tube geometry ────────────────────── [REF#EN-00203]
    else if (elId === "WIND") {
      const tornado = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      for (let i = 0; i < 2; i++) {
        const pts = [];
        const phase = (i / 2) * Math.PI * 2;
        for (let j = 0; j <= 40; j++) {
          const h = j / 40;
          const r = Math.pow(h, 2.0) * 1.5 + 0.2;
          const y = (h - 0.5) * 2.5;
          const angle = h * Math.PI * 12 + phase;
          pts.push(
            new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r),
          );
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const geo = new THREE.TubeGeometry(curve, 40, 0.075, 6, false);
        tornado.add(new THREE.Mesh(geo, mat));
      }
      tornado.position.y = -0.2;
      iconMesh.add(tornado);
      customUpdate = (t) => {
        tornado.rotation.y = t * -3.0;
        tornado.rotation.x = Math.sin(t * 3.5) * 0.15;
      };
    }
    // ── WATER — animated fluid sphere ──────────────────────────────────────── [REF#EN-00204]
    // Rewritten for performance: was 64×64 sphere (4225 verts) + per-frame
    // computeVertexNormals + per-vertex colour lerps + MeshStandardMaterial.
    // That alone was eating the FPS budget when multiple WATER loot icons
    // were on screen. Now 18×12 sphere (~190 verts), unlit basic material,
    // no normal recompute, no vertex colour churn. Same visual silhouette,
    // ~95% less CPU per frame per icon.
    else if (elId === "WATER") {
      const geo = new THREE.SphereGeometry(1.75, 18, 12);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x0d6efd,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      });
      const pos = geo.attributes.position;
      const originalYs = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) originalYs[i] = pos.getY(i);
      const fluid = new THREE.Mesh(geo, mat);
      iconMesh.add(fluid);
      customUpdate = (t) => {
        const p = pos;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i),
            z = p.getZ(i),
            y0 = originalYs[i];
          const waterLevel = -0.2;
          if (y0 > waterLevel) {
            const w =
              Math.sin(x * 3.0 + t * 4) * 0.15 +
              Math.cos(z * 2.5 + t * 3.5) * 0.1;
            p.setY(i, waterLevel + w);
          } else {
            p.setY(i, y0);
          }
        }
        p.needsUpdate = true;
        // No computeVertexNormals — unlit basic material doesn't sample [REF#EN-00205]
        // them and they were the single biggest cost in this update.
      };
    }
    // ── KATANA / SLASH — sword with additive glow ───────────────────────────── [REF#EN-00206]
    else if (catId === "KATANA" || originalTitle === "SLASH") {
      const addGlow = (mesh) => {
        const glow = new THREE.Mesh(
          mesh.geometry.clone(),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        glow.scale.setScalar(1.2);
        mesh.add(glow);
      };
      const bs = new THREE.Shape();
      bs.moveTo(0, 0);
      bs.quadraticCurveTo(-0.1, 1.0, -0.05, 2.0);
      bs.lineTo(0.15, 1.85);
      bs.quadraticCurveTo(0.2, 1.0, 0.2, 0);
      bs.lineTo(0, 0);
      const bladeGeo = new THREE.ExtrudeGeometry(bs, {
        depth: 0.1,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 2,
      });
      bladeGeo.center();
      const blade = new THREE.Mesh(
        bladeGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
        }),
      );
      blade.position.y = 1.0;
      addGlow(blade);
      const hilt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.8, 12),
        new THREE.MeshBasicMaterial({
          color: 0x8b0000,
          side: THREE.DoubleSide,
        }),
      );
      hilt.position.y = -0.4;
      addGlow(hilt);
      const guard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.05, 16),
        new THREE.MeshBasicMaterial({
          color: 0xffd700,
          side: THREE.DoubleSide,
        }),
      );
      addGlow(guard);
      const sword = new THREE.Group();
      sword.add(hilt, blade, guard);
      sword.position.set(0, -0.3, 0);
      sword.scale.set(0.8, 0.8, 0.1);
      iconMesh.add(sword);
      customUpdate = (t) => {
        sword.rotation.y = t * 1.5;
        sword.position.y = -0.3 + Math.sin(t * 2) * 0.1;
      };
    }
    else if (originalTitle === "DAGGER" || titleClean === "DAGGER") {
      const bs = new THREE.Shape();
      bs.moveTo(0, 0);
      bs.quadraticCurveTo(-0.07, 0.5, -0.035, 1.05);
      bs.lineTo(0.105, 0.95);
      bs.quadraticCurveTo(0.14, 0.5, 0.14, 0);
      bs.lineTo(0, 0);
      const bladeGeo = new THREE.ExtrudeGeometry(bs, {
        depth: 0.06,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 2,
      });
      bladeGeo.center();
      const blade = new THREE.Mesh(
        bladeGeo,
        new THREE.MeshBasicMaterial({
          color: 0xdddddd,
          side: THREE.DoubleSide,
        }),
      );
      blade.position.y = 0.55;
      const hilt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.45, 10),
        new THREE.MeshBasicMaterial({
          color: 0x151515, // Matte Obsidian Black [REF#EN-00207]
          side: THREE.DoubleSide,
        }),
      );
      hilt.position.y = -0.15;
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.05, 0.1),
        new THREE.MeshBasicMaterial({
          color: 0xc69a3d,
          side: THREE.DoubleSide,
        }),
      );
      guard.position.y = 0.1;
      const pommel = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 10, 8),
        new THREE.MeshBasicMaterial({
          color: 0xc69a3d,
          side: THREE.DoubleSide,
        }),
      );
      pommel.position.y = -0.4;
      const dagger = new THREE.Group();
      dagger.add(hilt, guard, blade, pommel);
      dagger.scale.set(1.2, 1.2, 0.1);
      iconMesh.add(dagger);
      customUpdate = (t) => {
        dagger.rotation.y = t * 1.5;
        dagger.position.y = Math.sin(t * 2) * 0.08;
      };
    }
    // ── SHORT BOW / LONG BOW ──────────────────────────────────────────────── [REF#EN-00208]
    // Primary path: use the canonical recurve bow factory if it has loaded
    // (Panels iframe side-effect-imports BowModelBuilder.js; if window.OrigamiBow
    // isn't on this iframe's window yet, fall through to the legacy builder).
    else if ((titleClean === "SHORT BOW" || titleClean === "LONG BOW" || titleClean === "SAMURAI BOW" || titleClean === "COMPOSITE BOW")
             && typeof window !== 'undefined'
             && window.OrigamiBow && window.OrigamiBow.buildBowIcon) {
      const isLong = titleClean === "LONG BOW" || titleClean === "COMPOSITE BOW";   // COMPOSITE BOW (2026-09-21) takes the long stave [REF#EN-00208]
      const baseScale = 0.09375;
      const bow = window.OrigamiBow.buildBowIcon({
        scale: isLong ? baseScale * 1.2 : baseScale,
        drawn: true,
        includeArrow: true,
        showcase: true,
        cardName: titleClean,
      });
      iconMesh.add(bow.group);
      customUpdate = null;
    }
    // ── Legacy fallback (only runs when OrigamiBow factory unavailable) ──── [REF#EN-00209]
    else if (titleClean === "SHORT BOW" || titleClean === "LONG BOW" || titleClean === "SAMURAI BOW" || titleClean === "COMPOSITE BOW") {
      const isLong = titleClean === "LONG BOW" || titleClean === "COMPOSITE BOW";

      // Procedural noise/banded texture generator for the wooden stave [REF#EN-00210]
      const createBowTexture = (isLong) => {
        if (isLong && _lootBowTextureLong) return _lootBowTextureLong;
        if (!isLong && _lootBowTextureShort) return _lootBowTextureShort;

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Base color: Samurai Crimson or Obsidian Black [REF#EN-00211]
        ctx.fillStyle = isLong ? '#0d0d0d' : '#8b0000';
        ctx.fillRect(0, 0, 256, 256);
        
        // Fine wood grain noise [REF#EN-00212]
        for (let i = 0; i < 400; i++) {
          const x = Math.random() * 256;
          const y = Math.random() * 256;
          const w = 1 + Math.random() * 2;
          const h = 4 + Math.random() * 16;
          ctx.fillStyle = isLong ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.07)';
          ctx.fillRect(x, y, w, h);
        }
        
        // Elegant golden banding wraps [REF#EN-00213]
        ctx.fillStyle = '#d4af37';
        ctx.fillRect(0, 15, 256, 8);
        ctx.fillRect(0, 75, 256, 5);
        ctx.fillRect(0, 115, 256, 14); // Mid grip gold accent [REF#EN-00214]
        ctx.fillRect(0, 175, 256, 5);
        ctx.fillRect(0, 235, 256, 8);
        
        // Red/Black wrapping laces on grip [REF#EN-00215]
        ctx.fillStyle = isLong ? '#8b0000' : '#0d0d0d';
        for (let y = 117; y < 127; y += 3) {
          ctx.fillRect(0, y, 256, 1.5);
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;

        if (isLong) {
            _lootBowTextureLong = texture;
        } else {
            _lootBowTextureShort = texture;
        }
        return texture;
      };

      const bowTexture = createBowTexture(isLong);
      const customWoodMat = new THREE.MeshStandardMaterial({
        map: bowTexture,
        metalness: 0.2,
        roughness: 0.4,
        name: "bow_wood"
      });

      // Recurve stave centerline [REF#EN-00216]
      const stavePts = [];
      const height = isLong ? 1.8 : 1.5;
      const SEG = 32;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const y = -height + t * (height * 2);
        
        const mainCurve = -0.52 * Math.sin(t * Math.PI);
        const recurveTerm = 0.22 * (Math.cos(t * Math.PI * 2) - 1.0) * 0.5;
        const tipCurve = 0.26 * Math.pow(Math.abs(t - 0.5) * 2, 3);
        const x = mainCurve + recurveTerm - tipCurve * 0.15;
        
        stavePts.push(new THREE.Vector3(x, y, 0));
      }

      const staveCurve = new THREE.CatmullRomCurve3(stavePts);
      const staveRadius = isLong ? 0.0638 : 0.0748;
      const staveGeo = new THREE.TubeGeometry(staveCurve, 48, staveRadius, 12, false);
      const stave = new THREE.Mesh(staveGeo, customWoodMat);

      // Gold bands/wrap material [REF#EN-00217]
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.9,
        roughness: 0.15,
        name: "bow_gold_accent"
      });

      // Grip wrap [REF#EN-00218]
      const midPt = stavePts[Math.floor(stavePts.length / 2)];
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(staveRadius + 0.03, staveRadius + 0.03, 0.48, 16),
        new THREE.MeshStandardMaterial({
          color: isLong ? 0x8b0000 : 0x1a1a1a, // Crimson grip on Black bow, or Black grip on Crimson bow [REF#EN-00219]
          metalness: 0.1,
          roughness: 0.8,
          name: "bow_grip"
        })
      );
      grip.position.set(midPt.x, midPt.y, 0);

      // Golden fitted tips oriented to tangents [REF#EN-00220]
      const topTip = stavePts[stavePts.length - 1];
      const botTip = stavePts[0];
      const topTangent = staveCurve.getTangentAt(1.0).normalize();
      const botTangent = staveCurve.getTangentAt(0.0).normalize();

      const coneGeo = new THREE.ConeGeometry(staveRadius + 0.015, 0.22, 12);
      coneGeo.translate(0, 0.11, 0); // shift pivot to base [REF#EN-00221]

      const nockTop = new THREE.Mesh(coneGeo, goldMat);
      nockTop.position.copy(topTip);
      const topQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), topTangent);
      nockTop.quaternion.copy(topQuat);

      const nockBot = new THREE.Mesh(coneGeo, goldMat);
      nockBot.position.copy(botTip);
      const botQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), botTangent.clone().multiplyScalar(-1));
      nockBot.quaternion.copy(botQuat);

      // Double-cylinder string [REF#EN-00222]
      const createCylinderBetweenPoints = (p1, p2, radius, material) => {
        const direction = new THREE.Vector3().subVectors(p2, p1);
        const len = direction.length();
        const cylinderGeo = new THREE.CylinderGeometry(radius, radius, len, 8);
        cylinderGeo.translate(0, len / 2, 0);
        const mesh = new THREE.Mesh(cylinderGeo, material);
        mesh.position.copy(p1);
        const dirNormalized = direction.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirNormalized);
        mesh.quaternion.copy(quat);
        return mesh;
      };

      const stringOffsetT1 = new THREE.Vector3(topTip.x + 0.03, topTip.y, -0.012);
      const stringOffsetB1 = new THREE.Vector3(botTip.x + 0.03, botTip.y, -0.012);
      const stringOffsetT2 = new THREE.Vector3(topTip.x + 0.03, topTip.y, 0.012);
      const stringOffsetB2 = new THREE.Vector3(botTip.x + 0.03, botTip.y, 0.012);

      const silkenMat = new THREE.MeshBasicMaterial({ color: 0xeadfc4 });
      const string1 = createCylinderBetweenPoints(stringOffsetT1, stringOffsetB1, 0.007, silkenMat);
      const string2 = createCylinderBetweenPoints(stringOffsetT2, stringOffsetB2, 0.007, silkenMat);

      // Arrow [REF#EN-00223]
      const shaftLen = isLong ? 1.78 : 1.48;
      const arrowWoodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
      const arrowHeadMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.15 });

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0308, 0.0308, shaftLen, 8),
        arrowWoodMat
      );
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.0935, 0.24, 10),
        arrowHeadMat
      );
      head.position.y = shaftLen / 2 + 0.12;

      // Swept Fletching Arrow [REF#EN-00224]
      const fletchWidth = 0.18;
      const fletchHeight = 0.32;
      const fletchDepth = 0.0198;
      const fletchGeo = new THREE.BoxGeometry(fletchWidth, fletchHeight, fletchDepth);
      
      const posAttr = fletchGeo.attributes.position;
      for (let j = 0; j < posAttr.count; j++) {
        const x = posAttr.getX(j);
        const y = posAttr.getY(j);
        if (x > 0) {
          posAttr.setY(j, y - 0.15); // drag down outer edge to create swept-back feather [REF#EN-00225]
        }
      }
      posAttr.needsUpdate = true;
      fletchGeo.computeVertexNormals();

      const fletchMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.7,
        roughness: 0.2,
        name: "arrow_fletch"
      });

      const fletch = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(fletchGeo, fletchMat);
        blade.rotation.y = (i / 3) * Math.PI * 2;
        fletch.add(blade);
      }
      fletch.position.y = -shaftLen / 2 + 0.10;

      const arrow = new THREE.Group();
      arrow.add(shaft, head, fletch);
      arrow.rotation.z = -Math.PI / 2;
      arrow.position.set(0.03 + shaftLen / 2, 0, 0);

      const bowGroup = new THREE.Group();
      bowGroup.add(stave, grip, nockTop, nockBot, string1, string2, arrow);

      // Sizing and positioning: 20% size bump for the LONG BOW (25% upscaled) [REF#EN-00226]
      const scale = isLong ? 0.14375 * 1.2 : 0.14375;
      bowGroup.scale.setScalar(scale);
      iconMesh.add(bowGroup);

      customUpdate = null;
    }
    // ── PISTOL / MAGIC MISSILE — silver .38 SPECIAL REVOLVER (Mark 2026-08-01: "model for gun [REF#EN-00227]
    // should be standard .38 special revolver not a purple dildo"). The "dildo" was the arcane-bolt
    // split from earlier today (v8.3.137) — rejected; both titles are the SAME gun card again and
    // resolve to this one revolver: silver frame + barrel, walnut grip, and a SIX-CHAMBER cylinder
    // with brass shell-ends that slowly indexes inside the ball. Same school as every neighbour:
    // primitives only, MeshBasic so it reads under panels lighting, clamped animation that never
    // escapes the loot-card sphere. Geometry ported at card scale from the engine's _buildRevolver38
    // (whose FPV anchor is opt-in — see DISABLED-FEATURES REGISTER). Deck-row twin: the 'PISTOL'
    // scene in NewOrigami.Panels.html, same geometry, lit materials.
    // ── CAMERA — the magic Nikon (Mark 2026-09-20: "fix model for magic camera ... fix playing card and loot card"). [REF#PENDING]
    //    Until today the world card had NO camera branch and fell to the generic RANGED ball. This is the deck-row
    //    'CAMERA' scene from NewOrigami.Panels.html (~:13303) ported at card scale in this file's school: primitives,
    //    MeshBasic (reads under any lighting), no lights, no strobe (E15 — the hand card's additive flash plane is a
    //    per-frame effect the world card does not run). Black leatherette body, silver top plate, pentaprism hump,
    //    stepped lens barrel with the blue-coated front element, the red Nikon swoosh, raised flash head.
    else if (originalTitle === "CAMERA" || elId === "CAMERA" || titleClean === "CAMERA" || titleClean === "MAGIC CAMERA") {
      // FIX 2026-09-20: the strict originalTitle==="CAMERA" check never matched — the only real spawn [REF#EN-00685]
      // (Engine9 _loot('RANGED',...,'camera',...) → tCard('camera').name) hands this "MAGIC CAMERA", and
      // the engine's own elId-repair (~Engine9:54282) had the identical strict-equality bug, so elId also
      // stayed 'RANGED'. Every camera loot card since the model was added has been the generic dark ball,
      // never this Nikon, and the theme fell to RANGED steel-blue instead of the lantern/missile purple for
      // the same reason. Now matches on elId (repaired upstream) OR either title spelling. [REF#PENDING]
      const M = (c) => new THREE.MeshBasicMaterial({ color: c });
      const K = { blk: M(0x2b2f36), blkLo: M(0x1a1d22), slv: M(0xc9ced6), slvLo: M(0x8e949c), red: M(0xd6182e), coat: M(0x3550c8), bulb: M(0xf4f6ff) };
      const cam = new THREE.Group();
      const box = (w, h, d, mat, x, y, z, rz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (rz) m.rotation.z = rz; cam.add(m); return m; };
      const cylZ = (r1, r2, l, mat, x, y, z, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, l, seg || 24), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); cam.add(m); return m; };
      box(2.0, 1.25, 0.62, K.blk, 0, 0, 0);                       // body [REF#EN-00686]
      box(0.42, 1.25, 0.72, K.blkLo, 0.85, 0, 0.05);              // grip [REF#EN-00687]
      box(0.09, 0.50, 0.05, K.red, 0.70, -0.10, 0.40, -0.18);     // the red swoosh [REF#EN-00688]
      box(2.0, 0.18, 0.62, K.slv, 0, 0.715, 0);                   // silver top plate [REF#EN-00689]
      box(0.72, 0.34, 0.50, K.blk, 0, 0.92, 0);                   // pentaprism hump [REF#EN-00690]
      cylZ(0.09, 0.09, 0.10, K.slv, 0.80, 0.84, 0.12, 12).rotation.x = 0;   // shutter button (upright) [REF#EN-00691]
      cylZ(0.50, 0.50, 0.28, K.slv, 0, 0, 0.45);                  // lens mount ring [REF#EN-00692]
      cylZ(0.44, 0.44, 0.50, K.blk, 0, 0, 0.82);                  // barrel [REF#EN-00693]
      cylZ(0.38, 0.42, 0.30, K.blkLo, 0, 0, 1.20);                // barrel step [REF#EN-00694]
      cylZ(0.30, 0.30, 0.05, K.coat, 0, 0, 1.36);                 // coated front element [REF#EN-00695]
      box(0.52, 0.26, 0.32, K.slv, -0.60, 0.90, 0);               // flash head [REF#EN-00696]
      box(0.42, 0.17, 0.02, K.bulb, -0.60, 0.90, 0.165);          // bulb face [REF#EN-00697]
      cam.rotation.set(0.10, -0.45, 0);
      cam.position.set(-0.10, -0.40, 0);   // ball-only: the bubble centre sits ~0.5 below the icon origin (same finding as the .38 / MAC-9) [REF#PENDING] [REF#EN-00698]
      cam.scale.setScalar(1.15);           // 2.4-wide envelope × 1.15 ≈ 2.8, inside the rim [REF#EN-00699]
      iconMesh.add(cam);
    }
    else if (originalTitle === "PISTOL" || originalTitle === "MAGIC MISSILE") {
      // Third pass (Mark 2026-09-11: "Magic Missile = needs to be .38 special gun model, update the loot and play [REF#EN-00578]
      // card models"). Same school as the MAC-9 above — primitives, MeshBasic, ~60 parts: tapered 4" barrel with
      // crown + bore, full underlug + ejector rod, serrated rib + red-insert ramp sight, top strap + rear notch,
      // side plate with screws + release latch, FLUTED 18-seg cylinder with chamber mouths / case heads / primers,
      // checkered hammer, trigger, checkered walnut panels with medallions, butt cap. Geometry is the SAME text as
      // the deck-row 'PISTOL' scene in NewOrigami.Panels.html (K = material set) so world ball + deck card agree.
      const M = (c) => new THREE.MeshBasicMaterial({ color: c });
      const K = { slv: M(0xc9ced4), slvHi: M(0xe8ecf1), slvLo: M(0x8e949c), drk: M(0x2a2d31), wal: M(0x5a3a22), walLo: M(0x3d2614), brs: M(0xcda434), red: M(0xd22a1e) };
      const gun = new THREE.Group();
      const box = (w, h, d, mat, x, y, z, rz, rx) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (rz) m.rotation.z = rz; if (rx) m.rotation.x = rx; gun.add(m); return m; };
      const cylX = (r1, r2, l, mat, x, y, z, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, l, seg || 16), mat); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); gun.add(m); return m; };
      // Barrel — tapered, 4-inch, starts AHEAD of the cylinder (forcing cone at the frame), dark bore + crowned muzzle [REF#EN-00579 → see REF#PN-02093]
      cylX(0.185, 0.215, 1.20, K.slv, 1.10, 0.34, 0);
      cylX(0.22, 0.22, 0.05, K.slvHi, 1.67, 0.34, 0);                         // muzzle crown [REF#EN-00580 → see REF#PN-02094]
      cylX(0.095, 0.095, 0.03, K.drk, 1.69, 0.34, 0, 12);                     // bore [REF#EN-00581]
      // Full underlug + ejector rod + knurled rod head (the classic .38 Special profile) [REF#EN-00582 → see REF#PN-02096]
      box(1.00, 0.20, 0.28, K.slv, 1.05, 0.13, 0);
      cylX(0.045, 0.045, 1.02, K.slvLo, 1.02, 0.09, 0, 10);
      cylX(0.075, 0.075, 0.12, K.slvHi, 1.50, 0.09, 0, 10);
      // Top rib with anti-glare serrations, ramp front sight with a red insert [REF#EN-00583 → see REF#PN-02097]
      box(1.20, 0.09, 0.14, K.slvHi, 1.10, 0.58, 0);
      for (let i = 0; i < 6; i++) box(0.03, 0.02, 0.15, K.drk, 0.62 + i * 0.19, 0.635, 0);
      box(0.18, 0.18, 0.10, K.slvHi, 1.56, 0.71, 0);
      box(0.08, 0.10, 0.03, K.red, 1.56, 0.73, 0.056);
      // Frame, top strap over the drum, rear sight notch (two ears), forcing-cone collar [REF#EN-00584 → see REF#PN-02098]
      box(1.15, 0.62, 0.40, K.slv, -0.42, 0.20, 0);
      box(0.96, 0.09, 0.30, K.slv, 0.10, 0.82, 0);
      box(0.20, 0.12, 0.08, K.drk, -0.74, 0.74, 0.08); box(0.20, 0.12, 0.08, K.drk, -0.74, 0.74, -0.08);
      cylX(0.24, 0.24, 0.08, K.slvLo, 0.50, 0.34, 0);
      // Side plate, three screws, thumb-side cylinder release latch [REF#EN-00585 → see REF#PN-02099]
      box(0.62, 0.42, 0.03, K.slvHi, -0.52, 0.16, 0.20);
      for (const [sx, sy] of [[-0.75, 0.30], [-0.30, 0.02], [-0.78, -0.02]]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8), K.slvLo); s.rotation.x = Math.PI / 2; s.position.set(sx, sy, 0.225); gun.add(s); }
      box(0.22, 0.12, 0.06, K.slvLo, -0.42, 0.44, 0.23, 0.15);
      // THE CYLINDER — fluted 18-segment drum: six flutes, six chamber mouths at the front, six brass case heads [REF#EN-00586 → see REF#PN-02100]
      // with primers at the rear. Own group so the update can index it like the real thing.
      const cyl = new THREE.Group();
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.72, 18), K.slvHi); drum.rotation.z = Math.PI / 2; cyl.add(drum);
      for (let i = 0; i < 6; i++){
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6, ca = Math.cos(a), sa = Math.sin(a);
        const fl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.16), K.slvLo); fl.position.set(0.04, ca * 0.43, sa * 0.43); fl.rotation.x = -a; cyl.add(fl);
        const b = (i / 6) * Math.PI * 2, cb = Math.cos(b), sb = Math.sin(b);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.06, 12), K.brs); rim.rotation.z = Math.PI / 2; rim.position.set(-0.38, cb * 0.26, sb * 0.26); cyl.add(rim);
        const pr = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8), K.slvLo); pr.rotation.z = Math.PI / 2; pr.position.set(-0.415, cb * 0.26, sb * 0.26); cyl.add(pr);
        const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12), K.drk); bore.rotation.z = Math.PI / 2; bore.position.set(0.365, cb * 0.26, sb * 0.26); cyl.add(bore);
      }
      cyl.position.set(0.10, 0.34, 0); gun.add(cyl);
      // Hammer with a checkered spur [REF#EN-00587 → see REF#PN-02101]
      box(0.16, 0.34, 0.16, K.drk, -1.02, 0.62, 0, 0.5);
      for (let i = 0; i < 3; i++) box(0.17, 0.015, 0.17, K.slvLo, -1.06 - i * 0.03, 0.70 + i * 0.045, 0, 0.5);
      // Trigger guard + trigger [REF#EN-00588 → see REF#PN-02102]
      const guard = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.07, 8, 16, Math.PI), K.drk); guard.rotation.x = Math.PI / 2; guard.rotation.z = Math.PI; guard.position.set(-0.30, -0.14, 0); gun.add(guard);
      box(0.07, 0.24, 0.08, K.slvLo, -0.32, -0.08, 0, 0.35);
      // Walnut grip, raked −0.42: checkered panels on both faces, brass medallions, silver butt cap. [REF#EN-00589 → see REF#PN-02103]
      // gx/gy map a distance along the raked grip axis into the gun's frame so every panel detail stays on the wood.
      const gx = (dy) => -0.95 + 0.408 * dy, gy = (dy) => -0.62 + 0.913 * dy;
      box(0.46, 1.15, 0.44, K.wal, -0.95, -0.62, 0, -0.42);
      for (const s of [1, -1]) {
        box(0.36, 0.84, 0.05, K.walLo, gx(-0.06), gy(-0.06), s * 0.225, -0.42);
        for (let i = 0; i < 5; i++) { const dy = -0.40 + i * 0.16; box(0.30, 0.012, 0.02, K.wal, gx(dy), gy(dy), s * 0.255, -0.42 + 0.7); box(0.30, 0.012, 0.02, K.wal, gx(dy), gy(dy), s * 0.255, -0.42 - 0.7); }
        const md = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), K.brs); md.rotation.x = Math.PI / 2; md.position.set(gx(0.30), gy(0.30), s * 0.26); gun.add(md);
      }
      box(0.50, 0.12, 0.48, K.slv, gx(-0.58), gy(-0.58), 0, -0.42);
      gun.position.set(-0.10, 0.10, 0);
      gun.position.y = -0.40;            // ball-only: the bubble centre sits ~0.5 below the icon origin (same finding as the MAC-9's −0.85) — measured off scripts/.probe-shots/38-world-closeup.png where the gun rode the upper half [REF#EN-00590]
      gun.scale.setScalar(1.2);          // 3.14-wide envelope × 1.2 = 3.8, inside the rim (the MAC-9 spilled at 4.7×1.9/1.3) [REF#EN-00591]
      iconMesh.add(gun);

      // ── REAL GLTF GUN (Mark 2026-09-11: "one is the model for magic missile, one for the magic auto pistol … [REF#EN-00592 → see REF#PN-02104]
      //    assets/models/player/38special.gltf / SMG.gltf"). The primitives above stay as the FALLBACK and as the
      //    update()'s cylinder handle; when the Sketchfab model loads it replaces them in place. The gltf's own
      //    scene.bin (+ textures/ for the SMG) must sit beside it in its folder — both downloads name their buffer
      //    scene.bin, which is why each gun has its own folder. Fit: longest axis → card X at `w` wide, centred
      //    at `at`. Orientation knobs: window._gun38Rot / window._gunSmgRot = [rx, ry, rz] (MEASURED 2026-09-11 off scripts/.probe-shots/gun-orient-grid.png,
      //    12 candidates per gun: both files carry the barrel on +Z and height on +Y; [0, −π/2, 0] puts the muzzle right, grip down). Off: window._gunGltfCards = false.
      const _fitGltfGun = (s, w, at, rot) => {
        s.rotation.set(rot[0], rot[1], rot[2]); s.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(s), sz = b.getSize(new THREE.Vector3());
        s.scale.multiplyScalar(w / Math.max(sz.x, sz.y, sz.z, 1e-6)); s.updateMatrixWorld(true);
        const c = new THREE.Box3().setFromObject(s).getCenter(new THREE.Vector3());
        s.position.set(at[0] - c.x, at[1] - c.y, at[2] - c.z);
        _gunmetalPass(s);
        return s;
      };
      window._gunGltf = window._gunGltf || {};
      if (window._gunGltfCards !== false && typeof window._gltfLoad === 'function'){
        window._gunGltf['38special'] = 'loading';
        window._gltfLoad('./assets/models/player/38special/38special.gltf', (g) => {
          try { const s = _fitGltfGun(g.scene, 3.8, [0, 0, 0], window._gun38Rot || [0, -Math.PI / 2, 0]); /* dead centre of the ball — the old [-0.10,-0.40] was compensating for the bob bug (see _bobRestY); Mark 2026-09-11 "a little more middle on that plastic circle" */ gun.visible = false; iconMesh.add(s); window._gunGltf['38special'] = 'ok'; }
          catch (e) { window._gunGltf['38special'] = 'fit-fail: ' + (e && e.message); }
        }, (e) => { window._gunGltf['38special'] = 'load-fail (primitives kept)'; try { console.warn('[LOOT] 38special.gltf did not load — scene.bin beside it? keeping the primitive revolver', e && (e.message || e)); } catch(_){} });
      }
      // Clamped animation — sway trimmed vs the 08-01 pass (Mark 2026-09-11 on the MAC-9: "dont make it move so [REF#EN-00593]
      // much"), vertical amplitude 0.03, the drum indexes lazily on the barrel axis.
      customUpdate = (t, m) => {
        m.rotation.y = Math.sin(t * 1.2) * 0.20 + 0.18;
        m.rotation.z = Math.PI / 16;
        m.position.y = _bobRestY(m) + Math.sin(t * 1.5) * 0.03;
        cyl.rotation.x = t * 0.9;
      };
    }
    // ── RELOAD — SIX-SHOT REVOLVER CYLINDER, drum only (Mark 2026-08-01 v2: "remove bullet on [REF#EN-00238]
    //    right, just cylindar"). Replaces the single 9mm round (Mark 2026-07-17); matches the MAGIC
    //    MISSILE card's .38 revolver — this is the drum you're refilling. Same school as the pistol
    //    branch above: primitives only, MeshBasic 3-tone fake specular, clamped animation. Deck-row
    //    twin: the 'RELOAD' scene in NewOrigami.Panels.html — where the drum is a LIVE ammo gauge
    //    (chambers empty per shot, event-indexed rotation); this world-drop ball stays decorative.
    else if (originalTitle === "RELOAD" || titleClean === "RELOAD") {
      const steelMat = new THREE.MeshBasicMaterial({ color: 0xc8ccd4 });   // machined steel [REF#EN-00239]
      const darkMat  = new THREE.MeshBasicMaterial({ color: 0x565b63 });   // bores / flutes / shadow [REF#EN-00240]
      const brassMat = new THREE.MeshBasicMaterial({ color: 0xcda434 });   // shell ends [REF#EN-00241]
      // ── the drum — chamber face angled up toward the viewer, six brass shell-ends in a ring [REF#EN-00242]
      const drumG = new THREE.Group();
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.85, 20), steelMat);
      drumG.add(drum);
      for (let i = 0; i < 6; i++){
        const a = (i / 6) * Math.PI * 2;
        const cx = Math.cos(a) * 0.43, cz = Math.sin(a) * 0.43;
        const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.05, 12), darkMat);
        bore.position.set(cx, 0.44, cz); drumG.add(bore);
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12), brassMat);
        shell.position.set(cx, 0.47, cz); drumG.add(shell);
        // flute between chambers on the drum wall [REF#EN-00243]
        const fa = a + Math.PI / 6;
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.56, 8), darkMat);
        fl.position.set(Math.cos(fa) * 0.73, 0.0, Math.sin(fa) * 0.73); drumG.add(fl);
      }
      // flush centre pin — no ejector rod (Mark 2026-08-01 v3: "the cylinder should be the only [REF#EN-00244]
      // thing in the plastic circle"); keeps the face from reading as a blank centre.
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.90, 10), darkMat);
      drumG.add(pin);
      drumG.rotation.set(1.0, 0, -0.15);   // tip the chamber ring toward the camera [REF#EN-00245]
      drumG.position.set(0, 0.05, 0);      // centred — just the cylinder (Mark 2026-08-01 v2: "remove bullet on right, just cylindar") [REF#EN-00246]
      drumG.scale.setScalar(1.15);         // fills the ball alone [REF#EN-00247]
      iconMesh.add(drumG);
      customUpdate = (t, m) => {
        m.rotation.y = Math.sin(t * 1.2) * 0.45 + 0.18;   // slow sweep — brass ring catches the light [REF#EN-00248]
        m.position.y = _bobRestY(m) + Math.sin(t * 1.5) * 0.04;   // same half-amplitude bob as the pistol [REF#EN-00249]
        drumG.rotation.y = t * 0.7;                        // decorative lazy index (world drop — the DECK card's drum is the live gauge) [REF#EN-00250]
      };
    }
    // ── MISSILE / SHURIKEN — single 8-point star ────────────────────────────── [REF#EN-00251]
    // ── BULLETS — loose .38 rounds, NOT the revolver (Mark 2026-08-09: "when ammunition cards show up …
    //    we should use the model of the ammunition not the weapon (BOW, MAGIC MISSILE (PISTOL))") ──────
    //    THE RULE, stated once for every future ammo card: a card that represents WHAT YOU PICKED UP
    //    shows that thing. Recovered rounds are rounds, not a gun; recovered arrows are arrows, not a bow.
    //    Both used to render their WEAPON because the drop was titled with the weapon's routing id, and
    //    the routing id doubles as the display title unless the drop site splits them.
    //    SHURIKEN and DAGGER need no branch of their own here — they ARE the ammunition, so their weapon
    //    model and their ammo model are the same object, and their existing branches are already correct.
    //    Palette matches the RELOAD card's cylinder (brass shell ends, lead nose) so a recovered round and
    //    a chambered one read as the same object across two cards.
    // ── MAGIC AUTO MISSILE — the MAC-9 SMG (Mark 2026-09-11: "make it a playing card with smg model
    //    in it"; supersedes the 09-10 9mm-luger GLB floor pickup, which read as a stray bullet). Same
    //    school as the revolver above: primitives only, MeshBasic so it reads under panels lighting, a
    //    clamped bob that never leaves the ball. Boxy receiver, short shrouded barrel, stick magazine
    //    out of the grip, folding wire stock — the silhouette that says "machine pistol" at card scale.
    else if (originalTitle === "MAGIC AUTO MISSILE") {
      // Second pass (Mark 2026-09-11: "kind of amateur, and outside the circle. dont make it move so much"): [REF#EN-00594]
      // MAC-style machine pistol — perforated shroud, charging handle, front/rear sights, ejection port,
      // safety, stippled grip, threaded muzzle, wire stock — sized to sit INSIDE the ball (the revolver's
      // envelope is ~3.3 wide at scale 1; this one is held to that) and pinned: a 0.02 bob, no yaw sway.
      const M = (c) => new THREE.MeshBasicMaterial({ color: c });
      const gun_ = M(0x23262b), gunHi = M(0x3b4048), gunLo = M(0x15171a), steel = M(0x8f959d), steelHi = M(0xc4c9cf), brass = M(0xcda434), rubber = M(0x2f3338);
      const smg = new THREE.Group();
      const box = (w, h, d, mat, x, y, z, rz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (rz) m.rotation.z = rz; smg.add(m); return m; };
      const cyl = (r, l, mat, x, y, z, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg || 12), mat); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); smg.add(m); return m; };
      // Receiver — upper (highlight edge) + lower body [REF#EN-00595 → see REF#PN-02106]
      box(1.60, 0.34, 0.40, gun_,  0.05, 0.36, 0);
      box(1.60, 0.06, 0.42, gunHi, 0.05, 0.56, 0);              // top edge catches light [REF#EN-00596 → see REF#PN-02107]
      box(1.20, 0.30, 0.36, gun_,  -0.15, 0.06, 0);             // lower receiver / magwell [REF#EN-00597 → see REF#PN-02108]
      box(0.40, 0.22, 0.30, gunLo, -0.05, 0.40, 0.21);          // ejection port (recessed dark) [REF#EN-00598 → see REF#PN-02109]
      box(0.16, 0.20, 0.10, steel, -0.62, 0.62, 0.0);           // charging handle [REF#EN-00599 → see REF#PN-02110]
      box(0.06, 0.14, 0.26, gunHi, -0.66, 0.66, 0);             // rear sight base [REF#EN-00600 → see REF#PN-02111]
      box(0.04, 0.10, 0.08, steelHi, -0.66, 0.76, -0.08);       // rear sight ears [REF#EN-00601 → see REF#PN-02112]
      box(0.04, 0.10, 0.08, steelHi, -0.66, 0.76, 0.08);
      // Shroud — perforated: dark bores through the tube on the visible face [REF#EN-00602 → see REF#PN-02113]
      cyl(0.17, 0.62, gunHi, 1.10, 0.36, 0);
      for (let i = 0; i < 4; i++) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.40, 8), gunLo); h.rotation.x = Math.PI / 2; h.position.set(0.90 + i * 0.14, 0.36 + (i % 2 ? 0.07 : -0.05), 0); smg.add(h); }
      // Barrel + threaded muzzle + front sight [REF#EN-00603 → see REF#PN-02114]
      cyl(0.075, 0.55, steel, 1.65, 0.36, 0, 10);
      const thr1 = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 6, 14), steelHi); thr1.rotation.y = Math.PI / 2; thr1.position.set(1.80, 0.36, 0); smg.add(thr1);
      const thr2 = thr1.clone(); thr2.position.x = 1.88; smg.add(thr2);
      box(0.05, 0.16, 0.06, steelHi, 1.42, 0.56, 0);            // front sight post [REF#EN-00604 → see REF#PN-02115]
      // Grip (raked) with stippled panels, and the stick magazine out of it [REF#EN-00605 → see REF#PN-02116]
      box(0.32, 0.60, 0.30, gun_,  -0.12, -0.28, 0, 0.22);
      box(0.20, 0.42, 0.33, rubber, -0.10, -0.28, 0, 0.22);     // rubber panel proud of the grip [REF#EN-00606 → see REF#PN-02117]
      for (let i = 0; i < 3; i++) box(0.22, 0.02, 0.34, gunLo, -0.10 + i * 0.03, -0.16 - i * 0.12, 0, 0.22);   // stipple lines [REF#EN-00607 → see REF#PN-02118]
      box(0.20, 0.92, 0.19, gunHi, -0.02, -0.80, 0, 0.22);      // magazine [REF#EN-00608]
      box(0.26, 0.07, 0.23, steel, 0.09, -1.24, 0, 0.22);       // baseplate [REF#EN-00609]
      box(0.05, 0.60, 0.02, brass, -0.02, -0.72, 0.10, 0.22);   // witness slot (brass rounds showing) [REF#EN-00610 → see REF#PN-02121]
      // Trigger group, safety [REF#EN-00611 → see REF#PN-02122]
      const guard = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 12, Math.PI), gunHi); guard.rotation.z = Math.PI; guard.position.set(0.30, -0.06, 0); smg.add(guard);
      box(0.05, 0.15, 0.06, steel, 0.28, -0.02, 0);             // trigger [REF#EN-00612]
      box(0.12, 0.05, 0.04, steelHi, -0.30, 0.12, 0.20, 0.5);   // safety lever [REF#EN-00613 → see REF#PN-02124]
      // Wire stock — two struts, cross bar, butt plate [REF#EN-00614 → see REF#PN-02125]
      cyl(0.028, 0.90, steel, -1.20, 0.50, 0.12, 6); cyl(0.028, 0.90, steel, -1.20, 0.50, -0.12, 6);
      box(0.05, 0.05, 0.28, steel, -0.80, 0.50, 0);
      box(0.07, 0.36, 0.34, gunHi, -1.66, 0.50, 0);
      // Brass at the port [REF#EN-00615 → see REF#PN-02126]
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), brass); shell.rotation.x = Math.PI / 2; shell.position.set(-0.10, 0.58, 0.30); smg.add(shell);
      // Envelope: x −1.70..+1.90, y −1.30..+0.81 — same as the revolver's, so scale 1 sits inside the ball. [REF#EN-00616]
      smg.rotation.set(0.05, 0.10, 0);
      smg.position.set(0.00, -0.85, 0);    // measured off three frames: the receiver line must sit ~0.85 below the icon origin to centre in the bubble [REF#EN-00617]
      smg.scale.setScalar(1.3);            // 1.9 spilled the rim, 1.0 filled ~40% [REF#EN-00618]
      iconMesh.add(smg);
      window._gunGltf = window._gunGltf || {};
      if (window._gunGltfCards !== false && typeof window._gltfLoad === 'function'){   // real SMG.gltf when its scene.bin + textures/ are present (Mark 2026-09-11); see the 38special note above [REF#EN-00619]
        window._gunGltf['SMG'] = 'loading';
        window._gltfLoad('./assets/models/player/SMG/SMG.gltf', (g) => {
          try {
            const s = g.scene; const rot = window._gunSmgRot || [0, -Math.PI / 2, 0];
            s.rotation.set(rot[0], rot[1], rot[2]); s.updateMatrixWorld(true);
            const b = new THREE.Box3().setFromObject(s), sz = b.getSize(new THREE.Vector3());
            const _fit = (typeof window._gunSmgWorldFit === 'number') ? window._gunSmgWorldFit : 5.0;   // 4.4 read ~50 % of the ball beside the deck's fuller frame (Mark 2026-09-14); 5.0 fills it like the playing card [REF#EN-00644]
            s.scale.multiplyScalar(_fit / Math.max(sz.x, sz.y, sz.z, 1e-6)); s.updateMatrixWorld(true);
            const c = new THREE.Box3().setFromObject(s).getCenter(new THREE.Vector3());
            const lift = (typeof window._gunSmgLift === 'number') ? window._gunSmgLift : 0.45;   // Mark 2026-09-12 "raise the model up, its too far at bottom of plastic circle" — dead centre read low in the ball [REF#EN-00636]
            s.position.set(0 - c.x, lift - c.y, 0 - c.z);   // centred + lift — the -0.50 was compensating for the bob bug (see _bobRestY); Mark 2026-09-11 "model is too high" [REF#EN-00627]
            // ⛔ SUPERSEDED 2026-09-14 by Mark: "redo the magic auto missile model loot card - why it change from our playing card [REF#EN-00645]
            //    model for? something screwed it up" — the 09-12 lantern-black (0x111111, gloss 0.8) vanished into the unlit
            //    porthole: the WORLD card and the DECK card had drifted into two different guns. The world card now takes the
            //    deck's own pass (`black: true`, colour ×0.12, matte) and, because the porthole has no point light where the deck
            //    scene has one, a flat self-light (`_gunWorldGlow`, 0.30) that puts it at the deck's read tone; depth kept so
            //    the barrel does not draw through the receiver (the DICE lesson). Old look: window._gunLanternBlack = true.
            if (window._gunLanternBlack === true) _gunmetalPass(s, { black: true, lantern: true });
            else {
              _gunmetalPass(s, { black: true });
              const _g = (typeof window._gunWorldGlow === 'number') ? window._gunWorldGlow : 0.30;
              s.traverse(o => { if (!o.isMesh) return; o.userData.keepDepth = true; o.renderOrder = 22; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms){ if (m && m.emissive){ m.emissive.setRGB(_g, _g, _g); m.emissiveIntensity = 1; m.needsUpdate = true; } } });
            }
            smg.visible = false; iconMesh.add(s); window._gunGltf['SMG'] = 'ok';
          } catch (e) { window._gunGltf['SMG'] = 'fit-fail: ' + (e && e.message); }
        }, (e) => { window._gunGltf['SMG'] = 'load-fail (primitives kept)'; try { console.warn('[LOOT] SMG.gltf did not load — scene.bin + textures/ beside it? keeping the primitive SMG', e && (e.message || e)); } catch(_){} });
      }
      customUpdate = (t, m) => {
        m.position.y = _bobRestY(m) + Math.sin(t * 1.5) * 0.02;   // half the pistol's bob — pinned, never leaves the bubble [REF#EN-00620]
        shell.position.y = 0.58 + ((t * 2.2) % 1) * 0.08;      // brass hops out of the port and resets [REF#EN-00621]
      };
    }
    else if (titleClean === "BULLETS" || titleClean === "BULLET" || titleClean === "ROUNDS") {
      const brass = new THREE.MeshStandardMaterial({ color: 0xcda434, metalness: 0.85, roughness: 0.28 });
      const lead  = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, metalness: 0.55, roughness: 0.45 });

      const caseGeo = new THREE.CylinderGeometry(0.115, 0.118, 0.62, 14);   // straight-wall .38 case [REF#EN-00252]
      const rimGeo  = new THREE.CylinderGeometry(0.135, 0.135, 0.05, 14);   // rimmed head [REF#EN-00253]
      const noseGeo = new THREE.SphereGeometry(0.113, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);

      const makeRound = () => {
        const r = new THREE.Group();
        r.add(new THREE.Mesh(caseGeo, brass));
        const rim = new THREE.Mesh(rimGeo, brass); rim.position.y = -0.335; r.add(rim);
        const nose = new THREE.Mesh(noseGeo, lead); nose.position.y = 0.31;  r.add(nose);
        return r;
      };

      // Three rounds: two standing shoulder to shoulder, one laid across the front so the card reads as [REF#EN-00254]
      // a HANDFUL of ammunition rather than a single cartridge standing to attention.
      const rounds = new THREE.Group();
      const rA = makeRound(); rA.position.set(-0.13, 0.02, -0.05);
      const rB = makeRound(); rB.position.set( 0.13, 0.06,  0.00); rB.rotation.z = -0.10;
      const rC = makeRound(); rC.position.set( 0.00, -0.34, 0.14); rC.rotation.z = Math.PI / 2; rC.rotation.y = 0.25;
      rounds.add(rA, rB, rC);
      rounds.rotation.z = 0.06;
      rounds.scale.setScalar(0.34);   // ~0.72wu tall round -> ~0.25 in the ball, same margin as its neighbours [REF#EN-00255]
      iconMesh.add(rounds);

      customUpdate = null;
    }
    // ── ARROWS — a bundle of three ya, NOT a shuriken (Mark 2026-08-09: "THE 3D MODEL FOR ARROWS CARD [REF#EN-00256]
    //    ARE SURIKIENS - CAN YOU ADD A NEW ONE WITH AN ARROW MODEL INSTEAD?") ────────────────────────
    //    WHY IT WAS A SHURIKEN: recovered arrows are ammunition, so they spawn with catId 'MISSILE', and
    //    the branch immediately below is an OR — `catId === "MISSILE" || … "SHURIKEN"`. EVERY missile-
    //    category card fell into the 8-point star regardless of its title. The ARROWS card only started
    //    existing on 2026-08-08 (arrow-recovery drops display "ARROWS" while keeping the bow as their
    //    routing id) and inherited the star because no branch claimed the title first. This claims it.
    //    ⚠ ORDER IS THE WHOLE FIX — this MUST stay above the MISSILE branch. It is an else-if chain, so
    //      moving it below makes it dead code and the shuriken silently comes back.
    //    The arrow is the SAME recipe the BOW card nocks (~:1351): wooden shaft, gold yanagi-ba head,
    //    three swept-back fletchings. Deliberately not a second invented design — a recovered arrow
    //    should look like the arrow on the bow that fired it. THREE of them, fanned and staggered, so
    //    the card reads as AMMUNITION (a quantity) rather than as one more weapon.
    //    Geometry/materials are built once per card and shared across the three arrows.
    else if (titleClean === "ARROWS" || titleClean === "ARROW") {
      const shaftLen  = 1.48;
      const woodMat   = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
      const headMat   = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.15 });
      const fletchMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.2, name: "arrow_fletch" });

      // Swept-back feather: drag the outer edge down, exactly as the bow card's fletching does. [REF#EN-00257]
      const fletchGeo = new THREE.BoxGeometry(0.18, 0.32, 0.0198);
      {
        const pa = fletchGeo.attributes.position;
        for (let j = 0; j < pa.count; j++) if (pa.getX(j) > 0) pa.setY(j, pa.getY(j) - 0.15);
        pa.needsUpdate = true;
        fletchGeo.computeVertexNormals();
      }
      // Thicker than the bow's nocked arrow on purpose: that one is read against a whole stave for [REF#EN-00258]
      // scale, this one has to carry the card by itself.
      const shaftGeo = new THREE.CylinderGeometry(0.062, 0.062, shaftLen, 8);
      const headGeo  = new THREE.ConeGeometry(0.15, 0.34, 10);

      const makeArrow = () => {
        const a = new THREE.Group();
        a.add(new THREE.Mesh(shaftGeo, woodMat));
        const h = new THREE.Mesh(headGeo, headMat);
        h.position.y = shaftLen / 2 + 0.12;
        a.add(h);
        const f = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const blade = new THREE.Mesh(fletchGeo, fletchMat);
          blade.rotation.y = (i / 3) * Math.PI * 2;
          f.add(blade);
        }
        f.position.y = -shaftLen / 2 + 0.10;
        a.add(f);
        return a;
      };

      const bundle = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const a = makeArrow();
        a.position.x = (i - 1) * 0.30;          // fan across the ball — wider since the 09-14 size-up so three shafts read as three, not one thick one [REF#EN-00259]
        a.position.y = (i === 1) ? 0.07 : 0;    // centre arrow rides a touch higher [REF#EN-00260]
        a.rotation.z = (i - 1) * 0.13;          // splay, so three shafts read as three [REF#EN-00261]
        bundle.add(a);
      }
      bundle.rotation.z = 0.20;                 // lean the whole quiver — a straight vertical reads stiff [REF#EN-00262]
      // ── SIZED UP (Mark 2026-08-09: "arrows need to look bigger - so tiny :)") ───────────────────── [REF#EN-00263]
      //    The first pass matched the BOW card's footprint (its ~2wu stave scales by 0.14375) on the
      //    assumption that equal world-size reads equal on the card. It does not: a bow is a broad
      //    curved stave that fills the ball's silhouette, while three arrows are pencil-thin verticals
      //    that read as a speck at the same scale. Fill of the visible circle is what matters, not
      //    matching a neighbour's scalar. Nearly doubled, and the shafts/heads thickened with it — a
      //    0.03wu shaft at card scale is roughly one screen pixel.
      //    Knob: window._arrowsCardScale.
      //    ⛔ STILL TINY AFTER THAT (Mark 2026-09-14, screenshot of an ARROWS x2 recovery card: "arrows cant see that model
      //       and figure out what it is too small"). MEASURED on the live card: the engine wraps every icon at 0.07
      //       (~:52518), so the porthole is ~5.7 icon units across, and this bundle at 0.285 × a 1.48 shaft stood 0.42
      //       units tall — 7 % of the hole, a speck beside the bubble's highlight. The bow on its own card stands ~3.2
      //       units. The 08-09 "nearly doubled" doubled a number that was 8× too small to begin with. 2.2 → the
      //       quiver stands ~3.3 units, the same presence as the bow, and the shafts thicken with it.
      bundle.scale.setScalar((typeof window !== 'undefined' && typeof window._arrowsCardScale === 'number') ? window._arrowsCardScale : 2.2);
      iconMesh.add(bundle);

      customUpdate = null;
    }
    else if ((catId === "MISSILE" || originalTitle === "SHURIKEN" || titleClean === "SHURIKEN") && titleClean !== "DAGGER") {
      const addGlow = (mesh) => {
        const glow = new THREE.Mesh(
          mesh.geometry.clone(),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        glow.scale.set(1.15, 1.15, 1.5);
        mesh.add(glow);
      };
      const star = new THREE.Shape();
      const oR = 1.8,
        iR = 0.45;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4,
          r = i % 2 === 0 ? oR : iR;
        if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const geo = new THREE.ExtrudeGeometry(star, {
        depth: 0.1,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 2,
      });
      geo.center();
      // Unlit basic so the shuriken stays a clear silver edge instead of [REF#EN-00264]
      // whiting out under panels lighting.
      const starMesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xbbbbbb,
          side: THREE.DoubleSide,
        }),
      );
      addGlow(starMesh);
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.4, 16),
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          side: THREE.DoubleSide,
        }),
      );
      hole.rotation.x = Math.PI / 2;
      const sg = new THREE.Group();
      sg.add(starMesh, hole);
      sg.scale.set(0.8, 0.8, 0.1);
      iconMesh.add(sg);
      customUpdate = (t) => {
        sg.rotation.z = -t * 0.5;
      };
    }
    // ── SAMURAI HELMET (Kabuto) — dome + face guard + crescent horns ────────── [REF#EN-00265]
    else if (originalTitle === "SAMURAI HELMET" || originalTitle === "SAMURAI HELM") {
      iconMesh.add(buildSamuraiHelmetModel());
      customUpdate = (t, m) => {
        m.rotation.y = t * 1.5;
      };
    }
    // ══ THE ARMOUR SET (Mark 2026-07-27: "we do have armor to think of. make it cool for players to see [REF#EN-00266]
    //    armor items, especially when we fight the skeleton guards and archers") ═══════════════════════
    // SAMURAI HELMET already had a real kabuto above. The other FOUR pieces had no branch at all and fell
    // through to the generic icon — so four fifths of the armour in the game looked like nothing in
    // particular, which is precisely why finding a piece did not feel like finding anything.
    //
    // Each is real Japanese armour, built from primitives in the same idiom as the kabuto: white lacquer
    // over gold fittings, white edge outlines so the silhouette reads at card size, and a slow turn so the
    // player sees it in three dimensions. Matched on the ARMOUR SLOT rather than one exact title, so the
    // whole family of names for a slot (dō / dōmaru / haramaki …) shares its model instead of every new
    // name silently reverting to the generic icon.
    else if (ARMOUR_SLOT_OF(titleClean)) {
      const addOutline = (mesh) => {
        const edges = new THREE.EdgesGeometry(mesh.geometry);
        mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0.8 })));
      };
      const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.35, side: THREE.DoubleSide });
      const goldMat  = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.2,  metalness: 0.8,  side: THREE.DoubleSide });
      const cordMat  = new THREE.MeshStandardMaterial({ color: 0xd4453f, roughness: 0.8,  metalness: 0.0,  side: THREE.DoubleSide });   // 縅 odoshi — the silk lacing [REF#EN-00267]

      const _slot   = ARMOUR_SLOT_OF(titleClean);
      const isChest = _slot === 'chest', isLegs = _slot === 'legs', isArms = _slot === 'arms', isHead = _slot === 'head';

      if (isChest) {
        // 胴 DŌ — a lacquered cuirass: tapered torso plate, a throat guard, and three rows of laced [REF#EN-00268]
        // lamellae hanging from the waist. The lacing is what makes it read as SAMURAI armour rather
        // than a breastplate, so it gets its own colour and is not skipped.
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.95, 1.5, 12, 1, true), plateMat);
        torso.position.y = 0.25; addOutline(torso);
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.11, 8, 20), goldMat);
        collar.position.y = 1.02; collar.rotation.x = Math.PI / 2;
        for (let row = 0; row < 3; row++) {
          const y = -0.62 - row * 0.34, r = 0.96 + row * 0.06;
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            const tile = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.30, 0.10), row % 2 ? cordMat : plateMat);
            tile.position.set(Math.cos(a) * r, y, Math.sin(a) * r * 0.35);
            tile.rotation.y = -a;
            iconMesh.add(tile);
          }
        }
        const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.17, 0.055, 40, 6), cordMat);
        knot.position.set(0, 0.30, 0.42);
        iconMesh.add(torso, collar, knot);
        iconMesh.scale.set(0.92, 0.92, 0.12);
      } else if (isLegs) {
        // 脛当 SUNEATE — a PAIR of shin plates, splinted with vertical iron ribs and tied with cord. [REF#EN-00269]
        // Built as two so the card reads "leg armour" instantly rather than "a curved plate".
        for (const side of [-1, 1]) {
          const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 1.7, 10, 1, true, -Math.PI * 0.55, Math.PI * 1.1), plateMat);
          shin.position.set(side * 0.46, 0, 0); addOutline(shin);
          iconMesh.add(shin);
          for (let r = -1; r <= 1; r++) {
            const rib = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.62, 0.07), goldMat);
            rib.position.set(side * 0.46 + r * 0.17, 0, 0.30);
            iconMesh.add(rib);
          }
          for (const ty of [0.62, -0.02, -0.66]) {
            const tie = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 6, 16), cordMat);
            tie.position.set(side * 0.46, ty, 0); tie.rotation.x = Math.PI / 2;
            iconMesh.add(tie);
          }
        }
        iconMesh.scale.set(1.0, 1.0, 0.12);
      } else if (isArms) {
        // 籠手 KOTE — an armoured sleeve: cloth tube, a knuckle plate over the back of the hand, and the [REF#EN-00270]
        // chain-and-plate mail that covers the forearm.
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 1.55, 12, 1, true), cordMat);
        sleeve.position.y = 0.1; addOutline(sleeve);
        const handPlate = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), plateMat);
        handPlate.position.y = -0.82; handPlate.rotation.x = Math.PI; addOutline(handPlate);
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.09, 8, 20), goldMat);
        cuff.position.y = 0.88; cuff.rotation.x = Math.PI / 2;
        iconMesh.add(sleeve, handPlate, cuff);
        for (let i = 0; i < 12; i++) {           // splinted plates up the forearm [REF#EN-00271]
          const a = (i / 12) * Math.PI * 2;
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.07), plateMat);
          p.position.set(Math.cos(a) * 0.47, 0.15, Math.sin(a) * 0.47 * 0.4);
          p.rotation.y = -a;
          iconMesh.add(p);
        }
        iconMesh.scale.set(1.0, 1.0, 0.13);
      } else if (isHead) {
        // 陣笠 JINGASA / 鉢金 HACHIGANE — the foot soldier's head kit, not a lord's kabuto. A wide lacquered [REF#EN-00272]
        // cone over an iron brow band: cheap, issued in bulk, and the thing a garrison skeleton would
        // actually be wearing. Deliberately unlike the crested kabuto above so the two never read as the
        // same pickup.
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.72, 20, 1, true), plateMat);
        cone.position.y = 0.18; addOutline(cone);
        const brim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.075, 8, 26), goldMat);
        brim.position.y = -0.18; brim.rotation.x = Math.PI / 2;
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.10, 8, 22), goldMat);
        band.position.y = -0.30; band.rotation.x = Math.PI / 2;
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), goldMat);
        boss.position.set(0, 0.50, 0);
        iconMesh.add(cone, brim, band, boss);
        for (const sx of [-1, 1]) {          // the chin cords [REF#EN-00273]
          const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 6), cordMat);
          cord.position.set(sx * 0.72, -0.62, 0.06); cord.rotation.z = sx * 0.22;
          iconMesh.add(cord);
        }
        iconMesh.scale.set(1.0, 1.0, 0.12);
      } else {
        // 草鞋 WARAJI — straw sandals, steel-toed. A PAIR, woven sole and a toe cap, because a single [REF#EN-00274]
        // sandal reads as debris and two read as footwear.
        for (const side of [-1, 1]) {
          const sole = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 1.55), goldMat);
          sole.position.set(side * 0.44, -0.2, 0); addOutline(sole);
          const toe = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), plateMat);
          toe.position.set(side * 0.44, -0.12, -0.62); addOutline(toe);
          iconMesh.add(sole, toe);
          for (let w = 0; w < 5; w++) {          // the woven straw [REF#EN-00275]
            const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 6), cordMat);
            straw.rotation.z = Math.PI / 2;
            straw.position.set(side * 0.44, -0.09, -0.36 + w * 0.30);
            iconMesh.add(straw);
          }
          const strap = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 14), cordMat);
          strap.position.set(side * 0.44, 0.06, -0.20); strap.rotation.x = Math.PI * 0.42;
          iconMesh.add(strap);
        }
        iconMesh.scale.set(1.0, 1.0, 0.13);
      }
      customUpdate = (t, m) => { m.rotation.y = t * 1.2; };   // slow turn — armour is meant to be looked at [REF#EN-00276]
    }
    // ── SHIELD / ARMOR — extruded shield shape ──────────────────────────────── [REF#EN-00277]
    else if (
      originalTitle === "SHIELD" ||
      catId === "SHIELD" ||
      catId === "ARMOR"
    ) {
      const addOutline = (mesh) => {
        const edges = new THREE.EdgesGeometry(mesh.geometry);
        mesh.add(
          new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.8,
            }),
          ),
        );
      };
      const ss = new THREE.Shape();
      ss.moveTo(0, -1.2);
      ss.quadraticCurveTo(1.2, -0.2, 1.0, 1.0);
      ss.lineTo(-1.0, 1.0);
      ss.quadraticCurveTo(-1.2, -0.2, 0, -1.2);
      const sg = new THREE.ExtrudeGeometry(ss, {
        depth: 0.1,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 2,
      });
      sg.center();
      const shield = new THREE.Mesh(
        sg,
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          metalness: 0.5,
          roughness: 0.3,
          emissive: 0x444444,
          side: THREE.DoubleSide,
        }),
      );
      shield.scale.set(1.4, 1.4, 0.14);
      addOutline(shield);
      const innerGeo = new THREE.ExtrudeGeometry(ss, {
        depth: 0.1,
        bevelEnabled: false,
      });
      innerGeo.center();
      const inner = new THREE.Mesh(
        innerGeo,
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          metalness: 0.1,
          roughness: 0.2,
          side: THREE.DoubleSide,
        }),
      );
      inner.scale.set(0.5, 0.5, 1.0);
      addOutline(inner);
      shield.add(inner);
      iconMesh.add(shield);
      customUpdate = (t) => {
        shield.rotation.y = t * 1.5;
      };
    }
    // ── PET FOOD — A TIN OF TRIPE (Mark 2026-09-14: "let it be picked up, its just loot inventory (ITEM). [REF#EN-00638]
    //    that way its like NETHACK - dont you remember it had tripe?") ──────────────────────────────────────
    //    NetHack's tripe ration, canned: a squat tin with rolled rims, a paper label wrapped round it (cream,
    //    two red bands, 餌 twice so one always faces the player), the lid peeled open on its pull ring and the
    //    brown puck of tripe showing under the rim — so it reads as OPENED FOOD at card size, not a battery.
    //    Procedural only, no lights (a loot icon lives inside the shared glass dome). keepDepth: a solid tin
    //    under the flat-emblem depth opt-out would draw its lid through its body (the DICE lesson at ~:1044).
    //    ~2.3 units tall → the caller's EXACT_SCALE 0.07 seats it inside the r0.2 dome like the potion.
    else if (originalTitle === "PET FOOD" || titleClean === "PET FOOD" || originalTitle === "DOG FOOD" || titleClean === "DOG FOOD") {
      const tin = new THREE.Group();
      const tinM = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.32, metalness: 0.88 });
      const rimM = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.28, metalness: 0.92 });
      const R = 1.05, H = 2.1;
      tin.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 36), tinM));
      for (const y of [H / 2 - 0.04, -H / 2 + 0.04]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.075, 8, 40), rimM);
        rim.rotation.x = Math.PI / 2; rim.position.y = y; tin.add(rim);
      }
      // the label: a small canvas wrapped on an open cylinder a hair proud of the tin [REF#EN-00639]
      const lc = document.createElement("canvas"); lc.width = 512; lc.height = 128;
      const g = lc.getContext("2d");
      g.fillStyle = "#f3ead6"; g.fillRect(0, 0, 512, 128);
      g.fillStyle = "#b8202a"; g.fillRect(0, 0, 512, 20); g.fillRect(0, 108, 512, 20);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#1a1a1a"; g.font = "bold 76px serif"; g.fillText("餌", 128, 66); g.fillText("餌", 384, 66);
      g.fillStyle = "#b8202a"; g.font = "bold 22px sans-serif"; g.fillText(originalTitle === "DOG FOOD" ? "DOG FOOD" : "PET FOOD", 256, 50); g.fillText("TRIPE", 256, 82);
      const ltex = new THREE.CanvasTexture(lc); ltex.anisotropy = 4;
      const label = new THREE.Mesh(
        new THREE.CylinderGeometry(R + 0.02, R + 0.02, H * 0.62, 36, 1, true),
        new THREE.MeshStandardMaterial({ map: ltex, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide }),
      );
      tin.add(label);
      // the tripe, glistening just under the rim [REF#EN-00640]
      const meat = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.12, 24),
        new THREE.MeshStandardMaterial({ color: 0x7a4a2e, roughness: 0.5, metalness: 0.05 }));
      meat.position.y = H / 2 - 0.08; tin.add(meat);
      // the lid: hinged at the back edge of the top, peeled open ~65°, pull ring lying on it near the front edge [REF#EN-00641]
      const lid = new THREE.Group(); lid.position.set(0, H / 2 + 0.02, -R * 0.95);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.93, R * 0.93, 0.06, 36), rimM);
      disc.position.z = R * 0.95; lid.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 8, 24), rimM);
      ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.08, R * 1.55); lid.add(ring);
      lid.rotation.x = -1.15;
      tin.add(lid);
      tin.traverse((o) => { if (o.isMesh) { o.userData.keepDepth = true; o.renderOrder = 22; } });
      tin.position.y = 0.1;
      iconMesh.add(tin);
      customUpdate = (t) => {
        tin.rotation.y = t * 1.1;
        tin.position.y = 0.1 + Math.sin(t * 2.2) * 0.08;
      };
    }
    else if (originalTitle === "HEAL POTION" || titleClean === "HEAL POTION") {
      // GLOWING GATORADE BOTTLE (Mark 2026-07-04 "need new model from playing card HEAL POTION for 3d [REF#EN-00278]
      // plastic circle"): the vending/loot blister used to show the generic fallback CUBE because
      // "HEAL POTION" missed the "POTION" branch below. Same sport-bottle silhouette as the Panels deck
      // icon — LatheGeometry body (r128-safe), emissive pulsing green fluid, white label band, orange
      // sport cap. ~3.2 units tall → the caller's EXACT_SCALE 0.07 lands it inside the r0.2 glass dome.
      const bottle = new THREE.Group();
      const prof = [
        [0.0, -1.5], [0.62, -1.5], [0.69, -1.28], [0.71, -0.39],
        [0.64, 0.17], [0.70, 0.61], [0.44, 1.02], [0.29, 1.24],
        [0.31, 1.38], [0.24, 1.42],
      ].map((p) => new THREE.Vector2(p[0], p[1]));
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x00ff55, emissive: 0x00e64d, emissiveIntensity: 1.1,
        roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.92, side: THREE.DoubleSide,
      });
      const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), bodyMat);
      bottle.add(body);
      const label = new THREE.Mesh(
        new THREE.CylinderGeometry(0.73, 0.73, 0.68, 24, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide }),
      );
      label.position.y = -0.39;
      bottle.add(label);
      const capMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4, metalness: 0.15 });
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.18, 16), capMat);
      collar.position.y = 1.49;
      bottle.add(collar);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.3, 12), capMat);
      nozzle.position.y = 1.7;
      bottle.add(nozzle);
      iconMesh.add(bottle);
      customUpdate = (t) => {
        bottle.rotation.y = t * 1.3;
        bodyMat.emissiveIntensity = 0.9 + Math.sin(t * 3.2) * 0.35;   // the "glow" pulse [REF#EN-00279]
      };
    }
    else if (originalTitle === "POTION" || titleClean === "POTION" || originalTitle === "SPELL POTION" || titleClean === "SPELL POTION") {
      const potion = new THREE.Group();
      const glass = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.1,
        metalness: 0.4,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      });
      const cork = new THREE.MeshStandardMaterial({
        color: 0x8b5a2b,
        roughness: 0.9,
        metalness: 0.1,
      });
      const liq = new THREE.MeshBasicMaterial({
        color: 0x00ff44,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      });
      const base = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 16), glass);
      const liquid = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.85,
          16,
          16,
          0,
          Math.PI * 2,
          Math.PI / 2,
          Math.PI / 2,
        ),
        liq,
      );
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.5, 0.8, 16),
        glass,
      );
      neck.position.y = 1.0;
      const lip = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.1, 8, 16),
        glass,
      );
      lip.position.y = 1.4;
      lip.rotation.x = Math.PI / 2;
      const corkMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.2, 0.4, 12),
        cork,
      );
      corkMesh.position.y = 1.55;
      potion.add(base, liquid, neck, lip, corkMesh);
      potion.position.y = -0.4;
      iconMesh.add(potion);
      customUpdate = (t) => {
        potion.rotation.y = t * 1.5;
        potion.rotation.z = Math.sin(t * 2) * 0.1;
        liquid.rotation.x = Math.sin(t * 5) * 0.2;
        liquid.rotation.z = Math.cos(t * 4) * 0.2;
      };
    }
    // ── IDENTITY SCROLL — mahogany & gold scroll that unrolls ────────────────── [REF#EN-00280]
    else if (originalTitle === "IDENTITY SCROLL" || titleClean === "IDENTITY SCROLL" || originalTitle === "SCROLL OF IDENTITY" || titleClean === "SCROLL OF IDENTITY" || catId === "SCROLL") {
      const scrollGroup = new THREE.Group();
      const matRoller = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.5, metalness: 0.1 });
      const matGold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.85 });
      const matParchment = new THREE.MeshStandardMaterial({ color: 0xfffdd0, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });

      const leftRollerGroup = new THREE.Group();
      const leftBar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 12), matRoller);
      leftRollerGroup.add(leftBar);
      const leftCapTop = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 12), matGold);
      leftCapTop.position.y = 0.8;
      leftRollerGroup.add(leftCapTop);
      const leftCapBot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 12), matGold);
      leftCapBot.position.y = -0.8;
      leftRollerGroup.add(leftCapBot);

      const rightRollerGroup = new THREE.Group();
      const rightBar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 12), matRoller);
      rightRollerGroup.add(rightBar);
      const rightCapTop = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 12), matGold);
      rightCapTop.position.y = 0.8;
      rightRollerGroup.add(rightCapTop);
      const rightCapBot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 12), matGold);
      rightCapBot.position.y = -0.8;
      rightRollerGroup.add(rightCapBot);

      const parchment = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.35, 0.01), matParchment);

      scrollGroup.add(leftRollerGroup);
      scrollGroup.add(rightRollerGroup);
      scrollGroup.add(parchment);

      scrollGroup.position.set(0, 0, 0);
      scrollGroup.rotation.x = 0.2;
      iconMesh.add(scrollGroup);

      customUpdate = (t, m) => {
        const openFactor = 0.5 + 0.5 * Math.sin(t * 2.2);
        leftRollerGroup.position.x = -0.06 - 0.54 * openFactor;
        rightRollerGroup.position.x = 0.06 + 0.54 * openFactor;
        parchment.scale.x = Math.max(0.01, openFactor * 1.08);

        m.rotation.y = t * 1.0;
        m.rotation.x = Math.sin(t * 1.5) * 0.1;
      };
    }
    // ── QUEST SONG — an extruded metal EIGHTH NOTE, gold (legendary) or silver (ordinary) ────────── [REF#EN-00281]
    // Mark 2026-07-30: "a golden 3d model of a note … shiny like an award … silver for the other."
    // Built the same way as the GOLD COIN directly below — an extruded flat shape with a bevel — because
    // that is what actually reads as struck metal at medallion size. A lathed/organic note turns to mush
    // inside a 0.2-radius glass bubble; a bevelled cut-out catches the rim light and stays legible.
    // Matched on TITLE via SONG_RARITY_OF (explicit list), so a song is never at the mercy of the
    // "every caller passes elId = catId" trap documented at the top of this function.
    // ── PERMITS GET THE NOTE TOO, IN GOLD (Mark 2026-07-31: "i said make it a golden note, not a potion")
    //    A room permit matched NOTHING in this chain, so it fell all the way to the final else and came out
    //    as the plain white debug cube. It is a SINGING permit — the note is what it should have been from
    //    the start. Gold rather than the song-silver: the permit is the thing that switches a whole room
    //    back on, and it should not look like one more track in her set.
    //    ⚠ This is the 3D ICON only. The CARD FACE stays silver per Mark's 07-31 ruling ("including
    //    permits ... so they dont all look like coin cards") — PERMIT_FACE/PERMIT_RIM above are untouched.
    else if (SONG_RARITY_OF(originalTitle) || SONG_RARITY_OF(elId)
             || IS_PERMIT_CARD(originalTitle) || IS_PERMIT_CARD(elId)) {
      const isPermit = IS_PERMIT_CARD(originalTitle) || IS_PERMIT_CARD(elId);
      const isLegendarySong = (SONG_RARITY_OF(originalTitle) || SONG_RARITY_OF(elId)) === 'LEGENDARY';
      const legendary = isPermit || isLegendarySong;
      // CABARET's own permit is SINGING — no ' PERMIT' suffix, but IS_PERMIT_CARD's title set names it [REF#EN-00282]
      // explicitly (~:110). Mark 2026-08-06, same day as the medal: "for caberet permit, lets make
      // that one its musical note" — carve it back OUT of the medal branch below so it falls through
      // to the plain gold note further down, same as every non-legendary permit did before 777348b.
      const isCabaretPermit = String(originalTitle || '').toUpperCase() === 'SINGING' || String(elId || '').toUpperCase() === 'SINGING';

      // ── EVERY *OTHER* PERMIT IS A GOLD MEDAL (Mark 2026-08-06: "for the PLAYING CARD MODEL of [REF#EN-00283]
      //    PERMIT CARDS (ALL) - 3d model = a gold medal") ─────────────────────────────────────────
      //    SUPERSEDES the note fronting permits (they used to fall through to the gold ♪ below,
      //    indistinguishable from a song at a glance — and a permit is an AWARD, not music). This
      //    is the engine-world twin of the Panels 'MEDAL' deck scene: same medal, but emissive-only
      //    metal — NO lights out here, ever (r128 E15). Gold recipe is the note's own law: base =
      //    SONG_GOLD_RIM (the label's 0xffd700, enforced by the constant), emissive the SAME hue
      //    scaled down (the 08-04 "yellow gold not orange gold" correction — never an oranger one).
      //    Songs are untouched: LEGENDARY keeps the gold record below, the rest keep the ♪. CABARET's
      //    own SINGING permit keeps the ♪ too now (see isCabaretPermit above) — same-day reversal.
      //    Knobs: window._permitMedalScale · off: window._permitMedalScene = false (falls to the ♪).
      if (isPermit && !isCabaretPermit && (typeof window === 'undefined' || window._permitMedalScene !== false)) {
        // BIGGER + NICER (Mark 2026-08-06, same day: "make the medal bigger, and more nicer, that one [REF#EN-00284]
        // is ugly and small"). Default scale 0.80→1.35 — at the new disc radius (1.15) that lands the
        // medal's effective fill radius (~1.55) right next to the legendary record's (R=1.62 below),
        // so the two award-tier world-drops finally sit at comparable size instead of the medal
        // reading small beside it. The disc itself is now a BEVELED coin edge (ExtrudeGeometry, same
        // technique as the star) instead of a flat cylinder cap — the single biggest "cheap plastic"
        // tell at this scale — plus an engraved inner ring and a ribbon bead, mirroring the Panels
        // 'MEDAL' deck-scene twin above so the two stay the same medal at a glance.
        const medal = new THREE.Group();
        // SELF-LIT GOLD (Mark 2026-09-19: "same with singing note model for SINGING permit" — unlit at the permit [REF#EN-00683]
        // desk). Fully metallic gold shows almost no diffuse, so away from a lamp the old brown emissive was all
        // there was and it read black. The emissive is now the gold itself, at a strength that reads in the dark
        // without bleaching the engraving. Knob: window._noteSelfLight (1.0 = this).
        const _nsl = (typeof window !== 'undefined' && typeof window._noteSelfLight === 'number') ? window._noteSelfLight : 1.0;
        // the medal follows the face: on the black-and-gold permit it is gold, not the green/washi metal [REF#EN-00792]
        const _blk = permitSingBlackOn();
        const _ms = permitStyle(), _gm = !_blk && _ms === 'green', _vm = !_blk && _ms === 'washi';
        const goldM = new THREE.MeshStandardMaterial({
          color: _vm ? PERMIT_STAMP_HEX : (_gm ? (permitJadeOn() ? permitHexC() : PERMIT_RIM) : SONG_GOLD_RIM), metalness: _vm ? 0.3 : 1.0, roughness: _vm ? 0.28 : 0.10,
          emissive: _vm ? 0x5a150c : (_gm ? (permitJadeOn() ? 0x2a8a66 : 0x449e48) : 0xb08a14), emissiveIntensity: 0.9 * _nsl,
        });
        const goldDeepM = new THREE.MeshStandardMaterial({
          color: _vm ? 0x8f2416 : (_gm ? (permitJadeOn() ? 0x2E8F6C : 0x3d8c40) : 0xcfa62c), metalness: _vm ? 0.3 : 1.0, roughness: _vm ? 0.40 : 0.30,
          emissive: _vm ? 0x35090a : (_gm ? (permitJadeOn() ? 0x1d5c46 : 0x2e6930) : 0x7a5c12), emissiveIntensity: 0.8 * _nsl,
        });
        const ribM = new THREE.MeshStandardMaterial({ color: 0x8b1a1a, metalness: 0.35, roughness: 0.55,
                                                      emissive: 0x2a0707, emissiveIntensity: 0.4 });   // the record label's red — one house palette [REF#EN-00285]
        const ribWM = new THREE.MeshStandardMaterial({ color: 0xe9e2d0, metalness: 0.10, roughness: 0.75,
                                                       emissive: 0x3a352c, emissiveIntensity: 0.4 });
        // Built FLAT like the record (disc axis = local y), then the group flips -PI/2 to face the [REF#EN-00286]
        // player — so "toward the card's top" is local +z here.
        const discShape = new THREE.Shape().absarc(0, 0, 1.15, 0, Math.PI * 2, false);
        const discGeo = new THREE.ExtrudeGeometry(discShape, { depth: 0.17, bevelEnabled: true, bevelThickness: 0.048, bevelSize: 0.048, bevelSegments: 6, curveSegments: 56 });
        discGeo.center();
        const disc = new THREE.Mesh(discGeo, goldM);
        disc.rotation.x = Math.PI / 2; medal.add(disc);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.078, 12, 64), goldM);
        rim.rotation.x = Math.PI / 2; rim.position.y = 0.085; medal.add(rim);
        const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.03, 8, 64), goldDeepM);   // engraved line between rim and boss — a real struck medal always has one [REF#EN-00287]
        innerRing.rotation.x = Math.PI / 2; innerRing.position.y = 0.10; medal.add(innerRing);
        const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.16, 48), goldDeepM);
        boss.position.y = 0.01; medal.add(boss);
        const starShape = new THREE.Shape();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 === 0) ? 0.52 : 0.22;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          i ? starShape.lineTo(x, y) : starShape.moveTo(x, y);
        }
        starShape.closePath();
        const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape,
          { depth: 0.09, bevelEnabled: true, bevelThickness: 0.028, bevelSize: 0.028, bevelSegments: 3 }), goldM);
        star.rotation.x = -Math.PI / 2; star.position.y = 0.115; medal.add(star);
        const knuckle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.062, 10, 28), goldM);   // chunkier suspension ring — the old one read as a wire loop at this size [REF#EN-00288 → see REF#PN-00775]
        knuckle.rotation.x = Math.PI / 2; knuckle.position.set(0, 0, 1.12); medal.add(knuckle);
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 14), goldM);   // where the straps cross, before they meet the knuckle [REF#EN-00289 → see REF#PN-00774]
        bead.position.set(0, 0, 1.40); medal.add(bead);
        for (const sx of [-1, 1]) {   // the ribbon V, rising past the card's top edge [REF#EN-00290]
          const strap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.065, 1.40), ribM);
          strap.position.set(sx * 0.33, -0.01, 1.78); strap.rotation.y = -sx * 0.26; medal.add(strap);
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 1.40), ribWM);
          stripe.position.set(sx * 0.33, -0.005, 1.78); stripe.rotation.y = -sx * 0.26; medal.add(stripe);
        }
        medal.rotation.x = -Math.PI / 2;                   // face the player, like the record it sits beside [REF#EN-00291]
        medal.scale.setScalar((typeof window !== 'undefined' && window._permitMedalScale) || 1.35);
        medal.position.y = 0.02;
        iconMesh.add(medal);
        customUpdate = (t, m) => {
          // hung on its ribbon, turning gently in a draft — a medal sways, it does not spin like vinyl [REF#EN-00292]
          m.rotation.z = Math.sin(t * 0.6) * 0.30;
          goldM.emissiveIntensity = 0.8 + 0.15 * Math.sin(t * 1.3);   // the note's living-glint trick, same material-uniform-only law [REF#EN-00293]
        };
        return { iconMesh, customUpdate };
      }

      // ── A LEGENDARY SONG IS A GOLD RECORD, NOT A NOTE (Mark 2026-07-31: "legendary singing cards need [REF#EN-00294]
      //    to be solid gold with a gold record album model inside it the size of the banzai rising star
      //    in BANZAI skill card") ──────────────────────────────────────────────────────────────────
      //    SIZE REFERENCE, read rather than guessed: the BANZAI rising sun is a 256px canvas disc drawn
      //    at R=126 — it fills its face almost edge to edge. So this is built full-bleed to the medallion
      //    and spun flat like a turntable, not shrunk to sit politely in the middle.
      //    Knob: window._songRecordScale.
      if (!isPermit) {
        const disc = new THREE.Group();
        disc.name = 'music-record';
        const R = 1.62;                                   // ~the medallion's inner face, matching BANZAI's fill [REF#EN-00295]
        const vinyl = new THREE.MeshStandardMaterial({
          color: isLegendarySong ? 0xffd561 : 0x202428,
          metalness: isLegendarySong ? 0.85 : 0.15, roughness: 0.28,
          emissive: isLegendarySong ? 0x3a2600 : 0x080a0c, emissiveIntensity: 0.12,
        });
        const holeR = R * 0.055;
        const plate = new THREE.Mesh(new THREE.LatheGeometry([
          new THREE.Vector2(holeR, -0.045), new THREE.Vector2(R, -0.045),
          new THREE.Vector2(R, 0.045), new THREE.Vector2(holeR, 0.045),
          new THREE.Vector2(holeR, -0.045)
        ], 96), vinyl);
        plate.name = 'record-with-spindle-hole';
        disc.add(plate);
        // GROOVES — concentric rings cut just proud of the face so the highlight breaks across them as [REF#EN-00296]
        // it turns. Torus rather than a texture: this catches the light the way pressed vinyl does, and
        // it costs four small meshes instead of a canvas upload.
        for (let i = 0; i < 12; i++) {
          const rr = R * (0.40 + i * 0.048);
          const groove = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.004, 3, 64), vinyl);
          groove.rotation.x = Math.PI / 2;
          groove.position.y = 0.048;
          disc.add(groove);
        }
        // CENTRE LABEL + SPINDLE HOLE — the two details that read as "record" at a glance. [REF#EN-00297]
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = labelCanvas.height = 256;
        const ctx = labelCanvas.getContext('2d');
        ctx.fillStyle = isLegendarySong ? '#f4ecd3' : '#932d43';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = isLegendarySong ? '#26211a' : '#fff9ed';
        ctx.textAlign = 'center';
        ctx.font = 'bold 17px sans-serif';
        ctx.fillText(isLegendarySong ? 'GOLD RECORD' : 'ORIGAMI RECORDS', 128, 65);
        let fontSize = 18;
        while (fontSize > 10) {
          ctx.font = `bold ${fontSize}px sans-serif`;
          if (ctx.measureText(originalTitle).width <= 190) break;
          fontSize--;
        }
        ctx.fillText(originalTitle, 128, 185, 190);
        ctx.font = '14px sans-serif';
        ctx.fillText('SIDE A - 33 RPM', 128, 211);
        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        labelTexture.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Mesh(new THREE.RingGeometry(holeR, R * 0.34, 64),
          new THREE.MeshBasicMaterial({ map: labelTexture, side: THREE.DoubleSide }));
        label.name = 'record-label';
        label.rotation.x = -Math.PI / 2;
        label.position.y = 0.049;
        disc.add(label);

        disc.rotation.x = -Math.PI / 2;                    // face the player, like the note it replaces [REF#EN-00298]
        disc.scale.setScalar(window._songRecordScale ?? 0.92);
        disc.position.y = 0.05;
        iconMesh.add(disc);
        customUpdate = (t, m) => {
          // 33 rpm reads as barely moving at this scale, so it turns a little faster than a real deck — [REF#EN-00299]
          // slow enough to be an award in a case, quick enough that the gold sweeps.
          m.rotation.z = t * 0.9;
          m.rotation.x = Math.sin(t * 0.7) * 0.06;
        };
        return { iconMesh, customUpdate };
      }

      const noteGroup = new THREE.Group();
      // ── STRUCK GOLD, NOT PAINTED (Mark 2026-08-02 evening: "make the gold note more metalic and [REF#EN-00300]
      //    beautiful"). No envMap exists in this engine (they are nulled at load, Engine9 ~:14589),
      //    so metal is faked honestly: mirror-polish roughness for a hot highlight off the real room
      //    lights, a deeper amber emissive floor so the dark can't kill it, and a LIVING GLINT — the
      //    emissive breathes and, once per turn, flashes like a facet catching a spotlight. All
      //    uniform writes on this one material: Δ0 programs, zero lights.
      //    ── YELLOW GOLD, NOT ORANGE GOLD (Mark 2026-08-04: "make the 3d model of golden note more
      //       gold color like the label, that yellow gold, its an ugly orange gold") ───────────────
      //       THE ORANGE WAS THE EMISSIVE, NOT THE COLOUR. The base was already 0xffd35c, a fair
      //       yellow — but it sat under `emissive: 0x9a6a00` at 0.85 intensity, and that is a burnt
      //       amber (hue 41°) which ADDS on top of the lit surface. An emissive floor that bright does
      //       not tint the gold, it overrides it, so the note read orange in exactly the dark room it
      //       was tuned for. Fixed at the hue rather than by dimming: the base is now literally
      //       SONG_GOLD_RIM, the same 0xffd700 the card's own label uses — so "match the label" is
      //       enforced by the constant instead of by two numbers someone has to keep in agreement —
      //       and the emissive is that same hue scaled down (hue 50°, zero red push) instead of a
      //       different, oranger one. Brightness in the dark is unchanged; only the hue moved.
      // SINGING takes the gold note, not its permit style's note — `legendary` is already true for any
      // permit, so routing it down the 'gold' branch gives it SONG_GOLD_RIM, the card label's own gold.
      const _singGold = isPermit && permitSingBlackOn();   // every permit's note is gold, like its lettering [REF#EN-00793]
      const _nps = (isPermit && !_singGold) ? permitStyle() : 'gold', _gn = _nps === 'green', _vn = _nps === 'washi';   // the SINGING permit's note: vermilion lacquer on washi (2026-09-30) [REF#EN-00794]
      const metal = new THREE.MeshStandardMaterial({
        color: _vn ? PERMIT_STAMP_HEX : (_gn ? (permitJadeOn() ? permitHexC() : PERMIT_RIM) : (legendary ? SONG_GOLD_RIM : 0xe6ecf1)),
        metalness: _vn ? 0.3 : 1.0,
        roughness: legendary ? 0.07 : 0.12,      // mirror polish — the highlight is the metal [REF#EN-00301]
        emissive: _vn ? 0x5a150c : (_gn ? (permitJadeOn() ? 0x1d5c46 : 0x2e6930) : (legendary ? 0x6b5a00 : 0x22282c)),
        emissiveIntensity: legendary ? 0.85 : 0.55,
      });
      const EX = { depth: 0.30, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3 };

      // ── THE SINGLE STANDARD NOTE (♪) IS BACK (Mark 2026-08-02 evening: "give it the single note [REF#EN-00302]
      //    model the more standard one") — superseding the beamed pair, which superseded the first
      //    single note after it read as a dagger. THE DAGGER WAS THE FLAG'S FAULT: the old flag was a
      //    straight sweep (= a crossguard) off a skinny stem (= a blade). This one is the classic
      //    glyph: a FAT tilted head, a short thin stem off its right edge, and a bezier-curved
      //    pennant that tapers as it falls — a wave, not a guard. Read from any angle it is ♪.
      const _head = new THREE.Shape(); _head.absellipse(0, 0, 0.80, 0.56, 0, Math.PI * 2, false, 0);
      const headM = new THREE.Mesh(new THREE.ExtrudeGeometry(_head, EX), metal);
      headM.rotation.z = -0.35; headM.position.set(-0.38, -1.32, 0);
      noteGroup.add(headM);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.17, 2.85, 0.30), metal);
      stem.position.set(0.34, 0.14, 0);                // rises from the head's right edge [REF#EN-00303]
      noteGroup.add(stem);
      const _flag = new THREE.Shape();                 // the falling pennant, drawn from the stem top [REF#EN-00304]
      _flag.moveTo(0, 0.16);
      _flag.bezierCurveTo(0.82, -0.06, 1.14, -0.74, 1.02, -1.62);   // outer edge — the wave falls [REF#EN-00305]
      _flag.bezierCurveTo(0.98, -1.04, 0.60, -0.68, 0.13, -0.58);   // inner edge climbs back, thinning the tip [REF#EN-00306]
      _flag.closePath();
      const flagM = new THREE.Mesh(new THREE.ExtrudeGeometry(_flag, EX), metal);
      flagM.position.set(0.26, 1.42, 0);
      noteGroup.add(flagM);

      // ── FIT THE GLYPH TO THE PORTHOLE, MEASURED (Mark 2026-08-02: "fix layout geometries"). [REF#EN-00307]
      //    The hand-placed head/stem/flag offsets left the note's true centre at y≈-0.205 with a
      //    2.54×3.53 extent — so inside a CIRCULAR window it sat low and its corners pushed past the
      //    glass (his clipped screenshot). Now the group is centred on its own measured bounding box
      //    and scaled by RADIUS (half the diagonal), which is the only quantity a round frame cares
      //    about — no glyph edit can un-centre it again. Knob still _songNoteScale (fill fraction).
      // ── CENTRE BY VISUAL MASS, NOT BY BOUNDING BOX (Mark 2026-08-03, 4th report: "i asked you 3x to
      //    fix the incorrect centering"). My earlier passes centred the BOX and I reported (0,0,0) as
      //    proof — but a rendered-pixel measurement finally showed the truth: gold pixels landed 17px
      //    right and 59px LOW in a 700px frame. A quaver is bottom-heavy (a fat head low-left, a thin
      //    pennant high-right), so a box-centred glyph still LOOKS off-centre inside a round window.
      //    The eye centres on mass. So does this now: each part is weighted by its face area, and the
      //    group is centred on that weighted mean. Verified by re-rendering, not by asserting.
      {
        // TRUE VERTEX CENTROID — every vertex of every part, through that part's own transform [REF#EN-00308]
        // (rotations included, which the bbox pass ignored). This is the surface's centre of ink.
        let _wx = 0, _wy = 0, _wt = 0;
        const _v = new THREE.Vector3();
        noteGroup.updateMatrixWorld(true);
        noteGroup.children.forEach(ch => {
          const pos = ch.geometry && ch.geometry.attributes && ch.geometry.attributes.position;
          if (!pos) return;
          for (let i = 0; i < pos.count; i++){
            _v.fromBufferAttribute(pos, i).applyMatrix4(ch.matrix);
            _wx += _v.x; _wy += _v.y; _wt++;
          }
        });
        const _cx2 = _wt ? _wx / _wt : 0, _cy2 = _wt ? _wy / _wt : 0;
        const _bb = new THREE.Box3().setFromObject(noteGroup);
        const _s = _bb.getSize(new THREE.Vector3());
        // ── AND THEN THE MEASURED RESIDUAL (Mark 2026-08-03) ───────────────────────────────────── [REF#EN-00309]
        //    Neither analytic centre lands it: box-centre rendered 17px right / 59px low, area-weight
        //    35px left / 61px low, vertex-centroid 52px left / 55px low (700px frame, gold-pixel
        //    centroid vs frame centre — scripts in the session scratchpad, probe-pix.js). A quaver's
        //    ink is not where any cheap centroid says it is. So the last step is CALIBRATION, not
        //    theory: the residual was measured off the render and is corrected here, and the same
        //    probe re-run proves the result. Re-measure and re-dial these two numbers if the glyph
        //    ever changes shape. Knobs: window._noteNudgeX / _noteNudgeY.
        const _nx2 = (typeof window !== 'undefined' && typeof window._noteNudgeX === 'number') ? window._noteNudgeX : 0.236;
        const _ny2 = (typeof window !== 'undefined' && typeof window._noteNudgeY === 'number') ? window._noteNudgeY : 0.206;
        noteGroup.position.set(-_cx2 + _nx2, -_cy2 + _ny2, 0);   // ink centre + measured correction → dead centre of the glass [REF#EN-00310]
        const _wrap = new THREE.Group(); _wrap.add(noteGroup);
        const _r = Math.hypot(_s.x, _s.y) * 0.5 || 1;          // circumscribed radius, so a round frame never clips it [REF#EN-00311]
        _wrap.scale.setScalar((window._songNoteScale ?? 0.92) * (1.85 / _r));
        iconMesh.add(_wrap);
      }

      customUpdate = (t, m) => {
        // Slow turn so the polish sweeps — an award rotating in a display case, not a spinning pickup. [REF#EN-00312]
        m.rotation.y = t * 0.55;
        m.rotation.x = Math.sin(t * 0.8) * 0.09;
        if (legendary) {
          // breath + a once-per-turn facet flash, phase-locked to the rotation so the flash lands [REF#EN-00313]
          // when a face sweeps the viewer — reads as light catching metal, costs one uniform.
          const _glint = Math.pow(Math.max(0, Math.sin(t * 0.55 + 0.9)), 24);
          metal.emissiveIntensity = 0.72 + 0.16 * (0.5 + 0.5 * Math.sin(t * 1.5)) + 0.5 * _glint;
        }
      };
    }
    // ── GOLD COIN — yen-style extruded gold w/ square hole, gradient texture ── [REF#EN-00314]
    else if (catId === "GOLD_COIN") {
      const coinShape = new THREE.Shape();
      coinShape.arc(0, 0, 1.68, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.moveTo(-0.48, 0.48);
      hole.lineTo(0.48, 0.48);
      hole.lineTo(0.48, -0.48);
      hole.lineTo(-0.48, -0.48);
      hole.lineTo(-0.48, 0.48);
      coinShape.holes.push(hole);
      const coinGeo = new THREE.ExtrudeGeometry(coinShape, {
        depth: 0.8,
        bevelEnabled: true,
        bevelThickness: 0.1,
        bevelSize: 0.1,
        bevelSegments: 2,
      });
      coinGeo.center();
      // Faux-metal gradient [REF#EN-00315]
      const tCanvas = document.createElement("canvas");
      tCanvas.width = 128;
      tCanvas.height = 128;
      const tCtx = tCanvas.getContext("2d");
      const grd = tCtx.createLinearGradient(0, 0, 128, 128);
      grd.addColorStop(0, "#d4af37");
      grd.addColorStop(0.3, "#b8860b");
      grd.addColorStop(0.5, "#d4af37");
      grd.addColorStop(0.7, "#6b4f00");
      grd.addColorStop(1, "#b8860b");
      tCtx.fillStyle = grd;
      tCtx.fillRect(0, 0, 128, 128);
      const coin = new THREE.Mesh(
        coinGeo,
        (() => {
          const _t = new THREE.CanvasTexture(tCanvas);
          _t.generateMipmaps = false;
          _t.minFilter = THREE.LinearFilter;
          return new THREE.MeshBasicMaterial({
            map: _t,
            side: THREE.DoubleSide,
          });
        })(),
      );
      iconMesh.add(coin);
      customUpdate = () => {}; // legacy: coin is static [REF#EN-00316]
    }
    else if (titleClean === "CARD GAME" || titleClean === "CARD_GAME") {
      const deckGroup = new THREE.Group();
      
      // The box sleeve [REF#EN-00317]
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x7c3aed,
        roughness: 0.3,
        metalness: 0.6
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.25, 0.45), boxMat);
      box.position.y = -0.15;
      deckGroup.add(box);
      
      // Expanding card planes [REF#EN-00318]
      const cards = [];
      const cardMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide
      });
      const cardBackMat = new THREE.MeshBasicMaterial({
        color: 0xb71c1c,
        side: THREE.DoubleSide
      });
      
      const cardGeo = new THREE.PlaneGeometry(0.7, 1.0);
      
      for (let i = 0; i < 3; i++) {
        const cWrapper = new THREE.Group();
        const f = new THREE.Mesh(cardGeo, cardMat);
        f.position.z = 0.002;
        const b = new THREE.Mesh(cardGeo, cardBackMat);
        b.rotation.y = Math.PI;
        b.position.z = -0.002;
        cWrapper.add(f, b);
        
        // Offset card slightly [REF#EN-00319]
        cWrapper.position.set((i - 1) * 0.15, 0.15, (i - 1) * 0.05);
        cWrapper.rotation.z = (i - 1) * 0.15;
        deckGroup.add(cWrapper);
        cards.push(cWrapper);
      }
      
      deckGroup.scale.setScalar(0.9);
      iconMesh.add(deckGroup);
      
      customUpdate = (t, m) => {
        const bounce = Math.sin(t * 2.8) * 0.28;
        cards.forEach((c, idx) => {
          c.position.y = 0.15 + bounce * (1 + idx * 0.25);
        });
        m.rotation.y = t * 1.2;
      };
    }
    // ── SLOT MACHINE — complete mini cabinet with spinning reels ────────────── [REF#EN-00320]
    else if (titleClean === "SLOT MACHINE" || titleClean === "SLOT_MACHINE") {
      const slotGroup = new THREE.Group();
      
      // Cabinet body [REF#EN-00321]
      const cabinetMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37, // golden finish [REF#EN-00322]
        metalness: 0.8,
        roughness: 0.2
      });
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.35, 0.7), cabinetMat);
      cabinet.position.y = -0.1;
      slotGroup.add(cabinet);
      
      // Screen inset [REF#EN-00323]
      const screenMat = new THREE.MeshBasicMaterial({ color: 0x111115 });
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.1), screenMat);
      screen.position.set(0, 0.18, 0.32);
      slotGroup.add(screen);
      
      // Three spinning reels [REF#EN-00324]
      const reels = [];
      const reelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.16, 12);
      const reelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      
      for (let i = 0; i < 3; i++) {
        const reel = new THREE.Mesh(reelGeo, reelMat);
        reel.rotation.z = Math.PI / 2;
        reel.position.set((i - 1) * 0.22, 0.18, 0.35);
        slotGroup.add(reel);
        reels.push(reel);
      }
      
      // Side handle lever [REF#EN-00325]
      const leverGroup = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.48, 8),
        new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.9 })
      );
      shaft.position.y = 0.24;
      leverGroup.add(shaft);
      
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff3333 })
      );
      knob.position.y = 0.48;
      leverGroup.add(knob);
      
      leverGroup.position.set(0.48, -0.15, 0);
      leverGroup.rotation.z = -0.4;
      slotGroup.add(leverGroup);
      
      slotGroup.scale.setScalar(0.85);
      iconMesh.add(slotGroup);
      
      customUpdate = (t, m) => {
        reels.forEach((r, idx) => {
          r.rotation.x = t * (4.5 + idx * 2.0);
        });
        
        // Smooth lever pull animation [REF#EN-00326]
        const pull = Math.sin(t * 3.5);
        if (pull > 0.5) {
          leverGroup.rotation.z = -0.4 - (pull - 0.5) * 0.8;
        } else {
          leverGroup.rotation.z = -0.4;
        }
        
        m.rotation.y = t * 1.0;
      };
    }
    // ── CONTRACTS — rolled parchment scroll with glowing wax seal ─────────── [REF#EN-00327]
    else if (titleClean === "CONTRACTS" || titleClean === "CONTRACTS_JOB") {
      const questGroup = new THREE.Group();
      
      // Parchment Scroll [REF#EN-00328]
      const parchmentMat = new THREE.MeshStandardMaterial({
        color: 0xfffdd0,
        roughness: 0.8,
        metalness: 0.0
      });
      const scroll = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.25, 16), parchmentMat);
      scroll.rotation.z = Math.PI / 4;
      questGroup.add(scroll);
      
      // Wax Seal (Glowing red) [REF#EN-00329]
      const sealMat = new THREE.MeshBasicMaterial({
        color: 0xff1111,
        transparent: true,
        opacity: 0.95
      });
      const seal = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 16), sealMat);
      seal.position.set(0, 0, 0.15);
      questGroup.add(seal);
      
      // Wax Center [REF#EN-00330]
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), sealMat);
      center.position.set(0, 0, 0.15);
      questGroup.add(center);
      
      // Tiny sword next to it [REF#EN-00331]
      const sword = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xd4af37 }));
      sword.rotation.z = -Math.PI / 4;
      sword.position.set(0.1, -0.1, 0.05);
      questGroup.add(sword);
      
      questGroup.scale.setScalar(0.95);
      iconMesh.add(questGroup);
      
      customUpdate = (t, m) => {
        m.rotation.y = t * 1.2;
        m.rotation.x = Math.sin(t * 1.8) * 0.15;
        
        // Pulse the red wax seal [REF#EN-00332]
        const pulse = 0.8 + Math.abs(Math.sin(t * 4)) * 0.35;
        seal.scale.setScalar(pulse);
        center.scale.setScalar(pulse);
      };
    }
    // ── LEVEL KEY — a real 3D gold key (bow ring + collar + shank + bit teeth), replacing the [REF#EN-00333]
    //    generic fallback CUBE (Mark 2026-07-13 "fix shape of 3d model for level key to look like a
    //    3d webgl gold key"). Matched on \bKEY\b so LEVEL KEY (and any future key card) gets it while
    //    words like MONKEY do not. Gold material mirrors the proven SLOT MACHINE finish (0xd4af37) with
    //    a safety emissive so it stays gold even under the panels iframe's bright icon lighting. ──
    else if (titleClean === "LEVEL KEY" || /\bKEY\b/.test(titleClean)) {
      const key = new THREE.Group();
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37, metalness: 0.85, roughness: 0.25, emissive: 0x3a2b08, emissiveIntensity: 0.5,
      });
      // Bow — the round grip you hold, facing the camera (torus default XY plane) [REF#EN-00334]
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 16, 28), goldMat);
      bow.position.y = 0.72;
      key.add(bow);
      // Collar — the bead where the bow meets the shank [REF#EN-00335]
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 16), goldMat);
      collar.position.y = 0.44;
      key.add(collar);
      // Shank — the long stem [REF#EN-00336]
      const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.16, 16), goldMat);
      shank.position.y = -0.18;
      key.add(shank);
      // Bit — the teeth at the bottom that turn the lock (step out one side) [REF#EN-00337]
      const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.17, 0.12), goldMat);
      tooth1.position.set(0.19, -0.56, 0);
      key.add(tooth1);
      const tooth2 = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.17, 0.12), goldMat);
      tooth2.position.set(0.14, -0.72, 0);
      key.add(tooth2);
      key.scale.setScalar(0.95);
      iconMesh.add(key);
      customUpdate = (t, m) => {
        m.rotation.y = t * 1.2;                  // slow spin so the teeth catch the light [REF#EN-00338]
        m.rotation.x = Math.sin(t * 1.6) * 0.12; // gentle tilt [REF#EN-00339]
      };
    }
    // ── DICE fallback ───────────────────────────────────────────────────────── [REF#EN-00340]
    else {
      const die = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.6, 1.6),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.2,
          metalness: 0.1,
        }),
      );
      iconMesh.add(die);
      customUpdate = (t, m) => {
        m.rotation.y = t * 1.5;
        m.rotation.x = Math.sin(t * 2) * 0.5;
      };
    }

    return { iconMesh, customUpdate };
}

export default buildLegacyLootIcon;
