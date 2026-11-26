// Paths describe functional relationships. Intermediate IDs locate the corresponding
// assemblies in the teaching model; clocks and channel delays are illustrative.
export const palette={vision:0x45dcff,steering:0xffc653,braking:0xff806f,feedback:0xcbacff,power:0xffc653,cooling:0x65deb5,compute:0x75acf9};
const edge=(kind,ids,clock)=>({kind,ids:ids.split(' '),clock});
const observe=edge('vision','forward0 ap_video apboard','image');
const steering=edge('steering','apboard x120 x193 epas','steer');
const rack=edge('steering','epas rack wheelFL','rack');
const braking=edge('braking','apboard x120 x151 hcu','brake');
const pressure=edge('braking','hcu lineFL calFL','pressure');
const feedback=edge('feedback','speedFL wsFL hcu','wheel');
const side=edge('vision','bpL apboard','side');
const compute=edge('compute','apboard logicA','process');
const support=edge('power','lvbat vcfront apboard','supply');
const water=edge('cooling','pump1 coolcpu housing/p-967e0c9c8b368c00','flow');
const overview=edge('compute','apboard mcu screen','display');
const course=(labels,paths,caption)=>({labels,paths,caption});
export const films={
  'cutin-case':course(['forward0','apboard','epas','hcu','calFL'],[observe,steering,rack,braking,pressure,feedback],'摄像头跟踪切入目标。沿两条分支对照转向角与纵向减速度。'),
  overview:course(['apboard','epas','pack','vcfront','screen'],[support,edge('power','pack rearinv','supply'),observe,steering,rack,overview],'低压配电支持计算板，高压电池为逆变器供能。对照底盘执行与座舱显示，辨认五域分工。'),
  turn:course(['forward0','apboard','x193','epas','rack'],[observe,steering,rack],'沿摄像头、计算板和 X193 接口追踪转向请求。看齿条移动、前轮转向。'),
  brake:course(['apboard','hcu','calFL','speedFL'],[braking,pressure,feedback],'纵向请求到达液压控制单元，压力作用于制动钳。轮速反馈随车轮减速而变化。'),
  drive:course(['pack','rearinv','rearmotor','rearLshaft'],[edge('power','pack rearinv','supply'),edge('power','rearinv rearmotor','torque'),edge('steering','rearmotor reargear rearLshaft wheelRL','shaft')],'从电池沿逆变器追到后电机。转矩经减速器和半轴到达后轮，本车随即加速。'),
  coolant:course(['pump1','octo','coolcpu','housing/p-967e0c9c8b368c00','radiator'],[edge('cooling','pump1 octo','pump'),edge('cooling','octo coolcpu housing/p-967e0c9c8b368c00','flow'),edge('cooling','housing/p-967e0c9c8b368c00 radiator','return')],'跟随一股示意冷却液经过分配阀和车载电脑冷板，再到前端换热。'),
  vision:course(['forward0','bpL','ap_video','apboard'],[observe,side,compute],'前视与侧视分别采样。比较两路观测进入车载计算机的先后。'),
  perception:course(['forward0','bpL','apboard','logicA'],[observe,side,compute],'先取得图像观测，再由计算板更新目标。道路上的跟踪框与该次更新同步。'),
  ego:course(['speedFL','hcu','forward0','apboard'],[feedback,edge('feedback','hcu apboard','odometry'),observe],'车轮转动形成轮速观测。与前视观测对照，可估计本车的位移与转向。'),
  prediction:course(['forward0','apboard','logicA','epas','hcu'],[observe,compute,steering,braking],'观察邻车保持原车道与切入的两种候选走向，以及计算完成后发出的两路请求。'),
  lateral:course(['apboard','x193','epas','rack','wheelFL'],[steering,rack,edge('feedback','epas apboard','angle')],'从目标转角追到转向控制器与齿条。比较请求转角与实际前轮转角。'),
  longitudinal:course(['forward0','apboard','hcu','calFL','speedFL'],[observe,braking,pressure,feedback],'邻车切入后，沿纵向请求、液压执行与轮速反馈观察跟车间距的恢复。'),
  supervision:course(['cabincam','apboard','screen','pedals'],[edge('vision','cabincam apboard','monitor'),edge('compute','apboard mcu screen','alert'),edge('feedback','pedals booster','driver')],'在驾驶员接管示例中，车内摄像头观测先于座舱提示，驾驶员响应后操作踏板。'),
  compute:course(['lvbat','forward0','apboard','logicA','epas'],[support,water,observe,compute,steering],'供电与冷却支持计算板。跟随一次输入经过运算，到转向端接收输出。'),
};
export const names={forward0:'前视摄像头',apboard:'HW4 智驾计算板',epas:'电动助力转向器',hcu:'制动液压控制单元',calFL:'左前制动钳',speedFL:'左前轮速传感器',rack:'齿条与横拉杆',x193:'转向接口 X193',wheelFL:'左前轮',vcfront:'前车身控制器',screen:'座舱屏',pack:'动力电池',rearinv:'后逆变器',rearmotor:'后驱动电机',rearLshaft:'左后半轴',pump1:'冷却液泵',octo:'八通阀',coolcpu:'电脑冷却支路','housing/p-967e0c9c8b368c00':'电脑冷板',radiator:'前端散热器',bpL:'左侧摄像头',ap_video:'视频输入接口',logicA:'智驾计算区',cabincam:'舱内摄像头',pedals:'驾驶员踏板',lvbat:'低压电池'};

