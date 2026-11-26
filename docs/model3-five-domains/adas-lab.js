/* Standalone classroom simulations. All distances are metres; velocities are m/s internally. */
const MANUAL = 'https://www.tesla.com/ownersmanual/model3/en_us/GUID-2CB60804-9CEA-4F4B-8B04-09B991368DC5.html';
const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
const fixed = (x, digits) => (Math.abs(x) < .5 * 10 ** -digits ? 0 : x).toFixed(digits);
const signed = (x, digits) => (x > 0 ? '+' : '') + fixed(x, digits).replace('-', '−');
const roundValue = n => Number(n.toFixed(6));
const progress = (t, limit) => clamp(t / limit, 0, 1);
const cutinY = t => {
  const u = progress(t, 3);
  return 3.6 * (1 - 3 * u * u + 2 * u * u * u);
};
const arcAt = (s, radius, sign) => ({
  x: radius * Math.sin(s / radius),
  y: sign * radius * (1 - Math.cos(s / radius)),
});

const courses = {
  vision: {
    title: '两帧之间的像素位移', variants: [['near', '近目标 · 15 m'], ['far', '远目标 · 45 m']],
    control: '两次采样的时间差', unit: 'ms', min: 0, max: 120, step: 5, value: 50,
    formula: 'Δu = fₓ · vₓ · Δt / Z',
    assumptions: '针孔相机保持静止。目标以 2 m/s 沿画面水平方向移动，深度 Z 恒定。焦距 fₓ 取 900 px，时间差换算为秒。',
    stages: ['从一台车外镜头的第一帧开始，记录目标的水平像素位置。', '固定相机的安装姿态与焦距，再比较第二帧位置。', '同一目标横向经过车侧时，观察深度会改变画面中的位移。', '这里改变两次曝光的时间差。传输延迟需使用到达时间单独测量。', '固定两次曝光的间隔，切换目标深度以分辨几何因素。'],
    calc(variant, t) {
      const depthM = variant === 'near' ? 15 : 45;
      const movementM = 2 * t / 1000;
      return {depthM, frameMs: t, movementM, pixelShift: 900 * movementM / depthM};
    },
    read: m => [['水平像素位移', fixed(m.pixelShift, 1) + ' px'], ['目标横移', fixed(m.movementM, 3) + ' m']],
  },
  perception: {
    title: '遮挡后的可见范围', variants: [['narrow', '窄遮挡 · 1.5 m'], ['wide', '宽遮挡 · 3 m']],
    control: '遮挡中心向右偏移', unit: 'm', min: 0, max: 4, step: .1, value: 1,
    formula: '投影边界 = (x ± w/2) × 20/10',
    assumptions: '俯视点相机前方 10 m 设不透光遮挡物，在 20 m 处检查横向 8 m 的观察线。遮挡投影与观察线的重叠长度计为未知。视线可达只表示几何可见。',
    stages: ['从相机向观察线作视线，判断图像有机会直接观察哪些位置。', '图中只编码视线可达范围，是否允许通行还要查道路规则。', '保持相机位置固定，移动遮挡物，观察两条边界射线如何改变。', '观察线与遮挡投影重叠的部分保留为未知。', '若把所有未知区域标为空闲，读数给出会被错标的观察线长度。'],
    calc(variant, x) {
      const widthM = variant === 'narrow' ? 1.5 : 3;
      const leftM = 2 * (x - widthM / 2), rightM = 2 * (x + widthM / 2);
      const clippedLeftM = clamp(leftM, -4, 4), clippedRightM = clamp(rightM, -4, 4);
      const unknownM = Math.max(0, clippedRightM - clippedLeftM);
      return {widthM, centerM: x, leftM, rightM, clippedLeftM, clippedRightM, unknownM, visibleM: 8 - unknownM};
    },
    read: m => [['观察线上未知', fixed(m.unknownM, 1) + ' m'], ['视线可达', fixed(m.visibleM, 1) + ' / 8 m']],
  },
  ego: {
    title: '轮速偏差如何累积', variants: [['integrate', '仅积分轮速'], ['anchor', '第 5 秒校准']],
    control: '轮速比例偏差', unit: '%', min: -10, max: 10, step: .5, value: 5,
    formula: '位置误差 = 真实车速 × 比例偏差 × 积分时间',
    assumptions: '车辆以 12 m/s 直行 10 s。轮速偏差在全程保持恒定。校准条件在第 5 秒用理想外部位置将累积误差归零，此后轮速仍有原偏差。',
    stages: ['由轮端换算速度，再叠加滑块指定的比例偏差。', '切换到校准条件，用理想外部位置代表独立的环境观测。', '在同一车身前进方向对速度偏差积分，形成纵向位置误差。', '选择校准条件，在第 5 秒观察独立位置对估计的修正。', '第 10 秒与参考位置相减，读出这个直线实验中的尺度漂移。'],
    calc(variant, bias) {
      const anchor = variant === 'anchor', errorRate = 12 * bias / 100;
      const errorM = errorRate * (anchor ? 5 : 10);
      return {anchor, biasPercent: bias, errorRate, errorM, measuredMps: 12 + errorRate, estimatedM: 120 + errorM};
    },
    read: m => [['终点位置误差', signed(m.errorM, 1) + ' m'], ['估计行程', fixed(m.estimatedM, 1) + ' m']],
  },
  prediction: {
    title: '相邻车辆的候选轨迹', variants: [['keep', '保持车道'], ['cutin', '向本车道切入']],
    defaultVariant: 'cutin', control: '从观测时刻外推', unit: 's', min: 0, max: 4, step: .1, value: 1.5,
    formula: 'x = 20t；切入 y = 3.6(1 − 3u² + 2u³)',
    assumptions: '两条候选从相同的位置和速度出发，向前匀速 20 m/s。本车道中心取 y=0，相邻车道中心取 y=3.6 m。u 为 t/3 在 0 与 1 之间的截断值，切入在第 3 秒完成。两条轨迹不附加概率。',
    stages: ['两个候选共用相邻车道上的初始观测和速度。', '保留保持车道与平滑切入两个未来，实线显示目前选中的候选。', '读取候选距本车道中心的距离。判断时空冲突还需要本车的轨迹。', '切入曲线在起止时刻的侧向速度为零。机械可行性还要检查侧向加速度和轮胎约束。', '固定外推时长，比较两种候选的横向终点。'],
    calc(variant, t) {
      const cutin = variant === 'cutin', candidateYM = cutinY(t);
      return {cutin, horizonS: t, forwardM: 20 * t, selectedYM: cutin ? candidateYM : 3.6, candidateYM, keepYM: 3.6};
    },
    read: m => [['距本车道中心', fixed(m.selectedYM, 2) + ' m'], ['向前行进', fixed(m.forwardM, 1) + ' m']],
  },
  lateral: {
    title: '弯道曲率与前轮转角', variants: [['left', '左弯'], ['right', '右弯']],
    control: '目标弯道半径', unit: 'm', min: 30, max: 180, step: 5, value: 60,
    formula: 'κ = ±1/R，δ = atan(Lκ)，aᵧ = v²κ',
    assumptions: '采用无侧滑的运动学单轨模型，以后轴中点为参考，课堂轴距 L=2.80 m，恒速 12 m/s。左转为正。δ 表示等效前轮转角，图中比较沿切线与沿圆弧各行进 18 m 的位置。',
    stages: ['由弯曲方向和目标半径得到有符号的曲率。', '在计算端按照课堂单轨模型求目标转角，电路图提供设备连接关系。', '用等效前轮转角解释转向执行端的机械作用。车辆接口的实际量纲需另行核实。', '模型把左右前轮合并为一个等效前轮，后轴沿恒曲率圆弧前进。', '以继续直行为对照读取横向位置差，实车闭环核验还需要实测轨迹。'],
    calc(variant, r) {
      const sign = variant === 'left' ? 1 : -1, curvaturePerM = sign / r;
      const p = arcAt(18, r, sign);
      return {sign, radiusM: r, curvaturePerM, steeringDeg: Math.atan(2.8 * curvaturePerM) * 180 / Math.PI,
        accelMps2: 144 * curvaturePerM, forwardM: p.x, offsetM: p.y};
    },
    read: m => [['等效前轮转角', signed(m.steeringDeg, 2) + '°'], ['横向加速度', signed(m.accelMps2, 2) + ' m/s²']],
  },
  longitudinal: {
    title: '闭合时间与停车距离', variants: [['moving', '前车 54 km/h'], ['stopped', '前车静止']],
    control: '自车初速度', unit: 'km/h', min: 0, max: 108, step: 1, value: 72,
    formula: 'TTC = g / (v − v前)，d停 = vτ + v²/(2a)',
    assumptions: '初始净间距 g=30 m。两车保持初速度且闭合速度为正时可计算 TTC。另设自车延迟 τ=0.6 s 后以 5 m/s² 匀减速至静止。停车距离按道路坐标单独计算。',
    stages: ['用 30 m 的初始净间距设置跟车场景，再改变两车速度关系。', '观察间距缩短或增大的趋势，理解前碰撞提醒所关注的风险。', 'TTC 外推两车保持初速度时的闭合时刻。实际 AEB 触发条件需独立核实。', '轮速反馈可用来核对实际减速，这里先分别计算延迟行程与匀减速行程。', '用给定减速度求停车距离，再与具备时间基准的实车测量比较。'],
    calc(variant, kmh) {
      const egoMps = kmh / 3.6, leadMps = variant === 'moving' ? 15 : 0;
      const closingMps = egoMps - leadMps, delayM = egoMps * .6, brakingM = egoMps ** 2 / 10;
      return {egoMps, leadMps, closingMps, gapM: 30, ttcS: closingMps > 0 ? 30 / closingMps : null,
        delayM, brakingM, stoppingM: delayM + brakingM};
    },
    read: m => [['等速闭合时间 TTC', m.ttcS === null ? '无有限值' : fixed(m.ttcS, 2) + ' s'], ['自车停车距离', fixed(m.stoppingM, 1) + ' m']],
  },
  supervision: {
    title: '从界面提示到人工响应', variants: [['attention', '注意力提醒'], ['visibility', '视野受限并请求接管']],
    control: '提示至驾驶员响应', unit: 's', min: 0, max: 5, step: .25, value: 2,
    formula: '响应前行程 = 车速 × 从提示起经过的时间',
    assumptions: '课堂从界面已显示提示的时刻起算，车速取 15 m/s。响应时长由滑块设定。注意力提醒对应恢复专注，接管请求对应驾驶员接手。实际提示策略取决于车辆软件与现场条件。',
    stages: ['座舱摄像头观察注意状态，外部镜头负责前方可见性，两种情境可切换。', '区分驾驶员注意提醒与前视受限且界面已请求接管的情境。', '以界面显示注意提醒或接管请求的时刻作为零点。', '声音提示可单独记录。图内的人工响应计时从已显示的界面提示开始。', '把人工响应和操作责任对齐，读取驾驶员恢复专注或接管前的行程。'],
    calc(variant, t) {
      const takeover = variant === 'visibility';
      return {takeover, responseS: t, responseM: 15 * t, action: takeover ? '手动接管' : '恢复专注'};
    },
    read: m => [['响应前行程', fixed(m.responseM, 2) + ' m'], ['示例人工响应', m.action]],
  },
  compute: {
    title: '输出时信息已经有多旧', variants: [['city', '36 km/h'], ['highway', '90 km/h']],
    control: '采样至输出总时延', unit: 'ms', min: 0, max: 300, step: 10, value: 120,
    formula: 'Δs = v · Δt，Δt = 总时延 / 1000',
    assumptions: '车辆匀速直行，环境参照点固定。从一次采样到对应输出计时。课堂时延预算按采集 25%、计算 50%、输出 25% 拆分，仅用来展示计时区间。',
    stages: ['从机箱内计算功能所用的采样时刻起算，记录车辆初始位置。', '本次计时假定低压供电可用，采集链才能产生输入。', '本次预算假定机箱散热正常。验证温度与计算时延的关系还需要实测。', '把采集、计算和输出三段相加，得到端到端时延。', '在输出端比较采样车位和当前车位，再用同一时间基准的实车日志核对。'],
    calc(variant, t) {
      const speedMps = variant === 'city' ? 10 : 25;
      return {speedMps, latencyMs: t, ageDistanceM: speedMps * t / 1000, captureMs: t / 4, computeMs: t / 2, outputMs: t / 4};
    },
    read: m => [['采样至输出的位移', fixed(m.ageDistanceM, 2) + ' m'], ['课堂计算时段', fixed(m.computeMs, 1) + ' ms']],
  },
};

