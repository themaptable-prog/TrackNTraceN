const driveOptions = {asphalt:1,curb:.93,dirt:.74,grass:.57,water:.55,oil:.69};
const gripOptions = {asphalt:1,curb:.83,dirt:.72,grass:.63,water:.59,oil:.27};
const hitVisuals = {impact:'#ffd586',dust:'#ead3a3',water:'#b9ece4',curb:'#f2ceab'};
let run = null;
const mainCtx = $('track').getContext('2d', {alpha:false});

function makeRun(config,ghost=null,recordedCourse=null) {
  const course=recordedCourse||prepare(config.course), spec=vehicles[config.type], color=spec.palette[config.color];
  const rearClearance=rigVisualLength(spec)-spec.length*.5+12;
  const origin=course.openYard ? {x:Math.max(203,yard.left+rearClearance),y:330,tx:1,ty:0} : course.samples[0];
  const car={x:origin.x,y:origin.y,a:Math.atan2(origin.ty,origin.tx),speed:0,index:course.practice?practiceRoute(course,origin.x,origin.y,0):0,surface:'asphalt',damage:zeroDamage()};
  const props=propSetup(course,config.hazards);
  const oil=props.filter(o=>o.type==='oil').map(o=>({...o,rx:propTypes.oil.r,ry:propTypes.oil.ry,level:o.level||0}));
  const game={
    config, course, spec, color, car, ghost, rules:{...tuning},props,oil,contacts:new Map(),scars:[],
    emitAt:0, rubAt:-10, squealAt:-10, streak:{x:car.x,y:car.y,time:0}, tune:chooseTune(config.music),
    cargo:spec.cargo||0,basePropCount:props.length,recoveryUntil:0,slipUntil:0,
    slideHeading:car.a,dropAfter:0,
    started:false, elapsed:0, paused:false, finished:false, orientation:null, inspect:false,
    route:[], fingers:[], pointer:null, tip:null, totalDistance:0, trail:[], moving:false,
    wallTime:-5, bumpTime:-5, materialTime:-5, emissionTime:-5, boost:1,
    hits:0, objectScore:0, chainScore:0, chainCount:0, lastChain:null, impacts:[], particles:[], frames:[], lastFrame:-10,
    nextGate:1, splits:[], progress:0, touchWall:false, curbTime:-5, workTime:performance.now()
  };
  car.surface=runSurface(game,car.x,car.y,car.index);
  return game;
}
function timedIntensity(game,car=game.car) {
  if(game.course.training) return false;
  if(game.course.arena&&game.elapsed>=game.course.arena*.82) return true;
  if(game.config.mode==='damage') return car.damage.filter(value=>sectionStage(value)>=2).length>=7;
  if(game.config.laps===1) return game.progress>=game.course.length*.5;
  return game.splits.length>=game.config.laps-1;
}
function footprint(spec,a,nx,ny) {
  const dx=Math.cos(a),dy=Math.sin(a);
  return Math.hypot((dx*nx+dy*ny)*spec.length*.43,(-dy*nx+dx*ny)*spec.width*.46);
}
function solveRoad(game,x,y,a,assist=true) {
  const car=game.car, course=game.course;
  let p=project(course,x,y,car.index), wall=null;
  const side=p.d>=0?1:-1, ni=side===1?1:0, n=course.samples.length;
  const prev=course.widths[mod(p.index,n)][ni].width, next=course.widths[mod(p.index+1,n)][ni].width;
  const width=mix(prev,next,p.t), nx=p.nx*side, ny=p.ny*side;
  let limit=width-footprint(game.spec,a,nx,ny);
  if(assist && game.config.type===3 && Math.abs(p.d)>limit-9 && Math.abs(Math.cos(a)*nx+Math.sin(a)*ny)<.46) {
    const assist=Math.min(2.15,(Math.abs(p.d)-(limit-9))*.31);
    x-=nx*assist; y-=ny*assist;
    p=project(course,x,y,car.index);
    limit=width-footprint(game.spec,a,nx,ny);
  }
  const over=Math.abs(p.d)-limit;
  if(over>0) {
    x-=nx*(over+.27);y-=ny*(over+.27);
    p=project(course,x,y,car.index);
  }
  if(over>-.85) wall={nx,ny,over,id:'road-'+side};
  return {x,y,index:p.index,s:p.s,wall};
}
function solveYard(game,x,y,a,body=game.spec) {
  const xr=footprint(body,a,1,0), yr=footprint(body,a,0,1);
  const dx=x-clamp(x,yard.left+xr,yard.right-xr),dy=y-clamp(y,yard.top+yr,yard.bottom-yr);
  const over=Math.hypot(dx,dy);
  let wall=null;
  if(over>0) {
    x-=dx;y-=dy;
    const id=Math.abs(dx)>Math.abs(dy)?'yard-x'+Math.sign(dx):'yard-y'+Math.sign(dy);
    wall={nx:dx/over,ny:dy/over,over,id};
  } else {
    const near=[[x-(yard.left+xr),-1,0,'yard-x-1'],[yard.right-xr-x,1,0,'yard-x1'],
      [y-(yard.top+yr),0,-1,'yard-y-1'],[yard.bottom-yr-y,0,1,'yard-y1']].find(edge=>edge[0]<.85);
    if(near) wall={nx:near[1],ny:near[2],over:-near[0],id:near[3]};
  }
  if(game.course.park&&!game.spec.hover) for(const [i,o] of obstacles.entries()) {
    const c=Math.cos(o.a),s=Math.sin(o.a),px=(x-o.x)*c+(y-o.y)*s,py=-(x-o.x)*s+(y-o.y)*c;
    const ox=footprint(body,a,c,s)+o.w/2-Math.abs(px),oy=footprint(body,a,-s,c)+o.h/2-Math.abs(py);
    if(ox<-.85||oy<-.85) continue;
    const chooseX=ox<oy, sign=Math.sign(chooseX?px:py)||1;
    const nx=(chooseX?-c:s)*sign,ny=(chooseX?-s:-c)*sign,depth=Math.min(ox,oy);
    if(depth>0) {x-=nx*(depth+.22);y-=ny*(depth+.22);}
    wall={nx,ny,over:depth,id:'obstacle-'+i};
  }
  return {x,y,index:0,s:0,wall};
}

