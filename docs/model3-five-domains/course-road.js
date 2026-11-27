import * as T from 'three';

// The actor positions and pavement use the same arc-length road function.
export function buildCourseRoad(run){
  const root=new T.Group(),at=run.road,materials=new Map();
  function material(tint){
    if(!materials.has(tint))materials.set(tint,new T.MeshBasicMaterial({color:tint,side:T.DoubleSide}));
    return materials.get(tint);
  }
  function strip(l,r,start,end,y,c){
    const pts=[],indices=[],count=Math.max(1,Math.ceil((end-start)/2));
    for(let i=0;i<=count;i++){
      for(const side of [l,r]){const p=at(start+(end-start)*i/count,side);pts.push(p.x,(p.y||0)+y,p.z);}
      const j=i*2;if(i)indices.push(j-2,j-1,j,j,j-1,j+1);
    }
    const mesh=new T.BufferGeometry();mesh.setAttribute('position',new T.Float32BufferAttribute(pts,3));mesh.setIndex(indices);
    root.add(new T.Mesh(mesh,material(c)));
  }
  function put(geo,c,s,l,y){
    const p=at(s,l),m=new T.Mesh(geo,material(c));m.position.set(p.x,(p.y||0)+y,p.z);m.rotation.y=p.yaw;root.add(m);return m;
  }
  function box(w,h,d,c,s,l,y){return put(new T.BoxGeometry(w,h,d),c,s,l,y);}
  const white=0xf3f6ef;
  strip(10,-7,-28,158,-.06,0x9bb9a8);strip(5.75,-2.15,-28,158,-.02,0x405465);
  for(const l of [-1.88,5.48])strip(l+.065,l-.065,-28,158,.008,white);
  for(let s=-25;s<152;s+=7)strip(1.87,1.73,s,s+3,.012,white);
  const post=new T.BoxGeometry(.13,.64,.13);
  for(let s=-25;s<155;s+=8)for(const l of [-2.6,6.2])put(post,0xb1cbbf,s,l,.3);
  function sign(s,l,text){
    const p=at(s,l),cv=document.createElement('canvas');cv.width=256;cv.height=112;
    const ctx=cv.getContext('2d'),texture=new T.CanvasTexture(cv);texture.colorSpace=T.SRGBColorSpace;
    const panel=new T.Sprite(new T.SpriteMaterial({map:texture,depthWrite:false}));
    panel.scale.set(2.4,1.05,1);panel.position.set(p.x,(p.y||0)+2.1,p.z);root.add(panel);box(.10,1.8,.10,0x758b98,s,l,.9);
    let last;
    function set(value){
      if(value===last)return;last=value;ctx.fillStyle='#143145';ctx.fillRect(0,0,256,112);
      ctx.fillStyle='#ecfcff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 49px sans-serif';ctx.fillText(value,128,57,246);texture.needsUpdate=true;
    }
    set(text);return set;
  }
  let update=()=>{};
  switch(run.prop){
    case 'signal':{
      strip(1.65,-1.72,5,5.32,.025,white);
      const lamp=put(new T.SphereGeometry(.40,16,12),0xde5053,run.mark,-2.8,2.5);
      box(.12,2.3,.12,0x546770,run.mark,-2.8,1.15);
      update=a=>{lamp.material=material(a.light?0x51df84:0xde5053);};break;
    }
    case 'stop':
      strip(1.74,-1.82,run.mark,run.mark+.36,.025,white);
      for(let l=-1.6;l<1.7;l+=.64)strip(l+.34,l,run.mark+1.1,run.mark+3.3,.025,white);
      sign(run.mark,-2.85,'停车线');break;
    case 'distance':for(let s=0;s<=110;s+=10){strip(-1.1,-1.68,s,s+.15,.025,white);sign(s,-3.0,s+' m');}break;
    case 'hill':sign(9,-2.8,'上坡');sign(37,-2.8,'13%');sign(65,-2.8,'平路');break;
    case 'landmark':for(const s of [18,45,69]){sign(s,-2.9,s+' m');strip(1.6,-1.7,s,s+.15,.025,0x85d4ec);}break;
    case 'works':
      sign(20,-2.9,'前方施工');
      for(let s=run.mark-11;s<run.mark+18;s+=2.5){const l=-1.8+.7*Math.min(1,(s-run.mark+11)/12);put(new T.ConeGeometry(.24,.8,10),0xfc892e,s,l,.40);}
      break;
    case 'screen':box(12,2.3,.22,0x8897a2,31,2,1.15);break;
    case 'crossing':{
      box(4.2,.045,36,0x405465,run.mark,0,-.004);
      strip(1.7,-1.75,run.mark-5,run.mark-4.8,.035,white);sign(run.mark-6,-2.9,'让行');break;
    }
    case 'limit':{
      const set=sign(run.mark,-2.85,'40');update=a=>set(String(a.limit));break;
    }
  }
  return {root,update,dispose(){
    const gs=new Set(),ms=new Set(materials.values());root.traverse(o=>{if(o.isMesh)gs.add(o.geometry);if(o.material)ms.add(o.material);});
    for(const g of gs)g.dispose();for(const m of ms){m.map?.dispose();m.dispose();}root.removeFromParent();
  }};
}
