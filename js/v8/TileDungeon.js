// ══ TILE DUNGEON — a random dungeon assembled from the TileRooms GLB set ══════════════════════════ [REF#GP-02370]
// Mark 2026-10-16: "I want to test out if we can craft a random dungeon using these ... pay attention
// to the tile.corner - you have to arrange them so they connect" · "lets make sure we can have them
// random but fit, lets see the map" · "use tile.hallways and longhallway to connect them. just shrink
// them as needed" · "have a new button called TEST TILES - that will build a dungeon with these tiles".
//
// ⚠ THE GLBs CARRY NO CONNECTION METADATA. They are Tripo exports (tripo_part_*/Mesh_17) with one
//   material and no named sockets, so nothing in the file says which pane is a doorway. The edge table
//   below was MEASURED 2026-10-16 off the vertex data, not read from the asset and not guessed from the
//   filename: for each edge, the outer 14% band was sampled and the span binned 18 ways, counting only
//   vertices above 35% of tile height. A solid wall covers every bin; a doorway leaves a gap. The method
//   validated on tile.room.1-wall, which returned exactly one wall, as its name claims.
//   Re-measure with scripts/ if a tile is re-exported — DO NOT hand-edit the table from a filename.
//
// ⚠ THE FILENAMES DO NOT DESCRIBE THE GEOMETRY, so this module keys off measured shape, never the name:
//     · tile.2-corner.glb  ≡  tile.corner.2.glb   (21,323 verts each, identical bounds) — DUPLICATES
//     · tile.2-corners.glb ≡  tile.corner.4.glb   ( 6,012 verts each, identical bounds) — DUPLICATES
//   "corner.4" is NOT a four-way piece; it is the same single L-turn as "2-corners". Seven files are
//   four distinct tiles. Only one of the four (room.1-wall) has a name that matches what it is.
//
// Edge order is N,E,S,W = -Z,+X,+Z,-X. 'W' = wall, 'O' = doorway. Rotation k turns the tile k×90° CW.
// knowledge/design/ has no doc for this yet — it gets one the day this ships (R-000 §7).
(function (root) {
  'use strict';
  var DIR = 'assets/models/rooms/TileRooms/';
  // MEASURED 2026-10-16 — see the header. `space` tiles are destinations, `hall` tiles are corridors. [REF#GP-02371]
  var TILES = {
    'corner':      { file: 'tile.2-corners.glb',   edges: 'WWOO', kind: 'space' },  // L turn: opens -X and +Z [REF#GP-02372]
    'room':        { file: 'tile.room.1-wall.glb', edges: 'WOOO', kind: 'space' },  // T: one wall (-Z), three ways out [REF#GP-02373]
    'longhallway': { file: 'tile.longhallway.glb', edges: 'WOWO', kind: 'hall'  },  // I: straight through on X [REF#GP-02374]
    'hallways2':   { file: 'tile.hallways.2.glb',  edges: 'WOWO', kind: 'hall'  },  // I: two parallel lanes, straight through on X [REF#GP-02375]
    'void':        { file: null,                   edges: 'WWWW', kind: 'rock'  }   // solid rock — no model, fills the gaps [REF#GP-02376]
  };
  function rot(e, k) { return k ? e.slice(-k) + e.slice(0, -k) : e; }
  function protos() {
    var out = [];
    for (var name in TILES) {
      var t = TILES[name], seen = {};
      for (var k = 0; k < 4; k++) {
        var r = rot(t.edges, k);
        if (seen[r]) continue;                 // a straight piece has 2 distinct rotations, not 4 [REF#GP-02377]
        seen[r] = 1;
        out.push({ name: name, rot: k, edges: r, kind: t.kind });
      }
    }
    return out;
  }
  // ── THE SOLVER ──────────────────────────────────────────────────────────────────────────────────── [REF#GP-02378]
  // Backtracking over the grid in reading order. Two rules decide every placement:
  //   1. FIT — a shared edge must agree: doorway meets doorway, wall meets wall. Otherwise you get a
  //      corridor opening into the back of a wall, which is what "you have to arrange them so they
  //      connect" rules out.
  //   2. HALLWAYS CONNECT (Mark 2026-10-16) — two `space` tiles may never open directly into each other.
  //      Every room-to-room link runs through a corridor.
  //   The border is forced to wall so the dungeon cannot leak off the map.
  // ⚠ VOID IS LOAD-BEARING, NOT DECORATION. MEASURED 2026-10-16: with every cell required to hold a real
  //   tile, rule 2 has NO SOLUTION on a 7×5 grid — the constraints over-determine it. Solid rock is what
  //   gives the solver somewhere to fail into. It is tried LAST so it never floods a map it could fill.
  function solve(W, H, rnd) {
    rnd = rnd || Math.random;
    var P = protos();
    var real = P.filter(function (p) { return p.kind !== 'rock'; });
    var rock = P.filter(function (p) { return p.kind === 'rock'; });
    var g = new Array(W * H).fill(null);
    var NB = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]];
    function ok(x, y, p) {
      var e = p.edges;
      if (y === 0 && e[0] !== 'W') return false;
      if (x === W - 1 && e[1] !== 'W') return false;
      if (y === H - 1 && e[2] !== 'W') return false;
      if (x === 0 && e[3] !== 'W') return false;
      for (var i = 0; i < 4; i++) {
        var nx = x + NB[i][0], ny = y + NB[i][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var nb = g[ny * W + nx];
        if (!nb) continue;
        if (e[NB[i][2]] !== nb.edges[NB[i][3]]) return false;
        if (e[NB[i][2]] === 'O' && p.kind === 'space' && nb.kind === 'space') return false;
      }
      return true;
    }
    function shuffled(a) {
      a = a.slice();
      for (var i = a.length - 1; i > 0; i--) { var j = (rnd() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    var guard = 0;
    function step(i) {
      if (i === W * H) return true;
      if (++guard > 400000) return false;                 // a bounded search, never a hang on the main thread [REF#GP-02379]
      var x = i % W, y = (i / W) | 0;
      var opts = shuffled(real).concat(rock);
      for (var n = 0; n < opts.length; n++) {
        if (!ok(x, y, opts[n])) continue;
        g[i] = opts[n];
        if (step(i + 1)) return true;
        g[i] = null;
      }
      return false;
    }
    return step(0) ? { w: W, h: H, cells: g } : null;
  }
  // ── PLACEMENT ───────────────────────────────────────────────────────────────────────────────────── [REF#GP-02380]
  // ⚠ EVERY TILE NEEDS NORMALISING AND NONE OF IT IS OPTIONAL (all MEASURED 2026-10-16):
  //   · OFF-CENTRE ORIGINS — tile.2-corner's Z centre sits at +0.08, tile.longhallway's X centre at
  //     +0.09. Dropped at a grid position unrecentred, a tile straddles the seam. This is the same trap
  //     that threw Nemesis's helmet into the air on 2026-10-15 (source-layout translations).
  //   · FLOORS AT DIFFERENT HEIGHTS — 0.182 / 0.208 / 0.338 / 0.363. Butt a corridor against a room and
  //     the floor steps. Each tile's floor is pinned to y=0.
  //   · ONE TILE IS NOT SQUARE — tile.longhallway is 1.0 × 0.455, under half the depth of the others.
  //     Mark 2026-10-16: "just shrink them as needed", so it is scaled per-axis to fill the cell.
  //     window._tileUniformScale = true fits it uniformly instead and leaves the gap honest.
  function normalize(THREE, obj, cell) {
    var box = new THREE.Box3().setFromObject(obj);
    var size = box.getSize(new THREE.Vector3());
    var ctr = box.getCenter(new THREE.Vector3());
    var floorY = null, floorRay = new THREE.Raycaster(), floorNormal = new THREE.Vector3();
    for (var fx of [-0.2, 0, 0.2]) for (var fz of [-0.2, 0, 0.2]) {
      floorRay.set(new THREE.Vector3(ctr.x + size.x * fx, box.min.y + size.y * 0.35, ctr.z + size.z * fz), new THREE.Vector3(0,-1,0));
      var floorHits = floorRay.intersectObject(obj, true);
      for (var hit of floorHits) {
        if (hit.face && floorNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y > 0.55) {
          if (floorY === null || hit.point.y < floorY) floorY = hit.point.y;
          break;
        }
      }
    }
    if (floorY === null) throw new Error('Tile has no measurable walkable floor.');
    obj.position.x -= ctr.x;
    obj.position.z -= ctr.z;
    obj.position.y -= floorY;
    var sx = cell / (size.x || 1), sz = cell / (size.z || 1);
    if (root._tileUniformScale === true) { var s = Math.min(sx, sz); sx = sz = s; }
    var wrap = new THREE.Group();
    wrap.add(obj);
    wrap.scale.set(sx, Math.min(sx, sz), sz);
    return wrap;
  }
  // mulberry32 — the same seed deals the same layout, so a layout can be reproduced. No seed = Math.random. [REF#GP-10003]
  function seeded(seed) {
    if (seed === undefined || seed === null) return Math.random;
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function build(opts) {
    var THREE = opts.THREE, loader = opts.loader, scene = opts.scene;
    var W = opts.w || 8, H = opts.h || 6, cell = opts.cell || 2;
    var sol = opts.solution || solve(W, H, opts.rnd || seeded(opts.seed));
    if (!sol) throw new Error('No connected tile layout could be generated. Try again.');
    sol = connected(sol);
    var group = new THREE.Group();
    group.name = 'TileDungeon';
    var need = {}, cells = sol.cells;
    cells.forEach(function (c) { if (c && TILES[c.name].file) need[c.name] = TILES[c.name].file; });
    var names = Object.keys(need), pending = names.length, cache = {}, failed = false;
    if (!pending) throw new Error('Tile layout contains no rooms.');
    function fail(error) {
      if (failed) return;
      failed = true;
      if (opts.onError) opts.onError(error);
    }
    names.forEach(function (nm) {
      loader.load(DIR + need[nm], function (gltf) {
        if (failed) return;
        cache[nm] = gltf.scene;
        if (opts.onProgress) opts.onProgress(names.length - pending + 1, names.length);
        if (--pending === 0) { try { place(); } catch (error) { fail(error); } }
      }, undefined, function (error) {
        fail(new Error('Could not load ' + need[nm] + ': ' + (error.message || 'network error')));
      });
    });
    function place() {
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (!c || !cache[c.name]) continue;
        var inst = cache[c.name].clone(true);
        inst.traverse(function(o) {
          if (!o.isMesh || !o.material) return;
          function matte(m) {
            m=m.clone(); m.roughness=Math.max(0.9,m.roughness || 0); m.metalness=0;
            if ('emissiveIntensity' in m) m.emissiveIntensity *= 0.15;
            if ('envMapIntensity' in m) m.envMapIntensity=0.15;
            return m;
          }
          o.material=Array.isArray(o.material)?o.material.map(matte):matte(o.material);
        });
        var wrap = normalize(THREE, inst, cell);
        wrap.rotation.y = -c.rot * Math.PI / 2;           // k is CW in the edge table; three.js Y is CCW [REF#GP-02383]
        wrap.position.set((i % W) * cell, 0, ((i / W) | 0) * cell);
        wrap.userData._tileName = c.name; wrap.userData._tileRot = c.rot;
        group.add(wrap);
      }
      if (scene) scene.add(group);
      try {
        console.log('[TILE DUNGEON] built ' + W + 'x' + H + ' — ' + group.children.length + ' tiles, cell ' + cell);
      } catch (_) {}
      if (typeof opts.onDone === 'function') opts.onDone(group, sol);
    }
    return group;
  }
  function connected(sol) {
    var cells = sol.cells.slice(), seen = new Set(), largest = [], steps = [[0,-1],[1,0],[0,1],[-1,0]];
    cells.forEach(function(c, start) {
      if (!c || c.kind === 'rock' || seen.has(start)) return;
      var queue = [start]; seen.add(start);
      for (var p = 0; p < queue.length; p++) {
        var i = queue[p], x = i % sol.w, z = Math.floor(i / sol.w);
        steps.forEach(function(d, k) {
          if (cells[i].edges[k] !== 'O') return;
          var nx=x+d[0], nz=z+d[1], ni=nz*sol.w+nx, n=cells[ni];
          if(nx<0 || nz<0 || nx>=sol.w || nz>=sol.h || !n || n.edges[(k+2)%4] !== 'O') throw new Error('Tile doorway has no matching neighbor.');
          if (!seen.has(ni)) { seen.add(ni); queue.push(ni); }
        });
      }
      if (queue.length > largest.length) largest = queue;
    });
    if (largest.length < 4) throw new Error('Layout has fewer than four connected tiles. Try again.');
    var keep = new Set(largest);
    return { w:sol.w, h:sol.h, cells:cells.map(function(c,i){ return keep.has(i) ? c : {name:'void',kind:'rock',edges:'WWWW',rot:0}; }), reachable:largest };
  }
  function walkSession(opts) {
    var T=opts.THREE, group=opts.group, sol=opts.solution, cell=opts.cell;
    var world=new T.Scene(); world.background=new T.Color(0x080c11); world.add(group);
    var camera=new T.PerspectiveCamera(100,1,0.05,cell*sol.w*2);
    camera.rotation.order='YXZ';   // yaw first, then the fixed downward look, so turning never rolls the view [REF#GP-10004]
    var LOOK_DOWN=-15*Math.PI/180;
    var fill=new T.HemisphereLight(0xbacbdf,0x252018,0.45);
    var lamp=new T.PointLight(0xffdfb2,0.9,cell*2.5,2);
    world.add(fill); camera.add(lamp); world.add(camera); lamp.position.set(0,0.3,0);
    group.updateMatrixWorld(true);
    var ray=new T.Raycaster(), down=new T.Vector3(0,-1,0), origin=new T.Vector3();
    var tiles=group.children, meshes=[];
    group.traverse(function(o){ if(o.isMesh) meshes.push(o); });
    // Wall torches: one flame in front of every closed side of every tile, found by a ray from the tile centre. [REF#GP-10005]
    // Light = a fixed bank of TORCH_BANK point lights moved to the torches nearest the player each frame, so the
    // light count never grows with the layout. Intensity = TORCH_FULL × window._tileTorchMul (default 0.25 = 25%).
    var TORCH_FULL=1.0, TORCH_BANK=6, torches=[], flameGeo=new T.SphereGeometry(0.07,8,6), flameMat=new T.MeshBasicMaterial({color:0xffb25a});
    var sideDirs=[[0,-1],[1,0],[0,1],[-1,0]];
    sol.reachable.forEach(function(index){
      var tx=(index%sol.w)*cell, tz=Math.floor(index/sol.w)*cell, edges=sol.cells[index].edges;
      var tile=tiles.filter(function(o){return o.position.x===tx && o.position.z===tz;});
      var box=new T.Box3(); tile.forEach(function(o){box.expandByObject(o);});
      var h=Math.max(0.5,Math.min(1.9,(box.isEmpty()?2:box.max.y)*0.7));
      for(var k=0;k<4;k++){
        if(edges[k]!=='W') continue;
        var d=sideDirs[k];
        ray.set(origin.set(tx,h,tz),new T.Vector3(d[0],0,d[1])); ray.near=0; ray.far=cell*0.75;
        var hit=ray.intersectObjects(tile,true)[0], reach=hit?Math.max(0.2,hit.distance-0.15):cell/2-0.3;
        var flame=new T.Mesh(flameGeo,flameMat); flame.position.set(tx+d[0]*reach,h,tz+d[1]*reach);
        world.add(flame); torches.push(flame);
      }
    });
    var bank=[];
    for(var b=0;b<Math.min(TORCH_BANK,torches.length);b++){ var tl=new T.PointLight(0xffa75a,0,cell*1.5,2); world.add(tl); bank.push(tl); }
    function placeTorchLights(){
      var mul=(typeof root._tileTorchMul==='number')?root._tileTorchMul:0.25;
      torches.sort(function(a,c){return a.position.distanceToSquared(camera.position)-c.position.distanceToSquared(camera.position);});
      for(var i=0;i<bank.length;i++){ bank[i].position.copy(torches[i].position); bank[i].intensity=TORCH_FULL*mul; }
    }
    function nearby(x,z) { return tiles.filter(function(o){return Math.abs(o.position.x-x)<cell*1.5 && Math.abs(o.position.z-z)<cell*1.5;}); }
    function floor(x,z,y) {
      ray.set(origin.set(x,y,z),down); ray.near=0; ray.far=2.5;
      var hits=ray.intersectObjects(nearby(x,z),true);
      for(var i=0;i<hits.length;i++) if(hits[i].face && new T.Vector3().copy(hits[i].face.normal).transformDirection(hits[i].object.matrixWorld).y>0.55) return hits[i].point.y;
      return null;
    }
    // Faces the doorway whose straight run is longest in the geometry, not the first doorway in the table. [REF#GP-10006]
    function openFacing(x,z,y,index) {
      var best={run:0,yaw:0}, dirs=[[0,-1],[1,0],[0,1],[-1,0]], yaws=[0,-Math.PI/2,Math.PI,Math.PI/2], edges=sol.cells[index].edges;
      for(var k=0;k<4;k++) {
        if(edges[k]!=='O') continue;
        ray.set(origin.set(x,y+1.1,z),new T.Vector3(dirs[k][0],0,dirs[k][1])); ray.near=0; ray.far=cell*1.5;
        var hits=ray.intersectObjects(nearby(x,z),true);
        var run=hits.length?hits[0].distance:cell*1.5;
        if(run>best.run) best={run:run,yaw:yaws[k]};
      }
      return best;
    }
    var pos=null, yaw=0;
    for(var i=0;i<sol.reachable.length && !pos;i++) {
      var index=sol.reachable[i], cx=(index%sol.w)*cell, cz=Math.floor(index/sol.w)*cell;
      for(var iz of [0,-1,1,-2,2]) for(var ix of [0,-1,1,-2,2]) {
        if(pos) break;
        var x=cx+ix*cell/10,z=cz+iz*cell/10,y=floor(x,z,2.4);
        if(y!==null && Math.abs(y)<1.5 && clear(x,z,y)) {
          var best=openFacing(x,z,y,index);
          if(best.run < cell*0.5) continue;              // no doorway with a physically open run: try another spot [REF#GP-10007]
          pos=new T.Vector3(x,y,z);
          yaw=best.yaw;
        }
      }
    }
    if(!pos) throw new Error('No safe standing space found in the tile geometry.');
    function clear(x,z,y) {
      var ns=nearby(x,z);
      for(var h of [0.35,1.1,1.7]) for(var d of [[1,0],[-1,0],[0,1],[0,-1]]) {
        ray.set(origin.set(x,y+h,z),new T.Vector3(d[0],0,d[1])); ray.far=0.26;
        if(ray.intersectObjects(ns,true).length) return false;
      }
      return true;
    }
    var spawn=pos.clone(), last=0, active=true;
    function tick(now,keys) {
      var dt=last ? Math.min(0.05,(now-last)/1000) : 0; last=now;
      var left=keys.a||keys.A||keys.ArrowLeft||keys.arrowleft, right=keys.d||keys.D||keys.ArrowRight||keys.arrowright;
      yaw+=(Number(left||0)-Number(right||0))*dt*1.6;
      var forward=Number(!!(keys.w||keys.W||keys.ArrowUp||keys.arrowup))-Number(!!(keys.s||keys.S||keys.ArrowDown||keys.arrowdown));
      var side=Number(!!(keys.e||keys.E))-Number(!!(keys.q||keys.Q));
      var dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*dt*2.5, dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*dt*2.5;
      if(forward && side) { dx/=Math.SQRT2; dz/=Math.SQRT2; }
      for(var delta of [[dx,0],[0,dz]]) {
        var nx=pos.x+delta[0],nz=pos.z+delta[1],fy=floor(nx,nz,pos.y+0.4);
        if(fy!==null && Math.abs(fy-pos.y)<=0.3 && clear(nx,nz,fy)) pos.set(nx,fy,nz);
      }
      camera.position.set(pos.x,pos.y+1.65,pos.z); camera.rotation.set(LOOK_DOWN,yaw,0);
      placeTorchLights();
      var vw = typeof opts.width === 'function' ? opts.width() : root.innerWidth;
      var vh = typeof opts.height === 'function' ? opts.height() : root.innerHeight;
      camera.aspect = vw / Math.max(1, vh); camera.updateProjectionMatrix();
      opts.render(world,camera);
    }
    return { tick:tick, spawn:spawn, navigation:sol, camera:camera, dispose:function(){
      if(!active)return; active=false;
      world.remove(group); var geometries=new Set(),materials=new Set(),textures=new Set();
      meshes.forEach(function(o){geometries.add(o.geometry); (Array.isArray(o.material)?o.material:[o.material]).forEach(function(m){if(m)materials.add(m);});});
      materials.forEach(function(m){Object.keys(m).forEach(function(k){if(m[k]&&m[k].isTexture)textures.add(m[k]);});m.dispose();});
      geometries.forEach(function(g){g.dispose();});textures.forEach(function(t){t.dispose();});
      flameGeo.dispose(); flameMat.dispose();
    }};
  }
  root.TileDungeon = { TILES: TILES, protos: protos, solve: solve, connected:connected, build: build, walkSession:walkSession };
})(window);
