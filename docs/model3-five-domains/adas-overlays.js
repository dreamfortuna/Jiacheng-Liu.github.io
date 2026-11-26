import * as T from 'three';
import {evaluateLab} from './adas-lab.js';

const V = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
const UP=V(0,1,0), FORWARD=V(1,0,0);
const PALETTE={vision:0x218cd0,second:0x28a798,overlap:0xe59c1a,request:0xcd661a,
  feedback:0x8852bd,reference:0x526779,actuation:0x19806f,unknown:0xcf6d31,energy:0xc58213,traffic:0xc16b34};
const CAMERA_IDS=['forward0','forward1','bpL','bpR','repeaterL','repeaterR','backcam'];
const WHEELS=['hubFL','hubFR','hubRL','hubRR'];
const views={
  vision:[
    'vision frame wheels','forward','bpL forward0 repeaterL','forward video ap_video apboard','forward0 forward1'],
  perception:[
    'forward','bpR forward0','forward video ap_video','repeaterL bpL','forward0 apboard ap_video'],
  ego:[
    'wsFL speedFL hcu hubFL hubFR hubRL hubRR','forward0 hubFL hubFR hubRL hubRR','repeaterR hubFL hubFR hubRL hubRR',
    'apboard hubFL hubFR hubRL hubRR speedFL','frame wheels'],
  prediction:[
    'forward frame wheels','bpL repeaterL hubFL hubFR','apboard forward0 hubFL hubFR','apboard rackassy hubFL hubFR',
    'apboard frontdu reardu hubFL hubFR hubRL hubRR'],
  lateral:[
    'apboard epas hubFL hubFR hubRL hubRR','apboard x120 chtrunk epasleg x193',
    'epas x193 x192 rack','rackassy knuckleFL knuckleFR hubFL hubFR','rackassy wheelFL wheelFR hubRL hubRR'],
  longitudinal:[
    'forward hubFL hubFR','screen forward0 hubFL hubFR','booster hcu lineFL calFL discFL speedFL',
    'hcu booster lineFL discFL calFL x151','hcu wsFL speedFL discFL calFL hubFL'],
  supervision:[
    'cabincam seatFL screen forward0','cabincam forward0 apboard seatFL','cabincam screen mcu seatFL',
    'screen spLF seatFL steerwheel','screen seatFL steerwheel pedals'],
  compute:[
    'housing apboard ap_video logicA logicB','lvbat vcfront x120t1 x121t1 apboard pcground','housing apboard pchosefix coolcpu',
    'forward video ap_video apboard','apboard x120 chtrunk epasleg epas'],
};
const directions={vision:[.82,.77,1.08],perception:[.48,1.3,1.05],ego:[.28,1.95,1.03],
  prediction:[.54,1.43,1.84],lateral:[.34,1.25,-1.02],longitudinal:[.64,.94,1.80],
  supervision:[.34,.70,-1.22],compute:[-.73,.46,1.12]};
const caseCamera=(course,index,step)=>course==='vision'&&index===3&&step.module==='vision'&&Boolean(step.scene);

export function overlayScope(courseId,stepIndex,step={},state={}){
  const rows=views[courseId];
  if(!rows)return null;
  const index=Math.min(rows.length-1,Math.max(0,stepIndex|0));
  const roots=rows[index].split(' ');
  const related=Array.isArray(step.related)?step.related:[];
  if(step.id)roots.push(step.id);
  roots.push(...related);
  if(courseId==='prediction'||courseId==='longitudinal'||caseCamera(courseId,index,step))roots.push('wheels');
  if((courseId==='vision'||courseId==='perception')&&CAMERA_IDS.includes(state.camera))roots.push(state.camera);
  if(courseId==='supervision'&&state.variant==='visibility')roots.push('forward0','steerwheel');
  const closeRack=courseId==='lateral'&&index===2;
  const direction=closeRack?[.42,.31,1.24]:courseId==='lateral'?[1.35,.69,.25]:directions[courseId].slice();
  return {include:[...new Set(roots)],overview:false,focus:closeRack?'x193':null,direction};
}

export function overlayLegend(courseId,stepIndex,state={}){
  const i=stepIndex|0,lab=evaluateLab(courseId,state);
  if(!lab)return [];
  const key=(label,color,style='line')=>({label,color:'#'+PALETTE[color].toString(16).padStart(6,'0'),style});
  switch(courseId){
    case 'vision':
      return i===3?[key('前视图像信息流','vision','dash'),key('功能输入关系','request','dash')]:
        [key('简化视锥','vision','fill'),key('水平投影重叠','overlap','fill')];
    case 'perception':
      return [key('视线可达','second'),key('遮挡与未知段','unknown','fill')];
    case 'ego':
      return [key('自车纵轴','actuation'),key('轮速与估计终点','feedback'),key('真实终点参考','reference')];
    case 'prediction':
      return [key(lab.cutin?'切入候选':'保持候选','request'),key(lab.cutin?'保持候选':'切入候选','reference','dash'),
        key('示例邻车 · 道路缩尺','traffic','fill')];
    case 'lateral':
      return i===1||i===2?[key('转向请求关系','request','dash'),key('等效转向方向','actuation')]:
        [key('恒曲率路径','actuation'),key('切线直行参考','reference','dash')];
    case 'longitudinal':
      return i<2?[key('自车速度','actuation'),key(lab.leadMps?'前车速度':'前车静止','vision'),key('示例前车 · 道路缩尺','traffic','fill')]:
        [key('延迟阶段行程','unknown'),key('减速阶段行程','actuation'),key('示例前车 · 道路缩尺','traffic','fill')];
    case 'supervision':
      return i<2?[lab.takeover?key('前向视野受限','unknown','fill'):key('舱内观察区域','vision','fill'),key('响应前行程','overlap','dash')]:
        [key('界面或声音提示','request','dash'),key(lab.takeover?'人工接管关系':'响应前行程',lab.takeover?'actuation':'overlap','dash')];
    case 'compute':
      if(i===1)return [key('低压供电关系','energy','dash'),key('采样至输出的位移','unknown')];
      if(i===2)return [key('导热关系','unknown','dash'),key('冷板与液冷支路','second','dash')];
      return [key(i===4?'课堂采集时段':'图像输入关系','vision',i===4?'line':'dash'),key('计算输出关系','request','dash')];
    default:return [];
  }
}

