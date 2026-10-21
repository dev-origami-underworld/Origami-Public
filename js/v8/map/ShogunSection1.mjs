/** Section 1 demo compiler. Pure data; Section0 owns stamping, Creator owns adoption. [REF#DG-01490]
 * Only the Crescent Court family has a measured tile embedding here. Reject unsupported families
 * instead of painting their name onto unrelated geometry. IDs 27+ append after the shipping rooms.
 */
import { deriveShogunCastlePlan, assertShogunCastlePlan, stableCastleHash32,
    FLOOR_1_V25_SECTION_IDENTITIES } from './ShogunCastleTemplates.mjs?v=shogun-v2-section1-comment-refs';

export const SECTION1_COMPILER_VERSION = 'section1-crescent-v1';

export function compileShogunSection1({ layoutSeed, floor = 1 } = {}) {
    if (floor !== 1) throw new RangeError('Section 1 demo embedding supports floor 1 only');
    const plan = deriveShogunCastlePlan({ layoutSeed, floor,
        section: FLOOR_1_V25_SECTION_IDENTITIES[0], missionFamily: 'CRESCENT_LOOP',
        templateId: 'MASUGATA_CRESCENT_COURT', normalRoomRoles: ['TEACH', 'CHOICE', 'PRESSURE', 'RELIEF'] });
    assertShogunCastlePlan(plan);
    // A bounded orientation choice from this section's key, independent of build order/global RNG. [REF#DG-01491]
    const north = stableCastleHash32(layoutSeed, SECTION1_COMPILER_VERSION, 'orientation') % 2 === 1;
    const point = ([x, z]) => [x, north ? 115 - z : z];
    const box = r => ({ ...r, z: north ? 116 - r.z - r.h : r.z,
        ...(r.door ? { door: point(r.door) } : {}),
        ...(r.parts ? { parts: r.parts.map(box) } : {}) });
    const semantic = role => `F1:S1:${role}`;
    const mainId = semantic('ROKA_MAIN'), serviceId = semantic('ROKA_SERVICE');
    const hallIds = new Map([[mainId, 10], [serviceId, 28]]);
    const slots = {
        TEACH:    { id: 12, x: 35, z: 56, w: 4, h: 4, door: [37,59], key:'R4x4', ja:'配膳室', en:'Pantry' },
        CHOICE:   { id: 13, x: 31, z: 60, w: 4, h: 4, door: [34,61], key:'R4x4', ja:'米蔵', en:'Rice Store' },
        PRESSURE: { id: 14, x: 35, z: 62, w: 4, h: 4, door: [37,62], key:'R4x4', ja:'仕込み室', en:'Preparation Room' },
        RELIEF:   { id: 27, x: 35, z: 66, w: 4, h: 4, door: [37,69], key:'R4x4', ja:'井戸端', en:'Well Room' },
    };
    const major = { id: 11, x:39, z:62, w:4, h:8, door:[41,62], key:'R4x8',
        ja:'食堂', en:'Cafeteria', hallId:10, semanticId:semantic('MAJOR') };
    const normal = plan.normalRooms.map(room => {
        if (!slots[room.role] || !hallIds.has(room.rokaId)) throw new Error('Uncompiled normal room/roka');
        return { ...slots[room.role], hallId:hallIds.get(room.rokaId), semanticId:room.id,
            missionRole:room.role, rokaId:room.rokaId };
    });
    const raw = {
        s:1, dir:'WEST', host:'ring', gateSide:'e', gate:[[47,57],[47,58]], link:[[43,59],[44,59]],
        linkSide: north ? 'n' : 's', roomType:'cafeteria', flag:'isCafeteria', ja:'食堂', en:'Cafeteria',
        castleAB:'B', castleTemplateId:plan.templateId, compilerVersion:SECTION1_COMPILER_VERSION,
        layoutSeed, orientation:north ? 'NORTH_RETURN' : 'SOUTH_RETURN',
        cors:[
            { id:9, x:43,z:57,w:4,h:2,key:'H2x4',semanticId:semantic('GATE_COURT'), en:'Masugata Court',ja:'枡形' },
            { id:10,x:35,z:60,w:10,h:2,key:'H2x10',semanticId:mainId,en:'Cafeteria Gallery',ja:'食堂廊下' },
            { id:28,x:35,z:62,w:10,h:10,key:null,semanticId:serviceId,en:'Service Return',ja:'裏廊下',
                parts:[{x:43,z:62,w:2,h:8},{x:35,z:70,w:10,h:2}] },
        ],
        rooms:[major,...normal],
        extraDoors:[
            { owner:14, to:13, tiles:[[35,63]], side:'w' },
            { owner:11, to:14, tiles:[[39,64]], side:'w' },
            { owner:11, to:27, tiles:[[39,67]], side:'w' },
            { owner:28, to:10, tiles:[[43,62],[44,62]], side:north?'s':'n' },
        ],
    };
    const section = { ...raw, gate:raw.gate.map(point), link:raw.link.map(point),
        cors:raw.cors.map(box), rooms:raw.rooms.map(box),
        extraDoors:raw.extraDoors.map(d => ({...d,tiles:d.tiles.map(point)})) };
    // Bind the semantic graph to actual spaces and anchors. SANCTUM/SONG are locations, not extra rooms. [REF#DG-01492]
    section.anchors = Object.fromEntries(Object.entries({
        INNER_GATE:[47,57], GATE_COURT:[45,57], WARD_GATE:[43,59], THRESHOLD:[43,60],
        TEACH:[37,57], CHOICE:[33,61], PRESSURE:[37,64], RELIEF:[37,67],
        MAJOR:[41,65], SANCTUM:[41,68], SONG:[37,68], RETURN_SHORTCUT:[43,70],
        OUTER_BREACH:[41,69], YAGURA:[44,58],
    }).map(([role,p]) => [semantic(role),point(p)]));
    section.plan = plan;
    return section;
}

