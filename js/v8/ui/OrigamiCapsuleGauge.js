/* [REF#UI-00147]
 * OrigamiCapsuleGauge — one reusable clear-capsule gauge for every Origami view.
 *
 * This file intentionally has no ESM imports. The engine runs Three r128 as a
 * classic global while Panels runs Three r160 as a module; callers pass their
 * own THREE namespace so the exact same component and geometry contract serves
 * both runtimes. Loading the file publishes window.OrigamiCapsuleGauge.
 */
(function installOrigamiCapsuleGauge(global) {
  'use strict';

  const CACHE = new WeakMap();
  const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));

  function cylinderX(THREE, radius, length, segments, openEnded) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1, !!openEnded);
    geometry.rotateZ(Math.PI / 2);
    return geometry;
  }

  function setTextureColorSpace(THREE, texture) {
    if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
  }

  // ── THE GAUGE LABEL IS LOCALIZED (Mark 2026-07-28: "localize health bars") ────────────────────── [REF#UI-00148]
  // The capsule's printed title was a hard-coded 'HEALTH GAUGE' / 'GOLD GAUGE' baked into a canvas
  // texture, so it stayed English in Japanese play — on the bar floating over the player's own head.
  // It is not markup, so [data-i18n] could never have reached it, and neither could applyLocale.
  //
  // Resolution order: an explicit lang argument → window.t() if the host page has i18n loaded →
  // window.currentLang → English. The engine iframe does NOT load i18n.js (only the shell and Panels
  // do), which is why the JA strings are inlined here rather than looked up: this component is
  // deliberately import-free so it can serve the engine's r128 global and Panels' r160 module from
  // one file, and reaching for a table that may not exist would make it fail in one of the two.
  const LABELS = {
    en: { health: 'HEALTH GAUGE', gold: 'GOLD GAUGE' },
    ja: { health: '体力計',        gold: '金貨計' },
  };
  // Every live marking texture, so a language switch can repaint the ones already on screen. [REF#UI-00149]
  // Deliberately NOT the WeakMap cache above — that is keyed by THREE namespace and cannot be walked.
  const LIVE_MARKINGS = new Set();

  function labelFor(mode, lang) {
    const L = lang
      || (typeof global.currentLang === 'string' ? global.currentLang : null)
      || 'en';
    const key = (mode === 'gold') ? 'gold' : 'health';
    // Prefer the host's own table when it has one, so a wording change in i18n.js wins over the [REF#UI-00150]
    // inline fallback and the two cannot drift.
    if (typeof global.t === 'function') {
      const k = (key === 'gold') ? 'gauge_gold' : 'gauge_health';
      const v = global.t(k, L);
      if (v && v !== k) return v;
    }
    return (LABELS[L] || LABELS.en)[key];
  }

  function createMarkingTexture(THREE, mode, lang) {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const start = 116;
    const width = canvas.width - start * 2;
    const tickY = 166;
    for (let i = 0; i <= 20; i++) {
      const x = start + width * i / 20;
      const major = i % 5 === 0;
      const height = major ? 116 : 68;
      // BLACK INDENTS, NOT WHITE (Mark 2026-08-07) — and this is the WCAG fix, not just taste. [REF#UI-00151]
      // WCAG 2.2 §1.4.11 Non-text Contrast requires >= 3:1 for graphical objects you must perceive to
      // use the control. Measured against the fluid this sits on:
      //     WHITE on 0x4CAF50 = 2.78:1  FAIL      WHITE on 0x66BB6A = 2.36:1  FAIL
      //     BLACK on 0x4CAF50 = 7.56:1  PASS      BLACK on 0x66BB6A = 8.88:1  PASS
      // The old white-over-black draw put the FAILING colour on top. Inverted: a soft light halo goes
      // down first purely so the ticks keep an edge where the capsule is dark/empty, then solid black
      // on top is what you actually read. Ticks are also taller now (Mark: "make it taller").
      // The halo is a HAIRLINE, not a highlight. At .42 it was wide enough to be the thing you saw
      // whenever the bar behind was dark — which is why Mark's screenshot showed WHITE ticks on a bar
      // whose ticks are black. Black is the mark; the halo only stops it disappearing on dark.
      ctx.strokeStyle = 'rgba(255,255,255,.20)';
      ctx.lineWidth = major ? 16 : 12;
      ctx.beginPath();
      ctx.moveTo(x, tickY - height / 2);
      ctx.lineTo(x, tickY + height / 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = major ? 13 : 9;
      ctx.stroke();
      if (major) {
        // Numerals get the same treatment and the same 7.56:1. They are >= 24px equivalent on screen, [REF#UI-00152]
        // so §1.4.3 (text) is satisfied at AA by the same black.
        ctx.font = '900 62px Inter, Arial, sans-serif';
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(255,255,255,.28)';
        ctx.strokeText(String(i * 5), x, 300);
        ctx.fillStyle = '#000';
        ctx.fillText(String(i * 5), x, 300);
      }
    }
    // THE PRINTED TITLE IS OFF BY DEFAULT (Mark 2026-08-07: "i cant read it, so no need for the health [REF#UI-00153]
    // gauge text"). At the size this renders, 'HEALTH GAUGE' was sub-pixel mush — and unreadable text is
    // worse than no text: it costs contrast and space while conveying nothing. The information it carried
    // is already available accessibly next to the bar as real DOM ("100 / 100 HP"), which is what actually
    // satisfies §1.4.1 Use of Colour — the reading never depends on the green alone.
    // NOT DELETED: window._gaugeTitle = true restores it, and the whole localization path below
    // (labelFor / relabel / the JA 体力計 fallback) is intact for anyone who turns it back on.
    // ⚠ IF YOU DO: the font stack MUST contain a Japanese face. Inter and Arial carry no kana or kanji,
    // so 体力計 rasterises as three tofu boxes — a canvas draw fails silently, with no exception.
    if (typeof global !== 'undefined' && global._gaugeTitle === true) {
      ctx.font = '900 64px Inter, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Arial, sans-serif';
      ctx.lineWidth = 15;
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      const title = labelFor(mode, lang);
      ctx.strokeText(title, canvas.width / 2, 430);
      ctx.fillStyle = '#000';
      ctx.fillText(title, canvas.width / 2, 430);
    }
    const texture = new THREE.CanvasTexture(canvas);
    setTextureColorSpace(THREE, texture);
    texture.generateMipmaps = true;
    // Keep what a repaint needs. The redraw reuses THIS canvas and THIS texture — see relabel(). [REF#UI-00154]
    LIVE_MARKINGS.add({ THREE, texture, canvas, mode });
    return texture;
  }

  /** [REF#UI-00155]
   * Repaint every live gauge label in `lang`. Called from the engine's LOCALE_CHANGE handler.
   *
   * ⚠ IT REDRAWS IN PLACE AND SETS needsUpdate — it does NOT build a new CanvasTexture. That matters
   * beyond tidiness: these markings are SHARED across every monster's gauge and the player's own
   * (one texture per mode per THREE namespace, cache.textures[mode]), so minting replacements would
   * orphan the old ones on the GPU and force every gauge material to re-point at a new map. Changing
   * a texture's IMAGE does not touch the r128 program cacheKey — map PRESENCE is what is baked in —
   * so this is a plain GPU re-upload with zero shader recompilation. Swapping the texture object
   * would not have been.
   */
  function relabel(lang) {
    let n = 0;
    LIVE_MARKINGS.forEach((m) => {
      try {
        const ctx = m.canvas.getContext('2d');
        // Clear only the title band — the tick marks and their numerals above it are language-neutral [REF#UI-00156]
        // and redrawing them would mean duplicating the whole tick loop here, which is exactly how the
        // two copies drift apart.
        ctx.clearRect(0, 340, m.canvas.width, m.canvas.height - 340);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 64px Inter, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Arial, sans-serif';
        ctx.lineWidth = 15;
        ctx.strokeStyle = 'rgba(0,0,0,.92)';
        if (global._gaugeTitle === true) {                 // title off => nothing to repaint, but the [REF#UI-00157]
          const title = labelFor(m.mode, lang);            // clear above still runs so a language switch [REF#UI-00158]
          ctx.strokeStyle = 'rgba(255,255,255,.55)';       // cannot leave a stale title behind [REF#UI-00159]
          ctx.strokeText(title, m.canvas.width / 2, 430);
          ctx.fillStyle = '#000';
          ctx.fillText(title, m.canvas.width / 2, 430);
        }
        m.texture.needsUpdate = true;
        n++;
      } catch (_) { /* a disposed texture must not take the rest of the switch down with it */ }
    });
    return n;
  }

  function shared(THREE) {
    let cache = CACHE.get(THREE);
    if (cache) {
      cache.refs += 1;
      return cache;
    }
    const tubeLength = 6.85;
    const contentLength = 6.32;
    cache = {
      refs: 1,
      tubeLength,
      contentLength,
      contentStart: -contentLength / 2,
      shell: cylinderX(THREE, 0.84, tubeLength, 64, true),
      chamber: cylinderX(THREE, 0.70, contentLength, 56, false),
      content: cylinderX(THREE, 0.595, 1, 56, false),
      core: cylinderX(THREE, 0.455, 1, 40, false),
      xpTrack: cylinderX(THREE, 0.15, contentLength, 32, false),
      xpFill: cylinderX(THREE, 0.108, 1, 28, false),
      cap: new THREE.SphereGeometry(0.84, 48, 24),
      xpBulb: new THREE.SphereGeometry(0.145, 24, 14),
      bubble: new THREE.SphereGeometry(1, 12, 8),
      coin: cylinderX(THREE, 0.445, 0.286, 64, false),
      markingPlane: new THREE.PlaneGeometry(6.42, 1.48),
      textures: Object.create(null),
    };
    CACHE.set(THREE, cache);
    return cache;
  }

  function disposeShared(THREE, cache) {
    cache.refs -= 1;
    if (cache.refs > 0) return;
    ['shell', 'chamber', 'content', 'core', 'xpTrack', 'xpFill', 'cap', 'xpBulb', 'bubble', 'coin', 'markingPlane']
      .forEach((key) => cache[key] && cache[key].dispose());
    // Drop the repaint registry entries for these textures FIRST. LIVE_MARKINGS is a strong Set [REF#UI-00160]
    // holding {THREE, texture, canvas}; leaving disposed entries in it would both keep a dead texture
    // and its 2048x512 canvas alive forever, and make relabel() paint into GPU objects that no longer
    // exist. Prune here, where the disposal actually happens.
    Object.keys(cache.textures).forEach((key) => {
      const tex = cache.textures[key];
      LIVE_MARKINGS.forEach((m) => { if (m.texture === tex) LIVE_MARKINGS.delete(m); });
      tex.dispose();
    });
    CACHE.delete(THREE);
  }

  class OrigamiCapsuleGauge {
    constructor(options) {
      options = options || {};
      this.THREE = options.THREE || global.THREE;
      if (!this.THREE) throw new Error('OrigamiCapsuleGauge requires a THREE namespace');
      this.options = options;
      this._shared = shared(this.THREE);
      this.group = new this.THREE.Group();
      this.group.name = 'OrigamiCapsuleGauge';
      this.root = this.group;
      this.mode = options.mode === 'gold' ? 'gold' : 'health';
      this.health = this.healthTarget = clamp(options.health == null ? 100 : options.health);
      this.gold = this.goldTarget = clamp(options.gold == null ? 100 : options.gold);
      this.xp = this.xpTarget = clamp(options.xp == null ? 0 : options.xp);
      this.displayedValue = this.targetValue = this.mode === 'gold' ? this.gold : this.health;
      this.visible = true;
      this.cameraFacing = !!options.cameraFacing;
      this.camera = options.camera || null;
      this._elapsed = 0;
      this._dirty = true;
      this._disposed = false;
      this._animateUntil = 0;
      this._materials = [];
      this._ownedRenderer = false;
      this._reducedMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this._build();
      this._apply(true);
      if (options.layers && options.layers.length) this._setLayers(options.layers);
      if (options.canvas) this._createView(options.canvas);
    }

    _material(Material, values) {
      // Three r128 (engine) predates volume thickness/attenuation while r160 (Panels) supports them. [REF#UI-00161]
      // Filter against the runtime material instance before setValues: visual capability degrades gracefully and,
      // critically, r128 does not emit one warning per unsupported key per monster.
      const material = new Material();
      const supported = {};
      Object.keys(values).forEach((key) => { if (key in material) supported[key] = values[key]; });
      material.setValues(supported);
      this._materials.push(material);
      return material;
    }

    _build() {
      const THREE = this.THREE;
      const s = this._shared;
      const physical = (values) => this._material(THREE.MeshPhysicalMaterial, values);
      const basic = (values) => this._material(THREE.MeshBasicMaterial, values);

      // ── ETHEREAL PASS (Mark 2026-07-24: "match our ethereal monsters a little more? less reflective [REF#UI-00162]
      //    sheen? more ethereal plastic?") ── the ghost monsters read as UNLIT translucent glass: no
      //    specular hotspot, all their light comes from WITHIN. The former fills carried clearcoat 1 at
      //    roughness ~0.03 — a wet-mirror streak under the stage lights (his screenshot). Now: gloss
      //    killed (roughness up, clearcoat down), and the lost pop is returned as EMISSIVE — lit from
      //    inside like the monsters, not reflecting the room. Shell tinted a breath cooler toward the
      //    monster-hull blue (0x7be0ff family). Gold coins stay metallic — different language on purpose.
      //    Dial live then reload: window._gaugeSheen (0..1 clearcoat on the fills, default 0.15) ·
      //    window._gaugeGlow (emissive multiplier, default 1).
      const _sheen = (typeof window !== 'undefined' && typeof window._gaugeSheen === 'number') ? window._gaugeSheen : 0.15;
      const _glow = (typeof window !== 'undefined' && typeof window._gaugeGlow === 'number') ? window._gaugeGlow : 1;
      // SHELL SELF-GLOW (Mark 2026-07-27: "need slight self-illumination of the plastic outer just a bit so [REF#UI-00163]
      // it looks better and not invisible when in low light"). The housing had NO emissive — transmission
      // 0.76 + envMapIntensity 0.08 meant it rendered from incident light alone and vanished in dark rooms
      // (his screenshot: three gauges floating with invisible shells). A faint cool emissive in the same
      // ecto-blue family keeps it readable everywhere without turning it into a lamp; env response nudged up
      // as the secondary "picks up more light" lever. Dial: window._gaugeShellGlow (default 0.3, 0 = old look).
      const _shellGlow = (typeof window !== 'undefined' && typeof window._gaugeShellGlow === 'number') ? window._gaugeShellGlow : 0.3;
      this.clearMaterial = physical({
        // Playing-card blister language, pushed frosted-ghost: broad soft body, near-zero coat, faint [REF#UI-00164]
        // env response — the container reads as cold ecto-plastic instead of showroom acrylic.
        color: 0xd6ecff, roughness: 0.50, metalness: 0.02, transmission: 0.76,
        thickness: 0.50, ior: 1.50, transparent: true, opacity: 0.42,
        clearcoat: 0.08, clearcoatRoughness: 0.55, envMapIntensity: 0.16,
        emissive: 0x3d5866, emissiveIntensity: _shellGlow * _glow,
        side: THREE.DoubleSide, depthWrite: false,
      });
      this.chamberMaterial = physical({
        color: 0xeaf7ff, roughness: 0.40, metalness: 0, transmission: 0.985,
        thickness: 0.20, ior: 1.46, transparent: true, opacity: 0.105,
        clearcoat: 0.12, clearcoatRoughness: 0.45, side: THREE.DoubleSide, depthWrite: false,
      });
      this.greenMaterial = physical({
        // THE PLAYER-MARKER GREEN (Mark 2026-08-07: "give it the same green color as the player green [REF#UI-00165]
        // circle"). That circle is Material Green: outer ring 0x4CAF50, inner ring 0x66BB6A
        // (Engine9 ~:31006-31007). The bar now reads as the same token as the dot you follow on the map.
        // History: 0x2fb03a was "more deep green" (2026-07-25), chosen to match the GoldBarHealthBar
        // reservoir that used to sit in the side panel — and that reservoir is no longer there (d86e122
        // put THIS gauge in the panel), so the thing it was matching is gone. Restore with _hpDeepGreen.
        // ⚠ ALL FOUR GREENS MOVE TOGETHER OR THE HUE FIGHTS ITSELF: body, the colour the glass attenuates
        // toward through its thickness, the emissive glow, and the additive core below. Changing only
        // `color` leaves a 0x166b18/0x238c24 cast that drags it back off the marker's hue.
        color: (typeof window !== 'undefined' && typeof window._hpDeepGreen === 'number') ? window._hpDeepGreen : 0x4CAF50, roughness: 0.42, metalness: 0, transmission: 0.16,
        thickness: 1.12, ior: 1.333, attenuationColor: new THREE.Color(0x1b5e20),
        attenuationDistance: 0.58, transparent: true, opacity: 0.96,
        clearcoat: _sheen, clearcoatRoughness: 0.35, emissive: 0x2e7d32,
        emissiveIntensity: 0.46 * _glow,   // 0.72 -> 0.46 (Mark: "lit up too much") — the body glowing its own colour that hard is what turned the mid-tones milky [REF#UI-00166]
      });
      this.redMaterial = physical({
        color: 0xff083a, roughness: 0.42, metalness: 0, transmission: 0.36,
        thickness: 0.76, ior: 1.43, attenuationColor: new THREE.Color(0xb00024),
        attenuationDistance: 0.58, transparent: true, opacity: 0.82,
        clearcoat: _sheen, clearcoatRoughness: 0.35, emissive: 0x600014,
        emissiveIntensity: 0.42 * _glow, depthWrite: false,
      });
      this.coreMaterial = basic({
        // A pale additive core bleaches toward yellow/white after ACES tone mapping. A darker saturated core [REF#UI-00167]
        // supplies the depth without pulling the body off-hue. Now the player marker's INNER ring green
        // (0x66BB6A, Material Green 400) so the hot centre sits one step up from the body, exactly as the
        // marker's inner ring sits one step up from its outer ring.
        color: 0x66BB6A, transparent: true, opacity: 0.38,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      this.xpMaterial = physical({
        color: 0x168eff, roughness: 0.35, metalness: 0.02, transparent: true,
        opacity: 0.98, clearcoat: _sheen, clearcoatRoughness: 0.35,
        emissive: 0x075dab, emissiveIntensity: 0.95 * _glow,   // ethereal pass: glow, don't reflect (see fills above) [REF#UI-00168]
      });
      this.bubbleMaterial = physical({
        color: 0xffffff, roughness: 0.025, transmission: 1, thickness: 0.05,
        ior: 1.05, transparent: true, opacity: 0.62, depthWrite: false,
      });
      this.goldMaterial = physical({
        // Pure metal without an environment map rendered the edge-on bodies almost black in the live HUD. [REF#UI-00169]
        // Retain a strongly metallic commercial-gold response, but add enough diffuse/emissive body color that
        // all twenty coins remain unmistakably yellow-gold under both the isolated sidebar lights and world lights.
        color: 0xffdf28, roughness: 0.055, metalness: 0.68, clearcoat: 1,
        clearcoatRoughness: 0.012, envMapIntensity: 3.7, side: THREE.DoubleSide,
        emissive: 0xd58b00, emissiveIntensity: 0.72,
      });
      this.goldEdgeMaterial = physical({
        color: 0xffff9a, roughness: 0.032, metalness: 0.58, clearcoat: 1,
        clearcoatRoughness: 0.008, envMapIntensity: 4.0, side: THREE.DoubleSide,
        emissive: 0xffb000, emissiveIntensity: 0.96,
      });
      this.goldEmptyMaterial = physical({
        color: 0x6d5520, roughness: 0.18, metalness: 0.72, transparent: true,
        opacity: 0.16, clearcoat: 0.55, clearcoatRoughness: 0.08, depthWrite: false,
      });

      this.shell = new THREE.Mesh(s.shell, this.clearMaterial);
      this.leftCap = new THREE.Mesh(s.cap, this.clearMaterial);
      this.rightCap = new THREE.Mesh(s.cap, this.clearMaterial);
      this.leftCap.position.x = -s.tubeLength / 2;
      this.rightCap.position.x = s.tubeLength / 2;
      this.leftCap.scale.x = this.rightCap.scale.x = 0.34;
      this.chamber = new THREE.Mesh(s.chamber, this.chamberMaterial);
      this.greenSegment = new THREE.Mesh(s.content, this.greenMaterial);
      this.greenCore = new THREE.Mesh(s.core, this.coreMaterial);
      this.redSegment = new THREE.Mesh(s.content, this.redMaterial);

      this.xpTrack = new THREE.Mesh(s.xpTrack, this.clearMaterial);
      this.xpTrack.position.set(0, 0.60, 0.18);
      this.xpFill = new THREE.Mesh(s.xpFill, this.xpMaterial);
      this.xpFill.position.y = 0.60;
      this.xpFill.position.z = 0.18;
      this.xpBulb = new THREE.Mesh(s.xpBulb, this.xpMaterial);
      this.xpBulb.position.y = 0.60;
      this.xpBulb.position.z = 0.18;

      this._bubbleSeeds = [];
      for (let i = 0; i < 22; i++) {
        const angle = (i * 2.399963229728653) % (Math.PI * 2);
        const radial = 0.10 + ((i * 37) % 100) / 100 * 0.34;
        this._bubbleSeeds.push({
          t: 0.035 + ((i * 43) % 93) / 100,
          y: Math.cos(angle) * radial,
          z: Math.sin(angle) * radial,
          scale: 0.018 + ((i * 29) % 43) / 1000,
          phase: i * 0.73,
          speed: 0.42 + (i % 7) * 0.08,
        });
      }
      this.bubbles = new THREE.InstancedMesh(s.bubble, this.bubbleMaterial, 22);
      this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage || THREE.StreamDrawUsage);
      this.coinsFilled = new THREE.InstancedMesh(s.coin, this.goldMaterial, 20);
      this.coinEdge = new THREE.InstancedMesh(s.coin, this.goldEdgeMaterial, 1);
      this.coinsEmpty = new THREE.InstancedMesh(s.coin, this.goldEmptyMaterial, 20);

      this.markingMaterial = basic({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
      this.markings = new THREE.Mesh(s.markingPlane, this.markingMaterial);
      this.markings.position.set(0, -0.03, 0.835);
      this.markings.renderOrder = 12;

      this.group.add(
        this.chamber, this.redSegment, this.greenSegment, this.greenCore,
        this.bubbles, this.coinsEmpty, this.coinsFilled, this.coinEdge,
        this.xpTrack, this.xpFill, this.xpBulb,
        this.shell, this.leftCap, this.rightCap, this.markings
      );
      [this.shell, this.leftCap, this.rightCap].forEach((mesh) => { mesh.renderOrder = 10; });

      // ── BARE MODE — NO PLASTIC (Mark 2026-08-07: "remove the plastic outer cover for the health bar, [REF#UI-00170]
      //    try a new design, its horrible") ────────────────────────────────────────────────────────────
      // The capsule is a glass tube: a clear shell, two clear end caps, a glass chamber and rising
      // bubbles. At 200x78 that reads as a murky pill, and no amount of colour or light tuning fixes it
      // — every one of those layers sits BETWEEN the eye and the only thing that carries information,
      // which is the fluid level. Four passes of tuning green and lighting could not win against that,
      // because the problem was never the green.
      // Bare mode deletes the glass and leaves a flat, solid bar: a dark recessed track for the empty
      // part, saturated Material Green for the full part, black ticks on top. It reads instantly at HUD
      // size and it is what the WCAG contrast figures were computed against anyway (a transparent
      // green over a dark tube is NOT the 0x4CAF50 those numbers assume — flattening it makes the
      // measured 7.56:1 actually true on screen rather than approximately true).
      // DEFAULT: ON for canvas/HUD mounts (the side panel), OFF in the world — the monster and player
      // capsules floating in the dungeon are Mark's existing look and he did not ask me to touch them.
      // Force either way with window._gaugeBare = true / false.
      const _bareDefault = !!(this.options && this.options.canvas);   // ⚠ `options` is the CONSTRUCTOR's parameter and is NOT in scope inside _build(); reaching for it here threw a ReferenceError that the panel's mount try/catch swallowed into a console.warn — the bar simply never appeared, with zero pageerrors to show for it. [REF#UI-00171]
      const _bare = (typeof global !== 'undefined' && typeof global._gaugeBare === 'boolean') ? global._gaugeBare : _bareDefault;
      if (_bare) {
        this.shell.visible = false;
        this.leftCap.visible = false;
        this.rightCap.visible = false;
        this.bubbles.visible = false;          // bubbles only make sense inside a tube of liquid [REF#UI-00172]
        // the chamber stops being glass and becomes the recessed TRACK the fill runs in [REF#UI-00173]
        // ⚠ THE TRACK ENCLOSES THE FILL — that is why the bar went dark. The chamber is a cylinder of
        // radius 0.70 and the fill is 0.595 INSIDE it, so turning the chamber into a dark near-opaque
        // track put its front wall between the camera and the green. Rendering BACK faces only removes
        // the front wall entirely: you see straight through to the fill, and where there is no fill you
        // see the dark inside of the tube — which is exactly what a recessed track is.
        this.chamberMaterial.side = THREE.BackSide;
        this.chamberMaterial.transparent = true;
        this.chamberMaterial.opacity = 0.92;
        if (this.chamberMaterial.color) this.chamberMaterial.color.setHex(0x12181a);
        if ('transmission' in this.chamberMaterial) this.chamberMaterial.transmission = 0;
        if ('roughness' in this.chamberMaterial) this.chamberMaterial.roughness = 0.85;
        if ('metalness' in this.chamberMaterial) this.chamberMaterial.metalness = 0;
        if (this.chamberMaterial.emissive) this.chamberMaterial.emissive.setHex(0x000000);
        // the fill stops being tinted glass and becomes solid paint, so the green is the green [REF#UI-00174]
        if ('transmission' in this.greenMaterial) this.greenMaterial.transmission = 0;
        this.greenMaterial.opacity = 1;
        this.greenMaterial.transparent = false;
        if ('clearcoat' in this.greenMaterial) this.greenMaterial.clearcoat = 0.12;
        if ('roughness' in this.greenMaterial) this.greenMaterial.roughness = 0.55;
        if ('transmission' in this.redMaterial) this.redMaterial.transmission = 0;
        // ── THE DAMAGE MUST READ AS RED (Mark 2026-08-08: "health bar on right side panel should [REF#UI-00175]
        //    show red when there is damage to player") ─────────────────────────────────────────────
        // The red lost-health segment was ALWAYS drawn here — at 45% HP the instance read
        // visible:true, correctly scaled — and the canvas showed rgb(17,10,13). Near-black. CONVICTED
        // BY TOGGLE, not theory: hiding meshes one at a time, ONLY hiding the chamber brightened the
        // wound region — (17,10,13) → (145,26,48). The chamber's dark BackSide "recessed track" is
        // alpha-composited OVER the red segment at exactly its 0.92 opacity (0.08 × red = the
        // near-black measured, twice, to the digit). Two dead ends recorded so nobody re-walks them:
        // raising red's emissive to match green's paint treatment (a01228) still rendered pink-grey —
        // the studio rig (Spot 26 + Point 12) plus ACES desaturates lit red into salmon; and flat
        // unlit paint (black base + pure emissive) WHILE OPAQUE went darker still, because the veil
        // multiplies whatever sits under it.
        // THE FIX: red leaves the opaque pass. transparent:true at opacity 1 + renderOrder 9 puts it
        // in the transparent list AFTER the chamber (renderOrder 1), so the damage paints OVER the
        // track veil instead of under it — and flat unlit paint (black base, red emissive, no
        // specular) makes the colour immune to the light rig that pinked it. MEASURED at 45% HP:
        // 1214 red pixels, wound avg rgb(131,4,23); at 100%: zero red; at 10%: red dominates.
        // Panel/HUD only — this whole block is _bare; the in-world capsules are untouched.
        this.redMaterial.color.setHex(0x000000);
        if (this.redMaterial.emissive) this.redMaterial.emissive.setHex(0xcc1531);
        if ('roughness' in this.redMaterial) this.redMaterial.roughness = 1;
        if ('clearcoat' in this.redMaterial) this.redMaterial.clearcoat = 0;
        this.redMaterial.transparent = true;
        this.redMaterial.opacity = 1;
        this.redSegment.renderOrder = 9;
        this._bareRedOrder = 9;   // survives the unconditional renderOrder re-assignments below [REF#UI-00176]
        this.greenCore.visible = false;        // the additive hot core was depth for a translucent tube [REF#UI-00177]
        this.chamber.renderOrder = 0;
        // 2x TALLER (Mark 2026-08-07). Scaling the GROUP in Y is safe now and only now: it would have [REF#UI-00178]
        // squashed the round end caps into ellipses, and in bare mode those caps are gone. This also
        // spends the vertical space that was reading as emptiness rather than adding more of it.
        this.group.scale.y = (typeof global !== 'undefined' && typeof global._gaugeBareYScale === 'number') ? global._gaugeBareYScale : 2;
        this._bare = true;
      }
      this.chamber.renderOrder = 1;
      this.redSegment.renderOrder = this._bareRedOrder || 2;   // bare: 9 — red must draw AFTER the chamber's transparent track veil (see the wound fix above); this line used to clobber it back to 2 [REF#UI-00179]
      this.greenSegment.renderOrder = 3;
      this.greenCore.renderOrder = 4;
      this.bubbles.renderOrder = 5;
      this.xpTrack.renderOrder = 6;
      this.xpFill.renderOrder = this.xpBulb.renderOrder = 7;
      this.coinsEmpty.renderOrder = this.coinsFilled.renderOrder = this.coinEdge.renderOrder = 8;
      this.group.traverse((object) => {
        if (object.isMesh || object.isInstancedMesh) object.raycast = function noGaugeRaycast() {};
      });
    }

    _setLayers(layers) {
      this.group.traverse((object) => {
        object.layers.mask = 0;
        layers.forEach((layer) => object.layers.enable(layer));
      });
    }

    _textureForMode() {
      const s = this._shared;
      if (!s.textures[this.mode]) s.textures[this.mode] = createMarkingTexture(this.THREE, this.mode, this.options.lang);
      return s.textures[this.mode];
    }

    _setInstance(mesh, index, x, y, z, scale) {
      if (!this._dummy) this._dummy = new this.THREE.Object3D();
      this._dummy.position.set(x, y, z);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.setScalar(scale == null ? 1 : scale);
      this._dummy.updateMatrix();
      mesh.setMatrixAt(index, this._dummy.matrix);
    }

    _applyBubbles(normalized, animate) {
      let count = 0;
      const start = this._shared.contentStart;
      const length = this._shared.contentLength;
      for (let i = 0; i < this._bubbleSeeds.length; i++) {
        const bubble = this._bubbleSeeds[i];
        if (bubble.t > normalized || normalized <= 0.002) continue;
        const driftY = animate ? Math.sin(this._elapsed * bubble.speed + bubble.phase) * 0.028 : 0;
        const driftZ = animate ? Math.cos(this._elapsed * bubble.speed * 0.72 + bubble.phase) * 0.022 : 0;
        this._setInstance(this.bubbles, count++, start + bubble.t * length, bubble.y + driftY, bubble.z + driftZ, bubble.scale);
      }
      this.bubbles.count = count;
      this.bubbles.instanceMatrix.needsUpdate = true;
    }

    _applyCoins(percent) {
      const THREE = this.THREE;
      const filled = Math.max(0, Math.min(20, Math.round(percent / 5)));
      const step = this._shared.contentLength / 20;
      const firstX = this._shared.contentStart + step / 2;
      let brightCount = 0;
      for (let i = 0; i < Math.max(0, filled - 1); i++) this._setInstance(this.coinsFilled, brightCount++, firstX + i * step, -0.05, 0.14, 1);
      this.coinsFilled.count = brightCount;
      this.coinsFilled.instanceMatrix.needsUpdate = true;
      this.coinEdge.count = filled > 0 ? 1 : 0;
      if (filled > 0) {
        this._setInstance(this.coinEdge, 0, firstX + (filled - 1) * step, -0.05, 0.14, 1);
        this.coinEdge.instanceMatrix.needsUpdate = true;
      }
      let emptyCount = 0;
      for (let i = filled; i < 20; i++) this._setInstance(this.coinsEmpty, emptyCount++, firstX + i * step, -0.05, 0.14, 1);
      this.coinsEmpty.count = emptyCount;
      this.coinsEmpty.instanceMatrix.needsUpdate = true;
      void THREE;
    }

    _apply(force, animateBubbles) {
      if (!force && !this._dirty) return;
      const s = this._shared;
      const value = clamp(this.displayedValue);
      const normalized = value / 100;
      const healthMode = this.mode === 'health';
      const greenLength = s.contentLength * normalized;
      const redLength = s.contentLength - greenLength;
      // ⚠ THIS LINE OVERWRITES BUILD-TIME VISIBILITY EVERY FRAME. Setting bubbles/core hidden in [REF#UI-00180]
      // _build() looked correct and did nothing — the probe read them back visible:true while the
      // shell and caps (which nothing rewrites) stayed hidden. Same class as the health-bar rotation:
      // if a value is rewritten per frame, the only place that can hide it is here.
      const _showFill = healthMode && greenLength > 0.001;
      this.greenSegment.visible = _showFill;
      this.greenCore.visible = _showFill && !this._bare;   // bare = flat paint, no additive hot core [REF#UI-00181]
      this.bubbles.visible   = _showFill && !this._bare;   // bare = no tube, so nothing to bubble in [REF#UI-00182]
      this.redSegment.visible = healthMode && redLength > 0.001;
      this.greenSegment.scale.x = this.greenCore.scale.x = Math.max(0.0001, greenLength);
      this.greenSegment.position.x = this.greenCore.position.x = s.contentStart + greenLength / 2;
      this.redSegment.scale.x = Math.max(0.0001, redLength);
      this.redSegment.position.x = s.contentStart + greenLength + redLength / 2;
      this.coinsFilled.visible = this.coinEdge.visible = this.coinsEmpty.visible = !healthMode;
      if (healthMode) this._applyBubbles(normalized, !!animateBubbles);
      else this._applyCoins(value);

      const xpLength = s.contentLength * clamp(this.xp) / 100;
      this.xpFill.visible = this.xpBulb.visible = xpLength > 0.001;
      this.xpFill.scale.x = Math.max(0.0001, xpLength);
      this.xpFill.position.x = s.contentStart + xpLength / 2;
      this.xpBulb.position.x = Math.min(s.contentStart + xpLength, -s.contentStart - 0.10);

      const texture = this._textureForMode();
      if (this.markingMaterial.map !== texture) {
        this.markingMaterial.map = texture;
        this.markingMaterial.needsUpdate = true;
      }
      if (this.contentLight) {
        this.contentLight.color.setHex(healthMode ? 0x66BB6A : 0xffe128);   // was lime 0x7cff5a — pulled the body back toward lime; now the marker's inner-ring green [REF#UI-00183]
        // TONED DOWN (Mark 2026-08-07: "make the green health bar more green - its lit up too much"). [REF#UI-00184]
      // At full health this was 8 + 9 = 17 on a PointLight sitting INSIDE the fluid, under a 62-intensity
      // spot at exposure 1.36 — the green was not pale, it was BLOWN OUT: ACES rolls an over-driven
      // saturated colour toward white, so the more light we threw at it the less green it could be.
      // Turning light DOWN is what makes it read greener. Knob: window._gaugeLightMul.
      const _lm = (typeof window !== 'undefined' && typeof window._gaugeLightMul === 'number') ? window._gaugeLightMul : 0.42;
      this.contentLight.intensity = ((healthMode ? 8 : 7) + normalized * (healthMode ? 9 : 11)) * _lm;
      }
      if (typeof this.onState === 'function') {
        const state = healthMode ? (value <= 24 ? 'CRITICAL' : value <= 48 ? 'WARNING' : 'STABLE') : 'WAGER';
        this.onState(Math.round(value), state, this.mode, Math.round(this.xp));
      }
      this._dirty = false;
    }

    _createView(canvas) {
      const THREE = this.THREE;
      this.canvas = canvas;
      this.renderer = this.options.renderer || new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
      this._ownedRenderer = !this.options.renderer;
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      else if ('outputEncoding' in this.renderer && THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = (typeof global._gaugeExposure === 'number') ? global._gaugeExposure : 1.02;   // 1.36 -> 1.02: less highlight roll-off means the green keeps its saturation instead of bleaching [REF#UI-00185]
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(27, 1, 0.1, 100);
      this.camera.position.set(0, 0.12, (typeof global._gaugeCamZ === 'number') ? global._gaugeCamZ : 9.9);   // 11.8 -> 9.9: with the title gone the capsule can fill more of the canvas, so it reads TALLER without the slot growing back into dead space [REF#UI-00186]
      this.scene.add(this.group);
      this.scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x071018, 0.72));   // 1.28 -> 0.72; a cool sky fill washes a saturated green faster than anything else here [REF#UI-00187]
      const spot = new THREE.SpotLight(0xffffff, 26, 34, Math.PI / 5.2, 0.48, 1.35);   // 62 -> 26; kept only for the glass edge highlight, not to light the fluid [REF#UI-00188]
      spot.position.set(-3.5, 6.4, 6.9);
      spot.target.position.set(0, 0, 0);
      this.scene.add(spot, spot.target);
      const cool = new THREE.PointLight(0x9ecfff, 12, 14, 2);
      cool.position.set(4.4, 2.7, 3.6);
      this.scene.add(cool);
      this.contentLight = new THREE.PointLight(this.mode === 'gold' ? 0xffe128 : 0x66BB6A, 12, 9, 2);   // was lime 0x7cff5a — the last lime left in the chain, and it tinted the fluid back off the marker green [REF#UI-00189]
      this.contentLight.position.set(0, -0.35, 2.4);
      this.scene.add(this.contentLight);
      this._onResize = () => { this.resize(); global._compassionInvalidate?.(); };
      global.addEventListener('resize', this._onResize, { passive: true });
      if (global.ResizeObserver) {
        this._resizeObserver = new global.ResizeObserver(this._onResize);
        this._resizeObserver.observe(canvas.parentElement || canvas);
      }
      this.resize();
      this._clock = new THREE.Clock();
      const loop = () => {
        if (this._disposed) return;
        this._frame = global._compassionFrame ? global._compassionFrame(loop, () => !this._disposed) : global.requestAnimationFrame(loop);
        const delta = Math.min(0.05, this._clock.getDelta());
        if (this.update(delta)) this.renderer.render(this.scene, this.camera);
      };
      this._renderLoop = loop;
      loop();
    }

    setMode(mode) {
      const next = mode === 'gold' ? 'gold' : 'health';
      if (next === this.mode) return this.mode;
      this.mode = next;
      this.targetValue = next === 'gold' ? this.goldTarget : this.healthTarget;
      this._dirty = true;
      this._animateUntil = this._elapsed + 1.4;
      return this.mode;
    }

    setHealth(percent, immediate) {
      const next = clamp(percent);
      if (!immediate && Math.abs(next - this.healthTarget) < 0.001) return this.healthTarget;
      this.healthTarget = next;
      global._compassionInvalidate?.();
      if (immediate) this.health = this.healthTarget;
      if (this.mode === 'health') {
        this.targetValue = this.healthTarget;
        if (immediate) this.displayedValue = this.targetValue;
      }
      this._dirty = true;
      this._animateUntil = this._elapsed + 1.4;
      return this.healthTarget;
    }

    setGold(percent, immediate) {
      const next = clamp(percent);
      if (!immediate && Math.abs(next - this.goldTarget) < 0.001) return this.goldTarget;
      this.goldTarget = next;
      global._compassionInvalidate?.();
      if (immediate) this.gold = this.goldTarget;
      if (this.mode === 'gold') {
        this.targetValue = this.goldTarget;
        if (immediate) this.displayedValue = this.targetValue;
      }
      this._dirty = true;
      this._animateUntil = this._elapsed + 1.4;
      return this.goldTarget;
    }

    setXP(percent, immediate) {
      const next = clamp(percent);
      if (!immediate && Math.abs(next - this.xpTarget) < 0.001) return this.xpTarget;
      this.xpTarget = next;
      global._compassionInvalidate?.();
      if (immediate) this.xp = this.xpTarget;
      this._dirty = true;
      this._animateUntil = this._elapsed + 0.9;
      return this.xpTarget;
    }

    damage(amount) { return this.setHealth(this.healthTarget - Math.abs(Number(amount) || 0)); }
    heal(amount) { return this.setHealth(this.healthTarget + Math.abs(Number(amount) || 0)); }
    spendGold(amount) { return this.setGold(this.goldTarget - Math.abs(Number(amount) || 0)); }
    addGold(amount) { return this.setGold(this.goldTarget + Math.abs(Number(amount) || 0)); }

    setVisible(visible) {
      const next = !!visible;
      if (next === this.visible) return this.visible;
      this.visible = next;
      this.group.visible = this.visible;
      if (this.canvas) this.canvas.style.visibility = this.visible ? '' : 'hidden';
      this._dirty = this.visible;
      return this.visible;
    }

    setPosition(x, y, z) { this.group.position.set(x, y, z); return this; }
    setScale(scale) { this.group.scale.setScalar(Number(scale) || 0); return this; }
    setCameraFacing(enabled) { this.cameraFacing = !!enabled; return this.cameraFacing; }

    update(deltaSeconds) {
      if (this._disposed || !this.visible) return false;
      const compassionStatic = this._ownedRenderer && global._compassionRender?.staticVisuals;
      if (compassionStatic) {
        if (this.health !== this.healthTarget || this.gold !== this.goldTarget || this.xp !== this.xpTarget || this.displayedValue !== this.targetValue) this._dirty = true;
        this.health = this.healthTarget; this.gold = this.goldTarget; this.xp = this.xpTarget; this.displayedValue = this.targetValue;
      }
      const delta = Math.max(0, Math.min(0.1, Number(deltaSeconds) || 0));
      this._elapsed += delta;
      const ease = 1 - Math.exp(-delta * 8);
      const before = this.displayedValue;
      this.health += (this.healthTarget - this.health) * ease;
      this.gold += (this.goldTarget - this.gold) * ease;
      this.xp += (this.xpTarget - this.xp) * ease;
      this.displayedValue += (this.targetValue - this.displayedValue) * ease;
      if (Math.abs(this.targetValue - this.displayedValue) < 0.01) this.displayedValue = this.targetValue;
      const moving = Math.abs(before - this.displayedValue) > 0.0005 || Math.abs(this.xpTarget - this.xp) > 0.01;
      const animateBubbles = !compassionStatic && !this._reducedMotion && (moving || this._elapsed < this._animateUntil);
      if (moving || animateBubbles) this._dirty = true;
      // ── YAW-ONLY BILLBOARD — THE BAR MUST NOT ROLL (Mark 2026-07-28) ──────────────────────────── [REF#UI-00190]
      // "dont let these things flip on axis when moving, as it needs to be stationary horizontally to
      //  be seen at all times properly. when player moves and turns it has a habit of flipping on its
      //  axis."
      // This copied the camera's FULL quaternion, so the capsule inherited the camera's PITCH and ROLL
      // as well as its yaw. Look up, look down, or take any camera shake/trauma, and a bar that is only
      // legible while horizontal tips with the view — the "flipping on its axis" he is describing. It
      // is worst exactly when it matters, because combat is when the camera moves most.
      // Decomposing in 'YXZ' order isolates the yaw term cleanly (that order applies Y first, so e.y is
      // the true heading regardless of pitch), and zeroing X and Z pins the capsule level. It still
      // turns to face the player; it just no longer leans.
      // Off: window._gaugeYawOnly = false → the old full-quaternion copy.
      // v3 (Mark 2026-08-07, SAME COMPLAINT AGAIN): "stop them from rotating vertical on their axis,
      // they should be stationary horizontal at all times."
      // v2 (above) zeroed X and Z, which is necessary but NOT sufficient, because it derived the yaw by
      // decomposing the CAMERA QUATERNION in YXZ — degenerate at pitch = ±90°, i.e. looking straight
      // down, i.e. TOP-DOWN VIEW.
      // MEASURED, not asserted (same camera heading of 0.7 rad held constant, yaw recovered at each pitch):
      //     pitch    0° → 40.1°     -60° → 40.1°     -85° → 40.1°     -89.9° → 40.1°     -90° → 0.0°
      // So it is not gradual drift — it agrees perfectly right up to the singularity and then SNAPS, in
      // this example by 40° in one frame, because three.js clamps the degenerate term to zero. Every
      // entry into and exit from top-down crosses that point, and the bar visibly whips around its
      // vertical axis while remaining perfectly level. That is why "we already fixed the tilt" was true
      // and Mark's complaint was ALSO true: they are two different faults with one symptom.
      // The heading a billboard actually wants has nothing to do with how the camera is tilted — it is
      // just the horizontal direction from the bar to the viewer. atan2 of that offset is exact at every
      // pitch, including straight down, and needs no Euler order at all.
      // DIRECTLY OVERHEAD is the one case with no answer (the horizontal offset is ~0, every heading is
      // equally valid). v2 span the bar there; this HOLDS THE LAST GOOD YAW, which is what "stationary"
      // means. Off: window._gaugeYawOnly = false → the old full-quaternion copy (leans with the camera).
      if (this.cameraFacing && this.camera) {
        const _yawOnly = (typeof global.window === 'undefined' || global._gaugeYawOnly !== false);
        if (_yawOnly) {
          const T = this.THREE;
          this._camWP = this._camWP || new T.Vector3();
          this._grpWP = this._grpWP || new T.Vector3();
          this.camera.getWorldPosition(this._camWP);
          this.group.getWorldPosition(this._grpWP);
          const dx = this._camWP.x - this._grpWP.x, dz = this._camWP.z - this._grpWP.z;
          if (dx * dx + dz * dz > 1e-6) this._lastYaw = Math.atan2(dx, dz);   // else: keep the last heading [REF#UI-00191]
          // PARENT-AWARE, AND THIS IS THE PART THAT WAS ACTUALLY BROKEN. These gauges are CHILDREN of the [REF#UI-00192]
          // actor (Engine9 ~:67372 `playerAvatar.add(_pg)`; monsters the same), and the actor's yaw is
          // rewritten every frame (~:67332 `playerAvatar.rotation.y = -rot`). `group.rotation` is LOCAL, so
          // a world-space heading written straight into it is silently added to whatever way the creature
          // happens to be facing — which is why the bar swings around as you turn even though nothing here
          // is "wrong". Subtract the parent's accumulated world yaw and the bar holds a true world heading.
          let _pYaw = 0;
          for (let _p = this.group.parent; _p; _p = _p.parent) _pYaw += _p.rotation.y || 0;
          this.group.rotation.set(0, (this._lastYaw || 0) - _pYaw, 0);
        } else {
          this.group.quaternion.copy(this.camera.quaternion);
        }
      }
      const shouldRender = this._dirty;
      this._apply(false, animateBubbles);
      return shouldRender;
    }

    resize(width, height) {
      if (!this.renderer || !this.camera || !this.canvas) return this;
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(2, Math.floor(width || rect.width));
      const h = Math.max(2, Math.floor(height || rect.height));
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      const halfW = 3.85;
      const halfH = 1.02;
      const fov = this.camera.fov * Math.PI / 180;
      const zH = halfH / Math.tan(fov / 2);
      const zW = (halfW / this.camera.aspect) / Math.tan(fov / 2);
      this.camera.position.z = Math.max(zH, zW) * 1.04 + 0.30;
      this.camera.updateProjectionMatrix();
      this._dirty = true;
      return this;
    }

    dispose() {
      if (this._disposed) return;
      this._disposed = true;
      global._compassionForget?.(this._renderLoop);
      if (this._frame) global.cancelAnimationFrame(this._frame);
      if (this._onResize) global.removeEventListener('resize', this._onResize);
      if (this._resizeObserver) this._resizeObserver.disconnect();
      if (this.group.parent) this.group.parent.remove(this.group);
      this._materials.forEach((material) => material.dispose());
      if (this._ownedRenderer && this.renderer) this.renderer.dispose();
      disposeShared(this.THREE, this._shared);
    }
  }

  // Repaint every live gauge label when the language changes (Mark 2026-07-28 "localize health bars"). [REF#UI-00193]
  // Hung off the constructor rather than exported separately so the single global stays the whole API.
  OrigamiCapsuleGauge.relabel = relabel;
  OrigamiCapsuleGauge.labelFor = labelFor;   // read-only handle for probes [REF#UI-00194]
  global.OrigamiCapsuleGauge = OrigamiCapsuleGauge;
})(typeof window !== 'undefined' ? window : globalThis);
