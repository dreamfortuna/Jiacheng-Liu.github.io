import * as THREE from './three.module.min.js';

const TAU = Math.PI * 2;

// Sweep an elliptical cross-section around a gently buckled loop. Its changing
// local frame folds the satin surface towards and away from the light.
function ribbon(warm) {
  const segments = 192, sides = 40;
  const vertices = [], colors = [], indices = [];
  const dark = new THREE.Color(warm ? '#b95852' : '#685caa');
  const pale = new THREE.Color(warm ? '#ffd7aa' : '#d9c9fc');
  const edge = new THREE.Color(warm ? '#ffe3af' : '#b5d9ee');
  const tint = new THREE.Color();
  const tangent = new THREE.Vector3(), radial = new THREE.Vector3(), normal = new THREE.Vector3();
  const phase = warm ? .14 : 1.85;
  for (let i = 0; i < segments; i++) {
    const u = i * TAU / segments, c = Math.cos(u), s = Math.sin(u);
    const x = 1.16*c + .11*Math.cos(2*u+phase), y = .98*s, z = .28*Math.sin(2*u+phase);
    tangent.set(-1.16*s-.22*Math.sin(2*u+phase), .98*c, .56*Math.cos(2*u+phase)).normalize();
    radial.set(c,s,0).addScaledVector(tangent,-(c*tangent.x+s*tangent.y)).normalize();
    normal.crossVectors(tangent,radial).normalize();
    const twist = .9*Math.sin(u+phase) + .58*Math.sin(2*u-.5);
    const width = .29 + .09*Math.cos(u+.5), thickness = .098+.018*Math.sin(u);
    for (let j=0; j<sides; j++) {
      const v = j*TAU/sides, a = width*Math.cos(v), b = thickness*Math.sin(v);
      const r = a*Math.cos(twist)-b*Math.sin(twist), n = a*Math.sin(twist)+b*Math.cos(twist);
      vertices.push(x+radial.x*r+normal.x*n, y+radial.y*r+normal.y*n, z+radial.z*r+normal.z*n);
      tint.copy(dark).lerp(pale,.52+.46*Math.cos(u-.65*Math.sin(v)+phase));
      const seam = Math.pow(.5+.5*Math.cos(v+.08),19);
      tint.lerp(edge,.62*seam);
      colors.push(tint.r,tint.g,tint.b);
      const current=i*sides+j, next=i*sides+(j+1)%sides;
      const ahead=((i+1)%segments)*sides+j, diagonal=((i+1)%segments)*sides+(j+1)%sides;
      indices.push(current,next,ahead,next,diagonal,ahead);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors:true, roughness:.27, metalness:.25, clearcoat:.72, clearcoatRoughness:.24,
    side:THREE.DoubleSide, envMapIntensity:.78
  });
  return new THREE.Mesh(geometry, material);
}

// Rectangular softboxes reflected in the two curved surfaces, baked once at start.
function studio(renderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color('#85818c');
  const cards = [[-3,4,3,3,6,4],[4,2,-1,5,2,3],[1,-3,3,5,3,.18],[-2,1,-3,1,5,2]];
  for (const [x,y,z,w,h,level] of cards) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({color:new THREE.Color(level,level,level),side:THREE.DoubleSide}));
    panel.position.set(x,y,z);panel.lookAt(0,0,0);room.add(panel);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(room,.035);
  generator.dispose();
  room.children.forEach(m=>{m.geometry.dispose();m.material.dispose();});
  return target;
}

export function createStudy(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setClearColor(0,0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .96;
  const scene = new THREE.Scene(), environment = studio(renderer);
  scene.environment = environment.texture;
  const group = new THREE.Group(), human = ribbon(true), system = ribbon(false);
  group.add(human,system);scene.add(group);
  const fill = new THREE.HemisphereLight(0xfff5ec,0xb0a6cc,1.1);
  const key = new THREE.DirectionalLight(0xfff5ed,2.05);
  key.position.set(-3,5,4);scene.add(fill,key);
  const rim = new THREE.DirectionalLight(0xe1dcff,1.05);
  rim.position.set(4,1,-2);scene.add(rim);
  const camera = new THREE.OrthographicCamera(-2.7,2.7,2.25,-2.25,.1,25);
  camera.position.set(0,.06,8);camera.lookAt(0,0,0);
  return {
    resize(width,height,dpr=1) {
      renderer.setPixelRatio(Math.min(dpr,1.8));
      renderer.setSize(width,height,false);
      const aspect=width/height, extent=Math.max(1.76,2.43/aspect);
      camera.left=-extent*aspect;camera.right=extent*aspect;camera.top=extent;camera.bottom=-extent;
      camera.updateProjectionMatrix();
    },
    draw(time,apart,pointerX=0,pointerY=0) {
      human.position.set(-.43-.68*apart,.13+.14*apart,.12);
      system.position.set(.44+.66*apart,-.18-.06*apart,-.14);
      human.rotation.set(.38+.12*Math.sin(time*.21),-.48-.39*apart,.62+.09*Math.sin(time*.3));
      system.rotation.set(.97-.31*apart+.09*Math.sin(time*.24),.46+.3*apart,-.77+.1*Math.sin(time*.3+.9));
      group.rotation.set(.05+pointerY*.15,-.10+pointerX*.22+.13*Math.sin(time*.27),-.075);
      group.position.y=.01+.045*Math.sin(time*.63);
      renderer.render(scene,camera);
    },
    dispose() {
      for (const band of [human,system]) { band.geometry.dispose();band.material.dispose(); }
      environment.dispose();renderer.dispose();
    }
  };
}
