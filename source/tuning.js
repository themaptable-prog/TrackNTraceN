const originalDamageSteps=[0,8,16,25,40,55,75,100];
const damageControls={
  contact:['Base contact',150],normal:['Speed into surface',200],overlap:['Overlap',8],
  adjacent:['Adjacent sections',55],core:['Centre section',55],curb:['Curb wear',40],props:['Movable props',16]
};
const timeControls={
  rearm:['Contact re-arm',100,40,500,10],pinned:['Wall assist delay',300,100,800,25],
  avoid:['Wall assist duration',1000,250,2500,50],stall:['Clear stalled path after',500,250,1500,25],
  rub:['Dry rubbing interval',300,180,700,10],squeal:['Tyre sound cooldown',450,200,1000,25]
};
// Preserve the original positions and endpoints, then add one extra position near the low end.
function doubleSteps(values,precision) {
  const scale=10**precision;
  const round=value=>Math.round(value*scale)/scale;
  const [low,second]=values;
  return [low,round(low+(second-low)/4),...values.slice(1).flatMap((value,i)=>[
    round((values[i]+value)/2),value
  ])];
}
const previousDamageSteps=doubleSteps(originalDamageSteps,1);
const DAMAGE_STEPS=[...originalDamageSteps,125,150,175,200,225,250,275,300];
const timingSteps=Object.fromEntries(Object.entries(timeControls).map(([key,[,,min,max,step]])=>[
  key,doubleSteps(Array.from({length:(max-min)/step+1},(_,i)=>min+i*step),0)
]));
const defaultTuning=Object.fromEntries([
  ...Object.entries(damageControls).map(([key,[,value]])=>[key,value]),
  ...Object.entries(timeControls).map(([key,[,value]])=>[key,value])
]);
let tuning={...defaultTuning};
const damageFactor=(game,key)=>game.rules[key]/100;
function damageMode(config) {
  return config.damage===false||config.damage==='off'?'off':config.damage==='open'?'open':'total';
}
function tuningId(rules) {
  return Object.keys(defaultTuning).map(key=>{
    const value=rules[key];
    if(!Object.hasOwn(damageControls,key)) return value.toString(36);
    const originalIndex=originalDamageSteps.indexOf(value);
    if(originalIndex>=0) return originalIndex.toString(36);
    const previousIndex=previousDamageSteps.indexOf(value);
    return previousIndex>=0?'+'+previousIndex.toString(36):'%'+value;
  }).join('.');
}
function closestStep(steps,value) {
  return steps.reduce((closest,point)=>Math.abs(point-value)<Math.abs(closest-value)?point:closest,steps[0]);
}
function addTuningRows(controls,title,definitions,isDamage) {
  const heading=document.createElement('h3');
  heading.textContent=title;controls.append(heading);
  for(const [key,[name]] of Object.entries(definitions)) {
    const label=document.createElement('label'), caption=document.createElement('span');
    const input=document.createElement('input'), output=document.createElement('output');
    const steps=isDamage?DAMAGE_STEPS:timingSteps[key];
    caption.textContent=name;
    label.append(caption,input,output);
    input.type='range';input.min='0';input.max=steps.length-1;input.step='1';
    input.value=steps.indexOf(closestStep(steps,tuning[key]));input.setAttribute('aria-label',name);
    const update=()=>{
      const value=tuning[key]+(isDamage?'%':' ms');
      output.textContent=value;input.setAttribute('aria-valuetext',value);
    };
    input.addEventListener('input',()=>{
      tuning[key]=steps[Number(input.value)];update();
    });
    input.addEventListener('change',renderSetup);
    update();controls.append(label);
  }
}
function openTuning() {
  openModal('tuning','Development tuning',body=>{
    const controls=document.createElement('div');
    controls.id='tuning-controls';
    addTuningRows(controls,'Damage',damageControls,true);
    addTuningRows(controls,'Timing',timeControls,false);
    body.append(controls);
    setModalActions(button('Copy or paste settings',exchangeSettings),button('Done',closeModal,'primary'));
  });
}
function tuningText() {
  return JSON.stringify({format:'Track’n’Trace’n settings',version:3,tuning,
    setup:{course:courses[options.course].id,vehicle:options.type,colors:options.colors,laps:options.laps,
      event:options.mode,drag:options.drag,damage:options.damage,ghost:options.ghost,audio:audio.mode,
      hazards:options.hazards,music:options.music}},null,2);
}
function applyTuningText(text) {
  const data=JSON.parse(text);
  if(data?.format!=='Track’n’Trace’n settings'||![1,2,3].includes(data.version)||!data.tuning) throw Error('Choose a Track’n’Trace’n settings export.');
  const next={...tuning};
  for(const [key,value] of Object.entries(data.tuning)) {
    if(Object.hasOwn(damageControls,key)&&Number.isFinite(value)) {
      const points=data.version===1?originalDamageSteps:data.version===2?previousDamageSteps:null;
      const percentage=points?points[value]:value;
      if(Number.isFinite(percentage)&&percentage>=0&&percentage<=300) next[key]=percentage;
    }
    if(Object.hasOwn(timeControls,key)&&Number.isFinite(value)) {
      const [, , min,max,step]=timeControls[key];
      next[key]=data.version===1?clamp(min+Math.round((value-min)/step)*step,min,max):
        closestStep(timingSteps[key],value);
    }
  }
  tuning=next;
  const s=data.setup;
  if(s) {
    const course=courses.findIndex(c=>c.id===s.course);
    if(course>=0) selectCourseState(course);
    if(Number.isInteger(s.vehicle)&&vehicles[s.vehicle]) options.type=s.vehicle;
    if(Array.isArray(s.colors)) options.colors=normalizePaint(s.colors);
    if(Object.hasOwn(s,'hazards')) options.hazards=normalizeHazardSettings(s.hazards);
    if(Object.hasOwn(s,'music')) options.music=musicChoice(s.music);
    if(Number.isInteger(s.laps)) options.laps=clamp(s.laps,1,10);
    if(['race','one-hit','damage'].includes(s.event)) options.mode=s.event;
    if(['trace','free'].includes(s.drag)) options.drag=s.drag;
    if(['off','open','total'].includes(s.damage)) options.damage=s.damage;
    if(['none','fast','clean'].includes(s.ghost)) options.ghost=s.ghost;
    if(audioStates[s.audio]) audio.setMode(s.audio);
    if(options.damage==='off'&&options.mode==='damage') options.mode='race';
  }
  renderSetup();
}
function exchangeSettings() {
  openModal('settings','Copy or paste settings',body=>{
    const area=document.createElement('textarea'),message=document.createElement('p');
    area.value=tuningText();area.rows=14;area.className='settings-text';area.setAttribute('aria-label','Settings to copy or paste');
    setModalActions(button('Back to tuning',openTuning),button('Copy',async()=>{
      area.select();
      try {
        if(navigator.clipboard) await navigator.clipboard.writeText(area.value);
        else if(!document.execCommand('copy')) throw Error();
        message.textContent='Settings copied.';
      } catch {message.textContent='Settings selected. Use your device’s Copy command.';}
    }),button('Apply pasted settings',()=>{
      try {applyTuningText(area.value);area.value=tuningText();message.textContent='Settings applied.';}
      catch(error) {message.textContent=error instanceof SyntaxError?'Paste a complete settings export.':error.message;}
    },'primary'));
    message.setAttribute('aria-live','polite');body.append(area,message);
  },openTuning);
}