export function labDefaults(courseId) {
  if (!Object.hasOwn(courses, courseId)) return null;
  const c = courses[courseId];
  return {variant: c.defaultVariant || c.variants[0][0], value: c.value};
}

function normalize(courseId, state, fallback = labDefaults(courseId)) {
  const c = courses[courseId];
  const variant = c.variants.some(([id]) => id === state?.variant) ? state.variant : fallback.variant;
  const input = state?.value;
  const number = typeof input === 'number' || (typeof input === 'string' && input.trim()) ? Number(input) : NaN;
  const bounded = Number.isFinite(number) ? clamp(number, c.min, c.max) : fallback.value;
  const value = roundValue(c.min + Math.round((bounded - c.min) / c.step) * c.step);
  return {variant, value};
}

export function evaluateLab(courseId, state = {}) {
  if (!Object.hasOwn(courses, courseId)) return null;
  const current = normalize(courseId, state);
  return {...current, ...courses[courseId].calc(current.variant, current.value)};
}

// Geometry uses a common, accessible SVG viewBox. Only the drawing changes on input.
const num = n => Number(n.toFixed(2));
const line = (x1, y1, x2, y2, style = 'al-rule') =>
  `<line class="${style}" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}"/>`;
const rect = (x, y, w, h, style) =>
  `<rect class="${style}" x="${num(x)}" y="${num(y)}" width="${num(Math.max(0, w))}" height="${num(h)}"/>`;
