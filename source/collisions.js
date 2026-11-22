function propSetup(course,hazards) {
  return [...(course.props||[]),...(hazards?course.hazards||[]:[])].map((o,i)=>makeProp(o,'prop-'+i));
}
function makeProp(object,id) {
  return {...object,id,vx:0,vy:0,spin:0,bounces:0,shot:null};
}
function runSurface(game,x,y,index) {
  if(game.spec.hover) return 'asphalt';
  if(game.oil.length) {
    const level=routeLevelAt(game.course,index);
    if(game.oil.some(o=>o.level===level&&onPatch(x,y,o))) return 'oil';
  }
  return surfaceAt(game.course,x,y,index);
}
function drawProp(ctx,prop) {
  const {x,y,a,type}=prop;
  ctx.save();ctx.translate(x,y);ctx.rotate(a||0);
  if(type==='oil') {
    oval(ctx,3,1,15,9,'#34383eaa');
    oval(ctx,-3,1,14,8,'#282e37');
    oval(ctx,3,-2,12,8,'#333242');
    oval(ctx,9,2,8,6,'#333242');
    ctx.lineCap='round';
    for(const [x,y,stroke] of [[-9,-2,'#9b72a9'],[-3,1,'#678caa'],[3,-4,'#9bb08b']]) {
      ctx.beginPath();ctx.moveTo(x-3,y+1);ctx.quadraticCurveTo(x,y-2,x+5,y);
      ctx.lineWidth=1.35;ctx.strokeStyle=stroke;ctx.stroke();
    }
    oval(ctx,16,-5,2.7,1.5,'#3e394a');
  } else if(type==='log') {
    rounded(ctx,-10,-2,22,8,3,'#3b4a416e');drawTimber(ctx,22,8.6);
  } else if(type==='tyres'||type==='wheel') {
    oval(ctx,3,4,14,11,'#35433c6b');
    oval(ctx,0,2,13,10,'#42534f');
    oval(ctx,0,0,12.2,10,'#5a6a62');
    oval(ctx,0,-2,10.7,8.9,'#394f4b');
    oval(ctx,0,-2,5.5,4.7,type==='wheel'?'#c2cbb6':'#819788');
    if(type==='wheel') {
      for(let i=0;i<5;i++) oval(ctx,Math.cos(i*TAU/5)*3,-2+Math.sin(i*TAU/5)*2.8,.95,.78,'#61726c');
      oval(ctx,0,-2,1.1,1.1,'#eddb9c');
    }
    oval(ctx,-2,-7,5,1.25,'#7d9384');
  } else if(type==='cone') {
    rounded(ctx,-8,-7,17,15,3,'#3b514c7a');
    rounded(ctx,-9,-8,17,15,3,'#ba704a');
    oval(ctx,0,0,6.2,5.7,'#ed8354');oval(ctx,-.6,-1,4.3,3.9,'#fae0af');
    oval(ctx,-1,-2,2.8,2.6,'#ed8354');
  } else if(type==='drum') {
    oval(ctx,3,4,15,13,'#3b514c78');
    oval(ctx,0,2,13.5,12,'#b87242');
    oval(ctx,0,-1,13,11,'#edab54');
    oval(ctx,0,-1,10,8.1,'#f1d4a0');
    oval(ctx,0,-1,7.6,5.8,'#e69b46');oval(ctx,3,-2,2,1.5,'#a77049');
  } else if(type==='crate') {
    rounded(ctx,-12,-10,29,25,3,'#38464378');
    rounded(ctx,-14,-13,28,25,3,'#a58058');
    rounded(ctx,-11,-10,22,19,2,'#d4b382');
    polygon(ctx,[[-11,-10],[-8,-10],[11,5],[11,9]],'#9f7e57');
    for(const x of [-12,9]) for(const y of [-10,7]) rounded(ctx,x,y,3,3,1,'#e8c698');
  } else if(type==='foam') {
    rounded(ctx,-10,-10,24,22,6,'#3d625c6a');
    rounded(ctx,-12,-12,24,21,6,'#7aa9a2');
    rounded(ctx,-11,-12,22,16,5,'#b0d0b6');
    rounded(ctx,-7,-7,14,3,1,'#d8e3bb');rounded(ctx,-7,-2,11,3,1,'#87a395');
  } else {
    rounded(ctx,-17,-4,36,11,3,'#3e514b5c');
    rounded(ctx,-15,-8,5,16,1.6,'#b7875c');
    rounded(ctx,10,-8,5,16,1.6,'#ba8b5d');
    rounded(ctx,-18,-5,36,9,2,'#e2bd7b');
    for(let i=-15;i<16;i+=11) polygon(ctx,[[i,-4],[i+5,-4],[i+1,3],[i-4,3]],'#ca7350');
  }
  ctx.restore();
}
const chainBonuses=[150,105,70,42,22,10,4];

