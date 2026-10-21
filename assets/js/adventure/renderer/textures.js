/**
 * Texture Generators
 * Procedurally generates textures for the game world.
 * Ported from Baseline.Origami.html
 */

export const Textures = {
  makePaperTexture: (baseColor) => {
    const c = document.createElement('canvas'); c.width = c.height = 512; const ctx = c.getContext('2d');
    ctx.fillStyle = baseColor; ctx.fillRect(0,0,512,512);
    
    // Fiber Noise
    for (let i=0;i<2000;i++) { 
        const x=Math.random()*512, y=Math.random()*512, w=Math.random()*24+6; 
        const a=Math.random()*0.03+0.01; 
        ctx.fillStyle = `rgba(0,0,0,${a})`; 
        ctx.fillRect(x,y,w,1); 
    }
    
    // Subtle Grid (Fold lines)
    ctx.strokeStyle = 'rgba(0,0,0,0.03)'; ctx.lineWidth = 2;
    for (let x=0; x<512; x+=64) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,512); ctx.stroke(); }
    for (let y=0; y<512; y+=64) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(512,y); ctx.stroke(); }
    
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(4,4); return tex;
  },

  makeNoiseBump: () => { 
    const c=document.createElement('canvas'); c.width=c.height=256; const ctx=c.getContext('2d'); const img=ctx.createImageData(256,256); 
    for (let i=0;i<img.data.length;i+=4){ const v=128+Math.floor(Math.random()*127); img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255;} 
    ctx.putImageData(img,0,0); const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(4,4); return tex; 
  },

  createDojoWallTexture: () => {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const ctx = c.getContext('2d');
    
    // 1. Paper Base (Warm White)
    const paper = '#fdfbf7';
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 1024, 1024);
    
    // 2. Paper Texture (Noise)
    for (let i = 0; i < 8000; i++) {
        const x = Math.random() * 1024, y = Math.random() * 1024;
        const a = Math.random() * 0.05;
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        ctx.fillRect(x, y, 2, 2);
    }
    
    // 3. Wood Slats (Darker, Richer)
    const wood = '#5c4033';
    ctx.fillStyle = wood;
    const vSpacing = 256, hSpacing = 256, bar = 16;
    
    // Vertical Beams
    for (let x = 0; x <= 1024; x += vSpacing) {
        ctx.fillRect(Math.max(0, x - bar/2), 0, bar, 1024);
        // Wood Grain Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(Math.max(0, x - bar/2) + 2, 0, 2, 1024);
        ctx.fillStyle = wood;
    }
    
    // Horizontal Beams
    for (let y = 0; y <= 1024; y += hSpacing) {
        ctx.fillRect(0, Math.max(0, y - bar/2), 1024, bar);
        // Wood Grain Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(0, Math.max(0, y - bar/2) + 2, 1024, 2);
        ctx.fillStyle = wood;
    }
    
    // 4. Ambient Occlusion / Dirt (Corners)
    const grd = ctx.createRadialGradient(512, 512, 100, 512, 512, 800);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 1024, 1024);
    
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    return tex;
  },

  makeCastleRaftersTexture: () => {
    const size = 1024;
    const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
    const baseTop = '#5c4632';
    const baseBot = '#3f3023';
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, baseTop);
    g.addColorStop(1, baseBot);
    ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000';
    for (let i=0;i<1400;i++) {
        const x = Math.random()*size, y = Math.random()*size;
        const w = 30+Math.random()*90, h = 1;
        ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
    const cell = 160; const beam = 26; const beamColor = '#2d2217';
    ctx.fillStyle = beamColor;
    for (let y=0; y<=size; y+=cell) {
        ctx.fillRect(0, Math.max(0, y - beam/2), size, beam);
    }
    for (let x=0; x<=size; x+=cell) {
        ctx.fillRect(Math.max(0, x - beam/2), 0, beam, size);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1,1);
    return tex;
  },
  createDungeonFloorTexture: () => {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const ctx = c.getContext('2d');
    
    // 1. Base Stone Color
    ctx.fillStyle = '#8b7e66'; // Warm grey/tan
    ctx.fillRect(0, 0, 1024, 1024);
    
    // 2. Stone Noise (Granite-like)
    for (let i = 0; i < 20000; i++) {
        const x = Math.random() * 1024, y = Math.random() * 1024;
        const v = Math.random() * 40 - 20;
        const shade = Math.floor(128 + v);
        ctx.fillStyle = `rgba(${shade},${shade},${shade},0.1)`;
        ctx.fillRect(x, y, 2, 2);
    }
    
    // 3. Large Tiles (Grid)
    const tileSize = 256;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    
    for (let x = 0; x <= 1024; x += tileSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke();
    }
    for (let y = 0; y <= 1024; y += tileSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
    }
    
    // 4. Tile Variation (Subtle color shifts per tile)
    for (let y = 0; y < 1024; y += tileSize) {
        for (let x = 0; x < 1024; x += tileSize) {
            const tint = Math.random() * 0.05;
            ctx.fillStyle = `rgba(0,0,0,${tint})`;
            ctx.fillRect(x, y, tileSize, tileSize);
            
            // Inner Highlight
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x+2, y+2, tileSize-4, tileSize-4);
        }
    }
    
    // 5. Cracks / Wear
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    for(let i=0; i<10; i++) {
        const startX = Math.random() * 1024;
        const startY = Math.random() * 1024;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        let cx = startX, cy = startY;
        for(let j=0; j<20; j++) {
            cx += (Math.random()-0.5) * 30;
            cy += (Math.random()-0.5) * 30;
            ctx.lineTo(cx, cy);
        }
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    return tex;
  }
};