const dot = (x, y, r, style) => `<circle class="${style}" cx="${num(x)}" cy="${num(y)}" r="${r}"/>`;
const path = (d, style) => `<path class="${style}" d="${d}"/>`;
const label = (x, y, word, anchor = 'start') =>
  `<text class="al-svgtext" x="${num(x)}" y="${num(y)}" text-anchor="${anchor}">${word}</text>`;
const polyline = (pts, style) => path(pts.map(([x,y], i) => `${i ? 'L' : 'M'}${num(x)} ${num(y)}`).join(' '), style);
const focus = (s, ...targets) => targets.includes(s) ? ' al-focus' : '';
const paperDot = (x, y, s, ...targets) => dot(x, y, targets.includes(s) ? 4.5 : 3.2, 'al-dot'+focus(s,...targets));
const rangeLine = (x0, x1, y, style) =>
  line(x0,y,x1,y,style) + line(x0,y-3,x0,y+3,style) + line(x1,y-3,x1,y+3,style);

function visionChart(m,s) {
  const origin = 73, end = origin + 8.7 * m.pixelShift;
  const note = s===2 ? '投影深度 '+m.depthM+' m' : s===4 ? '虚线框为另一深度' : '图像水平坐标';
  let g = label(9,29,'t₀') + label(9,65,'t₁') + label(265,16,note,'end');
  for (let dx = 0; dx <= 20; dx += 5) {
    const x = origin + dx * 8.7;
    g += line(x,19,x,79,'al-grid') + label(x,111,dx+'','middle');
  }
  g += line(origin,100,247,100) + label(268,111,'px','end');
  g += line(37,26,255,26,'al-grid') + line(37,63,255,63,'al-grid');
  g += rect(origin-7,18,14,16,'al-outline'+focus(s,0));
  if (s === 4) {
    const other = origin + 8.7 * 900 * m.movementM / (m.depthM === 15 ? 45 : 15);
    g += rect(other-8,53,16,20,'al-option');
  }
  g += rect(end-7,55,14,16,'al-obs'+focus(s,1,2));
  g += line(origin,33,origin,84,'al-dash') + line(end,72,end,84,'al-dash');
  g += rangeLine(origin,end,84,'al-route'+focus(s,3,4));
  return g + paperDot(origin,26,s,0) + paperDot(end,63,s,1,2,3,4);
}

