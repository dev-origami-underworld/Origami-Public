/** [REF#DG-00917]
 * ProceduralTextures.js — T0.1.C extraction from NewOrigami.Engine9.html
 *
 * Pure canvas-based texture generators. Each function returns a THREE.CanvasTexture.
 * THREE is bound from window (CDN global) — no ES module import needed for Three.js.
 *
 * Exports:
 *   createWashiPaperTexture()
 *   createDungeonFloorTexture()
 *   createDarkWoodRafterTexture()
 *   createSpiderwebVariantA/B/C/D/E/F()
 *   createDungeonTopTexture()
 *   createShojiTexture()
 *   makePaperTexture(baseColor)
 *   createShibaiWallTexture()   — the playhouse wall (2026-08-26); see its own header for why the
 *                                 washi/lattice wall it replaces could not be tinted into wood
 */

// Three.js is loaded as a CDN global before this module runs. [REF#DG-00918]
const THREE = window.THREE;

export function createWashiPaperTexture(){
    const sz=256, c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');
    // Warm cream washi base [REF#DG-00919]
    const grad=ctx.createLinearGradient(0,0,0,sz);
    grad.addColorStop(0,'#fff2c8'); grad.addColorStop(0.5,'#ffd985'); grad.addColorStop(1,'#ffb060');
    ctx.fillStyle=grad; ctx.fillRect(0,0,sz,sz);
    // Paper fiber noise [REF#DG-00920]
    for(let i=0;i<800;i++){
        ctx.fillStyle=`rgba(120,70,30,${Math.random()*0.08})`;
        ctx.fillRect(Math.random()*sz,Math.random()*sz,1+Math.random()*2,1);
    }
    // Horizontal bamboo strut shadows (rings around lantern) [REF#DG-00921]
    ctx.strokeStyle='rgba(60,30,10,0.45)'; ctx.lineWidth=2;
    for(let y=20;y<sz;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(sz,y);ctx.stroke();}
    // Faint kanji "灯" (light) center [REF#DG-00922]
    ctx.fillStyle='rgba(120,30,10,0.6)';
    ctx.font='900 110px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('灯',sz/2,sz/2);
    // Top/bottom dark caps [REF#DG-00923]
    ctx.fillStyle='#1a0e05'; ctx.fillRect(0,0,sz,8); ctx.fillRect(0,sz-8,sz,8);
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}

export function createDungeonFloorTexture(){
    // ── OLD JAPANESE PLANK FLOOR (板の間) ──────────────────────────────────────────────────────── [REF#DG-00924]
    //    Mark 2026-08-26: "make the floor tiles more like realistic japanese wood floor, dark wood,
    //    old dusty." What was here read as cool charcoal DECKING: base #22201d (a grey-brown, blue
    //    channel LOWEST — that is grey, not wood), FOUR fat planks per tile, and a 4px black
    //    strokeRect around every tile.
    //
    //    ⚠ ONE TEXTURE = ONE 2-METRE FLOOR TILE. Engine9 :8317 does `floorTex.repeat.set(1,1)` and
    //    :14509 builds ONE instanced box per GRID=2 tile — so the plank COUNT here IS the board
    //    width, it is not a styling choice. Four planks across 2 m = 500 mm boards, which is not a
    //    floor, it is a deck. Real 縁甲板 (engawa/room flooring) runs 105-150 mm, so 14 boards
    //    across the tile = 143 mm. That single number does more for "Japanese floor" than any
    //    amount of grain detail.
    //
    //    ⚠ AND THE BORDER HAD TO GO WITH IT. The black strokeRect drew a hard line around every
    //    2 m tile — that is what made this read as TILES rather than as a floor, and it was also
    //    doing a real job: hiding the fact that nothing else in here wrapped, so the pattern seam
    //    was invisible behind the border. Remove the border without fixing the wrapping and you
    //    just trade a grid of lines for a grid of seams. So every blob below (knot, stain, dust
    //    bloom) is drawn through `wrap()`, which repeats it across the 8 neighbouring tile offsets
    //    — anything crossing an edge comes back on the far side and the tile is genuinely seamless.
    //    Border back: window._floorTileBevel = true.
    //
    //    THE FOUR CUES THAT MAKE IT READ AS OLD JAPANESE, in order of how much they carry:
    //      1. BOARD WIDTH (above) · 2. STAGGERED BUTT JOINTS — real boards are finite and their end
    //      joints stagger from row to row; a floor with no end joints reads as printed paper ·
    //      3. WARM tone — aged sugi/hinoki darkened by a century of smoke and oil is BROWN (red
    //      channel highest), never the cool grey that was here · 4. DUST IN THE SEAMS, not sprinkled
    //      evenly — dust falls into the gaps between boards and sits along their edges, which is
    //      what "old dusty" actually looks like underfoot.
    const sz=512,c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');
    const R=(a,b)=>a+Math.random()*(b-a);
    // Draw fn across the 3x3 tile neighbourhood so edge-crossing marks wrap instead of clipping. [REF#DG-00925]
    const wrap=(fn)=>{ for(const dx of [-sz,0,sz]) for(const dy of [-sz,0,sz]) fn(dx,dy); };

    // Base: warm dark brown. Red > green > blue — the thing the old grey base got backwards. [REF#DG-00926]
    ctx.fillStyle='#22201d'; ctx.fillRect(0,0,sz,sz);   // 08-12 EXACTLY (copy ProceduralTextures.41671ab2.js:50). Today's jp-floor rework moved this to #2b1f16 (S 32%) and THAT is what made the room brown under the same lamps that always lit it.   // drained: was #2b1f16 (S 32%) -> Burton drab field [REF#DG-00927]

    const nPlanks=14, pH=sz/nPlanks;
    for(let p=0;p<nPlanks;p++){
        const y=p*pH;
        // Per-board tone. Aged sugi varies board to board — a floor where every board matches [REF#DG-00928]
        // reads as laminate. Kept dark (Mark: "dark wood") but warm.
        const r=Math.round(R(46,70)), g=Math.round(r*R(0.925,0.955)), b=Math.round(r*R(0.835,0.865));   // the 08-12 base #22201d is g/r 0.94, b/r 0.85 -> S ~8%. COLOUR copied from 08-12; the plank STRUCTURE is Mark's 08-26 jp-floor order and stays. (My drab pass had taken these to ~2.5%, which is drabber than the gold look, not the same as it.) [REF#DG-00929]
        // ⚠ DRAINED TWICE. 9% still rendered ORANGE (S 23-30% measured in FPV) because the floor is the [REF#DG-00930]
        //   one plane the WARM headlamp cone lights, and warm light on a warm-biased plank multiplies into
        //   orange. A floor that must stay drab UNDER warm light has to be near-neutral in the texture.
        ctx.fillStyle=`rgb(${r},${g},${b})`;
        ctx.fillRect(0,y+1,sz,pH-2);

        // FOOT POLISH — a century of bare feet burnishes the middle of a board, not its edges. [REF#DG-00931]
        const pg=ctx.createLinearGradient(0,y,0,y+pH);
        pg.addColorStop(0,'rgba(0,0,0,0.30)');
        pg.addColorStop(0.5,`rgba(${r+26},${g+20},${b+14},0.20)`);
        pg.addColorStop(1,'rgba(0,0,0,0.34)');
        ctx.fillStyle=pg; ctx.fillRect(0,y,sz,pH);

        // MASAME — straight grain. Japanese carpentry selects for it, so the lines run nearly [REF#DG-00932]
        // parallel; the old code's ±3px wander per 64px read as knotty pine.
        for(let gI=0;gI<11;gI++){
            const gy=y+R(2,pH-2);
            ctx.strokeStyle=`rgba(${Math.round(r*0.42)},${Math.round(g*0.42)},${Math.round(b*0.42)},${R(0.12,0.34)})`;
            ctx.lineWidth=R(0.5,1.3);
            ctx.beginPath(); ctx.moveTo(0,gy);
            for(let x=32;x<=sz;x+=32) ctx.lineTo(x,gy+R(-0.7,0.7));   // near-parallel, not wavy [REF#DG-00933]
            ctx.stroke();
        }

        // BUTT JOINTS — the end of a board. 0-2 per row, staggered by row, never at x=0 (that is [REF#DG-00934]
        // the tile edge and would read as a grid line the moment it lined up with its neighbour).
        const nJ=Math.random()<0.55?1:(Math.random()<0.35?2:0);
        for(let j=0;j<nJ;j++){
            const jx=R(sz*0.12,sz*0.88);
            ctx.fillStyle='rgba(0,0,0,0.72)'; ctx.fillRect(jx,y+1,R(1.2,2.2),pH-2);
            ctx.fillStyle=`rgba(${r+30},${g+24},${b+18},0.16)`; ctx.fillRect(jx+2,y+1,1,pH-2);  // lit lip
        }

        // KNOTS — sparse. Warm-dark, ringed, and wrapped so one on the edge survives the tiling. [REF#DG-00935]
        if(Math.random()<0.30){
            const kx=R(0,sz), ky=y+R(4,pH-4), kr=R(4,8);
            wrap((dx,dy)=>{
                const kg=ctx.createRadialGradient(kx+dx,ky+dy,0,kx+dx,ky+dy,kr);
                kg.addColorStop(0,'rgba(12,12,14,0.88)');
                kg.addColorStop(0.55,`rgba(${Math.round(r*0.45)},${Math.round(g*0.42)},${Math.round(b*0.40)},0.55)`);
                kg.addColorStop(1,'rgba(0,0,0,0)');
                ctx.fillStyle=kg; ctx.fillRect(kx+dx-kr,ky+dy-kr,kr*2,kr*2);
            });
        }

        // THE SEAM between boards, and THE DUST THAT LIVES IN IT. This pairing is the whole [REF#DG-00936]
        // "old dusty" read: a dark gap with pale settled dust banked along its lit edge.
        ctx.fillStyle='rgba(0,0,0,0.88)'; ctx.fillRect(0,y,sz,1.6);
        ctx.fillStyle='rgba(158,155,148,0.13)'; ctx.fillRect(0,y+1.6,sz,1.0);
        for(let dI=0;dI<34;dI++){                                  // dust banked unevenly, not a stripe [REF#DG-00937]
            const dx2=R(0,sz);
            ctx.fillStyle=`rgba(158,155,148,${R(0.06,0.19)})`;
            ctx.fillRect(dx2,y+R(1.4,3.8),R(3,17),R(0.6,1.5));
        }
        // SCUFF — a drag mark where something heavy was pushed across the board. Sparse; these are [REF#DG-00938]
        // what separate "dark wood" from "walked on for a century".
        if(Math.random()<0.34){
            const sx=R(0,sz*0.7), sw=R(40,150), sy=y+R(4,pH-4);
            ctx.strokeStyle=`rgba(${r+34},${g+28},${b+22},${R(0.06,0.14)})`;
            ctx.lineWidth=R(1.4,3.2);
            ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+sw,sy+R(-1.5,1.5)); ctx.stroke();
        }
    }

    // AGE STAINS — broad, soft, warm-dark. Wrapped, so no stain is cut off at a tile edge. [REF#DG-00939]
    for(let s2=0;s2<7;s2++){
        const ax=R(0,sz), ay=R(0,sz), ar=R(34,86);
        wrap((dx,dy)=>{
            const ag=ctx.createRadialGradient(ax+dx,ay+dy,0,ax+dx,ay+dy,ar);
            ag.addColorStop(0,`rgba(12,12,14,${R(0.16,0.30)})`); ag.addColorStop(1,'rgba(0,0,0,0)');
            ctx.fillStyle=ag; ctx.fillRect(ax+dx-ar,ay+dy-ar,ar*2,ar*2);
        });
    }
    // DUST BLOOM — the pale film that settles where nobody walks. Very low alpha, large radius. [REF#DG-00940]
    for(let s3=0;s3<8;s3++){
        const ax=R(0,sz), ay=R(0,sz), ar=R(46,118);
        wrap((dx,dy)=>{
            const ag=ctx.createRadialGradient(ax+dx,ay+dy,0,ax+dx,ay+dy,ar);
            ag.addColorStop(0,`rgba(154,150,142,${R(0.08,0.18)})`); ag.addColorStop(1,'rgba(154,150,142,0)');
            ctx.fillStyle=ag; ctx.fillRect(ax+dx-ar,ay+dy-ar,ar*2,ar*2);
        });
    }
    // Fine settled grit, everywhere but sparse. [REF#DG-00941]
    for(let s4=0;s4<950;s4++){
        ctx.fillStyle=`rgba(162,159,152,${Math.random()*0.075})`;
        ctx.fillRect(Math.random()*sz,Math.random()*sz,1,1);
    }
    // The old per-tile border, off by default — it is what made this read as tiles (see the note [REF#DG-00942]
    // above). Restore: window._floorTileBevel = true.
    try { if (typeof window !== 'undefined' && window._floorTileBevel === true) {
        ctx.strokeStyle='rgba(0,0,0,0.85)'; ctx.lineWidth=4; ctx.strokeRect(2,2,sz-4,sz-4); } } catch(_){}

    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}

