import * as T from 'three';
import {assetBytes} from './packed.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


const vec = a => new T.Vector3(...a);
const front = new T.Vector3(1.06,.57,1.43).normalize();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const easing = t => t*t*(3-2*t);

export class VehicleView {
  constructor(canvas, labels, catalog, picked) {
    this.canvas=canvas; this.labels=labels; this.catalog=catalog; this.picked=picked;
    this.records=new Map(catalog.nodes.map(n=>[n.id,n])); this.items=new Map(); this.leafMeshes=new Map();
    this.proxies=new Map(); this.variants=new Map(); this.pins=[]; this.labelsOn=true; this.dirty=true;
    this.ray=new T.Raycaster(); this.scene=new T.Scene();
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.renderer.setClearColor(0,0); this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping; this.renderer.toneMappingExposure=1.06;
    this.camera=new T.OrthographicCamera(-3,3,2,-2,.0003,180);
    this.camera.position.copy(front).multiplyScalar(10); this.camera.lookAt(0,.65,0);
    this.controls=this.orbit(this.camera);
    this.camera.up.set(0,1,0); this.span=4; this.buildStudio();
    new ResizeObserver(()=>this.resize()).observe(canvas.parentElement);
    this.resize(); this.bindPointer();
    this.tick=this.tick.bind(this); requestAnimationFrame(this.tick);
  }
  orbit(camera){
    const orbit=new OrbitControls(camera,this.canvas);
    orbit.enableDamping=false;orbit.minZoom=.12;orbit.maxZoom=250;orbit.maxPolarAngle=Math.PI*.97;
    orbit.minDistance=.003;orbit.maxDistance=60;
    orbit.addEventListener('start',()=>{this.cameraTween=null;});
    orbit.addEventListener('change',()=>{this.dirty=true;});
    return orbit;
  }
  buildStudio() {
    this.studio=new T.Group();this.scene.add(this.studio);
    this.studio.add(new T.HemisphereLight(0xfaffff,0x77796c,1.65));
    for(const [p,power] of [[[2.5,5,3],2.5],[[-4,3,-2],1.7],[[2,2,-4],1.05]]){
      const light=new T.DirectionalLight(0xfffcf5,power);light.position.set(...p);this.studio.add(light);
    }
    const room=new T.Scene();room.background=new T.Color(0x9aa8ac);
    for(const [p,s,c] of [[[0,5,-1],[8,.1,3],0xffffff],[[0,2,4],[7,1.1,.1],0xe7f0fa],
        [[-4,1,0],[.1,3,5],0xfaf2dc],[[0,-3,0],[10,.1,8],0x3d4b50]]){
      const panel=new T.Mesh(new T.BoxGeometry(...s),new T.MeshBasicMaterial({color:c}));panel.position.set(...p);room.add(panel);
    }
    const pm=new T.PMREMGenerator(this.renderer);this.env=pm.fromScene(room,.035,.1,30);
    this.scene.environment=this.env.texture;this.scene.environmentIntensity=.79;pm.dispose();
    room.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
    const source=document.createElement('canvas');source.width=source.height=128;
    const g=source.getContext('2d'),grad=g.createRadialGradient(64,64,5,64,64,61);
    grad.addColorStop(0,'rgba(31,49,48,.40)');grad.addColorStop(.46,'rgba(45,62,57,.25)');grad.addColorStop(1,'rgba(45,62,57,0)');
    g.fillStyle=grad;g.fillRect(0,0,128,128);
    this.shadow=new T.Mesh(new T.PlaneGeometry(5.9,2.95),new T.MeshBasicMaterial({map:new T.CanvasTexture(source),transparent:true,depthWrite:false}));
    this.shadow.rotation.x=-Math.PI/2;this.shadow.position.set(-.07,-.005,0);this.shadow.renderOrder=-2;this.scene.add(this.shadow);
  }
  resize(){
    const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;
    // Match high-density screens while bounding the drawing buffer on large displays.
    const ratio=Math.min(devicePixelRatio||1,3,Math.sqrt(4800000/(w*h)));
    if(w===this.viewportWidth&&h===this.viewportHeight&&ratio===this.renderer.getPixelRatio())return;
    this.viewportWidth=w;this.viewportHeight=h;
    this.renderer.setPixelRatio(ratio);
    this.aspect=w/h;this.renderer.setSize(w,h,false);
    if(this.film)this.film.lastWidth=0;
    this.projection();if(this.scope&&!this.cameraTween)this.fit(false);
    this.dirty=true;
  }
  projection(){
    const h=this.span/2;this.camera.left=-h*this.aspect;this.camera.right=h*this.aspect;
    this.camera.top=h;this.camera.bottom=-h;this.camera.updateProjectionMatrix();
  }
  async loadOverview(){
    const bytes=await assetBytes('assets/overview.glb',this.catalog.revision+'-body2');
    const {scene}=await new GLTFLoader().parseAsync(bytes,'assets/');
    this.root=scene;this.scene.add(scene);
    scene.traverse(o=>{
      const id=o.userData.seId;
      if(!id)return;
      this.items.set(id,{ob:o,rest:o.position.clone(),offset:vec(this.records.get(id).offset)});
      if(id===this.catalog.root)return;
      const batch=new T.Group();
      batch.add(...o.children.slice());o.add(batch);
      batch.traverse(m=>{
        if(!m.isMesh)return;
        if(!m.geometry.hasAttribute('normal')){
          m.geometry.computeVertexNormals();
          m.material.flatShading=false;
          m.material.needsUpdate=true;
        }
        m.userData.pickId=id;m.userData.baseMaterial=m.material;
      });
      this.proxies.set(id,batch);
    });
    scene.updateMatrixWorld(true);
  }
  async loadDetail(){
    const bytes=await assetBytes(this.catalog.modelFile,this.catalog.revision);
    const {scene}=await new GLTFLoader().parseAsync(bytes,'assets/');
    this.scene.remove(this.root);this.items.clear();
    this.root=scene;this.scene.add(scene);scene.updateMatrixWorld(true);
    scene.traverse(o=>{
      const id=o.userData.seId;if(!id)return;
      const data=this.records.get(id);if(!data)throw new Error('未知装配对象 '+id);
      this.items.set(id,{ob:o,rest:o.position.clone(),offset:vec(data.offset)});
      if(data.type==='part'){
        const meshes=[];o.traverse(m=>{if(m.isMesh){m.userData.pickId=id;m.userData.baseMaterial=m.material;meshes.push(m);}});
        this.leafMeshes.set(id,meshes);
      }
    });
    if(this.items.size!==this.records.size)throw new Error('模型与装配清单版本不一致');
    for(const [domain,batch] of this.proxies)this.items.get(domain).ob.add(batch);
    this.dirty=true;
  }
  domain(id){let n=this.records.get(id);while(n.parent&&n.parent!==this.catalog.root)n=this.records.get(n.parent);return n.id;}
  descendant(id,ancestor){
    for(let k=id;k;k=this.records.get(k)?.parent)if(k===ancestor)return true;
    return false;
  }
  tourSignal(id,previous,paths=[]){
    if(this.tourCue)this.tourCue.visible=false;
    this.dirty=true;
    if(!id||reduced)return;
    if(!this.tourCue){
      this.tourCue=new T.Mesh(new T.SphereGeometry(1,14,10),new T.MeshBasicMaterial({color:0x09b9bd,depthTest:false,depthWrite:false}));
      this.tourCue.renderOrder=40;this.scene.add(this.tourCue);
    }
    const center=key=>this.bounds(key)?.getCenter(new T.Vector3());
    this.cueTo=center(id)||this.items.get(id).ob.getWorldPosition(new T.Vector3());
    this.cueFrom=previous&&this.items.has(previous)?this.items.get(previous).ob.getWorldPosition(new T.Vector3()):this.cueTo.clone();
    this.cuePaths=paths;this.cueStart=performance.now();this.tourCue.visible=true;
  }
  styleMesh(mesh,variant){
    const base=mesh.userData.baseMaterial;
    if(!variant){mesh.material=base;return;}
    const k=base.uuid+'|'+variant;
    if(!this.variants.has(k)){
      const m=base.clone();
      if(variant==='active'){
        if(m.color)m.color.lerp(new T.Color(0xf7753b),.52);
        if(m.emissive){m.emissive.setHex(0x6b2410);m.emissiveIntensity=.32;}
      }else{
        if(m.color)m.color.lerp(new T.Color(0xa6b3ad),.50);
        m.metalness=.12;m.roughness=.75;
      }
      this.variants.set(k,m);
    }
    mesh.material=this.variants.get(k);
  }
  setView(spec,pose=null,instant=false){
    const previous=this.scope;
    this.scope=spec;this.move=null;this.cameraTween=null;
    const roots=new Set(spec.include),allow=id=>{for(const a of roots)if(this.descendant(id,a))return true;return false;};
    const proxies=spec.overview;
    this.picks=[];
    for(const [id,meshes] of this.leafMeshes){
      const vis=!proxies&&allow(id);
      for(const m of meshes){
        m.visible=vis;
        if(vis){
          this.styleMesh(m,spec.highlight?(this.descendant(id,spec.highlight)?'active':'context'):'');
          this.picks.push(m);
        }
      }
    }
    for(const [id,b] of this.proxies){
      b.visible=proxies;if(!proxies)continue;
      for(const m of b.children){this.styleMesh(m,spec.highlight?(spec.highlight===id?'active':'context'):'');this.picks.push(m);}
    }
    this.shadow.visible=proxies&&spec.fraction<.02&&!spec.highlight;
    const moves=[];
    for(const [id,{ob,rest,offset}] of this.items){
      const target=rest.clone();
      if(spec.explode&&this.records.get(id).parent===spec.explode)target.addScaledVector(offset,spec.fraction);
      if(ob.position.distanceToSquared(target)>1e-17){
        moves.push({ob,start:ob.position.clone(),end:target});ob.position.copy(target);
      }
    }
    this.scene.updateMatrixWorld(true);
    const retainOrbit=previous&&previous.explode===spec.explode&&!spec.defaultDirection;
    const direction=spec.direction&&!retainOrbit?vec(spec.direction).normalize():spec.defaultDirection?front:null;
    const goal=pose||this.targetPose(spec.focus||null,direction);
    if(!instant&&!reduced){
      for(const m of moves)m.ob.position.copy(m.start);
      this.move={start:performance.now(),items:moves};
    }
    this.fly(goal,instant||reduced);this.updatePins(spec.labels,spec.highlight);
    this.scene.updateMatrixWorld(true);this.dirty=true;
  }
  bounds(focus){
    const b=new T.Box3();
    for(const m of this.picks){
      const key=m.userData.pickId;if(focus&&!this.descendant(key,focus))continue;
      if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();
      b.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
    }
    return b.isEmpty()?null:b;
  }
  targetPose(focus,direction){
    const b=this.bounds(focus)||this.bounds(null);if(!b)return this.snapshot();
    const frame=this.scope.frameBounds;
    if(frame){b.expandByPoint(vec(frame.min));b.expandByPoint(vec(frame.max));}
    const center=b.getCenter(new T.Vector3());
    const dir=(direction||this.camera.position.clone().sub(this.controls.target)).clone().normalize();
    const quat=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(center.clone().add(dir),center,new T.Vector3(0,1,0)));
    const right=new T.Vector3(1,0,0).applyQuaternion(quat),up=new T.Vector3(0,1,0).applyQuaternion(quat);
    const size=b.getSize(new T.Vector3());
    const extent=axis=>Math.abs(axis.x)*size.x+Math.abs(axis.y)*size.y+Math.abs(axis.z)*size.z;
    let span=Math.max(extent(right)/this.aspect,extent(up))*(this.scope.overview&&this.scope.fraction<.02?1.035:1.20);
    if(focus&&!this.scope.overview){
      const total=this.bounds(null);if(total)span=Math.max(span,Math.min(.32,total.getSize(new T.Vector3()).length()*.16));
    }
    return {center:center.toArray(),dir:dir.toArray(),distance:Math.max(size.length()*1.70,.09),span:Math.max(span,.003)};
  }
  snapshot(){
    const d=this.camera.position.clone().sub(this.controls.target);
    return {center:this.controls.target.toArray(),dir:d.clone().normalize().toArray(),distance:d.length(),span:this.span/this.camera.zoom};
  }
  accommodateOverlay(previous,next){
    if(!previous||!next||!this.camera.isOrthographicCamera)return;
    const right=vec([1,0,0]).applyQuaternion(this.camera.quaternion);
    const up=vec([0,1,0]).applyQuaternion(this.camera.quaternion),target=this.controls.target;
    const extent=box=>{
      const center=vec(box.min).add(vec(box.max)).multiplyScalar(.5).sub(target);
      const half=vec(box.max).sub(vec(box.min)).multiplyScalar(.5);
      const reach=axis=>Math.abs(center.dot(axis))+Math.abs(axis.x)*half.x+Math.abs(axis.y)*half.y+Math.abs(axis.z)*half.z;
      return 2*Math.max(reach(up),reach(right)/this.aspect);
    };
    const newSize=extent(next),pose=this.snapshot();
    if(newSize>pose.span*.98&&newSize>extent(previous)*1.005)this.setPose({...pose,span:newSize*1.04});
  }
  setPose(p){
    this.controls.target.fromArray(p.center);this.camera.position.copy(this.controls.target).addScaledVector(vec(p.dir),p.distance);
    this.span=p.span;this.camera.zoom=1;this.projection();this.controls.update();this.dirty=true;
  }
  fly(goal,instant){
    if(instant){this.setPose(goal);this.cameraTween=null;}
    else this.cameraTween={old:this.snapshot(),goal,start:performance.now()};
  }
  fit(animated=true){
    if(!this.scope)return;
    this.scene.updateMatrixWorld(true);
    const dir=this.scope.direction?vec(this.scope.direction).normalize():null;
    this.fly(this.targetPose(null,dir),!animated||reduced);
  }
  updatePins(defs,highlight){
    this.labels.replaceChildren();this.pins=[];
    for(const p of defs.slice(0,12)){
      if(!this.items.has(p.id))continue;
      const el=document.createElement('button');el.className='pin'+(p.id===highlight?' focus':'');
      el.textContent=p.label;el.title=p.label;el.onclick=()=>this.picked(p.id,true);this.labels.append(el);
      this.pins.push({el,id:p.id});
    }
    this.labels.hidden=!this.labelsOn;
  }
  positionPins(){
    if(!this.labelsOn||!this.pins.length)return;
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight;const used=[];
    for(const {el,id} of this.pins){
      const p=this.items.get(id).ob.getWorldPosition(new T.Vector3()).project(this.camera);
      const px=(p.x+1)*width*.5,py=(1-p.y)*height*.5-12;
      if(px<0||px>width||py<0||py>height||p.z< -1||p.z>1){el.hidden=true;continue;}
      el.hidden=false;const w=el.offsetWidth,h=el.offsetHeight;
      const x=T.MathUtils.clamp(px,w/2+2,width-w/2-2);let placed=false;
      for(const delta of [0,-23,23,-46,46,-69,69]){
        const y=T.MathUtils.clamp(py+delta,h/2+2,height-h/2-2);
        if(used.some(r=>Math.abs(x-r.x)<(w+r.w)/2+3&&Math.abs(y-r.y)<(h+r.h)/2+2))continue;
        el.style.left=x+'px';el.style.top=y+'px';used.push({x,y,w,h});placed=true;break;
      }
      el.hidden=!placed;
    }
  }
  hit(x,y){
    const b=this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new T.Vector2((x-b.left)/b.width*2-1,1-(y-b.top)/b.height*2),this.camera);
    return this.ray.intersectObjects(this.picks||[],false)[0]?.object.userData.pickId;
  }
  bindPointer(){
    const active=new Set();let down=null;
    this.canvas.addEventListener('pointerdown',e=>{
      active.add(e.pointerId);if(active.size===1&&e.button===0)down={x:e.clientX,y:e.clientY,id:e.pointerId};else down=null;
    });
    this.canvas.addEventListener('pointercancel',e=>{active.delete(e.pointerId);down=null;});
    this.canvas.addEventListener('pointerup',e=>{
      active.delete(e.pointerId);
      if(down?.id===e.pointerId&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<5){
        const id=this.hit(e.clientX,e.clientY);if(id)this.picked(id,false);
      }down=null;
    });
  }
  tick(now){
    requestAnimationFrame(this.tick);
    if(document.hidden)return;
    if(this.film){this.film.tick(now);return;}
    if(this.tourCue?.visible){
      const elapsed=Math.max(0,now-this.cueStart)/2200,u=elapsed%1;
      const route=this.cuePaths[Math.floor(elapsed)%this.cuePaths.length];
      if(route){
        const t=u*(route.points.length-1),i=Math.floor(t);
        this.tourCue.position.lerpVectors(route.points[i],route.points[i+1],t-i);
      }else this.tourCue.position.lerpVectors(this.cueFrom,this.cueTo,u);
      this.tourCue.scale.setScalar(Math.max(.0005,this.span*.012)*(1+.3*Math.sin(u*Math.PI)));
      this.dirty=true;
    }
    if(this.move){
      const u=Math.min(1,(now-this.move.start)/410);
      for(const m of this.move.items)m.ob.position.lerpVectors(m.start,m.end,easing(u));
      this.dirty=true;if(u===1)this.move=null;
    }
    if(this.cameraTween){
      const {old,goal,start}=this.cameraTween,t=Math.min(1,(now-start)/410),a=easing(t);
      this.setPose({center:vec(old.center).lerp(vec(goal.center),a).toArray(),dir:vec(old.dir).lerp(vec(goal.dir),a).normalize().toArray(),
        distance:T.MathUtils.lerp(old.distance,goal.distance,a),span:Math.exp(T.MathUtils.lerp(Math.log(old.span),Math.log(goal.span),a))});
      if(t===1)this.cameraTween=null;
    }
    if(this.dirty){
      this.renderer.render(this.scene,this.camera);this.positionPins();this.dirty=false;
    }
  }
}
