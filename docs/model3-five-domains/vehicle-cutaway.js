import * as T from 'three';
import {films,names,palette,transit,packetPosition} from './film-lessons.js';

const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const svg=(tag,attrs={})=>{
  const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [k,value] of Object.entries(attrs))e.setAttribute(k,value);
  return e;
};
const size=n=>Math.max(...n.half)*n.half.reduce((sum,x)=>sum+x,0);
const padA='brFL/p-57a6ede5125e8037',padB='brFL/p-23361da9b380365a';
const rotor='rearmotor/p-0b36a99f70080524',rackRod='rack/p-e814c8ba98cca235';

export class VehicleCutaway{
  constructor(view,builder){
    this.view=view;this.builder=builder;this.panel=document.getElementById('cutaway');
    this.labels=document.getElementById('cut-labels');this.scene=new T.Scene();
    this.scene.add(new T.HemisphereLight(0xf5ffff,0x7495af,2.1));
    const light=new T.DirectionalLight(0xffffff,2.5);light.position.set(-1,4,2);this.scene.add(light);
    this.camera=new T.OrthographicCamera(-3,3,2,-2,.01,40);
    const shell=new T.MeshBasicMaterial({color:0x89bed3,opacity:.072,transparent:true,depthWrite:false});
    const skins=[];
    for(const [id,meshes] of view.leafMeshes){
      if(!['outer','glass','closures'].some(k=>view.descendant(id,k)))continue;
      const record=view.records.get(id);
      if(/铰链|内板|内饰|密封/.test(record.label))continue;
      for(const mesh of meshes)skins.push({mesh,rank:size(record)});
    }
    for(const {mesh} of skins.sort((a,b)=>b.rank-a.rank).slice(0,38)){
      const ghost=new T.Mesh(mesh.geometry,shell);ghost.matrix.copy(this.restMatrix(mesh));
      ghost.matrixAutoUpdate=false;ghost.renderOrder=-2;this.scene.add(ghost);
    }
    this.parts=new Map();this.pathGroup=new T.Group();this.scene.add(this.pathGroup);
    this.dotGeometry=new T.SphereGeometry(.034,12,8);
    this.dotMaterial=new T.MeshBasicMaterial({color:0xffffff,depthTest:false});
  }
  restMatrix(mesh){
    const chain=[];for(let p=mesh;p;p=p.parent)chain.unshift(p);
    const out=new T.Matrix4(),local=new T.Matrix4();
    for(const p of chain)out.multiply(local.compose(this.view.items.get(p.userData.seId)?.rest||p.position,p.quaternion,p.scale));
    return out;
  }
  part(id){
    if(this.parts.has(id))return this.parts.get(id);
    const point=this.builder.at(id),group=new T.Group(),choices=[];
    const material=new T.MeshStandardMaterial({color:0x9daebc,metalness:.22,roughness:.55});
    if(['wheelFL','wheelFR','wheelRL','discFL','pack'].includes(id)){
      material.transparent=true;material.opacity=id==='pack'?.30:.24;material.depthWrite=false;
    }
    for(const [key,meshes] of this.view.leafMeshes){
      if(!this.view.descendant(key,id))continue;
      if(key!==id&&[rotor,rackRod,padA,padB].includes(key))continue;
      const r=this.view.records.get(key);
      for(const mesh of meshes)choices.push({mesh,rank:size(r)});
    }
    const offset=new T.Matrix4().makeTranslation(-point.x,-point.y,-point.z);
    for(const {mesh} of choices.sort((a,b)=>b.rank-a.rank).slice(0,10)){
      const copy=new T.Mesh(mesh.geometry,material);
      copy.matrix.multiplyMatrices(offset,this.restMatrix(mesh));copy.matrixAutoUpdate=false;group.add(copy);
    }
    group.position.copy(point);this.scene.add(group);
    const part={point,group,material};this.parts.set(id,part);return part;
  }
  configure(key){
    this.key=key;const {labels,paths}=films[key];this.labels.replaceChildren();
    for(const p of this.parts.values())p.group.visible=false;
    for(const node of this.pathGroup.children){
      if(node.geometry!==this.dotGeometry)node.geometry.dispose();
      if(node.material!==this.dotMaterial)node.material.dispose();
    }
    this.pathGroup.clear();
    const ids=new Set(labels);
    this.lines=paths.map(({kind,ids:via,clock})=>{
      const points=via.map(id=>this.builder.at(id));ids.add(via[0]);ids.add(via.at(-1));
      const lifted=[points[0]];
      for(let i=1;i<points.length;i++){
        const mid=points[i-1].clone().lerp(points[i],.5);mid.y+=kind==='braking'?.12:.07;
        lifted.push(mid,points[i]);
      }
      const path=new T.CatmullRomCurve3(lifted);
      const mat=new T.MeshBasicMaterial({color:palette[kind],transparent:true,opacity:.2,depthWrite:false,depthTest:false});
      const line=new T.Mesh(new T.TubeGeometry(path,48,.017,6,false),mat);line.renderOrder=5;
      const dot=new T.Mesh(this.dotGeometry,this.dotMaterial);dot.renderOrder=8;
      this.pathGroup.add(line,dot);return {path,mat,dot,kind,clock,via};
    });
    if(ids.has('epas')||ids.has('rack'))for(const id of ['wheelFL','wheelFR',rackRod])ids.add(id);
    if(ids.has('calFL'))for(const id of [padA,padB,'discFL'])ids.add(id);
    if(ids.has('rearmotor'))ids.add(rotor);
    this.visible=Array.from(ids,id=>[id,this.part(id)]);
    for(const [,p] of this.visible){
      p.group.visible=true;p.group.position.copy(p.point);p.group.rotation.set(0,0,0);p.material.color.setHex(0xa2bece);
    }
    this.tags=labels.map(id=>{
      const g=svg('g'),path=svg('path',{fill:'none',stroke:'#99baca'}),dot=svg('circle',{r:3.4});
      const bg=svg('rect',{height:19,rx:3,fill:'#102b3b','fill-opacity':'.94'});
      const text=svg('text',{fill:'#eefaff','font-size':13});text.textContent=names[id];
      g.append(path,dot,bg,text);this.labels.append(g);return {id,path,dot,bg,text,p:this.part(id)};
    });
    const box=new T.Box3().setFromPoints(this.visible.map(([,p])=>p.point));
    this.center=box.getCenter(v());this.center.y-=.03;
    this.extent=box.getSize(v());this.camera.position.copy(this.center).add(v(1.5,4.1,3.2));
    this.camera.lookAt(this.center);this.camera.updateMatrixWorld();this.width=0;
  }
  layout(w,h){
    const aspect=w/h;
    const right=v(1,0,0).applyQuaternion(this.camera.quaternion),up=v(0,1,0).applyQuaternion(this.camera.quaternion);
    const span=axis=>Math.abs(axis.x)*this.extent.x+Math.abs(axis.y)*this.extent.y+Math.abs(axis.z)*this.extent.z;
    const half=Math.max(1.03,(span(right)+.77)/(1.55*aspect),(span(up)+.70)/1.28);
    Object.assign(this.camera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half});this.camera.updateProjectionMatrix();
    const pins=this.tags.map(tag=>{
      const p=tag.p.point.clone().project(this.camera);
      return {...tag,x:(1+p.x)*w/2,y:(1-p.y)*h/2};
    }).sort((a,b)=>a.x-b.x);
    for(const [side,group] of [pins.slice(0,Math.ceil(pins.length/2)),pins.slice(Math.ceil(pins.length/2))].entries()){
      group.sort((a,b)=>a.y-b.y);
      group.forEach(({path,dot,bg,text,x,y},i)=>{
        const lane=46+(h-80)*(i+.5)/group.length;
        const width=text.textContent.length*13+10,left=side?w-width-5:5;
        const elbow=side?left:left+width;
        path.setAttribute('d',`M${x} ${y} L${elbow} ${lane}`);
        dot.setAttribute('cx',x);dot.setAttribute('cy',y);bg.setAttribute('x',left);bg.setAttribute('y',lane-10);bg.setAttribute('width',width);
        text.setAttribute('x',left+5);text.setAttribute('y',lane+4);
      });
    }
    this.width=w;this.height=h;
  }
  draw(renderer,a,canvasHeight){
    const panel=this.panel,w=panel.clientWidth,h=panel.clientHeight;
    if(!w||!h)return;
    if(w!==this.width||h!==this.height)this.layout(w,h);
    const active=new Map();
    for(const line of this.lines){
      const phase=transit(line.clock,a),on=phase>=0;
      line.phase=phase;line.dot.visible=on;line.mat.opacity=on?.94:.14;
      if(!on)continue;
      const u=packetPosition(phase);
      line.dot.position.copy(line.path.getPointAt(Math.min(.99999,u)));
      active.set(line.via[0],palette[line.kind]);
      if(phase>=1)active.set(line.via.at(-1),palette[line.kind]);
    }
    for(const [id,p] of this.visible){
      if(id==='apboard'&&a.computing)active.set(id,palette.compute);
      if(id==='hcu'&&a.brakeReceived&&a.accel<-.06)active.set(id,palette.braking);
      const tint=active.get(id);p.material.color.setHex(tint||0x7794a6);
      if(id==='wheelFL'||id==='wheelFR')p.group.rotation.y=a.steer;
      if(id===rackRod)p.group.position.z=p.point.z+a.steer*.8;
      if(id===padA||id===padB){
        const gap=this.part('discFL').point.z-p.point.z;
        p.group.position.z=p.point.z+Math.sign(gap)*Math.min(Math.abs(gap),Math.max(0,-a.accel)*.006);
      }
      if(id===rotor||id==='discFL'||id==='rearLshaft')p.group.rotation.z=-a.s/.334;
      if(id==='pedals')p.group.rotation.z=.18*Math.max(0,Math.min(1,(a.t-3.25)/.45,(5.85-a.t)/.15));
    }
    for(const tag of this.tags)tag.dot.setAttribute('fill',active.has(tag.id)?'#'+active.get(tag.id).toString(16).padStart(6,'0'):'#829bac');
    const x=panel.offsetLeft,y=canvasHeight-panel.offsetTop-h;
    renderer.setScissorTest(true);renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);
    renderer.setClearColor(0x102534,1);renderer.render(this.scene,this.camera);
    renderer.setClearColor(0,0);renderer.setScissorTest(false);
  }
}
