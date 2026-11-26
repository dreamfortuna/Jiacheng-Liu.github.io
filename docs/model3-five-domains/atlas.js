const el=id=>document.getElementById(id);
const qs=new URLSearchParams(location.search);
const state={domain:qs.get('domain')||'',kind:qs.get('kind')||'',q:qs.get('q')||'',mapped:qs.get('mapped')==='1',current:qs.get('current')==='1',page:0};
const pageSize=24;
const types={manual:'维修手册',collision:'车身碰撞维修',connector:'连接器',schematic:'电路图',
  owner:'车主手册',rescue:'应急救援',parts:'零件目录',reference:'补充资料'};
let atlas,byId;
function element(tag,text='',cls=''){
  const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;
}
function action(label,fn){
  const b=element('button',label);b.type='button';b.onclick=fn;return b;
}
function link(text,url,local=false){
  const a=element('a',text);a.href=url;
  if(!local){a.target='_blank';a.rel='noopener';}
  return a;
}
function valid(url){return typeof url==='string'&&url.startsWith('https://');}
function normalize(s){return String(s||'').toLowerCase().replace(/[\s（）()_./·-]/g,'');}
function sync(){
  const p=new URLSearchParams();
  for(const k of ['domain','kind','q'])if(state[k])p.set(k,state[k]);
  if(state.mapped)p.set('mapped','1');
  if(state.current)p.set('current','1');
  history.replaceState(null,'',location.pathname+(p.size?'?'+p:''));
}
function filter(k,value){state[k]=value;state.page=0;sync();draw();}
function dimensionPanel(data){
  const section=element('section','','dimension-panel');
  section.append(element('h3','车身标定点中心距'));
  const opts=element('div','','dimension-options'),figureSelect=element('select'),pairSelect=element('select');
  figureSelect.setAttribute('aria-label','安装测量视图');pairSelect.setAttribute('aria-label','标定点对');
  for(const [i,f] of data.figures.entries()){const o=element('option',f.label);o.value=String(i);figureSelect.append(o);}
  opts.append(figureSelect,pairSelect);section.append(opts);
  const canvas=element('canvas');canvas.width=800;canvas.height=270;canvas.setAttribute('aria-label','原厂图中标定点的二维分布与已选点对');
  const value=element('strong'),note=element('p','','atlas-boundary'),original=element('a','对照原厂尺寸图');
  original.target='_blank';original.rel='noopener';section.append(canvas,value,note,original);
  function selectPair(){
    const f=data.figures[Number(figureSelect.value)],m=f.measurements[Number(pairSelect.value)];
    const anchors=Object.entries(f.anchorsPx),xs=anchors.map(a=>a[1][0]),ys=anchors.map(a=>a[1][1]);
    const nx=Math.min(...xs),ny=Math.min(...ys),sx=Math.max(...xs)-nx,sy=Math.max(...ys)-ny;
    const sc=Math.min(720/Math.max(1,sx),204/Math.max(1,sy)),cx=(800-sc*sx)/2,cy=(270-sc*sy)/2;
    const xy=key=>{const p=f.anchorsPx[key];return [cx+(p[0]-nx)*sc,cy+(p[1]-ny)*sc];};
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,800,270);ctx.lineWidth=3;ctx.strokeStyle='#a74629';
    ctx.beginPath();ctx.moveTo(...xy(m.fromAnchor));ctx.lineTo(...xy(m.toAnchor));ctx.stroke();
    for(const [key] of anchors){
      const p=xy(key),on=key===m.fromAnchor||key===m.toAnchor;ctx.beginPath();ctx.fillStyle=on?'#b84a29':'#8a9b98';
      ctx.arc(...p,on?6:4,0,Math.PI*2);ctx.fill();ctx.font=(on?'bold ':'')+'14px sans-serif';ctx.fillText(key,p[0]+7,p[1]-6);
    }
    value.textContent=m.meaning+'　'+m.nominalMm+' mm';
    note.textContent='原厂测量参考允差 ±'+data.referenceToleranceMm+' mm。点号按原图位置标记。';original.href=f.url;
  }
  function selectFigure(){
    const f=data.figures[Number(figureSelect.value)];pairSelect.replaceChildren();
    for(const [i,m] of f.measurements.entries()){const o=element('option',m.fromAnchor+'–'+m.toAnchor+'　'+m.meaning);o.value=String(i);pairSelect.append(o);}
    selectPair();
  }
  selectFigure();figureSelect.onchange=selectFigure;pairSelect.onchange=selectPair;return section;
}
function details(r){
  const content=element('div','','atlas-content'),links=element('div','','atlas-links');
  if(r.en&&r.en!==r.label)content.append(element('p',r.en));
  if(r.geometryWork)content.append(element('p','本模型已按图更新'+r.geometryWork+'。'));
  for(const e of r.examples||[]){
    content.append(element('p',e.fact));
    if(e.boundary)content.append(element('p',e.boundary,'atlas-boundary'));
  }
  if(r.scopeNote)content.append(element('p',r.scopeNote,'atlas-boundary'));
  if(r.dimensionTable)content.append(dimensionPanel(atlas.measurements));
  if(r.partNumbers?.length)content.append(element('p',r.partNumbers.join(' · ')));
  if(valid(r.url))links.append(link('原厂条目',r.url));
  if(valid(r.zhUrl)&&r.zhUrl!==r.url)links.append(link('原厂中文页',r.zhUrl));
  if(valid(r.locationUrl))links.append(link('位置图',r.locationUrl));
  if(valid(r.faceUrl))links.append(link('连接器端面',r.faceUrl));
  if(valid(r.svgUrl))links.append(link('矢量电气图',r.svgUrl));
  if(valid(r.pdfUrl))links.append(link('打印版 PDF',r.pdfUrl));
  const figures=r.figures||[];
  if(figures.length===1&&![r.url,r.faceUrl,r.locationUrl].includes(figures[0][0]))links.append(link('打开图示',figures[0][0]));
  content.append(links);
  if(r.nodes?.length){
    const model=element('div','','atlas-links');
    for(const id of r.nodes){
      const a=link('查看 '+atlas.nodes[id],'./?node='+encodeURIComponent(id),true);a.className='atlas-model';model.append(a);
    }
    content.append(model);
  }
  if(r.diagram){
    const a=link('打开三维安装示图','./?view=service&diagram='+r.diagram,true);a.className='atlas-model';content.append(a);
  }
  const related=r.schematicIds||r.connectorIds;
  if(related?.length){
    const group=element('details','','atlas-figures'),kind=r.kind==='connector'?'schematic':'connector';
    group.append(element('summary',r.kind==='connector'?'关联电气图（'+related.length+'）':'图中连接器（'+related.length+'）'));
    group.addEventListener('toggle',()=>{
      if(!group.open||group.childElementCount>1)return;
      for(const id of related){
        const dest=byId.get(String(id).toLowerCase());if(!dest)continue;
        group.append(link(dest.label,'atlas.html?kind='+kind+'&q='+encodeURIComponent(dest.id),true));
      }
    });
    content.append(group);
  }
  if(figures.length>1){
    const gallery=element('details','','atlas-figures');
    gallery.append(element('summary','本条目的 '+figures.length+' 个图示链接'));
    gallery.addEventListener('toggle',()=>{
      if(!gallery.open||gallery.childElementCount>1)return;
      for(const [i,[url,title]] of figures.entries())gallery.append(link(title||'图 '+(i+1),url));
    });
    content.append(gallery);
  }
  return content;
}
function recordRow(r){
  const row=element('details','','atlas-record');row.dataset.record=r.id;
  const summary=element('summary');
  const title=r.kind==='connector'&&!normalize(r.label).includes(normalize(r.id))?r.id+' · '+r.label:r.label||r.en;
  summary.append(element('strong',title),element('span',[
    types[r.kind]||r.kind,r.chapter,r.variant||'',r.applicability==='other-variant'?'其他配置':'',r.figures?.length?r.figures.length+' 个图示':'',
    r.diagram?'有三维安装示图':r.geometryWork?'已按图更新模型':r.examples?.length?'已核对装配关系':r.nodes?.length?'模型引用此资料':''
  ].filter(Boolean).join(' · '),'atlas-meta'));
  row.append(summary);
  row.addEventListener('toggle',()=>{if(row.open&&row.childElementCount===1)row.append(details(r));});
  return row;
}
function draw(){
  const q=normalize(state.q),matches=atlas.records.filter(r=>
    (!state.domain||r.domains.includes(state.domain))&&(!state.kind||state.kind===r.kind)&&
    (!state.mapped||r.nodes?.length)&&(!state.current||r.applicability!=='other-variant')&&(!q||r.search.includes(q)));
  if(q)matches.sort((a,b)=>Number(normalize(b.id)===q)-Number(normalize(a.id)===q)||a.rank-b.rank);
  const numPages=Math.max(1,Math.ceil(matches.length/pageSize));state.page=Math.min(state.page,numPages-1);
  const start=state.page*pageSize,host=el('results');host.replaceChildren();
  for(const r of matches.slice(start,start+pageSize))host.append(recordRow(r));
  if(!matches.length)host.append(element('p','没有匹配条目，可调整关键词、资料类型或系统范围。','atlas-empty'));
  el('total').textContent=matches.length.toLocaleString()+' 个条目'+(matches.length?' · 显示 '+(start+1)+'–'+Math.min(start+pageSize,matches.length):'');
  for(const b of el('domains').children)b.setAttribute('aria-pressed',String(b.dataset.domain===state.domain));
  const nav=el('pages');nav.replaceChildren();
  if(numPages>1){
    const move=delta=>{state.page+=delta;draw();el('total').scrollIntoView({block:'start'});};
    const prev=action('上一页',()=>move(-1)),next=action('下一页',()=>move(1));
    prev.disabled=state.page===0;next.disabled=state.page===numPages-1;
    nav.append(prev,element('span',(state.page+1)+' / '+numPages),next);
  }
}
async function start(){
  const result=await fetch('assets/atlas.json');if(!result.ok)throw new Error('资料索引未找到');
  atlas=await result.json();
  byId=new Map(atlas.records.map(r=>[String(r.id).toLowerCase(),r]));
  for(const r of atlas.records){
    r.search=normalize([r.id,r.label,r.en,r.chapter,r.variant,...(r.partNumbers||[]),...(r.nodes||[]).map(id=>atlas.nodes[id])].join(' '));
    r.rank=r.diagram?0:r.dimensionTable?0.5:r.examples?.length?1:r.nodes?.length?2:3;
  }
  atlas.records.sort((a,b)=>a.rank-b.rank);
  for(const [id,title] of Object.entries({'':'全部功能域',...atlas.domains})){
    const b=action(title,()=>filter('domain',id));b.dataset.domain=id;
    b.append(element('small',String(id?atlas.records.filter(r=>r.domains.includes(id)).length:atlas.records.length)));
    el('domains').append(b);
  }
  const kinds=new Set(atlas.records.map(r=>r.kind));
  for(const [k,title] of Object.entries(types))if(kinds.has(k)){
    const option=element('option',title);option.value=k;el('atlas-kind').append(option);
  }
  for(const s of atlas.sources)if(valid(s.url)){
    const entry=element('div');entry.append(link(s.label,s.url));
    if(s.note)entry.append(element('small',s.note));el('source-list').append(entry);
  }
  for(const s of atlas.coverage)el('coverage-text').append(element('p',s));
  if(state.domain&&!(state.domain in atlas.domains))state.domain='';
  if(state.kind&&!kinds.has(state.kind))state.kind='';
  const field=el('atlas-search');field.value=state.q;field.oninput=()=>filter('q',field.value);
  el('atlas-kind').value=state.kind;el('atlas-kind').onchange=e=>filter('kind',e.target.value);
  el('atlas-mapped').checked=state.mapped;el('atlas-mapped').onchange=e=>filter('mapped',e.target.checked);
  el('atlas-variant').checked=state.current;el('atlas-variant').onchange=e=>filter('current',e.target.checked);
  el('coverage-button').onclick=()=>el('coverage').showModal();el('close-coverage').onclick=()=>el('coverage').close();
  draw();
}
start().catch(err=>{el('total').textContent='图册加载失败，请从本机网页入口重开。 '+err.message;});
