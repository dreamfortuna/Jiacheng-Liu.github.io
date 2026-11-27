import {sample as cutin,roadPose as cutinRoad,duration} from './cutin-motion.js';

const dt=1/60,radius=.334,base=2.875,ratio=9,eff=.94,mass=1800,kt=.8;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const ramp=(x,a,b)=>clamp((x-a)/(b-a),0,1);
const windowed=(x,a,b,c,d)=>ramp(x,a,b)*(1-ramp(x,c,d));
const straight=()=>0;
const config={
  overview:{title:'路口绿灯起步',speed:0,prop:'signal',mark:8,curve:s=>.026*windowed(s,14,22,42,50)},
  turn:{title:'低速驶过右弯',speed:5.2,curve:s=>-.065*windowed(s,7,14,33,41)},
  brake:{title:'停止线前制动至静止',speed:9,prop:'stop',mark:35},
  drive:{title:'直道起步、加速与滑行',speed:0,prop:'distance'},
  coolant:{title:'定速爬坡与主动散热',speed:7,prop:'hill',slope:s=>.13*windowed(s,10,25,49,65)},
  vision:{title:'左侧车辆超越与视野交接',speed:6,traffic:true},
  perception:{title:'遮挡区内的目标丢失与重获',speed:6.3,traffic:true,prop:'screen'},
  ego:{title:'弧线行驶与地标校正',speed:6.8,prop:'landmark',curve:s=>.025*ramp(s,4,16)},
  prediction:{title:'路口横穿与让行',speed:8.5,prop:'crossing',mark:38,traffic:true},
  lateral:{title:'连续 S 弯的反向跟踪',speed:7,curve:s=>.047*Math.sin((s-8)*Math.PI/24)*windowed(s,8,13,51,56)},
  longitudinal:{title:'前车先减速、再提速',speed:9,traffic:true},
  supervision:{title:'施工区前接管减速',speed:8.8,prop:'works',mark:46},
  compute:{title:'限速切换与控制链时延',speed:10,prop:'limit',mark:39},
};

// Integrate a road centreline by arc length; offset is positive to the left.
function makeRoad({curve=straight,slope=straight}){
  const pts=[];let x=-30,y=0,z=0,yaw=0;
  for(let i=0;i<=1000;i++){
    const s=i*.2-30,pitch=Math.atan(slope(s));
    pts.push({x,y,z,yaw,pitch});
    const bend=curve(s+.1)*.2,plan=.2*Math.cos(pitch);
    x+=plan*Math.cos(yaw+bend/2);z-=plan*Math.sin(yaw+bend/2);y+=.2*Math.sin(pitch);yaw+=bend;
  }
  return (s,offset=0)=>{
    const u=clamp((s+30)/.2,0,999.99999),i=Math.floor(u),k=u-i,p={};
    for(const key of ['x','y','z','yaw','pitch'])p[key]=pts[i][key]+(pts[i+1][key]-pts[i][key])*k;
    p.x-=offset*Math.sin(p.yaw);p.z-=offset*Math.cos(p.yaw);return p;
  };
}

