class RecordStore {
  constructor() {
    this.items=new Map();
    this.key='track-and-trace-records-v1';
    this.ready=this.open();
  }
  async open() {
    try {
      this.db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('TrackAndTrace',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('runs',{keyPath:'id'});
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      const items=await this.request('readonly',store=>store.getAll());
      for(const item of items) this.items.set(item.id,item);
    } catch {
      this.db=null;
      try {for(const item of JSON.parse(localStorage.getItem(this.key)||'[]')) this.items.set(item.id,item);} catch {}
    }
  }
  request(mode,perform) {
    return new Promise((resolve,reject)=>{
      const transaction=this.db.transaction('runs',mode), result=perform(transaction.objectStore('runs'));
      transaction.oncomplete=()=>resolve(result?.result);
      transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
    });
  }
  async change(puts=[],deletes=[]) {
    for(const id of deletes) this.items.delete(id);
    for(const record of puts) this.items.set(record.id,record);
    try {
      if(this.db) {
        await this.request('readwrite',store=>{
          deletes.forEach(id=>store.delete(id));
          puts.forEach(record=>store.put(record));
        });
      } else localStorage.setItem(this.key,JSON.stringify([...this.items.values()]));
    } catch { return false; }
    return true;
  }
  matching(config,kind) {return this.items.get(recordKey(config,kind));}
  forCourse(course) {
    return [...this.items.values()].filter(r=>(r.config.courseId||courses[r.config.course]?.id)===courses[course]?.id)
      .sort((a,b)=>({fast:0,clean:1,damage:2,crash:3}[a.kind]-{fast:0,clean:1,damage:2,crash:3}[b.kind])||
        (a.kind==='crash'?b.impact-a.impact:a.kind==='damage'?b.score-a.score||a.duration-b.duration:a.duration-b.duration));
  }
}
const records = new RecordStore();
function recordKey(c,kind) {
  const parts=[c.courseId||courses[c.course]?.id,c.layout||0,c.type,c.laps,c.drag,
    c.drag==='free'?(c.release||'stop'):'',damageMode(c),c.tuneKey||tuningId(tuning),kind];
  if(kind==='damage'&&c.scoring) parts.push(c.scoring);
  if(c.hazards) parts.push('hazards');
  if(c.mode==='one-hit'&&(kind==='fast'||kind==='clean')) parts.push('one-hit');
  return parts.join('/');
}
function saveRun(game,completed,highlightsOnly=false) {
  const cfg=game.config,changes=[],deletes=[],points=damagePoints(game);
  const score=cfg.mode==='damage'?points.total:damageScore(game.car);
  const base={config:{...cfg},courseFile:game.course.custom?courses[cfg.course]?.courseFile:undefined,duration:game.elapsed,splits:[...game.splits],hits:game.hits,tune:game.tune,
    frames:game.frames,impacts:game.impacts,score,points:cfg.mode==='damage'?points:undefined,date:Date.now()};
  const oldFast=records.matching(cfg,'fast'), oldClean=records.matching(cfg,'clean'), oldDamage=records.matching(cfg,'damage');
  if((cfg.mode==='race'||cfg.mode==='one-hit') && completed && (!oldFast || game.elapsed<oldFast.duration)) {
    changes.push({...base,id:recordKey(cfg,'fast'),kind:'fast'});
  }
  if((cfg.mode==='race'||cfg.mode==='one-hit') && completed && !game.hits && (!oldClean || game.elapsed<oldClean.duration)) {
    changes.push({...base,id:recordKey(cfg,'clean'),kind:'clean'});
  }
  if(!highlightsOnly && cfg.mode==='damage' && (!oldDamage || score>oldDamage.score || (score===oldDamage.score && game.elapsed<oldDamage.duration))) {
    changes.push({...base,id:recordKey(cfg,'damage'),kind:'damage'});
  }
  const crashes=records.forCourse(cfg.course).filter(r=>r.kind==='crash');
  const sorted=game.impacts.filter(hit=>hit.amount>=3).sort((a,b)=>b.amount-a.amount);
  const crashLeaders=[];
  for(const hit of sorted) {
    if(crashLeaders.some(h=>Math.abs(h.t-hit.t)<1700)) continue;
    crashLeaders.push(hit);
    if(crashLeaders.length===3) break;
  }
  const candidates=crashLeaders.map((hit,i)=>{
    const low=Math.max(0,hit.t/1000-4),high=Math.min(game.elapsed,hit.t/1000+2.6);
    return {...base,id:'crash/'+(cfg.courseId||cfg.course)+'/'+base.date+'/'+i,kind:'crash',impact:hit.amount,low,high,
      frames:base.frames.filter((p,index)=>p[0]>=low*1000-1200&&p[0]<=high*1000+140 || index===0),
      impacts:base.impacts.filter(p=>p.t>=low*1000&&p.t<=high*1000)};
  });
  const leaders=crashes.concat(candidates).sort((a,b)=>b.impact-a.impact||a.date-b.date).slice(0,3);
  changes.push(...candidates.filter(r=>leaders.includes(r)));
  deletes.push(...crashes.filter(r=>!leaders.includes(r)).map(r=>r.id));
  return {changes,saved:changes.length||deletes.length?records.change(changes,deletes):Promise.resolve(true)};
}

loadCustomCourses();
const options={course:0,type:0,colors:[],laps:3,mode:'race',drag:'trace',damage:'total',ghost:'none',hazards:{},music:null};
function musicChoice(value) {
  return (typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value))&&tunes[Number(value)]?Number(value):null;
}
function normalizeHazardSettings(values) {
  return Object.fromEntries(courses.filter(c=>c.hazards?.length&&values?.[c.id]===true).map(c=>[c.id,true]));
}
function hazardsEnabled(course) {
  return !!course.hazards?.length&&options.hazards[course.id]===true;
}
try {
  const saved=JSON.parse(localStorage.getItem('track-and-trace-setup-v1')||'null');
  if(saved) {
    Object.assign(options,saved.options);
    if(saved.courseId) {const index=courses.findIndex(c=>c.id===saved.courseId);if(index>=0) options.course=index;}
    if(!courses[options.course]) options.course=0;
    options.damage=damageMode(options);delete options.release;
    audio.setMode(audioStates[saved.audio]?saved.audio:saved.muted?'off':'both');
  }
} catch {}
if(!Number.isInteger(options.type)||!vehicles[options.type]) options.type=0;
options.colors=normalizePaint(options.colors);
options.music=musicChoice(options.music);
options.hazards=normalizeHazardSettings(options.hazards);
let training=!!courses[options.course].training;
let raceCourse=courseOptions(false).includes(options.course)?options.course:0;
let trainingCourse=training?options.course:courseOptions(true)[0];
let damageCourse=courses[options.course].damageEvent?options.course:courseOptions('damage')[0];
let modalType='',modalSource=null,modalBack=null, hudAt=-100, displayed='', opening=false;
function saveOptions() {
  try {localStorage.setItem('track-and-trace-setup-v1',JSON.stringify({options,courseId:courses[options.course].id,audio:audio.mode}));} catch {}
}
function configNow() {
  const course=courses[options.course];
  const mode=training?'training':course.damageEvent?'damage':options.mode;
  return {course:options.course,courseId:course.id,layout:course.revision,type:options.type,
    color:options.colors[options.type],laps:course.arena?0:options.laps,arena:course.arena||undefined,
    mode,hazards:hazardsEnabled(course)||undefined,music:options.music,scoring:mode==='damage'?'objects-v1':undefined,drag:options.drag,release:'flick',damage:options.damage,tuneKey:tuningId(tuning)};
}
function clock(s) {
  const ms=Math.max(0,Math.round(s*1000));
  return Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');
}
function button(label,action,className='') {
  const el=document.createElement('button');
  el.textContent=label;el.className=className;el.addEventListener('click',action);
  return el;
}
function segmentation(id,value) {
  for(const b of $(id).querySelectorAll('[data-value]')) b.setAttribute('aria-pressed',b.dataset.value===value);
}
function selectCourseState(i) {
  options.course=i;
  const course=courses[i];
  training=!!course.training;
  if(training) trainingCourse=i;
  else if(course.damageEvent) damageCourse=i;
  else raceCourse=i;
}
function setCourse(i) {
  selectCourseState(i);
  renderSetup();
}
function changeCourse(by) {
  const list=setupCourseList();
  setCourse(list[mod(list.indexOf(options.course)+by,list.length)]);
}
function renderSetup() {
  const course=prepare(options.course);
  renderCoursePicker(course);
  renderVehiclePicker();
  $('sound').textContent={both:'♫ + SFX',effects:'SFX',music:'♫',off:'Audio off'}[audio.mode];
  $('sound').setAttribute('title',audioStates[audio.mode]);
  $('sound').setAttribute('aria-label',audioStates[audio.mode]+' · change audio mode');
  segmentation('event-select',options.mode);segmentation('drag-select',options.drag);segmentation('damage-select',options.damage);
  $('event-select').querySelector('[data-value=damage]').disabled=options.damage==='off';
  $('mode-row').hidden=training||!!course.damageEvent;
  $('lap-row').hidden=training||!!course.arena;
  $('ghost-row').hidden=training||!!course.damageEvent||options.mode==='damage';
  $('records').hidden=training;
  $('less-laps').disabled=options.laps<=1;$('more-laps').disabled=options.laps>=10;
  $('laps-value').textContent=options.laps;
  $('start').textContent=training?'Enter training':course.damageEvent||options.mode==='damage'?'Start challenge':
    options.mode==='one-hit'?'Start One Hit Loss':'Start race';
  const ghost=$('ghost-select');ghost.replaceChildren(new Option('Off','none'));
  const config=configNow();
  renderRuleCopy(config,course);
  for(const [key,label] of [['fast','Fastest'],['clean','Fastest clean']]) {
    const match=records.matching(config,key);
    if(match) ghost.add(new Option(label+' · '+clock(match.duration),key));
  }
  ghost.value=[...ghost.options].some(o=>o.value===options.ghost)?options.ghost:'none';
  const hint=options.drag==='trace'?'Draw ahead. A new touch replaces the path.':'Drag to steer. Release while moving to flick the vehicle.';
  $('hint').textContent=course.arena?course.arena+' seconds. Move objects as far as you can and aim for chains.':
    course.damageEvent?'Score by moving objects and knocking them into each other.':
    training?(options.damage==='total'?'Three crumpled sections end the run. ':'Exit whenever you like. ')+hint:hint;
  saveOptions();
}
function onSegment(id,change,refresh=true) {
  $(id).addEventListener('click',e=>{
    const target=e.target.closest('[data-value]');
    if(!target||target.disabled) return;
    change(target.dataset.value);if(refresh) renderSetup();
  });
}
function applyLap(delta,cycle=false) {
  options.laps=cycle?1+mod(options.laps-1+delta,10):clamp(options.laps+delta,1,10);
  renderSetup();
}
function fullscreen() {
  if(document.fullscreenElement||document.webkitFullscreenElement) return Promise.resolve();
  const el=document.documentElement, open=el.requestFullscreen||el.webkitRequestFullscreen;
  if(!open) return Promise.resolve();
  try {return Promise.resolve(open.call(el,{navigationUI:'hide'})).catch(()=>{});} catch {return Promise.resolve();}
}
function orientationToken() {
  if(innerWidth<innerHeight) return null;
  const angle=screen.orientation?.angle ?? window.orientation ?? 0;
  return navigator.maxTouchPoints>0 ? 'landscape/'+angle : 'landscape';
}
function placeStage(game) {
  const token=orientationToken();
  if(!game.orientation&&token) {
    game.orientation=token;
  }
  if(game.orientation&&(token===game.orientation||game.network&&token)) {
    const scale=Math.min(innerWidth/W,innerHeight/H);
    $('stage').style.width=W*scale+'px';$('stage').style.height=H*scale+'px';
  }
  const invalid=!token||!game.network&&token!==game.orientation;
  if(invalid) {
    if(game.orientation) pauseGame();
    $('rotation-title').textContent=game.orientation?'Restore the original orientation':'Turn your tablet sideways';
    $('rotation-note').textContent=game.network?'The network race continues while you rotate.':game.orientation?'Restore the original landscape orientation to resume.':'The course uses a fixed landscape view.';
  }
  $('rotation').hidden=!invalid;
  $('resume').disabled=invalid;
  $('stage').hidden=!game.orientation;
}
function showGame(game) {
  run=game;$('setup').hidden=true;$('play').hidden=false;
  $('inspection').hidden=true;$('finish-controls').hidden=true;
  placeStage(game);audio.begin(game.tune);
  updateHud(true);renderControls();drawScene(game);
}
async function settleFullscreen() {
  await Promise.race([fullscreen(),new Promise(resolve=>setTimeout(resolve,250))]);
}
function retainHighlights() {
  if(!run?.started||run.network||run.finished||run.replay||run.course.training||!run.impacts.length) return;
  saveFrame(run,true);saveRun(run,false,true);
}
async function newRace(config,ghost=null) {
  if(opening) return;
  opening=true;audio.unlock();
  await settleFullscreen();
  retainHighlights();closeModal();
  showGame(makeRun(config,ghost));opening=false;
}
function exitGame() {
  if(run?.network) {networkExitControls();return;}
  retainHighlights();
  if(run) stopPointer(run);
  run=null;$('play').hidden=true;$('setup').hidden=false;$('inspection').hidden=true;$('finish-controls').hidden=true;
  closeModal();renderSetup();
}
function stopPointer(game) {
  if(game.pointer!=null && $('track').hasPointerCapture(game.pointer)) {
    $('track').releasePointerCapture(game.pointer);
  }
  game.pointer=null;game.tip=null;game.fingers=[];game.releasePending=null;
}
function pauseGame() {
  if(run?.network) {stopNetworkPointer();return;}
  if(!run||run.finished||run.paused) return;
  run.paused=true;run.pausePulse=performance.now();run.frozenTip=run.tip;
  stopPointer(run);renderControls();
}
function resumeGame() {
  if(!run||run.finished||orientationToken()!==run.orientation) return;
  audio.unlock();run.paused=false;run.inspect=false;run.pausePulse=null;run.frozenTip=null;
  $('inspection').hidden=true;renderControls();
}
function renderControls() {
  if(!run) return;
  if(run.network) {renderNetworkControls();return;}
  $('pause').setAttribute('aria-label','Pause');$('pause').textContent='Ⅱ';
  const replay=!!run.replay, pause=run.paused&&!run.finished;
  const damageFinish=run.finished&&run.damageFinish&&!run.resultOpen;
  if($('net-race-hud')) $('net-race-hud').hidden=true;
  $('run-controls').hidden=!(pause||replay||damageFinish);
  $('finish-controls').hidden=!damageFinish;
  $('resume').hidden=!pause;$('inspect').hidden=!pause;$('retry').hidden=!pause||replay;
  $('quit').hidden=!pause||replay;
  $('replay-controls').hidden=!replay||pause;
  $('pause').disabled=run.finished;
  $('inspect').textContent=run.inspect?'Close inspection':'Inspect car';
  $('replay-toggle').textContent=run.replayPlaying?'Ⅱ':run.elapsed>=run.replayHigh?'↺':'▶';
  $('replay-toggle').setAttribute('aria-label',run.replayPlaying?'Pause replay':run.elapsed>=run.replayHigh?'Replay again':'Play replay');
}
function inspectCar() {
  if(!run || (!run.paused&&!run.damageFinish)) return;
  run.inspect=!run.inspect;
  $('inspection').hidden=!run.inspect;
  if(run.inspect) {
    const canvas=$('inspect-car'), box=$('track').getBoundingClientRect(), c=canvas.getContext('2d');
    canvas.style.setProperty('--inspect-x',(box.left+box.width*run.car.x/W-innerWidth/2)+'px');
    canvas.style.setProperty('--inspect-y',(box.top+box.height*run.car.y/H-innerHeight/2)+'px');
    c.clearRect(0,0,660,460);
    rounded(c,10,10,640,440,28,'#25413f');
    rounded(c,22,22,616,416,21,'#36514a');
    const type=run.config.type;
    const spec=vehicles[type], angles=run.car.trailerAngles;
    const poses=trailerPoses(spec,run.car), rear=poses.at(-1);
    const length=rigVisualLength(spec), zoom=Math.min(7,395/length);
    const originX=rear?(run.car.x-rear.x+Math.cos(rear.a)*rear.length*.5)*zoom*.48:0;
    const originY=rear?(run.car.y-rear.y+Math.sin(rear.a)*rear.length*.5)*zoom*.48:0;
    drawVehicle(c,330+originX,230+originY,run.car.a,type,run.color,run.car.damage,
      {scale:zoom,time:run.elapsed,cargo:visibleCargo(run),trailerAngles:angles});
  }
  renderControls();
}
function updateHud(force=false) {
  if(!run || (!force&&performance.now()-hudAt<37)) return;
  hudAt=performance.now();const game=run;
  const lap=Math.min(game.config.laps,game.splits.length+1);
  const remaining=Math.max(0,game.config.laps-game.splits.length);
  $('lap-hud').hidden=game.course.openYard;
  $('lap-hud').textContent='Lap '+lap+'/'+game.config.laps+' · '+remaining+' left';
  $('time-hud').textContent=game.course.arena?clock(game.course.arena-game.elapsed)+' left':clock(game.elapsed);
  const scoring=game.config.mode==='damage';
  $('score-hud').hidden=!scoring;
  if(scoring) $('score-hud').textContent=damagePoints(game).total.toLocaleString()+' pts';
  const chain=game.lastChain;
  $('chain-hud').hidden=!scoring||!chain||game.elapsed>=chain.until;
  if(chain) $('chain-hud').textContent='Chain ×'+(chain.links+1)+(chain.bonus?' · +'+chain.bonus:'');
  const splitText=game.splits.map(x=>clock(x)).join('|');
  if(force||splitText!==displayed) {
    displayed=splitText;$('splits').replaceChildren();
    game.splits.forEach((s,i)=>{
      const block=document.createElement('span');block.className='hud-pill';
      block.textContent=(i+1)+' '+clock(s);$('splits').append(block);
    });
  }
  if(game.replay) {
    $('seek').value=Math.round(1000*(game.elapsed-game.replayLow)/Math.max(.001,game.replayHigh-game.replayLow));
  }
}
function storeRuleFields() {
  if(modalType==='rules') $('rule-storage').append($('rule-fields'));
  $('rules-open').setAttribute('aria-expanded','false');
}
function setModalActions(...actions) {
  const footer=$('modal-actions');
  footer.replaceChildren(...actions);footer.hidden=!actions.length;
}
function openModal(kind,title,fill,back=null) {
  const modal=$('modal'),body=$('modal-body');
  if(modal.hidden) modalSource=document.activeElement;
  storeRuleFields();
  modalType=kind;modalBack=back;modal.dataset.view=kind;
  $('modal-title').textContent=title;body.replaceChildren();setModalActions();
  fill(body);
  body.scrollTop=0;modal.hidden=false;
  $('setup').inert=true;$('play').inert=true;$('creator').inert=true;
  $('close-modal').setAttribute('aria-label',back?'Back':'Close');
  $('close-modal').focus({preventScroll:true});
}
function closeModal() {
  storeRuleFields();
  $('modal').hidden=true;modalType='';modalBack=null;
  $('setup').inert=false;$('play').inert=false;$('creator').inert=false;
  setModalActions();
  if(modalSource?.offsetParent) modalSource.focus({preventScroll:true});
  modalSource=null;
}
function dismissModal() {
  if(modalBack) modalBack();
  else if(modalType==='result') exitGame();
  else closeModal();
}
function trapModalFocus(e) {
  const focusable=[...$('modal').querySelectorAll('button,input,textarea,select,[tabindex]')]
    .filter(el=>!el.disabled&&el.getClientRects().length&&el.tabIndex>=0);
  if(!focusable.length) return;
  const index=focusable.indexOf(document.activeElement);
  if(index<0||e.shiftKey&&index===0||!e.shiftKey&&index===focusable.length-1) {
    e.preventDefault();focusable[e.shiftKey?focusable.length-1:0].focus();
  }
}
function paragraph(text) {const e=document.createElement('p');e.textContent=text;return e;}
function stat(label,value) {
  const item=document.createElement('div'), name=document.createElement('small'), content=document.createElement('strong');
  name.textContent=label;content.textContent=value;item.append(name,content);return item;
}
function configLabel(c) {
  const length=c.laps?c.laps+(c.laps===1?' lap':' laps'):(c.arena||courses[c.course]?.arena||60)+' s arena';
  return vehicles[c.type].name+' · '+length+' · '+(c.drag==='trace'?'Draw path':'Free drag')+
    (c.drag==='free'&&c.release==='flick'?' · Flick':'')+(c.hazards?' · Hazards':'')+
    ({off:' · Damage off',open:' · Damage only',total:''}[damageMode(c)])+(c.mode==='damage'?' · Challenge':c.mode==='one-hit'?' · One Hit Loss':'');
}
function showRecords(courseIndex) {
  const entries=records.forCourse(courseIndex);
  openModal('records',courses[courseIndex].name+' records',body=>{
    if(!entries.length) {
      body.append(paragraph('Finish a run or make a hard impact to save a replay here.'));
      setModalActions(button(run?.finished?'Back to results':'Done',dismissModal,'primary'));return;
    }
    const groups=[['Race times',['fast','clean']],['Damage challenge',['damage']],['Crash highlights',['crash']]];
    for(const [name,kinds] of groups) {
      const items=entries.filter(r=>kinds.includes(r.kind));
      if(!items.length) continue;
      const heading=document.createElement('h3');heading.textContent=name;body.append(heading);
      for(const [i,rec] of items.entries()) {
        const row=document.createElement('div'), label=document.createElement('div'), time=document.createElement('b'), meta=document.createElement('small');
        row.className='record';
        time.textContent=rec.kind==='crash'?'Crash '+(i+1)+' · '+rec.impact+' damage':
          rec.kind==='damage'?rec.score+' points':(rec.kind==='fast'?'Fastest · ':'Clean · ')+clock(rec.duration);
        meta.textContent=configLabel(rec.config);label.append(time,meta);
        const remove=button('Delete',()=>confirmDelete(rec,courseIndex),'delete');
        remove.setAttribute('aria-label','Delete '+time.textContent+' '+meta.textContent);
        row.append(label,button('Watch',()=>launchReplay(rec)),remove);body.append(row);
      }
    }
    setModalActions(button(run?.finished?'Back to results':'Done',dismissModal,'primary'));
  },run?.finished?run.showResult:null);
}
function confirmDelete(record,course) {
  openModal('delete','Delete this result?',body=>{
    body.append(paragraph(configLabel(record.config)));
    setModalActions(button('Keep result',()=>showRecords(course)),button('Delete result',async()=>{
      const saved=await records.change([],[record.id]);
      if(saved) showRecords(course);
      else body.append(paragraph('This browser could not update the saved result.'));
    },'danger'));
  },()=>showRecords(course));
}
function finish(game,reason) {
  if(game.finished) return;
  if(game.network) {finishNetworkDriver(game,reason);return;}
  game.finished=true;stopPointer(game);saveFrame(game,true);
  const completed=reason==='Finished', clean=completed&&!game.hits;
  const saved=game.course.training?null:saveRun(game,completed);
  const challenge=game.config.mode==='damage', breakdown=damagePoints(game);
  const points=challenge?breakdown.total:completed?Math.round(10000/(1+game.elapsed/30))+(clean?1500:0):0;
  if(completed) audio.effect('finish');
  updateHud(true);
  game.showResult=()=>{
  game.resultOpen=true;game.inspect=false;$('inspection').hidden=true;renderControls();
  openModal('result',reason,body=>{
    const stats=document.createElement('div');stats.className='stats';
    stats.append(stat('Total time',clock(game.elapsed)));
    if(!game.course.training) {
      if(!game.course.arena) stats.append(stat('Laps completed',game.splits.length+'/'+game.config.laps));
      if(challenge) {
        stats.append(stat('Total score',points.toLocaleString()),stat('Object distance',breakdown.movement.toLocaleString()+' pts'),
          stat('Chain bonus',breakdown.chain.toLocaleString()+' pts'),stat('Car damage',breakdown.body.toLocaleString()+' pts'));
        if(game.chainCount) stats.append(stat('Best chain',(game.chainCount+1)+' objects'));
      } else {
        stats.append(stat('Wall contacts',game.hits),stat('Score',points));
        if(clean) stats.append(stat('Clean bonus','+1,500'));
      }
    }
    body.append(stats);
    if(game.lossHit) body.append(paragraph(game.lossHit.prop?'The run ended on an object hit.':'The run ended on a wall hit.'));
    const actions=[button('Back to menu',exitGame)];
    if(!game.course.training) actions.push(button('View records',()=>showRecords(game.config.course)));
    actions.push(button('Run again',()=>newRace(game.config,game.ghost),'primary'));
    setModalActions(...actions);
    if(saved?.changes.some(r=>r.kind!=='crash')) {
      const labels={fast:'Fastest time',clean:'Fastest clean time',damage:'Damage high score'};
      body.append(paragraph(saved.changes.filter(r=>labels[r.kind]).map(r=>labels[r.kind]).join(' · ')));
    }
    saved?.saved.then(ok=>{if(!ok&&body.isConnected&&modalType==='result') body.append(paragraph('This browser could not save the replay to disk.'));});
  });
  };
  if(!completed) {game.damageFinish=true;game.pausePulse=performance.now();game.emitAt=0;engineWear(game);inspectCar();renderControls();}
  else game.showResult();
}
async function launchReplay(record) {
  if(opening) return;
  opening=true;audio.unlock();await settleFullscreen();closeModal();
  const index=courses.findIndex(c=>c.id===record.config.courseId);
  const config={...record.config,course:index>=0?index:record.config.course};
  const courseFile=record.courseFile;
  const fallback=legacyCourses[config.course];
  const oldLayout=fallback&&!record.config.layout&&courses[config.course]?.revision&&
    !courses[config.course]?.custom;
  const definition=courseFile?courseFromFile(courseFile,true):oldLayout?fallback:null;
  const game=makeRun(config,null,definition?prepareDefinition(definition,config.course):null);
  game.scars=record.impacts.filter(h=>!h.prop).map(h=>({...h,a:Math.atan2(h.ny,h.nx)+Math.PI/2}));
  game.replay=record;game.tune=record.tune;
  game.replayLow=record.low??0;game.replayHigh=record.high??record.duration;
  game.elapsed=game.replayLow;game.replayPlaying=true;game.started=true;
  rebuildReplayTrail(game,game.elapsed);
  game.splits=record.splits.filter((_,i)=>record.splits.slice(0,i+1).reduce((a,b)=>a+b,0)<=game.elapsed+.001);
  showGame(game);opening=false;
}
function seekReplay(game,fraction) {
  game.elapsed=mix(game.replayLow,game.replayHigh,fraction);
  game.splits=game.replay.splits.filter((_,i)=>game.replay.splits.slice(0,i+1).reduce((a,b)=>a+b,0)<=game.elapsed+.001);
  rebuildReplayTrail(game,game.elapsed);updateHud(true);renderControls();
}