export function createShibaiWallTexture(){
    // ── THE PLAYHOUSE WALL (芝居小屋の羽目板) ───────────────────────────────────────────────────── [REF#DG-00943]
    //    Mark 2026-08-26, with a reference image: "its how the designs of the textures o walls and
    //    floors should look : do a 1:1 : study and falsify ... once you have proofed the colors and
    //    designs and theme." The reference is an abandoned Edo playhouse gone to the underworld.
    //
    //    WHAT THIS REPLACES AND WHY IT COULD NEVER HAVE WORKED. The wall wore a WASHI-PAPER ground
    //    (#e7e1d2, mean 207.4) with a shoji lattice, crushed by a grey tint (0x413f39 = 25%) and lit
    //    by a NEUTRAL emissive (0x1d1d1d). MEASURED in the real game before this landed: the wall
    //    face sampled #242626 / #1f1f21 / #262323 — R≈G≈B, DEAD NEUTRAL GREY. The arithmetic says it
    //    was unfixable by tinting: 231x65/255=58.9, 225x63/255=55.6, 210x57/255=46.9 leaves only 12
    //    points of red-blue, and the neutral emissive then adds +11.7 to ALL THREE channels equally,
    //    compressing the warm ratio 1.255 -> 1.203 before the room's blue-violet ambient
    //    (hemisphere 0x1a1040, ambient 0x110a1a — both push blue hardest) finishes the job. You
    //    cannot tint a near-white paper into aged timber; the ground colour has to BE the timber.
    //
    //    THE FOUR CUES, in order of how much they carry:
    //      1. WARM CHARCOAL GROUND — the reference field is #241c15-#33281e, red-dominant. Every
    //         colour below is derived from that field by ratio, so the wall cannot drift out of
    //         palette no matter which random branch runs.
    //      2. VERTICAL BOARDS, not panels — 羽目板 nailed upright. 8 across a 2 m pane = 250 mm
    //         boards. A lattice grid reads as a modern shoji screen; upright boards read as a
    //         theatre's back wall.
    //      3. RELIEF THAT IS VALUE, NEVER HUE — swirling clouds (雲) high, breaking waves (波) low,
    //         a 能面 mask between. Each is carved by an offset LIT lip and SHADOW lip at the same
    //         base colour, the way a chisel cut catches raking light. No coloured paint anywhere:
    //         in the reference the ONLY saturated note in the room is the oxblood curtain, and
    //         nothing on a wall may out-saturate it.
    //      4. ONE SHARED GRIME TONE (#15100c) at every edge and corner. This is the pass that makes
    //         wall, floor and props read as ONE room instead of three separate textures — and it is
    //         also what makes the tile seamless, because all four edges get crushed to the same
    //         dark, so the wrapping edges match.
    //
    //    ⚠ NO NORMAL MAP, DELIBERATELY. Relief is painted into the colour canvas. Adding a
    //      normalMap/aoMap slot changes the material's program defines -> a new r128 shader program
    //      -> exactly the program-creep that cost this project weeks (FPS.md 10.3, the 308 floor).
    //      Swapping the texture in the existing `map` slot is a uniform change: no recompile.
    //    ⚠ NO LIGHT IS ADDED. Brightness lives in the emissive/ambient the material already had
    //      (E15 law: r128 bakes light COUNTS into program keys).
    //    Old washi lattice back: window._dojoWashiWall = true (Engine9 ~:8343).
    const sz=512, c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');
    const R=(a,b)=>a+Math.random()*(b-a);
    // Draw fn across the 3x3 neighbourhood so an edge-crossing mark wraps instead of clipping. [REF#DG-00944]
    const wrap=(fn)=>{ for(const dx of [-sz,0,sz]) for(const dy of [-sz,0,sz]) fn(dx,dy); };

    // ── DRAINED FOR THE BURTON UNDERWORLD (Mark 2026-08-26: "no, the colors will be dark tim burton [REF#DG-00945]
    //    styled. everything needs a dark drab underworld theme.") ──────────────────────────────────
    //    THE DESIGN DID NOT CHANGE — boards, carving, rails, grime are all still the reference's.
    //    Only the COLOUR drained. First cut of this generator ran GR 0.78 / BR 0.585, which is
    //    saturation 26.3% at #241c15 — correct for a warm Edo playhouse and WRONG for Burton, whose
    //    underworld is drab: a dark SATURATED brown room is a barn at night, not a gothic one.
    //    Saturation is the number that separates the two, so it is the number that moved:
    //        S = (1 - BR) / (1 + BR)   →   BR 0.835 puts the field at ~9%, "drained wood" #2b2824.
    //    ⚠ A SLIGHT WARM BIAS IS KEPT ON PURPOSE (R > G > B, barely). Burton's grammar is COLD LIGHT
    //      ON DRAB SURFACES — the cold belongs in the ambient/hemi, not painted into the timber. Drain
    //      the wood past neutral into blue and it stops reading as wood at all, which is the mistake
    //      the washi wall made from the other direction.
    //    ⚠ AND THE VALUE CONTRAST IS PROTECTED. Burton is near-black shadow AND pale bone highlight
    //      with few mid-tones; draining everything into one dark band reads muddy, not gothic. So the
    //      carved lips, worn edges and dust below move to BONE (#9a968c, S 6.5%) rather than being
    //      dimmed — the pale end has to survive somewhere or the room loses its gothic read.
    //    NO GREEN, anywhere: green stays the lowest-lifted channel of the three. Same wound as the
    //    wall pass (register ~:2974, FPS.md §9). A sickly acid green is period-correct Burton and is
    //    NOT ours to introduce — it needs Mark's word.
    // ── OPTION C: THE WALL TAKES OVER THE WASHI'S TONAL JOB (Mark's ruling, 2026-08-26) ─────────
    //    MEASURED, and this is the whole reason these four numbers moved:
    //        08-12 wall albedo = washi #e7e1d2 x wallSide 0x989890  ->  (138,134,119)  r/b 1.16, PALE
    //        this wall, before  =            field x 0xffffff       ->  ( 35, 27, 20)  r/b 1.75, DARK
    //    The 08-12 amber rig was tuned against a PALE NEAR-NEUTRAL wall — the largest surface in
    //    every frame. Restoring those lamps onto a dark WARM wall measured BROWNER than the room
    //    Mark rejected (floor S 21.2% -> 25.2%). The theme and that wall are one system.
    //    So the wall keeps HIS design — boards, kumo/nami/mask relief, rails, grime, all of it — and
    //    takes back the washi's FUNCTION: a near-neutral albedo (S ~2.6%, from BR 0.95) lifted off
    //    the floor of the value range so it reflects instead of swallowing. Not the washi's texture,
    //    the washi's job.
    //    ⚠ STILL FAR DARKER THAN THE WASHI (mean ~50 vs ~134). This is a drab underworld, not a
    //      paper screen; the lift is enough to make the wall the frame's neutral, not enough to make
    //      it pale. NO GREEN: G stays between R and B, never the lifted channel.
    const LO=52, HI=70, GR=0.97, BR=0.95;
    const tone=(r,k)=>{ const kk=(k===undefined)?1:k;
        return `rgb(${Math.round(r*kk)},${Math.round(r*GR*kk)},${Math.round(r*BR*kk)})`; };

    ctx.fillStyle=tone((LO+HI)/2); ctx.fillRect(0,0,sz,sz);

    // ── BOARDS ─────────────────────────────────────────────────────────────────────────────────── [REF#DG-00946]
    const nB=8, bW=sz/nB;
    for(let i=0;i<nB;i++){
        const x=i*bW, r=R(LO,HI);
        // Per-board tone. A wall where every board matches reads as printed board, not as timber. [REF#DG-00947]
        ctx.fillStyle=tone(r); ctx.fillRect(x,0,bW,sz);
        // RAKING LIGHT across the board's width: the left arris catches, the right falls away. [REF#DG-00948]
        const lg=ctx.createLinearGradient(x,0,x+bW,0);
        lg.addColorStop(0,'rgba(120,116,109,'+R(0.10,0.19).toFixed(3)+')');   // #6b5844 worn edge [REF#DG-00949]
        lg.addColorStop(0.35,'rgba(0,0,0,0)');
        lg.addColorStop(1,'rgba(19,19,22,'+R(0.18,0.31).toFixed(3)+')');    // #15100c [REF#DG-00950]
        ctx.fillStyle=lg; ctx.fillRect(x,0,bW,sz);
        // MASAME — straight grain running WITH the board, i.e. VERTICALLY. Grain running the wrong [REF#DG-00951]
        // way across an upright board is the single fastest way to make timber read as wallpaper.
        for(let gI=0;gI<9;gI++){
            const gx=x+R(2,bW-2);
            ctx.strokeStyle='rgba('+Math.round(r*0.42)+','+Math.round(r*GR*0.42)+','+Math.round(r*BR*0.42)+','+R(0.10,0.28).toFixed(3)+')';
            ctx.lineWidth=R(0.5,1.3);
            ctx.beginPath(); ctx.moveTo(gx,0);
            for(let y=32;y<=sz;y+=32) ctx.lineTo(gx+R(-0.7,0.7),y);
            ctx.stroke();
        }
        // A split or shake, rare — a century-old board that is perfectly sound reads as new. [REF#DG-00952]
        if(Math.random()<0.30){
            const cx2=x+R(4,bW-4), y0=R(0,sz*0.7), h=R(50,150);
            ctx.strokeStyle='rgba(9,6,3,0.55)'; ctx.lineWidth=R(0.8,1.6);
            ctx.beginPath(); ctx.moveTo(cx2,y0);
            for(let y=y0;y<y0+h;y+=18) ctx.lineTo(cx2+R(-1.2,1.2),y);
            ctx.stroke();
        }
    }
    // BOARD SEAMS — drawn CENTRED on the boundary and wrapped in x, so the seam at x=0 also lands [REF#DG-00953]
    // on x=sz-1 and the two wrapping edge columns match instead of butting light board to light board.
    for(let i=0;i<=nB;i++){ const x=i*bW;
        for(const dx of [-sz,0,sz]){
            ctx.fillStyle='rgba(0,0,0,0.80)'; ctx.fillRect(x+dx-1.5,0,3,sz);
            ctx.fillStyle='rgba(154,150,140,0.10)'; ctx.fillRect(x+dx+1.5,0,1,sz);   // #8a7860 lit lip [REF#DG-00954]
        }
    }

    // ── CARVING ────────────────────────────────────────────────────────────────────────────────── [REF#DG-00955]
    // Relief = VALUE, never hue. A cut is a LIT lip offset one pixel up from a SHADOW lip; that
    // offset is the entire illusion, and it survives being lit by any colour of lantern because it
    // adds no colour of its own.
    const carve=(pathFn,lit,shade,w)=>{
        ctx.save(); ctx.translate(0,-1); ctx.strokeStyle='rgba(154,150,140,'+lit+')';
        ctx.lineWidth=w; ctx.beginPath(); pathFn(); ctx.stroke(); ctx.restore();
        ctx.save(); ctx.translate(0,1); ctx.strokeStyle='rgba(10,10,12,'+shade+')';
        ctx.lineWidth=w; ctx.beginPath(); pathFn(); ctx.stroke(); ctx.restore();
    };
    // 雲 KUMO — swirling cloud. The lobes alone read as a blob; the SPIRAL TAIL is what makes it [REF#DG-00956]
    // read as the Edo cloud motif.
    const kumo=(cx,cy,s)=>{
        carve(()=>{
            ctx.arc(cx,cy,s*0.50,Math.PI*0.90,Math.PI*2.10);
            ctx.arc(cx+s*0.62,cy+s*0.12,s*0.36,Math.PI*1.00,Math.PI*2.20);
            ctx.arc(cx-s*0.60,cy+s*0.10,s*0.32,Math.PI*0.80,Math.PI*2.00);
        },0.30,0.42,2.0);
        carve(()=>{
            for(let a=0;a<Math.PI*3.2;a+=0.12){
                const rr=s*0.10+a*s*0.055, px=cx+s*0.05+Math.cos(a)*rr, py=cy+s*0.34+Math.sin(a)*rr*0.62;
                if(a===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
            }
        },0.26,0.36,1.6);
    };
    // 波 NAMI — a breaking crest. The hook that curls back on itself is the motif; a plain sine [REF#DG-00957]
    // wave reads as decoration, not as water.
    const nami=(cx,cy,s)=>{
        carve(()=>{
            ctx.moveTo(cx-s,cy);
            ctx.bezierCurveTo(cx-s*0.50,cy-s*0.75, cx+s*0.20,cy-s*0.85, cx+s*0.55,cy-s*0.25);
            ctx.bezierCurveTo(cx+s*0.75,cy-s*0.02, cx+s*0.45,cy+s*0.16, cx+s*0.28,cy-s*0.05);
        },0.30,0.40,2.0);
        carve(()=>{ ctx.moveTo(cx-s*0.90,cy+s*0.22);
            ctx.quadraticCurveTo(cx-s*0.10,cy-s*0.18,cx+s*0.80,cy+s*0.26); },0.20,0.30,1.4);
    };
    // 能面 MEN — a mask carved into the field. One per tile at most: it is the accent, and a wall [REF#DG-00958]
    // of masks is a haunted house, not a playhouse.
    const men=(cx,cy,s)=>{
        carve(()=>{ ctx.ellipse(cx,cy,s*0.42,s*0.56,0,0,Math.PI*2); },0.26,0.40,2.0);
        carve(()=>{ ctx.ellipse(cx-s*0.16,cy-s*0.10,s*0.09,s*0.05,0,0,Math.PI*2);
                    ctx.ellipse(cx+s*0.16,cy-s*0.10,s*0.09,s*0.05,0,0,Math.PI*2); },0.22,0.46,1.4);
        carve(()=>{ ctx.moveTo(cx-s*0.14,cy+s*0.24);
                    ctx.quadraticCurveTo(cx,cy+s*0.32,cx+s*0.14,cy+s*0.24); },0.20,0.40,1.4);
    };
    const place=(fn,cx,cy,s)=>wrap((dx,dy)=>{ ctx.save(); ctx.translate(dx,dy); fn(cx,cy,s); ctx.restore(); });
    // Clouds ride HIGH, waves run LOW — the vertical order is the convention and reading it upside [REF#DG-00959]
    // down is the tell that nobody looked at the reference.
    for(let i=0;i<3;i++) place(kumo,R(0,sz),R(58,146),R(38,60));
    for(let i=0;i<4;i++) place(nami,R(0,sz),R(360,452),R(34,54));
    place(men,R(0,sz),R(232,292),R(46,64));

    // 長押 NAGESHI — the horizontal rails that frame a carved frieze, and what stops the boards [REF#DG-00960]
    // from reading as an endless fence. Full width, so they wrap in x for free.
    for(const ry of [186,330]){
        ctx.fillStyle='rgba(10,10,12,0.42)';       ctx.fillRect(0,ry,sz,10);
        ctx.fillStyle='rgba(120,116,109,0.16)';    ctx.fillRect(0,ry,sz,2);      // lit top arris [REF#DG-00961]
        ctx.fillStyle='rgba(0,0,0,0.55)';        ctx.fillRect(0,ry+10,sz,2.5); // shadow beneath [REF#DG-00962]
    }

    // ── GRIME ──────────────────────────────────────────────────────────────────────────────────── [REF#DG-00963]
    // ONE tone (#15100c) at every edge and corner, 20-35%. Two jobs at once: it unifies this wall
    // with the floor and props into a single room, and because all four edges get crushed to the
    // same dark it is what makes the tile seamless.
    const edge=(x0,y0,x1,y1)=>{ const g3=ctx.createLinearGradient(x0,y0,x1,y1);
        g3.addColorStop(0,'rgba(19,19,22,0.34)'); g3.addColorStop(1,'rgba(19,19,22,0)');
        ctx.fillStyle=g3; ctx.fillRect(0,0,sz,sz); };
    edge(0,0,0,sz*0.30); edge(0,sz,0,sz*0.70); edge(0,0,sz*0.22,0); edge(sz,0,sz*0.78,0);
    for(const cn of [[0,0],[sz,0],[0,sz],[sz,sz]]){
        const cg=ctx.createRadialGradient(cn[0],cn[1],0,cn[0],cn[1],sz*0.42);
        cg.addColorStop(0,'rgba(19,19,22,0.30)'); cg.addColorStop(1,'rgba(19,19,22,0)');
        ctx.fillStyle=cg; ctx.fillRect(0,0,sz,sz);
    }
    // SOOT BLOOMS — a century of lamp smoke, wrapped so none is cut off at an edge. [REF#DG-00964]
    for(let s2=0;s2<6;s2++){ const ax=R(0,sz), ay=R(0,sz), ar=R(40,96);
        wrap((dx,dy)=>{ const ag=ctx.createRadialGradient(ax+dx,ay+dy,0,ax+dx,ay+dy,ar);
            ag.addColorStop(0,'rgba(12,12,14,'+R(0.14,0.26).toFixed(3)+')'); ag.addColorStop(1,'rgba(0,0,0,0)');
            ctx.fillStyle=ag; ctx.fillRect(ax+dx-ar,ay+dy-ar,ar*2,ar*2); }); }
    // PALE WEAR — #8a7860, sparingly and only at shoulder height, where a body actually rubs. [REF#DG-00965]
    for(let s3=0;s3<5;s3++){ const ax=R(0,sz), ay=R(200,340), ar=R(20,52);
        wrap((dx,dy)=>{ const ag=ctx.createRadialGradient(ax+dx,ay+dy,0,ax+dx,ay+dy,ar);
            ag.addColorStop(0,'rgba(154,150,140,'+R(0.05,0.11).toFixed(3)+')'); ag.addColorStop(1,'rgba(154,150,140,0)');
            ctx.fillStyle=ag; ctx.fillRect(ax+dx-ar,ay+dy-ar,ar*2,ar*2); }); }
    // Fine settled grit — warm, never white; a cool speck reads as mould. [REF#DG-00966]
    for(let s4=0;s4<700;s4++){
        ctx.fillStyle='rgba('+Math.round(R(132,168))+','+Math.round(R(128,163))+','+Math.round(R(120,153))+','+(Math.random()*0.05).toFixed(3)+')';
        ctx.fillRect(Math.random()*sz,Math.random()*sz,1,1);
    }

    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping;
    // repeat(1,2) is INHERITED from the wall this replaces, deliberately: the pane UVs and the [REF#DG-00967]
    // seam-run builder were both authored against it, so changing it here would move geometry the
    // texture does not own. The frieze therefore reads twice up the wall, as stacked carved
    // registers — which is what a playhouse wall does anyway.
    t.repeat.set(1,2);
    return t;
}

export function createDarkWoodRafterTexture(){
    // ── HAND-HEWN DARK OAK RAFTERS — per-pixel, not canvas strokes (Mark 2026-08-05) ──────────── [REF#DG-00968]
    //    "create hyper photo realistic beautiful dark colored wood rafters, near charcoal dark brown"
    //
    //    WHY THIS IS A PIXEL LOOP AND NOT MORE ctx.stroke() CALLS. The previous version drew wood the
    //    way you'd draw a diagram of wood: gradient bands for beams, straight lines for grain, radial
    //    blobs for knots. Real timber does not look like that, and the giveaway is the KNOT — in real
    //    wood the grain FLOWS AROUND a knot, because the branch grew through the trunk and the annual
    //    rings had to bend past it. Stroked lines cannot do that; they run straight through and the eye
    //    reads "drawn". Rings are a distance FIELD, so the only honest way to bend them is to evaluate
    //    the field per pixel with the knots displacing it. That is what this does.
    //
    //    THE MODEL, in the order a real board acquires its look:
    //      1. GROWTH RINGS as an elliptical distance field around an off-board pith. Flat-sawn (plain-
    //         sawn) boards cut tangentially, which is why they show the nested-arch "cathedral" figure
    //         rather than straight stripes — the ellipse's squash is what produces it.
    //      2. KNOTS displace that field radially, so rings crowd and sweep around them.
    //      3. EARLYWOOD/LATEWOOD: each ring is dark-late/light-early, not a symmetric sine. Latewood is
    //         denser and darker, and the asymmetry is a large part of "reads as wood".
    //      4. RAY FLECK + PORES: the fine cross-grain shimmer and open-pore ticks of oak.
    //      5. AGE: soot settling on upper faces, hairline checks opening ALONG the grain, adze scallops
    //         from being shaped by hand, and worn/lit lower arrises.
    //      6. BAKED CONTACT SHADOW into the gap between beams — the ceiling is lit by one moving
    //         lantern, so a baked ambient-occlusion seam does far more for depth than any light could,
    //         and costs nothing.
    //
    //    ⚠ SEAMLESS BY CONSTRUCTION, WHICH IS NOT OPTIONAL HERE. ceilTex.repeat is 64×64 — this image
    //      is tiled sixty-four times across the map. Every noise lattice below is PERIODIC (indices
    //      wrap with %P), and beam bands are scaled to close exactly on the tile height, so no seam
    //      appears at the joins. For the same reason there are deliberately NO loud landmarks: one
    //      big bright knot would appear sixty-four times in a grid and instantly read as wallpaper.
    //      Knots are kept small, dark and sparse.
    //
    //    ⚠ NO LIGHTS, NO SECOND MAP. r128 bakes light counts into program keys, and this surface is a
    //      big share of screen in top-down, so it stays ONE albedo texture on the existing material —
    //      no bumpMap (an extra fetch + derivatives per fragment on a large surface), no emissive.
    //      All relief is painted in. The engine gives it trilinear mipmaps + anisotropy 8, without
    //      which none of this detail survives the 64× minification anyway.
    //
    //    Cost: one 1024² canvas, built ONCE at load behind the progress bar. ~4 MB + mips, at the
    //    mobile texture cap (the >1024 downscale patch leaves it alone).
    const sz = 1024;
    const c = document.createElement('canvas'); c.width = c.height = sz;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(sz, sz);
    const D = img.data;

    // Deterministic RNG (xorshift): the ceiling looks the same every boot, so a texture bug is [REF#DG-00969]
    // reproducible instead of "sometimes ugly". Math.random() here would make that impossible.
    let _s = 0x1a2b3c4d >>> 0;
    const rnd = () => { _s ^= _s << 13; _s >>>= 0; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; };

    // ── PERIODIC value noise. The %P wrap is what makes the tile seamless. ─────────────────────── [REF#DG-00970]
    const mkLat = (P) => { const a = new Float32Array(P * P); for (let i = 0; i < P * P; i++) a[i] = rnd(); return a; };
    const LATS = [{P:8},{P:16},{P:32},{P:64},{P:128}].map(o => ({ P:o.P, a: mkLat(o.P) }));
    const fade = t => t * t * (3 - 2 * t);
    const nz = (L, x, y) => {
        const P = L.P, a = L.a;
        const xi = Math.floor(x), yi = Math.floor(y);
        const u = fade(x - xi), v = fade(y - yi);
        const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P;
        const x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
        const n00 = a[y0 * P + x0], n10 = a[y0 * P + x1], n01 = a[y1 * P + x0], n11 = a[y1 * P + x1];
        return (n00 + (n10 - n00) * u) * (1 - v) + (n01 + (n11 - n01) * u) * v;
    };
    // fBm in UNIT space (0..1), so every octave wraps with the tile. [REF#DG-00971]
    const fbm = (x, y, oct, lac) => {
        let sum = 0, amp = 0.5, tot = 0, f = 1;
        for (let i = 0; i < oct; i++) {
            const L = LATS[Math.min(i, LATS.length - 1)];
            sum += amp * nz(L, x * L.P * f, y * L.P * f);
            tot += amp; amp *= 0.5; f *= (lac || 1);
        }
        return sum / tot;
    };

    // ── BEAM BANDS. Widths are randomised then normalised so they close exactly on sz — a band that [REF#DG-00972]
    //    ran off the edge would put a hard seam every 4 world units, 64 times over. ────────────────
    const bands = [];
    { let acc = 0;
      while (acc < sz) { const h = 96 + rnd() * 78, g = 15 + rnd() * 16; bands.push({ h, g }); acc += h + g; }
      const scale = sz / acc;
      let y = 0;
      for (const b of bands) { b.h *= scale; b.g *= scale; b.y0 = y; b.y1 = y + b.h; y = b.y1 + b.g; b.gy1 = y; }
    }
    // Per-beam character: its own pith (ring centre), ring pitch, hue and soot load. Timber in one [REF#DG-00973]
    // ceiling comes from different trees and is fitted every which way — uniform beams read as CG.
    for (const b of bands) {
        b.pithY  = b.y0 + (rnd() < 0.5 ? -1 : 1) * (0.75 + rnd() * 2.4) * b.h;   // pith sits OFF the board → flat-sawn arcs [REF#DG-00974]
        b.pithX  = rnd() * sz;
        b.ring   = 0.055 + rnd() * 0.05;      // ring pitch [REF#DG-00975]
        b.squash = 2.2 + rnd() * 3.6;         // ellipse squash → how open the cathedral arches are [REF#DG-00976]
        b.warm   = 0.82 + rnd() * 0.42;       // per-beam hue drift, brown ↔ grey-brown [REF#DG-00977]
        b.soot   = 0.35 + rnd() * 0.5;
        b.tilt   = (rnd() - 0.5) * 0.16;      // hand-fitted, not machine-square [REF#DG-00978]
        b.knots  = [];
        const kn = rnd() < 0.62 ? 1 + (rnd() < 0.3 ? 1 : 0) : 0;   // sparse — see the tiling note [REF#DG-00979]
        for (let k = 0; k < kn; k++)
            b.knots.push({ x: rnd() * sz, y: b.y0 + b.h * (0.22 + rnd() * 0.56), r: 7 + rnd() * 13, s: 0.6 + rnd() * 0.8 });
    }
    // Row → band lookup, so the per-pixel loop does no searching. [REF#DG-00980]
    const rowBand = new Int16Array(sz);
    for (let y = 0; y < sz; y++) {
        let bi = -1;
        for (let i = 0; i < bands.length; i++) { if (y >= bands[i].y0 && y < bands[i].gy1) { bi = i; break; } }
        rowBand[y] = bi < 0 ? 0 : bi;
    }

    const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

    for (let y = 0; y < sz; y++) {
        const b = bands[rowBand[y]];
        const inGap = y >= b.y1;
        const v = y / sz;
        for (let x = 0; x < sz; x++) {
            const u = x / sz;
            const o = (y * sz + x) * 4;

            if (inGap) {
                // ── THE VOID BETWEEN BEAMS. Not flat black: a hair of bounce at the very top so the [REF#DG-00981]
                //    gap reads as depth rather than a hole punched in the image.
                const t = (y - b.y1) / Math.max(1e-3, b.gy1 - b.y1);
                const bounce = (1 - t) * 0.055 + fbm(u * 2, v * 2, 3, 2) * 0.03;
                const g = 6 + bounce * 42;
                D[o] = g * 1.10; D[o+1] = g * 0.96; D[o+2] = g * 0.84; D[o+3] = 255;
                continue;
            }

            const py = (y - b.y0) / b.h;          // 0..1 across the beam face [REF#DG-00982]

            // ── 1+2. RING FIELD, with knots bending it ────────────────────────────────────────── [REF#DG-00983]
            let gx = x + (py - 0.5) * b.h * b.tilt;
            let gy = y;
            // Domain warp: real grain wanders. Two scales — a slow wander and a fine tremor. [REF#DG-00984]
            gx += (fbm(u * 1.3, v * 3.1, 4, 2) - 0.5) * 46;
            gy += (fbm(u * 2.6, v * 1.7, 3, 2) - 0.5) * 7;
            let knotDark = 0, knotLift = 0;
            for (const k of b.knots) {
                let dx = gx - k.x; const dy = gy - k.y;
                // wrap dx across the tile so a knot near the edge still bends grain on the far side [REF#DG-00985]
                if (dx >  sz * 0.5) dx -= sz; if (dx < -sz * 0.5) dx += sz;
                const d = Math.hypot(dx, dy * 1.35);
                if (d < k.r * 9) {
                    // Radial displacement: rings crowd toward the knot and sweep around it. [REF#DG-00986]
                    const push = (k.r * 3.1) / (d + k.r * 0.55) * k.s;
                    const inv = 1 / (d + 1e-3);
                    gx += dx * inv * push * 5.2;
                    gy += dy * inv * push * 5.2;
                    if (d < k.r) {                                  // the knot face itself [REF#DG-00987]
                        const kt = d / k.r;
                        knotDark = Math.max(knotDark, (1 - kt) * 0.86);
                        knotLift = Math.max(knotLift, Math.sin(kt * 22 + k.x) * 0.05 * (1 - kt));  // its own tight rings [REF#DG-00988]
                    }
                }
            }
            const ex = (gx - b.pithX) / b.squash, ey = (gy - b.pithY);
            const rd = Math.sqrt(ex * ex + ey * ey);

            // ── 3. EARLYWOOD / LATEWOOD. Asymmetric: a narrow dense dark band, a wide pale one. ── [REF#DG-00989]
            const ph = rd * b.ring + fbm(u * 5, v * 5, 3, 2) * 0.55;
            const saw = ph - Math.floor(ph);                       // 0..1 through one ring [REF#DG-00990]
            const late = Math.pow(clamp01(1 - Math.abs(saw - 0.82) / 0.20), 1.7);   // dense latewood [REF#DG-00991]
            const early = Math.pow(clamp01(1 - Math.abs(saw - 0.35) / 0.42), 1.2);  // soft earlywood [REF#DG-00992]
            let tone = 0.36 + early * 0.30 - late * 0.40;

            // ── 4. RAY FLECK + OPEN PORES ─────────────────────────────────────────────────────── [REF#DG-00993]
            const ray = fbm(u * 26, v * 3.5, 3, 2);                 // stretched along the grain [REF#DG-00994]
            tone += (ray - 0.5) * 0.13;
            const pore = fbm(u * 70, v * 12, 2, 2);
            tone -= Math.pow(clamp01(pore - 0.62) / 0.38, 1.5) * 0.20;

            // ── 5. AGE: soot, checks, adze scallops ───────────────────────────────────────────── [REF#DG-00995]
            const soot = fbm(u * 3.2, v * 4.6, 4, 2);
            tone -= soot * 0.17 * b.soot * (0.45 + 0.55 * (1 - py));   // settles heavier up the face [REF#DG-00996]
            // hairline checks — thin, dark, and running ALONG the grain (they follow the ring field) [REF#DG-00997]
            const chk = Math.abs(saw - 0.82);
            const chkNoise = fbm(u * 9, v * 2.2, 3, 2);
            if (chk < 0.012 && chkNoise > 0.63) tone -= (1 - chk / 0.012) * 0.34;
            // adze scallops — shallow tool facets across the face, the mark of being shaped by hand [REF#DG-00998]
            const scal = Math.sin(u * Math.PI * 2 * 34 + fbm(u * 4, v * 4, 2, 2) * 5.5);
            tone += scal * 0.022 * (0.4 + 0.6 * b.warm);

            // ── 6. BAKED RELIEF: contact shadow at the top arris, wear/light at the bottom ─────── [REF#DG-00999]
            tone -= Math.pow(clamp01(1 - py / 0.16), 2.0) * 0.42;    // deep shade where beam meets ceiling [REF#DG-01000]
            tone -= Math.pow(clamp01((py - 0.90) / 0.10), 2.2) * 0.30; // its own underside shadow line [REF#DG-01001]
            tone += Math.pow(clamp01((py - 0.68) / 0.22), 2.0) * 0.10 * (1 - soot * 0.5);  // worn, lit lower arris [REF#DG-01002]

            // knot face last so nothing washes it out [REF#DG-01003]
            tone -= knotDark * 0.30; tone += knotLift;

            // ── TONE → NEAR-CHARCOAL DARK BROWN ───────────────────────────────────────────────── [REF#DG-01004]
            //    Mark: "near charcoal dark brown". Mapped into a deliberately NARROW dark band —
            //    roughly #14100c..#3a2e22. The ceiling is read in lantern light, so contrast here is
            //    carried by the baked shading above, not by making the wood lighter.
            //    TUNED AGAINST A RENDER, NOT GUESSED. The first pass came out chocolate — a saturated
            //    mid-brown — because the channel spread was too wide (R 1.22 / B 0.70 of luminance).
            //    Charcoal wood is mostly GREY with a brown lean, so the spread is narrow and the whole
            //    range sits lower. Roughly #16120f (shadow) .. #3a332b (lit latewood face).
            const t2 = clamp01(tone);
            const lum = 16 + t2 * 36;                     // 16..52 [REF#DG-01005]
            const warm = b.warm;
            // ── DRAINED FOR THE BURTON UNDERWORLD (Mark 2026-08-26) ────────────────────────── [REF#DG-01006]
            //    Was (1.02+0.10w) / (0.92+0.05w) / (0.80+0.02w) = saturation ~15.5% at warm 1.0.
            //    MEASURED: the ceiling plane rendered S 19.8% in FPV — the most saturated surface in
            //    a room Mark had just ordered DRAB. Two attempts to fix that from the MATERIAL side
            //    (a cool tint, then an emissive) each moved it by ~0.3 points, because a material
            //    colour can only SCALE a ratio the texture has already baked in. Drain it here, at
            //    the source, exactly as the wall and floor were drained, and the material can go
            //    back to a near-neutral lift whose only job is legibility.
            //    Keeps R > G > B so timber still reads as timber; drops S to ~3.5%.
            let R = lum * (1.02 + 0.10 * warm);   // 08-12 EXACTLY (copy :313-315) [REF#DG-01007]
            let G = lum * (0.92 + 0.05 * warm);
            let B = lum * (0.80 + 0.02 * warm);
            // a whisper of cool in the shadows keeps it charcoal rather than muddy-brown [REF#DG-01008]
            const shade = 1 - t2;
            R -= shade * 2.2; G -= shade * 0.9; B += shade * 2.2;

            D[o]   = R < 0 ? 0 : R > 255 ? 255 : R;
            D[o+1] = G < 0 ? 0 : G > 255 ? 255 : G;
            D[o+2] = B < 0 ? 0 : B > 255 ? 255 : B;
            D[o+3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);

    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // Mipmaps/anisotropy are set by the consumer (Engine9 ~6263) because only it knows the repeat. [REF#DG-01009]
    return t;
}

// ── 3 precompiled spider web variants for top-corner placement ──────────────── [REF#DG-01010]
export function createSpiderwebVariantA(){
    // Classic radial corner web (full 90° arc) [REF#DG-01011]
    const sz=512,c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');
    ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1.5;
    for(let i=0;i<=90;i+=10){
        const r=i*Math.PI/180; ctx.beginPath();
        ctx.moveTo(0,0); ctx.lineTo(Math.cos(r)*sz,Math.sin(r)*sz); ctx.stroke();
    }
    ctx.strokeStyle='rgba(220,220,225,0.45)'; ctx.lineWidth=1.2;
    for(let r=40;r<=sz-30;r+=32){
        ctx.beginPath();
        for(let i=0;i<=90;i+=10){
            const rad=i*Math.PI/180, sr=r+(Math.random()*8-4);
            const px=Math.cos(rad)*sr, py=Math.sin(rad)*sr;
            if(i===0) ctx.moveTo(px,py);
            else{
                const mr=((i-5)*Math.PI/180), mid=r-12;
                ctx.quadraticCurveTo(Math.cos(mr)*mid,Math.sin(mr)*mid,px,py);
            }
        }
        ctx.stroke();
    }
    return new THREE.CanvasTexture(c);
}
export function createSpiderwebVariantB(){
    // Tattered / broken web — half torn away, fewer rings [REF#DG-01012]
    const sz=512,c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');
    ctx.strokeStyle='rgba(220,220,210,0.45)'; ctx.lineWidth=1.5;
    // Only some radials, rest broken short [REF#DG-01013]
    for(let i=0;i<=90;i+=12){
        const r=i*Math.PI/180; ctx.beginPath();
        ctx.moveTo(0,0);
        const len = Math.random()<0.4 ? sz*0.4 : sz; // broken short ones [REF#DG-01014]
        ctx.lineTo(Math.cos(r)*len,Math.sin(r)*len); ctx.stroke();
    }
    // Sagging strands instead of clean rings [REF#DG-01015]
    ctx.strokeStyle='rgba(200,200,200,0.30)'; ctx.lineWidth=0.9;
    for(let r=70;r<=sz-30;r+=55){
        ctx.beginPath();
        let started=false;
        for(let i=0;i<=90;i+=10){
            if(Math.random()<0.25){ started=false; continue; } // gap [REF#DG-01016]
            const rad=i*Math.PI/180, sr=r+Math.random()*20-10;
            const px=Math.cos(rad)*sr, py=Math.sin(rad)*sr+r*0.15; // sag [REF#DG-01017]
            if(!started){ ctx.moveTo(px,py); started=true; }
            else ctx.lineTo(px,py);
        }
        ctx.stroke();
    }
    // Dangling silk strand [REF#DG-01018]
    ctx.strokeStyle='rgba(200,200,200,0.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(sz*0.3,sz*0.3); ctx.lineTo(sz*0.32,sz*0.85); ctx.stroke();
    return new THREE.CanvasTexture(c);
}
export function createSpiderwebVariantC(){
    // Dense corner cluster — heavy with dust [REF#DG-01019]
    const sz=512,c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');
    // Background haze [REF#DG-01020]
    const grad=ctx.createRadialGradient(0,0,0,0,0,sz*0.7);
    grad.addColorStop(0,'rgba(230,230,225,0.22)'); grad.addColorStop(1,'rgba(230,230,225,0)');
    ctx.fillStyle=grad; ctx.fillRect(0,0,sz,sz);
    // Many radials, denser [REF#DG-01021]
    ctx.strokeStyle='rgba(245,245,240,0.6)'; ctx.lineWidth=1.4;
    for(let i=0;i<=90;i+=6){
        const r=i*Math.PI/180; ctx.beginPath();
        ctx.moveTo(0,0); ctx.lineTo(Math.cos(r)*sz,Math.sin(r)*sz); ctx.stroke();
    }
    // Dense spiral rings [REF#DG-01022]
    ctx.strokeStyle='rgba(240,240,235,0.42)'; ctx.lineWidth=1.0;
    for(let r=25;r<=sz-20;r+=20){
        ctx.beginPath();
        for(let i=0;i<=90;i+=6){
            const rad=i*Math.PI/180, sr=r+(Math.random()*6-3);
            const px=Math.cos(rad)*sr, py=Math.sin(rad)*sr;
            if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.stroke();
    }
    // Dust specks [REF#DG-01023]
    for(let i=0;i<60;i++){
        ctx.fillStyle=`rgba(180,170,150,${0.2+Math.random()*0.3})`;
        const a=Math.random()*Math.PI/2, rr=20+Math.random()*(sz-40);
        ctx.fillRect(Math.cos(a)*rr,Math.sin(a)*rr,1.5,1.5);
    }
    return new THREE.CanvasTexture(c);
}

// ---- 3 FRACTAL web variants (recursive geometry, no two ever look alike) ---- [REF#DG-01024]
export function createSpiderwebVariantD(){
    // Recursive branching tree-web (L-system style) [REF#DG-01025]
    const sz=512,c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');
    ctx.translate(0,0);
    // Recursive branch grown from corner outward [REF#DG-01026]
    function branch(x, y, ang, len, depth, alpha){
        if(depth<=0 || len<3) return;
        const x2 = x + Math.cos(ang)*len, y2 = y + Math.sin(ang)*len;
        ctx.strokeStyle = `rgba(230,230,225,${alpha})`;
        ctx.lineWidth = Math.max(0.5, depth*0.35);
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.stroke();
        // Two child branches with golden-ratio-ish split + jitter [REF#DG-01027]
        const split = 0.42 + Math.random()*0.28;
        const jitter = (Math.random()-0.5)*0.35;
        branch(x2, y2, ang - split + jitter, len*(0.62+Math.random()*0.12), depth-1, alpha*0.92);
        branch(x2, y2, ang + split + jitter, len*(0.58+Math.random()*0.14), depth-1, alpha*0.88);
        // Occasional third sub-strand [REF#DG-01028]
        if(Math.random()<0.35){
            branch(x2, y2, ang + (Math.random()-0.5)*0.8, len*0.45, depth-2, alpha*0.7);
        }
    }
    // Several primary branches sweeping the corner quadrant [REF#DG-01029]
    for(let i=0;i<7;i++){
        const ang = (Math.PI/2) * (i/6) + (Math.random()-0.5)*0.06;
        branch(0, 0, ang, sz*0.95, 7, 0.65);
    }
    // Faint connective spiral (ties the fractal together) [REF#DG-01030]
    ctx.strokeStyle='rgba(220,220,215,0.22)'; ctx.lineWidth=0.6;
    for(let r=40;r<sz-30;r+=22+Math.random()*10){
        ctx.beginPath();
        for(let i=0;i<=90;i+=12){
            const rad=i*Math.PI/180, sr=r+(Math.random()*14-7);
            const px=Math.cos(rad)*sr, py=Math.sin(rad)*sr;
            if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.stroke();
    }
    return new THREE.CanvasTexture(c);
}
export function createSpiderwebVariantE(){
    // Sierpinski-style splintered shard web — jagged, alien geometry [REF#DG-01031]
    const sz=512,c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');
    function splinter(p1, p2, p3, depth){
        if(depth<=0){
            ctx.strokeStyle = `rgba(240,240,232,${0.18 + depth*0.06})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]);
            ctx.lineTo(p3[0],p3[1]); ctx.closePath(); ctx.stroke();
            return;
        }
        const m12 = [(p1[0]+p2[0])/2 + (Math.random()-0.5)*8, (p1[1]+p2[1])/2 + (Math.random()-0.5)*8];
        const m23 = [(p2[0]+p3[0])/2 + (Math.random()-0.5)*8, (p2[1]+p3[1])/2 + (Math.random()-0.5)*8];
        const m31 = [(p3[0]+p1[0])/2 + (Math.random()-0.5)*8, (p3[1]+p1[1])/2 + (Math.random()-0.5)*8];
        // Outer shard [REF#DG-01032]
        ctx.strokeStyle = `rgba(245,245,240,${0.42 - depth*0.05})`;
        ctx.lineWidth = Math.max(0.6, depth*0.5);
        ctx.beginPath();
        ctx.moveTo(p1[0],p1[1]); ctx.lineTo(m12[0],m12[1]);
        ctx.lineTo(m31[0],m31[1]); ctx.closePath(); ctx.stroke();
        // Recurse into 3 corner shards (skip central inverted triangle for fractal hole) [REF#DG-01033]
        splinter(p1, m12, m31, depth-1);
        splinter(m12, p2, m23, depth-1);
        splinter(m31, m23, p3, depth-1);
    }
    splinter([0,0], [sz, 4], [4, sz], 5);
    // Faint anchoring strands from corner [REF#DG-01034]
    ctx.strokeStyle='rgba(230,230,225,0.45)'; ctx.lineWidth=0.9;
    for(let i=0;i<5;i++){
        const ang = (Math.PI/2)*(i/4) + (Math.random()-0.5)*0.08;
        ctx.beginPath(); ctx.moveTo(0,0);
        // Jaggy zigzag anchor [REF#DG-01035]
        let x=0,y=0;
        for(let s=0; s<8; s++){
            const seg = sz*0.12;
            x += Math.cos(ang)*seg + (Math.random()-0.5)*8;
            y += Math.sin(ang)*seg + (Math.random()-0.5)*8;
            ctx.lineTo(x,y);
        }
        ctx.stroke();
    }
    return new THREE.CanvasTexture(c);
}
export function createSpiderwebVariantF(){
    // Recursive sagging filament — long catenary chains that branch [REF#DG-01036]
    const sz=512,c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');
    function sag(x1,y1, x2,y2, depth, alpha){
        if(depth<=0) return;
        // Catenary midpoint pulled downward [REF#DG-01037]
        const mx = (x1+x2)/2 + (Math.random()-0.5)*6;
        const my = (y1+y2)/2 + 8 + Math.random()*14;
        ctx.strokeStyle = `rgba(225,225,220,${alpha})`;
        ctx.lineWidth = Math.max(0.5, depth*0.32);
        ctx.beginPath();
        ctx.moveTo(x1,y1);
        ctx.quadraticCurveTo(mx,my, x2,y2);
        ctx.stroke();
        // Recurse — children branch off mid-strand [REF#DG-01038]
        if(Math.random()<0.7) sag(x1,y1, mx,my, depth-1, alpha*0.8);
        if(Math.random()<0.7) sag(mx,my, x2,y2, depth-1, alpha*0.8);
        // Occasional droplet/anchor strand hanging from midpoint [REF#DG-01039]
        if(depth>1 && Math.random()<0.4){
            const dx = mx + (Math.random()-0.5)*40;
            const dy = my + 30 + Math.random()*60;
            sag(mx,my, dx,dy, depth-2, alpha*0.7);
        }
    }
    // Several anchor points along corner edges [REF#DG-01040]
    const anchors = [];
    for(let i=0;i<6;i++){
        anchors.push([0, 30 + i*(sz/6) + Math.random()*20]);
        anchors.push([30 + i*(sz/6) + Math.random()*20, 0]);
    }
    // Connect random pairs with sagging filaments [REF#DG-01041]
    for(let i=0;i<14;i++){
        const a = anchors[Math.floor(Math.random()*anchors.length)];
        const b = anchors[Math.floor(Math.random()*anchors.length)];
        if(a===b) continue;
        sag(a[0],a[1], b[0],b[1], 4, 0.5);
    }
    // Sparse radials from origin for cohesion [REF#DG-01042]
    ctx.strokeStyle='rgba(220,220,215,0.32)'; ctx.lineWidth=0.7;
    for(let i=0;i<=4;i++){
        const r = (Math.PI/2)*(i/4);
        ctx.beginPath(); ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(r)*sz*0.95, Math.sin(r)*sz*0.95);
        ctx.stroke();
    }
    return new THREE.CanvasTexture(c);
}

// ── Wall TOPS (the face you look down on in the top-down / drag cam) ───────── [REF#DG-01043]
// Mark 2026-08-04: "notice the top walls being ugly gray?" The old version was a flat #1e1e1e fill plus
// 500 random 2px specks at ≤15% alpha — which AVERAGES TO A CONSTANT over a tile. Combined with the
// light-independent emissive floor on mats.wallTop (Engine9 ~6062), every wall-top face rendered at the
// same value, so a run of wall tiles fused into ONE seamless gray slab with no seams and no shading.
//
// Now: a real running-bond stone course — 2×2 blocks per GRID tile, dark mortar joints, per-block tonal
// variation, a chiselled bevel, grit and damp/moss patches. Each tile reads as discrete blocks and a
// wall run reads as masonry instead of a plateau.
//
// SEAMLESS BY CONSTRUCTION: the wall BoxGeometry's top face gets clean 0..1 UVs per tile and the texture
// is RepeatWrapping, so the canvas must tile with itself. Blocks are drawn with wrap-around passes
// (k = -1..2) and row 1 is offset by exactly half a block, so every joint meets its neighbour's.
//
// DELIBERATELY LOW-FREQUENCY: Engine9 disables mipmaps on all canvas textures (generateMipmaps=false +
// LinearFilter, ~6032) to dodge WebGL lazy-init stalls. Fine detail would therefore SHIMMER at distance.
// Big blocks, wide soft mortar, few large specks — never 1px noise. Keep it that way.
//
// NOTE: no tile-border vignette on purpose. A vignette would re-draw the GRID and put the slab-of-tiles
// look right back; the running-bond joints already break up the surface.
export function createDungeonTopTexture(){
    const sz=256, c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');

    // Base = the MORTAR. Blocks get drawn on top, inset — so joints need no separate pass. [REF#DG-01044]
    ctx.fillStyle='#131210'; ctx.fillRect(0,0,sz,sz);

    // Cool gritty noise wash over the mortar [REF#DG-01045]
    const id=ctx.getImageData(0,0,sz,sz), d=id.data;
    for(let i=0;i<d.length;i+=4){
        const n=(Math.random()-0.5)*9;
        d[i]  =Math.max(0,Math.min(255,d[i]  +n));
        d[i+1]=Math.max(0,Math.min(255,d[i+1]+n));
        d[i+2]=Math.max(0,Math.min(255,d[i+2]+n-1));
    }
    ctx.putImageData(id,0,0);

    // Running-bond course: 2 rows × 2 blocks, row 1 offset half a block. k=-1..2 covers the wrap. [REF#DG-01046]
    const BW=sz/2, BH=sz/2, M=9;          // block size + mortar joint width [REF#DG-01047]
    for(let row=0; row<2; row++){
        const oy  = row*BH;
        const off = (row===1) ? BW/2 : 0;
        for(let k=-1; k<=2; k++){
            const bx = off + k*BW;
            const x0 = bx+M/2, y0 = oy+M/2, w = BW-M, h = BH-M;
            // Per-block tone — this is what stops the slab from being one value [REF#DG-01048]
            const tone = 38 + Math.floor(Math.random()*16);
            ctx.fillStyle = `rgb(${tone},${tone-1},${tone-4})`;   // faintly cool slate
            ctx.fillRect(x0, y0, w, h);
            // Chiselled bevel: lit top/left lip, shadowed bottom/right lip [REF#DG-01049]
            ctx.fillStyle='rgba(255,250,235,0.055)';
            ctx.fillRect(x0, y0, w, 2); ctx.fillRect(x0, y0, 2, h);
            ctx.fillStyle='rgba(0,0,0,0.40)';
            ctx.fillRect(x0, y0+h-3, w, 3); ctx.fillRect(x0+w-3, y0, 3, h);
            // Weathering: a few soft dark bruises per block (inset so they never cross a tile edge) [REF#DG-01050]
            for(let s=0;s<3;s++){
                const ax=x0+8+Math.random()*(w-16), ay=y0+8+Math.random()*(h-16), r=10+Math.random()*16;
                const g=ctx.createRadialGradient(ax,ay,0,ax,ay,r);
                g.addColorStop(0,'rgba(0,0,0,0.30)'); g.addColorStop(1,'rgba(0,0,0,0)');
                ctx.fillStyle=g; ctx.fillRect(ax-r,ay-r,r*2,r*2);
            }
        }
    }

    // Damp / moss creeping out of the joints — cold green-gray, kept well inside the canvas [REF#DG-01051]
    for(let i=0;i<7;i++){
        const ax=24+Math.random()*(sz-48), ay=24+Math.random()*(sz-48), r=12+Math.random()*20;
        const g=ctx.createRadialGradient(ax,ay,0,ax,ay,r);
        g.addColorStop(0,'rgba(58,72,52,0.24)'); g.addColorStop(1,'rgba(58,72,52,0)');
        ctx.fillStyle=g; ctx.fillRect(ax-r,ay-r,r*2,r*2);
    }

    // Coarse grit — few and LARGE (3-4px). Fine specks would shimmer with mipmaps off. [REF#DG-01052]
    for(let i=0;i<90;i++){
        const v=Math.random()<0.5 ? `rgba(0,0,0,${0.10+Math.random()*0.22})`
                                  : `rgba(200,198,188,${0.05+Math.random()*0.07})`;
        ctx.fillStyle=v;
        ctx.fillRect(Math.random()*sz, Math.random()*sz, 3+Math.random()*1.5, 3+Math.random()*1.5);
    }

    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}

// ── Shoji Panel Texture (warm rice paper + dark wooden lattice frame) ───────── [REF#DG-01053]
export function createShojiTexture(){
    const sz=512, c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d');
    // Warm cream rice-paper base [REF#DG-01054]
    const grad=ctx.createLinearGradient(0,0,0,sz);
    grad.addColorStop(0,'#f8eccd'); grad.addColorStop(0.5,'#e8d5a8'); grad.addColorStop(1,'#d4bf85');
    ctx.fillStyle=grad; ctx.fillRect(0,0,sz,sz);
    // Paper fiber noise [REF#DG-01055 → see REF#DG-00920]
    for(let i=0;i<1200;i++){
        ctx.fillStyle=`rgba(120,80,40,${Math.random()*0.07})`;
        ctx.fillRect(Math.random()*sz,Math.random()*sz,1+Math.random()*2,1);
    }
    // Subtle horizontal fiber streaks [REF#DG-01056]
    ctx.strokeStyle='rgba(140,100,60,0.10)'; ctx.lineWidth=0.6;
    for(let i=0;i<40;i++){
        const y=Math.random()*sz; ctx.beginPath();
        ctx.moveTo(0,y); ctx.lineTo(sz,y+Math.random()*4-2); ctx.stroke();
    }
    // Dark wooden lattice (kumiko grid) — the iconic shoji look [REF#DG-01057]
    const woodMat = ctx.createLinearGradient(0,0,8,0);
    woodMat.addColorStop(0,'#1a0e05'); woodMat.addColorStop(0.5,'#2a1a0d'); woodMat.addColorStop(1,'#1a0e05');
    ctx.fillStyle=woodMat;
    // Outer wooden frame [REF#DG-01058]
    ctx.fillRect(0,0,sz,14); ctx.fillRect(0,sz-14,sz,14);
    ctx.fillRect(0,0,14,sz); ctx.fillRect(sz-14,0,14,sz);
    // Vertical kumiko bars (6 evenly spaced) [REF#DG-01059]
    for(let i=1;i<=5;i++){
        const x = (sz/6)*i - 3;
        ctx.fillStyle='#1f1208'; ctx.fillRect(x,14,6,sz-28);
    }
    // Horizontal kumiko bars (4 evenly spaced) [REF#DG-01060]
    for(let i=1;i<=4;i++){
        const y = (sz/5)*i - 3;
        ctx.fillStyle='#1f1208'; ctx.fillRect(14,y,sz-28,6);
    }
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; return t;
}

// createShojiDoorTexture() REMOVED 2026-08-25 (Mark: "remove all doors from game") — it drew the [REF#DG-01061]
// two-panel sliding-door paper, and nothing hangs a door any more.

export function makePaperTexture(baseColor){
    const c=document.createElement('canvas'); c.width=c.height=256;
    const ctx=c.getContext('2d');
    ctx.fillStyle=baseColor; ctx.fillRect(0,0,256,256);
    for(let i=0;i<400;i++){const x=Math.random()*256,y=Math.random()*256,w=Math.random()*24+6,a=Math.random()*0.05+0.02;ctx.fillStyle=`rgba(0,0,0,${a})`;ctx.fillRect(x,y,w,1);}
    ctx.strokeStyle='rgba(255,255,255,0.05)'; ctx.lineWidth=1;
    for(let x=0;x<256;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,256);ctx.stroke();}
    for(let y=0;y<256;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();}
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(8,8); return t;
}
