import {loadThree} from './three-loader.js';

const stage=document.querySelector('.mech-stage');
const view=stage.querySelector('.mech-view');
const poster=view.querySelector('img');
const status=stage.querySelector('.mech-status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const fine=matchMedia('(hover:hover) and (pointer:fine)');
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

// A manual click always speaks. Dismissing the bubble silences automatic prompts for this tab.
const dialogue=document.getElementById('mech-dialogue');
const lines=Array.from(dialogue.querySelectorAll('p'));
const dismiss=dialogue.querySelector('.mech-dismiss');
let lineIndex=-1,dwellTimer=0,hideTimer=0,idleTimer=0,idleCount=0,inDialogueView=false,quiet=false;
try{quiet=sessionStorage.getItem('mech-dialogue-quiet')==='1';}catch{/* Storage is optional. */}

function hideWhenReady(){
  if(dialogue.hidden)return;
  if(dialogue.contains(document.activeElement)||view.matches(':focus-visible')||
    (fine.matches && stage.parentElement.matches(':hover'))){
    hideTimer=setTimeout(hideWhenReady,1000);
  }else dialogue.hidden=true;
}
function placeDialogue(){
  if(dialogue.hidden)return;
  const rect=stage.getBoundingClientRect();
  const spaceAbove=rect.top-(document.querySelector('.dk-nav')?.getBoundingClientRect().bottom||0);
  const spaceBelow=document.documentElement.clientHeight-rect.bottom;
  dialogue.toggleAttribute('data-above',spaceBelow<dialogue.offsetHeight && spaceAbove>spaceBelow);
}
window.addEventListener('scroll',placeDialogue,{passive:true});
window.addEventListener('resize',placeDialogue);
function speak(){
  clearTimeout(dwellTimer);clearTimeout(hideTimer);
  const next=(lineIndex+1)%lines.length;
  if(lineIndex>=0)lines[lineIndex].hidden=true;
  dialogue.hidden=false;lines[next].hidden=false;lineIndex=next;placeDialogue();
  if(!reduced.matches)hideTimer=setTimeout(hideWhenReady,7000);
}
function startDwell(){
  clearTimeout(dwellTimer);
  if(!quiet&&!document.hidden&&!reduced.matches&&dialogue.hidden&&!drag)dwellTimer=setTimeout(speak,350);
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
  quiet=true;clearTimeout(dwellTimer);clearTimeout(hideTimer);clearTimeout(idleTimer);
  const returnFocus=dialogue.contains(document.activeElement);
  dialogue.hidden=true;
  if(returnFocus)view.focus({preventScroll:true});
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
stage.querySelector('.mech-hint').hidden=false;
view.addEventListener('click',event=>{if(!suppressClick||event.detail===0)toggle();suppressClick=false;});
view.addEventListener('focus',()=>{focused=view.matches(':focus-visible');if(focused)startDwell();wake();});
view.addEventListener('blur',()=>{focused=false;clearTimeout(dwellTimer);wake();});
view.addEventListener('pointerenter',event=>{hover=event.pointerType==='mouse'&&fine.matches;if(hover)startDwell();wake();});
view.addEventListener('pointerleave',()=>{hover=false;aimX=aimY=0;clearTimeout(dwellTimer);wake();});
view.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0)return;
  clearTimeout(dwellTimer);suppressClick=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,yaw:targetYaw,pitch:targetPitch};
  view.setPointerCapture(event.pointerId);
});
view.addEventListener('pointermove',event=>{
  const rect=view.getBoundingClientRect();
  if(event.pointerType==='mouse'&&fine.matches){
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
document.addEventListener('visibilitychange',()=>{clearTimeout(dwellTimer);scheduleIdle();visibility();});
reduced.addEventListener('change',()=>{
  clearTimeout(dwellTimer);scheduleIdle();
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
start();