function perceptionChart(m,s) {
  const X = x => 139 + 21*x, cameraY = 99, targetY = 24, nearY = (99+24)/2;
  const nearLeft = X(m.centerM - m.widthM/2), nearRight = X(m.centerM + m.widthM/2);
  let g = path(`M139 99 L${X(-4)} 24 H${X(4)} Z`, 'al-cone') +
    path(`M${nearLeft} ${nearY} L${X(m.leftM)} 24 H${X(m.rightM)} L${nearRight} ${nearY} Z`, 'al-shadow'+focus(s,2)) +
    line(139,cameraY,nearLeft,nearY,'al-dash') + line(139,cameraY,nearRight,nearY,'al-dash');
  g += line(X(-4),targetY,X(4),targetY,'al-visible'+focus(s,4));
  if (m.unknownM > 0) {
    g += line(X(m.clippedLeftM),targetY,X(m.clippedRightM),targetY,'al-hidden'+focus(s,3,4));
  }
  g += label(X(-4),13,'−4 m','middle') + label(X(4),13,'+4 m','middle');
  g += line(nearLeft,nearY,nearRight,nearY,'al-block'+focus(s,1));
  g += paperDot(X(0),cameraY,s,0) + label(X(0),115,'相机','middle');
  return g + label(7,28,'20 m') + label(7,65,'10 m');
}