function givePropShot(prop,shot) {
  shot.visited.add(prop.id);
  prop.shot=shot;
  prop.shotX=prop.x;prop.shotY=prop.y;prop.farthest=0;
}
function scorePropTravel(game,prop) {
  game=prop.shot?.driver||game;
  if(game.config.mode!=='damage'||!prop.shot) return;
  const distance=Math.hypot(prop.x-prop.shotX,prop.y-prop.shotY);
  if(distance<=prop.farthest) return;
  game.objectScore+=(distance-prop.farthest)*6;
  prop.farthest=distance;
}
function awardChain(game,source,target,closing) {
  const shot=source.shot;
  if(!shot||closing<18||shot.visited.has(target.id)||Math.hypot(target.vx,target.vy)<12) return;
  givePropShot(target,shot);
  const bonus=chainBonuses[shot.links]||0;
  shot.links++;
  game=shot.driver||game;
  if(game.config.mode!=='damage') return;
  game.chainScore+=bonus;
  game.chainCount=Math.max(game.chainCount,shot.links);
  game.lastChain={links:shot.links,bonus,until:game.elapsed+1.75};
}
function touchProp(game,x,y,angle,velocity,dx,dy,body=game.spec,trailer=false,routeIndex=game.car.index) {
  if(game.spec.hover) return {x,y};
  const level=routeLevelAt(game.course,routeIndex), count=game.props.length;
  for(let i=0;i<count&&!game.finished;i++) {
    const prop=game.props[i], type=propTypes[prop.type];
    if(type.stationary||(prop.level||0)!==level||
      prop.graceUntil>game.elapsed) continue;
    const gap=Math.hypot(prop.x-x,prop.y-y);
    if(gap>type.r+Math.max(body.length,body.width)*.48+6) continue;
    const nx=gap>.1?(prop.x-x)/gap:dx,ny=gap>.1?(prop.y-y)/gap:dy;
    const blade=isBladeHit(body,angle,nx,ny);
    const depth=type.r+footprint(body,angle,nx,ny)+(blade?3.5:0)-gap;
    if(depth<=0) continue;
    const inward=dx*nx+dy*ny;
    const fresh=contactStart(game,{id:prop.id,nx,ny,over:depth});
    if(inward>.08&&fresh) {
      const force=clamp(velocity*inward,0,470);
      const kick=Math.min(type.cap,(blade?(force+34)*2.55:force*.77)/type.mass);
      if(kick>=6) {
        prop.vx=nx*kick;prop.vy=ny*kick;prop.spin=(dx*ny-dy*nx)*kick*.023;prop.bounces=0;
        givePropShot(prop,{links:0,visited:new Set(),driver:game.network?game:undefined});
      }
      const amount=blade||damageMode(game.config)==='off'?0:(1.4+force*.016)*damageFactor(game,'props')*game.spec.resistance;
      const section=trailer?hitSection(game.car.a,-Math.cos(angle),-Math.sin(angle)):hitSection(angle,nx,ny);
      const actual=applySectionDamage(game.car,section,amount);
      if(!blade) {
        game.car.speed*=trailer?.79:.88;
        recoverFromHit(game);
        dropTimber(game,force,nx,ny);
      }
      if(game.spec.blade&&blade) {
        raceEffect(game,'prop',clamp(force/330,.28,.64));
        spark(game,prop.x,prop.y,'impact',.38,angle+Math.PI);
      } else {
        const hit={t:Math.round(game.elapsed*1000),x:prop.x-nx*type.r,y:prop.y-ny*type.r,
          amount:actual,strength:clamp(force/330,.22,.64),index:routeIndex,nx,ny,prop:true};
        logHit(game,hit);
      }
    }
    if(depth>1) {
      const shift=Math.min(depth*(blade?.84:.40),blade?5.5:2.7);
      const moved=nudgeProp(game,prop,nx*shift,ny*shift);
      if(!trailer&&(!blade||!moved)) {
        x-=nx*Math.min(depth*.28,1.5);y-=ny*Math.min(depth*.28,1.5);
      }
    }
  }
  return {x,y};
}
function propBoundary(game,prop,x,y) {
  const course=game.course,r=propTypes[prop.type].r;
  if(course.openYard) {
    if(x<yard.left+r||x>yard.right-r||y<yard.top+r||y>yard.bottom-r) return true;
    return course.park&&obstacles.some(o=>{
      const c=Math.cos(o.a),s=Math.sin(o.a),dx=x-o.x,dy=y-o.y;
      return Math.abs(dx*c+dy*s)<o.w/2+r*.62&&Math.abs(-dx*s+dy*c)<o.h/2+r*.62;
    });
  }
  const p=project(course,x,y,prop.routeIndex,prop.routeIndex==null?undefined:13);
  const allowed=course.widths[mod(p.index,course.samples.length)][p.d>0?1:0].width;
  if(Math.abs(p.d)>allowed-r*.56) return true;
  prop.routeIndex=p.index;
  prop.level=routeLevelAt(course,p.index);
  return false;
}
function overlappingProp(game,prop,x,y) {
  const r=propTypes[prop.type].r;
  return game.props.find(o=>o!==prop&&!propTypes[o.type].stationary&&(o.level||0)===(prop.level||0)&&
    (o.x-x)**2+(o.y-y)**2<(r+propTypes[o.type].r)**2);
}
function nudgeProp(game,prop,dx,dy) {
  const x=prop.x+dx,y=prop.y+dy;
  if(overlappingProp(game,prop,x,y)||propBoundary(game,prop,x,y)) return false;
  prop.x=x;prop.y=y;
  scorePropTravel(game,prop);
  return true;
}
function capPropVelocity(prop) {
  const speed=Math.hypot(prop.vx,prop.vy),cap=propTypes[prop.type].cap;
  if(speed>cap) {prop.vx*=cap/speed;prop.vy*=cap/speed;}
}
function collideProps(game,source,target,dx,dy) {
  const gap=Math.hypot(target.x-source.x,target.y-source.y);
  const moved=Math.hypot(dx,dy);
  const nx=gap>.001?(target.x-source.x)/gap:dx/moved;
  const ny=gap>.001?(target.y-source.y)/gap:dy/moved;
  const closing=(source.vx-target.vx)*nx+(source.vy-target.vy)*ny;
  if(closing<.1) return;
  const a=propTypes[source.type],b=propTypes[target.type];
  const contactGap=Math.max(0,gap-a.r-b.r);
  const aligned=(dx*nx+dy*ny)/moved;
  if(contactGap>0&&aligned>.1) {
    const reach=Math.min(.98,contactGap/(moved*aligned));
    nudgeProp(game,source,dx*reach,dy*reach);
  }
  const impulse=1.47*closing/(1/a.mass+1/b.mass);
  const fromSource=source.vx*nx+source.vy*ny;
  const fromTarget=-(target.vx*nx+target.vy*ny);
  source.vx-=nx*impulse/a.mass;source.vy-=ny*impulse/a.mass;
  target.vx+=nx*impulse/b.mass;target.vy+=ny*impulse/b.mass;
  source.spin+=.28;target.spin-=(source.vx*ny-source.vy*nx)*.012;
  capPropVelocity(source);capPropVelocity(target);
  if(fromSource>=fromTarget) {
    if(closing>=18) target.bounces=0;
    awardChain(game,source,target,closing);
  } else {
    if(closing>=18) source.bounces=0;
    awardChain(game,target,source,closing);
  }
  if(closing>52&&game.elapsed-(game.propSoundAt??-1)>.065) {
    const strength=clamp(closing/280,.25,.68);
    const hit={t:Math.round(game.elapsed*1000),x:target.x-nx*b.r,y:target.y-ny*b.r,
      amount:0,strength,index:target.routeIndex??game.car.index,nx,ny,prop:true};
    game.impacts.push(hit);
    raceEffect(game,'prop',strength);
    spark(game,hit.x,hit.y,'impact',strength,Math.atan2(ny,nx));
    game.propSoundAt=game.elapsed;
  }
}
function tickProps(game,dt) {
  for(const prop of game.props) {
    if(Math.hypot(prop.vx,prop.vy)<4) {prop.vx=prop.vy=prop.spin=0;continue;}
    const type=propTypes[prop.type], dx=prop.vx*dt,dy=prop.vy*dt;
    const other=overlappingProp(game,prop,prop.x+dx,prop.y+dy);
    if(other) collideProps(game,prop,other,dx,dy);
    else if(!nudgeProp(game,prop,dx,dy)) {
      prop.bounces++;
      if(prop.bounces>type.bounces) {prop.vx=prop.vy=prop.spin=0;continue;}
      prop.vx*=-.32;prop.vy*=-.32;prop.spin*=-.32;
    }
    const drag=type.drag*(game.course.damageEvent?.85:1);
    prop.a+=prop.spin*dt;prop.vx*=Math.exp(-drag*dt);prop.vy*=Math.exp(-drag*dt);prop.spin*=Math.exp(-3.2*dt);
  }
}
function contactStart(game,wall) {
  const last=game.contacts.get(wall.id);
  game.contacts.set(wall.id,game.elapsed);
  return last==null||game.elapsed-last>=game.rules.rearm/1000;
}
function applySectionDamage(car,index,amount) {
  const before=car.damage[index];
  car.damage[index]=Math.min(100,before+Math.max(0,amount));
  return car.damage[index]-before;
}
function logHit(game,hit) {
  game.impacts.push(hit);
  if(!hit.prop) {
    game.scars.push({...hit,a:Math.atan2(hit.ny,hit.nx)+Math.PI/2});
    if(game.scars.length>1050) game.scars.shift();
  }
  if(!game.network&&!game.course.training) saveFrame(game,true);
  raceEffect(game,hit.prop?'prop':'impact',clamp(hit.strength,.18,1.25));
  spark(game,hit.x,hit.y,'impact',hit.strength,Math.atan2(-hit.ny,-hit.nx),hit.burst||1);
  if(game.config.mode==='one-hit') {
    game.lossHit=hit;
    finish(game,'One Hit Loss');
  }
  else if(damageMode(game.config)==='total') checkDamageEnd(game);
}
function drawScars(ctx,game,level=0,accept=null) {
  for(const mark of game.scars) {
    if(mark.t>game.elapsed*1000||(accept?!accept(mark.index):routeLevelAt(game.course,mark.index)!==level)) continue;
    ctx.save();ctx.translate(mark.x,mark.y);ctx.rotate(mark.a);
    ctx.globalAlpha*=clamp(.17+mark.strength*.32,.21,.59);
    oval(ctx,0,0,5+11*mark.strength,1.3+mark.strength,game.color);
    ctx.lineWidth=.9;ctx.strokeStyle='#4b5147';ctx.beginPath();
    ctx.moveTo(-5,0);ctx.lineTo(-1,-2);ctx.lineTo(2,2);ctx.lineTo(5,.1);
    if(mark.strength>.48) {ctx.moveTo(-1,-2);ctx.lineTo(1,-4);ctx.lineTo(4,-4);}
    ctx.stroke();ctx.restore();
  }
}
