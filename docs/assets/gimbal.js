import { loadThree } from './three-loader.js';

const stage = document.querySelector('.gimbal-stage');
const view = stage.querySelector('.gimbal-view');
const poster = stage.querySelector('.gimbal-poster');
const controls = stage.querySelector('.gimbal-controls');
const transform = controls.querySelector('.gimbal-transform');
const intentGroup = stage.querySelector('.gimbal-intent');
const stateLabel = controls.querySelector('.gimbal-state');
const hint = controls.querySelector('.gimbal-hint');
const announcement = stage.querySelector('.gimbal-announcement');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const descriptions = ['左转', '直行', '右转'];
const base = new URL('.', import.meta.url);
let driver = false, intent = 0, progress = 0, steering = 0;
let yaw = .15, pitch = .085, targetYaw = yaw, targetPitch = pitch;
let renderer, model, frame = 0, previous = 0, elapsed = 0, visible = true, contextLost = false;
const compact = matchMedia('(max-width: 720px)').matches;
const limit = (x, low, high) => Math.max(low, Math.min(high, x));

function showState(announce = true) {
  const form = driver ? '协同驾驶' : '协作机甲';
  stage.dataset.form = driver ? 'driver' : 'walker';
  intentGroup.hidden = !driver;
  stateLabel.textContent = form;
  transform.textContent = driver ? '展开机甲' : '切换驾驶态';
  const image = driver ? 'gimbal-drive-' + ['left','ahead','right'][intent + 1] : 'gimbal-walker';
  poster.src = new URL(image + '.webp', base);
  poster.alt = driver ? '衡枢已折叠成四轮感知车，前轮与地面轨迹指示' + descriptions[intent+1] + '。' : '衡枢，带有双目感知器和四个折叠车轮的白色与琥珀色机甲。';
  hint.textContent = driver ? '轨迹显示所选驾驶意图' : (stage.hasAttribute('data-live') ? '拖动旋转 · 点击变形' : '点击形象可变形');
  const label = form + (driver ? '，驾驶意图为' + descriptions[intent+1] : '');
  view.setAttribute('aria-label', label + '。点击变形，三维视图中可用方向键旋转。');
  for (const choice of intentGroup.querySelectorAll('button')) {
    choice.setAttribute('aria-pressed', String(Number(choice.dataset.intent) === intent));
  }
  if (announce) announcement.textContent = label;
}
function toggleForm() {
  driver = !driver;
  if (!driver) intent = 0;
  showState(); requestFrame();
}
view.setAttribute('role','button'); view.tabIndex = 0;
controls.hidden = false;
transform.addEventListener('click',toggleForm);
intentGroup.addEventListener('click', event => {
  const choice = event.target.closest('button[data-intent]');
  if (!choice) return;
  intent = Number(choice.dataset.intent); showState(); requestFrame();
});

let drag = null, dragged = false;
view.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  dragged = false;
  drag = {id:event.pointerId,x:event.clientX,y:event.clientY,yaw:targetYaw,pitch:targetPitch};
  view.setPointerCapture(event.pointerId);
});
view.addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 6) dragged = true;
  if (!dragged || !stage.hasAttribute('data-live')) return;
  targetYaw = drag.yaw - dx * .013;
  targetPitch = limit(drag.pitch + dy * .007, -.09, .88);
  requestFrame();
});
view.addEventListener('pointercancel', () => {drag = null; dragged = true;});
view.addEventListener('lostpointercapture', () => {drag = null;});
view.addEventListener('click', () => {if (!dragged) toggleForm(); dragged = false;});
view.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault(); if (!event.repeat) toggleForm(); return;
  }
  if (!stage.hasAttribute('data-live') || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Home') { targetYaw = .15; targetPitch = .085; }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') targetYaw += event.key === 'ArrowLeft' ? -.26 : .26;
  else targetPitch = limit(targetPitch + (event.key === 'ArrowUp' ? .14 : -.14), -.09, .88);
  requestFrame();
});
showState(false);

function render(now) {
  frame = 0;
  const delta = Math.min(.10, Math.max(0, (now - previous)/1000));
  if (!reduced.matches && now - previous < (compact ? 32 : 23)) { requestFrame(); return; }
  previous = now; elapsed += delta;
  const instant = reduced.matches;
  const target = Number(driver), step = delta / 1.22;
  progress = instant ? target : progress + limit(target-progress, -step, step);
  const blend = instant ? 1 : 1-Math.exp(-delta*13);
  steering += (intent-steering)*blend;
  if (Math.abs(intent-steering)<.002) steering=intent;
  yaw += (targetYaw-yaw)*blend; pitch += (targetPitch-pitch)*blend;
  model.pose(progress,yaw,pitch,steering,elapsed,instant);
  renderer.render(model.scene,model.camera);
  if (!instant) requestFrame();
}
function requestFrame() {
  if (!model || contextLost || !visible || document.hidden || frame) return;
  frame = requestAnimationFrame(render);
}
function resize() {
  if (!renderer || contextLost || !view.clientWidth) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,compact ? 1.35 : 1.7));
  renderer.setSize(view.clientWidth,view.clientHeight,false);
  requestFrame();
}
function syncVisibility(){
  if (!visible || document.hidden) {cancelAnimationFrame(frame);frame=0;}
  else {previous=performance.now()-40;requestFrame();}
}
new IntersectionObserver(entries => {
  visible=entries[entries.length-1].isIntersecting;
  syncVisibility();
}).observe(view);
document.addEventListener('visibilitychange',syncVisibility);
reduced.addEventListener('change',requestFrame);
new ResizeObserver(resize).observe(view);

async function start(){
  if (navigator.connection?.saveData) return;
  const canvas = document.createElement('canvas');
  // Keep a fully usable two-form poster on hardware without WebGL.
  try {
    const [T,{makeGimbal}] = await Promise.all([loadThree(),import('./gimbal-model.js')]);
    const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
    if (!gl) return;
    renderer=new T.WebGLRenderer({canvas,context:gl,alpha:true,antialias:true});
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    renderer.setClearColor(0,0);
    model=makeGimbal(T);
    canvas.setAttribute('aria-hidden','true');
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();contextLost=true;cancelAnimationFrame(frame);frame=0;
      stage.removeAttribute('data-live');showState(false);
    });
    canvas.addEventListener('webglcontextrestored',()=>{
      contextLost=false;resize();model.pose(progress,yaw,pitch,steering,elapsed,reduced.matches);
      renderer.render(model.scene,model.camera);stage.setAttribute('data-live','');showState(false);requestFrame();
    });
    resize();
    progress=Number(driver);steering=intent;
    model.pose(progress,yaw,pitch,steering,0,reduced.matches);
    renderer.render(model.scene,model.camera);
    view.append(canvas);stage.setAttribute('data-live','');showState(false);
    previous=performance.now()-40;requestFrame();
  } catch(error) {
    cancelAnimationFrame(frame);frame=0;model=null;renderer?.dispose();renderer=null;canvas.remove();
    stage.removeAttribute('data-live');showState(false);
    console.warn('Gimbal 3D preview unavailable',error);
  }
}
start();
