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
  drive:course(['rearinv','rearmotor','rearLshaft','wheelRL'],[edge('power','pack rearinv','supply'),edge('power','rearinv rearmotor','torque'),edge('steering','rearmotor reargear rearLshaft wheelRL','shaft')],'电驱传递'),
  coolant:course(['pump1','octo','coolcpu','housing/p-967e0c9c8b368c00','radiator'],[edge('cooling','pump1 octo','pump'),edge('cooling','octo coolcpu housing/p-967e0c9c8b368c00','flow'),edge('cooling','housing/p-967e0c9c8b368c00 radiator','return')],'跟随一股示意冷却液经过分配阀和车载电脑冷板，再到前端换热。'),
  vision:course(['forward0','bpL','ap_video','apboard'],[observe,side,compute],'前视与侧视分别采样。比较两路观测进入车载计算机的先后。'),
  perception:course(['forward0','bpL','apboard','logicA'],[observe,side,compute],'先取得图像观测，再由计算板更新目标。道路上的跟踪框与该次更新同步。'),
  ego:course(['speedFL','hcu','forward0','apboard'],[feedback,edge('feedback','hcu apboard','odometry'),observe],'车轮转动形成轮速观测。与前视观测对照，可估计本车的位移与转向。'),
  prediction:course(['forward0','apboard','logicA','epas','hcu'],[observe,compute,steering,braking],'比较横穿车停车与继续通过的轨迹，观察本车让行。'),
  lateral:course(['apboard','x193','epas','rack','wheelFL'],[steering,rack,edge('feedback','epas apboard','angle')],'从目标转角追到转向控制器与齿条。比较请求转角与实际前轮转角。'),
  longitudinal:course(['forward0','apboard','hcu','calFL','speedFL'],[observe,braking,pressure,feedback],'跟踪同车道前车的速度变化，对照制动响应和实际车距。'),
  supervision:course(['cabincam','apboard','screen','pedals'],[edge('vision','cabincam apboard','monitor'),edge('compute','apboard mcu screen','alert'),edge('feedback','pedals booster','driver')],'在驾驶员接管示例中，车内摄像头观测先于座舱提示，驾驶员响应后操作踏板。'),
  compute:course(['lvbat','forward0','apboard','logicA','hcu'],[support,water,observe,compute,braking,pressure],'限速识别与控制链时延'),
};
export const names={forward0:'前视摄像头',apboard:'HW4 智驾计算板',epas:'电动助力转向器',hcu:'制动液压控制单元',calFL:'左前制动钳',speedFL:'左前轮速传感器',rack:'齿条与横拉杆',x193:'转向接口 X193',wheelFL:'左前轮',vcfront:'前车身控制器',screen:'座舱屏',pack:'动力电池',rearinv:'后逆变器',rearmotor:'后驱动电机',rearLshaft:'左后半轴',pump1:'冷却液泵',octo:'八通阀',coolcpu:'电脑冷却支路','housing/p-967e0c9c8b368c00':'电脑冷板',radiator:'前端散热器',bpL:'左侧摄像头',ap_video:'视频输入接口',logicA:'智驾计算区',cabincam:'舱内摄像头',pedals:'驾驶员踏板',lvbat:'低压电池'};