/** Verify against the stamped output, before engine adoption/rendering. Checks the actual tiles and [REF#DG-01493]
 * declared portals, including perpendicular gates, a simple cycle, and a shorter service return.
 * This does not replace the real-engine movement/collider test.
 */
export function verifyShogunSection1(section, map) {
    assertShogunCastlePlan(section.plan);
    const ownRooms = [...section.cors,...section.rooms];
    const ids = new Set(ownRooms.map(r=>r.id));
    const cell = ([x,z])=>map[x]?.[z];
    const edges = new Set();
    const add = (a,b)=>edges.add([Math.min(a,b),Math.max(a,b)].join(':'));
    add(9,10); add(28,10);
    for (const room of section.rooms) add(room.id,room.hallId);
    for (const door of section.extraDoors) add(door.owner,door.to);
    const step = (a,b) => {
        const ca=cell(a),cb=cell(b);
        if (!ca || !cb || ca.type==='wall' || cb.type==='wall' || !ids.has(cb.roomId)) return false;
        return ca.roomId===cb.roomId || ((ca.type==='shoji_door'||cb.type==='shoji_door')
            && edges.has([Math.min(ca.roomId,cb.roomId),Math.max(ca.roomId,cb.roomId)].join(':')));
    };
    const path = (start,goal, allowed=()=>true) => {
        const key=p=>p.join(','), q=[start], prev=new Map([[key(start),null]]);
        for(let i=0;i<q.length;i++) {
            const p=q[i];
            if(key(p)===key(goal)) { const out=[]; for(let k=key(p);k!==null;k=prev.get(k)) out.push(k.split(',').map(Number)); return out.reverse(); }
            for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const n=[p[0]+dx,p[1]+dz],k=key(n);
                if(!prev.has(k)&&step(p,n)&&allowed(cell(n))) {prev.set(k,key(p));q.push(n);}
            }
        }
        throw new Error('Castle route unreachable: '+start+' → '+goal);
    };
    const routes={};
    for(const [name,roles] of Object.entries(section.plan.routes)) {
        const points=roles.map(role=>section.anchors[role]);
        if(points.some(p=>!p||!ids.has(cell(p)?.roomId))) throw new Error('Missing physical mission anchor');
        const tiles=[];
        for(let i=1;i<points.length;i++) {
            const allowed = name==='returnToHeart' ? c=>[9,10,27,28].includes(c.roomId) : ()=>true;
            const leg=path(points[i-1],points[i],allowed);
            tiles.push(...(i===1?leg:leg.slice(1)));
        }
        routes[name]={tiles,cost:tiles.length-1};
    }
    if(routes.returnToHeart.cost>=routes.entryToSong.cost) throw new Error('Service return is not shorter');
    // Cycle in the physical room/portal graph: choice → pressure → major → relief → service → main → choice. [REF#DG-01494]
    const cycle=[13,14,11,27,28,10,13];
    if(cycle.some((id,i)=>i>0&&!edges.has([Math.min(id,cycle[i-1]),Math.max(id,cycle[i-1])].join(':')))) throw new Error('Missing cycle portal');
    const normals=section.plan.normalRooms.map(r=>section.rooms.find(s=>s.semanticId===r.id));
    for(const room of normals) {
        const touch=new Set();
        for(let x=room.x;x<room.x+room.w;x++) for(let z=room.z;z<room.z+room.h;z++)
            for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const id=map[x+dx]?.[z+dz]?.roomId;
                if(section.cors.some(c=>c.id===id)) touch.add(id);
            }
        if(touch.size!==1||!touch.has(room.hallId)) throw new Error('Room '+room.id+' touches wrong roka: '+[...touch]);
    }
    const [a,b]=section.gate,[c,d]=section.link;
    if(a[0]!==b[0]||c[1]!==d[1]||a[0]===c[0]) throw new Error('Gates do not make a perpendicular turn');
    // Every explicit portal must survive stamping and meet the declared other room. [REF#DG-01495]
    const doors=[{owner:9,to:5,tiles:section.gate},{owner:9,to:10,tiles:section.link},
        ...section.rooms.map(r=>({owner:r.id,to:r.hallId,tiles:[r.door]})),...section.extraDoors];
    for(const door of doors) for(const p of door.tiles) {
        if(cell(p)?.type!=='shoji_door'||cell(p)?.roomId!==door.owner ||
           ![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>cell([p[0]+dx,p[1]+dz])?.roomId===door.to))
            throw new Error('Castle portal absent or points at wrong room: '+p);
    }
    return {compilerVersion:SECTION1_COMPILER_VERSION,templateId:section.plan.templateId,
        layoutSeed:section.layoutSeed,orientation:section.orientation,normalRooms:normals.length,
        cycle,gateWidths:[section.gate.length,section.link.length],oneRoka:true,routes};
}
