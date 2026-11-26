import {VehicleView} from './viewer.js';
import {assetBytes} from './packed.js';
import {routes,topics} from './curriculum.js';
import {AdasLab,labDefaults} from './adas-lab.js';
import {AdasOverlays,overlayScope,overlayLegend} from './adas-overlays.js';

const el=id=>document.getElementById(id);
const make=(tag,text='',cls='')=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const colors={ap:'#bc5839',cab:'#588396',lv:'#ba8952',net:'#579286',hv:'#bd7935',ch:'#526e80',th:'#5d929a',body:'#7f8081'};
const lessonNames={overview:'博世五大功能域',turn:'自动转向',brake:'制动与轮速反馈',drive:'电驱动与动力传递',coolant:'热泵与跨域冷却'};
const escapeState=s=>({...s});
const normalize=s=>s.toLocaleLowerCase().replace(/[\s()（）·-]/g,'');
let model,notes,core,nodes,lessons,view,lab,overlays,ready=false,treeHistory=[],mode='tree',resumePoint=null,caseBookmark=null,diagramOrigin=null;
let state={kind:'tree',id:'HIGHLAND',fraction:0};
let lessonMenu=false,query='',labelsOn=true;
let detailReady=false, detailLoad=null, navigation=0, playing=false, timer=0;
const evidenceNames={oem:'Tesla 公开资料',principle:'通用工程原理',example:'教学示例'};
const isCore=()=>state.kind==='lesson'&&lessons.get(state.lesson)?.core===true;
const inCase=()=>state.kind==='lesson'&&state.lesson===model.caseStudy.id;
function moduleId(){return currentStep().module||state.lesson;}
function moduleStage(){return inCase()?currentStep().stage-1:state.step;}
function parametersFor(key,index){
  const part=lessons.get(key).steps[index];
  return part.module?{variant:part.variant,value:part.value}:labDefaults(key);
}
function button(label,fn,css=''){
  const b=make('button',label,css);b.type='button';b.addEventListener('click',fn);return b;
}
function trail(id){const chain=[];for(let n=nodes.get(id);n;n=nodes.get(n.parent))chain.unshift(n);return chain;}
function currentStep(){return lessons.get(state.lesson).steps[state.step];}
function courseInfo(){return state.kind==='lesson'?currentStep():null;}
function currentDiagram(){return model.diagrams.find(d=>d.id===state.diagram);}
function currentId(){return state.kind==='diagram'?currentDiagram().spots[state.spot].id:courseInfo()?.id||state.id;}
function snapshot(){return {state:escapeState(state),camera:view.snapshot(),mode};}
function resetSearch(){query='';el('search').value='';}
function transition(next,options={}){
  if(!ready)return;
  const {push=true,pose=null,immediate=false,resetDir=false,advance=false}=options;
  const sequence=++navigation;
  if(!advance)pauseTour();
  const progress=el('progress');
  progress.classList.remove('error');progress.querySelector('.retry')?.remove();
  const overview=next.kind==='tree'&&next.id===model.root||next.kind==='lesson'&&next.lesson==='overview';
  if(!overview&&!detailReady){
    document.body.dataset.catalog='false';
    progress.hidden=false;el('progress-text').textContent='正在加载精细零件，首次进入时下载…';
    detailLoad??=view.loadDetail().then(()=>{
      detailReady=true;
      if(state.kind==='tree'||state.lesson==='overview')view.setView(viewSpec(false),view.snapshot(),true);
    }).finally(()=>{detailLoad=null;});
    detailLoad.then(()=>{if(sequence===navigation)transition(next,options);}).catch(err=>{
      if(sequence!==navigation)return;
      progress.classList.add('error');el('progress-text').textContent='精细模型读取失败。'+err.message;
      progress.append(button('重新加载',()=>transition(next,options),'retry'));
    });
    return;
  }
  progress.hidden=true;
  if(push){treeHistory.push(snapshot());if(treeHistory.length>80)treeHistory.shift();}
  state=next;mode=isCore()?'core':next.kind==='lesson'?'lesson':'tree';lessonMenu=false;resetSearch();
  render(resetDir,pose,immediate);
  if(next.kind==='lesson'&&!advance&&matchMedia('(max-width:690px)').matches)el('narrative').scrollIntoView({block:'nearest'});
}
function home(){
  if(!ready)return;treeHistory=[];resumePoint=null;caseBookmark=null;diagramOrigin=null;transition({kind:'tree',id:model.root,fraction:0},{push:false,resetDir:true});
}
function back(){
  const old=treeHistory.pop();
  if(old){transition(old.state,{push:false,pose:old.camera});if(old.state.kind!=='tree')resumePoint=null;return;}
  const up=nodes.get(currentId())?.parent;if(up)enter(up);else home();
}
function startLesson(key,step=0,fromCase=false){
  if(!lessons.has(key))return;
  diagramOrigin=null;
  caseBookmark=fromCase?snapshot():null;
  const same=state.kind==='lesson';resumePoint=null;
  const parameters=lessons.get(key).core?parametersFor(key,step):{};
  transition({kind:'lesson',lesson:key,step,...parameters},{push:!same,resetDir:true});
}
function openDiagram(id,spot=0,fromClass=false){
  diagramOrigin=fromClass?snapshot():null;
  transition({kind:'diagram',diagram:id,spot},{resetDir:true});
}
function diagramForStep(step){
  let best=null;
  for(const [i,id] of [step.id,...step.related].entries())for(const d of model.diagrams){
    d.spots.forEach((s,j)=>{
      if(!view.descendant(id,s.id))return;
      const rank=20*i+trail(id).length-trail(s.id).length;
      if(!best||rank<best.rank)best={d,j,rank};
    });
  }
  return best;
}
function gotoStep(i,advance=false){
  if(i<0||i>=lessons.get(state.lesson).steps.length)return;
  if(inCase()){
    const saved={...state.caseParameters,[state.step]:{variant:state.variant,value:state.value}};
    transition({...state,step:i,caseParameters:saved,...(saved[i]||parametersFor(state.lesson,i))},{push:false,advance});
  }else transition({...state,step:i},{push:false,advance});
}
function pauseTour(){
  playing=false;clearTimeout(timer);view?.tourSignal(null);
  el('tour-play').textContent='播放讲解';el('tour-play').setAttribute('aria-pressed','false');
}
function narrative(){
  const panel=el('narrative');panel.hidden=state.kind!=='lesson';
  if(panel.hidden)return;
  const lesson=lessons.get(state.lesson),step=currentStep(),last=state.step===lesson.steps.length-1;
  el('scene-count').textContent=(state.step+1)+' / '+lesson.steps.length;
  el('scene-name').textContent=step.label;
  el('scene-text').textContent=step.scene||step.role;
  el('tour-prev').disabled=state.step===0;el('tour-next').disabled=last;
  el('tour-progress').max=lesson.steps.length;el('tour-progress').value=state.step+1;
  el('tour-play').textContent=playing?'暂停讲解':last?'重新播放':'播放讲解';
  el('tour-play').setAttribute('aria-pressed',String(playing));
  clearTimeout(timer);
  if(playing){
    view.tourSignal(step.id,lesson.steps[state.step-1]?.id,isCore()?overlays.motionPaths:[]);
    const duration=Math.max(5200,Math.min(14000,el('scene-text').textContent.length*220));
    timer=setTimeout(()=>{if(last){pauseTour();narrative();}else gotoStep(state.step+1,true);},duration);
  }
  el('view-tip').textContent=viewHint();
}
function toggleTour(){
  if(state.kind!=='lesson')return;
  if(playing){pauseTour();narrative();return;}
  playing=true;
  if(state.step===lessons.get(state.lesson).steps.length-1)gotoStep(0,true);else narrative();
}
function shiftStep(delta){
  gotoStep(state.step+delta);
}
function enter(id){
  if(!nodes.has(id))return;
  if(state.kind!=='tree')resumePoint=snapshot();
  if(id===model.root&&state.kind!=='lesson'){transition({kind:'tree',id,fraction:1});return;}
  transition({kind:'tree',id,fraction:nodes.get(id).children.length?1:0});
}
function resume(){
  if(!resumePoint)return;const prev=resumePoint;resumePoint=null;
  const i=treeHistory.findLastIndex(s=>s.state.kind===prev.state.kind&&s.state.lesson===prev.state.lesson&&s.state.step===prev.state.step&&s.state.diagram===prev.state.diagram&&s.state.spot===prev.state.spot);
  if(i>=0)treeHistory=treeHistory.slice(0,i);
  transition(prev.state,{push:false,pose:prev.camera});
}
function changeOpen(fraction){
  if(state.kind!=='tree'||!nodes.get(state.id).children.length)return;
  const n=Math.max(0,Math.min(1,fraction));
  transition({...state,fraction:n},{push:Math.abs(state.fraction-n)>.98});
}
function pick(id){
  if(!ready)return;
  if(state.kind==='diagram'){
    const spots=currentDiagram().spots;
    const best=spots.map((s,i)=>({id:s.id,i,len:trail(s.id).length})).filter(s=>view.descendant(id,s.id)).sort((a,b)=>b.len-a.len)[0];
    const i=best?.i??-1;
    if(i>=0&&i!==state.spot)transition({...state,spot:i},{push:false});
    else enter(best?.id||id);
    return;
  }
  if(state.kind==='lesson'){
    const steps=lessons.get(state.lesson).steps;
    if(isCore()){
      const active=currentStep(),match=[active.id,...active.related].find(k=>view.descendant(id,k));
      if(match){enter(match);return;}
    }
    const i=steps.findIndex(s=>s.id===id);
    if(i>=0&&i!==state.step){gotoStep(i);return;}
    const step=currentStep();
    if(id===step.id||view.descendant(id,step.id)){enter(step.id);return;}
    const nearest=steps.map((s,i)=>({id:s.id,i,depth:trail(s.id).length})).filter(s=>view.descendant(id,s.id)).sort((a,b)=>b.depth-a.depth)[0];
    if(nearest){gotoStep(nearest.i);return;}
    return;
  }
  const record=nodes.get(state.id);
  if(!record.children.length)return;
  if(state.fraction<.03){changeOpen(1);return;}
  const child=trail(id).find(n=>n.parent===state.id);if(child)enter(child.id);
}
function viewSpec(defaultDirection){
  if(state.kind==='diagram'){
    const s=currentDiagram(),spot=s.spots[state.spot];
    return {include:s.include,overview:false,fraction:0,service:s,arrow:spot.arrow||null,direction:spot.direction,labels:[],defaultDirection};
  }
  if(state.kind==='lesson'){
    const l=lessons.get(state.lesson),step=currentStep(),overview=state.lesson==='overview';
    if(l.core)return {overview:false,fraction:0,highlight:step.id,defaultDirection,
      ...overlayScope(moduleId(),moduleStage(),step,state),labels:[{id:step.id,label:nodes.get(step.id).label}]};
    return {include:overview?[model.root]:model.traces[state.lesson],overview,explode:overview?model.root:null,
      fraction:overview?1:0,highlight:step.id,focus:step.id,defaultDirection,
      labels:[{id:step.id,label:(state.step+1)+' · '+step.label}]};
  }
  const n=nodes.get(state.id),overview=n.id===model.root;
  const ids=state.fraction>.24?n.children:[];
  return {include:[n.id],overview,explode:n.id,fraction:state.fraction,defaultDirection,
    direction:n.electronics?.view,
    labels:ids.length<=12?ids.map(id=>({id,label:nodes.get(id).label})):[]};
}
function row(id,text,action,{idx='',sub='',tail='',active=false,domain='',key=''}={}){
  const b=button('',action,'nav-row'+(active?' active':''));b.dataset.target=key||id;
  if(domain){const d=make('span','','sys-rule');d.style.backgroundColor=colors[domain];b.append(d);}
  if(idx)b.append(make('span',idx,'idx'));else if(!domain)b.append(make('span','','bullet'));
  const main=make('span',text,'row-main');if(sub)main.append(make('small',sub));b.append(main);
  if(tail)b.append(make('span',tail,'tail'));return b;
}
function addList(host,rows){const list=make('div','','nav-list');list.append(...rows);host.append(list);}
function showLessonMenu(kind){
  navigation++;pauseTour();el('progress').hidden=true;
  mode=kind;lessonMenu=true;resetSearch();navRender();
  if(matchMedia('(max-width:690px)').matches)el('nav-title').scrollIntoView({block:'start'});
}
function navRender(){
  document.body.dataset.catalog=String(lessonMenu);
  for(const tab of ['tree','lesson','core'])el('mode-'+tab).setAttribute('aria-pressed',mode===tab);
  const host=el('navigation');host.replaceChildren();
  el('nav-title').textContent=mode==='core'?'智驾专题':mode==='lesson'?'讲解路线':'装配目录';
  if(query){
    const s=normalize(query),a=model.nodes.filter(n=>normalize([n.label,n.id,n.english||'',n.pn||'',n.ref||''].join(' ')).includes(s));
    a.sort((a,b)=>(a.type==='part')-(b.type==='part')||a.label.length-b.label.length);
    el('nav-count').textContent=a.length+' 项';
    if(!a.length)host.append(make('p','没有找到匹配部件','nav-caption'));
    addList(host,a.slice(0,70).map(n=>row(n.id,n.label,()=>enter(n.id),{sub:n.pn||nodes.get(n.parent)?.label||'',tail:n.type==='part'?'零件':'总成'})));
    if(a.length>70)host.append(make('p','显示前 70 项，可继续输入缩小范围。','nav-caption'));return;
  }
  if(mode==='lesson'||mode==='core'){
    const classroom=mode==='core';
    const syllabus=classroom?topics:routes;
    const catalog=Object.keys(syllabus).map(id=>lessons.get(id));
    el('nav-count').textContent=catalog.length+(classroom?' 个专题':' 条路线');
    if(state.kind==='lesson'&&!lessonMenu&&classroom===isCore()){
      const l=lessons.get(state.lesson);
      host.append(button(classroom?'全部智驾专题':'全部讲解路线',()=>showLessonMenu(mode),'nav-back'));
      host.append(make('p',l.title,'nav-caption'));
      addList(host,l.steps.map((s,i)=>row(s.id,s.label,()=>gotoStep(i),
        {idx:String(i+1).padStart(2,'0'),active:i===state.step,key:classroom?'core-step-'+i:'step-'+s.id})));
    }else {
      host.append(make('p',classroom?'弯道中，邻车从遮挡处切入。本车如何看见它、判断风险、调整方向和速度？':'从“谁负责”开始，再追踪转向、制动和驱动，最后看哪些部件需要共同散热。','course-intro'));
      if(classroom){
        const full=button('案例 · '+model.caseStudy.title,()=>{startLesson(model.caseStudy.id);
          if(matchMedia('(max-width:690px)').matches)el('heading').scrollIntoView({block:'start'});},'nav-feature case-feature');
        full.dataset.target='cutin-case';host.append(full);
      }
      addList(host,catalog.map((l,i)=>row(l.id,l.title,()=>{startLesson(l.id);
      if(classroom&&matchMedia('(max-width:690px)').matches)el('heading').scrollIntoView({block:'start'});},
      {idx:String(i+1).padStart(2,'0'),sub:syllabus[l.id][1],tail:syllabus[l.id][0],active:state.kind==='lesson'&&l.id===state.lesson})));
      if(classroom){const chips=make('a','车载芯片与控制器 ↗','chip-link');chips.href='chips.html';host.append(chips);}
    }
    return;
  }
  if(state.kind==='diagram'){
    const diagram=currentDiagram();el('nav-title').textContent='安装关系';el('nav-count').textContent=diagram.spots.length+' 个视点';
    host.append(button('返回整车目录',home,'nav-back'));
    addList(host,diagram.spots.map((s,i)=>row(s.id,s.label,()=>transition({...state,spot:i},{push:false}),
      {active:state.spot===i,idx:String(i+1).padStart(2,'0'),key:'spot-'+i})));return;
  }
  const id=state.kind==='tree'?state.id:model.root,n=nodes.get(id);
  el('nav-count').textContent=id===model.root?model.domainOrder.length+' 个功能域':n.children.length+' 个下级';
  if(id!==model.root){
    host.append(button('上一级装配',()=>{const parent=nodes.get(id).parent;enter(parent||model.root);},'nav-back'));
    host.append(make('p',n.label,'nav-caption'));
  }
  if(!n.children.length){const p=nodes.get(n.parent);host.append(make('p','同一装配内的零件','nav-caption'));
    addList(host,p.children.map(cid=>row(cid,nodes.get(cid).label,()=>enter(cid),{active:cid===id})));return;}
  addList(host,n.children.map((cid,i)=>{
    const c=nodes.get(cid),dom=id===model.root?cid:'';
    return row(cid,c.label,()=>enter(cid),{idx:dom?String(i+1).padStart(2,'0'):'',domain:dom,tail:c.type==='assembly'?String(c.count):''});
  }));
  if(id===model.root)for(const d of model.diagrams||[])host.append(button(d.title,()=>openDiagram(d.id),'nav-feature'));
}
function breadcrumb(){
  const host=el('crumbs');host.replaceChildren();
  if(state.kind==='diagram'){host.append(button('整车',home),make('span','/'),make('span','安装关系'));return;}
  if(state.kind==='lesson'){host.append(button(isCore()?'智驾专题':'讲解路线',()=>showLessonMenu(isCore()?'core':'lesson')),make('span','/'),make('span',lessons.get(state.lesson).title));return;}
  const chain=trail(state.id);
  const parts=chain.length>4?[chain[0],null,...chain.slice(-3)]:chain;
  for(const [i,n] of parts.entries()){
    if(i)host.append(make('span','/'));
    if(!n){host.append(make('span','…'));continue;}
    const text=n.id===model.root?'整车':n.label;
    host.append(i===parts.length-1?make('span',text):button(text,()=>enter(n.id)));
  }
}
function external(host,url,label){
  if(!url?.startsWith('https://'))return;
  const a=make('a',label);a.href=url;a.target='_blank';a.rel='noopener';host.append(a);
}
function detail(){
  const courseDetails=el('core-detail');courseDetails.replaceChildren();courseDetails.hidden=!isCore();
  if(state.kind==='diagram'){
    const diagram=currentDiagram(),spot=diagram.spots[state.spot];el('heading').textContent=diagram.title;
    el('view-mode').textContent='维修示图';el('subtitle').textContent=diagram.subtitle;
    el('detail-kind').textContent='安装关系';el('detail-title').textContent=spot.label;el('detail-copy').textContent=spot.note;
    el('io').replaceChildren();const ev=el('evidence');ev.replaceChildren();
    for(const [label,color] of diagram.legend){
      const k=make('span','','diagram-key'),sw=make('i');sw.style.background=color;k.append(sw,document.createTextNode(label));ev.append(k);
    }
    const source=spot.url||diagram.url;
    external(ev,source,source.includes('/connector/')?'原厂连接器条目':'原厂维修图');
    if(diagram.imageUrl)external(ev,spot.imageUrl||diagram.imageUrl,(spot.imageUrl||diagram.imageUrl).includes('/faceviews/')?'对照原厂端面图':'对照原厂位置图');
    else external(ev,nodes.get(spot.id)?.figureUrl||nodes.get(spot.arrow)?.figureUrl,'对照当前部位插图');
    const a=el('actions');a.replaceChildren();
    a.append(button('拆开当前对象',()=>enter(spot.id),'primary'),button('下一个视点',()=>transition({...state,spot:(state.spot+1)%diagram.spots.length},{push:false})));
    if(diagramOrigin)a.append(button('返回智驾步骤',()=>{const prev=diagramOrigin;diagramOrigin=null;transition(prev.state,{push:false,pose:prev.camera});}));
    a.append(button('返回整车',home));return;
  }
  const record=nodes.get(currentId()),isCourse=state.kind==='lesson',base=record.id===model.root;
  const teaching=isCourse?currentStep():notes.notes[record.id]||notes.domains[record.id];
  el('heading').textContent=isCourse?lessons.get(state.lesson).title:base?(model.projectTitle||document.title):record.label;
  el('view-mode').textContent=isCore()?'智驾课堂':isCourse?'讲解视图':base&&state.fraction<.02?'装配视图':record.type==='part'?'零件视图':state.fraction>.02?'爆炸视图':'装配视图';
  el('subtitle').textContent=isCourse?lessons.get(state.lesson).summary:base?'博世五大功能域 · 焕新版 · Fremont · 北美左舵 · 长续航全轮驱动':record.english||nodes.get(record.parent)?.label||'';
  el('detail-kind').textContent=isCourse?('步骤 '+String(state.step+1).padStart(2,'0')+' / '+lessons.get(state.lesson).steps.length):base?'整车':record.type==='part'?'零件':'总成';
  el('detail-title').textContent=isCourse?currentStep().label:base?'整车装配':record.label;
  el('detail-copy').textContent=inCase()?currentStep().scene:((!isCourse&&record.electronics?record.description:null)||teaching?.role||(base?(state.fraction>.01?'点选功能域的标注或实体可查看下级装配。':'单击整车展开五个功能域，也可从左侧目录直接进入任一域。'):record.description||record.evidence||('本层包含 '+record.children.length+' 个直属装配与零件。')));
  const io=el('io');io.replaceChildren();
  for(const [label,v] of [['输入',teaching?.input],['输出',teaching?.output]])if(v){const div=make('div');div.append(make('dt',label),make('dd',v));io.append(div);}
  const ev=el('evidence');ev.replaceChildren();
  if(isCore()){
    const lesson=lessons.get(state.lesson),kind=make('span',evidenceNames[teaching.evidence],'core-proof');
    kind.dataset.evidence=teaching.evidence;courseDetails.append(kind);
    if(inCase())courseDetails.append(make('span',teaching.role,'core-locator'));
    const related=make('div','','core-related');
    [teaching.id,...teaching.related].forEach(id=>related.append(button(nodes.get(id).label,()=>enter(id))));
    const installation=diagramForStep(teaching);
    if(installation)related.append(button('安装图 · '+installation.d.title,()=>openDiagram(installation.d.id,installation.j,true)));
    courseDetails.append(related);
    if(teaching.boundary)courseDetails.append(make('p',teaching.boundary,'core-locator'));
    const reflection=make('details','','core-recap');
    reflection.append(make('summary',lesson.question),make('p',lesson.check));courseDetails.append(reflection);
    for(const key of teaching.sources){const src=core.sources[key];external(ev,src.url,src.title);}
  }
  if(base)ev.append(make('span',model.assemblies.toLocaleString()+' 个装配节点'),make('span',model.parts.toLocaleString()+' 个实体'));
  else if(record.pn)ev.append(make('span',record.pn));else if(!isCourse&&record.type==='assembly')ev.append(make('span',record.count+' 个实体'));
  if(record.installationSlot)ev.append(make('span','维修图位置 · '+record.installationSlot));
  if(record.electronics&&!isCore()){
    ev.append(make('span',record.electronics.level,'core-proof'));
    for(const key of record.electronics.sources){const [title,url]=model.electronicsSources[key];external(ev,url,title);}
    const guide=make('a','车载芯片资料页');guide.href='chips.html';ev.append(guide);
  }
  if(!base&&!isCore()&&!record.electronics){external(ev,record.cnUrl||record.url,'查看资料');external(ev,record.faceUrl,'线束侧端面图');external(ev,record.figureUrl||record.locationUrl,'原厂安装图');}
  if(record.handbook?.length&&!isCore()){
    const box=make('details','','handbook-note');box.append(make('summary','原厂图解对照'));
    for(const e of record.handbook){box.append(make('p',e.fact));if(e.geometry)box.append(make('p',e.geometry));external(box,e.figureUrl||e.url,'查看对应原厂图');}
    ev.append(box);
  }
  if (!isCourse && record.links?.length) {
    const box=make('details','','handbook-note');
    box.dataset.assemblyLinks='';
    box.append(make('summary','关联接口与总成（'+record.links.length+'）'));
    const links=make('div','','core-related');
    for (const [id,label] of record.links) links.append(button(label,()=>enter(id)));
    box.append(links);
    ev.append(box);
  }
  if (base || model.domainOrder.includes(record.id)) external(ev,model.classification.source,'博世功能域划分依据');
  if(model.domainOrder.includes(record.id)){
    const a=make('a','查看本域图册');a.href='atlas.html?domain='+encodeURIComponent(record.id);ev.append(a);
  }
  const a=el('actions');a.replaceChildren();
  if(isCourse){
    const l=lessons.get(state.lesson);
    const pre=button('上一步',()=>shiftStep(-1));pre.disabled=state.step===0;
    const order=Object.keys(isCore()?topics:routes);
    const following=inCase()?null:lessons.get(order[order.indexOf(l.id)+1]);
    const ended=state.step===l.steps.length-1;
    const next=button(ended?(following?'进入下一专题':'完成讲解'):'下一步',()=>ended?(following?startLesson(following.id):home()):shiftStep(1),'primary');
    a.append(pre,next,button('拆开此对象',()=>enter(record.id)));
    if(inCase())a.append(button('深入本环节专题',()=>startLesson(moduleId(),moduleStage(),true)));
    else if(caseBookmark)a.append(button('返回弯道切入案例',()=>{
      const point=caseBookmark;caseBookmark=null;transition(point.state,{push:false,pose:point.camera});
    }));
    return;
  }
  if(record.children.length)a.append(button(state.fraction>.01?'合拢本层':base?'展开五大功能域':'展开本层',()=>changeOpen(state.fraction>.01?0:1),'primary'));
  if(resumePoint)a.append(button(resumePoint.state.kind==='diagram'?'返回安装关系图':'返回讲解步骤',resume,'primary'));
  if(!base||state.fraction>.01)a.append(button('返回上一步',back));
  if(base&&!state.fraction)a.append(button('开始系统讲解',()=>startLesson('overview')),button('智驾案例 · 弯道切入',()=>startLesson(model.caseStudy.id)));
  if(record.children.length&&(!base||state.fraction>.01)){
    const lab=make('label','展开间距','range'),slider=make('input');slider.type='range';slider.min='0';slider.max='100';
    slider.setAttribute('aria-label','展开间距');slider.value=String(Math.round(state.fraction*100));
    slider.addEventListener('input',()=>{state.fraction=Number(slider.value)/100;view.setView(viewSpec(false),null,true);});
    slider.addEventListener('change',()=>{detail();el('view-mode').textContent=state.fraction>.01?'爆炸视图':'装配视图';});
    lab.append(slider);a.append(lab);
  }
}
function syncLegend(){
  const host=el('overlay-legend');host.hidden=!isCore()||!labelsOn;host.replaceChildren();
  if(host.hidden)return;
  for(const item of overlayLegend(moduleId(),moduleStage(),state)){
    const name=make('span'),sample=make('i','',item.style);
    sample.style.setProperty('--sample',item.color);name.append(sample,document.createTextNode(item.label));host.append(name);
  }
}
function viewHint(){
  if(playing)return isCore()&&overlays.motionPaths.length?'青色光点沿当前教学路径移动':'青色光点指示本幕讲解对象';
  if(state.kind==='diagram')return '红色箭头标出当前安装位置 · 拖动旋转';
  if(!isCore())return state.kind==='lesson'?'点当前对象进入局部拆解 · 拖动旋转':'单击拆解 · 拖动旋转 · 滚轮缩放';
  const module=moduleId();
  if(['prediction','longitudinal','ego'].includes(module)||module==='lateral'&&![1,2].includes(moduleStage()))return '三维路程按教学比例绘制 · 数值见实验';
  if(['vision','perception'].includes(module))return '视野与观测按教学比例绘制 · 虚线含义见图例';
  return '彩色叠加表示教学关系 · 点选实体可拆解';
}
function render(resetDir=false,pose=null,immediate=false){
  const classroom=isCore();
  document.body.dataset.classroom=String(classroom);
  document.body.dataset.state=state.kind;document.body.dataset.node=currentId();
  el('adas-lab').hidden=!classroom;
  el('core-stage-line').hidden=!classroom;
  if(classroom){
    const length=lessons.get(state.lesson).steps.length;
    el('core-stage-line').firstElementChild.textContent=(state.step+1)+' / '+length+'　'+currentStep().label;
    el('core-prev').disabled=state.step===0;el('core-next').disabled=state.step+1===length;
  }
  overlays.clear();
  breadcrumb();navRender();detail();syncLegend();
  if(classroom)lab.render(moduleId(),moduleStage(),state);
  const scope=viewSpec(resetDir);
  if(classroom)scope.frameBounds=overlays.show(moduleId(),moduleStage(),state,currentStep());
  view.resize();view.setView(scope,pose,immediate);narrative();
  if(state.kind==='lesson')el('subtitle').textContent=(isCore()?topics[moduleId()]:routes[state.lesson])[1];
  el('view-tip').textContent=viewHint();
  el('announce').textContent=el('detail-title').textContent;
}
async function boot(){
  try{
    const read=async name=>{const r=await fetch('assets/'+name,{cache:'no-cache'});if(!r.ok)throw new Error('读取文件失败 '+name);return r.json();};
    [model,notes,core]=await Promise.all([assetBytes('assets/assembly.json').then(b=>JSON.parse(new TextDecoder().decode(b))),read('lessons.json'),read('adas.json')]);nodes=new Map(model.nodes.map(n=>[n.id,n]));
    el('classroom-scope').textContent=core.scope;
    const overview={id:'overview',title:'博世五大功能域',summary:'按整车功能域依次讲解职责、输入和输出。',steps:model.domainOrder.map(id=>({id,label:nodes.get(id).label,...notes.domains[id]}))};
    lessons=new Map([overview,...notes.lessons].map(l=>[l.id,{...l,title:lessonNames[l.id]||l.title}]));
    for(const lesson of core.lessons)lessons.set(lesson.id,{...lesson,core:true});
    lessons.set(model.caseStudy.id,{...model.caseStudy,core:true});
    view=new VehicleView(el('model-canvas'),el('labels'),model,pick);
    overlays=new AdasOverlays(view);
    lab=new AdasLab(el('adas-lab'),({variant,value})=>{
      if(!isCore())return;
      Object.assign(state,{variant,value});syncLegend();
      const scope=viewSpec(false),old=view.scope,previousBounds=old.frameBounds;
      scope.frameBounds=overlays.show(moduleId(),moduleStage(),state,currentStep());
      if(scope.include.join('|')!==old.include.join('|'))view.setView(scope,view.snapshot(),true);
      else old.frameBounds=scope.frameBounds;
      view.accommodateOverlay(previousBounds,scope.frameBounds);
      if(playing)view.tourSignal(currentStep().id,lessons.get(state.lesson).steps[state.step-1]?.id,overlays.motionPaths);
      view.dirty=true;
    });
    el('progress-text').textContent='正在载入五域总览…';
    await view.loadOverview();
    ready=true;render(true,null,true);el('progress').hidden=true;
    const initial=new URLSearchParams(location.search),lesson=initial.get('lesson'),node=initial.get('node');
    if(lesson&&lessons.has(lesson))startLesson(lesson,Math.max(0,Math.min(lessons.get(lesson).steps.length-1,parseInt(initial.get('step'),10)-1||0)));
    else if(initial.get('case')==='cutin')startLesson(model.caseStudy.id,Math.max(0,Math.min(model.caseStudy.steps.length-1,parseInt(initial.get('stage'),10)-1||0)));
    else if(initial.get('view')==='classroom')showLessonMenu('core');
    else if(initial.get('view')==='adas')startLesson(core.lessons[0].id);
    else if(initial.get('view')==='service'&&model.diagrams?.length){
      const diagram=model.diagrams.find(d=>d.id===initial.get('diagram'))||model.diagrams[0];
      transition({kind:'diagram',diagram:diagram.id,spot:0},{resetDir:true});
    }
    else if(node&&nodes.has(node)){
      if(initial.get('assembled')==='1')transition({kind:'tree',id:node,fraction:0},{resetDir:true});
      else enter(node);
    }
    if(initial.get('qa')==='1')Object.defineProperty(window,'highlandQA',{value:{view,nodes,overlays,core,getState:()=>({...state}),enter,pick,home,back,resume,startLesson,shiftStep}});
  }catch(err){
    console.error(err);el('progress').classList.add('error');
    el('progress-text').textContent='三维视图未能加载。请刷新页面，并检查网络连接和浏览器的 WebGL 设置。 '+err.message;
  }
}
el('home').onclick=home;
el('tour-play').onclick=toggleTour;
el('tour-prev').onclick=()=>shiftStep(-1);el('tour-next').onclick=()=>shiftStep(1);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){pauseTour();narrative();}});
el('mode-tree').onclick=()=>{if(!ready)return;if(state.kind==='lesson')enter(currentId());else{navigation++;el('progress').hidden=true;mode='tree';lessonMenu=false;resetSearch();navRender();}};
el('mode-lesson').onclick=()=>{if(ready)showLessonMenu('lesson');};
el('mode-core').onclick=()=>{if(ready)showLessonMenu('core');};
el('core-prev').onclick=()=>shiftStep(-1);el('core-next').onclick=()=>shiftStep(1);
el('search').oninput=e=>{if(ready){query=e.target.value.trim();navRender();}};
el('search').onkeydown=e=>{if(e.key==='Enter'&&query)el('navigation').querySelector('.nav-row')?.click();};
el('sources').onclick=()=>el('about').showModal();el('close-about').onclick=()=>el('about').close();
el('fit').onclick=()=>view?.fit();
el('tags').onclick=()=>{labelsOn=!labelsOn;el('tags').setAttribute('aria-pressed',labelsOn);if(view){view.labelsOn=labelsOn;view.arrow.visible=Boolean(view.scope?.arrow&&labelsOn);el('labels').hidden=!labelsOn;syncLegend();view.dirty=true;}};
el('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{el('announce').textContent='当前浏览器未提供全屏';}};
document.addEventListener('keydown',e=>{
  if(!ready||e.target.matches('input,textarea,select')||el('about').open||e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.key==='Escape'){if(resumePoint)resume();else back();e.preventDefault();}
  if(state.kind==='lesson'&&['ArrowRight','ArrowLeft'].includes(e.key)){shiftStep(e.key==='ArrowRight'?1:-1);e.preventDefault();}
});
boot();
