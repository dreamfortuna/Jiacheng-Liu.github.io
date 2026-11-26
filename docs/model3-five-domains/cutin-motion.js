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
  const observed=t>=seen,computing=t>=seen+.24,requested=t>=seen+.9;
  const preview=roadPose(s+5);
  const offset=-(preview.x-rearX)*Math.sin(yaw)-(preview.z-rearZ)*Math.cos(yaw);
  const steerRequest=Math.atan(2*wheelbase*offset/25);
  const brakeRequest=requested?clamp((8.5-speed)*1.7,-2,0):0;
  states.push({t,x,z,yaw,s,speed,steer,accel,steerRequest,brakeRequest,gap,
    nx:n.x,nz:n.z,nyaw:n.yaw,left:n.left,observed,computing,requested});
  steer+=(steerRequest-steer)*(1-Math.exp(-dt/.21));
  accel+=(brakeRequest-accel)*(1-Math.exp(-dt/.27));
  const ds=speed*dt+.5*accel*dt*dt,dyaw=ds*Math.tan(steer)/wheelbase;
  rearX+=ds*Math.cos(yaw+dyaw*.5);rearZ-=ds*Math.sin(yaw+dyaw*.5);
  yaw+=dyaw;s+=ds;speed+=accel*dt;
}
export function sample(t){
  const u=clamp(t,0,duration)/dt,i=Math.min(Math.floor(u),states.length-1);
  const a=states[i],b=states[Math.min(i+1,states.length-1)],out={...a};
  for(const k of Object.keys(a))if(typeof a[k]==='number')out[k]=a[k]+(b[k]-a[k])*(u-i);
  return out;
}
