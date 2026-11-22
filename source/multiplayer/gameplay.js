// Multiplayer gameplay: lobby rules, authoritative simulation, input and snapshots.
const networkRaceLimit=15*60;
const networkTick=1/120;
const networkCountdown=3.5;
const networkCourseOptions=()=>courses.filter(course=>!course.training);
const networkName=value=>typeof value==='string'?value.trim().replace(/[\x00-\x1f\x7f]/g,'').slice(0,22):'';
function networkDriver(value) {
  const type=Number.isInteger(value?.type)&&vehicles[value.type]?value.type:0;
  const color=Number.isInteger(value?.color)&&vehicles[type].palette[value.color]?value.color:0;
  return {name:networkName(value?.name),type,color};
}
function networkSettings(value) {
  const imported=value?.courseFile?normalizeCourseFile(value.courseFile):null;
  const course=imported?courseFromFile(imported):courses.find(c=>c.id===value?.course&& !c.custom);
  if(!course||course.training) throw Error('Choose a race or damage course.');
  const damage=['off','open','total'].includes(value.damage)?value.damage:'total';
  const event=course.damageEvent?'damage':
    value.event==='one-hit'?'one-hit':value.event==='damage'&&damage!=='off'?'damage':'race';
  return {course:course.id,courseFile:imported||undefined,laps:clamp(Math.round(finite(value.laps,1,10,3)),1,10),
    event,drag:value.drag==='free'?'free':'trace',damage:course.damageEvent&&damage==='off'?'open':damage,
    hazards:!!course.hazards?.length&&value.hazards===true,music:musicChoice(value.music)};
}
function networkCourse(settings) {
  if(settings.courseFile) return prepareDefinition(courseFromFile(settings.courseFile));
  return prepare(courses.findIndex(c=>c.id===settings.course));
}
function networkSeedSettings() {
  const course=courses[options.course].training?networkCourseOptions()[0]:courses[options.course];
  return networkSettings({course:course.id,courseFile:course.courseFile,laps:options.laps,event:options.mode,
    drag:options.drag,damage:options.damage,hazards:hazardsEnabled(course),music:options.music});
}
function networkStartGrid(game,slot) {
  const course=game.course, car=game.car;
  if(course.openYard) {
    car.y+=([-40,40,-100,100][slot]||0);
  } else {
    const offset=[-12,12,-12,12][slot], behind=Math.round(Math.floor(slot/2)*49/course.step);
    const index=-behind, p=course.samples[mod(index,course.samples.length)];
    car.index=index;
    car.a=Math.atan2(p.ty,p.tx);
    car.x=p.x+p.nx*offset;car.y=p.y+p.ny*offset;
  }
  car.surface=runSurface(game,car.x,car.y,car.index);
  game.slideHeading=car.a;game.streak={x:car.x,y:car.y,time:0};
}
function finishNetworkDriver(game,reason) {
  game.finished=true;
  game.networkResult=reason;
  game.pointer=null;game.tip=null;game.route=[];game.fingers=[];game.flick=null;game.releasePending=null;
}
function networkDriverInput(game,input) {
  for(const row of input) {
    if(game.finished) return;
    if(!Array.isArray(row)) continue;
    const [event,x,y,t]=row;
    if(!['down','move','up','cancel'].includes(event)) continue;
    if(event==='up'||event==='cancel') {
      if(game.pointer!=null) drivePointerEnd(game,event==='up',Number.isFinite(t)?t:0);
      continue;
    }
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(t)) continue;
    const point={x:clamp(x,0,W),y:clamp(y,0,H)};
    if(event==='down') {
      if(game.pointer!=null) continue;
      if(game.config.drag==='free'&&dist(point,game.car)>60) continue;
      drivePointerStart(game,point,1,t);
    } else if(game.pointer!=null&&!game.stalled&&game.route.length<5000&&game.fingers.length<170) drivePointerMove(game,point,t);
  }
}
function collideNetworkCars(race) {
  if(race.elapsed<2.1) return;
  const drivers=[...race.drivers.values()];
  for(let i=0;i<drivers.length;i++) for(let j=i+1;j<drivers.length;j++) {
    const a=drivers[i],b=drivers[j];
    if(a.finished||b.finished||a.spec.hover||b.spec.hover||
      routeLevelAt(race.course,a.car.index)!==routeLevelAt(race.course,b.car.index)) continue;
    const dx=b.car.x-a.car.x,dy=b.car.y-a.car.y,distance=Math.hypot(dx,dy);
    if(distance<.01||distance>63) continue;
    const nx=dx/distance,ny=dy/distance;
    const depth=footprint(a.spec,a.car.a,nx,ny)+footprint(b.spec,b.car.a,nx,ny)-distance;
    if(depth<=0) continue;
    const closing=(Math.cos(a.car.a)*nx+Math.sin(a.car.a)*ny)*a.car.speed-
      (Math.cos(b.car.a)*nx+Math.sin(b.car.a)*ny)*b.car.speed;
    const pair=a.networkId+'/'+b.networkId, last=race.carContacts.get(pair)??-1;
    if(closing>24&&race.elapsed-last>.34) {
      race.carContacts.set(pair,race.elapsed);
      for(const [game,direction] of [[a,1],[b,-1]]) {
        const x=nx*direction,y=ny*direction;
        if(isBladeHit(game.spec,game.car.a,x,y)) continue;
        game.hits++;game.car.speed*=.79;recoverFromHit(game);dropTimber(game,closing,x,y);
        const amount=damageMode(game.config)==='off'?0:applySectionDamage(game.car,hitSection(game.car.a,x,y),
          (1+closing*.036)*game.spec.resistance);
        logHit(game,{t:Math.round(game.elapsed*1000),x:game.car.x+x*11,y:game.car.y+y*11,amount,
          strength:clamp(closing/280,.22,.9),index:game.car.index,nx:x,ny:y,prop:true});
      }
    }
    for(const [game,direction] of [[a,-1],[b,1]]) {
      if(game.finished) continue;
      const car=game.car, push=Math.min(depth*.27,1.8)*direction;
      const pos=race.course.openYard?solveYard(game,car.x+nx*push,car.y+ny*push,car.a):
        solveRoad(game,car.x+nx*push,car.y+ny*push,car.a,false);
      car.x=pos.x;car.y=pos.y;
    }
  }
}
function networkCarState(game) {
  const c=game.car;
  return {id:game.networkId,x:Math.round(c.x*4)/4,y:Math.round(c.y*4)/4,a:Math.round(c.a*1000)/1000,
    index:c.index,speed:Math.round(c.speed),damage:c.damage.map(Math.round),trailerAngles:c.trailerAngles?.map(a=>Math.round(a*1000)/1000),
    cargo:game.cargo,splits:game.splits,progress:Math.round(game.progress),surface:c.surface,
    score:game.config.mode==='damage'?damagePoints(game).total:0,result:game.networkResult,finishTime:game.finished?game.elapsed:undefined,
    impact:game.impacts.at(-1)};
}
class NetworkRound {
  constructor(settings,players,id,localId) {
    this.id=id;this.settings=settings;this.players=players;this.course=networkCourse(settings);
    this.drivers=new Map();this.carContacts=new Map();this.elapsed=0;this.countdown=networkCountdown;
    this.accumulator=0;this.sendIn=0;this.tune=chooseTune(settings.music);
    for(const [slot,player] of players.entries()) {
      const game=this.createDriver(player,slot);
      game.networkRemote=player.id!==localId;
      this.drivers.set(player.id,game);
    }
    this.local=this.drivers.get(localId);
    this.props=this.local.props;
    for(const game of this.drivers.values()) game.props=this.props;
  }
  createDriver(player,slot) {
    const settings=this.settings;
    const config={type:player.type,color:player.color,laps:settings.laps,mode:settings.event,
      damage:settings.damage,drag:settings.drag,hazards:settings.hazards,music:settings.music};
    const game=makeRun(config,null,this.course);
    Object.assign(game,{network:true,networkId:player.id,networkRemote:true,tune:this.tune,
      rules:{...defaultTuning},started:true,networkResult:null});
    networkStartGrid(game,slot);
    game.networkRound=this;
    return game;
  }
  input(id,rows) {
    const driver=this.drivers.get(id);
    if(driver&&this.countdown<=0&&Array.isArray(rows)) networkDriverInput(driver,rows.slice(0,70));
  }
  withdraw(id) {
    const game=this.drivers.get(id);
    if(game&&!game.finished) finishNetworkDriver(game,'Disconnected');
  }
  step(duration) {
    if(this.done) return false;
    const active=Math.max(0,duration-this.countdown);
    this.countdown=Math.max(0,this.countdown-duration);
    if(active>0) {
      this.accumulator+=active;
      while(this.accumulator>=networkTick&&!this.done) {
        this.accumulator-=networkTick;this.elapsed+=networkTick;
        for(const game of this.drivers.values()) {
          tickRace(game,networkTick);
          if(!game.finished&&game.impacts.length>4) game.impacts.splice(0,game.impacts.length-4);
        }
        collideNetworkCars(this);
        tickProps(this.local,networkTick);
        if(this.elapsed>=networkRaceLimit) this.end('Time limit');
        if([...this.drivers.values()].every(game=>game.finished)) this.done=true;
      }
    }
    this.sendIn-=duration;
    if(this.sendIn>0&&!this.done) return false;
    this.sendIn=.05;
    return true;
  }
  end(reason) {
    for(const game of this.drivers.values()) if(!game.finished) finishNetworkDriver(game,reason);
    this.done=true;
  }
  snapshot() {
    return {kind:'snapshot',id:this.id,countdown:this.countdown,elapsed:this.elapsed,done:!!this.done,
      cars:[...this.drivers.values()].map(networkCarState),
      props:this.props.map(p=>[p.type,Math.round(p.x*4)/4,Math.round(p.y*4)/4,Math.round(p.a*1000)/1000,p.level||0,p.routeIndex??null])};
  }
}
function networkResults(snapshot,settings,players) {
  const ranked=[...snapshot.cars].sort((a,b)=>{
    if(settings.event==='damage') return b.score-a.score||b.splits.length-a.splits.length||b.progress-a.progress;
    const aDone=a.result==='Finished',bDone=b.result==='Finished';
    return Number(bDone)-Number(aDone)||(aDone&&bDone?a.finishTime-b.finishTime:b.splits.length-a.splits.length||b.progress-a.progress);
  });
  return ranked.map((car,i)=>({...car,name:players.find(p=>p.id===car.id)?.name||'Driver',rank:i+1}));
}
