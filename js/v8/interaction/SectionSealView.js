// Physical seal presentation. Engine state owns rules, clock, rendering and unlocking. [REF#IX-00032]
export const SEAL_GRID = Object.freeze({ origin:106, pitch:100, inset:3, cell:94, size:512 });
let sparkleMaterial=null, activeSparkles=null;

export function sealCellFromUV(uv) {
    if (!uv) return null;
    const g=SEAL_GRID, x=uv.x*g.size-g.origin, y=(1-uv.y)*g.size-g.origin;
    const col=Math.floor(x/g.pitch), row=Math.floor(y/g.pitch);
    if(col<0||col>2||row<0||row>2||x%g.pitch<g.inset||x%g.pitch>=g.inset+g.cell
        ||y%g.pitch<g.inset||y%g.pitch>=g.inset+g.cell)return null;
    return row*3+col;
}

export function drawSeal(visual, state, winning, selected=-1, slide=null, armed=null, moves=[]) {
    const c=visual.canvas.getContext('2d'), g=SEAL_GRID, b=state.board;
    c.clearRect(0,0,g.size,g.size);
    c.fillStyle='#211a12';c.beginPath();c.arc(256,256,246,0,Math.PI*2);c.fill();
    c.strokeStyle='#e9d9ad';c.lineWidth=3;c.stroke();
    c.fillStyle='#110d09';
    for(let i=0;i<9;i++){
        const x=g.origin+i%3*g.pitch+g.inset,y=g.origin+(i/3|0)*g.pitch+g.inset;
        c.fillStyle='#110d09';c.fillRect(x,y,g.cell,g.cell);
        // Engine-provided moves drive destination glow; atan2(row delta, column delta) points the arrow from the selected tile. [REF#IX-00033]
        // SEEN 2026-10-18 (user confirmation in chat): the directional arrow replacement was successful in play.
        // Implementation and evidence: knowledge/design/SEALED_DOOR_SELECTION_2026-10-18.md.
        if(moves.includes(i)){
            c.save();c.shadowColor='#fbbf24';c.shadowBlur=18;c.strokeStyle='#fde68a';c.lineWidth=5;
            c.strokeRect(x+4,y+4,g.cell-8,g.cell-8);c.restore();
            c.save();c.translate(x+47,y+47);
            c.rotate(Math.atan2((i/3|0)-(armed/3|0),i%3-armed%3));
            c.strokeStyle='#fde68a';c.lineWidth=4;c.lineCap='round';c.lineJoin='round';c.beginPath();
            c.moveTo(-17,0);c.lineTo(17,0);c.moveTo(6,-11);c.lineTo(17,0);c.lineTo(6,11);c.stroke();c.restore();
        }
        if(b[i]===null&&i===selected){
            c.strokeStyle='#fff';c.lineWidth=3;c.strokeRect(x+10,y+10,g.cell-20,g.cell-20);
        }
    }
    for(let i=0;i<9;i++){
        if(b[i]===null)continue;
        let x=g.origin+i%3*g.pitch+g.inset,y=g.origin+(i/3|0)*g.pitch+g.inset;
        const pressed=i===armed;
        if(pressed)y+=4;
        if(slide&&i===slide.to){
            const t=1-Math.pow(1-slide.progress,3);
            x+=(slide.from%3-slide.to%3)*g.pitch*(1-t);
            y+=((slide.from/3|0)-(slide.to/3|0))*g.pitch*(1-t);
        }
        const wood=c.createLinearGradient(x,y,x+g.cell,y+g.cell);
        wood.addColorStop(0,'#f8e9c7');wood.addColorStop(.55,'#e9cf9b');wood.addColorStop(1,'#d6b47a');
        c.fillStyle='#987044';if(!pressed)c.fillRect(x,y+4,g.cell,g.cell-4);
        c.fillStyle=wood;c.fillRect(x,y,g.cell,g.cell-5);
        if(pressed){
            c.fillStyle='#30200e66';c.fillRect(x,y,g.cell,6);c.fillRect(x,y,5,g.cell-5);
            c.strokeStyle='#30200e';c.lineWidth=3;c.strokeRect(x+2,y+2,g.cell-4,g.cell-9);
        }
        c.strokeStyle='#8c683526';c.lineWidth=1;
        for(let k=8;k<g.cell;k+=9){c.beginPath();c.moveTo(x+k,y+3);c.lineTo(x+k+2,y+g.cell-8);c.stroke();}
        c.strokeStyle='#886032';c.strokeRect(x+6,y+6,g.cell-12,g.cell-17);
        if(i===selected){c.strokeStyle='#fff';c.lineWidth=5;c.strokeRect(x-2,y-2,g.cell+4,g.cell+1);
            c.strokeStyle='#111';c.lineWidth=2;c.strokeRect(x-5,y-5,g.cell+10,g.cell+7);}
        if(b[i]==='B')continue;
        c.font='bold 72px Georgia,serif';c.textAlign='center';c.textBaseline='middle';
        c.fillStyle='#fff2cc';c.fillText(b[i],x+48,y+47);
        c.fillStyle='#30200e';c.fillText(b[i],x+47,y+45);
        if(winning?.includes(i)){c.strokeStyle='#fff';c.lineWidth=5;c.strokeRect(x+3,y+3,g.cell-6,g.cell-10);}
    }
    c.fillStyle='#fff';c.textAlign='center';c.font='bold 21px sans-serif';
    c.fillText(state.won?'ENTRANCE AUTHORIZED':'ALIGN THREE Xs',256,72);
    visual.texture.needsUpdate=true;
}