function inputPoint(e) {
  const box=$('track').getBoundingClientRect();
  return {x:clamp((e.clientX-box.left)*W/box.width,0,W),y:clamp((e.clientY-box.top)*H/box.height,0,H)};
}
function drivePointerStart(game,pos,pointer,time) {
  if(game.config.drag==='free') game.grab={x:game.car.x-pos.x,y:game.car.y-pos.y};
  game.pointer=pointer;
  game.newStroke=true;game.flick=null;game.releasePending=null;game.stalled=false;
  game.streak={x:game.car.x,y:game.car.y,time:game.elapsed};
  game.tip=game.config.drag==='free'?{x:game.car.x,y:game.car.y}:pos;
  game.gesture=[{...game.tip,t:time}];
  if(!game.started) {game.started=true;if(!game.course.training) saveFrame(game,true);}
  if(game.config.drag==='trace') {
    game.route=[];game.routeArc=0;appendRoute(game,pos);
  } else game.fingers=[game.tip];
  if(!game.networkRemote) audio.engage(game.config.type);
}
function drivePointerMove(game,p,time) {
  if(game.config.drag==='free') {
    p={x:clamp(p.x+game.grab.x,0,W),y:clamp(p.y+game.grab.y,0,H)};
    game.fingers.push(p);
    game.gesture.push({...p,t:time});
    while(game.gesture.length>2&&game.gesture[0].t<time-110) game.gesture.shift();
  } else appendRoute(game,p);
  game.tip=p;
}
function drivePointerEnd(game,released,time) {
  if(released) {
    if(game.config.drag==='trace'&&game.tip&&!game.stalled) appendRoute(game,game.tip,true);
    if(game.config.drag==='free'&&game.gesture.length>=2) {
      const tail=game.gesture.at(-1),head=game.gesture[0];
      const gap=dist(head,tail),seconds=Math.max(.018,(tail.t-head.t)/1000);
      if(time-tail.t<95&&gap>7) game.releasePending={a:Math.atan2(tail.y-head.y,tail.x-head.x),speed:Math.min(game.spec.style?Math.max(0,game.car.speed):980,gap/seconds)};
    }
  }
  game.pointer=null;game.tip=null;
  if(!released) {game.fingers=[];game.releasePending=null;}
}
$('track').addEventListener('pointerdown',e=>{
  const game=run;
  if(!game||e.button!==0||!$('rotation').hidden) return;
  if(game.network) {networkPointer('down',e);return;}
  if(game.finished) {if(game.damageFinish&&dist(inputPoint(e),game.car)<55) inspectCar();return;}
  const pos=inputPoint(e);
  if(game.paused) {
    if(!game.inspect&&dist(pos,game.car)<55) inspectCar();
    return;
  }
  if(game.replay||game.pointer!=null) return;
  if(game.config.drag==='free') {
    const grabRadius=Math.max(31,29*W/$('track').getBoundingClientRect().width);
    if(dist(pos,game.car)>grabRadius) return;
  }
  e.preventDefault();audio.unlock();$('track').setPointerCapture(e.pointerId);
  drivePointerStart(game,pos,e.pointerId,e.timeStamp??performance.now());
});
$('track').addEventListener('pointermove',e=>{
  const game=run;
  if(game?.network) {networkPointer('move',e);return;}
  if(!game||game.pointer!==e.pointerId||game.paused||game.stalled) return;
  const chain=e.getCoalescedEvents?.()||[];
  for(const event of chain.length?chain:[e]) drivePointerMove(game,inputPoint(event),event.timeStamp??performance.now());
});
for(const name of ['pointerup','pointercancel','lostpointercapture']) {
  $('track').addEventListener(name,e=>{
    if(run?.network) {networkPointer(name==='pointerup'?'up':'cancel',e);return;}
    if(!run||run.pointer!==e.pointerId) return;
    drivePointerEnd(run,name==='pointerup',e.timeStamp??performance.now());
  });
}
$('start').addEventListener('click',startSelectedRun);
$('rules-open').addEventListener('click',openRaceRules);
attachCarousel('course-carousel',changeCourse);
attachCarousel('vehicle-carousel',changeVehicle);
$('records').addEventListener('click',()=>showRecords(options.course));
$('ghost-select').addEventListener('change',e=>{options.ghost=e.target.value;saveOptions();});
$('races-tab').addEventListener('click',()=>setCourse(raceCourse));
$('training-tab').addEventListener('click',()=>setCourse(trainingCourse));
$('damage-tab').addEventListener('click',()=>setCourse(damageCourse));
$('prev-course').addEventListener('click',()=>changeCourse(-1));$('next-course').addEventListener('click',()=>changeCourse(1));
$('prev-vehicle').addEventListener('click',()=>changeVehicle(-1));
$('next-vehicle').addEventListener('click',()=>changeVehicle(1));
onSegment('hazards-select',value=>{
  const course=courses[options.course];
  if(course.hazards?.length) options.hazards[course.id]=value==='on';
});
onSegment('event-select',value=>{options.mode=value;});
onSegment('drag-select',value=>{options.drag=value;});
onSegment('damage-select',value=>{options.damage=value;if(value==='off'&&options.mode==='damage') options.mode='race';});
$('tuning-open').addEventListener('click',openTuning);
$('less-laps').addEventListener('click',()=>applyLap(-1));
$('more-laps').addEventListener('click',()=>applyLap(1));
$('laps-value').addEventListener('click',()=>applyLap(1,true));
$('sound').addEventListener('click',()=>{
  audio.unlock();const order=Object.keys(audioStates);audio.setMode(order[mod(order.indexOf(audio.mode)+1,order.length)]);renderSetup();
});
$('full').addEventListener('click',()=>{audio.unlock();fullscreen();});
$('pause').addEventListener('click',()=>run?.network?networkExitControls():run?.paused?resumeGame():pauseGame());
$('resume').addEventListener('click',resumeGame);
$('inspect').addEventListener('click',inspectCar);$('inspect-car').addEventListener('click',inspectCar);
$('quit').addEventListener('click',exitGame);$('rotation-exit').addEventListener('click',()=>run?.network?leaveNetworkRoom('You left the room.'):exitGame());
$('retry').addEventListener('click',()=>run&&newRace(run.config,run.ghost));
$('damage-result').addEventListener('click',()=>run?.showResult());
$('damage-retry').addEventListener('click',()=>run&&newRace(run.config,run.ghost));
$('damage-exit').addEventListener('click',exitGame);
$('replay-exit').addEventListener('click',()=>{
  const index=run?.config.course;exitGame();if(index!=null) showRecords(index);
});
$('replay-toggle').addEventListener('click',()=>{
  if(!run?.replay) return;
  audio.unlock();
  if(run.elapsed>=run.replayHigh) seekReplay(run,0);
  run.replayPlaying=!run.replayPlaying;renderControls();
});
$('seek').addEventListener('input',e=>{
  if(run?.replay) {run.replayPlaying=false;seekReplay(run,Number(e.target.value)/1000);}
});
$('close-modal').addEventListener('click',dismissModal);
$('modal').addEventListener('click',e=>{
  if(e.target===$('modal')&&['rules','settings','tuning','records'].includes(modalType)) dismissModal();
});
window.addEventListener('keydown',e=>{
  if(!$('modal').hidden&&e.key==='Tab') {trapModalFocus(e);return;}
  if(e.key==='Escape') {
    if(!$('modal').hidden) dismissModal();
    else if(run?.network) networkExitControls();
    else if(run) {if(run.finished) run.showResult?.();else if(run.paused) resumeGame();else pauseGame();}
    else if(!$('creator').hidden) closeCreator();
  }
});
const windowChanged=()=>{if(run&&!run.finished) placeStage(run);};
window.addEventListener('resize',windowChanged);
window.addEventListener('orientationchange',windowChanged);
document.addEventListener('fullscreenchange',windowChanged);
screen.orientation?.addEventListener('change',windowChanged);
document.addEventListener('visibilitychange',()=>{if(document.hidden) pauseGame();});

