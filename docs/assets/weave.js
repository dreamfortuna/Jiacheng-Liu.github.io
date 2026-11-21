const study = document.querySelector('[data-weave]');
const stage = study.querySelector('.sculpture');
const image = stage.querySelector('img');
const controls = study.querySelector('.weave-controls');
const toggle = controls.querySelector('.weave-toggle');
const motion = controls.querySelector('.motion');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let scene, canvas, loading = false, fallback = false, visible = false;
let frame = 0, previous = 0, time = 0, apart = 0, target = 0;
let pointerX = 0, pointerY = 0, viewX = 0, viewY = 0, paused = reduced.matches;
controls.hidden = false;
motion.hidden = true;

function motionLabel() {
  motion.textContent = paused ? '▷' : 'Ⅱ';
  const label = paused ? '播放动画' : '暂停动画';
  motion.setAttribute('aria-label',label);motion.title = label;
}

function draw(now) {
  frame = 0;
  if (!scene || !visible || document.hidden) return;
  const dt = previous ? Math.min(.05,(now-previous)/1000) : 0;
  previous = now;
  if (!paused) time += dt;
  const blend = 1 - Math.exp(-dt*6);
  apart = paused ? target : apart+(target-apart)*blend;
  viewX += (pointerX-viewX)*blend;
  viewY += (pointerY-viewY)*blend;
  scene.draw(time,apart,viewX,viewY);
  if (!paused) frame = requestAnimationFrame(draw);
}

function sync() {
  cancelAnimationFrame(frame);frame = 0;previous = 0;
  if (scene && visible && !document.hidden) frame = requestAnimationFrame(draw);
}

function size() {
  if (!scene || !stage.clientWidth || !stage.clientHeight) return;
  scene.resize(stage.clientWidth,stage.clientHeight,devicePixelRatio);
  scene.draw(time,apart,viewX,viewY);
}

async function start() {
  if (scene || loading || fallback || paused || !visible) return;
  loading = true;
  try {
    const {createStudy} = await import('./weave-scene.js');
    if (!visible || paused) return;
    canvas = document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
    scene = createStudy(canvas);
    canvas.addEventListener('webglcontextlost',() => {
      fallback = true;delete study.dataset.live;cancelAnimationFrame(frame);scene?.dispose();scene=null;motion.hidden=true;
    },{once:true});
    stage.append(canvas);size();study.dataset.live='';motion.hidden=false;motionLabel();sync();
  } catch {
    fallback=true;scene?.dispose();scene=null;canvas?.remove();delete study.dataset.live;
  } finally { loading=false; }
}

toggle.addEventListener('click',()=>{
  target=1-target;toggle.setAttribute('aria-pressed',String(!target));
  toggle.textContent=target ? '双环分开' : '双环交织';
  image.src=target ? 'assets/weave-apart.webp' : 'assets/weave-paired.webp';
  image.alt=target ? '杏橙与蓝紫两条带状曲面分开排列。' : '杏橙与蓝紫两条带状曲面相互穿过。';
  sync();
});
motion.addEventListener('click',()=>{paused=!paused;motionLabel();sync();});
stage.addEventListener('pointermove',event=>{
  if (paused || event.pointerType!=='mouse') return;
  const box=stage.getBoundingClientRect();
  pointerX=(event.clientX-box.left)/box.width*2-1;
  pointerY=(event.clientY-box.top)/box.height*2-1;
});
stage.addEventListener('pointerleave',()=>{pointerX=0;pointerY=0;});
new ResizeObserver(size).observe(stage);
new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;start();sync();}).observe(study);
document.addEventListener('visibilitychange',sync);
reduced.addEventListener('change',()=>{paused=reduced.matches;motionLabel();start();sync();});