export function inspectionCamera(THREE, visual, canvas) {
    const rect=canvas.getBoundingClientRect(), aspect=Math.max(.1,rect.width/Math.max(1,rect.height));
    const gridWidth=1.44*300/512;
    // Frame the actionable grid, not its ornamental ring. Minimum usable viewport: 156px. [REF#IX-00034]
    const top=Math.min(rect.height*.8,visual.layout?.top||12),bottom=Math.min(rect.height*.8,visual.layout?.bottom||12);
    const available=Math.max(1,rect.height-top-bottom);
    const pixels=Math.max(1,Math.min(360,rect.width-24,available-24));
    const height=gridWidth*Math.max(1,rect.height)/pixels;
    const cam=visual.inspectionCamera||(visual.inspectionCamera=new THREE.OrthographicCamera());
    const face=visual.faces[0];face.updateWorldMatrix(true,false);
    const key=[rect.width,rect.height,top,bottom,face.layers.mask,...face.matrixWorld.elements].join(',');
    if(visual.inspectionCameraKey===key)return cam;
    visual.inspectionCameraKey=key;
    const offset=((top+available/2)-rect.height/2)*height/Math.max(1,rect.height);
    cam.left=-height*aspect/2;cam.right=height*aspect/2;cam.top=height/2+offset;cam.bottom=-height/2+offset;
    cam.near=.01;cam.far=20;
    const target=face.getWorldPosition(new THREE.Vector3());
    const normal=new THREE.Vector3(0,0,1).applyQuaternion(face.getWorldQuaternion(new THREE.Quaternion()));
    cam.position.copy(target).addScaledVector(normal,2.5);cam.up.set(0,1,0);cam.lookAt(target);
    cam.layers.mask=face.layers.mask|1;cam.updateProjectionMatrix();cam.updateMatrixWorld(true);
    return cam;
}