let lastTick=performance.now();
function animate(now) {
  const duration=clamp((now-lastTick)/1000,0,.23);lastTick=now;
  if(run) {
    const steps=Math.max(1,Math.ceil(duration/.0125)),dt=duration/steps,priorDistance=run.totalDistance;
    if(run.network) updateNetworkRace(duration);
    else if(dt>0&&!run.paused&&!run.finished&&$('rotation').hidden) {
      for(let i=0;i<steps;i++) {
        if(run.replay) tickReplay(run,dt);else tickRace(run,dt);
      }
    }
    if(!run) {requestAnimationFrame(animate);return;}
    if(!$('stage').hidden) drawScene(run);
    updateHud();
    const playing=(!run.network||networkCountdownValue()===0)&&run.started&&!run.paused&&!run.finished&&$('rotation').hidden&&(!run.replay||run.replayPlaying);
    const engine=updateDriveAudio(run,duration,run.totalDistance-priorDistance);
    audio.tick(playing,timedIntensity(run),engine.speed,run.config.type,engine.engaged);
  } else audio.tick(false,false,0,0,false);
  requestAnimationFrame(animate);
}
initializeFleetControls();renderSetup();initializeEditor();
if(typeof initializeMultiplayer==='function') initializeMultiplayer();
records.ready.then(()=>{if(!run) renderSetup();});
requestAnimationFrame(animate);