// An edge first traverses once, then displays repeated packets or continuing flow.
// A negative phase means the input has not yet been sent.
export function transit(clock,a){
  const age=a.observed?a.age:-10;
  switch(clock){
    case 'image':return age/.24;
    case 'side':return (age-.09)/.3;
    case 'process':return (age-.24)/.66;
    case 'steer':return (age-.9)/.15;
    case 'brake':return a.brakeRequest<-.06?(age-.9)/.2:-1;
    case 'rack':return (age-1.05)/.21;
    case 'pressure':return a.accel<-.06||a.brakeRequest<-.06?(age-1.1)/.12:-1;
    case 'angle':return (age-1.26)/.40;
    case 'wheel':return a.t*1.2;
    case 'odometry':return (a.t-.8)*1.2;
    case 'display':return (age-.9)/.55;
    case 'supply':return a.t/.55;
    case 'torque':return (a.t-.55)/.25;
    case 'shaft':return (a.t-.80)/.2;
    case 'pump':return a.t/1.4;
    case 'flow':return (a.t-1.4)/1.8;
    case 'return':return (a.t-3.2)/1.6;
    case 'monitor':return a.t/1.5;
    case 'alert':return (a.t-2)/.75;
    case 'driver':return (a.t-3.25)/.45;
    default:throw new Error('未知演示信号 '+clock);
  }
}
export const packetPosition=phase=>phase<1?Math.max(0,phase):(phase-1)*.3%1;

