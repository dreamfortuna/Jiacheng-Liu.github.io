// An orthographic location globe. The marker represents Beihang University in Beijing.
const panel = document.querySelector('#location-panel');
const canvas = panel.querySelector('canvas');
const context = canvas.getContext('2d');
const radians = Math.PI / 180;
const latitude = 32 * radians;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let longitude = 105;
let coastlines;
let busy = false;
let visible = false;
let frame = 0;
let lastTime = 0;

function project(lon, lat) {
  const delta = (lon - longitude) * radians;
  const phi = lat * radians;
  const x = Math.cos(phi) * Math.sin(delta);
  const y = Math.cos(latitude) * Math.sin(phi) - Math.sin(latitude) * Math.cos(phi) * Math.cos(delta);
  const z = Math.sin(latitude) * Math.sin(phi) + Math.cos(latitude) * Math.cos(phi) * Math.cos(delta);
  return [150 + 104 * x, 120 - 104 * y, z];
}

function stroke(points, color) {
  context.beginPath();
  let penDown = false;
  for (const [lon,lat] of points) {
    const [x,y,z] = project(lon,lat);
    if (z > 0) {
      if (penDown) context.lineTo(x,y);
      else context.moveTo(x,y);
    }
    penDown = z > 0;
  }
  context.strokeStyle = color;
  context.stroke();
}

const grid = [];
for (let meridian = -180; meridian < 180; meridian += 30)
  grid.push(Array.from({length: 61}, (_, i) => [meridian, -90 + i * 3]));
for (let parallel = -60; parallel <= 60; parallel += 30)
  grid.push(Array.from({length: 121}, (_, i) => [-180 + i * 3, parallel]));

function draw(time) {
  if (lastTime && !reduced.matches) longitude += Math.min(time - lastTime, 100) * .003;
  lastTime = time;
  context.clearRect(0,0,300,240);
  context.beginPath();
  context.arc(150,120,104,0,2*Math.PI);
  context.fillStyle = '#0d2038';
  context.fill();
  context.strokeStyle = '#347590';
  context.stroke();
  for (const points of grid) stroke(points, 'rgba(83,163,200,.22)');
  for (const points of coastlines) stroke(points, '#60bed2');
  const [x,y,z] = project(116.35,39.98);
  if (z > 0) {
    context.beginPath();
    context.arc(x,y,4,0,2*Math.PI);
    context.fillStyle = '#f0c34e';
    context.fill();
  }
  if (!reduced.matches) frame = requestAnimationFrame(draw);
}

async function sync() {
  cancelAnimationFrame(frame);
  lastTime = 0;
  if (!context || !panel.open || !visible || document.hidden) return;
  if (!coastlines) {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch(new URL('coastlines.json', import.meta.url));
      if (response.ok) coastlines = await response.json();
    } catch {
      // Leave the location caption available and retry when the panel reopens.
      return;
    } finally {
      busy = false;
    }
    if (coastlines) sync();
    return;
  }
  frame = requestAnimationFrame(draw);
}

new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(panel);
panel.addEventListener('toggle', sync);
reduced.addEventListener('change', sync);
document.addEventListener('visibilitychange', sync);