// An edge first traverses once, then displays repeated packets or continuing flow.
// A negative phase means the input has not yet been sent.
export function transit(clock,a){
  if(a.course)return courseTransit(clock,a);
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
names.wheelRL='左后驱动轮';
function courseTransit(clock,a){
  const t=a.t,k=a.course;
  const frontAge=a.frontStamp<0?-1:t-a.frontStamp,sideAge=a.sideStamp<0?-1:t-a.sideStamp;
  switch(clock){
    case 'image':
      if(k==='compute')return (t-2)/.20;
      if(k==='overview')return (t-1.6)/.15;
      if(k==='ego')return a.lastFix?(a.s-a.lastFix)/1.1:-1;
      if(k==='turn')return t/.4;
      return a.detected&&a.front?frontAge/.12:-1;
    case 'side':return a.detected&&a.side?sideAge/.12:-1;
    case 'process':return k==='compute'?(t-2.2)/.54:a.detected?(a.age-.12)/.25:-1;
    case 'steer':return a.steerAge/.10;
    case 'rack':return (a.steerAge-.10)/.12;
    case 'angle':return Math.abs(a.steer)>.001?t/.3:-1;
    case 'brake':return k==='compute'?(a.t-2.74)/.18:a.brakeAge/.1;
    case 'pressure':return a.hydraulic?(t/.2):-1;
    case 'wheel':case 'odometry':return a.wheelAngle/(2*Math.PI);
    case 'display':return (t-1.6)/.35;
    case 'supply':return k==='drive'?(a.amp>.2?t:-1):t/.50;
    case 'torque':return a.amp>.2?a.motorAngle/(2*Math.PI):-1;
    case 'shaft':return a.wheelAngle/(2*Math.PI);
    case 'pump':return a.pumpAngle/(2*Math.PI);
    case 'flow':return a.pumpAngle/6-1;
    case 'return':return a.pumpAngle/6-2;
    case 'monitor':return t/.6;
    case 'alert':return (t-2)/.4;
    case 'driver':return a.driverPedal>.005?(t-3.5)/.35:-1;
    default:throw new Error('未定义的工况通路 '+clock);
  }
}
export function lessonReadout(k,a){
  const km=v=>(3.6*v).toFixed(1)+' km/h',deg=v=>(v*180/Math.PI).toFixed(1)+'°',m=v=>v.toFixed(1)+' m';
  const speed=km(a.speed),acc=a.accel.toFixed(2)+' m/s²',sa=deg(a.steer);
  const output=(caption,steps,conditions,meters)=>({caption,labels:steps.split('|'),conditions,meters});
  switch(k){
    case 'drive':return output(a.currentCmd>a.amp+1?'逆变器提高电流，电机转矩上升，车辆从静止开始加速。':a.amp>8?'后电机经减速器驱动半轴和车轮，沿路侧距离标观察加速。':'对照转速标记与道路距离。撤去电流后，传动轴和车轮仍随车辆滑行。',
      '逆变器输出|转矩建立|后轮驱动|撤流滑行',[a.currentCmd>1,a.torque>1,a.s>.01,a.t>7.5],
      [['逆变器等效电流',a.amp.toFixed(0)+' A'],['电机转矩',a.torque.toFixed(1)+' N·m'],['转子 / 半轴',Math.round(a.motorRPM)+' / '+Math.round(a.wheelRPM)+' rpm'],['后轮转速 / 车速',Math.round(a.wheelRPM)+' rpm / '+speed]]);
    case 'overview':return output(a.light?'绿灯放行，供能、驱动、转向和座舱状态随起步入弯依次变化。':'红灯前等待，配电与计算保持就绪，车轮静止。',
      '配电就绪|绿灯放行|驱动起步|入弯转向',[true,a.light,a.speed>.1,a.epsReceived],[['路口灯色',a.light?'绿':'红'],['行程',m(a.s)],['实际转角',sa],['车速',speed]]);
    case 'turn':case 'lateral':return output(k==='turn'?'本车进入右弯，齿条位移带动前轮右转，出弯后回正。':a.s<8?'本车接近 S 弯，沿参考线预瞄入弯方向。':a.s>56?'驶出 S 弯，转向请求减小，前轮逐渐回正。':a.steerRequest<0?'后半弯转向请求反向，齿条带动前轮换向。':'进入前半弯，比较目标转角与实际前轮角。',
      '预瞄轨迹|转向请求|齿条动作|前轮响应',[true,a.requested,a.epsReceived,a.epsReceived],[['转向请求',deg(a.steerRequest)],['实际前轮角',sa],['车身航向',deg(a.yaw)],['本车速度',speed]]);
    case 'brake':return output(a.speed<.01?'车辆在停止线前停稳，轮速降为零。':'接近停止线时，液压响应使摩擦片夹紧，制动盘和轮端同步减速。',
      '接近标线|制动请求|压力建立|车辆停稳',[true,a.brakeRequest<-.1,a.hydraulic,a.speed<.01],[['车头至停止线',m(35-a.x-2.35)],['实际加速度',acc],['轮速',Math.round(a.wheelRPM)+' rpm'],['车速',speed]]);
    case 'coolant':return output(a.grade>3?'定速爬坡增加驱动热负荷，温度上升后泵提速，冷却液流量随之增加。':'对照坡度、回路温度和流量。驶回平路后热负荷下降，泵逐渐降速。',
      '驱动负荷|温度上升|泵提速|回路换热',[a.grade>2,a.temp>42.2,a.flow>.6,true],[['坡度 / 车速',a.grade.toFixed(1)+'% / '+speed],['回路温度',a.temp.toFixed(1)+' °C'],['示例流量',a.flow.toFixed(2)+' L/s'],['热输入 / 散热',a.heatInput.toFixed(1)+' / '+a.heatOut.toFixed(1)+' kW']]);
    case 'vision':return output(a.side&&a.front?'两侧视野重叠，对照同一辆车的两次采样时刻。':a.side?'邻车从左后方赶上，侧视摄像头先取得图像。':a.front?'邻车驶到前方，前视摄像头接续观测。':'目标暂时离开两个镜头的视野。',
      '侧视可见|侧视采样|前视可见|前视采样',[a.side,a.side&&a.sideStamp>=0,a.front,a.front&&a.frontStamp>=0],[['目标方位',deg(Math.atan2(a.left,a.nx-a.x))],['侧视最近采样',a.sideStamp<0?'尚无':a.sideStamp.toFixed(2)+' s'],['前视最近采样',a.frontStamp<0?'尚无':a.frontStamp.toFixed(2)+' s'],['当前覆盖',a.front&&a.side?'双视野':a.front?'前视':a.side?'侧视':'无']]);
    case 'perception':return output(a.occluded?'隔挡遮住邻车后，计算板按上一帧速度外推，紫框逐渐变宽。':a.x>33?'邻车重新出现，新的观测让紫框收窄。':'摄像头看见邻车，跟踪框随观测更新。',
      '目标可见|隔挡遮挡|短时外推|重新观测',[a.detected,a.occluded,a.occluded,a.detected&&a.x>33],[['目标状态',a.occluded?'仅预测':'已观测'],['失去观测',a.hiddenAge.toFixed(2)+' s'],['纵向估计范围','±'+m(a.uncertainty)],['本车速度',speed]]);
    case 'ego':return output(a.lastFix&&a.s-a.lastFix<2?'经过 '+a.lastFix+' m 地标，视觉观测校正了累计里程。':a.lastFix?'驶离地标后继续用轮速推算位置，留意误差怎样再次累积。':'车轮每转一圈，估计里程就增加；轮径的微小偏差也随之累积。',
      '轮速积分|里程累计|地标匹配|估计校正',[true,true,a.lastFix>0,a.lastFix>0&&a.s-a.lastFix<2],[['实际行程',m(a.s)],['估计行程',m(a.estimated)],['估计误差',m(a.odomError)],['最近地标',a.lastFix?m(a.lastFix):'尚未经过']]);
    case 'prediction':return output(a.conflict?'两车预计接近同时到达路口，本车制动让行。':a.nz>3.5?'横穿车已离开冲突区域，本车可以通过路口。':'观察横向来车，比较它停车和继续通过的两条候选轨迹。',
      '观察横穿车|比较候选|减速让行|恢复行驶',[a.detected,a.detected&&a.age>.3,a.conflict,a.t>5&&a.nz>3.5],[['距冲突点',m(38-a.x)],['横穿车横向位置',m(a.nz)],['决策',a.conflict?'让行':a.nz>3.5?'通行':'观察'],['本车速度',speed]]);
    case 'longitudinal':return output(a.hydraulic?'前车变慢、车距缩短，制动钳夹紧，本车减速。':a.t>6&&a.accel>.1?'前车提速，制动解除，本车加速跟随。':a.t>6?'比较两车速度，观察车距如何稳定下来。':a.leadBraking?'前车开始制动，观察车距缩短到本车响应之间的间隔。':'前视摄像头跟踪同车道前车，建立初始车距。',
      '前车跟踪|间距缩小|本车减速|恢复跟随',[a.detected,a.leadSpeed<a.speed,a.accel<-.1,a.t>6&&a.accel>.1],[['前车速度',km(a.leadSpeed)],['本车速度',speed],['保险杠净距',m(a.gap)],['实际加速度',acc]]);
    case 'supervision':return output(a.t<2?'本车接近施工区，舱内摄像头监测驾驶员。':a.t<3.5?'座舱已提示接管，制动踏板仍未动作。':a.driverPedal>.005?(a.accel<-.1?'驾驶员踩下制动踏板，本车开始减速。':'观察制动踏板行程，再对照车辆加速度。'):'驾驶员松开踏板，本车以较低速度通过施工区。',
      '驾驶员监测|发出提示|踩下踏板|本车减速',[true,a.t>=2,a.driverPedal>.05,a.accel<-.1],[['座舱提示',a.t<2?'监测中':a.t<3.5?'请接管':'人工驾驶'],['示例相对踏板行程',Math.round(a.driverPedal*100)+'%'],['实际加速度',acc],['本车速度',speed]]);
    case 'compute':return output(a.t<2?'限速牌显示 40 km/h，本车保持车速。':a.t<2.2?'限速切换为 20 km/h，摄像头采集新图像。':a.t<2.74?'图像到达 HW4，执行端仍沿用原目标。':!a.delivered?'新目标已发出，制动端正在等待指令。':'制动端收到新目标。从采集到响应，本车已前进 9.2 m。',
      '图像采集|到达计算板|发布新限速|执行响应',[a.t>=2,a.t>=2.20,a.t>=2.74,a.delivered],[['牌面限速',a.limit+' km/h'],['执行端目标',a.delivered?'20 km/h':'40 km/h'],['等待期间行程',m(Math.max(0,Math.min(9.2,a.s-20)))],['本车速度',speed]]);
    default:throw new Error('工况无讲解 '+k);
  }
}
