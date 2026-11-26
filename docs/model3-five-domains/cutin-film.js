import * as T from 'three';
import {AdasOverlays} from './adas-overlays.js';
import {duration,roadPose,sample,tractionSample,driverSample} from './cutin-motion.js';
import {films,palette,lessonReadout,transit,packetPosition} from './film-lessons.js';
import {VehicleCutaway} from './vehicle-cutaway.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const el=id=>document.getElementById(id);
const color=(value,opacity=1)=>new T.MeshBasicMaterial({color:value,transparent:opacity<1,opacity,depthWrite:opacity===1,side:T.DoubleSide});
const radToDeg=T.MathUtils.radToDeg;
// Stretch the observation-to-actuation interval while keeping a single continuous clock.
const slowStart=1.8,slowEnd=3.35;
const screenTime=t=>Math.min(t,slowStart)/.55+Math.max(0,Math.min(t,slowEnd)-slowStart)/.18+Math.max(0,t-slowEnd)/.55;
const slowIn=screenTime(slowStart),slowOut=screenTime(slowEnd);
const simTime=u=>Math.min(u,slowIn)*.55+Math.max(0,Math.min(u,slowOut)-slowIn)*.18+Math.max(0,u-slowOut)*.55;

function roadStrip(group,left,right,lo,hi,height,material){
  const pts=[],indices=[],count=Math.ceil((hi-lo)/2);
  for(let i=0;i<=count;i++){
    const s=lo+(hi-lo)*i/count;
    for(const l of [left,right]){const p=roadPose(s,l);pts.push(p.x,height,p.z);}
    if(i){const j=i*2;indices.push(j-2,j-1,j,j,j-1,j+1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));g.setIndex(indices);
  group.add(new T.Mesh(g,material));
}
function buildRoad(scene){
  const markings=color(0xf3f6ef),edge=color(0xb1cbbf);
  roadStrip(scene,9,-6,-28,158,-.04,color(0x9bb9a8));
  roadStrip(scene,5.75,-2.15,-28,158,-.02,color(0x405465));
  for(const l of [-1.88,5.48])roadStrip(scene,l+.065,l-.065,-28,158,.005,markings);
  for(let s=-25;s<152;s+=7)roadStrip(scene,1.87,1.73,s,s+3,.008,markings);
  const post=new T.BoxGeometry(.14,.64,.14);
  for(let s=-25;s<155;s+=8)for(const l of [-2.6,6.2]){
    const p=roadPose(s,l),m=new T.Mesh(post,edge);m.position.set(p.x,.29,p.z);scene.add(m);
  }
}
function lamp(parent,position,c,r=.09){
  const mat=color(c);mat.depthTest=false;
  const obj=new T.Mesh(new T.SphereGeometry(r,12,8),mat);
  obj.position.copy(position);obj.renderOrder=12;parent.add(obj);return obj;
}
function signal(parent,points,tint){
  const path=new T.CatmullRomCurve3(points),mat=color(tint,.88);mat.depthTest=false;
  const wire=new T.Mesh(new T.TubeGeometry(path,20,.033,6,false),mat);
  const dot=lamp(wire,points[0],0xffffff,.105);wire.renderOrder=10;parent.add(wire);
  return phase=>{wire.visible=phase>=0;if(wire.visible)dot.position.copy(path.getPointAt(packetPosition(phase)));};
}

function trace(scene,tint,dashed=false){
  const positions=new T.BufferAttribute(new Float32Array(25*3),3);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',positions);
  const lengths=new T.BufferAttribute(new Float32Array(25),1);
  if(dashed)geometry.setAttribute('lineDistance',lengths);
  const material=dashed?new T.LineDashedMaterial({color:tint,dashSize:.4,gapSize:.25}):new T.LineBasicMaterial({color:tint});
  material.depthTest=false;
  const line=new T.Line(geometry,material);line.frustumCulled=false;line.renderOrder=8;scene.add(line);
  return (visible,pointAt)=>{
    line.visible=visible;if(!visible)return;
    let length=0,prev;
    for(let i=0;i<positions.count;i++){
      const p=pointAt(i/(positions.count-1));positions.setXYZ(i,p.x,.10,p.z);
      if(dashed){if(prev)length+=Math.hypot(p.x-prev.x,p.z-prev.z);lengths.setX(i,length);}
      prev=p;
    }
    positions.needsUpdate=true;if(dashed)lengths.needsUpdate=true;
  };
}

export class CutinFilm {
  constructor(view){
    this.view=view;this.t=0;this.scene=new T.Scene();
    this.scene.environment=view.scene.environment;
    this.scene.add(new T.HemisphereLight(0xffffff,0x899ba6,2.1));
    const sun=new T.DirectionalLight(0xfff5e5,2.6);sun.position.set(-8,14,7);this.scene.add(sun);
    this.camera=new T.OrthographicCamera(-15,15,10,-10,.1,250);
    this.frontView=new T.PerspectiveCamera(42,16/9,.1,180);buildRoad(this.scene);
    const builder=new AdasOverlays(view);builder.memo=new Map();builder.group=new T.Group();
    builder.exterior(true);
    this.ego=new T.Group();this.scene.add(this.ego);
    const {origin}=builder.axes();
    const wheelRadius=view.records.get('wheelFL').half[1],floor=origin.y-wheelRadius;
    const body=builder.group;body.position.set(-origin.x,-floor,-origin.z);this.ego.add(body);
    this.wheels=[];
    for(const key of ['wheelFL','wheelFR','wheelRL','wheelRR']){
      const hub=builder.at(key),pivot=new T.Group(),spin=new T.Group();
      pivot.position.copy(hub);body.add(pivot);pivot.add(spin);
      for(const mesh of body.children.slice()){
        const id=mesh.userData.sourcePart;
        if(!id||!view.descendant(id,key))continue;
        mesh.matrix.premultiply(new T.Matrix4().makeTranslation(-hub.x,-hub.y,-hub.z));
        spin.add(mesh);
      }
      this.wheels.push({pivot,spin,front:key.startsWith('wheelF')});
    }
    body.traverse(m=>{
      if(!m.isMesh)return;
      m.material.opacity=1;m.material.transparent=false;m.material.depthWrite=true;
    });
    builder.group=new T.Group();
    builder.trafficCar('邻车',{at:()=>V(),x:V(1,0,0),l:V(0,0,-1)},0,0);
    this.neighbor=builder.group.children.find(o=>o.userData.layerKind==='traffic-actor');
    this.neighbor.matrixAutoUpdate=true;this.neighbor.scale.setScalar(1.67);this.scene.add(this.neighbor);
    const local=id=>builder.at(id).sub(V(origin.x,floor,origin.z));
    const lens=local('forward0'),board=local('apboard'),rack=local('epas'),brake=local('hcu');
    const sideLens=builder.lens('bpL'),dir=sideLens.d.clone();dir.y=0;dir.normalize();
    const sideEnd=dir.clone().multiplyScalar(8),across=V(-dir.z,0,dir.x).multiplyScalar(3.3);
    const sideFan=new T.BufferGeometry().setFromPoints([V(),sideEnd.clone().add(across),sideEnd.clone().sub(across)]);
    this.sideCone=new T.Mesh(sideFan,color(0xb294ff,.19));this.sideCone.position.copy(local('bpL'));this.ego.add(this.sideCone);
    this.futureKeep=trace(this.scene,0xffcb55,true);this.futureMerge=trace(this.scene,0x62ecff);
    this.history=trace(this.scene,0xb39bff);
    this.sensor=lamp(this.ego,lens,0x4ae6ff);
    const fan=new T.BufferGeometry().setFromPoints([V(),V(20,-lens.y+.07,-8.8),V(20,-lens.y+.07,8.8)]);
    this.cone=new T.Mesh(fan,color(0x1ed6ff,.18));this.cone.position.copy(lens);this.ego.add(this.cone);
    this.target=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(4.7,1.8,2.14)),new T.LineBasicMaterial({color:0x19e1e4}));
    this.scene.add(this.target);
    this.chip=lamp(this.ego,board,0xffcf49,.16);
    this.observe=signal(this.ego,[lens,lens.clone().lerp(board,.5).add(V(0,.23,0)),board],0x30deec);
    this.steerLine=signal(this.ego,[board,board.clone().lerp(rack,.5).add(V(0,.25,0)),rack],0xffcb46);
    this.brakeLine=signal(this.ego,[board,brake.clone().add(V(0,.22,0)),brake],0xfd7666);
    this.tailLights=[-.63,.63].map(z=>lamp(this.ego,V(-2.23,.83,z),0xff3329,.14));
    this.wheelRadius=wheelRadius;
    this.cutaway=new VehicleCutaway(view,builder);
  }
  open(t=0,autoplay=true,key='cutin-case'){
    this.key=key;this.cutaway.configure(key);
    this.scenario=key==='drive'?tractionSample:key==='supervision'?driverSample:sample;
    const channels={vision:'观测',steering:'转向 / 运动',braking:'制动',feedback:'反馈',power:'供电 / 电能',cooling:'冷却液',compute:'计算 / 提示'};
    const legend=el('cut-key');legend.replaceChildren();
    for(const kind of new Set(films[key].paths.map(p=>p.kind))){
      const k=document.createElement('span');k.textContent=channels[kind];k.style.setProperty('--channel','#'+palette[kind].toString(16).padStart(6,'0'));legend.append(k);
    }
    el('film-case-meters').hidden=key!=='cutin-case';el('film-topic-meters').hidden=key==='cutin-case';
    el('branch-status').hidden=key!=='cutin-case';
    el('film-topic-meters').replaceChildren();
    if(key!=='cutin-case')for(let i=0;i<4;i++){
      const block=document.createElement('div');block.append(document.createElement('span'),document.createElement('strong'));el('film-topic-meters').append(block);
    }
    ['前视采样','目标跟踪','智驾计算','底盘请求'].forEach((s,i)=>el('film-chain').children[i].textContent=s);
    this.t=t;this.running=autoplay&&t<duration;this.last=null;this.lastText=-1;this.lastWidth=0;
    this.view.film=this;this.draw();
  }
  pause(){this.running=false;this.last=null;this.updateControls();}
  toggle(){
    if(this.t>=duration)this.t=0;
    this.running=!this.running;this.last=null;this.draw();
  }
  seek(t){this.t=Math.max(0,Math.min(duration,t));this.last=null;this.draw();}
  updateControls(){
    el('film-play').textContent=this.running?'暂停':this.t>=duration?'重播':'播放';
    el('film-play').setAttribute('aria-pressed',String(this.running));
    el('film-time').textContent=this.t.toFixed(1)+' / '+duration+' s';el('film-seek').value=this.t;
  }
  lessonReadout(a){
    const data=lessonReadout(this.key,a);
    const chain=el('film-chain').children,meters=el('film-topic-meters').children;
    data.labels.forEach((label,i)=>{
      chain[i].textContent=label;chain[i].classList.toggle('on',data.conditions[i]);
      meters[i].firstChild.textContent=data.meters[i][0];meters[i].lastChild.textContent=data.meters[i][1];
    });
    el('film-caption').textContent=films[this.key].caption;
    el('film-callout').textContent=data.labels.filter((_,i)=>data.conditions[i]).at(-1)||'Model 3 · 本车';
    if(this.scenario!==sample)el('film-rate').textContent='播放速度 0.55×';
  }
  tick(now){
    const canvas=this.view.canvas;
    if(!this.running&&canvas.clientWidth===this.lastWidth&&canvas.clientHeight===this.lastHeight)return;
    if(this.running&&this.last!==null){
      const dt=Math.max(0,now-this.last)/1000;
      this.t=Math.min(duration,this.scenario===sample?simTime(screenTime(this.t)+dt):this.t+dt*.55);
    }
    this.last=now;if(this.t===duration)this.running=false;
    this.draw();
  }
  draw(){
    const a=this.scenario(this.t),t=this.t;this.frame=a;
    this.ego.position.set(a.x,0,a.z);this.ego.rotation.y=a.yaw;
    this.neighbor.position.set(a.nx,0,a.nz);this.neighbor.rotation.y=a.nyaw;
    for(const w of this.wheels){w.pivot.rotation.y=w.front?a.steer:0;w.spin.rotation.z=-a.s/this.wheelRadius;}
    this.target.position.set(a.nx,.91,a.nz);this.target.rotation.y=a.nyaw;this.target.visible=a.observed;
    this.cone.visible=t>.7;this.sensor.visible=this.cone.visible;
    this.sideCone.visible=this.key==='vision'&&t>.7;
    const candidates=this.key==='prediction'&&a.computing&&a.left>.03;
    this.futureKeep(candidates,u=>roadPose(20+9.5*t+u*11,a.left));
    this.futureMerge(candidates,u=>roadPose(20+9.5*t+u*11,a.left*(1-u*u*(3-2*u))));
    this.history(this.key==='ego'||this.key==='perception'&&a.observed,u=>{
      const past=sample(Math.max(0,t-(1-u)*1.3));
      return this.key==='ego'?past:{x:past.nx,z:past.nz};
    });
    this.chip.visible=a.computing;this.chip.scale.setScalar(1+.18*Math.sin(t*9));
    this.observe(transit('image',a));this.steerLine(transit('steer',a));this.brakeLine(transit('brake',a));
    for(const light of this.tailLights)light.visible=a.accel<-.12;
    const canvas=this.view.canvas,cw=canvas.clientWidth,ch=canvas.clientHeight;
    const road=el('road-region'),w=road.clientWidth,h=road.clientHeight;if(!w||!h)return;
    this.lastWidth=cw;this.lastHeight=ch;
    const aspect=w/h,center=this.ego.position.clone().lerp(this.neighbor.position,.49);
    const c=Math.cos(a.yaw),s=Math.sin(a.yaw);
    const back=aspect>1.4?6:12,side=aspect>1.4?13:6,height=aspect>1.4?12:18;
    this.camera.position.copy(center).add(V(-c*back+s*side,height,s*back+c*side));this.camera.lookAt(center);
    this.camera.updateMatrixWorld();
    const right=V(1,0,0).applyQuaternion(this.camera.quaternion),up=V(0,1,0).applyQuaternion(this.camera.quaternion);
    const diff=this.neighbor.position.clone().sub(this.ego.position);
    const half=Math.max(5.3,(Math.abs(diff.dot(right))*.53+3.4)/aspect,Math.abs(diff.dot(up))*.53+3.2);
    Object.assign(this.camera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half});this.camera.updateProjectionMatrix();
    const renderer=this.view.renderer;
    renderer.setScissorTest(true);renderer.setViewport(0,ch-h,w,h);renderer.setScissor(0,ch-h,w,h);
    renderer.render(this.scene,this.camera);
    const inset=el('film-inset'),iw=inset.clientWidth,ih=inset.clientHeight;
    if(iw&&ih){
      this.frontView.position.copy(this.ego.localToWorld(this.sensor.position.clone()));
      this.frontView.lookAt(this.frontView.position.clone().add(V(c,-.075,-s)));
      this.frontView.aspect=iw/ih;this.frontView.updateProjectionMatrix();
      const ix=inset.offsetLeft+inset.clientLeft,iy=ch-inset.offsetTop-inset.clientTop-ih;
      renderer.setScissorTest(true);renderer.setViewport(ix,iy,iw,ih);renderer.setScissor(ix,iy,iw,ih);
      this.ego.visible=false;renderer.setClearColor(0xc5dce9,1);
      renderer.render(this.scene,this.frontView);
      this.ego.visible=true;renderer.setClearColor(0,0);
    }
    this.cutaway.draw(renderer,a,ch);renderer.setScissorTest(false);renderer.setViewport(0,0,cw,ch);
    const anchor=a.computing?this.chip:this.sensor;
    const pin=anchor.getWorldPosition(V()).project(this.camera),label=el('film-callout');
    label.style.left=Math.max(75,Math.min(w-75,(1+pin.x)*w/2))+'px';
    label.style.top=Math.max(38,(1-pin.y)*h/2-15)+'px';
    if(Math.floor(t*10)!==this.lastText||!this.running||this.last===null){
      label.textContent=!a.observed?'Model 3 · 本车':!a.computing?'摄像头 · 跟踪邻车':!a.requested?'智驾计算 · 评估切入':a.brakeRequest<-.08?'请求左转与减速':'请求保持弯道';
      el('film-rate').textContent=t>=slowStart&&t<slowEnd?'观测与控制慢放 0.18×':'播放速度 0.55×';
      el('film-speed').textContent=(a.speed*3.6).toFixed(1);
      el('film-gap').textContent=a.gap.toFixed(1);
      el('film-steer').textContent=radToDeg(a.steer).toFixed(1)+'°';
      el('film-command').textContent=radToDeg(a.steerRequest).toFixed(1)+'°';
      el('film-brake').textContent=a.brakeRequest.toFixed(1);
      el('film-accel').textContent=a.accel.toFixed(1);
      const lamps=[this.cone.visible,a.observed,a.computing,a.requested];
      document.querySelectorAll('#film-chain li').forEach((node,i)=>node.classList.toggle('on',lamps[i]));
      el('film-caption').textContent=t<1.4?'两车接近左弯，橙车在左侧相邻车道。':!a.observed?'橙车开始向本车道移动，留意前视画面中的横向位移。':!a.computing?'前视图像沿青色路径进入 HW4 计算板。':!a.requested?'智驾计算板已收到图像，正在评估邻车切入后的间距。':!a.brakeReceived?'计算板发出两路请求。黄色通往转向器，红色通往制动液压控制单元。':!a.hydraulic?'转向器已接收请求。液压控制单元正在向左前制动钳传递压力。':a.left>.05?'前轮向左转，制动钳夹紧制动盘，轮速观测反馈给底盘控制器。':'橙车已进入本车道。本车以较低速度沿弯道行驶，制动释放，纵向间距逐渐恢复。';
      if(this.key!=='cutin-case')this.lessonReadout(a);
      else{
        el('branch-vision').textContent=a.computing?'图像已到达计算板':a.observed?'图像传输中':'等待切入观测';
        el('branch-steer').textContent=a.epsReceived?'已接收 · 前轮 '+radToDeg(a.steer).toFixed(1)+'°':a.requested?'转向请求传输中':'等待请求';
        el('branch-brake').textContent=a.hydraulic?(a.accel<-.06?'制动响应 '+a.accel.toFixed(1)+' m/s²':'已释放'):a.brakeReceived?'液压传递中':a.requested?'制动请求传输中':'等待请求';
      }
      this.lastText=Math.floor(t*10);this.updateControls();
    }
  }
}
