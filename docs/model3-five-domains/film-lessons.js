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
  prediction:course(['forward0','apboard','logicA','epas','hcu'],[observe,compute,steering,braking],'观察邻车保持原车道与切入的两种候选走向，以及计算完成后发出的两路请求。'),
  lateral:course(['apboard','x193','epas','rack','wheelFL'],[steering,rack,edge('feedback','epas apboard','angle')],'从目标转角追到转向控制器与齿条。比较请求转角与实际前轮转角。'),
  longitudinal:course(['forward0','apboard','hcu','calFL','speedFL'],[observe,braking,pressure,feedback],'邻车切入后，沿纵向请求、液压执行与轮速反馈观察跟车间距的恢复。'),
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
    case 'turn':case 'lateral':return output(k==='turn'?'本车进入右弯，齿条位移带动前轮右转，出弯后回正。':'本车跟踪 S 形参考线。左右弯交替时对照转向请求、齿条位移和前轮回正。',
      '预瞄轨迹|转向请求|齿条动作|前轮响应',[true,a.requested,a.epsReceived,a.epsReceived],[['转向请求',deg(a.steerRequest)],['实际前轮角',sa],['车身航向',deg(a.yaw)],['本车速度',speed]]);
    case 'brake':return output(a.speed<.01?'车辆在停止线前停稳，轮速降为零。':'接近停止线时，液压响应使摩擦片夹紧，制动盘和轮端同步减速。',
      '接近标线|制动请求|压力建立|车辆停稳',[true,a.brakeRequest<-.1,a.hydraulic,a.speed<.01],[['车头至停止线',m(35-a.x-2.35)],['实际加速度',acc],['轮速',Math.round(a.wheelRPM)+' rpm'],['车速',speed]]);
    case 'coolant':return output(a.grade>3?'定速爬坡增加驱动热负荷，温度上升后泵提速，冷却液流量随之增加。':'对照坡度、回路温度和流量。驶回平路后热负荷下降，泵逐渐降速。',
      '驱动负荷|温度上升|泵提速|回路换热',[a.grade>2,a.temp>42.2,a.flow>.6,true],[['坡度 / 车速',a.grade.toFixed(1)+'% / '+speed],['回路温度',a.temp.toFixed(1)+' °C'],['示例流量',a.flow.toFixed(2)+' L/s'],['热输入 / 散热',a.heatInput.toFixed(1)+' / '+a.heatOut.toFixed(1)+' kW']]);
    case 'vision':return output('橙车从左后方超越。侧视先采样，进入前方后由前视接续；两路同时可见时可比较采样时刻。',
      '侧视可见|侧视采样|前视可见|前视采样',[a.side,a.side&&a.sideStamp>=0,a.front,a.front&&a.frontStamp>=0],[['目标方位',deg(Math.atan2(a.left,a.nx-a.x))],['侧视最近采样',a.sideStamp<0?'尚无':a.sideStamp.toFixed(2)+' s'],['前视最近采样',a.frontStamp<0?'尚无':a.frontStamp.toFixed(2)+' s'],['当前覆盖',a.front&&a.side?'双视野':a.front?'前视':'侧视']]);
    case 'perception':return output(a.occluded?'隔挡遮住目标，紫框按最后可见速度外推，范围随失去观测的时间扩大。':'可见目标由摄像头更新；驶过隔挡后，重获观测使估计范围收缩。',
      '目标可见|隔挡遮挡|短时外推|重新观测',[a.detected,a.occluded,a.occluded,a.detected&&a.x>33],[['目标状态',a.occluded?'仅预测':'已观测'],['失去观测',a.hiddenAge.toFixed(2)+' s'],['纵向估计范围','±'+m(a.uncertainty)],['本车速度',speed]]);
    case 'ego':return output('轮速积分带有教学尺度偏差；经过 18、45、69 m 地标时，以视觉定位更新里程。紫色标记显示估计位置。',
      '轮速积分|里程累计|地标匹配|估计校正',[true,true,a.lastFix>0,a.lastFix>0&&a.s-a.lastFix<2],[['实际行程',m(a.s)],['估计行程',m(a.estimated)],['估计误差',m(a.odomError)],['最近地标',a.lastFix?m(a.lastFix):'尚未经过']]);
    case 'prediction':return output(a.conflict?'横穿车与本车的预期到达时间接近，本车在路口前减速让行。':'橙车横穿支路。对照继续通过与路口前停车的候选轨迹，冲突解除后本车恢复车速。',
      '观察横穿车|比较候选|减速让行|恢复行驶',[a.detected,a.detected&&a.age>.3,a.conflict,a.t>5&&a.nz>3.5],[['距冲突点',m(38-a.x)],['横穿车横向位置',m(a.nz)],['决策',a.conflict?'让行':a.nz>3.5?'通行':'观察'],['本车速度',speed]]);
    case 'longitudinal':return output('前车在同一车道先减速再提速。本车根据相对速度与净距调节加速度，制动钳随制动请求夹紧或释放。',
      '前车跟踪|间距缩小|本车减速|恢复跟随',[a.detected,a.leadSpeed<a.speed,a.accel<-.1,a.t>6&&a.accel>.1],[['前车速度',km(a.leadSpeed)],['本车速度',speed],['保险杠净距',m(a.gap)],['实际加速度',acc]]);
    case 'supervision':return output('接近施工锥桶，座舱发出接管提示；驾驶员踩下制动踏板后，本车降低速度通过施工区。',
      '驾驶员监测|发出提示|踩下踏板|本车减速',[true,a.t>=2,a.driverPedal>.05,a.accel<-.1],[['座舱提示',a.t<2?'监测中':a.t<3.5?'请接管':'人工驾驶'],['示例相对踏板行程',Math.round(a.driverPedal*100)+'%'],['实际加速度',acc],['本车速度',speed]]);
    case 'compute':return output('电子限速牌由 40 切换到 20。比较图像采集、计算完成、执行端收到新指令的时刻，以及车辆在这段延迟内驶过的距离。',
      '图像采集|到达计算板|发布新限速|执行响应',[a.t>=2,a.t>=2.20,a.t>=2.74,a.delivered],[['牌面限速',a.limit+' km/h'],['执行端目标',a.delivered?'20 km/h':'40 km/h'],['等待期间行程',m(Math.max(0,Math.min(9.2,a.s-20)))],['本车速度',speed]]);
    default:throw new Error('工况无讲解 '+k);
  }
}