function traffic(key,t){
  if(key==='vision')return {x:-10+10.6*t,z:-3.6,v:10.6};
  if(key==='perception'){
    const u=clamp(t-3.8,0,1),q=clamp(t-5.4,0,1);
    return {x:8+6.6*t-.475*u*u-.95*Math.max(0,t-4.8)+.475*q*q+.95*Math.max(0,t-6.4),
      z:-3.6,v:6.6-.95*u+.95*q};
  }
  if(key==='prediction')return {x:38,z:-23+4.6*t,v:4.6,yaw:-Math.PI/2};
  if(key==='longitudinal'){
    const u=clamp(t-1,0,2.5),q=clamp(t-6,0,3);
    return {x:21+9*t-.85*u*u-4.25*Math.max(0,t-3.5)+.55*q*q+3.3*Math.max(0,t-9),
      z:0,v:9-1.7*u+1.1*q,braking:t>=1&&t<3.5};
  }
  return null;
}
function makeRun(key,c,road){
  const states=[];let s=0,speed=c.speed,actual=0,x=0,z=0,yaw=0,steer=0;
  let seen=-100,lastFix=0,estimated=0,lastVisibleX=0,lastVisibleT=0,lastVisibleSpeed=0,previousVisible=false;
  let temp=42,flow=.35,pumpAngle=0,amp=0,conflict=false;
  let steerSince=null,brakeSince=null,frontStamp=-1,sideStamp=-1;
  for(let i=0;i<=duration/dt;i++){
    const t=i*dt,p=road(s),car=traffic(key,t);
    const dx=car?car.x-x:0,dz=car?car.z-z:0,gap=dx-4.69;
    const bearing=Math.atan2(-dz,dx),side=!!car&&bearing>.42&&bearing<2.9;
    const front=!!car&&dx>0&&Math.abs(bearing)<.51;
    const sightX=x+.35+(dx-.35)*2/3.6;
    const occluded=key==='perception'&&sightX>=25&&sightX<=37;
    const detected=key==='vision'?front||side:key==='perception'?front&&!occluded:key==='prediction'?dx>0&&(front||side):key==='longitudinal'?front:false;
    if(front&&!occluded&&i%10===0)frontStamp=t;
    if(side&&!occluded&&i%10===5)sideStamp=t;
    if(detected&&!previousVisible)seen=t;
    if(detected){lastVisibleX=car.x;lastVisibleT=t;lastVisibleSpeed=car.v;}
    previousVisible=detected;
    const age=detected?t-seen:0,hiddenAge=t-lastVisibleT;
    const light=t>=1.6,limit=t<2?40:20,delivered=t>=2.92;
    const targetS=key==='ego'?[18,45,69].filter(d=>d<=s).at(-1)||0:0;
    if(targetS!==lastFix){estimated=s;lastFix=targetS;}
    const egoETA=(38-x)/Math.max(speed,.1),otherETA=car?-car.z/4.6:0;
    if(key==='prediction'&&detected&&age>.30&&egoETA>0&&otherETA>0&&Math.abs(egoETA-otherETA)<1.6)conflict=true;
    if(key==='prediction'&&car.z>3.5)conflict=false;
    let command=0,currentCmd=0;
    switch(key){
      case 'overview':command=t>=1.95?clamp((5.6-speed)*1.15,0,1.15):0;break;
      case 'brake':command=t>=1.5&&speed>.001?-2.6:0;break;
      case 'drive':
        currentCmd=146*windowed(t,.8,2.2,6.4,7.5);
        break;
      case 'prediction':command=conflict?clamp((2.8-speed)*1.15,-2.2,0):t>5.8?clamp((8.5-speed)*.75,0,1.4):0;break;
      case 'longitudinal':command=clamp(.46*(gap-(3+1.4*speed))+.84*(car.v-speed),-2.8,1.8);break;
      case 'supervision':command=t>=3.85&&t<7?-1.25:0;break;
      case 'compute':command=delivered?clamp((limit/3.6-speed)*.92,-1.6,0):0;break;
    }
    const torque=amp*kt,shaftTorque=torque*ratio*eff;
    const acc=key==='drive'?shaftTorque/(mass*radius):speed<=0&&actual<0?0:actual;
    const steeringCourse=['turn','lateral','overview','ego'].includes(key);
    const lookahead=key==='lateral'?5.8:3.5,preview=road(s+lookahead);
    const sideError=-(preview.x-x)*Math.sin(yaw)-(preview.z-z)*Math.cos(yaw);
    const request=steeringCourse?Math.atan(2*base*sideError/(lookahead*lookahead)):0;
    if(Math.abs(request)>.0005)steerSince??=t;else steerSince=null;
    if(command<-.03)brakeSince??=t;else brakeSince=null;
    const heatInput=1+26*Math.max(0,Math.sin(p.pitch)),heatOut=(.07+.17*flow)*(temp-32);
    const pumpCmd=.35+2.5*clamp((temp-42)/2.3,0,1);
    const f={t,s,x,y:p.y,z,yaw,pitch:p.pitch,speed,accel:acc,steer,steerRequest:request,
      brakeRequest:Math.min(0,command),command,observed:detected,age,computing:detected&&age>.24,requested:Math.abs(request)>.001||Math.abs(command)>.01,
      epsReceived:Math.abs(steer)>.001,brakeReceived:actual<-.05,hydraulic:acc<-.12,neighbor:!!car,
      nx:car?.x||0,nz:car?.z||0,nyaw:car?.yaw||0,left:-dz,gap,leadSpeed:car?.v||0,leadBraking:!!car?.braking,
      detected,front,side,frontStamp,sideStamp,occluded,hiddenAge,trackX:detected?car.x:lastVisibleX+lastVisibleSpeed*hiddenAge,
      steerAge:steerSince===null?-1:t-steerSince,brakeAge:brakeSince===null?-1:t-brakeSince,
      uncertainty:detected?.15:.15+.65*hiddenAge,estimated,lastFix,odomError:estimated-s,
      currentCmd,amp,torque,shaftTorque,wheelAngle:s/radius,motorAngle:ratio*s/radius,
      wheelRPM:speed/radius*30/Math.PI,motorRPM:ratio*speed/radius*30/Math.PI,
      grade:100*Math.tan(p.pitch),temp,flow,pumpAngle,pumpCmd,heatInput,heatOut,light,limit,delivered,conflict,
      signalAge:t>=2?t-2:0,driverPedal:windowed(t,3.5,3.85,7,7.25),course:key};
    states.push(f);
    const nextSpeed=Math.max(0,speed+acc*dt),ds=(speed+nextSpeed)*dt/2,dyaw=ds*Math.tan(steer)/base;
    x+=ds*Math.cos(p.pitch)*Math.cos(yaw+dyaw/2);z-=ds*Math.cos(p.pitch)*Math.sin(yaw+dyaw/2);yaw+=dyaw;
    const rackInput=states[Math.max(0,i-6)].steerRequest;
    const chassisInput=['brake','longitudinal','prediction'].includes(key)?states[Math.max(0,i-10)].command:command;
    s+=ds;speed=nextSpeed;estimated+=ds*1.035;steer+=(rackInput-steer)*(1-Math.exp(-dt/.16));
    actual+=(chassisInput-actual)*(1-Math.exp(-dt/.20));amp+=(currentCmd-amp)*(1-Math.exp(-dt/.18));
    temp+=(heatInput-heatOut)*dt;flow+=(pumpCmd-flow)*(1-Math.exp(-dt/.45));pumpAngle+=flow*5*dt;
  }
  return t=>{
    const u=clamp(t,0,duration)/dt,i=Math.min(Math.floor(u),states.length-1),a=states[i],b=states[Math.min(i+1,states.length-1)],out={...a};
    for(const k in a)if(typeof a[k]==='number'&&!['limit','lastFix','frontStamp','sideStamp'].includes(k))out[k]=a[k]+(b[k]-a[k])*(u-i);
    return out;
  };
}
const runs=new Map();
export function courseRun(key){
  if(!runs.has(key)){
    if(key==='cutin-case')runs.set(key,{sample:cutin,road:cutinRoad});
    else{
      const c=config[key];if(!c)throw new Error('缺少独立工况 '+key);
      const road=makeRoad(c);runs.set(key,{...c,road,sample:makeRun(key,c,road)});
    }
  }
  return runs.get(key);
}
