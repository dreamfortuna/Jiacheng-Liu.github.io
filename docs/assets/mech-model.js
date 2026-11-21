// Both forms use the same chassis, split glazing, hinged covers, and four wheel carriers.
export function makeMech(T) {
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-2.2, 2.2, 2.2, -2.2, .1, 35);
  const machine = new T.Group();
  scene.add(machine);
  const pi = Math.PI, lerp = T.MathUtils.lerp, clamp = T.MathUtils.clamp;
  const surface = (color, metalness, roughness) => new T.MeshStandardMaterial({color, metalness, roughness});
  const ceramic = surface(0xafc8c8, .64, .26), porcelain = surface(0xe1ded2, .54, .26);
  const teal = surface(0x115255, .68, .27), petrol = surface(0x15383d, .60, .29);
  const amber = surface(0xe88419, .55, .26), steel = surface(0x899da4, .80, .25);
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
  scene.add(new T.HemisphereLight(0xeaf6ff,0x526570,.78));
  for(const [color,power,x,y,z] of [[0xffe2bb,2.55,-3,6,5],[0xd2edff,1.45,4,3,3],[0x90e8ff,2.15,1,4,-4]]){
    const light=new T.DirectionalLight(color,power);light.position.set(x,y,z);scene.add(light);
    if(x<0){
      light.castShadow=true;light.shadow.mapSize.set(1024,1024);
      Object.assign(light.shadow.camera,{left:-3,right:3,top:4,bottom:-3,near:.15,far:15});
      light.shadow.camera.updateProjectionMatrix();light.shadow.bias=-.00045;light.shadow.normalBias=.015;
    }
  }
  const groups=[], batches=new Map();
  function assembly(from,to,phase="frame",sweep=0) {
    const group=new T.Group();machine.add(group);
    groups.push({group,from,to,phase,sweep});return group;
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

  const graphite=surface(0x33454e,.76,.29), bronze=surface(0xb87942,.71,.27);
  const glazing=new T.MeshPhysicalMaterial({color:0x0b2636,metalness:.57,roughness:.095,clearcoat:1,clearcoatRoughness:.06});
  const joints=[], carriers=[], covers=[], optics=[], lights=[];
  function blade(g,outline,depth,m,position,rotation=[0,0,0],bevel=.015){
    const shape=new T.Shape(outline.map(([x,y])=>new T.Vector2(x,y)));
    const geo=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,bevelSize:bevel,bevelThickness:bevel,steps:1,curveSegments:3});
    solid(g,geo,m,position,rotation);
  }
  // Cylinder sleeve and chrome rod overlap along the same two pins throughout the stroke.
  const rodGeometry=new T.CylinderGeometry(1,1,1,10);
  function piston(parentA,offsetA,parentB,offsetB,width,sleeveMaterial=graphite){
    const sleeve=new T.Mesh(rodGeometry,sleeveMaterial),rod=new T.Mesh(rodGeometry,steel);
    machine.add(sleeve,rod);joints.push({parentA,parentB,a:new T.Vector3(...offsetA),b:new T.Vector3(...offsetB),width,sleeve,rod});
  }
  function hose(g,points,radius,material){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
    solid(g,new T.TubeGeometry(curve,12,radius,7,false),material);
  }
  const core=assembly([0,2.30,0,-.06,0,0],[0,.358,-.14,-1.48,0,0]);
  shell(core,[[-.49,.55,.43],[-.20,1.02,.58],[.12,1.31,.70],[.34,.99,.51]],carbon);
  const chestShape=[[-.30,.13],[-.17,.24],[.25,.20],[.33,.105],[.19,-.03],[-.19,-.20],[-.30,-.12]];
  for(const s of [-1,1]){
    const mirrored=points=>points.map(([x,y])=>[s*x,y]);
    const chest=sub(core,s*.39,.015,.31);chest.rotation.set(.04,s*.32,s*.055);
    blade(chest,mirrored(chestShape),.092,graphite,[0,0,0]);
    blade(chest,mirrored([[-.27,.145],[-.16,.217],[.23,.177],[.29,.109],[.145,.04],[-.22,.026]]),.094,porcelain,[0,0,.053]);
    blade(chest,mirrored([[-.22,-.002],[.18,.032],[.07,-.049],[-.18,-.16],[-.25,-.10]]),.061,ceramic,[0,0,.063]);
    link(chest,[s*-.18,.037,.161],[s*.19,.056,.161],.011,aqua);
    for(let j=0;j<4;j++)link(chest,[s*(-.16+j*.061),-.055+j*.011,.137],[s*(-.115+j*.061),-.09+j*.011,.138],.010,carbon);
    disc(chest,[s*.185,.13,.162],.025,.013,steel,'z',6);
    link(core,[s*.28,-.46,.15],[s*.53,-.13,.19],.063,graphite);
    link(core,[s*.24,-.43,.25],[s*.40,-.18,.255],.034,steel);
    for(let j=0;j<3;j++)plate(core,[s*.28,-.25-j*.071,.243-j*.02],.27,.041,.11,petrol,[.05,0,-s*.24]);
  }
  const keel=[[-.125,.28],[.112,.25],[.177,.08],[.087,-.16],[0,-.28],[-.14,-.07]];
  blade(core,keel,.085,teal,[0,-.015,.355]);disc(core,[0,.063,.469],.108,.030,steel,'z',12);
  disc(core,[0,.063,.492],.088,.019,glass,'z',12);ring(core,[0,.063,.504],.072,.009,aqua);
  disc(core,[0,.063,.513],.051,.019,bronze,'z',9);
  disc(core,[0,.063,.526],.034,.018,teal,'z',12);
  for(let i=0;i<8;i++){const a=i*pi/4;
    bar(core,[.093*Math.cos(a),.063+.093*Math.sin(a),.498],.026,.011,.012,graphite,[0,0,a]);
  }
  for(const s of [-1,1]){
    for(const x of [.19,.245])hose(core,[[s*x,-.10,.31],[s*(x+.061),-.24,.298],[s*(x+.10),-.325,.24],[s*(x+.06),-.395,.175]],.019,x===.19?bronze:carbon);
  }
  monogram(core,-.014,-.105,.462,.12,porcelain);
  const pelvis=assembly([0,1.65,-.01,0,0,0],[0,.49,.66,-1.3,0,0]);
  shell(pelvis,[[-.20,.63,.39],[-.1,.85,.49],[.095,.79,.49],[.17,.50,.39]],petrol);
  for(const s of [-1,1]){
    blade(pelvis,[[s*-.17,.105],[s*.16,.08],[s*.11,-.09],[0,-.16],[s*-.11,-.10]],.085,ceramic,[s*.205,0,.21],[0,s*.17,-s*.15]);
    piston(core,[s*.22,-.32,.08],pelvis,[s*.23,.09,.06],.053);
  }
  const neck=assembly([0,2.76,0,0,0,0],[0,.78,-.38,-.05,0,0],"sensor");
  disc(neck,[0,.016,0],.156,.22,graphite,'y');
  const head=sub(neck,0,.215,0);
  // Faceted split visor, concentric optical iris and offset amber rangefinder.
  shell(head,[[-.24,.32,.27,.06],[-.12,.54,.48],[.10,.57,.50],[.21,.40,.33,-.02]],graphite);
  for(const s of [-1,1]){
    blade(head,[[s*-.11,.20],[s*.05,.25],[s*.17,.14],[s*.16,-.02],[s*.02,-.115],[s*-.028,.09]],.081,ceramic,[s*.165,0,.12],[.03,s*.42,-s*.05]);
    disc(head,[s*.286,0,-.008],.092,.06,steel,'x',14);
    disc(head,[s*.318,0,-.008],.049,.02,teal,'x',10);
  }
  blade(head,[[-.315,.085],[-.237,.15],[.276,.12],[.313,.064],[.218,-.036],[.044,-.072],[-.218,-.015]],.043,carbon,[0,0,.235]);
  blade(head,[[-.298,.115],[-.13,.195],[.221,.169],[.313,.121],[.257,.101],[-.155,.128]],.052,porcelain,[0,0,.25]);
  for(const [x,y,r,m] of [[-.109,.04,.090,aqua],[.146,.045,.056,pilot]]){
    const eye=sub(head,x,y,.309);optics.push(eye);disc(eye,[0,0,0],r,.030,steel);
    disc(eye,[0,0,.019],r*.82,.023,glass);ring(eye,[0,0,.035],r*.63,.008,m);
    solid(eye,new T.SphereGeometry(1,18,10),glazing,[0,0,.038],[0,0,0],[r*.43,r*.43,r*.23]);
    disc(eye,[-.011,.010,.054],r*.16,.012,m);
  }
  for(let j=0;j<3;j++)bar(head,[.075+j*.059,-.085,.24],.031,.065,.033,steel,[0,0,-.36]);
  // Helmet scanner becomes roof-mounted lidar in the vehicle.
  const scanner=sub(head);
  disc(scanner,[0,.222,-.07],.137,.065,carbon,'y',24);
  disc(scanner,[0,.261,-.07],.125,.027,teal,'y',32);disc(scanner,[0,.282,-.07],.128,.023,steel,'y',24);
  const rearDeck=assembly([0,1.93,-.32,-1.3,0,0],[0,.57,-.88,-.055,0,0],"frame");
  shell(rearDeck,[[-.13,1.15,1.13],[-.055,1.47,1.3],[.075,1.39,1.26],[.14,1.19,.98]],petrol);
  for(let j=0;j<6;j++)plate(rearDeck,[0,.13,-.44+j*.10],.94-j*.035,.05,.045,graphite,[-.27,0,0]);
  const rotating=[];
  function makeWheel(g,s){
    const hub=sub(g);rotating.push(hub);
    disc(hub,[0,0,0],.315,.185,rubber,'x',40);ring(hub,[s*.052,0,0],.248,.066,rubber,true);
    for(let j=0;j<32;j++){
      const a=j*pi/16;
      for(const k of [-1,1])bar(hub,[k*.047,.315*Math.cos(a),.315*Math.sin(a)],.093,.009,.024,carbon,[a,k*.22,0]);
    }
    disc(hub,[s*.111,0,0],.225,.022,graphite,'x',32);ring(hub,[s*.128,0,0],.204,.012,steel,true);
    disc(hub,[s*.13,0,0],.146,.016,steel,'x',28);
    for(let j=0;j<8;j++){
      const a=j*pi/4;
      blade(hub,[[-.009,.047],[.023,.046],[.061,.166],[.055,.204],[.030,.20],[.015,.124]],.021,steel,[s*.159,0,0],[a,s*pi/2,0],.005);
      disc(hub,[s*.148,.121*Math.cos(a+.22),.121*Math.sin(a+.22)],.013,.011,carbon,'x',8);
    }
    disc(hub,[s*.165,0,0],.064,.039,bronze,'x',6);disc(hub,[s*.19,0,0],.028,.013,steel,'x',6);
  }
  function wheelCarrier(host,s,rear){
    // The fixed pin follows the limb. The yoke swings about this pin; the wheel hub is its child.
    const mount=sub(machine),yoke=sub(mount),bearing=sub(yoke,0,-.335,0);
    carriers.push({host,mount,yoke,bearing,s,rear});
    disc(mount,[0,0,0],.071,.20,bronze,'z',12);
    for(const z of [-.068,.068])link(yoke,[0,0,z],[0,-.335,z],.043,graphite);
    link(yoke,[0,-.335,-.09],[0,-.335,.09],.055,steel);
    piston(mount,[-s*.09,.124,0],yoke,[0,-.225,0],.032,bronze);
    makeWheel(bearing,s);
  }
  function treadGuard(g,s){
    // A flared segmented arch leaves the rim and the folding knuckle in view.
    for(const [start,end,material] of [[-1.12,-.37,teal],[-.35,.31,ceramic],[.33,1.06,teal]]){
      const outline=[];
      for(let j=0;j<=7;j++){const a=lerp(start,end,j/7);outline.push([.377*Math.sin(a),.377*Math.cos(a)]);}
      for(let j=7;j>=0;j--){const a=lerp(start,end,j/7);outline.push([.335*Math.sin(a),.335*Math.cos(a)]);}
      blade(g,outline,.198,material,[.099,0,0],[0,-pi/2,0],.007);
      const a=(start+end)*.5;
      disc(g,[s*.110,.353*Math.cos(a),.353*Math.sin(a)],.012,.009,steel,'x',7);
    }
    plate(g,[s*.134,.048,-.118],.039,.112,.080,bronze,[-.28,0,0]);
  }
  const bumper=assembly([0,1.72,-.25,-1.26,0,0],[0,.49,1.30,-.065,0,0],"bonnet");
  shell(bumper,[[-.132,1.31,.77,.06],[-.091,1.58,.89,.035],[.041,1.49,.93,.037],[.137,1.22,.86,.014]],petrol);
  for(let j=0;j<3;j++)plate(bumper,[0,-.060+j*.048,.515],.57-j*.046,.020,.056,graphite);
  for(const s of [-1,1]){
    blade(bumper,[[s*-.22,.065],[s*.25,.092],[s*.25,.009],[s*-.15,-.045]],.035,ceramic,[s*.44,.043,.472],[0,s*.13,0]);
    plate(bumper,[s*.48,.071,.533],.31,.026,.026,aqua,[0,s*.13,s*.047]);
    plate(rearDeck,[s*.42,.029,-.626],.47,.042,.052,amber,[0,-s*.16,0]);
    piston(pelvis,[s*.2,0,.024],bumper,[s*.41,-.07,-.24],.057);
  }
  for(const s of [-1,1]){
    const S=(x,y)=>[s*x,y];
    const shoulder=assembly([s*.776,2.46,-.035,.06,0,-s*.17],[s*.65,.54,.25,-1.50,0,-s*.035],"frame",.10);
    disc(shoulder,[s*.04,-.03,-.01],.171,.39,steel,'x',20);
    shell(shoulder,[[-.15,.42,.41],[-.04,.54,.53],[.15,.45,.47],[.20,.29,.36]],carbon);
    const p=sub(shoulder,0,.052,.105);p.rotation.y=s*.18;
    blade(p,[S(-.255,.10),S(-.135,.214),S(.224,.19),S(.35,.015),S(.23,-.09),S(-.14,-.06)],.17,s===1?amber:porcelain,[0,0,0],[.12,0,0],.021);
    blade(p,[S(-.21,.142),S(-.096,.221),S(.198,.199),S(.291,.105),S(.143,.117)],.035,s===1?bronze:steel,[0,.012,.161],[.10,0,0]);
    blade(p,[S(-.135,.094),S(.163,.118),S(.214,.063),S(.145,.011),S(-.167,.025)],.013,carbon,[0,.004,.194],[.05,0,0],.005);
    for(let j=0;j<5;j++)bar(p,[s*(-.108+j*.057),.072,.221],.021,.057,.017,steel,[0,0,-s*.36]);
    bar(p,[s*-.106,-.026,.194],.105,.016,.013,aqua,[0,0,s*.12]);
    disc(p,[-s*.133,.07,.18],.031,.014,steel,'z',6);
    const arm=assembly([s*.90,2.15,.015,-.05,0,s*.10],[s*.67,.50,.64,-1.18,0,0],"frame",.11);
    disc(arm,[0,.09,0],.118,.24,carbon,'x',16);
    for(const k of [-1,1])link(arm,[k*.078,-.20,.054],[k*.078,.16,-.02],.043,k===1?steel:graphite);
    piston(shoulder,[0,-.03,-.01],arm,[0,-.1,-.02],.06);
    const fore=assembly([s*.952,1.88,.13,-.21,0,s*.11],[s*.715,.609,1.02,-1.39,0,0],"frame",.10);
    piston(arm,[0,-.1,.02],fore,[0,.12,-.07],.06);
    shell(fore,[[-.25,.21,.22,.08],[-.13,.28,.31,.04],[.15,.33,.31],[.22,.24,.28]],graphite);
    blade(fore,[S(-.11,.23),S(.13,.18),S(.155,.045),S(.065,-.23),S(-.11,-.14)],.075,teal,[0,0,.130],[.12,0,0]);
    blade(fore,[S(-.102,.18),S(.08,.13),S(-.01,-.04),S(-.093,-.08)],.036,ceramic,[0,0,.207],[.12,0,0]);
    for(let j=0;j<3;j++){
      const x=s*(-.095+j*.078);
      link(fore,[x,-.16,.09],[x,-.30,.135],.032,steel);plate(fore,[x,-.31,.15],.059,.107,.083,carbon,[-.48,0,0]);
    }
    const wrist=sub(fore,s*.074,-.028,.204);
    blade(wrist,[S(-.048,.151),S(.073,.112),S(.074,-.030),S(-.04,-.149)],.021,graphite,[0,0,.035]);
    for(let j=0;j<4;j++)bar(wrist,[0,-.049+j*.041,.063],.078,.014,.020,steel,[0,0,-s*.25]);
    for(const x of [.129,.17])hose(fore,[[s*x,.17,.072],[s*(x+.033),.06,.129],[s*(x+.037),-.10,.125],[s*(x-.029),-.19,.10]],.014,x===.129?bronze:carbon);
    wheelCarrier(fore,s,false);
    const thigh=assembly([s*.39,1.36,-.036,-.12,0,-s*.115],[s*.54,.57,-.42,-1.43,0,-s*.04],"frame");
    disc(thigh,[0,.18,0],.157,.25,graphite,'x',14);
    link(thigh,[0,-.20,-.035],[0,.19,-.055],.086,carbon);
    blade(thigh,[S(-.146,.19),S(.09,.21),S(.16,.10),S(.093,-.17),S(-.08,-.235),S(-.14,-.06)],.12,ceramic,[0,0,.036],[-.15,0,0]);
    blade(thigh,[S(-.083,.14),S(.073,.13),S(.045,.043),S(-.074,-.095)],.035,teal,[0,0,.163],[-.15,0,0]);
    piston(pelvis,[s*.24,-.07,-.06],thigh,[0,-.12,-.08],.06);
    const shin=assembly([s*.45,.78,.042,.06,0,-s*.065],[s*.704,.61,-1.00,1.38,0,0],"frame",.04);
    disc(shin,[0,.246,0],.157,.34,graphite,'x',16);disc(shin,[s*.175,.246,0],.089,.020,bronze,'x',10);
    shell(shin,[[-.38,.22,.29,-.035],[-.22,.28,.35],[.135,.37,.39,.01],[.25,.245,.31,.025]],teal);
    blade(shin,[S(-.15,.19),S(.055,.25),S(.159,.141),S(.081,-.12),S(-.055,-.28),S(-.105,-.17)],.064,porcelain,[0,0,.19],[.072,0,0]);
    blade(shin,[S(-.138,.16),S(.03,.226),S(.106,.14),S(-.073,.038)],.028,ceramic,[0,.004,.265],[.05,0,0]);
    blade(shin,[S(-.073,.001),S(.094,.099),S(.066,-.10),S(-.044,-.205)],.016,graphite,[0,0,.258],[.05,0,0],.006);
    for(let j=0;j<4;j++)link(shin,[s*-.071,-.112+j*.039,.281],[s*.043,-.080+j*.039,.29],.009,graphite);
    for(const dx of [-.09,.09])link(shin,[dx,-.33,-.11],[dx,.19,-.16],.039,steel);
    piston(thigh,[0,-.11,-.04],shin,[0,.19,-.05],.065);
    for(const dx of [-.119,.129]){
      link(shin,[s*dx,-.32,.124],[s*(dx+.028),-.124,.157],.030,steel);
      link(shin,[s*(dx+.028),-.124,.157],[s*(dx+.048),.111,.177],.042,graphite);
    }
    wheelCarrier(shin,s,true);
    const foot=assembly([s*.49,.237,.10,-.025,s*.11,0],[s*.61,.53,-1.32,.04,s*2.93,0],"foot");
    shell(foot,[[-.17,.42,.71,.10],[-.11,.43,.71,.10],[.045,.37,.56,.08],[.16,.24,.27,-.04]],carbon);
    shell(foot,[[-.10,.39,.36,.23],[-.03,.40,.36,.25],[.076,.26,.24,.20]],teal);
    blade(foot,[[.02,.065],[.14,.022],[.15,-.022],[-.145,-.027],[-.11,.043]],.021,ceramic,[0,-.04,.398],[-.12,0,0]);
    piston(shin,[0,-.25,-.03],foot,[0,.08,-.06],.048);
    // Each half-bonnet is pinned to an armoured carrier. The outboard leaf is hinged at its seam.
    const carriage=assembly([s*.42,2.30,-.34,-1.20,-s*.05,-s*.11],[s*.19,.701,1.00,-.13,0,0],"bonnet",.28);
    disc(carriage,[0,0,-.32],.058,.53,steel,'x',16);
    piston(core,[s*.45,.10,-.14],carriage,[s*.17,0,-.32],.044,bronze);
    const lid=sub(carriage,0,.015,-.32),leaf=sub(lid,s*.147,0,.38);
    covers.push({lid,leaf,s});
    shell(lid,[[-.055,.36,1.1,.43],[.016,.39,1.16,.45],[.085,.32,1.04,.42]],porcelain);
    shell(leaf,[[-.07,.33,1.02,.02],[-.02,.38,1.1,.04],[.054,.32,.99,.03]],ceramic,[s*.15,0,0]);
    for(let j=0;j<3;j++)bar(lid,[-s*.078,.085,.13+j*.068],.119,.018,.032,petrol,[0,s*.19,0]);
    plate(lid,[0,.103,.58],.047,.018,.52,s===1?amber:teal);
    plate(leaf,[s*.15,.015,.554],.270,.065,.039,carbon);
    const lamp=sub(leaf,s*.15,.017,.579);lights.push(lamp);bar(lamp,[0,0,0],.231,.023,.012,aqua);
    for(const z of [-.31,.33])disc(leaf,[0,.02,z],.026,.115,bronze,'z',12);
    const sill=assembly([s*.40,1.87,-.247,-1.34,0,-s*.09],[s*.68,.508,-.035,0,0,0],"frame");
    shell(sill,[[-.16,.24,1.59],[-.09,.32,1.77],[.075,.34,1.79],[.18,.255,1.56]],teal);
    blade(sill,[[-.73,.073],[-.36,.122],[.52,.104],[.74,.027],[.54,-.016],[-.53,-.102]],.035,ceramic,[s*.128,.015,0],[0,s*pi/2,0]);
    for(let j=0;j<3;j++)bar(sill,[s*.180,.019,-.49+j*.066],.023,.080,.021,graphite,[.42,0,0]);
    link(sill,[s*.127,-.089,-.69],[s*.130,-.089,.62],.025,steel);
    piston(core,[s*.43,-.02,-.1],sill,[0,0,-.32],.055);
    const cabin=assembly([s*.37,2.235,-.51,-1.22,s*.13,-s*.18],[s*.008,.628,-.13,0,0,0],"glass",.375);
    // Flat glazing panels share the longitudinal roof seams and the sill rails.
    const stations=[[-1.14,.48,.12,.040],[-.50,.53,.515,.095],[.04,.525,.585,.085],[.66,.60,.16,.055],[.75,.57,.095,.025]];
    function pane(points,m){
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
      geo.setIndex(s>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]);geo.computeVertexNormals();solid(cabin,geo,m);
    }
    const rows=stations.map(([z,w,h,hLow])=>[[s*.012,h+.035,z],[s*w,h,z],[s*(w+.17),hLow,z]]);
    for(let j=1;j<rows.length;j++) {
      const A=rows[j-1],B=rows[j];
      pane([A[0],B[0],B[1],A[1]],j===2?teal:glazing);
      pane([A[1],B[1],B[2],A[2]],glazing);
      link(cabin,A[1],B[1],.025,ceramic);link(cabin,A[2],B[2],.045,teal);
      link(cabin,A[0],B[0],.014,graphite);
      link(cabin,B[1],B[2],j===2?.046:.022,graphite);
    }
    for(const row of [rows[1],rows[2],rows[3]])link(cabin,row[0],row[1],.019,graphite);
    piston(rearDeck,[s*.49,.05,-.13],cabin,[s*.48,.13,-.61],.055);
  }
  for(const carrier of carriers){
    // Guards mount on the bearing, never on a spinning wheel.
    treadGuard(carrier.bearing,carrier.s);
  }
  for(const [group,materials] of batches)for(const [mat,attrs] of materials){
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(attrs.p,3));
    geo.setAttribute('normal',new T.Float32BufferAttribute(attrs.n,3));const mesh=new T.Mesh(geo,mat);
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  glazing.side=T.DoubleSide;
  const phases={frame:[.13,.62],sensor:[.32,.72],bonnet:[.24,.76],glass:[.28,.81],foot:[.31,.68]};
  function ramp(p,a,b){const t=clamp((p-a)/(b-a),0,1);return t*t*(3-2*t);}
  const pinA=new T.Vector3(),pinB=new T.Vector3(),axis=new T.Vector3(),up=new T.Vector3(0,1,0);
  function updatePistons(){
    // Matrices are in chassis space, so any showpiece spin is applied after solving the linkage.
    for(const j of joints){
      j.parentA.updateMatrix();j.parentB.updateMatrix();
      j.parentA.localToWorld(pinA.copy(j.a));j.parentB.localToWorld(pinB.copy(j.b));
      machine.worldToLocal(pinA);machine.worldToLocal(pinB);
      axis.subVectors(pinB,pinA);const length=axis.length();if(length<.001)continue;
      axis.divideScalar(length);
      const tube=Math.min(.26,length*.66),extension=length-tube*.77;
      j.sleeve.position.copy(pinA).addScaledVector(axis,tube*.5);j.rod.position.copy(pinB).addScaledVector(axis,-extension*.5);
      j.sleeve.quaternion.setFromUnitVectors(up,axis);j.rod.quaternion.copy(j.sleeve.quaternion);
      j.sleeve.scale.set(j.width,tube,j.width);j.rod.scale.set(j.width*.62,extension,j.width*.62);
    }
  }
  const wave=new T.Mesh(new T.RingGeometry(.98,1,80),new T.MeshBasicMaterial({color:0x52dbd3,transparent:true,depthWrite:false,side:T.DoubleSide}));
  wave.rotation.x=-pi/2;wave.position.y=.023;machine.add(wave);
  let lastStroke=NaN;
  const rest={gazeX:0,gazeY:0,attention:0,flash:0,wink:0,spin:0,bounce:0,blink:0,ripple:1};
  function pose(progress,yaw=.19,pitch=.085,time=0,signals=rest) {
    const {gazeX,gazeY,attention,flash,wink,spin,bounce,blink,ripple}=signals;
    const unlock=ramp(progress,0,.17)*(1-ramp(progress,.70,.96));
    for(const {group,from,to,phase,sweep} of groups){
      const k=ramp(progress,...phases[phase]),side=Math.sign(from[0]);
      group.position.set(lerp(from[0],to[0],k)+side*sweep*unlock,lerp(from[1],to[1],k),lerp(from[2],to[2],k));
      group.rotation.set(lerp(from[3],to[3],k),lerp(from[4],to[4],k),lerp(from[5],to[5],k));
      if(phase==="glass"){group.rotation.z+=side*.57*unlock;group.position.y+=.15*unlock;}
    }
    const tuck=ramp(progress,.57,.85);
    neck.position.y=core.position.y+lerp(.46,.422,ramp(progress,.34,.71))-.128*tuck;
    scanner.position.y=.128*tuck;
    for(const {lid,leaf,s} of covers){
      lid.rotation.x=-.60*ramp(progress,0,.15)+.60*ramp(progress,.74,.98);
      leaf.rotation.z=-s*(1.45*(1-ramp(progress,.62,.92))+.24*unlock);
    }
    for(const c of carriers){
      const roll=ramp(progress,c.rear?.43:.51,c.rear?.73:.83);
      c.mount.position.copy(c.host.position);c.mount.position.x+=c.s*.064;
      c.yoke.rotation.z=c.s*lerp(2.02,.464,roll);
      c.bearing.rotation.z=-c.yoke.rotation.z+c.s*.22*(1-roll);
    }
    for(const rim of rotating)rim.rotation.x=ramp(progress,.55,.83)*.96;
    const sway=Math.sin(time*1.42)*(1-progress);
    head.rotation.set(gazeY*.38-.10*attention,gazeX*.62+.058*Math.sin(time*.58)-.32*Math.sin(spin*.5),sway*.014);
    for(let i=0;i<optics.length;i++){
      optics[i].position.x=(i===0?-.109:.146)+gazeX*.030;
      optics[i].scale.y=1-Math.max(blink*.80,i===1?wink*.84:0);
    }
    lights[1].scale.y=1-wink*.85;
    wave.visible=ripple>0&&ripple<1;wave.scale.setScalar(.50+ripple*1.33);wave.material.opacity=.42*(1-ripple);
    neck.position.y+=sway*.012+attention*.036*(1-progress);
    aqua.emissiveIntensity=1.0+flash*4.0+attention*.35;pilot.emissiveIntensity=.85+flash*3.5;
    machine.rotation.y=spin+gazeX*.085;machine.rotation.z=bounce*.012;
    machine.scale.y=1-bounce*.033;machine.scale.x=machine.scale.z=1+bounce*.012;
    shadow.scale.set(lerp(1,1.02,progress),lerp(.95,1.95,progress),1);
    if(progress!==lastStroke){updatePistons();lastStroke=progress;}
    const framing=ramp(progress,.13,.71),focusY=lerp(1.60,.70,framing);
    const angle=yaw+lerp(.32,.64,framing),elevation=pitch+lerp(.10,.28,framing);
    const flat=8*Math.cos(elevation);
    camera.position.set(flat*Math.sin(angle),focusY+8*Math.sin(elevation),flat*Math.cos(angle));camera.lookAt(0,focusY,0);
    const half=lerp(2.04,2.13,framing)+unlock*.20;camera.top=camera.right=half;camera.bottom=camera.left=-half;camera.updateProjectionMatrix();
  }
  return {scene,camera,pose};
}
