const designer={file:null,mode:'track',point:0,riverPoint:null,prop:null,deck:null,selectedPasses:[],tool:'',pointer:null,drag:null,preview:null,frame:0,baseline:''};
const creatorKey='track-and-trace-courses-v1',maxCourseProps=72;
const newCourseId=()=>window.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2,10);
const jsonCopy=value=>JSON.parse(JSON.stringify(value));
const edges={inherit:'Course default',wall:'Wall',grass:'Grass + curb',dirt:'Dirt + curb',grassPlain:'Grass runoff',dirtPlain:'Dirt runoff'};
function finite(value,min,max,fallback) {
  return Number.isFinite(value)?clamp(value,min,max):fallback;
}
function courseFromFile(file,asReplay=false) {
  const shared={
    id:file.id,name:file.name,kind:'Custom course',theme:file.theme,props:file.props,
    damageEvent:!!file.damageEvent,custom:true,revision:file.revision,courseFile:file,
    scenerySeed:file.scenerySeed
  };
  if(file.layout==='yard') return {
    ...shared,kind:file.arena?'Custom damage arena':file.park?'Custom practice park':'Custom training yard',
    training:!file.arena,park:!!file.park,arena:file.arena,floor:file.floor,
    parking:file.parking,patches:file.patches,physicalElevation:true,
    elevation:file.park?courseOptions(true).map(i=>courses[i]).find(c=>c.park&&!c.custom)?.elevation:undefined
  };
  const points=file.points.map(p=>[p.x,p.y]);
  const edgeSections=[],roadSections=[];
  file.points.forEach((p,i)=>{
    const to=(i+1)%points.length;
    if(p.road) roadSections.push({from:i,to,surface:p.road});
    for(const [key,side] of [['left',1],['right',-1]]) {
      const style=p[key];
      if(style==='inherit') continue;
      edgeSections.push({from:i,to,side,surface:style==='wall'?null:style.startsWith('grass')?'grass':'dirt',
        curb:style!=='wall'&&!style.endsWith('Plain')});
    }
  });
  return {...shared,points,width:40,widthsByPoint:file.points.map(p=>p.width*.5),smoothing:file.curve,
    edgeSections,roadSections,runoff:file.runoff,puddles:file.puddles,grandstand:file.grandstand,
    dirt:file.dirt??(editorThemes[file.theme].surface==='dirt'),bridges:true,crossings:file.crossings,river:file.river,
    physicalElevation:!asReplay||file.version>=2,pointIds:file.points.map((p,i)=>p.id||'p'+i),
    elevation:file.points.map(p=>p.elevation||'auto'),elevationOrders:file.elevationOrders};
}
function normalizeCourseFile(source) {
  if(source?.format!=='Track’n’Trace’n course'||![1,2].includes(source.version)) throw Error('Choose a Track’n’Trace’n course file.');
  const open=source.layout==='yard';
  const anchors=open?[]:source.points;
  if(!Array.isArray(anchors)||!open&&(anchors.length<4||anchors.length>62)) throw Error('A course needs 4–62 track points.');
  const pointIds=new Set();
  const points=anchors.map((p,i)=>{
    if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y)) throw Error('A track point has an invalid position.');
    let id=typeof p.id==='string'&&/^[\w-]{1,80}$/.test(p.id)?p.id:'p'+i;
    if(pointIds.has(id)) id=newCourseId();
    pointIds.add(id);
    return {id,elevation:elevationChoices.includes(p.elevation)?p.elevation:'auto',x:clamp(p.x,55,W-55),y:clamp(p.y,53,H-53),width:finite(p.width,49,152,80),
      road:['asphalt','grass','dirt'].includes(p.road)?p.road:'',
      left:Object.hasOwn(edges,p.left)?p.left:'wall',right:Object.hasOwn(edges,p.right)?p.right:'wall'};
  });
  if(points.some((p,i)=>dist(p,points[(i+1)%points.length])<12)) throw Error('Move neighbouring track points at least 12 units apart.');
  const river=Array.isArray(source.river?.points)&&source.river.points.length>=2?
    {width:finite(source.river.width,10,110,35),points:source.river.points.slice(0,40).map(p=>[
      finite(p?.[0],-90,W+90,0),finite(p?.[1],-90,H+90,0)])}:null;
  const props=Array.isArray(source.props)?source.props.filter(p=>p&&Object.hasOwn(propTypes,p.type)).slice(0,maxCourseProps).map(p=>({
    type:p.type,x:finite(p.x,4,W-4,W/2),y:finite(p.y,4,H-4,H/2),a:finite(p.a,-TAU,TAU,0),level:Math.round(finite(p.level,-7,7,0))})): [];
  const crossings=Array.isArray(source.crossings)?source.crossings.filter(c=>c&&['bridge','tunnel','none'].includes(c.style)).slice(0,24).map(c=>({
    over:finite(c.over,0,.999999,0),under:finite(c.under,0,.999999,0),style:c.style,
    source:typeof c.source==='string'?c.source.slice(0,80):undefined})): [];
  const elevationOrders=Array.isArray(source.elevationOrders)?source.elevationOrders.filter(g=>g&&
    Number.isFinite(g.x)&&Number.isFinite(g.y)&&Array.isArray(g.order)&&g.order.length>=2&&g.order.length<=12)
    .slice(0,64).map(g=>({x:g.x,y:g.y,order:g.order.map(ref=>({
      at:finite(ref?.at,0,.999999,0),t:finite(ref?.t,0,1,0),
      from:pointIds.has(ref?.from)?ref.from:undefined,to:pointIds.has(ref?.to)?ref.to:undefined
    }))})):[];
  const arena=open&&Number.isFinite(source.arena)&&source.arena>0?clamp(Math.round(source.arena),15,300):0;
  const floor=typeof source.floor==='string'&&/^#[0-9a-f]{6}$/i.test(source.floor)?source.floor:undefined;
  const patches=open&&Array.isArray(source.patches)?source.patches.slice(0,16).filter(p=>p&&
    ['grass','dirt'].includes(p.type)&&typeof p.fill==='string'&&/^#[0-9a-f]{6}$/i.test(p.fill))
    .map(p=>({x:finite(p.x,0,W,W/2),y:finite(p.y,0,H,H/2),rx:finite(p.rx,10,400,80),
      ry:finite(p.ry,10,240,45),type:p.type,fill:p.fill})):undefined;
  const runoff=Array.isArray(source.runoff)?source.runoff.filter(p=>Array.isArray(p)&&
    Number.isFinite(p[0])&&Number.isFinite(p[1])&&[-1,1].includes(p[2])&&['grass','dirt'].includes(p[3]))
    .slice(0,30).map(([a,b,side,surface])=>[clamp(a,0,1),clamp(b,0,1),side,surface]):[];
  const puddles=Array.isArray(source.puddles)?source.puddles.filter(p=>Array.isArray(p)&&
    Number.isFinite(p[0])&&Number.isFinite(p[1])).slice(0,30).map(([at,r])=>[clamp(at,0,.998),clamp(r,5,45)]):[];
  return {format:'Track’n’Trace’n course',version:source.version,id:typeof source.id==='string'&&/^[\w-]{1,80}$/.test(source.id)?source.id:newCourseId(),
    name:(typeof source.name==='string'?source.name.trim().slice(0,55):'')||'Untitled course',
    theme:Object.hasOwn(editorThemes,source.theme)?source.theme:'speedway',points,props,river,crossings,elevationOrders,
    layout:open?'yard':undefined,arena,park:open&&!arena&&!!source.park,damageEvent:!!arena||!open&&source.damageEvent===true,
    floor,parking:open&&Array.isArray(source.parking)?source.parking.filter(Number.isFinite).slice(0,16).map(y=>clamp(y,0,H)):undefined,
    patches,runoff,puddles,dirt:typeof source.dirt==='boolean'?source.dirt:undefined,grandstand:source.grandstand===true,
    scenerySeed:Number.isFinite(source.scenerySeed)?Math.round(source.scenerySeed):undefined,
    revision:Math.round(finite(source.revision,0,100000,0)),curve:finite(source.curve,0,100,50)};
}
function loadCustomCourses() {
  try {
    const files=JSON.parse(localStorage.getItem(creatorKey)||'[]');
    for(const value of files) {
      try {courses.push(courseFromFile(normalizeCourseFile(value)));} catch {}
    }
  } catch {}
}
function copyTemplate(index,duplicate=false,withHazards=false) {
  const c=prepare(index);
  if(c.custom) {
    const file=jsonCopy(c.courseFile);
    return duplicate?{...file,id:newCourseId(),name:(c.name+' copy').slice(0,55),revision:0}:file;
  }
  const common={format:'Track’n’Trace’n course',version:2,id:newCourseId(),name:c.name+' copy',
    theme:c.theme,damageEvent:!!c.damageEvent,crossings:jsonCopy(c.crossings||[]),elevationOrders:jsonCopy(c.elevationOrders||[]),
    props:[...(c.props||[]),...(withHazards?c.hazards||[]:[])].map(p=>({x:p.x,y:p.y,a:p.a,type:p.type,level:p.level||0})),
    curve:c.smoothing??50,revision:0,scenerySeed:c.scenerySeed??(673+c.index*87)};
  if(c.openYard) return {...common,layout:'yard',points:[],park:!!c.park,arena:c.arena||0,
    floor:c.floor,parking:c.parking,patches:c.patches?jsonCopy(c.patches):undefined};
  const points=c.points.map(([x,y],i)=>({x,y,id:'p'+i,elevation:c.elevation?.[i]||'auto',
    width:(c.widthsByPoint?.[i]??c.width)*2,road:'',left:'inherit',right:'inherit'}));
  const river=riverSpec(c);
  return {...common,points,grandstand:c.id==='oval'||c.grandstand,dirt:!!c.dirt,
    runoff:jsonCopy(c.runoff||[]),puddles:jsonCopy(c.puddles||[]),
    river:river?{width:river.width,points:jsonCopy(river.points)}:null};
}
function editorStatus(message) {$('creator-status').textContent=message;}
function resetDraftSelection() {
  designer.mode=designer.file.layout==='yard'?'objects':'track';
  designer.point=0;designer.prop=null;designer.deck=null;designer.selectedPasses=[];
  designer.riverPoint=null;designer.tool='';designer.preview=null;
  designer.baseline=JSON.stringify(designer.file);
}
function newDraft(template=0,rename=false,duplicate=false) {
  designer.file=copyTemplate(template,duplicate,!rename&&hazardsEnabled(courses[template]));
  if(rename) {designer.file.name='Untitled course';designer.file.id=newCourseId();}
  resetDraftSelection();editorRender(true);
}
function guardDraft(title,action) {
  if(!designer.file||designer.baseline===JSON.stringify(designer.file)) {action();return;}
  openModal('draft',title,body=>{
    body.append(paragraph('This replaces the unsaved changes in your current draft.'));
    setModalActions(button('Keep working',closeModal),button('Replace draft',()=>{
      closeModal();action();
    },'primary'));
  });
}
function showCreator() {
  $('setup').hidden=true;$('creator').hidden=false;$('creator').scrollTop=0;
  editorRender(true);$('creator-close').focus({preventScroll:true});
}
function startCreator() {
  if(!designer.file) {
    newDraft(courses[options.course].custom?options.course:0,!courses[options.course].custom);
    editorStatus('');
  }
  showCreator();
}
function editSelectedCourse() {
  const source=options.course;
  guardDraft('Open a course copy?',()=>{
    newDraft(source,false,true);showCreator();
    editorStatus('Editing a copy of '+courses[source].name+'.');
  });
}
function closeCreator() {
  $('creator').hidden=true;$('setup').hidden=false;
  renderSetup();
  const trigger=$(designer.returnTo||'creator-open');trigger.focus({preventScroll:true});
}
function editMode(mode) {
  designer.mode=mode;designer.tool='';
  editorRender(false);
}
function editorPickCourse() {
  const selected=normalizeCourseFile({...designer.file,version:2,name:$('creator-name').value});
  return selected;
}
function storeDraft() {
  try {
    const file=editorPickCourse(), index=courses.findIndex(c=>c.custom&&c.id===file.id);
    const preview=prepareDefinition(courseFromFile(file),0,.6);
    if(preview.elevationData?.warnings.length) throw Error(preview.elevationData.warnings[0]);
    const prior=index<0?0:courses[index].revision;
    file.revision=Math.max(prior,file.revision)+1;
    const files=courses.slice(builtInCount).filter(c=>c.id!==file.id).map(c=>c.courseFile);
    localStorage.setItem(creatorKey,JSON.stringify([...files,file]));
    const place=index<0?courses.length:index;
    courses[place]=courseFromFile(file);prepared.delete(place);
    designer.file=jsonCopy(file);designer.baseline=JSON.stringify(designer.file);
    selectCourseState(place);saveOptions();editorRender(true);
    editorStatus('Saved. Return to the menu to drive '+file.name+'.');
  } catch(error) {editorStatus(error.message||'This browser could not save the course. Use Export for a local copy.');}
}
function exportDraft() {
  try {
    const file=editorPickCourse(), blob=new Blob([JSON.stringify(file,null,2)],{type:'application/json'});
    const href=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=href;link.download=(file.name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'Course')+'.json';
    link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
    editorStatus('Course file exported.');
  } catch(error) {editorStatus(error.message);}
}
function editorPoint(e) {
  const b=$('creator-map').getBoundingClientRect();
  return {x:(e.clientX-b.left)*W/b.width,y:(e.clientY-b.top)*H/b.height};
}
function editorPreview() {
  const file=designer.file, definition=courseFromFile(file);
  // Near-coincident anchors can occur while dragging. Keep the previous valid map until the points separate.
  if(file.points.some((p,i)=>dist(p,file.points[(i+1)%file.points.length])<4)) return;
  designer.preview=prepareDefinition(definition,0,.8);
}
function queueEditorPaint() {
  if(designer.frame) return;
  designer.frame=requestAnimationFrame(()=>{
    designer.frame=0;editorPreview();paintEditor();
  });
}
function paintHandle(ctx,p,selected,index) {
  oval(ctx,p.x,p.y,selected?10.5:7.5,selected?10.5:7.5,selected?'#f9b779':'#163d3e');
  oval(ctx,p.x,p.y,selected?4.7:3.4,selected?4.7:3.4,selected?'#51392e':'#f1edbe');
  if(index!=null) {
    ctx.font='bold 11px system-ui';ctx.fillStyle='#f8edc8';
    if(selected) rounded(ctx,p.x+9,p.y-20,18,16,3,'#294948');
    ctx.fillStyle='#fff3d1';ctx.fillText(String(index+1),p.x+12,p.y-8);
  }
}
function crossingHandle(group) {
  return {x:group.x+21,y:group.y-20};
}
function paintEditor() {
  const file=designer.file,c=designer.preview, ctx=$('creator-map').getContext('2d');
  if(!c) return;
  drawCoursePreview(ctx,c,false);
  if(designer.mode==='track') {
    const data=c.elevationData;
    for(const [i,p] of file.points.entries()) {
      paintHandle(ctx,p,designer.point===i,i);
      const level=routeLevelAt(c,data.anchors[i]??0);
      if(level) {
        ctx.font='bold 11px system-ui';ctx.fillStyle=level<0?'#d2e4f5':'#ffdc98';
        ctx.fillText(heightText(level),p.x+11,p.y+13);
      }
    }
    for(const group of data.groups) {
      const p=crossingHandle(group), selected=designer.deck===group.id;
      rounded(ctx,p.x-8,p.y-8,16,16,3,group.conflict?'#e19a73':selected?'#fcb679':'#a6dcd6');
      ctx.font='bold 11px system-ui';ctx.fillStyle='#173c3a';ctx.fillText(String(group.passes.length),p.x-3,p.y+4);
      if(selected) for(const pass of group.order) {
        const a=c.samples[mod(pass.index-pass.half-3,c.samples.length)];
        const b=c.samples[mod(pass.index+pass.half+3,c.samples.length)];
        const color=designer.selectedPasses.includes(pass.index)?'#ffbb7c':'#d0ecae';
        oval(ctx,a.x,a.y,5,5,color);oval(ctx,b.x,b.y,5,5,color);
      }
    }
  }
  if(designer.mode==='river'&&file.river) {
    file.river.points.forEach(([x,y],i)=>paintHandle(ctx,{x,y},designer.riverPoint===i));
  }
  for(const [i,o] of file.props.entries()) {
    drawProp(ctx,o);
    if(designer.mode==='objects'&&designer.prop===i) {
      ctx.beginPath();ctx.arc(o.x,o.y,22,0,TAU);ctx.strokeStyle='#ffe7a9';ctx.lineWidth=2;ctx.stroke();
    }
  }
  if(designer.paletteGhost) {ctx.globalAlpha=.65;drawProp(ctx,designer.paletteGhost);ctx.globalAlpha=1;}
}
function editorRender(rebuild) {
  const file=designer.file;
  if(!file) return;
  if(rebuild) editorPreview();
  if($('creator-name').value!==file.name) $('creator-name').value=file.name;
  $('creator-theme').value=file.theme;
  segmentation('creator-mode',designer.mode);
  $('creator-mode').hidden=file.layout==='yard';
  const tips={
    track:designer.tool==='add'?'Tap the map to insert a route point.':'Tap a point to edit it, or drag to move it. Tap a crossing badge to change pass order.',
    river:designer.tool==='river'?'Tap the map to add a river point.':'Add or drag points to shape the river.',
    objects:designer.tool?'Tap the map to place '+propTypes[designer.tool].name.toLowerCase()+'.':'Choose an object to place it, or tap a placed object to move or rotate it.'
  };
  $('creator-map-note').textContent=tips[designer.mode];
  $('creator-selection').textContent=file.name;
  for(const mode of ['track','river','object']) {
    const active=designer.mode===(mode==='object'?'objects':mode);
    $('creator-'+mode+'-tools').hidden=!active;
  }
  const point=file.points[designer.point], object=file.props[designer.prop];
  for(const id of ['creator-width','creator-road','creator-left','creator-right','creator-startline']) $(id).disabled=!point;
  $('creator-remove').disabled=!point||file.points.length<=4;
  $('creator-add').disabled=file.points.length>=62;
  $('creator-add').textContent=designer.tool==='add'?'Tap to add':'Add point';
  if(point) {
    $('creator-width').value=point.width;$('creator-width-value').textContent=Math.round(point.width);
    $('creator-road').value=point.road;$('creator-left').value=point.left;$('creator-right').value=point.right;
  }
  $('creator-curve').value=file.curve;$('creator-curve-value').textContent=file.curve;
  const data=designer.preview.elevationData,anchor=data?.anchors[designer.point]??0;
  $('creator-elevation-point').textContent='Point '+(designer.point+1)+' · '+heightText(routeLevelAt(designer.preview,anchor));
  segmentation('creator-elevation',point?.elevation||'auto');
  for(const choice of $('creator-elevation').querySelectorAll('button')) choice.disabled=designer.point===0;
  const portal=data?.portals.find(p=>p.index===anchor);
  $('creator-portal').hidden=!portal;
  $('creator-portal').textContent=portal?.entry?'Tunnel entry':'Tunnel exit';
  $('creator-elevation-warning').hidden=!data?.warnings.length;
  $('creator-elevation-warning').textContent=data?.warnings[0]||'';
  if(designer.deck!=null&&!data?.groups[designer.deck]) {designer.deck=null;designer.selectedPasses=[];}
  const selected=data?.groups[designer.deck], passes=$('creator-passes');
  $('creator-stack').hidden=!selected;passes.replaceChildren();
  if(selected) for(const [i,pass] of selected.order.entries()) {
    const edge=Math.floor(designer.preview.samples[pass.index].u);
    const text=(selected.order.length-1===i?'Top · ':i===0?'Bottom · ':'')+
      'After point '+(edge+1)+' · '+heightText(pass.level);
    const pick=button(text,()=>{
      if(designer.selectedPasses.includes(pass.index)) designer.selectedPasses=designer.selectedPasses.filter(p=>p!==pass.index);
      else designer.selectedPasses=[...designer.selectedPasses.slice(-1),pass.index];
      editorRender(false);
    });
    pick.setAttribute('aria-pressed',designer.selectedPasses.includes(pass.index));
    passes.append(pick);
  }
  $('creator-swap').disabled=designer.selectedPasses.length!==2;
  $('river-width').disabled=!file.river;$('river-clear').disabled=!file.river;
  $('river-remove').disabled=designer.riverPoint==null;
  if(file.river) {$('river-width').value=file.river.width;$('river-width-value').textContent=file.river.width;}
  else $('river-width-value').textContent='';
  $('river-add').textContent=designer.tool==='river'?'Tap to add':'Add river point';
  $('prop-angle').disabled=!object;$('prop-level').disabled=!object;$('prop-remove').disabled=!object;
  if(object) {
    $('prop-angle').value=Math.round(mod(object.a,TAU)*360/TAU)%360;
    $('prop-angle-value').textContent=$('prop-angle').value+'°';$('prop-level').value=object.level||0;
  } else $('prop-angle-value').textContent='';
  for(const b of $('prop-tray').querySelectorAll('button')) b.setAttribute('aria-pressed',designer.tool===b.dataset.value);
  paintEditor();
}
function selectNearby(values,p,radius=21) {
  let best=radius,index=null;
  values.forEach((value,i)=>{
    const d=dist(value,p);
    if(d<best) {best=d;index=i;}
  });
  return index;
}
function addEditorProp(type,p) {
  if(designer.file.props.length>=maxCourseProps) {editorStatus('A course can use up to '+maxCourseProps+' objects and hazards.');return;}
  designer.file.props.push({type,x:clamp(p.x,0,W),y:clamp(p.y,0,H),a:0,level:0});
  designer.prop=designer.file.props.length-1;designer.tool='';
}
function editorDown(e) {
  const file=designer.file, position=editorPoint(e), canvas=$('creator-map');
  if(e.button!==0||designer.pointer!=null) return;
  const radius=Math.max(17,18*W/canvas.getBoundingClientRect().width);
  designer.pointer=e.pointerId;canvas.setPointerCapture(e.pointerId);designer.drag=null;
  if(designer.mode==='track') {
    if(designer.tool==='add') {
      const sample=project(designer.preview,position.x,position.y,null).index;
      const prior=Math.floor(designer.preview.samples[sample].u);
      const i=prior+1, base=file.points[prior];
      file.points.splice(i,0,{...base,id:newCourseId(),elevation:'auto',x:clamp(position.x,55,W-55),y:clamp(position.y,53,H-53)});
      designer.point=i;designer.tool='';designer.drag=file.points[i];editorRender(true);return;
    }
    const groups=designer.preview.elevationData.groups;
    const crossing=selectNearby(groups.map(crossingHandle),position,Math.min(radius,18));
    if(crossing!=null) {
      designer.deck=crossing;designer.selectedPasses=[];
    } else {
      const i=selectNearby(file.points,position,radius);
      if(i!=null) {designer.point=i;designer.drag=file.points[i];}
      else designer.deck=selectNearby(groups,position,Math.min(radius,23));
      designer.selectedPasses=[];
    }
  } else if(designer.mode==='river') {
    const river=file.river;
    if(designer.tool==='river') {
      if(!river) file.river={width:35,points:[[position.x,Math.max(-25,position.y-55)],[position.x,Math.min(H+25,position.y+55)]]};
      else if(river.points.length<40) river.points.push([position.x,position.y]);
      designer.riverPoint=file.river.points.length-1;designer.tool='';editorRender(true);return;
    }
    if(river) {
      designer.riverPoint=selectNearby(river.points.map(([x,y])=>({x,y})),position,radius);
      designer.drag=river.points[designer.riverPoint];
    }
  } else {
    if(propTypes[designer.tool]) addEditorProp(designer.tool,position);
    else designer.prop=selectNearby(file.props,position,radius);
    designer.drag=file.props[designer.prop];
  }
  editorRender(false);
}
function editorMove(e) {
  if(e.pointerId!==designer.pointer||!designer.drag) return;
  const p=editorPoint(e), target=designer.drag;
  if(Array.isArray(target)) {target[0]=clamp(p.x,-35,W+35);target[1]=clamp(p.y,-35,H+35);}
  else {
    const isTrack=designer.mode==='track';
    target.x=clamp(p.x,isTrack?55:0,isTrack?W-55:W);target.y=clamp(p.y,isTrack?53:0,isTrack?H-53:H);
  }
  if(designer.mode==='objects') paintEditor();
  else queueEditorPaint();
}
function swapCrossingPasses() {
  const course=designer.preview,group=course.elevationData.groups[designer.deck];
  if(!group||designer.selectedPasses.length!==2) return;
  const order=group.order.slice();
  const [a,b]=designer.selectedPasses.map(index=>order.findIndex(p=>p.index===index));
  if(a<0||b<0||a===b) return;
  [order[a],order[b]]=[order[b],order[a]];
  const orders=designer.file.elevationOrders??=[];
  const entry={x:group.x,y:group.y,order:order.map(pass=>visitReference(course,pass))};
  const old=orders.indexOf(group.saved);
  if(old<0) orders.push(entry);else orders[old]=entry;
  designer.selectedPasses=[];
  editorRender(true);
}
function initializeEditor() {
  const action=(id,fn)=>$(id).addEventListener('click',fn);
  const listen=(id,event,fn)=>$(id).addEventListener(event,e=>fn(e.target.value,e));
  const update=(key,value)=>{designer.file.points[designer.point][key]=value;editorRender(true);};
  action('creator-open',()=>{designer.returnTo='creator-open';startCreator();});
  action('edit-course',()=>{designer.returnTo='edit-course';editSelectedCourse();});
  action('creator-close',closeCreator);
  action('creator-new',()=>guardDraft('Start a new track?',()=>{newDraft(0,true);editorStatus('');}));
  action('creator-save',storeDraft);action('creator-export',exportDraft);
  action('creator-import',()=>$('creator-file').click());
  listen('creator-file','change',async(_,event)=>{
    try {
      if(!event.target.files.length) return;
      const file=normalizeCourseFile(JSON.parse(await event.target.files[0].text()));
      guardDraft('Import another course?',()=>{
        designer.file=file;resetDraftSelection();editorRender(true);
        editorStatus('Course imported. Save it to add it to the menu.');
      });
    } catch(error) {if(event.target.files.length) editorStatus(error.message);}
    event.target.value='';
  });
  for(const [key,t] of Object.entries(editorThemes)) $('creator-theme').add(new Option(t.name,key));
  for(const id of ['creator-left','creator-right']) {
    for(const [key,name] of Object.entries(edges)) $(id).add(new Option(name,key));
  }
  listen('creator-name','input',value=>designer.file.name=value);
  listen('creator-theme','change',value=>{
    designer.file.theme=value;designer.file.dirt=editorThemes[value].surface==='dirt';
    if(designer.file.layout==='yard') designer.file.floor=undefined;
    editorRender(true);
  });
  onSegment('creator-mode',editMode,false);
  action('creator-add',()=>{designer.tool=designer.tool==='add'?'':'add';editorRender(false);});
  action('creator-remove',()=>{designer.file.points.splice(designer.point,1);designer.point=0;editorRender(true);});
  action('creator-startline',()=>{
    const file=designer.file, i=designer.point;
    if(i===0) return;
    if(routeLevelAt(designer.preview,designer.preview.elevationData.anchors[i])!==0) {
      editorStatus('Choose a ground point for the start.');
      return;
    }
    const cut=designer.preview.elevationData.anchors[i]/designer.preview.samples.length;
    file.crossings.forEach(c=>{c.over=mod(c.over-cut,1);c.under=mod(c.under-cut,1);});
    (file.elevationOrders||[]).forEach(g=>g.order.forEach(ref=>{ref.at=mod(ref.at-cut,1);}));
    file.points.push(...file.points.splice(0,i));designer.point=0;designer.deck=null;designer.selectedPasses=[];editorRender(true);
  });
  listen('creator-width','input',value=>update('width',Number(value)));
  listen('creator-road','change',value=>update('road',value));
  listen('creator-left','change',value=>update('left',value));
  listen('creator-right','change',value=>update('right',value));
  listen('creator-curve','input',value=>{designer.file.curve=Number(value);editorRender(true);});
  onSegment('creator-elevation',value=>update('elevation',value),false);
  action('creator-swap',swapCrossingPasses);
  action('river-add',()=>{designer.tool=designer.tool==='river'?'':'river';editorRender(false);});
  action('river-clear',()=>{designer.file.river=null;designer.riverPoint=null;editorRender(true);});
  action('river-remove',()=>{
    designer.file.river.points.splice(designer.riverPoint,1);
    if(designer.file.river.points.length<2) designer.file.river=null;
    designer.riverPoint=null;editorRender(true);
  });
  listen('river-width','input',value=>{designer.file.river.width=Number(value);editorRender(true);});
  for(const [key,definition] of Object.entries(propTypes)) {
    let start=null,dropped=false;
    const item=button('',()=>{
      if(dropped) {dropped=false;return;}
      designer.tool=key;editorRender(false);
    });
    const art=document.createElement('canvas'),label=document.createElement('span');
    art.width=68;art.height=54;art.setAttribute('aria-hidden','true');
    const artCtx=art.getContext('2d');artCtx.scale(1.38,1.38);
    drawProp(artCtx,{type:key,x:24.6,y:19.5,a:-.18});
    label.textContent=definition.name;item.append(art,label);
    item.dataset.value=key;
    item.addEventListener('pointerdown',e=>{dropped=false;start={x:e.clientX,y:e.clientY};item.setPointerCapture(e.pointerId);});
    item.addEventListener('pointermove',e=>{
      if(!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)<8) return;
      designer.paletteGhost={...editorPoint(e),a:0,type:key};
      paintEditor();
    });
    item.addEventListener('pointerup',e=>{
      if(!designer.paletteGhost) {start=null;return;}
      const p=editorPoint(e);designer.paletteGhost=null;start=null;dropped=true;
      if(p.x>=0&&p.x<=W&&p.y>=0&&p.y<=H) addEditorProp(key,p);
      editorRender(true);
    });
    item.addEventListener('pointercancel',()=>{start=null;designer.paletteGhost=null;paintEditor();});
    $('prop-tray').append(item);
  }
  listen('prop-angle','input',value=>{designer.file.props[designer.prop].a=Number(value)*TAU/360;editorRender(false);});
  listen('prop-level','change',value=>{designer.file.props[designer.prop].level=Number(value);editorRender(false);});
  action('prop-remove',()=>{designer.file.props.splice(designer.prop,1);designer.prop=null;editorRender(false);});
  const map=$('creator-map');
  map.addEventListener('pointerdown',editorDown);map.addEventListener('pointermove',editorMove);
  for(const type of ['pointerup','pointercancel','lostpointercapture']) map.addEventListener(type,e=>{
    if(designer.pointer!==e.pointerId) return;
    designer.pointer=null;designer.drag=null;editorRender(true);
  });
}
