// Gimbal is a single articulated mechanism. Each assembly has two mounting poses.
export function makeGimbal(T) {
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-2.2, 2.2, 2.2, -2.2, .1, 35);
  const machine = new T.Group();
  scene.add(machine);
  const pi = Math.PI, lerp = T.MathUtils.lerp, clamp = T.MathUtils.clamp;
  const surface = (color, metalness, roughness) => new T.MeshStandardMaterial({color, metalness, roughness});
  const ceramic = surface(0xe1e9e8, .36, .29), porcelain = surface(0xf6f1db, .30, .34);
  const teal = surface(0x116565, .56, .28), petrol = surface(0x15383d, .60, .29);
  const amber = surface(0xf29824, .40, .30), steel = surface(0x899da4, .80, .25);
  const carbon = surface(0x192830, .52, .35), rubber = surface(0x192126, .08, .79);
  const glass = surface(0x0c242d, .68, .13);
  const aqua = new T.MeshStandardMaterial({color:0x86f7ed,emissive:0x26bfac,emissiveIntensity:1.05,metalness:.28,roughness:.19});
  const pilot = new T.MeshStandardMaterial({color:0xffd58a,emissive:0xff9c23,emissiveIntensity:.77,metalness:.2,roughness:.2});
  // Broad photographic softboxes stay visible in curved lenses, wheels and shell bevels.
  const studio = document.createElement('canvas');
  studio.width=512; studio.height=256;
  const ctx=studio.getContext('2d'), sky=ctx.createLinearGradient(0,0,0,256);
  sky.addColorStop(0,'#e5f2ff'); sky.addColorStop(.38,'#94a8b4');
  sky.addColorStop(.54,'#344754'); sky.addColorStop(.72,'#697c89'); sky.addColorStop(1,'#263642');
  ctx.fillStyle=sky; ctx.fillRect(0,0,512,256);
  ctx.fillStyle='#ffeed0'; ctx.fillRect(46,45,98,65); ctx.fillStyle='#efffff'; ctx.fillRect(272,34,35,152); ctx.fillRect(369,40,88,39);
  scene.environment=new T.CanvasTexture(studio); scene.environment.mapping=T.EquirectangularReflectionMapping; scene.environment.colorSpace=T.SRGBColorSpace;
  scene.add(new T.HemisphereLight(0xeaf6ff,0x647785,1.12));
  for(const [color,power,x,y,z] of [[0xffe2bb,2.55,-3,6,5],[0xd2edff,1.45,4,3,3],[0x90e8ff,2.15,1,4,-4]]){
    const light=new T.DirectionalLight(color,power);light.position.set(x,y,z);scene.add(light);
  }
  const groups=[], batches=new Map();
  function assembly(from,to,stagger=0) {
    const group=new T.Group();machine.add(group);
    groups.push({group,from,to,stagger});return group;
  }
  function sub(parent,x=0,y=0,z=0){
    const g=new T.Group();g.position.set(x,y,z);parent.add(g);return g;
  }
  // Bake fixed detail into one draw call per material per articulation.
  const matrixObject=new T.Object3D(), v=new T.Vector3(), normalMatrix=new T.Matrix3();
  function solid(group,geometry,material,position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]) {
    if(!batches.has(group)) batches.set(group,new Map());
    const materials=batches.get(group);
    if(!materials.has(material)) materials.set(material,{p:[],n:[]});
    const {p,n}=materials.get(material);
    matrixObject.position.fromArray(position);matrixObject.rotation.set(...rotation);matrixObject.scale.fromArray(scale);matrixObject.updateMatrix();
    normalMatrix.getNormalMatrix(matrixObject.matrix);
    const pos=geometry.attributes.position,norm=geometry.attributes.normal,index=geometry.index;
    for(let j=0;j<(index?index.count:pos.count);j++){
      const i=index?index.getX(j):j;
      v.fromBufferAttribute(pos,i).applyMatrix4(matrixObject.matrix);p.push(v.x,v.y,v.z);
      v.fromBufferAttribute(norm,i).applyNormalMatrix(normalMatrix);n.push(v.x,v.y,v.z);
    }
    geometry.dispose();
  }
  // Loft clipped rectangular sections. Each section is [height,width,depth,fore-aft offset].
  function shell(group,rings,material,position=[0,0,0],rotation=[0,0,0]){
    const vertices=[],indices=[];
    for(const [y,w,d,z=0] of rings){
      const x=w/2,t=d/2,b=Math.min(w*.19,d*.23);
      for(const [px,pz] of [[-x+b,t],[x-b,t],[x,t-b],[x,-t+b],[x-b,-t],[-x+b,-t],[-x,-t+b],[-x,t-b]]) vertices.push(px,y,z+pz);
    }
    for(let k=1;k<rings.length;k++)for(let j=0;j<8;j++){
      const a=(k-1)*8+j,b=(k-1)*8+(j+1)%8;indices.push(a,b,a+8,b,b+8,a+8);
    }
    const last=(rings.length-1)*8;
    for(let j=1;j<7;j++) indices.push(0,j+1,j,last,last+j,last+j+1);
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);
    const flat=geo.toNonIndexed();geo.dispose();flat.computeVertexNormals();solid(group,flat,material,position,rotation);
  }
  function plate(g,p,w,h,d,m,rot=[0,0,0]){
    const bevel=Math.min(.045,h*.20);
    shell(g,[[-h/2,w*.91,d*.88],[-h/2+bevel,w,d],[h/2-bevel,w,d],[h/2,w*.91,d*.88]],m,p,rot);
  }
  function disc(g,p,r,depth,m,axis='z',segments=24,innerRadius=r){
    const rot=axis==='x'?[0,0,pi/2]:axis==='z'?[pi/2,0,0]:[0,0,0];
    solid(g,new T.CylinderGeometry(r,innerRadius,depth,segments),m,p,rot);
  }
  function ring(g,p,r,t,m,side=false){
    solid(g,new T.TorusGeometry(r,t,7,36),m,p,side?[0,pi/2,0]:[0,0,0]);
  }
  function bar(g,p,w,h,d,m,rot=[0,0,0]){solid(g,new T.BoxGeometry(w,h,d),m,p,rot);}
  function monogram(g,x,y,z,size,m){
    const stroke=(dx,dy,w,h)=>bar(g,[x+dx*size,y+dy*size,z],w*size,h*size,.009,m);
    stroke(-.36,.04,.15,.69);stroke(-.52,-.24,.44,.15);
    stroke(.05,.04,.15,.69);stroke(.244,-.24,.52,.15);
  }
  function link(g,a,b,r,m){
    const start=new T.Vector3(...a),end=new T.Vector3(...b),diff=end.clone().sub(start);
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),diff.clone().normalize());
    const e=new T.Euler().setFromQuaternion(q);
    solid(g,new T.CylinderGeometry(r,r,diff.length(),10),m,start.lerp(end,.5).toArray(),[e.x,e.y,e.z]);
  }
  // A small elliptical contact shadow grounds both the upright and the four-wheel pose.
  const stamp=document.createElement('canvas');stamp.width=stamp.height=96;
  const sc=stamp.getContext('2d'),shadowInk=sc.createRadialGradient(48,48,0,48,48,48);
  shadowInk.addColorStop(0,'rgba(10,22,32,.70)');shadowInk.addColorStop(.45,'rgba(10,22,32,.43)');shadowInk.addColorStop(1,'rgba(10,22,32,0)');
  sc.fillStyle=shadowInk;sc.fillRect(0,0,96,96);
  const shadow=new T.Mesh(new T.PlaneGeometry(3.1,2.1),new T.MeshBasicMaterial({map:new T.CanvasTexture(stamp),transparent:true,depthWrite:false}));
  shadow.rotation.x=-pi/2;shadow.position.y=.012;machine.add(shadow);

  const core=assembly([0,2.29,0,0,0,0],[0,.72,.15,-1.42,0,0],.16);
  shell(core,[[-.47,.72,.48],[-.27,1.04,.64],[.14,1.43,.78],[.36,1.16,.62]],carbon);
  shell(core,[[-.32,.50,.11],[-.08,.77,.24],[.27,.57,.16]],teal,[0,0,.35]);
  for(const side of [-1,1]){
    shell(core,[[-.23,.24,.20,.02],[-.05,.55,.36],[.17,.59,.41],[.30,.43,.30]],ceramic,[side*.435,.015,.27],[0,side*.22,-side*.24]);
    bar(core,[side*.46,.14,.49],.28,.038,.022,petrol,[0,side*.24,-side*.24]);
    bar(core,[side*.45,.155,.51],.20,.018,.012,aqua,[0,side*.24,-side*.24]);
    for(let j=0;j<3;j++)bar(core,[side*(.34+j*.073),-.012,.493],.028,.117,.025,steel,[0,side*.22,-side*.34]);
    link(core,[side*.27,-.48,.10],[side*.57,.03,.06],.062,steel);
    plate(core,[side*.49,.02,-.35],.29,.63,.21,petrol,[.12,0,side*.06]);
  }
  disc(core,[0,.06,.50],.155,.065,steel,'z',12);disc(core,[0,.06,.54],.126,.05,carbon,'z',12);
  ring(core,[0,.06,.572],.096,.013,aqua);disc(core,[0,.06,.577],.055,.015,teal,'z',6);
  monogram(core,.42,-.080,.495,.155,petrol);
  for(let j=0;j<3;j++)plate(core,[0,-.18-j*.09,.362-j*.03],.35-j*.04,.043,.08,steel);
  // A split optical head gives the survey platform a recognizable face in both poses.
  const neck=assembly([0,2.86,.02,0,0,0],[0,1.235,-.33,0,0,0],.04);
  disc(neck,[0,-.10,0],.205,.23,carbon,'y');ring(neck,[0,-.045,.015],.17,.022,steel);
  const head=sub(neck,0,.10,0);
  shell(head,[[-.21,.44,.43],[-.11,.68,.59],[.14,.66,.58],[.21,.48,.40,-.035]],ceramic);
  plate(head,[0,.005,.258],.65,.29,.12,carbon);
  plate(head,[0,.14,.27],.70,.068,.17,teal,[-.12,0,-.045]);
  for(const [x,y,r,m] of [[-.113,.005,.122,aqua],[.15,.005,.078,pilot]]){
    disc(head,[x,y,.326],r*1.22,.08,steel);disc(head,[x,y,.376],r,.052,glass);
    ring(head,[x,y,.405],r*.77,.012,m);disc(head,[x,y,.41],r*.44,.017,teal);
    solid(head,new T.SphereGeometry(1,22,12),glass,[x,y,.420],[0,0,0],[r*.53,r*.53,r*.19]);
    ring(head,[x,y,.434],r*.35,.005,m);
    disc(head,[x-.016,y+.024,.447],r*.108,.007,porcelain);
  }
  for(const side of [-1,1])disc(head,[side*.323,.008,-.035],.103,.074,petrol,'x',12);
  plate(head,[-.29,.186,-.091],.098,.24,.12,amber,[.13,0,.15]);bar(head,[-.307,.317,-.105],.042,.048,.07,pilot);

  const waist=assembly([0,1.68,0,0,0,0],[0,.57,.82,-1.39,0,0],.22);
  shell(waist,[[-.23,.60,.39],[-.12,.88,.59],[.12,.81,.56],[.21,.63,.41]],petrol);
  plate(waist,[0,.028,.29],.54,.22,.12,porcelain);
  for(let i=0;i<3;i++)bar(waist,[(i-1)*.092,.034,.36],.047,.122,.018,i===0?amber:carbon,[0,0,-.28]);

  // The two long panels behind the shoulders meet over the front axle as the bonnet.
  const rearDeck=assembly([0,1.97,-.33,-1.46,0,0],[0,.54,-.73,.025,0,0],.12);
  shell(rearDeck,[[-.13,1.23,1.05],[-.05,1.35,1.12],[.08,1.25,1.07],[.14,1.00,.86]],petrol);
  for(let j=0;j<5;j++)plate(rearDeck,[0,.144,-.35+j*.109],.72,.035,.054,steel);
  for(const s of [-1,1]){
    bar(rearDeck,[s*.45,.015,-.535],.26,.045,.035,amber);
    const bonnet=assembly([s*.47,2.59,-.41,-1.40,s*.07,-s*.16],[s*.30,.66,.91,-.105,s*.035,0],.17);
    shell(bonnet,[[-.105,.61,1.05,.015],[-.035,.648,1.14],[.067,.57,1.09],[.12,.42,.83,-.06]],ceramic);
    plate(bonnet,[s*.17,.108,-.034],.097,.029,.79,teal,[-.013,0,0]);
    plate(bonnet,[s*.17,.126,.17],.069,.018,.18,amber);
    plate(bonnet,[0,-.003,.551],.44,.078,.045,carbon,[-.06,0,0]);
    plate(bonnet,[0,.002,.58],.322,.032,.018,aqua);
    for(let j=0;j<3;j++)bar(bonnet,[-s*.115,.132,-.24-j*.068],.147,.015,.019,petrol,[0,s*.24,0]);
    for(let k=0;k<2;k++)bar(bonnet,[s*(.145+k*.074),.035,.52],.032,.094,.048,petrol,[-.53,0,-s*.22]);
    // Articulated suspension rails telescope out from the upper and lower chassis.
    const frontAxle=assembly([s*.88,1.995,.015,-.06,0,s*.09],[s*.61,.325,.925,0,0,s*.08],.20);
    link(frontAxle,[-s*.23,.05,-.08],[s*.23,-.03,0],.052,steel);
    link(frontAxle,[-s*.23,.04,.09],[s*.23,-.03,0],.043,carbon);
    const rearAxle=assembly([s*.465,.76,-.05,0,0,0],[s*.61,.33,-.917,0,0,s*.05],.23);
    link(rearAxle,[-s*.23,.05,0],[s*.23,-.03,0],.057,steel);
  }

  const frontWheels=[];
  function wheel(group,side){
    disc(group,[0,0,0],.264,.173,rubber,'x',32);
    for(let i=0;i<28;i++){
      const a=i*pi/14;
      bar(group,[0,.264*Math.cos(a),.264*Math.sin(a)],.148,.009,.021,carbon,[a,.12*side,0]);
    }ring(group,[side*.062,0,0],.224,.061,rubber,true);
    disc(group,[side*.103,0,0],.196,.041,steel,'x',28);disc(group,[side*.13,0,0],.153,.022,carbon,'x',24);
    ring(group,[side*.15,0,0],.138,.012,teal,true);
    for(let j=0;j<6;j++){
      const a=j*pi/3;bar(group,[side*.147,.079*Math.cos(a),.079*Math.sin(a)],.021,.13,.032,steel,[a,0,0]);
    }
    disc(group,[side*.17,0,0],.05,.037,amber,'x',6);
    for(let j=0;j<5;j++){
      const a=j*2*pi/5;
      disc(group,[side*.132,.172*Math.cos(a),.172*Math.sin(a)],.010,.011,carbon,'x',6);
    }
  }
  for(const s of [-1,1]){
    const shoulder=assembly([s*.805,2.49,-.028,.08,0,-s*.16],[s*.72,.70,.63,-1.38,0,s*.035],.01);
    disc(shoulder,[s*.04,-.012,0],.221,.34,steel,'x',16);
    shell(shoulder,[[-.15,.49,.50],[-.035,.61,.62],[.19,.49,.55],[.245,.28,.40]],s===1?amber:ceramic,[0,.04,0]);
    bar(shoulder,[s*.022,.09,.31],.27,.041,.018,carbon);
    bar(shoulder,[s*.103,.09,.322],.067,.032,.01,pilot);
    for(let k=0;k<3;k++)bar(shoulder,[s*(-.077+k*.052),.164,.295],.022,.041,.028,carbon,[0,0,-s*.32]);
    plate(shoulder,[s*.219,.056,.145],.11,.18,.15,petrol,[0,s*.70,0]);
    plate(shoulder,[s*.236,.066,.177],.082,.08,.136,steel,[0,s*.70,0]);
    const arm=assembly([s*.895,2.14,.015,.04,0,s*.11],[s*.76,.55,.65,-1.34,0,0],.12);
    link(arm,[0,-.20,.04],[0,.19,-.02],.09,steel);plate(arm,[0,.015,0],.235,.26,.27,petrol);
    const fore=assembly([s*1.005,1.815,.145,-.16,0,s*.08],[s*.74,.60,1.03,-1.40,0,0],.24);
    disc(fore,[0,.16,-.04],.157,.36,carbon,'x',16);
    shell(fore,[[-.27,.25,.23,.09],[-.16,.36,.33,.065],[.15,.35,.38],[.22,.25,.31]],teal);
    plate(fore,[0,-.014,.174],.245,.32,.087,ceramic,[-.17,0,0]);
    for(const finger of [-1,1]) {
      plate(fore,[finger*.081,-.27,.095],.095,.18,.13,steel,[-.18,0,-finger*.13]);
      plate(fore,[finger*.072,-.36,.12],.070,.08,.093,carbon,[-.29,0,finger*.23]);
    }
    const front=assembly([s*1.128,1.89,.035,0,0,s*.05],[s*.881,.29,.93,0,0,0],.22);
    const steer=sub(front);frontWheels.push(steer);wheel(steer,s);
    const thigh=assembly([s*.40,1.36,-.03,-.09,0,-s*.11],[s*.56,.61,-.40,-1.60,0,s*.04],.13);
    disc(thigh,[0,.19,0],.156,.26,steel,'x',14);
    shell(thigh,[[-.24,.24,.27,.065],[-.12,.30,.34,.024],[.13,.39,.42],[.21,.33,.34]],ceramic);
    plate(thigh,[0,.012,.191],.18,.26,.061,teal,[-.14,0,0]);
    const shin=assembly([s*.466,.775,.043,.075,0,-s*.064],[s*.72,.61,-.87,1.42,0,0],.29);
    disc(shin,[0,.253,.005],.166,.35,carbon,'x',16);
    shell(shin,[[-.38,.26,.31,-.02],[-.23,.31,.39],[.18,.40,.43,.02],[.28,.30,.32,.035]],teal);
    shell(shin,[[-.25,.17,.083],[-.10,.24,.12],[.19,.31,.14],[.27,.22,.09]],porcelain,[0,0,.19]);
    for(let k=0;k<3;k++)bar(shin,[0,-.128+k*.048,.257],.105+k*.017,.014,.014,petrol,[0,0,-s*.15]);
    for(const k of [-1,1])disc(shin,[k*.119,.12,.257],.018,.014,steel,'z',6);
    plate(shin,[0,.24,.23],.28,.14,.11,amber,[.16,0,0]);
    for(const dx of [-.095,.095])link(shin,[dx,-.32,-.11],[dx,.18,-.18],.032,steel);
    const rear=assembly([s*.64,.683,-.08,0,0,0],[s*.883,.29,-.92,0,0,0],.26);wheel(rear,s);
    const foot=assembly([s*.49,.257,.11,-.025,s*.10,0],[s*.59,.51,-1.18,.02,pi,0],.31);
    shell(foot,[[-.19,.41,.66,.11],[-.10,.44,.70,.12],[.056,.37,.60,.085],[.14,.27,.33,-.02]],carbon);
    shell(foot,[[-.105,.40,.32,.26],[-.02,.38,.34,.255],[.053,.28,.26,.23]],ceramic);
    shell(foot,[[-.13,.39,.30,.35],[-.04,.38,.35,.355],[.035,.26,.24,.31]],teal);
    bar(foot,[0,-.055,.532],.21,.036,.024,pilot);
  }
  for(const [group,materials] of batches)for(const [mat,attrs] of materials){
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(attrs.p,3));
    geo.setAttribute('normal',new T.Float32BufferAttribute(attrs.n,3));group.add(new T.Mesh(geo,mat));
  }

  const pathGeometry=new T.BufferGeometry();
  const pathVertices=new Float32Array(28*6*3);
  pathGeometry.setAttribute('position',new T.BufferAttribute(pathVertices,3));
  const pathMaterial=new T.MeshBasicMaterial({color:0x36cbbd,transparent:true,opacity:.78,side:T.DoubleSide,depthWrite:false});
  const trajectory=new T.Mesh(pathGeometry,pathMaterial);trajectory.frustumCulled=false;machine.add(trajectory);
  function drawPath(turn){
    const point=(u,side)=>[(-u*u*.91*turn)+side*.035,.025,1.24+u*1.05];
    for(let i=0;i<28;i++){
      const a=i/28,b=(i+.74)/28;
      const points=[point(a,-1),point(a,1),point(b,-1),point(a,1),point(b,1),point(b,-1)];
      for(let j=0;j<6;j++)pathVertices.set(points[j],(i*6+j)*3);
    }
    pathGeometry.attributes.position.needsUpdate=true;
  }
  let lastIntent=NaN;
  function pose(progress,yaw,pitch,turn,time,still) {
    for(const {group,from,to,stagger} of groups){
      const t=clamp((progress-stagger*.49)/(1-stagger*.49),0,1);
      const k=t*t*(3-2*t), clearance=Math.sin(pi*k);
      group.position.set(lerp(from[0],to[0],k)+Math.sign(from[0])*.10*clearance,lerp(from[1],to[1],k)+.15*clearance,lerp(from[2],to[2],k));
      group.rotation.set(lerp(from[3],to[3],k),lerp(from[4],to[4],k),lerp(from[5],to[5],k));
    }
    const idle=still?0:Math.sin(time*1.45);
    core.position.y+=idle*.018*(1-progress);neck.position.y+=idle*.019*(1-progress);
    head.rotation.y=(still?0:Math.sin(time*.67)*.12)*(1-progress)-turn*.35*progress;
    head.rotation.z=idle*.021*(1-progress);
    for(const wheel of frontWheels)wheel.rotation.y=-turn*.54*progress;
    trajectory.visible=progress>.75;pathMaterial.opacity=clamp((progress-.75)*3.5,0,.78);
    if(lastIntent!==turn){drawPath(turn);lastIntent=turn;}
    shadow.scale.set(lerp(1,1.05,progress),lerp(.9,1.65,progress),1);
    const focusY=lerp(1.54,.73,progress);
    const angle=yaw+lerp(.30,.47,progress),elevation=pitch+lerp(.12,.40,progress);
    const distance=8,flat=distance*Math.cos(elevation);
    camera.position.set(flat*Math.sin(angle),focusY+distance*Math.sin(elevation),flat*Math.cos(angle));
    camera.lookAt(0,focusY,0);
    const half=lerp(2.06,2.20,progress);camera.top=half;camera.bottom=-half;camera.right=half;camera.left=-half;
    camera.updateProjectionMatrix();
  }
  return {scene,camera,pose};
}
