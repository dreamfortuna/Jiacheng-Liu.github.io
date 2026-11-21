import {loadThree} from './three-loader.js';

const stage=document.querySelector('.mech-stage');
const view=stage.querySelector('.mech-view');
const poster=view.querySelector('img');
const status=stage.querySelector('.mech-status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const hoverCapable=matchMedia('(any-hover:hover)');
const compact=matchMedia('(max-width:720px)').matches;
const base=new URL('.',import.meta.url);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const duration=3.65;
const reactions=['flash','spin','wink'];
const signals={gazeX:0,gazeY:0,attention:0,flash:0,wink:0,spin:0,bounce:0,blink:0,ripple:1};
let target=0,progress=0,yaw=.19,pitch=.085,targetYaw=yaw,targetPitch=pitch;
let aimX=0,aimY=0,hover=false,focused=false,drag=null,suppressClick=false;
let action=0,reaction='',reactionTime=2,spinTime=2,spinQueued=false,time=0;
let lastShadow=-1;
let renderer,model,visible=true,lost=false,frame=0,previous=0;
let sheet=null,film=null,sheetJob=null,starting=true;
const live=()=>Boolean(model&&!lost);
const asset=name=>new URL('mech-'+name+'.webp',base).href;

// Dismissal mutes idle prompts only. A new hover or keyboard visit still greets the visitor.
const dialogue=document.getElementById('mech-dialogue');
const lines=Array.from(dialogue.querySelectorAll('p'));
const dismiss=dialogue.querySelector('.mech-dismiss');
let lineIndex=-1,nextLine=0,restoringFocus=false,hideTimer=0,idleTimer=0,idleCount=0,inDialogueView=false,quiet=false;
try{quiet=sessionStorage.getItem('mech-dialogue-quiet')==='1';}catch{/* Storage is optional. */}

function hideWhenReady(){
  if(dialogue.hidden)return;
  if(dialogue.contains(document.activeElement)||view.matches(':focus-visible')||
    hover||(hoverCapable.matches && dialogue.matches(':hover'))){
    hideTimer=setTimeout(hideWhenReady,1000);
  }else dialogue.hidden=true;
}
function placeDialogue(){
  if(dialogue.hidden)return;
  const rect=stage.getBoundingClientRect();
  const hero=stage.closest('.hero').getBoundingClientRect();
  const nav=document.querySelector('.dk-nav').getBoundingClientRect();
  const top=Math.max(0,nav.bottom,hero.top)+4;
  const bottom=Math.min(document.documentElement.clientHeight,hero.bottom)-4;
  const height=dialogue.offsetHeight;
  const above=bottom-rect.bottom<height && rect.top-top>bottom-rect.bottom;
  const edge=above?rect.top-height+4:rect.bottom-4;
  const onScreen=rect.bottom>top && rect.top<bottom;
  const y=onScreen?clamp(edge,top,Math.max(top,bottom-height)):edge;
  dialogue.toggleAttribute('data-above',above);
  dialogue.style.top=(y-stage.parentElement.getBoundingClientRect().top)+'px';
}
window.addEventListener('scroll',placeDialogue,{passive:true});
window.addEventListener('resize',placeDialogue);
function showLine(index){
  clearTimeout(hideTimer);
  if(lineIndex!==index){
    if(lineIndex>=0)lines[lineIndex].hidden=true;
    lines[index].hidden=false;
    lineIndex=index;
  }
  dialogue.hidden=false;
  placeDialogue();
  if(!reduced.matches)hideTimer=setTimeout(hideWhenReady,7000);
}
function speak(){
  showLine(nextLine);
  nextLine=(nextLine+1)%lines.length;
}
function greet(){
  if(document.hidden||drag||dialogue.contains(document.activeElement))return;
  if(lineIndex===-1)nextLine=1%lines.length;
  showLine(0);
}
const hint=stage.querySelector('.mech-hint');
function beginHover(){
  if(hover||document.hidden||drag)return;
  hover=true;
  hint.textContent='悬停问候 · 点击变形';
  greet();wake();
}
function isHoverPointer(event){
  return event.pointerType==='mouse'||(event.pointerType==='pen'&&event.pressure===0);
}
function scheduleIdle(){
  clearTimeout(idleTimer);
  if(quiet||reduced.matches||!inDialogueView||document.hidden||idleCount>=3)return;
  idleTimer=setTimeout(()=>{
    if(dialogue.hidden&&!drag){idleCount++;speak();}
    scheduleIdle();
  },idleCount===0?6000:22000+Math.random()*8000);
}
function closeDialogue(){
  if(dialogue.hidden)return;
  quiet=true;clearTimeout(hideTimer);clearTimeout(idleTimer);
  const returnFocus=dialogue.contains(document.activeElement);
  dialogue.hidden=true;
  if(returnFocus){
    restoringFocus=true;
    view.focus({preventScroll:true});
    restoringFocus=false;
  }
  try{sessionStorage.setItem('mech-dialogue-quiet','1');}catch{/* Storage is optional. */}
}
dismiss.addEventListener('click',closeDialogue);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDialogue();});