function egoChart(m,s) {
  const X = t => 37 + 22*t, Y = e => 57 - 3.2*e;
  let g = label(7,16,'误差 m') + line(X(0),Y(12),X(0),Y(-12)) + line(X(0),Y(0),X(10),Y(0),'al-dash');
  for (const t of [0,5,10]) g += line(X(t),20,X(t),96,'al-grid') + label(X(t),108,t+'','middle');
  g += label(268,109,'s') + label(31,Y(10)+3,'+10','end') + label(31,Y(-10)+3,'−10','end');
  const e5 = m.errorRate * 5;
  if (s===1) g += label(259,16,'轮速误差 '+signed(m.errorRate,2)+' m/s','end');
  if (s===3) g += label(259,16,m.anchor ? '5 s 误差归零' : '无外部位置校准','end');
  if (m.anchor) {
    g += polyline([[X(0),Y(0)],[X(5),Y(e5)]],'al-comparison'+focus(s,1,2));
    g += line(X(5),Y(e5),X(5),Y(0),'al-reset'+focus(s,3));
    g += line(X(5),Y(0),X(10),Y(m.errorM),'al-route'+focus(s,2,4)) + paperDot(X(5),Y(0),s,3);
  } else {
    g += line(X(0),Y(0),X(10),Y(m.errorM),'al-route'+focus(s,1,2,3,4));
  }
  return g + paperDot(X(0),Y(0),s,0) + paperDot(X(10),Y(m.errorM),s,4);
}

function predictionChart(m,s) {
  const X = t => 31 + 54*t, Y = y => 84 - 12.7*y;
  const points = (max, cut) => Array.from({length: 33}, (_,i) => {
    const t = max*i/32;
    return [X(t),Y(cut ? cutinY(t) : 3.6)];
  });
  let g = rect(17,18,247,85,'al-road') + line(17,61,264,61,'al-lane') +
    label(24,32,'相邻车道') + label(24,100,'本车道');
  g += polyline(points(4,false),'al-option'+focus(s,2)) + polyline(points(4,true),'al-option'+focus(s,2));
  g += polyline(points(m.horizonS,m.cutin),'al-route'+focus(s,1,3,4));
  const x = X(m.horizonS), other = Y(m.cutin ? 3.6 : m.candidateYM);
  g += line(x,20,x,101,'al-dash') + dot(x,other,3.8,'al-option-dot') +
    paperDot(x,Y(m.selectedYM),s,2,3,4);
  if (s===4) g += line(x+5,other,x+5,Y(m.selectedYM),'al-comparison');
  return g + paperDot(X(0),Y(3.6),s,0) + label(19,114,'初始观测') + label(261,114,'向前 80 m','end');
}

function lateralChart(m,s) {
  // The plotted planar axes use one common scale to preserve curvature.
  const scale = 8.2, SX = x => 48 + scale*x, Y = y => 60 - scale*y;
  const points = Array.from({length: 35}, (_,i) => {
    const p = arcAt(18*i/34,m.radiusM,m.sign);
    return [SX(p.x),Y(p.y)];
  });
  const x = SX(m.forwardM), y = Y(m.offsetM), end = SX(18);
  let g = line(SX(0),Y(0),238,Y(0),'al-dash'+focus(s,1)) + label(263,64,'切线','end');
  g += polyline(points,'al-route'+focus(s,2,3));
  g += line(x,Y(0),x,y,'al-comparison'+focus(s,4));
  g += dot(end,Y(0),3,'al-option-dot') + paperDot(x,y,s,3,4) + paperDot(SX(0),Y(0),s,0);
  const oy = m.sign > 0 ? 106 : 16;
  const detail = s===2 ? 'δ '+signed(m.steeringDeg,2)+'°' :
    s===4 ? '横向偏移 '+signed(m.offsetM,2)+' m' : '左正 / 右负';
  return g + label(12,oy,detail) + label(264,oy,'弧长 18 m','end');
}

