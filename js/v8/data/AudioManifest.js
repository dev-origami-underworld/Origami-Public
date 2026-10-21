/** [REF#DA-00001]
 * AudioManifest.js — GENERATED. Do not hand-edit; run `node scripts/build-audio-manifest.js`.
 *
 * Mark 2026-08-05: "lets make sure we list out what songs we have in the songs folder, some are okay
 * and some aren't so just list them and I'll checkmark what is what if you have a selector for each".
 *
 * A browser cannot list a directory, so this is the disk's contents frozen into a module. It exists so
 * the music page can show Mark EVERY track, including the 31 that no code references yet —
 * those are invisible to the game and were invisible to him until this file existed.
 *
 * `inCatalog` is matched against SongCatalog's real file:/continuation: strings, never by filename
 * similarity: an earlier inventory in this project reported TooCute-2/3 as wired when they were only
 * matching a comment, and that error travelled into a handoff.
 *
 * `kind` splits music from sfx by DURATION (< 30s = sfx), not by folder — assets/sounds/Dungeon
 * holds both a theme song and a door click, so folder is not a signal.
 *
 * Counts at generation: 50 music, 11 sfx, 31 music files uncatalogued.
 */
export const SFX_UNDER_S = 30;

export const AUDIO_FILES = Object.freeze([
    { file: "./assets/sounds/BG-OLD/BG-Music-Pilgrim.mp3", name: "BG-Music-Pilgrim", dir: "BG-OLD", seconds: 214.8, kind: 'music', family: "BG-Music-Pilgrim", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/BG-Phantasm.mp3", name: "BG-Phantasm", dir: "BG-OLD", seconds: 194.2, kind: 'music', family: "BG-Phantasm", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/BG-PostParisDream.mp3", name: "BG-PostParisDream", dir: "BG-OLD", seconds: 212.3, kind: 'music', family: "BG-PostParisDream", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/DevilzDuel.mp3", name: "DevilzDuel", dir: "BG-OLD", seconds: 212.2, kind: 'music', family: "DevilzDuel", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/Kabuki-Duel.mp3", name: "Kabuki-Duel", dir: "BG-OLD", seconds: 137.6, kind: 'music', family: "Kabuki-Duel", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/Marked-Cards-at-Dawn.mp3", name: "Marked-Cards-at-Dawn", dir: "BG-OLD", seconds: 122, kind: 'music', family: "Marked-Cards-at-Dawn", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/Moonlit-PaperCut.mp3", name: "Moonlit-PaperCut", dir: "BG-OLD", seconds: 142, kind: 'music', family: "Moonlit-PaperCut", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/Moonlit-PaperCut2.mp3", name: "Moonlit-PaperCut2", dir: "BG-OLD", seconds: 143.3, kind: 'music', family: "Moonlit-PaperCut", part: 2, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/SilentBlade.mp3", name: "SilentBlade", dir: "BG-OLD", seconds: 194.2, kind: 'music', family: "SilentBlade", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/Song-dance-紅い扇子.mp3", name: "Song-dance-紅い扇子", dir: "BG-OLD", seconds: 191.1, kind: 'music', family: "Song-dance-紅い扇子", part: null, lang: 'ja', inCatalog: true },
    { file: "./assets/sounds/BG-OLD/Starlette-EDM黄泉の宿-1.mp3", name: "Starlette-EDM黄泉の宿-1", dir: "BG-OLD", seconds: 71.9, kind: 'music', family: "Starlette-EDM黄泉の宿", part: 1, lang: 'ja', inCatalog: true },
    { file: "./assets/sounds/BG-OLD/Starlette-EDM黄泉の宿-2.mp3", name: "Starlette-EDM黄泉の宿-2", dir: "BG-OLD", seconds: 126.2, kind: 'music', family: "Starlette-EDM黄泉の宿", part: 2, lang: 'ja', inCatalog: true },
    { file: "./assets/sounds/BG-OLD/StarletteSong_紅い扇子.mp3", name: "StarletteSong_紅い扇子", dir: "BG-OLD", seconds: 197.8, kind: 'music', family: "StarletteSong_紅い扇子", part: null, lang: 'ja', inCatalog: true },
    { file: "./assets/sounds/BG-OLD/The_Withered_Gate.mp3", name: "The_Withered_Gate", dir: "BG-OLD", seconds: 97.3, kind: 'music', family: "The_Withered_Gate", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/Twin-Dice-Moon.mp3", name: "Twin-Dice-Moon", dir: "BG-OLD", seconds: 153.6, kind: 'music', family: "Twin-Dice-Moon", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/Underworld-ThemeSong-Taps.mp3", name: "Underworld-ThemeSong-Taps", dir: "BG-OLD", seconds: 219.6, kind: 'music', family: "Underworld-ThemeSong-Taps", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/sorahibana.mp3", name: "sorahibana", dir: "BG-OLD", seconds: 101.5, kind: 'music', family: "sorahibana", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/BG-OLD/spooky-bg-music.mp3", name: "spooky-bg-music", dir: "BG-OLD", seconds: 194.4, kind: 'music', family: "spooky-bg-music", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/BG-SpookySnackRun.mp3", name: "BG-SpookySnackRun", dir: "Dungeon", seconds: 29.6, kind: 'sfx', family: "BG-SpookySnackRun", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/Permit-Activation.mp3", name: "Permit-Activation", dir: "Dungeon", seconds: 51.2, kind: 'music', family: "Permit-Activation", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/Permit-Cafeteria.mp3", name: "Permit-Cafeteria", dir: "Dungeon", seconds: 27.6, kind: 'sfx', family: "Permit-Cafeteria", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/Permit-Factory.mp3", name: "Permit-Factory", dir: "Dungeon", seconds: 32.3, kind: 'music', family: "Permit-Factory", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/click.mp3", name: "click", dir: "Dungeon", seconds: 1.1, kind: 'sfx', family: "click", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/coins.mp3", name: "coins", dir: "Dungeon", seconds: 0.7, kind: 'sfx', family: "coins", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/pop.mp3", name: "pop", dir: "Dungeon", seconds: 1.1, kind: 'sfx', family: "pop", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/recordscratch.mp3", name: "recordscratch", dir: "Dungeon", seconds: 2, kind: 'sfx', family: "recordscratch", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/reload-pistol.mp3", name: "reload-pistol", dir: "Dungeon", seconds: 1.5, kind: 'sfx', family: "reload-pistol", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/spooky-gong.mp3", name: "spooky-gong", dir: "Dungeon", seconds: 6.1, kind: 'sfx', family: "spooky-gong", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/spooky-stairs.mp3", name: "spooky-stairs", dir: "Dungeon", seconds: 2.4, kind: 'sfx', family: "spooky-stairs", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Dungeon/秘密のダンス.mp3", name: "秘密のダンス", dir: "Dungeon", seconds: 57.9, kind: 'music', family: "秘密のダンス", part: null, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/DevilzDuel.mp3", name: "DevilzDuel", dir: "Songs", seconds: 212.2, kind: 'music', family: "DevilzDuel", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Songs/SilentBlade.mp3", name: "SilentBlade", dir: "Songs", seconds: 194.2, kind: 'music', family: "SilentBlade", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Cabaret-Startup-1.mp3", name: "Starlette-Cabaret-Startup-1", dir: "Songs", seconds: 212.3, kind: 'music', family: "Starlette-Cabaret-Startup", part: 1, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-Cabaret-Startup-2.mp3", name: "Starlette-Cabaret-Startup-2", dir: "Songs", seconds: 231.2, kind: 'music', family: "Starlette-Cabaret-Startup", part: 2, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-Card-1.mp3", name: "Starlette-Card-1", dir: "Songs", seconds: 118.6, kind: 'music', family: "Starlette-Card", part: 1, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-Card-3.mp3", name: "Starlette-Card-3", dir: "Songs", seconds: 145.9, kind: 'music', family: "Starlette-Card", part: 3, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-Card-4.mp3", name: "Starlette-Card-4", dir: "Songs", seconds: 69.4, kind: 'music', family: "Starlette-Card", part: 4, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-FrenchSong-歌に息.mp3", name: "Starlette-FrenchSong-歌に息", dir: "Songs", seconds: 267.2, kind: 'music', family: "Starlette-FrenchSong-歌に息", part: null, lang: 'ja', inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-HeartToHeart.mp3", name: "Starlette-HeartToHeart", dir: "Songs", seconds: 128.1, kind: 'music', family: "Starlette-HeartToHeart", part: null, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-IntroSong-歌に息.mp3", name: "Starlette-IntroSong-歌に息", dir: "Songs", seconds: 94.6, kind: 'music', family: "Starlette-IntroSong-歌に息", part: null, lang: 'ja', inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-MerciMercy-B.mp3", name: "Starlette-MerciMercy-B", dir: "Songs", seconds: 82.6, kind: 'music', family: "Starlette-MerciMercy-B", part: null, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-Paris.mp3", name: "Starlette-Paris", dir: "Songs", seconds: 137.8, kind: 'music', family: "Starlette-Paris", part: null, lang: null, inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-EDM/Starlette-EDM-30seconds-promo.黄泉の宿.mp3", name: "Starlette-EDM-30seconds-promo.黄泉の宿", dir: "Songs/Starlette-Song-EDM", seconds: 26.8, kind: 'sfx', family: "Starlette-EDM-30seconds-promo.黄泉の宿", part: null, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-EDM/Starlette-EDM-42seconds-黄泉の宿.mp3", name: "Starlette-EDM-42seconds-黄泉の宿", dir: "Songs/Starlette-Song-EDM", seconds: 43.1, kind: 'music', family: "Starlette-EDM-42seconds-黄泉の宿", part: null, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-EDM/Starlette-EDM-黄泉の宿-1.mp3", name: "Starlette-EDM-黄泉の宿-1", dir: "Songs/Starlette-Song-EDM", seconds: 71.9, kind: 'music', family: "Starlette-EDM-黄泉の宿", part: 1, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-EDM/Starlette-EDM黄泉の宿-2.mp3", name: "Starlette-EDM黄泉の宿-2", dir: "Songs/Starlette-Song-EDM", seconds: 126.2, kind: 'music', family: "Starlette-EDM黄泉の宿", part: 2, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-EDM/黄泉の宿-1.mp3", name: "黄泉の宿-1", dir: "Songs/Starlette-Song-EDM", seconds: 43.1, kind: 'music', family: "黄泉の宿", part: 1, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-EDM/黄泉の宿2.mp3", name: "黄泉の宿2", dir: "Songs/Starlette-Song-EDM", seconds: 26.8, kind: 'sfx', family: "黄泉の宿", part: 2, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-HeartToHeart/Starlette-HeartToHeart-2.mp3", name: "Starlette-HeartToHeart-2", dir: "Songs/Starlette-Song-HeartToHeart", seconds: 88.8, kind: 'music', family: "Starlette-HeartToHeart", part: 2, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-Song-MortalBeneathParisSkies/A_Mortal_Beneath_Paris_Skies-1.mp3", name: "A_Mortal_Beneath_Paris_Skies-1", dir: "Songs/Starlette-Song-MortalBeneathParisSkies", seconds: 95.7, kind: 'music', family: "A_Mortal_Beneath_Paris_Skies", part: 1, lang: null, inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-MortalBeneathParisSkies/A_Mortal_Beneath_Paris_Skies-2.mp3", name: "A_Mortal_Beneath_Paris_Skies-2", dir: "Songs/Starlette-Song-MortalBeneathParisSkies", seconds: 124.1, kind: 'music', family: "A_Mortal_Beneath_Paris_Skies", part: 2, lang: null, inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-StrongEDM/地獄越え-1.mp3", name: "地獄越え-1", dir: "Songs/Starlette-Song-StrongEDM", seconds: 44.2, kind: 'music', family: "地獄越え", part: 1, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-StrongEDM/地獄越え-2.mp3", name: "地獄越え-2", dir: "Songs/Starlette-Song-StrongEDM", seconds: 147.1, kind: 'music', family: "地獄越え", part: 2, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-StrongEDM/地獄越え-3.mp3", name: "地獄越え-3", dir: "Songs/Starlette-Song-StrongEDM", seconds: 46.4, kind: 'music', family: "地獄越え", part: 3, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-StrongEDM/地獄越え-4.mp3", name: "地獄越え-4", dir: "Songs/Starlette-Song-StrongEDM", seconds: 93, kind: 'music', family: "地獄越え", part: 4, lang: 'ja', inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-1.mp3", name: "Starlette-TooCute-1", dir: "Songs/Starlette-Song-TooCuteForThsiGame", seconds: 141.8, kind: 'music', family: "Starlette-TooCute", part: 1, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-2.mp3", name: "Starlette-TooCute-2", dir: "Songs/Starlette-Song-TooCuteForThsiGame", seconds: 156.1, kind: 'music', family: "Starlette-TooCute", part: 2, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-3.mp3", name: "Starlette-TooCute-3", dir: "Songs/Starlette-Song-TooCuteForThsiGame", seconds: 176.2, kind: 'music', family: "Starlette-TooCute", part: 3, lang: null, inCatalog: false },
    { file: "./assets/sounds/Songs/Starlette-Song-TooCuteForThsiGame/Starlette-TooCute-Extended.mp3", name: "Starlette-TooCute-Extended", dir: "Songs/Starlette-Song-TooCuteForThsiGame", seconds: 422.4, kind: 'music', family: "Starlette-TooCute-Extended", part: null, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-Winning.mp3", name: "Starlette-Winning", dir: "Songs", seconds: 132.2, kind: 'music', family: "Starlette-Winning", part: null, lang: null, inCatalog: true },
    { file: "./assets/sounds/Songs/Starlette-CrossingtheVoid.mp3", name: "Starlette-CrossingtheVoid", dir: "Songs", seconds: 330.9, kind: 'music', family: "Starlette-CrossingtheVoid", part: null, lang: 'ja', inCatalog: true },
]);

/** Just the tracks worth grading — sfx excluded so nobody is asked to rate a door click. [REF#DA-00002] */
export const MUSIC_FILES = Object.freeze(AUDIO_FILES.filter(f => f.kind === 'music'));

/** [REF#DA-00003]
 * Songs, not files: parts sharing a family collapse into ONE entry with its parts in order.
 * Mark 2026-08-05 — "the songs with a -1 -2 -3 are chorus to those same songs so always group those
 * together." A player should see 地獄越え once, not four times.
 */
export const SONG_GROUPS = Object.freeze((() => {
    const by = new Map();
    for (const f of MUSIC_FILES) {
        const g = by.get(f.family) || { family: f.family, parts: [], lang: f.lang, seconds: 0 };
        g.parts.push(f);
        g.seconds += (f.seconds || 0);
        if (f.lang) g.lang = f.lang;
        by.set(f.family, g);
    }
    for (const g of by.values()) g.parts.sort((a, b) => (a.part || 0) - (b.part || 0));
    return [...by.values()];
})());

export default AUDIO_FILES;
