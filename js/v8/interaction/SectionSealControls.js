// Accessible equivalents for the physical machine. Never opens an overlay or blocks world forwarding. [REF#IX-00028]
(() => {
    const host=document.getElementById('section-seal-controls');
    const grid=document.getElementById('section-seal-text-grid');
    const status=document.getElementById('section-seal-status');
    const back=document.getElementById('section-seal-back'),toggle=document.getElementById('section-seal-text-toggle');
    const announcement=document.getElementById('section-seal-announcement');
    let active=null,loadId=null,previousFocus=null,timer=0,selected=4,request=0;
    const announced=new Set(),buttons=[];
    const post=d=>window.parent.postMessage(d,location.origin);
    const command=(cmd,extra={})=>{
        if(!active)return;
        post({type:'FPV_CHAT_COMMAND',cmd,loadId:active.loadId,doorId:active.doorId,
            requestId:Date.now()+':'+(++request),...extra});
    };
    const editable=e=>!!e?.closest?.('input,textarea,select,[contenteditable="true"]');
    const symbol=v=>v===null?'Empty space':v==='B'?'Blank tile':v;
    function draw(){
        for(let i=0;i<9;i++){
            const b=buttons[i],v=active.board[i],canMove=active.moves?.includes(i)===true;
            b.textContent=symbol(v);b.setAttribute('aria-pressed',String(active.armed===i));
            b.dataset.destination=String(canMove);
            b.setAttribute('aria-label',symbol(v)+', row '+((i/3|0)+1)+', column '+(i%3+1)+
                (active.armed===i?', selected':canMove?', legal destination':v===null?', unavailable':', tile'));
        }
    }
    function close(notify=true){
        if(!active)return;
        if(notify)command('SEAL_BACK');
        active=null;host.hidden=true;document.body.classList.remove('seal-inspection-active');
        if(host.contains(document.activeElement)){
            const target=previousFocus?.isConnected?previousFocus:document.getElementById('fpv-chat-input');
            target?.focus({preventScroll:true});
        }
    }
    window._sectionSealInspectionActive=()=>!!active;
    window._sectionSealCommandContext=()=>({loadId,doorId:active?.doorId});
    let lastLayout='';
    function layout(){
        if(!active)return;
        try{
            const frame=window.parent.document.getElementById('engine-iframe')?.getBoundingClientRect();
            if(!frame)return;
            const panel=window.frameElement.getBoundingClientRect(),r=host.getBoundingClientRect();
            const input=document.getElementById('input-container')?.getBoundingClientRect();
            const cards=document.getElementById('guides-container')?.getBoundingClientRect();
            const visibleBottom=Math.min(frame.bottom,panel.top+(window.visualViewport?.height||innerHeight));
            const bottomEdge=Math.min(visibleBottom,...[input,cards].filter(x=>x&&x.width&&x.height).map(x=>panel.top+x.top));
            const value={top:Math.max(0,panel.top+r.bottom-frame.top+12),bottom:Math.max(12,frame.bottom-bottomEdge+12)};
            if(Math.min(frame.width-24,frame.height-value.top-value.bottom-24)<144&&grid.hidden){
                grid.hidden=false;toggle.setAttribute('aria-expanded','true');
            }
            const key=JSON.stringify(value);
            if(key!==lastLayout){lastLayout=key;command('SEAL_LAYOUT',value);}
        }catch(error){post({type:'ENGINE_ANOMALY',kind:'SECTION_SEAL',subsystem:'layout',error:String(error?.message||error)});}
    }
    let observer=null;
    const observed=new WeakSet();
    function watch(el){if(observer&&el&&!observed.has(el)){observed.add(el);observer.observe(el);}}
    try{
        observer=new ResizeObserver(layout);watch(host);
    }catch(error){post({type:'ENGINE_ANOMALY',kind:'SECTION_SEAL',subsystem:'layout-observer',error:String(error?.message||error)});}
    window.addEventListener('resize',layout);window.visualViewport?.addEventListener('resize',layout);
    back.addEventListener('click',()=>close());
    toggle.addEventListener('click',()=>{
        grid.hidden=!grid.hidden;toggle.setAttribute('aria-expanded',String(!grid.hidden));
        if(!grid.hidden)buttons[selected].focus();
        layout();
    });
    for(let i=0;i<9;i++){
        const b=document.createElement('button');b.type='button';b.dataset.sealTile=String(i);
        b.addEventListener('focus',()=>{selected=i;command('SEAL_FOCUS',{tileIndex:i});});
        b.addEventListener('click',()=>{
            command('SEAL_SELECT',{tileIndex:i});
        });
        buttons.push(b);grid.appendChild(b);
    }
    function show(d){
        if(loadId&&d.loadId!==loadId)return;
        if(!Array.isArray(d.board)||d.board.length!==9)throw Error('Invalid seal board');
        loadId=d.loadId;
        const key=d.loadId+':'+d.doorId;
        if(d.won&&!announced.has(key)){
            announced.add(key);announcement.textContent='You won! - Entrance Authorized!';announcement.hidden=false;
            clearTimeout(timer);timer=setTimeout(()=>{announcement.hidden=true;},2000);
            // The engine's persistent event log supplies the one live success announcement. [REF#IX-00029]
        }
        if(d.closed){if(active?.doorId===d.doorId)close(false);return;}
        if(d.won)return;
        const fresh=!active;
        if(fresh){previousFocus=document.activeElement;lastLayout='';}
        active=d;selected=Math.max(0,Math.min(8,d.selected??4));
        document.getElementById('section-seal-heading').textContent='Door seal · Section '+(d.section??'');
        host.hidden=false;document.body.classList.add('seal-inspection-active');draw();
        watch(document.getElementById('input-container'));watch(document.getElementById('guides-container'));
        status.textContent=d.board.map((v,i)=>(i%3===0?'Row '+((i/3|0)+1)+': ':'')+symbol(v)).join(', ')+'.';
        if(fresh&&(d.focusRequested||!editable(document.activeElement)))host.focus({preventScroll:true});
        layout();
    }
    window.addEventListener('message',e=>{
        if(e.source!==window.parent||e.origin!==location.origin)return;
        const d=e.data;if(!d)return;
        try{
            if(d.type==='ENGINE_LOAD_BEGIN'){
                close(false);loadId=d.loadId;announced.clear();clearTimeout(timer);announcement.hidden=true;
            }else if(d.type==='SECTION_SEAL_OPEN'||d.type==='SECTION_SEAL_STATE')show(d);
            else if(d.type==='COMPASSION_RENDER')layout();
        }catch(error){
            post({type:'ENGINE_ANOMALY',kind:'SECTION_SEAL',subsystem:'text-controls',error:String(error?.message||error)});
            close();
        }
    });
    // Arrows move focus across the board; Return selects a tile or confirms a legal destination through the engine. [REF#IX-00030]
    // SEEN 2026-10-18 (user confirmation in chat): the seal opens for play and the selection interaction succeeds.
    // Implementation and evidence: knowledge/design/SEALED_DOOR_SELECTION_2026-10-18.md.
    window.addEventListener('keydown',e=>{
        if(!active||editable(e.target))return;
        const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','Escape'];
        if(!keys.includes(e.key))return;
        if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}
        if(e.target.closest?.('button')&&['Enter',' '].includes(e.key)){
            e.stopImmediatePropagation();return; // preserve native button activation, suppress game shortcuts [REF#IX-00031]
        }
        e.preventDefault();e.stopImmediatePropagation();
        if(e.repeat)return;
        if(e.key==='Enter'||e.key===' '){command('SEAL_SELECT',{tileIndex:selected});return;}
        let row=selected/3|0,col=selected%3;
        if(e.key==='ArrowLeft')col=Math.max(0,col-1);
        if(e.key==='ArrowRight')col=Math.min(2,col+1);
        if(e.key==='ArrowUp')row=Math.max(0,row-1);
        if(e.key==='ArrowDown')row=Math.min(2,row+1);
        selected=row*3+col;command('SEAL_FOCUS',{tileIndex:selected});
        if(!grid.hidden)buttons[selected].focus();
        else status.textContent=buttons[selected].getAttribute('aria-label');
    },true);
    window.addEventListener('keyup',e=>{
        if(active&&!editable(e.target)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','Escape'].includes(e.key))
            e.stopImmediatePropagation();
    },true);
    post({type:'SECTION_SEAL_READY'});
})();