function clippedPolygon(subject,clip){
  const signed=clip.reduce((a,p,i)=>a+p.x*clip[(i+1)%clip.length].y-clip[(i+1)%clip.length].x*p.y,0);
  const orientation=Math.sign(signed)||1;
  let poly=subject;
  for(let i=0;i<clip.length&&poly.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],edge=b.clone().sub(a);
    const side=p=>orientation*(edge.x*(p.y-a.y)-edge.y*(p.x-a.x));
    const next=[];
    for(let j=0;j<poly.length;j++){
      const p=poly[j],q=poly[(j+1)%poly.length],s=side(p),t=side(q);
      if(s>=0)next.push(p);
      if((s>=0)!==(t>=0))next.push(p.clone().lerp(q,s/(s-t)));
    }
    poly=next;
  }
  return poly;
}

const shifted=(p,dir,n)=>p.clone().addScaledVector(dir,n);
const midpoint=(a,b)=>a.clone().lerp(b,.5);

export class AdasOverlays {
  constructor(view) {
    this.view=view;
    this.frameBounds=null;
    this.group=null;
  }
  clear(){
    if(this.group){
      const geos=new Set(),materials=new Set();
      this.group.traverse(o=>{
        if(o.geometry&&!o.userData.borrowedGeometry)geos.add(o.geometry);
        for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);
        if(o.isInstancedMesh)o.dispose();
      });
      this.group.removeFromParent();
      for(const g of geos)g.dispose();
      for(const m of materials)m.dispose();
    }
    this.group=null;this.frameBounds=null;this.motionPaths=[];this.memo?.clear();this.view.dirty=true;
  }
  show(courseId,stepIndex,state={},step={}){
    this.clear();
    const lab=evaluateLab(courseId,state);
    if(!lab||!this.view.root||!this.view.items.size)return null;
    this.group=new T.Group();this.group.name='教学图层 / '+courseId;
    this.group.userData.teachingOverlay=true;
    this.view.scene.add(this.group);this.memo=new Map();
    const i=Math.min(4,Math.max(0,stepIndex|0));
    const road=courseId==='prediction'||courseId==='longitudinal';
    const carContext=road||caseCamera(courseId,i,step);
    if(carContext||(i===0&&['vision','lateral'].includes(courseId))||(i===4&&courseId==='ego'))this.exterior(carContext);
    this[courseId](i,lab,state,step);
    this.group.traverse(o=>{o.raycast=()=>{};o.userData.teachingOverlay=true;});
    const b=new T.Box3().setFromObject(this.group);
    this.frameBounds=b.isEmpty()?null:{min:b.min.toArray(),max:b.max.toArray()};
    this.view.dirty=true;return this.frameBounds;
  }
  // The courses show the assembled vehicle. Replay each GLB ancestor's actual rest transform so
  // switching from an exploded view during its transition never detaches a teaching mark.
  at(id){
    if(this.memo.has(id))return this.memo.get(id).clone();
    const item=this.view.items.get(id);
    if(!item)throw new Error('讲解图层无法定位装配 '+id);
    const p=V();
    for(let o=item.ob;o;o=o.parent){
      const rest=this.view.items.get(o.userData.seId)?.rest;
      p.multiply(o.scale).applyQuaternion(o.quaternion).add(rest||o.position);
    }
    this.memo.set(id,p);return p.clone();
  }
  part(owner,label){
    const parent=this.view.records.get(owner);
    return parent?.children.find(id=>this.view.records.get(id)?.label===label)||owner;
  }
  exterior(road=false){
    if(!this.view.leafMeshes)return;
    const mats=new Map(),roots=['outer','glass','closures'];
    if(road)roots.push('lf','rf','lr','rr','wheels');
    const palette={ghost:[0x899fa4,.24],paint:[0x567480,.76],glass:[0x24454e,.61],tyre:[0x222d32,.84],rim:[0x74888e,.74],
      trim:[0x33464c,.67],headlamp:[0xe9f2e2,.91],taillamp:[0x9d3733,.83]};
    for(const [id,meshes] of this.view.leafMeshes){
      const root=roots.find(k=>this.view.descendant(id,k));
      if(!root)continue;
      const label=this.view.records.get(id)?.label||'';
      let key='ghost';
      if(road){
        if(/铰链|内板|内饰|调节执行器|内侧、底部|电路板|连接器/.test(label))continue;
        if(root==='wheels'){
          if(label==='轮胎')key='tyre';
          else if(label==='轮辋与轮辐饰面')key='rim';
          else continue;
        }else if(['lf','rf','lr','rr'].includes(root)){
          if(!/光导|外透镜/.test(label))continue;
          key=['lf','rf'].includes(root)?'headlamp':'taillamp';
        }else if(/密封|饰条|下进气口|扩散板|把手/.test(label))key='trim';
        else if(root==='glass'||/侧窗玻璃|镜片/.test(label))key='glass';
        else key='paint';
      }
      if(!mats.has(key)){
        const [color,opacity]=palette[key];
        mats.set(key,new T.MeshStandardMaterial({color,metalness:.20,roughness:.57,
          transparent:true,opacity,depthWrite:false,side:T.FrontSide}));
      }
      // Borrow the model's original triangles. Only the context material belongs to this unpickable layer.
      for(const source of meshes){
        const ob=new T.Mesh(source.geometry,mats.get(key)),chain=[];
        for(let ancestor=source;ancestor;ancestor=ancestor.parent)chain.unshift(ancestor);
        for(const ancestor of chain){
          const rest=this.view.items.get(ancestor.userData.seId)?.rest||ancestor.position;
          ob.matrix.multiply(new T.Matrix4().compose(rest,ancestor.quaternion,ancestor.scale));
        }
        ob.name='自车 · '+label;ob.matrixAutoUpdate=false;ob.renderOrder=['tyre','rim'].includes(key)?-3:key==='glass'?-1:-2;
        ob.userData.borrowedGeometry=true;ob.userData.sourcePart=id;ob.userData.layerKind='vehicle-context';
        this.group.add(ob);
      }
    }
  }
  lens(id){
    const a=this.at(this.part(id,'成像镜片'));
    const d=a.clone().sub(this.at(this.part(id,'图像传感器板')));
    if(d.lengthSq()<1e-11)d.copy(id==='backcam'?V(-1,0,0):FORWARD);
    return {a,d:d.normalize()};
  }
  add(name,g,mat,kind='geometry'){
    const obj=new T.Mesh(g,mat);obj.name=name;obj.userData.layerKind=kind;this.group.add(obj);return obj;
  }
  material(color,opacity=1){
    return new T.MeshBasicMaterial({color,opacity,transparent:opacity<1,depthWrite:false,toneMapped:false});
  }
  line(name,pts,color,{dashed=false,r=.003,opacity=1,arrow=false,radiusLimit=.03,kind}={}){
    if(pts.length<2)return;
    const points=pts.filter((p,i)=>!i||p.distanceToSquared(pts[i-1])>1e-13);
    if(points.length<2)return;
    if((kind==='trajectory'&&!dashed)||name.startsWith('功能信息流')||name==='恒曲率目标轨迹'||name.startsWith('课堂匀减速阶段')){
      this.motionPaths.push({name,points});
    }
    const material=this.material(color,opacity), segments=[];
    const total=points.slice(1).reduce((v,p,i)=>v+p.distanceTo(points[i]),0);
    if(total<1e-7){material.dispose();return;}
    const radius=Math.min(r,total*radiusLimit);
    const period=Math.max(radius*12,total/23);
    let traveled=0;
    for(let j=1;j<points.length;j++){
      const a=points[j-1],b=points[j],d=b.clone().sub(a),length=d.length();d.normalize();
      if(!dashed)segments.push([a,b]);else{
        for(let k=Math.floor(traveled/period);k*period<traveled+length;k++){
          const lo=Math.max(0,k*period-traveled),hi=Math.min(length,(k+.61)*period-traveled);
          if(hi-lo>1e-7)segments.push([shifted(a,d,lo),shifted(a,d,hi)]);
        }
      }
      traveled+=length;
    }
    if(!segments.length){material.dispose();return;}
    const cylinders=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,7),material,segments.length);
    cylinders.name=name;cylinders.userData.layerKind=kind||(dashed?'functional-information':'teaching-geometry');
    const matrix=new T.Matrix4(),orient=new T.Quaternion();
    for(let i=0;i<segments.length;i++){
      const [a,b]=segments[i],v=b.clone().sub(a),len=v.length();
      orient.setFromUnitVectors(UP,v.normalize());
      cylinders.setMatrixAt(i,matrix.compose(midpoint(a,b),orient,V(radius,len,radius)));
    }
    cylinders.computeBoundingBox();cylinders.computeBoundingSphere();
    this.group.add(cylinders);
    if(arrow){
      const a=points[points.length-2],b=points[points.length-1],d=b.clone().sub(a).normalize(),h=Math.min(radius*8,total*.14);
      const head=this.add(name+' · 方向',new T.ConeGeometry(h*.30,h,10),material,'arrow');
      head.quaternion.setFromUnitVectors(UP,d);head.position.copy(shifted(b,d,-h/2));
    }
  }
  dot(name,p,r,color,dim=false){
    const obj=this.add(name,new T.SphereGeometry(r,12,8),this.material(color,dim ? .47 : 1),'sample');obj.position.copy(p);
  }
  surface(name,points,color,opacity=.12){
    if(points.length<3)return;
    const positions=[];for(let k=1;k<points.length-1;k++)for(const pt of [points[0],points[k],points[k+1]])positions.push(pt.x,pt.y,pt.z);
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    const mat=this.material(color,opacity);mat.side=T.DoubleSide;
    const o=this.add(name,geo,mat,'illustrative-surface');o.renderOrder=1;
  }
  relation(a,b,color=PALETTE.request,lift=.045){
    const start=typeof a==='string'?this.at(a):a,end=typeof b==='string'?this.at(b):b;
    const dist=start.distanceTo(end);
    if(dist<.0001)return;
    const mid=midpoint(start,end);mid.y+=Math.min(lift,dist*.19);
    const pts=new T.QuadraticBezierCurve3(start,mid,end).getPoints(12);
    this.line('功能信息流 '+(typeof a==='string'?a:'观测点')+' → '+(typeof b==='string'?b:'示意点'),pts,color,
      {dashed:true,arrow:true,r:T.MathUtils.clamp(dist*.008,.00045,.0075)});
  }
  frustum(id,len,color,width=.46,height=.23){
    const {a,d}=this.lens(id);
    const side=V().crossVectors(d,UP).normalize(),vertical=V().crossVectors(side,d).normalize();
    const c=shifted(a,d,len),w=len*width,h=len*height;
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([s,t])=>shifted(shifted(c,side,s*w),vertical,t*h));
    for(let k=0;k<4;k++){
      this.surface('简化视锥 '+id,[a,corners[k],corners[(k+1)%4]],color,.075);
      this.line('视锥边 '+id,[a,corners[k]],color,{r:len*.0029,opacity:.84});
    }
    this.line('视锥远平面 '+id,[...corners,corners[0]],color,{r:len*.0035,opacity:.88});
    const footprint=[a,shifted(c,side,w),shifted(c,side,-w)].map(p=>new T.Vector2(p.x,p.z));
    return {a,d,c,side,footprint};
  }
  overlap(a,b){
    const poly=clippedPolygon(a.footprint,b.footprint);
    if(poly.length<3)return;
    const y=(a.c.y+b.c.y)*.5;
    const p=poly.map(q=>V(q.x,y,q.y));
    this.surface('两视锥水平投影的重叠',p,PALETTE.overlap,.27);
    this.line('重叠区边缘',[...p,p[0]],PALETTE.overlap,{r:.0024});
  }
  axes(){
    const [fl,fr,rl,rr]=WHEELS.map(n=>this.at(n));
    const front=midpoint(fl,fr),rear=midpoint(rl,rr);
    const x=front.clone().sub(rear);x.y=0;x.normalize();
    const l=fl.clone().sub(fr);l.y=0;l.normalize();
    return {front,rear,origin:midpoint(front,rear),x,l};
  }
  road(left,right,end){
    const {origin,x,l}=this.axes();
    const wheelRadius=this.view.records.get('wheelFL').half[1];
    origin.y-=wheelRadius;
    const at=(forward,side,height=0)=>shifted(shifted(shifted(origin,x,forward),l,side),UP,height);
    const start=-2.58,margin=.14,y=-.034;
    const corners=[[start+margin,right],[end-margin,right],[end,right+margin],[end,left-margin],
      [end-margin,left],[start+margin,left],[start,left-margin],[start,right+margin]];
    const positions=[];
    for(let i=1;i<corners.length-1;i++){
      for(const j of [0,i,i+1])positions.push(...at(...corners[j],y).toArray());
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    const mat=this.material(0xcbd7d7);mat.side=T.DoubleSide;mat.depthWrite=true;
    const bed=this.add('缩尺道路',geo,mat,'road');bed.renderOrder=-5;
    for(const offset of [right+.12,left-.12]){
      this.line('车道路缘',[at(start+.13,offset,-.016),at(end-.13,offset,-.016)],0x8b9fa2,{r:.013});
    }
    if(left>2)this.line('车道分界线',[at(start+.10,1.22,-.010),at(end-.10,1.22,-.010)],0xffffff,{r:.028,dashed:true,kind:'road-mark'});
    this.footprintShadow('自车接地阴影',at(-.03,0,-.018),x,l,2.14,.85);
    return {at,x,l};
  }
  footprintShadow(name,center,x,l,length,width){
    const pts=Array.from({length:32},(_,i)=>{
      const angle=i*Math.PI/16;
      return shifted(shifted(center,x,length*Math.cos(angle)),l,width*Math.sin(angle));
    });
    const geo=new T.BufferGeometry().setFromPoints(pts);
    const indices=[];
    for(let i=1;i<pts.length-1;i++)indices.push(0,i,i+1);
    geo.setIndex(indices);
    const material=this.material(0x52656a,.19);material.side=T.DoubleSide;
    this.add(name,geo,material,'contact-shadow').renderOrder=-3;
  }
  // This unbranded traffic symbol is authored in its own local coordinates. It is never a GLB part.
  trafficCar(name,road,forward,side,yaw=0){
    const center=road.at(forward,side),ahead=road.x.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(road.l,Math.sin(yaw));
    const left=V().crossVectors(UP,ahead).normalize(),right=left.clone().negate();
    const car=new T.Group();car.name=name;car.userData.layerKind='traffic-actor';
    car.matrix.makeBasis(ahead,UP,right).setPosition(center);car.matrixAutoUpdate=false;this.group.add(car);
    this.footprintShadow(name+'接地阴影',shifted(center,UP,-.016),ahead,left,1.31,.57);
    const finish=(color,metalness=.13,roughness=.53)=>new T.MeshStandardMaterial({color,metalness,roughness});
    const paint=finish(PALETTE.traffic,.35),windows=finish(0x1c3a49,.30,.22),rubber=finish(0x172126,0,.91);
    const rim=finish(0xa8b4b6,.62,.38),hub=finish(0x414d53,.30),white=this.material(0xf4f3d6),red=this.material(0x9d352d);
    const put=(part,geometry,material,position)=>{
      const ob=new T.Mesh(geometry,material);ob.name=name+' · '+part;ob.userData.layerKind='traffic-detail';
      if(position)ob.position.set(...position);
      car.add(ob);return ob;
    };
    const barrel=(part,geometry,material,position)=>{const ob=put(part,geometry,material,position);ob.rotation.x=Math.PI/2;};
    const block=(part,size,material,position)=>put(part,new T.BoxGeometry(...size),material,position);
    const skin=(part,stations,section,material)=>{
      const vertices=[],indices=[],rings=stations.map(([x,w,top])=>section(w,top).map(([z,y])=>[x,y,z]));
      for(const ring of rings)for(const pt of ring)vertices.push(...pt);
      const n=rings[0].length;
      for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++){
        const a=i*n+j,b=i*n+(j+1)%n,c=a+n,d=b+n;
        indices.push(a,b,d,a,d,c);
      }
      for(const end of [0,rings.length-1]){
        const ring=rings[end],idx=vertices.length/3;
        vertices.push(...ring.reduce((sum,v)=>sum.map((s,k)=>s+v[k]/n),[0,0,0]));
        for(let j=0;j<n;j++){
          const a=end*n+j,b=end*n+(j+1)%n;
          if(end===0)indices.push(idx,b,a);else indices.push(idx,a,b);
        }
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
      return put(part,g,material);
    };
    skin('通用车身',[[-1.36,.43,.44],[-1.22,.56,.53],[-.86,.60,.56],[-.34,.61,.57],
      [.44,.61,.55],[.97,.57,.50],[1.22,.52,.45],[1.34,.44,.39]],
      (w,h)=>[[-w*.86,.235],[-w,.32],[-w,h-.045],[-w*.86,h],[w*.86,h],[w,h-.045],[w,.32],[w*.86,.235]],paint);
    skin('座舱和车窗',[[-.95,.44,.55],[-.64,.52,.76],[-.41,.50,.93],[-.22,.49,.965],
      [.22,.48,.95],[.46,.49,.83],[.78,.48,.55]],
      (w,h)=>[[-w,.52],[-w*.96,.52+(h-.52)*.61],[-w*.73,h],[w*.73,h],[w*.96,.52+(h-.52)*.61],[w,.52]],windows);
    skin('车顶',[[-.44,.33,.927],[-.23,.358,.974],[.23,.34,.959],[.31,.32,.925]],
      (w,h)=>[[-w,h-.018],[-w,h],[w,h],[w,h-.018]],paint);
    for(const sign of [-1,1]){
      const pillar=block('座舱中柱',[.060,.285,.024],rubber,[-.12,.718,sign*.455]);
      pillar.rotation.x=sign*(-.22);
      for(const end of [-1,1]){
        const offset=sign*.345;
        block(end===1?'前灯':'尾灯',[.026,.069,.17],end===1?white:red,[end*(end===1?1.319:1.334),.384,offset]);
      }
    }
    for(const axle of [-.84,.83])for(const s of [-1,1]){
      const tyre=new T.CylinderGeometry(.248,.248,.13,24);
      barrel('轮胎',tyre,rubber,[axle,.248,s*.555]);
      barrel('轮辋',new T.CylinderGeometry(.154,.154,.026,20),rim,[axle,.248,s*.627]);
      barrel('轮毂',new T.CylinderGeometry(.075,.075,.012,12),hub,[axle,.248,s*.646]);
    }
  }
  wireMarker(name,p,x,l,length,width,color){
    const corners=[[-1,-1],[-1,1],[1,1],[1,-1]].map(([a,b])=>shifted(shifted(p,x,a*length/2),l,b*width/2));
    this.surface(name,corners,color,.16);
    this.line(name+'边界',[...corners,corners[0]],color,{r:Math.max(.0012,width*.031)});
  }
  vision(i,m,state){
    const ranges=i===0?[2.60,3.35]:i===1?[.145,.22]:[.90,1.37];
    const len=ranges[m.variant==='far'?1:0];
    const selected=CAMERA_IDS.includes(state.camera)?state.camera:(i===2?'bpL':'forward0');
    const one=this.frustum(selected,len,PALETTE.vision,selected==='bpL' ? .77 : .50);
    if(i!==3){
      const second=this.frustum(selected==='forward0'?'forward1':'forward0',len*.96,PALETTE.second,.58);
      this.overlap(one,second);
    }else{
      this.relation('forward','ap_video',PALETTE.vision);this.relation('ap_video','apboard',PALETTE.request);
    }
    const target=shifted(one.c,one.side,-len*.15);
    const measured=shifted(target,one.side,len*m.pixelShift*.020);
    this.dot('首帧目标中心',target,len*.019,PALETTE.reference);
    this.dot('次帧目标中心',measured,len*.014,PALETTE.overlap);
    this.line('采样投影位移',[target,measured],PALETTE.overlap,{r:len*.004,arrow:true});
    if(i===0)this.frustum('repeaterL',len*.61,PALETTE.second,.50);
  }
  perception(i,m,state){
    const chosen=CAMERA_IDS.includes(state.camera)?state.camera:({1:'bpR',3:'repeaterL'}[i]||'forward0');
    const f=this.frustum(chosen,1.05,PALETTE.vision,.28,.16);
    const horizontal=f.d.clone();horizontal.y=0;horizontal.normalize();
    const scale=.050, lateral=f.side, o=f.a;
    const p=(depth,offset)=>shifted(shifted(o,horizontal,depth*scale),lateral,offset*scale);
    const ob0=p(10,m.centerM-m.widthM/2),ob1=p(10,m.centerM+m.widthM/2);
    this.surface('示例遮挡物',[shifted(ob0,UP,-.071),shifted(ob1,UP,-.071),shifted(ob1,UP,.071),shifted(ob0,UP,.071)],PALETTE.unknown,.58);
    this.line('几何可见的观察线',[p(20,-4),p(20,4)],PALETTE.second,{r:.0065});
    if(m.unknownM>0){
      this.surface('未知观测区域',[ob0,ob1,p(20,m.clippedRightM),p(20,m.clippedLeftM)],PALETTE.unknown,.18);
      this.line('观察线的未知段',[p(20,m.clippedLeftM),p(20,m.clippedRightM)],PALETTE.unknown,{r:.010});
    }
    for(const bound of [m.leftM,m.rightM])this.line('遮挡边界射线',[o,p(20,bound)],PALETTE.reference,{dashed:true,r:.0022});
    if(i===2)this.relation('video','ap_video',PALETTE.vision);
    if(i===3||i===1)this.overlap(f,this.frustum(i===3?'bpL':'forward0',.82,PALETTE.second,.72,.15));
    if(i===4)this.relation('ap_video','apboard',PALETTE.request);
  }
  ego(i,m){
    const {origin,rear,x,l}=this.axes();
    this.line('自车纵轴',[origin,shifted(origin,x,.79)],PALETTE.actuation,{r:.008,arrow:true});
    this.line('自车左向横轴',[origin,shifted(origin,l,.48)],PALETTE.feedback,{r:.007,arrow:true});
    if(i===4)this.line('自车上轴',[origin,shifted(origin,UP,.36)],PALETTE.reference,{r:.006,arrow:true});
    const wheels=i===0?['hubFL']:WHEELS;
    for(const id of wheels){
      const center=this.at(id);
      const side=id.endsWith('L')?1:-1;
      const axisPoint=shifted(center,l,side*.063);
      const arc=[];
      for(let j=0;j<=20;j++){
        const a=.38+(j/20)*1.8*(m.measuredMps/12);
        arc.push(shifted(shifted(axisPoint,x,Math.sin(a)*.19),UP,Math.cos(a)*.19));
      }
      this.line('轮速观测 '+id,arc,PALETTE.feedback,{r:.005,arrow:true});
    }
    const scale=.016,track=shifted(rear,l,-.22),reference=shifted(track,x,120*scale),estimate=shifted(reference,x,m.errorM*scale);
    this.line('参考终点',[shifted(reference,l,-.052),shifted(reference,l,.052)],PALETTE.reference,{r:.006});
    this.line('积分位置示例',[track,estimate],PALETTE.feedback,{dashed:true,r:.005,arrow:true});
    this.dot('按轮速估计的终点',estimate,.022,PALETTE.feedback);
    if(m.anchor)this.dot('中段校准锚点',midpoint(track,reference),.026,PALETTE.second);
    if(i===0)this.relation('speedFL','hcu',PALETTE.feedback);
    if(i===1||i===2)this.line('视觉观测参考',[this.lens(i===1?'forward0':'repeaterR').a,origin],PALETTE.vision,{dashed:true,r:.003});
    if(i===3)this.relation('speedFL','apboard',PALETTE.feedback);
  }
  prediction(i,m){
    const carX=1.48+m.forwardM*.060;
    const road=this.road(3.65,-1.29,Math.max(7.02,carX+1.54));
    // Compress the driving distance while preserving separate, legible lanes around the full-size GLB.
    const xy=(f,y,height=.035)=>road.at(1.48+f*.060,y*(2.45/3.6),height);
    const candidate=t=>{const u=T.MathUtils.clamp(t/3,0,1);return 3.6*(1-3*u*u+2*u*u*u);};
    const keep=[],merge=[];
    for(let j=0;j<=30;j++){const t=j/30*4;keep.push(xy(20*t,m.keepYM));merge.push(xy(20*t,candidate(t)));}
    this.line('保持车道候选',keep,m.cutin?PALETTE.reference:PALETTE.request,{dashed:m.cutin,r:m.cutin ? .036 : .045,arrow:true,kind:'trajectory'});
    this.line('切入候选',merge,m.cutin?PALETTE.request:PALETTE.reference,{dashed:!m.cutin,r:m.cutin ? .045 : .036,arrow:true,kind:'trajectory'});
    const u=T.MathUtils.clamp(m.horizonS/3,0,1);
    const yaw=m.cutin?-Math.atan((6*u-6*u*u)*.20):0;
    this.trafficCar('示例邻车',road,carX,m.selectedYM*(2.45/3.6),yaw);
    const initial=xy(0,m.keepYM);
    this.line('初始观测车位横线',[shifted(initial,road.l,-.28),shifted(initial,road.l,.28)],PALETTE.vision,{r:.028});
    const other=xy(m.forwardM,m.cutin?m.keepYM:m.candidateYM);
    this.dot('同一时刻的另一候选位置',other,.078,PALETTE.reference);
    if(i===0||i===1)this.line('视觉测量方向',[this.lens(i===0?'forward0':'bpL').a,initial],PALETTE.vision,{dashed:true,r:.014});
    if(i===2)this.relation('forward0','apboard',PALETTE.vision);
    if(i===3)this.relation('apboard','rackassy',PALETTE.request);
    if(i===4)this.relation('apboard','rearinv',PALETTE.request);
  }
  lateral(i,m){
    const {rear,front,x,l}=this.axes();
    // The X193 step uses a small orientation glyph at the gear, keeping the connector in view.
    if(i===1||i===2){
      if(i===1){
        this.relation('apboard','x120');
        this.relation('x120','x193',PALETTE.request);
      }else{
        this.relation('x193t2','epsctrl',PALETTE.request);
        this.relation('x193t3','epsctrl',PALETTE.request);
      }
      const anchor=this.at(i===1?'x120':'epsctrl'),v=shifted(anchor,UP,.025);
      const r=i===1 ? .042 : .077,angle=m.steeringDeg*Math.PI/180;
      this.line('等效转角参考方向',[v,shifted(v,x,r)],PALETTE.reference,{r:.00085});
      const direction=x.clone().multiplyScalar(Math.cos(angle)).addScaledVector(l,Math.sin(angle));
      this.line('课堂等效转角方向',[v,shifted(v,direction,r)],PALETTE.actuation,{r:.001,arrow:true});
      this.dot('有符号曲率示意',shifted(v,l,m.curvaturePerM*.65),.0027,PALETTE.overlap);
      return;
    }
    const base=rear.clone();base.y-=.20;
    const scale=.230; // Road distances use a common display scale along both ground axes.
    const p=(f,y)=>shifted(shifted(base,x,f*scale),l,y*scale);
    const curved=[];
    for(let j=0;j<=32;j++){
      const a=18*j/(32*m.radiusM);
      curved.push(p(m.radiusM*Math.sin(a),m.sign*m.radiusM*(1-Math.cos(a))));
    }
    this.line('切线直行参考',[base,p(18,0)],PALETTE.reference,{dashed:true,r:.0047});
    this.line('恒曲率目标轨迹',curved,PALETTE.actuation,{r:.008,arrow:true});
    const delta=m.steeringDeg*Math.PI/180;
    const fwd=x.clone().multiplyScalar(Math.cos(delta)).addScaledVector(l,Math.sin(delta));
    for(const id of ['hubFL','hubFR']){
      const hub=this.at(id);
      this.line('前轮等效行进方向 '+id,[hub,shifted(hub,fwd,.34)],PALETTE.actuation,{r:.006,arrow:true});
    }
    if(i===0)this.relation('apboard','epas',PALETTE.request);
    if(i===3)this.relation('epsctrl','rack',PALETTE.actuation);
    if(i===4)this.line('模型前轴',[this.at('hubFL'),front,this.at('hubFR')],PALETTE.feedback,{dashed:true,r:.004});
  }
  longitudinal(i,m){
    const {origin,x}=this.axes(),front=this.view.records.get('frontbumper');
    const nose=this.at(front.id).sub(origin).dot(x)+Math.abs(x.x)*front.half[0]+Math.abs(x.z)*front.half[2],scale=.057;
    // Gap is bumper-to-bumper. The travel ruler uses the identical road-distance compression.
    const leadRear=nose+m.gapM*scale,leadCenter=leadRear+1.36;
    const road=this.road(1.43,-1.67,Math.max(leadCenter+1.65,nose+m.stoppingM*scale+.38));
    const at=(distance,side=0,h=.050)=>road.at(nose+distance*scale,side,h);
    this.trafficCar('示例前车',road,leadCenter,0);
    const gapStart=at(0,.68),gapEnd=at(m.gapM,.68);
    this.line('到前车的初始净间距',[gapStart,gapEnd],PALETTE.reference,{dashed:true,r:.022,kind:'ruler'});
    for(const p of [gapStart,gapEnd])this.line('净间距端点',[shifted(p,road.l,-.11),shifted(p,road.l,.11)],PALETTE.reference,{r:.020,radiusLimit:.12});
    const leadSpeed=road.at(leadCenter+.51,-.66,.20);
    if(m.leadMps>0)this.line('前车行驶方向',[leadSpeed,shifted(leadSpeed,road.x,m.leadMps*.062)],PALETTE.vision,{r:.037,arrow:true});
    else this.line('前车静止标记',[shifted(leadSpeed,road.l,-.18),shifted(leadSpeed,road.l,.18)],PALETTE.vision,{r:.038,radiusLimit:.12});
    const egoSpeed=road.at(.78,-.98,.27);
    if(m.egoMps>0)this.line('自车速度示意',[egoSpeed,shifted(egoSpeed,road.x,m.egoMps*.062)],PALETTE.actuation,{r:.038,arrow:true});
    if(i===2||i===3){
      this.relation('booster','hcu',PALETTE.request);
      this.relation('hcu','calFL',PALETTE.actuation);
    }
    if(i>=2){
      const base=at(0,-1.19),a=at(m.delayM,-1.19),b=at(m.stoppingM,-1.19);
      this.line('课堂延迟阶段行程',[base,a],PALETTE.unknown,{r:.055,radiusLimit:.13});
      this.line('课堂匀减速阶段行程',[a,b],PALETTE.actuation,{r:.055,radiusLimit:.13});
      const ticks=m.stoppingM?[[base,PALETTE.unknown],[a,PALETTE.actuation],[b,PALETTE.actuation]]:[[base,PALETTE.reference]];
      for(const [end,color] of ticks){
        this.line('行程分段刻度',[shifted(end,road.l,-.13),shifted(end,road.l,.13)],color,{r:.028,radiusLimit:.12});
      }
    }
    if(i===4)this.relation('speedFL','hcu',PALETTE.feedback);
  }
  supervision(i,m){
    const seat=this.at('seatFL');
    const half=this.view.records.get('seatFL').half;
    const head=shifted(seat,UP,half[1]*.70);
    if(i===0||i===1){
      if(m.takeover){
        const c=this.frustum('forward0',.55,PALETTE.unknown,.48,.23);
        this.wireMarker('前向视野受限标记',c.c,c.d,c.side,.08,.18,PALETTE.unknown);
      }else{
        this.frustum('cabincam',.55,PALETTE.vision,.46,.33);
        this.line('舱内观察方向',[this.lens('cabincam').a,head],PALETTE.vision,{dashed:true,r:.004});
        this.dot('驾驶席观察区域',head,.034,PALETTE.vision,true);
      }
    }
    if(i===1)this.relation(m.takeover?'forward0':'cabincam','apboard',PALETTE.vision);
    if(i>=2){
      this.relation(i===3?'spLF':'screen',head,PALETTE.request);
      if(m.takeover)this.relation(head,'steerwheel',PALETTE.actuation);
      else if(i===4)this.relation(head,'screen',PALETTE.actuation);
    }
    const display=this.at('screen'),base=shifted(display,UP,.13),end=shifted(base,FORWARD,m.responseM*.006);
    this.line('从提示到响应的课堂行程',[base,end],PALETTE.overlap,{dashed:true,r:.0037,arrow:true});
    this.dot('课堂响应时刻',end,.011,PALETTE.overlap);
  }
  compute(i,m){
    if(i===0){
      this.relation('ap_video','apboard',PALETTE.vision,.025);
      this.relation('apboard','logicA',PALETTE.request,.009);
      this.relation('apboard','logicB',PALETTE.request,.009);
    }
    if(i===1){
      this.relation('lvbat','vcfront',PALETTE.energy);
      // Fremont SOP8 identifies X011/6 → X120/1 (VBAT-A) and X012/2 → X121/1 (VBAT-B).
      this.relation('vcfront','x120t1',PALETTE.energy);
      this.relation('vcfront','x121t1',PALETTE.energy);
      this.dot('机箱车身地',this.at('pcground'),.013,PALETTE.reference);
    }
    if(i===2){
      const plate=this.at(this.part('housing','中央导热与冷却板'));
      this.relation('apboard',plate,PALETTE.unknown,.022);
      this.relation(plate,'pchoseA',PALETTE.second,.023);
      this.relation('pchoseA','coolcpu',PALETTE.second,.025);
    }
    if(i===3){
      this.relation('forward','ap_video',PALETTE.vision);this.relation('ap_video','apboard',PALETTE.request);
    }
    if(i===4){
      this.relation('apboard','x120',PALETTE.request);this.relation('x120','x193',PALETTE.request);
    }
    const anchor=this.at('apboard'),p=shifted(anchor,UP,.042);
    const displayScale=(i===0||i===2) ? .015 : .048;
    const end=shifted(p,FORWARD,m.ageDistanceM*displayScale);
    this.dot('采样位置',p,.005,PALETTE.vision);
    this.dot('输出时对应的位置',end,.006,PALETTE.unknown);
    if(m.ageDistanceM>0){
      const a=p.clone().lerp(end,m.captureMs/m.latencyMs);
      const b=p.clone().lerp(end,(m.captureMs+m.computeMs)/m.latencyMs);
      this.line('采集时段',[p,a],PALETTE.vision,{r:.0021});
      this.line('计算时段',[a,b],PALETTE.request,{r:.0021});
      this.line('输出时段',[b,end],PALETTE.feedback,{r:.0021,arrow:true});
    }
  }
}