function showPoster(end){
  const name=end?'vehicle':'upright',src=asset(name);
  if(poster.src!==src)poster.src=src;
  poster.alt=end?'折叠完成的四轮自动驾驶车，车顶配备激光雷达。':'珍珠白与深青色机甲，外露的金属连杆连接装甲和轮组。';
}
function finish(){
  showPoster(target);stage.removeAttribute('data-sequence');
  stage.dataset.form=target?'vehicle':'upright';
  status.textContent=target?'已折叠为自动驾驶车。':'已展开为机甲。';
}
async function prepareFilm(){
  if(sheetJob||navigator.connection?.saveData||reduced.matches)return;
  const img=new Image();img.src=asset('sequence');sheetJob=img.decode();
  try{
    await sheetJob;sheet=img;film=document.createElement('span');film.className='mech-film';
    film.setAttribute('aria-hidden','true');film.style.backgroundImage='url("'+img.src+'")';view.append(film);previous=performance.now()-35;wake();
  }catch{sheetJob=null;progress=target;finish();}
}
function toggle(){
  speak();
  target=1-target;
  view.setAttribute('aria-label',target?'将自动驾驶车展开为机甲':'将机甲折叠为自动驾驶车');
  view.setAttribute('aria-pressed',String(Boolean(target)));stage.dataset.form='changing';
  reaction=reactions[action++%reactions.length];reactionTime=0;spinQueued=reaction==='spin'&&!reduced.matches;
  if(reduced.matches||(!live()&&!sheetJob&&!starting)){progress=target;finish();}
  wake();
}
view.disabled=false;view.setAttribute('aria-pressed','false');
if(hoverCapable.matches)hint.textContent='悬停问候 · 点击变形';
hint.hidden=false;
view.addEventListener('click',event=>{if(!suppressClick||event.detail===0)toggle();suppressClick=false;});
view.addEventListener('focus',()=>{
  focused=view.matches(':focus-visible');
  if(focused&&!restoringFocus)greet();
  wake();
});
view.addEventListener('blur',()=>{focused=false;wake();});
view.addEventListener('pointerenter',event=>{if(isHoverPointer(event)&&!event.buttons)beginHover();});
view.addEventListener('pointerleave',()=>{hover=false;aimX=aimY=0;wake();});
view.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0)return;
  suppressClick=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,yaw:targetYaw,pitch:targetPitch};
  view.setPointerCapture(event.pointerId);
});
view.addEventListener('pointermove',event=>{
  const rect=view.getBoundingClientRect();
  if(isHoverPointer(event)){
    if(!event.buttons)beginHover();
    aimX=clamp((event.clientX-rect.left)/rect.width*2-1,-1,1);
    aimY=clamp((event.clientY-rect.top)/rect.height*2-1,-1,1);
  }
  if(drag&&event.pointerId===drag.id){
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(Math.abs(dx)+Math.abs(dy)>6)suppressClick=true;
    if(suppressClick&&live()){targetYaw=drag.yaw-dx*.012;targetPitch=clamp(drag.pitch+dy*.006,-.065,.78);}
  }
  wake();
});
view.addEventListener('pointercancel',()=>{drag=null;suppressClick=true;});
view.addEventListener('lostpointercapture',()=>{drag=null;});
view.addEventListener('keydown',event=>{
  if(!live())return;
  switch(event.key){
    case 'ArrowLeft':targetYaw-=.25;break;
    case 'ArrowRight':targetYaw+=.25;break;
    case 'ArrowUp':targetPitch=clamp(targetPitch+.12,-.065,.78);break;
    case 'ArrowDown':targetPitch=clamp(targetPitch-.12,-.065,.78);break;
    case 'Home':targetYaw=.19;targetPitch=.085;break;
    default:return;
  }
  event.preventDefault();wake();
});
function wake(){
  if(frame||!visible||document.hidden||(!live()&&(!sheet||progress===target)))return;
  frame=requestAnimationFrame(render);
}
function render(now){
  frame=0;
  const elapsed=(now-previous)/1000;
  if(!reduced.matches&&elapsed<(compact?.031:.023)){wake();return;}
  const dt=clamp(elapsed,0,.14);previous=now;
  const still=reduced.matches;
  time+=still?0:dt;reactionTime+=dt;spinTime+=dt;
  if(progress!==target){
    progress=still?target:progress+clamp(target-progress,-dt/duration,dt/duration);
    if(progress===target){
      finish();
      if(spinQueued){spinTime=0;spinQueued=false;}
    }
  }
  if(live()){
    const smooth=still?1:1-Math.exp(-dt*10);
    yaw+=(targetYaw-yaw)*smooth;pitch+=(targetPitch-pitch)*smooth;
    signals.gazeX+=((hover&&!drag&&!still?aimX:0)-signals.gazeX)*smooth;
    signals.gazeY+=((hover&&!drag&&!still?aimY:0)-signals.gazeY)*smooth;
    signals.attention+=((!still&&(hover||focused)?1:0)-signals.attention)*smooth;
    const pulse=Math.max(0,1-Math.max(0,reactionTime-.12)/.42);
    signals.flash=!still&&reaction==='flash'?pulse:0;
    signals.bounce=still||reactionTime>.72?0:Math.sin(reactionTime*13)*Math.exp(-5*reactionTime);
    signals.wink=!still&&reaction==='wink'&&reactionTime<.48?Math.sin(Math.PI*reactionTime/.48):0;
    signals.blink=still?0:Math.max(0,1-Math.abs((time%4.65)-3.70)/.105);
    signals.ripple=!still&&reaction==='flash'?clamp(reactionTime/.71,0,1):1;
    signals.spin=still||spinTime>=.90?0:Math.PI*2*(1-(1-spinTime/.90)**3);
    model.pose(progress,yaw,pitch,time,signals);
    if(still||time-lastShadow>.105){renderer.shadowMap.needsUpdate=true;lastShadow=time;}
    renderer.render(model.scene,model.camera);
    if(!still)wake();
  }else if(sheet&&progress!==target){
    const index=Math.round(progress*35);
    film.style.backgroundPosition=(index%6)*20+'% '+Math.floor(index/6)*20+'%';
    stage.setAttribute('data-sequence','');wake();
  }
}
function resize(){
  if(!live()||!view.clientWidth)return;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,compact?1.35:1.65));renderer.setSize(view.clientWidth,view.clientHeight,false);
  wake();
}
function visibility(){
  if(!visible||document.hidden){cancelAnimationFrame(frame);frame=0;}
  else{previous=performance.now()-35;wake();}
}
new IntersectionObserver(entries=>{
  const entry=entries[entries.length-1];
  visible=entry.isIntersecting;inDialogueView=visible&&entry.intersectionRatio>=.60;
  scheduleIdle();visibility();
},{threshold:[0,.60]}).observe(view);
new ResizeObserver(resize).observe(view);
document.addEventListener('visibilitychange',()=>{scheduleIdle();visibility();});
reduced.addEventListener('change',()=>{
  scheduleIdle();
  if(reduced.matches){progress=target;spinQueued=false;spinTime=2;finish();}
  else if(!live())prepareFilm();
  wake();
});
async function start(){
  if(navigator.connection?.saveData){starting=false;return;}
  const canvas=document.createElement('canvas');
  try{
    const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
    if(!gl){prepareFilm();return;}
    const [T,{makeMech}]=await Promise.all([loadThree(),import('./mech-model.js')]);
    renderer=new T.WebGLRenderer({canvas,context:gl,alpha:true,antialias:true});
    renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
    renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.setClearColor(0,0);
    model=makeMech(T);canvas.setAttribute('aria-hidden','true');
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;
      stage.removeAttribute('data-live');progress=target;finish();prepareFilm();
    });
    canvas.addEventListener('webglcontextrestored',()=>{lost=false;stage.removeAttribute('data-sequence');firstFrame();});
    view.append(canvas);firstFrame();
  }catch(error){
    model=null;canvas.remove();renderer?.dispose();stage.removeAttribute('data-live');
    console.warn('3D rendering unavailable',error);prepareFilm();
  }finally{starting=false;}
}
function firstFrame(){
  resize();renderer.shadowMap.needsUpdate=true;model.pose(progress,yaw,pitch,time,signals);renderer.render(model.scene,model.camera);
  stage.setAttribute('data-live','');previous=performance.now()-36;wake();
}
if(hoverCapable.matches&&view.matches(':hover'))beginHover();
start();