function hitSection(a,nx,ny) {
  const local=deltaAngle(a,Math.atan2(ny,nx)), lx=Math.cos(local),ly=Math.sin(local);
  const angle=Math.atan2(ly/.68,lx);
  const sectors=[1,0,6,7,8,11,10,9,5,4,3,2];
  return sectors[mod(Math.round(angle/(TAU/12)),12)];
}
function isBladeHit(spec,a,nx,ny) {
  return !!spec.blade&&Math.cos(a)*nx+Math.sin(a)*ny>=.66;
}
function recoverFromHit(game) {
  if(game.spec.recovery) game.recoveryUntil=game.elapsed+.82;
}
function dropTimber(game,force,nx,ny) {
  if(!game.cargo||force<100||game.elapsed<game.dropAfter) return;
  const p=trailerPoses(game.spec,game.car)[0], cos=Math.cos(p.a), sin=Math.sin(p.a);
  const side=-Math.sign(-nx*sin+ny*cos)||1;
  const rear={x:p.x-cos*p.length*.43,y:p.y-sin*p.length*.43};
  for(const offset of [side*23,-side*23,side*15,-side*15,0]) {
    const x=rear.x-sin*offset, y=rear.y+cos*offset;
    const routeIndex=trailerRouteIndex(game,p,p.length*.5+game.spec.length*.5);
    const level=routeLevelAt(game.course,routeIndex);
    const prop=makeProp({type:'log',x,y,a:p.a+Math.sign(offset)*.42,level,routeIndex},'cargo-'+(game.networkId||'solo')+'-'+game.cargo);
    if(propBoundary(game,prop,x,y)||overlappingProp(game,prop,x,y)) continue;
    prop.graceUntil=game.elapsed+.42;
    prop.vx=cos*force*.18-sin*Math.sign(offset)*38;prop.vy=sin*force*.18+cos*Math.sign(offset)*38;
    prop.spin=Math.sign(offset)*1.8;
    game.props.push(prop);game.cargo--;game.dropAfter=game.elapsed+.42;
    return;
  }
}
function trailerRouteIndex(game,pose,distance) {
  const {course,car}=game;
  if(course.openYard) return course.practice?practiceRoute(course,pose.x,pose.y,car.index):0;
  const behind=Math.round(distance/course.step);
  return project(course,pose.x,pose.y,car.index-behind,Math.max(13,Math.ceil(behind*.65))).index;
}
function checkTrailerContacts(game,prior,velocity) {
  const car=game.car;
  steerTrailers(game.spec,car,prior);
  let distance=game.spec.length*.46;
  for(const [i,p] of trailerPoses(game.spec,car).entries()) {
    distance+=p.length*.5+3;
    const index=trailerRouteIndex(game,p,distance);
    distance+=p.length*.5;
    const delta=dist(p,prior[i]);
    if(delta<.06) continue;
    const dx=(p.x-prior[i].x)/delta,dy=(p.y-prior[i].y)/delta;
    touchProp(game,p.x,p.y,p.a,velocity,dx,dy,p,true,index);
    if(game.finished) return;
    let wall;
    if(game.course.openYard) wall=solveYard(game,p.x,p.y,p.a,p).wall;
    else {
      const course=game.course, q=project(course,p.x,p.y,index,4);
      const side=q.d>=0?1:-1,nx=q.nx*side,ny=q.ny*side;
      const over=Math.abs(q.d)+footprint(p,p.a,nx,ny)-course.widths[mod(q.index,course.samples.length)][side>0?0:1].width;
      if(over>1.1) wall={nx,ny,over,id:'road-'+side};
    }
    if(wall?.over>1.1) wallImpact(game,{...wall,id:'trailer-'+i+'-'+wall.id},velocity*.76,dx,dy,delta,p,index);
    if(game.finished) return;
  }
}
function spark(game,x,y,kind,strength,direction,burst=1) {
  const count=Math.round((kind==='impact'?8:5)*strength)+2+(burst>1?Math.round(burst*4):0);
  for(let i=0;i<count;i++) {
    const a=direction+(Math.random()-.5)*1.9,speed=(16+Math.random()*(kind==='impact'?87:49))*Math.sqrt(burst);
    game.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,t:0,
      end:(.18+Math.random()*.31)*Math.sqrt(burst),r:(1.1+Math.random()*(kind==='impact'?1.8:3.7))*burst,
      kind,index:game.car.index});
  }
}
function engineWear(game) {
  if(game.spec.hover||game.spec.style==='electric') return;
  const car=game.car, strength=Math.max(sectionStage(car.damage[1]),sectionStage(car.damage[12]));
  if(strength<2||game.elapsed<game.emitAt) return;
  const heavy=sectionStage(car.damage[1])===4&&sectionStage(car.damage[12])===4;
  const x=car.x+Math.cos(car.a)*8,y=car.y+Math.sin(car.a)*8;
  const add=(kind,r,end)=>game.particles.push({x:x+(Math.random()-.5)*5,y:y+(Math.random()-.5)*5,
    vx:-Math.cos(car.a)*(12+car.speed*.13)+(Math.random()-.5)*16,
    vy:-Math.sin(car.a)*(12+car.speed*.13)+(Math.random()-.5)*16,t:0,end,r,kind,index:car.index});
  add(heavy?'soot':'smoke',heavy?8:strength===2?2.9:4.8,heavy?1.33:.71);
  if(strength>=3) add('flame',strength===4?8.3:3.8,strength===4?.51:.36);
  game.emitAt=game.elapsed+(strength===2?.145:strength===3?.074:.048);
}
function damageScore(car) {
  return Math.round(car.damage.reduce((score,value) => score+(value>0 ? 18+sectionStage(value)*7+value*.11 : 0),0));
}
function damagePoints(game) {
  const [movement,chain,body]=game.car.score||[
    Math.round(game.objectScore),game.chainScore,
    Math.round(damageScore(game.car)*(game.course.damageEvent?.35:1))
  ];
  return {movement,chain,body,total:movement+chain+body};
}
function wallImpact(game,wall,velocity,naturalX,naturalY,moved,trailer=null,routeIndex=game.car.index) {
  const car=game.car,nx=wall.nx,ny=wall.ny;
  const inward=clamp((naturalX*nx+naturalY*ny)||0,0,1);
  if(wall.over>0&&!trailer) game.wallThisStep=wall;
  if(wall.over<=0||inward<.025) {
    const last=game.contacts.get(wall.id);
    if(last!=null&&game.elapsed-last<game.rules.rearm/1000) contactStart(game,wall);
    return;
  }
  const fresh=contactStart(game,wall);
  const shallow=game.config.type===2&&inward<.43;
  if(!fresh) {
    if(game.elapsed-game.rubAt>game.rules.rub/1000 && (velocity>38||moved>.5)) {
      raceEffect(game,'rub',clamp(.21+velocity/900,.24,.7));game.rubAt=game.elapsed;
    }
    return;
  }
  const blade=!trailer&&isBladeHit(game.spec,car.a,nx,ny);
  if(!blade) {game.hits++;recoverFromHit(game);}
  const force=clamp(velocity*inward,0,720);
  const base=4.1*damageFactor(game,'contact')+force*.074*damageFactor(game,'normal')+
    Math.min(wall.over,4)*.32*damageFactor(game,'overlap');
  const resistance=game.spec.resistance*(shallow?.32:1);
  const amount=base*resistance;
  const spreadLimit=3*(4.1+force*.074+Math.min(wall.over,4)*.32)*resistance;
  const spread=(factor,share)=>Math.min(amount*damageFactor(game,factor),spreadLimit)*share;
  const index=trailer?(nx*Math.cos(car.a+Math.PI/2)+ny*Math.sin(car.a+Math.PI/2)>0?11:9):hitSection(car.a,nx,ny);
  let added=0,crumpled=0;
  if(!blade&&damageMode(game.config)!=='off') {
    const add=(section,amount)=>{
      const before=car.damage[section];
      added+=applySectionDamage(car,section,amount);
      if(before<100&&car.damage[section]===100) crumpled++;
    };
    add(index,amount);
    if(force>205) {
      const neighbors=[[1,6],[0,2],[1,3],[2,4],[3,5],[4,9],[0,7],[6,8],[7,11],[5,10],[9,11],[10,8]];
      for(const neighbor of neighbors[index]) add(neighbor,spread('adjacent',.32));
    }
    if(force>315) add(12,spread('core',.41));
  }
  const strength=clamp(.19+force/540,.19,1.32);
  const burst=crumpled>=3?5:clamp(1+force/315+added/135,1,4.65);
  const body=trailer||car, r=footprint(trailer||game.spec,body.a,nx,ny)*.98;
  if(!shallow) {
    const loss=clamp(.09+inward*.54,.09,.63);
    car.speed*=1-loss;
    if(game.config.drag==='free') {
      game.boost=Math.min(game.boost,1-loss*.73);
      if(game.flick) game.flick.speed*=1-loss;
    }
  }
  if(force>245&&car.surface==='asphalt'&&!shallow) tyreCue(game,'brake',clamp(force/450,.32,.9));
  game.wallTime=game.elapsed;game.rubAt=game.elapsed;
  if(blade) {
    raceEffect(game,'impact',strength*.55);
    spark(game,car.x+nx*r,car.y+ny*r,'impact',strength*.65,car.a+Math.PI);
    return;
  }
  dropTimber(game,force,nx,ny);
  logHit(game,{t:Math.round(game.elapsed*1000),x:Math.round(body.x+nx*r),y:Math.round(body.y+ny*r),
    amount:Math.round(added*10)/10,strength,index:routeIndex,nx,ny,burst});
}
function raceEffect(game,name,strength=1) {
  if(!game.networkRemote) audio.effect(name,strength);
}
function tyreCue(game,name,strength=1) {
  if(game.spec.hover||game.spec.style==='electric'||game.elapsed-game.squealAt<game.rules.squeal/1000) return;
  raceEffect(game,name,strength);game.squealAt=game.elapsed;
}
function touchesCurb(game) {
  if(game.spec.hover) return false;
  const car=game.car;
  if(car.surface==='curb') return true;
  const lever=game.spec.width*.39, dx=-Math.sin(car.a)*lever,dy=Math.cos(car.a)*lever;
  return surfaceAt(game.course,car.x+dx,car.y+dy,car.index)==='curb' ||
    surfaceAt(game.course,car.x-dx,car.y-dy,car.index)==='curb';
}
function curbWear(game) {
  if(damageMode(game.config)==='off' || game.elapsed-game.curbTime<.40 || game.car.speed<game.spec.max*.78) return;
  game.curbTime=game.elapsed;
  const car=game.car;
  const p=game.course.openYard ? {d:car.y-practiceCurb.y,nx:0,ny:1} : project(game.course,car.x,car.y,car.index);
  const side=p.d>0?1:-1, affected=hitSection(car.a,p.nx*side,p.ny*side);
  if(isBladeHit(game.spec,car.a,p.nx*side,p.ny*side)) return;
  const amount=clamp(car.speed/game.spec.max-.68,0,.78)*7.5*game.spec.resistance*damageFactor(game,'curb');
  car.damage[affected]=Math.min(100,car.damage[affected]+amount);
  if(damageMode(game.config)==='total') checkDamageEnd(game);
}
function checkDamageEnd(game) {
  if(damageMode(game.config)!=='total') return;
  if(game.car.damage.filter(value=>value>=100).length>=3) {
    finish(game,'Vehicle totalled');
  }
}
function saveFrame(game,force=false) {
  if(!force&&game.elapsed-game.lastFrame<.088) return;
  const car=game.car,t=Math.round(game.elapsed*1000);
  const objects=game.props.map(o=>[Math.round(o.x*2),Math.round(o.y*2),Math.round(o.a*1000),o.level||0,o.routeIndex??null]);
  const frame=[t,Math.round(car.x*2),Math.round(car.y*2),Math.round(mod(car.a,TAU)*1000),car.index,packDamage(car.damage),objects];
  if(game.config.mode==='damage') {
    const {movement,chain,body}=damagePoints(game);
    frame.push([movement,chain,body]);
  }
  if(car.trailerAngles?.length) frame[8]=car.trailerAngles.map(a=>Math.round(mod(a,TAU)*1000));
  if(game.frames.at(-1)?.[0]===t) game.frames[game.frames.length-1]=frame;
  else game.frames.push(frame);
  game.lastFrame=game.elapsed;
}
function addTrail(game,force=false) {
  const car=game.car, last=game.trail.at(-1);
  if(!force && last && game.totalDistance-last.distance<4.7) return;
  const mark={x:car.x,y:car.y,a:car.a,surface:car.surface,distance:game.totalDistance,index:car.index};
  if(!last || dist(mark,last)>.5) game.trail.push(mark);
  const length=game.course.openYard?1650:game.course.length*.92;
  let trim=0;
  while(game.trail[trim] && game.totalDistance-game.trail[trim].distance>length+9) trim++;
  if(trim) game.trail.splice(0,trim);
}
function checkLaps(game,s) {
  if(game.course.openYard||game.finished) return;
  game.progress=s;
  const course=game.course, gateCount=12;
  while(s+1e-6>=game.nextGate*course.length/gateCount) {
    if(game.nextGate%gateCount===0) {
      const last=game.splits.reduce((a,b)=>a+b,0);
      game.splits.push(game.elapsed-last);
      if(!game.networkRemote) updateHud();
      if(game.splits.length>=game.config.laps) {finish(game,'Finished');return;}
    }
    game.nextGate++;
  }
}
function sweep(game,x,y,angle,velocity) {
  const car=game.car, ax=car.x,ay=car.y,d=Math.hypot(x-ax,y-ay);
  if(d<.001) return 0;
  const dx=(x-ax)/d,dy=(y-ay)/d, count=Math.ceil(d/4.15);
  let total=0, previous=car.surface;
  for(let i=0;i<count&&!game.finished;i++) {
    const step=d/count;
    let steeredX=dx,steeredY=dy;
    const recovery=game.avoid;
    if(recovery&&game.elapsed<recovery.until) {
      const into=dx*recovery.nx+dy*recovery.ny;
      if(into>.05) {
        const nearby=game.course.openYard?solveYard(game,car.x,car.y,angle):solveRoad(game,car.x,car.y,angle,false);
        if(nearby.wall?.id===recovery.id) {
          steeredX=dx-recovery.nx*into*.88+recovery.tx*.23;
          steeredY=dy-recovery.ny*into*.88+recovery.ty*.23;
        }
      }
    }
    if((car.surface==='oil'&&velocity>36)||game.elapsed<game.slipUntil) {
      const desired=Math.atan2(steeredY,steeredX);
      const response=clamp(step*(car.surface==='oil'?.022:.045),0,1);
      game.slideHeading+=deltaAngle(game.slideHeading,desired)*response;
      steeredX=Math.cos(game.slideHeading);steeredY=Math.sin(game.slideHeading);
    } else game.slideHeading=Math.atan2(steeredY,steeredX);
    const qx=car.x+steeredX*step,qy=car.y+steeredY*step;
    const prior=game.spec.trailers?trailerPoses(game.spec,car):null;
    const prop=touchProp(game,qx,qy,angle,velocity,steeredX,steeredY);
    if(game.finished) break;
    const q=game.course.openYard ? solveYard(game,prop.x,prop.y,angle) : solveRoad(game,prop.x,prop.y,angle);
    const moved=Math.hypot(q.x-car.x,q.y-car.y);
    car.x=q.x;car.y=q.y;car.index=game.course.practice?practiceRoute(game.course,q.x,q.y,car.index):q.index;car.a=angle;
    total+=moved;game.totalDistance+=moved;
    car.surface=runSurface(game,car.x,car.y,car.index);
    if(car.surface==='oil'&&velocity>36) game.slipUntil=game.elapsed+.43;
    if(prior) checkTrailerContacts(game,prior,velocity);
    if(game.finished) break;
    if(q.wall) wallImpact(game,q.wall,velocity,steeredX,steeredY,moved);
    if(game.finished) break;
    if(velocity>50 && touchesCurb(game)) {
      if(game.elapsed-game.bumpTime>.165) {
        raceEffect(game,'curb',clamp(velocity/300,.42,1.15));game.bumpTime=game.elapsed;
        spark(game,car.x,car.y,'curb',.48,car.a+Math.PI);
      }
      curbWear(game);
    }
    if(game.spec.style!=='electric'&&car.surface==='water' && previous!=='water' && velocity>48 && game.elapsed-game.materialTime>.24) {
      spark(game,car.x,car.y,'water',1.1,car.a+Math.PI);
      raceEffect(game,'water');game.materialTime=game.elapsed;
    }
    previous=car.surface;
    if(moved>.04) {
      addTrail(game);
      if(!game.finished) checkLaps(game,q.s);
    }
  }
  return total;
}
function appendSegment(game,last,p) {
  const length=dist(p,last);
  if(length<1) return;
  const count=Math.ceil(length/8);
  const arc=game.routeArc||0;
  for(let k=1;k<=count;k++) game.route.push({x:mix(last.x,p.x,k/count),y:mix(last.y,p.y,k/count),arc:arc+length*k/count});
  game.routeArc=arc+length;game.flowDirty=true;
}
function entryCurve(car,target) {
  const length=dist(car,target), lead=Math.min(62,length*.45);
  const anchor={x:car.x+Math.cos(car.a)*lead,y:car.y+Math.sin(car.a)*lead};
  if(length<11) return [target];
  const curve=[];
  for(let i=1;i<=6;i++) {
    const t=i/6,u=1-t;
    curve.push({x:car.x*u*u+2*anchor.x*u*t+target.x*t*t,
      y:car.y*u*u+2*anchor.y*u*t+target.y*t*t});
  }
  return curve;
}
function appendRoute(game,p,settle=false) {
  const last=game.route.at(-1)||game.car;
  if(dist(p,last)<(settle?2:4.5)) return;
  if(game.newStroke) {
    game.newStroke=false;
    let previous=last;
    for(const point of entryCurve(game.car,p)) {appendSegment(game,previous,point);previous=point;}
    return;
  }
  const smoothed=settle?p:{x:mix(last.x,p.x,.79),y:mix(last.y,p.y,.79)};
  appendSegment(game,last,smoothed);
}
function shiftRoute(game) {
  const car=game.car, path=game.route;
  let count=0;
  while(count<path.length) {
    const p=path[count], next=path[count+1], distance=dist(p,car);
    const passed=next && distance<11 && (car.x-p.x)*(next.x-p.x)+(car.y-p.y)*(next.y-p.y)>0;
    if(distance>(next?6.1:3.3) && !passed) break;
    count++;
  }
  if(count) path.splice(0,count);
}
function traceMove(game,dt) {
  const car=game.car, spec=game.spec;
  const {max,accel}=driveRatings(game);
  shiftRoute(game);
  if(!game.route.length) {
    if(car.speed>115&&game.moving&&car.surface==='asphalt') tyreCue(game,'brake',clamp(car.speed/380,.38,1.1));
    car.speed=Math.max(0,car.speed-dt*accel*4.1);
    return 0;
  }
  let target=game.route[0], length=dist(target,car);
  const lookahead=8+car.speed*.034;
  for(let i=1;i<game.route.length&&length<lookahead;i++) {
    const next=game.route[i], gap=dist(next,target);
    if(length+gap>lookahead) {
      const t=(lookahead-length)/gap;
      target={x:mix(target.x,next.x,t),y:mix(target.y,next.y,t)};
      break;
    }
    length+=gap;target=next;
  }
  const heading=Math.atan2(target.y-car.y,target.x-car.x), turn=deltaAngle(car.a,heading);
  const grip=steeringGrip(game), ratio=clamp(car.speed/max,0,1);
  const a=car.a+clamp(turn,-spec.turn*grip*(1.35-ratio*.57)*dt,spec.turn*grip*(1.35-ratio*.57)*dt);
  const curveFactor=clamp(1-Math.abs(turn)*.57,.17,1);
  let top=max*driveOptions[car.surface]*curveFactor;
  for(let i=0;i+8<Math.min(game.route.length,21);i+=3) {
    const a=game.route[i], b=game.route[i+4], c=game.route[i+8];
    const turnAhead=Math.abs(deltaAngle(Math.atan2(b.y-a.y,b.x-a.x),Math.atan2(c.y-b.y,c.x-b.x)));
    if(turnAhead<.16) continue;
    const radius=(dist(a,b)+dist(b,c))/(2*turnAhead);
    const atCorner=clamp(radius*spec.turn*grip*.69,93,top);
    const brakingDistance=Math.max(0,dist(car,b)-33);
    top=Math.min(top,Math.hypot(atCorner,Math.sqrt(2*accel*1.4*brakingDistance)));
  }
  const last=game.route.at(-1);
  if(game.route.length<8) {
    const remaining=dist(car,last);
    top=Math.min(top,Math.sqrt(2*accel*4.4*remaining)+11);
  }
  if(car.speed<top) car.speed=Math.min(top,car.speed+accel*driveOptions[car.surface]*recoveryRate(game)*dt);
  else car.speed=Math.max(top,car.speed-dt*accel*(spec.resistance<.6?1.3:2.35));
  const gap=Math.min(dist(car,target),car.speed*dt);
  if(Math.abs(turn)>1.3 && ratio<.33) {
    const prior=spec.trailers?trailerPoses(spec,car):null;
    car.a=a;
    if(prior) steerTrailers(spec,car,prior);
    return 0;
  }
  return sweep(game,car.x+Math.cos(a)*gap,car.y+Math.sin(a)*gap,a,car.speed);
}
function driveRatings(game) {
  const {spec,cargo}=game, unloaded=spec.cargo?spec.cargo-cargo:0;
  return {max:spec.max+unloaded*8,accel:spec.accel+unloaded*13};
}
function recoveryRate(game) {
  return game.elapsed<game.recoveryUntil?game.spec.recovery:1;
}
function steeringGrip(game) {
  return game.elapsed<game.slipUntil?Math.min(gripOptions[game.car.surface],.56):gripOptions[game.car.surface];
}
function moveFreeFleet(game,target,dt) {
  const car=game.car, spec=game.spec, {max,accel}=driveRatings(game);
  const distance=dist(target,car);
  if(distance<.65) {car.speed=0;return 0;}
  const heading=Math.atan2(target.y-car.y,target.x-car.x), turn=deltaAngle(car.a,heading);
  const cap=spec.turn*steeringGrip(game)*dt*(car.speed<40?1.65:1);
  const oldPose=spec.trailers?trailerPoses(spec,car):null;
  car.a+=clamp(turn,-cap,cap);
  if(Math.abs(turn)>1.25&&car.speed<30) {
    if(oldPose) steerTrailers(spec,car,oldPose);
    return 0;
  }
  const top=Math.min(max*driveOptions[car.surface]*game.boost*clamp(1-Math.abs(turn)*.52,.15,1),
    Math.sqrt(2*accel*4*distance));
  const change=accel*dt;
  car.speed+=clamp(top-car.speed,-change*3.1,change*recoveryRate(game));
  const step=Math.min(distance,car.speed*dt);
  return sweep(game,car.x+Math.cos(car.a)*step,car.y+Math.sin(car.a)*step,car.a,car.speed);
}
function freeMove(game,dt) {
  const car=game.car, targets=game.fingers.splice(0);
  if(game.pointer==null&&!targets.length) {
    if(game.releasePending) {game.flick=game.releasePending;game.releasePending=null;}
    if(!game.flick) {car.speed=0;return 0;}
    const {speed,a}=game.flick;
    const moved=sweep(game,car.x+Math.cos(a)*speed*dt,car.y+Math.sin(a)*speed*dt,a,speed);
    game.flick.speed*=Math.exp(-(car.surface==='asphalt'?.82:1.77)*dt);
    car.speed=game.flick.speed;
    if(car.speed<18 || (game.wallThisStep&&moved<speed*dt*.18)) {game.flick=null;car.speed=0;}
    return moved;
  }
  game.boost=Math.min(1,game.boost+dt*4.5*recoveryRate(game));
  if(game.spec.style&&(targets.length||game.tip)) return moveFreeFleet(game,targets.at(-1)||game.tip,dt);
  if(!targets.length&&game.tip) targets.push(game.tip);
  const length=targets.reduce((sum,p,i)=>sum+dist(p,targets[i-1]||car),0);
  const estimated=Math.min(780,length/Math.max(dt,.009));
  car.speed=estimated;
  let moved=0;
  for(const target of targets) {
    const gap=dist(target,car);
    if(gap<.65) continue;
    const flow=driveOptions[car.surface], factor=game.boost*(flow===1?1:mix(flow,1,.23));
    const end={x:mix(car.x,target.x,factor),y:mix(car.y,target.y,factor)};
    const points=game.newStroke&&gap>5?entryCurve(car,end):[end];
    if(gap>5) game.newStroke=false;
    for(const point of points) {
      const a=Math.atan2(point.y-car.y,point.x-car.x);
      moved+=sweep(game,point.x,point.y,a,estimated);
      if(game.finished) break;
    }
    if(game.finished) break;
  }
  car.speed=moved>1?Math.min(780,moved/Math.max(dt,.012)):0;
  return moved;
}
function updateEffects(game,dt) {
  for(const p of game.particles) {p.x+=p.vx*dt;p.y+=p.vy*dt;p.t+=dt;}
  game.particles=game.particles.filter(p=>p.t<p.end);
}
function avoidPinnedWall(game,wall) {
  const car=game.car, route=game.route;
  const tx=-wall.ny,ty=wall.nx;
  let target=route[Math.min(12,route.length-1)]||game.tip;
  if(route.length>3) {
    const limit=Math.min(route.length-2,26);
    let skip=0;
    for(let i=0;i<limit;i++) {
      const p=route[i], candidate=game.course.openYard?solveYard(game,p.x,p.y,car.a):solveRoad(game,p.x,p.y,car.a,false);
      if(candidate.wall?.id!==wall.id||candidate.wall.over<0) break;
      skip++;
    }
    if(skip) {route.splice(0,skip);target=route[Math.min(8,route.length-1)]||target;}
  }
  const sample=game.course.samples?.[mod(car.index,game.course.samples.length)];
  const along=target?(target.x-car.x)*tx+(target.y-car.y)*ty:0;
  const direction=Math.abs(along)>7?Math.sign(along):Math.sign((sample?.tx??1)*tx+(sample?.ty??0)*ty)||1;
  const duration=game.rules.avoid/1000/(game.spec.recovery?1.4:1);
  game.avoid={nx:wall.nx,ny:wall.ny,tx:tx*direction,ty:ty*direction,id:wall.id,
    kickEnd:game.elapsed+Math.min(.135,duration*.35),until:game.elapsed+duration};
}
function tickRace(game,dt) {
  if(!game.started||game.finished||game.paused) return;
  if(game.course.arena) dt=Math.min(dt,game.course.arena-game.elapsed);
  if(dt<=0) {if(game.course.arena) finish(game,'Finished');return;}
  game.elapsed+=dt;
  const car=game.car, before=car.surface;
  game.wallThisStep=null;
  const escape=game.avoid;
  let moved;
  if(escape&&game.elapsed<escape.kickEnd&&(game.route.length||game.pointer!=null)) {
    const dx=-escape.nx*.74+escape.tx*.64,dy=-escape.ny*.74+escape.ty*.64;
    car.speed=Math.max(car.speed,Math.min(game.spec.max,game.spec.recovery?167:115));
    moved=sweep(game,car.x+dx*car.speed*dt,car.y+dy*car.speed*dt,Math.atan2(dy,dx),car.speed);
  } else moved=game.config.drag==='trace'?traceMove(game,dt):freeMove(game,dt);
  if(game.finished) return;
  const proximity=game.course.openYard?solveYard(game,car.x,car.y,car.a):solveRoad(game,car.x,car.y,car.a,false);
  if(proximity.wall&&game.elapsed-(game.contacts.get(proximity.wall.id)??-10)<game.rules.rearm/1000) contactStart(game,proximity.wall);
  const speed=moved/Math.max(dt,.001);
  const previous=game.soundSpeed||0;
  game.soundSpeed=mix(previous,Math.min(560,speed),clamp(dt*11,0,1));
  if(!game.moving&&game.soundSpeed>74) {
    if(before==='asphalt'&&car.surface==='asphalt') tyreCue(game,'launch',.72);
    game.moving=true;
  } else if(game.moving&&game.soundSpeed<20) {
    if(game.rollingPeak>130&&before==='asphalt'&&car.surface==='asphalt') tyreCue(game,'brake',.62);
    game.rollingPeak=0;game.moving=false;
  }
  game.rollingPeak=Math.max(game.rollingPeak||0,game.soundSpeed);
  const wall=game.wallThisStep;
  if(wall) {
    const shallow=game.config.type===2&&Math.abs(Math.cos(car.a)*wall.nx+Math.sin(car.a)*wall.ny)<.43;
    const drag=Math.exp(-(shallow?.85:3.6)*dt);
    car.speed*=drag;game.boost=Math.max(.54,game.boost*(shallow?.99:.96));
    if(game.flick) game.flick.speed*=drag;
    game.pinned=(moved<Math.max(.65,dt*60))?(game.pinned||0)+dt:0;
    if(game.pinned>=game.rules.pinned/1000/(game.spec.recovery||1)&&(!game.avoid||game.elapsed>=game.avoid.until)) {
      avoidPinnedWall(game,wall);
    }
  } else game.pinned=0;
  if(game.config.drag==='trace'&&game.route.length) {
    if(dist(game.streak,car)>7) game.streak={x:car.x,y:car.y,time:game.elapsed};
    if(game.elapsed-game.streak.time>=game.rules.stall/1000*(game.spec.recovery?1.65:1)) {
      game.route=[];car.speed=0;game.stalled=true;game.tip=null;
    }
  } else game.streak={x:car.x,y:car.y,time:game.elapsed};
  if(speed>46&&game.elapsed-game.materialTime>.23&&['grass','dirt','water'].includes(car.surface)) {
    spark(game,car.x,car.y,car.surface==='water'?'water':'dust',.57,car.a+Math.PI);
    if(car.surface!=='water'&&game.spec.style!=='electric') raceEffect(game,'rough');
    game.materialTime=game.elapsed;
  }
  if(!game.network) tickProps(game,dt);
  engineWear(game);updateEffects(game,dt);
  if(game.course.arena&&game.elapsed>=game.course.arena) finish(game,'Finished');
  else if(!game.network&&!game.course.training) saveFrame(game);
}
function poseAt(record,ms) {
  const frames=record.frames;
  let lo=0,hi=frames.length-1;
  while(lo<hi) {
    const mid=Math.ceil((lo+hi)/2);
    if(frames[mid][0]<=ms) lo=mid; else hi=mid-1;
  }
  const a=frames[lo], b=frames[lo+1]||a, t=b[0]===a[0]?0:clamp((ms-a[0])/(b[0]-a[0]),0,1);
  return {x:mix(a[1],b[1],t)/2,y:mix(a[2],b[2],t)/2,a:a[3]/1000+deltaAngle(a[3]/1000,b[3]/1000)*t,
    speed:b===a?0:Math.hypot(a[1]-b[1],a[2]-b[2])*500/(b[0]-a[0]),
    index:t<.5?a[4]:b[4],damage:unpackDamage(a[5]),score:a[7],props:a[6]?.map((p,i)=>{
      const next=b[6]?.[i]||p;
      return {x:mix(p[0],next[0],t)/2,y:mix(p[1],next[1],t)/2,a:mix(p[2],next[2],t)/1000,
        level:p[3],routeIndex:p[4]??undefined};
    }),trailerAngles:a[8]?.map((angle,i)=>angle/1000+deltaAngle(angle/1000,(b[8]?.[i]??angle)/1000)*t)};
}
function rebuildReplayTrail(game,time) {
  game.trail=[];game.totalDistance=0;game.particles=[];
  const frames=game.replay.frames;
  const goal=time*1000, length=game.course.openYard?1650:game.course.length*.92;
  let i=frames.findIndex(p=>p[0]>=goal);
  if(i<0) i=frames.length-1;
  let lengthBack=0,start=i;
  while(start>0&&lengthBack<length) {
    const a=frames[start],b=frames[start-1];
    lengthBack+=Math.hypot(a[1]-b[1],a[2]-b[2])/2;
    start--;
  }
  let previous;
  for(let k=start;k<=i;k++) {
    const pose=poseAt(game.replay,Math.min(goal,frames[k][0]));
    pose.surface=runSurface(game,pose.x,pose.y,pose.index);
    game.car=pose;
    if(previous) game.totalDistance+=dist(pose,previous);
    addTrail(game,true);previous=pose;
  }
  game.emitAt=time;
  game.car=poseAt(game.replay,goal);
  game.car.surface=runSurface(game,game.car.x,game.car.y,game.car.index);
}
function tickReplay(game,dt) {
  if(game.paused || !game.replayPlaying || game.finished) return;
  const record=game.replay, previous=game.car, oldMs=game.elapsed*1000;
  game.elapsed=Math.min(game.replayHigh,game.elapsed+dt);
  game.car=poseAt(record,game.elapsed*1000);
  game.car.surface=runSurface(game,game.car.x,game.car.y,game.car.index);
  game.splits=record.splits.filter((_,i)=>record.splits.slice(0,i+1).reduce((a,b)=>a+b,0)<=game.elapsed+.001);
  if(!game.course.openYard) game.progress=game.car.index*game.course.step-game.splits.length*game.course.length;
  game.totalDistance+=dist(previous,game.car);
  addTrail(game);
  for(const hit of record.impacts) {
    if(hit.t>oldMs && hit.t<=game.elapsed*1000) {
      spark(game,hit.x,hit.y,'impact',hit.strength,Math.atan2(-hit.ny,-hit.nx),hit.burst||1);
      raceEffect(game,hit.prop?'prop':'impact',hit.strength);
    }
  }
  if(game.spec.style!=='electric'&&game.car.surface!==previous.surface) {
    if(game.car.surface==='water') raceEffect(game,'water');
    if(game.car.surface==='curb') raceEffect(game,'curb',.61);
  }
  engineWear(game);updateEffects(game,dt);
  if(game.elapsed>=game.replayHigh) {game.replayPlaying=false;renderControls();}
}
function paintTrail(ctx,game,accept=null) {
  const priorAlpha=ctx.globalAlpha;
  const points=game.trail, length=game.course.openYard?1650:game.course.length*.92;
  if(points.length<2) return;
  if(game.spec.hover) {
    for(const [i,p] of points.entries()) {
      const age=(game.totalDistance-p.distance)/505;
      if(age>1||(accept&&!accept(p.index))||i%2!==0) continue;
      const drift=Math.sin(p.distance*.77)*11;
      const x=p.x-Math.sin(p.a)*drift,y=p.y+Math.cos(p.a)*drift;
      const size=1.24+(1-age)*.95, phase=Math.floor(p.distance*.119)%3;
      ctx.globalAlpha=priorAlpha*(1-age)*(.53+.38*Math.cos(p.distance*1.9-game.elapsed*11)**2);
      polygon(ctx,[[x-size*1.9,y],[x,y-size*1.65],[x+size*1.9,y],[x,y+size*1.65]],
        ['#ffe089','#ffc8ed','#c6f3f2'][phase]);
      oval(ctx,x+2.5,y-3,1,1,'#fff6d1');
    }
    ctx.globalAlpha=priorAlpha;
    return;
  }
  const width=game.config.type===3?2.1:2.65;
  const gap=game.config.type===3?0:game.spec.width*.34;
  ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=width;
  for(let bucket=0;bucket<10;bucket++) {
    const lo=bucket*.1,hi=lo+.1000001;
    for(const rough of [false,true]) {
      ctx.beginPath();
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i],age=(game.totalDistance-b.distance)/length;
        if(age<lo||age>=hi||(accept&&!accept(b.index))||dist(a,b)>25||b.surface==='water'||b.surface==='curb'
          ||(b.surface!=='asphalt')!==rough) continue;
        for(const amount of gap?[-gap,gap]:[0]) {
          ctx.moveTo(a.x-Math.sin(a.a)*amount,a.y+Math.cos(a.a)*amount);
          ctx.lineTo(b.x-Math.sin(b.a)*amount,b.y+Math.cos(b.a)*amount);
        }
      }
      ctx.strokeStyle=rough ? '#ae8b67' : '#354541';
      ctx.globalAlpha=priorAlpha*(rough?.28:.68)*(1-lo)**1.15;
      ctx.stroke();
    }
  }
  ctx.globalAlpha=priorAlpha;
}
function setPathFlow(path) {
  let start=1, span=0, heading=null;
  const set=(end)=>{
    const flow=19+32*clamp(span/180,0,1);
    for(let k=start;k<end;k++) path[k].flow=flow;
  };
  for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],next=Math.atan2(b.y-a.y,b.x-a.x);
    if(heading==null) heading=next;
    if(Math.abs(deltaAngle(heading,next))>.245) {set(i);start=i;span=0;heading=next;}
    span+=dist(a,b);
  }
  set(path.length);
}
function paintPath(ctx,game) {
  const path=game.config.drag==='trace'?game.route:[];
  if(game.replay||(!path.length&&game.pointer==null&&!game.frozenTip)) return;
  if(path.length) {
    if(game.flowDirty) {setPathFlow(path);game.flowDirty=false;}
    ctx.lineWidth=2.05;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(game.car.x,game.car.y);
    for(const p of path) ctx.lineTo(p.x,p.y);
    ctx.strokeStyle='#f5e6ab80';ctx.stroke();
    const period=21, directionTime=game.paused||game.finished?(game.pausePulse??performance.now()):performance.now();
    for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i],length=dist(a,b),end=b.arc??length;
      if(length<.01) continue;
      const phase=directionTime/1000*(b.flow||20);
      const offsetFrom=mod(phase-(end-length),period);
      for(let d=offsetFrom;d<length;d+=period) {
        const x=mix(a.x,b.x,d/length),y=mix(a.y,b.y,d/length);
        oval(ctx,x,y,1.87,1.87,'#ffedb6cc');
      }
    }
  }
  const tip=path.at(-1)||(game.pointer!=null&&game.tip)||game.frozenTip;
  if(tip&&!game.stalled) oval(ctx,tip.x,tip.y,3.3,3.3,'#ffedb8');
}
function visibleCargo(game) {
  return game.replay?Math.max(0,(game.spec.cargo||0)-Math.max(0,(game.car.props?.length||0)-game.basePropCount)):game.cargo;
}
function visibleProps(game) {
  if(!game.replay) return game.props;
  const poses=game.car.props||[];
  return game.props.map((p,i)=>{
    const pose=poses[i];
    if(!pose) return p;
    return {...p,...pose,level:pose.level??p.level,routeIndex:pose.routeIndex??p.routeIndex};
  }).concat(poses.slice(game.basePropCount).map(p=>({...p,type:'log'})));
}
function drawScene(game) {
  const ctx=mainCtx, props=visibleProps(game);
  ctx.setTransform($('track').width/W,0,0,$('track').height/H,0,0);
  ctx.drawImage(game.course.map,0,0,W,H);
  if(game.course.elevationData) {
    const course=game.course, sectionByLayer=new Map();
    for(const prop of props) {
      const level=prop.level||0,n=course.samples.length;
      let best=prop.routeIndex??-1,distance=Infinity;
      if(best<0||(game.replay&&game.car.props?.[0]?.routeIndex==null)) for(let i=0;i<n;i++) {
        if(routeLevelAt(course,i)!==level) continue;
        const gap=(prop.x-course.samples[i].x)**2+(prop.y-course.samples[i].y)**2;
        if(gap<distance) {distance=gap;best=i;}
      }
      const layer=best<0?null:elevationSectionAt(course,best)??null;
      if(!sectionByLayer.has(layer)) sectionByLayer.set(layer,[]);
      sectionByLayer.get(layer).push({prop,index:best});
    }
    const drawObjects=(layer,filter=()=>true)=>{
      for(const {prop,index} of sectionByLayer.get(layer)||[]) if(filter(index)) drawProp(ctx,prop);
    };
    paintTrail(ctx,game,index=>heightAt(course,index)===0);drawScars(ctx,game);drawObjects(null);
    const revealed=drawDecks(ctx,course,game.car,section=>{
      const owns=index=>elevationSectionAt(course,index)===section;
      paintTrail(ctx,game,owns);
      drawScars(ctx,game,undefined,owns);drawObjects(section);
    });
    if(revealed?.size) {
      const visible=index=>revealed.has(mod(index,course.samples.length));
      paintTrail(ctx,game,visible);drawScars(ctx,game,undefined,visible);
      for(const section of course.elevationData.sections) if(section.negative) drawObjects(section,visible);
    }
  } else {
    paintTrail(ctx,game);drawScars(ctx,game);
    const objects=level=>props.forEach(prop=>{
      if((prop.level||0)===level) drawProp(ctx,prop);
    });
    objects(0);
    const levels=new Set();
    drawDecks(ctx,game.course,game.car,d=>{
      if(d.level&&!levels.has(d.level)) {levels.add(d.level);drawScars(ctx,game,d.level);objects(d.level);}
    });
    for(const level of [1,2]) if(!levels.has(level)) objects(level);
  }
  paintPath(ctx,game);
  if(game.ghost&&game.elapsed<=game.ghost.duration+.28) {
    const p=poseAt(game.ghost,game.elapsed*1000),cfg=game.ghost.config;
    ctx.globalAlpha=.42;
    drawVehicle(ctx,p.x,p.y,p.a,cfg.type,hex(vehicles[cfg.type].palette[cfg.color],.40),p.damage,{ghost:true,time:game.elapsed,trailerAngles:p.trailerAngles,
      cargo:cfg.type===game.config.type&&game.spec.cargo?Math.max(0,game.spec.cargo-((p.props?.length??game.basePropCount)-game.basePropCount)):undefined});
    ctx.globalAlpha=1;
  }
  const car=game.car;
  for(const p of game.particles) {
    const age=p.t/p.end, smoky=p.kind==='smoke'||p.kind==='soot';
    ctx.globalAlpha=clamp(1-age,0,1)*(smoky?.58:1);
    const radius=p.r*(smoky?1+age*.71:1);
    const color=hitVisuals[p.kind]||{smoke:'#b7b4a5',soot:'#34413e',flame:'#f1834f'}[p.kind];
    oval(ctx,p.x,p.y,radius,radius*.74,color);
    if(p.kind==='flame') oval(ctx,p.x+1,p.y,radius*.57,radius*.49,'#ffd681');
  }
  ctx.globalAlpha=1;
  if(!game.started&&!game.replay) {
    const r=28+Math.sin((game.pausePulse??performance.now())/244)*2.2;
    ctx.beginPath();ctx.arc(car.x,car.y,r,0,TAU);ctx.lineWidth=1.8;
    ctx.strokeStyle='#fff3bf94';ctx.stroke();
  }
  if(game.network) drawNetworkOpponents(ctx,game);
  drawVehicle(ctx,car.x,car.y,car.a,game.config.type,game.color,car.damage,{
    lights:car.speed<26&&game.started,time:game.started?game.elapsed:performance.now()/1000,trailerAngles:car.trailerAngles,cargo:visibleCargo(game)
  });
  if(game.network) drawNetworkLabel(ctx,game,car,game.networkId);
}