function longitudinalChart(m,s) {
  if (s >= 3) {
    const maxX=235, X = d => 24 + maxX*d/108;
    let g = label(24,18,'自车沿道路行进') + rect(24,39,maxX,14,'al-track') +
      rect(24,39,X(m.delayM)-24,14,'al-delay') +
      rect(X(m.delayM),39,X(m.stoppingM)-X(m.delayM),14,'al-execution'+focus(s,3));
    g += line(X(m.stoppingM),34,X(m.stoppingM),61,'al-route'+focus(s,4)) +
      label(24,80,'延迟行程 '+fixed(m.delayM,1)+' m') + label(259,80,'减速行程 '+fixed(m.brakingM,1)+' m','end');
    return g + line(24,96,259,96) + label(24,111,'0') + label(259,111,'108 m','end');
  }
  const tEnd = Math.min(8, m.ttcS ?? 8), gap8 = Math.max(0,30-8*m.closingMps);
  const top = Math.max(40, gap8), X = t => 38+27*t, Y = g => 89-64*g/top;
  let g = line(38,17,38,89) + line(38,89,X(8),89) + label(8,15,'净间距 m');
  for (const t of [0,4,8]) g += line(X(t),22,X(t),89,'al-grid') + label(X(t),105,t+'','middle');
  g += label(269,105,'s','end') + label(32,Y(30)+3,'30','end');
  g += line(X(0),Y(30),X(tEnd),Y(Math.max(0,30-tEnd*m.closingMps)),'al-route'+focus(s,1,2));
  if (m.ttcS !== null && m.ttcS <= 8) g += paperDot(X(m.ttcS),Y(0),s,2);
  return g + paperDot(X(0),Y(30),s,0);
}

function supervisionChart(m,s) {
  const x0=30, end=30+43*m.responseS;
  const prompt = m.takeover ? '界面请求接管' : '界面提醒注意';
  const phase = [m.takeover ? '前视受限' : '驾驶员注意状态', m.takeover ? '可用性受限' : '注意状态需确认',
    '提示时刻 0 s', '响应 '+fixed(m.responseS,2)+' s', '行程 '+fixed(m.responseM,2)+' m'][s];
  let g = label(16,17,prompt) + label(261,17,phase,'end') + line(x0,34,245,34,'al-grid');
  g += paperDot(x0,34,s,0,1,2) + line(x0,40,x0,76,'al-dash');
  g += line(x0,76,245,76,'al-grid') + line(x0,76,end,76,'al-route'+focus(s,3,4));
  g += line(end,45,end,76,'al-dash') + paperDot(end,76,s,3,4);
  g += label(261,63,m.action,'end') + label(15,105,'发出提示 0 s') + label(264,105,'课堂时间窗 5 s','end');
  return g;
}

function computeChart(m,s) {
  const x0=23, range=233, X = ms => x0+range*ms/300;
  const t=m.latencyMs, after=23+range*m.ageDistanceM/7.5;
  let g = label(16,16,'采样、计算、输出') + label(265,16,'总窗 300 ms','end');
  g += rect(x0,25,range,13,'al-track') + rect(x0,25,X(t/4)-x0,13,'al-delay'+focus(s,1)) +
    rect(X(t/4),25,X(3*t/4)-X(t/4),13,'al-compute'+focus(s,2)) +
    rect(X(3*t/4),25,X(t)-X(3*t/4),13,'al-execution'+focus(s,3));
  g += line(x0,23,x0,42,'al-rule') + line(X(t),22,X(t),43,'al-route'+focus(s,3));
  g += label(16,64,'采样车位') + label(265,64,'输出时车位','end') + line(x0,80,256,80,'al-grid');
  g += line(x0,80,after,80,'al-route'+focus(s,4)) + dot(x0,80,4.4,'al-option-dot'+focus(s,0)) + paperDot(after,80,s,3,4);
  return g + label(22,106,'0 m') + label(257,106,'7.5 m','end');
}

const charts = {vision: visionChart, perception: perceptionChart, ego: egoChart,
  prediction: predictionChart, lateral: lateralChart, longitudinal: longitudinalChart,
  supervision: supervisionChart, compute: computeChart};

let instanceCount = 0;

