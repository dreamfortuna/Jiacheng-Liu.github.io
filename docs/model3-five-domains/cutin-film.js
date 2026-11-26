import * as T from 'three';
import {AdasOverlays} from './adas-overlays.js';
import {duration,roadPose,sample} from './cutin-motion.js';

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
  return (on,t)=>{wire.visible=on;if(on)dot.position.copy(path.getPointAt(t%1));};
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
  }
  open(t=0,autoplay=true){
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
  tick(now){
    const canvas=this.view.canvas;
    if(!this.running&&canvas.clientWidth===this.lastWidth&&canvas.clientHeight===this.lastHeight)return;
    if(this.running&&this.last!==null)this.t=Math.min(duration,simTime(screenTime(this.t)+Math.max(0,now-this.last)/1000));
    this.last=now;if(this.t===duration)this.running=false;
    this.draw();
  }
  draw(){
    const a=sample(this.t),t=this.t;this.frame=a;
    this.ego.position.set(a.x,0,a.z);this.ego.rotation.y=a.yaw;
    this.neighbor.position.set(a.nx,0,a.nz);this.neighbor.rotation.y=a.nyaw;
    for(const w of this.wheels){w.pivot.rotation.y=w.front?a.steer:0;w.spin.rotation.z=-a.s/this.wheelRadius;}
    this.target.position.set(a.nx,.91,a.nz);this.target.rotation.y=a.nyaw;this.target.visible=a.observed;
    this.cone.visible=t>.7;this.sensor.visible=this.cone.visible;
    this.chip.visible=a.computing;this.chip.scale.setScalar(1+.18*Math.sin(t*9));
    this.observe(a.observed,t*1.5);this.steerLine(a.requested,t*1.4);this.brakeLine(a.brakeRequest<-.08,t*1.4);
    for(const light of this.tailLights)light.visible=a.accel<-.12;
    const canvas=this.view.canvas,w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    this.lastWidth=w;this.lastHeight=h;
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
    renderer.render(this.scene,this.camera);
    const inset=el('film-inset'),iw=inset.clientWidth,ih=inset.clientHeight;
    if(iw&&ih){
      this.frontView.position.copy(this.ego.localToWorld(this.sensor.position.clone()));
      this.frontView.lookAt(this.frontView.position.clone().add(V(c,-.075,-s)));
      this.frontView.aspect=iw/ih;this.frontView.updateProjectionMatrix();
      const ix=inset.offsetLeft+inset.clientLeft,iy=h-inset.offsetTop-inset.clientTop-ih;
      renderer.setScissorTest(true);renderer.setViewport(ix,iy,iw,ih);renderer.setScissor(ix,iy,iw,ih);
      this.ego.visible=false;renderer.setClearColor(0xc5dce9,1);
      renderer.render(this.scene,this.frontView);
      this.ego.visible=true;renderer.setClearColor(0,0);renderer.setScissorTest(false);renderer.setViewport(0,0,w,h);
    }
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
      el('film-caption').textContent=t<1.4?'两车接近左弯，橙车在左侧相邻车道。':!a.observed?'橙车开始向本车道移动，留意前视画面中的横向位移。':!a.computing?'摄像头跟踪到橙车的横向运动，青框随观测目标移动。':!a.requested?'观测送达车载计算机，计算模块评估切入后的间距。':a.left>.05?'计算模块请求保持弯道并减速。前轮逐渐左转，刹车灯随制动响应亮起。':'橙车已进入本车道。本车以较低速度沿弯道行驶，纵向间距逐渐恢复。';
      this.lastText=Math.floor(t*10);this.updateControls();
    }
  }
}
