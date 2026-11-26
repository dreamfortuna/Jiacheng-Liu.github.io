// One deterministic teaching run. Distances are metres, angles radians, time seconds.
export const duration=12;
const dt=1/60, wheelbase=2.875, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=u=>u*u*(3-2*u);
const heading=s=>{
  const d=s-28;
  if(d<=0)return 0;
  if(d<16)return d*d/(32*52);
  return (d-8)/52;
};
const road=[];
for(let i=0,x=-30,z=0;i<=1000;i++){
  const s=-30+i*.2;
  road.push({x,z,yaw:heading(s)});
  x+=.2*Math.cos(heading(s+.1));z-=.2*Math.sin(heading(s+.1));
}
export function roadPose(s,left=0){
  const u=clamp((s+30)/.2,0,road.length-1.001),i=Math.floor(u),f=u-i;
  const a=road[i],b=road[i+1],yaw=heading(s);
  return {x:a.x+(b.x-a.x)*f-left*Math.sin(yaw),z:a.z+(b.z-a.z)*f-left*Math.cos(yaw),yaw};
}
function neighbor(t){
  const speed=9.5,s=20+speed*t,u=clamp((t-1.4)/4.3,0,1);
  const left=3.6*(1-smooth(u)),p=roadPose(s,left);
  const lateral=-3.6*6*u*(1-u)/4.3;
  const curvature=(heading(s+.05)-heading(s-.05))/.1;
  return {...p,yaw:p.yaw+Math.atan2(lateral,speed*(1-curvature*left)),s,left};
}
const states=[];
let rearX=0,rearZ=0,yaw=0,s=0,speed=11,steer=0,accel=0,seen=Infinity;
for(let i=0;i<=duration/dt;i++){
  const t=i*dt,n=neighbor(t);
  const x=rearX+wheelbase*.5*Math.cos(yaw),z=rearZ-wheelbase*.5*Math.sin(yaw);
  const gap=n.s-s-wheelbase*.5-4.69;
  const dx=n.x-x,dz=n.z-z,forward=dx*Math.cos(yaw)-dz*Math.sin(yaw);
  const side=-dx*Math.sin(yaw)-dz*Math.cos(yaw);
  if(n.left<3.46&&forward>0&&Math.abs(Math.atan2(side,forward))<.52)seen=Math.min(seen,t);
  const age=Math.max(0,t-seen);
  const observed=t>=seen,computing=t>=seen+.24,requested=t>=seen+.9;
  const epsReceived=t>=seen+1.05,brakeReceived=t>=seen+1.10,hydraulic=t>=seen+1.22;
  const preview=roadPose(s+5);
  const offset=-(preview.x-rearX)*Math.sin(yaw)-(preview.z-rearZ)*Math.cos(yaw);
  const steerRequest=Math.atan(2*wheelbase*offset/25);
  const brakeRequest=requested?clamp((8.5-speed)*1.7,-2,0):0;
  states.push({t,x,z,yaw,s,speed,steer,accel,steerRequest,brakeRequest,gap,
    nx:n.x,nz:n.z,nyaw:n.yaw,left:n.left,observed,computing,requested,age,epsReceived,brakeReceived,hydraulic});
  steer+=((epsReceived?steerRequest:0)-steer)*(1-Math.exp(-dt/.21));
  accel+=((hydraulic?brakeRequest:0)-accel)*(1-Math.exp(-dt/.27));
  const ds=speed*dt+.5*accel*dt*dt,dyaw=ds*Math.tan(steer)/wheelbase;
  rearX+=ds*Math.cos(yaw+dyaw*.5);rearZ-=ds*Math.sin(yaw+dyaw*.5);
  yaw+=dyaw;s+=ds;speed+=accel*dt;
}
export function sample(t){
  const u=clamp(t,0,duration)/dt,i=Math.min(Math.floor(u),states.length-1);
  const a=states[i],b=states[Math.min(i+1,states.length-1)],out={...a};
  for(const k of Object.keys(a))if(typeof a[k]==='number')out[k]=a[k]+(b[k]-a[k])*(u-i);
  out.observed=out.t>=seen;out.age=Math.max(0,out.t-seen);
  out.computing=out.age>=.24;out.requested=out.age>=.9;
  out.epsReceived=out.age>=1.05;out.brakeReceived=out.age>=1.10;out.hydraulic=out.age>=1.22;
  return out;
}

// A separate acceleration example for the electric drive lesson. The road pose and
// wheel rotation use the integral of the displayed velocity.
export function tractionSample(t){
  const a=sample(t),u=clamp(t-1,0,5),speed=5+.85*u;
  const s=5*t+.425*u*u+.85*5*Math.max(0,t-6),p=roadPose(s),n=roadPose(s+18,3.6);
  const angle=Math.atan(wheelbase*(heading(s+.05)-heading(s-.05))/.1);
  return {...a,...p,s,speed,accel:t>=1&&t<6?.85:0,steer:angle,steerRequest:angle,brakeRequest:0,
    nx:n.x,nz:n.z,nyaw:n.yaw,left:3.6,gap:18-4.69,observed:false,computing:false,requested:false};
}
export function driverSample(t){
  const a=tractionSample(t),u=clamp(t-3.70,0,2),speed=10-.95*u;
  const s=10*t-.475*u*u-1.9*Math.max(0,t-5.7),p=roadPose(s),n=roadPose(s+17,3.6);
  const angle=Math.atan(wheelbase*(heading(s+.05)-heading(s-.05))/.1);
  return {...a,...p,s,speed,steer:angle,steerRequest:angle,accel:t>=3.7&&t<5.7?-.95:0,
    brakeRequest:t>=3.25&&t<5.7?-.95:0,nx:n.x,nz:n.z,nyaw:n.yaw};
}