export class AdasLab {
  constructor(host, onChange) {
    if (!(host instanceof HTMLElement)) throw new TypeError('AdasLab requires a container element.');
    this.host = host;
    this.onChange = typeof onChange === 'function' ? onChange : () => {};
    const id = 'adas-experiment-' + (++instanceCount);
    this.host.innerHTML = `<section class="al-sheet" aria-labelledby="${id}-title">
      <div class="al-heading"><h3 id="${id}-title"></h3><span>课堂模型</span></div>
      <div class="al-choices" role="group" aria-label="实验条件">
        <button type="button"></button><button type="button"></button>
      </div>
      <div class="al-control">
        <div><label for="${id}-value"></label><output for="${id}-value"></output></div>
        <input id="${id}-value" type="range">
      </div>
      <svg class="al-chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 119" role="img"></svg>
      <p class="al-caption"></p>
      <dl class="al-results"><div><dt></dt><dd></dd></div><div><dt></dt><dd></dd></div></dl>
      <details class="al-basis"><summary><span class="al-formula"></span><span class="al-expand">假设</span></summary>
        <p class="al-assumptions"></p>
        <p class="al-manual" hidden>车主手册要求驾驶员保持专注，随时准备接管。<a href="${MANUAL}" target="_blank" rel="noopener noreferrer">Tesla 车主手册</a></p>
      </details>
    </section>`;
    const find = selector => this.host.querySelector(selector);
    this.sheet = find('.al-sheet');
    this.title = find('h3');
    this.buttons = Array.from(this.host.querySelectorAll('.al-choices button'));
    this.range = find('input');
    this.controlLabel = find('.al-control label');
    this.controlValue = find('.al-control output');
    this.chart = find('svg');
    this.caption = find('.al-caption');
    this.results = Array.from(this.host.querySelectorAll('.al-results div')).map(row =>
      [row.querySelector('dt'),row.querySelector('dd')]);
    this.basis = find('details');
    this.formula = find('.al-formula');
    this.assumptions = find('.al-assumptions');
    this.manual = find('.al-manual');
    this.buttons.forEach(button => button.addEventListener('click', () => this.edit({variant: button.dataset.variant})));
    this.range.addEventListener('input', () => this.edit({value: this.range.valueAsNumber}));
    this.sheet.hidden = true;
  }

  edit(patch) {
    if (!this.courseId) return;
    const next = normalize(this.courseId, patch, this.state);
    if (next.variant === this.state.variant && next.value === this.state.value) return;
    this.render(this.courseId, this.stage, next);
    this.onChange({...this.state});
  }

  render(courseId, stepIndex = 0, state = {}) {
    if (!Object.hasOwn(courses, courseId)) {
      this.courseId = null;
      this.sheet.hidden = true;
      return;
    }
    const changed = courseId !== this.courseId;
    const c = courses[courseId];
    const step = clamp(Math.trunc(Number(stepIndex)) || 0, 0, 4);
    const next = normalize(courseId, state, changed ? labDefaults(courseId) : this.state);
    if (!changed && step === this.stage && next.variant === this.state.variant && next.value === this.state.value) return;
    this.courseId = courseId;
    this.stage = step;
    this.state = next;
    this.sheet.hidden = false;
    this.sheet.dataset.course = courseId;
    this.sheet.dataset.step = String(step);
    if (changed) {
      this.title.textContent = c.title;
      this.buttons.forEach((button,i) => {
        button.dataset.variant = c.variants[i][0];
        button.textContent = c.variants[i][1];
      });
      this.controlLabel.textContent = c.control;
      this.range.min = String(c.min);
      this.range.max = String(c.max);
      this.range.step = String(c.step);
      this.formula.textContent = c.formula;
      this.assumptions.textContent = c.assumptions;
      this.basis.open = false;
      this.manual.hidden = courseId !== 'supervision';
    }
    for (const button of this.buttons) button.setAttribute('aria-pressed', String(button.dataset.variant === next.variant));
    if (this.range.valueAsNumber !== next.value) this.range.value = String(next.value);
    const valueText = (courseId === 'ego' && next.value > 0 ? '+' : '') + String(next.value).replace('-', '−') + ' ' + c.unit;
    this.range.setAttribute('aria-valuetext', valueText);
    this.controlValue.value = valueText;
    const model = c.calc(next.variant, next.value);
    const readings = c.read(model);
    this.results.forEach(([term, def], index) => {
      term.textContent = readings[index][0];
      def.textContent = readings[index][1];
    });
    this.chart.innerHTML = charts[courseId](model,step);
    this.chart.setAttribute('aria-label', c.stages[step] + ' ' + readings.map(pair=>pair.join(' ')).join('，'));
    this.caption.textContent = c.stages[step];
  }
}