// Readouts are derived from the same simulation sample that poses the two views.
export function lessonReadout(key,a){
  const speed=(a.speed*3.6).toFixed(1)+' km/h',angle=(a.steer*180/Math.PI).toFixed(1)+'°';
  const req=(a.steerRequest*180/Math.PI).toFixed(1)+'°',acc=a.accel.toFixed(1)+' m/s²';
  const age=a.observed?a.age.toFixed(2)+' s':'等候观测',dist=a.s.toFixed(1)+' m';
  const wheel=(a.speed/.334).toFixed(1)+' rad/s',gap=a.gap.toFixed(1)+' m',t=a.t;
  const stage=(labels,conditions,meters)=>({labels,conditions,meters});
  switch(key){
    case 'overview':return stage(['低压供电','视觉输入','底盘执行','座舱显示'],[true,a.observed,a.epsReceived,a.age>1.45],[['低压供电','接通'],['输入',a.observed?'目标已跟踪':'等待目标'],['前轮转角',angle],['本车速度',speed]]);
    case 'vision':return stage(['前视采样','侧视采样','前视抵达','侧视抵达'],[a.observed,a.age>=.09,a.computing,a.age>=.39],[['前视观测年龄',age],['示例采样时差','90 ms'],['前视输入',a.computing?'已到达':'等候'],['侧视输入',a.age>=.39?'已到达':'等候']]);
    case 'perception':return stage(['取得观测','跨视角对照','计算板更新','更新目标'],[a.observed,a.age>=.09,a.computing,a.requested],[['观测年龄',age],['邻车横向偏移',a.observed?a.left.toFixed(1)+' m':'未知'],['纵向净距',a.observed?gap:'未知'],['目标状态',a.observed?'跟踪中':'未建立']]);
    case 'ego':return stage(['轮端旋转','轮速到达','里程估计','视觉对照'],[true,t>=.84,t>=1.64,a.computing],[['轮端角速度',wheel],['积分行程',dist],['车身航向',(a.yaw*180/Math.PI).toFixed(1)+'°'],['车速',speed]]);
    case 'prediction':return stage(['取得观测','比较候选','发出请求','执行响应'],[a.observed,a.computing,a.requested,a.hydraulic],[['邻车横向偏移',a.left.toFixed(1)+' m'],['纵向净距',gap],['规划状态',a.requested?'沿弯道减速':a.computing?'比较两条候选':'等待观测'],['实际车速',speed]]);
    case 'turn':case 'lateral':return stage(['计算请求','送达 EPAS','齿条运动','车轮转向'],[a.requested,a.epsReceived,Math.abs(a.steer)>.002,Math.abs(a.steer)>.004],[['转向请求',req],['前轮实角',angle],['转角误差',((a.steerRequest-a.steer)*180/Math.PI).toFixed(2)+'°'],['车身航向',(a.yaw*180/Math.PI).toFixed(1)+'°']]);
    case 'brake':case 'longitudinal':return stage(['发出请求','液压单元接收','制动钳执行','轮速反馈'],[a.brakeRequest<-.06,a.brakeReceived,a.accel<-.06,t>=.84],[['纵向净距',gap],['请求加速度',a.brakeRequest.toFixed(1)+' m/s²'],['实际加速度',acc],['轮端角速度',wheel]]);
    case 'drive':return stage(['电池供电','逆变器输出','后轴传动','车辆加速'],[true,t>=.55,t>=.8,t>=1&&t<6],[['本车速度',speed],['纵向加速度',acc],['后轮角速度',wheel],['车辆行程',dist]]);
    case 'coolant':return stage(['泵送','支路分配','冷板换热','流向散热器'],[true,t>=1.4,t>=3.2,t>=4.8],[['示踪起点','动力总成泵'],['示踪前沿',t<1.4?'分配阀上游':t<3.2?'电脑冷却支路':t<4.8?'冷板下游':'前端散热器'],['回路状态','示例循环'],['运行时间',t.toFixed(1)+' s']]);
    case 'supervision':return stage(['舱内观测','提示发送','屏幕提示','驾驶员制动'],[true,t>=2,t>=2.75,t>=3.7],[['座舱提示',t>=2.75?'请接管':'监测中'],['踏板',t>=3.25&&t<5.7?'踩下':'释放'],['车辆加速度',acc],['本车速度',speed]]);
    case 'compute':return stage(['供电就绪','图像到达','计算输出','执行端收到'],[true,a.computing,a.requested,a.epsReceived],[['供电','接通'],['图像年龄',age],['计算状态',a.requested?'输出已发出':a.computing?'计算中':'等待图像'],['转向执行端',a.epsReceived?'已收到':'等候请求']]);
    default:throw new Error('缺少课程读数 '+key);
  }
}
