export const routes = {
  overview: ['认识整车分工', '谁采集信息，谁作出请求，谁让车轮动作？先展开整车，找到五个功能域。'],
  turn: ['横向控制', '找到底盘域后，沿转向请求追到转向器，再看车轮转角如何反馈。'],
  brake: ['纵向控制', '车辆除了改变方向，还要改变速度。跟随制动请求，观察轮速传感器如何反馈。'],
  drive: ['追踪动力来源', '制动解释了减速，加速又靠什么？从电池和逆变器追到电机与轮端。'],
  coolant: ['定速爬坡', '同样的车速，上坡为何需要更大的泵送流量？比较坡度、热负荷和冷却液温度。'],
};
export const topicGroups = [
  {title:'理解路况与本车状态', lessons:[
    {id:'vision', title:'摄像头观测', question:'邻车从左后方超越，哪个镜头先看见它？',
      closing:'侧视与前视接续了观测。目标被挡住时，跟踪只能依靠估计。'},
    {id:'perception', title:'遮挡与目标跟踪', question:'邻车被挡住后，它的位置还能估多准？',
      closing:'重获观测后，目标范围收窄。判断邻车怎样移动，还要知道本车怎样移动。'},
    {id:'ego', title:'自车运动估计', question:'本车沿弯道前进，怎样用地标校正里程？',
      closing:'地标校正了本车位置。有了本车和来车的位置，才能比较谁先到路口。'},
  ]},
  {title:'选择并执行驾驶动作', lessons:[
    {id:'prediction', title:'预测与让行决策', question:'横向来车会先到路口吗，本车该不该让？',
      closing:'本车让横穿车先行。确定怎么走之后，要分别控制方向和速度。'},
    {id:'lateral', title:'横向控制', question:'S 弯换向时，前轮怎样跟上目标转角？',
      closing:'转角反馈能检验车有没有沿参考线走；保持跟车距离还需要调节速度。'},
    {id:'longitudinal', title:'纵向控制', question:'前车先慢后快，本车怎样调节车距？',
      closing:'车距随两车速度变化。接下来把观测、计算和制动放到同一时钟上。'},
  ]},
  {title:'贯穿全程的时延与监督', lessons:[
    {id:'compute', title:'端到端时延', question:'从看见新限速到开始减速，车又走了多远？',
      closing:'这次响应前行驶了 9.2 m。换成驾驶员接管，也要分清提示和实际操作的时刻。'},
    {id:'supervision', title:'驾驶员监督与接管', question:'施工区前发出提示后，何时能看到驾驶员接手？',
      closing:'提示、踩踏板、车速下降依次出现，这三项观测把驾驶员操作和车辆响应连了起来。'},
  ]},
];
export const topics=Object.fromEntries(topicGroups.flatMap(group=>group.lessons.map(topic=>[topic.id,topic])));
