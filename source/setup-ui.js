const paintChoices=[
  ['Vermilion','#f66c50'],['Coral','#fc7461'],['Tangerine','#f88851'],
  ['Apricot','#ffac5e'],['Gold','#f9be56'],['Lemon','#ffe081'],
  ['Lime','#b9d75e'],['Leaf','#b0dd79'],['Mint','#76dcae'],
  ['Teal','#43c1d2'],['Sky','#5bcee0'],['Lagoon','#58bcdf'],
  ['Periwinkle','#899afa'],['Orchid','#d685f5'],['Rose','#ed6d98'],
  ['Ivory','#eee9cc'],['Graphite','#505e66'],['White','#f7f5e8']
];
for(const spec of vehicles) {
  for(const [,colour] of paintChoices) if(!spec.palette.includes(colour)) spec.palette.push(colour);
}
const eventNames={race:'Race','one-hit':'One Hit Loss',damage:'Damage challenge',training:'Training'};
const damageNames={off:'Damage off',open:'Damage only',total:'Can total'};
const courseTileCache=new Map();
let drawnCourse=null, drawnVehicle='';
function setupCourseList() {
  return courseOptions(courses[options.course].damageEvent?'damage':training);
}
function nearbyCourses(list,index) {
  const shifts=list.length<4?[0,1,2]:[-1,0,1,2];
  return [...new Set(shifts.map(shift=>list[mod(index+shift,list.length)]))];
}
function drawCourseTile(canvas,index) {
  const definition=courses[index], withHazards=hazardsEnabled(definition);
  const key=definition.id+':'+(definition.revision||0)+':'+withHazards;
  let art=courseTileCache.get(key);
  if(!art) {
    art=document.createElement('canvas');art.width=180;art.height=100;
    const ctx=art.getContext('2d');
    ctx.scale(.15,.15);drawCoursePreview(ctx,prepare(index),true,withHazards);
    if(courseTileCache.size>=64) courseTileCache.delete(courseTileCache.keys().next().value);
    courseTileCache.set(key,art);
  }
  canvas.getContext('2d').drawImage(art,0,0,canvas.width,canvas.height);
}
function renderCoursePicker(course) {
  const list=setupCourseList(),index=list.indexOf(options.course);
  $('course-name').textContent=course.name;$('course-kind').textContent=course.kind;
  $('course-position').textContent=(index+1)+' / '+list.length;
  $('races-tab').setAttribute('aria-pressed',!training&&!course.damageEvent);
  $('training-tab').setAttribute('aria-pressed',training);
  $('damage-tab').setAttribute('aria-pressed',!!course.damageEvent);
  const definition=courses[options.course], withHazards=hazardsEnabled(definition);
  if(drawnCourse?.definition===definition&&drawnCourse?.withHazards===withHazards) return;
  drawnCourse={definition,withHazards};
  const ctx=$('preview').getContext('2d');
  ctx.save();ctx.scale(.8,.8);drawCoursePreview(ctx,course,true,withHazards);ctx.restore();
  const mount=$('courses'),focused=document.activeElement?.dataset?.courseTile!=null;
  mount.replaceChildren();let selected=null;
  for(const i of nearbyCourses(list,index)) {
    const item=button('',()=>setCourse(i));
    item.dataset.courseTile=String(i);
    item.setAttribute('aria-pressed',i===options.course);item.title=courses[i].name;
    const art=document.createElement('canvas'), name=document.createElement('span');
    art.width=180;art.height=84;art.setAttribute('aria-hidden','true');
    drawCourseTile(art,i);name.className='course-tile-name';name.textContent=courses[i].name;
    item.append(art,name);mount.append(item);
    if(i===options.course) selected=item;
  }
  if(focused) selected?.focus({preventScroll:true});
}
function vehicleColour(type) {
  return vehicles[type].palette[options.colors[type]]||vehicles[type].palette[0];
}
function drawPickerVehicle(canvas,type,scale) {
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const spec=vehicles[type], length=rigVisualLength(spec);
  const zoom=Math.min(scale,canvas.width/(length+12),canvas.height/(spec.width+4));
  const offset=(length-spec.length)*.50*zoom;
  drawVehicle(ctx,canvas.width/2+offset,canvas.height/2-offset*.18,-.18,type,vehicleColour(type),zeroDamage(),{scale:zoom});
}
function renderVehiclePicker() {
  const current=options.type, key=[current,...options.colors].join('/');
  if(key===drawnVehicle) return;
  drawnVehicle=key;
  const left=mod(current-1,vehicles.length),right=mod(current+1,vehicles.length);
  drawPickerVehicle($('vehicle'),current,3.02);
  drawPickerVehicle($('vehicle-prev-art'),left,1.45);
  drawPickerVehicle($('vehicle-next-art'),right,1.45);
  $('prev-vehicle').setAttribute('aria-label','Previous vehicle · '+vehicles[left].name);
  $('next-vehicle').setAttribute('aria-label','Next vehicle · '+vehicles[right].name);
  $('vehicle-name').value=String(current);
  $('vehicle-detail').textContent=vehicles[current].description||'';
  $('vehicle-detail').hidden=!vehicles[current].description;
  const selected=vehicleColour(current), mount=$('swatches'),previous=document.activeElement?.dataset?.paint;
  mount.replaceChildren();
  for(const [name,colour] of paintChoices) {
    const b=button('',()=>{options.colors[current]=vehicles[current].palette.indexOf(colour);renderSetup();});
    b.dataset.paint=colour;b.title=name;
    b.style.setProperty('--swatch',colour);
    b.setAttribute('aria-label',name);b.setAttribute('aria-pressed',colour===selected);
    mount.append(b);
    if(colour===previous) b.focus({preventScroll:true});
  }
  $('paint-name').textContent=paintChoices.find(([,colour])=>colour===selected)?.[0]||'';
}
function changeVehicle(by) {
  options.type=mod(options.type+by,vehicles.length);renderSetup();
}
function attachCarousel(id,step) {
  const node=$(id);
  let gesture=null, blockNextClick=false;
  const reset=()=>{
    node.classList?.remove('swiping');
    node.style.setProperty('--swipe-shift','0px');
    gesture=null;
  };
  node.addEventListener('pointerdown',e=>{
    if(e.button!==0||gesture) return;
    blockNextClick=false;
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dragging:false};
  });
  node.addEventListener('pointermove',e=>{
    if(gesture?.id!==e.pointerId) return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(!gesture.dragging) {
      if(Math.abs(dy)>9&&Math.abs(dy)>Math.abs(dx)) {reset();return;}
      if(Math.abs(dx)<10||Math.abs(dx)<Math.abs(dy)*1.18) return;
      gesture.dragging=true;node.classList?.add('swiping');
      try {node.setPointerCapture(e.pointerId);} catch {}
    }
    node.style.setProperty('--swipe-shift',clamp(dx*.38,-64,64)+'px');
  });
  node.addEventListener('pointerup',e=>{
    if(gesture?.id!==e.pointerId) return;
    const distance=e.clientX-gesture.x, dragging=gesture.dragging;
    reset();
    if(!dragging) return;
    blockNextClick=true;
    if(Math.abs(distance)>=38) step(distance<0?1:-1);
  });
  node.addEventListener('pointercancel',reset);
  node.addEventListener('lostpointercapture',reset);
  node.addEventListener('pointerleave',()=>{if(gesture&&!gesture.dragging) reset();});
  node.addEventListener('click',e=>{
    if(!blockNextClick||e.detail===0) return;
    blockNextClick=false;e.preventDefault();e.stopImmediatePropagation();
  },true);
  node.addEventListener('keydown',e=>{
    if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight') return;
    e.preventDefault();step(e.key==='ArrowLeft'?-1:1);
  });
}
function initializeFleetControls() {
  const select=$('vehicle-name');
  for(const [label,...indexes] of fleetGroups) {
    const group=document.createElement('optgroup');group.label=label;
    for(const index of indexes) group.append(new Option(vehicles[index].name,String(index)));
    select.append(group);
  }
  select.addEventListener('change',event=>{options.type=Number(event.target.value);renderSetup();});
  const sound=$('music-select');
  sound.add(new Option('Shuffle','shuffle'));
  for(const [index,tune] of tunes.entries()) sound.add(new Option(tune.name,String(index)));
  sound.addEventListener('change',event=>{options.music=musicChoice(event.target.value);saveOptions();});
}
function renderRuleCopy(config,course) {
  const event=eventNames[config.mode], steering=config.drag==='trace'?'Draw path':'Free drag';
  const distance=course.arena?course.arena+' seconds':course.training?'':config.laps+(config.laps===1?' lap':' laps');
  $('rules-summary').textContent=[event,distance,steering,damageNames[config.damage],config.hazards?'Hazards on':''].filter(Boolean).join(' · ');
  $('rule-course').textContent=course.name+' · '+vehicles[config.type].name;
  const oneHit=config.mode==='one-hit';
  $('event-explanation').hidden=!oneHit;
  $('event-explanation').textContent=vehicles[config.type].blade
    ? 'The first hit to the sides or rear ends the run.'
    : 'The first wall or object hit ends the run.';
  $('hazards-row').hidden=!course.hazards?.length;
  segmentation('hazards-select',config.hazards?'on':'off');
  const hazards=course.hazards||[];
  $('hazards-copy').textContent=hazards.length+' placements'+(hazards.some(p=>p.type==='oil')?' including an oil spill.':'.');
  $('music-select').value=options.music==null?'shuffle':String(options.music);
  $('rules-open').setAttribute('aria-expanded',String(modalType==='rules'));
  if(modalType==='rules') $('rules-start').textContent=$('start').textContent;
}
function openRaceRules() {
  openModal('rules','Race rules',body=>{
    body.append($('rule-fields'));
    const start=button($('start').textContent,startSelectedRun,'primary');start.id='rules-start';
    setModalActions(button('Done',closeModal),start);
  });
  $('rules-open').setAttribute('aria-expanded','true');
}
function startSelectedRun() {
  const config=configNow(), ghost=records.matching(config,$('ghost-select').value);
  newRace(config,config.mode==='race'||config.mode==='one-hit'?ghost:null);
}
function updateDriveAudio(game,dt,distance) {
  if(dt>0) {
    const target=game.replay?game.car.speed:Math.min(900,Math.max(0,distance)/dt);
    const current=game.engineSpeed??0;
    game.engineSpeed=mix(current,target,1-Math.exp(-dt*(target>current?15:6)));
  }
  const speed=game.engineSpeed??0;
  return {speed,engaged:game.pointer!=null||!!game.flick||!!game.route.length||speed>=12};
}