// One original board over a cached inspection backdrop; never clone the puzzle. [REF#IX-00035]
export function renderSealInspection(THREE, visual, renderer, safeRenderer, world, camera) {
    if(safeRenderer.contextLost)return;
    const width=renderer.domElement.width,height=renderer.domElement.height;
    let cache=visual.inspectionBackdrop;
    if(!cache){
        cache=visual.inspectionBackdrop={target:new THREE.WebGLRenderTarget(width,height),scene:new THREE.Scene(),key:null};
        cache.target.texture.generateMipmaps=false;
        cache.target.texture.encoding=renderer.outputEncoding;
        // Copy captured output without applying tone mapping a second time. [REF#IX-00036]
        const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,
            uniforms:{image:{value:cache.target.texture}},
            vertexShader:'varying vec2 texUV; void main(){ texUV=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
            fragmentShader:'uniform sampler2D image; varying vec2 texUV; void main(){ gl_FragColor=texture2D(image,texUV); }'});
        cache.backdrop=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);
        cache.backdrop.frustumCulled=false;cache.backdrop.renderOrder=-Infinity;
        cache.scene.add(cache.backdrop);
    }
    const key=visual.inspectionCameraKey+':'+width+':'+height+':'+safeRenderer.recoveryAttempts;
    const group=visual.group;
    if(cache.key!==key){
        cache.target.setSize(width,height);
        const target=renderer.getRenderTarget(),visible=group.visible;
        try{
            group.visible=false; // backdrop must not contain a second copy of the board [REF#IX-00037]
            renderer.setRenderTarget(cache.target);
            const before=safeRenderer.successfulRenderCount;
            safeRenderer.renderSafe(world,camera);
            if(safeRenderer.successfulRenderCount===before)return;
            cache.key=key;
        }finally{group.visible=visible;renderer.setRenderTarget(target);}
    }
    const parent=group.parent,index=parent.children.indexOf(group),auto=group.matrixAutoUpdate;
    const local=group.matrix.clone();group.updateWorldMatrix(true,false);
    const worldMatrix=group.matrixWorld.clone();
    try{
        cache.scene.add(group);group.matrixAutoUpdate=false;group.matrix.copy(worldMatrix);
        group.matrixWorldNeedsUpdate=true;
        safeRenderer.renderSafe(cache.scene,camera);
    }finally{
        parent.add(group);
        parent.children.splice(parent.children.indexOf(group),1);parent.children.splice(index,0,group);
        group.matrix.copy(local);group.matrixAutoUpdate=auto;group.matrixWorldNeedsUpdate=true;
        group.updateWorldMatrix(false,true);
    }
}

export function releaseSealInspection(visual){
    if(!visual)return;
    visual.inspectionBackdrop?.target.dispose();
    visual.inspectionBackdrop?.backdrop.geometry.dispose();
    visual.inspectionBackdrop?.backdrop.material.dispose();
    visual.inspectionBackdrop=null;visual.inspectionCameraKey=null;
}

export function celebrateSeal(THREE, visual, reduced, motionOff) {
    if(motionOff)return;
    const count=reduced?8:32, positions=new Float32Array(count*3), velocities=[];
    for(let i=0;i<count;i++){
        const a=i/count*Math.PI*2;
        positions[i*3]=Math.cos(a)*.7;positions[i*3+1]=Math.sin(a)*.7;positions[i*3+2]=visual.faces[0].position.z;
        velocities.push([Math.cos(a)*.35,Math.sin(a)*.35+.12]);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    // Retain this material/program across doors; removing a burst must not recompile the next one. [REF#IX-00038]
    const material=sparkleMaterial||(sparkleMaterial=new THREE.PointsMaterial({color:0xffe6ad,size:.035,transparent:true,opacity:.8,
        depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    material.userData.sectionSealShared=true;material.opacity=.8;
    if(activeSparkles)activeSparkles.points.visible=false;
    const points=new THREE.Points(geometry,material);points.layers.mask=visual.faces[0].layers.mask;
    visual.group.add(points);visual.sparkles={points,velocities};activeSparkles=visual.sparkles;
}

export function tickSealSparkles(visual, dt, fade, motionOff) {
    const s=visual.sparkles;if(!s||s!==activeSparkles)return;
    if(motionOff){s.points.visible=false;return;}
    const p=s.points.geometry.attributes.position;
    for(let i=0;i<p.count;i++){p.array[i*3]+=s.velocities[i][0]*dt;p.array[i*3+1]+=s.velocities[i][1]*dt;}
    p.needsUpdate=true;s.points.material.opacity=.8*fade;
}
