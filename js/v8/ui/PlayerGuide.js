/** [REF#UI-00569]
 * NewOrigami v8 — Welcome / Intro Guide module
 * Idea Software Studio © 2026. See LICENSE for permitted use.
 *
 * Replaces the previous book-overlay implementation + the inline
 * #settings-modal.intro-modal block in NewOrigami.Panels.html. Single
 * source of truth for the welcome flow.
 *
 * HARD RULES (per saved feedback memories):
 *   - Every slide renders at IDENTICAL width + height. Validator at
 *     scripts/probe-intro-guide.js measures the slide stage after each
 *     setSlide() and asserts equality.
 *   - Card taxonomy stays MELEE / RANGED / SPELL / ITEM — the COMBAT
 *     slide uses only these four pills.
 *   - Design tokens are pulled from the panels' dark-neumorphic system
 *     (matches .side-panel / .sp-btn shadow recipe).
 *   - Title uses the "ward font" — Noto Serif JP light + ethereal teal
 *     #22d3ee + cyan glow.
 *
 * Public API:
 *   const wg = new WelcomeGuide();      // singleton ok via window.welcomeGuide
 *   wg.show();                          // injects + activates
 *   wg.hide({ isFromLoad: false });     // dismisses; descent flow when not from-load
 *   wg.setSlide(idx); nextSlide(); prevSlide();
 *   wg.selectRole(roleId);              // also mirrors to window.selectedRole
 *   wg.acceptTC(checked);
 *   wg.showLoading(title, durMs); wg.completeLoading(success);
 *
 * External hooks expected on window:
 *   - window.openSaveModal()    (panels owns the save list)
 *   - window.openTCModal()      (panels owns the T&C scroll)
 *   - window.selectedRole       (read by engine + save system)
 *   - window._tcAccepted        (read by close flow)
 */
import {
    AVATAR_ACTIONS,
    AVATAR_CATALOG,
    MONSTER_ACTIONS,
    MONSTER_CATALOG,
    MONSTER_SOUND_CATALOG,
    MONSTER_SOUND_SLOTS,
    MONSTER_SOUND_ORPHANS,
    GAMBLING_SFX_CATALOG,
    animKeyFor,
    soundKeyFor,
    engineModelFor,
    getAvatarForRole,
} from '../data/EntityCatalog.js?v=8.4.1537-stamped';   // ⚠ CACHE-BUST REQUIRED (Mark 2026-07-19). This import had NO ?v= token, so the browser pinned EntityCatalog.js in HTTP cache by filename FOREVER — every codex data fix (the corrected goblin HP, the succubi->succubus rename, the noAnimClips flag) shipped to git but never reached the running game, while PlayerGuide.js?v= was being bumped around it. That is the documented "fixed but still broken" trap. BUMP THIS TOKEN whenever EntityCatalog.js changes. [REF#UI-00570]
import { QuickLaunchGuide } from './QuickLaunchGuide.js?v=8325-comment-refs2';

// ── Self-contained guide localization dictionary ────────────────────────── [REF#UI-00571]
// Guide strings are localized HERE rather than in the central js/data/i18n.js
// to avoid clobbering that file while it is under concurrent localization
// edits (2026-06-05, Worker B). English lives inline as _L() fallbacks (so the
// guide is never blank); non-English lives in this dict. _L() also falls
// through to the central catalog (window.tLog) if/when these keys are added
// there, so this can be migrated into OrigamiI18n.<lang> later with no churn.
// ── PLAIN-LANGUAGE TWINS (WCAG 3.1.5 Reading Level · AAA A8 · Mark 2026-09-12 "make it 100% wcag 2.2/aaa … actual help
//    disabled kids"). MEASURED with scripts/a11y-reading-level.js (Flesch-Kincaid over every _t default): 53 graded strings,
//    FIVE above grade 9 (lower-secondary) — the T&C jokes at grade 18-20, the cover lore at 10.2, the donate lore at 9.3.
//    3.1.5 asks for an ALTERNATIVE, not a rewrite: the originals stay exactly as Mark wrote them (his humour is the game);
//    the twin below is shown instead only when Display Options → "Plain language" is on (origami.a11y.plainText). Every
//    twin is graded by the same script and must stay ≤ grade 9 — short sentences, common words, the joke kept. [REF#UI-A8]
const WG_PLAIN = {
  en: {
    'wg.cover.lore.1': 'Welcome to Origami Underworld — <b>A Dark Fantasy Rock Opera RPG</b>. Explore the crime gang’s home base. Find song cards and bring them to Starlette. Her songs wake the dungeon.',
    'wg.donate.lore.1': 'Origami Underworld is <b>free</b>. It always will be. It is a gift, like the free games of the 1980s. It is for every kid and every traveler, and most of all for those who could never pay.',
    'tc.3.body': 'We are not to blame if this game harms you. That means the maker, the testers, the ghost voices, the Serpent Boss, and the haiku writers. It does not matter if you play online or offline. If a succubus breaks your heart, that is on you. If you cut your finger on these terms, do not cry to us, bub.',
    'tc.6.body': 'These terms are judged by the Court of Cosmic Justice. Grumpy Ogres run it. Its rulings are final. Punishments include: write a haiku to say sorry, sit under a cold waterfall, give us one magic lantern, or be reborn as a Level-1 Goblin who scrubs floors with a toothbrush. Or we may just ignore you. Be honest: this may be the first terms page you ever read.',
    'tc.7.body': 'If one rule here does not hold, the rest still do. These words are exact. They apply now and each time you come back. Big companies use terms like these to own you. We do not. We do not want your soul. We have plenty for sale already. There are no blood oaths here. But be honest: you never read terms anyway.',
  },
  ja: {
    'wg.cover.lore.1': '折り紙地獄へようこそ。<b>ダークファンタジー・ロックオペラRPG</b>です。犯罪組織の本部を探検しましょう。歌のカードを見つけてスターレットに届けると、その歌がダンジョンを目覚めさせます。',
    'wg.donate.lore.1': '折り紙地獄は<b>無料</b>です。ずっと無料です。1980年代のフリーソフトのような贈り物です。すべての子どもと旅人のため、とくにお金を払えない人のためのものです。',
    'tc.3.body': 'このゲームであなたが困っても、私たちのせいではありません。作った人、テストした人、幽霊の語り手、蛇のボス、俳句を書く人、みんなです。オンラインでもオフラインでも同じです。サキュバスに心を壊されても、それはあなたの責任です。この規約で指を切っても、泣きつかないでね。',
    'tc.6.body': 'この規約は「宇宙正義裁判所」が判断します。気むずかしい鬼たちが運営しています。判決は最終です。罰は、ごめんなさいの俳句を書く、冷たい滝に打たれる、魔法のランタンを一つ差し出す、または床をハブラシでみがくレベル1のゴブリンに生まれ変わる、のどれかです。無視されることもあります。正直に言うと、これが初めて読んだ規約かもしれませんね。',
    'tc.7.body': '一つの規則が無効でも、ほかの規則は有効です。この言葉は正確です。今も、次に来たときも同じです。大きな会社はこういう規約であなたを縛ります。私たちは違います。あなたの魂はいりません。魂ならもう売るほどあります。血の誓いもありません。でも正直に。どうせ規約なんて読まないでしょう。',
  },
};
const WG_I18N = {
  ja: {
    // Filled 2026-06-05 (Worker B). Keys mirror the _L(key,'English') call sites. [REF#UI-00572]
    // ── GOLD UNIT (Mark 2026-08-20 "fix localization error here" — the guide's gold bar read
    //    "0 GOLD" while the player panel two inches away read 金) ──────────────────────────────
    //    IT HAS TO LIVE HERE, not in js/data/i18n.js. My first cut added "wg.gold.unit" to that
    //    file's `ui` block and the bar still rendered GOLD: _L() consults WG_I18N and then
    //    window.tLog, and tLog reads the `log` section only (i18n.js ~:1487) — it can never see
    //    a `ui` key. The probe caught it, and the dead entry was removed rather than left to sit
    //    there looking authoritative. 金 matches the sidepanel's gold-label exactly.
    "wg.gold.unit": "金",
    "wg.cover.welcome_title": "ようこそ、旅人よ",
    "wg.cover.lore.1": "オリガミ・アンダーワールドへようこそ——<b>ダークファンタジー・ロックオペラRPG</b>。犯罪シンジケートの総本部を探索せよ。歌のカードを集めてスターレットに届けよう。その歌がダンジョンを目覚めさせる。",
    "wg.cover.lore.2": "<b>月に気をつけろ。</b> 月はすべてを変える。",
    "wg.cover.lore.3": "好きに遊べ——アンダーワールドはお前の流儀に合わせる。",
    "wg.cover.lore.4": "楽しいクエストと、遊ぶたびに新しいダンジョン。勝ったら気をつけろ——アンダーワールドに欲深い冒険者たちが攻め込んでくる。",
    "wg.cover.lore.5": "ペイ・トゥ・プレイなし。ペイ・トゥ・ウィンなし。課金なし——純粋なゲームの楽しさだけ。",
    "wg.cover.lore.warn": "気をつけろ——彼女は無礼な客を好まない。",
    // TRIMMED with the EN default 2026-08-15 (Mark) — the claim only; the keyboard/F1 sentence is cut. [REF#UI-00573]
    // The KEY stays (a missing key renders as unmarked markup and smoke:i18n fails); only the value shrank.
    "wg.cover.lore.a11y": "本作は WCAG 2.2/AAA 準拠の3D RPGミュージックゲームです。",
    "wg.cover.haiku.1": "未踏の道呼ぶ",
    "wg.cover.haiku.2": "今引き返すか賭けるか——",
    "wg.cover.haiku.3": "銭は戻らぬ",
    "wg.cover.tip.btn": "投げ銭 · PayPal",                    // cover donate button (2026-10-01) [REF#PENDING] [REF#UI-01469]
    "wg.cover.tip.note": "寄付は任意です — ゲームはいつでも無料。",
    "wg.rooms.ok": "OK ・ ショーをお楽しみください",
    // ── THE SETTINGS CATALOG · COLORS · MUSIC (2026-10-02) ── [REF#UI-01470]
    "wg.tab.settings": "設定", "wg.tab.monsters": "モンスター", "wg.tab.colors": "色", "wg.tab.music": "音楽",
    "wg.settings.title": "設定", "wg.settings.sub2": "変えられるすべてのカタログ",
    "wg.settings.flavor2": "右のページから選んでください。モンスター、色、音楽は、それぞれこの本の中に自分のページがあります。",
    "wg.settings.catalog": "カタログ",
    "wg.cat.monsters": "モンスター", "wg.cat.monsters.d": "すべてのモンスター——モデル、アニメーション、音",
    "wg.cat.colors": "色", "wg.cat.colors.d": "読みやすいハイコントラスト",
    "wg.cat.music": "音楽", "wg.cat.music.d": "持っている曲すべて——一曲ずつ、または全部まとめて",
    "wg.cat.audio": "オーディオ", "wg.cat.audio.d": "効果音とBGM",
    "wg.cat.display": "表示", "wg.cat.display.d": "動き、時間、読みやすさ、ミニマップ",
    "wg.colors.title": "色", "wg.colors.sub": "自分に合った見え方で",
    "wg.colors.flavor": "ハイコントラストでは、すべてのパネルが真っ黒になり、文字は明るい白、縁ははっきりした白になります。文字もボタンも読みやすくなります。",
    "wg.colors.contrast": "コントラスト",
    "wg.colors.system": "システム", "wg.colors.system.d": "端末の設定に従う",
    "wg.colors.normal": "標準", "wg.colors.normal.d": "ゲーム本来のガラスのパネル",
    "wg.colors.hc": "ハイコントラスト", "wg.colors.hc.d": "真っ黒な地、明るい文字、はっきりした縁",
    "wg.colors.hint": "サイドパネル、この本、音楽プレイヤー、イベントログが変わります。3Dの世界はそのままの色です。",
    "wg.aria.colors": "色", "wg.aria.music": "音楽",
    "wg.music.controls": "BGM", "wg.music.enable": "BGMを有効にする", "wg.music.hint": "キャバレーで曲が順番に流れます",   // room welcome cards — OK button, localized (Mark 2026-06-19) [REF#UI-00574]
    // ── WORLD page (WCAG P4, 2026-08-14) ── [REF#UI-00575]
    "wg.tab.world": "世界",
    "wg.world.title": "世界",
    "wg.world.sub": "周りのすべてを、言葉で",
    "wg.world.flavor": "部屋を選び、物を選び、何をするか選ぶ——チャット欄に打てるコマンドがそのままボタンに。",
    "wg.world.refresh": "更新",
    "wg.world.rooms_aria": "この階の部屋",
    "wg.world.loading": "フロアを読み取り中…",
    "wg.world.pick": "部屋を選んで",
    "wg.world.pick_hint": "左ページで部屋を選ぶと、中にある物が並びます。",
    "wg.world.here": "現在地",
    "wg.world.none": "何も見つからない——更新を試して。",
    "wg.world.empty_room": "この部屋には今、目ぼしい物はない。",
    "wg.world.tiles": "マス",
    "wg.world.v.look": "調べる", "wg.world.v.walk": "行く", "wg.world.v.pickup": "拾う",
    "wg.world.v.smash": "壊す", "wg.world.v.sleep": "寝る", "wg.world.v.use": "使う",
    "wg.world.v.talk": "話す", "wg.world.v.gamble": "賭ける", "wg.world.v.spare": "見逃す",
    "wg.world.v.parley": "交渉", "wg.world.v.attack": "攻撃", "wg.world.v.go": "移動",
    "wg.aria.world": "世界ブラウザ",
    "wg.dots.aria": "ページ送り",
    "wg.dots.page": "ページ",
    // ── A11Y settings (WCAG R5, 2026-08-14) ── [REF#UI-00576]
    "wg.audio.sfxvol": "効果音の音量",
    "wg.audio.sfxhint": "足音・打撃・モンスターなど、すべての効果音の音量。音楽は「音楽」ページに別の調整があります。",
    "wg.display.reducedmotion": "動きを減らす",
    "wg.display.rmhint": "UIの装飾的な動きを抑えます。ここで変更するまではOSの設定に従います。",
    "wg.display.relaxtiming": "時間制限をゆるめる",
    "wg.display.rthint": "考えている間にメニューが勝手に閉じなくなります。スイッチ操作・スクリーンリーダー利用者におすすめ。",
    "wg.display.plaintext": "やさしい日本語",
    "wg.display.pthint": "長い文やむずかしい文を、短くやさしい言葉に置きかえます。ジョークはそのままです。",
    "wg.display.turnmode": "ターン制 — 世界はあなたを待ちます",
    "wg.display.tmhint": "あなたが動いたり行動したりする間だけ、モンスターと時計が進みます。ターンの間は好きなだけ考えられます。ゲーム中は P キーで切り替え。",
    "wg.display.reading": "読みやすい表示",
    "wg.display.rdhint": "ガイドブックの文字に行間と段落の間を広くとり、一行を追いやすい長さにします。",
    "wg.display.singlekeys": "一文字キーのショートカット",
    "wg.display.skhint": "M・V・R・E・P などの文字キーがそのまま動作します。音声入力を使う人や、手が勝手にキーを押してしまう人はオフにしてください。矢印キー・Enter・Escape・Fキーはそのまま使えます。",
    "wg.tab.glossary": "用語",
    "wg.gloss.title": "用語集",
    "wg.gloss.sub": "この本に出てくる難しい言葉を、読み方と意味つきで。",
    "wg.gloss.h.ja": "日本語の言葉",
    "wg.gloss.h.abbr": "略語",
    "wg.gloss.h.game": "このゲームだけの使い方をする言葉",
    "wg.aria.glossary": "用語集",
    "wg.gloss.ja.guardpost": "番所。下り階段のある鍵のかかった部屋。鬼は入るまで眠っている。",
    "wg.gloss.ja.permit": "検査官が扉を開ける前に求める紙。",
    "wg.gloss.ja.karma": "あなたのしたことの合計。死んだときに請求される。",
    "wg.gloss.ja.onibaba": "山姥。ダンジョンの心。見ていて、覚えている。",
    "wg.gloss.ja.oni": "特別な部屋を守る、大きな眠り手。",
    "wg.gloss.ja.yomi": "昔の物語に出てくる死者の国。",
    "wg.gloss.ja.meikai": "このゲームの舞台となる地下の世界。",
    "wg.gloss.ja.paperhell": "ここにあるものはすべて折り紙。モンスターも。",
    "wg.gloss.ja.origami": "紙のモンスターは折り目に沿って切るとばらばらになる。",
    "wg.gloss.ja.stage": "ショーの舞台。舞台裏はその後ろ。",
    "wg.gloss.ja.dressing": "舞台の裏の支度部屋。",
    "wg.gloss.ja.office": "支配人の部屋。",
    "wg.gloss.ja.storage": "物をしまう部屋。",
    "wg.gloss.ja.factory": "工場。",
    "wg.gloss.ja.cafeteria": "食堂。",
    "wg.gloss.ja.staffonly": "鍵のかかった扉の貼り紙。",
    "wg.gloss.ja.nagesen": "演者に投げるお金。チップ箱。",
    "wg.gloss.ja.hand": "いま手に持っているカード。",
    "wg.gloss.ja.toba": "賭け事をする場所。",
    "wg.gloss.ja.vending": "自動販売機。",
    "wg.gloss.ja.konbini": "入口そばの小さなお店。",
    "wg.gloss.ja.fan": "折りたたみの扇。",
    "wg.gloss.ja.broke": "お金がないこと。",
    "wg.gloss.ja.sanctuary": "安全な場所。",
    "wg.gloss.ja.altar": "祭壇。",
    "wg.gloss.ja.newmoon": "月の文字盤は月の満ち欠けを示す：三日月・上弦・満月・下弦・有明月。",
    "wg.gloss.ab.hitpoints": "体力。ゼロになると死ぬ。",
    "wg.gloss.ab.xp": "経験値。ためると階級が上がる。",
    "wg.gloss.ab.ac": "防御力の値。攻撃の当たりにくさ。",
    "wg.gloss.ab.atkdef": "攻撃力と防御力。",
    "wg.gloss.ab.mp": "魔法を使うのに必要な力。",
    "wg.gloss.ab.sfx": "効果音。音楽ではなく短い音。",
    "wg.gloss.ab.bgm": "背景の音楽。",
    "wg.gloss.ab.fpv": "一人称視点。自分の目で見る画面。",
    "wg.gloss.ab.pip": "隅の小さな丸い地図。",
    "wg.gloss.ab.npc": "あなた以外の登場人物。",
    "wg.gloss.ab.rng": "乱数。運のこと。",
    "wg.gloss.ab.tc": "利用規約のページ。冗談はわざとです。",
    "wg.gloss.ab.wcag": "だれでも遊べるように、このゲームが守っているアクセシビリティの指針。",
    "wg.gloss.gm.wager.k": "賭け", "wg.gloss.gm.wager": "戦うかわりに賭ける。勝てばモンスターが仲間になることも。",
    "wg.gloss.gm.parley.k": "交渉", "wg.gloss.gm.parley": "戦わずに話す。",
    "wg.gloss.gm.spare.k": "見逃す", "wg.gloss.gm.spare": "倒したモンスターを生かしておく。",
    "wg.gloss.gm.ante.k": "アンティ", "wg.gloss.gm.ante": "ゲームの前に出すお金。",
    "wg.gloss.gm.permitg.k": "許可証", "wg.gloss.gm.permitg": "検査官がくれる紙。扉が開く。",
    "wg.gloss.gm.inspector.k": "検査官", "wg.gloss.gm.inspector": "許可証を調べる係。",
    "wg.gloss.gm.garrison.k": "守備隊", "wg.gloss.gm.garrison": "番所に住む衛兵たち。",
    "wg.gloss.gm.patrol.k": "巡回", "wg.gloss.gm.patrol": "決まった道を歩く衛兵。",
    "wg.gloss.gm.mimic.k": "ミミック", "wg.gloss.gm.mimic": "本当はモンスターの宝箱。",
    "wg.gloss.gm.cut.k": "折り紙カット", "wg.gloss.gm.cut": "紙のモンスターを折り目に沿って切ること。",
    "wg.gloss.gm.turnmode.k": "ターンモード", "wg.gloss.gm.turnmode": "世界があなたを待つ。動いたときだけモンスターと時計が進む（Pキー）。",
    "wg.gloss.gm.plainlang.k": "やさしい言葉", "wg.gloss.gm.plainlang": "長い文や凝った文を短く簡単な言葉に切り替えるスイッチ。",
    "wg.gloss.gm.queue.k": "コンビニの列", "wg.gloss.gm.queue": "お店で待つ働き手の列。",
    "wg.gloss.gm.cabaret.k": "キャバレー", "wg.gloss.gm.cabaret": "入口そばのショーの部屋。舞台と歌い手がいる。",
    "wg.gloss.gm.deckhand.k": "デッキ / 手札", "wg.gloss.gm.deckhand": "あなたのカード。手札はいま出せるもの。",
    "wg.gloss.gm.slots.k": "スロット", "wg.gloss.gm.slots": "紙のスロットマシン。業が回す。",
    "wg.world.desc_unknown": "この部屋の様子は、入ったときに聞こえます。",
    "wg.display.minimap": "ミニマップ",
    "wg.display.mmhint": "隅の丸い地図と同じズームと視点ボタンを、大きなサイズで。",
    "wg.display.mmzoomin": "ミニマップを拡大",
    "wg.display.mmzoomout": "ミニマップを縮小",
    "wg.display.mmiso": "アイソメ",
    "wg.display.mmflat": "真上から",
    "wg.display.mmhigh": "高い角度",
    "wg.display.mmlow": "低い角度",
    "wg.cover.tc_agree": "私は同意します",
    "wg.tc.link": "利用規約",
    "wg.tc.heading": "📜 我らの規約",
    "wg.tc.hide": "規約を隠す",
    "wg.role.title": "役割を選べ",
    "wg.role.sub": "役割ごとに初期装備が決まる。",
    "wg.role.profile_h": "プロフィール",
    "wg.role.contract": "ボスを討ち取り、<b>運命の書</b>を持ち帰る——この契約こそがお前の最大の目的だ。自分の進む道に最も向いていると思う役割を選べ。",
    "wg.role.hint": "それぞれの役割には固有の特性とボーナス、そして初期装備がある。自分の好きな遊び方に合わせて、よく選べ。",
    "wg.role.luck": "幸運を祈る！",
    "wg.role.crest_top": "選べ、お前の",
    "wg.role.crest_bot": "役割",
    "wg.role.kit_label": "初期装備",
    // ── Role cards + profiles (names / pills / one-liners / starting kits) ── [REF#UI-00577]
    "wg.role.pistoleer.name": "ガンマン",
    "wg.role.pistoleer.pill": "拳銃使い",
    "wg.role.pistoleer.sub": "<em>マジックミサイル拳銃</em> ×14発。純遠隔のガンマン——近接なし。",
    "wg.role.pistoleer.oneliner": "ギャング階級の拳銃使い。.45口径拳銃1丁、14発、近接の備えなし——純粋な遠隔の無法稼業。",
    "wg.role.pistoleer.kit.0": "拳銃 ×14発",
    "wg.role.wizard.name": "魔法使い",
    "wg.role.wizard.pill": "秘術",
    "wg.role.wizard.sub": "杖と拳銃。<em>属性</em>の巻物が一気に伸びる。",
    "wg.role.wizard.oneliner": "秘術の学者。手には杖、懐に無作為な呪文4枚、緊急用の回復薬1つ。",
    "wg.role.wizard.kit.0": "杖——近接",
    "wg.role.wizard.kit.1": "無作為な呪文カード4枚",
    "wg.role.wizard.kit.2": "回復薬 ×1",
    "wg.role.priest.name": "僧侶",
    "wg.role.priest.pill": "聖職者",
    "wg.role.priest.sub": "聖なる<em>回復</em>薬と神の加護。",
    "wg.role.priest.oneliner": "神聖なる戦士。鎚矛と祈りの呪文2つ、瀕死のための回復薬5つ。",
    "wg.role.priest.kit.0": "メイス——近接",
    "wg.role.priest.kit.1": "無作為な呪文カード2枚",
    "wg.role.priest.kit.2": "回復薬 ×5",
    "wg.role.ninja.name": "忍者",
    "wg.role.ninja.pill": "影",
    "wg.role.ninja.sub": "<em>手裏剣</em>30枚と短刀ひと揃い。",
    "wg.role.ninja.oneliner": "影の刺客。刀1振り、手裏剣14枚、二度目はない。",
    "wg.role.ninja.kit.0": "忍者刀——近接",
    "wg.role.ninja.kit.1": "手裏剣 ×14",
    "wg.role.samurai.name": "侍",
    "wg.role.samurai.pill": "武士道",
    "wg.role.samurai.sub": "重い<em>刀</em>の一撃と侍の弓。",
    "wg.role.samurai.oneliner": "武士道の誉れ。重厚な刀と、遠間を制する侍の弓。",
    "wg.role.samurai.kit.0": "刀——近接",
    "wg.role.samurai.kit.1": "侍の弓 ×12",
    "wg.role.archer.name": "冒険者",
    "wg.role.archer.pill": "狩人",
    "wg.role.archer.sub": "<em>ニコン風カメラ</em>1台と短刀1本。閃光は武器になる。",
    "wg.role.archer.oneliner": "閃光を武器にする冒険者。フラッシュ6発で魔物の目を眩ませ、接近戦には短刀を。",
    "wg.role.archer.kit.0": "短刀——近接",
    "wg.role.archer.kit.1": "カメラ ×6——目眩まし閃光",
    "wg.role.gangster.name": "無法の拳銃使い",
    "wg.role.gangster.pill": "無法者",
    "wg.role.gangster.sub": "<em>.45口径</em>の無法者。カルマは負、火力は高い。",
    "wg.role.gangster.oneliner": ".45口径の無法者。腰に拳銃、ブーツに短刀。魔法はない——あるのは鋼と鉛だけ。",
    "wg.role.gangster.kit.0": "短刀——近接",
    "wg.role.gangster.kit.1": "拳銃 ×14",
    "wg.restore.title": "復元",
    "wg.save.title": "セーブ＆復元",
    "wg.save.current": "現在のゲームをセーブ",
    "wg.save.done": "セーブしました！",
    "wg.restore.sub": "セーブを選ぶ・または飛ばして新規に始める。",
    "wg.restore.reading": "セーブを読み込み中…",
    "wg.restore.preview_h": "セーブのプレビュー",
    "wg.restore.preview_hint": "左のセーブをクリックすると、その階層・役割・HPをプレビューできる。または下の<b>ゲーム開始</b>を押せば、選んだ役割で新たな冒険を始められる。",
    "wg.restore.btn": "このセーブを復元",
    "wg.restore.empty": "まだセーブデータがない。<b>ゲーム開始</b>を押して新たな冒険を始めよう。",
    "wg.restore.inventory": "所持品",
    "wg.restore.more": "他{n}件…",
    "wg.monster.title": "モンスター図鑑",
    "wg.monster.sub": "中央デザインDB・全モンスターのGLB。",
    "wg.monster.filter_az": "あ–ん",
    "wg.monster.select": "モンスターを選択",
    "wg.monster.stat.hp": "HP",
    "wg.monster.stat.scale": "スケール",
    "wg.monster.stat.weapon": "武器",
    "wg.monster.clip_editor": "クリップ → アクション エディタ",
    "wg.monster.designer_note": "デザイナーノート",
    "wg.monster.clip_placeholder": "このクリップ割り当ての理由…",
    "wg.monster.ai_tuning": "AI挙動チューニング",
    "wg.monster.empty": "その階層にはモンスターが出現しない。",
    "wg.monster.no_spawn": "出現データなし",
    "wg.avatar.title": "プレイヤーアバター",
    "wg.avatar.sub": "2体の主人公リグとそのコード化デザイン。",
    "wg.avatar.select": "アバターを選択",
    "wg.avatar.stat.model": "モデル",
    "wg.avatar.stat.scale": "スケール",
    "wg.avatar.stat.roles": "役割",
    "wg.avatar.coded_designs": "コード化デザイン",
    "wg.avatar.fronts_roles": "担当する役割",
    "wg.avatar.live_rig": "ライブリグ",
    "wg.avatar.on_disk": "ディスク上",
    "wg.char.title": "キャラクター",
    "wg.char.sub": "お前の主人公——ライブアバターとシート。",
    "wg.char.hero_tag": "主人公",
    "wg.char.adventurer": "冒険者",
    "wg.char.stats_h": "ステータス",
    "wg.char.stat.level": "レベル",
    "wg.char.stat.hp": "HP",
    "wg.char.stat.gold": "ゴールド",
    "wg.char.stat.xp": "経験値",
    "wg.char.stat.skill": "スキルP",
    "wg.char.stat.armor": "防御",
    "wg.char.ability_scores": "能力値",
    "wg.char.equipped": "装備中",
    "wg.char.note": "次のページで装備を整えれば、防御を上げられる。",
    "wg.equip.title": "装備",
    "wg.equip.sub": "リストから装備をスロットへドラッグしよう。",
    "wg.equip.hint4": "カードをタップかドラッグで使う。",
    "wg.equip.sub3": "着けたカードをタップで外す。",
    "wg.equip.just_found": "拾ったばかり",
    "wg.equip.items_h": "アイテム",
    "wg.equip.hint": "アイテムを左へドラッグ——またはクリックして装備。",
    "wg.equip.empty_slot": "空き",
    "wg.equip.take_off": "外す",
    "wg.equip.swap": "武器を交換",
    "wg.equip.body": "装備中",
    "wg.equip.easy": "バッグをタップで装備。装備をタップで外す。",
    "wg.nav.prev": "← 戻る",
    "wg.nav.next": "次へ →",
    "wg.nav.close": "閉じる",
    "wg.tabs.aria": "ガイドの区分",
    "wg.tab.intro": "はじめに",
    "wg.tab.saves": "セーブ",
    "wg.tab.inventory": "持ち物",
    "wg.tab.slots": "スロット",
    "wg.nav.play_now": "今すぐプレイ！",
    // The OTHER PLAY NOW label (Mark 2026-08-10: "PLAY NOW CTA button needs kanji added to it"). [REF#UI-00578]
    // `wg.nav.play_now` above was already translated; the guide shows THIS one instead on the
    // terms/role gate (_L call at ~:1508), and with no ja entry it silently fell back to the
    // English 'OK — PLAY NOW!'. Its sibling on the next line is the disabled-state label.
    "wg.nav.ok_play": "OK — 今すぐプレイ！",
    "wg.nav.choose_role": "役割を選べ",
    "wg.hint.accept_terms": "続けるには規約に同意してください",
    "wg.hint.continue_role": "役割選択へ進む",
    "wg.hint.choose_role": "続けるには役割を選んでください",
    "wg.hint.enter_underworld": "クリックしてアンダーワールドへ入る",
    "wg.hint.continue_avatars": "プレイヤーアバターへ進む",
    "wg.hint.continue_character": "キャラクターシートへ進む",
    "wg.hint.continue_equipment": "装備へ進む",
    "wg.aria.title": "タイトル",
    "wg.aria.choose_role": "役割を選ぶ",
    "wg.aria.restore": "セーブデータを復元",
    "wg.aria.monster_db": "モンスターデータベース",
    "wg.aria.avatar_db": "プレイヤーアバターデータベース",
    "wg.aria.character": "キャラクターシート",
    "wg.aria.equipment": "装備",
    "tc.intro": "\nおい！ 人間じゃねえか！ マジかよ？\n\nお前、本当にこの規約を読んでんのか？\n\n信じらんねえ！ まあいいや相棒、ルールを叩き込んでやるから、ちょいとトゲ付き棍棒を置いて、頼まれてた例の「規約」ってやつを探すとするか。\n\nおっと見つけたぞ——なんだこれ？ <b>フリーウェア</b>だと？\n\nこいつぁ傑作だな？ ああ、そのとおり、こいつもくたばっちまって、今お前がクリックしてる、まさにこの呪われたゲームに流れ着いたってわけよ。\n\nだからな、お前らが「法的規約」とか言って押し付けてくる、あの暗号みたいなシロモノ——魂を盗んで身ぐるみ剥ぐだけのアレ——そんなもんはここにゃ一切ねえ。魂なんざ要らねえんだよ、スロットマシンをぶっ壊すのにもう持て余すほどあるんだからな。\n\n忠告しといてやる…腹を空かせた餓鬼や、スロットで頭にきてるトロルの邪魔はするんじゃねえぞ——前もって警告したからな！",
    "tc.1.title": "現状有姿、無保証。",
    "tc.1.body": "このゲームは無料プレイで、完全に現状有姿で提供される。明示・黙示を問わず、いかなる保証もない。火炎の小鬼がお前のグラボから逃げ出してPCが火を噴いても、そりゃお前の責任だ。前もって警告しなかったとは言わせねえぞ、ウチの親分のカジノにゃ客がわんさか来るんでな、俺はお前のお守り役じゃねえんだ、わかったか？",
    "tc.2.title": "現金賭博は一切なし。",
    "tc.2.body": "ゴールドもチップもサイコロもブラックジャックの手札も、ぜんぶ仮想だ。ここにあるものは、いかなる法（宇宙の法だろうが、人間の法だろうが、その他なんだろうが）の下でも賭博には当たらねえし、どのみちくたばったらあの世にゃ持っていけねえってのはお前もわかってるよな。それに、換金する先なんてどこにもねえんだ。ビッグボスは帳簿をここいらのカラスとネズミの目ん玉ん中につけててな、だがなあ相棒、あいつら二匹ときたら、羽根に賭けたって秘密のひとつも守れやしねえ。大穴当てて悠々と出ていこうもんなら、カラスが四十羽、下手くそな実況を聞く気のある奴みんなに触れ回るし、ネズミはわざとお前の勘定を間違えてくれるぜ。 だからおとなしくしてろ、ウチの「規約」に従え、そうすりゃ五体満足で出られるかもしれねえ。生きて出られるとは言ってねえぞ、急に賢ぶるんじゃねえ。",
    "tc.3.title": "責任の制限。",
    "tc.3.body": "開発者、デザイナー、ベータテスター、ぐうたら連中、幽霊ナレーター、蛇のボス、そして俳句を詠む奴ら——その誰一人として、お前がこのゲームを善行だろうが悪行だろうがどう使った結果として生じる、直接的・間接的・付随的・結果的・カルマ的・霊的な損害について責任を負わねえ——オフラインだろうがオンラインだろうが、そんなこたぁ関係ねえ。川の悪魔にお前の魂玉を盗まれようが、この規約そのもので（マフィア流に）紙で指を切って小指を一本失おうが、そりゃ全部お前の責任だ。",
    "tc.4.title": "免責補償。",
    "tc.4.body": "お前のゲームプレイから生じる、いかなる請求・召喚・呪詛・呪い・厳しい言葉の手紙についても、開発者（と、俺みたいな年季奉公の地獄の下僕どもも含めて）に一切迷惑をかけねえと約束しろ。お前の「もしかしたら」の不機嫌から生じるもんも同様だ。セーブする前にくたばっちまった件もな——あの世でちょくちょく「セーブ」をクリックする自前の保険もかけずに死んだんなら、そりゃ全部お前の責任だぜ、間抜け。もう一度役割を用意しろっつって毎度毎度俺んとこに来るんじゃねえ。ここにゃカスタマーサービスなんてもんはねえんだ。俺のカスタマーサービス部門ってのは、「マネジメント」って名の錆びた釘付きコウモリでな、昔ながらの「ご対応」ってやつをご所望なら、言ってくれよ。いいか？",
    "tc.5.title": "アクセシビリティと子ども。",
    "tc.5.body": "WCAG 2.2／AAAを目指してる。未成年（マイナー）も坑夫（マイナー）も、その監督責任は親にある。アンダーワールドにかけちゃ、どっちからも目を離しちゃならねえ。底なしの落とし穴や、飲み込めちまうような小さな呪いの遺物から遠ざけとけ。迷子になった人間の書類仕事ってのは大嫌いでな…ただ言っとくが、ここはどんどん混んできてんだよ、煮えたぎる酸の穴がADA非対応だって文句たれる死人だけでも、もう十分多すぎんだ。",
    "tc.6.title": "宇宙正義の法廷。",
    "tc.6.body": "この「規約」は、もっぱら宇宙正義の法廷（ほとんど気難しいオーガどもが仕切ってる）によって統べられる。これは次元を超えた裁判所で、その裁定は最終的なものであり、人間界だろうが別の宇宙のどんな法廷だろうが上訴は一切できねえ。救済措置ってのは、謝罪の俳句を一句書くこと、凍えるような滝に打たれて自発的に瞑想すること、魔法のランタンを一つ供えること——あるいは最も重い場合にゃ、レベル1のヤクザゴブリンに転生させられ、教訓を身につけるまで歯ブラシで親分の床を磨き続けることだ。それとも、ただ単にお前を無視するか——この規約みたいなやつをロクに読みもせずクリックする、どいつもこいつもみてえにな…まあ認めろよ…ここまで来たんなら、これがお前が実際に読んだ初めての規約かもしれねえぜ！",
    "tc.7.title": "可分性と完全合意。",
    "tc.7.body": "いずれかの条項が執行不能でも、別途反対の定めがない限り、残りは効力を持ち続ける。公平だの偏りだのに関係なく、この言葉は正確で吟味されたもので、この世だろうが、お前が次にウチの世界へ繰り返しやって来るときだろうが、非の打ちどころがねえ。お前はもっとわきまえるべきだし、まだ混乱してるってんなら、こう理解しとけ——この規約はな、お前を煙に巻いて魂を売り渡す署名をさせるために作られてんだよ。とはいえお前がここにいる以上、わざわざ魂を買い付ける必要はねえ——気になってるなら言っとくが、ウチにゃ売りもんの魂が山ほどあんだ。血の誓いだの厳粛な宣誓だのは保証も強制もしねえが、ただ覚えとけ——この言葉はな、企業がどうやってお前を所有し、お前が企業の言い分どおりに自分の魂を売り渡してるか、その仕組みを教えてくれてんだ。どうせお前は規約なんて読まねえんだから——まあ認めろよ——いつかこの言葉を信じる日が来るかもしれねえな。",
    "tc.8.title": "魂の仲介はなし。",
    "tc.8.body": "お前の魂なんざ買わねえよ、人間。ブラックジャックで負けるたびに差し出そうとすんのはやめろ！ 人間の魂の市場なんざ何世紀も前に大暴落したんだ、それに正直、お前のなんてマイクロトランザクションとひでえ閲覧履歴で汚れてるのがオチだろ。ウチは仮想チップしか扱わねえ。どっかの裏路地の悪魔がお前の魂にうまい話を持ちかけてきたら、そりゃ詐欺られてんだよ。",
    "tc.9.title": "「読まなきゃ泣くぞ」条項。",
    "tc.9.body": "俺たちゃ本気でお前にこれを読ませるつもりだ。ああ、驚きだろ！ ろくに見もせず「同意する」をクリックしといて、呪われた鳥の悪魔にWi-Fiのパスワードを盗まれて泣きべそかいたって、そりゃお前の責任だ。アンダーワールドでルールを知らねえってのは、お前をただのカモにするだけだぜ。規約を読むか、詐欺られるか——お前の選択だ。",
    "tc.10.title": "公式・詐欺防止勧告。",
    "tc.10.body": "追放されたオーガの王子から、凍結された銀行口座を解除するのに金貨5,000枚くれってメールが来たら、そりゃ詐欺だ。ウチがお前を騙すときゃ、ちゃんと面と向かって、合法的に、こういうきちんと整えた文章でやる。ウチにゃ流儀ってもんがあんだ。だまされやすいお上りさんになるんじゃねえぞ。",
    "tc.11.title": "「長すぎて読まねえ」ペナルティ条項。",
    "tc.11.body": "いいか相棒——お前のゴブリンの宿主が、ここで集めるもんは二つだけ、そしてそりゃ誰一人逃げられねえ二つだ——死と税金だ。同じ机、同じ判子よ。だからプレイする前に、お前はこの規約を本当に読むことに同意する——全部だぞ、飛ばしなし、「あとでやる」もなしだ。ここにゃ「あと」なんてもんはねえ——むしろそれが肝心なんだよ。ルールを斜め読みすりゃ、見落とした分も書いてあるとおりそのまま受け入れたことになる。誰かが細かい文字をどうでもいいもんみたいに扱うと、俺の棍棒は機嫌が悪くなるんでな。どうでもよかねえんだ。ここにあるもんは何一つな。さあ——一番上から始めろ、そしてゲームへようこそ。",
    "tc.12.title": "マジでお前の魂は無価値だ。",
    "tc.12.body": "もう訊いてこねえように、はっきり言っとくぞ——仮にウチが魂を買いたかったとしても、お前のなんざ、食いかけのカビた握り飯一個分の最低担保価値にも満たねえんだよ。自分の懐にしまっとけ、ゲームをやれ、そしてウチのNPCどもと変な悪魔の契約を結ぼうとすんのはやめろ。あいつら、お前の陰でただ笑ってんだぜ。",
    "tc.13.title": "おまけのちんぷんかんぷん。",
    "tc.13.body": "この文章にどれだけ悪魔的なちんぷんかんぷんを詰め込めるかってのはな、お前がこの規約をクリックして許可をくれたんだから、ウチがお前を四六時中監視するソフトを仕込めちまうってことの証なんだよ。なんなら、ゲームをセーブした瞬間に払うべき借用書で金貨百万枚の借りがあると書いといてもいい。書ける…あるいは魂を売るって書いてもな。お前のNetflixのパスワードでもいい。お前、自分の周りがどれだけヤバいか、まだわかってねえだろ？ ウチはわかってる。お前ら薄気味悪い連中はみんなこの回廊を通って来るんだ、だからお前がどこに行き着くか見せてもらおうじゃねえか。ネタバレすりゃ——硫黄と安酒の臭いがするとこだぜ。",
    "tc.14.title": "ああそうだ、",
    "tc.14.body": "この規約は、これまでのあらゆる会話、メール、テレパシー、巻物、予言、ささやかれた噂を上書きする——だからこれに文句があるってんなら、お前は俺たち全員に喧嘩を売ったってことだ、そしてファミリーを怒らせすぎたらどうなるか、見せてやってもいいんだぜ。ウチは客を喜ばせるのが狙いじゃねえ、だが狙いはなかなか正確でな。ただ言っとくだけだ！",
    "tc.15.title": "お前は俺たちをアンダーワールドの下級裁判所で訴えることに同意する、",
    "tc.15.body": "しかも弁護士は自前で連れてこい。ここじゃ弁護士なんざ朝飯に食っちまうんだ、文字どおりな。醤油をかけてな。ついでにこっちの分も払ってくれたら、若い衆が喜ぶぜ。",
    "tc.outro": "さあ、これを読んで泣け、人間：",
    "tc.haiku": "言葉読み切り<br>俺のトゲ棍棒退屈<br>同意押せ間抜け",
    "tc.signed": "署名、\nマネジメント（とトゲ付き棍棒を持つゴブリン）",
    "wg.donate.thanks_arc": "ありがとう、旅人よ",
    "wg.donate.haiku.1": "折る者すべてに、",
    "wg.donate.haiku.2": "門で金は求めない——",
    "wg.donate.haiku.3": "優しさを次へ繋げ。",
    "wg.donate.haiku_kanji": "感謝 — 無料の贈り物",
    "wg.donate.title": "ずっと無料で",
    "wg.donate.lore.1": "オリガミ・アンダーワールドは——これからもずっと——<b>無料</b>だ。1980年代のフリーウェアの精神で、すべての子ども、すべての旅人へ、とりわけ決して払えない者たちへの贈り物だ。",
    "wg.donate.lore.2": "店もない。サブスクもない。広告もない。課金の壁もない。ただゲームがあるだけだ。",
    "wg.donate.lore.3": "もし楽しんでくれて、<i>もし</i>余裕があるなら、わずかな寄付が次の旅人のために無料を守る助けになる。<b>決して強制ではない</b>——どちらにせよゲームは君のものだ。",
    "wg.donate.btn": "PayPalで寄付する",
    "wg.donate.email_pre": "…または直接送る先：",
    "wg.donate.outro": "遊んでくれてありがとう。さあ行け——鬼婆が待っている。",
    "wg.aria.donate": "ゲームを支援する",
    "wg.hint.continue_donation": "ゲームを支援するページへ",
    "wg.role.samurai.blurb": "鉄の兜と金の前立て",
    "wg.role.archer.blurb": "カメラの閃光で挑む冒険者",
    "wg.role.gangster.blurb": "現代のスーツと9mm拳銃",
    "wg.role.ninja.blurb": "影の暗殺者と手裏剣",
    "wg.role.wizard.blurb": "灰色のローブと神秘の杖",
    "wg.role.priest.blurb": "祓いの儀式と御幣",
    "wg.slots.title": "オリガミ・スロット",
    "wg.slots.sub": "遊びの路へようこそ。",
    "wg.slots.lore.1": "<b>仲間も賞品も</b>勝ち取れる。",
    "wg.slots.lore.2": "出会ったいろいろなスロットを楽しんで、お気に入りを選んで遊ぼう&mdash;<i>どのスロットもそれぞれ違う</i>。",
    "wg.slots.lore.3": "スロットをクリックしてリールを回そう。",
    "wg.slots.right.1": "どの台も少しずつ遊び方が違う&mdash;お気に入りを見つけよう。",
    "wg.slots.right.2": "近日登場：🎰 スロット &middot; 🃏 ポーカー &middot; ♠ ブラックジャック",
    "wg.slots.spin": "レバーを引く",
    "wg.slots.hook": "リールを回せば&mdash;<b>仲間</b>も<b>戦利品</b>も<b>ゴールド</b>も手に入る！",
    "wg.slots.win.gold": "ゴールド",
    "wg.slots.win.gold.d": "ダンジョンで使える",
    "wg.slots.win.loot": "戦利品",
    "wg.slots.win.loot.d": "幸運の一回でカードや宝物",
    "wg.slots.win.friends": "仲間",
    "wg.slots.win.friends.d": "ゴブリンと仲良くなれる",
    "wg.slots.foot": "どのスロットもそれぞれ違う&mdash;お気に入りを見つけて、クリックでリールを回そう。",
    "wg.aria.slots": "オリガミ・スロット",
  },
};

export class PlayerGuide {
    constructor() {
        window._tcAccepted = false;
        this.loadingCompleted = false;
        this._loadId = null;
        this._loadWorldReady = false;
        this._loadFailed = false;
        this._loadPct = 0;   // monotonic loading-bar floor (see updateLoadingProgress) [REF#UI-00579]
        try { localStorage.removeItem('origami_tc_accepted'); } catch(_) {}
        window.setGuideSlide = (idx) => {
            this.setSlide(idx);
        };
        this.containerId = 'welcome-guide-overlay';
        // ── EVERY GUIDEBOOK TOUCH MAKES A SOUND (Mark 2026-08-02/03: "menu selections of guidebook = [REF#UI-00580]
        //    pop.mp3 and click.mp3 sounds for all interactions. also do this for clicking playing
        //    cards too"). ONE delegated capture-phase listener instead of chasing the ~40 individual
        //    handlers in this file — a new button added tomorrow is audible for free, and there is a
        //    single place to mute or retune it.
        //    TWO VOICES, so the book does not sound like one flat beep:
        //      · pop.mp3   — CHOOSING something: a role, a save, a monster, a card, a room, a tab.
        //      · click.mp3 — everything else that is pressable: OK/next/back/close, toggles, arrows.
        //    Capture phase so it still speaks even when a handler stops propagation, and it never
        //    swallows the click itself (listener only, no preventDefault). Files live in
        //    assets/sounds/Dungeon/ (Mark's drop). Off: window._guideClickSfx = false.
        //    Volumes: window._guideClickVol (0.35) · window._guidePopVol (0.45).
        try { if (!window.__guideSfxBound){
            window.__guideSfxBound = true;
            const _CHOOSE = '.wg-room-box,.wg-role-card,.wg-save-row,.wg-monster-row,.wg-avatar-row,'
                          + '.wg-card,.card,.wg-tab,.wg-slot,.wg-item,[data-save-id],[data-monster-key],[data-role]';
            const _PRESS  = 'button,.wg-btn,.wg-nav,.wg-arrow,a[href],input[type="checkbox"],select,[role="button"]';
            document.addEventListener('click', (ev) => {
                if (window._guideClickSfx === false) return;
                const t = ev.target && ev.target.closest ? ev.target : null;
                if (!t) return;
                // only inside the guidebook (or the deck) — this must not click at the whole page [REF#UI-00581]
                const inGuide = !!t.closest('#welcome-guide-overlay, .wg-book, .wg-page, #deck-panel, .deck-row');
                if (!inGuide) return;
                const choose = t.closest(_CHOOSE), press = t.closest(_PRESS);
                if (!choose && !press) return;
                const pop = !!choose && !press;   // a press inside a chooser is still a press [REF#UI-00582]
                const path = pop ? './assets/sounds/Dungeon/pop.mp3' : './assets/sounds/Dungeon/click.mp3';
                const vol = pop ? ((typeof window._guidePopVol === 'number') ? window._guidePopVol : 0.45)
                                : ((typeof window._guideClickVol === 'number') ? window._guideClickVol : 0.35);
                try {
                    if (typeof window._panelsPlaySfx === 'function') window._panelsPlaySfx(path, vol);
                    else { const a = new Audio(path); a.volume = vol; a.play().catch(() => {}); }
                } catch (_) {}
            }, true);
            try { console.log('[GUIDE] click SFX armed — pop.mp3 on selections, click.mp3 on presses. Off: window._guideClickSfx=false'); } catch(_){}
        } } catch (_) {}
        this.quickLaunch = new QuickLaunchGuide();
        // 5 two-page spreads: [REF#UI-00583]
        //   0 COVER + T&C             (pages 1-2)
        //   1 ROLE select + profile   (pages 3-4)
        //   2 SAVES list + preview    (pages 5-6)
        //   3 MONSTER DATABASE        (pages 7-8)  ← opened by SETUP
        //   4 PLAYER AVATAR DATABASE  (pages 9-10) ← opened by SETUP
        //   5 CHARACTER (avatar+stats)(pages 11-12) ← "Page 10" in the brief
        //   6 EQUIPMENT (slots+items) (pages 13-14) ← "Page 11" in the brief
        // Spreads 3 & 4 are the "Setup / Bestiary" half of the guide — a
        // central design DB for every monster GLB and the two player rigs.
        // Spreads 5 & 6 (Worker-Inv 2026-06-01) are the live character sheet:
        // the player's avatar + stat block, then the equip screen (8 body
        // slots + a drag-and-drop item list).
        // Reachable via the footer SETUP button (jumps straight to spread 3)
        // or window.welcomeGuide.openSetup(). NOTE: the slide index that
        // holds the monster DB is exposed as SETUP_SLIDE so a single edit
        // re-targets the SETUP button if spreads are re-ordered.
        this.SETUP_SLIDE = 3; // spread index of the Monster Database (page 7-8) [REF#UI-00584]
        this.EQUIP_SLIDE = 6; // spread index of the Equipment screen [REF#UI-00585]
        this.SAVES_SLIDE = 2; // spread index of the Save/Restore screen (save LEFT, restore RIGHT) — the SAVE action button routes here (modal save retired 2026-06-09) [REF#UI-00586]
        this.SLOTS_SLIDE = 8; // spread index of the "Origami Slots" intro — opened by a DOUBLE-CLICK on a slot machine (Mark 2026-06-16). Future slot2/slot3/poker/blackjack map their own variant here. [REF#UI-00587]
        this.ROOMS_SLIDE = 9; // spread index of the ROOMS section — list of discovered special rooms + per-room detail (Mark 2026-06-18). Opened to a room via openRoom(id) on peaceful first entry. [REF#UI-00588]
        this.WAGER_SLIDE = 10;      // Spread A — WAGER: stake (left) + 3×3 grid of LEARNED games (right). openWager(). [REF#UI-00589]
        this.WAGER_GAME_SLIDE = 11; // Spread B — the selected game: name + instructions (left) + live 3D felt table (right). openWagerGame(id). [REF#UI-00590]
        this.BARMENU_SLIDE = 12;    // Spread — The Bar: Accept Contract Work | Play Sake Tap (Mark 2026-07-25 "fix the bar menu to match our design pattern of pages"). openBarMenu(). [REF#UI-00591]
        this.SETTINGS_HUB_SLIDE = 13;    // Settings main hub (CTAs to Music, Audio, Display) [REF#UI-00592]
        this.MUSIC_SETTINGS_SLIDE = 14;  // Music settings (volume, ungate BG music, rotation info) [REF#UI-00593]
        this.AUDIO_SETTINGS_SLIDE = 15;  // Audio settings (SFX controls) [REF#UI-00594]
        this.DISPLAY_SETTINGS_SLIDE = 16; // Display settings (placeholder) [REF#UI-00595]
        this.GLOSSARY_SLIDE = 18;   // WCAG 3.1.3 / 3.1.4 / 3.1.6 (AAA, Mark 2026-09-12 "fix the last accessibility rows"): the words page [REF#UI-01341]
        this.WORLD_SLIDE = 17;      // WCAG P4 (Mark GO 2026-08-14): the accessible WORLD browser — rooms → objects → real action buttons, fed by A11Y_QUERY. The guidebook face of the chat command console: same registry, same FPV_CHAT_COMMAND payloads, one rail. [REF#UI-00596]
        this.GRAVEYARD_SLIDE = 19;  // 墓場 — every death this browser remembers, read from the graveyard cookie (Mark 2026-09-25) [REF#PENDING] [REF#UI-01417]
        this.COLORS_SLIDE = 20;     // Colors — the contrast switch, one of the three pages the Settings catalog files (2026-10-02) [REF#UI-01471]
        this.totalSlides = 21;      // + Settings pages + World + Glossary + Graveyard [REF#UI-00597]
        // LOOPING DOT WINDOW (Mark 2026-08-14: "you dont need a dot for every page, just loop"). [REF#UI-00598]
        // A fixed 7-dot window that cycles around the book instead of one dot per spread. Two wins:
        // the footer stops growing with the page count, and seven dots leave room for each to be a
        // real 24px target (WCAG 2.5.8) — eighteen never could, which is what forced the old
        // Equivalent-exception. Odd number so the current page sits dead centre.
        this.DOT_WINDOW = 7;
        // ── WAGER games registry (Mark 2026-06-19): the 3×3 grid reads window.unlockedCardGames; this maps [REF#UI-00599]
        //    each game id → label/icon/kind/instructions. Add games here as they're built. ──
        this.wagerGames = {
            'BLACKJACK':  { name: 'Blackjack',  icon: '🃏', kind: 'card', start: 'startBlackjack', interactive: 'blackjack',
                            how: 'Beat the dealer to 21 without busting. HIT to draw, STAND to hold; the dealer draws to 17. Even money.' },
            'HI-LO':      { name: 'Hi-Lo',       icon: '🔼', kind: 'card', start: 'startHiLo',
                            how: 'A card is on the table — bet the next is HIGHER or LOWER. Even money.',
                            bets: [{ id: 'hi', label: 'HIGHER ▲' }, { id: 'lo', label: 'LOWER ▼' }], action: 'DRAW',
                            setup() { const base = this._drawCard(); return { base, preHtml: `<div class="wg-wager-stake">On the table: <b>${this._cardName(base)}</b></div>` }; },
                            play(bet) { const base = this._wagerState.base, next = this._drawCard();
                                return { win: bet === 'hi' ? next > base : next < base, push: next === base, mult: 1,
                                         line: `🔼 <b>${this._cardName(base)}</b> → <b>${this._cardName(next)}</b>` }; } },
            'CHO-HAN':    { name: 'Cho-Han',     icon: '🎴', kind: 'dice', start: 'startChoHan',
                            how: 'Two dice under the cup — call 丁 CHŌ (even) or 半 HAN (odd). Even money.',
                            bets: [{ id: 'cho', label: '丁 CHŌ · even' }, { id: 'han', label: '半 HAN · odd' }],
                            play(bet) { const a = this._d6(), b = this._d6(), s = a + b, even = s % 2 === 0;
                                return { win: (bet === 'cho') === even, mult: 1, dice: [a, b],
                                         line: `🎴 Dice <b>${a}</b> + <b>${b}</b> = <b>${s}</b> · ${even ? '丁 even' : '半 odd'}` }; } },
            'DICE-DUEL':  { name: 'Dice Duel',   icon: '🎲', kind: 'dice', start: 'startDiceDuel',
                            how: 'You and the dealer each roll two dice — highest total wins. Even money.',
                            bets: [], action: 'ROLL',
                            play() { const a = this._d6(), b = this._d6(), p = a + b, d = this._d6() + this._d6();
                                return { win: p > d, push: p === d, mult: 1, dice: [a, b],
                                         line: `🎲 You <b>${p}</b> vs Dealer <b>${d}</b>` }; } },
            'LIARS-DICE': { name: "Liar's Dice", icon: '🤥', kind: 'dice', start: 'startLiarsDice',
                            how: "The dealer bids the five-dice total. Call OVER or UNDER the real roll. Even money.",
                            bets: [{ id: 'over', label: 'OVER ▲' }, { id: 'under', label: 'UNDER ▼' }], action: 'CALL',
                            setup() { const bid = 15 + Math.floor(Math.random() * 6); return { bid, preHtml: `<div class="wg-wager-stake">The dealer bids the five dice total is around <b>${bid}</b>.</div>` }; },
                            play(bet) { const _d = []; for (let i = 0; i < 5; i++) _d.push(this._d6()); const s = _d.reduce((x, y) => x + y, 0); const bid = this._wagerState.bid;
                                return { win: bet === 'over' ? s > bid : s < bid, push: s === bid, mult: 1, dice: _d,
                                         line: `🤥 The five dice = <b>${s}</b> (bid ${bid})` }; } },
            'BACCARAT':   { name: 'Baccarat',    icon: '👑', kind: 'card', start: 'startBaccarat',
                            how: 'Bet PLAYER, BANKER or TIE — the hand closest to 9 wins.',
                            bets: [{ id: 'player', label: 'PLAYER · 1:1' }, { id: 'banker', label: 'BANKER · 0.95:1' }, { id: 'tie', label: 'TIE · 8:1' }], action: 'DEAL',
                            play(bet) { const cv = () => Math.floor(Math.random() * 10); const ph = (cv() + cv()) % 10, bh = (cv() + cv()) % 10;
                                const outcome = ph > bh ? 'player' : (bh > ph ? 'banker' : 'tie'); const win = (bet === outcome);
                                const mult = win ? (bet === 'tie' ? 8 : bet === 'banker' ? 0.95 : 1) : 1;
                                return { win, mult, line: `👑 Player <b>${ph}</b> · Banker <b>${bh}</b> → <b>${outcome.toUpperCase()}</b>` }; } },
            'POKER':      { name: 'Poker',       icon: '♠️', kind: 'card', start: 'startPokerDuel',
                            how: 'One-hand showdown — you and the dealer each draw five; the stronger hand wins. Even money.',
                            bets: [], action: 'DEAL HANDS',
                            play() { const score = () => { const h = []; for (let i = 0; i < 5; i++) h.push(this._drawCard()); const c = {}; h.forEach(x => c[x] = (c[x] || 0) + 1); return Math.max(...Object.values(c)) * 100 + Math.max(...h); };
                                const p = score(), d = score(); return { win: p > d, push: p === d, mult: 1, line: `♠️ Your hand vs the dealer — <b>${p > d ? 'you' : (d > p ? 'dealer' : 'tie')}</b> ${p === d ? '' : 'stronger'}` }; } },
            // GUIDEBOOK POKER — the WCAG 2.2 AA twin (Mark 2026-07-05: "some people will only be able to [REF#UI-00600]
            // play with the guidebook … it must always be wcag 2.2/aa"). Same one-hand showdown, but the
            // dealt hands are ENUMERATED AS TEXT (rank-only — the model has no suits) so a screen reader
            // announces exactly what you and the dealer hold. The 'POKER' tile keeps launching the 3D
            // on-table game (Mark's 2026-07-04 mandate) — this entry is the always-available HTML path.
            'POKER_BOOK': { name: 'Poker (Guidebook)', icon: '♠️', kind: 'card',
                            how: 'One-hand showdown, played right here on the page — fully keyboard and screen-reader friendly. You and the dealer each draw five; the stronger hand wins. Even money.',
                            bets: [], action: 'DEAL HANDS',
                            play() { const draw5 = () => { const h = []; for (let i = 0; i < 5; i++) h.push(this._drawCard()); return h; };
                                const score = (h) => { const c = {}; h.forEach(x => c[x] = (c[x] || 0) + 1); return Math.max(...Object.values(c)) * 100 + Math.max(...h); };
                                const nm = (h) => h.map(x => this._cardName(x)).join(' · ');
                                const h1 = draw5(), h2 = draw5(), p = score(h1), d = score(h2);
                                return { win: p > d, push: p === d, mult: 1,
                                         line: `♠️ Your hand <b>${nm(h1)}</b> vs dealer <b>${nm(h2)}</b> — <b>${p > d ? 'you win' : (d > p ? 'dealer wins' : 'tie')}</b>` }; } },
            // Solitaire (Mark 2026-06-23) — the 2nd wager game. Self-contained Klondike (solitaire.html) embedded as a [REF#UI-00601]
            // full-bleed iframe stage; renders + wires itself like Blackjack (interactive), so it has no bets/play(). v1 = no-stake.
            'SOLITAIRE':  { name: 'Solitaire',   icon: '♣️', kind: 'card', interactive: 'solitaire',
                            how: 'Klondike — build the four foundations A→K by suit. Tap a card and it flies to its best legal spot. Maximize (top-right) for a bigger table.' },
        };
        this._wagerGameSlots = 9;   // 3×3 grid; unlearned slots render as faded "?" tiles [REF#UI-00602]
        this._wagerSelected = null; // currently-selected game id [REF#UI-00603]
        this._wagerStake = 50;      // current bet; re-floored to the dungeon floor on each WAGER_SLIDE arrival (F5: L1 50 → L7 50k). Every game's payout reads this [REF#UI-00604]
        // ADJUSTABLE 3D POV (Mark 2026-06-25: "Best in class POV angles for user to adjust with click and pan … for each game [REF#UI-00605]
        // so players can adjust how they want their card games to look — all of them."). Hand-rolled orbit/pan/zoom controller
        // (r160 has NO OrbitControls addon vendored) damps the wager-table camera toward a per-GAME saved viewpoint
        // (localStorage 'wg_wager_pov', keyed by game id). _WG_CAM holds the per-KIND preset angles (Hero / Top / Side) + the
        // hard clamps that keep the camera above the felt and within zoom range. theta = azimuth (0 = facing the player edge).
        this._wagerMaxA = 8;        // renderer max anisotropy, captured at mount for the off-pv texture bakers [REF#UI-00606]
        this._WG_CAM = {
            _clamp: { MIN_PHI: 0.12, MAX_PHI: 1.40, MIN_R: 2.6, MAX_R: 7.5 },
            card: { hero:{phi:0.89,theta:0,radius:4.12,tx:0,ty:0.10,tz:0.30}, top:{phi:0.26,theta:0,radius:4.60,tx:0,ty:0.05,tz:0.00}, side:{phi:1.18,theta:0,radius:4.00,tx:0,ty:0.12,tz:0.25} },
            dice: { hero:{phi:0.85,theta:0,radius:3.90,tx:0,ty:0.12,tz:0.00}, top:{phi:0.24,theta:0,radius:4.30,tx:0,ty:0.05,tz:0.00}, side:{phi:1.22,theta:0,radius:3.70,tx:0,ty:0.16,tz:0.00} },
            bj:   { hero:{phi:0.99,theta:0,radius:4.57,tx:0,ty:0.05,tz:-0.08}, top:{phi:0.30,theta:0,radius:5.00,tx:0,ty:0.02,tz:-0.10}, side:{phi:1.20,theta:0,radius:4.40,tx:0,ty:0.10,tz:-0.05} },
        };

        this.currentSlide = 0;
        this._injected = false;
        this._saves = [];
        this._selectedSaveName = null;
        // Listen for SAVE_LIST from the engine (forwarded by panels). The [REF#UI-00607]
        // panels-side handler in NewOrigami.Panels.html dispatches
        // window.renderWelcomeSavesList, but we ALSO listen here so the
        // module owns its data path and doesn't rely on a global hook.
        window.addEventListener('message', (e) => {
            if (e?.data?.type === 'SAVE_LIST') {
                this._saves = Array.isArray(e.data.saves) ? e.data.saves : [];
                this._renderSavesList();
            } else if (e?.data?.type === 'SAVE_DONE' && e.data.reqId && e.data.reqId === this._saveReqId) {
                this._onSaveDone(e.data);   // SAVED! only when the engine says the slot landed (2026-09-27, the save rebuild) [REF#PENDING] [REF#UI-01418]
            } else if (e?.data?.type === 'A11Y_RESULT' && e.data.reqId === 'wg-world') {
                // WORLD page data (P4) — the engine registry's reply to our _queryWorld(). [REF#UI-00608]
                this._worldData = e.data.result || null;
                this._renderWorld();
            } else if (e?.data?.type === 'LOG_EVENT' && this._worldPending) {
                // Accept only a line that NAMES the thing that was clicked. The same burst carries [REF#UI-01311]
                // unrelated traffic ("🎯 Auto-target: Ogre" arrives on a Walk), and echoing that back
                // as the answer to "Look at the lantern" would be worse than staying silent.
                const txt = String(e.data.text || '');
                const tgt = String(this._worldPending.target || '');
                if (tgt && txt.toLowerCase().includes(tgt.toLowerCase())) {
                    clearTimeout(this._worldReplyTO);
                    this._worldPending = null;
                    this._renderWorldReply(txt, false);
                    // THIS PAGE'S DATA IS A SNAPSHOT, and the world moves underneath it. Measured [REF#UI-01312]
                    // 2026-09-04: picking the MAGIC LANTERN up took the registry from 1 loot hit to 0
                    // while the card stayed listed, so the next click answered
                    // 'Nothing named "MAGIC LANTERN" found' — an object the page itself was offering.
                    // A "not found" is therefore a signal that this list is stale, not just a failed
                    // command: re-query so the dead card disappears instead of waiting to be clicked
                    // a second time.
                    if (/Nothing named|見つからない/.test(txt)) { try { this._queryWorld(); } catch (_) {} }
                }
            } else if (e?.data?.type === 'LOCALE_CHANGE') {
                // Language toggled while the guide may be open — rebuild its [REF#UI-00609]
                // static copy in the new language (best-effort; no-op if the
                // guide hasn't been injected yet — it renders in the active
                // language on first show()).
                this._relocalize();
            }
        });

        // ESC steps the Solitaire maximize ladder DOWN (100% → 90% → docked) without closing the guide. [REF#UI-00610]
        // Capture phase + stopPropagation so it wins over any later bubble handler (Mark 2026-06-23).
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._soliShown && (this._soliMax || 0) > 0) {
                e.preventDefault(); e.stopPropagation();
                this._setSoliMax((this._soliMax || 0) - 1);
                return;
            }
            // ── GUIDEBOOK KEYBOARD NAV (Mark 2026-07-02, WCAG 2.2 rework 2026-07-05) — only while OPEN ── [REF#UI-00611]
            //   Tab / Shift+Tab → REAL focus movement through the guide's buttons/controls, trapped inside
            //                     the overlay (SC 2.1.1/2.1.2 — the old Tab-hijack made every wager control
            //                     unreachable by keyboard, which broke Mark's "guidebook must be the
            //                     accessible way to play" mandate).
            //   Ctrl+Tab (or [ / ]) → cycle the UNLOCKED section tabs (Mark's 2026-07-02 quick section hop, kept on a modifier)
            //   ENTER → native activation when a control is focused; page CTA otherwise
            //   ← / →  → turn pages (prev / next slide) — except on the felt canvas (its own orbit keys)
            //   ESC    → close the guide (after the Solitaire maximize ladder above)
            const _g = document.getElementById(this.containerId);
            if (!_g || !_g.classList.contains('is-open')) return;
            const _t = e.target || {}, _tag = _t.tagName || '';
            const _typing = _tag === 'INPUT' || _tag === 'TEXTAREA' || _t.isContentEditable === true;
            const _onCtl = !!(_t.closest && _t.closest('#' + this.containerId) && (_tag === 'BUTTON' || _tag === 'A' || _tag === 'SELECT' || _tag === 'CANVAS'));
            // ESC CANNOT SKIP THE DOWNLOAD (Mark 2026-09-22: "check and see if the loading progress bar will wait ... before allowing OK [REF#UI-01415]
            // to play the game before its ready"). MEASURED: the close button and footer were hidden while loading, but this key
            // path had no guard — one Escape dropped the player into a world whose models were still downloading. Swallow it.
            if (e.key === 'Escape' && !this.loadingCompleted){ e.preventDefault(); e.stopPropagation(); return; }
            if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); this.hide({ isFromLoad: true }); return; }
            // Cabaret room handoff: ENTER is an explicit alias for the focused “OK — enjoy the show” [REF#UI-00612]
            // action, even when focus is on another guide control. This keeps the one-key path reliable
            // across keyboard focus restoration and cross-iframe focus changes.
            if (e.key === 'Enter' && !_typing && this.currentSlide === this.ROOMS_SLIDE && this._lastRoom === 'cabaret') {
                const _ok = _g.querySelector('.wg-slide.active .wg-room-ok-btn');
                if (_ok && !_ok.disabled && _ok.offsetParent !== null) {
                    e.preventDefault(); e.stopPropagation();
                    try { _ok.focus(); } catch(_) {}
                    _ok.click();
                    return;
                }
            }
            // ── ROLE PICKER OWNS THE ARROWS ON ITS OWN SLIDE (Mark 2026-07-26: "arrow key or enter key starts [REF#UI-00613]
            //    selector by keyboard, up down left right amongst the roles by keyboard"). Checked BEFORE the
            //    page-turn arrows below, or ← / → would flip the page out from under the picker instead of
            //    moving across it. Returns true when it consumed the key.
            if (!_typing && this._roleKeyNav(e)) return;
            if (e.key === 'Enter' && !_typing && !_onCtl) { e.preventDefault(); e.stopPropagation(); this._activatePrimaryCTA(); }
            else if (e.key === 'ArrowLeft'  && !_typing && _tag !== 'CANVAS' && _tag !== 'SELECT') { e.preventDefault(); e.stopPropagation(); this.prevSlide(); }
            else if (e.key === 'ArrowRight' && !_typing && _tag !== 'CANVAS' && _tag !== 'SELECT') { e.preventDefault(); e.stopPropagation(); this.nextSlide(); }
            else if (e.key === 'Tab' && e.ctrlKey)   { e.preventDefault(); e.stopPropagation(); this._cycleTab(e.shiftKey ? -1 : 1); }
            else if ((e.key === '[' || e.key === ']') && !_typing) { e.preventDefault(); e.stopPropagation(); this._cycleTab(e.key === '[' ? -1 : 1); }
            else if (e.key === 'Tab'){
                // focus trap: cycle the overlay's visible, enabled focusables with wrap [REF#UI-00614]
                e.preventDefault(); e.stopPropagation();
                const _all = Array.from(_g.querySelectorAll('button, a[href], select, input, textarea, [tabindex]:not([tabindex="-1"])'))
                    .filter(el => !el.disabled && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null);
                if (!_all.length) return;
                const _cur = _all.indexOf(document.activeElement);
                const _next = _cur < 0 ? (e.shiftKey ? _all.length - 1 : 0)
                    : (_cur + (e.shiftKey ? -1 : 1) + _all.length) % _all.length;
                try { _all[_next].focus(); } catch(_){}
            }
        }, true);

        // Per-role profile shown on slide 1 RIGHT page when a role is [REF#UI-00615]
        // clicked. Title + one-liner + equipment kit. Color theme is
        // pulled from the matching role-card class so the profile picks
        // up the same family color as the selection. (User mandate
        // 2026-05-25.)
        this.roleProfiles = {
            pistoleer: {
                // User mandate 2026-05-27: gangster-class is a REAL-WORLD outlaw, [REF#UI-00616]
                // not magical. Dropped "Magic Missile" framing.
                oneLiner: 'Gangster-class pistoleer. One .45 ACP pistol, fourteen rounds, no melee fallback — pure-ranged outlaw work.',
                kit: ['Pistol ×14 rounds'],
            },
            wizard: {
                oneLiner: 'Arcane scholar. Staff in hand, four random spells in pocket, one heal potion for emergencies.',
                kit: ['Staff — melee', '4 random spell cards', 'Heal Potion ×1'],
            },
            priest: {
                oneLiner: 'Divine warrior. Mace and two prayer-spells; five heal potions for the dying.',
                kit: ['Mace — melee', '2 random spell cards', 'Heal Potion ×5'],
            },
            ninja: {
                oneLiner: 'Shadow striker. One sword, fourteen shuriken, no second chances.',
                kit: ['Ninja Sword — melee', 'Shuriken ×14'],
            },
            samurai: {
                oneLiner: 'Bushido honor. Heavy Katana and a Samurai Bow at distance.',
                kit: ['Katana — melee', 'Samurai Bow ×12'],
            },
            archer: {
                // ADVENTURER's camera loadout (Mark 2026-08-03 "Build it now" — supersedes the [REF#UI-00617]
                // same-day revert). Keep in sync with ROLE_WEAPON_TABLES.archer (CAMERA ×6).
                // No dagger (2026-10-07, knowledge/design/ADVENTURER_NO_DAGGER_2026-10-07.md): the adventurer starts with the camera alone.
                oneLiner: 'Explorer with a flash camera. Six blinding shots.',
                kit: ['Camera ×6 — blinding flash'],
            },
            gangster: {
                // User mandate 2026-05-27: "gangster ... nothing shows up as [REF#UI-00618]
                // magical, it's a reality thing". Real-world outlaw — pistol,
                // dagger, no magic flavor in user-facing text.
                oneLiner: '.45 ACP outlaw. Pistol on the hip, dagger in the boot. No magic — just steel and lead.',
                kit: ['Dagger — melee', 'Pistol ×14'],
            },
        };

        // Role roster — kanji art trading cards. Colors mirror the [REF#UI-00619]
        // existing roleConfig palette inside Panels.html.
        // 6-role roster (2026-06-09, Mark: consolidated from 7 — dropped the
        // redundant 'pistoleer' gun-role; 'gangster' is now the single gun role).
        // Order + blurbs match the new AAA card mockup. `blurb` = card one-liner;
        // `sub` = the longer right-page profile copy.
        // Order: SAMURAI bottom-LEFT, NINJA bottom-RIGHT (Mark swapped them 2026-06-16).
        // Left page = roles[0..2] (archer/gangster/samurai); right = roles[3..5] (wizard/priest/ninja).
        this.roles = [
            // ADVENTURER, formerly ARCHER (Mark 2026-08-03: "change guidebook role from ARCHER to [REF#UI-00620]
            // ADVENTURER"). ⚠ THE id STAYS 'archer' ON PURPOSE. It is the key for the CSS class
            // (.r-archer / .glyph-archer), the ROLE_WEAPON_TABLES entry, selectRole('archer'), the
            // i18n keys, and — the one that matters — the role stored in sessionStorage for a run in
            // progress. Renaming the key would have made every save mid-flight select nothing. What
            // Mark asked to change is the ROLE, and the role is what the player reads.
            // CAMERA LIVE (Mark 2026-08-03, superseding the same-day revert: "It will have a camera
            // … a copy of the magic missile card, but with a nikon camera model instead. It will
            // fire a blinding flash at monsters. Build it now"). The fire path exists now, so the
            // guidebook may promise the camera — copy must keep matching ROLE_WEAPON_TABLES.archer.
            { id: 'archer',   name: 'ADVENTURER', kanji: '冒', pill: 'HUNTER',  cls: 'r-archer', art: 'assets/role-seasonal-paths.png?v=8.4.2534-seasonal-roles', artViewBox: '30 6 320 548',
              blurb: 'Flash camera &amp; keen eyes',
              sub: 'One <em>Nikon-style camera</em>. The flash blinds what it catches.' },
            { id: 'gangster', name: 'GANGSTER', kanji: '凶', pill: 'OUTLAW',  cls: 'r-gangster', art: 'assets/role-seasonal-paths.png?v=8.4.2534-seasonal-roles', artViewBox: '378 6 320 548',
              blurb: 'Modern suit &amp; 9mm pistol',
              sub: '<em>.45 ACP</em> outlaw. Karma-negative, high damage.' },
            { id: 'samurai',  name: 'SAMURAI',  kanji: '侍', pill: 'BUSHIDO', cls: 'r-samurai', art: 'assets/role-seasonal-paths.png?v=8.4.2534-seasonal-roles', artViewBox: '730 685 320 653',
              blurb: 'Iron Kabuto &amp; gold crest',
              sub: 'Heavy <em>katana</em> strike and a samurai longbow.' },
            { id: 'wizard',   name: 'WIZARD',   kanji: '魔', pill: 'ARCANE',  cls: 'r-wizard', art: 'assets/role-seasonal-paths.png?v=8.4.2534-seasonal-roles', artViewBox: '30 685 320 653',
              blurb: 'Gray robe &amp; mystical staff',
              sub: 'Staff &amp; pistol. <em>Elemental</em> scrolls scale fast.' },
            { id: 'priest',   name: 'PRIEST',   kanji: '僧', pill: 'CLERIC',  cls: 'r-priest', art: 'assets/role-seasonal-paths.png?v=8.4.2534-seasonal-roles', artViewBox: '378 685 320 653',
              blurb: 'Purification rituals &amp; Gohei',
              sub: 'Holy <em>healing</em> potions and divine intervention.' },
            { id: 'ninja',    name: 'NINJA',    kanji: '忍', pill: 'SHADOW',  cls: 'r-ninja', art: 'assets/role-seasonal-paths.png?v=8.4.2534-seasonal-roles', artViewBox: '730 6 320 548',
              blurb: 'Stealthy assassin &amp; Shuriken',
              sub: '<em>Shuriken</em> stack of 14 and a brace of daggers.' },
        ];

        // Shared central catalogs for pages 7-10. Runtime spawning remains [REF#UI-00621]
        // in MapGen.js / Engine9.html; this guide reads the shared design
        // catalog so model paths do not drift between setup pages and engine.
        this.monsterDB = MONSTER_CATALOG;
        this.monsterActions = MONSTER_ACTIONS;

        // Per-monster designer clip→action overrides + notes, keyed by [REF#UI-00622]
        // monster key then action key: { [monKey]: { [actionKey]: clipName, notes } }.
        // Persisted to localStorage so the design survives reloads, and
        // broadcast to the engine (UPDATE_MONSTER_CLIP_MAP) for FUTURE
        // runtime wiring — the engine does NOT consume this yet (verified:
        // no MonsterDatabase reader exists in Engine9.html), so this is a
        // design/authoring surface, not a live override. Honest scope.
        this._restoreMonsterSaved();   // the last monster-page SAVE is what loads (2026-10-02) [REF#UI-01472]
        this._clipOverrides = this._loadClipOverrides();
        this._selectedMonsterKey = this.monsterDB[0].key;

        this.avatarDB = AVATAR_CATALOG;
        this.avatarActions = AVATAR_ACTIONS;
        this._selectedAvatarId = this.avatarDB[0].id;
        // Filter mode for the monster scroller: 'all' (alphabetical) or a [REF#UI-00623]
        // floor number (1-7) for the By-Level pills.
        this._monsterFilter = 'all';

        // ════════════════════════════════════════════════════════════════ [REF#UI-00624]
        // CHARACTER + EQUIPMENT (spreads 5-6 / pages 11-12, "Pages 10+11")
        // ════════════════════════════════════════════════════════════════
        // Worker-Inv 2026-06-01. Page 11 = player avatar + live stats (reads
        // the SAME #attr-* / #player-* DOM the action-rail HUD renders, since
        // the guide runs in the Panels iframe — no fabricated numbers). Page
        // 12 = equipment: 8 body slots + a draggable list of the player's
        // ITEM-class gear.
        //
        // TAXONOMY (HARD RULE): every equippable here is the ITEM card class
        // — armor pieces & accessories. We do NOT invent a new card class
        // (no ARMOR/HELM class); `kind:'ITEM'` keeps us inside
        // MELEE/RANGED/SPELL/ITEM. Each item declares the ONE slot it fits.
        this.EQUIP_SLOTS = [
            { id: 'HEAD',      label: 'Head',      icon: 'fa-helmet-safety' },
            { id: 'CHEST',     label: 'Chest',     icon: 'fa-shirt' },
            { id: 'BODY',      label: 'Body',      icon: 'fa-vest' },
            { id: 'ARMS',      label: 'Arms',      icon: 'fa-hand-fist' },
            { id: 'LEGS',      label: 'Legs',      icon: 'fa-socks' },
            { id: 'BOOTS',     label: 'Boots',     icon: 'fa-shoe-prints' },
            { id: 'RINGS',     label: 'Rings',     icon: 'fa-ring' },
            { id: 'NECKLACES', label: 'Necklaces', icon: 'fa-gem' },
        ];
        // Equippable ITEM catalog. `slot` matches an EQUIP_SLOTS id; `ac` is a [REF#UI-00625]
        // small armor-class contribution surfaced on the stats panel. Titles
        // are upper-case so they index window.cardInventoryCounts the same way
        // weapon cards do. This is a first-increment set — artwork + a full
        // stat formula are deferred (flagged in the delivery report).
        this.EQUIP_ITEMS = [
            { id: 'IRON HELM',        slot: 'HEAD',      kind: 'ITEM', kanji: '兜', ac: 2, weight: 4,   desc: 'Forged half-helm.' },
            { id: 'STRAW HAT',        slot: 'HEAD',      kind: 'ITEM', kanji: '笠', ac: 1, weight: 0.5, desc: 'Woven ronin kasa.' },
            { id: 'LEATHER CUIRASS',  slot: 'CHEST',     kind: 'ITEM', kanji: '胸', ac: 3, weight: 6,   desc: 'Boiled-leather chest.' },
            { id: 'SILK KIMONO',      slot: 'BODY',      kind: 'ITEM', kanji: '着', ac: 1, weight: 1,   desc: 'Light layered robe.' },
            { id: 'IRON BRACERS',     slot: 'ARMS',      kind: 'ITEM', kanji: '腕', ac: 2, weight: 3,   desc: 'Banded forearm guards.' },
            { id: 'SHIELD',           slot: 'ARMS',      kind: 'ITEM', kanji: '盾', ac: 3, weight: 8,   desc: 'Round war shield.' },
            { id: 'PLATE GREAVES',    slot: 'LEGS',      kind: 'ITEM', kanji: '脚', ac: 2, weight: 5,   desc: 'Plated shin armor.' },
            { id: 'TABI BOOTS',       slot: 'BOOTS',     kind: 'ITEM', kanji: '足', ac: 1, weight: 2,   desc: 'Split-toe boots.' },
            { id: 'JADE RING',        slot: 'RINGS',     kind: 'ITEM', kanji: '輪', ac: 1, weight: 0.1, desc: 'Carved jade band.' },
            { id: 'SIGNET RING',      slot: 'RINGS',     kind: 'ITEM', kanji: '印', ac: 1, weight: 0.1, desc: 'Outlaw signet.' },
            { id: 'BONE AMULET',      slot: 'NECKLACES', kind: 'ITEM', kanji: '首', ac: 1, weight: 0.2, desc: 'Warding charm.' },
            { id: 'PRAYER BEADS',     slot: 'NECKLACES', kind: 'ITEM', kanji: '珠', ac: 1, weight: 0.2, desc: 'Blessed juzu.' },
            // ── THE ARMOUR THE GAME ACTUALLY DROPS (Mark 2026-07-27: "when picked up it should auto equip [REF#UI-00626]
            //    to slot and AC should update") ──────────────────────────────────────────────────────────
            //    This catalog and the game's loot were two different vocabularies. The guide priced IRON
            //    HELM / LEATHER CUIRASS / PLATE GREAVES / TABI BOOTS; the dungeon and the vending machine
            //    drop SAMURAI HELMET / CHEST ARMOR / GREAVES / BOOTS / GAUNTLETS. Only SHIELD overlapped.
            //    So a real pickup could never occupy a slot here — the panel was cataloguing gear that does
            //    not drop, while the gear that does drop had nowhere to go. Same class of silent string
            //    mismatch that _AC_TABLE's header warns about, one layer up.
            //    `ac` mirrors window._AC_REGIONS in Panels ({chest:5, head:1, legs:2, arms:1, feet:1}) so
            //    this panel and the AC dial can never quote different numbers for the same piece. If those
            //    regions are re-priced, re-price these with them — they are a MIRROR, not a second opinion.
            { id: 'SAMURAI HELMET',   slot: 'HEAD',      kind: 'ITEM', kanji: '兜', ac: 1, weight: 4, desc: 'Lacquered war helm.' },
            { id: 'CHEST ARMOR',      slot: 'CHEST',     kind: 'ITEM', kanji: '胴', ac: 5, weight: 9, desc: 'Banded dō cuirass.' },
            { id: 'GREAVES',          slot: 'LEGS',      kind: 'ITEM', kanji: '脛', ac: 2, weight: 5, desc: 'Iron shin plates.' },
            { id: 'BOOTS',            slot: 'BOOTS',     kind: 'ITEM', kanji: '沓', ac: 1, weight: 2, desc: 'Studded travel boots.' },
            { id: 'GAUNTLETS',        slot: 'ARMS',      kind: 'ITEM', kanji: '籠', ac: 1, weight: 2, desc: 'Plated hand guards.' },
        ];
        // CARRY WEIGHT (Mark 2026-09-20: "each equipment will now have [a weight value]" — every item [REF#PENDING] [REF#UI-01372]
        // carries a numeric weight; total carried weight is tracked against this cap). Knob:
        // window._maxCarryWeight overrides the default. See _computeCarryWeight()/_renderEquipment().
        this.MAX_CARRY_WEIGHT = (typeof window !== 'undefined' && typeof window._maxCarryWeight === 'number') ? window._maxCarryWeight : 100;
        // PRIMARY (melee) WEAPONS — mirrors Panels' MELEE_META / MELEE_ORDER (Origami.RealityEngine.Panels.html, [REF#UI-00627]
        // updateCombatCategories). The "Primary Weapon" picker reads window.cardInventoryCounts for FOUND
        // weapons and sets window.rolledMeleeWeapon. Keep kanji/desc/attr in sync with MELEE_META there.
        this.MELEE_WEAPONS = [
            { id: 'KATANA',      kanji: '刀', desc: 'Samurai Katana', attr: '+18 ATK · −10 karma', weight: 3 },
            { id: 'NINJA SWORD', kanji: '忍', desc: 'Ninja Sword',    attr: '+15 ATK · fast swing', weight: 2 },
            { id: 'MACE',        kanji: '槌', desc: 'Cleric Mace',    attr: '+16 ATK · heavy crush', weight: 6 },
            { id: 'STAFF',       kanji: '杖', desc: 'Wizard Staff',   attr: '+12 ATK · magic strike', weight: 3 },
        ];
        // AUTO-USE RANGED WEAPONS (Mark 2026-09-11: the INV page is where "players can select what weapon they will [REF#UI-01333]
        // auto use"). Ids are the deck ACTION names (the ledger keys in window.cardInventoryCounts); `show` is the face
        // text where it differs (PISTOL is displayed MAGIC MISSILE). Picking one sets the RANGED column's face card
        // (window._lastUsedByDeck.RANGED) and tells the engine (SET_AUTO_RANGED → window._lastRangedAction), which is
        // what the canvas auto-attack fires. rolledRangedWeapon is NOT touched — it is the .38's ammo ledger key.
        this.RANGED_WEAPONS = [
            { id: 'PISTOL',             show: 'MAGIC MISSILE', kanji: '銃', desc: '.38 Special',    attr: '20-60 DMG · 6-round drum', weight: 2 },
            { id: 'MAGIC AUTO MISSILE', show: null,            kanji: '連', desc: 'MAC-9',          attr: '×3 burst · 30-round mag', weight: 5 },
            { id: 'SHORT BOW',          show: null,            kanji: '弓', desc: 'Short Bow',      attr: 'ranged · recoverable', weight: 2 },
            { id: 'LONG BOW',           show: null,            kanji: '長', desc: 'Long Bow',       attr: 'ranged · long reach', weight: 3 },
            { id: 'SAMURAI BOW',        show: null,            kanji: '和', desc: 'Samurai Bow',    attr: 'ranged · yumi', weight: 3 },
            { id: 'CROSSBOW',           show: null,            kanji: '弩', desc: 'Crossbow',       attr: 'ranged · bolts', weight: 5 },
            { id: 'SHURIKEN',           show: null,            kanji: '手', desc: 'Shuriken',       attr: 'thrown · recoverable', weight: 0.1 },
            { id: 'CAMERA',             show: 'MAGIC CAMERA',  kanji: '閃', desc: 'Blinding flash', attr: 'STUN 5-10 TURNS · RANGE 18', weight: 1 },
        ];
        // slot id -> equipped item id (or null). The canonical equip state; [REF#UI-00628]
        // mirrored to localStorage (survives the load-time iframe reload) AND
        // bundled into the named save slot via the SAVE_NOW bridge.
        this.equipment = {};
        for (const s of this.EQUIP_SLOTS) this.equipment[s.id] = null;
        this._loadEquipment();
        this._dragItemId = null; // id of the item currently being dragged [REF#UI-00629]
        this._aiSettings = this._loadAiSettings();

        // ── SPECIAL ROOMS registry (Mark 2026-06-18) — each special room is a page under the ROOMS [REF#UI-00630]
        //    section. Rooms are HIDDEN until DISCOVERED (first peaceful entry → openRoom(id)). Add new
        //    rooms here as they're built (casino / konbini / sake tavern…); lore via i18n-key tuples.
        this.specialRooms = {
            cabaret: {
                icon: '🎭', logo: 'assets/brand/starlette.png',
                name: ['wg.rooms.cabaret.name', 'The Cabaret'],
                kanji: '秘密のキャバレー ♪ 秘密のダンス',
                blurb: ['wg.rooms.cabaret.blurb', "Starlette's velvet stage"],
                title: ['wg.cabaret.title', 'WELCOME TO THE CABARET'],
                lore: [
                    ['wg.cabaret.lore.1', 'Velvet shadows swallow the doorway behind you. A single shaft of blue light falls on the stage, where <b>Starlette the Succubus</b> sways to a song only the lonely can hear.'],
                    ['wg.cabaret.lore.2', 'Goblin patrons nurse their sake at the bar; a vending machine hums warm in the corner.'],
                    ['wg.cabaret.lore.3', 'Take a seat, place a bet, and enjoy the show.'],
                ],
                // ── DORMANT VARIANT (Mark 2026-08-01: "SAY ITS CLOSED DUE TO PERMIT VIOLATIONS") ── [REF#UI-00631]
                // Shown while the cabaret is shut by the inspectors (CABARET_WELCOME arrives with
                // dormant:true). The lit-room text above describes a show that is not happening —
                // this one describes the room the player actually walks into: dark, silent, her
                // crying inside the quest circle, and the way to fix it.
                kanjiDormant: '営業停止 ・ 許可証違反',
                blurbDormant: ['wg.rooms.cabaret.blurb.dorm', 'Closed — permit violations'],
                titleDormant: ['wg.cabaret.title.dorm', 'CLOSED — PERMIT VIOLATIONS'],
                loreDormant: [
                    ['wg.cabaret.dorm.1', 'A wooden notice is nailed across the entrance: <b>CLOSED BY ORDER OF THE INSPECTORS — PERMIT VIOLATIONS</b>. The lights are cold, the bar is dry, and the music stopped mid-song.'],
                    ['wg.cabaret.dorm.2', 'In a worn circle on the floor, <b>Starlette</b> sits alone in the dark, staring at the stage that used to be hers.'],
                    ['wg.cabaret.dorm.3', 'Somewhere below, a <b>SINGING permit</b> is waiting. Bring it to her circle and give the cabaret back its voice.'],
                ],
                okDormant: ['wg.rooms.ok.dorm', 'OK — find the permit'],
                // RED warning line removed 2026-06-19 (Mark: "remove red text + replace with OK button"). The [REF#UI-00632]
                // neutral-zone mechanic (draw a blade → she flees, the house turns cold) still works in-engine; the
                // welcome card now ends warmly on the localized OK button instead of an alarming red caution.
            },
            // ── THE FOUR SPECIAL ROOMS (2026-10-01) ───────────────────────────────────────────────────────────────────── [REF#UI-01473]
            //    The permit rooms the Manager waits on (Engine9 _bossRooms: KITCHEN, FACTORY, STORAGE, GUARD_POST). Each page
            //    carries a SNAPSHOT of its own room, rendered from the live game with the room activated and dressed
            //    (assets/brand/rooms/*.jpg). `special: true` lists them on the ROOMS page from the start; their status line comes
            //    from the engine (SPECIAL_ROOMS_STATE → setSpecialRoomsState): not yet found · dark (permit not stamped) · running.
            //    The art stays grey until the room is running, the same treatment the cabaret's portrait gets while it is shut.
            //    `engineKey` is the permit key the engine reports by. Lore is the room as it plays, nothing promised that is not built.
            cafeteria: {
                special: true, engineKey: 'KITCHEN', icon: '🍱', logo: 'assets/brand/rooms/cafeteria.jpg',
                name: ['wg.rooms.cafeteria.name', 'The Cafeteria'],
                blurb: ['wg.rooms.cafeteria.blurb', 'Running — the kitchen is hot'],
                title: ['wg.rooms.cafeteria.title', 'THE CAFETERIA'],
                lore: [
                    ['wg.rooms.cafeteria.lore.1', 'Long tables, a soot-black stove and a counter worn smooth by elbows. When the kitchen runs, the floor\'s workers come here to eat between shifts.'],
                    ['wg.rooms.cafeteria.lore.2', 'It stays cold and dark until its <b>KITCHEN permit</b> is stamped.'],
                ],
            },
            factory: {
                special: true, engineKey: 'FACTORY', icon: '⚙️', logo: 'assets/brand/rooms/factory.jpg',
                name: ['wg.rooms.factory.name', 'The Factory'],
                blurb: ['wg.rooms.factory.blurb', 'Running — the looms are turning'],
                title: ['wg.rooms.factory.title', 'THE FACTORY'],
                lore: [
                    ['wg.rooms.factory.lore.1', 'Timber frames, a great iron gear and benches black with grease. When it runs, the floor\'s workers clock in here and the whole level hums.'],
                    ['wg.rooms.factory.lore.2', 'It stays silent until its <b>FACTORY permit</b> is stamped.'],
                ],
            },
            warehouse: {
                special: true, engineKey: 'STORAGE', icon: '📦', logo: 'assets/brand/rooms/warehouse.jpg',
                name: ['wg.rooms.warehouse.name', 'The Warehouse'],
                blurb: ['wg.rooms.warehouse.blurb', 'Running — the stores are open'],
                title: ['wg.rooms.warehouse.title', 'THE WAREHOUSE'],
                lore: [
                    ['wg.rooms.warehouse.lore.1', 'Bunks for the night crew and dragon-marked jars stacked along the walls — the floor keeps what it owns here.'],
                    ['wg.rooms.warehouse.lore.2', 'It stays locked in the dark until its <b>STORAGE permit</b> is stamped.'],
                ],
            },
            guardpost: {
                special: true, engineKey: 'GUARD_POST', icon: '🛡️', logo: 'assets/brand/rooms/guardpost.jpg',
                name: ['wg.rooms.guardpost.name', 'The Guard Post'],
                blurb: ['wg.rooms.guardpost.blurb', 'Running — the watch is set'],
                title: ['wg.rooms.guardpost.title', 'THE GUARD POST'],
                lore: [
                    ['wg.rooms.guardpost.lore.1', 'A counter that watches the Main Hall, a cage for anyone who makes trouble, and a <b>Gate Ogre</b> asleep on the cot behind it.'],
                    ['wg.rooms.guardpost.lore.2', 'It stays dark until its <b>GUARD POST permit</b> is stamped.'],
                ],
            },
        };
        // The engine's report of the four special rooms, by registry id: { found, active }. Empty until the first report. [REF#PENDING] [REF#UI-01474]
        this._specialRoomsState = {};
        this._tavernQuestState = { unlocked: false, quests: [] };
        try { if (window._tavernQuestStatePending) { this._tavernQuestState = window._tavernQuestStatePending; window._tavernQuestStatePending = null; } } catch (_) {}
        // a report that reached Panels before this guide existed is parked on window — take it now [REF#UI-01475]
        try { const _pend = window._specialRoomsStatePending; if (_pend){ window._specialRoomsStatePending = null; setTimeout(() => { try { this.setSpecialRoomsState(_pend); } catch (_) {} }, 0); } } catch (_) {}
        this._roomsDiscovered = this._loadRoomsDiscovered();   // Set of discovered room ids (persists) [REF#UI-00633]
        // PROGRESSIVE TABS (Mark 2026-06-21): hide each guide tab until its section is first opened; then it stays [REF#UI-00634]
        // visible forever (persisted). INTRO (slide 0) is always shown. ROOMS unlocks when the cabaret room page opens, etc.
        // Progressive tabs (Mark 2026-06-22): onload ONLY the INTRO tab (slide 0). Key bumped to _v2 so prior
        // testing's accumulated unlocks are cleared = a clean "intro only" first load. ROOMS unlocks on cabaret
        // entry, WAGER unlocks when the player actually plays a slot or a wager game (not the mere invite).
        // PROGRESSIVE TABS (Mark 2026-06-22: "limit the pagination to what tabs are available — reduce cognitive
        // load"): start EACH load with ONLY the Intro tab (slide 0). Tabs are added as the player encounters their
        // feature THIS run (cabaret → Rooms · casino → Slots · INV button → Inventory · gamble → Wager). NOT persisted
        // across reloads — a fresh load is always just Intro (no stale unlocks carried over from prior testing).
        // ⛔ SUPERSEDED 2026-09-20 by Mark: "remove this weird world page ... the game can be totally accessed via our parser" —
        //    WORLD is no longer pre-unlocked and its tab button is gone from the strip (~:6200). [REF#UI-00635]
        this._unlockedTabs = new Set([0]);
        // R5: push stored accessibility prefs at construction — they must hold from the first frame, [REF#UI-00636]
        // not from whenever the player happens to open Settings. Deferred a tick so the engine iframe
        // and the shell relay are listening.
        try { setTimeout(() => this._broadcastA11yPrefs(), 1200); } catch(_){}
        try { this._applyContrast(); } catch(_){}   // the contrast skin holds from the first frame, not 1.2 s later (2026-10-02) [REF#UI-01476]
        this._devMode = false;   // Mark 2026-07-02: Settings sets this true → every guide tab (incl. the Monster hub) shows [REF#UI-00637]
        // ONBOARDING PAGINATION CEILING (Mark 2026-06-23): on a fresh load the guide is a [REF#UI-00638]
        // 4-page onboarding — spread 0 = INTRO, spread 1 = ROLES — NOT the full 12-spread
        // reference book. NEXT on the roles spread closes the guide; dots/nav never page past
        // here in onboarding. Browse mode (LOG button, _browseMode) ignores this and shows all.
        this.ONBOARD_LAST_SLIDE = 1;
        this._lastRoom = null;                                 // last room opened (selected on the ROOMS page) [REF#UI-00639]
        this._roomSlotsTarget = 3;   // Mark 2026-07-19 "only 3 slots at a time" (was 6 — the ? list crowded the page and pushed the CTA off-screen)                             // total room slots shown — undiscovered slots render as faded "?" skeletons so the page never reads empty (Mark 2026-06-18) [REF#UI-00640]

        // Re-bind Settings button click to open Setup (Monster Database slide) directly [REF#UI-00641]
        window.openSettings = () => {
            this.openSetup();
            try { window.parent.postMessage({ type: 'LIST_SAVES' }, '*'); } catch(_) {}
        };
        // WAGER screen — open the guide to the live 3D wager table (Mark 2026-06-18). [REF#UI-00642]
        // Hook for WAGER/FAST BET to call + a console preview.
        window.showWagerScreen = () => this.openWager();
    }

    // ── Equipment persistence (guide-owned localStorage mirror) ───────── [REF#UI-00643]
    // localStorage survives the engine/panels reload that LOAD_NOW triggers,
    // so equipped gear comes back even before the save-slot bridge lands.
    _loadEquipment() {
        try {
            const raw = localStorage.getItem('wg_equipment');
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (saved && typeof saved === 'object') this.applyEquipment(saved);
        } catch (_) {}
    }
    _saveEquipment() {
        try { localStorage.setItem('wg_equipment', JSON.stringify(this.equipment)); } catch (_) {}
    }
    // NEW GAME → empty equipment. wg_equipment persists gear across the reload-based DESCENT, so we only clear it [REF#UI-00644]
    // on a fresh start (applyStartingWeapons) — not on descent/save-load — so a stale shield can't leak into a new run.
    resetEquipment() {
        for (const s of this.EQUIP_SLOTS) this.equipment[s.id] = null;
        try { localStorage.removeItem('wg_equipment'); } catch (_) {}
        try { this._renderEquipment(); } catch (_) {}
    }
    // ── AUTO-EQUIP ON PICKUP (Mark 2026-07-27) ─────────────────────────────────────────────────── [REF#UI-00645]
    // Panels calls this from its ADD_CARD handler the moment an armour card is collected. Same rule the
    // AC dial uses: ONE PIECE PER SLOT, best AC wins — so a better helmet replaces a worse one and a
    // worse one never displaces a better. Returns the slot it filled, or null if the name is not
    // equippable, so the caller can log honestly instead of assuming.
    // Deliberately NOT a second source of truth: the dial keeps reading computeArmorClass(); this only
    // mirrors the same decision into the visual panel so the two agree.
    autoEquipByName(rawName) {
        try {
            const nm = String(rawName || '').toUpperCase().replace(/\s*X\d+$/, '').replace(/\s*\+\d+\s*/, '').trim();
            const item = this.EQUIP_ITEMS.find(i => i.id === nm);
            if (!item) return null;
            const cur = this._itemById ? this._itemById(this.equipment[item.slot]) : null;
            if (cur && (cur.ac | 0) > (item.ac | 0)) return null;   // already wearing something better [REF#UI-00646]
            this.equipment[item.slot] = item.id;
            try { this._saveEquipment && this._saveEquipment(); } catch (_) {}
            if (this._injected) { try { this._renderEquipment(); } catch (_) {} }
            return item.slot;
        } catch (_) { return null; }
    }

    // Public restore hook — validates against the slot model so a stale or [REF#UI-00647]
    // hand-edited payload can't inject an unknown slot/item. Called by
    // _loadEquipment() and by the panels LOAD bridge (window.welcomeGuide).
    applyEquipment(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (const s of this.EQUIP_SLOTS) {
            const itemId = obj[s.id];
            const item = itemId ? this.EQUIP_ITEMS.find(i => i.id === itemId && i.slot === s.id) : null;
            this.equipment[s.id] = item ? item.id : null;
        }
        // Repaint if the equipment spread is already mounted. [REF#UI-00648]
        if (this._injected) this._renderEquipment();
    }

    // ── Clip-override persistence ──────────────────────────────────────── [REF#UI-00649]
    _loadClipOverrides() {
        try {
            const raw = localStorage.getItem('wg_monster_clip_overrides');
            return raw ? JSON.parse(raw) : {};
        } catch (_) { return {}; }
    }
    _saveClipOverrides() {
        try {
            localStorage.setItem('wg_monster_clip_overrides', JSON.stringify(this._clipOverrides));
        } catch (_) {}
        this._monMarkDirty();
    }


    // ──────────────────────────────────────────────────────────────── [REF#UI-00650]
    // Public API
    // ────────────────────────────────────────────────────────────────
    // Localize a guide string. EN = the inline fallback (always present, never
    // blank). Non-EN: prefer the self-contained WG_I18N dict, then the central
    // catalog (window.tLog) if it later gains the key, else the EN fallback.
    _L(key, fallback) {
        const lang = (typeof window !== 'undefined' && window.currentLang) || 'en';
        // PLAIN LANGUAGE (3.1.5): the twin wins when the reader asked for it — same key, simpler words, same joke [REF#UI-01339]
        try { if (this._a11yPrefs().plainText) { const pl = WG_PLAIN[lang] || WG_PLAIN.en; if (pl && pl[key] != null) return pl[key]; } } catch(_){}
        if (lang !== 'en') {
            const dict = WG_I18N[lang];
            if (dict && dict[key] != null) return dict[key];
            if (typeof window !== 'undefined' && typeof window.tLog === 'function') {
                const v = window.tLog(key);
                if (v && v !== key) return v;
            }
        }
        return fallback;
    }

    // Rebuild the guide DOM in the current language. Preserves the open slide, [REF#UI-00651]
    // chat input, and selection state. No-op until injected / if lang unchanged.
    _relocalize(force) {
        if (!this._injected) return;
        const lang = (typeof window !== 'undefined' && window.currentLang) || 'en';
        if (lang === this._renderedLang && !force) return;
        const wrap = document.getElementById(this.containerId);
        if (!wrap) return;
        const wasOpen = wrap.classList.contains('is-open');
        const slide = this.currentSlide;
        try { this._restoreChatInput(); } catch(_) {}
        try { this._teardownPreviews(); } catch(_) {}
        wrap.innerHTML = this._html();
        this._bind(wrap);
        this._renderedLang = lang;
        if (wasOpen) {
            this.setSlide(slide);
            this._mountChatInput();
            if (window.selectedRole) { try { this._renderRoleProfile(window.selectedRole); } catch(_) {} }
            this._renderSavesList();
        }
    }

    show(opts = {}) {
        // LOG/reference open: browse the whole guide — PLAY NOW becomes plain Next (Mark 2026-06-09). [REF#UI-00652]
        this._browseMode = !!(opts && opts.browse);
        // A GAME STARTS WHEN THE GUIDEBOOK SHOWS UP (Mark 2026-09-20: "no persistent game to game karma -- that was never [REF#UI-01373]
        // the intent -- its per game. which starts when the guidebook shows up"). The first real (non-browse) open is
        // the start line: karma to 0, and the terms +1 armed again. A save loaded afterwards still restores its own
        // karma on top (Engine9 ~:79441) — that is the same game continuing, not a new one.
        if (!this._browseMode && !this._gameStarted) {
            this._gameStarted = true;
            window._tcKarmaAwarded = false;
            try { window.parent.postMessage({ type: 'ONIBABA_SET_KARMA', karma: 0 }, '*'); } catch (_) {}
        }
        try { if (document.activeElement && document.activeElement !== document.body) this._lastFocus = document.activeElement; } catch(_){}   // WCAG: restore on close [REF#UI-00653]
        if (!this._injected) this._inject();
        else this._relocalize();
        const el = document.getElementById(this.containerId);
        if (!el) return;
        el.classList.add('is-open');
        // Guidebook gate — hold event-log alerts while open (Mark 2026-06-16). [REF#UI-00654]
        try { window._setEventLogGuideGate && window._setEventLogGuideGate(true); } catch(_){}
        if (!this.loadingCompleted) {
            el.classList.add('wg-loading-active');
        } else {
            el.classList.remove('wg-loading-active');
        }
        // NATURAL BOOK (Mark 2026-08-02): reopen on the page the reader closed on — whatever docked/ [REF#UI-00655]
        // maximized state it was left in, opening always works and lands where they were. First open
        // of a session (no resume yet) still starts at the cover; the onboarding ceiling in setSlide's
        // consumers is unaffected because a fresh session has no _resumeSlide.
        // P4 (Mark GO 2026-08-14): an explicit opts.slide wins over the natural-book resume — F1
        // must land ON the World page, not wherever the reader last was. Callers that pass no slide
        // (LOG button, cabaret opens) keep the resume behaviour unchanged.
        this.setSlide((typeof opts.slide === 'number') ? opts.slide
                    : (typeof this._resumeSlide === 'number') ? this._resumeSlide : 0);
        this._mountChatInput();
        // Live GOLD readout at the top of the guide (Mark 2026-06-24) — so players always see their gold (esp. while [REF#UI-00656]
        // wagering). Cheap: a guarded ~3×/s poll that no-ops when the bar isn't in the DOM (guide closed).
        if (!this._goldTicker) {
            this._goldTicker = setInterval(() => {
                const n = document.getElementById('wg-gold-num');
                if (!n) return;
                const g = (typeof window !== 'undefined' && typeof window.playerGold === 'number') ? window.playerGold
                        : this._readHudNum('player-gold-val', 0);
                const s = (g || 0).toLocaleString();
                if (n.textContent !== s) n.textContent = s;
            }, 350);
        }
        // Notify OniBaba — guide-open sensory event (resets tension + [REF#UI-00657]
        // silence so she narrates the welcome instead of idle drift).
        try { window.parent.postMessage({ type: 'WELCOME_GUIDE_OPEN' }, '*'); } catch(_){}
        // Ask the engine for the current save list so spread 2 is ready [REF#UI-00658]
        // by the time the player lands on it. Response arrives as a
        // SAVE_LIST message; our constructor listener feeds it into
        // _renderSavesList().
        try { window.parent.postMessage({ type: 'LIST_SAVES' }, '*'); } catch(_){}
        // The engine ships its OWN fullscreen #loading-screen inside the [REF#UI-00659]
        // engine iframe (Origami.RealityEngine.9.html) — driven by
        // THREE.DefaultLoadingManager and self-removes on done. Showing a
        // second loader inside the guide masked the right page and blocked
        // the player from reaching the T&C / role select. Removed
        // 2026-05-25 per user mandate.
    }

    hide(opts = {}) {
        const el = document.getElementById(this.containerId);
        if (!el) return;
        // The guide is the loading screen until the bar says 100%: no caller closes it before then (2026-09-22, same order as the [REF#UI-01416]
        // Escape guard above). A future caller that must may pass { forceWhileLoading: true }.
        if (!this.loadingCompleted && el.classList.contains('wg-loading-active') && opts.forceWhileLoading !== true) return;
        // NATURAL BOOK (Mark 2026-08-02: "when it closes keep the state so its natural") — remember [REF#UI-00660]
        // the page the reader closed on; the next show() reopens right there instead of snapping
        // back to the cover. Slide + selected room both survive (room already via this._lastRoom).
        this._resumeSlide = this.currentSlide;
        el.classList.remove('is-open');
        // WCAG 2.2 (2026-07-05): hand focus back to whatever opened the guide (no lost-focus limbo) [REF#UI-00661]
        try { if (this._lastFocus && this._lastFocus.focus && document.contains(this._lastFocus)) this._lastFocus.focus(); } catch(_){}
        this._lastFocus = null;
        this._devMode = false;   // Mark 2026-07-03: dev-mode (all tabs) is scoped to a SETTINGS open only — reset on every close so a normal re-open shows just the unlocked tabs [REF#UI-00662]
        el.classList.remove('wg-max90', 'wg-max100');   // never leave the modal maximized after close (Solitaire ladder) [REF#UI-00663]
        this._soliMax = 0; this._soliShown = false;
        try { if (this._tapperShown) this.closeTapper(); } catch(_){}   // the tavern closes WITH the book — its song fades with it (Mark 2026-09-15) [REF#UI-01049]
        try { this._clearSpotlight(); } catch (_) {}   // don't leave the floating pickup card orphaned in body if the book closes mid-spotlight (Mark 2026-09-20) [REF#PENDING] [REF#UI-01374]
        // Guidebook gate — flush the held event-log alerts now it's closed (Mark 2026-06-16). [REF#UI-00664]
        try { window._setEventLogGuideGate && window._setEventLogGuideGate(false); } catch(_){}
        try { this._teardownRoleIcons(); } catch (_) {}   // kill the 6 role-icon renderers on close (Mark mandate) [REF#UI-00665]
        this._restoreChatInput();
        // Tear down the live 3D previews so their WebGL contexts + RAF loops [REF#UI-00666]
        // don't keep churning the GPU behind the closed guide (renderStress
// protection — see SIA). Idempotent.
        this._teardownPreviews();
        try { this._teardownWagerPreview(); } catch(_){}   // dispose the dedicated wager 3D renderer [REF#UI-00667]
        try { if (typeof window.openMusicPage === 'function') window.openMusicPage('guide-hide'); } catch(_){}   // the music page closes with the book (2026-10-02) [REF#UI-01477]
        try { window.parent.postMessage({ type: 'WELCOME_GUIDE_CLOSE' }, '*'); } catch(_){}

        // Trigger the quick launch guide on play start (not load) [REF#UI-00668]
        if (!opts.isFromLoad && this.quickLaunch) {
            this.quickLaunch.show();
        }
    }

    /** @param {string} [key] i18n id for `text` — see the localization note below. [REF#UI-00669] */
    beginLoading(loadId) {
        if (!loadId || loadId === this._loadId) return;
        this._loadId = loadId;
        this._loadWorldReady = false;
        this._loadFailed = false;
        this.loadingCompleted = false;
        this._loadPct = 0;
        document.getElementById(this.containerId)?.classList.add('wg-loading-active');
        this.updateLoadingProgress(0);
        this._updatePlayBtn();
    }

    completeLoading(loadId) {
        if (!loadId || loadId !== this._loadId || this._loadFailed) return false;
        this._loadWorldReady = true;
        this.updateLoadingProgress(100, '100% download complete!', 'load.download_complete');
        return true;
    }

    failLoading(loadId, text) {
        if (loadId !== this._loadId || this._loadWorldReady) return;
        this._loadFailed = true;
        this.updateLoadingProgress(this._loadPct, text);
        this._updatePlayBtn();
    }

    updateLoadingProgress(progress, text, key, params, loadId = this._loadId) {
        if (loadId !== this._loadId) return;
        if (this.loadingCompleted) return;

        // MONOTONIC FILL (Mark 2026-07-25 "during progress bar it goes forward and backwards"): the engine posts a [REF#UI-00670]
        // byte-based 0-70% download band INTERLEAVED with fixed checkpoint posts (2 'Generating dungeon layout', 68,
        // 69, 70, 85, 95…). Those arrive out of order, so writing each raw value straight to the fill made the bar
        // jump backward. Clamp the FILL so it only ever advances within a load; the status TEXT still tracks the
        // newest post so the label stays truthful.
        if (typeof this._loadPct !== 'number') this._loadPct = 0;
        const supplied = Number.isFinite(progress) ? progress : 0;
        const shown = this._loadPct = Math.min(this._loadWorldReady ? 100 : 99,
            Math.max(this._loadPct, supplied));

        const bar = document.getElementById('wg-loader-bar-fill');
        const statusEl = document.getElementById('wg-loader-status');
        const pctEl = document.getElementById('wg-loader-percentage');

        if (bar) bar.style.width = `${shown}%`;
        // ── LOCALIZED (Mark 2026-08-21 "localize progress bar text") ───────────────────────── [REF#UI-00671]
        //    This is the cyan boot loader in his screenshot. The engine tags every
        //    ENGINE_LOAD_PROGRESS post with an i18n `key` and keeps its English `text` alongside as
        //    the fallback; the Panels relay (~:19604) forwards both.
        //    ⚠ `window.t`, NOT this._L(). _L() consults WG_I18N then window.tLog, and tLog reads the
        //      `log` section only — it can never see a `ui` key. That exact mismatch is why the
        //      guide's gold bar still rendered "GOLD" on 2026-08-20 after the key was added to
        //      i18n.js. These keys live in `ui`, so they must be read with window.t.
        //    window.t echoes the key back when unmapped, so the result is checked before use: an
        //    unresolved key degrades to the engine's English, never to a literal "load.combat".
        if (statusEl && (text || key)) {
            let shownText = text;
            if (key && typeof window !== 'undefined' && typeof window.t === 'function') {
                const v = window.t(key);
                // {param} substitution AFTER translation, so a localized string may reorder its [REF#UI-00672]
                // placeholders — Japanese counters frequently do. Same convention as tLog.
                if (v && v !== key) shownText = params
                    ? Object.keys(params).reduce((a, k) => a.split('{' + k + '}').join(String(params[k])), v)
                    : v;
            }
            statusEl.textContent = shownText;
        }
        if (pctEl) pctEl.textContent = `${shown}%`;

        if (shown >= 100 && this._loadWorldReady && !this._loadFailed) {
            this.loadingCompleted = true;
            const overlay = document.getElementById(this.containerId);
            if (overlay) {
                overlay.classList.remove('wg-loading-active');
            }
            this._updatePlayBtn();
        }
    }

    // SETUP entry-point — opens the guide straight to the Monster Database [REF#UI-00673]
    // spread (pages 7-8). Wired to the footer SETUP button and exposed on
    // window.welcomeGuide so the panels' Settings action (or any caller)
    // can jump to the bestiary instead of the cover.
    openSetup() {
        if (!this._injected) this._inject();
        const el = document.getElementById(this.containerId);
        if (!el) return;
        el.classList.add('is-open');
        try { window._setEventLogGuideGate && window._setEventLogGuideGate(true); } catch(_){}
        this.setSlide(this.SETUP_SLIDE);
        // Same sensory courtesy as show(): guide-open resets tension/silence [REF#UI-00674]
        // so Oni-Baba narrates the guide instead of idle-drifting. The
        // dedicated WELCOME_GUIDE_OPEN case in OniBaba8.js (664-669) handles
        // this — we do NOT post combat events, so the silence sensor is safe.
        try { window.parent.postMessage({ type: 'WELCOME_GUIDE_OPEN' }, '*'); } catch(_){}
        this._mountChatInput();
    }

    // ── SPECIAL ROOMS section (Mark 2026-06-18) ──────────────────────────── [REF#UI-00675]
    // openRoom(id): mark the room DISCOVERED (persist) + open the guide to the ROOMS
    // page with that room selected. Fired on a peaceful first entry (engine-gated,
    // skipped if already attacked). openCabaret() is the cabaret-specific alias the
    // existing trigger + window.showCabaretWelcome() preview route through.
    openRoom(roomId, opts) {
        const run = () => this._openRoomMeasured(roomId, opts);
        return window.parent._measureFrameWork ? window.parent._measureFrameWork('Panels', 'guide.openRoom', run) : run();
    }
    _openRoomMeasured(roomId, opts) {
        if (roomId && this.specialRooms && this.specialRooms[roomId]) {
            if (!this._roomsDiscovered.has(roomId)) { this._roomsDiscovered.add(roomId); this._saveRoomsDiscovered(); }
            this._lastRoom = roomId;
        }
        // DORMANT FLAG (Mark 2026-08-01) — rides CABARET_WELCOME from the engine (the room-state [REF#UI-00676]
        // authority); latched here so re-renders keep the right card until the next welcome updates it.
        if (opts && 'dormant' in opts) this._roomDormant = !!opts.dormant;
        if (!this._injected) this._inject();
        const el = document.getElementById(this.containerId);
        if (!el) return;
        el.classList.add('is-open');
        // Cinematic entry (Mark 2026-06-23): the engine's grand-entrance cinematic asks the book to [REF#UI-00677]
        // FADE in gently (not snap). One-shot animation class, auto-removed when it ends.
        if (opts && opts.cinematic) {
            el.classList.add('wg-cine-fade');
            const _off = () => { el.classList.remove('wg-cine-fade'); el.removeEventListener('animationend', _off); };
            el.addEventListener('animationend', _off);
        }
        try { window._setEventLogGuideGate && window._setEventLogGuideGate(true); } catch(_){}
        this.setSlide(this.ROOMS_SLIDE);   // renders the list + selects this._lastRoom [REF#UI-00678]
        try { window.parent.postMessage({ type: 'WELCOME_GUIDE_OPEN' }, '*'); } catch(_){}
        this._mountChatInput();
    }
    openCabaret(opts) { this.openRoom('cabaret', opts); }
    // A room's status line. The cabaret keeps its own two (lit / shut); a special room reads the engine's report. [REF#PENDING] [REF#UI-01478]
    _roomBlurb(id) {
        const r = this.specialRooms[id]; if (!r) return '';
        if (!r.special) return (this._roomDormant === true && r.blurbDormant) ? this._L(r.blurbDormant[0], r.blurbDormant[1]) : this._L(r.blurb[0], r.blurb[1]);
        const st = this._specialRoomsState[id] || {};
        if (st.active === true) return this._L(r.blurb[0], r.blurb[1]);
        if (st.found === true) return this._L('wg.rooms.special.dark', 'Dark — its permit is not stamped');
        return this._L('wg.rooms.special.unfound', 'Not yet found');
    }
    // SPECIAL_ROOMS_STATE from the engine (2026-10-01): { rooms: { KITCHEN: {found, active}, … } } keyed by permit key. A room [REF#UI-01479]
    // the player has stood in counts as discovered; the ROOMS page re-renders in place if it is the one showing.
    setSpecialRoomsState(state) {
        const byKey = (state && state.rooms) || {}; let changed = false;
        for (const id of Object.keys(this.specialRooms)) {
            const r = this.specialRooms[id]; if (!r.special || !r.engineKey || !byKey[r.engineKey]) continue;
            const nx = { found: byKey[r.engineKey].found === true, active: byKey[r.engineKey].active === true };
            const cur = this._specialRoomsState[id] || {};
            if (cur.found !== nx.found || cur.active !== nx.active) { this._specialRoomsState[id] = nx; changed = true; }
            if (nx.found && !this._roomsDiscovered.has(id)) { this._roomsDiscovered.add(id); this._saveRoomsDiscovered(); }
        }
        if (changed && this._injected && document.getElementById('wg-rooms-list')) { try { this._renderRoomsList(); } catch (_) {} }
        return changed;
    }

    setTavernQuestState(state) {
        this._tavernQuestState = state && typeof state === 'object' ? state : { unlocked: false, quests: [] };
        try { this._renderTavernQuestList(); } catch (_) {}
        return true;
    }
    _renderTavernQuestList() {
        const host = document.querySelector('#wg-tavern-quest-list');
        if (!host) return;
        const state = this._tavernQuestState || {}, quests = Array.isArray(state.quests) ? state.quests : [];
        if (!state.unlocked) {
            host.innerHTML = '<p class="wg-page-sub">Clear your first section to unlock tavern quests.</p>';
            return;
        }
        const open = quests.filter(q => q && q.state === 'available');
        const active = quests.find(q => q && q.state === 'active');
        if (active) {
            const story = active.kind === 'story', tactics = active.view === 'tactics';
            const title = story ? 'The Missing Cask' : 'Orc Shakedown — ' + String(active.roomName || active.roomKey || 'Special Room');
            const body = story ? 'The night crew needs your call: secure the workers or keep the room running.'
                : tactics ? `Objective: defeat the orc squad in ${String(active.roomName || active.roomKey || 'the special room')}. Remaining raiders: ${Number.isFinite(active.remaining) ? active.remaining : 'checking'}.`
                : 'The room is under pressure. Follow the orcs into the room and stop the shakedown before the workers are driven out.';
            const choices = story ? '<button type="button" class="wg-restore-btn" data-tavern-choice="protect">Protect the workers</button> <button type="button" class="wg-restore-btn" data-tavern-choice="production">Keep the room working</button>'
                : '<p>Quest active — return to the tavern circle after the room is clear.</p>';
            host.innerHTML = `<article class="wg-lore"><h3>${title}</h3><p>${body}</p>${choices}</article>`;
            return;
        }
        if (!open.length) {
            host.innerHTML = '<p class="wg-page-sub">No open commissions. New work arrives as special rooms activate.</p>';
            return;
        }
        host.innerHTML = open.map(q => `<article class="wg-lore"><h3>${q.kind === 'orc' ? 'Orc Shakedown' : 'The Missing Cask'} — ${String(q.roomName || q.roomKey || 'Special Room')}</h3><p>${q.kind === 'orc' ? 'An orc squad is shaking down this room. Take them out in a live battle.' : 'The night crew needs a decision that will affect the colony.'}</p>${q.error ? `<p role="status">${String(q.error)}</p>` : ''}<button type="button" class="wg-restore-btn" data-tavern-quest="${String(q.id || '')}" data-tavern-view="story">Story briefing</button>${q.kind === 'orc' ? ` <button type="button" class="wg-restore-btn" data-tavern-quest="${String(q.id || '')}" data-tavern-view="tactics">Tactical briefing</button>` : ''}</article>`).join('');
    }
    openTavernQuests() {
        this.openBarMenu();
        try { window.parent.postMessage({ type:'REQUEST_TAVERN_QUESTS' }, '*'); } catch (_) {}
        try { const host = document.querySelector('#wg-tavern-quest-list'); if (host) host.hidden = false; this._renderTavernQuestList(); } catch (_) {}
    }

    _loadRoomsDiscovered() {
        try { const raw = localStorage.getItem('wg_rooms_discovered'); if (raw) return new Set(JSON.parse(raw)); } catch(_){}
        return new Set();
    }
    _saveRoomsDiscovered() {
        try { localStorage.setItem('wg_rooms_discovered', JSON.stringify([...this._roomsDiscovered])); } catch(_){}
    }
    // PROGRESSIVE TABS (Mark 2026-06-22): reveal a guide tab once its feature is encountered — for THIS run only [REF#UI-00679]
    // (session Set, not persisted; a reload resets to Intro-only). Public so the engine's casino/INV hooks can call it.
    _unlockTab(slideIdx) {
        if (this._unlockedTabs.has(slideIdx)) return false;
        this._unlockedTabs.add(slideIdx);
        return true;
    }

    // Left page: DISCOVERED rooms as clickable info-boxes, then faded "?" SKELETON boxes for the [REF#UI-00680]
    // remaining slots so the page never reads empty (Mark 2026-06-18). Skeletons reveal nothing.
    _renderRoomsList() {
        const host = document.getElementById('wg-rooms-list');
        if (!host) return;
        // THE SPECIAL ROOMS ARE LISTED FROM THE START (2026-10-01): the cabaret still waits for its first entry, but the four [REF#UI-01480]
        // permit rooms are the floor's to-do list and the game already names them on screen ("STILL DARK: …"), so their
        // slots show their name and status instead of "? ? ?". Off (hidden until found again): window._roomsListSpecial = false.
        const _listed = (id) => this._roomsDiscovered.has(id) || (this.specialRooms[id].special === true && window._roomsListSpecial !== false);
        const ids = Object.keys(this.specialRooms).filter(_listed);
        if (ids.length && (!this._lastRoom || !_listed(this._lastRoom))) this._lastRoom = ids[0];
        const discovered = ids.map(id => {
            const r = this.specialRooms[id];
            const sel = (id === this._lastRoom) ? ' selected' : '';
            return `<button type="button" class="wg-room-box${sel}" data-room="${id}">
                <span class="wg-room-icon">${r.icon || '🚪'}</span>
                <span class="wg-room-meta">
                    <span class="wg-room-name">${this._L(r.name[0], r.name[1])}</span>
                    <span class="wg-room-blurb">${this._roomBlurb(id)}</span>
                </span>
            </button>`;
        }).join('');
        const skel = Math.max(0, (this._roomSlotsTarget || 6) - ids.length);
        const skeleton = Array.from({ length: skel }, () => `
            <div class="wg-room-box wg-room-skeleton" aria-hidden="true">
                <span class="wg-room-icon">?</span>
                <span class="wg-room-meta">
                    <span class="wg-room-name">${this._L('wg.rooms.locked', '? ? ?')}</span>
                    <span class="wg-room-blurb">${this._L('wg.rooms.locked_sub', 'Undiscovered')}</span>
                </span>
            </div>`).join('');
        // ── HER PORTRAIT MOVES TO THE LEFT PAGE WHILE THE ROOM IS SHUT (Mark 2026-08-01: "HAVE THE [REF#UI-00681]
        // EVENT IMAGE (HER LOGO) ON THE LEFT UNDER THE EMPTY SPACE AREA … MAKE IT CINEMATIC AND SAD").
        // The glamour art leaves the crowded right page and hangs under the room list like a photo of
        // better days: desaturated, dimmed, vignetted, fading in slow, with a faint 営業停止 stamp.
        // ⛔ SUPERSEDED IN PART 2026-10-01: the left page held her portrait because it was EMPTY under the room list; the four
        //    special rooms fill that space now, and measured at 1400x860 a five-row list leaves ~17px under it (the portrait sat
        //    below the fold). So with more than three rooms listed she moves to the top of the cabaret's own page, small and grey
        //    — where every special room's picture hangs too (_renderRoomDetail). Three or fewer: she stays here, as before.
        this._roomsListedCount = ids.length;
        const _dormArt = (this._roomDormant === true && this._roomsDiscovered.has('cabaret') && this.specialRooms.cabaret.logo && ids.length <= 3)
            ? `<div class="wg-dorm-art"><img src="${this.specialRooms.cabaret.logo}" alt="" /><div class="wg-dorm-art-cap">営 業 停 止</div></div>`
            : '';
        host.innerHTML = discovered + skeleton + _dormArt;
        host.querySelectorAll('.wg-room-box:not(.wg-room-skeleton)').forEach(b => b.addEventListener('click', () => {
            this._lastRoom = b.dataset.room;
            host.querySelectorAll('.wg-room-box').forEach(x => x.classList.toggle('selected', x === b));
            this._renderRoomDetail(this._lastRoom);
        }));
        this._renderRoomDetail(ids.length ? this._lastRoom : null);
    }

    // Right page: the selected room's detail (logo + title + lore + warning). [REF#UI-00682]
    _renderRoomDetail(roomId) {
        const run = () => this._renderRoomDetailMeasured(roomId);
        return window.parent._measureFrameWork ? window.parent._measureFrameWork('Panels', 'guide.roomDetail', run) : run();
    }
    _renderRoomDetailMeasured(roomId) {
        const host = document.getElementById('wg-room-detail');
        if (!host) return;
        const r = roomId && this.specialRooms[roomId];
        if (!r) { host.innerHTML = `<div class="wg-saves-empty">${this._L('wg.rooms.pick', 'Find the special rooms on your descent — their tales unlock here once you step inside.')}</div>`; return; }
        // DORMANT SWAP (Mark 2026-08-01): while the room is shut by the inspectors the card must not [REF#UI-00683]
        // promise a show. The flag arrives with CABARET_WELCOME (dormant:true) via openRoom's opts and
        // self-corrects on the next entry after activation re-fires the welcome.
        const _dorm = this._roomDormant === true && !r.special;   // the cabaret's shut-room swap — a special room has its own states [REF#UI-01481]
        const _title = (_dorm && r.titleDormant) ? r.titleDormant : r.title;
        const _kanji = (_dorm && r.kanjiDormant) ? r.kanjiDormant : r.kanji;
        const _lore  = (_dorm && r.loreDormant)  ? r.loreDormant  : (r.lore || []);
        const _ok    = (_dorm && r.okDormant)    ? this._L(r.okDormant[0], r.okDormant[1])
                     : r.special ? this._L('wg.rooms.ok.special', 'OK') : this._L('wg.rooms.ok', 'OK — enjoy the show');
        // Dormant = the CINEMATIC SAD layout (Mark 2026-08-01 "ITS TOO JAMMED UP"): the glamour logo [REF#UI-00684]
        // leaves this page entirely (it re-hangs, mourning-treated, on the LEFT page under the room
        // list — see _renderRoomsList) so the notice breathes; wg-dorm-page restyles title/kanji/lore.
        host.classList.toggle('wg-dorm-page', _dorm);
        // A special room's snapshot hangs grey until the room is running — the cabaret's own shut-room treatment. [REF#PENDING] [REF#UI-01482]
        const _st = r.special ? (this._specialRoomsState[roomId] || {}) : null;
        const _shotCls = (_st && _st.active !== true) ? ' wg-room-shot-dark' : '';
        const _dormRight = (_dorm && r.logo && (this._roomsListedCount | 0) > 3)   // her portrait, when the left page is full (see _renderRoomsList) [REF#UI-01483]
            ? `<div class="wg-dorm-art wg-dorm-art-right"><img src="${r.logo}" alt="" /><div class="wg-dorm-art-cap">営 業 停 止</div></div>` : '';
        host.innerHTML = `
            ${_dormRight}
            ${(r.logo && !_dorm) ? `<div class="wg-logo-wrap wg-room-logo-wrap${r.special ? ' wg-room-shot' + _shotCls : ''}"><img class="wg-logo" src="${r.logo}" alt="${r.special ? this._L(r.name[0], r.name[1]) : ''}" /></div>` : ''}
            <h2 class="wg-page-title">${this._L(_title[0], _title[1])}</h2>
            ${_kanji ? `<div class="wg-room-kanji" aria-hidden="true">${_kanji}</div>` : ''}
            <div class="wg-lore">${_lore.map(p => `<p>${this._L(p[0], p[1])}</p>`).join('')}</div>
            ${r.warn ? `<p class="wg-lore-warn">${this._L(r.warn[0], r.warn[1])}</p>` : ''}
            <div class="wg-room-ok-wrap"><button type="button" class="wg-descend-btn wg-room-ok-btn wg-cta-bloom">${_ok}</button></div>`;
        // OK closes the guide and drops the player back into the room to enjoy the show (Mark 2026-06-19). [REF#UI-00685]
        host.querySelector('.wg-room-ok-btn')?.addEventListener('click', () => this.hide({ isFromLoad: true }));
    }

    // ── Chat-input relocation (Mark 2026-06-01) ──────────────────────────── [REF#UI-00686]
    // While the guide is open, the game's main chat command bar (#input-container
    // in NewOrigami.Panels.html — same DOM as the guide) is reparented into the
    // footer center so the player types from the guide. Restored to its original
    // home on hide(). Moving the LIVE node (not a clone) preserves its listeners
    // + the viewport readout.
    _mountChatInput() {
        const ic = document.getElementById('input-container');
        const mount = document.getElementById('wg-footer-input-mount');
        if (!ic || !mount || ic.parentNode === mount) return;
        if (!this._chatInputHome) this._chatInputHome = ic.parentNode;
        mount.appendChild(ic);
        ic.classList.add('wg-chat-relocated');
    }
    _restoreChatInput() {
        const ic = document.getElementById('input-container');
        if (ic && this._chatInputHome && ic.parentNode !== this._chatInputHome) {
            this._chatInputHome.appendChild(ic);
            ic.classList.remove('wg-chat-relocated');
        }
    }

    // ── LOOPING DOT WINDOW (Mark 2026-08-14) ──────────────────────────────────── [REF#UI-00687]
    // Paints the fixed DOT_WINDOW buttons as a window over the navigable range, centred on the
    // current page and WRAPPING at both ends, so a book of any length keeps the same seven dots.
    _renderDots(idx, elOpt) {
        const el = elOpt || document.getElementById(this.containerId);
        if (!el) return;
        const dots = el.querySelectorAll('.wg-dot');
        if (!dots.length) return;
        const last = this._browseMode ? (this.totalSlides - 1) : this.ONBOARD_LAST_SLIDE;
        const n = last + 1;                                  // navigable pages in this mode [REF#UI-00688]
        const win = Math.min(this.DOT_WINDOW, n);            // never show more dots than pages [REF#UI-00689]
        const half = Math.floor(win / 2);
        dots.forEach((d, k) => {
            if (k >= win) { d.style.display = 'none'; d.setAttribute('aria-hidden', 'true'); d.tabIndex = -1; return; }
            const target = ((idx - half + k) % n + n) % n;    // wrap both directions [REF#UI-00690]
            d.style.display = '';
            d.removeAttribute('aria-hidden');
            d.dataset.i = String(target);
            d.classList.toggle('active', target === idx);
            d.setAttribute('aria-selected', target === idx ? 'true' : 'false');
            d.setAttribute('aria-label', this._L('wg.dots.page', 'Page') + ' ' + (target + 1) + ' / ' + n);
            d.tabIndex = target === idx ? 0 : -1;             // roving tabindex, same idiom as the role grid [REF#UI-00691]
        });
    }

    // ── GLOSSARY (WCAG 3.1.3 / 3.1.4 / 3.1.6, 2026-09-12) ────────────────────────────────────────── [REF#UI-01342]
    // Japanese entries: [kanji, kana reading, romaji, meaning key, EN meaning]. lang="ja" on the kanji and kana so a screen
    // reader switches voice (3.1.6 — the reading IS the pronunciation); the romaji is for everyone else.
    // ── 墓場 THE GRAVEYARD — READ ONLY, AND FROM THE SAME COOKIE THE DEFEAT MODAL WRITES (Mark 2026-09-25) ──── [REF#PENDING]
    //    The writer lives in Origami.RealityEngine.Panels.html (setupDefeatFlow). This page must never write: two
    //    writers of one cookie is how a history quietly loses rows, and the modal is the only place that knows a
    //    death just happened. Same reader shape as the writer's, including the localStorage mirror — a browser that
    //    refuses cookies still has a graveyard, and whichever list is LONGER wins so a dropped cookie cannot erase it.
    _graveyardRead() {
        const parse = (raw) => { try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
        let cookie = [], mirror = [];
        try { const m = document.cookie.match(/(?:^|;\s*)origami_graveyard=([^;]*)/); if (m) cookie = parse(decodeURIComponent(m[1])); } catch (_) {}
        try { mirror = parse(localStorage.getItem('origami.v8.graveyard') || '[]'); } catch (_) {}
        return (mirror.length > cookie.length) ? mirror : cookie;
    }
    _graveyardStats() {
        const _t = (k, en) => this._L(k, en);   // the guide's translate is a per-method local, not a module symbol (sibling methods declare it the same way, e.g. ~:1461) [REF#PENDING] [REF#UI-01419]
        const g = this._graveyardRead();
        if (!g.length) return `<p class="wg-gy-empty">${_t('wg.gy.none', 'No graves yet. Every run so far is still walking.')}</p>`;
        const deepest = g.reduce((a, r) => Math.max(a, r.f | 0), 0);
        const bestXp = g.reduce((a, r) => Math.max(a, r.x | 0), 0);
        const kills = g.reduce((a, r) => a + (r.ki | 0), 0);
        const tally = {}; for (const r of g) { const k = String(r.k || 'Unknown'); tally[k] = (tally[k] || 0) + 1; }
        const nemesis = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
        const esc = (x) => String(x == null ? '' : x).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        return `<dl class="wg-gy-stat-dl">
            <dt>${_t('wg.gy.graves', 'Graves')}</dt><dd>${g.length}</dd>
            <dt>${_t('wg.gy.deepest', 'Deepest floor')}</dt><dd>${deepest}</dd>
            <dt>${_t('wg.gy.bestxp', 'Best XP')}</dt><dd>${bestXp}</dd>
            <dt>${_t('wg.gy.kills', 'Kills, all runs')}</dt><dd>${kills}</dd>
            <dt>${_t('wg.gy.nemesis', 'Nemesis')}</dt><dd>${esc(nemesis[0])} <span class="wg-gy-dim">×${nemesis[1]}</span></dd>
        </dl>`;
    }
    _graveyardRows() {
        const _t = (k, en) => this._L(k, en);   // the guide's translate is a per-method local, not a module symbol (sibling methods declare it the same way, e.g. ~:1461) [REF#PENDING] [REF#UI-01420 → see REF#UI-01419]
        const g = this._graveyardRead();
        if (!g.length) return `<p class="wg-gy-empty">${_t('wg.gy.none_roll', 'The roll is empty. Come back when the dungeon has taken something.')}</p>`;
        const esc = (x) => String(x == null ? '' : x).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        const when = (t) => { try { const d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (_) { return ''; } };
        return g.map((r, i) => `<div class="wg-gy-row">
            <span class="wg-gy-n">${i + 1}</span>
            <span class="wg-gy-body"><span class="wg-gy-killer">${esc(r.k || 'Unknown')}</span>
              <span class="wg-gy-meta">${_t('wg.gy.floor', 'Floor')} ${r.f | 0} · Lv ${r.l | 0} · ${r.x | 0} XP · ${r.ki | 0} ${_t('wg.gy.k', 'kills')}${(r.d | 0) ? ' · ' + (r.d | 0) + ' ' + _t('wg.gy.dmg', 'dmg') : ''}</span></span>
            <span class="wg-gy-when">${when(r.t)}</span></div>`).join('');
    }
    _glossaryJa() {
        const _t = (k, en) => this._L(k, en);
        const rows = [
            ['番所', 'ばんしょ', 'banshō', 'guardpost', 'Guard post. The locked room where the stairs down wait. Its ogre sleeps until you walk in.'],
            ['許可証', 'きょかしょう', 'kyokashō', 'permit', 'Permit. The paper the inspector wants before a door opens.'],
            ['業', 'ごう', 'gō', 'karma', 'Karma. Everything you did, added up. The bill comes when you die.'],
            ['鬼婆', 'おにばば', 'Oni-Baba', 'onibaba', 'The mountain hag. The mind of the dungeon — she watches, she remembers.'],
            ['鬼', 'おに', 'oni', 'oni', 'Ogre. The big sleeper who keeps a special room.'],
            ['黄泉', 'よみ', 'Yomi', 'yomi', 'The land of the dead in old Japanese stories.'],
            ['冥界', 'めいかい', 'meikai', 'meikai', 'The underworld. Where this game happens.'],
            ['紙地獄', 'かみじごく', 'kami-jigoku', 'paperhell', 'Paper hell. Everything here is folded paper — even the monsters.'],
            ['折り紙', 'おりがみ', 'origami', 'origami', 'Folded paper. Cut a paper monster along its folds and it falls apart.'],
            ['舞台', 'ぶたい', 'butai', 'stage', 'The stage. <span lang="ja">舞台裏</span> (butai-ura) is backstage.'],
            ['楽屋', 'がくや', 'gakuya', 'dressing', 'Dressing room, behind the stage.'],
            ['支配人室', 'しはいにんしつ', 'shihainin-shitsu', 'office', 'The manager\'s office.'],
            ['倉庫', 'そうこ', 'sōko', 'storage', 'Storage room.'],
            ['工場', 'こうじょう', 'kōjō', 'factory', 'Factory.'],
            ['食堂', 'しょくどう', 'shokudō', 'cafeteria', 'Cafeteria.'],
            ['関係者以外立入禁止', 'かんけいしゃいがいたちいりきんし', 'kankeisha igai tachiiri kinshi', 'staffonly', '"Staff only — no entry." The sign on a locked door.'],
            ['投げ銭', 'なげせん', 'nagesen', 'nagesen', 'Coins thrown to a performer. The tip jar.'],
            ['手札', 'てふだ', 'tefuda', 'hand', 'The cards in your hand.'],
            ['賭場', 'とば', 'toba', 'toba', 'A gambling den.'],
            ['自販機', 'じはんき', 'jihanki', 'vending', 'Vending machine.'],
            ['コンビニ', 'こんびに', 'konbini', 'konbini', 'Convenience store. The little shop by the entrance.'],
            ['扇子', 'せんす', 'sensu', 'fan', 'A folding fan.'],
            ['金欠', 'きんけつ', 'kinketsu', 'broke', 'Broke. Out of money.'],
            ['聖域', 'せいいき', 'seiiki', 'sanctuary', 'Sanctuary. A safe place.'],
            ['祭壇', 'さいだん', 'saidan', 'altar', 'Altar.'],
            ['新月', 'しんげつ', 'shingetsu', 'newmoon', 'New moon. The moon dial shows the phase: 三日月 (mikazuki) crescent, 上弦 (jōgen) first quarter, 満月 (mangetsu) full, 下弦 (kagen) last quarter, 有明月 (ariake-zuki) the dawn moon.'],
        ];
        return rows.map(([k, kana, ro, key, en]) => `<dt><span lang="ja" class="wg-gloss-k">${k}</span> <span lang="ja" class="wg-gloss-read">${kana}</span> <i class="wg-gloss-ro">${ro}</i></dt><dd>${_t('wg.gloss.ja.' + key, en)}</dd>`).join('');
    }
    _glossaryAbbr() {
        const _t = (k, en) => this._L(k, en);
        const rows = [
            ['HP', 'hitpoints', 'Hit points — your health. At zero you die.'],
            ['XP', 'xp', 'Experience points — earned by playing; enough of them raise your rank.'],
            ['AC', 'ac', 'Armour class — how hard you are to hit.'],
            ['ATK / DEF', 'atkdef', 'Attack and defence — how hard you hit and how well you take a hit.'],
            ['MP', 'mp', 'Magic points — what spells cost.'],
            ['SFX', 'sfx', 'Sound effects — the short sounds, not the music.'],
            ['BGM', 'bgm', 'Background music.'],
            ['FPV', 'fpv', 'First-person view — seeing through your own eyes.'],
            ['PiP', 'pip', 'Picture-in-picture — the small round map in the corner.'],
            ['NPC', 'npc', 'Non-player character — anyone in the dungeon who is not you.'],
            ['RNG', 'rng', 'Random number generator — luck, in computer words.'],
            ['T&C', 'tc', 'Terms and conditions — the agreement page. Yes, the jokes are on purpose.'],
            ['WCAG', 'wcag', 'Web Content Accessibility Guidelines — the rules this game follows so everyone can play.'],
        ];
        return rows.map(([k, key, en]) => `<dt><abbr class="wg-gloss-k">${k}</abbr></dt><dd>${_t('wg.gloss.ab.' + key, en)}</dd>`).join('');
    }
    _glossaryGame() {
        const _t = (k, en) => this._L(k, en);
        const rows = [
            ['Wager', 'wager', 'A bet instead of a fight. Win it and the monster may join you.'],
            ['Parley', 'parley', 'Talk instead of fighting.'],
            ['Spare', 'spare', 'Let a beaten monster live.'],
            ['Ante', 'ante', 'The coins you put in before a game starts.'],
            ['Permit', 'permitg', 'A paper an inspector gives you. Doors open for it.'],
            ['Inspector', 'inspector', 'The worker who checks permits.'],
            ['Garrison', 'garrison', 'The guards who live in the guard post.'],
            ['Patrol', 'patrol', 'Guards who walk a route through a wing.'],
            ['Mimic', 'mimic', 'A treasure chest that is really a monster.'],
            ['Origami cut', 'cut', 'Slicing a paper monster along its folds so it falls apart.'],
            ['Turn mode', 'turnmode', 'The world waits for you. Monsters and the clock move only when you do (the P key).'],
            ['Plain language', 'plainlang', 'A switch that swaps long or fancy text for short, simple words.'],
            ['Konbini queue', 'queue', 'The line of workers waiting at the shop.'],
            ['Cabaret', 'cabaret', 'The show room by the entrance, with a stage and a singer.'],
            ['Deck / Hand', 'deckhand', 'Your cards. The hand is what you can play right now.'],
            ['Slots', 'slots', 'The paper slot machine. Karma spins it.'],
        ];
        return rows.map(([k, key, en]) => `<dt><span class="wg-gloss-k">${_t('wg.gloss.gm.' + key + '.k', k)}</span></dt><dd>${_t('wg.gloss.gm.' + key, en)}</dd>`).join('');
    }

    // ── A11Y PREFERENCES (WCAG R5) ────────────────────────────────────────────── [REF#UI-00692]
    // ONE namespace, localStorage-backed: origami.a11y.sfxVol | reducedMotion | relaxTiming.
    // reducedMotion DEFAULTS to the OS media query, so a player who already set it system-wide
    // gets it here for free; ticking the box overrides and persists their explicit choice.
    _a11yPrefs() {
        if (!this.__a11yPrefs) {
            const num = (k, d) => { const v = parseFloat(localStorage.getItem('origami.a11y.' + k)); return isFinite(v) ? v : d; };
            const bool = (k, d) => { const v = localStorage.getItem('origami.a11y.' + k); return v == null ? d : v === '1'; };
            let osRM = false;
            try { osRM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch(_){}
            this.__a11yPrefs = { sfxVol: num('sfxVol', 1), reducedMotion: bool('reducedMotion', osRM), relaxTiming: bool('relaxTiming', false), turnMode: bool('turnMode', false), plainText: bool('plainText', false), readingMode: bool('readingMode', false), singleKeys: bool('singleKeys', true) };   // turnMode: WCAG 2.2.3 (AAA A7, 2026-09-12) — the engine's _setTurnMode reads it; readingMode: WCAG 1.4.8 (2026-09-12) [REF#UI-01338]
            try { this.__a11yPrefs.contrast = localStorage.getItem('origami.a11y.contrast') || 'system'; } catch(_) { this.__a11yPrefs.contrast = 'system'; }   // Colors page (2026-10-02): system | normal | hc [REF#UI-01484]
        }
        return this.__a11yPrefs;
    }
    _setA11yPref(key, val) {
        const p = this._a11yPrefs();
        p[key] = val;
        try { localStorage.setItem('origami.a11y.' + key, typeof val === 'boolean' ? (val ? '1' : '0') : String(val)); } catch(_){}
        this._broadcastA11yPrefs();
    }
    _broadcastA11yPrefs() {
        const p = this._a11yPrefs();
        // To the engine (SFX scalar + motion/timing flags) via the shell relay… [REF#UI-00693]
        try { window.parent.postMessage(Object.assign({ type: 'A11Y_PREFS' }, p), '*'); } catch(_){}
        // …and to this panels document directly: reduced motion becomes a class the CSS can hang [REF#UI-00694]
        // off, relaxTiming a flag the 2s keyboard-selector idle-close reads.
        try {
            window._a11yRelaxTiming = !!p.relaxTiming;
            window._a11yReducedMotion = !!p.reducedMotion;
            document.documentElement.classList.toggle('a11y-reduced-motion', !!p.reducedMotion);
            document.documentElement.classList.toggle('a11y-reading', !!p.readingMode);   // WCAG 1.4.8 (2026-09-12): the guide's prose re-flows for reading [REF#UI-01343]
            window._a11ySingleKeysOff = p.singleKeys === false;   // WCAG 2.1.4 (2026-09-13): read by the capture gate in this frame [REF#UI-01354]
        } catch(_){}
        this._applyContrast();
    }
    // COLORS (2026-10-02): the contrast pref is stamped on this frame's html — data-user-theme carries the CHOICE, .a11y-hc the [REF#UI-01485]
    // EFFECTIVE state: "hc", or "system" while the device asks for more contrast. The Panels stylesheet hangs the skin off .a11y-hc.
    _applyContrast() {
        try {
            const v = this._a11yPrefs().contrast || 'system';
            let osMore = false;
            try { osMore = !!(window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches); } catch(_){}
            const on = v === 'hc' || (v === 'system' && osMore);
            document.documentElement.setAttribute('data-user-theme', v);
            document.documentElement.classList.toggle('a11y-hc', on);
            window._a11yHighContrast = on;
            if (!this._hcMql && window.matchMedia) {
                this._hcMql = window.matchMedia('(prefers-contrast: more)');
                try { this._hcMql.addEventListener('change', () => this._applyContrast()); } catch(_){}
            }
        } catch(_){}
    }

    // ── WORLD page (WCAG P4) ──────────────────────────────────────────────────── [REF#UI-00695]
    _queryWorld() {
        // Ask the engine registry for the whole floor; the reply (A11Y_RESULT reqId 'wg-world') [REF#UI-00696]
        // lands in the constructor's message listener and re-renders. Lazy — only ever fires on
        // user intent (tab arrival / refresh), mirroring the registry's own design.
        try { window.parent.postMessage({ type: 'A11Y_QUERY', source: 'panels', reqId: 'wg-world', q: { scope: 'floor' } }, '*'); } catch(_){}
    }
    _renderWorld() {
        const root = document.getElementById('welcome-guide-overlay'); if (!root) return;
        const roomsEl = root.querySelector('#wg-world-rooms');
        const objsEl  = root.querySelector('#wg-world-objects');
        const titleEl = root.querySelector('#wg-world-room-title');
        if (!roomsEl || !objsEl) return;
        const _t = (k, en) => this._L(k, en);
        const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
        const d = this._worldData;
        if (!d || !Array.isArray(d.records)) { roomsEl.innerHTML = `<p class="wg-world-empty">${_t('wg.world.loading', 'Reading the floor…')}</p>`; return; }
        const isJa = (window.currentLang || localStorage.getItem('origami_lang') || 'en') === 'ja';
        const name = (r) => esc((isJa && r.nameJa) ? r.nameJa : r.nameEn);
        const rooms = d.records.filter(r => r.type === 'room');
        const things = d.records.filter(r => r.type !== 'room');
        const hereId = d.playerRoom && d.playerRoom.roomId;
        if (this._worldSelectedRoom == null) this._worldSelectedRoom = (typeof hereId === 'number' && hereId >= 0) ? hereId : (rooms[0] && rooms[0].roomId);
        // LEFT: rooms, current room first, each with its object count [REF#UI-00697]
        const sorted = rooms.slice().sort((a, b) => (a.roomId === hereId ? -1 : b.roomId === hereId ? 1 : a.dist - b.dist));
        // ── ACCORDION: YOUR AREA IS OPEN, THE REST OF THE FLOOR IS ONE FOLDED HEADER ────────────── [REF#UI-01313]
        //   A floor is 27 rooms here. Rendered flat, a screen reader walks all 27 before reaching
        //   anything actionable, and it does that again in every room — the list repeats endlessly
        //   for the one player who can least afford it. So only the CURRENT area is listed by
        //   default; everything else folds behind a single control that states its own count.
        //   Collapsed rooms are NOT RENDERED AT ALL rather than hidden with CSS: a reader cannot
        //   walk what does not exist in the DOM, and that is the whole point of folding them.
        //   The fold is reversible — exploring the floor by reading stays possible, it is just no
        //   longer the default cost of opening the page.
        const showOther = this._worldShowOther === true;
        const here = sorted.filter(r => r.roomId === hereId);
        const away = sorted.filter(r => r.roomId !== hereId);
        const visibleRooms = showOther ? sorted : (here.length ? here : sorted.slice(0, 1));
        const otherToggle = away.length
            ? `<button type="button" id="wg-world-other" class="wg-restore-btn wg-world-other" aria-expanded="${showOther}">`
              + (showOther ? '▾ ' : '▸ ') + _t('wg.world.other_areas', 'Other areas')
              + ` <span class="wg-world-count">(${away.length})</span></button>`
            : '';
        roomsEl.innerHTML = visibleRooms.map(r => {
            const n = things.filter(t => t.roomId === r.roomId).length;
            const here = r.roomId === hereId ? ` — ${_t('wg.world.here', 'you are here')}` : '';
            const sel = r.roomId === this._worldSelectedRoom;
            return `<button type="button" class="wg-restore-btn wg-world-room${sel ? ' wg-world-sel' : ''}" data-world-room="${r.roomId}" aria-pressed="${sel}">${name(r)}${here} <span class="wg-world-count">(${n})</span></button>`;
        }).join('') + otherToggle || `<p class="wg-world-empty">${_t('wg.world.none', 'Nothing found — try Refresh.')}</p>`;
        // RIGHT: the selected room's objects with action buttons [REF#UI-00698]
        const sel = rooms.find(r => r.roomId === this._worldSelectedRoom);
        if (titleEl) titleEl.textContent = sel ? ((isJa && sel.nameJa) ? sel.nameJa : sel.nameEn) : _t('wg.world.pick', 'Pick a room');
        // The room's DESCRIPTION in words (Mark 2026-09-12 "hear the room description"): the registry carries objects, not prose — [REF#UI-01344]
        // the prose lives in the engine's ROOM_UPDATE, which Panels caches as window._lastRoomCard when it paints the HUD card.
        // Shown for the room the player is standing in; another room's prose is not known until they walk into it, and the
        // page says so rather than pretending.
        try {
            const dEl = document.getElementById('wg-world-desc');
            if (dEl) {
                const rc = window._lastRoomCard;
                const hereSel = sel && rc && (rc.roomId | 0) === (sel.roomId | 0);
                const prose = hereSel ? ((isJa ? (rc.descriptionJa || rc.description) : (rc.description || rc.descriptionJa)) || '') : '';
                dEl.textContent = sel ? (prose || _t('wg.world.desc_unknown', 'You will hear what this room looks like when you walk into it.')) : '';
                dEl.hidden = !sel;
            }
        } catch (_) {}
        const inRoom = things.filter(t => t.roomId === this._worldSelectedRoom).sort((a, b) => a.dist - b.dist);
        // Verb → button label. GO/WALK use the object's own name as the target so the engine [REF#UI-00699]
        // resolves the exact record the player is looking at.
        const VERB = {
            LOOK: ['🔍', _t('wg.world.v.look', 'Look')], WALK_TO: ['🚶', _t('wg.world.v.walk', 'Walk to')],
            PICK_UP: ['🫳', _t('wg.world.v.pickup', 'Pick up')], SMASH: ['💥', _t('wg.world.v.smash', 'Smash')],
            SLEEP: ['💤', _t('wg.world.v.sleep', 'Sleep')], USE: ['⚙️', _t('wg.world.v.use', 'Use')],
            TALK: ['🗣️', _t('wg.world.v.talk', 'Talk')], GAMBLE: ['🎲', _t('wg.world.v.gamble', 'Gamble')],
            SPARE: ['🕊️', _t('wg.world.v.spare', 'Spare')], PARLEY: ['🤝', _t('wg.world.v.parley', 'Parley')],
            ATTACK: ['⚔️', _t('wg.world.v.attack', 'Attack')], GO_TO_ROOM: ['🚶', _t('wg.world.v.go', 'Go')],
        };
        // ── VERBS THAT CANNOT ACT HERE ARE SHOWN AS UNAVAILABLE, NOT HIDDEN ───────────────────── [REF#UI-01314]
        //   ⛔ SUPERSEDED 2026-09-04: an earlier build DIMMED these instead of removing them, on the
        //     theory that a visible-but-inert verb teaches the verb space. The ruling reversed it —
        //     a screen reader would still meet the whole verb list in every room, and the sighted
        //     benefit did not outweigh that. Unusable verbs are now REMOVED FROM THE DOM: gone from
        //     the page and gone from the accessibility tree, one behaviour for both audiences.
        //     Rationale + the superseded reasoning: knowledge/design/WORLDPAGE_ANSWERS_INLINE_2026-09-04.md
        //   ⚠ THE AXIS IS THE ROOM, NOT THE DISTANCE, AND THAT IS A MEASURED CHOICE. The engine's
        //     PICK_UP / SMASH / USE / BUY / SIT / OPEN all WALK the player to the target and act on
        //     arrival (Engine9 ~:82176-82192) — "🚶 Walking to pick up X — it joins your hand when you
        //     reach it". So a distance rule would grey out buttons that genuinely work. What is not
        //     usable is a contact verb aimed into a room the player is not standing in.
        //   LOOK and WALK_TO stay live everywhere (ALWAYS_LIVE below): orienting and travelling are
        //     how a blind player reaches everything else, so dimming those would strand them.
        //   Recomputed every render, so a verb lights up the moment its room becomes the current one.
        const ALWAYS_LIVE = { LOOK: 1, READ: 1, WALK_TO: 1, WALK: 1, GO_TO_ROOM: 1 };
        objsEl.innerHTML = inRoom.map(o => {
            const st = o.state ? ` <span class="wg-world-state">${esc(o.state)}</span>` : '';
            const inHere = (typeof hereId === 'number') && o.roomId === hereId;
            const btns = (o.actions || []).filter(a => VERB[a]).map(a => {
                // WALK_TO on non-monsters rides the generic WALK re-entry the executor added in P3. [REF#UI-00700]
                const cmd = (a === 'WALK_TO' && o.type !== 'monster') ? 'WALK' : a;
                const live = !!ALWAYS_LIVE[a] || inHere;
                if (!live) return '';   // ⛔ HIDDEN, not dimmed — see the note above this block [REF#UI-01315]
                // aria-label = verb + object (Mark 2026-09-12 "kids with screen readers … interact directly with objects"): the visible [REF#UI-01345]
                // face stays "🔍 Look", but a reader tabbing the list hears "Look — Magic Lantern", never "Look button, Look button…".
                return `<button type="button" class="wg-world-act" data-world-cmd="${cmd}" data-world-target="${esc(o.nameEn)}" aria-label="${VERB[a][1]} — ${esc(name(o))}">${VERB[a][0]} ${VERB[a][1]}</button>`;
            }).join('');
            return `<div class="wg-world-obj"><span class="wg-world-name">${name(o)}</span> <span class="wg-world-type">${esc(o.type)}, ${o.dist}${_t('wg.world.tiles', ' tiles')}</span>${st}<div class="wg-world-acts">${btns}</div></div>`;
        }).join('') || `<p class="wg-world-empty">${_t('wg.world.empty_room', 'Nothing notable in this room right now.')}</p>`;
    }
    /** Paint the World page's own answer slot. `pending` renders the waiting state. [REF#UI-01310] */
    _renderWorldReply(html, pending) {
        try {
            const el = document.querySelector('#wg-world-reply');   // no shadow DOM here — the overlay is a plain #welcome-guide-overlay element [REF#UI-01316]
            if (!el) return;
            el.hidden = false;
            el.className = 'wg-world-reply' + (pending ? ' wg-world-reply-pending' : '');
            el.innerHTML = html;   // engine copy is already the sanitised <b>-only string the log renders [REF#UI-01317]
        } catch (_) {}
    }
    setSlide(idx) {
        idx = Math.max(0, Math.min(this.totalSlides - 1, idx | 0));
        if (idx === this.WORLD_SLIDE) this._queryWorld();   // P4: fresh registry data on every arrival (lazy, user-initiated) [REF#UI-00701]
        const prev = this.currentSlide;
        // Direction defaults to forward for first activation + same-slide [REF#UI-00702]
        // taps (no animation flip needed) — only flip when actually moving.
        const direction = (idx > prev) ? 'forward' : (idx < prev) ? 'back' : null;
        this.currentSlide = idx;
        const el = document.getElementById(this.containerId);
        if (!el) return;
        el.querySelectorAll('.wg-slide').forEach(s => {
            const isActive = String(s.dataset.slide) === String(idx);
            s.classList.toggle('active', isActive);
            // Page-turn animation — strip any prior direction class then [REF#UI-00703]
            // tag the newly-active slide with the current direction so its
            // @keyframes fires. Force-reflow trick keeps successive clicks
            // re-triggering the animation.
            s.classList.remove('wg-enter-forward', 'wg-enter-back');
            if (isActive && direction) {
                void s.offsetWidth;
                const dirClass = direction === 'forward' ? 'wg-enter-forward' : 'wg-enter-back';
                s.classList.add(dirClass);
                // Strip the class once the animation finishes so the [REF#UI-00704]
                // resting layout has no lingering transform. (Validator
                // measures the resting state, and CSS transforms skew
                // getBoundingClientRect mid-animation.)
                const onEnd = (ev) => {
                    if (ev.currentTarget !== s) return;
                    s.classList.remove(dirClass);
                    s.removeEventListener('animationend', onEnd);
                };
                s.addEventListener('animationend', onEnd);
            }
        });
        this._renderDots(idx, el);
        // Highlight the active section tab, and PROGRESSIVE-DISCLOSURE: a tab is hidden until its section has been [REF#UI-00705]
        // opened at least once, then it stays visible forever (Mark 2026-06-21: "don't clutter unless the player has
        // used it"). Opening a section (e.g. the cabaret ROOMS page) unlocks its tab here + persists it.
        el.querySelectorAll('.wg-tab').forEach(t => {
            const ts = parseInt(t.dataset.tabSlide, 10);
            // Arriving at a section unlocks its tab — EXCEPT WAGER, which a gambling monster's auto-invite (WAGER_INVITE [REF#UI-00706]
            // → openWager) opens without the player choosing. WAGER unlocks only on a deliberate PLAY (openWagerGame /
            // slot play), wired below (Mark 2026-06-22: "Wager shows up when player decides to play").
            if (ts === idx && idx !== this.WAGER_SLIDE) this._unlockTab(idx);
            t.style.display = (this._devMode || this._unlockedTabs.has(ts)) ? '' : 'none';   // DEV MODE (Mark 2026-07-02): Settings reveals ALL tabs incl. the Monster hub [REF#UI-00707]
            t.classList.toggle('active', ts === idx);
            t.setAttribute('aria-selected', ts === idx ? 'true' : 'false');
        });
        // HIDE ORPHANED GROUP DIVIDERS (Mark 2026-08-08, screenshot: "fix the tab - it looks ugly" — a [REF#UI-00708]
        // bare sliver of vertical lines sitting beside the lone INTRO pill on a fresh guide). The two
        // `.wg-tab-divider` elements are fixed markup separating three named tab groups, but progressive
        // disclosure above can hide every tab in a group — on first visit only INTRO is unlocked, so
        // both dividers render back-to-back with nothing on either side to actually divide. A divider
        // only earns its keep when a visible tab sits in BOTH of its immediately adjacent groups
        // (bounded by the next divider each way, not just "anywhere in the bar", so a divider isn't
        // wrongly shown by a visible tab two groups over).
        const _tabBarNodes = Array.from(el.querySelectorAll('.wg-tabs > *'));
        const _dividerIdx = _tabBarNodes.reduce((acc, n, i) => { if (n.classList.contains('wg-tab-divider')) acc.push(i); return acc; }, []);
        _dividerIdx.forEach((di, k) => {
            const _from = k === 0 ? 0 : _dividerIdx[k - 1] + 1;
            const _to = k === _dividerIdx.length - 1 ? _tabBarNodes.length : _dividerIdx[k + 1];
            const _before = _tabBarNodes.slice(_from, di).some(n => n.classList.contains('wg-tab') && n.style.display !== 'none');
            const _after = _tabBarNodes.slice(di + 1, _to).some(n => n.classList.contains('wg-tab') && n.style.display !== 'none');
            _tabBarNodes[di].style.display = (_before && _after) ? '' : 'none';
        });
        // ── Role spread (1): mount the procedural 3D role artifacts; tear them down [REF#UI-00709]
        //    when leaving (hide() also tears down on close — Mark: off when guide closed).
        // THE MUSIC PAGE IS A PAGE OF THIS BOOK (2026-10-02): arriving at its spread mounts the player over both pages, leaving puts
        // it away (the engine stops sampling the visualiser; the music itself plays on). Off: window._musicInGuide = false.
        try {
            if (typeof window.openMusicPage === 'function' && window._musicInGuide !== false) {
                if (idx === this.MUSIC_SETTINGS_SLIDE) { const _ms = el.querySelector('.wg-slide[data-slide="' + idx + '"]'); if (_ms) window.openMusicPage('guide', _ms); }
                else if (prev === this.MUSIC_SETTINGS_SLIDE) window.openMusicPage('guide-hide');
            }
        } catch(_){}
        if (idx === 1) this._mountRoleIcons(); else this._teardownRoleIcons();
        // ── DB spreads: populate + mount/teardown the live preview ── [REF#UI-00710]
        // Spread 3 = Monster DB (page 7-8), Spread 4 = Avatar DB (page 9-10).
        // Render the lists on first arrival and (re)select so the right page
        // + 3D preview are populated. Leaving both DB spreads pauses the RAF
        // loop (renderStress protection — the loop itself also self-gates on
        // currentSlide < SETUP_SLIDE, but pausing here is belt-and-braces).
        if (idx === 3) {
            this._renderMonsterList();
            this._selectMonster(this._selectedMonsterKey);
        } else if (idx === 4) {
            this._selectAvatar(this._selectedAvatarId);
        } else if (idx === 5) {
            // Character sheet — live avatar preview + stat block read from [REF#UI-00711]
            // the action-rail HUD DOM.
            this._mountCharacterPreview();
            this._renderCharacterSheet();
        } else if (idx === 6) {
            // Equipment — paint the 8 slots + the draggable item list. [REF#UI-00712]
            this._renderEquipment();   // mounts the figure too (2026-09-20) — the old raf cancel here killed it on arrival [REF#UI-01375]
        } else if (idx === this.SLOTS_SLIDE) {
            // Origami Slots — live 3D slot machine in the right page (Mark 2026-06-16). [REF#UI-00713]
            this._unlockTab(this.WAGER_SLIDE);   // playing a slot = deciding to gamble → unlock WAGER too (Mark 2026-06-22) [REF#UI-00714]
            this._mountSlotPreview();
        } else if (idx === this.ROOMS_SLIDE) {
            // ROOMS — discovered-rooms list (left) + selected room detail (right). Mark 2026-06-18. [REF#UI-00715]
            this._renderRoomsList();
        } else if (idx === this.WAGER_SLIDE) {
            // WAGER (Spread A) — stake (left) + 3×3 grid of learned games (right). Mark 2026-06-19. [REF#UI-00716]
            this._renderWagerGrid();
            this._wireStakeStepper();   // +/- stake control (Mark 2026-06-24) [REF#UI-00717]
        } else if (idx === this.WAGER_GAME_SLIDE) {
            // WAGER game (Spread B) — game + instructions (left) + live 3D felt table (right). [REF#UI-00718]
            this._renderWagerGameInfo(this._wagerSelected);
            const _selG = this.wagerGames[this._wagerSelected];
            if (!(_selG && _selG.interactive === 'solitaire')) this._mountWagerPreview();   // solitaire = its own iframe; no 3D felt [REF#UI-00719]
            this._wireWagerControls();
        } else {
            // Not on a live-3D spread — stop spinning the preview to free the GPU. [REF#UI-00720]
            if (this._pv && this._pv.raf) { cancelAnimationFrame(this._pv.raf); this._pv.raf = 0; }
        }
        // Dedicated wager renderer lives only on the game-table spread — tear it down on leave. [REF#UI-00721]
        // Also drop the Solitaire stage + reset the maximize ladder so the modal never stays grown elsewhere.
        if (idx !== this.WAGER_GAME_SLIDE) {
            try { this._teardownWagerPreview(); } catch(_){}
            try { this._setSoliMax(0); this._hideSolitaireStage(); } catch(_){}
        }
        this._updatePlayBtn();
        // Focus the page's primary CTA (Mark 2026-07-02: "make sure focus will be on the CTA OK — enjoy the [REF#UI-00722]
        // show") so ENTER activates it and it reads as the highlighted default. Deferred a frame so the freshly
        // activated slide is laid out. Only the STRONG CTAs (Play / OK / descend) grab focus — see _focusPrimaryCTA.
        try { requestAnimationFrame(() => { const _g = document.getElementById(this.containerId); if (_g && _g.classList.contains('is-open')) this._focusPrimaryCTA(); }); } catch(_){}
    }

    nextSlide() {
        // Onboarding (NOT browse): the roles spread is the last onboarding page — NEXT there [REF#UI-00723]
        // closes the guide instead of paging on into the 12-spread reference book (Mark 2026-06-23).
        if (!this._browseMode && this.currentSlide >= this.ONBOARD_LAST_SLIDE) { this.hide({ isFromLoad: false }); return; }
        this.setSlide(this.currentSlide + 1);
    }
    prevSlide() { this.setSlide(this.currentSlide - 1); }

    // ── GUIDEBOOK KEYBOARD NAV helpers (Mark 2026-07-02) ────────────────────────────────────────────── [REF#UI-00724]
    // ENTER activates the current page's primary CTA. Broad list so ENTER always progresses:
    // Play → OK ("enjoy the show") / descend → role-cta → the footer Next.
    _activatePrimaryCTA() {
        const el = document.getElementById(this.containerId); if (!el) return;
        const active = el.querySelector('.wg-slide.active') || el;
        const _vis = (b) => b && !b.disabled && b.offsetParent !== null;
        for (const s of ['.wg-play-cta', '.wg-room-ok-btn', '.wg-descend-btn', '.wg-role-cta']) {
            const b = active.querySelector(s); if (_vis(b)) { try { b.focus(); } catch(_){} b.click(); return; }
        }
        const next = el.querySelector('.wg-next'); if (_vis(next)) { try { next.focus(); } catch(_){} next.click(); }
    }
    // Auto-focus only the STRONG CTA (Play / OK / descend) on slide render so the "enjoy the show" OK is the [REF#UI-00725]
    // highlighted default — pages that need a prior choice (e.g. role select) are left alone.
    _focusPrimaryCTA() {
        const el = document.getElementById(this.containerId); if (!el) return;
        const active = el.querySelector('.wg-slide.active') || el;
        const _vis = (b) => b && !b.disabled && b.offsetParent !== null;
        for (const s of ['.wg-play-cta', '.wg-room-ok-btn', '.wg-descend-btn', '#wg-wager-deal', '.wg-wager-tile[data-game]']) {
            const b = active.querySelector(s); if (_vis(b)) { try { b.focus({ preventScroll: true }); } catch(_){ try { b.focus(); } catch(__){} } return; }
        }
    }
    // Tab cycles the UNLOCKED section tabs only — hidden/locked tabs stay hidden (progressive disclosure via [REF#UI-00726]
    // _unlockedTabs), so Tab never jumps to a section the game hasn't revealed yet (Mark 2026-07-02).
    _cycleTab(dir) {
        const el = document.getElementById(this.containerId); if (!el) return;
        const tabs = Array.from(el.querySelectorAll('.wg-tab'))
            .map(t => parseInt(t.dataset.tabSlide, 10))
            .filter(s => !isNaN(s) && this._unlockedTabs.has(s));
        if (tabs.length < 2) return;
        const cur = tabs.indexOf(this.currentSlide);
        if (cur === -1) { this.setSlide(dir > 0 ? tabs[0] : tabs[tabs.length - 1]); return; }
        this.setSlide(tabs[(cur + dir + tabs.length) % tabs.length]);
    }

    _expandInlineTC() {
        const rootEl = document.getElementById(this.containerId);
        const sec = rootEl ? rootEl.querySelector('#wg-tc-inline') : null;
        if (!sec) return;
        const page = sec.closest('.wg-page');
        if (page) {
            const lore = page.querySelector('.wg-lore');
            const actions = page.querySelector('.wg-actions');
            if (lore) lore.style.display = 'none';
            if (actions) actions.style.display = 'none';
        }
        sec.hidden = false;
        requestAnimationFrame(() => {
            const body = sec.querySelector('.wg-tc-body');
            if (body) {
                body.scrollTop = 0;
                body.focus?.();
            }
        });
    }

    /** [REF#UI-00727]
     * KEYBOARD ROLE PICKER — the ARIA radiogroup pattern, across two pages (Mark 2026-07-26).
     *
     * The six roles read as one roster laid out 2 columns x 3 rows: cards 0-2 on the LEFT page, 3-5 on the
     * RIGHT. So ↑/↓ walk the column you are in and ←/→ hop columns on the same row, which is what the eye
     * expects from the spread. Home/End jump to the ends of the roster.
     *
     * ROVING TABINDEX (SC 2.1.1 + the radiogroup pattern): exactly ONE card is tabbable at a time, so Tab
     * enters the group once and lands on the current choice instead of walking six separate stops. Focus and
     * selection move together — that is selection-follows-focus, correct for a radiogroup, and it is also what
     * "arrow key … starts selector" asks for: the first arrow press both focuses AND picks.
     *
     * Returns TRUE when it consumed the key, so the caller knows not to also turn the page.
     */
    _roleKeyNav(e) {
        try {
            const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ', 'Spacebar'];
            if (KEYS.indexOf(e.key) < 0) return false;
            const g = document.getElementById(this.containerId);
            if (!g) return false;
            const slide = g.querySelector('.wg-slide.active');
            if (!slide) return false;
            const cards = Array.from(slide.querySelectorAll('.wg-role-card'))
                .filter(c => c.offsetParent !== null);          // only what is actually on screen [REF#UI-00728]
            if (cards.length < 2) return false;                 // not the role slide [REF#UI-00729]
            const ROWS = Math.ceil(cards.length / 2);           // 3 rows x 2 columns for the standard six [REF#UI-00730]

            // Where are we? The focused card, else the checked one, else the first — so the very first arrow [REF#UI-00731]
            // press "starts the selector" on a sensible card rather than doing nothing.
            let i = cards.indexOf(document.activeElement);
            if (i < 0) i = cards.findIndex(c => c.getAttribute('aria-checked') === 'true');
            const fresh = i < 0;
            if (i < 0) i = 0;

            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                // Only claim Enter/Space when a card actually has focus — otherwise the page CTA must keep it. [REF#UI-00732]
                if (cards.indexOf(document.activeElement) < 0) return false;
                // WCAG 2.2 AA / SC 2.1.1 (Mark 2026-08-09: "if there is a role selected, hitting the [REF#UI-00733]
                // ENTER key = OK"). "Selection follows focus" (_focusRole calls selectRole on every
                // arrow move), so the instant a card has focus a role is USUALLY already selected —
                // and ENTER here used to just re-run _focusRole on the SAME card: a no-op re-select
                // that swallowed the keystroke (this fn returns true, so the page-CTA handler at the
                // Enter check below it never runs). A keyboard-only player had no way to confirm
                // without an extra, non-obvious Tab off the card first. Space is UNCHANGED — it keeps
                // meaning "activate/select this control", standard listbox semantics; only Enter also
                // means "confirm" once a role is already chosen.
                if (e.key === 'Enter' && window.selectedRole) {
                    e.preventDefault(); e.stopPropagation();
                    this._activatePrimaryCTA();
                    return true;
                }
                e.preventDefault(); e.stopPropagation();
                this._focusRole(cards, i);
                return true;
            }

            e.preventDefault(); e.stopPropagation();
            if (!fresh) {
                const col = Math.floor(i / ROWS), row = i % ROWS;
                if (e.key === 'ArrowUp')    i = col * ROWS + (row - 1 + ROWS) % ROWS;
                else if (e.key === 'ArrowDown')  i = col * ROWS + (row + 1) % ROWS;
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    const other = (col === 0 ? 1 : 0) * ROWS + row;
                    if (other < cards.length) i = other;        // odd rosters: stay put rather than fall off [REF#UI-00734]
                }
                else if (e.key === 'Home') i = 0;
                else if (e.key === 'End')  i = cards.length - 1;
            }
            this._focusRole(cards, i);
            return true;
        } catch (_) { return false; }
    }

    /** Move the roving tabindex + focus to card i and pick it (selection follows focus). [REF#UI-00735] */
    _focusRole(cards, i) {
        try {
            cards.forEach((c, n) => c.setAttribute('tabindex', n === i ? '0' : '-1'));
            const card = cards[i];
            if (!card) return;
            card.focus({ preventScroll: true });
            if (card.dataset && card.dataset.roleId) this.selectRole(card.dataset.roleId);
        } catch (_) {}
    }

    selectRole(roleId) {
        // Keep the roving tabindex on whatever was just chosen, however it was chosen — otherwise a mouse pick [REF#UI-00736]
        // leaves Tab landing back on card 1 and the keyboard and pointer disagree about "where you are".
        try {
            const _g = document.getElementById(this.containerId);
            if (_g) _g.querySelectorAll('.wg-role-card').forEach(c => {
                c.setAttribute('tabindex', c.dataset.roleId === roleId ? '0' : '-1');
            });
        } catch (_) {}
        this._selectedRole = roleId;
        window.selectedRole = roleId;
        const el = document.getElementById(this.containerId);
        if (el) {
            el.querySelectorAll('.wg-role-card').forEach(card => {
                card.classList.toggle('selected-role', card.dataset.roleId === roleId);
                card.setAttribute('aria-checked', card.dataset.roleId === roleId ? 'true' : 'false');
            });
            this._renderRoleProfile(roleId);
        }
        // Delegate to the panels' canonical selectRole — that's the [REF#UI-00737]
        // function that rolls weapons, applies inventory, and (after fix
        // below) sets STR/DEX/CON/INT/WIS/CHA per role. Without this,
        // role selection looked good visually but never propagated to
        // player state. (User report 2026-05-25.)
        if (typeof window.selectRole === 'function' && window.selectRole !== this.selectRole) {
            try { window.selectRole(roleId); } catch (e) { console.warn('[PlayerGuide] window.selectRole failed', e); }
        }
        // Apply per-role stats too — central table lives on window so the [REF#UI-00738]
        // engine + save system can read it later.
        if (typeof window.applyRoleStats === 'function') {
            try { window.applyRoleStats(roleId); } catch (e) { console.warn('[PlayerGuide] applyRoleStats failed', e); }
        }
        this._updatePlayBtn();
    }

    acceptTC(checked) {
        const wasAccepted = window._tcAccepted === true;
        window._tcAccepted = !!checked;
        // +1 Karma the FIRST time a player actually agrees (Mark 2026-09-19: "+1 Karma if player clicked [REF#PENDING] [REF#UI-01362]
        // agree to terms :)"). Fires on the false→true transition only, and localStorage-latches so re-opening
        // the guide, or un-checking/re-checking within a session, cannot farm it — same shape as the engine's
        // own once-per-monster de-dup for SELF_DEFENSE_CREDIT (js/v8/OniBaba8.js _onSelfDefenseCredit). This
        // frame is the PANELS iframe; window.parent is the shell, where OniBaba8.js listens directly
        // (js/v8/OniBaba8.js:352) regardless of the giant relay switch in NewOrigami.9.html.
        if (checked && !wasAccepted) {
            try {
                // ⛔ SUPERSEDED 2026-09-20 by Mark ("+1 karma selecting I agree to terms", re-issued): the 09-19 latch was [REF#PENDING] [REF#UI-01376]
                // localStorage '1' — ONCE PER BROWSER, FOREVER, so only the very first run on a machine ever saw the +1 and
                // every later New Game got nothing (karma starts fresh per run; a permanent latch can't be right). Latched
                // to the RUN instead: keyed on the root seed, so a New Game (fresh seed) awards again, while un-checking /
                // re-checking, reopening the guide, and RETRY (same seed) still cannot farm it.
                // ⛔ SUPERSEDED 2026-09-20 by Mark ("i clicked terms and agreeements and it didnt do +1 karma"): the seed latch
                // above. OniBaba8 karma is NOT persisted — it is 0 on every page load — so a latch that outlives the page
                // (localStorage, keyed on a seed that survives reload/retry) paid once per seed and then never again while
                // karma kept resetting. The latch now lives exactly as long as the karma does: this page load.
                if (!window._tcKarmaAwarded) {
                    window._tcKarmaAwarded = true;
                    try { localStorage.removeItem('origami.tcKarmaAwarded'); } catch (_) {}
                    window.parent.postMessage({ type: 'TC_AGREED' }, '*');
                }
            } catch (_) {}
        }
        this._updatePlayBtn();
    }




    // ──────────────────────────────────────────────────────────────── [REF#UI-00739]
    // Internal helpers
    // ────────────────────────────────────────────────────────────────
    _updatePlayBtn() {
        const el = document.getElementById(this.containerId);
        if (!el) return;
        const prev = el.querySelector('.wg-prev');
        const next = el.querySelector('.wg-next');
        // Pagination dots: hidden on load, revealed once assets finish loading (Mark 2026-06-09). [REF#UI-00740]
        const dots = el.querySelector('.wg-dots');
        if (dots) {
            dots.hidden = !this.loadingCompleted;
            // Onboarding shows ONLY the intro + roles dots (4 pages); browse mode (LOG) shows [REF#UI-00741]
            // the whole 12-spread book. Hiding the out-of-range dots also kills the dot-click
            // leak that let onboarding jump into the reference spreads (Mark 2026-06-23).
            // Range is enforced inside _renderDots (the window only ever addresses navigable
            // pages), so onboarding still cannot dot-jump into the reference spreads.
            this._renderDots(this.currentSlide, el);
        }
        if (prev) prev.hidden = this.currentSlide === 0 || !this.loadingCompleted;
        // NEXT is the launch/navigation CTA. Modes by spread (7 total): [REF#UI-00742]
        //   0 COVER:           "Next →"      (mild cyan when T&C ticked; no bloom).
        //   1 ROLE:            "PLAY NOW! ⚡" (bloom when role picked → launch).
        //   2 SAVES:           "PLAY NOW! ⚡" (always bloom; click → launch).
        //   3 MONSTER DB:      "Next →"      (plain nav → Avatar DB; no bloom).
        //   4 AVATAR DB:       "Next →"      (plain nav → Character sheet; no bloom).
        //   5 CHARACTER SHEET: "Next →"      (plain nav → Equipment; no bloom).
        //   6 EQUIPMENT:       hidden        (last spread, nowhere forward).
        // The SETUP spreads (3-6) are a setup surface, NOT a launch gate —
        // they must never bloom, or the .wg-next click handler would launch
        // the game from inside a DB / character / equipment screen.
        if (next) {
            let nextOk = false;
            let bloom  = false;
            let hint   = 'Next page';
            let label  = this._L('wg.nav.next', 'Next &rarr;');
            next.hidden = false;
            if (!this.loadingCompleted) {
                nextOk = false;
                hint = 'Dungeon is pre-rendering, please wait...';
            } else if (this.currentSlide === 0) {
                // 2026-06-09 (Mark): the guide doubles as the in-game reference (LOG button) [REF#UI-00743]
                // — don't block page navigation on re-accepting the Terms. Next always advances.
                nextOk = true;
                hint = this._L('wg.hint.continue_role', 'Continue to role select');
            } else if (this.currentSlide === 1) {
                // ROLES = the last onboarding page. NEXT is disabled until a role is chosen; [REF#UI-00744]
                // choosing one flips it to a bloomed OK confirm whose click closes the guide and
                // launches (via nextSlide()/bloom→hide). Mark 2026-06-23: "OK button change when
                // role is selected." Until then the label reads as a prompt, not a stray "Next".
                nextOk = !!window.selectedRole;
                bloom  = nextOk;
                hint = nextOk ? this._L('wg.hint.enter_underworld', 'Click to enter the underworld') : this._L('wg.hint.choose_role', 'Choose a role to continue');
                label = nextOk
                    ? '<i class="fa-solid fa-gamepad" aria-hidden="true"></i> ' + this._L('wg.nav.ok_play', 'OK &mdash; PLAY NOW!')
                    : this._L('wg.nav.choose_role', 'Choose a role');
            } else if (this.currentSlide === 2) {
                nextOk = true;
                bloom  = true;
                hint = this._L('wg.hint.enter_underworld', 'Click to enter the underworld');
                label = '<i class="fa-solid fa-gamepad" aria-hidden="true"></i> ' + this._L('wg.nav.play_now', 'PLAY NOW!');
            } else if (this.currentSlide === 3) {
                // Monster DB → plain forward nav to the Avatar DB. [REF#UI-00745]
                nextOk = true;
                hint = this._L('wg.hint.continue_avatars', 'Continue to the player avatars');
            } else if (this.currentSlide === 4) {
                // Avatar DB → forward to the live Character sheet. [REF#UI-00746]
                nextOk = true;
                hint = this._L('wg.hint.continue_character', 'Continue to your character sheet');
            } else if (this.currentSlide === 5) {
                // Character sheet → forward to the Equipment screen. [REF#UI-00747]
                nextOk = true;
                hint = this._L('wg.hint.continue_equipment', 'Continue to your equipment');
            } else if (this.currentSlide === 6) {
                // Equipment → forward to the Donation / thank-you page. [REF#UI-00748]
                nextOk = true;
                hint = this._L('wg.hint.continue_donation', 'Continue to support the game');
            } else {
                // Donation (last spread) — hide NEXT entirely. [REF#UI-00749]
                next.hidden = true;
            }
            // LOG/reference (browse) mode: never launch — PLAY NOW becomes plain Next [REF#UI-00750]
            // so the player can page through the entire guide (Mark 2026-06-09).
            if (this._browseMode && (this.currentSlide === 1 || this.currentSlide === 2)) {
                nextOk = true; bloom = false;
                label = this._L('wg.nav.next', 'Next &rarr;');
                hint  = 'Next page';
            }
            next.disabled = !nextOk;
            next.classList.toggle('wg-nav-btn-active', nextOk && !bloom);
            next.classList.toggle('wg-nav-btn-bloom',  bloom);
            next.setAttribute('title', hint);
            if (next.innerHTML !== label) next.innerHTML = label;
        }


        // Tag the modal with the current slide so the footer CSS can [REF#UI-00751]
        // absolute-center NEXT on the last spread (replacing the old
        // PLAY GAME position) and hide the page-dots there.
        el.dataset.slide = this.currentSlide;
    }

    // Paint the role-profile panel on slide 1 RIGHT page with the [REF#UI-00752]
    // selected role's title + class + one-liner + equipment list. The
    // panel picks up the role's color theme via the `r-<id>` class.
    // ─────────────────────────────────────────────────────────────────────
    // ROLE-CARD 3D ARTIFACTS (procedural; engine window.THREE — no CDN).
    // Mounted on spread 1; _teardownRoleIcons() disposes every renderer +
    // context when the guide closes or you leave the role page (Mark mandate;
    // FPS is a non-issue — the guide pauses gameplay).
    // ─────────────────────────────────────────────────────────────────────
    _roleArtifact(id, T) {
        const phys = o => new T.MeshPhysicalMaterial(o);
        const M = {
            gold:  phys({ color: 0xffaa00, metalness: 1, roughness: 0.15, clearcoat: 0.8 }),
            steel: phys({ color: 0xffffff, metalness: 1, roughness: 0.2, clearcoat: 1 }),
            wood:  phys({ color: 0x3d2314, roughness: 0.6, clearcoat: 0.2 }),
            red:   phys({ color: 0xbc002d, roughness: 0.3, clearcoat: 1, metalness: 0.2 }),
            dark:  phys({ color: 0x111115, roughness: 0.9 }),
            suit:  phys({ color: 0x1a1a1f, roughness: 0.8 }),
            skin:  phys({ color: 0xe0ac69, roughness: 0.4 }),
            iron:  phys({ color: 0x18181a, metalness: 0.8, roughness: 0.5, clearcoat: 0.3, side: T.DoubleSide }),
            white: phys({ color: 0xf5f6fa, roughness: 0.9, clearcoat: 0.05 }),
            gray:  phys({ color: 0x5a5a60, roughness: 0.95 }),
            grayV: phys({ color: 0x4a4a50, roughness: 0.8, clearcoat: 0.1 }),
        };
        const g = new T.Group();
        const mk = (geo, mat) => new T.Mesh(geo, mat);

        if (id === 'samurai') {
            const dome = mk(new T.SphereGeometry(0.8, 48, 48, 0, Math.PI * 2, 0, Math.PI / 2.1), M.iron);
            const crescent = mk(new T.TorusGeometry(0.4, 0.08, 16, 48, Math.PI), M.gold);
            crescent.position.set(0, 0.4, 0.78); crescent.rotation.z = Math.PI;
            const badge = mk(new T.SphereGeometry(0.12, 24, 24), M.red);
            badge.position.set(0, 0.4, 0.80); badge.scale.set(1, 1, 0.5);
            [[0.85, 0.95, -0.1], [0.95, 1.05, -0.3], [1.05, 1.15, -0.5]].forEach(([a, b, y]) => {
                const gd = mk(new T.CylinderGeometry(a, b, 0.2, 48, 1, true, Math.PI * 0.75, Math.PI * 1.5), M.iron);
                gd.position.y = y; g.add(gd);
            });
            g.add(dome, crescent, badge);
            return { model: g, animType: 'float' };
        }
        if (id === 'archer') {
            // ADVENTURER's Nikon-style flash camera (Mark 2026-08-03) — replaces the bow+arrow [REF#UI-00753]
            // glyph so the role card shows the weapon the role actually rolls. Same mk()/M idiom;
            // red swoosh + shutter = the Nikon signature in M.red.
            const cam = new T.Group();
            const body  = mk(new T.BoxGeometry(1.7, 1.05, 0.5), M.dark);
            const top   = mk(new T.BoxGeometry(1.7, 0.16, 0.5), M.steel); top.position.y = 0.60;
            const prism = mk(new T.BoxGeometry(0.60, 0.28, 0.40), M.dark); prism.position.y = 0.80;
            const grip  = mk(new T.BoxGeometry(0.36, 1.05, 0.58), M.dark); grip.position.set(0.72, 0, 0.03);
            const swoosh = mk(new T.BoxGeometry(0.08, 0.42, 0.05), M.red); swoosh.position.set(0.60, -0.08, 0.31); swoosh.rotation.z = -0.18;
            const l1 = mk(new T.CylinderGeometry(0.42, 0.42, 0.24, 32), M.steel); l1.rotation.x = Math.PI / 2; l1.position.z = 0.36;
            const l2 = mk(new T.CylinderGeometry(0.36, 0.36, 0.42, 32), M.dark);  l2.rotation.x = Math.PI / 2; l2.position.z = 0.68;
            const glass = mk(new T.CylinderGeometry(0.26, 0.26, 0.05, 32), M.iron); glass.rotation.x = Math.PI / 2; glass.position.z = 0.90;
            const bulb  = mk(new T.BoxGeometry(0.42, 0.20, 0.26), M.steel); bulb.position.set(-0.52, 0.76, 0);
            const shut  = mk(new T.CylinderGeometry(0.08, 0.08, 0.09, 16), M.red); shut.position.set(0.66, 0.72, 0.10);
            cam.add(body, top, prism, grip, swoosh, l1, l2, glass, bulb, shut);
            cam.rotation.y = -0.5;   // three-quarter view so the lens barrel's depth reads [REF#UI-00754]
            g.add(cam);
            return { model: g, animType: 'float' };
        }
        if (id === 'gangster') {
            const shoulders = mk(new T.CylinderGeometry(0.7, 0.9, 0.8, 48), M.suit); shoulders.position.y = -0.6; shoulders.scale.z = 0.5;
            const shirt = mk(new T.CylinderGeometry(0.65, 0.85, 0.85, 48), M.white); shirt.position.y = -0.6; shirt.scale.z = 0.48;
            const tie = mk(new T.BoxGeometry(0.15, 0.8, 0.1), M.white); tie.position.set(0, -0.6, 0.42); tie.rotation.x = 0.1;
            const hat = new T.Group();
            const crown = mk(new T.CylinderGeometry(0.45, 0.5, 0.6, 48), M.suit); crown.position.y = 0.6;
            const brim = mk(new T.CylinderGeometry(0.9, 0.9, 0.05, 48), M.suit); brim.position.y = 0.3;
            const band = mk(new T.CylinderGeometry(0.51, 0.51, 0.15, 48), M.dark); band.position.y = 0.4;
            hat.add(crown, brim, band);
            const glasses = new T.Group();
            const lensMat = phys({ color: 0x050505, metalness: 0.9, roughness: 0, clearcoat: 1 });
            const lensL = mk(new T.CylinderGeometry(0.2, 0.2, 0.05, 48), lensMat); lensL.rotation.x = Math.PI / 2; lensL.position.set(-0.25, 0, 0.5);
            const lensR = lensL.clone(); lensR.position.set(0.25, 0, 0.5);
            const bridge = mk(new T.BoxGeometry(0.15, 0.02, 0.02), M.gold); bridge.position.set(0, 0, 0.5);
            glasses.add(lensL, lensR, bridge);
            const pistol = new T.Group();
            const slide = mk(new T.BoxGeometry(0.1, 0.15, 0.5), M.iron); slide.position.set(0, 0.15, 0);
            const grip = mk(new T.BoxGeometry(0.1, 0.3, 0.15), M.iron); grip.position.set(0, -0.05, -0.15); grip.rotation.x = -0.2;
            const hand = mk(new T.SphereGeometry(0.12, 24, 24), M.skin); hand.position.set(0, -0.05, -0.12);
            const sleeve = mk(new T.CylinderGeometry(0.15, 0.18, 0.6, 24), M.suit); sleeve.position.set(0, -0.25, -0.35); sleeve.rotation.x = Math.PI / 3.5;
            pistol.add(slide, grip, hand, sleeve); pistol.position.set(1.1, 0, 0.2); pistol.rotation.set(0, -0.2, 0.2);
            g.add(shoulders, shirt, tie, hat, glasses, pistol);
            return { model: g, parts: { weapon: pistol }, animType: 'bob' };
        }
        if (id === 'ninja') {
            const head = mk(new T.SphereGeometry(0.75, 48, 48), M.dark);
            const opening = mk(new T.CylinderGeometry(0.74, 0.74, 0.3, 48), M.skin); opening.position.set(0, 0.1, 0);
            const band = mk(new T.CylinderGeometry(0.76, 0.76, 0.12, 48), M.steel); band.position.y = 0.3;
            const shuriken = new T.Group();
            const bladeGeo = new T.ConeGeometry(0.12, 0.6, 4);
            const b1 = mk(bladeGeo, M.steel); b1.position.y = 0.3;
            const b2 = mk(bladeGeo, M.steel); b2.position.y = -0.3; b2.rotation.z = Math.PI;
            const b3 = mk(bladeGeo, M.steel); b3.position.x = 0.3; b3.rotation.z = -Math.PI / 2;
            const b4 = mk(bladeGeo, M.steel); b4.position.x = -0.3; b4.rotation.z = Math.PI / 2;
            const ring = mk(new T.TorusGeometry(0.1, 0.04, 16, 32), M.iron);
            shuriken.add(b1, b2, b3, b4, ring); shuriken.position.set(1.2, 0, 0.3); shuriken.rotation.set(0.1, -0.2, 0);
            g.add(head, opening, band, shuriken);
            return { model: g, parts: { spin: shuriken }, animType: 'spin' };
        }
        if (id === 'wizard') {
            const robe = mk(new T.ConeGeometry(1.1, 1.2, 48), M.gray); robe.position.y = -0.5;
            const faceVoid = mk(new T.CylinderGeometry(0.38, 0.38, 0.4, 32), new T.MeshBasicMaterial({ color: 0x000000 })); faceVoid.position.y = 0.5;
            const hat = new T.Group();
            const cone = mk(new T.ConeGeometry(0.7, 1.6, 48), M.grayV); cone.position.y = 0.8;
            const hbrim = mk(new T.CylinderGeometry(1.2, 1.2, 0.05, 48), M.grayV);
            hat.add(cone, hbrim); hat.position.y = 0.7;
            const staffG = new T.Group();
            const staff = mk(new T.CylinderGeometry(0.04, 0.04, 2.5, 12), M.wood);
            const core = mk(new T.IcosahedronGeometry(0.15, 0), new T.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 3 })); core.position.y = 1.35;
            const claw = mk(new T.TorusGeometry(0.15, 0.02, 16, 32), M.gold); claw.position.y = 1.35; claw.rotation.x = Math.PI / 2;
            staffG.add(staff, core, claw); staffG.position.set(1.0, -0.2, 0.5); staffG.rotation.set(0.1, 0, -0.15);
            g.add(robe, faceVoid, hat, staffG);
            return { model: g, parts: { core }, animType: 'magic' };
        }
        // priest (default) [REF#UI-00755]
        const probe = mk(new T.ConeGeometry(1.1, 1.2, 48), M.white); probe.position.y = -0.5;
        const ov1 = mk(new T.BoxGeometry(0.8, 1.0, 0.1), M.white); ov1.position.set(0, -0.4, 0.95); ov1.rotation.z = Math.PI / 4;
        const ov2 = mk(new T.BoxGeometry(0.8, 1.0, 0.1), M.white); ov2.position.set(0, -0.4, 0.96); ov2.rotation.z = -Math.PI / 4;
        const phat = new T.Group();
        const hb = mk(new T.CylinderGeometry(0.4, 0.45, 0.6, 48), M.dark); hb.position.y = 0.8;
        const ht = mk(new T.CylinderGeometry(0.35, 0.4, 0.5, 48), M.dark); ht.position.set(0, 1.3, -0.1); ht.rotation.x = -0.2;
        phat.add(hb, ht);
        const gohei = new T.Group();
        const wand = mk(new T.CylinderGeometry(0.03, 0.03, 1.5, 12), M.wood);
        const paperMat = new T.MeshStandardMaterial({ color: 0xffffff, side: T.DoubleSide, roughness: 1 });
        const pp1 = mk(new T.PlaneGeometry(0.2, 0.5), paperMat); pp1.position.set(-0.15, 0.5, 0); pp1.rotation.z = 0.4;
        const pp2 = mk(new T.PlaneGeometry(0.2, 0.5), paperMat); pp2.position.set(0.15, 0.5, 0); pp2.rotation.z = -0.4;
        const ribbon = mk(new T.CylinderGeometry(0.035, 0.035, 0.05, 16), M.red); ribbon.position.y = 0.3;
        gohei.add(wand, pp1, pp2, ribbon); gohei.position.set(0.8, 0, 0.6); gohei.rotation.z = -0.4;
        g.add(probe, ov1, ov2, phat, gohei);
        return { model: g, parts: { gohei }, animType: 'holy' };
    }

    _mountRoleIcons() {
        // The supplied role cards already contain their authored artifact, title, and [REF#UI-01515]
        // equipment cue. Do not place the legacy WebGL icon canvas over that artwork.
        if (document.querySelector('.wg-role-card-art')) return;
        const T = window.THREE;
        if (!T || typeof T.WebGLRenderer !== 'function') return;
        this._teardownRoleIcons();
        const ic = { vps: [], raf: 0, clock: new T.Clock() };
        this.roles.forEach(r => {
            const boxEl = document.getElementById('role-icon-' + r.id);
            if (!boxEl) return;
            let built; try { built = this._roleArtifact(r.id, T); } catch (_) { built = null; }
            if (!built) return;
            let rnd; try { rnd = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch (_) { return; }
            const scene = new T.Scene();
            const cam = new T.PerspectiveCamera(35, 1, 0.1, 100); cam.position.set(0, 0, 5);
            const sz = Math.max(boxEl.clientWidth || 72, 48);
            rnd.setSize(sz, sz, false);
            rnd.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            if (T.ACESFilmicToneMapping) { rnd.toneMapping = T.ACESFilmicToneMapping; rnd.toneMappingExposure = 1.15; }
            const key = new T.DirectionalLight(0xffffff, 2.2); key.position.set(4, 5, 4); scene.add(key);
            const fill = new T.DirectionalLight(0xaaccff, 1.1); fill.position.set(-4, -2, 4); scene.add(fill);
            scene.add(new T.AmbientLight(0x556070, 1.4));
            const model = built.model;
            const bb = new T.Box3().setFromObject(model);
            const size = bb.getSize(new T.Vector3());
            const max = Math.max(size.x, size.y, size.z) || 1;
            model.scale.setScalar(2.2 / max);
            bb.setFromObject(model);
            model.position.sub(bb.getCenter(new T.Vector3()));
            scene.add(model);
            const fb = boxEl.querySelector('.wg-role-kanji-fallback'); if (fb) fb.style.display = 'none';
            boxEl.appendChild(rnd.domElement);
            ic.vps.push({ scene, cam, rnd, data: built, model });
        });
        if (!ic.vps.length) return;
        const tick = () => {
            const cur = this._roleIcons; if (!cur) return;
            const t = cur.clock.getElapsedTime();
            cur.vps.forEach(vp => {
                if (!window._compassionRender?.staticVisuals) {
                vp.model.rotation.y = t * 0.4;
                const type = vp.data.animType, p = vp.data.parts || {};
                if (type === 'float') vp.model.position.y = Math.sin(t * 2) * 0.1;
                else if (type === 'bob' && p.weapon) { p.weapon.position.y = Math.sin(t * 3) * 0.1; vp.model.position.y = Math.sin(t * 1.5) * 0.05; }
                else if (type === 'spin' && p.spin) { p.spin.rotation.z = t * -5; vp.model.position.y = Math.sin(t * 1.5) * 0.05; }
                else if (type === 'magic' && p.core) { p.core.rotation.x = t * 2; p.core.rotation.z = t * 1.5; vp.model.position.y = Math.sin(t * 2) * 0.1; }
                else if (type === 'holy' && p.gohei) { p.gohei.rotation.y = Math.sin(t * 2) * 0.2; vp.model.position.y = Math.sin(t * 1.5) * 0.08; }
                }
                try { vp.rnd.render(vp.scene, vp.cam); } catch (error) { window.parent.postMessage({type:'ENGINE_ANOMALY',kind:'COMPASSION_ROLE_RENDER',error:String(error)}, '*'); }
            });
            cur.raf = window._compassionFrame(tick, () => this._roleIcons === ic);
        };
        this._roleIcons = ic;
        ic.tick = tick;
        ic.raf = window._compassionFrame(tick, () => this._roleIcons === ic);
    }

    _teardownRoleIcons() {
        const ic = this._roleIcons;
        if (!ic) return;
        window._compassionForget(ic.tick);
        this._roleIcons = null;
        if (ic.raf) { try { cancelAnimationFrame(ic.raf); } catch (_) {} }
        ic.vps.forEach(vp => {
            try {
                vp.scene.traverse(o => {
                    if (o.geometry && o.geometry.dispose) o.geometry.dispose();
                    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m && m.dispose && m.dispose());
                });
                vp.rnd.dispose();
                if (vp.rnd.forceContextLoss) vp.rnd.forceContextLoss();
                const dom = vp.rnd.domElement;
                if (dom && dom.parentNode) dom.parentNode.removeChild(dom);
            } catch (_) {}
        });
        (this.roles || []).forEach(r => {
            const fb = document.querySelector('#role-icon-' + r.id + ' .wg-role-kanji-fallback');
            if (fb) fb.style.display = '';
        });
    }

    _renderRoleProfile(roleId) {
        const host = document.getElementById('wg-role-profile');
        if (!host) return;
        const role = this.roles.find(r => r.id === roleId);
        const profile = this.roleProfiles[roleId];
        if (!role || !profile) return;
        // Wipe old r-* classes and apply the new role's color theme. [REF#UI-00756]
        host.className = 'wg-role-profile ' + role.cls;
        host.innerHTML = `
            <div class="wg-rp-portrait" aria-hidden="true">
                <span class="wg-rp-kanji">${role.kanji}</span>
            </div>
            <div class="wg-rp-head">
                <h3 class="wg-rp-name">${this._L('wg.role.' + roleId + '.name', role.name)}</h3>
                <span class="wg-rp-pill">${this._L('wg.role.' + roleId + '.pill', role.pill)}</span>
            </div>
            <p class="wg-rp-oneliner">${this._L('wg.role.' + roleId + '.oneliner', profile.oneLiner)}</p>
            <div class="wg-rp-kit-label">${this._L('wg.role.kit_label', 'STARTING KIT')}</div>
            <ul class="wg-rp-kit">
                ${profile.kit.map((item, i) => `<li>${this._L('wg.role.' + roleId + '.kit.' + i, item)}</li>`).join('')}
            </ul>
        `;
    }

    // ── Spread 2 — saves list (page 5) + preview pane (page 6) ────── [REF#UI-00757]
    // Paints the scrollable list on the left page from this._saves. Each
    // row is keyed by save name and click-selects (calls _previewSave).
    // Re-renders on every SAVE_LIST message (see constructor listener).
    _renderSavesList() {
        const host = document.getElementById('wg-saves-list');
        if (!host) return;
        if (!this._saves.length) {
            host.innerHTML = `<div class="wg-saves-empty">${this._L('wg.restore.empty', 'No saved games yet. Hit <b>PLAY GAME</b> to start a fresh run.')}</div>`;
            return;
        }
        const fmt = (ts) => {
            if (!ts) return '';
            try {
                const d = new Date(ts);
                return d.toLocaleDateString() + ' · ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            } catch(_) { return String(ts); }
        };
        // Engine's save summary uses slotId as the lookup key and name / [REF#UI-00758]
        // displayName as the human label. LOAD_NOW + DELETE_SAVE look up
        // by slotId, so we MUST identify rows by slotId — not name. Falls
        // back to name only when slotId is missing (old v1 saves).
        // A SLOT FROM AN OLDER DUNGEON is listed greyed and cannot be restored (Mark 2026-09-27: "Refuse old saves"). The engine [REF#PENDING]
        // marks each entry `loadable` on SAVE_LIST; its LOAD_NOW refuses one anyway. Newest first, so the save just made is on top.
        const _oldNote = this._L('wg.restore.old', 'made in an older dungeon — can’t be loaded');
        const _rows = this._saves.slice().sort((a, b) => ((b.savedAt || b.timestamp || 0) - (a.savedAt || a.timestamp || 0)));
        host.innerHTML = _rows.map(s => {
            const id = (s.slotId || s.name || '').toString();
            const old = s.loadable === false;
            return `
            <button type="button" class="wg-save-row${old ? ' wg-save-row--old' : ''}" role="option"
                    data-save-id="${id.replace(/"/g,'&quot;')}"
                    aria-selected="false"${old ? ' aria-disabled="true"' : ''}>
                <span class="wg-sr-floor">${s.realm ? 'R' + s.realm : 'F' + (s.floor ?? '?')}</span>
                <span class="wg-sr-body">
                    <span class="wg-sr-name">${s.displayName || s.name || '(unnamed)'}</span>
                    <span class="wg-sr-meta">${old ? _oldNote : `${(s.role || 'HERO').toUpperCase()} · HP ${s.hp ?? '?'}/${s.maxHp ?? '?'}`}</span>
                </span>
                <span class="wg-sr-when">${fmt(s.savedAt || s.timestamp)}</span>
            </button>`;
        }).join('');
        host.querySelectorAll('.wg-save-row').forEach(row => {
            row.addEventListener('click', () => this._previewSave(row.dataset.saveId));
        });
        // If we previously selected a save and it's still in the list, [REF#UI-00759]
        // re-apply the selection so the preview pane stays consistent.
        if (this._selectedSaveName) {
            const stillExists = this._saves.some(s => (s.slotId || s.name) === this._selectedSaveName);
            if (stillExists) this._previewSave(this._selectedSaveName);
            else { this._selectedSaveName = null; this._clearPreview(); }
        }
    }

    _previewSave(saveId) {
        this._selectedSaveName = saveId;
        const save = this._saves.find(s => (s.slotId || s.name) === saveId);
        const host = document.getElementById('wg-save-preview');
        const restoreBtn = document.getElementById('wg-restore-btn');
        if (!host) return;
        const el = document.getElementById(this.containerId);
        if (el) {
            el.querySelectorAll('.wg-save-row').forEach(r => {
                const on = r.dataset.saveId === saveId;
                r.classList.toggle('selected', on);
                r.setAttribute('aria-selected', on ? 'true' : 'false');
            });
        }
        if (!save) { this._clearPreview(); return; }
        host.classList.remove('wg-save-preview-empty');
        const role = (save.role || 'HERO').toUpperCase();
        const hpPct = (save.hp && save.maxHp) ? Math.max(0, Math.min(100, Math.round(save.hp / save.maxHp * 100))) : 0;
        const inv = save.inventory || {};
        const invKeys = Object.keys(inv).filter(k => inv[k] > 0).slice(0, 6);
        host.innerHTML = `
            <div class="wg-spv-head">
                <span class="wg-spv-floor">F${save.floor ?? '?'}</span>
                <h4 class="wg-spv-name">${save.displayName || save.name || '(unnamed)'}</h4>
                <span class="wg-spv-role">${role}</span>
            </div>
            <div class="wg-spv-hp">
                <span class="wg-spv-hp-label">HP</span>
                <span class="wg-spv-hp-bar"><i style="width:${hpPct}%"></i></span>
                <span class="wg-spv-hp-num">${save.hp ?? '?'} / ${save.maxHp ?? '?'}</span>
            </div>
            ${invKeys.length ? `
            <div class="wg-spv-kit-label">${this._L('wg.restore.inventory', 'INVENTORY')}</div>
            <ul class="wg-spv-kit">
                ${invKeys.map(k => `<li>${k} ×${inv[k]}</li>`).join('')}
                ${Object.keys(inv).filter(k => inv[k] > 0).length > 6 ? `<li class="wg-spv-more">${this._L('wg.restore.more', '+{n} more…').replace('{n}', String(Object.keys(inv).filter(k => inv[k] > 0).length - 6))}</li>` : ''}
            </ul>` : ''}
        `;
        const old = save.loadable === false;   // a slot from an older dungeon (2026-09-27) — shown, never restorable [REF#PENDING] [REF#UI-01421]
        if (old) host.insertAdjacentHTML('beforeend', `<p class="wg-spv-old">${this._L('wg.restore.old_long', 'This save was made in an older dungeon. The floors have changed since, so it can’t be loaded — you can delete it.')}</p>`);
        if (restoreBtn) {
            restoreBtn.disabled = old;
            restoreBtn.classList.toggle('wg-restore-btn-active', !old);
        }
        this._armDeleteButton(true);
    }

    // DELETE THIS SAVE (2026-09-27, the save rebuild): the guide had no live delete, and every save is its own slot now. Two [REF#PENDING] [REF#UI-01422]
    // presses: the first asks, the second (within 3 s) posts DELETE_SAVE, which the engine already handles and answers with SAVE_LIST.
    _armDeleteButton(on) {
        const del = document.getElementById('wg-delete-save-btn');
        if (!del) return;
        clearTimeout(this._deleteConfirmT); this._deleteConfirm = false;
        del.disabled = !on;
        del.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i> ' + this._L('wg.restore.delete', 'DELETE');
    }
    _deleteSelectedSave() {
        const del = document.getElementById('wg-delete-save-btn');
        if (!this._selectedSaveName || !del) return;
        if (!this._deleteConfirm) {
            this._deleteConfirm = true;
            del.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i> ' + this._L('wg.restore.delete_confirm', 'PRESS AGAIN TO DELETE');
            clearTimeout(this._deleteConfirmT);
            this._deleteConfirmT = setTimeout(() => this._armDeleteButton(!!this._selectedSaveName), 3000);
            return;
        }
        const name = this._selectedSaveName;
        this._selectedSaveName = null;
        this._clearPreview();
        try {
            window.parent.postMessage({ type: 'DELETE_SAVE', name }, '*');
            window.parent.postMessage({ type: 'LIST_SAVES' }, '*');
        } catch (_) {}
    }

    _clearPreview() {
        this._armDeleteButton(false);
        const host = document.getElementById('wg-save-preview');
        const restoreBtn = document.getElementById('wg-restore-btn');
        if (host) {
            host.classList.add('wg-save-preview-empty');
            host.innerHTML = `
                <div class="wg-spv-placeholder">
                    <div class="wg-spv-icon" aria-hidden="true">
                        <i class="fa-solid fa-bone"></i>
                    </div>
                    <p class="wg-spv-hint">
                        Click a save on the left to preview its floor,
                        role, and HP. Or hit <b>PLAY GAME</b> below to
                        start a fresh run with the role you picked.
                    </p>
                </div>`;
        }
        if (restoreBtn) {
            restoreBtn.disabled = true;
            restoreBtn.classList.remove('wg-restore-btn-active');
        }
    }

    _restoreSelectedSave() {
        if (!this._selectedSaveName) return;
        const _sel = (this._saves || []).find(s => (s.slotId || s.name) === this._selectedSaveName);
        if (_sel && _sel.loadable === false) return;   // an older dungeon's save — the button is disabled for it too (2026-09-27) [REF#PENDING] [REF#UI-01423]
        // Delegate to the panels' existing loader, which posts LOAD_NOW to [REF#UI-00760]
        // the engine and handles row-loading UI. Then hide the guide so
        // the engine's restore flow owns the screen.
        if (typeof window.loadSavedGame === 'function') {
            // a throw inside the loader used to be swallowed here, so RESTORE closed the guide and loaded nothing (2026-09-28); [REF#UI-01424]
            // if it throws, LOAD_NOW goes straight to the shell instead. knowledge/design/SAVE_GAME_2026-09-27.md §5
            let _sent = false;
            try { window.loadSavedGame(this._selectedSaveName); _sent = true; } catch(e){ try { console.warn('[guide] loadSavedGame threw — posting LOAD_NOW directly', e); } catch(_){} }
            if (!_sent) try { window.parent.postMessage({ type: 'LOAD_NOW', name: this._selectedSaveName }, '*'); } catch(_){}
        } else {
            // Fallback path — post LOAD_NOW directly to the parent shell. [REF#UI-00761]
            try { window.parent.postMessage({ type: 'LOAD_NOW', name: this._selectedSaveName }, '*'); } catch(_){}
        }
        this.hide({ isFromLoad: true });
    }

    // Write the current game to a save from the in-guide SAVE page (Mark [REF#UI-00762]
    // 2026-06-05 — the standalone save popup was retired; saving now lives on
    // the guide's SAVE & RESTORE spread). Mirrors the old Panels saveCurrentGame
    // payload so the engine's SAVE_NOW handler is unchanged; the engine replies
    // SAVE_DONE + re-broadcasts SAVE_LIST → our listener repaints the list.
    //
    // ⛔ SUPERSEDED 2026-09-27 (the save rebuild; slot naming decided by the lead seat on Mark's hand-off): the slot was named [REF#PENDING]
    // "Floor N — ROLE", so a second save on the same floor silently replaced the first, and the button said SAVED! before the
    // engine had answered — even when the write failed. Now every save is its own slot, "Floor N — ROLE — HH:MM" (the engine adds
    // " (2)" on a clash and keeps the newest 10 per dungeon), and the button waits for SAVE_DONE (matched by reqId).
    _saveFromGuide() {
        const f = (window._currentFloor != null) ? window._currentFloor : '?';
        const r = (window.selectedRole) ? String(window.selectedRole).toUpperCase() : 'HERO';
        let hhmm = '';
        try { hhmm = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (_) {}
        const displayName = hhmm ? `Floor ${f} — ${r} — ${hhmm}` : `Floor ${f} — ${r}`;
        const reqId = 'wg-save-' + Date.now();
        this._saveReqId = reqId;
        // Panels-owned weapon state the card counts do not carry: the revolver drum and the rolled kit that sizes it [REF#UI-01425]
        let panels = null;
        try {
            panels = {
                pistolCyl: (typeof window._pistolCylGet === 'function') ? window._pistolCylGet() : (typeof window._pistolCyl === 'number' ? window._pistolCyl : null),
                rolled: { weapon: window.rolledRangedWeapon || '', qty: window.rolledRangedQty || 0, items: Array.isArray(window.rolledStartingItems) ? window.rolledStartingItems.slice() : [] },
            };
        } catch (_) {}
        try {
            window.parent.postMessage({
                type: 'SAVE_NOW',
                name: displayName,
                displayName: displayName,
                role: window.selectedRole || '',
                inventory: window.cardInventoryCounts || {},
                equipment: (window.playerGuide && window.playerGuide.equipment) || window.welcomeGuideEquipment || {},
                panels, unique: true, reqId,
            }, '*');
        } catch (_) {}
        const btn = document.getElementById('wg-save-current-btn');
        if (btn) {
            if (!this._saveBtnOrig) this._saveBtnOrig = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> ' + this._L('wg.save.saving', 'SAVING…');
            clearTimeout(this._saveBtnT);
            // A BUSY ENGINE IS NOT A FAILED SAVE (measured 2026-09-27: a save made right after walking into a far section answered [REF#PENDING] [REF#UI-01426]
            // after 5 s while the section streamed in — the slot was written, and a 5 s cut-off would have printed SAVE FAILED over
            // it). At 5 s the button says it is still saving and keeps listening; only 30 s of silence is reported as a failure.
            this._saveBtnT = setTimeout(() => {
                if (this._saveReqId !== reqId) return;
                btn.innerHTML = '<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ' + this._L('wg.save.slow', 'STILL SAVING…');
                this._saveBtnT = setTimeout(() => {
                    if (this._saveReqId === reqId) this._onSaveDone({ success: false, reason: this._L('wg.save.noanswer', 'the game did not answer'), reqId });
                }, 25000);
            }, 5000);
        }
    }
    _onSaveDone(d) {
        this._saveReqId = null;
        clearTimeout(this._saveBtnT);
        const btn = document.getElementById('wg-save-current-btn');
        if (!btn) return;
        const orig = this._saveBtnOrig || btn.innerHTML;
        btn.disabled = false;
        btn.innerHTML = d && d.success
            ? '<i class="fa-solid fa-check" aria-hidden="true"></i> ' + this._L('wg.save.done', 'SAVED!')
            : '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ' + this._L('wg.save.failed', 'SAVE FAILED') + ((d && d.reason) ? ' — ' + d.reason : '');
        btn.classList.toggle('wg-save-failed', !(d && d.success));
        this._saveBtnT = setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('wg-save-failed'); }, (d && d.success) ? 1400 : 4000);
        if (d && d.success) {
            // select the slot just written so its preview shows (the engine's SAVE_LIST follows SAVE_DONE) [REF#UI-01427]
            this._selectedSaveName = d.name || this._selectedSaveName;
            try { window.parent.postMessage({ type: 'LIST_SAVES' }, '*'); } catch (_) {}
        }
    }

    // ════════════════════════════════════════════════════════════════════ [REF#UI-00763]
    // MONSTER DATABASE (spread 3 / pages 7-8)
    // ════════════════════════════════════════════════════════════════════

    // Filtered + alphabetically-sorted view of the bestiary. 'all' sorts [REF#UI-00764]
    // A–Z by display name; a floor number keeps only monsters whose
    // `levels` array contains that floor.
    _filteredMonsters() {
        const f = this._monsterFilter;
        let list = this.monsterDB.slice();
        if (f !== 'all') {
            const lvl = parseInt(f, 10);
            list = list.filter(m => Array.isArray(m.levels) && m.levels.includes(lvl));
        }
        list.sort((a, b) => a.display.localeCompare(b.display));
        return list;
    }

    _renderMonsterList() {
        const host = document.getElementById('wg-monster-scroller');
        if (!host) return;
        const list = this._filteredMonsters();
        if (!list.length) {
            host.innerHTML = `<div class="wg-saves-empty">${this._L('wg.monster.empty', 'No monsters spawn on that floor.')}</div>`;
            return;
        }
        host.innerHTML = list.map(m => {
            const sel = m.key === this._selectedMonsterKey ? ' selected' : '';
            const floors = m.levels && m.levels.length
                ? (m.levels.length >= 7 ? 'F1–7' : 'F' + m.levels.join('·'))
                : '—';
            const dim = m.unmapped ? ' wg-mdb-unmapped' : '';
            return `
            <button type="button" class="wg-save-row wg-mdb-row${sel}${dim}" role="option"
                    data-monster-key="${m.key}" style="border-left-color:${m.accent};"
                    aria-selected="${m.key === this._selectedMonsterKey ? 'true' : 'false'}">
                <span class="wg-sr-floor" style="color:${m.accent};background:${m.accent}22;text-shadow:0 0 6px ${m.accent}55;">${m.kanji}</span>
                <span class="wg-sr-body">
                    <span class="wg-sr-name">${m.display}</span>
                    <span class="wg-sr-meta">${m.archetype}</span>
                </span>
                <span class="wg-sr-when">${floors}</span>
            </button>`;
        }).join('');
        host.querySelectorAll('.wg-mdb-row').forEach(row => {
            row.addEventListener('click', () => this._selectMonster(row.dataset.monsterKey));
        });
    }

    _selectMonster(key) {
        const mon = this.monsterDB.find(m => m.key === key);
        if (!mon) return;
        this._selectedMonsterKey = key;
        // Reflect selection in the list without a full re-render. [REF#UI-00765]
        const host = document.getElementById('wg-monster-scroller');
        if (host) {
            host.querySelectorAll('.wg-mdb-row').forEach(r => {
                const on = r.dataset.monsterKey === key;
                r.classList.toggle('selected', on);
                r.setAttribute('aria-selected', on ? 'true' : 'false');
            });
        }
        this._renderMonsterDetail(mon);
        this._mountMonsterPreview(mon);
    }

    _renderMonsterDetail(mon) {
        const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        setTxt('wg-mon-title', mon.display);
        setTxt('wg-mon-archetype', mon.archetype);
        setTxt('wg-mon-hp', typeof mon.hp === 'number' ? mon.hp : mon.hp);
        setTxt('wg-mon-scale', mon.scale != null ? mon.scale + '×' : '—');
        setTxt('wg-mon-weapon', mon.weapon || '—');
        setTxt('wg-mon-note', mon.note || '');

        // Vulnerability strip — colour each element green→red on a 0.4–1.8 [REF#UI-00766]
        // scale (>1 = weak/red, <1 = resist/green). When a monster has
        // multiple spawn-vuln archetypes (goblins) we average them and flag
        // the spread so the designer knows the value varies per spawn.
        const vulnHost = document.getElementById('wg-mon-vuln');
        if (vulnHost) {
            if (!mon.vulnVariants || !mon.vulnVariants.length) {
                vulnHost.innerHTML = `<span class="wg-vuln-empty">${this._L('wg.monster.no_spawn', 'no spawn data')}</span>`;
            } else {
                const elems = ['FIRE','WATER','EARTH','WIND','VOID'];
                const icon = { FIRE:'火', WATER:'水', EARTH:'地', WIND:'風', VOID:'空' };
                const multi = mon.vulnVariants.length > 1;
                vulnHost.innerHTML = elems.map(el => {
                    const vals = mon.vulnVariants.map(v => v[el] ?? 1.0);
                    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                    // 0.4→1.8 mapped to hue 130(green)→0(red). [REF#UI-00767]
                    const t = Math.max(0, Math.min(1, (avg - 0.4) / 1.4));
                    const hue = Math.round(130 * (1 - t));
                    const pct = Math.round(avg * 100);
                    const spread = multi ? `±` : '';
                    return `<span class="wg-vuln-cell" title="${el} ${pct}%${multi ? ' (avg of '+vals.length+' archetypes)' : ''}"
                                  style="--vh:${hue};">
                        <span class="wg-vuln-icon">${icon[el]}</span>
                        <span class="wg-vuln-pct">${pct}${spread}%</span>
                    </span>`;
                }).join('');
            }
        }
        this._renderClipRows(mon);
        this._renderSoundEditor(mon);
        this._renderGamblingSfx();
        this._renderGlbInfo(mon);
        this._renderCombatAttrs(mon);
        this._renderAiSettings(mon);
    }

    // MODEL / GLB panel — what rig this monster actually uses, and what is on it. [REF#UI-00768]
    _renderGlbInfo(mon) {
        const host = document.getElementById('wg-mon-glb');
        if (!host) return;
        const key = animKeyFor(mon);
        const man = (this._animManifest || {})[key] || null;
        const engineUrl = engineModelFor(mon) || mon.model;
        const rig = (this._monPreviewClips || []);
        const rows = [
            ['Engine key', `<code>${this._esc(key)}</code> · sound key <code>${this._esc(soundKeyFor(mon))}</code>`],
            ['GLB (engine)', `<code>${this._esc(String(engineUrl).replace(/^\.\//, ''))}</code>`],
        ];
        // The codex used to preview a DIFFERENT GLB than the engine spawns for the goblin and imp. If that [REF#UI-00769]
        // drift ever returns, this row makes it visible instead of silently listing clips that can't play.
        if (mon.model && engineUrl && mon.model !== engineUrl) {
            rows.push(['⚠ Catalog art ref', `<code>${this._esc(String(mon.model).replace(/^\.\//, ''))}</code> — differs from the engine's GLB; the preview and editor follow the <b>engine's</b>.`]);
        }
        rows.push(['Clips on rig', rig.length ? `<b>${rig.length}</b> (read from the loaded model)` : (man ? `<b>${man.clipCount}</b> (from the manifest — rig still loading)` : '—')]);
        if (man && man.semanticNames === false && man.clipCount > 0) {
            rows.push(['⚠ Clip names', `This rig's clips are named <code>NlaTrack.NNN</code> — meaningless. The engine's name matchers (<code>/idle/</code>, <code>/walk/</code>, <code>/attack/</code>) <b>cannot match them</b>, so it falls back to a duration guess. Play each one here and map it deliberately.`]);
        }
        if (man && man.resolvedTodayBy) rows.push(['Resolved by', this._esc(man.resolvedTodayBy)]);
        if (man && man.note) rows.push(['Manifest note', this._esc(man.note)]);
        host.innerHTML = rows.map(([k, v]) => `<div class="wg-kv"><span class="wg-kv-k">${this._esc(k)}</span><span class="wg-kv-v">${v}</span></div>`).join('');
    }

    // COMBAT ATTRIBUTES — HP / DEF / ATTACK (Mark 2026-07-19 "and also the HP, and DEF + ATTACK attributes"). [REF#UI-00770]
    // ⚠ READ-ONLY, WITH THE SOURCE OF TRUTH NAMED. These are deliberately NOT editable fields yet: HP comes
    // from a per-floor CURVE (DungeonChain.hpForLevel) and damage from CardExecutor's scaling, neither of
    // which has an override channel an editor could write to. Shipping input boxes with no reader is exactly
    // the failure this refactor exists to remove — see the three dead controls found on 2026-07-19
    // (UPDATE_MONSTER_AI_SETTINGS, and the idle/death anim slots). Wiring a real override bus is a separate,
    // reviewable change; until then this panel tells the truth about where each number lives.
    _renderCombatAttrs(mon) {
        const host = document.getElementById('wg-mon-attrs');
        if (!host) return;
        const rows = [
            ['HP', `${this._esc(String(mon.hp))}${mon.hpRef ? `<span class="wg-kv-ref">${this._esc(mon.hpRef)}</span>` : ''}`],
            ['Attack', `${this._esc(mon.weaponCard || '—')}${mon.weapon ? ` · ${this._esc(mon.weapon)}` : ''}<span class="wg-kv-ref">damage scales +12%/level, +10%/floor — CardExecutor.js</span>`],
            ['Defence', `No per-monster DEF stat exists. Mitigation is the <b>elemental vulnerability</b> table below (a multiplier on incoming damage, not a flat DEF).<span class="wg-kv-ref">vulnVariants — EntityCatalog.js</span>`],
            ['Hitbox', `${this._esc(mon.hitbox || '—')}`],
            ['Spawns on floors', (mon.levels && mon.levels.length) ? mon.levels.join(', ') : '—'],
        ];
        host.innerHTML = rows.map(([k, v]) => `<div class="wg-kv"><span class="wg-kv-k">${this._esc(k)}</span><span class="wg-kv-v">${v}</span></div>`).join('')
            + `<div class="wg-sfx-note">These are <b>read-only</b>: HP is a per-floor curve and damage is a scaling formula, neither of which has an override channel yet. The file each number lives in is named beside it.</div>`;
    }

    // ANIMATION EDITOR (Mark 2026-07-12 "when clicking animations: have a drop down so I can replace which ones [REF#UI-00771]
    // launch for which actions"): one row per ACTION TYPE — WALK / ATTACK / WHEN HIT / RANDOM EVENTS — each a
    // <select> of the monster's REAL GLB clip names (fetched live from the engine via MONSTER_ANIM_INFO; the
    // engine's auto-resolved clip shows as the default), a ＋ to stack more clips — MORE THAN ONE = the engine
    // RANDOMIZES per play, never the same clip twice in a row, and a list never holds duplicates. Saved per
    // engine monster-key to localStorage 'wg_monster_anim_map' (same origin as the engine — one store, two
    // readers) AND pushed live via MONSTER_ANIM_MAP_SET. This SUPERSEDES the old free-text clip-override rows:
    // their UPDATE_MONSTER_CLIP_MAP broadcast never had an engine reader; this map is consumed by _monSetAnim.
    // MANIFEST-DRIVEN (Mark 2026-07-19 "why is monster pages still fucked up? this isnt usable").
    // ─────────────────────────────────────────────────────────────────────────────────────────────
    // THE FIX THAT MAKES THIS PAGE USABLE AT ALL. The old flow asked the ENGINE for the clip list
    // (MONSTER_ANIM_INFO_REQ) and could only answer if a LIVE SPECIMEN of that exact monster was
    // loaded in the world — otherwise it timed out into "No live specimen of this monster on the
    // floor yet". So: open the codex in the entry hallway and every panel is empty. You cannot tune
    // a mummy without standing next to a mummy. That is the "none of it is editable" report.
    // Now the clip list comes from js/v8/data/MonsterAnimManifest.json (built from the models the
    // ENGINE loads) and, once the preview GLB parses, from the rig itself — both work with nothing
    // spawned. The live-specimen request is still fired, but purely as an ENRICHMENT: if a real
    // monster happens to be loaded, its `current` resolution overlays the manifest's. It is no
    // longer load-bearing, so its absence is no longer a dead end.
    _loadAnimManifest() {
        if (this._animManifest) return Promise.resolve(this._animManifest);
        if (this._animManifestP) return this._animManifestP;
        // fetch, not a JSON `import` — import assertions vary by browser and a syntax-level failure [REF#UI-00772]
        // here would take the whole guide module down with it. A failed fetch just degrades.
        this._animManifestP = fetch('./js/v8/data/MonsterAnimManifest.json?v=8.4.1537-stamped')
            .then(r => r.ok ? r.json() : {})
            .catch(() => ({}))
            .then(j => { this._animManifest = j || {}; return this._animManifest; });
        return this._animManifestP;
    }
    _renderClipRows(mon) {
        const host = document.getElementById('wg-clip-rows');
        if (!host) return;
        this._animEditKey = animKeyFor(mon);   // ENGINE key, not the catalog key — see the B5 note in EntityCatalog.js [REF#UI-00773]
        this._animEditMon = mon;
        host.innerHTML = '<div class="wg-clip-row" style="opacity:.7">Reading clip list…</div>';
        if (!this._animInfoBound) {
            this._animInfoBound = true;
            window.addEventListener('message', (e) => {
                if (e.data && e.data.type === 'MONSTER_ANIM_INFO' && e.data.monsterKey === this._animEditKey) {
                    this._animLiveInfo = e.data;                       // enrichment only [REF#UI-00774]
                    if (this._animEditMon) this._renderAnimEditorFromManifest(this._animEditMon);
                }
            });
        }
        this._animLiveInfo = null;
        this._loadAnimManifest().then(() => this._renderAnimEditorFromManifest(mon));
        try { window.parent.postMessage({ type: 'MONSTER_ANIM_INFO_REQ', monsterKey: this._animEditKey }, '*'); } catch (_) {}
    }

    // Assemble the editor's view model from the three sources, most-authoritative last: [REF#UI-00775]
    //   manifest (always available) → live in-world specimen (if one exists) → the preview GLB itself.
    _animInfoFor(mon) {
        const key = animKeyFor(mon);
        const man = (this._animManifest || {})[key] || null;
        const manClips = man && Array.isArray(man.clips) ? man.clips.map(c => c.name) : [];
        const rigClips = (this._monPreviewClips || []);
        const live = (this._animLiveInfo && this._animLiveInfo.monsterKey === key) ? this._animLiveInfo : null;
        const liveClips = (live && Array.isArray(live.clips)) ? live.clips : [];
        // The RIG is ground truth for what can actually play; the manifest fills in before it parses. [REF#UI-00776]
        const _rawClips = rigClips.length ? rigClips : (liveClips.length ? liveClips : manClips);
        // the engine builds a bow and two falling deaths for every animated rig (Engine9 _makeMadeClips, Mark 2026-09-27) — pickable in any slot [REF#UI-01428]
        const MADE = ['bow (made)', 'death fall (made)', 'death fall back (made)'];
        const clips = _rawClips.length ? _rawClips.concat(MADE.filter(n => !_rawClips.includes(n))) : _rawClips;
        const current = (live && live.current) ? live.current : (man ? (man.resolvedToday || {}) : {});
        return {
            monsterKey: key, clips, current, manifest: man,
            source: rigClips.length ? 'rig' : (liveClips.length ? 'live' : (manClips.length ? 'manifest' : 'none')),
            resolvedBy: man ? man.resolvedTodayBy : null,
            // A manifest that disagrees with the rig is a REAL problem (wrong GLB previewed, or a [REF#UI-00777]
            // re-export changed the clips) and the designer must be told, not quietly shown one of them.
            drift: (rigClips.length && manClips.length && (rigClips.length !== manClips.length
                || manClips.some(n => !rigClips.includes(n)))),
        };
    }
    _renderAnimEditorFromManifest(mon) {
        if (!mon) return;
        this._renderAnimEditor(this._animInfoFor(mon));
    }
    _loadAnimMap() { try { return JSON.parse(localStorage.getItem('wg_monster_anim_map') || '{}') || {}; } catch (_) { return {}; } }
    _saveAnimMap(map) {
        try { localStorage.setItem('wg_monster_anim_map', JSON.stringify(map)); } catch (_) {}
        try { window.parent.postMessage({ type: 'MONSTER_ANIM_MAP_SET', map }, '*'); } catch (_) {}
        this._monMarkDirty();
    }
    // ALWAYS-VIOLENT (Mark 2026-09-27: "we need a monster setting for ALWAYS-VIOLENT"): per monster key, saved in 'wg_monster_violent' [REF#UI-01429]
    // and pushed live (MONSTER_VIOLENT_SET → Engine9 _isAlwaysViolent). An unset key uses the default: ON for the ant, off for the rest.
    _violentDefault(key) { return key === 'ant'; }
    _loadViolent() { try { return JSON.parse(localStorage.getItem('wg_monster_violent') || '{}') || {}; } catch (_) { return {}; } }
    _saveViolent(map) {
        try { localStorage.setItem('wg_monster_violent', JSON.stringify(map)); } catch (_) {}
        try { window.parent.postMessage({ type: 'MONSTER_VIOLENT_SET', map }, '*'); } catch (_) {}
        this._monMarkDirty();
    }
    _renderAnimEditor(info) {
        const host = document.getElementById('wg-clip-rows');
        if (!host) return;
        // ZERO-CLIP RIGS SAY SO (Mark 2026-07-19 "fix each monster on the guidebook monsters page 1 at a time"). [REF#UI-00778]
        // This used to bare-return, leaving the panel BLANK with no explanation — indistinguishable from a broken
        // page. Measured: hungry-ghost.glb ships 21 meshes and 0 animations, so every slot here is a no-op for it
        // and no amount of mapping can help; the ASSET needs clips first. Say that instead of showing nothing.
        // ALWAYS-VIOLENT switch — on every page, a zero-clip rig (the ant, the ghost) included (Mark 2026-09-27)
        const _vm = this._loadViolent(), _vk = info.monsterKey;
        const _violent = Object.prototype.hasOwnProperty.call(_vm, _vk) ? !!_vm[_vk] : this._violentDefault(_vk);
        const _violentHtml = `<label class="wg-clip-row wg-violent-row" style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="wg-violent-toggle"${_violent ? ' checked' : ''}>
                <span class="wg-clip-label"><b>ALWAYS VIOLENT</b><span class="wg-clip-sub">always hostile — never greets, bows, wagers or joins you${this._violentDefault(_vk) ? ' (default ON)' : ''}</span></span>
             </label>`;
        const _wireViolent = () => { const _vt = host.querySelector('#wg-violent-toggle'); if (_vt) _vt.onchange = () => { const m = this._loadViolent(); m[_vk] = !!_vt.checked; this._saveViolent(m); }; };
        if (!info.clips || !info.clips.length) {
            host.innerHTML = _violentHtml + '<div class="wg-anim-none" style="opacity:.75;font-size:12px;line-height:1.5;padding:8px 2px;">'
                + this._esc(this._L('wg.anim.noclips', 'This model has NO animation clips (0 in the GLB).'))
                + '<br><span style="opacity:.7;">'
                + this._esc(this._L('wg.anim.noclips_sub', 'Nothing can be mapped until the model is re-exported with animations \u2014 it is transform-driven only.'))
                + '</span></div>';
            _wireViolent();
            return;
        }
        const map = this._loadAnimMap();
        const mine = map[info.monsterKey] || {};
        const cur = info.current || {};
        // `live` = does the ENGINE actually consult the saved map for this slot? Verified against the [REF#UI-00779]
        // _animMapPick call sites (Engine9 26427 / 26449 / 26479 / 43696) on 2026-07-19. Slots the engine
        // never reads are still shown, but BADGED "NOT READ YET" — a dropdown that silently does nothing
        // is worse than no dropdown at all, and is the "none of it is editable" complaint in another form.
        const TYPES = [
            { k: 'walk',   label: this._L('wg.anim.walk', 'WALK'), live: true, sub: 'also drives FLEE — the engine reuses the walk map when fleeing (Engine9:26427)' },
            { k: 'attack', label: this._L('wg.anim.attack', 'ATTACK'), live: true },
            { k: 'hit',    label: this._L('wg.anim.hit', 'WHEN HIT'), live: true },
            { k: 'random', label: this._L('wg.anim.random', 'RANDOM EVENTS (dances etc.)'), live: true },
            // WIRED FOR REAL 2026-07-19 (Mark "yes add idle death + hit animation slots"). These three were [REF#UI-00780]
            // previously badged NOT READ YET because _monSetAnim consulted the map only for walk/attack/hit/
            // random. It now resolves idle, flee and death from the map too, using the same only-on-entry
            // discipline as walk (see _monSetAnim, Engine9 ~26355), so a choice here changes the game.
            { k: 'idle',   label: this._L('wg.anim.idle', 'IDLE'), live: true },
            { k: 'death',  label: this._L('wg.anim.death', 'ON DEATH'), live: true, sub: 'was hard-wired to the BOW clip — a bow and a death flop were the same motion' },
            { k: 'flee',   label: this._L('wg.anim.flee', 'FLEE'), live: true, sub: 'leave empty to reuse the WALK clip, which is the old behaviour' },
            // JEER (Mark 2026-09-27: "more jeering animations - like pointing at player and laughing" · "use the new animation settings"): [REF#UI-01430]
            // the clip a monster plays when it snubs a rude (−karma) player instead of bowing — Oni-Baba's etiquette, Engine9 _monJeer.
            // BOW (Mark 2026-09-27: "i need a section for monster codex for BOW animation we used to have it"): the greeting bow — Oni-Baba's
            // etiquette bows, the room-entry bow, the peer bow-off and the cheer bow all play this clip (Engine9 _monSetAnim 'bow').
            { k: 'bow',    label: this._L('wg.anim.bow', 'BOW (greeting)'), live: true, sub: 'empty = the rig\'s own bow clip' },
            { k: 'jeer',   label: this._L('wg.anim.jeer', 'JEER (laugh at a rude player)'), live: true, sub: 'empty = a clip named "laugh", else the rig\'s angry clip' },
            // DANCE (2026-09-28): the clip a worker plays while Starlette is singing and it is listening in the cabaret (Engine9 _wkDanceTick). [REF#UI-01486]
            // 2026-10-03: also read by the cabaret audience hold — every worker (imp · goblin · mummy · kobold) in the room and the BOSS.
            { k: 'dance',  label: this._L('wg.anim.dance', 'DANCE (while Starlette sings)'), live: true, sub: 'workers in the cabaret + the boss \u2014 empty = workers clap, the boss does not join' },
        ];
        // SPECIAL ATTACKS (Mark 2026-07-19: "if you see any special attacks - add one for succubus - whip [REF#UI-00781]
        // attack animation"). Only offered for rigs that actually HAVE the ability wired in the engine — a
        // whip row on a goblin would be another dropdown that does nothing.
        const SPECIALS = {
            succubus: [
                { k: 'whip',  label: this._L('wg.anim.whip', '★ WHIP (special attack)'), live: true, sub: 'her once-a-minute card steal — keep it visually distinct from the normal ATTACK or the special stops reading as special' },
                { k: 'dodge', label: this._L('wg.anim.dodge', '★ DODGE'), live: false, sub: 'plays when she evades a ranged card or a hit while fleeing — clip picked by window._succubusDodgeClip' },
            ],
        };
        (SPECIALS[info.monsterKey] || []).forEach(s => TYPES.push(s));
        const head = [];
        if (info.source === 'manifest') head.push('clips from the central manifest — no live specimen needed');
        else if (info.source === 'rig') head.push('clips read straight off the preview rig');
        else if (info.source === 'live') head.push('clips from a live specimen in the world');
        if (info.resolvedBy) head.push('engine picks these today by: <b>' + this._esc(info.resolvedBy) + '</b>');
        // RESET (Mark 2026-07-19: "let me reset the animations in settings"). Needed NOW more than ever: the [REF#UI-00782]
        // succubus just moved to a new rig (Stariko) that RENAMED clips, so any map saved against the old rig
        // points at clip names that no longer exist — a slot silently resolving to nothing. Reset drops the saved
        // overrides for THIS monster and falls back to the engine's own resolution, which is always valid for
        // whatever rig is currently loaded. "ALL" clears every monster for a clean slate after a model swap.
        const _mineCount = Object.keys(mine || {}).length;
        host.innerHTML =
            _violentHtml
            + (head.length ? `<div class="wg-anim-src">${head.join(' · ')}</div>` : '')
            + `<div class="wg-anim-reset">
                 <button type="button" class="wg-mini-btn" id="wg-anim-reset-one"${_mineCount ? '' : ' disabled'}
                   title="Drop the saved overrides for this monster and go back to the engine's own clip resolution">↺ RESET THIS MONSTER${_mineCount ? ' (' + _mineCount + ')' : ''}</button>
                 <button type="button" class="wg-mini-btn" id="wg-anim-reset-all"
                   title="Clear saved animation overrides for EVERY monster — use after swapping a model, when old clip names no longer exist">↺ RESET ALL</button>
               </div>`
            + (info.drift ? `<div class="wg-anim-drift">⚠ The manifest and this rig disagree on the clip list — the GLB was re-exported, or the manifest was built from a different model. The dropdowns list the <b>rig's</b> clips (what can actually play).</div>` : '')
            + TYPES.map(t => {
            const list = (mine[t.k] && mine[t.k].length) ? mine[t.k] : (cur[t.k] ? [cur[t.k]] : []);
            const rows = list.map((nm) => this._animSelectHtml(t.k, nm, info.clips, list)).join('');
            const dead = t.live ? '' : `<em class="wg-anim-dead" title="The engine does not consult the saved map for this slot yet — it uses its own build-time resolution. A choice here is recorded but has no in-game effect.">NOT READ YET</em>`;
            const sub = t.sub ? `<span class="wg-clip-sub">${this._esc(t.sub)}</span>` : '';
            return `<div class="wg-clip-row" data-anim-type="${t.k}" style="display:block">
                <span class="wg-clip-label">${t.label}${(mine[t.k] || []).length > 1 ? ' <em style="opacity:.65">(randomized)</em>' : ''}${dead}${sub}</span>
                <div class="wg-anim-list">${rows || '<em style="opacity:.6">engine default</em>'}</div>
                <button type="button" class="wg-anim-add" data-anim-type="${t.k}" title="add another clip — more than one = randomized, never the same twice in a row">＋</button>
            </div>`;
        }).join('');
        // Reset wiring. Saving an EMPTY map for the key is what makes the engine fall back to its own [REF#UI-00783]
        // resolution — _animMapPick treats a missing/empty list as "no override", so this is a true revert
        // rather than a write of blank clip names. _saveAnimMap also pushes live, so the change lands in-world
        // without a reload.
        _wireViolent();
        const _resetOne = host.querySelector('#wg-anim-reset-one');
        if (_resetOne) _resetOne.onclick = () => {
            const m = this._loadAnimMap();
            delete m[info.monsterKey];
            this._saveAnimMap(m);
            this._renderAnimEditorFromManifest(this._animEditMon);
        };
        const _resetAll = host.querySelector('#wg-anim-reset-all');
        if (_resetAll) _resetAll.onclick = () => {
            this._saveAnimMap({});
            this._renderAnimEditorFromManifest(this._animEditMon);
        };
        const rewire = () => {
            // Selecting a clip AUDITIONS it immediately — you should not have to click ▶ to find out what you [REF#UI-00784]
            // just picked. This is the loop that actually lets the NlaTrack.NNN clips get identified.
            // Deliberately folded into this ONE handler rather than a second 'change' listener: _animEditApply
            // re-renders the rows, so a separate listener would fire on an already-detached <select>.
            host.querySelectorAll('select.wg-anim-sel').forEach(sel => { sel.onchange = () => { if (sel.value) this._playPreviewClip(sel.value); this._animEditApply(info, host); }; });
            host.querySelectorAll('button.wg-anim-del').forEach(btn => { btn.onclick = () => { btn.closest('.wg-anim-item').remove(); this._animEditApply(info, host); }; });
            // ▶ PLAY the selected clip (Mark 2026-07-13 "press play button for the model itself to show that [REF#UI-00785]
            // animation"; 2026-07-19 "this way I can test out what animations are being shown").
            // PLAYS IN THE CODEX CANVAS FIRST. It used to ONLY postMessage the engine, so previewing a clip
            // required a live monster of that type standing in the world — the same live-specimen dependency
            // that made this whole page unusable. Now the local preview is the primary channel and the engine
            // broadcast is a bonus: if a specimen IS loaded it animates too, and if not you still see the clip.
            host.querySelectorAll('button.wg-anim-play').forEach(btn => { btn.onclick = () => {
                const sel = btn.closest('.wg-anim-item').querySelector('select.wg-anim-sel');
                if (!sel || !sel.value) return;
                const ok = this._playPreviewClip(sel.value);
                btn.classList.toggle('playing', ok);
                if (!ok) { btn.title = 'This clip is not on the preview rig — sent to the engine instead.'; }
                setTimeout(() => btn.classList.remove('playing'), 900);
                try { window.parent.postMessage({ type: 'PLAY_MONSTER_ANIM', monsterKey: this._animEditKey, clip: sel.value }, '*'); } catch(_){}
            }; });
            // Selecting a clip auditions it immediately — you should not have to click ▶ to find out what you [REF#UI-00786]
            // just picked. This is the loop that actually lets Mark name the NlaTrack.NNN clips.
            host.querySelectorAll('select.wg-anim-sel').forEach(sel => {
                sel.addEventListener('change', () => { if (sel.value) this._playPreviewClip(sel.value); });
            });
        };
        rewire();
        host.querySelectorAll('button.wg-anim-add').forEach(btn => {
            btn.onclick = () => {
                const tk = btn.dataset.animType;
                const listEl = host.querySelector(`.wg-clip-row[data-anim-type="${tk}"] .wg-anim-list`);
                const chosen = [...listEl.querySelectorAll('select.wg-anim-sel')].map(s => s.value);
                const free = info.clips.find(c => !chosen.includes(c));
                if (!free) return;
                const em = listEl.querySelector('em'); if (em) em.remove();
                listEl.insertAdjacentHTML('beforeend', this._animSelectHtml(tk, free, info.clips, chosen.concat([free])));
                rewire();
                this._animEditApply(info, host);
            };
        });
    }
    _animSelectHtml(typeKey, value, clips, taken) {
        const opts = clips.map(c => `<option value="${this._esc(c)}"${c === value ? ' selected' : ''}${(taken.includes(c) && c !== value) ? ' disabled' : ''}>${this._esc(c)}</option>`).join('');
        return `<span class="wg-anim-item" style="display:flex;gap:4px;align-items:center;margin:2px 0">
            <select class="wg-anim-sel wg-clip-input" data-anim-type="${typeKey}">${opts}</select>
            <button type="button" class="wg-anim-play" title="▶ play this clip on a live monster of this type — confirm it's the right one">▶</button>
            <button type="button" class="wg-anim-del" title="remove this clip">✕</button></span>`;
    }
    _animEditApply(info, host) {
        const map = this._loadAnimMap();
        const mine = {};
        for (const row of host.querySelectorAll('.wg-clip-row[data-anim-type]')) {
            const tk = row.dataset.animType;
            const vals = [...row.querySelectorAll('select.wg-anim-sel')].map(s => s.value)
                .filter((v, i, a) => v && a.indexOf(v) === i);   // NO duplicate clips in one list (Mark 2026-07-12) [REF#UI-00787]
            if (vals.length) mine[tk] = vals;
        }
        map[info.monsterKey] = mine;
        this._saveAnimMap(map);
        this._renderAnimEditor(info);   // refresh the (randomized) tags + disabled options [REF#UI-00788]
    }

    // MONSTER SOUND EDITOR (Mark 2026-07-15): each monster type can choose a [REF#UI-00789]
    // voice/SFX clip for alert, attack, hurt, death, and social beats. The
    // complete assets/sounds/Monsters inventory is shared through
    // EntityCatalog.js. Empty means the engine's type-aware default. The map is
    // same-origin localStorage (survives reload/save transitions) and is also
    // pushed live to the engine; ▶ previews the exact selected file.
    _loadSoundMap() { try { return JSON.parse(localStorage.getItem('wg_monster_sound_map') || '{}') || {}; } catch (_) { return {}; } }
    _saveSoundMap(map) {
        try { localStorage.setItem('wg_monster_sound_map', JSON.stringify(map)); } catch (_) {}
        try { window.parent.postMessage({ type: 'MONSTER_SOUND_MAP_SET', map }, '*'); } catch (_) {}
        this._monMarkDirty();
    }
    // Audition ANY sound file locally. PlayerGuide runs inside the panels frame, which owns [REF#UI-00790]
    // window._panelsPlaySfx(path, volume) — so a preview needs no engine round-trip and works even
    // when the engine is mid-load or the monster isn't spawned. Falls back to a bare Audio().
    _auditionSfx(path, vol) {
        if (!path) return false;
        try {
            if (typeof window._panelsPlaySfx === 'function') { window._panelsPlaySfx(path, vol != null ? vol : 0.85); return true; }
            const a = new Audio(path); a.volume = Math.max(0, Math.min(1, vol != null ? vol : 0.85)); a.play(); return true;
        } catch (_) { return false; }
    }
    _renderSoundEditor(mon) {
        const host = document.getElementById('wg-sound-rows');
        if (!host) return;
        // ⚠ SOUND KEY, NOT CATALOG KEY. The engine files the succubus's sound map under 'succubi' [REF#UI-00791]
        // (_monsterSoundMapKeyOf, Engine9 ~19360) while her catalog key is 'succubus' — so this editor
        // was writing overrides to a key the engine never reads for her. soundKeyFor() is the bridge.
        // Note this is a DIFFERENT namespace from animKeyFor(): the goblin is 'gobl_normal' for
        // animation but 'yakuza_goblin' for sound. Do not collapse them.
        const sKey = soundKeyFor(mon);
        const map = this._loadSoundMap();
        const mine = map[sKey] || {};
        const byTag = {}; MONSTER_SOUND_CATALOG.forEach(s => { byTag[s.tag] = s; });
        // Group the dropdown by the slot each sound was authored for, so "WHEN HURT" surfaces the hurt [REF#UI-00792]
        // sounds first instead of burying them in a flat 15-item list.
        const options = (slotKey, selected) => {
            const mineFirst = MONSTER_SOUND_CATALOG.filter(s => s.slot === slotKey);
            const rest = MONSTER_SOUND_CATALOG.filter(s => s.slot !== slotKey);
            const opt = s => `<option value="${this._esc(s.tag)}"${s.tag === selected ? ' selected' : ''}>${this._esc(s.label)} · ${this._esc(s.file)}</option>`;
            return `<option value="">TYPE DEFAULT</option>`
                + (mineFirst.length ? `<optgroup label="for this event">${mineFirst.map(opt).join('')}</optgroup>` : '')
                + (rest.length ? `<optgroup label="all other clips">${rest.map(opt).join('')}</optgroup>` : '');
        };
        host.innerHTML = MONSTER_SOUND_SLOTS.map(slot => `
            <div class="wg-sound-row" data-sound-slot="${slot.key}">
                <span class="wg-sound-label">${slot.label}</span>
                <select class="wg-sound-select wg-clip-input" aria-label="${this._esc(mon.display)} ${slot.label} sound">${options(slot.key, mine[slot.key] || '')}</select>
                <button type="button" class="wg-sound-play" title="Preview selected monster sound" aria-label="Preview ${slot.label} sound">▶</button>
            </div>`).join('')
            + `<div class="wg-sfx-note">Empty = the engine's automatic type-aware pick. Saved per monster to <code>wg_monster_sound_map</code> and pushed live.</div>`;
        host.querySelectorAll('.wg-sound-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const slot = sel.closest('.wg-sound-row').dataset.soundSlot;
                const next = this._loadSoundMap();
                const current = { ...(next[sKey] || {}) };
                if (sel.value) current[slot] = sel.value;
                else delete current[slot];
                if (Object.keys(current).length) next[sKey] = current;
                else delete next[sKey];
                this._saveSoundMap(next);
                if (sel.value && byTag[sel.value]) this._auditionSfx(byTag[sel.value].path);   // hear what you just picked [REF#UI-00793]
            });
        });
        host.querySelectorAll('.wg-sound-play').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.closest('.wg-sound-row').querySelector('.wg-sound-select')?.value;
                if (!tag) return;
                // Local audition first (always works), then ask the engine to play it spatially if it can. [REF#UI-00794]
                if (byTag[tag]) this._auditionSfx(byTag[tag].path);
                try { window.parent.postMessage({ type: 'PLAY_MONSTER_SOUND', monsterKey: sKey, tag }, '*'); } catch (_) {}
            });
        });
    }

    // GAMBLING + ORPHAN SFX REFERENCE (Mark 2026-07-19: "I also need a tab for sound fx - which ones [REF#UI-00795]
    // they use for gambling results too").
    // ⚠ READ-ONLY ON PURPOSE, and the UI says so. Monster sounds are re-mappable because the engine
    // routes them through a TAG TABLE (_MON_SFX) that an override can intercept. Gambling sounds have
    // no such table — every one is an inline string literal at its call site, so there is nothing to
    // key an override off. Shipping editable-looking dropdowns here would be the exact lie this
    // refactor is removing. They are listed with file:line so the wiring is findable, and ▶ auditions
    // the real file. Making them editable = giving them a tag table first; that is a separate change.
    _renderGamblingSfx() {
        const host = document.getElementById('wg-gamble-sfx');
        if (!host) return;
        const games = [...new Set(GAMBLING_SFX_CATALOG.map(s => s.game))];
        host.innerHTML = games.map(g => `
            <div class="wg-sfx-group">
                <div class="wg-sfx-group-head">${this._esc(g)}</div>
                ${GAMBLING_SFX_CATALOG.filter(s => s.game === g).map(s => `
                    <div class="wg-sfx-row${s.path ? '' : ' is-silent'}">
                        <span class="wg-sfx-ev">${s.event.startsWith('★') ? '<b>' + this._esc(s.event) + '</b>' : this._esc(s.event)}</span>
                        <span class="wg-sfx-file" title="${this._esc(s.ref)}">${this._esc(s.file)}</span>
                        ${s.path ? `<button type="button" class="wg-sound-play wg-sfx-play" data-sfx-path="${this._esc(s.path)}" data-sfx-vol="${s.vol}" title="Audition ${this._esc(s.file)}">▶</button>` : '<span class="wg-sfx-none">—</span>'}
                    </div>`).join('')}
            </div>`).join('')
            + `<div class="wg-sfx-group">
                <div class="wg-sfx-group-head">UNMAPPED FILES ON DISK</div>
                ${MONSTER_SOUND_ORPHANS.map(o => `
                    <div class="wg-sfx-row">
                        <span class="wg-sfx-ev">${this._esc(o.file)}</span>
                        <span class="wg-sfx-file" title="${this._esc(o.note)}">${this._esc(o.note.split('.')[0])}</span>
                        <button type="button" class="wg-sound-play wg-sfx-play" data-sfx-path="${this._esc(o.path)}" data-sfx-vol="0.85" title="Audition ${this._esc(o.file)}">▶</button>
                    </div>`).join('')}
            </div>
            <div class="wg-sfx-note">These are a <b>reference</b>, not an editor: gambling cues are inline call-site literals with no tag table behind them, so there is nothing to override yet. Hover a filename for its <code>file:line</code>. Two results (Blackjack PUSH, HOUSE WINS) and <b>the entire slot machine</b> are silent today.</div>`;
        host.querySelectorAll('.wg-sfx-play').forEach(btn => {
            btn.addEventListener('click', () => this._auditionSfx(btn.dataset.sfxPath, parseFloat(btn.dataset.sfxVol) || 0.85));
        });
    }

    _setClipOverride(monKey, actionKey, value) {
        if (!this._clipOverrides[monKey]) this._clipOverrides[monKey] = {};
        if (value) this._clipOverrides[monKey][actionKey] = value;
        else delete this._clipOverrides[monKey][actionKey];
        this._saveClipOverrides();
        // Broadcast to the engine. ⚠ THE OLD NOTE HERE ("nothing consumes it … no reader exists") IS STALE and [REF#UI-00796]
        // was actively misleading — the engine HAS read this since 2026-07-12: it loads 'wg_monster_anim_map'
        // from localStorage at ~26212 and picks mapped clips through _animMapPick/_animMapHas, with live edits
        // arriving via MONSTER_ANIM_MAP_SET. Verified 2026-07-19.
        // Deliberately NOT sent as a combat/anomaly event so it can't dirty
        // Oni-Baba's silence/tension sensors (see SIA).
        if (actionKey !== 'notes') {
            try {
                window.parent.postMessage({
                    type: 'UPDATE_MONSTER_CLIP_MAP',
                    monsterKey: monKey, actionKey, clipName: value || null,
                    source: 'welcome_guide_setup',
                }, '*');
            } catch (_) {}
        }
    }

    // ── EXPLICIT SAVE, WITH PROOF (Mark 2026-08-05) ───────────────────────────────────────────── [REF#UI-00797]
    //    "for monster settings have a SAVE button so I know you keep the changes and updates made."
    //    The tuning already writes on every edit, so this is not adding persistence — it is adding
    //    EVIDENCE of it. It re-writes both stores, then READS THEM BACK and reports the byte count and
    //    the time. A save button that only says "Saved!" is exactly the kind of control this page was
    //    refactored to remove (three were found dead on 2026-07-19); this one cannot claim success
    //    unless localStorage actually returns what was just written.
    // ── SAVE = WHAT LOADS (2026-10-02, knowledge/design/MONSTER_PAGE_SAVE_2026-10-02.md) ──────────────────────────────────
    //    Mark 2026-10-02: "add save button to monster page - so it saves what I change - it seems to change every load".
    //    The 08-05 button sat inside the ATTRIBUTES tab only, re-wrote only the AI tuning + clip overrides, and nothing read it
    //    back at load. Now SAVE takes ONE SNAPSHOT of every monster setting this page owns — animations, ALWAYS-VIOLENT, sound,
    //    clip overrides, AI tuning — into 'wg_monster_saved', reads it back, and names the time and the ADDRESS it was saved on.
    //    Every load restores that snapshot over the five live keys and pushes it to the engine (_restoreMonsterSaved), so the last
    //    SAVE is what loads; an edit after it is live at once and marked UNSAVED until SAVE. localStorage belongs to one exact
    //    address (host AND port): a game opened on another port starts empty, which the "saved on" line makes visible.
    _monSettingKeys() {
        return { anim: 'wg_monster_anim_map', violent: 'wg_monster_violent', sound: 'wg_monster_sound_map', clip: 'wg_monster_clip_overrides', ai: 'wg_monster_ai_settings' };
    }
    _monSavedRead() { try { return JSON.parse(localStorage.getItem('wg_monster_saved') || 'null'); } catch (_) { return null; } }
    _restoreMonsterSaved() {
        const S = this._monSavedRead();
        if (!S || S.v !== 1 || !S.maps) return;
        const K = this._monSettingKeys();
        try { for (const k of Object.keys(K)) localStorage.setItem(K[k], JSON.stringify(S.maps[k] || {})); } catch (_) {}
        try { localStorage.removeItem('wg_monster_dirty'); } catch (_) {}
        // the engine may have read the keys before this ran — tell it, now and again once it has surely booted [REF#UI-01487]
        const push = () => {
            try { window.parent.postMessage({ type: 'MONSTER_ANIM_MAP_SET', map: S.maps.anim || {} }, '*'); } catch (_) {}
            try { window.parent.postMessage({ type: 'MONSTER_VIOLENT_SET', map: S.maps.violent || {} }, '*'); } catch (_) {}
            try { window.parent.postMessage({ type: 'MONSTER_SOUND_MAP_SET', map: S.maps.sound || {} }, '*'); } catch (_) {}
        };
        push(); setTimeout(push, 5000); setTimeout(push, 20000);
        this._monRestoredAt = S.at;
    }
    _monMarkDirty() {
        if (this._monSaving) return;
        try { localStorage.setItem('wg_monster_dirty', '1'); } catch (_) {}
        this._monSaveStatus();
    }
    _monSaveStatus() {
        const note = document.getElementById('wg-mon-save-note'), btn = document.getElementById('wg-mon-save');
        if (!note) return;
        const S = this._monSavedRead();
        let dirty = false; try { dirty = localStorage.getItem('wg_monster_dirty') === '1'; } catch (_) {}
        const when = S && S.at ? new Date(S.at).toLocaleString() : null;
        if (btn) btn.classList.toggle('is-dirty', dirty);
        if (dirty) { note.textContent = '● UNSAVED changes — live now; press SAVE or the next load goes back to ' + (when ? 'your save of ' + when : 'the defaults'); note.className = 'wg-save-note is-bad'; return; }
        note.textContent = when ? '✓ saved ' + when + ' on ' + (S.origin || '?') + ' — this is what loads' : 'never saved on ' + location.host + ' — press SAVE to keep your changes';
        note.className = 'wg-save-note ' + (when ? 'is-ok' : '');
    }
    _bindMonsterSave() {
        const btn = document.getElementById('wg-mon-save');
        if (!btn) return;
        this._monSaveStatus();
        if (btn._saveBound) return;
        btn._saveBound = true;
        btn.addEventListener('click', () => {
            const note = document.getElementById('wg-mon-save-note');
            const say = (msg, ok) => { if (note) { note.textContent = msg; note.className = 'wg-save-note ' + (ok ? 'is-ok' : 'is-bad'); } };
            try {
                // the in-memory stores first (their sliders and rows write through these), then one snapshot of all five keys [REF#UI-01488]
                this._monSaving = true;
                try { this._saveAiSettings(); if (typeof this._saveClipOverrides === 'function') this._saveClipOverrides(); } finally { this._monSaving = false; }
                const K = this._monSettingKeys(), maps = {};
                for (const k of Object.keys(K)) { try { maps[k] = JSON.parse(localStorage.getItem(K[k]) || '{}') || {}; } catch (_) { maps[k] = {}; } }
                const S = { v: 1, at: Date.now(), origin: location.host, maps };
                const raw = JSON.stringify(S);
                localStorage.setItem('wg_monster_saved', raw);
                // READ BACK — the only thing that distinguishes "saved" from "believed saved". [REF#UI-00799]
                if (localStorage.getItem('wg_monster_saved') !== raw) { say('✗ storage did not return what was written — NOT saved', false); return; }
                try { localStorage.removeItem('wg_monster_dirty'); } catch (_) {}
                const n = (o) => Object.keys(o || {}).length;
                say('✓ saved ' + new Date(S.at).toLocaleTimeString() + ' on ' + S.origin + ' · animations ' + n(maps.anim) + ' · violent ' + n(maps.violent)
                    + ' · sounds ' + n(maps.sound) + ' · AI ' + n(maps.ai) + ' monsters — this is what loads', true);
                btn.classList.remove('is-dirty');
            } catch (e) {
                say('✗ save failed: ' + String((e && e.message) || e).slice(0, 60), false);
            }
        });
    }

    _loadAiSettings() {
        try {
            const raw = localStorage.getItem('wg_monster_ai_settings');
            return raw ? JSON.parse(raw) : {};
        } catch (_) { return {}; }
    }
    _saveAiSettings() {
        try {
            localStorage.setItem('wg_monster_ai_settings', JSON.stringify(this._aiSettings));
        } catch (_) {}
        this._monMarkDirty();
    }
    _renderAiSettings(mon) {
        const host = document.getElementById('wg-ai-rows');
        if (!host) return;

        // SUCCUBI TEST STATUE (Mark 2026-07-05): live tuning sliders instead of the flee rows — [REF#UI-00801]
        // she has no combat AI yet. Each input posts SUCCUBI_TUNE through the shell relay
        // (OrigamiUnderworld.html whitelist case) to the engine's live applier in the cabaret builder.
        // X/Z are RELATIVE tile offsets from her stage placement (the engine owns the defaults).
        if (mon.key === 'succubus' || mon.key === 'succubi') { this._renderSuccubiTune(host); this._renderSucStageDances(host); return; }   // accept BOTH: catalog key is now singular (Mark 2026-07-19 "succubi no longer exists, succubus"), alias kept so nothing that still passes the old key breaks. STAGE DANCES appended after — it drives the LIVE monster, unlike the statue sliders above (Mark 2026-07-19). [REF#UI-00802]

        const settings = this._aiSettings[mon.key] || {};
        const fleeHp = settings.fleeHp !== undefined ? settings.fleeHp : (mon.key === 'gobl_normal' ? 0.35 : 0.25);
        const fleeSpeed = settings.fleeSpeed !== undefined ? settings.fleeSpeed : 2.0;

        // ⚠ MEASURED DEAD 2026-07-19. These two sliders write localStorage 'wg_monster_ai_settings' and post [REF#UI-00803]
        // UPDATE_MONSTER_AI_SETTINGS — but that message has NO case in the shell relay whitelist
        // (OrigamiUnderworld.html, which has no default case, so it is silently dropped) AND no reader in
        // NewOrigami.Engine9.html. Dragging them has never changed anything in-game. Kept and BADGED rather
        // than removed, because the intent is good and wiring them is a small, separate change.
        host.innerHTML = `
            <div class="wg-ai-dead">⚠ NOT WIRED — these two write to storage but no relay case and no engine reader exist, so they do not affect play yet.</div>
            <div class="wg-ai-row">
                <span class="wg-ai-label">Flee HP %</span>
                <input type="range" class="wg-ai-slider" data-setting="fleeHp" min="0" max="100" value="${Math.round(fleeHp * 100)}" />
                <span class="wg-ai-value" id="val-fleeHp">${Math.round(fleeHp * 100)}%</span>
            </div>
            <div class="wg-ai-row">
                <span class="wg-ai-label">Flee Speed</span>
                <input type="range" class="wg-ai-slider" data-setting="fleeSpeed" min="10" max="40" value="${Math.round(fleeSpeed * 10)}" />
                <span class="wg-ai-value" id="val-fleeSpeed">${fleeSpeed.toFixed(1)}x</span>
            </div>
        `;

        host.querySelectorAll('.wg-ai-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const type = e.target.dataset.setting;
                const val = parseFloat(e.target.value);
                const displayVal = type === 'fleeHp' ? `${val}%` : `${(val / 10).toFixed(1)}x`;
                document.getElementById(`val-${type}`).textContent = displayVal;
                
                if (!this._aiSettings[mon.key]) this._aiSettings[mon.key] = {};
                this._aiSettings[mon.key][type] = type === 'fleeHp' ? (val / 100) : (val / 10);
                this._saveAiSettings();

                try {
                    window.parent.postMessage({
                        type: 'UPDATE_MONSTER_AI_SETTINGS',
                        monsterKey: mon.key,
                        settings: this._aiSettings[mon.key]
                    }, '*');
                } catch (_) {}
            });
        });
    }

    // ── LIVE STAGE DANCES (Mark 2026-07-19: "add succubus full settings including stage animations now") ── [REF#UI-00804]
    // Everything else on this panel posts SUCCUBI_TUNE, which lands in a listener nested inside the succubi
    // TEST-STATUE block — disabled since 2026-07-11, when Dancer became a real monster. So those controls have
    // been tuning an object that is not in the scene. This section is deliberately separate: it posts
    // SUC_STAGE_DANCES to a top-level engine handler that drives the LIVE monster and re-cues her immediately.
    // WHY AN ALLOW-LIST: her stage rotation is built by _startCabDance, whose name regex matches jump|spin|kick|
    // flip — so it kept selecting 360_Power_Spin_Jump and Large_step_then_high_kick, which travel ~1.1wu while
    // her collider stays pinned ("flying all over the walls"). Choosing 1-3 in-place clips here is the fix.
    // Clip names are her real rig inventory; the engine warns loudly on any name it cannot find.
    _renderSucStageDances(host) {
        const CLIPS = ['Hip_Hop_Dance_4', 'Shake_It_Off_Dance', 'Flirty_Strut_inplace', 'All_Night_Dance',
                       'Confident_Walk', '360_Power_Spin_Jump', 'Large_step_then_high_kick', 'Zombie_Scream'];
        const TRAVELS = { '360_Power_Spin_Jump': 1, 'Large_step_then_high_kick': 1 };   // flagged in the UI — these are the ones that threw her across the stage [REF#UI-00805]
        const DEFAULTS = ['Hip_Hop_Dance_4', 'Shake_It_Off_Dance', 'Flirty_Strut_inplace'];
        let picked = DEFAULTS.slice();
        try { const s = JSON.parse(localStorage.getItem('wg_suc_stage_dances') || 'null'); if (Array.isArray(s) && s.length) picked = s.slice(0, 3); } catch (_) {}
        // Her resting pose when the dance stops. Default is the one clip authored in-place, so an idle can never [REF#UI-00806]
        // reintroduce the travelling problem the dance allow-list exists to solve.
        let idlePick = 'Flirty_Strut_inplace';
        try { const i = localStorage.getItem('wg_suc_idle_clip'); if (typeof i === 'string' && i) idlePick = i; } catch (_) {}
        // Crew dance-on-song (Mark 2026-07-19). Default ON. Crew whose model has no dance clip sway instead — [REF#UI-00807]
        // that is handled engine-side by _startCabDance, not something this toggle needs to know about.
        let crewDance = true;
        try { const c = localStorage.getItem('wg_cab_crew_dance'); if (c === '0') crewDance = false; } catch (_) {}
        const opts = (sel) => ['<option value="">— none —</option>'].concat(
            CLIPS.map(c => `<option value="${c}"${c === sel ? ' selected' : ''}>${c.replace(/_/g, ' ')}${TRAVELS[c] ? ' ⚠ travels' : ''}</option>`)).join('');
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="wg-ai-row" style="margin-top:10px;border-top:1px solid rgba(34,211,238,.25);padding-top:8px;">
                <span class="wg-ai-label" style="letter-spacing:1px;">STAGE DANCES</span>
                <span class="wg-ai-value" style="flex:1;text-align:right;opacity:.7;">pick 1–3 · applies live</span>
            </div>` + [0, 1, 2].map(i => `
            <div class="wg-ai-row">
                <span class="wg-ai-label">Dance ${i + 1}</span>
                <select class="wg-ai-slider suc-stage-dance" data-idx="${i}" style="flex:1;min-width:0;background:rgba(10,18,26,.85);color:#cfefff;border:1px solid rgba(34,211,238,.35);border-radius:6px;padding:2px 4px;">${opts(picked[i] || '')}</select>
            </div>`).join('') + `
            <div class="wg-ai-row">
                <span class="wg-ai-label">Idle (not dancing)</span>
                <select class="wg-ai-slider suc-idle-clip" style="flex:1;min-width:0;background:rgba(10,18,26,.85);color:#cfefff;border:1px solid rgba(34,211,238,.35);border-radius:6px;padding:2px 4px;">${opts(idlePick)}</select>
            </div>
            <div class="wg-ai-row">
                <span class="wg-ai-label">Crew dance on song</span>
                <input type="checkbox" class="wg-ai-slider suc-crew-dance" ${crewDance ? 'checked' : ''} style="width:auto;flex:0 0 auto;" />
                <span class="wg-ai-value" id="val-crew-dance">${crewDance ? 'ON' : 'OFF'}</span>
            </div>
            <div class="wg-sfx-note">⚠ marked clips travel ~1.1 tiles while her collider stays put — that is the "flying" look. Idle is what she holds when the dance stops (her rig has no clip literally named "idle"). Crew dance = the imp/goblin/mummy break into dance while the song plays; models with no dance clip just sway instead. Saved to <code>wg_suc_stage_dances</code> / <code>wg_suc_idle_clip</code> / <code>wg_cab_crew_dance</code>.</div>`;
        host.appendChild(wrap);
        const push = () => {
            const sels = Array.from(host.querySelectorAll('.suc-stage-dance'));
            const clips = sels.map(s => s.value).filter(Boolean);
            const idleSel = host.querySelector('.suc-idle-clip');
            const idle = idleSel ? idleSel.value : '';
            const crewEl = host.querySelector('.suc-crew-dance');
            const crew = crewEl ? !!crewEl.checked : true;
            const lbl = document.getElementById('val-crew-dance'); if (lbl) lbl.textContent = crew ? 'ON' : 'OFF';
            try { localStorage.setItem('wg_suc_stage_dances', JSON.stringify(clips)); } catch (_) {}
            try { localStorage.setItem('wg_suc_idle_clip', idle); } catch (_) {}
            try { localStorage.setItem('wg_cab_crew_dance', crew ? '1' : '0'); } catch (_) {}
            try { window.parent.postMessage({ type: 'SUC_STAGE_DANCES', clips, idle, crewDance: crew }, '*'); } catch (_) {}
        };
        host.querySelectorAll('.suc-stage-dance').forEach(s => s.addEventListener('change', push));
        host.querySelectorAll('.suc-idle-clip').forEach(s => s.addEventListener('change', push));
        host.querySelectorAll('.suc-crew-dance').forEach(s => s.addEventListener('change', push));
        push();   // push the persisted set on open so the engine matches what the panel shows [REF#UI-00808]
    }

    _renderSuccubiTune(host) {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem('wg_succubi_tune') || '{}'); } catch (_) {}
        const v = (k, d) => (saved[k] !== undefined ? saved[k] : d);
        // slider raw value → engine value: h ÷100 (m), x/z ÷10 (tiles), opacity/tint ÷100 [REF#UI-00809]
        const rows = [
            { k: 'h',       label: 'Height',  min: 50,   max: 300, val: v('h', 175),    fmt: (r) => `${(r / 100).toFixed(2)}m` },   // 1.75 = goblin height
            { k: 'x',       label: 'X Shift', min: -100, max: 100, val: v('x', 0),      fmt: (r) => `${(r / 10).toFixed(1)} tiles` },
            { k: 'z',       label: 'Z Shift', min: -100, max: 100, val: v('z', 0),      fmt: (r) => `${(r / 10).toFixed(1)} tiles` },
            { k: 'opacity', label: 'Opacity', min: 0,    max: 100, val: v('opacity', 90), fmt: (r) => `${r}%` },   // 0.90 = live-monster body alpha
            { k: 'tint',    label: 'Tint',    min: 0,    max: 100, val: v('tint', 0),   fmt: (r) => `${r}%` },
        ];
        // ANIMATION slots (Mark 2026-07-05 "one current animation and a drop down selector … idle, [REF#UI-00810]
        // walking, idle 2, attack, special"): the engine publishes her real clip inventory to
        // localStorage 'origami.succubiClips' at load (all frames same-origin), and reads the slot
        // map back from 'origami.succubiTest' at every boot — so a changed idle STICKS.
        const SLOT_DEFAULTS = { idle: 'Bubble_Dance', walking: 'Walking', idle2: 'Formal_Bow', attack: 'Attack', special: 'Backflip_and_Hooks' };
        const SLOT_LABELS = [['idle', 'Idle'], ['walking', 'Walking'], ['idle2', 'Idle 2'], ['attack', 'Attack'], ['special', 'Special']];
        let clips = [];
        try { clips = JSON.parse(localStorage.getItem('origami.succubiClips') || '[]'); } catch (_) {}
        if (!Array.isArray(clips) || !clips.length) clips = Object.values(SLOT_DEFAULTS);   // pre-first-load fallback [REF#UI-00811]
        let cfg = { slots: Object.assign({}, SLOT_DEFAULTS), current: 'idle' };
        try { const raw = localStorage.getItem('origami.succubiTest'); if (raw) { const p = JSON.parse(raw); if (p && p.slots) cfg.slots = Object.assign({}, SLOT_DEFAULTS, p.slots); if (p && p.current) cfg.current = p.current; } } catch (_) {}
        const saveCfg = () => { try { localStorage.setItem('origami.succubiTest', JSON.stringify(cfg)); } catch (_) {} };
        const optionsFor = (sel) => clips.map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c.replace(/_/g, ' ')}</option>`).join('');
        host.innerHTML = rows.map(r => `
            <div class="wg-ai-row">
                <span class="wg-ai-label">${r.label}</span>
                <input type="range" class="wg-ai-slider" data-setting="${r.k}" min="${r.min}" max="${r.max}" value="${r.val}" />
                <span class="wg-ai-value" id="val-succubi-${r.k}">${r.fmt(r.val)}</span>
            </div>`).join('') + `
            <div class="wg-ai-row">
                <span class="wg-ai-label">Spin</span>
                <input type="checkbox" class="wg-ai-slider" data-setting="spin" ${v('spin', 0) ? 'checked' : ''} style="width:auto;flex:0 0 auto;" />
                <span class="wg-ai-value" id="val-succubi-spin">${v('spin', 0) ? 'ON' : 'OFF'}</span>
            </div>
            <div class="wg-ai-row" style="margin-top:8px;">
                <span class="wg-ai-label" style="letter-spacing:1px;">NOW PLAYING</span>
                <span class="wg-ai-value" id="succubi-now" style="flex:1;text-align:right;">${(cfg.slots[cfg.current] || '—').replace(/_/g, ' ')} <em style="opacity:.6;">(${cfg.current})</em></span>
            </div>` + SLOT_LABELS.map(([k, label]) => `
            <div class="wg-ai-row">
                <span class="wg-ai-label">${label}</span>
                <select class="wg-ai-slider succubi-clip-sel" data-slot="${k}" style="flex:1;min-width:0;background:rgba(10,18,26,.85);color:#cfefff;border:1px solid rgba(34,211,238,.35);border-radius:6px;padding:2px 4px;">${optionsFor(cfg.slots[k])}</select>
                <button class="succubi-clip-play" data-slot="${k}" title="Play this slot now" style="flex:0 0 auto;background:${k === cfg.current ? 'rgba(34,211,238,.30)' : 'rgba(34,211,238,.12)'};color:#7be0ff;border:1px solid rgba(34,211,238,.4);border-radius:6px;padding:2px 8px;cursor:pointer;">▶</button>
            </div>`).join('');
        const scale = { h: 100, x: 10, z: 10, opacity: 100, tint: 100 };
        const post = (k, out) => { try { window.parent.postMessage({ type: 'SUCCUBI_TUNE', k, v: out, source: 'welcome_guide_setup' }, '*'); } catch (_) {} };
        const refreshNow = () => {
            const now = document.getElementById('succubi-now');
            if (now) now.innerHTML = `${(cfg.slots[cfg.current] || '—').replace(/_/g, ' ')} <em style="opacity:.6;">(${cfg.current})</em>`;
            host.querySelectorAll('.succubi-clip-play').forEach(b => { b.style.background = (b.dataset.slot === cfg.current) ? 'rgba(34,211,238,.30)' : 'rgba(34,211,238,.12)'; });
        };
        host.querySelectorAll('input.wg-ai-slider').forEach(el => {
            el.addEventListener('input', (e) => {
                const k = e.target.dataset.setting;
                let raw, out;
                if (k === 'spin') {
                    raw = e.target.checked ? 1 : 0; out = !!raw;
                    document.getElementById('val-succubi-spin').textContent = raw ? 'ON' : 'OFF';
                } else {
                    raw = parseFloat(e.target.value); out = raw / scale[k];
                    const row = rows.find(r => r.k === k);
                    document.getElementById(`val-succubi-${k}`).textContent = row.fmt(raw);
                }
                saved[k] = raw;
                try { localStorage.setItem('wg_succubi_tune', JSON.stringify(saved)); } catch (_) {}
                post(k, out);
            });
        });
        host.querySelectorAll('.succubi-clip-sel').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const slot = e.target.dataset.slot;
                cfg.slots[slot] = e.target.value;
                saveCfg();
                if (slot === cfg.current) post('clip', cfg.slots[slot]);
                refreshNow();
            });
        });
        host.querySelectorAll('.succubi-clip-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const slot = e.target.dataset.slot;
                cfg.current = slot;
                saveCfg();
                post('clip', cfg.slots[slot]);
                refreshNow();
            });
        });
    }

    // ════════════════════════════════════════════════════════════════════ [REF#UI-00812]
    // PLAYER AVATAR DATABASE (spread 4 / pages 9-10)
    // ════════════════════════════════════════════════════════════════════
    _selectAvatar(id) {
        const av = this.avatarDB.find(a => a.id === id);
        if (!av) return;
        this._selectedAvatarId = id;
        const host = document.getElementById('wg-avatar-list');
        if (host) {
            host.querySelectorAll('.wg-avatar-row').forEach(r => {
                r.classList.toggle('selected', r.dataset.avatarId === id);
            });
        }
        this._renderAvatarDetail(av);
        this._mountAvatarPreview(av);
    }

    _renderAvatarDetail(av) {
        const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        setTxt('wg-av-title', av.display);
        setTxt('wg-av-rigtag', av.isLiveRig ? 'LIVE RIG' : 'ON DISK');
        setTxt('wg-av-model', av.model.split('/').pop());
        setTxt('wg-av-scale', av.scale + '×');
        setTxt('wg-av-rolecount', String(av.rolesSupported.length));
        setTxt('wg-av-note', av.note || '');
        const designs = document.getElementById('wg-av-designs');
        if (designs) designs.innerHTML = (av.codedDesigns || []).map(d => `<li>${d}</li>`).join('');
        const roles = document.getElementById('wg-av-roles');
        if (roles) {
            roles.innerHTML = av.rolesSupported.map(rid => {
                const r = this.roles.find(x => x.id === rid);
                const label = r ? r.name : rid;
                const cls = r ? r.cls : '';
                return `<span class="wg-av-role-chip ${cls}">${label}</span>`;
            }).join('');
        }
    }

    // ════════════════════════════════════════════════════════════════════ [REF#UI-00813]
    // CHARACTER SHEET (spread 5 / pages 11-12 — "Page 10")
    // ════════════════════════════════════════════════════════════════════
    // The player's avatar + the LIVE stat block. The guide runs in the same
    // (Panels) iframe as the action-rail HUD, so we read the canonical values
    // straight off that DOM (#player-* / #attr-*) and from window.playerStats
    // — never fabricate numbers. The avatar picks the rig that fronts the
    // selected role (falls back to Player A).
    _avatarForRole(roleId) {
        return getAvatarForRole(roleId);
    }
    _mountCharacterPreview() {
        const role = (typeof window !== 'undefined' && window.selectedRole) ? window.selectedRole : this._selectedRole;
        const av = this._avatarForRole(role);
        const tag = document.getElementById('wg-char-rigtag');
        if (tag) tag.textContent = av.isLiveRig ? 'LIVE RIG' : 'HERO';
        // Same shared-engine preview as the avatar DB (rotated 180° to face us). [REF#UI-00814]
        this._mountPreviewModel('wg-char-preview', av.animModel || av.model, av.scale, { faceY: Math.PI });
    }
    // Read a numeric value out of a HUD element by id (text content), with a [REF#UI-00815]
    // fallback. Tolerates "100", "100 / 100", "/ 100 HP" style strings.
    _readHudNum(id, fallback) {
        const el = document.getElementById(id);
        if (!el) return fallback;
        const m = String(el.textContent || '').match(/-?\d+/);
        return m ? parseInt(m[0], 10) : fallback;
    }
    _renderCharacterSheet() {
        const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        const ps = (typeof window !== 'undefined' && window.playerStats) ? window.playerStats : {};
        const role = (typeof window !== 'undefined' && window.selectedRole) ? window.selectedRole : this._selectedRole;
        const roleDef = this.roles.find(r => r.id === role);
        setTxt('wg-char-role', roleDef ? roleDef.name : (role ? String(role).toUpperCase() : 'ADVENTURER'));
        const kanjiEl = document.getElementById('wg-char-kanji');
        if (kanjiEl) kanjiEl.textContent = roleDef ? roleDef.kanji : '勇';

        // Vitals — prefer the live window mirrors the engine pushes via [REF#UI-00816]
        // SYNC_STATS; fall back to the HUD DOM, then to a sane default.
        const hp    = (typeof window !== 'undefined' && typeof window.playerHp === 'number') ? window.playerHp : this._readHudNum('player-hp-val', 100);
        const maxHp = (typeof window !== 'undefined' && typeof window.playerMaxHp === 'number') ? window.playerMaxHp : this._readHudNum('player-hp-max', 100);
        const level = (typeof window !== 'undefined' && typeof window.playerLevel === 'number') ? window.playerLevel : (ps.level || this._readHudNum('player-level-val', 1));
        const gold  = (typeof window !== 'undefined' && typeof window.playerGold === 'number') ? window.playerGold : this._readHudNum('player-gold-val', 0);
        const xp    = this._readHudNum('player-xp-val', ps.xp || 0);
        const maxXp = this._readHudNum('player-xp-max', 100);
        const skill = (typeof ps.skillPoints === 'number') ? ps.skillPoints : 0;
        setTxt('wg-cs-level', String(level));
        setTxt('wg-cs-hp',    `${hp} / ${maxHp}`);
        setTxt('wg-cs-gold',  String(gold));
        setTxt('wg-cs-xp',    `${xp} / ${maxXp}`);
        setTxt('wg-cs-skill', String(skill));
        setTxt('wg-cs-ac',    String(this._computeAC()));

        // Ability scores — read the action-rail STR/DEX/CON/INT/WIS/CHA DOM [REF#UI-00817]
        // (same iframe). These IDs are the canonical block in Panels.html.
        const attrs = [
            ['STR', 'attr-str'], ['DEX', 'attr-dex'], ['CON', 'attr-con'],
            ['INT', 'attr-int'], ['WIS', 'attr-wis'], ['CHA', 'attr-cha'],
        ];
        const grid = document.getElementById('wg-attr-grid');
        if (grid) {
            grid.innerHTML = attrs.map(([k, domId]) => {
                const v = this._readHudNum(domId, 10);
                const mod = Math.floor((v - 10) / 2);
                const modStr = (mod >= 0 ? '+' : '') + mod;
                return `<div class="wg-attr-cell">
                    <span class="wg-attr-k">${k}</span>
                    <b class="wg-attr-v">${v}</b>
                    <span class="wg-attr-mod">${modStr}</span>
                </div>`;
            }).join('');
        }

        // Equipped summary — what the gear screen has on, with AC contribution. [REF#UI-00818]
        const eqList = document.getElementById('wg-cs-equipped');
        if (eqList) {
            const worn = this.EQUIP_SLOTS
                .map(s => ({ slot: s, item: this._itemById(this.equipment[s.id]) }))
                .filter(e => e.item);
            eqList.innerHTML = worn.length
                ? worn.map(e => `<li><b>${e.slot.label}:</b> ${e.item.id} <span class="wg-eq-ac">+${e.item.ac} AC</span></li>`).join('')
                : '<li class="wg-eq-empty">Nothing equipped yet.</li>';
        }
    }

    // ════════════════════════════════════════════════════════════════════ [REF#UI-00819]
    // EQUIPMENT (spread 6 / pages 13-14 — "Page 11")
    // ════════════════════════════════════════════════════════════════════
    _itemById(id) {
        if (!id) return null;
        const it = this.EQUIP_ITEMS.find(i => i.id === id);
        if (it) return it;
        // WEAPONS ARE ITEMS TOO (2026-09-20, the one-list inventory): a melee / ranged weapon resolves to a virtual item whose [REF#UI-01377]
        // slot is the figure's hand, so the same drag validation, drop and tap code serves it. `kind: 'WEAPON'`. [REF#PENDING]
        const m = this.MELEE_WEAPONS.find(w => w.id === id); if (m) return { id: m.id, slot: 'MELEE', kind: 'WEAPON', kanji: m.kanji, desc: m.desc, attr: m.attr, ac: 0, weight: m.weight || 0 };
        const r = this.RANGED_WEAPONS.find(w => w.id === id); if (r) return { id: r.id, slot: 'RANGED', kind: 'WEAPON', kanji: r.kanji, desc: r.desc, attr: r.attr, ac: 0, weight: r.weight || 0, show: r.show };
        return null;
    }
    // Base 10 + every equipped item's AC. Surfaced on the character sheet. [REF#UI-00820]
    _computeAC() {
        let ac = 10;
        for (const s of this.EQUIP_SLOTS) {
            const item = this._itemById(this.equipment[s.id]);
            if (item) ac += (item.ac || 0);
        }
        return ac;
    }
    // Sum of qty × weight across everything in window.cardInventoryCounts (carried, not just [REF#PENDING] [REF#UI-01378]
    // equipped — Mark 2026-09-20: "the player weight will be a problem"). Catalog items (weapons/armour)
    // use their real weight; every other ledger entry (spells, consumables, loose cards) counts a flat
    // 0.5 lb each so a pile of hundreds of uncataloged cards still weighs something. Surfaced on the
    // character sheet next to AC; also mirrored onto window.parent for the engine's movement penalty
    // (see _renderEquipment()) since Panels and the engine are sibling iframes off the same shell.
    _computeCarryWeight() {
        const counts = (typeof window !== 'undefined' && window.cardInventoryCounts) ? window.cardInventoryCounts : {};
        let total = 0;
        for (const key of Object.keys(counts)) {
            const qty = counts[key] || 0;
            if (qty <= 0) continue;
            const item = this._itemById(key);
            total += qty * (item ? (item.weight || 0) : 0.5);
        }
        return Math.round(total * 10) / 10;
    }
    // Compute + mirror carry weight onto window.parent WITHOUT touching the DOM — called on every [REF#PENDING] [REF#UI-01379]
    // pickup (Panels' ADD_CARD/SET_CARD_QTY handlers), not just when the equipment screen happens to be
    // rendering, so the engine's movement penalty can never go stale off a closed inventory screen.
    // _renderEquipment() also calls this (it needs the numbers for the on-screen note) rather than
    // duplicating the math.
    _syncCarryWeight() {
        const w = this._computeCarryWeight(), max = this.MAX_CARRY_WEIGHT, over = w > max;
        try { if (typeof window !== 'undefined' && window.parent) { window.parent._carryWeight = w; window.parent._carryWeightMax = max; window.parent._carryOverweight = over; } } catch (_) {}
        return { w, max, over };
    }
    // The player's equippable inventory. We surface (a) every catalog item the [REF#UI-00821]
    // player OWNS per window.cardInventoryCounts, and (b) the full catalog as
    // a fallback so the screen is usable before any loot drops (first
    // increment). Already-equipped items are flagged so the list shows state.
    _ownedEquipItems() {
        const counts = (typeof window !== 'undefined' && window.cardInventoryCounts) ? window.cardInventoryCounts : {};
        const ownedIds = new Set(this.EQUIP_ITEMS.filter(i => (counts[i.id] || 0) > 0).map(i => i.id));
        // Strict ownership: only show items the player has picked up (counts > 0) [REF#UI-00822]
        // or that are currently equipped (so they don't disappear if loaded from a save).
        return this.EQUIP_ITEMS
            .filter(i => ownedIds.has(i.id) || this.equipment[i.slot] === i.id)
            .map(i => ({
                ...i,
                owned: ownedIds.has(i.id),
                count: counts[i.id] || 0,
                equipped: this.equipment[i.slot] === i.id,
            }));
    }
    _renderEquipment() {
        // Paint the slots (drop targets) with their current item. [REF#UI-00823]
        const grid = document.getElementById('wg-slot-grid');
        if (grid) {
            grid.querySelectorAll('.wg-slot').forEach(slotEl => {
                const slotId = slotEl.dataset.slot;
                const item = this._itemById(this.equipment[slotId]);
                const body = slotEl.querySelector('.wg-slot-body');
                if (!body) return;
                // WCAG 2.5.3 / 1.3.1 (2026-09-13): the accessible name carries what the eye sees — slot, then item or "empty" [REF#UI-01355]
                try { const def = (this.EQUIP_SLOTS || []).find(x => x.id === slotId); const lab = def ? def.label : slotId; slotEl.setAttribute('aria-label', lab + ' slot — ' + (item ? item.id + ' +' + item.ac + ' AC' : this._L('wg.equip.empty_slot', 'empty'))); } catch (_) {}
                if (item) {
                    slotEl.classList.add('filled');
                    body.dataset.empty = 'false';
                    body.setAttribute('draggable', 'true');
                    body.dataset.itemId = item.id;
                    body.innerHTML = `<span class="wg-worn-name">${this._esc(item.show || item.id)}</span><span class="wg-slot-action">${this._L('wg.equip.take_off', 'Take off')}</span>`;   // the real playing card in the slot (2026-09-20) [REF#PENDING] [REF#UI-01380]
                } else {
                    slotEl.classList.remove('filled');
                    body.dataset.empty = 'true';
                    body.removeAttribute('draggable');
                    delete body.dataset.itemId;
                    body.innerHTML = `<span class="wg-slot-empty">${this._L('wg.equip.empty_slot', 'empty')}</span>`;
                }
            });
        }
        // THE HANDS (2026-09-20): the figure's MELEE / RANGED slots show the auto-attack weapons [REF#PENDING] [REF#UI-01381]
        try {
            const mP = this._meleePrimary(), rP = this._rangedPrimary();
            const paintHand = (slotId, id) => {
                const slotEl = document.querySelector('#welcome-guide-overlay .wg-weapon-slot[data-slot="' + slotId + '"]');
                if (!slotEl) return;
                const body = slotEl.querySelector('.wg-slot-body'); const it = this._itemById(id);
                if (it) { slotEl.classList.add('filled'); body.dataset.empty = 'false'; body.dataset.itemId = it.id; body.innerHTML = `<span class="wg-worn-name">${this._esc(it.show || it.id)}</span><span class="wg-slot-action">${this._L('wg.equip.swap', 'Swap weapon')}</span>`; slotEl.setAttribute('aria-label', slotId + ' weapon — ' + (it.show || it.id)); }
                else { slotEl.classList.remove('filled'); body.dataset.empty = 'true'; delete body.dataset.itemId; body.innerHTML = `<span class="wg-slot-empty">${this._L('wg.equip.empty_slot', 'empty')}</span>`; slotEl.setAttribute('aria-label', slotId + ' weapon slot — empty'); }
            };
            paintHand('MELEE', mP); paintHand('RANGED', rP);
            this._renderRatings(mP, rP);
        } catch (err) { console.warn('[EQUIP] hands/ratings failed (non-fatal):', err); }
        // Paint the item list (drag sources). [REF#UI-00824]
        const list = document.getElementById('wg-item-list');
        if (list) {
            const items = this._ownedEquipItems();
            // EVERYTHING YOU CARRY, GROUPED (Mark 2026-09-20 "left page needs to be all the items"): weapons first (their tap = [REF#UI-01382]
            // the auto weapon, drag = the hand slot), then armour, then every other card in the ledger as an info card. [REF#PENDING]
            const counts = (typeof window !== 'undefined' && window.cardInventoryCounts) ? window.cardInventoryCounts : {};
            const mP2 = this._meleePrimary(), rP2 = this._rangedPrimary();
            // EVERY ITEM IS THE REAL PLAYING CARD (Mark 2026-09-20 "have the playing cards to use"): the hand's own .guide-card [REF#UI-01383]
            // markup in a card-sized mount, the 3D icon painted by the same icon loop that paints the hand and the vending
            // machine. The button wrapper keeps the drag / tap wiring (.wg-item-row + data-item-id + data-slot). [REF#PENDING]
            const wcard = (w, fam, primary) => `<button type="button" class="wg-item-row wg-inv-mount${primary ? ' is-equipped' : ''}" role="option" draggable="true"
                        data-item-id="${this._esc(w.id)}" data-slot="${fam}" aria-label="${this._esc(w.show || w.id)} — ${primary ? 'in hand' : 'tap or drag to the hand'}">
                    ${this._realCardHtml(Object.assign({ slot: fam, kind: 'WEAPON' }, w), { badge: primary ? 'IN HAND' : 'WIELD', qty: counts[w.id] || 0 })}
                </button>`;
            const mel = this.MELEE_WEAPONS.filter(w => (counts[w.id] || 0) > 0 || w.id === mP2).map(w => wcard(w, 'MELEE', w.id === mP2));
            const rng = this.RANGED_WEAPONS.filter(w => (counts[w.id] || 0) > 0 || w.id === rP2).map(w => wcard(w, 'RANGED', w.id === rP2));
            const known = new Set([...this.MELEE_WEAPONS, ...this.RANGED_WEAPONS, ...this.EQUIP_ITEMS].map(x => x.id));
            const other = Object.keys(counts).filter(k => (counts[k] || 0) > 0 && !known.has(String(k).toUpperCase().replace(/\s+x\d+$/, '')) && !known.has(k))
                .map(k => `<div class="wg-item-row wg-inv-mount wg-plain-card" role="option" data-item-id="${this._esc(k)}" aria-label="${this._esc(k)} ×${counts[k]}">
                    ${this._realCardHtml({ id: k, kanji: '物', desc: '', attr: '', slot: 'ITEM' }, { badge: this._L('wg.equip.carried', 'carried'), qty: counts[k] })}
                </div>`);   // data-item-id added 2026-09-20 — the pickup spotlight/highlight both look a row up by this attribute, and this template was the one row shape missing it [REF#PENDING]
            const group = (title, cards) => cards.length ? `<div class="wg-inv-group"><div class="wg-inv-group-h">${title} <span>${cards.length}</span></div><div class="wg-inv-cards">${cards.join('')}</div></div>` : '';
            const armour = items.map(it => {
                const slotDef = this.EQUIP_SLOTS.find(s => s.id === it.slot);
                return `<button type="button"
                        class="wg-item-row wg-inv-mount${it.equipped ? ' is-equipped' : ''}${it.owned ? '' : ' is-unowned'}"
                        role="option" draggable="true"
                        data-item-id="${this._esc(it.id)}" data-slot="${it.slot}"
                        aria-label="${this._esc(it.id)} — fits ${slotDef ? slotDef.label : it.slot}">
                    ${this._realCardHtml(it, { badge: it.equipped ? 'WORN' : (slotDef ? slotDef.label.toUpperCase() : it.slot), qty: it.count })}
                </button>`;
            });
            const html = group('MELEE', mel) + group('RANGED', rng) + group(this._L('wg.equip.armour_h', 'ARMOUR'), armour) + group(this._L('wg.equip.items_h2', 'ITEMS'), other);
            list.innerHTML = html || `<p class="wg-empty-hint">${this._L('wg.equip.nothing', 'Nothing yet — every card you pick up lands here.')}</p>`;
            if (this._invNewId) {
                try {
                    const nw = list.querySelector('[data-item-id="' + this._invNewId.replace(/"/g, '') + '"]');
                    if (nw) {
                        // FRONT AND CENTER, IN THE LIST ITSELF (Mark 2026-09-20: "i cant spend 5 minutes looking for [REF#UI-01384]
                        // where you shoved what I just picked up ... make it center ... other items I dont have
                        // grasped should be a little faded"). The new card's REAL row moves into its own group at
                        // the top of the list, scaled up and gold-ringed, scrolled to the centre of the page; every
                        // other row is only slightly faded (CSS .wg-spotlight-active, ~:9577) and stays clickable.
                        // ⛔ SUPERSEDED 2026-09-20 by Mark ("wtf cant see it. why are all weapons blcaked out? wtf is
                        // that opacity fade?"): the first pass floated a position:fixed CLONE of the card and dimmed
                        // the whole list to .28 — the clone's badge/label/icon scattered across the page (the card's
                        // internal layout depends on its mount) and the list went black. No clone, no heavy dim.
                        nw.classList.add('wg-inv-new');
                        const top = document.createElement('div');
                        top.className = 'wg-inv-group wg-inv-new-group';
                        top.innerHTML = `<div class="wg-inv-group-h">${this._L('wg.equip.just_found', 'JUST PICKED UP')}</div><div class="wg-inv-cards"></div>`;
                        const srcCards = nw.parentElement, srcGroup = srcCards ? srcCards.closest('.wg-inv-group') : null;
                        top.querySelector('.wg-inv-cards').appendChild(nw);
                        if (srcGroup && srcCards && !srcCards.children.length) srcGroup.remove();   // it was the only card of its family — no empty header left behind [REF#UI-01385]
                        list.insertBefore(top, list.firstChild);
                        nw.scrollIntoView({ block: 'center' });   // no fade on the rest, no scale (Mark 2026-09-20: "stop the fade opacity") [REF#UI-01386]
                    }
                } catch (_) {}
            }
        }
        const note = document.getElementById('wg-equip-note');
        // Mirror onto the shared shell window (window.parent) so the engine — a sibling iframe, not a [REF#PENDING] [REF#UI-01387]
        // descendant — can read the encumbrance state directly and apply a movement penalty. No postMessage
        // needed: both iframes' window.parent is the same shell object. See Origami.RealityEngine.9.html
        // ~:99264 (the stride-speed line) for the read side.
        const { w: _w, max: _wMax, over: _wOver } = this._syncCarryWeight();
        if (note && !note.classList.contains('wg-equip-note-flash')) {
            note.textContent = `Armor ${this._computeAC()} · base 10 + gear · Weight ${_w}/${_wMax} lbs${_wOver ? ' — OVERWEIGHT' : ''}`;
            note.classList.toggle('wg-overweight', _wOver);
        }
    }
    // ── RATING PILLS ON THE FIGURE (Mark 2026-09-20: "an armor rating when armor is worn and removed. same for weapon [REF#UI-01388]
    //    melee/ranged"). ARMOR = _computeAC; MELEE / RANGED = the primary weapon's attr line. A change flashes the pill
    //    with the delta so wearing and removing is SEEN. [REF#PENDING]
    _renderRatings(mP, rP) {
        const ac = this._computeAC();
        const m = this._itemById(mP), r = this._itemById(rP);
        const set = (id, val, key) => {
            const el = document.getElementById(id); if (!el) return;
            const b = el.querySelector('b'); if (!b) return;
            const prev = this._rateLast ? this._rateLast[key] : undefined;
            b.textContent = val;
            if (prev !== undefined && prev !== val) {
                el.classList.remove('wg-rate-flash'); void el.offsetWidth; el.classList.add('wg-rate-flash');
                if (key === 'ac' && typeof prev === 'number') { const d = document.createElement('span'); d.className = 'wg-rate-delta ' + (val > prev ? 'up' : 'down'); d.textContent = (val > prev ? '+' : '') + (val - prev); el.appendChild(d); setTimeout(() => d.remove(), 1400); }
            }
            this._rateLast = this._rateLast || {}; this._rateLast[key] = val;
        };
        set('wg-rate-armor', ac, 'ac');
        set('wg-rate-melee', m ? (m.attr || m.id).split('·')[0].trim() : '—', 'melee');
        set('wg-rate-ranged', r ? (r.attr || r.id).split('·')[0].trim() : '—', 'ranged');
    }
    // ── THE REAL CARD (Mark 2026-09-20: "have the playing cards to use"): the hand's .guide-card markup, as the vending mini-card [REF#UI-01389]
    //    builds it (Panels ~:16430). The icon loop in Panels scans every .card-icon-3d[data-element] in the document, so the
    //    3D model appears by itself; the element comes from the one resolver (window._vcMapToScene), local fallback below. [REF#PENDING]
    _realCardHtml(it, o = {}) {
        const name = it.show || it.id, fam = (it.slot === 'MELEE') ? 'MELEE' : (it.slot === 'RANGED') ? 'RANGED' : 'ITEM';
        const elFor = () => {
            try { if (typeof window._vcMapToScene === 'function') { const e = window._vcMapToScene(fam === 'RANGED' ? 'MISSILE' : fam, it.id); if (e) return e; } } catch (_) {}
            if (fam === 'MELEE') return 'KATANA';
            if (fam === 'RANGED') return /BOW/.test(it.id) ? (it.id === 'SHORT BOW' ? 'BOW_SHORT' : 'BOW_LONG') : (it.id === 'SHURIKEN' ? 'SHURIKEN' : it.id === 'MAGIC AUTO MISSILE' ? 'SMG' : 'PISTOL');
            return it.id === 'SHIELD' ? 'DEFEND' : 'ITEM';
        };
        const el = elFor();
        const cls = fam === 'MELEE' ? 'card-melee' : fam === 'RANGED' ? 'card-missile' : 'card-item';
        return `<span class="wg-card-mount"><span class="guide-card ${cls}" data-depth="0" data-card-action="${this._esc(it.id)}">
            <span class="card-header"><span class="card-kanji" aria-hidden="true">${it.kanji || ''}</span><span class="card-type-pill">${fam}</span></span>
            <span class="card-title">${this._esc(name)}</span>
            <span class="card-title-2"></span>
            <span class="card-desc">${this._esc(it.desc || '')}</span>
            <span class="card-icon-3d" data-element="${this._esc(el)}"><canvas></canvas></span>
            <span class="card-attr-fused">${this._esc(it.attr ? String(it.attr).split('·')[0].trim() : (it.ac ? '+' + it.ac + ' AC' : ''))}</span>
            ${o.qty > 1 ? `<span class="card-badge wg-card-qty">${o.qty}</span>` : ''}
        </span>${o.badge ? `<span class="wg-card-badge">${this._esc(o.badge)}</span>` : ''}</span>`;
    }
    // ── AUTO-OPEN ON A NEW WEARABLE (Mark 2026-09-20: "when a new item is found -- if no monster is nearby? auto load the [REF#UI-01390]
    //    inventory screen when a new item can be put on the player from weapons or armor or items"). Called by Panels'
    //    ADD_CARD; opens on the equipment spread with the new card highlighted. Never while a monster is engaged, never
    //    over an open book, at most once per 8 s. Off: window._autoOpenInventory = false. [REF#PENDING]
    notifyNewItem(cardId) {
        try {
            // ⛔ SUPERSEDED 2026-09-20 by Mark: "dont pull it up everytime for every item - that is fucking annoying we have a [REF#UI-01391]
            //    card panel for this ... just pull it up when INV is pushed." The auto-open is OFF: the hand's card row already
            //    shows the pickup; the book opens only from the INV button. The pickup is still remembered (_invNewId) so the
            //    next INV press lands the card in the JUST PICKED UP group. Back on: window._autoOpenInventory = true.
            //    DISABLED-FEATURES REGISTER entry: Origami.RealityEngine.9.html header, "Inventory auto-open on pickup".
            if (typeof window === 'undefined' || window._autoOpenInventory !== true) {
                const id0 = String(cardId || '').toUpperCase().replace(/\s+x\d+$/, '').trim();
                if (this._itemById(id0)) { this._invNewId = id0; clearTimeout(this._invNewT); this._invNewT = setTimeout(() => { this._invNewId = null; }, 60000); }
                return false;
            }
            const id = String(cardId || '').toUpperCase().replace(/\s+x\d+$/, '').trim();
            if (!this._itemById(id)) return false;
            const busy = (typeof window !== 'undefined') && (window._panelsInCombat === true || !!document.querySelector('#encounter-zone.combat-live') || window._pokerActive === true || window.wagerGameState);
            if (busy) return false;
            { const _g = document.getElementById(this.containerId); if (_g && _g.classList.contains('is-open')) return false; }
            const now = Date.now(); if (this._invAutoAt && now - this._invAutoAt < 8000) return false;
            this._invAutoAt = now; this._invNewId = id;
            this.show({ slide: this.EQUIP_SLIDE, browse: true });
            setTimeout(() => { this._invNewId = null; try { this._clearSpotlight(); } catch (_) {} }, 6000);   // safety net if the player never clicks it — the spotlight is meant to be dismissed by picking the card up, this is just the fallback [REF#PENDING] [REF#UI-01392]
            return true;
        } catch (_) { return false; }
    }
    // ── PRIMARY (melee) WEAPON picker (Mark inventory #3) ────────────────────────────────── [REF#UI-00825]
    // The guide loads INSIDE NewOrigami.Panels.html, so it shares the window with the combat
    // deck — it reads window.cardInventoryCounts (found weapons) + window.rolledMeleeWeapon /
    // equippedWeapon (current primary) and swaps by calling window.loadDeck() directly.
    _meleePrimary() {
        const rolled = (typeof window !== 'undefined' && window.rolledMeleeWeapon) ? String(window.rolledMeleeWeapon).toUpperCase() : '';
        if (this.MELEE_WEAPONS.some(m => m.id === rolled)) return rolled;   // guide-controlled primary wins [REF#UI-00826]
        const eq = (typeof window !== 'undefined' && window.equippedWeapon && window.equippedWeapon.name) ? String(window.equippedWeapon.name).toUpperCase() : '';
        return this.MELEE_WEAPONS.some(m => m.id === eq) ? eq : rolled;     // else the engine-equipped melee [REF#UI-00827]
    }
    _rangedPrimary() {
        const lu = (typeof window !== 'undefined' && window._lastUsedByDeck && window._lastUsedByDeck.RANGED) ? String(window._lastUsedByDeck.RANGED).toUpperCase() : '';
        if (this.RANGED_WEAPONS.some(r => r.id === lu)) return lu;
        const rolled = (typeof window !== 'undefined' && window.rolledRangedWeapon) ? String(window.rolledRangedWeapon).toUpperCase() : '';
        return this.RANGED_WEAPONS.some(r => r.id === rolled) ? rolled : '';
    }
    // WEAPON CARDS (Mark 2026-09-11 INV page): every FOUND melee + ranged weapon drawn as a small PLAYING CARD; the [REF#UI-01335]
    // one marked AUTO is what the canvas/ATTACK auto-attack uses. Tap a card to make it the auto weapon.
    _renderPrimaryWeapon() {
        const host = document.getElementById('wg-primary-weapon');
        if (!host) return;
        const counts = (typeof window !== 'undefined' && window.cardInventoryCounts) ? window.cardInventoryCounts : {};
        const mPrimary = this._meleePrimary(), rPrimary = this._rangedPrimary();
        const mel = this.MELEE_WEAPONS.filter(w => (counts[w.id] || 0) > 0 || w.id === mPrimary).map(w => ({ ...w, fam: 'MELEE', primary: w.id === mPrimary }));
        const rng = this.RANGED_WEAPONS.filter(w => (counts[w.id] || 0) > 0 || w.id === rPrimary).map(w => ({ ...w, fam: 'RANGED', primary: w.id === rPrimary }));
        const all = mel.concat(rng);
        if (!all.length) { host.innerHTML = `<p class="wg-empty-hint">No weapons yet — loot a weapon card to wield it.</p>`; return; }
        host.innerHTML = all.map(w => {
            const owned = (counts[w.id] || 0) > 0;
            const cls = 'wg-weapon-chip wg-card-chip' + (w.primary ? ' is-primary' : '') + (owned ? '' : ' is-unowned') + (w.fam === 'RANGED' ? ' fam-ranged' : ' fam-melee');
            const badge = w.primary ? 'AUTO' : (owned ? 'USE' : 'NOT FOUND');
            const face = w.show || w.id, qty = counts[w.id] || 0;
            return `<button type="button" class="${cls}" role="option"
                        data-weapon-id="${this._esc(w.id)}"${owned ? '' : ' aria-disabled="true"'}
                        aria-label="${this._esc(face)} — ${w.primary ? 'current auto-attack weapon' : (owned ? 'set as auto-attack weapon' : 'not found yet')}">
                    <span class="wg-cc-top"><span class="wg-cc-kanji" aria-hidden="true">${w.kanji}</span><span class="wg-cc-pill">${w.fam}</span></span>
                    <span class="wg-cc-name">${this._esc(face)}</span>
                    <span class="wg-cc-attr">${this._esc(w.attr)}</span>
                    <span class="wg-cc-badge">${badge}</span>
                    ${qty > 0 ? `<span class="wg-cc-qty">${qty}</span>` : ''}
                </button>`;
        }).join('');
    }
    // Make `name` the player's ready/primary melee weapon. Only FOUND weapons can be wielded. [REF#UI-00829]
    _setPrimaryWeapon(name) {
        const counts = (typeof window !== 'undefined' && window.cardInventoryCounts) ? window.cardInventoryCounts : {};
        const r = this.RANGED_WEAPONS.find(m => m.id === name);
        if (r) {
            // RANGED auto-use (Mark 2026-09-11): face card of the RANGED column + the engine's auto-attack action. [REF#UI-01336]
            if ((counts[name] || 0) <= 0) { this._flashEquipNote(`${r.show || name} not found yet — loot it first.`); return; }
            try {
                window._lastUsedByDeck = window._lastUsedByDeck || { SPELLS: null, MELEE: null, RANGED: null, ITEM: null };
                window._lastUsedByDeck.RANGED = name;
                if (typeof window.loadDeck === 'function' && window._lastDeckCats) window.loadDeck(window._lastDeckCats);
                window.parent.postMessage({ type: 'SET_AUTO_RANGED', action: name }, '*');
            } catch (_) {}
            this._renderPrimaryWeapon();
            this._flashEquipNote(`Auto-attack ranged weapon → ${r.show || name}.`);
            return;
        }
        const w = this.MELEE_WEAPONS.find(m => m.id === name);
        if (!w) return;
        if ((counts[name] || 0) <= 0) { this._flashEquipNote(`${name} not found yet — loot it first.`); return; }
        try {
            if (!window._rolledMeleeWeapon0 && window.rolledMeleeWeapon) window._rolledMeleeWeapon0 = String(window.rolledMeleeWeapon).toUpperCase();
            window.rolledMeleeWeapon = name;     // the primary/rolled melee weapon [REF#UI-00830]
            window.lastCombatAttack = name;      // pre-select it as the ready card in combat (inventory #2) [REF#UI-00831]
            if (typeof window.loadDeck === 'function') window.loadDeck();   // rebuild the deck → SET_PLAYER_ARMED + focus the ready weapon [REF#UI-00832]
        } catch (_) {}
        this._renderPrimaryWeapon();
        this._flashEquipNote(`Auto-attack melee weapon → ${name}.`);
    }
    // Equip `itemId` into its matching slot. Rejects a mismatched slot. Any [REF#UI-00833]
    // item already in that slot is bumped back to the list. Persists + repaints.
    _equipItem(itemId, slotIdHint) {
        const item = this._itemById(itemId);
        if (!item) return false;
        if (item.kind === 'WEAPON') {   // a weapon dropped on a hand (or tapped) = the auto-attack weapon, the existing path [REF#PENDING] [REF#UI-01393]
            if (slotIdHint && slotIdHint !== item.slot) { this._flashEquipNote(`${item.id} goes in the ${item.slot === 'MELEE' ? 'sword' : 'bow'} hand.`); return false; }
            this._setPrimaryWeapon(item.id);
            this._renderEquipment();
            return true;
        }
        // The item only fits its own slot — ignore a drop on a wrong slot. [REF#UI-00834]
        if (slotIdHint && slotIdHint !== item.slot) {
            this._flashEquipNote(`${item.id} doesn't fit the ${slotIdHint} slot.`);
            return false;
        }
        // If this exact item is already worn elsewhere, clear that first [REF#UI-00835]
        // (rings/necklaces share a slot id, so this is effectively a swap).
        for (const s of this.EQUIP_SLOTS) {
            if (this.equipment[s.id] === itemId) this.equipment[s.id] = null;
        }
        this.equipment[item.slot] = itemId;
        this._afterEquipChange();
        return true;
    }
    _unequipSlot(slotId) {
        // ⛔ SUPERSEDED 2026-09-20 by Mark: "why cant i click and remove something slotted?" — the "a hand is never empty" [REF#UI-01394]
        // refusal. A tap on a hand now puts the weapon back in the list; the hand falls back to the role's starting
        // weapon (the engine's auto-attack needs SOME ranged action), and says so.
        if (slotId === 'MELEE' || slotId === 'RANGED') {
            const cur = slotId === 'MELEE' ? this._meleePrimary() : this._rangedPrimary();
            const base = slotId === 'MELEE'
                ? (window._rolledMeleeWeapon0 || '')
                : ((typeof window !== 'undefined' && window.rolledRangedWeapon) ? String(window.rolledRangedWeapon).toUpperCase() : '');
            if (!cur || cur === base) { this._flashEquipNote(this._L('wg.equip.hand_base', 'That is your starting weapon — tap another weapon to swap.')); return; }
            try {
                if (slotId === 'RANGED') {
                    if (window._lastUsedByDeck) window._lastUsedByDeck.RANGED = null;
                    if (base) window.parent.postMessage({ type: 'SET_AUTO_RANGED', action: base }, '*');
                } else {
                    window.rolledMeleeWeapon = base || null; window.lastCombatAttack = base || null;
                }
                if (typeof window.loadDeck === 'function' && window._lastDeckCats) window.loadDeck(window._lastDeckCats);
            } catch (_) {}
            this._renderEquipment();
            const it = this._itemById(cur);
            this._flashEquipNote(`${(it && it.show) || cur} back in the list` + (base ? ` — ${base} in hand.` : '.'));
            return;
        }
        if (!this.equipment[slotId]) return;
        const itemId = this.equipment[slotId];
        // Snapshot the card's ON-SCREEN position + markup BEFORE the state change repaints the slot [REF#PENDING] [REF#UI-01395]
        // empty (Mark 2026-09-20: "discard cards in slots by click and drag away, it animates back to
        // the inventory page"). The mutation happens immediately (AC/weight must update right away); the
        // flight below is purely cosmetic and starts from where the card WAS.
        const slotBody = document.querySelector('#welcome-guide-overlay .wg-slot[data-slot="' + slotId + '"] .wg-slot-body');
        const fromRect = slotBody ? slotBody.getBoundingClientRect() : null;
        const flyHtml = slotBody ? slotBody.innerHTML : '';
        this.equipment[slotId] = null;
        this._afterEquipChange();
        if (fromRect) this._flyEquipCard(flyHtml, fromRect, itemId);
    }
    // Clones the card's markup into a `position: fixed` ghost and glides it from the emptied slot to [REF#PENDING] [REF#UI-01396]
    // wherever that item landed in the inventory list (a fresh row, or it merged into an existing
    // stack — either way `_afterEquipChange` has already repainted the list by the time this reads its
    // rect). Purely visual: no state, self-removing, never blocks input (pointer-events: none).
    _flyEquipCard(html, fromRect, itemId) {
        try {
            if (!html || !fromRect) return;
            const list = document.getElementById('wg-item-list');
            const idEsc = String(itemId || '').replace(/"/g, '');
            const targetRow = list ? list.querySelector('[data-item-id="' + idEsc + '"]') : null;
            const toRect = (targetRow || list) ? (targetRow || list).getBoundingClientRect() : fromRect;
            const ghost = document.createElement('div');
            ghost.className = 'wg-fly-card';
            ghost.innerHTML = html;
            ghost.style.position = 'fixed';
            ghost.style.left = fromRect.left + 'px';
            ghost.style.top = fromRect.top + 'px';
            ghost.style.width = fromRect.width + 'px';
            ghost.style.height = fromRect.height + 'px';
            ghost.style.margin = '0';
            ghost.style.zIndex = '99999';
            ghost.style.pointerEvents = 'none';
            ghost.style.willChange = 'transform, opacity';
            ghost.style.transition = 'transform 0.38s cubic-bezier(.22,.68,.34,1), opacity 0.38s ease-in';
            document.body.appendChild(ghost);
            const dx = (toRect.left + toRect.width / 2) - (fromRect.left + fromRect.width / 2);
            const dy = (toRect.top + toRect.height / 2) - (fromRect.top + fromRect.height / 2);
            const scale = Math.max(0.35, Math.min(1, toRect.width / Math.max(fromRect.width, 1)));
            requestAnimationFrame(() => {
                ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
                ghost.style.opacity = '0.2';
            });
            setTimeout(() => { try { ghost.remove(); } catch (_) {} }, 420);
        } catch (_) {}
    }
    // ── PICKUP SPOTLIGHT — see _renderEquipment (~:3505), where the new card's real row is moved to a [REF#PENDING] [REF#UI-01397]
    //    "JUST PICKED UP" group at the top of the list. This only takes the fade off the other rows; it runs when
    //    the card is clicked (any click in the list — that click IS the pickup), when the 6 s fallback fires, and
    //    when the book closes.
    _clearSpotlight() {
        this._invNewId = null;
        try {
            const list = document.getElementById('wg-item-list');
            if (list) list.classList.remove('wg-spotlight-active');
        } catch (_) {}
    }
    _afterEquipChange() {
        this._saveEquipment();
        this._renderEquipment();
        // Keep the character sheet's EQUIPPED list + Armor in sync if mounted. [REF#UI-00836]
        this._renderCharacterSheet();
        // Mirror equipped state out so the engine save payload can pick it up. [REF#UI-00837]
        if (typeof window !== 'undefined') window.welcomeGuideEquipment = { ...this.equipment };
    }
    _flashEquipNote(msg) {
        const note = document.getElementById('wg-equip-note');
        if (!note) return;
        note.textContent = msg;
        note.classList.add('wg-equip-note-flash');
        clearTimeout(this._noteTimer);
        this._noteTimer = setTimeout(() => {
            note.classList.remove('wg-equip-note-flash');
            note.textContent = `Armor Class: ${this._computeAC()} (base 10 + gear).`;
        }, 1600);
    }

    // ════════════════════════════════════════════════════════════════════ [REF#UI-00838]
    // SHARED LIVE 3D PREVIEW (monsters + avatars)
    // ════════════════════════════════════════════════════════════════════
    // SIA mitigation: ONE shared WebGLRenderer + GLTFLoader for BOTH preview
    // canvases, created lazily and torn down on hide(). The preview is a
    // REAL THREE.js mesh (top-down/composer caveat is irrelevant here — this
    // is its own offscreen scene, not the game's composer). A single RAF
    // loop spins the active model. frustumCulled=false so quick scrubbing
    // never blanks the mesh mid-compile.
    _ensurePreviewEngine() {
        if (this._pv) return this._pv;
        const THREE = window.THREE;
        if (!THREE) return null; // three.js not loaded — previews degrade to the canvas tag only [REF#UI-00839]
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100);
        camera.position.set(0, 1.1, 3.4);
        camera.lookAt(0, 0.9, 0);
        const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(2, 4, 3); scene.add(key);
        const rim = new THREE.DirectionalLight(0x66e0ff, 0.9); rim.position.set(-3, 2, -2); scene.add(rim);
        scene.add(new THREE.AmbientLight(0xb0c4de, 0.7));
        let loader = null;
        try {
            if (window.GLTFLoader) {
                loader = new window.GLTFLoader();
                // Player.A.Walking.glb is meshopt-compressed — register the [REF#UI-00840]
                // decoder (exposed by the panels module) or that rig fails to
                // parse and falls back to the wireframe sentinel.
                if (window.MeshoptDecoder && loader.setMeshoptDecoder) {
                    loader.setMeshoptDecoder(window.MeshoptDecoder);
                }
            }
        } catch (_) {}
        this._pv = { THREE, renderer, scene, camera, loader, root: null, mixer: null, clock: new THREE.Clock(), raf: 0, canvas: null, token: 0 };
        return this._pv;
    }

    _mountSlotPreview() {
        // Live 3D slot machine in the Origami Slots right page — reuses the shared preview engine (Mark [REF#UI-00841]
        // 2026-06-16). spin:0 → the cabinet faces the camera (only the reels animate via the GLB's "Scene"
        // clip); plays once on mount, then click the model OR the lever button to spin again. Visual only —
        // no economy yet (matches the in-world slot). Tune: window._wgSlotScale / _wgSlotFaceY.
        // Single-file .glb (textures+buffer embedded) so the panels preview loader gets it in ONE fetch —
        // the multi-file scene.gltf (external .bin + 4 PNGs) stalled past the 6s watchdog. The in-world slot
        // (engine) still uses scene.gltf; this .glb is preview-only (gltf-pipeline, keeps the "Scene" clip).
        this._mountPreviewModel('wg-slot-preview', 'assets/models/rooms/slotmachine/slotmachine.glb',
            (typeof window._wgSlotScale === 'number' ? window._wgSlotScale : 1.05),
            { faceY: (typeof window._wgSlotFaceY === 'number' ? window._wgSlotFaceY : (-Math.PI / 2)), spin: 0, loopOnce: true, autoplayOnce: true,   // Mark 2026-06-17: rotated 90° right (was 0) so the reel FACE turns toward the camera (it was showing the side). Flip to +Math.PI/2 if it's the wrong 90°: window._wgSlotFaceY. [REF#UI-00842]
              cam: (Array.isArray(window._wgSlotCam) ? window._wgSlotCam : [0, 0.4, 3.2]),     // FRAMING FIX 2026-06-17: model centers at y≈0.05 (centered, not grounded) — old target 0.95 looked ABOVE it (only the base showed). Aim at the reel band ~0.3. Dial window._wgSlotCam / _wgSlotCamY / _wgSlotScale / _wgSlotFaceY. [REF#UI-00843]
              camTargetY: (typeof window._wgSlotCamY === 'number' ? window._wgSlotCamY : 0.3),
              fill: (typeof window._wgSlotFill === 'number' ? window._wgSlotFill : 1.1),       // warm front fill so it isn't dark [REF#UI-00844]
              watchdogMs: (typeof window._wgSlotWatchdog === 'number' ? window._wgSlotWatchdog : 20000) });   // tolerate slow first load (vs the 6s default) [REF#UI-00845]
        const _spin = () => { const pv = this._pv; if (pv && pv.slotAction) { try { pv.slotAction.stop(); pv.slotAction.reset(); pv.slotAction.enabled = true; pv.slotAction.paused = false; pv.slotAction.play(); } catch (_) {} } };
        const cv = document.getElementById('wg-slot-preview');
        if (cv && !cv._wgSpinBound) { cv._wgSpinBound = true; cv.style.cursor = 'pointer'; cv.addEventListener('click', _spin); }
        const btn = document.getElementById('wg-slot-spin-btn');
        if (btn && !btn._wgSpinBound) { btn._wgSpinBound = true; btn.addEventListener('click', _spin); }
    }

    _mountPreviewModel(canvasId, url, scale, opts = {}) {
        const pv = this._ensurePreviewEngine();
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        if (!pv) {
            // No THREE — leave a styled placeholder so the canvas isn't a void. [REF#UI-00846]
            canvas.style.background = 'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.10), transparent 70%)';
            return;
        }
        const THREE = pv.THREE;
        const myToken = ++pv.token; // invalidate any in-flight load when we switch [REF#UI-00847]
        // Move the shared renderer onto this canvas (DOM-wise we render to an [REF#UI-00848]
        // offscreen renderer.domElement and blit, but simplest robust path:
        // size the renderer to the canvas and copy its output each frame).
        pv.activeCanvas = canvas;
        const ctx = canvas.getContext('2d');
        pv.blit = ctx;
        const sizeTo = () => {
            const w = Math.max(2, canvas.clientWidth | 0);
            const h = Math.max(2, canvas.clientHeight | 0);
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            pv.renderer.setSize(w, h, false);
            pv.camera.aspect = w / h;
            pv.camera.updateProjectionMatrix();
        };
        sizeTo();
        pv._sizeTo = sizeTo;
        pv.spinSpeed = (opts.spin != null ? opts.spin : 0.6);   // body turntable speed; slot passes 0 → faces the camera [REF#UI-00849]
        pv.slotAction = null;                                    // play-on-demand action (set below for the slot) [REF#UI-00850]
        // Per-mount CAMERA + FILL light (slot frames closer + brighter; monsters/avatars get the defaults). [REF#UI-00851]
        { const _c = opts.cam || [0, 1.1, 3.4]; pv.camera.position.set(_c[0], _c[1], _c[2]); pv.camera.lookAt(0, (opts.camTargetY != null ? opts.camTargetY : 0.9), 0); }
        if (pv._previewFill) { pv.scene.remove(pv._previewFill); pv._previewFill = null; }
        if (opts.fill) { pv._previewFill = new THREE.DirectionalLight(0xfff1d8, opts.fill); pv._previewFill.position.set(0.5, 1.6, 5); pv.scene.add(pv._previewFill); }

        // Drop the previous model. [REF#UI-00852]
        if (pv.root) { pv.scene.remove(pv.root); pv.root = null; }
        if (pv.mixer) { pv.mixer.stopAllAction?.(); pv.mixer = null; }

        const place = (obj, anims) => {
            if (myToken !== pv.token) return; // a newer selection won — bail [REF#UI-00853]
            // IDEMPOTENT: drop whatever is currently mounted first. Required now that the watchdog [REF#UI-00854]
            // sentinel is a PLACEHOLDER the real model can replace — without this, a late-arriving GLB
            // would be added alongside the wireframe box instead of superseding it.
            if (pv.root) { try { pv.scene.remove(pv.root); } catch (_) {} pv.root = null; }
            if (pv.mixer) { try { pv.mixer.stopAllAction(); } catch (_) {} pv.mixer = null; }
            // Center + ground the model, apply DB scale, face the camera. [REF#UI-00855]
            const box = new THREE.Box3().setFromObject(obj);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            // NOTE on degenerate-armature rigs (Succubi.glb, armature scale 0.01): this preview runs [REF#UI-00856]
            // ONLY in the panels' newer THREE, whose Box3 is bone-aware — so the normal center/scale
            // math below computes near-identity wrapper transforms and the skinned scene renders fine
            // as-is (the r128 ENGINE needs its armature-seam rig; here it's unnecessary). A rest-pose
            // bake was tried and REMOVED: this runtime's boneTransform yields zero-verts on the
            // meshopt builds (pixel-probed 2026-07-05) — do not resurrect it.
            const grp = new THREE.Group();
            if (opts.fit) {
                // ── WHOLE-MODEL FRAMING (Mark 2026-07-19: "a smaller window for the 3d model render canvas [REF#UI-00857]
                // that has the ENTIRE monster"). The legacy path below could not do this, for two reasons
                // that both had to be fixed:
                //   1. It normalized on size.y ALONE and then multiplied by the catalog `scale`. A monster at
                //      scale 1.55 (hungry ghost) became 2.5 units tall in a frame built for 1.6 — cropped.
                //      Here `scale` is deliberately IGNORED: this is a fit-to-frame preview, not a size
                //      comparison, and the catalog scale is already shown as a stat.
                //   2. It CENTERED the model at the origin and then aimed the camera at a hardcoded y=0.9 —
                //      near the top of the head — so monsters read low and cropped. We ground the model
                //      (min.y → 0) and aim at its real mid-height, the Panels.html:10156 avatar pattern.
                // Normalizing on the LONGEST axis (not height) keeps wide/winged rigs inside the frame too.
                const maxDim = Math.max(size.x, size.y, size.z) || 1;
                obj.position.sub(center);
                grp.add(obj);
                grp.scale.setScalar(1.6 / maxDim);
            } else {
                const norm = size.y > 0.001 ? (1.6 / size.y) : 1;
                obj.position.sub(center);
                grp.add(obj);
                grp.scale.setScalar(norm * (scale || 1));
                grp.position.y = 0.05;
            }
            grp.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
            if (opts.faceY != null) grp.rotation.y = opts.faceY;
            pv.scene.add(grp);
            pv.root = grp;
            if (opts.fit) {
                // RE-MEASURE after scaling (a pre-scale box is the wrong size to ground or frame with), [REF#UI-00858]
                // then ground and pull the camera back to the model's BOUNDING SPHERE. The sphere — not the
                // box — is what makes this correct under the turntable: a box-width fit pops out of frame as
                // the model spins its diagonal toward the camera, while the sphere is rotation-invariant.
                const box2 = new THREE.Box3().setFromObject(grp);
                grp.position.y -= box2.min.y;                       // ground it: feet at y = 0 [REF#UI-00859]
                const sph = new THREE.Box3().setFromObject(grp).getBoundingSphere(new THREE.Sphere());
                const fovR = (pv.camera.fov * Math.PI) / 180;
                const dist = (sph.radius / Math.sin(fovR / 2)) * (opts.fitPad || 1.12);
                pv._fitTargetY = sph.center.y;
                pv._fitDist = dist;          // the FIT distance, kept so zoom is a multiplier off a known-good frame rather than a free-floating camera [REF#UI-00860]
                pv._zoom = 1;                // 1 = exactly the fit above; <1 closer, >1 further out [REF#UI-00861]
                if (this._applyPreviewZoom) this._applyPreviewZoom();
                // ── PIN THE MODEL TO ITS CENTRE AXIS (Mark 2026-08-05: "do not allow it to move off its [REF#UI-00862]
                //    center axis - its animations move around") ──────────────────────────────────────
                //    This is also the real reason models "are off screen": several of these rigs carry ROOT
                //    MOTION — the clip animates the scene root's position, so the monster walks itself out
                //    of a frame that was correct the moment it was measured. Framing harder cannot fix that;
                //    the drift has to be cancelled every frame.
                //    X/Z ONLY. Vertical travel is left alone deliberately: a breathing or hopping idle reads
                //    as life, and clamping y would also fight the grounding done just above.
                pv._pinObj = obj;
                pv._pinHome = { x: obj.position.x, z: obj.position.z };
            }
            // CLIP LIBRARY — every clip on the rig gets a named action, so the codex can play ANY of them on [REF#UI-00863]
            // demand (_playPreviewClip). Previously only one auto-chosen "longest clip" action was ever built,
            // which is why the ▶ buttons had to round-trip to a live in-world monster to preview anything.
            pv.actions = {}; pv.clipNames = []; pv.current = null;
            if (anims && anims.length && window.THREE) {
                pv.mixer = new THREE.AnimationMixer(obj);
                for (const c of anims) {
                    if (!c || pv.actions[c.name]) continue;
                    pv.actions[c.name] = pv.mixer.clipAction(c);
                    pv.clipNames.push(c.name);
                }
                // Prefer an idle-ish clip (longest) for a calm preview. [REF#UI-00864]
                const sorted = [...anims].sort((a, b) => b.duration - a.duration);
                const clip = (opts.clip && anims.find(c => c.name === opts.clip))
                    || sorted.find(c => c.duration > 1.8) || sorted[0];
                if (clip) {
                    const action = pv.actions[clip.name] || pv.mixer.clipAction(clip);
                    if (opts.loopOnce) {                         // SLOT: play-on-demand (not the calm idle loop) [REF#UI-00865]
                        action.loop = THREE.LoopOnce; action.clampWhenFinished = true;
                        pv.slotAction = action;
                        if (opts.autoplayOnce) { action.reset(); action.play(); }   // one spin when the page opens [REF#UI-00866]
                    } else {
                        action.play();                           // monsters/avatars: calm idle loop (unchanged) [REF#UI-00867]
                        pv.current = action;
                    }
                }
            }
            if (typeof opts.onReady === 'function') { try { opts.onReady(pv.clipNames.slice()); } catch (_) {} }
            this._startPreviewLoop();
        };

        // Sentinel — a wireframe stand-in so the canvas always shows a [REF#UI-00868]
        // rotating 3D object even when the GLB can't be placed. Reused by
        // the error path AND the watchdog timeout below.
        const showSentinel = () => {
            if (myToken !== pv.token) return;
            const geo = new THREE.BoxGeometry(1, 1.4, 0.7);
            const mat = new THREE.MeshStandardMaterial({
                color: 0x22d3ee, wireframe: true, emissive: 0x0a3a44, emissiveIntensity: 0.6,
            });
            place(new THREE.Mesh(geo, mat), null);
        };

        if (pv.loader) {
            // Watchdog: GLTFLoader parse can stall in the panels-iframe [REF#UI-00869]
            // context (THREE r160 + KHR_mesh_quantization GLBs parse without
            // ever resolving here, while the engine iframe loads them fine —
            // env-specific, not a data bug). Don't let a stalled parse leave
            // the canvas blank: after 6s, fall back to the wireframe sentinel.
            // ⚠ THE WATCHDOG IS A PLACEHOLDER, NOT A VERDICT (fixed 2026-07-19, caught in playwright).
            // It used to set settled=true, so once it fired the real GLB was DISCARDED when it arrived and
            // the canvas kept the cyan wireframe box forever. Measured: with the monster codex open, every
            // rig after the first took longer than the 6s window (a preview load competes with the engine's
            // own boot/GLB traffic), so five of six monsters showed a box instead of a monster — while the
            // clip editor beside it listed the real clips, making it look like the model was "wrong" rather
            // than un-arrived. Now the sentinel is only a stand-in and a late model supersedes it.
            let done = false;                                // the REAL model landed (or hard-errored) [REF#UI-00870]
            const watchdog = setTimeout(() => {
                if (done || myToken !== pv.token) return;
                showSentinel();                              // stand-in only — deliberately does NOT settle [REF#UI-00871]
            }, (opts.watchdogMs || 6000));
            pv.loader.load(url,
                (gltf) => {
                    if (done || myToken !== pv.token) return;
                    done = true; clearTimeout(watchdog);
                    place(gltf.scene, gltf.animations);      // replaces the sentinel if one is showing [REF#UI-00872]
                },
                undefined,
                () => {
                    if (done || myToken !== pv.token) return;
                    done = true; clearTimeout(watchdog);
                    showSentinel();
                });
        } else {
            const geo = new THREE.IcosahedronGeometry(0.9, 0);
            const mat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, flatShading: true });
            place(new THREE.Mesh(geo, mat), null);
        }
    }

    _mountMonsterPreview(mon) {
        // Goblin GLB faces away by default in-game; show its front here. [REF#UI-00873]
        // ⚠ PREVIEWS THE **ENGINE'S** GLB, not mon.model. The codex used to preview
        // new-goblin-animate.glb / imp-animated-new.glb while the engine spawns new.goblin.glb /
        // new.imp.glb — different rigs with different clip lists, so the editor offered clip names
        // that DO NOT EXIST on the live monster. engineModelFor() is the single source of truth;
        // mon.model stays as the catalog's art reference. Falls back to mon.model if unmapped.
        const url = engineModelFor(mon) || mon.model;
        this._monPreviewUrl = url;
        // ⚠ CLEAR THE PREVIOUS RIG'S CLIPS FIRST. Caught in playwright 2026-07-19: selecting the succubus [REF#UI-00874]
        // listed 'NlaTrack, NlaTrack.001…' — the GOBLIN's clip names — because _monPreviewClips still held
        // the last rig's list while the new (14MB) GLB was in flight. The editor was offering clip names
        // that do not exist on the selected monster, which is the exact failure mode this refactor exists to
        // kill. Cleared here, so _animInfoFor falls back to the MANIFEST (correct for this monster) until
        // the real rig lands and overrides it.
        this._monPreviewClips = [];
        // SAME GLB, SAME CLIPS (2026-09-27): the BOSS wears the orc's GLB. Measured in Chrome: Orc → BOSS left the BOSS editor at 0 clips [REF#UI-01431]
        // (the rig was already up, no second onReady). A rig's clip list is remembered per URL and reused at once.
        this._monPreviewClipsByUrl = this._monPreviewClipsByUrl || {};
        if (Array.isArray(this._monPreviewClipsByUrl[url]) && this._monPreviewClipsByUrl[url].length) this._monPreviewClips = this._monPreviewClipsByUrl[url].slice();
        // Measured 2026-07-19: these rigs are 2-14MB and, when several are clicked in a row, queue behind [REF#UI-00875]
        // each other — the mummy and succubus took 3.5-4s alone but over 9s under contention. Say "loading"
        // rather than leaving a stale/blank canvas, so a slow load never reads as a broken one.
        const np = document.getElementById('wg-mon-nowplaying');
        if (np) np.innerHTML = '<span class="wg-np-k">LOADING RIG…</span>';
        this._bindPreviewZoom();
        this._bindMonsterSave();
        this._mountPreviewModel('wg-monster-preview', url, mon.scale, {
            faceY: 0,
            fit: true,                       // frame the WHOLE monster (Mark 2026-07-19) [REF#UI-00876]
            watchdogMs: 20000,               // these rigs are 4-14MB and compete with the engine's own GLB traffic; 6s showed a wireframe box for most of them. The sentinel is now replaceable anyway, so this just avoids the flash. [REF#UI-00877]
            onReady: (clipNames) => {
                this._monPreviewClips = clipNames || [];
                if (clipNames && clipNames.length) (this._monPreviewClipsByUrl = this._monPreviewClipsByUrl || {})[url] = clipNames.slice();
                const el = document.getElementById('wg-mon-nowplaying');
                if (el) {
                    el.innerHTML = (clipNames && clipNames.length)
                        ? `<span class="wg-np-k">${clipNames.length} CLIPS</span> <span class="wg-np-d">pick one to play it</span>`
                        : '<span class="wg-np-d">no clips on this rig</span>';
                }
                // The rig is the ground truth for what is playable. If the manifest and the GLB [REF#UI-00878]
                // disagree, say so in the UI rather than silently offering dead clip names.
                this._renderAnimEditorFromManifest(mon);
            },
        });
    }

    // Play a clip BY NAME in the codex preview canvas, crossfading from whatever is playing. [REF#UI-00879]
    // Returns false if the rig has no such clip — callers use that to fall back to the engine's
    // live-monster ▶ path instead of silently doing nothing.
    _playPreviewClip(name) {
        const pv = this._pv;
        if (!pv || !pv.mixer || !pv.actions) return false;
        const next = pv.actions[name];
        if (!next) return false;
        const prev = pv.current;
        if (prev && prev !== next) { try { prev.fadeOut(0.22); } catch (_) {} }
        try {
            next.reset();
            next.setLoop(pv.THREE.LoopRepeat, Infinity);
            next.enabled = true; next.paused = false;
            next.fadeIn(0.22).play();
        } catch (_) { return false; }
        pv.current = next;
        // Always show WHICH clip the canvas is playing. With NlaTrack.007-style names the only way to [REF#UI-00880]
        // build a mental map is to see the name and the motion at the same time.
        const np = document.getElementById('wg-mon-nowplaying');
        if (np) {
            const dur = next.getClip ? next.getClip().duration : (next._clip && next._clip.duration);
            np.innerHTML = `<span class="wg-np-k">PLAYING</span> <b>${this._esc(name)}</b>${dur ? ` <span class="wg-np-d">${dur.toFixed(2)}s</span>` : ''}`;
        }
        return true;
    }
    _mountAvatarPreview(av) {
        // Player rig is loaded rotated 180° in-game (Engine9.html:6234) — [REF#UI-00881]
        // mirror that so the avatar faces the camera.
        this._mountPreviewModel('wg-avatar-preview', av.animModel || av.model, av.scale, { faceY: Math.PI });
    }

    // ── PREVIEW ZOOM (Mark 2026-08-05) ────────────────────────────────────────────────────────── [REF#UI-00882]
    //    Zoom is a MULTIPLIER on the fit distance, not a free camera. That keeps two properties worth
    //    having: "fit" is always exactly recoverable, and the camera can never end up inside the model
    //    or behind it, which is what an unclamped dolly does the first time someone holds the button.
    //    Clamped 0.35×..3× — closer than 0.35 clips through the chest on the big rigs.
    _applyPreviewZoom() {
        const pv = this._pv;
        if (!pv || !pv.camera || !pv._fitDist) return;
        const z = Math.max(0.35, Math.min(3, pv._zoom || 1));
        pv._zoom = z;
        const y = pv._fitTargetY || 0;
        pv.camera.position.set(0, y, pv._fitDist * z);
        pv.camera.lookAt(0, y, 0);
    }
    _nudgePreviewZoom(dir) {
        const pv = this._pv;
        if (!pv) return;
        if (dir === 'fit') pv._zoom = 1;
        else pv._zoom = (pv._zoom || 1) * (dir === 'in' ? 0.82 : 1.22);
        this._applyPreviewZoom();
    }
    // Bound once, on the WRAP rather than each button, so the handler survives every re-render of the [REF#UI-00883]
    // monster page (the panel's innerHTML is rebuilt per selection — per-button listeners would be lost
    // and silently stop working, which is the dead-control failure this codex page was refactored to end).
    _bindPreviewZoom() {
        const wrap = document.getElementById('wg-mon-zoom');
        if (!wrap || wrap._zoomBound) return;
        wrap._zoomBound = true;
        wrap.addEventListener('click', (e) => {
            const b = e.target && e.target.closest ? e.target.closest('[data-zoom]') : null;
            if (!b) return;
            e.preventDefault(); e.stopPropagation();
            this._nudgePreviewZoom(b.getAttribute('data-zoom'));
        });
        // Wheel over the canvas zooms too — the thing everyone tries first on a 3D view. [REF#UI-00884]
        const canvas = document.getElementById('wg-monster-preview');
        if (canvas && !canvas._zoomWheel) {
            canvas._zoomWheel = true;
            canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                this._nudgePreviewZoom(e.deltaY > 0 ? 'out' : 'in');
            }, { passive: false });
        }
    }

    _startPreviewLoop() {
        const pv = this._pv;
        if (!pv || pv.raf) return;
        window._compassionForget(pv.tick);
        const tick = () => {
            pv.raf = window._compassionFrame(tick, () => this._pv === pv);
            const el = document.getElementById(this.containerId);
            // Only spin while the guide is open AND we're on a DB spread. [REF#UI-00885]
            if (!el || !el.classList.contains('is-open') || this.currentSlide < this.SETUP_SLIDE) return;
            const dt = window._compassionRender?.staticVisuals ? 0 : Math.min(pv.clock.getDelta(), 0.1);
            if (pv.root) pv.root.rotation.y += dt * (pv.spinSpeed != null ? pv.spinSpeed : 0.6);   // per-preview turntable; slot faces the camera (spin:0) and only its reels move (the clip) [REF#UI-00886]
            if (pv.mixer) pv.mixer.update(dt);
            // ROOT-MOTION CLAMP — AFTER the mixer, never before. The mixer WRITES position onto the root [REF#UI-00887]
            // each frame from the clip's track, so a pin applied first is simply overwritten and looks like
            // it did nothing. Re-asserting it here is what actually holds the model on its axis.
            if (pv._pinObj && pv._pinHome) { pv._pinObj.position.x = pv._pinHome.x; pv._pinObj.position.z = pv._pinHome.z; }
            if (pv._sizeTo) pv._sizeTo();
            pv.renderer.render(pv.scene, pv.camera);
            // Blit the shared renderer onto whichever canvas is active. [REF#UI-00888]
            if (pv.activeCanvas && pv.blit) {
                try {
                    pv.blit.clearRect(0, 0, pv.activeCanvas.width, pv.activeCanvas.height);
                    pv.blit.drawImage(pv.renderer.domElement, 0, 0, pv.activeCanvas.width, pv.activeCanvas.height);
                } catch (_) {}
            }
        };
        pv.tick = tick;
        pv.raf = window._compassionFrame(tick, () => this._pv === pv);
    }

    _teardownPreviews() {
        const pv = this._pv;
        if (!pv) return;
        window._compassionForget(pv.tick);
        if (pv.raf) { cancelAnimationFrame(pv.raf); pv.raf = 0; }
        if (pv.mixer) { try { pv.mixer.stopAllAction(); } catch (_){} pv.mixer = null; }
        if (pv.root) { try { pv.scene.remove(pv.root); } catch (_){} pv.root = null; }
        if (pv._previewFill) { try { pv.scene.remove(pv._previewFill); } catch (_){} pv._previewFill = null; }
        // Keep the renderer/loader alive for re-open (cheap) but stop the loop. [REF#UI-00889]
        pv.activeCanvas = null;
    }

    // ── WAGER screen (Mark 2026-06-18) ───────────────────────────────────── [REF#UI-00890]
    // openWager(): open the guide straight to the WAGER spread — bet controls on
    // the left, a live 3D table (cards dealt + dice rolling) on the right.
    openWager() {
        if (!this._injected) this._inject();
        const el = document.getElementById(this.containerId);
        if (!el) return;
        el.classList.add('is-open');
        try { window._setEventLogGuideGate && window._setEventLogGuideGate(true); } catch(_){}
        this.setSlide(this.WAGER_SLIDE);
        // wager:true tells the engine song-gate this is the GAMBLING guide, NOT a story/welcome guide — [REF#UI-00891]
        // so the cabaret SHOW (Starlette's song + the dancers) keeps playing in the background while you
        // gamble, instead of pausing (Mark MANDATORY 2026-06-25: "let show continue while playing").
        try { window.parent.postMessage({ type: 'WELCOME_GUIDE_OPEN', wager: true }, '*'); } catch(_){}
        this._mountChatInput();
    }

    // Spread A right — 3×3 grid of the player's LEARNED games (window.unlockedCardGames); the rest of the [REF#UI-00892]
    // 9 slots render as faded "?" tiles (Mark 2026-06-19).
    _renderWagerGrid() {
        const host = document.getElementById('wg-wager-grid');
        if (!host) return;
        const learned = Array.isArray(window.unlockedCardGames) ? window.unlockedCardGames : [];
        // DUAL POKER ENTRY (Mark 2026-07-05 WCAG mandate): learning POKER surfaces BOTH tiles — the 3D [REF#UI-00893]
        // on-table game AND the always-available guidebook (HTML/screen-reader) twin.
        const list = learned.flatMap(id => id === 'POKER' ? ['POKER', 'POKER_BOOK'] : [id]);
        const slots = Math.max(this._wagerGameSlots || 9, list.length);   // grid scrolls; never silently drop a learned game [REF#UI-00894]
        const tiles = [];
        for (let i = 0; i < slots; i++) {
            const id = list[i];
            const g = id && this.wagerGames[id];
            if (g) {
                const _aLbl = id === 'POKER' ? this._L('wg.wager.pokerTable3d', 'Poker — sit at the 3D cabaret table')
                    : id === 'POKER_BOOK' ? this._L('wg.wager.pokerBookA11y', 'Poker — play here in the guidebook, screen-reader friendly')
                    : this._esc(g.name);
                tiles.push(`<button type="button" class="wg-wager-tile" data-game="${id}" aria-label="${_aLbl}">
                    <span class="wg-wager-tile-icon">${g.icon || '🎲'}</span>
                    <span class="wg-wager-tile-name">${this._esc(g.name)}</span>
                </button>`);
            } else {
                tiles.push(`<div class="wg-wager-tile wg-wager-tile-locked" aria-hidden="true">
                    <span class="wg-wager-tile-icon">?</span>
                    <span class="wg-wager-tile-name">${this._L('wg.wager.locked', 'Learn me')}</span>
                </div>`);
            }
        }
        host.innerHTML = tiles.join('');
        host.querySelectorAll('.wg-wager-tile[data-game]').forEach(b => b.addEventListener('click', () => this.openWagerGame(b.dataset.game)));
    }

    // Pick a game → advance to Spread B (the felt table). [REF#UI-00895]
    openWagerGame(id) {
        if (!id || !this.wagerGames[id]) return;
        // POKER → THE REAL TABLE (Mark 2026-07-04 "if POKER is in the game — that starts the poker game — [REF#UI-00896]
        // change from the page version to the ontable version"): picking Poker in the WAGER grid no longer
        // opens the page-version quick-roll — it closes the guide and sits the player at the cabaret's 3D
        // poker felt (engine POKER_TABLE_START → seat cinematic + auto-DEAL vs the crew). If no table is
        // available (wrong floor / smashed / too far) the ENGINE falls back with a log line and nothing
        // breaks. Restore the page version: window._pokerPageVersion = true.
        if (id === 'POKER' && window._pokerPageVersion !== true) {
            this._unlockTab(this.WAGER_SLIDE);   // still counts as a deliberate PLAY (tab unlock parity) [REF#UI-00897]
            this.hide({ isFromLoad: true });
            try { window.parent.postMessage({ type: 'POKER_TABLE_START' }, '*'); } catch(_) {}
            return;
        }
        this._wagerSelected = id;
        this._unlockTab(this.WAGER_SLIDE);   // player chose a game to PLAY → unlock the WAGER tab (Mark 2026-06-22) [REF#UI-00898]
        this.setSlide(this.WAGER_GAME_SLIDE);
    }

    // "Fast Bet" (left-panel button, Mark 2026-06-19) — a one-tap gamble: open the WAGER [REF#UI-00899]
    // guide straight onto a learned DICE game, auto-pick a random EVEN/ODD, and fire DEAL.
    // Same 50g even-money roll as the manual flow (DEAL → WAGER_RESOLVE), just skips the
    // grid + bet taps. Falls back to any learned game / CHO-HAN if no dice game is learned.
    fastBet() {
        const learned = Array.isArray(window.unlockedCardGames) ? window.unlockedCardGames : [];
        const isDice = id => this.wagerGames[id] && this.wagerGames[id].kind === 'dice';
        const gid = learned.find(isDice) || learned.find(id => this.wagerGames[id])
                 || (this.wagerGames['CHO-HAN'] ? 'CHO-HAN' : Object.keys(this.wagerGames)[0]);
        if (!gid) return;
        if (!this._injected) this._inject();
        this.openWager();            // overlay open + grid (ensures DOM + chat mount) [REF#UI-00900]
        this.openWagerGame(gid);     // → Spread B (renders info + 3D table + wires DEAL) [REF#UI-00901]
        // Auto-roll once the dedicated 3D table (_wagerPv) + DEAL button are ready. The DEAL [REF#UI-00902]
        // handler early-returns until the table mounts, so POLL (don't guess a delay) — robust
        // on slow first-mounts and headless. Bails if the player navigated away.
        let tries = 0;
        const fire = () => {
            if (this.currentSlide !== this.WAGER_GAME_SLIDE) return;
            const deal = document.getElementById('wg-wager-deal');
            if ((!this._wagerPv || !deal) && tries++ < 40) { setTimeout(fire, 50); return; }   // wait up to ~2s [REF#UI-00903]
            if (!deal || !this._wagerPv) return;
            const info = document.getElementById('wg-wager-game-info');
            const betBtns = info ? [...info.querySelectorAll('.wg-wager-bet')] : [];   // auto-pick a random bet (per-game) [REF#UI-00904]
            if (betBtns.length) betBtns[Math.floor(Math.random() * betBtns.length)].click();
            deal.click();
        };
        setTimeout(fire, 50);
    }

    // Spread B left — the selected game's name + how-to + bet/deal controls + a back button. [REF#UI-00905]
    _renderWagerGameInfo(id) {
        const host = document.getElementById('wg-wager-game-info');
        if (!host) return;
        const g = id && this.wagerGames[id];
        // Solitaire owns a full-bleed overlay stage on this spread; hide it for every OTHER game / the empty state [REF#UI-00906]
        // so it can't cover them (Mark 2026-06-23).
        if (!(g && g.interactive === 'solitaire')) this._hideSolitaireStage();
        if (!g) { host.innerHTML = `<div class="wg-saves-empty">${this._L('wg.wager.pick', 'Pick a game from the grid to play.')}</div>`; return; }
        // Solitaire (Mark 2026-06-23) — embedded Klondike iframe in a full-bleed stage that survives maximize. [REF#UI-00907]
        if (g.interactive === 'solitaire') { this._renderSolitaire(host, g); return; }
        // Interactive games (Blackjack: HIT/STAND) render + wire themselves; a fresh hand each time you open it. (Mark 2026-06-20) [REF#UI-00908]
        if (g.interactive === 'blackjack') { this._bj = null; this._renderBlackjack(host, g); return; }
        // Per-game (Mark 2026-06-20): each game declares its own bets[] + play(); games without them fall back [REF#UI-00909]
        // to a plain EVEN/ODD roll (no regression). setup() seeds per-round state (e.g. the Hi-Lo base card) and
        // may return preHtml shown above the bet row. data-bet ids drive _wireWagerControls.
        this._wagerBet = null;
        this._wagerState = (typeof g.setup === 'function') ? g.setup.call(this) : {};
        const bets = (g.bets && typeof g.bets.length === 'number') ? g.bets
            : [{ id: 'even', label: this._L('wg.wager.even', 'BET EVEN') }, { id: 'odd', label: this._L('wg.wager.odd', 'BET ODD') }];
        const betHtml = bets.length
            ? `<div class="wg-wager-bets">${bets.map(b => `<button type="button" class="wg-wager-bet" data-bet="${this._esc(b.id)}">${b.label}</button>`).join('')}</div>` : '';
        const preHtml = (this._wagerState && this._wagerState.preHtml) ? this._wagerState.preHtml : '';
        host.innerHTML = `
            <h2 class="wg-page-title">${g.icon || '🎲'} ${this._esc(g.name)}</h2>
            <div class="wg-lore"><p>${this._esc(g.how || '')}</p></div>
            <div class="wg-wager-stake">${this._L('wg.wager.stake', 'Stake')}: <b>${(this._wagerStake || this._betFloor()).toLocaleString()}G</b></div>
            ${preHtml}
            ${betHtml}
            <button type="button" id="wg-wager-deal" class="wg-restore-btn wg-wager-deal">
                <i class="fa-solid fa-dice" aria-hidden="true"></i> ${g.action || this._L('wg.wager.deal', 'DEAL & ROLL')}
            </button>
            <div id="wg-wager-result" class="wg-wager-result" role="status" aria-live="polite"></div>
            <button type="button" id="wg-wager-back" class="wg-wager-back">${this._L('wg.wager.back', '← Back to games')}</button>`;
        const back = document.getElementById('wg-wager-back');
        if (back && !back._wgBound) { back._wgBound = true; back.addEventListener('click', () => this.setSlide(this.WAGER_SLIDE)); }
    }

    // Live 3D wager table on #wg-wager-canvas — green felt, three dealt cards, two [REF#UI-00910]
    // tumbling dice. DEDICATED renderer (isolated from the shared preview engine so
    // it can't disturb the slot/monster/avatar previews); mounted on the WAGER spread,
    // torn down on leave/close.
    _mountWagerPreview() {
        const THREE = window.THREE;
        const canvas = document.getElementById('wg-wager-canvas');
        if (!THREE || !canvas) return;
        // REBUILD ON GAME-KIND CHANGE (Mark 2026-06-24: "dice games still show cards"). The felt was built ONCE and the [REF#UI-00911]
        // early-return reused it forever — so switching from a CARD game to a DICE game kept the stale card felt. Tear it
        // down + rebuild whenever the felt KIND (bj / dice / card) changes; reuse it when the kind is the same.
        // BLACKJACK mode (Mark 2026-06-22): the right-page 3D table mirrors the live hand — dealer row at the
        // back, player row at the front, hit cards dealt in from the shoe with an arc + flip. Other games keep
        // the decorative 3-card + dice felt.
        const isBJ = (this._wagerSelected === 'BLACKJACK');
        // Kind-aware felt (Mark 2026-06-23): dice games show ONLY dice, card games show ONLY cards. [REF#UI-00912]
        // ("dice rolls — should only have dice not cards on the canvas.") Blackjack draws live hands.
        const _wgKind = (this.wagerGames[this._wagerSelected] || {}).kind || 'card';
        const showDice  = !isBJ && _wgKind === 'dice';
        const showCards = !isBJ && _wgKind !== 'dice';
        const _feltSig = isBJ ? 'bj' : _wgKind;   // 'bj' | 'dice' | 'card' [REF#UI-00913]
        if (this._wagerPv) { if (this._wagerPv._sig === _feltSig) return; this._teardownWagerPreview(); }   // same kind → reuse; different → rebuild [REF#UI-00914]
        // KARMA-TINTED CARDS (Mark 2026-06-24): + karma → white faces / black ink; − karma → black faces / white ink [REF#UI-00915]
        // (red suits brighten on black so they stay legible). Read live from the Oni-Baba telemetry mirrored into Panels.
        const _km = (window._lastOniBabaStats && typeof window._lastOniBabaStats.karma === 'number') ? window._lastOniBabaStats.karma : 0;
        const _pal = (_km < 0)
            ? { face:'#16161c', faceGrad:'#0c0c12', border:'#3a3a46', ink:'#f4f1e8', red:'#ff5d68', edge:0x26262e }
            : { face:'#f7f5ef', faceGrad:'#ece5d1', border:'#cabfa0', ink:'#16161c', red:'#c01926', edge:0xe9e4d6 };
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        // PHOTO-REAL GRADE (Mark 2026-06-25: "crisper and more photo realistic"). r160 color-managed pipeline: sRGB output + [REF#UI-00916]
        // ACES filmic tone-map for the soft highlight roll-off on the laminated cards, plus soft shadows. NB: this is the
        // ISOLATED low-power Panels preview renderer, NOT the engine render path — the NO-THROTTLE mandate (true 120fps@4K)
        // governs the engine only; render-on-demand here de-prioritizes (never throttles the engine). We DELIBERATELY do NOT
        // set useLegacyLights — it is deprecated in r160 (console-warns) and would ~3.14× over-brighten this scene, which was
        // authored under r160's non-legacy default; expose is the single brightness lever instead.
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.12;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        const MAXA = (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) ? renderer.capabilities.getMaxAnisotropy() : 8;
        this._wagerMaxA = MAXA;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
        camera.position.set(0, 2.7, 3.5); camera.lookAt(0, 0.1, isBJ ? -0.05 : 0.3);
        if (isBJ) { camera.position.set(0, 2.55, 3.75); camera.lookAt(0, 0.05, -0.08); }
        scene.add(new THREE.AmbientLight(0xb8c8e0, isBJ ? 0.95 : 0.85));
        const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(2.5, 5, 3); scene.add(key);
        key.castShadow = true;                                                    // sole shadow caster — soft contact shadows under the cards/dice [REF#UI-00917]
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
        { const sc = key.shadow.camera; sc.near = 1; sc.far = 14; sc.left = -3.4; sc.right = 3.4; sc.top = 3.4; sc.bottom = -3.4; sc.updateProjectionMatrix(); }
        const rim = new THREE.DirectionalLight(0x3ad4e6, 0.6); rim.position.set(-3, 2.5, -2); scene.add(rim);   // cyan rim (design-system) — no purple [REF#UI-00918]
        if (isBJ) { const fill = new THREE.PointLight(0xfff2d0, 0.6, 9, 1.6); fill.position.set(0, 3.0, 1.2); scene.add(fill); }

        // ── Professional poker table (Mark 2026-06-23) ─────────────────────────────── [REF#UI-00919]
        // Casino-green felt with a baked weave + inlaid gold betting arc, ringed by a
        // wooden racetrack and a rounded padded-leather rail (Torus) so it reads as a
        // real table, not a flat green disc.
        const felt = new THREE.Mesh(new THREE.CircleGeometry(3.0, 64),
            new THREE.MeshStandardMaterial({ color: 0x063a1d, roughness: 0.98, metalness: 0.0 }));   // deep billiard green (Mark 2026-06-24: "too light lime") [REF#UI-00920]
        felt.rotation.x = -Math.PI/2; felt.receiveShadow = true; scene.add(felt);                    // catches the card/dice contact shadows [REF#UI-00921]
        // Wooden racetrack (between felt and rail) [REF#UI-00922]
        const woodRing = new THREE.Mesh(new THREE.RingGeometry(2.86, 3.16, 64),
            new THREE.MeshStandardMaterial({ color: 0x2c1a0e, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide, envMapIntensity: 0.5 }));
        woodRing.rotation.x = -Math.PI/2; woodRing.position.y = 0.004; woodRing.receiveShadow = true; scene.add(woodRing);
        // Rounded padded-leather armrest rail [REF#UI-00923]
        if (THREE.TorusGeometry) {
            const rail = new THREE.Mesh(new THREE.TorusGeometry(3.04, 0.17, 16, 64),
                new THREE.MeshStandardMaterial({ color: 0x1c0f08, roughness: 0.42, metalness: 0.12, envMapIntensity: 0.5 }));   // matte leather, not plastic [REF#UI-00924]
            rail.rotation.x = Math.PI/2; rail.position.y = 0.075; scene.add(rail);
        }
        // Felt surface: baked weave grain + radial vignette + a gilded betting arc. [REF#UI-00925]
        let _feltNormalMap = null;   // stashed on pv so teardown can dispose the procedural normal map [REF#UI-00926]
        (() => {
            const fc = document.createElement('canvas'); fc.width = fc.height = 512; const fx = fc.getContext('2d');
            fx.fillStyle = '#063a1d'; fx.fillRect(0,0,512,512);
            // fine cross-weave so the felt has a fabric tooth rather than flat paint [REF#UI-00927]
            fx.globalAlpha = 0.05;
            for (let i = 0; i < 512; i += 3) {
                fx.strokeStyle = (i % 6) ? '#0c4d2a' : '#03210e';
                fx.beginPath(); fx.moveTo(i,0); fx.lineTo(i,512); fx.stroke();
                fx.beginPath(); fx.moveTo(0,i); fx.lineTo(512,i); fx.stroke();
            }
            fx.globalAlpha = 1;
            // centred radial vignette for table depth [REF#UI-00928]
            const vg = fx.createRadialGradient(256,256,60, 256,256,256);
            vg.addColorStop(0, 'rgba(34,104,62,0.26)'); vg.addColorStop(0.6, 'rgba(6,58,29,0.05)'); vg.addColorStop(1, 'rgba(0,14,7,0.74)');
            fx.fillStyle = vg; fx.fillRect(0,0,512,512);
            // gilded betting arc (two concentric inlay lines) [REF#UI-00929]
            fx.strokeStyle = 'rgba(226,196,112,0.55)'; fx.lineWidth = 3;
            fx.beginPath(); fx.arc(256,256,182,0,Math.PI*2); fx.stroke();
            fx.strokeStyle = 'rgba(226,196,112,0.28)'; fx.lineWidth = 1.5;
            fx.beginPath(); fx.arc(256,256,196,0,Math.PI*2); fx.stroke();
            const ft = new THREE.CanvasTexture(fc); ft.anisotropy = MAXA; ft.colorSpace = THREE.SRGBColorSpace;   // albedo → sRGB (r160 ColorManagement on by default; untagged = washed out) [REF#UI-00930]
            felt.material.map = ft; felt.material.color.set(0xffffff); felt.material.needsUpdate = true;
            // Procedural micro-normal so the felt catches a real fabric tooth under the key light (data tex → leave NoColorSpace). [REF#UI-00931]
            const nc = document.createElement('canvas'); nc.width = nc.height = 256; const nx = nc.getContext('2d');
            nx.fillStyle = '#8080ff'; nx.fillRect(0,0,256,256);                  // flat normal (+Z) [REF#UI-00932]
            for (let i = 0; i < 256; i += 3) {                                   // fine cross-weave perturbation [REF#UI-00933]
                nx.strokeStyle = (i % 6) ? 'rgba(140,124,255,0.55)' : 'rgba(112,150,255,0.55)';
                nx.beginPath(); nx.moveTo(i,0); nx.lineTo(i,256); nx.stroke();
                nx.beginPath(); nx.moveTo(0,i); nx.lineTo(256,i); nx.stroke();
            }
            const fn = new THREE.CanvasTexture(nc); fn.wrapS = fn.wrapT = THREE.RepeatWrapping; fn.repeat.set(6, 6); fn.anisotropy = MAXA;
            felt.material.normalMap = fn; felt.material.normalScale = new THREE.Vector2(0.16, 0.16);
            _feltNormalMap = fn;
        })();

        // Rounded-rect path helper (hoisted up here Mark 2026-06-25 so the restyled playing-card _cardFace can round its corners; was below by the dice). [REF#UI-00934]
        const _rr = (x, X, Y, W, H, rad) => { x.beginPath(); x.moveTo(X+rad,Y); x.arcTo(X+W,Y,X+W,Y+H,rad); x.arcTo(X+W,Y+H,X,Y+H,rad); x.arcTo(X,Y+H,X,Y,rad); x.arcTo(X,Y,X+W,Y,rad); x.closePath(); };
        // Hyper-real card face (Mark 2026-06-24: "nuemorphic styled 3d cards hyper realistic"): physically-based [REF#UI-00935]
        // clearcoat gives the laminated playing-card sheen where supported (isolated low-power preview renderer — not the engine path).
        const _faceMat = (map) => THREE.MeshPhysicalMaterial
            ? new THREE.MeshPhysicalMaterial({ map, roughness: 0.34, metalness: 0.0, clearcoat: 0.68, clearcoatRoughness: 0.18 })
            : new THREE.MeshStandardMaterial({ map, roughness: 0.42 });
        const _cardFace = (rank, suit, red) => {                                   // SMALL PLAYING-CARD LOOK (Mark 2026-06-25): rounded corners + dual corner indices + gradient, matching the blackjack face [REF#UI-00936]
            const c = document.createElement('canvas'); c.width = 200; c.height = 280; const x = c.getContext('2d');
            x.fillStyle = '#0e0a14'; x.fillRect(0,0,200,280);                       // bg shows through the rounded cut [REF#UI-00937]
            _rr(x, 4, 4, 192, 272, 14);                                             // rounded card corners (14px) [REF#UI-00938]
            const g = x.createLinearGradient(0,0,0,280); g.addColorStop(0,_pal.face); g.addColorStop(1,_pal.faceGrad);
            x.fillStyle = g; x.fill(); x.lineWidth = 2.5; x.strokeStyle = _pal.border; x.stroke();
            const col = red ? _pal.red : _pal.ink;
            x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle';
            x.font = 'bold 40px Georgia, serif'; x.fillText(rank, 32, 42);          // top-left index [REF#UI-00939]
            x.font = 'bold 30px Georgia, serif'; x.fillText(suit, 32, 78);
            x.save(); x.translate(168, 238); x.rotate(Math.PI);                      // bottom-right index (rotated) [REF#UI-00940]
            x.font = 'bold 40px Georgia, serif'; x.fillText(rank, 0, 0);
            x.font = 'bold 30px Georgia, serif'; x.fillText(suit, 0, 36); x.restore();
            x.font = 'bold 118px Georgia, serif'; x.fillText(suit, 100, 152);        // big centre pip [REF#UI-00941]
            const t = new THREE.CanvasTexture(c); t.anisotropy = MAXA; t.colorSpace = THREE.SRGBColorSpace; return t;
        };
        const _edgeMat = () => new THREE.MeshStandardMaterial({ color: _pal.edge, roughness: 0.62 });
        const _mkCard = (rank, suit, red) => new THREE.Mesh(new THREE.BoxGeometry(0.80, 1.12, 0.03), [
            _edgeMat(), _edgeMat(), _edgeMat(), _edgeMat(),
            _faceMat(_cardFace(rank, suit, red)),
            new THREE.MeshStandardMaterial({ map: this._getCardBackTex(), roughness: 0.5, metalness: 0.1 }),   // origami-logo card back (Mark 2026-06-24) [REF#UI-00942]
        ]);
        const cards = showCards ? [['A','♠',false],['K','♥',true],['Q','♣',false]].map((c,i) => {
            const card = _mkCard(c[0], c[1], c[2]);
            card.rotation.x = -Math.PI/2 + 0.06;
            card.position.set(-0.92 + i*0.92, 0.02, 0.55);
            card.rotation.z = (i-1) * 0.16;
            card.userData.baseY = 0.02 + i*0.004;
            card.castShadow = true;
            scene.add(card); return card;
        }) : [];

        // Photo-real casino die face: a beveled ivory body (darker chamfer edge → lighter [REF#UI-00943]
        // inset face), drilled glossy pips (radial gradient + highlight), 1-pip in casino
        // red. Canvas-baked → no per-fragment light cost, r128-safe (no RoundedBoxGeometry). (_rr now hoisted above _faceMat — Mark 2026-06-25)
        const _dieTex = (n) => {
            const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
            x.fillStyle = '#d8d2bf'; x.fillRect(0,0,256,256);                       // chamfer/edge tone [REF#UI-00944]
            const inset = 18, r = 46, fw = 256 - 2*inset;
            const g = x.createLinearGradient(inset, inset, 256-inset, 256-inset);   // ivory face, top-left lit [REF#UI-00945]
            g.addColorStop(0, '#fcfbf5'); g.addColorStop(0.55, '#f2efe4'); g.addColorStop(1, '#e6e0cf');
            _rr(x, inset, inset, fw, fw, r); x.fillStyle = g; x.fill();
            x.save(); _rr(x, inset, inset, fw, fw, r); x.clip();                    // inner edge shadow for depth [REF#UI-00946]
            x.lineWidth = 12; x.strokeStyle = 'rgba(120,110,86,0.20)'; _rr(x, inset+3, inset+3, fw-6, fw-6, r-3); x.stroke(); x.restore();
            const R = 23;
            const dot = (px, py, red) => {
                const pg = x.createRadialGradient(px-6, py-6, 2, px, py, R);
                if (red) { pg.addColorStop(0,'#e7616a'); pg.addColorStop(0.45,'#b81626'); pg.addColorStop(1,'#5e060e'); }
                else     { pg.addColorStop(0,'#3a3a44'); pg.addColorStop(0.45,'#17171d'); pg.addColorStop(1,'#050507'); }
                x.beginPath(); x.arc(px,py,R,0,Math.PI*2); x.fillStyle = pg; x.fill();
                x.beginPath(); x.arc(px-7, py-8, R*0.30, 0, Math.PI*2); x.fillStyle = 'rgba(255,255,255,0.38)'; x.fill();   // gloss [REF#UI-00947]
            };
            const P = { c:[128,128], tl:[80,80], tr:[176,80], bl:[80,176], br:[176,176], ml:[80,128], mr:[176,128] };
            const sets = { 1:['c'], 2:['tl','br'], 3:['tl','c','br'], 4:['tl','tr','bl','br'], 5:['tl','tr','c','bl','br'], 6:['tl','tr','ml','mr','bl','br'] };
            (sets[n] || []).forEach(k => dot(P[k][0], P[k][1], n === 1));   // the lone 1-pip is casino red [REF#UI-00948]
            const t = new THREE.CanvasTexture(c); t.anisotropy = MAXA; t.colorSpace = THREE.SRGBColorSpace; return t;
        };
        // box faces [+x,-x,+y,-y,+z,-z] → pips chosen so opposite faces sum to 7 [REF#UI-00949]
        const _mkDie = () => new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
            [1,6,2,5,3,4].map(n => new THREE.MeshStandardMaterial({ map: _dieTex(n), roughness: 0.34, metalness: 0.0 })));
        // Dice games (Mark 2026-06-23): dice are the hero — centred on the felt, no cards. [REF#UI-00950]
        const dice = showDice ? [[-0.46,-0.05],[0.5,-0.18]].map(([dx,dz]) => {
            const d = _mkDie(); d.position.set(dx, 0.32, dz);
            d.userData.spin = { x: 0.8 + Math.random()*1.4, y: 1.0 + Math.random()*1.5 };
            d.castShadow = true;
            scene.add(d); return d;
        }) : [];

        // ── BLACKJACK card factory + shoe (Mark 2026-06-22) ───────────────────────── [REF#UI-00951]
        // Ivory faces with rounded corners + dual corner indices, and an ornate oni-medallion
        // back so the dealer's face-down hole card reads as a real card. Canvas-baked (r128-safe).
        const _bjFace = (rank, suit, red) => {
            const c = document.createElement('canvas'); c.width = 200; c.height = 280; const x = c.getContext('2d');
            x.fillStyle = '#0e0a14'; x.fillRect(0,0,200,280);                       // bg shows through the rounded cut [REF#UI-00952 → see REF#UI-00937]
            _rr(x, 4, 4, 192, 272, 14);
            const g = x.createLinearGradient(0,0,0,280); g.addColorStop(0,_pal.face); g.addColorStop(1,_pal.faceGrad);
            x.fillStyle = g; x.fill(); x.lineWidth = 2.5; x.strokeStyle = _pal.border; x.stroke();
            const col = red ? _pal.red : _pal.ink;
            x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle';
            x.font = 'bold 40px Georgia, serif'; x.fillText(rank, 32, 42);          // top-left index [REF#UI-00953 → see REF#UI-00939]
            x.font = 'bold 30px Georgia, serif'; x.fillText(suit, 32, 78);
            x.save(); x.translate(168, 238); x.rotate(Math.PI);                      // bottom-right index (rotated) [REF#UI-00954 → see REF#UI-00940]
            x.font = 'bold 40px Georgia, serif'; x.fillText(rank, 0, 0);
            x.font = 'bold 30px Georgia, serif'; x.fillText(suit, 0, 36); x.restore();
            x.font = 'bold 118px Georgia, serif'; x.fillText(suit, 100, 152);        // big centre pip [REF#UI-00955 → see REF#UI-00941]
            const t = new THREE.CanvasTexture(c); t.anisotropy = MAXA; t.colorSpace = THREE.SRGBColorSpace; return t;
        };
        const _bjBack = () => {   // (legacy procedural oni-medallion back — superseded by the origami-logo image back per Mark 2026-06-24; retained for reference) [REF#UI-00956]
            const c = document.createElement('canvas'); c.width = 200; c.height = 280; const x = c.getContext('2d');
            x.fillStyle = '#0e0a14'; x.fillRect(0,0,200,280);
            _rr(x, 4, 4, 192, 272, 14); x.fillStyle = '#8a1426'; x.fill();
            x.save(); _rr(x, 10, 10, 180, 260, 11); x.clip();
            x.strokeStyle = 'rgba(232,198,106,0.45)'; x.lineWidth = 2;               // gold diagonal lattice [REF#UI-00957]
            for (let i = -280; i < 200; i += 15) { x.beginPath(); x.moveTo(i,0); x.lineTo(i+280,280); x.stroke(); x.beginPath(); x.moveTo(i,280); x.lineTo(i+280,0); x.stroke(); }
            x.restore();
            x.beginPath(); x.arc(100,140,42,0,Math.PI*2); x.fillStyle = '#0e0a14'; x.fill();
            x.lineWidth = 3; x.strokeStyle = '#e8c66a'; x.stroke();
            x.fillStyle = '#e8c66a'; x.font = 'bold 46px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('鬼', 100, 144);
            x.lineWidth = 3.5; x.strokeStyle = '#e8c66a'; _rr(x, 10, 10, 180, 260, 11); x.stroke();
            const t = new THREE.CanvasTexture(c); t.anisotropy = MAXA; t.colorSpace = THREE.SRGBColorSpace; return t;
        };
        const _bjEdge = () => new THREE.MeshStandardMaterial({ color: _pal.edge, roughness: 0.7 });
        const _mkBjCard = (value, suit) => new THREE.Mesh(new THREE.BoxGeometry(0.80, 1.12, 0.03), [
            _bjEdge(), _bjEdge(), _bjEdge(), _bjEdge(),
            _faceMat(_bjFace(this._cardName(value), suit.s, suit.red)),
            new THREE.MeshStandardMaterial({ map: this._getCardBackTex(), roughness: 0.5, metalness: 0.1 }),   // origami-logo card back (Mark 2026-06-24) [REF#UI-00958 → see REF#UI-00942]
        ]);
        const _pickSuit = () => { const s = ['♠','♥','♦','♣'][Math.floor(Math.random()*4)]; return { s, red: s === '♥' || s === '♦' }; };
        const _bjDeckPos = new THREE.Vector3(1.85, 0.16, -1.05);
        if (isBJ) {
            const deckMat = [_bjEdge(), _bjEdge(), new THREE.MeshStandardMaterial({ map: this._getCardBackTex(), roughness: 0.5, metalness: 0.1 }), _bjEdge(), _bjEdge(), _bjEdge()];
            const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.18, 1.16), deckMat);
            shoe.position.copy(_bjDeckPos).setY(0.09); shoe.rotation.y = -0.32; shoe.castShadow = true; scene.add(shoe);
        }

        // ── BRACKETED POINTS PLAQUE (Mark 2026-06-25: "3D text with a bracket to show the points") ────────── [REF#UI-00959]
        // Gilded scoreboard laid flat on the back of the felt. BJ → live ⟦player⟧ (· ⟦dealer⟧ once revealed);
        // dice → ⟦rolled total⟧. MeshBasicMaterial → NO light cost (anti-throttle), transparent so it floats.
        // r128-safe: canvas-textured PlaneGeometry, no TextGeometry. Updated via this._updatePointsDisplay(pv).
        const pointsMesh = new THREE.Mesh(new THREE.PlaneGeometry(isBJ ? 2.25 : 1.7, isBJ ? 0.78 : 0.55),
            new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));   // readout text bypasses ACES → stays crisp gold [REF#UI-00960]
        pointsMesh.rotation.x = -Math.PI / 2;
        pointsMesh.position.set(0, 0.085, isBJ ? 0.30 : -0.55);   // BJ 2026-10-04: closer to the player cards (player row z=0.70) and larger; dice keeps the old back-felt readout. [REF#UI-00961]
        pointsMesh.visible = false;                                // hidden until there's a value to show [REF#UI-00962]
        scene.add(pointsMesh);

        // PMREM image-based lighting (Mark 2026-06-25 photo-real pass): a soft warm-overhead → dark-floor gradient gives the [REF#UI-00963]
        // clearcoat cards their laminated sheen + the dice/wood their subtle reflections. Built per-mount from an 8×256 canvas
        // (cheap) and disposed in teardown — the env render-target is tied to THIS renderer's GL context, so it cannot be cached
        // across the per-mount renderer recreation. (NB: isolated preview renderer, not the engine path.)
        const envRT = this._buildWagerEnv(renderer);
        if (envRT) scene.environment = envRT.texture;

        const clock = new THREE.Clock();
        const pv = { renderer, scene, camera, clock, raf: 0, cards, dice, canvas, isBJ, _sig: _feltSig,
                     bjPlayer: [], bjDealer: [], makeCard: _mkBjCard, pickSuit: _pickSuit, deckPos: _bjDeckPos,
                     pointsMesh, lastDisplayedPoints: null, lastPoints: null,
                     _t: 0, dirty: true, envRT, _feltNormalMap, _maxA: MAXA, _camAbort: null, _diceRested: false, cam: null };
        this._wagerPv = pv;
        try { this._applyWagerPov(pv); } catch(_){}        // place the camera at this game's saved viewpoint (or the kind's Hero preset) [REF#UI-00964]
        try { this._bindWagerCamControls(pv); } catch(_){} // click-drag orbit · shift/2-finger pan · wheel/pinch zoom · arrows · dbl-click reset [REF#UI-00965]
        if (isBJ) { try { this._syncBlackjack3D(false); } catch(_){} }
        const SETTLE = 2.8;   // cards/dice tumble-and-settle window (s) → then the felt rests and the renderer can idle [REF#UI-00966]
        const tick = () => {
            pv.raf = window._compassionFrame(tick, () => this._wagerPv === pv);
            const overlay = document.getElementById(this.containerId);
            if (!overlay || !overlay.classList.contains('is-open') || this.currentSlide !== this.WAGER_GAME_SLIDE) return;   // FIX (Mark 2026-06-20): the felt+dice canvas lives on WAGER_GAME_SLIDE, not WAGER_SLIDE (the grid) — guarding on the wrong slide meant the render loop returned every frame → zero frames drawn → dice never animated [REF#UI-00967]
            const w = canvas.clientWidth || 320, h = canvas.clientHeight || 320;
            if (canvas.width !== w || canvas.height !== h) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); pv.dirty = true; }
            // ONE shared timeline (Mark 2026-06-25): Clock.getDelta() advances the SAME internal timer getElapsedTime() reads, so [REF#UI-00968]
            // the tick + _syncBlackjack3D must never both call getElapsedTime() (it would double-advance and stutter the deal).
            // Sample delta ONCE here, accumulate pv._t, and let _syncBlackjack3D read pv._t.
            const compassionStatic = window._compassionRender?.staticVisuals === true;
            const dt = Math.min(clock.getDelta(), 0.05); pv._t = compassionStatic ? Math.max(SETTLE, pv._t) : pv._t + dt; const t = pv._t;
            // SETTLE: dice/cards tumble then come to rest (more photo-real than spinning forever) so render-on-demand can idle. [REF#UI-00969]
            const sk = Math.max(0, 1 - t / SETTLE);
            const settling = (dice.length || cards.length) ? sk > 0 : false;
            dice.forEach((d, i) => { d.rotation.x += 0.016 * d.userData.spin.x * sk; d.rotation.y += 0.016 * d.userData.spin.y * sk; d.position.y = 0.32 + Math.abs(Math.sin(t * 2.2 + i * 1.3)) * 0.18 * sk; });
            cards.forEach((c, i) => { c.position.y = c.userData.baseY + Math.sin(t * 1.3 + i) * 0.012 * sk; });
            if (sk <= 0 && dice.length && !pv._diceRested) {                       // settled dice snap to axis-aligned faces + pin to the felt [REF#UI-00970]
                dice.forEach(d => { const q = Math.PI / 2; d.rotation.x = Math.round(d.rotation.x / q) * q; d.rotation.y = Math.round(d.rotation.y / q) * q; d.position.y = 0.32; });
                pv._diceRested = true; pv.dirty = true;
            }
            let tweening = false;
            if (isBJ) {                                  // advance the deal/flip tweens for both hands [REF#UI-00971]
                const adv = (card) => {
                    const a = card.userData.anim; if (!a) return;
                    tweening = true;
                    let k = compassionStatic ? 1 : (t - a.t0) / a.dur;
                    if (k < 0) { card.position.copy(a.p0); card.quaternion.copy(a.q0); return; }   // waiting for its staggered turn [REF#UI-00972]
                    if (k >= 1) { card.position.copy(a.p1); card.quaternion.copy(a.q1); card.userData.anim = null; return; }
                    const e = 1 - Math.pow(1 - k, 3);    // easeOutCubic [REF#UI-00973]
                    card.position.lerpVectors(a.p0, a.p1, e);
                    if (a.arc) card.position.y += Math.sin(Math.PI * k) * a.arc;
                    card.quaternion.copy(a.q0).slerp(a.q1, e);
                };
                pv.bjPlayer.forEach(adv); pv.bjDealer.forEach(adv);
            }
            const camMoving = this._updateWagerCamera(pv, dt);   // damp the orbit/pan/zoom toward the user's target POV [REF#UI-00974]
            const active = camMoving || settling || tweening;
            if (pv.dirty || active || compassionStatic) { // RENDER-ON-DEMAND [REF#UI-00975]
                this._updatePointsDisplay(pv);           // refresh the bracketed scoreboard (BJ totals live / dice total on roll); cached, so steady frames are free [REF#UI-00976]
                renderer.render(scene, camera);
                pv.dirty = active;                       // stay dirty while animating; the final settle frame clears it → idle [REF#UI-00977]
            }
        };
        pv.tick = tick;
        pv.raf = window._compassionFrame(tick, () => this._wagerPv === pv);
    }
    _teardownWagerPreview() {
        const pv = this._wagerPv; if (!pv) return;
        window._compassionForget(pv.tick);
        try { this._saveWagerPov(pv); } catch(_){}                              // persist this game's viewpoint before the scene is dropped [REF#UI-00978]
        if (pv._camAbort) { try { pv._camAbort.abort(); } catch(_){} }          // atomic removal of every pointer/wheel/key listener [REF#UI-00979]
        if (pv.raf) { try { cancelAnimationFrame(pv.raf); } catch(_){} }
        try { if (pv.scene) pv.scene.environment = null; if (pv.envRT) pv.envRT.dispose(); } catch(_){}                       // free the per-mount PMREM env (bound to this GL context) [REF#UI-00980]
        try { if (pv._feltNormalMap) pv._feltNormalMap.dispose(); } catch(_){}  // procedural felt normal map — traverse only disposes .map, not .normalMap [REF#UI-00981]
        try { pv.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && !m.map._sharedBack && !m.map._pointsReadout) m.map.dispose(); m.dispose(); }); }); } catch(_){}   // _sharedBack = the cached origami-logo back; _pointsReadout = the live scoreboard tex (disposed explicitly below); never let traverse double-dispose them [REF#UI-00982]
        try { const pm = pv.pointsMesh && pv.pointsMesh.material && pv.pointsMesh.material.map; if (pm && pm._pointsReadout) pm.dispose(); } catch(_){}   // close the pre-existing scoreboard-tex leak the traverse guard skipped [REF#UI-00983]
        try { pv.renderer.dispose(); } catch(_){}
        this._wagerPv = null;
    }

    // ── ADJUSTABLE 3D POV (Mark 2026-06-25: "Best in class POV angles for user to adjust with click and pan") ────────────── [REF#UI-00984]
    // r160 ships NO OrbitControls addon for this Panels module, so the orbit/pan/zoom controller is hand-rolled on THREE.Spherical
    // + MathUtils.damp (framerate-independent inertia). The camera damps toward a per-GAME target viewpoint (persisted to
    // localStorage 'wg_wager_pov'); presets + clamps live in this._WG_CAM. All of this drives the ISOLATED preview renderer only.

    // Soft warm-overhead → dark-floor gradient baked to a PMREM env for the cards' clearcoat sheen + the wood/dice reflections. [REF#UI-00985]
    _buildWagerEnv(renderer) {
        const THREE = window.THREE;
        try {
            const c = document.createElement('canvas'); c.width = 8; c.height = 256; const x = c.getContext('2d');
            const g = x.createLinearGradient(0, 0, 0, 256);
            g.addColorStop(0.00, '#2b3550'); g.addColorStop(0.42, '#4a4640'); g.addColorStop(0.50, '#6b5a3e'); g.addColorStop(0.58, '#352c22'); g.addColorStop(1.00, '#08080c');
            x.fillStyle = g; x.fillRect(0, 0, 8, 256);
            const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.mapping = THREE.EquirectangularReflectionMapping;
            const pmrem = new THREE.PMREMGenerator(renderer);
            if (pmrem.compileEquirectangularShader) pmrem.compileEquirectangularShader();
            const rt = pmrem.fromEquirectangular(tex);
            pmrem.dispose(); tex.dispose();
            return rt;
        } catch (_) { return null; }
    }

    // Damp the rendered spherical offset + pivot toward the target each frame; returns true while still moving (keeps rendering). [REF#UI-00986]
    _updateWagerCamera(pv, dt) {
        const THREE = window.THREE, c = pv.cam; if (!c) return false;
        if (window._compassionRender?.staticVisuals) { c.sph.copy(c.tsph); c.piv.copy(c.tpiv); }
        const M = THREE.MathUtils, L = 9;
        c.sph.radius = M.damp(c.sph.radius, c.tsph.radius, L, dt);
        c.sph.phi    = M.damp(c.sph.phi,    c.tsph.phi,    L, dt);
        c.sph.theta  = M.damp(c.sph.theta,  c.tsph.theta,  L, dt);
        c.piv.x = M.damp(c.piv.x, c.tpiv.x, L, dt);
        c.piv.y = M.damp(c.piv.y, c.tpiv.y, L, dt);
        c.piv.z = M.damp(c.piv.z, c.tpiv.z, L, dt);
        const off = new THREE.Vector3().setFromSpherical(c.sph);
        pv.camera.position.copy(c.piv).add(off);
        pv.camera.lookAt(c.piv);
        return Math.abs(c.sph.radius - c.tsph.radius) > 1e-3 || Math.abs(c.sph.phi - c.tsph.phi) > 1e-4 ||
               Math.abs(c.sph.theta - c.tsph.theta) > 1e-4 || c.piv.distanceToSquared(c.tpiv) > 1e-6;
    }

    _wagerKind(pv) { return pv._sig === 'bj' ? 'bj' : (pv._sig === 'dice' ? 'dice' : 'card'); }
    _wagerPovKey(pv) { return this._wagerSelected || this._wagerKind(pv); }   // per-GAME persistence ("all of them") [REF#UI-00987]

    // Place the camera at this game's saved viewpoint (or the kind's Hero preset). Snaps current=target so there's no fly-in on mount. [REF#UI-00988]
    _applyWagerPov(pv) {
        const THREE = window.THREE, C = this._WG_CAM._clamp;
        const kind = this._wagerKind(pv);
        let p = null;
        try { const all = JSON.parse(localStorage.getItem('wg_wager_pov') || '{}'); p = all[this._wagerPovKey(pv)]; } catch (_) {}
        if (!p) p = (this._WG_CAM[kind] || this._WG_CAM.card).hero;
        const radius = Math.min(C.MAX_R, Math.max(C.MIN_R, p.radius));
        const phi    = Math.min(C.MAX_PHI, Math.max(C.MIN_PHI, p.phi));
        const theta  = p.theta || 0;
        pv.cam = {
            sph:  new THREE.Spherical(radius, phi, theta),
            tsph: new THREE.Spherical(radius, phi, theta),
            piv:  new THREE.Vector3(p.tx || 0, p.ty || 0, p.tz || 0),
            tpiv: new THREE.Vector3(p.tx || 0, p.ty || 0, p.tz || 0),
        };
        const off = new THREE.Vector3().setFromSpherical(pv.cam.sph);
        pv.camera.position.copy(pv.cam.piv).add(off);
        pv.camera.lookAt(pv.cam.piv);
        pv.dirty = true;
    }

    // Damp toward a named preset for this game's kind (Hero / Top / Side). [REF#UI-00989]
    _setWagerPreset(pv, name) {
        if (!pv || !pv.cam) return;
        const C = this._WG_CAM._clamp, t = (this._WG_CAM[this._wagerKind(pv)] || this._WG_CAM.card)[name];
        if (!t) return;
        pv.cam.tsph.radius = Math.min(C.MAX_R, Math.max(C.MIN_R, t.radius));
        pv.cam.tsph.phi    = Math.min(C.MAX_PHI, Math.max(C.MIN_PHI, t.phi));
        pv.cam.tsph.theta  = t.theta || 0;
        pv.cam.tpiv.set(t.tx || 0, t.ty || 0, t.tz || 0);
        pv.dirty = true;
    }

    _saveWagerPov(pv) {
        if (!pv || !pv.cam) return;
        const s = pv.cam.tsph, v = pv.cam.tpiv;
        try {
            const all = JSON.parse(localStorage.getItem('wg_wager_pov') || '{}');
            all[this._wagerPovKey(pv)] = { radius: s.radius, phi: s.phi, theta: s.theta, tx: v.x, ty: v.y, tz: v.z };
            localStorage.setItem('wg_wager_pov', JSON.stringify(all));
        } catch (_) {}
    }

    // Pointer-drag orbit · shift / two-finger pan · wheel / pinch zoom · arrow-key nudge · dbl-click reset. AbortController makes [REF#UI-00990]
    // teardown atomic. The canvas listeners are per-mount (signal); the preset chips/reset are wired once + read this._wagerPv live.
    _bindWagerCamControls(pv) {
        const THREE = window.THREE, canvas = pv.canvas, C = this._WG_CAM._clamp;
        pv._camAbort = new AbortController(); const sig = pv._camAbort.signal;
        const ptrs = new Map(); let pinchD = 0;
        const clampPhi = v => Math.min(C.MAX_PHI, Math.max(C.MIN_PHI, v));
        const clampR   = v => Math.min(C.MAX_R, Math.max(C.MIN_R, v));
        const orbit = (dx, dy) => { const t = pv.cam.tsph; t.theta -= dx * 0.005; t.phi = clampPhi(t.phi - dy * 0.005); pv.dirty = true; };
        const pan = (dx, dy) => {
            const c = pv.cam, k = c.tsph.radius * 0.0016;
            const right = new THREE.Vector3().setFromMatrixColumn(pv.camera.matrix, 0);
            const up    = new THREE.Vector3().setFromMatrixColumn(pv.camera.matrix, 1);
            c.tpiv.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
            c.tpiv.x = Math.max(-2, Math.min(2, c.tpiv.x)); c.tpiv.y = Math.max(-0.5, Math.min(1.2, c.tpiv.y)); c.tpiv.z = Math.max(-2, Math.min(2, c.tpiv.z));   // stay near the table [REF#UI-00991]
            pv.dirty = true;
        };
        const zoom = f => { pv.cam.tsph.radius = clampR(pv.cam.tsph.radius * f); pv.dirty = true; };
        canvas.addEventListener('pointerdown', e => { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.style.cursor = 'grabbing'; }, { signal: sig });
        canvas.addEventListener('pointermove', e => {
            const p = ptrs.get(e.pointerId); if (!p) return;
            const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
            if (ptrs.size >= 2) {
                const a = [...ptrs.values()], nd = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
                if (pinchD) zoom(pinchD / Math.max(1, nd)); pinchD = nd;   // spread fingers → zoom in [REF#UI-00992]
                pan(dx * 0.5, dy * 0.5);
            } else if (e.shiftKey || (e.buttons & 2)) { pan(dx, dy); }
            else { orbit(dx, dy); }
            e.preventDefault();
        }, { signal: sig, passive: false });
        const release = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0; if (!ptrs.size) canvas.style.cursor = 'grab'; this._saveWagerPov(pv); };
        canvas.addEventListener('pointerup', release, { signal: sig });
        canvas.addEventListener('pointercancel', release, { signal: sig });
        canvas.addEventListener('wheel', e => { zoom(1 + Math.sign(e.deltaY) * 0.08); this._saveWagerPov(pv); e.preventDefault(); }, { signal: sig, passive: false });
        canvas.addEventListener('contextmenu', e => e.preventDefault(), { signal: sig });
        canvas.addEventListener('dblclick', () => { this._setWagerPreset(pv, 'hero'); this._saveWagerPov(pv); }, { signal: sig });
        canvas.addEventListener('keydown', e => {
            const k = e.key;
            if (k === 'ArrowLeft') orbit(-26, 0); else if (k === 'ArrowRight') orbit(26, 0);
            else if (k === 'ArrowUp') orbit(0, -26); else if (k === 'ArrowDown') orbit(0, 26);
            else if (k === '+' || k === '=') zoom(0.92); else if (k === '-' || k === '_') zoom(1.08);
            else return;
            this._saveWagerPov(pv); e.preventDefault();
        }, { signal: sig });
        // Preset chips + reset — wired ONCE (persist across mounts), reading this._wagerPv live so they always drive the current felt. [REF#UI-00993]
        const wrap = canvas.closest('.wg-wager-canvas-wrap');
        if (wrap && !wrap._camWired) {
            wrap._camWired = true;
            wrap.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { const p = this._wagerPv; if (!p) return; this._setWagerPreset(p, b.getAttribute('data-preset')); this._saveWagerPov(p); }));
            const rb = wrap.querySelector('.wg-cam-reset');
            if (rb) rb.addEventListener('click', () => { const p = this._wagerPv; if (!p) return; this._setWagerPreset(p, 'hero'); this._saveWagerPov(p); });
        }
    }

    // BRACKETED POINTS SCOREBOARD (Mark 2026-06-25: "3D text with a bracket to show the points… beautiful rendered text"). [REF#UI-00994]
    // Bakes a gilded ⟦N⟧ plaque to a canvas texture on the felt. BJ → live player total (· dealer total once the hole card
    // is revealed, i.e. stage==='done'); dice games → the rolled total stashed on pv.lastPoints at resolve time. Re-bakes the
    // texture only when the displayed string changes (cached in pv.lastDisplayedPoints) so per-frame cost is nil. No new
    // lights (MeshBasicMaterial), r128-safe (canvas texture, no TextGeometry).
    _updatePointsDisplay(pv) {
        if (!pv || !pv.pointsMesh) return;
        let str = '';
        if (pv.isBJ) {
            const bj = this._bj;
            if (bj && bj.player && bj.player.length) {
                const p = this._bjTotal(bj.player);
                if (bj.stage === 'done' && bj.dealer && bj.dealer.length) {
                    str = `⟦ ${p} ⟧  ·  ⟦ ${this._bjTotal(bj.dealer)} ⟧`;   // reveal: player · dealer
                } else {
                    str = `⟦ ${p} ⟧`;                                                       // play: hide dealer (hole card down)
                }
            }
        } else if (pv.lastPoints != null) {
            str = `⟦ ${pv.lastPoints} ⟧`;
        }
        if (str === pv.lastDisplayedPoints) return;          // unchanged → skip re-bake [REF#UI-00995]
        pv.lastDisplayedPoints = str;
        if (!str) { pv.pointsMesh.visible = false; return; } // nothing to show yet [REF#UI-00996]
        const THREE = window.THREE;
        const _bjScale = pv.isBJ ? 1.5 : 1;   // Mark 2026-10-04: Blackjack POINT text was too tiny; 50% larger to match the bigger wager table. [REF#UI-01000B]
        const c = document.createElement('canvas'); c.width = pv.isBJ ? 768 : 512; c.height = pv.isBJ ? 220 : 160; const x = c.getContext('2d');
        const W = c.width, H = c.height, CY = H * 0.51;
        x.clearRect(0,0,W,H);                            // transparent — the gold frame floats on the felt [REF#UI-00997]
        x.lineWidth = 4 * _bjScale; x.strokeStyle = '#e8c66a';
        x.beginPath(); x.moveTo(40*_bjScale+18,30*_bjScale); x.arcTo(W-40*_bjScale,30*_bjScale,W-40*_bjScale,H-30*_bjScale,10*_bjScale); x.arcTo(W-40*_bjScale,H-30*_bjScale,40*_bjScale,H-30*_bjScale,10*_bjScale); x.arcTo(40*_bjScale,H-30*_bjScale,40*_bjScale,30*_bjScale,10*_bjScale); x.arcTo(40*_bjScale,30*_bjScale,W-40*_bjScale,30*_bjScale,10*_bjScale); x.closePath(); x.stroke();   // outer gold bracket frame [REF#UI-00998]
        x.lineWidth = 1.5 * _bjScale; x.strokeStyle = 'rgba(232,198,106,0.40)';
        x.beginPath(); x.moveTo(50*_bjScale+14,40*_bjScale); x.arcTo(W-50*_bjScale,40*_bjScale,W-50*_bjScale,H-40*_bjScale,8*_bjScale); x.arcTo(W-50*_bjScale,H-40*_bjScale,50*_bjScale,H-40*_bjScale,8*_bjScale); x.arcTo(50*_bjScale,H-40*_bjScale,50*_bjScale,40*_bjScale,8*_bjScale); x.arcTo(50*_bjScale,40*_bjScale,W-50*_bjScale,40*_bjScale,8*_bjScale); x.closePath(); x.stroke();   // inner hairline [REF#UI-00999]
        const glow = x.createRadialGradient(W/2,CY,20*_bjScale, W/2,CY,180*_bjScale);
        glow.addColorStop(0,'rgba(232,198,106,0.16)'); glow.addColorStop(1,'rgba(232,198,106,0)');
        x.fillStyle = glow; x.fillRect(40*_bjScale,30*_bjScale,W-80*_bjScale,H-60*_bjScale);       // inner glow [REF#UI-01000]
        x.fillStyle = '#f3dd9a'; x.font = 'bold ' + Math.round(64 * _bjScale) + 'px Georgia, serif'; x.textAlign='center'; x.textBaseline='middle';
        x.fillText(str, W / 2, CY);
        const tex = new THREE.CanvasTexture(c); tex.anisotropy = pv._maxA || 8; tex.colorSpace = THREE.SRGBColorSpace; tex._pointsReadout = true;
        const old = pv.pointsMesh.material.map;
        if (old && old._pointsReadout) { try { old.dispose(); } catch(_){} }   // free the previous scoreboard tex [REF#UI-01001]
        pv.pointsMesh.material.map = tex; pv.pointsMesh.material.needsUpdate = true;
        pv.pointsMesh.visible = true;
    }

    // Origami-logo card back (Mark 2026-06-24: "orgami logo background for cards. the one we use for intro page. just the [REF#UI-01002]
    // image no text."). Loaded once + cached + flagged _sharedBack so _teardownWagerPreview never disposes it — re-upload
    // of the ~2 MB intro art on every wager-screen visit would stutter. Same starlette.png the cover/intro slide uses.
    _getCardBackTex() {
        const THREE = window.THREE;
        if (this._cardBackTex) return this._cardBackTex;
        const tex = new THREE.TextureLoader().load('assets/brand/starlette.png');
        tex.anisotropy = this._wagerMaxA || 8; tex.colorSpace = THREE.SRGBColorSpace; tex._sharedBack = true;   // image albedo → sRGB [REF#UI-01003]
        this._cardBackTex = tex;
        return tex;
    }

    // Project the live blackjack hand (this._bj) onto the 3D felt: dealer row at the back, player [REF#UI-01004]
    // row at the front, the dealer's 2nd card face-down during play. New cards deal in from the shoe
    // with an arc; on reveal the hole card flips face-up. animate=false snaps (mount). (Mark 2026-06-22)
    _syncBlackjack3D(animate) {
        const pv = this._wagerPv, THREE = window.THREE, bj = this._bj;
        if (!pv || !pv.isBJ || !THREE) return;
        window._compassionInvalidate();
        const now = pv._t || 0;   // SHARED timeline — never call pv.clock.getElapsedTime() here (it double-advances the tick's getDelta timer) [REF#UI-01005]
        const flat = (down) => down ? Math.PI / 2 : -Math.PI / 2;   // laid-flat X-rot: face-up vs back-up [REF#UI-01006]
        const disposeCard = (m) => { try { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(mm => { if (mm.map) mm.map.dispose(); mm.dispose(); }); } catch (_) {} };
        const reconcile = (vals, arr, z, holeDown) => {
            vals = vals || [];
            while (arr.length > vals.length) { const m = arr.pop(); pv.scene.remove(m); disposeCard(m); }   // hand shrank (fresh deal) [REF#UI-01007]
            let freshOrder = 0;
            for (let i = 0; i < vals.length; i++) {
                let card = arr[i];
                if (card && card.userData.val !== vals[i]) { pv.scene.remove(card); disposeCard(card); card = null; }   // value at this slot changed (DEAL AGAIN) → rebuild [REF#UI-01008]
                if (!card) { card = pv.makeCard(vals[i], pv.pickSuit()); card.userData.val = vals[i]; card.castShadow = true; pv.scene.add(card); arr[i] = card; card.userData.fresh = true; }
                const n = vals.length;
                const x = (i - (n - 1) / 2) * 0.52, fan = (i - (n - 1) / 2) * 0.05;
                const faceDown = holeDown && i === 1;
                const targetPos = new THREE.Vector3(x, 0.03 + i * 0.004, z);
                const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(flat(faceDown), 0, fan));
                if (card.userData.fresh) {
                    card.userData.fresh = false;
                    if (animate) {
                        const p0 = pv.deckPos.clone();
                        const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(flat(faceDown), 0, -0.55));
                        card.position.copy(p0); card.quaternion.copy(q0);
                        card.userData.anim = { t0: now + freshOrder * 0.14, dur: 0.42, p0, p1: targetPos, q0, q1: targetQuat, arc: 0.24 };
                        freshOrder++;
                    } else { card.position.copy(targetPos); card.quaternion.copy(targetQuat); card.userData.anim = null; }
                } else if (animate) {
                    card.userData.anim = { t0: now, dur: 0.32, p0: card.position.clone(), p1: targetPos, q0: card.quaternion.clone(), q1: targetQuat, arc: 0 };
                } else { card.position.copy(targetPos); card.quaternion.copy(targetQuat); card.userData.anim = null; }
            }
        };
        reconcile(bj && bj.player, pv.bjPlayer, 0.70, false);
        reconcile(bj && bj.dealer, pv.bjDealer, -0.78, !!(bj && bj.stage === 'play'));
        this._updatePointsDisplay(pv);   // refresh the bracketed totals immediately on deal / hit / stand / reveal [REF#UI-01009]
        pv.dirty = true;                 // guarantee a paint even on a reveal with no active tween (render-on-demand) [REF#UI-01010]
    }
    // STAKE STEPPER (Mark 2026-06-24: "add a + - for the stake ##g"). Drives this._wagerStake; [REF#UI-01011]
    // bounds are FLOOR-SCALED (F5, Mark 2026-06-26): L1 50/step 50/max 500 · L2 500/500/5000 · L3 5k/5k/50k · L4–L7 50k/50k/500k.
    // Every game's payout reads this._wagerStake (_wireWagerControls / _renderWagerGameInfo / _renderBlackjack / _bjFinish).
    _wireStakeStepper() {
        const val = document.getElementById('wg-wager-stake-val');
        const dec = document.getElementById('wg-stake-dec');
        const inc = document.getElementById('wg-stake-inc');
        if (!val) return;
        if (typeof this._wagerStake !== 'number') this._wagerStake = this._betFloor();
        // paint() recomputes the floor-scaled bounds every call, so arriving on a new floor (or a stale [REF#UI-01012]
        // carry-over stake from a lower floor) is always re-clamped into [MIN, MAX] and snapped to STEP.
        const paint = () => {
            const { MIN, STEP, MAX } = this._betBounds();
            const s = Math.round(Math.max(MIN, Math.min(MAX, this._wagerStake)) / STEP) * STEP;
            this._wagerStake = Math.max(MIN, Math.min(MAX, s));
            val.textContent = this._wagerStake.toLocaleString();
            if (dec) dec.disabled = this._wagerStake <= MIN;
            if (inc) inc.disabled = this._wagerStake >= MAX;
        };
        if (dec && !dec._wgBound) { dec._wgBound = true; dec.addEventListener('click', () => { this._wagerStake -= this._betBounds().STEP; paint(); }); }
        if (inc && !inc._wgBound) { inc._wgBound = true; inc.addEventListener('click', () => { this._wagerStake += this._betBounds().STEP; paint(); }); }
        paint();
    }

    // Wire the WAGER controls (visual for now — re-roll the dice + a card hop; bet [REF#UI-01013]
    // selection highlight. The gold/karma payout resolution is a follow-up). Mark 2026-06-18.
    _wireWagerControls() {
        const STAKE = this._effectiveStake();   // floor-scaled default (F5), CLAMPED to held gold (no one-hand wipe — Mark 2026-06-26) [REF#UI-01014]
        const g = this.wagerGames[this._wagerSelected] || {};
        if (g.interactive) return;   // interactive games (Blackjack) wire their own HIT/STAND/DEAL inside _renderBlackjack [REF#UI-01015]
        const info = document.getElementById('wg-wager-game-info');
        // bet buttons (per-game, data-bet) — highlight + record the pick [REF#UI-01016]
        if (info) info.querySelectorAll('.wg-wager-bet').forEach(b => {
            if (b._wgBound) return; b._wgBound = true;
            b.addEventListener('click', () => {
                this._wagerBet = b.dataset.bet;
                info.querySelectorAll('.wg-wager-bet').forEach(x => x.classList.toggle('sel', x === b));
            });
        });
        const deal = document.getElementById('wg-wager-deal');
        if (deal && !deal._wgBound) { deal._wgBound = true; deal.addEventListener('click', () => {
            const pv = this._wagerPv; if (pv && pv._rolling) return;
            const needsBet = (g.bets ? g.bets.length : 2) > 0;
            if (needsBet && this._wagerBet == null) { this._wagerResult('Pick a bet first.', null); return; }
            const gold = (typeof window.playerGold === 'number') ? window.playerGold : 0;
            // FREE-PLAY (Mark 2026-06-22: "remove the gold requirements so I can test the gambling games"). The [REF#UI-01017]
            // gold gate is BYPASSED by default so a gold-sync wipe bug can never block testing the games. Restore
            // the economy by setting window._wagerFreePlay = false. See DISABLED-FEATURES REGISTER (Engine8).
            if (window._wagerFreePlay === false && gold < STAKE) { this._wagerResult(`Not enough gold — you need <b>${STAKE}G</b>. Find gold first (loot by the vending machine).`, null); return; }
            if (pv) { pv._rolling = true; (pv.dice || []).forEach(d => { d.userData.spin = { x: 1.5 + Math.random()*2.6, y: 1.7 + Math.random()*2.8 }; }); }
            // resolve via the game's play() — default to a plain EVEN/ODD roll (no regression for un-ported games) [REF#UI-01018]
            const play = (typeof g.play === 'function') ? g.play
                : function (bet) { const a = this._d6(), b = this._d6(), t = a + b, e = t % 2 === 0; return { win: (bet === 'even') === e, mult: 1, dice: [a, b], line: `🎲 Rolled <b>${t}</b> (${e ? 'even' : 'odd'})` }; };
            let res; try { res = play.call(this, this._wagerBet) || { win: false, mult: 1, line: '—' }; } catch (err) { console.warn('[WAGER] play() threw', err); res = { win: false, mult: 1, line: '—' }; }
            this._wagerResult('🎲 Rolling…', null);
            setTimeout(() => {
                if (pv) {
                    pv._rolling = false;
                    // ORIENT the 3D dice to the ACTUAL rolled values (Mark 2026-06-24: "the dice 3d shown represent the actual [REF#UI-01019]
                    // dice results"). Faces are [1,6,2,5,3,4]→[+x,-x,+y,-y,+z,-z]; this map rotates value V's face to the TOP.
                    const _ROT = { 1:{x:0,z:Math.PI/2}, 2:{x:0,z:0}, 3:{x:-Math.PI/2,z:0}, 4:{x:Math.PI/2,z:0}, 5:{x:Math.PI,z:0}, 6:{x:0,z:-Math.PI/2} };
                    const _rolled = Array.isArray(res.dice) ? res.dice : null;
                    (pv.dice || []).forEach((d, i) => {
                        const v = _rolled ? _rolled[i] : null;
                        if (typeof v === 'number' && _ROT[v]) { d.rotation.set(_ROT[v].x, 0, _ROT[v].z); d.userData.spin = { x: 0, y: 0 }; }   // snap to show the rolled pip count up [REF#UI-01020]
                        else { d.userData.spin = { x: 0.4, y: 0.5 }; }   // un-ported game w/ no result data → gentle idle spin [REF#UI-01021]
                    });
                    pv.lastPoints = _rolled ? _rolled.reduce((a, b) => a + b, 0) : null;   // feed the bracketed scoreboard the rolled total [REF#UI-01022]

                }
                // WAGER_RESOLVE moves the player's gold ±(STAKE×mult) against the dealer goblin's stash (Phase 4). [REF#UI-01023]
                const mult = res.mult || 1, amt = Math.round(STAKE * mult);
                if (!res.push) { try { window.parent.postMessage({ type: 'WAGER_RESOLVE', win: !!res.win, amount: amt }, '*'); } catch(_){} }
                const tail = res.push ? '<b>PUSH</b> — bet returned.' : (res.win ? `<b>YOU WIN +${amt.toLocaleString()}G!</b>` : `you lose ${STAKE.toLocaleString()}G.`);
                this._wagerResult(`${res.line} — ${tail}`, res.push ? null : !!res.win);
                this._emitWagerFloat(res.push ? { push: true } : { win: !!res.win, amount: amt, lose: STAKE });
            }, 1000);   // Mark 2026-06-29: 1200→1000 — the 3D dice tumble RANDOMLY for exactly 1 second, then snap to the rolled faces (dice duel + all dice games) [REF#UI-01024]
        }); }
    }

    // ── Wager helpers (per-game logic) — Mark 2026-06-20 ── [REF#UI-01025]
    _d6() { return 1 + Math.floor(Math.random() * 6); }
    _drawCard() { return 2 + Math.floor(Math.random() * 13); }   // 2..14 (J=11 Q=12 K=13 A=14) [REF#UI-01026]
    _cardName(v) { return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[v] || String(v); }

    // ── Level-scaled wager economy (F5, Mark 2026-06-26: "minimum bets for level 1 = 50, level 2 = 500…") ── [REF#UI-01027]
    // The bet floor scales with the DUNGEON FLOOR (1–7), NOT the character/XP level — keyed off
    // window._currentFloor, which the engine maintains in THIS (panels) window via the FLOOR_UPDATE
    // message (posted at engine boot + on every descent reload), so no extra cross-frame plumbing is
    // needed. Capped to mirror the dealer's capped stash (min(100000, 100·10^(L−1))): a bet floor of
    // min(50000, 50·10^(L−1)) = L1 50 · L2 500 · L3 5k · L4–L7 50k (held at the cap). Falls back to
    // floor 1 if FLOOR_UPDATE hasn't landed yet (it always has by the time a wager opens mid-room).
    _wagerLevel() {
        const f = (typeof window._currentFloor === 'number' && window._currentFloor > 0) ? window._currentFloor
                // ⛔ SUPERSEDED 2026-09-03: this fallback read `window.DUNGEON_LEVEL`, a name nothing [REF#UI-01308]
                //    in the tree assigns, so it could only ever yield the literal 1. The engine now
                //    publishes `window._currentFloor` beside the floor's seed, so both the primary
                //    above and this fallback name the same fact.
                : (typeof window._currentFloor === 'number' ? window._currentFloor : 1);
        return Math.max(1, Math.min(7, Math.round(f)));
    }
    _betFloor(L) { return Math.min(50000, 50 * Math.pow(10, (L || this._wagerLevel()) - 1)); }   // L1 50 · L2 500 · L3 5k · L4+ 50k (cap) [REF#UI-01028]
    // STEP = MIN; MAX = MIN×10. On high floors MAX can exceed the dealer's capped stash — that's fine: [REF#UI-01029]
    // the engine WIN clamp (actualWin = min(wager, dealerGold)) caps the actual payout to what the
    // dealer holds (a natural house limit). No guide-side WIN cap (the engine owns the mint guard).
    _betBounds() { const MIN = this._betFloor(); return { MIN, STEP: MIN, MAX: MIN * 10 }; }
    // GOLD-WIPE FIX (Mark 2026-06-26: "when WAGER is clicked == all player gold is removed"). [REF#UI-01030]
    // The effective wagered amount can NEVER exceed the gold the player actually holds. Free-play
    // (Mark 2026-06-22) lets you DEAL while broke, but the engine WAGER_RESOLVE still charges the full
    // stake on a loss and floors the purse at 0 (Engine8 ~13769) — so a level-scaled 500–50,000 default
    // wiped a near-empty balance in a single hand. Mark's call (2026-06-26): the level-scaled minimums
    // are DISPLAY targets, not forced bets — you can never RISK more than your purse. The win payout
    // rides the same clamped stake (you can't win on chips you never put up). Gold read mirrors :1858.
    _effectiveStake() {
        const gold = (typeof window !== 'undefined' && typeof window.playerGold === 'number') ? window.playerGold : this._readHudNum('player-gold-val', 0);
        return Math.min(this._wagerStake || this._betFloor(), Math.max(0, Math.floor(gold) || 0));
    }

    // ── Interactive Blackjack (Mark 2026-06-20: "it should be hit - stand - bet") ── [REF#UI-01031]
    // Real play, not the even/odd placeholder: DEAL two cards vs the dealer's up-card, HIT to draw,
    // STAND to hold; the dealer then draws to 17. Aces are soft (11, drop to 1 to avoid a bust).
    _bjVal(c) { return c >= 14 ? 11 : (c >= 11 ? 10 : c); }   // A=11 (soft), J/Q/K=10, else pip [REF#UI-01032]
    _bjTotal(hand) { let t = 0, a = 0; for (const c of hand) { t += this._bjVal(c); if (c === 14) a++; } while (t > 21 && a > 0) { t -= 10; a--; } return t; }
    _bjCard(c) { return `<span style="display:inline-block;min-width:1.4em;padding:3px 7px;margin:0 3px;border-radius:5px;background:#f3eede;color:#1a1320;font-weight:800;font-family:Georgia,serif;box-shadow:0 1px 3px rgba(0,0,0,0.45)">${this._cardName(c)}</span>`; }
    _renderBlackjack(host, g) {
        if (!host) return;
        const STAKE = this._effectiveStake(), draw = () => this._drawCard();   // floor-scaled default (F5), CLAMPED to held gold (Mark 2026-06-26) [REF#UI-01033]
        this._bj = this._bj || { player: [], dealer: [], stage: 'bet', msg: '' };
        const bj = this._bj;
        const pt = this._bjTotal(bj.player);
        const hole = `<span style="display:inline-block;min-width:1.4em;padding:3px 7px;margin:0 3px;border-radius:5px;background:#3a2e55;color:#9b8bd0;font-weight:800;font-family:Georgia,serif">?</span>`;
        const dealerShown = (bj.stage === 'play') ? `${this._bjCard(bj.dealer[0])}${hole}` : bj.dealer.map(c => this._bjCard(c)).join('');
        const dealerTot = (bj.stage === 'play') ? '' : (bj.dealer.length ? `<b>${this._bjTotal(bj.dealer)}</b>` : '');
        const table = (bj.stage === 'bet') ? '' : `
            <div class="wg-wager-stake" style="margin:.5em 0">Dealer ${dealerShown} ${dealerTot}</div>
            <div class="wg-wager-stake" style="margin:.5em 0">You ${bj.player.map(c => this._bjCard(c)).join('')} <b>${pt}</b></div>`;
        const controls = (bj.stage === 'play')
            ? `<div class="wg-wager-bets"><button type="button" id="wg-bj-hit" class="wg-restore-btn">HIT</button><button type="button" id="wg-bj-stand" class="wg-restore-btn">STAND</button></div>`
            : `<button type="button" id="wg-bj-deal" class="wg-restore-btn wg-wager-deal"><i class="fa-solid fa-dice" aria-hidden="true"></i> ${bj.stage === 'done' ? 'DEAL AGAIN' : 'DEAL'}</button>`;
        host.innerHTML = `
            <h2 class="wg-page-title">${g.icon || '🃏'} ${this._esc(g.name)}</h2>
            <div class="wg-lore"><p>${this._esc(g.how || '')}</p></div>
            <div class="wg-wager-stake">${this._L('wg.wager.stake', 'Stake')}: <b>${STAKE.toLocaleString()}G</b></div>
            ${table}
            ${controls}
            <div id="wg-wager-result" class="wg-wager-result">${bj.msg || ''}</div>
            <button type="button" id="wg-wager-back" class="wg-wager-back">${this._L('wg.wager.back', '← Back to games')}</button>`;
        const back = document.getElementById('wg-wager-back');
        if (back) back.addEventListener('click', () => { this._bj = null; this.setSlide(this.WAGER_SLIDE); });
        const deal = document.getElementById('wg-bj-deal');
        if (deal) deal.addEventListener('click', () => {
            const gold = (typeof window.playerGold === 'number') ? window.playerGold : 0;
            // FREE-PLAY bypass (Mark 2026-06-22) — see the DEAL handler above + DISABLED-FEATURES REGISTER. [REF#UI-01034]
            if (window._wagerFreePlay === false && gold < STAKE) { bj.msg = `Not enough gold — you need <b>${STAKE.toLocaleString()}G</b>. Find gold first (loot by the vending machine).`; this._renderBlackjack(host, g); return; }
            bj.player = [draw(), draw()]; bj.dealer = [draw(), draw()]; bj.stage = 'play'; bj.msg = '';
            try { this._syncBlackjack3D(true); } catch(_){}   // deal the four cards onto the 3D felt [REF#UI-01035]
            if (this._bjTotal(bj.player) === 21) { this._bjStand(host, g); return; }   // natural 21 → auto-stand [REF#UI-01036]
            this._renderBlackjack(host, g);
        });
        const hit = document.getElementById('wg-bj-hit');
        if (hit) hit.addEventListener('click', () => {
            bj.player.push(draw());
            try { this._syncBlackjack3D(true); } catch(_){}   // deal the hit card onto the 3D felt [REF#UI-01037]
            if (this._bjTotal(bj.player) > 21) this._bjFinish(host, g);   // bust → resolve [REF#UI-01038]
            else this._renderBlackjack(host, g);
        });
        const stand = document.getElementById('wg-bj-stand');
        if (stand) stand.addEventListener('click', () => this._bjStand(host, g));
    }
    _bjStand(host, g) { const bj = this._bj; while (this._bjTotal(bj.dealer) < 17) bj.dealer.push(this._drawCard()); this._bjFinish(host, g); }
    _bjFinish(host, g) {
        const STAKE = this._effectiveStake(), bj = this._bj;   // floor-scaled default (F5), CLAMPED to held gold (Mark 2026-06-26) [REF#UI-01039 → see REF#UI-01033]
        const pt = this._bjTotal(bj.player), dt = this._bjTotal(bj.dealer);
        let win, push = false;
        if (pt > 21) win = false; else if (dt > 21) win = true; else if (pt > dt) win = true; else if (pt < dt) win = false; else { push = true; win = false; }
        bj.stage = 'done';
        if (!push) { try { window.parent.postMessage({ type: 'WAGER_RESOLVE', win: !!win, amount: STAKE }, '*'); } catch (_) {} }
        bj.msg = `🃏 You <b>${pt}</b>${pt > 21 ? ' BUST' : ''} · Dealer <b>${dt}</b>${dt > 21 ? ' BUST' : ''} — ${push ? '<b>PUSH</b> — bet returned.' : (win ? `<b>YOU WIN +${STAKE.toLocaleString()}G!</b>` : `you lose ${STAKE.toLocaleString()}G.`)}`;
        this._renderBlackjack(host, g);
        this._emitWagerFloat(push ? { push: true } : { win: !!win, amount: STAKE, lose: STAKE });
        try { this._syncBlackjack3D(true); } catch(_){}   // reveal the hole card + any dealer draws on the felt [REF#UI-01040]
    }

    // ── SOLITAIRE (Mark 2026-06-23): the 2nd wager game. A self-contained Klondike (solitaire.html) embedded as an [REF#UI-01041]
    //    iframe in a FULL-BLEED stage that overlays the whole wager spread. Maximize grows the guide MODAL itself
    //    (docked → 90% → 100%) via the --wg-w/--wg-h CSS vars — NOT by reparenting — so the iframe is never reloaded
    //    and the game state survives every resize. v1 = no-stake (prove it mounts + plays); the 25g wager economy
    //    lands in Phase 2 (gated on the WAGER-open gold-wipe fix). ──
    _renderSolitaire(host, g) {
        if (host) host.innerHTML = '';                       // clear the left info pane — the stage covers the spread [REF#UI-01042]
        const slide = host && host.closest('.wg-slide');
        if (!slide) return;
        let stage = this._soliStage;
        if (!stage || !stage.isConnected || stage.parentNode !== slide) {
            const back = this._L('wg.wager.back', 'Back to games');
            stage = document.createElement('div');
            stage.className = 'wg-soli-stage';
            stage.innerHTML = `
                <div class="wg-soli-bar">
                    <button type="button" class="wg-soli-btn wg-soli-back" title="${back}" aria-label="${back}">&larr;</button>
                    <span class="wg-soli-title">${g.icon || '♣️'} ${this._esc(g.name)}</span>
                    <span class="wg-soli-spacer"></span>
                    <button type="button" class="wg-soli-btn wg-soli-restore" title="Restore size" aria-label="Restore size" hidden>&#x2935;</button>
                    <button type="button" class="wg-soli-btn wg-soli-expand" title="Maximize" aria-label="Maximize">&#x2934;</button>
                </div>
                <iframe class="wg-soli-frame" src="./solitaire.html?v=8.2.26-soli3" title="Solitaire — Klondike"></iframe>`;
            slide.appendChild(stage);
            this._soliStage = stage;
            stage.addEventListener('click', (e) => e.stopPropagation());   // isolate from any world/guide click handling [REF#UI-01043]
            stage.querySelector('.wg-soli-back').addEventListener('click', () => {
                this._setSoliMax(0); this._hideSolitaireStage(); this.setSlide(this.WAGER_SLIDE);
            });
            stage.querySelector('.wg-soli-expand').addEventListener('click', () => this._setSoliMax((this._soliMax || 0) + 1));
            stage.querySelector('.wg-soli-restore').addEventListener('click', () => this._setSoliMax((this._soliMax || 0) - 1));
        }
        stage.style.display = 'flex';
        this._soliShown = true;
        this._setSoliMax(this._soliMax || 0);                // re-sync expand/restore button visibility [REF#UI-01044]
    }
    _hideSolitaireStage() { if (this._soliStage) this._soliStage.style.display = 'none'; this._soliShown = false; }
    // ── SAKE TAP (Mark 2026-07-25 "clicking the caberet bartender or tavern loads the game"): the engine registers the [REF#UI-01045]
    //    bartender + tavern GLB as clickables that post OPEN_TAPPER → shell relay → Panels → openTapper() here. A full-bleed
    //    iframe stage over the whole guide, modelled on the solitaire stage — the self-contained NewOrigami.Game.Tapper.html
    //    (local vendored r128, no CDN) is built ONCE and never reloaded, so game state survives a close/reopen.
    openTapper() {
        try { this.show(); } catch(_){}
        const ov = document.getElementById(this.containerId);
        if (!ov) return;
        let stage = this._tapperStage;
        if (!stage || !stage.isConnected || stage.parentNode !== ov) {
            const close = this._L('wg.tapper.close', 'Close');
            stage = document.createElement('div');
            stage.className = 'wg-tapper-stage';
            stage.setAttribute('role', 'dialog');
            stage.setAttribute('aria-label', 'Sake Tap');
            stage.innerHTML = `
                <div class="wg-tapper-bar">
                    <span class="wg-tapper-title">🍶 Sake Tap</span>
                    <span class="wg-tapper-spacer"></span>
                    <button type="button" class="wg-tapper-btn wg-tapper-close" title="${close}" aria-label="${close}">✕</button>
                </div>
                <iframe class="wg-tapper-frame" src="./NewOrigami.Game.Tapper.html?v=8.2.265-tapper1" title="Sake Tap — Cabaret" allow="autoplay"></iframe>`;
            ov.appendChild(stage);
            this._tapperStage = stage;
            stage.addEventListener('click', (e) => e.stopPropagation());   // isolate from any guide/world click handling [REF#UI-01046]
            stage.querySelector('.wg-tapper-close').addEventListener('click', () => this.closeTapper());
        }
        stage.style.display = 'flex';
        this._tapperShown = true;
        // ── THE TAPPER GETS THE TAVERN'S SONG (Mark 2026-08-13: "sake tavern delivery and tapper game [REF#UI-01047]
        //    = https://suno.com/s/JgXvQIQp6qZdkjEM"). That clip is BG-SpookySnackRun.mp3 (29.641 s, a
        //    millisecond match), which the delivery quest already plays — so this is the SAME cue on the
        //    second half of the pairing he named, not a new track.
        //    Fired here rather than inside the tapper iframe: the iframe is built ONCE and never
        //    reloaded (see above), so anything that must happen on every OPEN has to live on this side
        //    of that boundary. A cue placed in the frame would play for the first sake of the session
        //    and never again.
        //    Off: window._tapperMusic = false.
        try {
            if (window._tapperMusic !== false) {
                this._tapperAudio = this._tapperAudio || new Audio('./assets/sounds/Dungeon/BG-SpookySnackRun.mp3');
                if (this._tapperFadeT) { clearInterval(this._tapperFadeT); this._tapperFadeT = null; }   // reopened mid-fade: the cue comes straight back up (2026-09-15) [REF#UI-01358]
                this._tapperAudio.volume = 0.5;
                this._tapperAudio.currentTime = 0;
                const p = this._tapperAudio.play();
                if (p && p.catch) p.catch(() => {});   // autoplay policy — a blocked cue must not throw [REF#UI-01048]
            }
        } catch(_){}
    }
    closeTapper() {
        if (this._tapperStage) this._tapperStage.style.display = 'none';
        this._tapperShown = false;
        // Stop the cue with the stage. Leaving it running behind a closed dialog is the "music from [REF#UI-01049]
        // nowhere" bug, and it would fight the dungeon's own background bus for the player's attention.
        // ── FADE, NOT A CUT (Mark 2026-09-15: "sake tavern song keeps playing even when closed if the game is clicked on.
        //    fade it out when game is closed.") ── MEASURED: only the ✕ button reached this method. A click on the world closes
        //    the whole guide through hide(), which never touched the tapper, so the stage vanished with the book and the cue ran
        //    on behind it. hide() closes the tapper now, and the cue eases out over _tapperFadeMs (1500) instead of cutting.
        this._fadeTapperAudio();
    }
    _fadeTapperAudio() {
        const a = this._tapperAudio; if (!a) return;
        if (this._tapperFadeT) { clearInterval(this._tapperFadeT); this._tapperFadeT = null; }
        if (a.paused) return;
        const ms = (typeof window._tapperFadeMs === 'number') ? window._tapperFadeMs : 1500;
        const v0 = a.volume, t0 = performance.now();
        this._tapperFadeT = setInterval(() => {
            const k = Math.min(1, (performance.now() - t0) / ms);
            try { a.volume = v0 * (1 - k); } catch(_){}
            if (k >= 1) { clearInterval(this._tapperFadeT); this._tapperFadeT = null; try { a.pause(); a.currentTime = 0; a.volume = v0; } catch(_){} }
        }, 50);
    }
    // ── BAR MENU (Mark 2026-07-25 "fix the bar menu to match our design pattern of pages"): the bartender/tavern click opens the [REF#UI-01050]
    //    BAR page (BARMENU_SLIDE, a real guide book spread — see _html) instead of a bespoke overlay. Its two buttons
    //    (#wg-bar-contract → _acceptDeliveryContract, #wg-bar-sake → openTapper) are wired in _inject. Public method kept because
    //    Panels' OPEN_BAR_MENU handler calls it.
    openBarMenu() { try { this.show(); } catch(_){} try { this.setSlide(this.BARMENU_SLIDE); } catch(_){} }
    // Tell the engine (via the shell) to start a delivery contract. The engine picks the targets, spawns the QUEST card, and [REF#UI-01051]
    // seeds the waypoints/quest state (see ACCEPT_DELIVERY_CONTRACT handler). Phase-1: this just fires the message.
    _acceptDeliveryContract() { try { window.parent.postMessage({ type: 'ACCEPT_DELIVERY_CONTRACT' }, '*'); } catch(_){} }
    _acceptTavernQuest(id, view) { try { window.parent.postMessage({ type: 'ACCEPT_TAVERN_QUEST', id, view }, '*'); } catch(_){} }
    _chooseTavernQuest(choice) { try { window.parent.postMessage({ type: 'CHOOSE_TAVERN_STORY', choice }, '*'); } catch(_){} }
    // Maximize ladder: 0 = docked (guide size), 1 = 90vw×90vh, 2 = 100vw×100vh ("total maximize"). Grows the MODAL [REF#UI-01052]
    // via the .wg-max90/.wg-max100 --wg-w/--wg-h overrides — the stage (inset:0) + iframe ride along, no reload.
    _setSoliMax(level) {
        this._soliMax = level = Math.max(0, Math.min(2, level | 0));
        const el = document.getElementById(this.containerId);
        if (el) { el.classList.toggle('wg-max90', level === 1); el.classList.toggle('wg-max100', level === 2); }
        if (this._soliStage) {
            const ex = this._soliStage.querySelector('.wg-soli-expand');
            const re = this._soliStage.querySelector('.wg-soli-restore');
            if (ex) ex.hidden = (level >= 2);
            if (re) re.hidden = (level <= 0);
        }
    }

    // On-spread result line. The engine's WAGER_RESOLVE handler logs the gold [REF#UI-01053]
    // outcome to the event log itself (💰/💸), so we only paint the spread here.
    _wagerResult(html, win) {
        const r = document.getElementById('wg-wager-result');
        if (r) { r.innerHTML = html; r.classList.remove('win', 'lose'); if (win === true) r.classList.add('win'); else if (win === false) r.classList.add('lose'); }
    }

    // ── Combat-text over the felt (Mark 2026-06-26): rise-and-fade gold deltas on every wager [REF#UI-01054]
    //    resolve — one floater for the PLAYER side and its mirror for the DEALER side, so a win
    //    reads as "+5,000G" rising on your side while the dealer goblin bleeds the same in red.
    //    Anchored to .wg-wager-canvas-wrap (the felt), so it survives a per-game re-render and the
    //    upcoming full-bleed-stage merge. Reuses the cyan-system green/red — no new palette.
    //    o = { push:true } | { win:bool, amount:<player WIN delta>, lose:<player LOSS delta> }.
    //    `amount` mirrors the engine's WAGER_RESOLVE transfer (Engine8 ~13746): on a win the dealer
    //    loses EXACTLY what the player gains (incl. Baccarat 0.95/8× payouts), so player +amount ⇄
    //    dealer −amount is the true mirror of the gold that actually moves. ──
    _emitWagerFloat(o) {
        try {
            const wrap = document.querySelector('.wg-wager-canvas-wrap');
            if (!wrap) return;
            const push = !!(o && o.push);
            const win = !!(o && o.win);
            const winAmt = Math.round((o && o.amount) || 0);
            const loseAmt = Math.round((o && o.lose != null) ? o.lose : winAmt);
            // player delta first, then the dealer's mirror image of it [REF#UI-01055]
            const sides = push
                ? [{ side: 'player', kind: 'push', text: 'PUSH' }, { side: 'dealer', kind: 'push', text: 'PUSH' }]
                : win
                    ? [{ side: 'player', kind: 'win', text: `+${winAmt.toLocaleString()}G` },
                       { side: 'dealer', kind: 'lose', text: `-${winAmt.toLocaleString()}G` }]
                    : [{ side: 'player', kind: 'lose', text: `-${loseAmt.toLocaleString()}G` },
                       { side: 'dealer', kind: 'win', text: `+${loseAmt.toLocaleString()}G` }];
            sides.forEach(s => {
                const el = document.createElement('div');
                el.className = `wg-felt-float wg-felt-float--${s.kind} wg-felt-float--${s.side}`;
                el.textContent = s.text;
                wrap.appendChild(el);
                const kill = () => { try { el.remove(); } catch (_) {} };
                el.addEventListener('animationend', kill, { once: true });
                setTimeout(kill, 2000);   // belt-and-suspenders cleanup if animationend never fires [REF#UI-01056]
            });
        } catch (_) {}
    }

    _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _inject() {
        if (this._injected) return;
        this._injected = true;
        if (!document.getElementById('wg-style')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'wg-style';
            styleEl.textContent = this._css();
            document.head.appendChild(styleEl);
        }
        const wrap = document.createElement('div');
        wrap.id = this.containerId;
        // `blocks-world-input`: opts the welcome guide into the Panels world-input [REF#UI-01057]
        // block flag (Mark 2026-06-15) — while it's `.is-open`, canvas click-
        // through is blocked. Replaces the old _wgOpen() special-case.
        wrap.className = 'wg-modal blocks-world-input';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-labelledby', 'wg-title');
        wrap.innerHTML = this._html();
        document.body.appendChild(wrap);
        this._bind(wrap);
        this._renderedLang = (window.currentLang || 'en');
    }

    _bind(root) {
        const wg = this;
        // ── THE ANSWER SURFACE FOR A SOLICITED REPLY. [REF#UI-01322]
        //   MEASURED 2026-09-04, before this existed: typing "help" while the guidebook is open parsed
        //   correctly and logEvent() ran with the whole help text, and the player saw nothing at all.
        //   Panels' guidebook gate queues EVERY event-log line while the guide is `.is-open` and flushes
        //   after it closes, so the answer to a question arrived once the guide was already gone, into a
        //   log sitting behind the overlay. That gate suppresses UNSOLICITED alerts; a reply to something
        //   just typed into the guidebook's own field is a different kind of message, and it is routed
        //   here rather than into the queue.
        //   Returns true only if it actually rendered, so the caller can fall back to queueing.
        window._wgShowReply = function (html, opts) {
            const el = document.getElementById('wg-reply');
            const g = document.getElementById(wg.containerId);
            if (!el || !g || !g.classList.contains('is-open')) return false;
            // ⚠ REPARENT TO THE OVERLAY ROOT. Authored in the footer, the pane could never out-stack the [REF#UI-01323]
            //   book spread no matter what z-index it carried: stacking is resolved at the highest
            //   ancestor where two subtrees differ, so a child of the footer loses to the page layer
            //   before its own z-index is ever consulted. Measured — at z-index 9999 the page copy still
            //   drew straight through it. Hoisting it to a direct child of the overlay puts it in the
            //   same contest the guide's own layers are in. Same move _mountChatInput makes for the field.
            if (el.parentNode !== document.body) document.body.appendChild(el);
            // APPEND, don't replace: a typed command produces an answer that can arrive over several [REF#UI-01324]
            // LOG_EVENT lines, and replacing on each one leaves the player reading only the last
            // fragment of their own answer. Oldest lines are trimmed so the tray cannot grow forever.
            const line = document.createElement('div');
            line.className = 'wg-reply-line';
            line.innerHTML = html;
            if (opts && opts.append === true && !el.hidden) el.appendChild(line);
            else { el.innerHTML = ''; el.appendChild(line); }
            while (el.children.length > 6) el.removeChild(el.firstChild);
            el.hidden = false;
            // Sit the pane directly on top of the field that asked, clamped to the guide panel's own [REF#UI-01325]
            // width and to the space actually available above the input. Measured each time because the
            // guide is responsive and the field is RELOCATED into it at open, so neither rect is static.
            // ⚠ ANCHOR TO THE FIELD, NOT TO THE OVERLAY. #welcome-guide-overlay is a full-bleed fixed
            //   layer, so measuring IT put the pane in the middle of the book and 7px past the right
            //   edge of the screen (measured: x=545 w=742 on a 1280 viewport). The input's own rect is
            //   the only box that means "where the person is typing".
            // The tray's placement is CSS (top:100% of the overlay). The only thing worth measuring is
            // how much room is actually left below the guidebook, so a long answer scrolls inside the
            // tray instead of running off the bottom of the screen.
            try {
                const gr = g.getBoundingClientRect();
                const room = Math.max(64, window.innerHeight - gr.bottom - 16);
                el.style.left = Math.round(gr.left + 24) + 'px';
                el.style.width = Math.round(Math.max(240, gr.width - 48)) + 'px';
                el.style.top = Math.round(gr.bottom + 8) + 'px';
                el.style.maxHeight = Math.round(Math.min(260, room)) + 'px';
            } catch (_) {}
            // ── A pill click writes its text into the chat field and stops there; the send happens on [REF#UI-01326]
            //   the player's own ENTER, which is the keypress the pills exist to familiarise. The cursor
            //   is left at the END of the inserted text, so the line can be grown ("go north" into
            //   "go north quickly") instead of replaced.
            //   ONLY a click listener: a native <button> already raises click for both Enter and Space,
            //   so adding a keydown handler would fire the fill twice for one keypress.
            //   Bound once per element; the flag survives innerHTML rewrites because it lives on the
            //   pane, not on the pills.
            if (!el.__wgPillsBound) {
                el.__wgPillsBound = true;
                el.addEventListener('click', function (e) {
                    const b = e.target && e.target.closest ? e.target.closest('.wg-pill') : null;
                    if (!b) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const text = b.getAttribute('data-fill') || b.textContent || '';
                    const inp = document.querySelector('.chat-input');
                    if (!inp) return;
                    inp.value = text;
                    try { inp.dataset.helpShown = '1'; } catch (_) {}
                    el.hidden = true; el.innerHTML = '';   // one click: the pill fires AND the tray closes (Mark 2026-09-20) [REF#PENDING] [REF#UI-01398]
                    try { inp.focus({ preventScroll: true }); } catch (_) { try { inp.focus(); } catch (_) {} }
                    try { inp.setSelectionRange(text.length, text.length); } catch (_) {}
                });
                // A click anywhere else on the tray (the text, the labels) closes it too. [REF#PENDING] [REF#UI-01399]
                el.addEventListener('click', function (e) {
                    if (e.target.closest && (e.target.closest('.wg-pill') || e.target.closest('.wg-act'))) return;
                    el.hidden = true; el.innerHTML = '';
                });
                // ── ACTION LINKS RUN. Distinct from pills on purpose and by explicit instruction: a pill [REF#UI-01327]
                //   hands the player the words and waits for their ENTER, an action link performs the
                //   thing. It reaches the game by filling the real field and raising a real Enter on it,
                //   which is the SAME rail a typed command travels — no second execution path exists for
                //   these, so a link can never do something typing cannot.
                el.addEventListener('click', function (e) {
                    const a = e.target && e.target.closest ? e.target.closest('.wg-act') : null;
                    if (!a) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const cmd = a.getAttribute('data-run') || '';
                    const inp = document.querySelector('.chat-input');
                    if (!inp || !cmd) return;
                    inp.value = cmd;
                    try { inp.dataset.helpShown = '1'; } catch (_) {}
                    el.hidden = true; el.innerHTML = '';   // one click: runs AND closes (Mark 2026-09-20) [REF#PENDING] [REF#UI-01400]
                    try { inp.focus({ preventScroll: true }); } catch (_) {}
                    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                });
            }
            try { el.scrollTop = 0; } catch (_) {}
            return true;
        };
        // Stop click-throughs from interfering with the game behind the overlay [REF#UI-01058]
        const stopProps = ['pointerdown', 'mousedown', 'touchstart', 'touchmove', 'touchend', 'wheel', 'click', 'contextmenu'];
        stopProps.forEach(ev => root.addEventListener(ev, e => e.stopPropagation(), { passive: false }));

        root.querySelector('.wg-close-btn')?.addEventListener('click', () => wg.hide({ isFromLoad: true }));

        // TEXT SIZE (Mark 2026-10-17): − / + scale the page text 100%–160% in 10% steps; the pages scroll once it no longer fits. [REF#UI-01516]
        // Remembered in this browser only.
        const _fontApply = (s) => {
            const v = Math.min(1.6, Math.max(1, Math.round(s * 10) / 10));
            root.style.setProperty('--wg-font-scale', String(v));
            if (v > 1) root.setAttribute('data-wg-font-scaled', ''); else root.removeAttribute('data-wg-font-scaled');
            root.querySelectorAll('.wg-font-btn').forEach(b => { b.disabled = (b.dataset.fontStep === '1') ? v >= 1.6 : v <= 1; });
            try { localStorage.setItem('wg-font-scale', String(v)); } catch (_) {}
            return v;
        };
        let _fontScale = 1;
        try { _fontScale = parseFloat(localStorage.getItem('wg-font-scale')) || 1; } catch (_) {}
        _fontScale = _fontApply(_fontScale);
        root.querySelectorAll('.wg-font-btn').forEach(b => b.addEventListener('click', () => { _fontScale = _fontApply(_fontScale + 0.1 * Number(b.dataset.fontStep)); }));

        // The book starts right under the tab strip, however many rows it wraps to, [REF#UI-01517]
        // instead of a fixed 122px that left a gap under a one-row strip.
        const _tabsEl = root.querySelector('.wg-tabs');
        const _fitStage = () => { if (_tabsEl && _tabsEl.offsetHeight) root.style.setProperty('--wg-stage-pad-top', (_tabsEl.offsetTop + _tabsEl.offsetHeight + 10) + 'px'); };
        if (_tabsEl && typeof ResizeObserver === 'function') new ResizeObserver(_fitStage).observe(_tabsEl);
        _fitStage();

        // COVER FITS ITS TERMS ROW (2026-10-17): on the stacked phone/tablet cover the right-page type is scaled by [REF#UI-01518]
        // --wg-cover-k, stepped down until the "I agree" row sits fully above the footer and inside every clipping
        // ancestor, and the lore no longer overflows. Floor 0.6. Re-runs on resize, on the loading bar coming or going,
        // and whenever the page reflows.
        const _coverStack = window.matchMedia ? window.matchMedia('(max-width: 750px), ((pointer: coarse) and (hover: none) and (max-width: 1200px))') : null;
        let _coverFitBusy = false;
        const _fitCoverTerms = () => {
            if (_coverFitBusy) return;
            const right = root.querySelector('.wg-slide[data-slide="0"] .wg-cover-right');
            if (!right) return;
            if (!_coverStack || !_coverStack.matches) { right.style.removeProperty('--wg-cover-k'); return; }
            if (!right.offsetParent) return;   // cover not on screen — measure when it is [REF#UI-01519]
            _coverFitBusy = true;
            const lore = right.querySelector('.wg-lore');
            // After loading on a phone the lore is hidden and nothing on the page needs shrinking — full size, no stepping. [REF#UI-01520]
            if (lore && !lore.offsetParent) { right.style.setProperty('--wg-cover-k', '1'); _coverFitBusy = false; return; }
            const foot = root.querySelector('.wg-footer');
            const limit = () => {
                let b = window.innerHeight;
                if (foot && foot.offsetParent) b = Math.min(b, foot.getBoundingClientRect().top);
                for (let n = right; n && n !== root.parentElement; n = n.parentElement) {
                    const cs = getComputedStyle(n);
                    if (cs.overflowY !== 'visible' || cs.overflow !== 'visible') b = Math.min(b, n.getBoundingClientRect().bottom);
                }
                return b;
            };
            // The lowest VISIBLE block on the page — the loading bar while the game loads (the Terms row is hidden then), [REF#UI-01521]
            // the Terms row and WCAG line after — so the type fits from the first frame, not only once loading ends.
            const lowest = () => { let b = 0; for (const c of right.children) { if (c.offsetParent) b = Math.max(b, c.getBoundingClientRect().bottom); } return b; };
            const fits = () => lowest() <= limit() - 2 && (!lore || lore.scrollHeight <= lore.clientHeight + 1);
            let k = 1;
            right.style.setProperty('--wg-cover-k', '1');
            while (!fits() && k > 0.6) { k = Math.max(0.6, k - 0.04); right.style.setProperty('--wg-cover-k', k.toFixed(2)); }
            _coverFitBusy = false;
        };
        if (typeof ResizeObserver === 'function') {
            const _cr = root.querySelector('.wg-slide[data-slide="0"] .wg-cover-right');
            if (_cr) new ResizeObserver(() => requestAnimationFrame(_fitCoverTerms)).observe(_cr);
        }
        window.addEventListener('resize', () => requestAnimationFrame(_fitCoverTerms));
        if (typeof MutationObserver === 'function') new MutationObserver(() => requestAnimationFrame(_fitCoverTerms)).observe(root, { attributes: true, attributeFilter: ['class'] });
        requestAnimationFrame(_fitCoverTerms);
        
        // Sync T&C consent checkbox and acceptTC() fires so the NEXT gate [REF#UI-01059]
        // and window._tcAccepted stay consistent.
        const tc1 = root.querySelector('#wg-tc-checkbox');
        const tc2 = root.querySelector('#wg-tc-checkbox-inline');
        if (tc1) {
            tc1.addEventListener('change', e => {
                if (tc2) tc2.checked = e.target.checked;
                wg.acceptTC(e.target.checked);
            });
        }
        if (tc2) {
            tc2.addEventListener('change', e => {
                if (tc1) tc1.checked = e.target.checked;
                wg.acceptTC(e.target.checked);
            });
        }
        root.querySelector('#wg-tc-link')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            wg._expandInlineTC();
            // The goblin is the bouncer of the terms — swap the cover logo to the [REF#UI-01060]
            // legacy Yakuza goblin while the terms are open (Mark 2026-06-10).
            const _cl = root.querySelector('#wg-cover-logo');
            if (_cl) _cl.src = 'assets/models/monster/goblin/New.Yakuza.Goblin.Pointing.jpg';
        });
        const closeInlineTC = () => {
            const sec = root.querySelector('#wg-tc-inline');
            if (sec) {
                sec.hidden = true;
                const page = sec.closest('.wg-page');
                if (page) {
                    const lore = page.querySelector('.wg-lore');
                    const actions = page.querySelector('.wg-actions');
                    if (lore) lore.style.display = '';
                    if (actions) actions.style.display = '';
                }
            }
            // Goblin bouncer steps back — restore the cover logo when terms close. [REF#UI-01061]
            const _cl = root.querySelector('#wg-cover-logo');
            if (_cl) _cl.src = 'assets/brand/icons/Origami_Underworld_Rock_Opera_Logo.png';
        };
        root.querySelector('#wg-tc-collapse')?.addEventListener('click', closeInlineTC);

        // RESTORE THIS SAVE — loads the currently-previewed save via the [REF#UI-01062]
        // panels' loadSavedGame (which posts LOAD_NOW to the engine).
        root.querySelector('#wg-restore-btn')?.addEventListener('click', () => {
            wg._restoreSelectedSave();
        });
        root.querySelector('#wg-save-current-btn')?.addEventListener('click', () => {
            wg._saveFromGuide();
        });
        root.querySelector('#wg-delete-save-btn')?.addEventListener('click', () => {   // two presses — see _deleteSelectedSave (2026-09-27) [REF#PENDING] [REF#UI-01432]
            wg._deleteSelectedSave();
        });
        // ── ROLE CARD: single click = pick · DOUBLE click/tap = QUICK START (Mark 2026-07-19: "on clicking on any [REF#UI-01063]
        // role - double click bypasses okay and selects the role for quick start"). ────────────────────────────
        // The second interaction commits the SAME selection and then closes the guide, which is exactly what the
        // bloomed NEXT/OK does — so quick-start cannot diverge from the normal path or skip any state the launch
        // depends on. selectRole is called again first (not assumed from the single-click) so a double-click that
        // lands on a DIFFERENT card than the last selection still launches the card you actually double-clicked.
        root.querySelectorAll('.wg-role-card').forEach(card => {
            card.addEventListener('click', () => wg.selectRole(card.dataset.roleId));
            const _quickStart = () => {
                try { wg.selectRole(card.dataset.roleId); } catch(_){}
                try { wg.hide({ isFromLoad: false }); } catch(_){}
            };
            card.addEventListener('dblclick', (e) => { e.preventDefault(); _quickStart(); });
            // TOUCH: dblclick is unreliable on mobile (many browsers suppress it, or the 300ms tap delay eats it), [REF#UI-01064]
            // and the guide is now a one-page mobile view — so detect the double-TAP ourselves. Window is generous
            // (_wgDblTapMs 400) because a thumb is slower than a mouse; a tap that lands outside it just re-picks.
            card.addEventListener('touchend', () => {
                const now = Date.now();
                const win = (typeof window !== 'undefined' && typeof window._wgDblTapMs === 'number') ? window._wgDblTapMs : 400;
                if (card._wgLastTap && (now - card._wgLastTap) < win){ card._wgLastTap = 0; _quickStart(); }
                else card._wgLastTap = now;
            }, { passive: true });
        });
        root.querySelector('.wg-prev')?.addEventListener('click', () => wg.prevSlide());
        // NEXT advances slides until it blooms — once it blooms (role picked [REF#UI-01065]
        // on spread 1, or always on the last spread), the click LAUNCHES the
        // game directly. User mandate: spread 1 PLAY NOW! should skip the
        // saves spread and exit the welcome guide.
        root.querySelector('.wg-next')?.addEventListener('click', (e) => {
            window._warmGuideAudio?.();
            const isBloom = e.currentTarget.classList.contains('wg-nav-btn-bloom');
            if (isBloom) {
                wg.hide({ isFromLoad: false });
            } else {
                wg.nextSlide();
            }
        });
        root.querySelector('#wg-descend-btn')?.addEventListener('click', () => wg.hide({ isFromLoad: false }));
        root.querySelectorAll('.wg-dot').forEach((dot) => {
            // data-i is rewritten by _renderDots every navigation (the window loops), so the [REF#UI-01066]
            // target must be read at CLICK time — a closure index would jump to a stale page.
            dot.addEventListener('click', () => { const t = parseInt(dot.dataset.i, 10); if (!isNaN(t)) wg.setSlide(t); });
        });
        // Section TABS (Intro / Saves / Inventory / Slots) — jump between guide sections (Mark 2026-06-17). [REF#UI-01067]
        root.querySelectorAll('.wg-tab').forEach(tab => {
            tab.addEventListener('click', () => { const s = parseInt(tab.dataset.tabSlide, 10); if (!isNaN(s)) wg.setSlide(s); });
        });
        // BAR MENU page options (Mark 2026-07-25 "bar menu = guide book page"): Accept Contract → the engine seeds the delivery [REF#UI-01068]
        // quest (closes the guide so the player sees the world); Play Sake → the existing tap game.
        root.querySelector('#wg-bar-contract')?.addEventListener('click', () => { try { wg._acceptDeliveryContract(); } catch(_){} try { wg.hide({ isFromLoad: false }); } catch(_){} });
        root.querySelector('#wg-bar-sake')?.addEventListener('click', () => { try { wg.openTapper(); } catch(_){} });
        root.querySelector('#wg-bar-quests')?.addEventListener('click', () => { const host = root.querySelector('#wg-tavern-quest-list'); if (host) host.hidden = !host.hidden; try { window.parent.postMessage({ type:'REQUEST_TAVERN_QUESTS' }, '*'); wg._renderTavernQuestList(); } catch(_){} });
        root.querySelector('#wg-tavern-quest-list')?.addEventListener('click', (event) => {
            const target = event.target.closest('[data-tavern-quest], [data-tavern-choice]'); if (!target) return;
            if (target.dataset.tavernChoice) { try { wg._chooseTavernQuest(target.dataset.tavernChoice); } catch(_){} return; }
            try { wg._acceptTavernQuest(target.dataset.tavernQuest, target.dataset.tavernView || 'story'); } catch(_){}
        });

        // WORLD page (WCAG P4, Mark GO 2026-08-14): refresh + delegated clicks. Delegation on the [REF#UI-01069]
        // containers (not the buttons) survives every _renderWorld() innerHTML replacement.
        root.querySelector('#wg-world-refresh')?.addEventListener('click', () => wg._queryWorld());
        // 墓場 — the page is built once with the guide; a death that happens while it is open must be readable [REF#PENDING] [REF#UI-01433]
        // without a reload, and the cookie is the only source, so a repaint is the whole refresh (Mark 2026-09-25).
        root.querySelector('#wg-gy-refresh')?.addEventListener('click', () => {
            try {
                const l = root.querySelector('#wg-gy-list'); if (l) l.innerHTML = wg._graveyardRows();
                const st = root.querySelector('#wg-gy-stats'); if (st) st.innerHTML = wg._graveyardStats();
            } catch (_) {}
        });
        root.querySelector('#wg-world-rooms')?.addEventListener('click', (e) => {
            const tog = e.target.closest && e.target.closest('#wg-world-other');
            if (tog) { wg._worldShowOther = !wg._worldShowOther; wg._renderWorld();
                try { document.querySelector('#wg-world-other')?.focus(); } catch (_) {}   // keep the reader where it was [REF#UI-01318]
                return; }
            const b = e.target.closest && e.target.closest('button[data-world-room]');
            if (!b) return;
            wg._worldSelectedRoom = parseInt(b.dataset.worldRoom, 10);
            // Clear the answer with the room. Leaving it up showed an answer about the Main Hall [REF#UI-01319]
            // lantern while the Guardpost was on screen — the same "answer in the wrong place" defect
            // this whole page just fixed, in miniature.
            wg._worldPending = null;
            clearTimeout(wg._worldReplyTO);
            try { const el = document.querySelector('#wg-world-reply'); if (el) { el.hidden = true; el.innerHTML = ''; } } catch (_) {}
            wg._renderWorld();
        });
        root.querySelector('#wg-world-objects')?.addEventListener('click', (e) => {
            const b = e.target.closest && e.target.closest('button[data-world-cmd]');
            if (!b) return;
            try { window.A11yGrammar && window.A11yGrammar.remember(b.dataset.worldTarget); } catch (_) {}   // "now pick it up" after a button press (2026-09-12) [REF#UI-01353]
            // THE ONE-RAIL CONTRACT: this payload must stay byte-identical to what the chat box [REF#UI-01070]
            // posts for the same verb — probe-a11y-worldpage deep-equals the two. Change both or neither.
            const isJa = (window.currentLang || localStorage.getItem('origami_lang') || 'en') === 'ja';
            window.parent.postMessage({
                type: 'FPV_CHAT_COMMAND',
                cmd: b.dataset.worldCmd,
                targetName: b.dataset.worldTarget || null,
                lang: isJa ? 'ja' : 'en',
            }, '*');
            try { window.logEvent && window.logEvent('🗺️ ' + b.textContent.trim(), 'system'); } catch(_){}
            // THE PAGE MUST ANSWER ON THE PAGE. Every verb's reply reaches this window as a LOG_EVENT [REF#UI-01320]
            // and renders into the EVENT LOG, which lives on a different panel — so from here a Look
            // was indistinguishable from a dead button: the report that this page did nothing was an
            // accurate reading of it, because the answers were landing somewhere else.
            // An interface whose answers appear somewhere you are not is not usable, and this page is
            // the one a blind player is meant to play the whole game from.
            // Order, date and wording: knowledge/design/WORLDPAGE_ANSWERS_INLINE_2026-09-04.md
            wg._worldPending = { target: b.dataset.worldTarget || '', cmd: b.dataset.worldCmd || '',
                                 at: Date.now(), label: b.textContent.trim() };
            wg._renderWorldReply('… ' + b.textContent.trim() + (b.dataset.worldTarget ? (' — ' + b.dataset.worldTarget) : ''), true);
            clearTimeout(wg._worldRefreshA); clearTimeout(wg._worldRefreshB);
            wg._worldRefreshA = setTimeout(() => { try { wg._queryWorld(); } catch (_) {} }, 3000);
            wg._worldRefreshB = setTimeout(() => { try { wg._queryWorld(); } catch (_) {} }, 16000);
            clearTimeout(wg._worldReplyTO);
            wg._worldReplyTO = setTimeout(() => {
                if (wg._worldPending) { wg._renderWorldReply(_t('wg.world.no_reply', 'No answer came back for that.'), false);
                    wg._worldPending = null; }
            }, 8000);
        });

        // A11Y SETTINGS (WCAG R5, Mark GO 2026-08-14): one persisted namespace (origami.a11y.*), [REF#UI-01071]
        // broadcast to BOTH iframes on every change and re-applied on boot. The engine scales SFX
        // through _playSfxFile; panels honors reducedMotion/relaxTiming (2.2.1 idle-close etc.).
        const sfx = root.querySelector('#wg-sfx-vol');
        const sfxOut = root.querySelector('#wg-sfx-vol-val');
        const rm = root.querySelector('#wg-reduced-motion');
        const rt = root.querySelector('#wg-relax-timing');
        if (sfx) {
            sfx.value = String(Math.round(wg._a11yPrefs().sfxVol * 100));
            if (sfxOut) sfxOut.textContent = sfx.value + '%';
            sfx.addEventListener('input', () => {
                if (sfxOut) sfxOut.textContent = sfx.value + '%';
                wg._setA11yPref('sfxVol', Math.max(0, Math.min(1, parseInt(sfx.value, 10) / 100)));
            });
        }
        // Minimap twins (WCAG 2.5.5, 2026-09-12): zoom posts the byte-identical PIP_ZOOM the moondial's ± post (+ is delta -1 [REF#UI-01346]
        // there too); a view preset CLICKS the real .pip-persp-btn so the one code path keeps the active ring, topdown-mode and the
        // PIP_PERSPECTIVE message. aria-pressed mirrors whichever preset is live.
        const mmSync = () => { const live = document.querySelector('.pip-persp-btn.active'); root.querySelectorAll('.wg-mm-view').forEach(b => b.setAttribute('aria-pressed', String(!!live && live.dataset.preset === b.dataset.mm))); };
        root.querySelectorAll('.wg-mm-btn').forEach(b => b.addEventListener('click', () => {
            const k = b.dataset.mm;
            if (k === 'zoom-in' || k === 'zoom-out') { try { window.parent.postMessage({ type: 'PIP_ZOOM', delta: k === 'zoom-in' ? -1 : 1 }, '*'); } catch (_) {} return; }
            const real = document.querySelector('.pip-persp-btn[data-preset="' + k + '"]'); if (real) real.click(); mmSync();
        }));
        mmSync();
        if (rm) {
            rm.checked = !!wg._a11yPrefs().reducedMotion;
            rm.addEventListener('change', () => wg._setA11yPref('reducedMotion', rm.checked));
        }
        if (rt) {
            rt.checked = !!wg._a11yPrefs().relaxTiming;
            rt.addEventListener('change', () => wg._setA11yPref('relaxTiming', rt.checked));
        }
        // AUTO-ATTACK moved here from the side panel (Mark 2026-09-19: "move this to settings - its not needed on main [REF#UI-01361]
        // canvas side panel"). Same setter the side-panel box used (window.setAutoAttack, Panels ~:18056), which
        // persists origami_autoatk and tells the engine via SET_AUTOATTACK — one writer, one lane.
        const aa = root.querySelector('#wg-auto-attack');
        if (aa) {
            try { aa.checked = localStorage.getItem('origami_autoatk') !== '0'; } catch(_) { aa.checked = true; }
            aa.addEventListener('change', () => { try { if (typeof window.setAutoAttack === 'function') window.setAutoAttack(aa.checked); } catch(_){} });
        }
        const tm = root.querySelector('#wg-turn-mode');
        if (tm) {
            tm.checked = !!wg._a11yPrefs().turnMode;
            tm.addEventListener('change', () => wg._setA11yPref('turnMode', tm.checked));
        }
        const rd = root.querySelector('#wg-reading');   // WCAG 1.4.8 (2026-09-12) [REF#UI-01347]
        if (rd) {
            rd.checked = !!wg._a11yPrefs().readingMode;
            rd.addEventListener('change', () => { wg._setA11yPref('readingMode', rd.checked); try { document.documentElement.classList.toggle('a11y-reading', rd.checked); } catch(_){} });
        }
        const sk = root.querySelector('#wg-single-keys');   // WCAG 2.1.4 (2026-09-13) [REF#UI-01356 → see REF#MG-00230]
        if (sk) {
            sk.checked = wg._a11yPrefs().singleKeys !== false;
            sk.addEventListener('change', () => wg._setA11yPref('singleKeys', sk.checked));
        }
        const pt = root.querySelector('#wg-plain-text');
        if (pt) {
            pt.checked = !!wg._a11yPrefs().plainText;
            pt.addEventListener('change', () => { wg._setA11yPref('plainText', pt.checked); try { document.documentElement.classList.toggle('a11y-plain-text', pt.checked); } catch(_){} wg._relocalize(true); });   // rebuild: the twins are read at render time [REF#UI-01340]
        }

        // COLORS — the contrast radios (2026-10-02). Native radios: Tab reaches the group, the arrow keys choose; the choice persists. [REF#UI-01490]
        root.querySelectorAll('input[name="wg-contrast"]').forEach(r => {
            r.checked = (wg._a11yPrefs().contrast || 'system') === r.value;
            r.addEventListener('change', () => { if (r.checked) wg._setA11yPref('contrast', r.value); });
        });

        // SETTINGS HUB CTAs — navigate to subsettings slides (Mark 2026-08-08) [REF#UI-01072]
        root.querySelectorAll('.wg-settings-cta').forEach(btn => {
            btn.addEventListener('click', () => {
                const slide = parseInt(btn.dataset.slide, 10);
                if (!isNaN(slide)) wg.setSlide(slide);
            });
        });

        // ── MUSIC SETTINGS — ungate background music (Mark 2026-08-08; REPAIRED 2026-08-15) ────────── [REF#UI-01073]
        //    THREE INDEPENDENT BREAKS, all of which had to be fixed for this checkbox to do anything:
        //      1. WRONG WINDOW. This file runs in the PANELS iframe; the Composer's gate reads
        //         `window._bgMusicEarned` in the ENGINE iframe. Setting it here could never be seen.
        //         The engine now sets its own copy from the message below.
        //      2. DEAD LETTER. MUSIC_CONTROL had no case in the shell's relay switch — and that switch
        //         has no `default` — so the message was dropped in transit, every time, since 08-08.
        //         A case now exists (OrigamiUnderworld.html, beside BG_MUSIC_VOL).
        //      3. NO PERSISTENCE. There was no `checked` seeding and no storage, so even once the first
        //         two were fixed the box would come back unticked on every reload and the score would
        //         die again. It now round-trips through localStorage like its a11y siblings above.
        //    ⚠ WHY IT MATTERS MORE THAN A CHECKBOX: UNEARNED_MUSIC sits ABOVE SECTION_BG in the
        //      Composer's authored cue order and arbitrate() breaks on the first passing gate, so a gate
        //      that can never open silences BG **and** gambling, lounge and post-combat. Four background
        //      tracks have been sitting on disk, referenced and unreachable.
        const bgMusicToggle = root.querySelector('#wg-bg-music-enable');
        if (bgMusicToggle) {
            const _bgKey = 'origami.bgMusicEarned';
            // DEFAULT ON. The alternative — a fresh save exploring in silence with no hint that a [REF#UI-01074]
            // checkbox three menus deep is why — is the documented silent-scene failure this codebase
            // has been bitten by twice. The gate still exists and the player can still switch it off;
            // it is the DEFAULT that flips, not the mechanism. Registered in DISABLED-FEATURES.
            let _on = false;   // matches the engine's boot default — see the hold note in Engine9's seed [REF#UI-01075]
            try { const v = localStorage.getItem(_bgKey); if (v !== null) _on = (v === '1'); } catch(_){}
            bgMusicToggle.checked = _on;
            const _pushBg = (v) => {
                try { localStorage.setItem(_bgKey, v ? '1' : '0'); } catch(_){}
                try { parent.postMessage({ type:'MUSIC_CONTROL', action:'toggle', enabled: !!v }, '*'); } catch(_){}
            };
            _pushBg(_on);   // seed the engine on open, so the restored value reaches the gate without a click [REF#UI-01076]
            bgMusicToggle.addEventListener('change', () => _pushBg(bgMusicToggle.checked));
        }

        // ── Monster/Avatar DB (spreads 3 & 4) ── [REF#UI-01077]
        // SETUP button → jump straight to the bestiary spread.
        // #wg-setup-btn REMOVED game-wide (Mark 2026-06-03) — SETUP folded into the
        // SETTINGS button (act-se → toggleSettings → opens this guide). No footer
        // SETUP button to bind. (openSetup() stays callable for any programmatic use.)
        // Filter pills (Alphabetical + By-Level).
        root.querySelectorAll('.wg-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                root.querySelectorAll('.wg-pill').forEach(p => {
                    const on = p === pill;
                    p.classList.toggle('active', on);
                    p.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                wg._monsterFilter = pill.dataset.filter;
                wg._renderMonsterList();
            });
        });
        // CODEX TABS (Mark 2026-07-19) — ANIMATIONS / ATTRIBUTES / SOUND FX. Pure show-hide on the right [REF#UI-01078]
        // page; every panel is rendered up-front by _renderMonsterDetail so switching tabs never re-fetches
        // and the 3D preview (which lives on the LEFT page) is never remounted by a tab change.
        root.querySelectorAll('.wg-codex-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const want = tab.dataset.codexTab;
                root.querySelectorAll('.wg-codex-tab').forEach(t => {
                    const on = t === tab;
                    t.classList.toggle('active', on);
                    t.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                root.querySelectorAll('.wg-codex-panel').forEach(p => {
                    p.classList.toggle('active', p.dataset.codexPanel === want);
                });
            });
        });
        // Preview turntable + replay controls. [REF#UI-01079]
        const spinBtn = root.querySelector('#wg-mon-spin');
        if (spinBtn) spinBtn.addEventListener('click', () => {
            const pv = wg._pv; if (!pv) return;
            pv.spinSpeed = (pv.spinSpeed > 0) ? 0 : 0.6;
            spinBtn.classList.toggle('off', pv.spinSpeed === 0);
        });
        const replayBtn = root.querySelector('#wg-mon-replay');
        if (replayBtn) replayBtn.addEventListener('click', () => {
            const pv = wg._pv;
            if (pv && pv.current) { try { pv.current.reset().play(); } catch (_) {} }
        });
        // Avatar cards. [REF#UI-01080]
        root.querySelectorAll('.wg-avatar-row').forEach(row => {
            row.addEventListener('click', () => wg._selectAvatar(row.dataset.avatarId));
        });

        // ── Equipment drag-and-drop (spread 6) ── [REF#UI-01081]
        this._bindEquipment(root);
    }

    // HTML5 drag-and-drop wiring for the equipment screen. Delegated on the [REF#UI-01082]
    // two stable containers (#wg-item-list, #wg-slot-grid) so it survives
    // _renderEquipment() re-paints. Works inside the Panels iframe (native
    // DnD is same-document, no cross-frame transfer needed). Click + keyboard
    // are wired too as accessible / touch-friendly fallbacks.
    _bindEquipment(root) {
        const wg = this;
        const list = root.querySelector('#wg-item-list');
        const grid = root.querySelector('.wg-equip-interactive-area') || root.querySelector('#wg-slot-grid');   // the whole area: the figure's MELEE/RANGED hand slots are drop targets too (2026-09-20) [REF#PENDING] [REF#UI-01401]

        // ----- PRIMARY WEAPON picker: click a found melee chip to wield it (inventory #3) ----- [REF#UI-01083]
        const wstrip = root.querySelector('#wg-primary-weapon');
        if (wstrip) {
            wstrip.addEventListener('click', (e) => {
                const chip = e.target.closest('.wg-weapon-chip');
                if (!chip || chip.classList.contains('is-unowned')) return;
                wg._setPrimaryWeapon(chip.dataset.weaponId);
            });
        }

        // ----- Drag SOURCES: item rows (delegated) ----- [REF#UI-01084]
        if (list) {
            list.addEventListener('dragstart', (e) => {
                const row = e.target.closest('.wg-item-row');
                if (!row) return;
                wg._dragItemId = row.dataset.itemId;
                row.classList.add('wg-dragging');
                try {
                    e.dataTransfer.setData('text/plain', row.dataset.itemId);
                    e.dataTransfer.effectAllowed = 'copyMove';
                } catch (_) {}
            });
            list.addEventListener('dragend', (e) => {
                const row = e.target.closest('.wg-item-row');
                if (row) row.classList.remove('wg-dragging');
                wg._dragItemId = null;
            });
            // Click an item to equip into its slot (touch / no-drag fallback). [REF#UI-01085]
            list.addEventListener('click', (e) => {
                const row = e.target.closest('.wg-item-row');
                if (!row) return;
                wg._equipItem(row.dataset.itemId, row.dataset.slot);
            });
            // The list is ALSO an unequip drop target: drag a worn slot here. [REF#UI-01086]
            list.addEventListener('dragover', (e) => {
                if (wg._dragSlotId) { e.preventDefault(); list.classList.add('wg-drop-ok'); }
            });
            list.addEventListener('dragleave', () => list.classList.remove('wg-drop-ok'));
            list.addEventListener('drop', (e) => {
                list.classList.remove('wg-drop-ok');
                if (wg._dragSlotId) { e.preventDefault(); wg._unequipSlot(wg._dragSlotId); wg._dragSlotId = null; }
            });
        }

        // ----- Drop TARGETS: body slots (delegated) ----- [REF#UI-01087]
        if (grid) {
            grid.addEventListener('dragover', (e) => {
                const slot = e.target.closest('.wg-slot');
                if (!slot || !wg._dragItemId) return;
                const item = wg._itemById(wg._dragItemId);
                if (item && item.slot === slot.dataset.slot) {
                    e.preventDefault();          // allow the drop [REF#UI-01088]
                    slot.classList.add('wg-drop-ok');
                } else {
                    slot.classList.add('wg-drop-bad');
                }
            });
            grid.addEventListener('dragleave', (e) => {
                const slot = e.target.closest('.wg-slot');
                if (slot) slot.classList.remove('wg-drop-ok', 'wg-drop-bad');
            });
            grid.addEventListener('drop', (e) => {
                const slot = e.target.closest('.wg-slot');
                if (!slot) return;
                slot.classList.remove('wg-drop-ok', 'wg-drop-bad');
                const id = wg._dragItemId || (() => { try { return e.dataTransfer.getData('text/plain'); } catch (_) { return null; } })();
                if (id) { e.preventDefault(); wg._equipItem(id, slot.dataset.slot); }
                wg._dragItemId = null;
            });
            // A filled slot is itself a drag SOURCE → drag it to the list to [REF#UI-01089]
            // unequip. (The draggable .wg-slot-body carries data-item-id.)
            grid.addEventListener('dragstart', (e) => {
                const body = e.target.closest('.wg-slot-body[draggable="true"]');
                if (!body) return;
                const slot = body.closest('.wg-slot');
                wg._dragSlotId = slot ? slot.dataset.slot : null;
                try { e.dataTransfer.setData('text/plain', body.dataset.itemId || ''); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
            });
            // "Drag AWAY" (Mark 2026-09-20): dropping a worn card anywhere outside the equip area — not [REF#PENDING] [REF#UI-01402]
            // only the precise #wg-item-list rect — discards it back to inventory. dragend's clientX/Y is
            // the release point; dropEffect stays 'none' unless some OTHER handler (the list's drop, above)
            // already claimed and preventDefault'd it, so that case is skipped here to avoid double-firing.
            grid.addEventListener('dragend', (e) => {
                if (wg._dragSlotId && e.dataTransfer && e.dataTransfer.dropEffect === 'none') {
                    const gr = grid.getBoundingClientRect();
                    const outside = e.clientX < gr.left || e.clientX > gr.right || e.clientY < gr.top || e.clientY > gr.bottom;
                    if (outside) wg._unequipSlot(wg._dragSlotId);
                }
                wg._dragSlotId = null;
            });
            // Click a filled slot to unequip (touch / no-drag fallback). [REF#UI-01090]
            grid.addEventListener('click', (e) => {
                const slot = e.target.closest('.wg-slot.filled');
                if (slot) wg._unequipSlot(slot.dataset.slot);
            });
            // Keyboard: Enter/Space on a filled slot unequips it. [REF#UI-01091]
            grid.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const slot = e.target.closest('.wg-slot.filled');
                if (slot) { e.preventDefault(); wg._unequipSlot(slot.dataset.slot); }
            });
        }
    }

    _html() {
        const _t = (key, fallback) => this._L(key, fallback);
        // AAA role card: 3D artifact icon box (filled by _mountRoleIcons on spread 1; [REF#UI-01092]
        // kanji glyph shows as the fallback until then) + name + one-line blurb.
        // ROVING TABINDEX (Mark 2026-07-26 keyboard pass): only the FIRST role is tabbable, so Tab enters the
        // roster once and lands on the current choice instead of stopping at all six. _focusRole moves the 0
        // as the arrows walk, and selectRole moves it on a mouse pick so the two input paths stay in agreement.
        let _rcIdx = 0;
        const roleCard = r => `
            <button type="button" class="wg-role-card ${r.cls}" role="radio" aria-checked="false"
                    tabindex="${(_rcIdx++) === 0 ? '0' : '-1'}"
                    data-role-id="${r.id}" id="role-${r.id}">
                <svg class="wg-role-card-art" viewBox="${r.artViewBox}" preserveAspectRatio="xMidYMid slice" overflow="hidden" aria-hidden="true" focusable="false"><image href="${r.art}" width="1061" height="1482" /></svg>
                <span class="wg-role-meta">
                    <span class="wg-role-name">${_t('wg.role.' + r.id + '.name', r.name)}</span>
                    <span class="wg-role-blurb">${_t('wg.role.' + r.id + '.blurb', r.blurb)}</span>
                </span>
            </button>`;
        // 3 roles on the LEFT page, 3 on the RIGHT page (2026-06-09, Mark: full-width [REF#UI-01093]
        // cards on both pages; the right-page Profile is retired).
        // DISPLAY ORDER (2026-10-18): the samurai takes the bottom-right slot and the ninja moves up — this.roles is untouched.
        const _shown = this.roles.slice();
        const _si = _shown.findIndex(r => r.id === 'samurai'), _ni = _shown.findIndex(r => r.id === 'ninja');
        if (_si >= 0 && _ni >= 0) [_shown[_si], _shown[_ni]] = [_shown[_ni], _shown[_si]];
        const roleCards_L = _shown.slice(0, 3).map(roleCard).join('');
        const roleCards_R = _shown.slice(3, 6).map(roleCard).join('');

        // Helper — render one spread (.wg-slide with left-page / spine / right-page) [REF#UI-01094]
        const spread = (idx, leftHtml, rightHtml, opts = {}) => `
            <section class="wg-slide${idx === 0 ? ' active' : ''}" data-slide="${idx}" role="region" aria-label="${opts.label || 'Page ' + (idx+1)}">
                <div class="wg-page wg-page-left">${leftHtml}</div>
                <div class="wg-spine" aria-hidden="true"></div>
                <div class="wg-page wg-page-right">${rightHtml}</div>
            </section>`;

        // ── DONATION ADDRESS — declared HERE, above the cover, because the Terms panel at the bottom of the [REF#UI-01095]
        //    cover spread now links to it as well as Spread 7. Both are `const`s in this one scope, so a
        //    declaration further down the file would be a TEMPORAL DEAD ZONE throw at the first reference,
        //    not a quiet undefined. One address, one place to change it.
        const DONATE_EMAIL = 'apalamen@hotmail.com';   // ← Mark: change donation address here (one place) [REF#UI-01096]
        // THE STEAM EDITION HAS NO DONATION DOOR (Steam plan §2, Claude 2026-09-16): Steam forbids in-app links to buy or [REF#UI-01360]
        // give elsewhere, so on the Steam build (window.__ORIGAMI_STEAM__ — set by the shell / by `build.mjs --steam`) the
        // whole donate block is left out of both spreads; the web edition is unchanged. The build also blanks the URL
        // literal so `gate:steam` can prove the bytes are gone.
        const STEAM_EDITION = (() => { try { return window.__ORIGAMI_STEAM__ === true || (window.top && window.top.__ORIGAMI_STEAM__ === true); } catch (_) { return false; } })();
        const DONATE_HREF = STEAM_EDITION ? '' : ('https://www.paypal.com/donate/?business=' + encodeURIComponent(DONATE_EMAIL)
                          + '&item_name=Origami%20Underworld%20(freeware)&currency_code=USD');
        // ── THE COVER'S OWN DONATION DOOR — THE TIP JAR'S LINK, ON THE TITLE PAGE (2026-10-01) ──── [REF#PENDING] [REF#UI-01491]
        //    The donate door in the empty space under the cover haiku. The link is the stage tip jar's —
        //    its modal lives in OrigamiUnderworld.html (NAGESEN_OPEN). Register entry, 2026-10-01, at the
        //    top of Origami.RealityEngine.9.html carries the order this was built from.
        //    SAME ADDRESS, OWN item_name. DONATE_EMAIL above is still the one place the address is
        //    written; the jar already carries its own item_name so a jar tip is distinguishable from a
        //    Terms-page donation in the PayPal ledger, and the cover gets the same treatment for the
        //    same reason — three doors, one address, three readable ledger lines.
        //    window._starletteTipUrl IS HONOURED FIRST, so the knob that already redirects the stage
        //    jar redirects this button too and there is no second place to update when the link moves.
        //    STEAM: blanked exactly as DONATE_HREF is, and the markup below renders nothing when it is
        //    empty — Steam forbids an in-app link to give elsewhere.
        //    Off: window._coverTipJar = false (the cover shows no donate block at all).
        const COVER_DONATE_HREF = STEAM_EDITION ? ''
            : ((typeof window._starletteTipUrl === 'string' && window._starletteTipUrl)
                ? window._starletteTipUrl
                : 'https://www.paypal.com/donate/?business=' + encodeURIComponent(DONATE_EMAIL)
                  + '&item_name=' + encodeURIComponent('Origami Underworld — Tip Jar') + '&currency_code=USD');

        // ─── SPREAD 0 — COVER ─── [REF#UI-01097]
        // Left page: curved wordmark over a goblin that FILLS the panel
        // (mix-blend-mode lifts the checkered JPG background against the
        // dark page) + haiku centered beneath. Right page: welcome lore.
        const cover_L = `
            <div class="wg-cover-left">
                <h1 id="wg-title" class="wg-sr-only">Origami Underworld</h1>
                <div class="wg-logo-wrap">
                    <img class="wg-logo" id="wg-cover-logo" src="assets/brand/icons/Origami_Underworld_Rock_Opera_Logo.png" alt="Origami Underworld — A Dark Fantasy Rock Opera RPG" decoding="async" fetchpriority="high" />
                </div>
                <div class="wg-haiku" aria-label="Welcome haiku">
                    <p>${_t('wg.cover.haiku.1', 'Uncharted trail calls,')}</p>
                    <p>${_t('wg.cover.haiku.2', 'Turn back now or risk it all—')}</p>
                    <p>${_t('wg.cover.haiku.3', 'No coin returns here.')}</p>
                    <p class="wg-haiku-kanji" aria-hidden="true" lang="ja">未踏の道 — 戻り路無し</p>
                </div>
                ${(COVER_DONATE_HREF && window._coverTipJar !== false) ? `
                <div class="wg-cover-tip">
                    <a class="wg-cover-tip-btn" target="_blank" rel="noopener noreferrer" href="${COVER_DONATE_HREF}">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 21s-6.7-4.35-9.33-8.11C.8 10.2 2.06 6.5 5.4 6.5c1.9 0 3.2 1.05 3.93 2.11L12 11l2.67-2.39C15.4 7.55 16.7 6.5 18.6 6.5c3.34 0 4.6 3.7 2.73 6.39C18.7 16.65 12 21 12 21z"/></svg>
                        <span>${_t('wg.cover.tip.btn', 'Tip the Performer · PayPal')}</span>
                    </a>
                </div>` : ''}
            </div>`;
        const cover_R = `
            <div class="wg-page-pad wg-cover-right">
                <h2 class="wg-page-title">${_t('wg.cover.welcome_title', 'WELCOME, TRAVELER')}</h2>
                <div class="wg-lore">
                    <p>${_t('wg.cover.lore.1', 'Welcome to Origami Underworld — <b>a dark fantasy rock opera RPG</b>. Explore the Crime Syndicate’s headquarters. Collect song cards and bring them to Starlette; her songs awaken the dungeon.')}</p>
                    <p>${_t('wg.cover.lore.2', '<b>Beware the moon.</b> It changes everything.')}</p>
                    <p>${_t('wg.cover.lore.3', 'Play your way — the underworld matches your style.')}</p>
                    <p>${_t('wg.cover.lore.4', 'Fun quests, and a new dungeon every time you play. Be careful when you win — the underworld gets invaded by greedy adventurers.')}</p>
                    <p>${_t('wg.cover.lore.5', 'No pay to play. No pay to win. No microtransactions — just pure gaming fun.')}</p>
                    <!-- ACCESSIBILITY LINE. Was a statement of INTENT (Mark 2026-08-14); Mark replaced it with [REF#UI-01098]
                         an explicit WCAG 2.2/AAA claim 2026-08-15. knowledge/WCAG_CONFORMANCE.md is the backing
                         evidence — keep it current, the cover now asserts the badge rather than the promise.
                         ⚠ TRIMMED TO THE CLAIM ALONE 2026-08-15 (Mark: "remove this text from guide panel and
                         all that comes after the sentence of WCAG"). The second sentence — "Every room, monster
                         and card can be reached by keyboard or typed command: press F1" — is GONE from the
                         cover. F1 and the World page are untouched and still shipped; only the cover copy that
                         advertised them was cut. Do not re-add it here as a "helpful hint". -->
                    <!-- (the WCAG claim MOVED below the Terms row — Mark 2026-08-15 "center green wcag [REF#UI-01099]
                         text and put it below the terms". It now closes the cover instead of sitting
                         between the lore and the loader.) -->
                </div>
                <p class="wg-lore-warn wg-cover-warning">${_t('wg.cover.lore.warn', 'Beware — she does not take kindly to rude guests.')}</p>
                <div class="wg-loader-container" id="wg-loader-container">
                    <div class="wg-loader-status" id="wg-loader-status">Waking dungeon master...</div>
                    <div class="wg-loader-bar-bg">
                        <div class="wg-loader-bar-fill" id="wg-loader-bar-fill" style="width: 0%;"></div>
                    </div>
                    <div class="wg-loader-percentage" id="wg-loader-percentage">0%</div>
                </div>
                <div class="wg-actions">
                    <label class="wg-tc-row" for="wg-tc-checkbox">
                        <input type="checkbox" id="wg-tc-checkbox" />
                        <span>${_t('wg.cover.tc_agree', 'I agree to the')}
                            <a href="#" id="wg-tc-link">${_t('wg.tc.link', 'Terms &amp; Conditions')}</a>
                        </span>
                    </label>
                    <!-- THE WCAG CLAIM, BELOW THE TERMS AND CENTRED (Mark 2026-08-15). Inside .wg-actions [REF#UI-01100]
                         and AFTER the agree row on purpose: it now reads as the closing statement of the
                         cover rather than a caption wedged between the lore and the loading bar. -->
                    <p class="wg-lore-a11y">${_t('wg.cover.lore.a11y', 'This is a WCAG 2.2/AAA - 3D RPG Music Game.')}</p>
                </div>
                <!-- TRAILER SLOT (2026-10-17): placeholder for the game's trailer videos — the next thing to make. Phone cover only, [REF#PENDING] [REF#UI-01522]
                     shown once loading ends; swap the label for a <video> when the trailers exist. -->
                <div class="wg-cover-trailer"><span>TRAILERS GO HERE</span></div>
                <section id="wg-tc-inline" class="wg-tc-inline" tabindex="-1" aria-label="Terms and Conditions" hidden>
                    <header class="wg-tc-inline-head">
                        <h3>${_t('wg.tc.heading', '📜 Our Terms')}</h3>
                        <button type="button" id="wg-tc-collapse" class="wg-tc-collapse" aria-label="${_t('wg.tc.hide', 'Hide terms')}">&minus;</button>
                    </header>
                    <div class="wg-tc-body" tabindex="0">
                        <p style="white-space: pre-wrap;">${_t('tc.intro', '\nOi!  A human! WTF?\n\nYou’re actually reading these terms?\n\nUnbelievable!  Anyways buddy, let me lay down the law and put down my spiked club and find these “Terms” I been asked to find.\n\nOh now I found it — what\'s this? <b>Freeware?</b>\n\nNow doesn’t that beat all?  Yeah, go figure it died and ended up here in the same accursed game you’re clicking on right now.  \n\nSo there’s none of that encrypted “legal terms” you all try to pass off as anything other than stealing “souls” and robbing them blind doing it.  We don’t need souls, we got too many as it is tearing up the slot machines.  \n\nWord to the wise… You dont want to interrupt no Hungry Ghosts or an angry Troll at the slots— just be pre-warned!')}</p>
                        
                        <p><b>1. ${_t('tc.1.title', 'As-Is, No Warranty.')}</b> ${_t('tc.1.body', 'This game is free-to-play and provided entirely as-is. No warranty of any kind, express or implied. If your PC catches fire because a Fire Imp got loose in your graphics card, that\'s on you. Don’t say we didn’t warn you beforehand, because we get lots of visitors to our boss’s casinos, and I ain\'t your babysitter, you got that?')}</p>
                        <p><b>2. ${_t('tc.2.title', 'No Real-Money Gambling.')}</b> ${_t('tc.2.body', 'All gold, chips, dice, and blackjack hands are virtual. Nothing here constitutes gambling under any law (cosmic, mortal, or otherwise), and you realize you can’t take it with you when you croak anyway. Besides, there’s nowhere to cash out to. The Big Boss keeps her books in the eyes of every crow and rat down here, and let me tell you, buddy — those two cannot keep a secret to save their feathers. Try strolling out with a jackpot and you’ll have forty crows narrating it, badly, to anyone who’ll listen, and a rat doing your arithmetic wrong on purpose. So you just watch yourself, follow our “terms,” and you might get out of here in one piece. I didn’t say alive, so don’t go getting wise all of a sudden.')}</p>
                        <p><b>3. ${_t('tc.3.title', 'Limitation of Liability.')}</b> ${_t('tc.3.body', 'The developer, designer, beta testers, couch potatoes, ghost narrators, the Serpent Boss, and any haiku composers are not liable for direct, indirect, incidental, consequential, karmic, or spiritual damages arising from your use of this game in a moral or immoral fashion—whether it\'s offline or online, it just don’t matter. If a succubus steals your heart and breaks it into a billion pieces, or you lose a pinky finger (mobster style) to a paper-cut from these very terms—don’t come crying to me, bub.')}</p>
                        <p><b>4. ${_t('tc.4.title', 'Indemnification.')}</b> ${_t('tc.4.body', 'You hold the developer (and any indentured underworld servants, like me) harmless from any claim, summons, hex, curse, or sternly worded letter arising from your gameplay. Or from any of your “potential” bad moods. Or from dying before you saved, because dying in the afterlife without your own insurance policy of clicking SAVE once in a while is totally on you, chump. Don’t come at me every time you want me to set you up in a role again. We don\'t do customer service here. My customer service department is a bat with rusty nails named "Service," and if you want some good old-fashioned “servicing,” you let me know. Ok?')}</p>
                        <p><b>5. ${_t('tc.5.title', 'Accessibility & Children.')}</b> ${_t('tc.5.body', 'Targets WCAG 2.2/AAA. Parents remain responsible for supervising minors and miners both; you just can’t take your eyes off either when it comes to the underworld. Keep \'em away from the bottomless pits and small cursed artifacts that you can swallow. We hate doing the paperwork for lost humans... just saying, it\'s getting crowded down here, and we got enough mortals complaining that the boiling acid pits aren\'t ADA compliant.')}</p>
                        <p><b>6. ${_t('tc.6.title', 'The Court of Cosmic Justice.')}</b> ${_t('tc.6.body', 'These “Terms” are governed exclusively by the Court of Cosmic Justice (mostly run by grumpy Ogres), an interplanar tribunal whose rulings are final and beyond appeal in any mortal or alternative cosmic venue. Remedies include a written haiku of apology, voluntary meditation under a freezing waterfall, an offering of one magic lantern, or—in the most severe cases—rebirth as a Level-1 Yakuza Goblin tasked with scrubbing the boss\'s floors with a toothbrush until lessons are learned. Or we just simply ignore you, like every person clicking Terms and Agreements like this one that you never even read… come on, admit it… probably the first one you actually may have read if you got this far!')}</p>
                        <p><b>7. ${_t('tc.7.title', 'Severability & Entire Agreement.')}</b> ${_t('tc.7.body', 'If any clause is unenforceable, the rest remain in force unless stated otherwise to the contrary. Without regard to impartiality or bias, these words are exact and measured, and beyond reproach in this world or the next repeated visit you make to our world. You should know better, and if you are still confused, then understand these terms are made to confuse you into signing your soul away. But since you\'re here, we don\'t need to go buying souls; we got plenty on sale if you\'re wondering about any of that. No blood oaths or solemn pledges are warranted or otherwise enforced, but just so you know, these words can show you how companies do own you and you are selling your own soul to them on their own terms. Maybe one day you will take our word for what we just said because you never read terms anyway—come on, admit it.')}</p>
                        <p><b>8. ${_t('tc.8.title', 'No Soul Brokerage.')}</b> ${_t('tc.8.body', 'We ain’t buying your soul, mortal. Stop trying to offer it when you lose at blackjack! The market for mortal souls crashed centuries ago, and frankly, yours is probably tainted with microtransactions and terrible internet history. We only deal in virtual chips. If some alleyway demon offers you a sweet deal for your soul, you\'re getting scammed.')}</p>
                        <p><b>9. ${_t('tc.9.title', 'The "Read It Or Weep" Clause.')}</b> ${_t('tc.9.body', 'We actually expect you to read this. I know, shocking! If you just blind-click "Accept" and then cry when a cursed bird-demon steals your wifi password, that’s on you. Ignorance of the rules in the underworld just makes you an easier mark. Read the terms, or get scammed—your choice.')}</p>
                        <p><b>10. ${_t('tc.10.title', 'Official Anti-Scam Advisory.')}</b> ${_t('tc.10.body', 'If a banished Ogre prince emails you asking for 5,000 gold coins to unlock his frozen bank account, it’s a scam. We only scam you right to your face, legally, and with properly formatted text like this. We have standards. Don\'t be a gullible tourist.')}</p>
                        <p><b>11. ${_t('tc.11.title', 'The TL;DR Penalty Clause.')}</b> ${_t('tc.11.body', 'Listen, friend — your goblin host collects two things down here, and they\'re the only two nobody escapes: death and taxes. Same desk, same stamp. So before you play, you agree to actually read these terms — all of them, no skipping, no "I\'ll get to it later." There is no later down here; that\'s rather the point. Skim past the rules and you accept whatever you missed, exactly as written. My club gets grumpy when someone treats the fine print like it\'s optional. It isn\'t. Nothing here is. Now — start at the top, and welcome to the game.')}</p>
                        <p><b>12. ${_t('tc.12.title', 'Seriously, Your Soul is Worthless.')}</b> ${_t('tc.12.body', 'Just to hammer this home so you stop asking: even if we did want to buy souls, yours wouldn\'t meet the minimum collateral value for a half-eaten moldy rice ball. Keep it to yourself, play the game, and stop trying to make weird demonic pacts with our NPCs. They just laugh at you behind your back.')}</p>
                        <p><b>13. ${_t('tc.13.title', 'Bonus Hobbledygook.')}</b> ${_t('tc.13.body', 'The amount of demonic hobbledygook we can put in these words here lets you know we could probably install software to watch you at all times because you clicked these terms and gave us permission to do so. Maybe we could write that you owe us a million shiny gold coins in IOUs, paid the moment you save a game. Could... or maybe sell your soul. Or your Netflix password. You never know how bad it is up there around you yet? We do. All you creeps end up going through these halls, so let’s see where you end up. Spoiler: it smells like brimstone and cheap sake.')}</p>
                        <p><b>14. ${_t('tc.14.title', 'Oh yeah,')}</b> ${_t('tc.14.body', 'these Terms supersede all prior chats, emails, ESP, scrolls, prophecies, and whispered rumors—so if you got a beef with this, you got a beef with all of us, and we are willing to let you see what happens if you piss the Family off too much. We don’t aim to please, but we have pretty good aim. Just sayin\'!')}</p>
                        <p><b>15. ${_t('tc.15.title', 'You agree to sue us in the lower courts of the underworld,')}</b> ${_t('tc.15.body', 'and you have to bring your own attorney. We eat lawyers for breakfast down here, literally. Put some soy sauce on \'em. The boys would appreciate it if you paid for ours too.')}</p>

                        <p style="white-space: pre-wrap; margin-top: 20px;">${_t('tc.outro', 'Now, read this and weep, human:')}</p>

                        <div class="wg-haiku" style="margin-top:20px; font-style:italic; text-align:center; color:#22d3ee; line-height: 1.6;">
                            ${_t('tc.haiku', 'You read all these words,<br>My spiked club grows very bored,<br>Just click accept, nerd.')}
                        </div>

                        <p style="white-space: pre-wrap; margin-top: 20px;">${_t('tc.signed', 'Signed,\nThe Management (and the goblin with the spiked club)')}</p>

                        <!-- ── DONATION — AT THE BOTTOM OF THE TERMS (Mark 2026-07-26: "put it at bottom of terms [REF#UI-01101]
                             and conditions page I said"). Reuses the SAME wg.donate.* strings and the same PayPal
                             href as Spread 7, so the copy is localized (ja/en) already and the address has exactly
                             one source. Anyone who reads the terms to the end lands on the ask — which is more
                             people than page all the way through to the last spread. -->
                        ${DONATE_HREF ? `<div class="wg-tc-donate" style="margin-top:26px; padding-top:18px; border-top:1px solid rgba(255,255,255,0.14); text-align:center;">
                            <h4 style="margin:0 0 8px; letter-spacing:.08em; color:#22d3ee;">${_t('wg.donate.title', 'KEEP IT FREE — FOREVER')}</h4>
                            <p style="margin:0 0 14px; opacity:.9;">${_t('wg.donate.lore.3', 'If it brought you joy and you\'re <i>able</i> to give, a small donation helps keep it free for the next traveler. It is <b>never</b> expected — the game is yours either way.')}</p>
                            <div class="wg-donate">
                                <a class="wg-donate-btn" target="_blank" rel="noopener noreferrer" href="${DONATE_HREF}">
                                    <i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i> ${_t('wg.donate.btn', 'Donate via PayPal')}
                                </a>
                                <p class="wg-donate-email">${_t('wg.donate.email_pre', '…or send directly to')} <b>${DONATE_EMAIL}</b></p>
                            </div>
                        </div>` : ''}
                    </div>
                    <footer class="wg-tc-inline-nav" style="flex-direction: column; gap: 14px; align-items: stretch; flex-shrink: 0;">
                        <label class="wg-tc-row" for="wg-tc-checkbox-inline" style="justify-content: center;">
                            <input type="checkbox" id="wg-tc-checkbox-inline" />
                            <span style="white-space: nowrap;">${_t('wg.cover.tc_agree', 'I agree to the')} <a style="pointer-events: none;">${_t('wg.tc.link', 'Terms &amp; Conditions')}</a></span>
                        </label>

                    </footer>
                </section>
            </div>`;

        // ─── SPREAD 1 — CHOOSE YOUR ROLE ─── [REF#UI-01102]
        const role_L = `
            <div class="wg-page-pad">
                <h2 class="wg-page-title">${_t('wg.role.title', 'CHOOSE YOUR ROLE')}</h2>
                <p class="wg-page-sub">${_t('wg.role.sub', 'Each role rolls a starting loadout.')}</p>
                <div class="wg-role-grid wg-roster" role="radiogroup" aria-label="Choose your hero role">${roleCards_L}</div>
            </div>`;
        const role_R = `
            <div class="wg-page-pad">
                <h2 class="wg-page-title" aria-hidden="true" style="visibility:hidden;">&middot;</h2>
                <p class="wg-page-sub" aria-hidden="true" style="visibility:hidden;">&middot;</p>
                <div class="wg-role-grid wg-roster" role="radiogroup" aria-label="More hero roles">${roleCards_R}</div>
            </div>`;

        // ─── SPREAD 2 — RESTORE: saves list (page 5) + preview (page 6) ─── [REF#UI-01103]
        // Page 5: scrollable saves list. Click a row to preview.
        // Page 6: preview pane (floor / role / HP / when) + RESTORE CTA.
        // Both panes update from _renderSavesList() + _previewSave() after
        // the SAVE_LIST message lands.
        const saves_L = `
            <div class="wg-page-pad wg-saves-left">
                <h2 class="wg-page-title">${_t('wg.save.title', 'SAVE &amp; RESTORE')}</h2>
                <p class="wg-page-sub">${_t('wg.restore.sub', 'Pick a save · or skip and start fresh.')}</p>
                <div id="wg-saves-list" class="wg-saves-list" role="listbox" aria-label="Saved games">
                    <div class="wg-saves-empty">${_t('wg.restore.reading', 'Reading saves&hellip;')}</div>
                </div>
                <button type="button" id="wg-save-current-btn" class="wg-restore-btn wg-save-current-btn">
                    <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
                    ${_t('wg.save.current', 'SAVE CURRENT GAME')}
                </button>
            </div>`;
        const saves_R = `
            <div class="wg-page-pad wg-saves-right">
                <h3 class="wg-page-h3">${_t('wg.restore.preview_h', 'Save Preview')}</h3>
                <div id="wg-save-preview" class="wg-save-preview wg-save-preview-empty" aria-live="polite">
                    <div class="wg-spv-placeholder">
                        <div class="wg-spv-icon" aria-hidden="true">
                            <i class="fa-solid fa-bone"></i>
                        </div>
                        <p class="wg-spv-hint">${_t('wg.restore.preview_hint', 'Click a save on the left to preview its floor, role, and HP. Or hit <b>PLAY GAME</b> below to start a fresh run with the role you picked.')}</p>
                    </div>
                </div>
                <div class="wg-saves-actions">
                    <button type="button" id="wg-restore-btn" class="wg-restore-btn" disabled>
                        <i class="fa-solid fa-bone" aria-hidden="true"></i>
                        ${_t('wg.restore.btn', 'RESTORE THIS SAVE')}
                    </button>
                    <button type="button" id="wg-delete-save-btn" class="wg-restore-btn" disabled aria-label="${_t('wg.restore.delete_aria', 'Delete the selected save')}">
                        <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                        ${_t('wg.restore.delete', 'DELETE')}
                    </button>
                </div>
            </div>`;

        // ─── SPREAD 3 — MONSTER DATABASE (pages 7-8) ─── [REF#UI-01104]
        // LEFT (page 7): endless-scroll bestiary + filter pills
        //   (Alphabetical + By-Level). RIGHT (page 8): selected monster's
        //   live 3D preview, stat dashboard, and the clip→action editor.
        // Rows + dashboard reuse the saves-list / stat-card visual language.
        const monster_L = `
            <div class="wg-page-pad wg-mdb-left">
                <h2 class="wg-page-title">${_t('wg.monster.title', 'MONSTER CODEX')}</h2>
                <p class="wg-page-sub">${_t('wg.monster.sub', 'Central design DB · every monster GLB.')}</p>
                <div class="wg-filter-pills" role="tablist" aria-label="Filter monsters">
                    <button type="button" class="wg-pill active" role="tab" data-filter="all" aria-selected="true">${_t('wg.monster.filter_az', 'A–Z')}</button>
                    <button type="button" class="wg-pill" role="tab" data-filter="1">F1</button>
                    <button type="button" class="wg-pill" role="tab" data-filter="2">F2</button>
                    <button type="button" class="wg-pill" role="tab" data-filter="3">F3</button>
                    <button type="button" class="wg-pill" role="tab" data-filter="4">F4</button>
                    <button type="button" class="wg-pill" role="tab" data-filter="5">F5</button>
                    <button type="button" class="wg-pill" role="tab" data-filter="6">F6</button>
                    <button type="button" class="wg-pill" role="tab" data-filter="7">F7</button>
                </div>
                <!-- CODEX LAYOUT (Mark 2026-07-19): "the monster portrait will [be] on left side of screen, [REF#UI-01105]
                     the width of the monster list will be on the other half of same left side but 50% width
                     reduced to house the animation, so all the attributes can be on right side."
                     Portrait LEFT + list RIGHT of it, both on this page; the whole right page is attributes. -->
                <div class="wg-mdb-split">
                    <div class="wg-mdb-portrait">
                        <div class="wg-mdb-preview-wrap wg-mdb-preview-sm">
                            <canvas id="wg-monster-preview" class="wg-mdb-preview" aria-label="3D monster preview"></canvas>
                            <span class="wg-mdb-preview-tag" id="wg-mon-archetype"></span>
                            <!-- ZOOM, ON HOVER (Mark 2026-08-05: "the 3dmodels i need to see them - a lot of [REF#UI-01106]
                                 times they are off screen or too zoomed, have a zoom in and out that comes out
                                 when hover on the 3d model"). Hidden until the pointer is over the canvas so it
                                 never sits on top of the model it exists to reveal. FIT re-frames from the
                                 bounding sphere, i.e. undoes both a bad zoom AND any drift. -->
                            <div class="wg-mdb-zoom" id="wg-mon-zoom" aria-label="Model zoom">
                                <button type="button" class="wg-zoom-btn" data-zoom="in"  title="Zoom in"      aria-label="Zoom in">＋</button>
                                <button type="button" class="wg-zoom-btn" data-zoom="fit" title="Fit the whole monster in frame" aria-label="Fit to frame">⤢</button>
                                <button type="button" class="wg-zoom-btn" data-zoom="out" title="Zoom out"     aria-label="Zoom out">－</button>
                            </div>
                        </div>
                        <div class="wg-mdb-nowplaying" id="wg-mon-nowplaying" aria-live="polite"></div>
                        <div class="wg-mdb-spinrow">
                            <button type="button" class="wg-mini-btn" id="wg-mon-spin" title="Pause / resume the turntable">⟳ SPIN</button>
                            <button type="button" class="wg-mini-btn" id="wg-mon-replay" title="Replay the clip that is playing">▶ REPLAY</button>
                        </div>
                    </div>
                    <div id="wg-monster-scroller" class="wg-saves-list wg-mdb-scroller" role="listbox" aria-label="Monsters">
                        <!-- filled by _renderMonsterList() [REF#UI-01107] -->
                    </div>
                </div>
            </div>`;
        const monster_R = `
            <div class="wg-page-pad wg-mdb-right">
                <h3 class="wg-page-h3" id="wg-mon-title">${_t('wg.monster.select', 'Select a monster')}</h3>
                <div class="wg-codex-tabs" role="tablist" aria-label="Monster settings sections">
                    <button type="button" class="wg-codex-tab active" role="tab" aria-selected="true" data-codex-tab="anim">${_t('wg.monster.tab_anim', 'ANIMATIONS')}</button>
                    <button type="button" class="wg-codex-tab" role="tab" aria-selected="false" data-codex-tab="attr">${_t('wg.monster.tab_attr', 'ATTRIBUTES')}</button>
                    <button type="button" class="wg-codex-tab" role="tab" aria-selected="false" data-codex-tab="sfx">${_t('wg.monster.tab_sfx', 'SOUND FX')}</button>
                </div>

                <section class="wg-codex-panel active" data-codex-panel="anim">
                    <div class="wg-editor">
                        <div class="wg-editor-head">${_t('wg.monster.clip_editor', 'CLIP → ACTION EDITOR')}</div>
                        <div id="wg-clip-rows" class="wg-clip-rows"></div>
                        <label class="wg-clip-notes-row">
                            <span>${_t('wg.monster.designer_note', 'Designer note')}</span>
                            <input type="text" id="wg-clip-notes" class="wg-clip-input" placeholder="${_t('wg.monster.clip_placeholder', 'why this clip mapping…')}" />
                        </label>
                    </div>
                </section>

                <section class="wg-codex-panel" data-codex-panel="attr">
                    <div class="wg-stat-row" aria-label="Monster stats">
                        <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.monster.stat.hp', 'HP')}</span><b class="wg-stat-v" id="wg-mon-hp">—</b></div>
                        <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.monster.stat.scale', 'Scale')}</span><b class="wg-stat-v" id="wg-mon-scale">—</b></div>
                        <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.monster.stat.weapon', 'Weapon')}</span><b class="wg-stat-v" id="wg-mon-weapon">—</b></div>
                    </div>
                    <div class="wg-vuln-strip" id="wg-mon-vuln" aria-label="Element vulnerabilities"></div>
                    <div class="wg-editor">
                        <div class="wg-editor-head">${_t('wg.monster.glb_info', 'MODEL / GLB')}</div>
                        <div id="wg-mon-glb" class="wg-kv-rows"></div>
                        <div class="wg-editor-head" style="margin-top:8px;">${_t('wg.monster.combat_attrs', 'COMBAT ATTRIBUTES')}</div>
                        <div id="wg-mon-attrs" class="wg-kv-rows"></div>
                        <div class="wg-editor-head" style="margin-top:8px;">${_t('wg.monster.ai_tuning', 'AI BEHAVIOR TUNING')}</div>
                        <div id="wg-ai-rows" style="display: flex; flex-direction: column; gap: 5px;"></div>
                        <p class="wg-editor-foot" id="wg-mon-note"></p>
                    </div>
                </section>

                <section class="wg-codex-panel" data-codex-panel="sfx">
                    <div class="wg-editor">
                        <div class="wg-editor-head">${_t('wg.monster.voice', 'THIS MONSTER — VOICE / SFX')}</div>
                        <div id="wg-sound-rows" class="wg-sound-rows"></div>
                        <div class="wg-editor-head" style="margin-top:8px;">${_t('wg.monster.gamble_sfx', 'GAMBLING RESULTS & UNMAPPED FILES')}</div>
                        <div id="wg-gamble-sfx" class="wg-sfx-list"></div>
                    </div>
                </section>
                <!-- SAVE (Mark 2026-08-05: "for monster settings have a SAVE button so I know you [REF#UI-01108]
                     keep the changes and updates made"). The settings ALREADY persist on every edit —
                     but "it saved silently" and "it did not save" look identical, and this page has a
                     documented history of dead controls, so silence is not good enough. The button
                     writes and then SAYS what it wrote, with a timestamp. -->
                <!-- under all three tabs since 2026-10-02 (it sat inside ATTRIBUTES only, out of sight of the animation and sound editors) [REF#UI-01492] -->
                <div class="wg-save-row wg-mon-save-row">
                    <button type="button" class="wg-save-btn" id="wg-mon-save"
                            title="Keep every monster setting on this page — animations, always-violent, sounds, AI tuning — as what loads next time">💾 SAVE SETTINGS</button>
                    <span class="wg-save-note" id="wg-mon-save-note" aria-live="polite"></span>
                </div>
            </div>`;

        // ─── SPREAD 4 — PLAYER AVATAR DATABASE (pages 9-10) ─── [REF#UI-01109]
        // LEFT (page 9): the two player rigs as selectable cards (same
        //   central DB pattern as monsters). RIGHT (page 10): live 3D rig
        //   preview + coded outfit designs + the role lineup it fronts.
        const avatarCards = this.avatarDB.map(a => `
            <button type="button" class="wg-save-row wg-avatar-row" role="option"
                    data-avatar-id="${a.id}" style="border-left-color:${a.accent};">
                <span class="wg-sr-floor" style="color:${a.accent};background:${a.accent}22;text-shadow:0 0 6px ${a.accent}55;">${a.kanji}</span>
                <span class="wg-sr-body">
                    <span class="wg-sr-name">${a.display}</span>
                    <span class="wg-sr-meta">${a.isLiveRig ? _t('wg.avatar.live_rig', 'LIVE RIG') : _t('wg.avatar.on_disk', 'ON DISK')} · scale ${a.scale}</span>
                </span>
            </button>`).join('');
        const avatar_L = `
            <div class="wg-page-pad wg-mdb-left">
                <h2 class="wg-page-title">${_t('wg.avatar.title', 'PLAYER AVATARS')}</h2>
                <p class="wg-page-sub">${_t('wg.avatar.sub', 'The two hero rigs &amp; their coded designs.')}</p>
                <div id="wg-avatar-list" class="wg-saves-list wg-mdb-scroller" role="listbox" aria-label="Player avatars">
                    ${avatarCards}
                </div>
            </div>`;
        const avatar_R = `
            <div class="wg-page-pad wg-mdb-right">
                <h3 class="wg-page-h3" id="wg-av-title">${_t('wg.avatar.select', 'Select an avatar')}</h3>
                <div class="wg-mdb-preview-wrap">
                    <canvas id="wg-avatar-preview" class="wg-mdb-preview" aria-label="3D avatar preview"></canvas>
                    <span class="wg-mdb-preview-tag" id="wg-av-rigtag"></span>
                </div>
                <div class="wg-stat-row" aria-label="Avatar info">
                    <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.avatar.stat.model', 'Model')}</span><b class="wg-stat-v" id="wg-av-model">—</b></div>
                    <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.avatar.stat.scale', 'Scale')}</span><b class="wg-stat-v" id="wg-av-scale">—</b></div>
                    <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.avatar.stat.roles', 'Roles')}</span><b class="wg-stat-v" id="wg-av-rolecount">—</b></div>
                </div>
                <div class="wg-av-section">
                    <div class="wg-editor-head">${_t('wg.avatar.coded_designs', 'CODED DESIGNS')}</div>
                    <ul class="wg-av-designs" id="wg-av-designs"></ul>
                </div>
                <div class="wg-av-section">
                    <div class="wg-editor-head">${_t('wg.avatar.fronts_roles', 'FRONTS THESE ROLES')}</div>
                    <div class="wg-av-roles" id="wg-av-roles"></div>
                </div>
                <p class="wg-editor-foot" id="wg-av-note"></p>
            </div>`;

        // ─── SPREAD 5 — CHARACTER: avatar + live stats (pages 11-12) ─── [REF#UI-01110]
        // LEFT (page 11): the player's avatar (live 3D rig preview, same
        //   shared engine as the avatar DB) + identity line. RIGHT (page 12):
        //   the live stat block read straight from the action-rail HUD DOM
        //   (#player-* / #attr-*), so the numbers always match the game.
        const char_L = `
            <div class="wg-page-pad wg-mdb-left">
                <h2 class="wg-page-title">${_t('wg.char.title', 'CHARACTER')}</h2>
                <p class="wg-page-sub">${_t('wg.char.sub', 'Your hero &mdash; live avatar &amp; sheet.')}</p>
                <div class="wg-mdb-preview-wrap wg-char-portrait">
                    <canvas id="wg-char-preview" class="wg-mdb-preview" aria-label="3D player avatar"></canvas>
                    <span class="wg-mdb-preview-tag" id="wg-char-rigtag">${_t('wg.char.hero_tag', 'HERO')}</span>
                </div>
                <div class="wg-char-id">
                    <span class="wg-char-kanji" id="wg-char-kanji" aria-hidden="true">勇</span>
                    <span class="wg-char-name" id="wg-char-role">${_t('wg.char.adventurer', 'ADVENTURER')}</span>
                </div>
            </div>`;
        const char_R = `
            <div class="wg-page-pad wg-mdb-right">
                <h3 class="wg-page-h3">${_t('wg.char.stats_h', 'Stats')}</h3>
                <div class="wg-stat-row" aria-label="Vitals">
                    <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.char.stat.level', 'Level')}</span><b class="wg-stat-v" id="wg-cs-level">1</b></div>
                    <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.char.stat.hp', 'HP')}</span><b class="wg-stat-v" id="wg-cs-hp">—</b></div>
                    <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.char.stat.gold', 'Gold')}</span><b class="wg-stat-v" id="wg-cs-gold">0</b></div>
                </div>
                <div class="wg-stat-row" aria-label="More vitals">
                    <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.char.stat.xp', 'XP')}</span><b class="wg-stat-v" id="wg-cs-xp">0</b></div>
                    <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.char.stat.skill', 'Skill Pts')}</span><b class="wg-stat-v" id="wg-cs-skill">0</b></div>
                    <div class="wg-stat-card"><span class="wg-stat-k">${_t('wg.char.stat.armor', 'Armor')}</span><b class="wg-stat-v" id="wg-cs-ac">10</b></div>
                </div>
                <div class="wg-av-section">
                    <div class="wg-editor-head">${_t('wg.char.ability_scores', 'ABILITY SCORES')}</div>
                    <div class="wg-attr-grid" id="wg-attr-grid" aria-label="Ability scores"></div>
                </div>
                <div class="wg-av-section">
                    <div class="wg-editor-head">${_t('wg.char.equipped', 'EQUIPPED')}</div>
                    <ul class="wg-av-designs" id="wg-cs-equipped"></ul>
                </div>
                <p class="wg-editor-foot" id="wg-cs-note">${_t('wg.char.note', 'Equip gear on the next page to raise your Armor.')}</p>
            </div>`;

        // ─── SPREAD 6 — EQUIPMENT: body slots + draggable item list ─── [REF#UI-01111]
        // LEFT (page 13): the player's item list (drag sources). RIGHT (page 14):
        //   the 8 body slots with the vector isometric mannequin. Drag an item
        //   right to equip it onto the mannequin/slots.
        const slotsHtml = this.EQUIP_SLOTS.map(s => `
            <div class="wg-slot" data-slot="${s.id}" aria-label="${s.label} slot — ${_t('wg.equip.empty_slot', 'empty')}"
                 role="button" tabindex="0">
                <span class="wg-slot-label"><i class="fa-solid ${s.icon}" aria-hidden="true"></i> ${s.label}</span>
                <span class="wg-slot-body" data-empty="true">
                    <span class="wg-slot-empty">${_t('wg.equip.empty_slot', 'empty')}</span>
                </span>
            </div>`).join('');
        const equip_L = `
            <div class="wg-page-pad wg-mdb-left">
                <h2 class="wg-page-title">${_t('wg.equip.items_h', 'INVENTORY')}</h2>
                <p class="wg-page-sub wg-equip-hint">${_t('wg.equip.hint4', 'Tap or drag a card to use it.')}</p>
                <!-- ONE LIST, EVERYTHING (Mark 2026-09-20: "left page needs to be all the items"): MELEE · RANGED · ARMOUR · ITEMS [REF#UI-01403]
                     groups, every card draggable; weapons drop on the figure's hand slots, armour on its body slots. The old
                     separate PRIMARY WEAPON strip is folded in (its tap-to-set-auto behaviour kept: _setPrimaryWeapon). -->
                <div id="wg-item-list" class="wg-saves-list wg-mdb-scroller wg-item-list wg-item-list-all"
                     role="listbox" aria-label="Everything you carry"
                     data-droptarget="unequip">
                    <!-- filled by _renderEquipment() [REF#UI-01113] -->
                </div>
                <div id="wg-primary-weapon" hidden></div>
            </div>`;
        const equip_R = `
            <div class="wg-page-pad wg-mdb-right">
                <!-- THE BODY IS THE LAYOUT (Mark 2026-09-20: "remove all that text above the cards - its stupid and ugly and makes [REF#UI-01404]
                     no sense. have the slots shape like a body remove the stupid hologram image"). No title, no hint, no ratings
                     row, no figure: the ten slots sit in a grid whose areas ARE a body — head, neck, hands either side of the
                     chest, arms/rings beside the body, legs, boots (CSS .wg-body-grid). ⛔ SUPERSEDED same day: the 3/4
                     isometric samurai SVG + the ratings pills + the "your hands, then your body" line. Ratings still print
                     in the note under the grid (Armor · Weight); _renderRatings no-ops without its pills. -->
                <h2 class="wg-page-title">${_t('wg.equip.body', 'YOUR GEAR')}</h2>
                <p class="wg-page-sub">${_t('wg.equip.easy', 'Tap bag items to put on. Tap worn gear to take off.')}</p>
                <div class="wg-equip-interactive-area">
                    <svg class="wg-gear-figure" viewBox="0 0 100 240" aria-hidden="true" focusable="false"><ellipse cx="50" cy="226" rx="38" ry="10" fill="#8b5cf622"/><g stroke="#b3a2ce" stroke-width="1.2" stroke-linejoin="round"><path d="M27 23 51 10 74 27 68 60 47 71 27 53Z" fill="#423a56"/><path d="m51 10-4 61 27-44Z" fill="#746784"/><path d="m47 71-23 10-9 68 22 12 28-3 17-20-13-65Z" fill="#302b40"/><path d="m47 71-10 90 28-3 4-85Z" fill="#665875"/><path d="m24 81-14 15-8 61 13 10 15-53Z" fill="#50465f"/><path d="m69 73 20 19 9 54-15 12-15-45Z" fill="#83728d"/><path d="m37 161-13 52 19 8 13-62Z" fill="#4d435f"/><path d="m56 159-1 58 18 5 1-64Z" fill="#776486"/><path d="m24 213-13 9 32 6v-7Zm31 4-5 12 29 2-6-9Z" fill="#262333"/></g></svg>
                    <div class="wg-body-grid" id="wg-slot-grid" aria-label="Equipment slots">
                    <div class="wg-slot wg-weapon-slot wg-weapon-slot-melee" data-slot="MELEE" role="button" tabindex="0" aria-label="Melee weapon slot">
                        <span class="wg-slot-label"><i class="fa-solid fa-hand-fist" aria-hidden="true"></i> Melee</span>
                        <span class="wg-slot-body" data-empty="true"><span class="wg-slot-empty">${_t('wg.equip.empty_slot', 'empty')}</span></span>
                    </div>
                    <div class="wg-slot wg-weapon-slot wg-weapon-slot-ranged" data-slot="RANGED" role="button" tabindex="0" aria-label="Ranged weapon slot">
                        <span class="wg-slot-label"><i class="fa-solid fa-bullseye" aria-hidden="true"></i> Ranged</span>
                        <span class="wg-slot-body" data-empty="true"><span class="wg-slot-empty">${_t('wg.equip.empty_slot', 'empty')}</span></span>
                    </div>
                        ${slotsHtml}
                    </div>
                </div>
                <p class="wg-editor-foot" id="wg-equip-note" style="margin-top: 8px;"></p>
            </div>`;

        // ─── SPREAD 7 — DONATION / THANK-YOU (grafted 2026-06-09) ─── [REF#UI-01127]
        // Freeware mission page. Reuses the cover's arc/logo/haiku/lore classes.
        // DONATE_EMAIL / DONATE_HREF are declared above the cover — see the note there (the Terms panel links
        // to the same address, and it renders earlier in this scope).
        const donate_L = `
            <div class="wg-cover-left">
                <svg class="wg-arc" viewBox="0 0 600 160" aria-hidden="true">
                    <defs><path id="wg-arc-thanks" d="M 50,140 A 480,480 0 0 1 550,140" fill="none"/></defs>
                    <text class="wg-arc-wordmark"><textPath href="#wg-arc-thanks" startOffset="50%" text-anchor="middle">${_t('wg.donate.thanks_arc', 'THANK YOU, TRAVELER')}</textPath></text>
                </svg>
                <div class="wg-logo-wrap">
                    <img class="wg-logo" src="assets/brand/icons/Origami_Underworld_Rock_Opera_Logo.png" alt="Origami Underworld — A Dark Fantasy Rock Opera RPG" decoding="async" loading="lazy" />
                </div>
                <div class="wg-haiku" aria-label="Gratitude haiku">
                    <p>${_t('wg.donate.haiku.1', 'Free to all who fold,')}</p>
                    <p>${_t('wg.donate.haiku.2', 'No coin demanded at the gate&mdash;')}</p>
                    <p>${_t('wg.donate.haiku.3', 'Pay it on, kind soul.')}</p>
                    <p class="wg-haiku-kanji" aria-hidden="true" lang="ja">${_t('wg.donate.haiku_kanji', '感謝 — 無料の贈り物')}</p>
                </div>
            </div>`;
        const donate_R = `
            <div class="wg-page-pad wg-cover-right">
                <h2 class="wg-page-title">${_t('wg.donate.title', 'KEEP IT FREE — FOREVER')}</h2>
                <div class="wg-lore">
                    <p>${_t('wg.donate.lore.1', 'Origami Underworld is — and always will be — <b>free</b>. A gift in the spirit of 1980s freeware, for every kid and every traveler, especially those who could never pay.')}</p>
                    <p>${_t('wg.donate.lore.2', 'No store. No subscription. No ads. No paywall. Just the game.')}</p>
                    <p>${_t('wg.donate.lore.3', 'If it brought you joy and you\'re <i>able</i> to give, a small donation helps keep it free for the next traveler. It is <b>never</b> expected — the game is yours either way.')}</p>
                </div>
                ${DONATE_HREF ? `<div class="wg-donate">
                    <a class="wg-donate-btn" target="_blank" rel="noopener noreferrer" href="${DONATE_HREF}">
                        <i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i> ${_t('wg.donate.btn', 'Donate via PayPal')}
                    </a>
                    <p class="wg-donate-email">${_t('wg.donate.email_pre', '…or send directly to')} <b>${DONATE_EMAIL}</b></p>
                </div>` : ''}
                <p class="wg-lore-warn">${_t('wg.donate.outro', 'Thank you for playing. Now go — Onibaba is waiting.')}</p>
            </div>`;

        // ─── SPREAD 8 — ORIGAMI SLOTS intro (opened by a DOUBLE-CLICK on a slot machine, Mark 2026-06-16) ─── [REF#UI-01128]
        // Read-only short intro for slot 1 (cabaret). The full interactive "click-to-play" + maximize page
        // lives in the walkup-panels spec §7.2.1 for a later build. Single-click the slot still spins it.
        const slots_L = `
            <div class="wg-page-pad wg-slots-page">
                <h2 class="wg-page-title wg-slots-title">${_t('wg.slots.title', 'ORIGAMI SLOTS')}</h2>
                <p class="wg-page-sub wg-slots-sub">${_t('wg.slots.sub', 'Welcome to our Gaming Path')}</p>
                <p class="wg-slots-hook">${_t('wg.slots.hook', 'Spin the reels &mdash; you can win <b>friends</b>, <b>loot</b>, and <b>gold</b>!')}</p>
                <ul class="wg-slots-prizes" aria-label="What you can win">
                    <li><span class="wg-prize-ic" aria-hidden="true">🪙</span><span class="wg-prize-tx"><b>${_t('wg.slots.win.gold', 'GOLD')}</b><i>${_t('wg.slots.win.gold.d', 'to spend around the dungeon')}</i></span></li>
                    <li><span class="wg-prize-ic" aria-hidden="true">🎁</span><span class="wg-prize-tx"><b>${_t('wg.slots.win.loot', 'LOOT')}</b><i>${_t('wg.slots.win.loot.d', 'cards &amp; treasures on a lucky spin')}</i></span></li>
                    <li><span class="wg-prize-ic" aria-hidden="true">🤝</span><span class="wg-prize-tx"><b>${_t('wg.slots.win.friends', 'FRIENDS')}</b><i>${_t('wg.slots.win.friends.d', 'win the goblins over')}</i></span></li>
                </ul>
                <p class="wg-slots-foot">${_t('wg.slots.foot', 'Every slot machine is different &mdash; find your favorites. Click one to spin its reels.')}</p>
            </div>`;
        const slots_R = `
            <div class="wg-page-pad wg-slots-page">
                <h2 class="wg-page-title" aria-hidden="true" style="visibility:hidden;">&middot;</h2>
                <div class="wg-slot-preview-wrap">
                    <canvas id="wg-slot-preview" class="wg-slot-preview-canvas" aria-label="3D slot machine — click to spin"></canvas>
                    <span class="wg-mdb-preview-tag" aria-hidden="true">🎰 SLOTS</span>
                </div>
                <button type="button" id="wg-slot-spin-btn" class="wg-restore-btn wg-slot-spin-btn">
                    <i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> ${_t('wg.slots.spin', 'PULL THE LEVER')}
                </button>
                <p class="wg-slots-coming">${_t('wg.slots.right.2', 'More games coming: 🎰 Slots &middot; 🃏 Poker &middot; ♠ Blackjack')}</p>
            </div>`;

        // ─── SPREAD 9 — ROOMS (Mark 2026-06-18): DISCOVERED special rooms list (left) + the selected [REF#UI-01129]
        //     room's detail (right). Filled by _renderRoomsList()/_renderRoomDetail() on setSlide; rooms
        //     stay HIDDEN until discovered (first peaceful entry → openRoom(id)). Cabaret = first entry.
        const rooms_L = `
            <div class="wg-page-pad">
                <h2 class="wg-page-title">${_t('wg.rooms.title', 'ROOMS DISCOVERED')}</h2>
                <p class="wg-page-sub">${_t('wg.rooms.sub', 'Special places you have found on your descent.')}</p>
                <div id="wg-rooms-list" class="wg-rooms-list" role="list"></div>
            </div>`;
        const rooms_R = `
            <div class="wg-page-pad wg-cover-right">
                <div id="wg-room-detail" class="wg-room-detail"></div>
            </div>`;

        // ─── SPREAD 10 — WAGER (Mark 2026-06-19): stake (left) + a 3×3 grid of the player's LEARNED games [REF#UI-01130]
        //     (right). Pick a game → openWagerGame() → Spread 11 (the table). ───
        const wager_L = `
            <div class="wg-page-pad wg-wager-controls">
                <h2 class="wg-page-title">${_t('wg.wager.title', 'PLACE YOUR WAGER')}</h2>
                <p class="wg-page-sub">${_t('wg.wager.sub', 'Pick a game — the dealer is waiting. Set your stake, then win gold, karma, and loot.')}</p>
                <div class="wg-wager-stake">
                    <span class="wg-wager-stake-label">${_t('wg.wager.stake', 'STAKE')}</span>
                    <button type="button" id="wg-stake-dec" class="wg-stake-btn" aria-label="${_t('wg.wager.stake-down', 'Lower stake')}">−</button>
                    <span id="wg-wager-stake-val" class="wg-wager-stake-val">${(this._wagerStake || this._betFloor()).toLocaleString()}</span>
                    <span class="wg-wager-stake-g">G</span>
                    <button type="button" id="wg-stake-inc" class="wg-stake-btn" aria-label="${_t('wg.wager.stake-up', 'Raise stake')}">+</button>
                </div>
                <p class="wg-wager-note">${_t('wg.wager.note', 'Start broke — earn gold from the loot by the vending machine, then test your luck on the road to bigger casinos.')}</p>
            </div>`;
        // Spread A right — the 3×3 learned-games grid (filled by _renderWagerGrid on setSlide). [REF#UI-01131]
        const wagerGrid_R = `
            <div class="wg-page-pad wg-wager-grid-page">
                <h2 class="wg-page-title">${_t('wg.wager.games', 'YOUR GAMES')}</h2>
                <div id="wg-wager-grid" class="wg-wager-grid" role="group" aria-label="Wager games"></div>
            </div>`;
        // Spread B — selected game: instructions (left) + the live 3D felt table (right). [REF#UI-01132]
        const wagerGame_L = `
            <div class="wg-page-pad wg-wager-game-info">
                <div id="wg-wager-game-info"></div>
            </div>`;
        const wagerGame_R = `
            <div class="wg-page-pad wg-wager-stage">
                <div class="wg-wager-canvas-wrap">
                    <canvas id="wg-wager-canvas" class="wg-wager-canvas" tabindex="0" role="img" aria-label="${_t('wg.wager.canvasA11y', '3D wager table — drag to orbit, shift-drag or two fingers to pan, scroll or pinch to zoom')}"></canvas>
                    <div class="wg-cam-hint">${_t('wg.wager.camHint', 'drag to look · scroll to zoom · ⇧-drag to pan')}</div>
                    <div class="wg-cam-presets" role="group" aria-label="${_t('wg.wager.camPresets', 'Camera angle')}">
                        <button type="button" class="wg-cam-chip" data-preset="top"  title="${_t('wg.wager.camTop', 'Top view')}"   aria-label="${_t('wg.wager.camTop', 'Top view')}">⤓</button>
                        <button type="button" class="wg-cam-chip" data-preset="hero" title="${_t('wg.wager.camHero', 'Hero view')}"  aria-label="${_t('wg.wager.camHero', 'Hero view')}">◈</button>
                        <button type="button" class="wg-cam-chip" data-preset="side" title="${_t('wg.wager.camSide', 'Side view')}"  aria-label="${_t('wg.wager.camSide', 'Side view')}">◧</button>
                        <button type="button" class="wg-cam-chip wg-cam-reset" title="${_t('wg.wager.camReset', 'Reset view')}" aria-label="${_t('wg.wager.camReset', 'Reset view')}">⟳</button>
                    </div>
                </div>
            </div>`;

        return `
            <button type="button" class="wg-close-btn" aria-label="${_t('wg.nav.close', 'Close')}" title="${_t('wg.nav.close', 'Close')}">&times;</button>
            <!-- TEXT SIZE (Mark 2026-10-17): transparent − / + that show their edge on hover or keyboard focus; 44px targets (WCAG 2.5.5 AAA). [REF#UI-01523] -->
            <div class="wg-font-ctl" role="group" aria-label="${_t('wg.font.aria', 'Text size')}">
                <button type="button" class="wg-font-btn" data-font-step="-1" aria-label="${_t('wg.font.smaller', 'Smaller text')}" title="${_t('wg.font.smaller', 'Smaller text')}">A&minus;</button>
                <button type="button" class="wg-font-btn" data-font-step="1" aria-label="${_t('wg.font.larger', 'Larger text')}" title="${_t('wg.font.larger', 'Larger text')}">A+</button>
            </div>
            <div class="wg-gold-bar" aria-live="polite" aria-label="Your gold"><span class="wg-gold-amt"><span class="wg-gold-ic" aria-hidden="true">🪙</span><b class="wg-gold-num" id="wg-gold-num">0</b><span class="wg-gold-unit">${_t('wg.gold.unit', 'GOLD')}</span></span></div>
            <nav class="wg-tabs" role="tablist" aria-label="${_t('wg.tabs.aria', 'Guide sections')}">
                <!-- ⚙️ SETTINGS GROUP [REF#UI-01133] -->
                <!-- THE SETTINGS CATALOG (2026-10-02): Settings, then the three pages it files — Monsters (the bestiary with its animation [REF#UI-01493]
                     page), Colors (contrast) and Music (the music player, now a page of this book). Audio and Display stay in the catalog. -->
                <button type="button" class="wg-tab" data-tab-slide="${this.SETTINGS_HUB_SLIDE}" role="tab">${_t('wg.tab.settings', 'Settings')}</button>
                <button type="button" class="wg-tab" data-tab-slide="${this.SETUP_SLIDE}" role="tab">${_t('wg.tab.monsters', 'Monsters')}</button>
                <button type="button" class="wg-tab" data-tab-slide="${this.COLORS_SLIDE}" role="tab">${_t('wg.tab.colors', 'Colors')}</button>
                <button type="button" class="wg-tab" data-tab-slide="${this.MUSIC_SETTINGS_SLIDE}" role="tab">${_t('wg.tab.music', 'Music')}</button>
                <div class="wg-tab-divider"></div>

                <!-- 📚 REFERENCE GROUP [REF#UI-01134] -->
                <!-- ⛔ SUPERSEDED 2026-09-20 by Mark: "remove this weird world page ... the game can be totally accessed via our parser" — [REF#UI-01364]
                     the WORLD tab button is gone from the strip; spread 17 (_renderWorld) stays in the file, unreachable. Register entry
                     in Origami.RealityEngine.9.html. -->
                <button type="button" class="wg-tab" data-tab-slide="${this.GRAVEYARD_SLIDE}" role="tab">${_t('wg.tab.graveyard', 'Deaths')}</button>
                <button type="button" class="wg-tab" data-tab-slide="${this.ROOMS_SLIDE}" role="tab">${_t('wg.tab.rooms', 'Rooms')}</button>
                <button type="button" class="wg-tab" data-tab-slide="${this.EQUIP_SLIDE}" role="tab">${_t('wg.tab.inventory', 'Inventory')}</button>
                <button type="button" class="wg-tab" data-tab-slide="${this.SLOTS_SLIDE}" role="tab">${_t('wg.tab.slots', 'Slots')}</button>
                <button type="button" class="wg-tab" data-tab-slide="${this.WAGER_SLIDE}" role="tab">${_t('wg.tab.wager', 'Wager')}</button>
                <button type="button" class="wg-tab" data-tab-slide="${this.BARMENU_SLIDE}" role="tab">${_t('wg.tab.bar', 'Bar')}</button>
                <div class="wg-tab-divider"></div>

                <!-- ⚙️ SYSTEM GROUP [REF#UI-01135] -->
                <button type="button" class="wg-tab" data-tab-slide="0" role="tab">${_t('wg.tab.intro', 'Intro')}</button>
                <button type="button" class="wg-tab" data-tab-slide="${this.SAVES_SLIDE}" role="tab">${_t('wg.tab.saves', 'Saves')}</button>
            </nav>
            <div class="wg-stage">
                ${spread(0, cover_L,   cover_R,   { label: _t('wg.aria.title', 'Title') })}
                ${spread(1, role_L,    role_R,    { label: _t('wg.aria.choose_role', 'Choose your role') })}
                ${spread(2, saves_L,   saves_R,   { label: _t('wg.aria.restore', 'Restore saved game') })}
                ${spread(3, monster_L, monster_R, { label: _t('wg.aria.monster_db', 'Monster database') })}
                ${spread(4, avatar_L,  avatar_R,  { label: _t('wg.aria.avatar_db', 'Player avatar database') })}
                ${spread(5, char_L,    char_R,    { label: _t('wg.aria.character', 'Character sheet') })}
                ${spread(6, equip_L,   equip_R,   { label: _t('wg.aria.equipment', 'Equipment') })}
                ${spread(7, donate_L,  donate_R,  { label: _t('wg.aria.donate', 'Support — keep it free') })}
                ${spread(8, slots_L,   slots_R,   { label: _t('wg.aria.slots', 'Origami Slots') })}
                ${spread(9, rooms_L,   rooms_R,   { label: _t('wg.aria.rooms', 'Rooms discovered') })}
                ${spread(10, wager_L,      wagerGrid_R, { label: _t('wg.aria.wager', 'Place your wager') })}
                ${spread(11, wagerGame_L,  wagerGame_R, { label: _t('wg.aria.wager_game', 'Wager game table') })}
                ${spread(12,
                    `<div class="wg-page-pad"><h2 class="wg-page-title">🍶 ${_t('wg.bar.title', 'The Bar')}</h2><p class="wg-page-sub">${_t('wg.bar.sub', 'Work or a drink, friend — both pay.')}</p><div class="wg-lore"><p>${_t('wg.bar.flavor', 'The bartender wipes a glass down and waits for your order.')}</p></div></div>`,
                    `<div class="wg-page-pad wg-barmenu-page"><h2 class="wg-page-title">${_t('wg.bar.choose', 'What can I get you?')}</h2><button type="button" id="wg-bar-contract" class="wg-restore-btn wg-descend-btn">📦 ${_t('wg.bar.contract', 'Accept Contract Work')}</button><button type="button" id="wg-bar-quests" class="wg-restore-btn">⚔ Tavern Quests</button><div id="wg-tavern-quest-list" hidden aria-live="polite"></div><button type="button" id="wg-bar-sake" class="wg-restore-btn">🍶 ${_t('wg.bar.sake', 'Play Sake Tap')}</button></div>`,
                    { label: _t('wg.aria.bar', 'The Bar') })}

                <!-- SETTINGS HUB (spread 13) [REF#UI-01136] -->
                ${spread(13,
                    `<div class="wg-page-pad"><h2 class="wg-page-title">⚙️ ${_t('wg.settings.title', 'Settings')}</h2><p class="wg-page-sub">${_t('wg.settings.sub2', 'A catalog of everything you can change')}</p><div class="wg-lore"><p>${_t('wg.settings.flavor2', 'Pick a page on the right. Monsters, Colors and Music each have their own page in this book.')}</p></div></div>`,
                    `<div class="wg-page-pad wg-settings-page wg-settings-catalog"><h2 class="wg-page-title">${_t('wg.settings.catalog', 'Catalog')}</h2><button type="button" class="wg-settings-cta wg-cat-item" data-slide="${this.SETUP_SLIDE}"><span class="wg-cat-ic" aria-hidden="true">🐉</span><span class="wg-cat-txt"><b>${_t('wg.cat.monsters', 'Monsters')}</b><small>${_t('wg.cat.monsters.d', 'Every monster: its model, its animations, its sounds')}</small></span></button><button type="button" class="wg-settings-cta wg-cat-item" data-slide="${this.COLORS_SLIDE}"><span class="wg-cat-ic" aria-hidden="true">🎨</span><span class="wg-cat-txt"><b>${_t('wg.cat.colors', 'Colors')}</b><small>${_t('wg.cat.colors.d', 'High contrast for easier reading')}</small></span></button><button type="button" class="wg-settings-cta wg-cat-item" data-slide="${this.MUSIC_SETTINGS_SLIDE}"><span class="wg-cat-ic" aria-hidden="true">🎵</span><span class="wg-cat-txt"><b>${_t('wg.cat.music', 'Music')}</b><small>${_t('wg.cat.music.d', 'Every song you own: play one, or play them all')}</small></span></button><button type="button" class="wg-settings-cta wg-cat-item" data-slide="${this.AUDIO_SETTINGS_SLIDE}"><span class="wg-cat-ic" aria-hidden="true">🔊</span><span class="wg-cat-txt"><b>${_t('wg.cat.audio', 'Audio')}</b><small>${_t('wg.cat.audio.d', 'Sound effects and background music')}</small></span></button><button type="button" class="wg-settings-cta wg-cat-item" data-slide="${this.DISPLAY_SETTINGS_SLIDE}"><span class="wg-cat-ic" aria-hidden="true">🖥️</span><span class="wg-cat-txt"><b>${_t('wg.cat.display', 'Display')}</b><small>${_t('wg.cat.display.d', 'Motion, timing, reading and the minimap')}</small></span></button></div>`,
                    { label: _t('wg.aria.settings', 'Settings') })}

                <!-- MUSIC SETTINGS (spread 14) [REF#UI-01137] -->
                <!-- THE MUSIC PAGE (2026-10-02): setSlide mounts the music player and the song list over both pages of this spread [REF#UI-01494]
                     (window.openMusicPage('guide', slide)); the background-music switch that lived here is on the Audio page now. -->
                ${spread(14,
                    `<div class="wg-page-pad wg-music-pageholder"></div>`,
                    `<div class="wg-page-pad wg-music-pageholder"></div>`,
                    { label: _t('wg.aria.music', 'Music') })}

                <!-- AUDIO SETTINGS (spread 15) [REF#UI-01138] -->
                ${spread(15,
                    `<div class="wg-page-pad"><h2 class="wg-page-title">🔊 ${_t('wg.audio.title', 'Audio Settings')}</h2><p class="wg-page-sub">${_t('wg.audio.sub', 'Sound effects and volumes')}</p><div class="wg-lore"><p>${_t('wg.audio.flavor', 'Configure sound effects for monsters and gameplay.')}</p></div></div>`,
                    `<div class="wg-page-pad wg-audio-settings-page"><h2 class="wg-page-title">${_t('wg.audio.controls', 'Sound Effects')}</h2>
                     <div class="wg-a11y-row"><label class="wg-a11y-label" for="wg-sfx-vol">${_t('wg.audio.sfxvol', 'Sound effects volume')}</label>
                       <input type="range" id="wg-sfx-vol" class="wg-a11y-range" min="0" max="100" step="5" value="100" aria-describedby="wg-sfx-vol-val">
                       <output id="wg-sfx-vol-val" class="wg-a11y-out" for="wg-sfx-vol">100%</output></div>
                     <p class="wg-a11y-hint">${_t('wg.audio.sfxhint', 'Scales every sound effect — footsteps, impacts, monsters. Music has its own control on the Music page.')}</p>
                     <h3 class="wg-a11y-sub">${_t('wg.music.controls', 'Background Music')}</h3>
                     <div class="wg-music-control"><label class="wg-music-toggle-label"><input type="checkbox" id="wg-bg-music-enable" class="wg-music-toggle" /><span>${_t('wg.music.enable', 'Enable background music')}</span></label><p class="wg-music-hint">${_t('wg.music.hint', 'Songs rotate in the cabaret')}</p></div></div>`,
                    { label: _t('wg.aria.audio', 'Audio Settings') })}

                <!-- DISPLAY SETTINGS (spread 16) [REF#UI-01139] -->
                ${spread(16,
                    `<div class="wg-page-pad"><h2 class="wg-page-title">🎨 ${_t('wg.display.title', 'Display Settings')}</h2><p class="wg-page-sub">${_t('wg.display.sub', 'Visual preferences')}</p><div class="wg-lore"><p>${_t('wg.display.flavor', 'Adjust the look and feel of the interface.')}</p></div></div>`,
                    `<div class="wg-page-pad wg-display-settings-page"><h2 class="wg-page-title">${_t('wg.display.controls', 'Display Options')}</h2>
                     <div class="wg-a11y-row"><label class="wg-a11y-check"><input type="checkbox" id="wg-reduced-motion"><span>${_t('wg.display.reducedmotion', 'Reduce motion')}</span></label></div>
                     <p class="wg-a11y-hint">${_t('wg.display.rmhint', 'Calms animated flourishes in the interface. Follows your system setting until you change it here.')}</p>
                     <div class="wg-a11y-row"><label class="wg-a11y-check"><input type="checkbox" id="wg-relax-timing"><span>${_t('wg.display.relaxtiming', 'Relax timing')}</span></label></div>
                     <p class="wg-a11y-hint">${_t('wg.display.rthint', 'Menus and pickers stop closing themselves while you think. Recommended for switch access and screen readers.')}</p>
                     <div class="wg-a11y-row"><label class="wg-a11y-check"><input type="checkbox" id="wg-plain-text"><span>${_t('wg.display.plaintext', 'Plain language')}</span></label></div>
                     <p class="wg-a11y-hint">${_t('wg.display.pthint', 'Long or fancy text is swapped for short, simple words. The jokes stay.')}</p>
                     <div class="wg-a11y-row"><label class="wg-a11y-check"><input type="checkbox" id="wg-auto-attack"><span>${_t('wg.display.autoattack', 'Auto-attack')}</span></label></div>
                     <p class="wg-a11y-hint">${_t('wg.display.aahint', 'On: the Attack button arms the AI — fire, step back, repeat. Off: Attack is a single strike. Any key or card takes the wheel back either way.')}</p>
                     <div class="wg-a11y-row"><label class="wg-a11y-check"><input type="checkbox" id="wg-turn-mode"><span>${_t('wg.display.turnmode', 'Turn mode — the world waits for you')}</span></label></div>
                     <p class="wg-a11y-hint">${_t('wg.display.tmhint', 'Monsters and the clock move only while you move or act. Take as long as you like between turns. The P key switches it on and off in the game.')}</p>
                     <div class="wg-a11y-row"><label class="wg-a11y-check"><input type="checkbox" id="wg-reading"><span>${_t('wg.display.reading', 'Comfortable reading')}</span></label></div>
                     <p class="wg-a11y-hint">${_t('wg.display.rdhint', 'Guidebook text gets more space between lines and paragraphs, and lines stay short enough to follow.')}</p>
                     <div class="wg-a11y-row"><label class="wg-a11y-check"><input type="checkbox" id="wg-single-keys"><span>${_t('wg.display.singlekeys', 'Single-key shortcuts')}</span></label></div>
                     <p class="wg-a11y-hint">${_t('wg.display.skhint', 'Letter keys like M, V, R, E and P act on their own. Switch this off if you use speech input or your hands sometimes press keys by accident — arrow keys, Enter, Escape and the F-keys still work.')}</p>
                     <h3 class="wg-a11y-sub">${_t('wg.display.minimap', 'Minimap')}</h3>
                     <p class="wg-a11y-hint">${_t('wg.display.mmhint', 'The same zoom and view buttons as the round map in the corner, at full size.')}</p>
                     <div class="wg-a11y-row wg-minimap-row" role="group" aria-label="${_t('wg.display.minimap', 'Minimap')}">
                       <button type="button" class="wg-mm-btn wg-mm-zoom" data-mm="zoom-in" aria-label="${_t('wg.display.mmzoomin', 'Minimap zoom in')}">＋</button>
                       <button type="button" class="wg-mm-btn wg-mm-zoom" data-mm="zoom-out" aria-label="${_t('wg.display.mmzoomout', 'Minimap zoom out')}">－</button>
                       <button type="button" class="wg-mm-btn wg-mm-view" data-mm="iso">${_t('wg.display.mmiso', 'Isometric')}</button>
                       <button type="button" class="wg-mm-btn wg-mm-view" data-mm="flat">${_t('wg.display.mmflat', 'Top-down')}</button>
                       <button type="button" class="wg-mm-btn wg-mm-view" data-mm="high">${_t('wg.display.mmhigh', 'High angle')}</button>
                       <button type="button" class="wg-mm-btn wg-mm-view" data-mm="low">${_t('wg.display.mmlow', 'Low angle')}</button>
                     </div></div>`,
                    { label: _t('wg.aria.display', 'Display Settings') })}

                <!-- WORLD (spread 17) — WCAG P4: accessible world browser. Left = rooms; right = the [REF#UI-01140]
                     selected room's objects with REAL action buttons. Content rendered by _renderWorld()
                     from live A11Y_RESULT data; every button posts the byte-identical FPV_CHAT_COMMAND a
                     typed command produces (probe-a11y-worldpage asserts payload equality). -->
                ${spread(17,
                    `<div class="wg-page-pad"><h2 class="wg-page-title">🗺️ ${_t('wg.world.title', 'The World')}</h2><p class="wg-page-sub">${_t('wg.world.sub', 'Everything around you, in words')}</p><div class="wg-lore"><p>${_t('wg.world.flavor', 'Pick a room, pick a thing, pick what to do with it — the same commands you can type in the chat box, as buttons.')}</p></div><button type="button" id="wg-world-refresh" class="wg-restore-btn">🔄 ${_t('wg.world.refresh', 'Refresh')}</button><div id="wg-world-rooms" class="wg-world-list" role="group" aria-label="${_t('wg.world.rooms_aria', 'Rooms on this floor')}"><p class="wg-world-empty">${_t('wg.world.loading', 'Reading the floor…')}</p></div></div>`,
                    `<div class="wg-page-pad"><h2 class="wg-page-title" id="wg-world-room-title">${_t('wg.world.pick', 'Pick a room')}</h2><p id="wg-world-desc" class="wg-world-desc" hidden></p><div id="wg-world-objects" class="wg-world-list" aria-live="polite"><p class="wg-world-empty">${_t('wg.world.pick_hint', 'Choose a room on the left page to list what is inside it.')}</p></div><div id="wg-world-reply" class="wg-world-reply" role="status" aria-live="polite" hidden></div></div>`,
                    { label: _t('wg.aria.world', 'World browser') })}

                <!-- WORDS / 用語集 (spread 18) — WCAG 3.1.3 Unusual Words · 3.1.4 Abbreviations · 3.1.6 Pronunciation (AAA, Mark [REF#UI-01348]
                     2026-09-12 "fix the last accessibility rows"). Every Japanese word the English guide shows gets its reading
                     (kana + romaji) and its meaning; every short form is spelled out; the words this game uses its own way are
                     explained. The jokes on the other pages stay exactly as written — this page only explains them. -->
                ${spread(18,
                    `<div class="wg-page-pad wg-gloss-page"><h2 class="wg-page-title">📖 ${_t('wg.gloss.title', 'Words')}</h2><p class="wg-page-sub">${_t('wg.gloss.sub', 'Every hard word in this book, explained — how to say it and what it means.')}</p>
                     <h3 class="wg-gloss-h">${_t('wg.gloss.h.ja', 'Japanese words')}</h3>
                     <dl class="wg-gloss">${this._glossaryJa()}</dl></div>`,
                    `<div class="wg-page-pad wg-gloss-page"><h2 class="wg-page-title">${_t('wg.gloss.h.abbr', 'Short forms')}</h2>
                     <dl class="wg-gloss">${this._glossaryAbbr()}</dl>
                     <h3 class="wg-gloss-h">${_t('wg.gloss.h.game', 'Words this game uses its own way')}</h3>
                     <dl class="wg-gloss">${this._glossaryGame()}</dl></div>`,
                    { label: _t('wg.aria.glossary', 'Words — glossary') })}

                <!-- 墓場 THE GRAVEYARD (spread 19) — Mark 2026-09-25: "add new graveyard path deaths panel, use a cookie to store [REF#PENDING] [REF#UI-01435]
                     the info so its not deleted", then "did you get the guidebook death page up?". The defeat modal shows the last
                     few graves at the moment of dying; THIS is where the whole path is kept and read at leisure. Both read the
                     same cookie (origami_graveyard, path=/, ten years) — ONE store, two windows onto it, so they can never
                     disagree about what happened. -->
                ${spread(19,
                    `<div class="wg-page-pad"><h2 class="wg-page-title">⚰️ ${_t('wg.gy.title', 'The Graveyard')}</h2>
                     <p class="wg-page-sub">${_t('wg.gy.sub', '墓場 — every run that ended, and what ended it.')}</p>
                     <div class="wg-lore"><p>${_t('wg.gy.flavor', 'The dungeon keeps its own record. These graves outlive a new game, a closed tab and a cleared save — they are written where the game cannot reach to tidy them away.')}</p></div>
                     <div id="wg-gy-stats" class="wg-gy-stats">${this._graveyardStats()}</div>
                     <button type="button" id="wg-gy-refresh" class="wg-restore-btn">🔄 ${_t('wg.gy.refresh', 'Refresh')}</button></div>`,
                    `<div class="wg-page-pad"><h2 class="wg-page-title">${_t('wg.gy.roll', 'The Roll')}</h2>
                     <div id="wg-gy-list" class="wg-gy-list" aria-live="polite">${this._graveyardRows()}</div></div>`,
                    { label: _t('wg.aria.graveyard', 'Graveyard — past deaths') })}

                <!-- COLORS (spread 20, 2026-10-02): the contrast switch. One pref, origami.a11y.contrast — system | normal | hc — stamped on [REF#UI-01495]
                     this frame's html by _applyContrast; the high-contrast skin itself is CSS in Origami.RealityEngine.Panels.html. -->
                ${spread(20,
                    `<div class="wg-page-pad"><h2 class="wg-page-title">🎨 ${_t('wg.colors.title', 'Colors')}</h2><p class="wg-page-sub">${_t('wg.colors.sub', 'See the game your way')}</p>
                     <div class="wg-lore"><p>${_t('wg.colors.flavor', 'High contrast turns every panel solid black with bright white words and clear white edges, so text and buttons are easier to read.')}</p></div>
                     <div class="wg-contrast-swatches" aria-hidden="true"><span class="wg-contrast-sw" style="color:#22c55e">GAMING</span><span class="wg-contrast-sw" style="color:#ff6e6e">HOSTILE</span><span class="wg-contrast-sw" style="color:#8aa0ff">SLEEPING</span><span class="wg-contrast-sw" style="color:#f0a830">WORKING</span></div></div>`,
                    `<div class="wg-page-pad wg-colors-page"><h2 class="wg-page-title">${_t('wg.colors.contrast', 'Contrast')}</h2>
                     <fieldset class="wg-contrast"><legend class="wg-sr-legend">${_t('wg.colors.contrast', 'Contrast')}</legend>
                       <label class="wg-contrast-opt"><input type="radio" name="wg-contrast" value="system"><span><b>${_t('wg.colors.system', 'System')}</b><small>${_t('wg.colors.system.d', 'Follow your device setting')}</small></span></label>
                       <label class="wg-contrast-opt"><input type="radio" name="wg-contrast" value="normal"><span><b>${_t('wg.colors.normal', 'Normal')}</b><small>${_t('wg.colors.normal.d', 'The game glass panels')}</small></span></label>
                       <label class="wg-contrast-opt"><input type="radio" name="wg-contrast" value="hc"><span><b>${_t('wg.colors.hc', 'High contrast')}</b><small>${_t('wg.colors.hc.d', 'Solid black, bright words, clear edges')}</small></span></label>
                     </fieldset>
                     <p class="wg-a11y-hint">${_t('wg.colors.hint', 'Changes the side panels, this book, the music player and the event log. The 3D world keeps its own colors.')}</p></div>`,
                    { label: _t('wg.aria.colors', 'Colors') })}
            </div>

            <footer class="wg-footer">
                <button type="button" class="wg-nav-btn wg-prev" aria-label="Previous slide">${_t('wg.nav.prev', '&larr; Prev')}</button>
                <div class="wg-footer-center">
                    <div class="wg-dots" role="tablist" aria-label="${_t('wg.dots.aria', 'Guide pages')}" hidden>${Array.from({ length: this.DOT_WINDOW }, (_, k) => `<button type="button" class="wg-dot" data-i="${k}" role="tab" aria-label="Page ${k + 1}"></button>`).join('')}</div>
                    <!-- ANSWER SURFACE. Sits directly above the relocated chat field because that is [REF#UI-01328]
                         where the person who just typed is looking. Empty and hidden until something is
                         ASKED FOR: nothing volunteers itself here. role=status + aria-live=polite so a
                         screen reader hears the answer without focus leaving the input. -->
                    <div id="wg-reply" class="wg-reply" role="status" aria-live="polite" hidden></div>
                    <div id="wg-footer-input-mount" class="wg-footer-input-mount"></div>
                </div>
                <button type="button" class="wg-nav-btn wg-next" aria-label="Next slide">${_t('wg.nav.next', 'Next &rarr;')}</button>
            </footer>
        `;
    }

    _css() {
        // Scoped under #welcome-guide-overlay so nothing leaks. Tokens match [REF#UI-01141]
        // the panels' dark-neumorphic system (.side-panel / .sp-btn).
        return `
            /* ROOMS section (Mark 2026-06-18) — discovered-rooms list (left) + room detail (right) [REF#UI-01142] */
            /* ── ROOMS PANEL (Mark 2026-07-19: "fade the other boxes, make them smaller, make the infobox with logo [REF#UI-01143]
               larger, only 3 slots at a time, and highlight the one active. move CTA OK- more up, never have it
               clipped it must show in every media web resolution.") ───────────────────────────────────────────── */
            #welcome-guide-overlay .wg-rooms-list { display: flex; flex-direction: column; gap: 7px; margin-top: 4px; overflow-y: auto; flex: 0 0 auto; }
            #welcome-guide-overlay .wg-room-box {
                display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; cursor: pointer;
                padding: 8px 11px; border-radius: 10px; color: #eaf7ff; font-family: 'Outfit','Inter',sans-serif;   /* 12/14 -> 8/11: smaller boxes leave room for the bigger info panel + the CTA */
                background: linear-gradient(180deg, rgba(34,211,238,0.06), rgba(0,0,0,0.18));
                border: 1px solid rgba(34,211,238,0.20);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.4);
                transition: transform .14s ease, border-color .18s ease, box-shadow .18s ease;
            }
            #welcome-guide-overlay .wg-room-box:hover { transform: translateY(-2px); border-color: rgba(34,211,238,0.5); }
            /* NON-ACTIVE discovered rooms recede so the ACTIVE one reads instantly (Mark: "highlight the one active"). [REF#UI-01144] */
            #welcome-guide-overlay .wg-room-box { opacity: .55; }
            #welcome-guide-overlay .wg-room-box:hover { opacity: .85; }
            #welcome-guide-overlay .wg-room-box.selected {
                opacity: 1; border-color: #22d3ee; transform: none;
                background: linear-gradient(180deg, rgba(34,211,238,0.14), rgba(0,0,0,0.20));
                box-shadow: 0 0 22px rgba(34,211,238,0.45), inset 0 0 0 1px rgba(34,211,238,0.35), inset 0 1px 0 rgba(255,255,255,0.08);
            }
            #welcome-guide-overlay .wg-room-box.selected .wg-room-name { color: #ffffff; }
            #welcome-guide-overlay .wg-room-icon { font-size: 21px; flex-shrink: 0; filter: drop-shadow(0 0 6px rgba(34,211,238,0.4)); }
            #welcome-guide-overlay .wg-room-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
            #welcome-guide-overlay .wg-room-name { font-family: 'Cinzel', serif; font-weight: 700; font-size: 13.5px; letter-spacing: .4px; color: #f3f9ff; }
            #welcome-guide-overlay .wg-room-blurb { font-size: 11px; color: #9fb4bd; }
            /* The info box is the PAYLOAD — it takes the space the shrunken slot list gives back, and it OWNS the [REF#UI-01145]
               scroll so the CTA below can never be pushed out of the viewport. */
            #welcome-guide-overlay .wg-room-detail {
                display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
                padding: 4px 2px 0; overflow: hidden;
            }
            #welcome-guide-overlay .wg-room-detail > :not(.wg-room-ok-wrap) { flex: 0 1 auto; min-height: 0; overflow-y: auto; }
            /* Logo scales with the viewport instead of a fixed 120px cap — bigger on desktop, never oversized on [REF#UI-01146]
               short screens (the clamp is what keeps the CTA on-screen at every resolution). */
            #welcome-guide-overlay .wg-room-logo-wrap { max-height: clamp(110px, 22vh, 200px); margin: 0 auto 10px; }
            #welcome-guide-overlay .wg-room-logo-wrap .wg-logo { max-height: clamp(110px, 22vh, 200px); width: auto; }
            /* ── DORMANT "CLOSED" PAGE — cinematic + sad (Mark 2026-08-01: "ITS TOO JAMMED UP … MAKE IT [REF#UI-01147]
               CINEMATIC AND SAD"). The logo is gone from this page (it mourns on the left one), the title
               drops the neon cyan for cold slate, the kanji stamp gets air instead of overlapping the
               title's wrap, and every text block is width-guarded so nothing can clip off the page edge
               again (the jam was min-content overflow + centred clipping — same trap as the card attr bar). */
            #welcome-guide-overlay .wg-dorm-page { overflow-x: hidden; }
            #welcome-guide-overlay .wg-dorm-page .wg-page-title {
                font-size: clamp(14px, 2.1vh, 18px); letter-spacing: 2.4px; line-height: 1.4;
                color: #a9bfd2; text-shadow: 0 0 10px rgba(130,170,200,0.35), 0 1px 2px #000;
                max-width: 100%; overflow-wrap: break-word; padding: 6px 8px 0;
            }
            #welcome-guide-overlay .wg-dorm-page .wg-room-kanji {
                margin: 8px 0 14px; font-size: 12px; letter-spacing: 7px;
                color: rgba(190,170,120,0.8); opacity: 1; text-shadow: 0 0 8px rgba(0,0,0,0.8);
            }
            #welcome-guide-overlay .wg-dorm-page .wg-lore {
                justify-content: flex-start; gap: 13px; color: #b3aeba;
            }
            #welcome-guide-overlay .wg-dorm-page .wg-lore p { margin: 0; max-width: 100%; overflow-wrap: break-word; }
            #welcome-guide-overlay .wg-dorm-page .wg-lore b { color: #9fd4e4; }
            /* Her portrait on the LEFT page, under the room list — a photo of better days. [REF#UI-01148] */
            #welcome-guide-overlay .wg-dorm-art {
                /* 220px → 140px (2026-10-01): the four special rooms share this page now, and the portrait crowded them [REF#UI-01496] */
                position: relative; margin: 12px auto 4px; width: min(52%, 140px);
                opacity: 0; animation: wgDormArtIn 1.8s ease 0.35s forwards;
            }
            #welcome-guide-overlay .wg-dorm-art img {
                display: block; width: 100%; border-radius: 10px;
                filter: grayscale(0.92) brightness(0.5) contrast(1.06);
            }
            #welcome-guide-overlay .wg-dorm-art::after {
                content: ''; position: absolute; inset: 0; border-radius: 10px; pointer-events: none;
                box-shadow: inset 0 0 36px 18px rgba(6, 8, 12, 0.92);
            }
            #welcome-guide-overlay .wg-dorm-art-cap {
                position: absolute; left: 50%; bottom: 9px; transform: translateX(-50%);
                font-size: 11px; letter-spacing: 8px; white-space: nowrap;
                color: rgba(196, 174, 120, 0.78); text-shadow: 0 0 8px rgba(0,0,0,0.95);
            }
            @keyframes wgDormArtIn { to { opacity: 1; } }
            /* on the cabaret's own page (a full room list) — smaller, above the notice [REF#UI-01497] */
            #welcome-guide-overlay .wg-dorm-art.wg-dorm-art-right { width: min(24%, 76px); margin: 0 auto 6px; flex: 0 0 auto; }
            #welcome-guide-overlay .wg-dorm-art.wg-dorm-art-right img { border-radius: 8px; }
            #welcome-guide-overlay .wg-dorm-art.wg-dorm-art-right::after { border-radius: 8px; box-shadow: inset 0 0 22px 10px rgba(6, 8, 12, 0.92); }
            #welcome-guide-overlay .wg-dorm-art.wg-dorm-art-right .wg-dorm-art-cap { display: none; }   /* the kanji line under the title says it */
            /* a column must never squeeze its heading into the line under it — the lore is what gives way [REF#UI-01498] */
            #welcome-guide-overlay .wg-dorm-page > .wg-page-title, #welcome-guide-overlay .wg-dorm-page > .wg-room-kanji { flex-shrink: 0; }
            /* A special room's snapshot (2026-10-01): a framed 3:2 photo of the room, grey until the room is running. [REF#PENDING] [REF#UI-01499] */
            #welcome-guide-overlay .wg-room-shot .wg-logo {
                width: min(100%, 300px); max-height: none; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 10px;
                box-shadow: 0 6px 18px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.08); transition: filter .6s ease;
            }
            #welcome-guide-overlay .wg-room-shot-dark .wg-logo { filter: grayscale(0.92) brightness(0.55) contrast(1.06); }
            /* CTA — PINNED, ALWAYS VISIBLE (Mark: "never have it clipped it must show in every media web [REF#UI-01149]
               resolution"). It sits outside the scrolling region and carries safe-area padding for notched
               phones, so no viewport height can crop it. */
            #welcome-guide-overlay .wg-room-ok-wrap {
                flex: 0 0 auto; position: sticky; bottom: 0; z-index: 5;
                margin-top: auto; padding: 10px 0 calc(10px + env(safe-area-inset-bottom, 0px));
                text-align: center;
                background: linear-gradient(180deg, rgba(6,10,14,0) 0%, rgba(6,10,14,.82) 38%, rgba(6,10,14,.96) 100%);
            }
            @media (max-height: 760px){
                #welcome-guide-overlay .wg-room-logo-wrap,
                #welcome-guide-overlay .wg-room-logo-wrap .wg-logo { max-height: clamp(80px, 16vh, 130px); }
                #welcome-guide-overlay .wg-rooms-list { gap: 5px; }
                #welcome-guide-overlay .wg-room-box { padding: 6px 9px; }
            }
            #welcome-guide-overlay .wg-room-kanji { text-align: center; color: #c79bff; font-size: 13px; letter-spacing: 3px; opacity: .85; margin: -4px 0 10px; }
            /* Faded "?" skeleton slots for undiscovered rooms — fills the page, reveals nothing [REF#UI-01150] */
            #welcome-guide-overlay .wg-room-skeleton {
                cursor: default; pointer-events: none; filter: grayscale(0.5);
                border-style: dashed; border-color: rgba(255,255,255,0.12);
                background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(0,0,0,0.12));
                box-shadow: none;
                animation: wgRoomSkelPulse 2.8s ease-in-out infinite;
            }
            #welcome-guide-overlay .wg-room-skeleton:hover { transform: none; border-color: rgba(255,255,255,0.12); }
            #welcome-guide-overlay .wg-room-skeleton .wg-room-icon { opacity: .45; filter: none; font-weight: 700; color: #8aa0aa; }
            #welcome-guide-overlay .wg-room-skeleton .wg-room-name { color: #8090a0; letter-spacing: 5px; font-size: 12px; }
            #welcome-guide-overlay .wg-room-skeleton .wg-room-blurb { color: #5d6b78; font-style: italic; }
            /* FADED FURTHER (Mark: "fade the other boxes") — present as a hint of what is left to find, never [REF#UI-01151]
               competing with the discovered room or the info box. */
            @keyframes wgRoomSkelPulse { 0%,100% { opacity: .16; } 50% { opacity: .26; } }
            #welcome-guide-overlay .wg-room-skeleton { padding: 6px 10px; }
            #welcome-guide-overlay .wg-room-skeleton .wg-room-icon { font-size: 17px; }
            /* WAGER screen (Mark 2026-06-18) — controls (left) + live 3D table (right) [REF#UI-01152] */
            #welcome-guide-overlay .wg-wager-controls { display: flex; flex-direction: column; gap: 12px; }
            #welcome-guide-overlay .wg-wager-stake { display: flex; align-items: baseline; gap: 8px; margin: 6px 0; justify-content: center; }
            #welcome-guide-overlay .wg-wager-stake-label { font-family: 'Cinzel', serif; font-size: 20px; letter-spacing: 3px; color: #9fb4bd; }
            #welcome-guide-overlay .wg-wager-stake-val { font-family: 'Cinzel', serif; font-size: 60px; font-weight: 700; color: #ffd76a; text-shadow: 0 0 14px rgba(255,200,80,.4); }
            #welcome-guide-overlay .wg-wager-stake-g { font-size: 27px; color: #ffd76a; }
            /* STAKE STEPPER (Mark 2026-06-24: "add a + - for the stake ##g") — 48px neumorphic squares, cyan design system [REF#UI-01153] */
            #welcome-guide-overlay .wg-stake-btn {
                width: 48px; height: 48px; flex: 0 0 48px; align-self: center; border-radius: 14px; cursor: pointer;   /* WCAG 2.2 (2.5.8) — 48px min touch target */
                display: flex; align-items: center; justify-content: center; user-select: none;
                font-family: 'Cinzel', serif; font-size: 26px; font-weight: 700; line-height: 1; color: #d7f1f7;
                background: linear-gradient(145deg, #102932, #0a181d);
                border: 1px solid rgba(34,211,238,.16);
                box-shadow: 5px 5px 12px rgba(0,0,0,.6), -4px -4px 11px rgba(46,108,124,.13), inset 1px 1px 1px rgba(110,200,220,.06);
                transition: transform .14s ease, box-shadow .22s ease, color .2s ease, border-color .18s ease;
            }
            #welcome-guide-overlay .wg-stake-btn:hover { transform: translateY(-2px); color: #fff; border-color: rgba(34,211,238,.5);
                box-shadow: 6px 6px 15px rgba(0,0,0,.66), -5px -5px 13px rgba(46,108,124,.16), 0 0 16px rgba(34,211,238,.22); }
            #welcome-guide-overlay .wg-stake-btn:active { transform: translateY(1px);
                box-shadow: inset 4px 4px 9px rgba(0,0,0,.66), inset -3px -3px 8px rgba(46,108,124,.14); }
            #welcome-guide-overlay .wg-stake-btn:disabled { opacity: .38; cursor: not-allowed; transform: none;
                box-shadow: inset 3px 3px 7px rgba(0,0,0,.5), inset -2px -2px 6px rgba(46,108,124,.08); }
            /* Blackjack HIT/STAND share the guidebook CTA pill (Mark 2026-06-24), split evenly across the row [REF#UI-01154] */
            #welcome-guide-overlay .wg-wager-bets .wg-restore-btn { flex: 1; }
            #welcome-guide-overlay .wg-wager-bets { display: flex; gap: 12px; }
            /* Neumorphic bet buttons (Mark 2026-06-23) — extruded from the dark panel, cyan design system [REF#UI-01155] */
            #welcome-guide-overlay .wg-wager-bet {
                flex: 1; min-height: 48px; padding: 12px 12px; border-radius: 14px; cursor: pointer;   /* WCAG 2.2 (2.5.8) — 48px min touch target (Mark 2026-06-24) */
                display: flex; align-items: center; justify-content: center;
                font-family: 'Cinzel', serif; font-size: 18px; font-weight: 700; letter-spacing: 1px; color: #d7f1f7;
                background: linear-gradient(145deg, #102932, #0a181d);
                border: 1px solid rgba(34,211,238,.16);
                box-shadow:
                    5px 5px 12px rgba(0,0,0,.6),
                    -4px -4px 11px rgba(46,108,124,.13),
                    inset 1px 1px 1px rgba(110,200,220,.06);
                transition: transform .14s ease, box-shadow .22s ease, color .2s ease, border-color .18s ease;
            }
            #welcome-guide-overlay .wg-wager-bet:hover { transform: translateY(-2px); color: #ffffff; border-color: rgba(34,211,238,.5);
                box-shadow: 6px 6px 15px rgba(0,0,0,.66), -5px -5px 13px rgba(46,108,124,.16), 0 0 16px rgba(34,211,238,.22); }
            #welcome-guide-overlay .wg-wager-bet.sel { color: #eafdff; border-color: rgba(34,211,238,.85);
                background: linear-gradient(145deg, #0a161b, #0f242c);
                box-shadow: inset 4px 4px 9px rgba(0,0,0,.66), inset -3px -3px 8px rgba(46,108,124,.14), 0 0 18px rgba(34,211,238,.34); }
            #welcome-guide-overlay .wg-wager-note { font-size: 18px; color: #8fa3ac; font-style: italic; text-align: center; margin-top: 4px; }
            #welcome-guide-overlay .wg-wager-stage { padding: 8px !important; }
            /* Recessed neumorphic well so the 3D felt sits in the panel rather than floating on it [REF#UI-01156] */
            #welcome-guide-overlay .wg-wager-canvas-wrap {
                position: relative;   /* anchor for the camera overlay UI (hint + preset chips) */
                width: 100%; height: 100%; min-height: 320px; border-radius: 18px; overflow: hidden;
                background: radial-gradient(circle at 50% 34%, rgba(20,64,42,.5), rgba(3,9,7,.95));
                border: 1px solid rgba(34,211,238,.14);
                box-shadow: inset 7px 7px 16px rgba(0,0,0,.62), inset -6px -6px 14px rgba(46,108,124,.08), 0 0 22px rgba(34,211,238,.10);
            }
            /* touch-action:none is LOAD-BEARING — the overlay root stopPropagation()s touchmove, so without this the browser [REF#UI-01157]
               eats the gesture for scroll before the canvas pointer handlers see it (no drag/pinch). cursor signals draggability. */
            #welcome-guide-overlay .wg-wager-canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; outline: none; }
            #welcome-guide-overlay .wg-wager-canvas:focus-visible { box-shadow: inset 0 0 0 2px #22d3ee; }   /* WCAG: solid — the .45 alpha ring measured 2.87:1, under the 3:1 non-text minimum */
            /* ADJUSTABLE-POV overlay UI (Mark 2026-06-25) — floats over the felt, mirrors the cyan neumorphic system. [REF#UI-01158] */
            #welcome-guide-overlay .wg-cam-hint {
                position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%);
                font-size: 11px; letter-spacing: .02em; color: #9fc7d2; opacity: .72; pointer-events: none; user-select: none;
                background: rgba(3,9,7,.42); padding: 3px 10px; border-radius: 10px; backdrop-filter: blur(2px); white-space: nowrap;
            }
            #welcome-guide-overlay .wg-cam-presets { position: absolute; top: 10px; right: 10px; display: flex; gap: 7px; }
            #welcome-guide-overlay .wg-cam-chip {
                width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;
                font-size: 17px; line-height: 1; color: #bfe7ef; border-radius: 11px; border: 1px solid rgba(34,211,238,.20);
                background: linear-gradient(145deg, #0c1c22, #071217);
                box-shadow: 4px 4px 10px rgba(0,0,0,.6), -3px -3px 9px rgba(46,108,124,.12);
                transition: transform .12s ease, box-shadow .2s ease, color .18s ease, border-color .18s ease;
            }
            #welcome-guide-overlay .wg-cam-chip:hover { transform: translateY(-1px); color: #eafdff; border-color: rgba(34,211,238,.5);
                box-shadow: 5px 5px 13px rgba(0,0,0,.66), -4px -4px 11px rgba(46,108,124,.16), 0 0 14px rgba(34,211,238,.24); }
            #welcome-guide-overlay .wg-cam-chip:active { transform: translateY(0);
                box-shadow: inset 3px 3px 8px rgba(0,0,0,.66), inset -2px -2px 7px rgba(46,108,124,.14); }
            #welcome-guide-overlay .wg-cam-reset { color: #e8c66a; border-color: rgba(232,198,106,.28); }
            #welcome-guide-overlay .wg-cam-reset:hover { color: #f7e6b0; border-color: rgba(232,198,106,.55); box-shadow: 5px 5px 13px rgba(0,0,0,.66), -4px -4px 11px rgba(46,108,124,.16), 0 0 14px rgba(232,198,106,.26); }
            /* ── SOLITAIRE stage (Mark 2026-06-23) — full-bleed game embed over the wager spread. Maximize grows the [REF#UI-01159]
               MODAL (--wg-w/--wg-h, see .wg-max90/.wg-max100) so the iframe never reloads + game state survives. ── */
            #welcome-guide-overlay .wg-soli-stage {
                position: absolute; inset: 0; z-index: 6;
                display: none; flex-direction: column;
                background: linear-gradient(180deg, #0c1822 0%, #0a1119 100%);
                border-radius: 8px; overflow: hidden;
            }
            #welcome-guide-overlay .wg-soli-bar {
                display: flex; align-items: center; gap: 8px; flex: 0 0 auto; padding: 8px 10px;
                border-bottom: 1px solid rgba(34,211,238,.14); background: rgba(10,16,22,.55);
            }
            #welcome-guide-overlay .wg-soli-title { font-family: 'Cinzel', serif; font-weight: 700; font-size: 14px; letter-spacing: .6px; color: #eaf7ff; }
            #welcome-guide-overlay .wg-soli-spacer { flex: 1; }
            #welcome-guide-overlay .wg-soli-btn {
                width: 48px; height: 48px; flex: 0 0 auto; cursor: pointer; padding: 0;   /* WCAG 2.2 (2.5.8) — 48px min touch target (Mark 2026-06-24) */
                display: flex; align-items: center; justify-content: center;
                border-radius: 9px; font-size: 16px; line-height: 1; color: #d7f1f7;
                background: linear-gradient(145deg, #102932, #0a181d);
                border: 1px solid rgba(34,211,238,.18);
                box-shadow: 3px 3px 8px rgba(0,0,0,.55), -2px -2px 7px rgba(46,108,124,.12), inset 1px 1px 1px rgba(110,200,220,.05);
                transition: transform .14s ease, box-shadow .2s ease, color .2s ease, border-color .18s ease;
            }
            #welcome-guide-overlay .wg-soli-btn:hover { transform: translateY(-1px); color: #fff; border-color: rgba(34,211,238,.5); box-shadow: 0 0 14px rgba(34,211,238,.25); }
            #welcome-guide-overlay .wg-soli-btn:active { transform: translateY(1px); }
            #welcome-guide-overlay .wg-soli-btn[hidden] { display: none; }
            #welcome-guide-overlay .wg-soli-frame { flex: 1 1 auto; width: 100%; border: 0; display: block; background: transparent; }
            /* Maximize ladder — grow the whole guide modal; the Solitaire stage (inset:0) + iframe ride along, no reload. [REF#UI-01160] */
            #welcome-guide-overlay.wg-modal.wg-max90  { --wg-w: 90vw;  --wg-h: 90vh; }
            #welcome-guide-overlay.wg-modal.wg-max100 { --wg-w: 100vw; --wg-h: 100vh; border-radius: 0; }
            /* SAKE TAP game stage — full-bleed iframe over the whole guide (Mark 2026-07-25); z above the soli stage (6) [REF#UI-01161] */
            #welcome-guide-overlay .wg-tapper-stage {
                position: absolute; inset: 0; z-index: 9;
                display: none; flex-direction: column;
                background: linear-gradient(180deg, #170a12 0%, #0a0710 100%);
                border-radius: 8px; overflow: hidden;
            }
            #welcome-guide-overlay .wg-tapper-bar {
                display: flex; align-items: center; gap: 8px; flex: 0 0 auto; padding: 8px 10px;
                border-bottom: 1px solid rgba(255,59,157,.18); background: rgba(16,8,14,.6);
            }
            #welcome-guide-overlay .wg-tapper-title { font-family: 'Cinzel', serif; font-weight: 700; font-size: 14px; letter-spacing: .6px; color: #ffe4f2; }
            #welcome-guide-overlay .wg-tapper-spacer { flex: 1; }
            #welcome-guide-overlay .wg-tapper-btn {
                width: 48px; height: 48px; flex: 0 0 auto; cursor: pointer; padding: 0;   /* WCAG 2.2 (2.5.8) — 48px min touch target */
                display: flex; align-items: center; justify-content: center;
                border-radius: 9px; font-size: 16px; line-height: 1; color: #ffd7ec;
                background: linear-gradient(145deg, #2a1020, #170a12);
                border: 1px solid rgba(255,59,157,.22);
                box-shadow: 3px 3px 8px rgba(0,0,0,.55), inset 1px 1px 1px rgba(255,110,180,.06);
                transition: transform .14s ease, box-shadow .2s ease, color .2s ease, border-color .18s ease;
            }
            #welcome-guide-overlay .wg-tapper-btn:hover { transform: translateY(-1px); color: #fff; border-color: rgba(255,59,157,.55); box-shadow: 0 0 14px rgba(255,59,157,.28); }
            #welcome-guide-overlay .wg-tapper-btn:active { transform: translateY(1px); }
            #welcome-guide-overlay .wg-tapper-frame { flex: 1 1 auto; width: 100%; border: 0; display: block; background: #05040a; }
            /* WAGER 3×3 game grid (Mark 2026-06-19) [REF#UI-01162] */
            #welcome-guide-overlay .wg-wager-grid-page, #welcome-guide-overlay .wg-wager-game-info { display: flex; flex-direction: column; }
            #welcome-guide-overlay .wg-wager-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 8px; overflow-y: auto; }
            #welcome-guide-overlay .wg-wager-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; aspect-ratio: 1 / 1; padding: 8px; border-radius: 12px; cursor: pointer; color: #eaf7ff; font-family: 'Outfit','Inter',sans-serif; background: linear-gradient(180deg, rgba(34,211,238,.07), rgba(0,0,0,.2)); border: 1px solid rgba(34,211,238,.22); transition: transform .14s ease, border-color .18s ease, box-shadow .18s ease; }
            #welcome-guide-overlay .wg-wager-tile:hover { transform: translateY(-2px); border-color: rgba(34,211,238,.6); box-shadow: 0 0 14px rgba(34,211,238,.3); }
            #welcome-guide-overlay .wg-wager-tile-icon { font-size: 39px; filter: drop-shadow(0 0 6px rgba(34,211,238,.35)); }
            #welcome-guide-overlay .wg-wager-tile-name { font-family: 'Cinzel', serif; font-size: 18px; font-weight: 700; letter-spacing: .4px; text-align: center; }
            #welcome-guide-overlay .wg-wager-tile-locked { opacity: .32; cursor: default; pointer-events: none; border-style: dashed; border-color: rgba(255,255,255,.12); background: linear-gradient(180deg, rgba(255,255,255,.025), rgba(0,0,0,.12)); filter: grayscale(.5); animation: wgRoomSkelPulse 2.8s ease-in-out infinite; }
            #welcome-guide-overlay .wg-wager-tile-locked .wg-wager-tile-icon { opacity: .5; filter: none; color: #8aa0aa; }
            #welcome-guide-overlay .wg-wager-back { margin-top: 10px; background: none; border: none; color: #9fb4bd; font-family: 'Outfit',sans-serif; font-size: 20px; cursor: pointer; align-self: flex-start; min-height: 36px; padding: 6px 12px; }   /* WCAG 2.2 SC 2.5.8: ≥24px target */
            /* WCAG 2.2 (2026-07-05): one visible focus ring for every guide control — existing palette cyan, ≥3:1 on all guide surfaces [REF#UI-01163] */
            #welcome-guide-overlay button:focus-visible, #welcome-guide-overlay select:focus-visible, #welcome-guide-overlay a:focus-visible { outline: 2px solid #22d3ee; outline-offset: 2px; }
            #welcome-guide-overlay .wg-wager-back:hover { color: #22d3ee; }
            #welcome-guide-overlay .wg-wager-stake { margin: 4px 0 2px; color: #cfe8f2; font-family: 'Outfit',sans-serif; font-size: 20px; opacity: .9; }
            #welcome-guide-overlay .wg-wager-stake b { color: #ffd76a; }
            #welcome-guide-overlay .wg-wager-deal { align-self: stretch; justify-content: center; font-size: 18px; }
            #welcome-guide-overlay .wg-wager-deal i { color: rgba(34,211,238,.95); transform: none; }
            #welcome-guide-overlay .wg-wager-result { min-height: 33px; margin: 10px 0 2px; padding: 15px 18px; border-radius: 12px; font-family: 'Outfit',sans-serif; font-size: 21px; color: #d7e6ec; text-align: center; background: linear-gradient(145deg, rgba(10,22,27,.6), rgba(8,16,20,.6)); box-shadow: inset 3px 3px 8px rgba(0,0,0,.5), inset -2px -2px 6px rgba(46,108,124,.08); transition: background .2s ease, color .2s ease, box-shadow .2s ease; }
            #welcome-guide-overlay .wg-wager-result:empty { display: none; }
            #welcome-guide-overlay .wg-wager-result.win { color: #eafff0; background: linear-gradient(180deg, rgba(52,211,153,.18), rgba(0,0,0,.18)); box-shadow: 0 0 16px rgba(52,211,153,.3) inset; }
            #welcome-guide-overlay .wg-wager-result.lose { color: #ffe2e2; background: linear-gradient(180deg, rgba(248,113,113,.16), rgba(0,0,0,.18)); box-shadow: 0 0 16px rgba(248,113,113,.25) inset; }

            /* Donation spread (grafted 2026-06-09) — cyan, per design system [REF#UI-01164] */
            #welcome-guide-overlay .wg-donate { margin: 18px 0 6px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
            #welcome-guide-overlay .wg-donate-btn {
                display: inline-flex; align-items: center; gap: 10px;
                padding: 12px 22px; border-radius: 12px; font-weight: 700; letter-spacing: .02em;
                color: #04222a; background: linear-gradient(180deg, #5eead4, #22d3ee);
                box-shadow: 0 4px 14px rgba(34,211,238,.35); text-decoration: none;
                transition: transform .15s ease, box-shadow .15s ease;
            }
            #welcome-guide-overlay .wg-donate-btn:hover { transform: translateY(-2px); box-shadow: 0 7px 20px rgba(34,211,238,.5); }
            #welcome-guide-overlay .wg-donate-email { margin: 4px 0 0; font-size: .9em; opacity: .85; text-align: center; }
            #welcome-guide-overlay .wg-donate-email b { color: #22d3ee; }
            /* Loader styling [REF#UI-01165] */
            #welcome-guide-overlay .wg-loader-container {
                margin-top: 8px;
                padding: 9px 12px;
                background: rgba(0, 0, 0, 0.25);
                border: 1px solid rgba(34, 211, 238, 0.15);
                border-radius: 10px;
                box-shadow: inset 2px 2px 8px rgba(0, 0, 0, 0.5);
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            #welcome-guide-overlay .wg-loader-status {
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 11px;
                color: #22d3ee;
                text-shadow: 0 0 6px rgba(34, 211, 238, 0.4);
                text-align: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #welcome-guide-overlay .wg-loader-bar-bg {
                width: 100%;
                height: 7px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 5px;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow: inset 1px 1px 3px rgba(0, 0, 0, 0.7);
            }
            #welcome-guide-overlay .wg-loader-bar-fill {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #06b6d4, #22d3ee);
                border-radius: 5px;
                box-shadow: 0 0 10px #22d3ee;
                transition: width 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            }
            #welcome-guide-overlay .wg-loader-percentage {
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 11.5px;
                font-weight: 700;
                color: #22d3ee;
                text-align: center;
                text-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
            }

            /* State rules [REF#UI-01166] */
            #welcome-guide-overlay.wg-loading-active .wg-close-btn {
                display: none !important;
            }
            #welcome-guide-overlay.wg-loading-active .wg-footer {
                pointer-events: none !important;
                opacity: 0.35;
                filter: grayscale(1);
            }
            #welcome-guide-overlay.wg-loading-active .wg-actions {
                display: none !important;
            }
            #welcome-guide-overlay:not(.wg-loading-active) .wg-loader-container {
                display: none !important;
            }

            #welcome-guide-overlay.wg-modal {
                /* Book refactor 2026-05-25 — wider to fit two-page spread. [REF#UI-01167] */
                --wg-w: min(760px, calc(100vw - 24px));
                /* 5% TALLER, SAME WIDTH (2026-09-02): 580 -> 609px. The width is deliberately [REF#UI-01307]
                   untouched — the two-page spread is sized to it, so widening would reflow the
                   book. The calc(100vh - 24px) term still wins on short viewports, so this grows
                   the book on roomy screens and changes nothing on cramped ones.
                   NOTE: this whole CSS block lives inside a JS TEMPLATE LITERAL (opened ~:5784),
                   so a backtick in a comment here TERMINATES the string. My first version quoted
                   calc() in backticks and threw "SyntaxError: Unexpected identifier 'calc'". */
                --wg-h: min(609px, calc(100vh - 24px));
                --wg-pad: 22px;
                --wg-footer-h: 78px;
                --wg-stage-pad-top: 122px;  /* clears the GOLD bar plus up to two wrapped rows of section tabs */
                --wg-bg: rgba(35, 37, 39, 0.96);
                display: none;
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: var(--wg-w); height: var(--wg-h);
                min-width: var(--wg-w); min-height: var(--wg-h);
                max-width: var(--wg-w); max-height: var(--wg-h);
                background: var(--wg-bg);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 18px;
                color: #fff;
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: clamp(10px, 1.6vmin, 14px);
                box-shadow:
                    12px 12px 36px rgba(0, 0, 0, 0.85),
                    -6px -6px 22px rgba(255, 255, 255, 0.04),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.08),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.55);
                overflow: hidden;
                box-sizing: border-box;
                z-index: 99999;
                pointer-events: auto;
            }
            #welcome-guide-overlay.wg-modal.is-open { display: block; }
            /* Cinematic grand-entrance fade-in (Mark 2026-06-23) — the book eases in gently after the cabaret-door cinematic [REF#UI-01168] */
            @keyframes wgCineFadeIn {
                from { opacity: 0; transform: translate(-50%, -50%) scale(0.965); }
                to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
            #welcome-guide-overlay.wg-modal.wg-cine-fade { animation: wgCineFadeIn 0.9s cubic-bezier(0.22, 0.61, 0.36, 1) both; }

            #welcome-guide-overlay .wg-close-btn {
                position: absolute; top: 14px; right: 16px;
                width: 34px; height: 34px;
                border-radius: 50%;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: var(--wg-bg);
                color: rgba(125, 230, 255, 0.95);   /* bright ethereal blue (was lavender/pink rgba(216,180,254) — Mark 2026-06-17) */
                font-size: 20px; font-weight: 900; line-height: 1;
                cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                padding: 0; z-index: 10;
                box-shadow:
                    4px 4px 10px rgba(0, 0, 0, 0.6),
                    -3px -3px 8px rgba(255, 255, 255, 0.05),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.06),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.4);
                transition: color 0.2s, transform 0.2s, box-shadow 0.2s;
            }
            #welcome-guide-overlay .wg-close-btn:hover { color: #fff; transform: translateY(-1px); }
            #welcome-guide-overlay .wg-close-btn:active {
                transform: translateY(1px);
                box-shadow: inset 4px 4px 8px rgba(0,0,0,0.6), inset -4px -4px 8px rgba(255,255,255,0.05);
            }

            /* GOLD readout — center-justified at the very TOP of the guide so players always see their gold (Mark 2026-06-24). [REF#UI-01169]
               2026-06-24 (Mark: "not a button, just text; label ethereal blue"): pill chrome removed (no gradient/border/box-shadow/radius/padding) —
               now plain text. Number stays gold (the "gold numeric field"); the GOLD label recolored to the guide's ethereal cyan #22d3ee. */
            /* ONE-ROW HEADER (Mark 2026-10-17): gold sits top-left on the same row as the tabs; it used to stack above them. [REF#UI-01524] */
            #welcome-guide-overlay .wg-gold-bar { position: absolute; top: 18px; left: 24px; transform: none; z-index: 21; display: flex; justify-content: flex-start; pointer-events: none; }
            /* TEXT SIZE (Mark 2026-10-17): transparent until hover or keyboard focus; text #a5f3fc on the book's #232527 is well over 7:1 (AAA). [REF#UI-01525] */
            #welcome-guide-overlay .wg-font-ctl { position: absolute; top: 8px; right: 84px; z-index: 22; display: flex; gap: 4px; }
            #welcome-guide-overlay .wg-font-btn { min-width: 44px; min-height: 44px; padding: 0 8px; border-radius: 999px; background: transparent; border: 1px solid transparent;
                color: #a5f3fc; font: 700 15px/1 'Outfit', 'Inter', sans-serif; letter-spacing: 0.5px; cursor: pointer; transition: background .15s, border-color .15s; }
            #welcome-guide-overlay .wg-font-btn:hover, #welcome-guide-overlay .wg-font-btn:focus-visible { background: rgba(34, 211, 238, 0.12); border-color: rgba(103, 232, 249, 0.7); }
            #welcome-guide-overlay .wg-font-btn:focus-visible { outline: 3px solid #fde047; outline-offset: 2px; }
            #welcome-guide-overlay .wg-font-btn:disabled { opacity: 0.45; cursor: default; }
            /* The text grows with zoom; pictures and canvases counter-zoom so they keep their size; pages scroll once the text no longer fits. [REF#UI-01526] */
            #welcome-guide-overlay .wg-page-pad { zoom: var(--wg-font-scale, 1); }
            #welcome-guide-overlay .wg-page-pad :is(img, canvas, video, svg) { zoom: calc(1 / var(--wg-font-scale, 1)); }
            #welcome-guide-overlay[data-wg-font-scaled] .wg-page { overflow-y: auto; }
            #welcome-guide-overlay .wg-gold-amt { display: inline-flex; align-items: center; gap: 8px; font-family: 'Cinzel','Times New Roman',serif; font-weight: 700; font-size: 16px; letter-spacing: 1px; color: #ffe7a0; padding: 0; background: none; border: none; box-shadow: none; }
            #welcome-guide-overlay .wg-gold-ic { font-size: 15px; filter: drop-shadow(0 0 5px rgba(255,200,90,0.7)); }
            #welcome-guide-overlay .wg-gold-num { color: #fff6d4; font-variant-numeric: tabular-nums; text-shadow: 0 0 9px rgba(255,200,90,0.5); }
            #welcome-guide-overlay .wg-gold-unit { font-size: 11px; opacity: 1; letter-spacing: 2px; color: #67e8f9; text-shadow: 0 0 8px rgba(34,211,238,0.55); } /* AAA contrast (A5, 2026-09-12): axe measured #23c2db on #2b3c41 = 5.37:1 (needs 7:1 for 11px); the palette's lighter cyan at full opacity reads 7.94:1 — same hue family as the .active tab gradient, no new colour introduced */
            /* Section TABS — Intro / Saves / Inventory / Slots (Mark 2026-06-17). Floats top-center BELOW the gold bar, clears the close button. [REF#UI-01170] */
            #welcome-guide-overlay .wg-tabs {
                position: absolute; top: 60px; left: 50%; transform: translateX(-50%);   /* Mark 2026-10-20: clear the 44px text controls by 8px. */
                display: grid; grid-template-rows: repeat(2, auto); grid-auto-flow: column; grid-auto-columns: max-content; justify-items: center; justify-content: center; gap: 4px 6px; z-index: 20; pointer-events: auto;
                padding: 4px; border-radius: 24px; width: max-content; max-width: calc(100% - 32px); box-sizing: border-box; overflow-x: auto;
                background: rgba(10, 16, 22, 0.66);
                border: 1px solid rgba(34, 211, 238, 0.18);
                backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
            }
            #welcome-guide-overlay .wg-tab {
                appearance: none; -webkit-appearance: none; cursor: pointer; white-space: normal; min-width: 0; overflow-wrap: anywhere;
                border: 1px solid transparent; padding: 6px 12px; border-radius: 999px; width: max-content;
                background: transparent; color: rgba(180, 220, 240, 0.82); /* AAA contrast (A5, 2026-09-12): 0.72 measured 6.73:1 on #151a1f at 10.8px — 0.82 blends to ~8.4:1 */
                font-family: 'Outfit', 'Inter', sans-serif; font-size: clamp(10px, 1.5vmin, 13px);
                font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase;
                transition: color .18s, background .18s, border-color .18s, box-shadow .18s;
            }
            #welcome-guide-overlay .wg-tab:hover { color: #fff; background: rgba(34, 211, 238, 0.10); }
            #welcome-guide-overlay .wg-tab.active {
                color: #06121a; background: linear-gradient(180deg, #67e8f9, #22d3ee);
                border-color: rgba(34, 211, 238, 0.5); box-shadow: 0 0 14px rgba(34, 211, 238, 0.35);
            }
            /* WCAG 1.4.10 (2026-09-13): at 320 CSS px the strip ran past the viewport — wrap instead of scroll sideways [REF#UI-01357] */
            @media (max-width: 520px) { #welcome-guide-overlay .wg-tabs { max-width: calc(100% - 16px); } }
            #welcome-guide-overlay .wg-tab-divider {
                display: none !important;
                width: 1px; height: 24px; background: rgba(34, 211, 238, 0.25);
                margin: 0 2px; align-self: center;
            }

            /* SETTINGS PAGES — Settings Hub, Music, Audio, Display [REF#UI-01171] */
            #welcome-guide-overlay .wg-settings-page { display: flex; flex-direction: column; gap: 18px; }
            /* THE SETTINGS CATALOG (2026-10-02): one row per settings page — an icon, its name, one line on what it holds. [REF#UI-01500] */
            #welcome-guide-overlay .wg-settings-catalog { gap: 9px; }
            #welcome-guide-overlay .wg-cat-item { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 9px 14px; }
            #welcome-guide-overlay .wg-cat-ic { flex: none; width: 34px; height: 34px; display: grid; place-items: center; font-size: 19px; border-radius: 50%;
                background: rgba(34,211,238,0.08); box-shadow: inset 1px 1px 2px rgba(255,255,255,0.06), inset -1px -1px 3px rgba(0,0,0,0.5); }
            #welcome-guide-overlay .wg-cat-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
            #welcome-guide-overlay .wg-cat-txt b { color: #22d3ee; font-size: 13px; letter-spacing: 1.2px; text-transform: uppercase; }
            #welcome-guide-overlay .wg-cat-txt small { color: #c3ccd4; font-size: 11px; font-weight: 500; line-height: 1.35; letter-spacing: 0.2px; }
            /* COLORS page (2026-10-02): three native radios in one fieldset — Tab reaches the group, the arrow keys choose. [REF#UI-01501] */
            #welcome-guide-overlay .wg-contrast { border: 0; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
            #welcome-guide-overlay .wg-sr-legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
            #welcome-guide-overlay .wg-contrast-opt { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 8px 14px; border-radius: 10px; cursor: pointer;
                border: 1px solid rgba(34,211,238,0.22); background: linear-gradient(180deg, rgba(34,211,238,0.08), rgba(34,211,238,0.02)); }
            #welcome-guide-overlay .wg-contrast-opt:has(input:checked) { border-color: #22d3ee; background: linear-gradient(180deg, rgba(34,211,238,0.20), rgba(34,211,238,0.08));
                box-shadow: 0 0 12px rgba(34,211,238,0.25); }
            #welcome-guide-overlay .wg-contrast-opt input { width: 20px; height: 20px; accent-color: #22d3ee; cursor: pointer; flex: none; margin: 0; }
            #welcome-guide-overlay .wg-contrast-opt span { display: flex; flex-direction: column; gap: 2px; }
            #welcome-guide-overlay .wg-contrast-opt b { color: #f5f3ff; font-size: 13px; letter-spacing: 0.6px; }
            #welcome-guide-overlay .wg-contrast-opt small { color: #c3ccd4; font-size: 11px; }
            #welcome-guide-overlay .wg-contrast-swatches { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 14px; }
            #welcome-guide-overlay .wg-contrast-sw { padding: 4px 10px; border-radius: 999px; font: 800 10.5px/1.4 'Outfit', 'Inter', sans-serif; letter-spacing: 1px;
                background: #0d0d0f; border: 1px solid rgba(255,255,255,0.12); }
            /* PHONES: use the same wrapped tab strip, spanning the available book width. [REF#UI-01502] */
            @media (max-width: 520px) {
                #welcome-guide-overlay .wg-tabs { left: 50%; right: auto; transform: translateX(-50%); max-width: calc(100% - 16px); }
                #welcome-guide-overlay .wg-tabs .wg-tab { flex: none; }
            }
            /* PHONES: pages share the height and never scroll, so the catalog and Colors spreads keep their left page short — the right [REF#UI-01503]
               page holds the rows that have to fit. */
            @media (max-width: 750px), ((pointer: coarse) and (hover: none) and (max-width: 1200px)) {
                #welcome-guide-overlay .wg-slide[data-slide="13"] .wg-page-left,
                #welcome-guide-overlay .wg-slide[data-slide="20"] .wg-page-left { flex: 0 0 auto; }
                #welcome-guide-overlay .wg-slide[data-slide="13"] .wg-page-left .wg-lore,
                #welcome-guide-overlay .wg-slide[data-slide="20"] .wg-contrast-swatches { display: none; }
                #welcome-guide-overlay .wg-cat-item { min-height: 44px; padding: 6px 12px; }
                #welcome-guide-overlay .wg-settings-catalog { gap: 6px; }
            }
            /* Accessibility pledge on the welcome spread (Mark 2026-08-14) — reads as part of the [REF#UI-01172]
               lore, one shade warmer than body text, never a badge. */
            /* CENTRED, AND IT LIVES BELOW THE TERMS NOW (Mark 2026-08-15: "center green wcag text and [REF#UI-01173]
               put it below the terms"). The full width is doing real work here, not decoration:
               .wg-actions is a flex column with centred items, so the paragraph shrink-wraps to its
               text and centring the text would then centre it inside a box already exactly as wide as
               the text — a no-op. Given the full width, the rule centres it against the panel.
               (No backticks in this comment: the whole stylesheet is a JS template literal, and one
               stray backtick terminates it and takes the guidebook down with it.) */
            #welcome-guide-overlay .wg-lore-a11y {
                /* MIDDLE-ALIGNED TO ITS OWN RULE (Mark 2026-08-15: "middle align this to the line bar [REF#UI-01174]
                   above it"). It had padding-top 5 and NO padding-bottom, so the text hugged the line
                   and every pixel of slack fell underneath it — reading as bottom-heavy rather than
                   centred. Symmetric padding puts equal air above and below, so the line sits at the
                   top of a band the text is centred in. Horizontal centring was already correct: the
                   border and the text share one full-width box, so they share a midpoint. */
                margin-top: 2px; padding: 7px 0;
                border-top: 1px solid rgba(34, 211, 238, 0.20);
                color: #9fd8cf; font-size: 11.5px; line-height: 1.45;
                width: 100%; text-align: center;
            }
            #welcome-guide-overlay .wg-lore-a11y b { color: #22d3ee; }
            /* A11Y SETTINGS controls (WCAG R5): 24px+ targets, visible labels, big hit areas. [REF#UI-01175] */
            #welcome-guide-overlay .wg-a11y-row { display:flex; align-items:center; gap:10px; margin:10px 0 2px; flex-wrap:wrap; }
            #welcome-guide-overlay .wg-a11y-label { color:#cdeee6; font-size:12.5px; min-width:150px; }
            #welcome-guide-overlay .wg-a11y-range { flex:1; min-width:140px; height:26px; accent-color:#22d3ee; cursor:pointer; }
            #welcome-guide-overlay .wg-a11y-out { color:#22d3ee; font-size:12px; min-width:44px; text-align:right; font-variant-numeric:tabular-nums; }
            #welcome-guide-overlay .wg-a11y-check { display:flex; align-items:center; gap:9px; color:#cdeee6; font-size:12.5px; cursor:pointer; min-height:28px; }
            #welcome-guide-overlay .wg-a11y-check input { width:20px; height:20px; accent-color:#22d3ee; cursor:pointer; }
            #welcome-guide-overlay .wg-a11y-hint { color:#9fb4bd; font-size:11.5px; margin:2px 0 12px; line-height:1.5; }
            #welcome-guide-overlay .wg-a11y-sub { color:#cdeee6; font-size:13px; margin:14px 0 2px; letter-spacing:.4px; }
            /* WORLD page (WCAG P4): reuses the guide's button language; targets ≥24px (2.5.8); [REF#UI-01176]
               focus rings inherit the shared :focus-visible rules. */
            #welcome-guide-overlay .wg-world-list { display:flex; flex-direction:column; gap:6px; margin-top:10px; max-height:52vh; overflow-y:auto; padding-right:4px; }
            /* 墓場 THE GRAVEYARD (Mark 2026-09-25) — same card recipe as .wg-room-card so the roll reads as part of the book. [REF#UI-01436] */
            #welcome-guide-overlay .wg-gy-list { display:flex; flex-direction:column; gap:6px; margin-top:10px; max-height:58vh; overflow-y:auto; padding-right:4px; }
            #welcome-guide-overlay .wg-gy-row { display:flex; align-items:center; gap:10px; padding:8px 11px; border-radius:10px;
                background:linear-gradient(180deg, rgba(34,211,238,0.06), rgba(0,0,0,0.18));
                border:1px solid rgba(34,211,238,0.20);
                box-shadow:inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.4); }
            #welcome-guide-overlay .wg-gy-n { flex:0 0 auto; min-width:1.6em; text-align:right; font-family:'Cinzel',serif;
                font-size:12px; color:#22d3ee; opacity:.85; }
            #welcome-guide-overlay .wg-gy-body { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:2px; }
            #welcome-guide-overlay .wg-gy-killer { font-family:'Cinzel',serif; font-weight:700; font-size:13px; color:#f3f9ff;
                overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            #welcome-guide-overlay .wg-gy-meta { font-size:11.5px; color:#9fb4bd; }
            #welcome-guide-overlay .wg-gy-when { flex:0 0 auto; font-size:11px; color:#9fb4bd; opacity:.9; }
            #welcome-guide-overlay .wg-gy-empty { font-size:12.5px; color:#9fb4bd; font-style:italic; margin-top:10px; }
            #welcome-guide-overlay .wg-gy-stats { margin-top:12px; }
            #welcome-guide-overlay .wg-gy-stat-dl { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; margin:0; font-size:12.5px; }
            #welcome-guide-overlay .wg-gy-stat-dl dt { color:#9fb4bd; }
            #welcome-guide-overlay .wg-gy-stat-dl dd { margin:0; color:#f3f9ff; font-family:'Cinzel',serif; font-weight:700; }
            #welcome-guide-overlay .wg-gy-dim { color:#9fb4bd; font-weight:400; font-family:'Outfit','Inter',sans-serif; }
            #welcome-guide-overlay .wg-world-room { text-align:left; font-size:12px; padding:8px 10px; min-height:32px; }
            #welcome-guide-overlay .wg-world-sel { outline:2px solid #22d3ee; outline-offset:1px; }
            #welcome-guide-overlay .wg-world-count { color:#7fd4c4; font-size:11px; }
            #welcome-guide-overlay .wg-world-obj { padding:7px 9px; border:1px solid rgba(127,212,196,0.22); border-radius:9px; background:rgba(10,22,26,0.45); }
            #welcome-guide-overlay .wg-world-name { color:#e6f6f2; font-weight:600; font-size:12.5px; }
            #welcome-guide-overlay .wg-world-type { color:#9fb4bd; font-size:11px; margin-left:6px; }
            #welcome-guide-overlay .wg-world-state { color:#ffd479; font-size:11px; margin-left:6px; }
            #welcome-guide-overlay .wg-world-acts { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
            #welcome-guide-overlay .wg-world-act { min-height:26px; min-width:24px; padding:4px 9px; font-size:11px; border-radius:8px; border:1px solid rgba(34,211,238,0.35); background:rgba(16,34,40,0.85); color:#cdeee6; cursor:pointer; }
            #welcome-guide-overlay .wg-world-act:hover { background:rgba(34,211,238,0.18); }
            #welcome-guide-overlay .wg-world-reply { margin-top:10px; padding:9px 12px; border-radius:10px;
              border:1px solid rgba(34,211,238,0.45); background:rgba(12,30,36,0.92); color:#dff6f2;
              font-size:12.5px; line-height:1.45; }
            #welcome-guide-overlay .wg-world-reply b { color:#7fe3ff; }
            #welcome-guide-overlay .wg-world-reply-pending { opacity:0.72; font-style:italic; }
            /* Unavailable verb: visibly present, clearly inert. Contrast is deliberately kept above [REF#UI-01321]
               the 3:1 non-text floor so "dimmed" never becomes "invisible" for low-vision players. */
            #welcome-guide-overlay .wg-world-other { margin-top:8px; opacity:0.9; font-size:12px; }
            #welcome-guide-overlay .wg-world-act-off { opacity:0.42; cursor:not-allowed;
              border-style:dashed; border-color:rgba(148,163,184,0.5); background:rgba(30,41,49,0.55);
              color:#93a4ad; }
            #welcome-guide-overlay .wg-world-act-off:hover { background:rgba(30,41,49,0.55); }
            #welcome-guide-overlay .wg-world-empty { color:#9fb4bd; font-size:12px; }
            #welcome-guide-overlay .wg-settings-cta {
                width: 100%; text-align: left; padding: 12px 16px;
                background: linear-gradient(180deg, rgba(34,211,238,0.10), rgba(34,211,238,0.04));
                border: 1px solid rgba(34,211,238,0.22);
                color: #22d3ee; font-weight: 700; font-size: 13px; cursor: pointer;
                border-radius: 8px; transition: all .15s;
            }
            #welcome-guide-overlay .wg-settings-cta:hover {
                background: linear-gradient(180deg, rgba(34,211,238,0.18), rgba(34,211,238,0.10));
                border-color: rgba(34,211,238,0.45); box-shadow: 0 0 12px rgba(34,211,238,0.25);
            }

            #welcome-guide-overlay .wg-music-settings-page { display: flex; flex-direction: column; gap: 14px; }
            #welcome-guide-overlay .wg-music-control { display: flex; flex-direction: column; gap: 10px; }
            #welcome-guide-overlay .wg-music-toggle-label {
                display: flex; align-items: center; gap: 10px; cursor: pointer;
                color: #daf8ff; font-weight: 500; font-size: 13px;
            }
            #welcome-guide-overlay .wg-music-toggle {
                width: 18px; height: 18px; cursor: pointer; accent-color: #22d3ee;
            }
            #welcome-guide-overlay .wg-music-hint {
                margin: 6px 0 0; color: #7f8794; font-size: 11px; line-height: 1.5;
            }

            #welcome-guide-overlay .wg-audio-settings-page,
            #welcome-guide-overlay .wg-display-settings-page { display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }   /* 2026-09-13: the page outgrew its pad (Minimap twins sat at y≈1156 on an 800px viewport with overflow visible — unreachable); it scrolls like the Words page now */

            #welcome-guide-overlay .wg-stage {
                position: absolute;
                top: 0; left: 0; right: 0;
                bottom: var(--wg-footer-h);
                padding: var(--wg-stage-pad-top) var(--wg-pad) var(--wg-pad);
                box-sizing: border-box;
                overflow: hidden;
            }
            /* Book refactor 2026-05-25 — each slide is a two-page spread [REF#UI-01177]
               (left page + spine + right page). Validator measures both
               page boxes to confirm they're identical across all spreads. */
            #welcome-guide-overlay .wg-slide {
                position: absolute;
                inset: var(--wg-stage-pad-top) var(--wg-pad) var(--wg-pad);
                display: none;
                box-sizing: border-box;
                transform-style: preserve-3d;
            }
            #welcome-guide-overlay .wg-slide.active {
                display: grid;
                grid-template-columns: 1fr 16px 1fr;
                gap: 0;
            }
            #welcome-guide-overlay .wg-page {
                position: relative;
                overflow-y: auto;
                background:
                    radial-gradient(120% 80% at 50% 0%, rgba(34, 211, 238, 0.04) 0%, transparent 60%),
                    linear-gradient(180deg, #25282c 0%, #1a1c20 100%);
                border-radius: 8px;
                box-shadow:
                    inset 1px 1px 2px rgba(255, 255, 255, 0.05),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.5);
                scrollbar-width: thin;
                scrollbar-color: rgba(34, 211, 238, 0.4) transparent;
            }
            #welcome-guide-overlay .wg-page::-webkit-scrollbar { width: 5px; }
            #welcome-guide-overlay .wg-page::-webkit-scrollbar-thumb {
                background: rgba(34, 211, 238, 0.45); border-radius: 3px;
            }
            /* Page edge — soft inner curl shadow on the outside edges (so [REF#UI-01178]
               pages look like they sit either side of a spine). */
            #welcome-guide-overlay .wg-page-left {
                box-shadow:
                    inset 1px 1px 2px rgba(255, 255, 255, 0.05),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.5),
                    inset 8px 0 12px rgba(0, 0, 0, 0.35);
                border-radius: 8px 2px 2px 8px;
            }
            #welcome-guide-overlay .wg-page-right {
                /* INVERTED FLIP, not a mirror (Mark 2026-07-26: "the gradient shouldnt mirror, [REF#UI-01179]
                   because when its flipped it will be an outie, instead its an inverted flip").
                   A plain mirror flips the light lip to the top-RIGHT; under the UI's FIXED
                   top-left light that reads as a raised OUTIE. So keep the bevel lighting
                   IDENTICAL to .wg-page-left (light top-left, dark bottom-right) — both pages
                   catch the light the same way — and flip ONLY the outer-edge groove to the
                   right edge. Both pages then read as the same recessed inner concavity. */
                box-shadow:
                    inset 1px 1px 2px rgba(255, 255, 255, 0.05),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.5),
                    inset -8px 0 12px rgba(0, 0, 0, 0.35);
                border-radius: 2px 8px 8px 2px;
            }
            /* Book spine — vertical fold between the two pages [REF#UI-01180] */
            #welcome-guide-overlay .wg-spine {
                position: relative;
                width: 16px;
                background:
                    linear-gradient(90deg,
                        rgba(0,0,0,0.6) 0%,
                        rgba(0,0,0,0.85) 30%,
                        rgba(34, 211, 238, 0.18) 50%,
                        rgba(0,0,0,0.85) 70%,
                        rgba(0,0,0,0.6) 100%);
                box-shadow:
                    inset 0 0 6px rgba(0, 0, 0, 0.85),
                    0 0 8px rgba(34, 211, 238, 0.15);
            }
            #welcome-guide-overlay .wg-spine::before,
            #welcome-guide-overlay .wg-spine::after {
                content: '';
                position: absolute; left: 50%; transform: translateX(-50%);
                width: 4px; height: 4px; border-radius: 50%;
                background: rgba(34, 211, 238, 0.5);
                box-shadow: 0 0 4px rgba(34, 211, 238, 0.6);
            }
            #welcome-guide-overlay .wg-spine::before { top: 14px; }
            #welcome-guide-overlay .wg-spine::after  { bottom: 14px; }

            /* Inner page padding [REF#UI-01181] */
            #welcome-guide-overlay .wg-page-pad {
                padding: 16px 18px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                height: 100%;
                box-sizing: border-box;
            }
            #welcome-guide-overlay .wg-page-title {
                margin: 0;
                font-family: 'Noto Serif JP', 'Cinzel', serif;
                font-size: 17px;
                font-weight: 700;
                letter-spacing: 1.8px;
                color: #22d3ee;
                text-align: center;
                text-shadow: 0 0 8px rgba(34, 211, 238, 0.55),
                             0 1px 2px rgba(0, 0, 0, 0.7);
            }
            #welcome-guide-overlay .wg-page-sub {
                margin: 0;
                font-size: 10px;
                color: #a4a8ad;
                letter-spacing: 1.2px;
                text-transform: uppercase;
                text-align: center;
            }
            #welcome-guide-overlay .wg-page-h3 {
                margin: 0 0 6px;
                font-family: 'Cinzel', serif;
                font-size: 13px;
                font-weight: 900;
                letter-spacing: 1.5px;
                color: #f5f3ff;
            }
            #welcome-guide-overlay .wg-page-body {
                margin: 0;
                font-size: 12px;
                line-height: 1.5;
                color: #cdcad1;
            }
            #welcome-guide-overlay .wg-page-foot {
                margin-top: auto;
                font-size: 10px;
                color: rgba(34, 211, 238, 0.8);
                font-style: italic;
                text-align: center;
                letter-spacing: 0.5px;
            }

            /* Compact role grid for the book layout — 2 columns × 3-4 rows [REF#UI-01182]
               so 7 cards fit inside one page. */
            #welcome-guide-overlay .wg-role-grid-book {
                grid-template-columns: repeat(2, 1fr) !important;
                gap: 8px !important;
                max-width: 100% !important;
            }
            #welcome-guide-overlay .wg-role-grid-book .wg-role-card {
                min-height: 92px;
            }
            #welcome-guide-overlay .wg-role-grid-book .wg-role-kanji {
                font-size: 34px;
            }
            #welcome-guide-overlay .wg-role-grid-book .wg-role-sub {
                display: none;
            }

            /* Tutorial illustrations — abstracted screenshots of the real [REF#UI-01183]
               panels. Each tutorial spread has a wg-illust block on the
               left page and instructional bullets on the right. */
            #welcome-guide-overlay .wg-illust {
                background: rgba(0, 0, 0, 0.45);
                border: 1px solid rgba(34, 211, 238, 0.25);
                border-radius: 10px;
                padding: 14px;
                box-shadow:
                    inset 2px 2px 6px rgba(0, 0, 0, 0.6),
                    0 0 14px rgba(34, 211, 238, 0.18);
            }
            #welcome-guide-overlay .wg-illust-cap {
                margin: 8px 0 0;
                font-size: 10px;
                color: #a4a8ad;
                text-align: center;
                letter-spacing: 1px;
                text-transform: uppercase;
            }
            /* Deck illustration — 4 colored tiles in a row [REF#UI-01184] */
            #welcome-guide-overlay .wg-illust-deck {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
            }
            #welcome-guide-overlay .wg-illust-tile {
                aspect-ratio: 2 / 3;
                border-radius: 6px;
                background: rgba(20, 20, 25, 0.7);
                border: 1.5px solid rgba(255, 255, 255, 0.1);
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                gap: 4px;
                position: relative;
                box-shadow:
                    4px 4px 8px rgba(0, 0, 0, 0.6),
                    inset 1px 1px 0 rgba(255, 255, 255, 0.08);
            }
            #welcome-guide-overlay .wg-illust-tile span {
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 8px; font-weight: 900;
                letter-spacing: 1.3px;
                padding: 2px 6px;
                border-radius: 3px;
                color: #fff;
            }
            #welcome-guide-overlay .wg-illust-tile i {
                font-family: 'Noto Serif JP', serif;
                font-size: 32px;
                color: rgba(255, 255, 255, 0.18);
                font-style: normal;
            }
            #welcome-guide-overlay .wg-illust-tile.fam-melee  { border-color: rgba(244, 67, 54, 0.5); }
            #welcome-guide-overlay .wg-illust-tile.fam-melee  span { background: #f44336; }
            #welcome-guide-overlay .wg-illust-tile.fam-ranged { border-color: rgba(33, 150, 243, 0.5); }
            #welcome-guide-overlay .wg-illust-tile.fam-ranged span { background: #2196f3; }
            #welcome-guide-overlay .wg-illust-tile.fam-spell  { border-color: rgba(34, 211, 238, 0.5); }
            #welcome-guide-overlay .wg-illust-tile.fam-spell  span { background: #22d3ee; }
            #welcome-guide-overlay .wg-illust-tile.fam-item   { border-color: rgba(34, 211, 238, 0.5); }
            #welcome-guide-overlay .wg-illust-tile.fam-item   span { background: #22d3ee; color: #0a1418; }

            /* Compass illustration [REF#UI-01185] */
            #welcome-guide-overlay .wg-illust-compass {
                display: flex; align-items: center; justify-content: center;
                padding: 8px 0;
            }
            #welcome-guide-overlay .wg-illust-ring {
                position: relative;
                width: 140px; height: 140px;
                border-radius: 50%;
                border: 2px solid rgba(34, 211, 238, 0.3);
                background: radial-gradient(circle at 50% 50%, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.85) 100%);
                box-shadow:
                    inset 4px 4px 12px rgba(0, 0, 0, 0.8),
                    0 0 20px rgba(34, 211, 238, 0.2);
            }
            #welcome-guide-overlay .wg-illust-ring > span {
                position: absolute;
                color: #f5f3ff;
                font-family: 'Cinzel', serif;
                font-weight: 900;
                font-size: 11px;
                text-shadow: 0 0 6px rgba(34, 211, 238, 0.5);
            }
            #welcome-guide-overlay .wg-illust-n { top: 6px;  left: 50%; transform: translateX(-50%); }
            #welcome-guide-overlay .wg-illust-s { bottom: 6px; left: 50%; transform: translateX(-50%); }
            #welcome-guide-overlay .wg-illust-e { right: 6px; top: 50%; transform: translateY(-50%); }
            #welcome-guide-overlay .wg-illust-w { left: 6px;  top: 50%; transform: translateY(-50%); }
            #welcome-guide-overlay .wg-illust-moon {
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                font-size: 28px;
                filter: drop-shadow(0 0 10px rgba(34, 211, 238, 0.7));
            }

            /* Sidebar illustration [REF#UI-01186] */
            #welcome-guide-overlay .wg-illust-sidebar {
                display: flex; justify-content: center;
            }
            #welcome-guide-overlay .wg-illust-hud {
                width: 100%; max-width: 200px;
                background: rgba(20, 22, 24, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 10px;
                display: flex; flex-direction: column; gap: 6px;
                box-shadow:
                    4px 4px 10px rgba(0, 0, 0, 0.7),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.05);
            }
            #welcome-guide-overlay .wg-illust-row {
                display: flex; align-items: center; gap: 6px;
                font-size: 9px; color: #cdcad1; font-weight: 700;
            }
            #welcome-guide-overlay .wg-illust-row b { min-width: 22px; color: #f5f3ff; }
            #welcome-guide-overlay .wg-illust-bar {
                flex: 1; height: 6px;
                background: rgba(0, 0, 0, 0.6);
                border-radius: 3px; overflow: hidden;
                box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.7);
            }
            #welcome-guide-overlay .wg-illust-bar i {
                display: block; height: 100%;
                background: #bc002d;
                box-shadow: 0 0 4px currentColor;
            }
            #welcome-guide-overlay .wg-illust-stats {
                font-size: 8px; gap: 8px;
                color: #a4a8ad; flex-wrap: wrap;
            }
            #welcome-guide-overlay .wg-illust-btn {
                padding: 5px 8px;
                border-radius: 5px;
                font-size: 9px; font-weight: 900;
                letter-spacing: 1px; text-transform: uppercase;
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: #fff; cursor: default;
                opacity: 0.7;
            }
            #welcome-guide-overlay .wg-illust-btn.wg-illust-attack { background: #b71c1c; }
            #welcome-guide-overlay .wg-illust-btn.wg-illust-flee   { background: #d84315; }

            /* Descend CTA now lives inline at the bottom of the Role page [REF#UI-01187] */
            #welcome-guide-overlay .wg-role-right { gap: 12px; }
            #welcome-guide-overlay .wg-role-cta {
                margin-top: auto;
                display: flex; flex-direction: column; align-items: center;
                gap: 8px;
                padding-top: 10px;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
            }

            #welcome-guide-overlay .wg-title {
                font-size: clamp(16px, 2.4vw, 22px);
                font-weight: 900;
                color: #f5f3ff;
                margin: 4px 0 6px 0;
                text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 0 12px rgba(34, 211, 238, 0.4);
                letter-spacing: 0.5px;
                text-align: center;
            }
            #welcome-guide-overlay .wg-title-large { font-size: clamp(20px, 3vw, 28px); }
            #welcome-guide-overlay .wg-subtitle {
                font-size: clamp(11px, 1.4vw, 14px);
                color: #a4a8ad;
                line-height: 1.55;
                margin: 0 0 12px 0;
                font-weight: 500;
                text-align: center;
            }

            /* Slide 0 — TITLE: curved ethereal wordmark + haiku above the [REF#UI-01188]
               goblin brand image (user mandate 2026-05-25). Everything uses
               the ward palette (Noto Serif JP + #22d3ee + cyan glow), same
               family as the loading bloom, PLAY GAME CTA, and class-pill
               ITEM background. */
            /* Slide-0 LEFT page — fills with arc + goblin + haiku stacked. [REF#UI-01189] */
            #welcome-guide-overlay .wg-cover-left {
                position: relative;
                width: 100%;
                height: 100%;
                display: flex; flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                padding: 6px 8px 10px;
                gap: 4px;
                box-sizing: border-box;
                text-align: center;
            }
            /* Goblin wrap fills the available vertical space between arc + haiku. [REF#UI-01190]
               Background blends + brightness lift the checkered JPG against
               the dark page so the figure reads cleanly without an alpha. */
            #welcome-guide-overlay .wg-logo-wrap {
                flex: 1 1 auto;
                width: 100%;
                min-height: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                overflow: hidden;
            }
            /* Curved wordmark arc — outer arc carries the English wordmark, [REF#UI-01191]
               inner arc carries the kanji subtitle. Both centered via the
               textPath startOffset="50%". */
            #welcome-guide-overlay .wg-arc {
                width: 100%;
                max-width: 460px;
                height: auto;
                display: block;
                overflow: visible;
            }
            #welcome-guide-overlay .wg-arc-wordmark {
                /* Big ethereal banner. Sized to fit the arc length in the [REF#UI-01192]
                   349px book page — was clipping at 40/6. 38/2 lands with
                   safe margins while still reading 90% bigger than the
                   original 20px. */
                font-family: 'Noto Serif JP', 'Noto Sans JP', serif;
                font-size: 38px;
                font-weight: 800;
                letter-spacing: 2px;
                fill: #22d3ee;
                filter: drop-shadow(0 0 12px rgba(34, 211, 238, 0.85))
                        drop-shadow(0 0 28px rgba(34, 211, 238, 0.55))
                        drop-shadow(0 0 48px rgba(34, 211, 238, 0.3));
            }
            #welcome-guide-overlay .wg-arc-kanji {
                font-family: 'Noto Serif JP', 'Noto Sans JP', serif;
                font-size: 15px;
                font-weight: 300;
                letter-spacing: 8px;
                fill: #22d3ee;
                opacity: 0.92;
                filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.55));
            }
            /* Haiku — 3 English lines + 1 kanji translation line. Sits [REF#UI-01193]
               between the curved wordmark and the goblin logo. */
            #welcome-guide-overlay .wg-haiku {
                margin: 0 0 6px;
                font-family: 'Noto Serif JP', 'Noto Sans JP', serif;
                font-weight: 300;
                font-size: 11px;
                line-height: 1.5;
                color: rgba(245, 243, 255, 0.82);
                font-style: italic;
                letter-spacing: 0.4px;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
            }
            #welcome-guide-overlay .wg-haiku p { margin: 0; }
            /* ── COVER TIP JAR (2026-10-01) — the donate door in the space under the haiku ───── [REF#PENDING] [REF#UI-01504]
               Deliberately the SAME teal as .wg-donate-btn on the Terms and gratitude spreads and the
               same heart glyph as the stage jar's modal button, so all three read as one action rather
               than three offers. Quieter than those two, though: this one sits on the title art, so it
               is a small outlined pill that lights up on hover, not a filled slab competing with the
               wordmark. margin-top:auto pins it to the bottom of the column — the empty space is
               whatever the art does not use, so the pill finds the floor at any page height. */
            #welcome-guide-overlay .wg-cover-tip {
                margin-top: auto;
                padding-top: 8px;
                display: flex; flex-direction: column; align-items: center; gap: 5px;
                flex: 0 0 auto;
            }
            #welcome-guide-overlay .wg-cover-tip-btn {
                display: inline-flex; align-items: center; gap: 7px;
                padding: 7px 16px; border-radius: 999px;
                font-family: 'Noto Serif JP', 'Noto Sans JP', serif;
                font-size: 11.5px; font-weight: 600; letter-spacing: .06em;
                color: #7dd3fc; text-decoration: none; white-space: nowrap;
                background: rgba(8, 26, 34, 0.55);
                border: 1px solid rgba(34, 211, 238, 0.45);
                box-shadow: 0 0 10px rgba(34, 211, 238, 0.12), inset 0 1px 0 rgba(255,255,255,0.06);
                transition: color .18s ease, background .18s ease, border-color .18s ease,
                            box-shadow .18s ease, transform .18s ease;
            }
            #welcome-guide-overlay .wg-cover-tip-btn:hover,
            #welcome-guide-overlay .wg-cover-tip-btn:focus-visible {
                color: #04222a;
                background: linear-gradient(180deg, #5eead4, #22d3ee);
                border-color: #5eead4;
                box-shadow: 0 5px 18px rgba(34, 211, 238, 0.45);
                transform: translateY(-1px);
            }
            /* The focus ring is the page's, not the browser's default — AAA keyboard visibility on art. [REF#UI-01505] */
            #welcome-guide-overlay .wg-cover-tip-btn:focus-visible { outline: 2px solid #5eead4; outline-offset: 3px; }
            #welcome-guide-overlay .wg-cover-tip-note {
                margin: 0;
                font-family: 'Noto Serif JP', 'Noto Sans JP', serif;
                font-size: 9.5px; font-weight: 300; letter-spacing: .3px;
                color: rgba(245, 243, 255, 0.58);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
            }
            @media (prefers-reduced-motion: reduce) {
                #welcome-guide-overlay .wg-cover-tip-btn { transition: none; }
                #welcome-guide-overlay .wg-cover-tip-btn:hover { transform: none; }
            }
            #welcome-guide-overlay .wg-haiku-kanji {
                margin-top: 3px !important;
                color: #22d3ee;
                font-style: normal !important;
                letter-spacing: 5px;
                font-size: 12px;
                text-shadow: 0 0 8px rgba(34, 211, 238, 0.55),
                             0 0 16px rgba(34, 211, 238, 0.28);
            }
            /* Goblin image fills the wrap. mix-blend-mode: lighten, [REF#UI-01194]
               against the dark page background, lifts the JPG's gray
               checkerboard transparency-pattern so the figure reads
               cleanly without an alpha channel. */
            #welcome-guide-overlay .wg-logo {
                width: 100%;
                height: 100%;
                object-fit: contain;
                mix-blend-mode: lighten;
                filter: contrast(1.08) brightness(1.05)
                        drop-shadow(0 6px 18px rgba(0, 0, 0, 0.6))
                        drop-shadow(0 0 22px rgba(34, 211, 238, 0.35));
            }
            #welcome-guide-overlay .wg-logo[src$="Origami_Underworld_Rock_Opera_Logo.png"] {
                mix-blend-mode: normal;
                filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.6));
            }
            #welcome-guide-overlay .wg-sr-only {
                position: absolute !important;
                width: 1px; height: 1px;
                padding: 0; margin: -1px; overflow: hidden;
                clip: rect(0,0,0,0); white-space: nowrap; border: 0;
            }
            /* Slide-1 RIGHT page — dynamic role profile that picks up the [REF#UI-01195]
               selected role's color theme via the role-card class names
               (r-adventurer, r-wizard, etc.). User mandate 2026-05-25. */
            #welcome-guide-overlay .wg-role-profile {
                --rp-clr: rgba(34, 211, 238, 0.6);
                --rp-bg: linear-gradient(160deg, rgba(25, 18, 45, 0.55) 0%, rgba(6, 4, 14, 0.85) 100%);
                flex: 1 1 auto;
                display: flex; flex-direction: column;
                align-items: center;
                gap: 10px;
                padding: 14px 12px 12px;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: var(--rp-bg);
                box-shadow:
                    inset 1px 1px 2px rgba(255, 255, 255, 0.06),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.5),
                    0 0 18px var(--rp-clr);
                text-align: center;
            }
            #welcome-guide-overlay .wg-role-profile.wg-role-profile-empty {
                justify-content: center;
                background: rgba(18, 18, 24, 0.5);
                border-style: dashed;
                box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.4);
            }
            #welcome-guide-overlay .wg-rp-empty {
                margin: 0;
                font-size: 12px;
                color: #a4a8ad;
                font-style: italic;
                letter-spacing: 0.5px;
            }
            /* Role-page placeholder (user mandate 2026-05-25) — contract [REF#UI-01196]
               mission text + circular CHOOSE YOUR ROLE crest + closing
               hint. Shown until a role card is clicked, then replaced
               by _renderRoleProfile(). */
            #welcome-guide-overlay .wg-rp-placeholder {
                display: flex; flex-direction: column;
                align-items: center; justify-content: space-between;
                gap: 8px;
                width: 100%; height: 100%;
                padding: 4px 2px;
                box-sizing: border-box;
                text-align: center;
            }
            #welcome-guide-overlay .wg-rp-contract {
                margin: 0;
                font-size: 11.5px; line-height: 1.55;
                color: #d8dee9;
            }
            #welcome-guide-overlay .wg-rp-contract b {
                color: #22d3ee;
                text-shadow: 0 0 8px rgba(34, 211, 238, 0.45);
            }
            #welcome-guide-overlay .wg-rp-crest {
                width: 160px; height: 160px;
                display: flex; align-items: center; justify-content: center;
                filter: drop-shadow(0 0 14px rgba(34, 211, 238, 0.35));
            }
            #welcome-guide-overlay .wg-rp-crest-svg {
                width: 100%; height: 100%;
                animation: wg-rp-crest-spin 22s linear infinite;
            }
            @keyframes wg-rp-crest-spin {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
            }
            @media (prefers-reduced-motion: reduce) {
                #welcome-guide-overlay .wg-rp-crest-svg { animation: none; }
            }
            #welcome-guide-overlay .wg-rp-crest-ring-outer,
            #welcome-guide-overlay .wg-rp-crest-ring-inner {
                fill: none;
                stroke: rgba(34, 211, 238, 0.55);
                stroke-width: 1.2;
            }
            #welcome-guide-overlay .wg-rp-crest-ring-inner {
                stroke-dasharray: 3 4;
                stroke-width: 0.9;
            }
            #welcome-guide-overlay .wg-rp-crest-text {
                fill: #22d3ee;
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 13.5px;
                font-weight: 900;
                letter-spacing: 6px;
                text-transform: uppercase;
            }
            #welcome-guide-overlay .wg-rp-crest-kanji {
                fill: #22d3ee;
                font-family: 'Noto Serif JP', 'Noto Sans JP', serif;
                font-size: 48px;
                font-weight: 300;
                opacity: 0.92;
            }
            #welcome-guide-overlay .wg-rp-hint {
                margin: 0;
                font-size: 11px; line-height: 1.5;
                color: #b9c0c9;
            }
            #welcome-guide-overlay .wg-rp-luck {
                margin: 0;
                font-size: 12px;
                color: #22d3ee;
                letter-spacing: 1px;
                text-shadow: 0 0 8px rgba(34, 211, 238, 0.45);
            }
            /* Portrait disc — big kanji on the role-color glow [REF#UI-01197] */
            #welcome-guide-overlay .wg-rp-portrait {
                width: 88px; height: 88px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                background:
                    radial-gradient(circle at 50% 45%, var(--rp-clr) 0%, transparent 70%),
                    linear-gradient(160deg, rgba(25,18,45,0.9), rgba(6,4,14,1));
                border: 2px solid var(--rp-clr);
                box-shadow:
                    0 0 18px var(--rp-clr),
                    inset 1px 1px 2px rgba(255,255,255,0.12),
                    inset -2px -2px 4px rgba(0,0,0,0.55);
            }
            #welcome-guide-overlay .wg-rp-kanji {
                font-family: 'Noto Serif JP', serif;
                font-size: 48px;
                font-weight: 900;
                color: #fff;
                text-shadow:
                    0 0 12px var(--rp-clr),
                    0 0 24px rgba(255,255,255,0.25),
                    0 3px 6px rgba(0,0,0,0.7);
                line-height: 1;
            }
            #welcome-guide-overlay .wg-rp-head {
                display: flex; flex-direction: column; align-items: center; gap: 4px;
            }
            #welcome-guide-overlay .wg-rp-name {
                margin: 0;
                font-family: 'Cinzel Decorative', 'Cinzel', serif;
                font-size: 17px;
                font-weight: 900;
                letter-spacing: 2px;
                color: #fff;
                text-shadow: 0 1px 2px rgba(0,0,0,0.8),
                             0 0 10px var(--rp-clr);
            }
            #welcome-guide-overlay .wg-rp-pill {
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 9px; font-weight: 900;
                letter-spacing: 1.8px;
                padding: 3px 9px;
                border-radius: 4px;
                background: var(--rp-clr);
                color: #fff;
                text-shadow: 0 1px 1px rgba(0,0,0,0.55);
                box-shadow: 0 2px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18);
            }
            #welcome-guide-overlay .wg-rp-oneliner {
                margin: 0;
                font-size: 11px;
                line-height: 1.5;
                color: #cdcad1;
                font-style: italic;
                padding: 0 4px;
            }
            #welcome-guide-overlay .wg-rp-kit-label {
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 9px;
                font-weight: 900;
                letter-spacing: 2px;
                color: var(--rp-clr);
                margin-top: 4px;
                text-shadow: 0 0 6px var(--rp-clr);
            }
            #welcome-guide-overlay .wg-rp-kit {
                list-style: none;
                margin: 0; padding: 0;
                width: 100%;
                display: flex; flex-direction: column; gap: 4px;
            }
            #welcome-guide-overlay .wg-rp-kit li {
                font-size: 11px;
                color: #e8e3d8;
                padding: 5px 10px;
                background: rgba(0,0,0,0.4);
                border-left: 3px solid var(--rp-clr);
                border-radius: 4px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
            }
            /* Per-role profile color tokens — mirror the role-card palette. [REF#UI-01198] */
            #welcome-guide-overlay .wg-role-profile.r-adventurer { --rp-clr: #6366f1; }
            #welcome-guide-overlay .wg-role-profile.r-wizard     { --rp-clr: #06b6d4; }
            #welcome-guide-overlay .wg-role-profile.r-priest     { --rp-clr: #eab308; }
            #welcome-guide-overlay .wg-role-profile.r-ninja      { --rp-clr: #94a3b8; }
            #welcome-guide-overlay .wg-role-profile.r-samurai    { --rp-clr: #bc002d; }
            #welcome-guide-overlay .wg-role-profile.r-archer     { --rp-clr: #22c55e; }
            #welcome-guide-overlay .wg-role-profile.r-gangster   { --rp-clr: #22d3ee; }

            /* ── Page-turn animation (user mandate 2026-05-25) ──────── [REF#UI-01199]
               Animation runs once on the newly-active spread. JS strips
               the direction class on 'animationend' so resting layout
               isn't affected by lingering transforms (was breaking the
               validator's getBoundingClientRect measurement). */
            #welcome-guide-overlay .wg-stage {
                perspective: 1800px;
                perspective-origin: 50% 50%;
            }
            #welcome-guide-overlay .wg-slide.wg-enter-forward .wg-page-left {
                transform-origin: right center;
                animation: wg-page-turn-fwd-left 0.55s cubic-bezier(0.22, 0.61, 0.36, 1);
            }
            #welcome-guide-overlay .wg-slide.wg-enter-forward .wg-page-right {
                animation: wg-page-fade-in 0.55s cubic-bezier(0.22, 0.61, 0.36, 1);
            }
            #welcome-guide-overlay .wg-slide.wg-enter-back .wg-page-right {
                transform-origin: left center;
                animation: wg-page-turn-back-right 0.55s cubic-bezier(0.22, 0.61, 0.36, 1);
            }
            #welcome-guide-overlay .wg-slide.wg-enter-back .wg-page-left {
                animation: wg-page-fade-in 0.55s cubic-bezier(0.22, 0.61, 0.36, 1);
            }
            @keyframes wg-page-turn-fwd-left {
                0%   { opacity: 0; transform: rotateY(92deg); }
                40%  { opacity: 0.8; }
                100% { opacity: 1; transform: rotateY(0deg); }
            }
            @keyframes wg-page-turn-back-right {
                0%   { opacity: 0; transform: rotateY(-92deg); }
                40%  { opacity: 0.8; }
                100% { opacity: 1; transform: rotateY(0deg); }
            }
            @keyframes wg-page-fade-in {
                0%   { opacity: 0; }
                50%  { opacity: 0; }
                100% { opacity: 1; }
            }
            @media (prefers-reduced-motion: reduce) {
                #welcome-guide-overlay .wg-slide.wg-enter-forward .wg-page-left,
                #welcome-guide-overlay .wg-slide.wg-enter-forward .wg-page-right,
                #welcome-guide-overlay .wg-slide.wg-enter-back .wg-page-left,
                #welcome-guide-overlay .wg-slide.wg-enter-back .wg-page-right {
                    animation: wg-page-fade-only 0.2s ease-out !important;
                    transform: none !important;
                }
                @keyframes wg-page-fade-only {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
            }

            /* Slide-0 RIGHT page — welcome lore + T&C + RESTORE. [REF#UI-01200] */
            #welcome-guide-overlay .wg-cover-right {
                padding: 14px 16px;
                gap: 12px;
            }
            #welcome-guide-overlay .wg-lore {
                flex: 1 1 auto;
                overflow-y: auto;
                font-size: 11.5px;
                line-height: 1.6;
                color: #cdcad1;
                display: flex; flex-direction: column;
                justify-content: space-evenly;
                gap: 8px;
                padding-right: 4px;
                scrollbar-width: thin;
                scrollbar-color: rgba(34, 211, 238, 0.4) transparent;
            }
            #welcome-guide-overlay .wg-lore::-webkit-scrollbar { width: 4px; }
            #welcome-guide-overlay .wg-lore::-webkit-scrollbar-thumb {
                background: rgba(34, 211, 238, 0.4); border-radius: 2px;
            }
            #welcome-guide-overlay .wg-lore p { margin: 0; }
            #welcome-guide-overlay .wg-lore b {
                color: #22d3ee;
                font-weight: 800;
                text-shadow: 0 0 6px rgba(34, 211, 238, 0.35);
            }
            #welcome-guide-overlay .wg-lore-warn {
                color: #f87171;
                font-style: italic;
                font-weight: 700;
                text-align: center;
                padding-top: 4px;
                text-shadow: 0 0 6px rgba(248, 113, 113, 0.3);
            }
            #welcome-guide-overlay .wg-cover-warning {
                flex: 0 0 auto;
                margin: 0;
                padding: 4px 4px 2px;
                font-size: clamp(9px, 1.2vh, 11.5px);
                line-height: 1.35;
                overflow-wrap: anywhere;
            }
            /* COVER LORE FIT (Mark 2026-07-26 "toobig of fonts for the intro page right side, its [REF#UI-01201]
               missing text"): the cover packs four lore paragraphs (one long — the Onibaba intro) plus a fixed warning row
               plus the loader/actions into the fixed page, so the SHARED .wg-lore fluid ramp — which
               climbs to ~13px at a short viewport via the (max-height:820px) media block — overflowed
               and dropped the last paragraph + the red warn line. Scope a smaller ramp to the COVER
               only, at higher specificity than the media-query .wg-lore rules so it wins at every
               resolution; flex-start (not space-evenly) so any transient overflow clips from the
               BOTTOM instead of losing the middle. Room/wager lore is untouched. */
            #welcome-guide-overlay .wg-cover-right .wg-lore {
                justify-content: flex-start;
                gap: clamp(3px, 0.7vh, 6px);
            }
            #welcome-guide-overlay .wg-cover-right .wg-lore,
            #welcome-guide-overlay .wg-cover-right .wg-lore p {
                font-size: clamp(9px, 1.2vh, 11.5px);
                line-height: 1.32;
                margin: 0;
            }
            /* COVER TYPE (2026-10-17): the cover is set in the VENDORED faces (assets/fonts/fonts.css) — Inter for [REF#PENDING] [REF#UI-01527]
               body copy, Cinzel for the title — with kerning, ligatures and grayscale anti-aliasing. On the stacked
               phone/tablet layout only the RIGHT page grows (it has free space under the WCAG line); the left page's
               haiku and tip button keep their sizes, because growing them clipped the PayPal button. The slide-0
               prefix out-ranks the media .wg-lore ramps further down. */
            #welcome-guide-overlay .wg-slide[data-slide="0"] {
                text-rendering: optimizeLegibility;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                font-kerning: normal;
                font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
            }
            #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-lore, #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-lore p, #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-warning, #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-tc-row, #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-lore-a11y {
                font-family: 'Inter', system-ui, sans-serif;
            }
            #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-page-title { font-family: 'Cinzel', serif; text-wrap: balance; }
            #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-lore p, #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-warning, #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-lore-a11y { text-wrap: pretty; }
            @media (max-width: 750px), ((pointer: coarse) and (hover: none) and (max-width: 1200px)) {
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-right .wg-lore { gap: clamp(3px, .7vh, 7px); }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-right .wg-lore, #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-right .wg-lore p { font-size: calc(clamp(13px, 3.6vw, 16px) * var(--wg-cover-k, 1)); line-height: 1.45; }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-warning { font-size: calc(clamp(13px, 3.6vw, 16px) * var(--wg-cover-k, 1)); line-height: 1.45; }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-tc-row { font-size: calc(clamp(13px, 3.6vw, 16px) * var(--wg-cover-k, 1)); }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-lore-a11y { font-size: calc(clamp(13px, 3.6vw, 16px) * var(--wg-cover-k, 1)); }
            }
            @media (min-width: 751px) and (not ((pointer: coarse) and (hover: none) and (max-width: 1200px))) {
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-right .wg-lore { gap: clamp(6px, 1.1vh, 11px); }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-right .wg-lore, #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-right .wg-lore p { font-size: clamp(12px, 1.6vh, 15px); line-height: 1.5; }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-warning { font-size: clamp(12px, 1.55vh, 14.5px); line-height: 1.4; }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-haiku { font-size: clamp(13px, 1.7vh, 16px); line-height: 1.55; }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-haiku-kanji { font-size: clamp(14px, 1.8vh, 17px); }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-tip-btn { font-size: clamp(12.5px, 1.6vh, 15px); }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-tip-note { font-size: clamp(11px, 1.35vh, 13px); }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-tc-row { font-size: clamp(12.5px, 1.6vh, 15px); }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-lore-a11y { font-size: clamp(12px, 1.5vh, 14.5px); }
            }
            /* PHONE MEDALLION (2026-10-17): at phone width the cover logo shrinks to a medallion so the Terms [REF#PENDING] [REF#UI-01528]
               checkbox reaches the screen; at 390px the full-size logo pushed it under the footer. */
            @media (max-width: 520px) {
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-logo-wrap { flex: 0 0 auto; height: clamp(110px, 16dvh, 140px); }
            }
            /* ROOMS ON A PHONE/TABLET (2026-10-17): no dark Starlette portrait and no room snapshot on the stacked [REF#PENDING] [REF#UI-01529]
               layout, the "? ? ?" placeholder rows step aside, and the room cards size fluidly (vw clamps) so three
               real rooms show whole on a small phone and the room page's OK button stays on screen. */
            @media (max-width: 750px), ((pointer: coarse) and (hover: none) and (max-width: 1200px)) {
                #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-dorm-art, #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-room-logo-wrap, #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-room-skeleton { display: none !important; }
                #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-rooms-list { gap: clamp(4px, 1.4vw, 8px); }
                #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-room-box:not(:first-child) { display: none !important; }
                #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-room-box { padding: clamp(6px, 2vw, 10px) clamp(8px, 2.6vw, 12px); gap: clamp(6px, 2vw, 10px); min-height: 44px; box-sizing: border-box; }
                #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-room-icon { font-size: clamp(16px, 5vw, 22px); flex: 0 0 auto; }
                #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-room-meta { min-width: 0; }
                #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-room-name { font-size: clamp(12px, 3.6vw, 14px); overflow-wrap: anywhere; }
                #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-room-blurb { font-size: clamp(10.5px, 3vw, 12.5px); overflow-wrap: anywhere; }
            }
            /* MOBILE COVER AFTER LOAD (2026-10-17): once loading ends and the "I agree" row shows, the welcome panel [REF#PENDING] [REF#UI-01530]
               (title, lore, red warning) leaves the phone cover, so only the agree row and the WCAG line remain. */
            @media (max-width: 750px) {
                #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-right > .wg-page-title, #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-right > .wg-lore, #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-right > .wg-cover-warning { display: none !important; }
            }
            /* TRAILER SLOT (2026-10-17): on a phone, once loading ends, the agree row and a 16:9 "TRAILERS GO HERE" frame sit [REF#PENDING] [REF#UI-01531]
               centred as one group — a placeholder for the trailer videos. Hidden on desktop/tablet and while loading. */
            #welcome-guide-overlay .wg-cover-trailer { display: none; }
            @media (max-width: 750px) {
                #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-right { display: flex; flex-direction: column; justify-content: flex-start; align-items: stretch; gap: 12px; height: 100%; min-height: 0; box-sizing: border-box; overflow-y: auto; }
                #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-right > .wg-actions { margin: 0; width: 100%; max-width: none; gap: 10px; padding-top: 12px; }
                #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-right .wg-tc-row { justify-content: center; gap: 14px; font-size: calc(clamp(13px, 3.6vw, 16px) * var(--wg-cover-k, 1)); line-height: 1.45; }
                #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-right .wg-tc-row input[type="checkbox"] { flex: 0 0 auto; margin: 0; }
                #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-right .wg-lore-a11y { font-size: clamp(8px, 2.5vw, 11px); line-height: 1.45; white-space: nowrap; text-wrap: nowrap; letter-spacing: 0; margin: 0; padding: 10px 0 0; }
                #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-trailer {
                    order: -1;
                    display: flex; align-items: center; justify-content: center;
                    width: 100%; box-sizing: border-box;
                    flex: 1 1 0; min-height: 0; aspect-ratio: auto;
                    max-height: 100%;
                    margin: 0;
                    border: 1.5px dashed rgba(34, 211, 238, 0.45); border-radius: 12px;
                    background: rgba(0, 0, 0, 0.35);
                }
                #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-trailer span {
                    font-family: 'Cinzel', serif; font-size: clamp(14px, 4.4vw, 19px); letter-spacing: 0.14em;
                    color: rgba(236, 228, 210, 0.75); text-align: center;
                }
            }
            /* Mobile role portraits fill their page's available height; names stay over the artwork. [REF#UI-01532] */
            @media (max-width: 750px), ((pointer: coarse) and (hover: none) and (max-width: 1200px)) {
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster {
                    display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                    grid-template-rows: minmax(0, 1fr) !important; grid-auto-rows: minmax(0, 1fr) !important;
                    gap: clamp(6px, 1.5vw, 10px) !important; min-height: 0; height: auto !important; flex: 1 1 0 !important;
                    align-content: stretch; margin: 0;
                }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster .wg-role-card {
                    width: 100% !important; height: 100% !important; min-height: 0 !important;
                    aspect-ratio: auto !important; align-self: stretch !important; padding: 0 !important; overflow: hidden;
                }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster .wg-role-card-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster .wg-role-meta {
                    left: 6px !important; right: 6px !important; bottom: 8px !important;
                    align-items: center; padding: 5px 4px 6px !important;
                }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster .wg-role-name {
                    font-size: clamp(10px, 3.1vw, 15px) !important; letter-spacing: 0.02em !important;
                    white-space: nowrap !important; align-self: center !important; text-align: center;
                }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster .wg-role-blurb { display: none !important; }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-page-pad { display: flex; flex-direction: column; }
            }
            #welcome-guide-overlay .wg-kanji {
                margin: 0;
                font-family: 'Noto Serif JP', 'Noto Sans JP', serif;
                font-size: clamp(18px, 2.4vw, 24px);
                font-weight: 300;
                letter-spacing: 8px;
                color: #22d3ee;
                text-shadow: 0 0 12px rgba(34, 211, 238, 0.6),
                             0 0 28px rgba(34, 211, 238, 0.35);
            }
            /* TIGHTENED (Mark 2026-08-15: "too much empty space"). Four separate spacings were stacking [REF#UI-01202]
               between the lore rule and the WCAG line — this block's margin-top + padding-top + gap, and
               then .wg-lore-a11y's own margin-top + padding-top on top of that. Roughly 36px sat between
               the checkbox and one line of 11.5px text. Halved here rather than zeroed: the border-top
               still needs to breathe or the rule collides with the text above it. */
            #welcome-guide-overlay .wg-actions {
                width: 100%; max-width: 540px;
                display: flex; flex-direction: column; align-items: center; gap: 4px;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                padding-top: 5px;
                margin-top: 0;
            }
            /* A-WG1: ONE shared consent/toggle row style. Governs the T&C [REF#UI-01203]
               consent, the inline-terms box, AND the footer consent — identical
               size + alignment for all.
               align-items:center vertically centers the box with its label;
               the 14px gap is the consistent left indent between box and text;
               row spacing is owned by the parent (.wg-actions gap / inline
               margins / footer column gap) so every row stacks consistently. */
            #welcome-guide-overlay .wg-tc-row {
                display: flex; align-items: center; gap: 14px;
                font-size: clamp(10.5px, 1.4vw, 12.5px);
                color: #ebdfff;
                cursor: pointer;
            }
            @keyframes wg-cb-bloom-pulse {
                0% {
                    box-shadow: 
                        3px 3px 6px rgba(0, 0, 0, 0.7),
                        -2px -2px 6px rgba(255, 255, 255, 0.04),
                        inset 1px 1px 2px rgba(255, 255, 255, 0.02),
                        inset -1px -1px 2px rgba(0, 0, 0, 0.4),
                        0 0 8px rgba(34, 211, 238, 0.2),
                        0 0 16px rgba(34, 211, 238, 0.1);
                }
                50% {
                    box-shadow: 
                        3px 3px 6px rgba(0, 0, 0, 0.7),
                        -2px -2px 6px rgba(255, 255, 255, 0.04),
                        inset 1px 1px 2px rgba(255, 255, 255, 0.02),
                        inset -1px -1px 2px rgba(0, 0, 0, 0.4),
                        0 0 16px rgba(34, 211, 238, 0.5),
                        0 0 28px rgba(34, 211, 238, 0.35);
                }
                100% {
                    box-shadow: 
                        3px 3px 6px rgba(0, 0, 0, 0.7),
                        -2px -2px 6px rgba(255, 255, 255, 0.04),
                        inset 1px 1px 2px rgba(255, 255, 255, 0.02),
                        inset -1px -1px 2px rgba(0, 0, 0, 0.4),
                        0 0 8px rgba(34, 211, 238, 0.2),
                        0 0 16px rgba(34, 211, 238, 0.1);
                }
            }
            /* WCAG 2.2 SC 2.5.8 (Target Size, Minimum): >=24x24 CSS px. [REF#UI-01204] */
            #welcome-guide-overlay .wg-tc-row input[type="checkbox"] {
                appearance: none;
                -webkit-appearance: none;
                flex: 0 0 auto;
                width: 24px; height: 24px; min-width: 24px; min-height: 24px;
                margin: 0; cursor: pointer;
                background: #15171a;
                border-radius: 6px;
                display: flex; align-items: center; justify-content: center;
                /* Neumorphic shadow - soft extrusion [REF#UI-01205] */
                box-shadow: 
                    3px 3px 6px rgba(0, 0, 0, 0.7),
                    -2px -2px 6px rgba(255, 255, 255, 0.04),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.02),
                    inset -1px -1px 2px rgba(0, 0, 0, 0.4);
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                outline: none;
                animation: wg-cb-bloom-pulse 2.5s infinite ease-in-out;
            }
            #welcome-guide-overlay .wg-tc-row input[type="checkbox"]::after {
                content: "";
                width: 6px; height: 11px;
                border: solid #22d3ee;
                border-width: 0 2.5px 2.5px 0;
                transform: rotate(45deg) scale(0);
                transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                margin-top: -2px;
                filter: drop-shadow(0 0 2px rgba(34, 211, 238, 0.8));
            }
            #welcome-guide-overlay .wg-tc-row input[type="checkbox"]:checked {
                background: #181b1e;
                /* Neumorphic recessed state + ethereal bloom [REF#UI-01206] */
                box-shadow: 
                    inset 2px 2px 5px rgba(0, 0, 0, 0.8),
                    inset -2px -2px 5px rgba(255, 255, 255, 0.02),
                    0 0 8px rgba(34, 211, 238, 0.8),
                    0 0 16px rgba(34, 211, 238, 0.6);
            }
            #welcome-guide-overlay .wg-tc-row input[type="checkbox"]:checked::after {
                transform: rotate(45deg) scale(1);
            }
            #welcome-guide-overlay .wg-tc-row input[type="checkbox"]:hover {
                background: #1a1d21;
                box-shadow: 
                    2px 2px 4px rgba(0, 0, 0, 0.6),
                    -1px -1px 4px rgba(255, 255, 255, 0.05),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.03),
                    inset -1px -1px 2px rgba(0, 0, 0, 0.3);
            }
            #welcome-guide-overlay .wg-tc-row input[type="checkbox"]:checked:hover {
                background: #1c1f23;
                box-shadow: 
                    inset 2px 2px 5px rgba(0, 0, 0, 0.8),
                    inset -2px -2px 5px rgba(255, 255, 255, 0.02),
                    0 0 12px rgba(34, 211, 238, 0.9),
                    0 0 20px rgba(34, 211, 238, 0.7);
            }
            #welcome-guide-overlay .wg-tc-row input[type="checkbox"]:focus-visible {
                outline: none;
                box-shadow: 
                    3px 3px 6px rgba(0, 0, 0, 0.7),
                    -2px -2px 6px rgba(255, 255, 255, 0.04),
                    0 0 0 2px rgba(34, 211, 238, 0.6);
            }
            #welcome-guide-overlay .wg-tc-row a {
                color: #22d3ee; text-decoration: underline; text-underline-offset: 2px;
                text-shadow: 0 0 6px rgba(34, 211, 238, 0.35);
            }
            #welcome-guide-overlay.is-open,
            #welcome-guide-overlay.is-open * {
                pointer-events: auto !important;
            }
            #welcome-guide-overlay .wg-restore-btn {
                display: inline-flex; align-items: center; justify-content: center; gap: 10px;
                min-height: 48px; padding: 12px 24px;   /* WCAG 2.2 (2.5.8) — 48px min touch target (Mark 2026-06-24) */
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 999px;
                background: var(--wg-bg);
                color: #f5f3ff;
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: clamp(11px, 1.5vmin, 13.5px);
                font-weight: 900; letter-spacing: 2px; text-transform: uppercase;
                cursor: pointer;
                transition: transform 0.18s ease, color 0.2s ease, box-shadow 0.25s ease;
                box-shadow:
                    5px 5px 12px rgba(0, 0, 0, 0.65),
                    -4px -4px 10px rgba(255, 255, 255, 0.05),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.08),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.45);
            }
            #welcome-guide-overlay .wg-restore-btn i { color: rgba(216, 180, 254, 0.9); transform: rotate(-25deg); }
            #welcome-guide-overlay .wg-restore-btn:hover {
                transform: translateY(-1px); color: #ffffff;
                box-shadow:
                    6px 6px 14px rgba(0, 0, 0, 0.75),
                    -5px -5px 12px rgba(255, 255, 255, 0.06),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.10),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.5);
            }
            #welcome-guide-overlay .wg-restore-btn:active {
                transform: translateY(1px);
                box-shadow: inset 4px 4px 8px rgba(0, 0, 0, 0.6), inset -4px -4px 8px rgba(255, 255, 255, 0.05);
            }




            /* Slide 1 — ROLE GRID (kanji trading cards) [REF#UI-01207] */
            #welcome-guide-overlay .wg-role-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 10px;
                width: 100%;
                max-width: 600px;
            }
            /* Role cards — raised 3D neumorphic panels (user mandate [REF#UI-01208]
               2026-05-25). Doubled the shadow offsets and added a top-edge
               glow + bottom-edge ambient so the card pops off the dark
               glass surface like a physical chip. Each layer:
                 12/12px dark drop  → strong depth illusion
                 -6/-6px light bounce → top-left highlight
                 inset top-edge glow → catches simulated overhead light
                 inset bottom shadow → grounds the panel
                 role-color halo on hover → echoes the card's family color
               Selected state inverts to a "pressed in" recessed look. */
            /* ── AAA role roster (2026-06-09): horizontal cards, 3D icon box + meta ── [REF#UI-01209] */
            #welcome-guide-overlay .wg-roster {
                display: grid; grid-template-columns: 1fr; gap: 12px;
                /* Fluid fill (Mark 2026-06-16): the roster grows into the page's empty [REF#UI-01210]
                   vertical space (.wg-page-pad is a full-height flex column) and splits
                   it across the 3 cards so they're equal-height and reach the bottom. */
                flex: 1 1 auto; min-height: 0;
                grid-template-rows: repeat(3, 1fr); grid-auto-rows: 1fr;
            }
            #welcome-guide-overlay .wg-roster .wg-role-card {
                display: block; min-height: 0; height: 100%; width: 100%; padding: 0;
                background: #05090e;
            }
            /* ROLE CARD FOCUS (2026-10-16, CODER 1, Mark: "fix these web responsive versions of our roles ... so the faces and bodies appear, [REF#UI-01533]
               not just the outer scene"): the banners are 3:1 with the character in the right third; a narrow (phone) card cropped from the
               centre showed only scenery. Each role carries a measured focus (ROLES[].focus, inline object-position) on its character. */
            #welcome-guide-overlay .wg-roster .wg-role-card-art {
                display: block; width: 100%; height: 100%; object-fit: cover;
                object-position: center; pointer-events: none;
            }
            #welcome-guide-overlay .wg-roster .wg-role-meta {
                position: absolute; left: 18px; bottom: 14px; z-index: 1;
                display: flex; flex-direction: column; gap: 2px; min-width: 0;
                padding: 7px 12px 8px; border-radius: 7px;
                background: linear-gradient(90deg, rgba(2, 6, 14, 0.92), rgba(2, 6, 14, 0.45));
                text-shadow: 0 2px 4px #000;
            }
            #welcome-guide-overlay .wg-roster .wg-role-iconbox {
                width: 72px; height: 72px; flex-shrink: 0;
                border-radius: 12px; overflow: hidden; position: relative;
                display: flex; align-items: center; justify-content: center;
                background: radial-gradient(circle at center, #1a1a24 0%, #0a0a0c 100%);
                border: 1px solid rgba(34, 211, 238, 0.18);
                box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.8);
            }
            #welcome-guide-overlay .wg-roster .wg-role-iconbox canvas {
                position: absolute; inset: 0; width: 100% !important; height: 100% !important;
                pointer-events: none;
            }
            #welcome-guide-overlay .wg-roster .wg-role-kanji-fallback {
                font-family: 'Noto Serif JP', serif; font-size: 30px; color: #22d3ee;
                text-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
            }
            #welcome-guide-overlay .wg-roster .wg-role-meta {
                display: flex; flex-direction: column; gap: 5px; min-width: 0;
            }
            #welcome-guide-overlay .wg-roster .wg-role-name {
                font-family: 'Cinzel', serif; font-size: 15px; font-weight: 700;
                letter-spacing: 0.5px; color: #f5f3ff; text-transform: uppercase;
                background: none !important; padding: 0 !important; position: static !important;
                box-shadow: none !important; white-space: nowrap; align-self: flex-start;
            }
            #welcome-guide-overlay .wg-roster .wg-role-blurb {
                font-family: 'Outfit', 'Inter', sans-serif; font-size: 12px;
                color: #9aa0a6; line-height: 1.3;
            }
            /* Desktop: three portrait cards per page, with a title and description [REF#UI-01534]
               below the art. Touch layouts retain their existing arrangement. */
            @media (min-width: 751px) and (not ((pointer: coarse) and (hover: none) and (max-width: 1200px))) {
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster {
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    grid-template-rows: minmax(0, 1fr);
                    gap: 10px; align-items: stretch;
                }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-role-card {
                    aspect-ratio: auto; height: 100%; min-width: 0;
                    display: grid; grid-template-rows: minmax(0, 1fr) auto;
                    container-type: inline-size;
                }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-role-card-art {
                    position: static; width: 100%; height: 100%; min-height: 0;
                }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-role-meta {
                    position: static; padding: 10px 6px; gap: 6px;
                    justify-content: flex-start; align-items: center;
                    text-align: center; border-radius: 0; background: #05090e;
                }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-role-name {
                    align-self: center; font-size: clamp(10px, 9cqi, 16px);
                    letter-spacing: 0; white-space: nowrap; overflow-wrap: normal;
                }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-role-blurb {
                    font-size: clamp(10px, 7cqi, 12px); line-height: 1.35;
                    min-height: 4.05em;
                }
            }
            #welcome-guide-overlay .wg-role-card {
                position: relative;
                display: flex; flex-direction: column; align-items: stretch;
                padding: 0; border-radius: 14px;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.10);
                background: linear-gradient(180deg, #2a2c30 0%, var(--wg-bg) 100%);
                color: #fff;
                cursor: pointer;
                font-family: 'Outfit', 'Inter', sans-serif;
                text-align: left;
                min-height: 158px;
                transform: translateZ(0); /* lift onto own compositor layer */
                transition: transform 0.28s cubic-bezier(0.165, 0.84, 0.44, 1),
                            box-shadow 0.28s ease,
                            filter 0.25s ease;
                box-shadow:
                    12px 12px 28px rgba(0, 0, 0, 0.85),
                    -6px -6px 18px rgba(255, 255, 255, 0.06),
                    inset 0 2px 0 rgba(255, 255, 255, 0.12),
                    inset 0 -2px 0 rgba(0, 0, 0, 0.55),
                    inset 1px 1px 0 rgba(255, 255, 255, 0.06),
                    inset -1px -1px 0 rgba(0, 0, 0, 0.4);
                filter: saturate(0.85);
            }
            #welcome-guide-overlay .wg-role-card:hover {
                transform: translateY(-4px);
                filter: saturate(1.10) brightness(1.04);
                box-shadow:
                    16px 16px 34px rgba(0, 0, 0, 0.90),
                    -7px -7px 22px rgba(255, 255, 255, 0.07),
                    inset 0 2px 0 rgba(255, 255, 255, 0.16),
                    inset 0 -2px 0 rgba(0, 0, 0, 0.6),
                    inset 1px 1px 0 rgba(255, 255, 255, 0.08),
                    inset -1px -1px 0 rgba(0, 0, 0, 0.45),
                    0 0 26px var(--role-clr, rgba(34, 211, 238, 0.55));
            }
            #welcome-guide-overlay .wg-role-card:active {
                transform: translateY(0);
                box-shadow:
                    inset 6px 6px 14px rgba(0, 0, 0, 0.7),
                    inset -3px -3px 10px rgba(255, 255, 255, 0.06),
                    0 0 18px var(--role-clr, rgba(34, 211, 238, 0.6));
            }
            #welcome-guide-overlay .wg-role-card.selected-role {
                filter: saturate(1.25) brightness(1.05);
                border-color: var(--role-clr, #67e8f9);
                transform: translateY(0);
                /* Pressed-in recessed look — locked in. [REF#UI-01211] */
                box-shadow:
                    inset 6px 6px 16px rgba(0, 0, 0, 0.7),
                    inset -4px -4px 12px rgba(255, 255, 255, 0.06),
                    0 0 30px var(--role-clr, rgba(34, 211, 238, 0.85));
            }
            #welcome-guide-overlay .wg-role-portrait {
                position: relative;
                flex: 1 1 auto;
                min-height: 76px;
                display: flex; align-items: center; justify-content: center;
                background:
                    radial-gradient(120% 100% at 50% 42%, var(--role-clr, #22d3ee) 0%, transparent 70%),
                    var(--role-bg, linear-gradient(160deg, rgba(25, 18, 45, 0.95) 0%, rgba(6, 4, 14, 1) 100%));
                overflow: hidden;
            }
            #welcome-guide-overlay .wg-role-portrait::after {
                content: ''; position: absolute;
                top: -20%; left: -25%;
                width: 60%; height: 140%;
                background: linear-gradient(125deg,
                    transparent 0%,
                    rgba(255, 255, 255, 0.10) 42%,
                    rgba(255, 255, 255, 0.28) 50%,
                    rgba(255, 255, 255, 0.10) 58%,
                    transparent 100%);
                transform: rotate(8deg);
                pointer-events: none;
                mix-blend-mode: screen;
            }
            #welcome-guide-overlay .wg-role-kanji {
                font-family: 'Noto Serif JP', 'Yu Mincho', serif;
                font-size: 52px;
                font-weight: 900;
                line-height: 1;
                color: #fff;
                text-shadow:
                    0 0 20px var(--role-clr, rgba(34, 211, 238, 0.95)),
                    0 0 40px rgba(255, 255, 255, 0.28),
                    0 3px 6px rgba(0, 0, 0, 0.8);
                z-index: 2;
                position: relative;
            }
            #welcome-guide-overlay .wg-role-name {
                background: linear-gradient(180deg, rgba(0,0,0,0.88), rgba(0,0,0,0.96));
                color: #fff;
                font-family: 'Cinzel', serif;
                font-size: 11px; font-weight: 900;
                letter-spacing: 1.6px;
                text-align: center;
                padding: 6px 4px 5px;
                border-top: 1px solid var(--role-clr, rgba(255, 255, 255, 0.18));
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
            }
            #welcome-guide-overlay .wg-role-sub {
                padding: 6px 8px 6px;
                font-size: 9.5px;
                line-height: 1.4;
                color: #cdcad1;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            #welcome-guide-overlay .wg-role-sub em {
                color: var(--role-clr, #67e8f9);
                font-style: normal; font-weight: 800;
            }
            #welcome-guide-overlay .wg-role-pill {
                align-self: flex-start;
                margin: 0 8px 8px;
                background: var(--role-clr, #22d3ee);
                color: #fff;
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 8px; font-weight: 900;
                letter-spacing: 1.6px;
                padding: 3px 7px;
                border-radius: 3px;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.55);
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.18);
            }
            #welcome-guide-overlay .wg-role-card.r-adventurer { --role-clr: #6366f1; --role-bg: linear-gradient(160deg, #312e81 0%, #0b0c1a 100%); }
            #welcome-guide-overlay .wg-role-card.r-wizard     { --role-clr: #06b6d4; --role-bg: linear-gradient(160deg, #164e63 0%, #06141a 100%); }
            #welcome-guide-overlay .wg-role-card.r-priest     { --role-clr: #eab308; --role-bg: linear-gradient(160deg, #713f12 0%, #1a1304 100%); }
            #welcome-guide-overlay .wg-role-card.r-ninja      { --role-clr: #94a3b8; --role-bg: linear-gradient(160deg, #1e293b 0%, #020617 100%); }
            #welcome-guide-overlay .wg-role-card.r-samurai    { --role-clr: #bc002d; --role-bg: linear-gradient(160deg, #7a0019 0%, #180206 100%); }
            #welcome-guide-overlay .wg-role-card.r-archer     { --role-clr: #22c55e; --role-bg: linear-gradient(160deg, #14532d 0%, #051408 100%); }
            #welcome-guide-overlay .wg-role-card.r-gangster   { --role-clr: #22d3ee; --role-bg: linear-gradient(160deg, #581c87 0%, #16061f 100%); }

            /* Slide 2 — CLASS TILES (MELEE/RANGED/SPELL/ITEM) [REF#UI-01212] */
            #welcome-guide-overlay .wg-class-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                width: 100%;
                max-width: 540px;
            }
            #welcome-guide-overlay .wg-class-tile {
                padding: 14px 14px 12px;
                border-radius: 10px;
                background: var(--wg-bg);
                border: 1px solid rgba(255, 255, 255, 0.08);
                display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
                position: relative;
                box-shadow:
                    4px 4px 12px rgba(0, 0, 0, 0.65),
                    -3px -3px 10px rgba(255, 255, 255, 0.04),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.06),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.5);
            }
            #welcome-guide-overlay .wg-class-pill {
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 10px; font-weight: 900;
                letter-spacing: 1.6px;
                padding: 3px 8px; border-radius: 4px;
                color: #fff;
            }
            #welcome-guide-overlay .wg-class-tile.fam-melee  { border-color: rgba(244, 67, 54, 0.45); }
            #welcome-guide-overlay .wg-class-tile.fam-melee  .wg-class-pill { background: #f44336; }
            #welcome-guide-overlay .wg-class-tile.fam-ranged { border-color: rgba(33, 150, 243, 0.45); }
            #welcome-guide-overlay .wg-class-tile.fam-ranged .wg-class-pill { background: #2196f3; }
            #welcome-guide-overlay .wg-class-tile.fam-spell  { border-color: rgba(34, 211, 238, 0.45); }
            #welcome-guide-overlay .wg-class-tile.fam-spell  .wg-class-pill { background: #22d3ee; }
            #welcome-guide-overlay .wg-class-tile.fam-item   { border-color: rgba(34, 211, 238, 0.45); }
            #welcome-guide-overlay .wg-class-tile.fam-item   .wg-class-pill { background: #22d3ee; color: #0a1418; }
            #welcome-guide-overlay .wg-class-kanji {
                font-family: 'Noto Serif JP', serif;
                font-size: 28px;
                position: absolute; top: 10px; right: 14px;
                color: rgba(255, 255, 255, 0.18);
                line-height: 1;
            }
            #welcome-guide-overlay .wg-class-tile p {
                margin: 4px 0 0 0;
                font-size: 11px; line-height: 1.45;
                color: #cdcad1;
            }

            /* Slide 3 — EXPLORE bullets [REF#UI-01213] */
            #welcome-guide-overlay .wg-bullet-list {
                width: 100%; max-width: 540px;
                margin: 0; padding: 8px 0 0 0;
                list-style: none;
                display: flex; flex-direction: column; gap: 8px;
            }
            #welcome-guide-overlay .wg-bullet-list li {
                position: relative;
                padding: 10px 14px 10px 30px;
                background: var(--wg-bg);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-left: 3px solid rgba(34, 211, 238, 0.55);
                border-radius: 6px;
                font-size: 12px; line-height: 1.5;
                color: #cdcad1;
                box-shadow:
                    3px 3px 8px rgba(0, 0, 0, 0.55),
                    -2px -2px 6px rgba(255, 255, 255, 0.03),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.04),
                    inset -1px -1px 2px rgba(0, 0, 0, 0.4);
            }
            #welcome-guide-overlay .wg-bullet-list li::before {
                content: '◆';
                position: absolute; left: 12px; top: 12px;
                color: #67e8f9;
                font-size: 9px;
            }
            #welcome-guide-overlay .wg-bullet-list li b { color: #f8e8c8; letter-spacing: 0.5px; }

            /* Slide 4 — DESCEND [REF#UI-01214] */
            #welcome-guide-overlay .wg-descend-lore {
                width: 100%; max-width: 540px;
                display: flex; flex-direction: column; align-items: center; gap: 18px;
                margin: auto 0;
            }
            #welcome-guide-overlay .wg-descend-blurb {
                margin: 0; text-align: center;
                font-size: 13px; line-height: 1.6;
                color: #cdcad1;
                font-style: italic;
            }
            #welcome-guide-overlay .wg-descend-btn {
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 20px;
                padding: 12px 32px;
                background: var(--wg-bg);
                color: #fff;
                font-family: 'Outfit', 'Inter', sans-serif;
                font-weight: 900; font-size: 13px;
                letter-spacing: 1.5px;
                cursor: pointer;
                display: flex; align-items: center; gap: 10px;
                box-shadow:
                    6px 6px 14px rgba(0, 0, 0, 0.7),
                    -5px -5px 12px rgba(255, 255, 255, 0.05),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.08),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.5),
                    0 0 18px rgba(34, 211, 238, 0.22);
                transition: transform 0.15s, box-shadow 0.2s, color 0.2s;
            }
            #welcome-guide-overlay .wg-descend-btn:not(:disabled):hover {
                transform: translateY(-1px); color: #fff;
                box-shadow:
                    7px 7px 16px rgba(0, 0, 0, 0.8),
                    -6px -6px 14px rgba(255, 255, 255, 0.06),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.10),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.55),
                    0 0 28px rgba(34, 211, 238, 0.45);
            }
            #welcome-guide-overlay .wg-descend-btn:active {
                transform: translateY(1px);
                box-shadow: inset 4px 4px 10px rgba(0,0,0,0.6), inset -4px -4px 8px rgba(255,255,255,0.05);
            }
            #welcome-guide-overlay .wg-descend-btn:disabled {
                opacity: 0.4; pointer-events: none; cursor: not-allowed;
            }
            /* OK button on a special-room page (cabaret welcome etc.) — reuses the descend CTA look, centered (Mark 2026-06-19) [REF#UI-01215] */
            #welcome-guide-overlay .wg-room-ok-wrap { display: flex; justify-content: center; margin-top: 14px; flex-shrink: 0; }
            /* Room-welcome card: the lore scrolls if it runs long so the MANDATORY OK button is NEVER clipped (Mark 2026-06-20). [REF#UI-01216] */
            #welcome-guide-overlay .wg-room-detail { min-height: 0; height: 100%; }
            #welcome-guide-overlay .wg-room-detail .wg-lore { overflow-y: auto; min-height: 0; flex: 1 1 auto; }
            /* ── Ethereal bloom — CRITICAL mandatory CTAs ONLY (NEXT bloom is in the nav logic; this is OK/AGREE) — Mark 2026-06-20 ── [REF#UI-01217] */
            #welcome-guide-overlay .wg-cta-bloom {
                animation: wg-next-bloom 2.4s ease-in-out infinite;
                box-shadow:
                    0 0 18px rgba(34, 211, 238, 0.7),
                    0 0 36px rgba(34, 211, 238, 0.35),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.18),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.45);
            }
            #welcome-guide-overlay .wg-descend-hint {
                margin: 0;
                font-size: clamp(9px, 1.2vw, 11px);
                color: #a4a8ad;
                letter-spacing: 1.5px;
                text-transform: uppercase;
            }

            /* Nav buttons & footer (Lower Panel) layout [REF#UI-01218] */
            #welcome-guide-overlay .wg-footer {
                position: absolute;
                bottom: 0; left: 0; right: 0;
                height: var(--wg-footer-h);
                padding: 0 var(--wg-pad);
                display: grid;
                grid-template-columns: 1fr minmax(0, 360px) 1fr;
                align-items: center;
                column-gap: 12px;
                box-sizing: border-box;
                background: var(--wg-bg);
                border-bottom-left-radius: 18px;
                border-bottom-right-radius: 18px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
            }
            #welcome-guide-overlay .wg-footer .wg-prev {
                grid-column: 1;
                justify-self: start;
            }
            #welcome-guide-overlay .wg-footer .wg-next {
                grid-column: 3;
                justify-self: end;
            }
            #welcome-guide-overlay .wg-footer-center {
                grid-column: 2;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                gap: 6px; width: 100%; min-width: 0;
            }
            /* ── THE ANSWER TRAY ────────────────────────────────────────────────────────────────── [REF#UI-01329]
               A drawer that hangs off the BOTTOM EDGE of the guidebook and holds every solicited
               answer. Placement history, kept short because each step was a measurement:
                 · in normal flow it grew past the panel's bottom and was clipped in half;
                 · anchored inside the overlay it was legible but had to out-stack the book spread;
                 · at top:100% of the overlay it reported a perfect rect and painted NOTHING, because
                   the overlay clips its children — a screenshot caught what the geometry could not.
               So it lives on <body> with fixed positioning, measured against the guidebook's own rect
               by _wgShowReply on every show. NOTE THE SELECTORS: they are element-scoped, NOT
               descendant-scoped under the overlay — the tray is no longer inside it, and an
               overlay-scoped rule would silently style nothing at all.
               (No backticks anywhere in this comment: it lives inside a template literal.) */
            .wg-reply {
                position: fixed; z-index: 2147482000; pointer-events: auto; box-sizing: border-box;
                display: block; overflow-y: auto; overflow-x: hidden; padding: 10px 14px;
                min-height: 3.4em;   /* two lines plus the action row */
                background-color: #17130e;
                border: 1px solid rgba(212,175,55,0.38); border-radius: 10px;
                background: linear-gradient(180deg, rgba(24,20,14,0.97), rgba(16,13,10,0.97));
                color: #f0e6d2; font-size: 13px; line-height: 1.55;
                box-shadow: 0 10px 26px rgba(0,0,0,0.55);
            }
            .wg-reply[hidden] { display: none; }
            .wg-reply .wg-reply-line { margin: 0 0 6px; }
            .wg-reply .wg-reply-line:last-child { margin-bottom: 0; }
            .wg-reply .wg-reply-eg {
                margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(212,175,55,0.30);
                display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0;
            }
            .wg-reply .wg-reply-eg .wg-pill {
                background: rgba(212,175,55,0.14); border: 1px solid rgba(212,175,55,0.42);
                border-radius: 6px; padding: 4px 10px; color: #ffd98a;
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
                min-height: 24px; min-width: 24px; cursor: pointer; line-height: 1.3;
                transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
            }
            .wg-reply .wg-reply-eg .wg-pill:hover {
                background: rgba(212,175,55,0.26); border-color: rgba(212,175,55,0.70);
            }
            .wg-reply .wg-reply-eg .wg-pill:active { transform: translateY(1px); }
            .wg-reply .wg-reply-eg .wg-pill:focus-visible { outline: 2px solid #ffd98a; outline-offset: 2px; }
            /* An action link reads as a door you walk through; a pill reads as a chip you pick up. [REF#UI-01330]
               They look different because they DO different things — a pill hands you the words and
               waits for your ENTER, an action link runs. Two behaviours wearing one look is how a
               player learns the wrong rule about their own input. */
            .wg-reply .wg-reply-act {
                margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(120,200,255,0.28);
                display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0;
            }
            .wg-reply .wg-reply-act .wg-act {
                background: rgba(56,160,220,0.18); border: 1px solid rgba(120,200,255,0.55);
                border-radius: 999px; padding: 4px 12px; color: #cdeaff;
                font: inherit; font-size: 12px; min-height: 24px; min-width: 24px;
                cursor: pointer; line-height: 1.3;
                transition: background 120ms ease, border-color 120ms ease;
            }
            .wg-reply .wg-reply-act .wg-act:hover {
                background: rgba(56,160,220,0.34); border-color: rgba(160,220,255,0.85);
            }
            .wg-reply .wg-reply-act .wg-act:focus-visible { outline: 2px solid #cdeaff; outline-offset: 2px; }
            #welcome-guide-overlay .wg-footer-input-mount {
                display: flex; align-items: center; justify-content: center;
                width: 100%; max-width: 360px; margin: 0 auto;
            }
            #welcome-guide-overlay .wg-footer-input-mount #input-container {
                width: 100% !important; min-width: 0 !important; max-width: 100% !important;
                margin: 0 !important; border-radius: 22px;
                transform: none !important;
                box-sizing: border-box !important;
            }
            #welcome-guide-overlay .wg-footer-input-mount .chat-pill {
                height: 42px !important;
                padding: 0 8px 0 18px !important;
                display: flex !important; align-items: center !important;
                background: rgba(0, 0, 0, 0.28) !important;
                border: 1px solid rgba(34, 211, 238, 0.18) !important;
                border-radius: 21px !important;
                box-shadow: inset 2px 2px 6px rgba(0, 0, 0, 0.5),
                            inset -1px -1px 2px rgba(255, 255, 255, 0.03) !important;
                transition: border-color 0.2s, box-shadow 0.2s !important;
            }
            #welcome-guide-overlay .wg-footer-input-mount .chat-pill:focus-within {
                border-color: rgba(34, 211, 238, 0.55) !important;
                box-shadow: inset 2px 2px 6px rgba(0, 0, 0, 0.5),
                            0 0 0 2px rgba(34, 211, 238, 0.14),
                            0 0 14px rgba(34, 211, 238, 0.22) !important;
            }
            #welcome-guide-overlay .wg-footer-input-mount .chat-input {
                min-width: 0 !important; font-size: 13px !important;
            }
            #welcome-guide-overlay .wg-footer-input-mount .enter-symbol {
                width: 30px !important; height: 30px !important;
                margin-left: 8px !important; flex: 0 0 auto;
                display: flex !important; align-items: center; justify-content: center;
            }
            #welcome-guide-overlay .wg-footer-input-mount #viewport-readout {
                display: none !important;
            }
            #welcome-guide-overlay .wg-nav-btn {
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: var(--wg-bg);
                color: #b3b7bb;
                border-radius: 18px;
                padding: 8px 20px;
                cursor: pointer;
                font-size: 12px; font-weight: 700;
                letter-spacing: 0.5px;
                box-sizing: border-box;
                box-shadow:
                    4px 4px 10px rgba(0, 0, 0, 0.6),
                    -3px -3px 8px rgba(255, 255, 255, 0.04),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.06),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.4);
                transition: transform 0.15s, color 0.2s, box-shadow 0.2s;
            }
            #welcome-guide-overlay .wg-nav-btn:hover { color: #fff; transform: translateY(-1px); }
            #welcome-guide-overlay .wg-nav-btn:active {
                transform: translateY(1px);
                box-shadow: inset 4px 4px 8px rgba(0,0,0,0.6), inset -4px -4px 8px rgba(255,255,255,0.05);
            }
            #welcome-guide-overlay .wg-dots { display: flex; gap: 10px; justify-content: center; }
            #welcome-guide-overlay .wg-dot {
                /* WCAG 2.5.8 — met outright since the dot row became a 7-dot LOOPING WINDOW [REF#UI-01219]
                   (Mark 2026-08-14). The element is a full 24×24 target; a 6px transparent border
                   plus background-clip:padding-box keeps the PAINTED dot at 12px, and the negative
                   vertical margin keeps the row the same height it always was, so the footer looks
                   unchanged. No exception is claimed any more. */
                width: 24px; height: 24px; box-sizing: border-box; flex: 0 0 24px;
                margin: -6px 0;
                border-radius: 50%;
                border: 7px solid transparent;   /* painted dot 10px inside the 24px target (Mark 2026-10-17: "make smaller to fit holes") */
                background: var(--wg-bg);
                background-clip: padding-box;
                padding: 0;
                cursor: pointer;
                box-shadow:
                    inset 0 0 0 1px rgba(255, 255, 255, 0.55),   /* WCAG 1.4.11 (2026-09-13): the dot's edge was an inset shadow on its own colour (1:1); a 1px ring at ≥3:1 draws the boundary */
                    inset 2px 2px 4px rgba(0, 0, 0, 0.7),
                    inset -1px -1px 2px rgba(255, 255, 255, 0.04);
                transition: background 0.3s, box-shadow 0.3s, transform 0.2s;
            }
            #welcome-guide-overlay .wg-dot:hover {
                box-shadow:
                    inset 2px 2px 4px rgba(0, 0, 0, 0.7),
                    inset -1px -1px 2px rgba(255, 255, 255, 0.04),
                    0 0 6px rgba(34, 211, 238, 0.5);
            }
            #welcome-guide-overlay .wg-dot.active {
                /* background-color, not the background shorthand: the shorthand reset background-clip to border-box and painted the whole 24px target [REF#UI-01535] */
                background-color: #22d3ee;
                box-shadow:
                    0 0 0 1px rgba(255, 255, 255, 0.55),
                    0 0 6px rgba(34, 211, 238, 0.85);
                transform: none;
            }
            #welcome-guide-overlay .wg-play-cta {
                display: inline-flex; align-items: center; gap: 8px;
                padding: 7px 18px;
                border: 1px solid rgba(34, 211, 238, 0.45);
                border-radius: 999px;
                background: var(--wg-bg);
                color: #f5f3ff;
                font-family: 'Cinzel', serif;
                font-size: 11px; font-weight: 900;
                letter-spacing: 2px; text-transform: uppercase;
                cursor: pointer;
                opacity: 1;
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                            box-shadow 0.25s ease, color 0.2s ease, filter 0.25s ease;
                box-shadow:
                    4px 4px 10px rgba(0, 0, 0, 0.6),
                    -3px -3px 8px rgba(255, 255, 255, 0.04),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.08),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.45),
                    0 0 14px rgba(34, 211, 238, 0.25);
            }
            #welcome-guide-overlay .wg-play-cta:disabled {
                cursor: not-allowed;
                filter: grayscale(0.6) brightness(0.7);
                color: #71757a;
                border-color: rgba(255, 255, 255, 0.1);
            }
            #welcome-guide-overlay .wg-play-cta.wg-play-cta-active {
                /* Ethereal lightbloom — teal/cyan double halo for "ready". [REF#UI-01220] */
                color: #f5fbfd;
                border-color: rgba(34, 211, 238, 0.8);
                background: linear-gradient(135deg, #1e293b 0%, #0e2a30 100%);
                box-shadow:
                    0 0 18px rgba(34, 211, 238, 0.7),
                    0 0 36px rgba(34, 211, 238, 0.35),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.18),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.45);
                animation: wg-play-bloom 2.4s ease-in-out infinite;
            }
            @keyframes wg-play-bloom {
                0%, 100% {
                    box-shadow:
                        0 0 18px rgba(34, 211, 238, 0.7),
                        0 0 36px rgba(34, 211, 238, 0.35),
                        inset 1px 1px 2px rgba(255, 255, 255, 0.18),
                        inset -1px -1px 3px rgba(0, 0, 0, 0.45);
                }
                50% {
                    box-shadow:
                        0 0 26px rgba(103, 232, 249, 0.9),
                        0 0 52px rgba(34, 211, 238, 0.55),
                        inset 1px 1px 2px rgba(255, 255, 255, 0.25),
                        inset -1px -1px 3px rgba(0, 0, 0, 0.45);
                }
            }
            #welcome-guide-overlay .wg-play-cta:hover {
                color: #fff; transform: translateY(-1px);
                box-shadow:
                    5px 5px 12px rgba(0, 0, 0, 0.7),
                    -4px -4px 10px rgba(255, 255, 255, 0.05),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.10),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.5),
                    0 0 22px rgba(34, 211, 238, 0.55);
            }
            #welcome-guide-overlay .wg-play-cta:active {
                transform: translateY(1px);
                box-shadow: inset 4px 4px 8px rgba(0,0,0,0.6), inset -4px -4px 8px rgba(255,255,255,0.05);
            }
            #welcome-guide-overlay .wg-play-cta i { color: #22d3ee; }

            /* NEXT button gated by T&C acceptance. Disabled = grayed out, [REF#UI-01221]
               not clickable. Active = cyan glow to pull the eye after T&C. */
            #welcome-guide-overlay .wg-nav-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
                color: #71757a;
                pointer-events: none;
            }
            #welcome-guide-overlay .wg-nav-btn.wg-nav-btn-active {
                color: #22d3ee;
                border-color: rgba(34, 211, 238, 0.45);
                box-shadow:
                    4px 4px 10px rgba(0, 0, 0, 0.6),
                    -3px -3px 8px rgba(255, 255, 255, 0.04),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.08),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.45),
                    0 0 12px rgba(34, 211, 238, 0.4);
            }

            /* Ethereal blue bloom — applied to NEXT when the player picks [REF#UI-01222]
               a role on spread 1, persists on spread 2 where NEXT owns
               the launch action (PLAY GAME was removed). Ported from the
               old PLAY GAME CTA so the same visual language carries over. */
            #welcome-guide-overlay .wg-nav-btn.wg-nav-btn-bloom {
                color: #f5fbfd;
                border-color: rgba(34, 211, 238, 0.8);
                background: linear-gradient(135deg, #1e293b 0%, #0e2a30 100%);
                box-shadow:
                    0 0 18px rgba(34, 211, 238, 0.7),
                    0 0 36px rgba(34, 211, 238, 0.35),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.18),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.45);
                animation: wg-next-bloom 2.4s ease-in-out infinite;
            }
            @keyframes wg-next-bloom {
                0%, 100% {
                    box-shadow:
                        0 0 18px rgba(34, 211, 238, 0.7),
                        0 0 36px rgba(34, 211, 238, 0.35),
                        inset 1px 1px 2px rgba(255, 255, 255, 0.18),
                        inset -1px -1px 3px rgba(0, 0, 0, 0.45);
                }
                50% {
                    box-shadow:
                        0 0 26px rgba(103, 232, 249, 0.9),
                        0 0 52px rgba(34, 211, 238, 0.55),
                        inset 1px 1px 2px rgba(255, 255, 255, 0.25),
                        inset -1px -1px 3px rgba(0, 0, 0, 0.45);
                }
            }
            #welcome-guide-overlay .wg-nav-btn.wg-nav-btn-bloom:hover {
                color: #fff;
                box-shadow:
                    0 0 26px rgba(103, 232, 249, 0.95),
                    0 0 56px rgba(34, 211, 238, 0.6),
                    inset 1px 1px 2px rgba(255, 255, 255, 0.22),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.5);
            }

            /* 2026-06-04 (Worker B, Mark): the [data-slide="2"] footer override was [REF#UI-01223]
               removed along with the deleted .wg-footer — NO per-spread footer rules
               remain. Prev/Next render identically (edge pills) on all 7 spreads. */

            /* ── Spread 2 — RESTORE layout ──────────────────────────── [REF#UI-01224]
               Page 5: saves list (scrollable button rows).
               Page 6: preview pane + RESTORE CTA pinned to the bottom. */
            #welcome-guide-overlay .wg-saves-left { gap: 8px; }
            #welcome-guide-overlay .wg-saves-list {
                flex: 1 1 auto;
                overflow-y: auto;
                display: flex; flex-direction: column; gap: 6px;
                padding-right: 4px;
                scrollbar-width: thin;
                scrollbar-color: rgba(34, 211, 238, 0.4) transparent;
            }
            #welcome-guide-overlay .wg-saves-list::-webkit-scrollbar { width: 4px; }
            #welcome-guide-overlay .wg-saves-list::-webkit-scrollbar-thumb {
                background: rgba(34, 211, 238, 0.4); border-radius: 2px;
            }
            #welcome-guide-overlay .wg-saves-empty {
                margin: auto 0;
                text-align: center;
                font-size: 11px; line-height: 1.55;
                color: #94a3b8;
                font-style: italic;
                padding: 16px 8px;
            }
            #welcome-guide-overlay .wg-saves-empty b {
                color: #22d3ee;
                font-style: normal;
                font-weight: 800;
            }
            #welcome-guide-overlay .wg-save-row {
                display: grid;
                grid-template-columns: auto 1fr auto;
                align-items: center;
                gap: 10px;
                padding: 8px 10px;
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-left: 3px solid rgba(34, 211, 238, 0.4);
                border-radius: 6px;
                color: #cdcad1;
                cursor: pointer;
                text-align: left;
                font-family: 'Outfit', 'Inter', sans-serif;
                transition: transform 0.12s ease, border-color 0.18s ease, box-shadow 0.18s ease;
                box-shadow: inset 1px 1px 2px rgba(255, 255, 255, 0.03);
            }
            #welcome-guide-overlay .wg-save-row:hover {
                transform: translateX(2px);
                border-left-color: #22d3ee;
                box-shadow: 0 0 10px rgba(34, 211, 238, 0.18);
            }
            #welcome-guide-overlay .wg-save-row.selected {
                border-color: rgba(34, 211, 238, 0.6);
                border-left-color: #22d3ee;
                background: linear-gradient(90deg, rgba(34, 211, 238, 0.10), rgba(0, 0, 0, 0.4) 60%);
                box-shadow: 0 0 14px rgba(34, 211, 238, 0.35),
                            inset 1px 1px 2px rgba(255, 255, 255, 0.05);
            }
            /* a slot from an older dungeon (2026-09-27): listed, greyed, selectable only to read or delete [REF#UI-01437] */
            #welcome-guide-overlay .wg-save-row.wg-save-row--old {
                opacity: 0.55;
                filter: grayscale(0.85);
                border-left-color: rgba(148, 163, 184, 0.45);
            }
            #welcome-guide-overlay .wg-save-row.wg-save-row--old .wg-sr-meta { color: #f0b37e; font-style: italic; }
            #welcome-guide-overlay .wg-spv-old {
                margin: 10px 0 0;
                padding: 8px 10px;
                border-left: 3px solid #f0b37e;
                background: rgba(240, 179, 126, 0.08);
                color: #f5d0a9;
                font-size: 0.86em;
                line-height: 1.4;
            }
            #welcome-guide-overlay .wg-saves-actions { display: flex; gap: 8px; }
            #welcome-guide-overlay .wg-saves-actions #wg-restore-btn { flex: 1 1 auto; }
            #welcome-guide-overlay #wg-delete-save-btn { flex: 0 0 auto; border-color: rgba(248, 113, 113, 0.45); color: #fecaca; }
            #welcome-guide-overlay #wg-delete-save-btn:not(:disabled):hover { border-color: #f87171; box-shadow: 0 0 10px rgba(248, 113, 113, 0.3); }
            #welcome-guide-overlay #wg-delete-save-btn:disabled { opacity: 0.4; }
            #welcome-guide-overlay .wg-save-current-btn.wg-save-failed { border-color: #f87171; color: #fecaca; }
            #welcome-guide-overlay .wg-sr-floor {
                font-family: 'Cinzel', serif;
                font-weight: 900;
                font-size: 12px;
                color: #22d3ee;
                background: rgba(34, 211, 238, 0.12);
                padding: 3px 7px;
                border-radius: 4px;
                letter-spacing: 1px;
                text-shadow: 0 0 6px rgba(34, 211, 238, 0.45);
            }
            #welcome-guide-overlay .wg-sr-body {
                display: flex; flex-direction: column; gap: 2px;
                min-width: 0;
            }
            #welcome-guide-overlay .wg-sr-name {
                font-size: 12px; font-weight: 700;
                color: #f5f3ff;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            #welcome-guide-overlay .wg-sr-meta {
                font-size: 9.5px;
                color: #94a3b8;
                letter-spacing: 0.6px;
                text-transform: uppercase;
            }
            #welcome-guide-overlay .wg-sr-when {
                font-size: 9px;
                color: #71757a;
                font-family: 'SF Mono', monospace;
                white-space: nowrap;
            }

            /* Page 6 — preview pane + RESTORE CTA [REF#UI-01225] */
            #welcome-guide-overlay .wg-saves-right { gap: 10px; }
            #welcome-guide-overlay .wg-save-preview {
                flex: 1 1 auto;   /* the dashed placeholder fills the page; a filled card hugs its content (below) */
                overflow-y: auto;
                padding: 12px 14px;
                border-radius: 10px;
                background: linear-gradient(160deg, rgba(25, 18, 45, 0.55) 0%, rgba(6, 4, 14, 0.85) 100%);
                border: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow:
                    inset 1px 1px 2px rgba(255, 255, 255, 0.06),
                    inset -1px -1px 3px rgba(0, 0, 0, 0.5);
                display: flex; flex-direction: column; gap: 10px;
            }
            #welcome-guide-overlay .wg-save-preview:not(.wg-save-preview-empty) { flex: 0 0 auto; overflow: visible; }   /* no half-page of empty card under three rows (2026-09-28) */
            #welcome-guide-overlay .wg-save-preview.wg-save-preview-empty {
                background: rgba(18, 18, 24, 0.5);
                border-style: dashed;
                box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.4);
                justify-content: center;
                align-items: center;
                text-align: center;
            }
            #welcome-guide-overlay .wg-spv-placeholder {
                display: flex; flex-direction: column; align-items: center; gap: 10px;
                padding: 12px 8px;
            }
            #welcome-guide-overlay .wg-spv-icon {
                width: 56px; height: 56px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                background: radial-gradient(circle, rgba(34, 211, 238, 0.18), transparent 70%);
                color: rgba(216, 180, 254, 0.6);
                font-size: 24px;
            }
            #welcome-guide-overlay .wg-spv-hint {
                margin: 0;
                font-size: 11px; line-height: 1.5;
                color: #a4a8ad;
                font-style: italic;
            }
            #welcome-guide-overlay .wg-spv-hint b {
                color: #22d3ee;
                font-style: normal; font-weight: 800;
                text-shadow: 0 0 6px rgba(34, 211, 238, 0.4);
            }
            #welcome-guide-overlay .wg-spv-head {
                display: grid;
                grid-template-columns: auto 1fr auto;
                align-items: center;
                gap: 8px;
            }
            #welcome-guide-overlay .wg-spv-floor {
                font-family: 'Outfit', 'Inter', sans-serif;   /* save-card chips read as UI, not as chapter titles (2026-09-28) */
                font-weight: 800; font-size: 11px;
                color: #22d3ee;
                background: rgba(34, 211, 238, 0.12);
                padding: 3px 8px;
                border-radius: 4px;
                letter-spacing: 1px;
                text-shadow: 0 0 6px rgba(34, 211, 238, 0.5);
            }
            #welcome-guide-overlay .wg-spv-name {
                margin: 0;
                font-family: 'Outfit', 'Inter', sans-serif;   /* was Cinzel Decorative: the blackletter look + a mid-word ellipsis ("GANGST…") read as broken (2026-09-28) */
                font-size: 14px; font-weight: 800; line-height: 1.25;
                color: #f5f3ff;
                letter-spacing: 0.2px;
                overflow: hidden; text-overflow: ellipsis;
                display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal;
            }
            #welcome-guide-overlay .wg-spv-role {
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 9px; font-weight: 900;
                letter-spacing: 1.6px;
                padding: 3px 7px;
                border-radius: 3px;
                background: #22d3ee;
                color: #06202a;   /* dark on cyan: 8:1, no shadow needed (2026-09-28) */
                white-space: nowrap;
            }
            #welcome-guide-overlay .wg-spv-hp {
                display: grid;
                grid-template-columns: auto 1fr auto;
                align-items: center;
                gap: 8px;
                font-size: 10px;
                color: #cdcad1;
            }
            #welcome-guide-overlay .wg-spv-hp-label {
                font-family: 'Outfit', 'Inter', sans-serif;
                font-weight: 900; letter-spacing: 1px;
                color: #f87171;
            }
            #welcome-guide-overlay .wg-spv-hp-bar {
                height: 7px;
                background: rgba(0, 0, 0, 0.6);
                border-radius: 4px;
                overflow: hidden;
                box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.7);
            }
            #welcome-guide-overlay .wg-spv-hp-bar i {
                display: block; height: 100%;
                background: linear-gradient(90deg, #bc002d, #f87171);
                box-shadow: 0 0 6px rgba(248, 113, 113, 0.55);
            }
            #welcome-guide-overlay .wg-spv-hp-num {
                font-family: 'SF Mono', monospace;
                font-size: 10px; font-weight: 700;
                color: #f5f3ff;
            }
            #welcome-guide-overlay .wg-spv-kit-label {
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 9px;
                font-weight: 900;
                letter-spacing: 2px;
                color: #22d3ee;
                margin-top: 4px;
                text-shadow: 0 0 6px rgba(34, 211, 238, 0.4);
            }
            #welcome-guide-overlay .wg-spv-kit {
                list-style: none; margin: 0; padding: 0;
                display: flex; flex-direction: column; gap: 3px;
            }
            #welcome-guide-overlay .wg-spv-kit li {
                font-size: 10.5px;
                color: #e8e3d8;
                padding: 4px 8px;
                background: rgba(0, 0, 0, 0.4);
                border-left: 2px solid rgba(34, 211, 238, 0.4);
                border-radius: 3px;
            }
            #welcome-guide-overlay .wg-spv-more {
                font-style: italic;
                color: #94a3b8;
                border-left-color: rgba(148, 163, 184, 0.4) !important;
            }
            /* RESTORE THIS SAVE — wide CTA at the bottom of page 6. [REF#UI-01226]
               Re-overrides .wg-restore-btn (originally on the cover page)
               so the new in-spread placement has its own pinning + active
               glow. */
            #welcome-guide-overlay .wg-saves-right .wg-restore-btn {
                width: 100%;
                justify-content: center;
            }
            /* SAVE-SPREAD CTAs (2026-09-28: "fix the stupid fonts and ctas"): the cover's 48px glowing pill wrapped RESTORE THIS SAVE onto [REF#UI-01506]
               three lines and drew a second one for DELETE. On this spread the buttons are compact rounded rectangles, one line each, a
               quiet edge instead of the halo. Scoped to the two save pages; the cover PLAY GAME pill is untouched. */
            #welcome-guide-overlay .wg-saves-right .wg-restore-btn,
            #welcome-guide-overlay .wg-saves-left .wg-save-current-btn {
                min-height: 44px; padding: 0 16px; gap: 8px;
                border-radius: 12px;
                font-size: 11px; letter-spacing: 1.2px;
                white-space: nowrap;
                /* Panels.html ships an UNSCOPED .wg-restore-btn (its own welcome-slot "ethereal" button: violet gradient fill, a [REF#UI-01507]
                   double ring and a breathing box-shadow animation). Same class name, so it painted these too — that halo is the
                   purple rim in the 09-28 screenshot. Neutralised here for the save spread only. */
                animation: none;
                background: var(--wg-bg);
                border: 1px solid rgba(255, 255, 255, 0.10);
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06);
            }
            #welcome-guide-overlay .wg-saves-right .wg-restore-btn i,
            #welcome-guide-overlay .wg-saves-left .wg-save-current-btn i { transform: none; font-size: 12px; }
            #welcome-guide-overlay .wg-saves-right .wg-restore-btn:hover,
            #welcome-guide-overlay .wg-saves-left .wg-save-current-btn:hover {
                transform: none; background: var(--wg-bg); border-color: rgba(34, 211, 238, 0.5); color: #ffffff;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.08);
            }
            #welcome-guide-overlay #wg-delete-save-btn:not(:disabled):hover { border-color: #f87171; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55); }
            #welcome-guide-overlay .wg-saves-actions { align-items: stretch; }
            #welcome-guide-overlay #wg-delete-save-btn { padding: 0 14px; width: auto; }   /* the 100% width above is for RESTORE; DELETE hugs its label */
            #welcome-guide-overlay .wg-saves-right .wg-restore-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
                pointer-events: none;
            }
            #welcome-guide-overlay .wg-saves-right .wg-restore-btn.wg-restore-btn-active {
                border-color: rgba(34, 211, 238, 0.7);
                color: #22d3ee;
                background: rgba(34, 211, 238, 0.08);
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06);
            }
            #welcome-guide-overlay .wg-saves-right .wg-restore-btn.wg-restore-btn-active i {
                color: #22d3ee;
            }

            /* ════════════════════════════════════════════════════════════ [REF#UI-01227]
               MONSTER / AVATAR DATABASE (spreads 3-4, pages 7-10)
               Reuses the existing dark-neumorphic palette: cyan #22d3ee,
               purple #22d3ee, the same row/scrollbar treatment as saves.
               ════════════════════════════════════════════════════════════ */
            #welcome-guide-overlay .wg-mdb-left,
            #welcome-guide-overlay .wg-mdb-right { gap: 8px; }

            /* Filter pills — Alphabetical + By-Level [REF#UI-01228] */
            #welcome-guide-overlay .wg-filter-pills {
                display: flex; flex-wrap: wrap; gap: 5px; margin: 2px 0 6px;
            }
            #welcome-guide-overlay .wg-pill {
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
                padding: 3px 9px; border-radius: 999px; cursor: pointer;
                color: #94a3b8;
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow: inset 1px 1px 2px rgba(255,255,255,0.03);
                transition: color 0.15s, border-color 0.18s, box-shadow 0.18s, background 0.18s;
            }
            #welcome-guide-overlay .wg-pill:hover { color: #f5f3ff; border-color: rgba(34,211,238,0.5); }
            #welcome-guide-overlay .wg-pill.active {
                color: #22d3ee;
                background: rgba(34, 211, 238, 0.12);
                border-color: rgba(34, 211, 238, 0.6);
                box-shadow: 0 0 10px rgba(34, 211, 238, 0.3);
            }

            /* Endless scroller — taller than the saves list to fit the codex [REF#UI-01229] */
            #welcome-guide-overlay .wg-mdb-scroller {
                flex: 1 1 auto;
                max-height: 100%;
            }
            #welcome-guide-overlay .wg-mdb-row.wg-mdb-unmapped { opacity: 0.6; }
            #welcome-guide-overlay .wg-mdb-row.wg-mdb-unmapped .wg-sr-name::after {
                content: ' ⚠'; color: #fbbf24; font-size: 10px;
            }

            /* 3D preview canvas [REF#UI-01230] */
            #welcome-guide-overlay .wg-mdb-preview-wrap {
                position: relative; width: 100%; height: 128px;
                border-radius: 10px; overflow: hidden; flex-shrink: 0;
                background:
                    radial-gradient(circle at 50% 35%, rgba(34,211,238,0.10), transparent 70%),
                    linear-gradient(160deg, rgba(25, 18, 45, 0.6) 0%, rgba(6, 4, 14, 0.9) 100%);
                border: 1px solid rgba(255, 255, 255, 0.08);
                box-shadow: inset 1px 1px 2px rgba(255,255,255,0.05), inset -1px -1px 3px rgba(0,0,0,0.5);
            }
            #welcome-guide-overlay .wg-mdb-preview { width: 100%; height: 100%; display: block; }
            /* ZOOM CLUSTER — hidden until the pointer is over the preview (Mark 2026-08-05: "have a zoom [REF#UI-01231]
               in and out that comes out when hover on the 3d model"). It sits on the LEFT so it never
               covers the archetype tag bottom-right, and it fades rather than popping so it does not
               snatch attention away from the model. Keyboard focus reveals it too — a control that only
               exists on hover is invisible to a keyboard, and this page is already tab-navigable. */
            #welcome-guide-overlay .wg-mdb-zoom {
                position: absolute; left: 6px; top: 6px; display: flex; flex-direction: column; gap: 3px;
                opacity: 0; transform: translateX(-4px); pointer-events: none;
                transition: opacity .16s ease, transform .16s ease;
            }
            #welcome-guide-overlay .wg-mdb-preview-wrap:hover .wg-mdb-zoom,
            #welcome-guide-overlay .wg-mdb-zoom:focus-within {
                opacity: 1; transform: translateX(0); pointer-events: auto;
            }
            #welcome-guide-overlay .wg-zoom-btn {
                width: 20px; height: 20px; line-height: 1; padding: 0;
                font-size: 11px; font-weight: 800; cursor: pointer;
                color: #cbd5e1; background: rgba(8,10,16,0.82);
                border: 1px solid rgba(255,255,255,0.14); border-radius: 5px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.6);
                transition: background .12s ease, color .12s ease, border-color .12s ease;
            }
            #welcome-guide-overlay .wg-zoom-btn:hover { background: rgba(34,211,238,0.20); color: #67e8f9; border-color: rgba(34,211,238,0.45); }
            #welcome-guide-overlay .wg-zoom-btn:active { transform: translateY(1px); }
            /* SAVE row — the button plus the receipt it prints. [REF#UI-01232] */
            #welcome-guide-overlay .wg-save-row {
                display: flex; align-items: center; gap: 8px; margin-top: 9px; flex-wrap: wrap;
            }
            #welcome-guide-overlay .wg-save-btn {
                font-size: 9.5px; font-weight: 800; letter-spacing: 0.7px; cursor: pointer;
                padding: 5px 11px; border-radius: 6px; color: #5eead4;
                background: rgba(45, 212, 191, 0.12); border: 1px solid rgba(45, 212, 191, 0.38);
                transition: background .13s ease, color .13s ease, border-color .13s ease;
            }
            #welcome-guide-overlay .wg-save-btn:hover { background: rgba(45, 212, 191, 0.24); color: #99f6e4; border-color: rgba(45, 212, 191, 0.65); }
            #welcome-guide-overlay .wg-save-btn:active { transform: translateY(1px); }
            #welcome-guide-overlay .wg-save-note { font-size: 8.5px; font-weight: 700; letter-spacing: .3px; color: #6b7280; }
            #welcome-guide-overlay .wg-save-note.is-ok  { color: #5eead4; }
            #welcome-guide-overlay .wg-save-note.is-bad { color: #fca5a5; }
            /* the monster page's SAVE sits under all three tabs (2026-10-02); amber while an edit is not saved yet [REF#UI-01508] */
            #welcome-guide-overlay .wg-mon-save-row { margin-top: 12px; padding-top: 9px; border-top: 1px solid rgba(45, 212, 191, 0.22); }
            #welcome-guide-overlay .wg-mon-save-row .wg-save-btn { font-size: 11px; padding: 7px 14px; }
            #welcome-guide-overlay .wg-mon-save-row .wg-save-note { font-size: 10px; line-height: 1.35; flex: 1 1 180px; }
            #welcome-guide-overlay .wg-save-btn.is-dirty { color: #fdba74; background: rgba(251, 146, 60, 0.16); border-color: rgba(251, 146, 60, 0.6); }
            #welcome-guide-overlay .wg-mdb-preview-tag {
                position: absolute; bottom: 6px; right: 8px;
                font-size: 8.5px; font-weight: 800; letter-spacing: 0.8px;
                text-transform: uppercase; color: rgba(216, 180, 254, 0.8);
                background: rgba(0,0,0,0.45); padding: 2px 6px; border-radius: 4px;
                pointer-events: none;
            }

            /* ═══ MONSTER CODEX REFACTOR (Mark 2026-07-19) ═══════════════════════════════════ [REF#UI-01233]
               NOTE FOR FUTURE EDITORS: this whole stylesheet is a JS TEMPLATE LITERAL. A single
               backtick anywhere in here - including inside a comment - terminates the string and
               the CSS after it is evaluated as JavaScript. That shipped once as a mobile-only
               "hidden is not defined". Use single quotes in comments, never backticks. */

            /* Portrait LEFT, monster list RIGHT of it, both on the left page. [REF#UI-01234] */
            #welcome-guide-overlay .wg-mdb-split {
                display: flex; gap: 10px; flex: 1 1 auto; min-height: 0;
            }
            #welcome-guide-overlay .wg-mdb-portrait {
                flex: 0 0 38%; display: flex; flex-direction: column; gap: 6px; min-width: 0;
            }
            #welcome-guide-overlay .wg-mdb-split .wg-mdb-scroller {
                flex: 1 1 62%; min-width: 0;
            }
            /* DENSITY PASS (screenshotted 2026-07-19): monster names were truncating to "Hungry G…" / [REF#UI-01235]
               "Yakuza G…" because the row carried a 3-line archetype blurb that also made every row tall
               enough to push the list into a scroll. Let the NAME wrap to two lines (it is the thing being
               chosen) and clamp the archetype to one. Mark's standing rule: nothing clipped, any resolution. */
            #welcome-guide-overlay .wg-mdb-split .wg-mdb-row { padding: 5px 7px; align-items: center; }
            #welcome-guide-overlay .wg-mdb-split .wg-sr-name {
                white-space: normal; overflow: visible; text-overflow: clip;
                font-size: 11px; line-height: 1.25;
            }
            #welcome-guide-overlay .wg-mdb-split .wg-sr-meta {
                font-size: 8.5px; line-height: 1.3;
                display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
                overflow: hidden;
            }
            #welcome-guide-overlay .wg-mdb-split .wg-sr-when { font-size: 8px; }
            /* SMALLER canvas, but taller than the old 128px strip so a whole body fits the frame. [REF#UI-01236] */
            #welcome-guide-overlay .wg-mdb-preview-sm { height: 210px; }
            #welcome-guide-overlay .wg-mdb-nowplaying {
                font-family: 'SF Mono', monospace; font-size: 9.5px; line-height: 1.4;
                color: #e9d5ff; background: rgba(34, 211, 238, 0.07);
                border: 1px solid rgba(34, 211, 238, 0.16); border-radius: 5px;
                padding: 4px 6px; min-height: 22px; word-break: break-all;
            }
            #welcome-guide-overlay .wg-np-k { color: #22d3ee; font-weight: 700; letter-spacing: 0.6px; }
            #welcome-guide-overlay .wg-np-d { color: #94a3b8; }
            #welcome-guide-overlay .wg-mdb-spinrow { display: flex; gap: 5px; }
            #welcome-guide-overlay .wg-mini-btn {
                flex: 1 1 0; min-height: 24px; cursor: pointer;
                font-family: 'Outfit', 'Inter', sans-serif; font-size: 9px;
                font-weight: 800; letter-spacing: 0.8px;
                color: #cffafe; background: rgba(34, 211, 238, 0.10);
                border: 1px solid rgba(34, 211, 238, 0.28); border-radius: 5px;
                transition: background 0.18s ease, opacity 0.18s ease;
            }
            #welcome-guide-overlay .wg-mini-btn:hover { background: rgba(34, 211, 238, 0.2); }
            #welcome-guide-overlay .wg-mini-btn.off { opacity: 0.45; }

            /* Tabs on the right page. [REF#UI-01237] */
            #welcome-guide-overlay .wg-codex-tabs {
                display: flex; gap: 4px; margin: 0 0 8px; flex-shrink: 0;
            }
            #welcome-guide-overlay .wg-codex-tab {
                flex: 1 1 0; min-height: 26px; cursor: pointer;
                font-family: 'Outfit', 'Inter', sans-serif; font-size: 9.5px;
                font-weight: 900; letter-spacing: 1px;
                color: #94a3b8; background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 6px 6px 0 0;
                transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease;
            }
            #welcome-guide-overlay .wg-codex-tab:hover { color: #cffafe; }
            #welcome-guide-overlay .wg-codex-tab.active {
                color: #22d3ee; background: rgba(34, 211, 238, 0.12);
                border-color: rgba(34, 211, 238, 0.42);
                text-shadow: 0 0 7px rgba(34, 211, 238, 0.5);
            }
            #welcome-guide-overlay .wg-codex-panel { display: none; }
            #welcome-guide-overlay .wg-codex-panel.active {
                display: flex; flex-direction: column; gap: 7px;
                flex: 1 1 auto; min-height: 0; overflow-y: auto;
                /* SCROLL AFFORDANCE. These panels are legitimately taller than the guide modal, so they [REF#UI-01238]
                   scroll — but a hard-cut edge reads as BROKEN rather than scrollable (the first screenshot
                   cut mid-"WHEN HIT"). A bottom fade + a visible slim scrollbar says "there is more". */
                -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 18px), transparent 100%);
                mask-image: linear-gradient(to bottom, #000 calc(100% - 18px), transparent 100%);
                scrollbar-width: thin;
                scrollbar-color: rgba(34,211,238,0.45) transparent;
                padding-bottom: 14px;
            }
            #welcome-guide-overlay .wg-codex-panel.active::-webkit-scrollbar { width: 6px; }
            #welcome-guide-overlay .wg-codex-panel.active::-webkit-scrollbar-track { background: transparent; }
            #welcome-guide-overlay .wg-codex-panel.active::-webkit-scrollbar-thumb {
                background: rgba(34,211,238,0.4); border-radius: 3px;
            }
            /* Tighter editor rhythm so far more fits before any scrolling is needed at all. [REF#UI-01239] */
            #welcome-guide-overlay .wg-codex-panel .wg-clip-row { margin: 0 0 5px; }
            #welcome-guide-overlay .wg-codex-panel .wg-clip-label { line-height: 1.25; }
            #welcome-guide-overlay .wg-codex-panel .wg-anim-item { margin: 1px 0; }
            #welcome-guide-overlay .wg-codex-panel .wg-sound-row { min-height: 24px; }

            /* Key/value spec rows (GLB info + combat attributes). [REF#UI-01240] */
            #welcome-guide-overlay .wg-kv-rows { display: flex; flex-direction: column; gap: 4px; }
            #welcome-guide-overlay .wg-kv {
                display: grid; grid-template-columns: 84px 1fr; gap: 7px;
                align-items: start; font-size: 10.5px; line-height: 1.45;
            }
            #welcome-guide-overlay .wg-kv-k {
                font-family: 'Outfit', 'Inter', sans-serif; font-size: 9px;
                font-weight: 800; letter-spacing: 0.7px; text-transform: uppercase;
                color: #94a3b8; padding-top: 1px;
            }
            #welcome-guide-overlay .wg-kv-v { color: #e2e8f0; min-width: 0; word-break: break-word; }
            #welcome-guide-overlay .wg-kv-v code {
                font-family: 'SF Mono', monospace; font-size: 9.5px;
                color: #a5f3fc; background: rgba(34, 211, 238, 0.09);
                padding: 1px 4px; border-radius: 3px;
            }
            #welcome-guide-overlay .wg-kv-ref {
                display: block; font-family: 'SF Mono', monospace; font-size: 8.5px;
                color: #64748b; margin-top: 2px;
            }

            /* Animation editor annotations. [REF#UI-01241] */
            #welcome-guide-overlay .wg-anim-reset {
                display: flex; gap: 5px; margin: 0 0 7px;
            }
            #welcome-guide-overlay .wg-anim-reset .wg-mini-btn:disabled {
                opacity: 0.35; cursor: default;
            }
            #welcome-guide-overlay .wg-anim-src {
                font-size: 10px; line-height: 1.45; color: #94a3b8; margin: 0 0 6px;
            }
            #welcome-guide-overlay .wg-anim-src b { color: #cbd5e1; }
            #welcome-guide-overlay .wg-anim-drift {
                font-size: 10.5px; line-height: 1.45; margin: 0 0 6px; padding: 5px 7px;
                border-left: 2px solid #f59e0b; background: rgba(245, 158, 11, 0.09);
                color: #fcd34d; border-radius: 0 4px 4px 0;
            }
            #welcome-guide-overlay .wg-anim-dead {
                font-style: normal; font-size: 8px; font-weight: 800; letter-spacing: 0.5px;
                color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.42);
                border-radius: 3px; padding: 0 3px; margin-left: 5px; white-space: nowrap;
            }
            #welcome-guide-overlay .wg-clip-sub {
                display: block; font-size: 9px; line-height: 1.35; opacity: 0.5;
                font-weight: 400; letter-spacing: 0; text-transform: none; margin-top: 1px;
            }
            #welcome-guide-overlay .wg-anim-play.playing {
                background: rgba(34, 211, 238, 0.3); border-color: #22d3ee;
            }
            #welcome-guide-overlay .wg-ai-dead {
                font-size: 10px; line-height: 1.45; margin: 0 0 5px; padding: 5px 7px;
                border-left: 2px solid #f59e0b; background: rgba(245, 158, 11, 0.09);
                color: #fcd34d; border-radius: 0 4px 4px 0;
            }

            /* Sound FX tab. [REF#UI-01242] */
            #welcome-guide-overlay .wg-sfx-list { display: flex; flex-direction: column; gap: 8px; }
            #welcome-guide-overlay .wg-sfx-group-head {
                font-family: 'Outfit', 'Inter', sans-serif; font-size: 9px;
                font-weight: 900; letter-spacing: 1.1px; text-transform: uppercase;
                color: #22d3ee; margin: 0 0 3px;
                border-bottom: 1px solid rgba(34, 211, 238, 0.16); padding-bottom: 2px;
            }
            #welcome-guide-overlay .wg-sfx-row {
                display: grid; grid-template-columns: 1fr auto 22px; gap: 6px;
                align-items: center; font-size: 10px; line-height: 1.4;
                padding: 2px 0; min-height: 20px;
            }
            #welcome-guide-overlay .wg-sfx-row.is-silent { opacity: 0.5; }
            #welcome-guide-overlay .wg-sfx-ev { color: #e2e8f0; min-width: 0; }
            #welcome-guide-overlay .wg-sfx-ev b { color: #fde68a; }
            #welcome-guide-overlay .wg-sfx-file {
                font-family: 'SF Mono', monospace; font-size: 8.5px;
                color: #94a3b8; white-space: nowrap; cursor: help;
                overflow: hidden; text-overflow: ellipsis; max-width: 130px;
            }
            #welcome-guide-overlay .wg-sfx-none { color: #64748b; text-align: center; }
            #welcome-guide-overlay .wg-sfx-note {
                font-size: 9.5px; line-height: 1.5; color: #94a3b8;
                margin-top: 6px; padding-top: 5px;
                border-top: 1px solid rgba(255, 255, 255, 0.07);
            }
            #welcome-guide-overlay .wg-sfx-note b { color: #cbd5e1; }
            #welcome-guide-overlay .wg-sfx-note code {
                font-family: 'SF Mono', monospace; font-size: 9px; color: #a5f3fc;
            }

            /* Narrow / mobile: portrait stacks above the list, tabs stay one row. [REF#UI-01243] */
            @media (max-width: 720px), (max-height: 560px) {
                #welcome-guide-overlay .wg-mdb-split { flex-direction: column; gap: 7px; }
                #welcome-guide-overlay .wg-mdb-portrait { flex: 0 0 auto; }
                #welcome-guide-overlay .wg-mdb-preview-sm { height: 150px; }
                #welcome-guide-overlay .wg-kv { grid-template-columns: 70px 1fr; }
                #welcome-guide-overlay .wg-codex-tab { font-size: 8.5px; letter-spacing: 0.5px; }
            }

            /* ── ORIGAMI SLOTS spread (Mark 2026-06-16): bigger, fuller, win loot & gold ── [REF#UI-01244] */
            #welcome-guide-overlay .wg-slots-page { gap: 12px; justify-content: flex-start; }
            #welcome-guide-overlay .wg-slots-title { font-size: 23px; letter-spacing: 2.4px; }
            #welcome-guide-overlay .wg-slots-sub { font-size: 12px; letter-spacing: 1.6px; }
            #welcome-guide-overlay .wg-slots-hook {
                margin: 2px 0 0; text-align: center; font-size: 15.5px; line-height: 1.5; color: #e9e7ef; font-weight: 600;
            }
            #welcome-guide-overlay .wg-slots-hook b { color: #ffd34d; font-weight: 800; text-shadow: 0 0 9px rgba(255,211,77,.45); }
            #welcome-guide-overlay .wg-slots-prizes { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-direction: column; gap: 11px; }
            #welcome-guide-overlay .wg-slots-prizes li {
                display: flex; align-items: center; gap: 13px; padding: 11px 14px; border-radius: 13px;
                background: linear-gradient(180deg, rgba(255,211,77,.08), rgba(10,16,22,.5));
                border: 1px solid rgba(255,211,77,.20);
                box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 3px 10px rgba(0,0,0,.3);
            }
            #welcome-guide-overlay .wg-prize-ic { font-size: 28px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
            #welcome-guide-overlay .wg-prize-tx { display: flex; flex-direction: column; gap: 1px; }
            #welcome-guide-overlay .wg-prize-tx b { font-size: 16px; letter-spacing: 1.2px; color: #ffd863; font-weight: 800; }
            #welcome-guide-overlay .wg-prize-tx i { font-size: 11.5px; font-style: normal; color: #b9b6c0; }
            #welcome-guide-overlay .wg-slots-foot { margin: auto 0 0; text-align: center; font-size: 13px; line-height: 1.55; color: #cdcad1; }
            #welcome-guide-overlay .wg-slots-coming { margin: 6px 0 0; text-align: center; font-size: 12.5px; color: #b9b6c0; }
            #welcome-guide-overlay .wg-slot-spin-btn { font-size: 15.5px; font-weight: 800; letter-spacing: 1px; padding: 13px; }
            /* taller, brighter 3D slot frame [REF#UI-01245] */
            #welcome-guide-overlay .wg-slot-preview-wrap {
                position: relative; width: 100%; height: 220px; border-radius: 14px; overflow: hidden; flex-shrink: 0;
                background:
                    radial-gradient(circle at 50% 38%, rgba(255,211,77,0.10), transparent 68%),
                    linear-gradient(165deg, rgba(28,20,48,0.7) 0%, rgba(6,4,14,0.95) 100%);
                border: 1px solid rgba(255,211,77,0.18);
                box-shadow: inset 1px 1px 2px rgba(255,255,255,0.06), inset -1px -1px 4px rgba(0,0,0,0.6), 0 6px 20px rgba(0,0,0,.4);
            }
            #welcome-guide-overlay .wg-slot-preview-canvas { width: 100%; height: 100%; display: block; cursor: pointer; }

            /* Stat dashboard — three cards [REF#UI-01246] */
            #welcome-guide-overlay .wg-stat-row {
                display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
                flex-shrink: 0;
            }
            #welcome-guide-overlay .wg-stat-card {
                display: flex; flex-direction: column; align-items: center; gap: 2px;
                padding: 6px 4px; border-radius: 8px;
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.06);
                box-shadow: inset 1px 1px 2px rgba(255,255,255,0.03);
            }
            #welcome-guide-overlay .wg-stat-k {
                font-size: 8px; font-weight: 800; letter-spacing: 1px;
                text-transform: uppercase; color: #71757a;
            }
            #welcome-guide-overlay .wg-stat-v {
                font-size: 11px; font-weight: 800; color: #22d3ee;
                text-align: center; line-height: 1.15;
            }

            /* Element vulnerability strip [REF#UI-01247] */
            #welcome-guide-overlay .wg-vuln-strip {
                display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px;
                flex-shrink: 0;
            }
            #welcome-guide-overlay .wg-vuln-cell {
                display: flex; flex-direction: column; align-items: center; gap: 1px;
                padding: 4px 2px; border-radius: 6px;
                background: hsla(var(--vh, 60), 70%, 45%, 0.16);
                border: 1px solid hsla(var(--vh, 60), 70%, 55%, 0.5);
            }
            #welcome-guide-overlay .wg-vuln-icon {
                font-size: 12px; color: hsl(var(--vh, 60), 80%, 70%);
                line-height: 1;
            }
            #welcome-guide-overlay .wg-vuln-pct {
                font-size: 8.5px; font-weight: 800;
                color: hsl(var(--vh, 60), 75%, 78%);
                font-family: 'SF Mono', monospace;
            }
            #welcome-guide-overlay .wg-vuln-empty {
                font-size: 10px; color: #71757a; font-style: italic;
            }

            /* Clip → action editor + designer note [REF#UI-01248] */
            #welcome-guide-overlay .wg-editor {
                flex: 1 1 auto; min-height: 0; overflow-y: auto;
                display: flex; flex-direction: column; gap: 6px;
                padding: 8px 10px; border-radius: 10px;
                background: rgba(0, 0, 0, 0.32);
                border: 1px solid rgba(34, 211, 238, 0.22);
                box-shadow: inset 1px 1px 2px rgba(255,255,255,0.04);
                scrollbar-width: thin;
                scrollbar-color: rgba(34, 211, 238, 0.4) transparent;
            }
            #welcome-guide-overlay .wg-editor::-webkit-scrollbar { width: 4px; }
            #welcome-guide-overlay .wg-editor::-webkit-scrollbar-thumb {
                background: rgba(34, 211, 238, 0.4); border-radius: 2px;
            }
            #welcome-guide-overlay .wg-editor-head {
                font-size: 8.5px; font-weight: 800; letter-spacing: 1.2px;
                text-transform: uppercase; color: #67e8f9;
            }
            #welcome-guide-overlay .wg-clip-rows,
            #welcome-guide-overlay .wg-av-section { display: flex; flex-direction: column; gap: 5px; }
            #welcome-guide-overlay .wg-clip-row,
            #welcome-guide-overlay .wg-clip-notes-row {
                display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: 6px;
            }
            #welcome-guide-overlay .wg-clip-label,
            #welcome-guide-overlay .wg-clip-notes-row > span {
                font-size: 10px; font-weight: 700; color: #cdcad1;
            }
            #welcome-guide-overlay .wg-clip-input {
                width: 100%; box-sizing: border-box;
                font-family: 'SF Mono', monospace; font-size: 10px;
                padding: 4px 7px; border-radius: 6px;
                color: #f5f3ff;
                background: rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
                transition: border-color 0.18s, box-shadow 0.18s;
            }
            #welcome-guide-overlay .wg-clip-input::placeholder { color: #5b6068; font-style: italic; }
            #welcome-guide-overlay .wg-clip-input:focus {
                outline: none;
                border-color: rgba(34, 211, 238, 0.6);
                box-shadow: 0 0 8px rgba(34, 211, 238, 0.3);
            }
            #welcome-guide-overlay .wg-sound-rows {
                display: flex; flex-direction: column; gap: 5px;
            }
            #welcome-guide-overlay .wg-sound-row {
                display: grid; grid-template-columns: 72px minmax(0, 1fr) 28px; align-items: center; gap: 5px;
            }
            #welcome-guide-overlay .wg-sound-label {
                font-size: 8.5px; font-weight: 800; letter-spacing: .35px; color: #cdcad1;
            }
            #welcome-guide-overlay .wg-sound-select {
                min-width: 0; text-overflow: ellipsis;
            }
            #welcome-guide-overlay .wg-sound-play {
                min-width: 28px; min-height: 24px; border-radius: 6px; cursor: pointer;
                color: #67e8f9; background: rgba(8, 25, 34, .88);
                border: 1px solid rgba(34, 211, 238, .35);
                box-shadow: 0 0 8px rgba(34, 211, 238, .08);
            }
            #welcome-guide-overlay .wg-sound-play:hover,
            #welcome-guide-overlay .wg-sound-play:focus-visible {
                color: #fff; border-color: rgba(103, 232, 249, .8);
                box-shadow: 0 0 10px rgba(34, 211, 238, .3); outline: none;
            }
            #welcome-guide-overlay .wg-editor-foot {
                font-size: 9px; line-height: 1.45; color: #94a3b8; font-style: italic;
                margin: 2px 0 0;
            }

            /* Avatar DB right page [REF#UI-01249] */
            #welcome-guide-overlay .wg-av-designs {
                list-style: none; margin: 0; padding: 0;
                display: flex; flex-direction: column; gap: 3px;
            }
            #welcome-guide-overlay .wg-av-designs li {
                font-size: 10px; color: #cdcad1; padding-left: 14px; position: relative;
            }
            #welcome-guide-overlay .wg-av-designs li::before {
                content: '◆'; position: absolute; left: 0; color: #22d3ee; font-size: 8px; top: 2px;
            }
            #welcome-guide-overlay .wg-av-roles { display: flex; flex-wrap: wrap; gap: 5px; }
            #welcome-guide-overlay .wg-av-role-chip {
                font-size: 9px; font-weight: 800; letter-spacing: 0.5px;
                padding: 3px 8px; border-radius: 999px;
                color: var(--rp-clr, #94a3b8);
                background: color-mix(in srgb, var(--rp-clr, #94a3b8) 14%, transparent);
                border: 1px solid color-mix(in srgb, var(--rp-clr, #94a3b8) 50%, transparent);
            }
            /* Map the role palette onto the chips (mirrors wg-role-profile vars) [REF#UI-01250] */
            #welcome-guide-overlay .wg-av-role-chip.r-adventurer { --rp-clr: #6366f1; }
            #welcome-guide-overlay .wg-av-role-chip.r-wizard     { --rp-clr: #06b6d4; }
            #welcome-guide-overlay .wg-av-role-chip.r-priest     { --rp-clr: #eab308; }
            #welcome-guide-overlay .wg-av-role-chip.r-ninja      { --rp-clr: #94a3b8; }
            #welcome-guide-overlay .wg-av-role-chip.r-samurai    { --rp-clr: #bc002d; }
            #welcome-guide-overlay .wg-av-role-chip.r-archer     { --rp-clr: #22c55e; }
            #welcome-guide-overlay .wg-av-role-chip.r-gangster   { --rp-clr: #22d3ee; }

            /* SETUP button — sits under the footer dots, cyan nav family [REF#UI-01251] */
            #welcome-guide-overlay .wg-setup-btn {
                margin-top: 7px; font-size: 10px; font-weight: 800;
                letter-spacing: 1px; padding: 4px 14px;
                display: inline-flex; align-items: center; gap: 6px;
            }
            #welcome-guide-overlay .wg-setup-btn i { font-size: 10px; }

            /* ═══════════════════════════════════════════════════════════ [REF#UI-01252]
               CHARACTER SHEET + EQUIPMENT (spreads 5-6, pages 11-14)
               Worker-Inv 2026-06-01. Reuses the existing stat-card /
               save-row / mdb-scroller palette — no new color tokens.
               ═══════════════════════════════════════════════════════════ */
            /* — Character portrait + identity (page 11) — [REF#UI-01253] */
            #welcome-guide-overlay .wg-char-portrait { flex: 1 1 auto; min-height: 0; }
            #welcome-guide-overlay .wg-char-id {
                display: flex; align-items: center; gap: 10px;
                margin-top: 10px; flex-shrink: 0;
            }
            #welcome-guide-overlay .wg-char-kanji {
                font-family: 'Cinzel', serif; font-weight: 900; font-size: 22px;
                color: #22d3ee; text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
                line-height: 1;
            }
            #welcome-guide-overlay .wg-char-name {
                font-family: 'Cinzel', serif; font-weight: 800; font-size: 15px;
                letter-spacing: 1.5px; color: #f5f3ff;
            }
            /* — Ability score grid (page 12) — [REF#UI-01254] */
            #welcome-guide-overlay .wg-attr-grid {
                display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
            }
            #welcome-guide-overlay .wg-attr-cell {
                display: flex; flex-direction: column; align-items: center; gap: 1px;
                padding: 5px 2px; border-radius: 7px;
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.06);
            }
            #welcome-guide-overlay .wg-attr-k {
                font-size: 8px; font-weight: 800; letter-spacing: 1px; color: #71757a;
            }
            #welcome-guide-overlay .wg-attr-v { font-size: 14px; font-weight: 800; color: #f5f3ff; }
            #welcome-guide-overlay .wg-attr-mod {
                font-size: 8.5px; font-weight: 700; color: #22d3ee;
                font-family: 'SF Mono', monospace;
            }
            #welcome-guide-overlay .wg-eq-ac { color: #22d3ee; font-weight: 800; font-size: 9.5px; }
            #welcome-guide-overlay .wg-eq-empty { color: #71757a; font-style: italic; }

            /* — Equipment slots (page 13) — [REF#UI-01255] */
            #welcome-guide-overlay .wg-equip-interactive-area {
                display: flex;
                flex-direction: row;
                gap: 12px;
                align-items: stretch;
                justify-content: space-between;
                height: calc(100% - 45px);
                width: 100%;
                box-sizing: border-box;
            }
            #welcome-guide-overlay .mannequin-part {
                transition: fill 0.3s ease, stroke-width 0.3s ease, filter 0.3s ease;
            }
            #welcome-guide-overlay .mannequin-part:hover {
                fill: rgba(34, 211, 238, 0.3);
                stroke-width: 2.0;
                filter: drop-shadow(0 0 4px #22d3ee);
            }
            #welcome-guide-overlay .wg-equip-interactive-area:has([data-slot="HEAD"]:hover) .part-HEAD,
            #welcome-guide-overlay .wg-equip-interactive-area:has([data-slot="CHEST"]:hover) .part-CHEST,
            #welcome-guide-overlay .wg-equip-interactive-area:has([data-slot="BODY"]:hover) .part-BODY,
            #welcome-guide-overlay .wg-equip-interactive-area:has([data-slot="ARMS"]:hover) .part-ARMS,
            #welcome-guide-overlay .wg-equip-interactive-area:has([data-slot="LEGS"]:hover) .part-LEGS,
            #welcome-guide-overlay .wg-equip-interactive-area:has([data-slot="BOOTS"]:hover) .part-BOOTS,
            #welcome-guide-overlay .wg-equip-interactive-area:has([data-slot="RINGS"]:hover) .part-RINGS,
            #welcome-guide-overlay .wg-equip-interactive-area:has([data-slot="NECKLACES"]:hover) .part-NECKLACES {
                fill: rgba(34, 211, 238, 0.35);
                stroke-dasharray: none;
                stroke-width: 2.0;
                filter: drop-shadow(0 0 6px #22d3ee);
            }
            /* REAL CARDS IN THE INVENTORY (Mark 2026-09-20 "have the playing cards to use ... remove that white avatar"). A [REF#UI-01405]
               .wg-card-mount is the hand's 77x115 card in a fixed frame (the vending mini-card pattern, Panels .vc-card-mount);
               the icon loop paints its .card-icon-3d. Every list item and every filled slot is one of these. No figure. */
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-equip-interactive-area { flex-direction: column; gap: 8px; height: auto; }
            #welcome-guide-overlay .wg-rating-row { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
            #welcome-guide-overlay .wg-rating { position: relative; display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px;
                background: rgba(0,0,0,.55); border: 1px solid rgba(34,211,238,.35); color: #e6f9ff; font-size: 9px; font-weight: 800; letter-spacing: .06em;
                box-shadow: 0 2px 8px rgba(0,0,0,.6); transition: box-shadow .25s, border-color .25s; }
            #welcome-guide-overlay .wg-rating b { font-size: 13px; color: #fff; }
            #welcome-guide-overlay .wg-rating small { font-size: 7.5px; color: #9fd9e8; letter-spacing: .12em; }
            #welcome-guide-overlay .wg-rating i { color: #22d3ee; font-size: 9px; }
            #welcome-guide-overlay .wg-rating-melee i { color: #ffb15e; } #welcome-guide-overlay .wg-rating-ranged i { color: #b48cff; }
            #welcome-guide-overlay .wg-rating.wg-rate-flash { animation: wgRateFlash .9s ease-out; border-color: #fff; }
            @keyframes wgRateFlash { 0% { box-shadow: 0 0 0 0 rgba(255,255,255,.9), 0 0 18px rgba(34,211,238,.9); transform: scale(1.12); } 100% { box-shadow: 0 2px 8px rgba(0,0,0,.6); transform: scale(1); } }
            #welcome-guide-overlay .wg-rate-delta { position: absolute; left: 50%; top: -4px; transform: translateX(-50%); font-size: 11px; font-weight: 900; animation: wgRateDelta 1.4s ease-out forwards; }
            #welcome-guide-overlay .wg-rate-delta.up { color: #7dffb0; } #welcome-guide-overlay .wg-rate-delta.down { color: #ff8a80; }
            @keyframes wgRateDelta { 0% { opacity: 0; transform: translate(-50%, 4px); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -22px); } }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-right, #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-left { overflow-y: auto !important; -webkit-overflow-scrolling: touch; }   /* ten card frames + the list do not fit one page; the pages scroll */
            /* ── PICKUP: the new card's real row moves to a "JUST PICKED UP" group at the top (see _renderEquipment). [REF#UI-01406]
               ⛔ SUPERSEDED 2026-09-20 by Mark ("stop the fade opacity since you suck at that"): no fade on the other rows,
               no scale on the new one, no floating clone. The gold ring animation on .wg-inv-new (above) is all that marks it. */
            #welcome-guide-overlay .wg-inv-new-group { padding: 2px 0 6px; }
            #welcome-guide-overlay .wg-inv-new-group .wg-inv-cards { justify-content: center; }
            /* ONE LABEL COLOUR, BOTH PAGES (Mark 2026-09-20: "same white font for all labels on both sides"). [REF#UI-01407] */
            /* CARD PRINT IS WHITE. The hand's .card-title / .card-desc / .card-attr-fused carry no colour of their own (Panels [REF#UI-01408]
               ~:1894) and inherit the book page's dark ink inside this overlay — the 5th report of black print on the inventory
               cards (Mark 2026-09-20: "why are inventory cards still fucking black print"). Forced here, both pages, !important. */
            #welcome-guide-overlay .wg-card-mount .guide-card, #welcome-guide-overlay .wg-card-mount .guide-card .card-title,
            #welcome-guide-overlay .wg-card-mount .guide-card .card-title-2, #welcome-guide-overlay .wg-card-mount .guide-card .card-desc,
            #welcome-guide-overlay .wg-card-mount .guide-card .card-attr-fused, #welcome-guide-overlay .wg-card-mount .guide-card .card-kanji,
            #welcome-guide-overlay .wg-card-mount .guide-card .card-type-pill, #welcome-guide-overlay .wg-card-badge { color: #fff !important; opacity: 1 !important; }
            #welcome-guide-overlay .wg-card-mount .guide-card .card-title { -webkit-line-clamp: 3 !important; text-overflow: clip !important; }
            #welcome-guide-overlay .wg-inv-group-h, #welcome-guide-overlay .wg-inv-group-h span, #welcome-guide-overlay .wg-inv-new-group .wg-inv-group-h,
            #welcome-guide-overlay .wg-slot-label, #welcome-guide-overlay .wg-slot-label i, #welcome-guide-overlay .wg-slot-empty { color: #fff; }
            /* INVENTORY CARDS 25% SMALLER (Mark 2026-09-20). The equip-page cards read --card-w/--card-h; the left list gets 3/4. [REF#UI-01409] */
            #welcome-guide-overlay .wg-item-list .wg-card-mount { --card-w: 58px; --card-h: 86px; }
            #welcome-guide-overlay .wg-item-list .wg-card-mount .guide-card .card-icon-3d { width: 28px; height: 28px; }
            #welcome-guide-overlay .wg-item-list .wg-card-mount .guide-card .card-title { font-size: 8px; line-height: 1.05; }
            #welcome-guide-overlay .wg-item-list .wg-card-mount .guide-card .card-desc { font-size: 6px; }
            #welcome-guide-overlay .wg-item-list .wg-card-mount .guide-card .card-attr-fused { font-size: 7px; }
            #welcome-guide-overlay .wg-item-list .wg-card-mount .guide-card .card-type-pill { font-size: 6px; padding: 1px 4px; }
            /* THE BODY GRID (Mark 2026-09-20: "have the slots shape like a body"): areas laid out as a figure. [REF#UI-01410] */
            #welcome-guide-overlay .wg-body-grid { display: grid; grid-template-columns: repeat(3, auto); justify-content: center; align-items: start; gap: 6px 8px; padding: 4px 0;
                grid-template-areas: ". head ." ". neck ." "melee chest ranged" "arms body rings" ". legs ." ". boots ."; }
            #welcome-guide-overlay .wg-body-grid .wg-slot[data-slot="HEAD"]      { grid-area: head; }
            #welcome-guide-overlay .wg-body-grid .wg-slot[data-slot="NECKLACES"] { grid-area: neck; }
            #welcome-guide-overlay .wg-body-grid .wg-slot[data-slot="MELEE"]     { grid-area: melee; }
            #welcome-guide-overlay .wg-body-grid .wg-slot[data-slot="CHEST"]     { grid-area: chest; }
            #welcome-guide-overlay .wg-body-grid .wg-slot[data-slot="RANGED"]    { grid-area: ranged; }
            #welcome-guide-overlay .wg-body-grid .wg-slot[data-slot="ARMS"]      { grid-area: arms; }
            #welcome-guide-overlay .wg-body-grid .wg-slot[data-slot="BODY"]      { grid-area: body; }
            #welcome-guide-overlay .wg-body-grid .wg-slot[data-slot="RINGS"]     { grid-area: rings; }
            #welcome-guide-overlay .wg-body-grid .wg-slot[data-slot="LEGS"]      { grid-area: legs; }
            #welcome-guide-overlay .wg-body-grid .wg-slot[data-slot="BOOTS"]     { grid-area: boots; }
            #welcome-guide-overlay .wg-body-grid .wg-slot .wg-slot-body { min-height: var(--card-h, 115px); }
            #welcome-guide-overlay .wg-hand-row { display: flex; gap: 8px; justify-content: center; align-items: center; }
            #welcome-guide-overlay .wg-hand-row .wg-iso-player { flex: 0 1 120px; min-width: 90px; align-self: stretch; padding: 4px; }
            #welcome-guide-overlay .wg-hand-row .wg-iso-player .wg-mannequin-svg { width: 100%; height: 100%; max-height: 150px; }
            #welcome-guide-overlay .wg-hand-row .wg-weapon-slot { flex: 0 0 auto; }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-slot-column { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; overflow: visible; padding-right: 0; }
            /* a slot is a card frame: 77x115 body under an 8.5px label; empty = dashed, filled = the real card [REF#UI-01411] */
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-slot { padding: 4px; gap: 3px; align-items: center; width: calc(var(--card-w, 77px) + 8px); box-sizing: border-box; }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-slot-body { width: var(--card-w, 77px); height: var(--card-h, 115px); min-height: 0; padding: 0; border-radius: 12px; border: 1px dashed rgba(255,255,255,.12); }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-slot.filled .wg-slot-body { border: none; }
            #welcome-guide-overlay .wg-card-mount { position: relative; display: block; width: var(--card-w, 77px); height: var(--card-h, 115px); flex: 0 0 auto; pointer-events: none; }
            #welcome-guide-overlay .wg-card-mount .guide-card { position: absolute; inset: 0; opacity: 1 !important; transform: none !important; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
            #welcome-guide-overlay .wg-card-mount .guide-card .card-icon-3d { width: 36px; height: 36px; margin: auto auto 3px auto; }
            #welcome-guide-overlay .wg-card-mount .guide-card .card-title { margin-top: 2px; }
            #welcome-guide-overlay .wg-card-mount .card-badge.wg-card-qty { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; border-radius: 9px; background: #e53935; color: #fff; font-size: 10px; font-weight: 900; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,.6); }
            #welcome-guide-overlay .wg-card-badge { position: absolute; left: 50%; bottom: -7px; transform: translateX(-50%); white-space: nowrap; font-size: 7px; font-weight: 900; letter-spacing: .14em; padding: 2px 7px; border-radius: 999px; background: #0b0e16; border: 1px solid rgba(34,211,238,.5); color: #22d3ee; }
            #welcome-guide-overlay .wg-item-row.wg-inv-mount { display: block; width: auto; padding: 0 0 10px; margin: 0; background: none; border: none; box-shadow: none; cursor: grab; }
            #welcome-guide-overlay .wg-item-row.wg-inv-mount.is-equipped .wg-card-badge { background: #22d3ee; color: #06111a; }
            #welcome-guide-overlay .wg-item-row.wg-inv-mount:hover .guide-card, #welcome-guide-overlay .wg-item-row.wg-inv-mount:focus-visible .guide-card { transform: translateY(-3px) !important; box-shadow: 0 12px 24px rgba(0,0,0,.65), 0 0 12px var(--theme-clr, #22d3ee) !important; }
            #welcome-guide-overlay .wg-item-list-all { display: block !important; width: 100%; box-sizing: border-box; height: auto; max-height: none; flex: 1 1 auto; min-height: 0; }
            #welcome-guide-overlay .wg-inv-group { width: 100%; margin-bottom: 8px; }
            #welcome-guide-overlay .wg-inv-group-h { font-size: 9px; font-weight: 900; letter-spacing: .18em; color: #22d3ee; text-transform: uppercase; padding: 2px 2px 4px; border-bottom: 1px solid rgba(34,211,238,.18); margin-bottom: 8px; display: flex; justify-content: space-between; }
            #welcome-guide-overlay .wg-inv-group-h span { color: #94a3b8; letter-spacing: 0; }
            #welcome-guide-overlay .wg-inv-cards { display: flex; flex-wrap: wrap; gap: 8px 10px; padding: 6px 2px 2px; }
            #welcome-guide-overlay .wg-plain-card { cursor: default; opacity: .9; }
            #welcome-guide-overlay .wg-item-row.wg-inv-new .guide-card { animation: wgInvNew 1.2s ease-in-out 4; box-shadow: 0 0 0 2px #ffe27a, 0 0 18px rgba(255,226,122,.8) !important; }
            @keyframes wgInvNew { 50% { box-shadow: 0 0 0 3px #ffe27a, 0 0 30px rgba(255,226,122,1) !important; transform: translateY(-3px) !important; } }
            @media (prefers-reduced-motion: reduce) { #welcome-guide-overlay .wg-rating.wg-rate-flash, #welcome-guide-overlay .wg-item-row.wg-inv-new .guide-card { animation: none; } }
            #welcome-guide-overlay .wg-mannequin-container {
                flex: 0 0 110px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.05), transparent 70%);
                border-radius: 12px;
                border: 1.5px solid rgba(34, 211, 238, 0.1);
                box-shadow: inset 0 0 12px rgba(34, 211, 238, 0.05);
                padding: 4px;
            }
            #welcome-guide-overlay .wg-mannequin-svg {
                width: 100%;
                height: auto;
                max-height: 220px;
            }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-equip-interactive-area { position:relative; width:100%; }
            #welcome-guide-overlay .wg-gear-figure { position:absolute; width:84px; height:260px; top:20px; left:50%; transform:translateX(-50%); pointer-events:none; }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-body-grid { width:100%; box-sizing:border-box; grid-template-columns:minmax(0,1fr) 84px minmax(0,1fr); grid-template-areas:"head . neck" "chest . body" "melee . ranged" "arms . rings" "legs . boots"; gap:8px 4px; }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-body-grid .wg-slot { width:100%; min-height:56px; padding:6px; border-radius:10px; background:#151722; border:1px solid #716583; zoom:1; }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-body-grid .wg-slot.filled { background:#282039; border-color:#b58ae8; }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-body-grid .wg-slot-body { width:100%; height:auto; min-height:26px; border:0; display:flex; flex-direction:column; justify-content:center; gap:3px; }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-slot-label { font-size:10px; letter-spacing:.4px; }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-slot-empty { color:#b9b2c7; font:400 11px/1.2 'Inter',sans-serif; }
            #welcome-guide-overlay .wg-worn-name { font:700 11px/1.3 'Inter',sans-serif; text-align:center; overflow-wrap:anywhere; color:#fff; }
            #welcome-guide-overlay .wg-slot-action { font:600 10px/1.2 'Inter',sans-serif; color:#d1b4ff; }
            #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-slot:focus-visible { outline:2px solid #dac0ff; outline-offset:2px; }
            #welcome-guide-overlay .wg-slot-column {
                flex: 1;
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                grid-auto-rows: min-content;
                gap: 6px;
                overflow-y: auto;
                padding-right: 4px;
                scrollbar-width: thin;
                scrollbar-color: rgba(34, 211, 238, 0.4) transparent;
            }
            #welcome-guide-overlay .wg-slot-column::-webkit-scrollbar { width: 4px; }
            #welcome-guide-overlay .wg-slot-column::-webkit-scrollbar-thumb { background: rgba(34, 211, 238, 0.4); border-radius: 2px; }
            #welcome-guide-overlay .wg-slot {
                display: flex; flex-direction: column; gap: 4px;
                padding: 6px; border-radius: 8px;
                background: rgba(0, 0, 0, 0.4);
                border: 1px dashed rgba(255, 255, 255, 0.14);
                box-shadow: inset 1px 1px 2px rgba(255, 255, 255, 0.03);
                transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
            }
            #welcome-guide-overlay .wg-slot.filled {
                border-style: solid; border-color: rgba(34, 211, 238, 0.5);
                background: linear-gradient(180deg, rgba(34, 211, 238, 0.08), rgba(0, 0, 0, 0.4) 70%);
                cursor: pointer;
            }
            #welcome-guide-overlay .wg-slot.wg-drop-ok {
                border-color: #22d3ee; border-style: solid;
                box-shadow: 0 0 14px rgba(34, 211, 238, 0.45);
                background: rgba(34, 211, 238, 0.12);
            }
            #welcome-guide-overlay .wg-slot.wg-drop-bad {
                border-color: rgba(248, 113, 113, 0.7); border-style: solid;
                box-shadow: 0 0 12px rgba(248, 113, 113, 0.3);
            }
            #welcome-guide-overlay .wg-slot-label {
                font-size: 8.5px; font-weight: 800; letter-spacing: 0.8px;
                text-transform: uppercase; color: #94a3b8;
                display: flex; align-items: center; gap: 4px;
            }
            #welcome-guide-overlay .wg-slot-label i { color: #22d3ee; font-size: 9px; }
            #welcome-guide-overlay .wg-slot-body {
                display: flex; flex-direction: column; align-items: center; gap: 1px;
                min-height: 36px; justify-content: center;
                border-radius: 6px; padding: 2px;
            }
            #welcome-guide-overlay .wg-slot-body[draggable="true"] { cursor: grab; }
            #welcome-guide-overlay .wg-slot-empty { font-size: 9px; color: #5a5e63; font-style: italic; }
            #welcome-guide-overlay .wg-slot-kanji {
                font-family: 'Cinzel', serif; font-weight: 900; font-size: 14px; color: #22d3ee;
                text-shadow: 0 0 6px rgba(34, 211, 238, 0.45); line-height: 1;
            }
            #welcome-guide-overlay .wg-slot-item { font-size: 9px; font-weight: 700; color: #f5f3ff; text-align: center; }
            #welcome-guide-overlay .wg-slot-ac { font-size: 7.5px; font-weight: 800; color: #22d3ee; }

            /* — Item list (page 14): reuses .wg-save-row visuals — [REF#UI-01256] */
            #welcome-guide-overlay .wg-item-list.wg-drop-ok {
                outline: 2px dashed rgba(34, 211, 238, 0.5); outline-offset: -2px; border-radius: 8px;
            }
            #welcome-guide-overlay .wg-item-row { cursor: grab; border-left-color: rgba(34, 211, 238, 0.4); }
            #welcome-guide-overlay .wg-item-row .wg-sr-floor {
                font-family: 'Cinzel', serif; min-width: 26px; text-align: center;
            }
            #welcome-guide-overlay .wg-item-row.wg-dragging { opacity: 0.45; }
            #welcome-guide-overlay .wg-item-row.is-equipped {
                border-color: rgba(34, 211, 238, 0.55); border-left-color: #22d3ee;
                background: linear-gradient(90deg, rgba(34, 211, 238, 0.10), rgba(0, 0, 0, 0.4) 60%);
            }
            #welcome-guide-overlay .wg-item-row.is-equipped .wg-sr-when { color: #22d3ee; }
            #welcome-guide-overlay .wg-item-row.is-unowned { opacity: 0.55; }
            #welcome-guide-overlay .wg-item-row.is-unowned .wg-sr-when { color: #71757a; }
            #welcome-guide-overlay .wg-equip-hint { font-style: italic; }
            #welcome-guide-overlay .wg-equip-note-flash { color: #fbbf24 !important; font-weight: 800; }
            #welcome-guide-overlay .wg-overweight { color: #f87171 !important; font-weight: 800; }

            /* PLAYING-CARD chips (Mark 2026-09-11 INV page): weapons + gear drawn as small cards. Same cyan system. [REF#UI-01337] */
            #welcome-guide-overlay .wg-item-list.wg-item-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 6px; }
            #welcome-guide-overlay .wg-card-chip, #welcome-guide-overlay .wg-item-card {
                position: relative; flex: 0 0 auto; width: 92px; min-height: 124px; box-sizing: border-box;
                display: flex; flex-direction: column; gap: 3px; padding: 7px 7px 20px;
                border-radius: 9px; background: linear-gradient(180deg, rgba(10, 18, 28, 0.92), rgba(0, 0, 0, 0.55));
                border: 1px solid rgba(255, 255, 255, 0.16); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(34, 211, 238, 0.08);
                cursor: pointer; text-align: left; color: #f5f3ff;
                transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
            }
            #welcome-guide-overlay .wg-item-card { cursor: grab; }
            #welcome-guide-overlay .wg-card-chip:hover, #welcome-guide-overlay .wg-item-card:hover { transform: translateY(-2px); border-color: rgba(34, 211, 238, 0.6); }
            #welcome-guide-overlay .wg-card-chip.is-primary, #welcome-guide-overlay .wg-item-card.is-equipped {
                border-color: #22d3ee; box-shadow: 0 0 12px rgba(34, 211, 238, 0.35), inset 0 0 0 1px rgba(34, 211, 238, 0.35);
            }
            #welcome-guide-overlay .wg-card-chip.is-unowned, #welcome-guide-overlay .wg-item-card.is-unowned { opacity: 0.5; cursor: default; }
            #welcome-guide-overlay .wg-cc-top { display: flex; align-items: center; justify-content: space-between; }
            #welcome-guide-overlay .wg-cc-kanji { font-family: 'Cinzel', 'Noto Serif JP', serif; font-size: 20px; line-height: 1; color: #22d3ee; text-shadow: 0 0 8px rgba(34, 211, 238, 0.5); }
            #welcome-guide-overlay .wg-cc-pill { font-size: 7px; font-weight: 800; letter-spacing: 0.08em; padding: 1px 4px; border-radius: 4px; background: rgba(34, 211, 238, 0.14); color: #a5f3fc; }
            #welcome-guide-overlay .wg-card-chip.fam-ranged .wg-cc-pill { background: rgba(199, 155, 255, 0.18); color: #e0c4ff; }
            #welcome-guide-overlay .wg-card-chip.fam-ranged .wg-cc-kanji { color: #c79bff; text-shadow: 0 0 8px rgba(199, 155, 255, 0.5); }
            #welcome-guide-overlay .wg-cc-name { font-size: 9px; font-weight: 800; letter-spacing: 0.04em; line-height: 1.15; }
            #welcome-guide-overlay .wg-item-card .wg-sr-name, #welcome-guide-overlay .wg-item-card .wg-sr-meta { white-space: normal; overflow: visible; text-overflow: clip; }   /* the row rule ellipsised 'SAMURAI HEL…' on a card */
            #welcome-guide-overlay .wg-cc-attr { font-size: 7.5px; color: #9aa3ad; line-height: 1.2; }
            #welcome-guide-overlay .wg-cc-badge { position: absolute; left: 7px; right: 7px; bottom: 6px; font-size: 7px; font-weight: 800; letter-spacing: 0.08em; color: #71757a; text-align: center; }
            #welcome-guide-overlay .is-primary .wg-cc-badge, #welcome-guide-overlay .is-equipped .wg-cc-badge { color: #22d3ee; }
            #welcome-guide-overlay .wg-cc-qty { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #22d3ee; color: #041016; font-size: 9px; font-weight: 900; line-height: 18px; text-align: center; box-shadow: 0 0 6px rgba(34, 211, 238, 0.6); }
            /* PRIMARY WEAPON picker (inventory #3) — compact melee chips in the cyan system [REF#UI-01257] */
            #welcome-guide-overlay .wg-weapon-strip { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 4px; }
            #welcome-guide-overlay .wg-weapon-chip {
                flex: 1 1 calc(50% - 6px); min-width: 116px; box-sizing: border-box;
                display: flex; align-items: center; gap: 7px; padding: 6px 9px;
                border-radius: 8px; background: rgba(0, 0, 0, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.14); cursor: pointer; text-align: left;
                transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
            }
            #welcome-guide-overlay .wg-weapon-chip:hover { border-color: rgba(34, 211, 238, 0.6); }
            #welcome-guide-overlay .wg-weapon-chip.is-primary {
                border-color: #22d3ee;
                background: linear-gradient(90deg, rgba(34, 211, 238, 0.14), rgba(0, 0, 0, 0.4) 70%);
                box-shadow: 0 0 10px rgba(34, 211, 238, 0.3);
            }
            #welcome-guide-overlay .wg-weapon-chip.is-unowned { opacity: 0.4; cursor: default; }
            #welcome-guide-overlay .wg-wc-kanji {
                font-family: 'Cinzel', serif; font-weight: 900; font-size: 18px; color: #22d3ee;
                text-shadow: 0 0 6px rgba(34, 211, 238, 0.45); line-height: 1; min-width: 18px; text-align: center;
            }
            #welcome-guide-overlay .wg-wc-body { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
            #welcome-guide-overlay .wg-wc-name { font-size: 10px; font-weight: 700; color: #f5f3ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #welcome-guide-overlay .wg-wc-attr { font-size: 8px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #welcome-guide-overlay .wg-weapon-chip .wg-wc-badge { font-size: 7.5px; font-weight: 800; color: #6b7280; letter-spacing: 0.05em; }
            #welcome-guide-overlay .wg-weapon-chip.is-primary .wg-wc-badge { color: #22d3ee; }

            /* AI Behavior Tuning Styles [REF#UI-01258] */
            #welcome-guide-overlay .wg-ai-row {
                display: grid; grid-template-columns: 80px 1fr 40px; align-items: center; gap: 8px;
                margin-top: 4px;
            }
            #welcome-guide-overlay .wg-ai-label {
                font-size: 10px; font-weight: 700; color: #cdcad1;
            }
            #welcome-guide-overlay .wg-ai-slider {
                width: 100%; height: 4px; border-radius: 2px;
                background: rgba(34, 211, 238, 0.22);
                outline: none; -webkit-appearance: none; cursor: pointer;
            }
            #welcome-guide-overlay .wg-ai-slider::-webkit-slider-thumb {
                -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%;
                background: #22d3ee; box-shadow: 0 0 6px rgba(34, 211, 238, 0.8);
            }
            #welcome-guide-overlay .wg-ai-value {
                font-family: 'SF Mono', monospace; font-size: 10px; color: #22d3ee; text-align: right;
            }

            /* Inline T&C panel — expands at bottom of the right page on [REF#UI-01259]
               click (no separate modal). Page-level overflow-y:auto on
               .wg-page handles the scrolling. */
            #welcome-guide-overlay .wg-tc-inline {
                margin-top: 0;
                padding: 12px 14px 14px;
                border-radius: 10px;
                background: linear-gradient(180deg, #1d2024 0%, #15171a 100%);
                box-shadow:
                    inset 2px 2px 4px rgba(0, 0, 0, 0.65),
                    inset -2px -2px 4px rgba(255, 255, 255, 0.04),
                    0 0 14px rgba(34, 211, 238, 0.12);
                color: #e2e8f0;
                font-size: 11px; line-height: 1.5;
                outline: none;
                scroll-margin-top: 8px;
                display: flex; flex-direction: column; flex: 1; height: 100%; box-sizing: border-box;
            }
            #welcome-guide-overlay .wg-tc-inline[hidden] {
                display: none !important;
            }
            #welcome-guide-overlay .wg-tc-inline:focus-visible {
                box-shadow:
                    inset 2px 2px 4px rgba(0, 0, 0, 0.65),
                    inset -2px -2px 4px rgba(255, 255, 255, 0.04),
                    0 0 0 2px rgba(34, 211, 238, 0.6);
            }
            #welcome-guide-overlay .wg-tc-inline-head {
                display: flex; align-items: center; justify-content: space-between;
                margin-bottom: 4px;
                flex-shrink: 0;
            }
            #welcome-guide-overlay .wg-tc-inline-head h3 {
                margin: 0;
                font-family: 'Outfit', 'Inter', sans-serif;
                font-size: 13px; font-weight: 900;
                letter-spacing: 2px; text-transform: uppercase;
                color: #22d3ee;
                text-shadow: 0 0 10px rgba(34, 211, 238, 0.4);
            }
            #welcome-guide-overlay .wg-tc-collapse {
                background: none; border: none;
                color: #94a3b8; font-size: 20px; line-height: 1;
                padding: 0 4px; cursor: pointer;
            }
            #welcome-guide-overlay .wg-tc-collapse:hover { color: #e2e8f0; }
            #welcome-guide-overlay .wg-tc-sub {
                margin: 0 0 8px;
                font-size: 9px; letter-spacing: 1px; text-transform: uppercase;
                color: #94a3b8;
            }
            #welcome-guide-overlay .wg-tc-body {
                flex: 1; min-height: 0;
                overflow-y: scroll;
                padding-right: 14px;
                scrollbar-width: auto;
                scrollbar-color: rgba(220, 226, 235, 0.95) rgba(20, 22, 28, 0.85);
                outline: none;
                pointer-events: auto !important;
            }
            #welcome-guide-overlay .wg-tc-body:focus-visible {
                box-shadow: inset 0 0 0 2px rgba(34, 211, 238, 0.4);
                border-radius: 8px;
            }
            #welcome-guide-overlay .wg-tc-body::-webkit-scrollbar {
                width: 14px;
            }
            #welcome-guide-overlay .wg-tc-body::-webkit-scrollbar-track {
                background: rgba(20, 22, 28, 0.85);
                border-radius: 6px;
                box-shadow: inset 1px 1px 4px rgba(0,0,0,0.65);
            }
            #welcome-guide-overlay .wg-tc-body::-webkit-scrollbar-thumb {
                background: rgba(220, 226, 235, 0.95);
                border-radius: 6px;
                border: 2px solid rgba(20, 22, 28, 0.85);
                box-shadow:
                    inset 1px 1px 2px rgba(255, 255, 255, 0.5),
                    inset -1px -1px 2px rgba(0, 0, 0, 0.55);
            }
            #welcome-guide-overlay .wg-tc-body::-webkit-scrollbar-thumb:hover {
                background: #ffffff;
            }
            #welcome-guide-overlay.is-open,
            #welcome-guide-overlay.is-open .wg-tc-body,
            #welcome-guide-overlay.is-open .wg-tc-body * {
                pointer-events: auto !important;
            }
            #welcome-guide-overlay .wg-tc-inline-nav {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
                padding: 10px 14px 6px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                margin-top: 8px;
                pointer-events: auto !important;
            }
            #welcome-guide-overlay .wg-tc-inline-nav .wg-nav-btn {
                min-width: 110px;
            }
            #welcome-guide-overlay .wg-tc-body p {
                margin: 0 0 8px;
            }
            #welcome-guide-overlay .wg-tc-body b {
                color: #22d3ee;
            }
            #welcome-guide-overlay .wg-tc-foot {
                margin-top: 10px !important;
                font-size: 9.5px; color: #94a3b8;
                text-align: center; font-style: italic;
            }
            /* COMBAT-TEXT over the felt (Mark 2026-06-26) — rise-and-fade gold deltas on resolve, one [REF#UI-01260]
               per side (player + dealer mirror). Reuses the cyan-system win-green / lose-red, no new palette. */
            #welcome-guide-overlay .wg-felt-float {
                position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
                font-family: 'Cinzel', serif; font-weight: 700; font-size: 34px; letter-spacing: 1px;
                white-space: nowrap; pointer-events: none; z-index: 7; opacity: 0;
                will-change: transform, opacity;
                animation: wgFeltFloat 1.5s cubic-bezier(.22,.61,.36,1) forwards;
            }
            #welcome-guide-overlay .wg-felt-float--player { top: 64%; }
            #welcome-guide-overlay .wg-felt-float--dealer { top: 30%; font-size: 26px; }
            #welcome-guide-overlay .wg-felt-float--win  { color: #eafff0; text-shadow: 0 0 10px rgba(52,211,153,.85), 0 2px 6px rgba(0,0,0,.6); }
            #welcome-guide-overlay .wg-felt-float--lose { color: #ffe2e2; text-shadow: 0 0 10px rgba(248,113,113,.8), 0 2px 6px rgba(0,0,0,.6); }
            #welcome-guide-overlay .wg-felt-float--push { color: #d7f1f7; text-shadow: 0 0 10px rgba(34,211,238,.7), 0 2px 6px rgba(0,0,0,.6); }
            @keyframes wgFeltFloat {
                0%   { opacity: 0; transform: translate(-50%, -50%) scale(.7); }
                18%  { opacity: 1; transform: translate(-50%, -64%) scale(1.06); }
                70%  { opacity: 1; transform: translate(-50%, -118%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -150%) scale(1); }
            }
            /* reduced-motion fallback: opacity-only fade (no rise/scale) — the gold delta is still READ, [REF#UI-01261]
               just not animated. wgFeltFadeRM leaves transform untouched so the base translate(-50%,-50%)
               holds the number centered on its top line with zero motion. (WCAG 2.3.3) */
            @keyframes wgFeltFadeRM { 0% { opacity: 0; } 12% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
            @media (prefers-reduced-motion: reduce) {
                #welcome-guide-overlay .wg-felt-float { animation-name: wgFeltFadeRM; animation-duration: 1.2s; }
            }

            /* ══ MOBILE GUIDEBOOK (Mark 2026-07-04 "each page should be web-responsive — welcome to roles [REF#UI-01262]
               to settings pages and rooms"): at phone widths the two-page BOOK spread (grid 1fr 16px 1fr)
               crushed each page to ~160px — role cards clipped mid-word (Mark's screenshot). The spread
               now FOLDS: one full-width scrolling column, left page above right page, spine hidden. Every
               spread inherits this (welcome, roles, saves, settings/setup, rooms, wager — all of them).
               Desktop book layout untouched. NOTE for the slide-geometry validator: equal page WIDTH is
               preserved (both 100%); page HEIGHT is content-driven by design in the folded layout. ══ */
            /* ── TABLET / SHORT-DESKTOP FIT (Mark 2026-07-19 "fluid UI 1-page view in ANY resolution"). [REF#UI-01263]
               The 750px mobile block below rewrites LAYOUT (hides the spine, stacks the pages). This one does
               NOT — it only removes the remaining scroll surfaces and applies the fluid ramp, so tablets get the
               one-page guarantee without inheriting the phone layout. Measured before this existed: 768x1024 was
               the only size still reporting a live scroller (wg-lore 293>272). */
            @media (max-width: 1024px), (max-height: 820px), (max-width: 1032px) and (max-height: 1380px) {   /* iPad Mini (768x1024) rule copied onto iPad Pro 13 (1032x1376) — Mark 2026-10-18 */
                #welcome-guide-overlay .wg-lore,
                #welcome-guide-overlay .wg-room-detail,
                #welcome-guide-overlay .wg-room-detail .wg-lore,
                #welcome-guide-overlay .wg-room-detail > :not(.wg-room-ok-wrap),
                #welcome-guide-overlay .wg-rooms-list,
                #welcome-guide-overlay .wg-wager-grid { overflow: hidden !important; min-height: 0; }
                #welcome-guide-overlay .wg-lore,
                #welcome-guide-overlay .wg-lore p { font-size: clamp(11px, 1.6vh, 16px); line-height: 1.36; margin: 0 0 clamp(3px, .85vh, 9px); }
                #welcome-guide-overlay .wg-room-logo-wrap,
                #welcome-guide-overlay .wg-room-logo-wrap .wg-logo { max-height: clamp(70px, 15vh, 170px); }
            }
            @media (max-width: 750px), ((pointer: coarse) and (hover: none) and (max-width: 1200px)) {   /* landscape phones too — see Panels ~:994 (Mark 2026-09-19) [REF#PENDING] */
                #welcome-guide-overlay.wg-modal {
                    --wg-w: calc(100vw - 8px);
                    --wg-h: calc(100dvh - 8px);
                    --wg-pad: 10px;
                    --wg-footer-h: 64px;
                    --wg-stage-pad-top: 122px;
                    border-radius: 12px;
                }
                /* ── MOBILE = ONE FLUID PAGE, NO SCROLLBARS (Mark 2026-07-19: "i want the guidebook in mobile NOT [REF#UI-01264]
                   to have to use any scrollbars. it has to be fluid UI 1-page view in any resolution") ──────────
                   The old model was the inverse of this: the SLIDE scrolled and pages grew to their content. Now
                   the slide is a fixed-height flex box that never scrolls, the pages SHARE that height
                   (flex:1 1 0 + min-height:0), and the content inside scales to fit via the fluid type/spacing
                   ramp below. min-height:0 is the load-bearing part — without it a flex child refuses to shrink
                   below its content and the overflow simply moves somewhere else. */
                #welcome-guide-overlay .wg-slide.active {
                    display: flex;
                    flex-direction: column;
                    gap: clamp(4px, 1.2vh, 10px);
                    overflow: hidden;                 /* NEVER scrolls on mobile — content fits instead */
                    min-height: 0;
                    height: auto;
                }
                #welcome-guide-overlay .wg-spine { display: none; }
                #welcome-guide-overlay .wg-page {
                    overflow: hidden;                 /* was overflow-y:visible + flex:0 0 auto = "grow to content" */
                    flex: 1 1 0;                      /* pages SHARE the viewport instead of stacking past it */
                    width: 100%;
                    min-height: 0;
                }
                /* KILL EVERY INNER SCROLL SURFACE. Each of these was an independent overflow-y:auto that would [REF#UI-01265]
                   have produced its own scrollbar on a short screen. Listed explicitly rather than with a blanket
                   universal overflow rule, so a genuinely scrollable embed (the solitaire iframe) is untouched.
                   NOTE: never put a BACKTICK in these comments — this whole stylesheet is a JS template literal,
                   so a stray backtick terminates it and the CSS after it is evaluated as JavaScript. That is
                   exactly what happened here first try: "hidden is not defined" on mobile only. */
                #welcome-guide-overlay .wg-rooms-list,
                #welcome-guide-overlay .wg-room-detail,
                #welcome-guide-overlay .wg-room-detail > :not(.wg-room-ok-wrap),
                #welcome-guide-overlay .wg-room-detail .wg-lore,
                #welcome-guide-overlay .wg-wager-grid,
                #welcome-guide-overlay .wg-lore,
                #welcome-guide-overlay .wg-page-left,
                #welcome-guide-overlay .wg-page-right { overflow: hidden !important; min-height: 0; }
                /* THE ROOM CARD'S OK MUST BE ON SCREEN (Mark 2026-09-20, iPhone SE: "caberet screen prevents any OK -- stops [REF#UI-01365]
                   game - critical error"). MEASURED: the right page is 244px tall on the SE and .wg-room-detail rendered 290px
                   (title + kanji + three lore paragraphs + OK), so the OK wrap sat at y=591 on a 568px screen, clipped by the
                   one-page overflow:hidden above; NEXT is hidden on the last spread, so nothing closed the book. The detail is
                   already a flex column (:6365) inside the flex-column .wg-cover-right pad: let it take the page height, let
                   the LORE scroll, and keep the OK in flow as the last, unshrinkable row. */
                /* The rooms spread's right pad carries .wg-cover-right (rooms_R markup ~:6148), so the INTRO cover's phone [REF#UI-01366]
                   min-height (min(430px, 56dvh) = 318px on the SE, rule below) was forcing this 244px page's pad taller than
                   the page. Scoped to spread 9 so the intro cover keeps its floor. */
                /* EQUIPMENT on a phone (2026-09-20): figure on top (fixed 230px), body slots in a 2-column grid under it, list page above. [REF#UI-01412] */
                #welcome-guide-overlay .wg-slide[data-slide="6"].active { padding-bottom: 68px; box-sizing: border-box; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-equip-interactive-area { height: auto; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-left { flex: 0 0 34% !important; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-left .wg-page-sub { display: none; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-right { flex: 1 1 0 !important; overflow-y: auto !important; -webkit-overflow-scrolling: touch; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-right .wg-page-sub { display: none; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-item-list-all { max-height: none; overflow-y: auto !important; }
                /* PHONE CARDS 40% SMALLER (Mark 2026-09-20: "make the cards smaller for mobile by 40%? same designs entire just smaller [REF#UI-01413]
                   so we can move them around") - zoom, so the whole card, its type, its icon canvas and its badges scale as one and
                   the icon loop measures the smaller box. Slots and hand cards take the same zoom so a card fits its frame. */
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-inv-mount, #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-slot { zoom: 0.6; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-inv-cards { flex-wrap: wrap; gap: 10px 12px; padding-bottom: 8px; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-hand-row .wg-iso-player { flex-basis: 96px; min-width: 80px; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-left { flex:1 1 38% !important; min-height:130px; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-right { order:-1; flex:0 0 auto !important; max-height:65%; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-pad { padding:10px 12px; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-right .wg-page-sub { display:block; font-size:11px; line-height:1.4; margin:4px 0 8px; letter-spacing:0; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-page-title { font-size:17px; margin:0 0 4px; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-inv-mount { zoom:1; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-inv-cards { gap:12px; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-item-list .wg-card-mount { --card-w:80px; --card-h:116px; }
                #welcome-guide-overlay .wg-slide[data-slide="6"] .wg-item-list .card-title { font-size:11px; }

                #welcome-guide-overlay .wg-slide[data-slide="9"].active { padding-bottom: 68px; box-sizing: border-box; }   /* same footer clearance as the roles spread (:9796) — the footer overlays the stage's last ~64px */
                #welcome-guide-overlay .wg-slide[data-slide="9"] .wg-cover-right { min-height: 0 !important; height: 100% !important; max-height: 100%; box-sizing: border-box; }
                #welcome-guide-overlay .wg-room-detail { flex: 1 1 0 !important; min-height: 0 !important; max-height: 100%; overflow: hidden !important; }
                #welcome-guide-overlay .wg-room-detail .wg-lore { flex: 1 1 auto !important; min-height: 0 !important; overflow-y: auto !important; -webkit-overflow-scrolling: touch; }
                #welcome-guide-overlay .wg-room-detail .wg-page-title, #welcome-guide-overlay .wg-room-detail .wg-room-kanji { flex: 0 0 auto; }
                #welcome-guide-overlay .wg-room-ok-wrap { flex: 0 0 auto !important; position: static !important; margin-top: 4px; padding: 4px 0 2px; }
                /* THE LOADING BAR MUST BE ON SCREEN ON A PHONE (Mark 2026-09-19: "on mobile no bar shows and it [REF#PENDING] [REF#UI-01363]
                   needs to its 100% required"). MEASURED: .wg-cover-right is block layout, so .wg-lore takes its
                   full content height and the loader below it lands past the page's clipped bottom edge — the
                   one-page rule above hid the bar instead of the lore. On a phone the cover's right page is a
                   flex column: the loader is pinned FIRST (order:-1) with a fixed footprint, the lore shrinks and
                   clips, the actions keep theirs. Desktop layout untouched (this block is max-width:750px only). */
                #welcome-guide-overlay .wg-cover-right { display: flex; flex-direction: column; min-height: 0; height: 100%; }
                #welcome-guide-overlay .wg-cover-right .wg-lore { flex: 1 1 0; min-height: 0; overflow: hidden !important; }
                #welcome-guide-overlay .wg-cover-right .wg-actions { flex: 0 0 auto; }
                #welcome-guide-overlay:not(.wg-loading-active) .wg-slide[data-slide="0"] .wg-cover-right .wg-lore { flex: 0 1 auto; }
                /* TEXT WHILE LOADING (Mark 2026-09-20, iPhone SE: "no text is shown in loading during mobile load"). With the [REF#UI-01367]
                   loader pinned first, flex 1 1 0 handed the welcome copy a zero basis inside an auto-height page, so the
                   bar filled while only the heading peeked out. While the bar is up: the copy keeps its CONTENT height, the
                   haiku steps aside and the art drops to 18dvh — the poem comes back the moment loading ends. Replaces the
                   09-19 flex/order/scroll stack (a1fa69b1, 59cb33eb, ae08cb7c), reverted 09-20. */
                #welcome-guide-overlay.wg-loading-active .wg-cover-right .wg-lore { flex: 1 1 auto; }
                #welcome-guide-overlay.wg-loading-active .wg-haiku { display: none; }
                #welcome-guide-overlay.wg-loading-active .wg-cover-tip { display: none; }   /* same reason as the haiku above — it comes back when the bar does not need the room (2026-10-01) [REF#PENDING] */
                #welcome-guide-overlay.wg-loading-active .wg-logo-wrap { height: clamp(120px, 18dvh, 190px); }
                #welcome-guide-overlay.wg-loading-active .wg-slide[data-slide="0"] .wg-page-left { flex: 0 0 auto; }   /* art page hugs the art; the copy page takes the rest */
                #welcome-guide-overlay.wg-loading-active .wg-cover-right .wg-loader-container { order: -1; flex: 0 0 auto; margin-top: 0; margin-bottom: clamp(4px, 1vh, 8px); }
                /* FLUID RAMP — everything sizes off the viewport so one page always fits. vh-driven with hard [REF#UI-01266]
                   min/max so it stays legible on a 568px-tall phone and does not balloon on a tablet. */
                #welcome-guide-overlay .wg-lore,
                #welcome-guide-overlay .wg-lore p { font-size: clamp(11px, 1.65vh, 15px); line-height: 1.35; margin: 0 0 clamp(3px, .8vh, 8px); }
                #welcome-guide-overlay .wg-room-name { font-size: clamp(11px, 1.7vh, 14px); }
                #welcome-guide-overlay .wg-room-blurb { font-size: clamp(9px, 1.35vh, 12px); }
                #welcome-guide-overlay .wg-room-icon { font-size: clamp(15px, 2.4vh, 21px); }
                #welcome-guide-overlay .wg-room-box { padding: clamp(4px, 1vh, 9px) clamp(7px, 1.6vw, 11px); }
                #welcome-guide-overlay .wg-rooms-list { gap: clamp(3px, .8vh, 7px); }
                #welcome-guide-overlay .wg-room-logo-wrap,
                #welcome-guide-overlay .wg-room-logo-wrap .wg-logo { max-height: clamp(56px, 13vh, 130px); }
                #welcome-guide-overlay .wg-room-kanji { font-size: clamp(9px, 1.4vh, 13px); margin: -2px 0 clamp(4px, 1vh, 10px); }
                /* ── ALL SIX ROLES ON ONE PAGE, NO SCROLL WINDOW (Mark 2026-07-26: "make sure mobile view/tablet [REF#UI-01267]
                   view has all roles and not a scrollwindow. shrink the infoboxes as needed, but keep title
                   wcag 2.2/aa conformed on each role. including entire page - without using scrollbars") ──
                   Both pages are already on screen here (the mobile rule above stacks them and gives each
                   flex:1 1 0), so all six cards are present — what did not fit was the card SIZE: min-height
                   158px x 3 rows x 2 pages overflows any phone, and the roster then scrolled.
                   Every box below is fluid off viewport height so three rows always fit a page. The one thing
                   that does NOT shrink past legibility is the role NAME. */
                #welcome-guide-overlay .wg-role-grid,
                #welcome-guide-overlay .wg-roster { overflow: hidden !important; min-height: 0; height: 100%; }
                #welcome-guide-overlay .wg-roster {
                    display: grid; grid-auto-rows: 1fr;            /* three EQUAL rows that share the page */
                    gap: clamp(4px, 1vh, 9px); max-width: none;
                }
                #welcome-guide-overlay .wg-roster .wg-role-card {
                    min-height: 0;                                  /* the 158px floor is what forced the scroll */
                    padding: clamp(5px, 1.1vh, 12px) clamp(7px, 1.8vw, 12px);
                    gap: clamp(7px, 2vw, 14px);
                    border-radius: clamp(8px, 1.4vh, 14px);
                }
                #welcome-guide-overlay .wg-roster .wg-role-iconbox {
                    width: clamp(34px, 7.2vh, 72px); height: clamp(34px, 7.2vh, 72px);
                    border-radius: clamp(7px, 1.2vh, 12px);
                }
                #welcome-guide-overlay .wg-roster .wg-role-kanji-fallback { font-size: clamp(15px, 3.2vh, 30px); }
                /* WCAG 2.2 AA — the role NAME is the accessible name of the control and stays readable: floor [REF#UI-01268]
                   14px (above the 12px this ramp would otherwise reach), 700 weight, #f5f3ff on the card's dark
                   panel = well past the 4.5:1 minimum for normal text (SC 1.4.3). It is allowed to WRAP rather
                   than shrink further, so a long localized name is never clipped or ellipsised (SC 1.4.4 asks
                   that text survive resize; clipping it would fail that). */
                #welcome-guide-overlay .wg-roster .wg-role-name {
                    font-size: clamp(14px, 2vh, 15px); line-height: 1.2;
                    white-space: normal; overflow-wrap: anywhere;
                }
                /* The BLURB is the info box Mark said may shrink. It degrades to two lines, then one, and is the [REF#UI-01269]
                   only thing that gives — it is supplementary text, not the control's name. */
                #welcome-guide-overlay .wg-roster .wg-role-blurb {
                    font-size: clamp(10px, 1.45vh, 12px); line-height: 1.25;
                    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
                    overflow: hidden;
                }
                #welcome-guide-overlay .wg-roster .wg-role-meta { gap: clamp(1px, .4vh, 5px); }
                /* Very short screens: drop the blurb entirely rather than let the roster scroll. The name, the [REF#UI-01270]
                   icon and the 24x24+ target all survive, so the control stays fully usable (SC 2.5.8). */
                @media (max-height: 620px) {
                    #welcome-guide-overlay .wg-roster .wg-role-blurb { display: none; }
                }
                /* The CTA stays pinned and fully visible — it is the one thing that must never be squeezed out. [REF#UI-01271] */
                #welcome-guide-overlay .wg-room-ok-wrap { padding: clamp(5px, 1.2vh, 10px) 0 calc(clamp(5px, 1.2vh, 10px) + env(safe-area-inset-bottom, 0px)); }
                #welcome-guide-overlay .wg-descend-btn { font-size: clamp(12px, 1.8vh, 16px); padding: clamp(7px, 1.5vh, 13px) clamp(12px, 4vw, 26px); }
                #welcome-guide-overlay .wg-page-left,
                #welcome-guide-overlay .wg-page-right {
                    border-radius: 8px;               /* drop the spine-side curl shadows/asymmetric corners */
                    box-shadow:
                        inset 1px 1px 2px rgba(255, 255, 255, 0.05),
                        inset -1px -1px 3px rgba(0, 0, 0, 0.5);
                }
                /* INTRO: keep the title art cinematic without making the image page [REF#UI-01272]
                   consume most of a tall phone. The welcome page now begins sooner,
                   while the complete artwork and haiku remain inside their page. */
                #welcome-guide-overlay .wg-cover-left {
                    height: auto;
                    min-height: 0;
                    padding-bottom: 8px;
                }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-left {
                    height: 100%; overflow-y: auto;
                }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-left .wg-logo-wrap {
                    flex: 1 1 0; min-height: 48px; max-height: 18dvh;
                }
                #welcome-guide-overlay .wg-slide[data-slide="0"] .wg-cover-left :is(.wg-haiku, .wg-cover-tip) {
                    flex: 0 0 auto;
                }
                /* SUPERSEDED 2026-10-18 by Mark ("what happened to mobile viewport of our intro? fix it back"): restores the [REF#UI-01536]
                   2026-09-19 clamp(120px,18dvh,190px) that b4dabe05 (2026-09-20) silently doubled back to 240/31dvh/320
                   without a register entry, re-creating the exact 390x844 complaint the smaller value was built to fix —
                   lore and terms squeezed below an oversized logo. No backtick in this comment: the whole stylesheet is
                   a JS template literal (see the cover-right centering note above). */
                #welcome-guide-overlay .wg-logo-wrap {
                    flex: 0 0 auto;
                    height: clamp(120px, 18dvh, 190px);
                }
                #welcome-guide-overlay .wg-cover-right {
                    height: auto;
                    min-height: 0;
                }

                /* The footer used to retain its desktop 1fr/360px/1fr tracks, [REF#UI-01273]
                   which made the live chat input + NEXT wider than a phone modal.
                   Auto-size the two navigation rails and let the input own only
                   the real remaining width. */
                #welcome-guide-overlay .wg-footer {
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    column-gap: 8px;
                    padding-inline: 8px;
                }
                #welcome-guide-overlay .wg-footer-center,
                #welcome-guide-overlay .wg-footer-input-mount {
                    min-width: 0;
                    max-width: 100%;
                }
                #welcome-guide-overlay .wg-footer-input-mount #input-container {
                    width: 100% !important;
                    max-width: 100% !important;
                    min-width: 0 !important;
                    transform: none !important;
                }
                #welcome-guide-overlay .wg-footer-input-mount .chat-pill {
                    min-width: 0 !important;
                    overflow: hidden;
                    padding-left: 12px !important;
                }
                #welcome-guide-overlay .wg-footer-input-mount .chat-input {
                    width: 0 !important;
                    min-width: 0 !important;
                }
                #welcome-guide-overlay .wg-nav-btn {
                    padding-inline: 12px;
                }
                /* Role cards: full-width rows instead of clipped book columns [REF#UI-01274] */
                #welcome-guide-overlay .wg-role-grid { grid-template-columns: 1fr !important; }
                #welcome-guide-overlay .wg-roster .wg-role-card { width: 100%; }
                /* SIX SQUARE ROLE BUTTONS (Mark 2026-09-20, iPhone SE: "square these off into selectable button ctas — who [REF#UI-01368]
                   does scrollable role selections?"). The two book pages stacked as equal halves: page one held three
                   rows then a dead half-page (the right page's invisible title/sub placeholders still took height), and
                   the right page's third card fell off the bottom. Now each page is one row of three square buttons —
                   icon over name — the placeholders are gone, pages take their content height, nothing scrolls. */
                /* USE THE WHOLE PAGE (Mark 2026-09-20: "design button panels that use the entire page, lots of empty space"). [REF#UI-01369]
                   Pages share the slide again (flex 1 1 0), each roster is one 1fr row that fills its page, cards stretch. */
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-page { flex: 1 1 0; }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-page-pad { display: flex; flex-direction: column; height: 100%; min-height: 0; box-sizing: border-box; }
                #welcome-guide-overlay .wg-slide[data-slide="1"].active { gap: clamp(6px, 1.5vw, 10px); }   /* second row sits on the first as one 2x3 group */
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-page-right .wg-page-pad { padding-top: 0; }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-page-right .wg-page-title[aria-hidden="true"],
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-page-right .wg-page-sub[aria-hidden="true"] { display: none; }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster {
                    grid-template-columns: repeat(3, minmax(0, 1fr)) !important; grid-template-rows: minmax(0, 1fr) !important;
                    grid-auto-rows: minmax(0, 1fr); align-content: stretch; flex: 1 1 0; height: auto; min-height: 0;
                    gap: clamp(6px, 1.5vw, 10px);
                }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster .wg-role-card {
                    /* -25% HEIGHT, MOBILE ONLY (Mark 2026-09-20: "reduce height of each role on choose your role by [REF#PENDING] [REF#UI-01414]
                       25%, equal spacing equal sized buttons"). The grid row track (grid-auto-rows: minmax(0,1fr)
                       above) already gives every card in a row the SAME height — that part was already equal.
                       What made them look tall is the grid default align-items:stretch, which fills that whole
                       track. height:75% + align-self:center opts OUT of stretch: each card is now 3/4 of its
                       (still-equal) row track, centered — the freed quarter splits evenly above/below every card,
                       so the spacing around all six stays uniform rather than only growing on one side. */
                    aspect-ratio: auto; height: 75%; align-self: center; min-height: 0;
                }
                /* One group, not two panels: the right page loses its own chrome so the six read as a single 2x3 block. [REF#UI-01370] */
                #welcome-guide-overlay .wg-slide[data-slide="1"].active { gap: 0; padding-bottom: 0; }   /* The stage already ends above the footer; let the role panels fill it. */
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-page-left  { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: 0; }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-page-right { border-top-left-radius: 0; border-top-right-radius: 0; border-top: 0; margin-top: 0; }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-page-left .wg-page-pad { padding-bottom: clamp(6px, 1.5vw, 10px); }
                /* Name on ONE line under the icon — no mid-word breaks. Mark's 09-20 order overrules the 14px floor for [REF#UI-01371]
                   this grid: 10px minimum, 700 weight, still 4.5:1 on the dark card. */
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster .wg-role-name { font-size: clamp(11px, 3.2vw, 15px); line-height: 1.1; letter-spacing: 0; white-space: nowrap; overflow-wrap: normal; max-width: 100%; }
                #welcome-guide-overlay .wg-slide[data-slide="1"] .wg-roster .wg-role-blurb { display: none; }
            }

            /* ── WCAG 2.2 AAA — THE LAST MEASURED ROWS (Mark 2026-09-12 "fix the last accessibility rows") ── [REF#UI-01349]
               Measured by scripts/probe-a11y-aaa-rows-0912.js on a real boot, every guide tab walked.
               2.4.13 FOCUS APPEARANCE: the shared 2px ring above covers button/select/a; anything else focusable
               (the inventory slots are tabindex divs, the codex clip <select> opts out of it) fell to the browser's
               1px default at 2.6:1. :where() keeps this at zero specificity so every hand-tuned ring still wins.
               2.5.5 TARGET SIZE (ENHANCED) 44×44: two techniques, chosen per control —
                 · compact chrome (tabs, close, Prev/Next, the music icon) keeps its face and grows a TRANSPARENT
                   hit-area through ::before (position:absolute, negative inset) — the pointer target is 44px, the
                   pixels do not move. The probe reads the pseudo-element inset, so this is measured, not assumed.
                 · in-page controls (World actions, codex pills / tabs / zoom / clip editor, the a11y checkboxes)
                   simply become ≥44px — the pages scroll, and bigger buttons are the point for the kids this is for.
                 · the page dots stay 24px under the "equivalent" exception: Prev/Next (≥44 here) do the same job.
               Register row + evidence: knowledge/WCAG_CONFORMANCE.md (2.4.13, 2.5.5). */
            #welcome-guide-overlay :where(:focus-visible) { outline: 3px solid #22d3ee; outline-offset: 2px; }
            #welcome-guide-overlay .wg-clip-input:focus-visible, #welcome-guide-overlay .wg-clip-input:focus { outline: 3px solid #22d3ee; outline-offset: 2px; }
            #welcome-guide-overlay .wg-tc-row input[type="checkbox"]:focus-visible { outline: 3px solid #22d3ee; outline-offset: 2px; }
            #welcome-guide-overlay .wg-tab, #welcome-guide-overlay .wg-nav-btn { position: relative; }   /* the close button is already position:absolute — its own box contains the ring */
            #welcome-guide-overlay .wg-tab::before { content: ''; position: absolute; left: 0; right: 0; top: -8px; bottom: -8px; }
            #welcome-guide-overlay .wg-close-btn::before { content: ''; position: absolute; inset: -5px; border-radius: 50%; }
            #welcome-guide-overlay .wg-nav-btn::before { content: ''; position: absolute; left: 0; right: 0; top: -6px; bottom: -6px; }
            #welcome-guide-overlay .wg-world-act, #welcome-guide-overlay .wg-pill, #welcome-guide-overlay .wg-zoom-btn,
            #welcome-guide-overlay .wg-codex-tab, #welcome-guide-overlay .wg-anim-play, #welcome-guide-overlay .wg-anim-del,
            #welcome-guide-overlay .wg-anim-add, #welcome-guide-overlay #wg-mon-spin, #welcome-guide-overlay #wg-mon-replay,
            #welcome-guide-overlay #wg-anim-reset-all, #welcome-guide-overlay select.wg-anim-sel, #welcome-guide-overlay .wg-a11y-check,
            #welcome-guide-overlay .wg-mm-btn, #welcome-guide-overlay .wg-clip-input { min-height: 44px; min-width: 44px; box-sizing: border-box; }
            /* Minimap twins (Display Options): the same PIP_ZOOM / PIP_PERSPECTIVE the 26px moondial buttons post, at full size [REF#UI-01350] */
            #welcome-guide-overlay .wg-minimap-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 4px; }
            #welcome-guide-overlay .wg-mm-btn { border: 1px solid rgba(34,211,238,0.35); background: rgba(16,34,40,0.85); color: #cdeee6; border-radius: 10px;
                font-family: 'Outfit', 'Inter', sans-serif; font-size: 12.5px; font-weight: 700; cursor: pointer; padding: 6px 12px; }
            #welcome-guide-overlay .wg-mm-btn:hover { color: #fff; background: rgba(34,211,238,0.14); }
            #welcome-guide-overlay .wg-mm-btn[aria-pressed="true"] { border-color: #22d3ee; color: #22d3ee; background: rgba(34,211,238,0.18); }
            /* WORDS page (3.1.3 / 3.1.4 / 3.1.6): a definition list, readings beside the kanji [REF#UI-01351] */
            #welcome-guide-overlay .wg-world-desc { color: #cdcad1; font-size: 12px; line-height: 1.55; margin: 0 0 10px; }
            #welcome-guide-overlay .wg-gloss-page { overflow-y: auto; }
            #welcome-guide-overlay .wg-gloss-h { color: #22d3ee; font-size: 12px; letter-spacing: .6px; text-transform: uppercase; margin: 12px 0 4px; }
            #welcome-guide-overlay .wg-gloss { margin: 0; display: grid; grid-template-columns: minmax(96px, 34%) 1fr; column-gap: 12px; row-gap: 6px; font-size: 11.5px; line-height: 1.5; color: #cdcad1; }
            #welcome-guide-overlay .wg-gloss dt { margin: 0; color: #e9f6fb; }
            #welcome-guide-overlay .wg-gloss dd { margin: 0; }
            #welcome-guide-overlay .wg-gloss-k { font-weight: 700; }
            #welcome-guide-overlay .wg-gloss-read { color: #9fd9e6; margin-left: 4px; }
            #welcome-guide-overlay .wg-gloss-ro { color: #9fb4bd; display: block; font-style: italic; }
            #welcome-guide-overlay abbr.wg-gloss-k { text-decoration: none; }
            /* COMFORTABLE READING (1.4.8 Visual Presentation, 2026-09-12): line spacing 1.5+, paragraph spacing 1.5× that, [REF#UI-01352]
               lines ≤ 80 characters, never justified, a larger base size. The guide's lore columns drop their space-evenly
               flex so the paragraph gaps are real gaps. Colours stay the player's browser/OS business (G156): nothing here
               sets forced-color-adjust, so a high-contrast OS theme repaints the text freely. */
            html.a11y-reading #welcome-guide-overlay .wg-lore { display: block; line-height: 1.6; font-size: 13px; }
            html.a11y-reading #welcome-guide-overlay .wg-lore p, html.a11y-reading #welcome-guide-overlay .wg-page-pad > p,
            html.a11y-reading #welcome-guide-overlay .wg-a11y-hint, html.a11y-reading #welcome-guide-overlay .wg-gloss dd { line-height: 1.6; margin: 0 0 2.4em; max-width: 80ch; text-align: left; }
            html.a11y-reading #welcome-guide-overlay .wg-gloss { row-gap: 14px; line-height: 1.6; font-size: 13px; }
            html.a11y-reading #welcome-guide-overlay .wg-gloss dd { margin: 0; }
        `;
    }
}
