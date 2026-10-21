// js/fpv/Textures.js
export const TextureMethods = {
            makePaperTexture(baseColor) {
                const c = document.createElement('canvas'); c.width = c.height = 256; const ctx = c.getContext('2d');
                ctx.fillStyle = baseColor; ctx.fillRect(0,0,256,256);
                for (let i=0;i<400;i++) { 
                    const x=Math.random()*256, y=Math.random()*256, w=Math.random()*24+6; 
                    const a=Math.random()*0.05+0.02; ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(x,y,w,1); 
                }
                ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
                for (let x=0; x<256; x+=32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,256); ctx.stroke(); }
                for (let y=0; y<256; y+=32) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(256,y); ctx.stroke(); }
                const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(8,8); return tex;
            },

            makeWoodTexture(baseColor) {
                const c = document.createElement('canvas'); c.width = c.height = 512; const ctx = c.getContext('2d');
                ctx.fillStyle = baseColor; ctx.fillRect(0,0,512,512);
                const plankH = 40;
                for (let y=0;y<512;y+=plankH){
                    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0,y,512,plankH/2);
                    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0,y+plankH/2,512,plankH/2);
                    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0,y+plankH-1,512,1);
                }
                for (let i=0;i<700;i++){
                    const y = Math.random()*512; const len = 40+Math.random()*120; const x = Math.random()*512; const a = Math.random()*0.12;
                    ctx.strokeStyle = `rgba(255,255,255,${a*0.5})`; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(Math.min(512,x+len), y+Math.sin(y*0.05)*2); ctx.stroke();
                    ctx.strokeStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.moveTo(x,y+2); ctx.lineTo(Math.min(512,x+len), y+2+Math.sin((y+2)*0.05)*2); ctx.stroke();
                }
                const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2,2); return tex;
            },

            createDungeonWallTexture() {
                const canvas = document.createElement("canvas");
                canvas.width = 256;
                canvas.height = 256;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#f5f5f5";
                ctx.fillRect(0, 0, 256, 256);
                ctx.fillStyle = "rgba(0,0,0,0.03)";
                for (let i = 0; i < 1000; i++) {
                    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
                }
                ctx.strokeStyle = "#3a2d1e";
                ctx.lineWidth = 24;
                ctx.strokeRect(0, 0, 256, 256);
                ctx.lineWidth = 10;
                for (let i = 48; i < 256; i += 48) {
                    ctx.beginPath();
                    ctx.moveTo(i, 12);
                    ctx.lineTo(i, 244);
                    ctx.stroke();
                }
                for (let i = 64; i < 256; i += 64) {
                    ctx.beginPath();
                    ctx.moveTo(12, i);
                    ctx.lineTo(244, i);
                    ctx.stroke();
                }
                return new THREE.CanvasTexture(canvas);
            },

            createDungeonFloorTexture() {
                const size = 512;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");

                ctx.fillStyle = "#d2b48c"; // Tan stone color
                ctx.fillRect(0, 0, size, size);

                const imageData = ctx.getImageData(0, 0, size, size);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const randomFactor = (Math.random() - 0.5) * 15;
                    data[i]   += randomFactor; 
                    data[i+1] += randomFactor; 
                    data[i+2] += randomFactor;
                }
                ctx.putImageData(imageData, 0, 0);

                ctx.strokeStyle = 'rgba(139, 90, 43, 0.5)';
                ctx.lineWidth = 2;
                const step = size / 8;
                for(let i = step; i < size; i += step) {
                    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
                }

                ctx.strokeStyle = '#8b5a2b';
                ctx.lineWidth = 12;
                const inset = 6;
                ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);

                const tex = new THREE.CanvasTexture(canvas);
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                return tex;
            },

            createDarkWoodRafterTexture() {
                const size = 512;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");

                ctx.fillStyle = "#2B1810"; // Dark brown wood
                ctx.fillRect(0, 0, size, size);

                const imageData = ctx.getImageData(0, 0, size, size);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const randomFactor = (Math.random() - 0.5) * 20;
                    data[i]   += randomFactor;
                    data[i+1] += randomFactor * 0.8;
                    data[i+2] += randomFactor * 0.6;
                }
                ctx.putImageData(imageData, 0, 0);

                ctx.fillStyle = "#1A0F08"; 
                const beamWidth = 40;
                const beamSpacing = 80;
                for (let y = 0; y < size; y += beamSpacing) {
                    ctx.fillRect(0, y, size, beamWidth);
                }

                ctx.fillStyle = "#1A0F08";
                const vertBeamWidth = 30;
                const vertBeamSpacing = 120;
                for (let x = 0; x < size; x += vertBeamSpacing) {
                    ctx.fillRect(x, 0, vertBeamWidth, size);
                }

                ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
                ctx.lineWidth = 1;
                for (let i = 0; i < 50; i++) {
                    const y = Math.random() * size;
                    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
                }

                const tex = new THREE.CanvasTexture(canvas);
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                return tex;
            },

            createStatusCircleTexture(color, blink = false, splitColor = null) {
                const size = 256;
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");
                
                const center = size / 2;
                const radius = (size / 2) - 12;
                
                if (splitColor) {
                    ctx.fillStyle = color;
                    ctx.beginPath(); ctx.arc(center, center, radius, Math.PI/2, Math.PI*1.5); ctx.fill();
                    ctx.fillStyle = splitColor;
                    ctx.beginPath(); ctx.arc(center, center, radius, Math.PI*1.5, Math.PI/2); ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.arc(center, center, radius, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.fill();
                }
                
                // White border
                ctx.lineWidth = 12;
                ctx.strokeStyle = "#ffffff";
                ctx.stroke();
                
                // Arrow pointing forward (+Z direction is towards bottom of Canvas)
                ctx.beginPath();
                ctx.moveTo(center, size - 25);
                ctx.lineTo(center - 30, size - 75);
                ctx.lineTo(center + 30, size - 75);
                ctx.closePath();
                ctx.fillStyle = "#ffffff";
                ctx.fill();

                if (blink && Math.floor(Date.now() / 250) % 2 === 0) {
                    ctx.clearRect(0,0,size,size); // Blink out
                }

                const tex = new THREE.CanvasTexture(canvas);
                tex.needsUpdate = true;
                return tex;
            },
            
            getCachedCircleTexture(color, blink = false, splitColor = null) {
                if (!this.circleTexCache) this.circleTexCache = {};
                const key = color + (blink ? "_blink" : "") + (splitColor || "");
                // Blink textures must be regenerated to animate, or we can just toggle opacity in the loop. 
                // For simplicity, we cache solid ones.
                if (!blink && this.circleTexCache[key]) return this.circleTexCache[key];
                
                const tex = this.createStatusCircleTexture(color, blink, splitColor);
                if (!blink) this.circleTexCache[key] = tex;
                return tex;
            },


};
