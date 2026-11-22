'use strict';

const $ = id => document.getElementById(id);
const W = 1200, H = 660, TAU = Math.PI * 2;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const mix = (a, b, t) => a + (b - a) * t;
const mod = (v, n) => (v % n + n) % n;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const deltaAngle = (from, to) => mod(to - from + Math.PI, TAU) - Math.PI;
const hex = (color, amount) => {
  const value = parseInt(color.slice(1), 16);
  const toward = amount < 0 ? 0 : 255;
  return '#' + [value >> 16, (value >> 8) & 255, value & 255]
    .map(n => Math.round(mix(n, toward, Math.abs(amount))).toString(16).padStart(2, '0')).join('');
};
function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function rounded(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}
function oval(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}
function polygon(ctx, points, color) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function trackCanvas(draw, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale); draw(ctx);
  return canvas;
}

const courses = [
  {id:'oval', name:'Sunset Speedway', kind:'01 / Speedway', theme:'speedway', width:43,
    points:[[465,151],[720,151],[909,151],[1038,218],[1070,329],[1038,439],[924,506],[665,506],[409,506],[264,506],[149,442],[119,330],[151,215],[268,151]],
    runoff:[[.095,.27,1,'grass'],[.56,.76,-1,'dirt']]},
  {id:'switchback', name:'Eightfold Circuit', kind:'02 / Technical circuit', theme:'speedway', width:39,
    points:[[482,124],[744,124],[923,128],[1023,197],[934,267],[1037,341],[1025,452],[905,530],[653,529],[524,480],[393,528],[206,517],[119,451],[189,355],[124,268],[163,174],[308,124]],
    runoff:[[.15,.22,1,'grass'],[.43,.53,-1,'grass'],[.75,.83,1,'dirt']]},
  {id:'hairpin', name:'Copper Hairpin', kind:'03 / Hairpin circuit', theme:'copper', width:37,
    points:[[424,110],[700,110],[957,113],[1064,169],[1040,280],[942,298],[768,298],[686,336],[716,408],[815,426],[972,427],[1042,479],[1015,544],[760,556],[486,555],[279,540],[144,460],[126,341],[178,339],[338,329],[393,293],[381,233],[295,221],[215,199],[191,151],[241,111]],
    runoff:[[.11,.18,-1,'dirt'],[.3,.38,1,'dirt'],[.71,.81,-1,'dirt']]},
  {id:'quarry', name:'Dust Bowl Quarry', kind:'04 / Hardpack', theme:'copper', width:38, dirt:true,
    points:[[414,107],[683,108],[925,108],[1032,160],[1017,236],[887,248],[812,282],[840,350],[1026,379],[1033,486],[872,548],[674,527],[559,444],[420,455],[397,538],[213,545],[133,465],[150,349],[284,315],[306,248],[174,218],[175,137]],
    runoff:[[.07,.18,1,'dirt'],[.35,.43,-1,'dirt'],[.54,.64,1,'dirt'],[.78,.85,-1,'dirt']]},
  {id:'marsh', name:'Puddle Marsh', kind:'05 / Wet gravel', theme:'marsh', width:38, dirt:true,
    points:[[445,109],[748,109],[962,112],[1046,183],[956,254],[1028,338],[1058,457],[961,544],[774,543],[710,468],[593,463],[551,539],[387,548],[305,473],[302,372],[176,351],[124,263],[182,170],[302,109]],
    runoff:[[.08,.17,-1,'grass'],[.32,.42,1,'grass'],[.69,.79,-1,'grass']], puddles:[[.19,22],[.41,25],[.68,21],[.87,20]]},
  {id:'stream', name:'River Run', kind:'06 / Stream crossing', theme:'marsh', width:38,
    points:[[480,108],[725,108],[918,108],[1042,158],[1051,250],[990,311],[1037,433],[960,527],[752,533],[657,491],[649,420],[568,391],[473,458],[401,546],[246,542],[145,487],[123,388],[213,331],[229,252],[148,209],[189,129],[330,108]],
    runoff:[[.13,.21,1,'grass'],[.32,.4,-1,'dirt'],[.67,.75,1,'grass']], river:true},
  {id:'over-under', name:'Viaduct Eight', kind:'07 / Over-under circuit', theme:'speedway', width:39,
    points:[[198,111],[369,107],[493,235],[600,330],[712,428],[861,544],[1035,517],[1085,408],[1084,254],[1034,139],[881,111],[733,211],[600,330],[475,445],[363,546],[185,538],[118,467],[112,331],[116,198]],
    runoff:[[.055,.12,-1,'grass'],[.29,.39,1,'dirt'],[.61,.7,-1,'grass']], bridges:true},
  {id:'stack', name:'Highline Triple Stack', kind:'08 / Stacked bridges', theme:'copper', width:36,
    points:[[236,330],[421,330],[600,330],[785,330],[1015,330],[1085,282],[1066,182],[974,112],[861,111],[739,214],[600,330],[475,438],[380,507],[376,551],[433,579],[552,579],[660,579],[769,576],[824,544],[811,506],[739,445],[600,330],[462,215],[334,110],[228,108],[143,158],[116,251],[148,314]],
    runoff:[[.12,.172,1,'dirt'],[.36,.42,-1,'dirt'],[.80,.86,1,'dirt']], bridges:true},
  {id:'training-yard', name:'Open Yard', kind:'Training / Outer wall', theme:'speedway', training:true},
  {id:'training-park', name:'Crash Park', kind:'Training / Surfaces & obstacles', theme:'marsh', training:true, park:true}
];

const vehicles = [
  {name:'F1 Car', length:51, width:27, max:470, accel:415, turn:6.75, resistance:1.0, palette:['#f66c50','#f9be56','#43c1d2','#eee9cc']},
  {name:'Supercar', length:48, width:28, max:419, accel:375, turn:6.1, resistance:.79, palette:['#ffac5e','#ed6d98','#76dcae','#899afa']},
  {name:'Monster Truck', length:50, width:33, max:342, accel:246, turn:4.75, resistance:.53, palette:['#b9d75e','#d685f5','#f88851','#58bcdf']},
  {name:'Motorbike', length:47, width:24, max:495, accel:455, turn:8.8, resistance:1.30, palette:['#5bcee0','#fc7461','#ffe081','#b0dd79']},
  {name:'Tank',style:'tank',
    description:'Heavy armour and the slowest acceleration and top speed.',
    length:53,width:31,max:134,accel:75,turn:3.8,resistance:.075,
    engine:25,engineRange:.92,engineTone:'square',
    palette:['#b0dd79','#505e66','#43c1d2','#eee9cc']},
  {name:'Bulldozer',style:'dozer',
    description:'Armoured front blade shoves objects. Sides and rear can take damage.',
    length:54,width:37,max:170,accel:106,turn:3.5,resistance:.32,
    engine:32,engineRange:1.06,engineTone:'triangle',blade:true,
    palette:['#f9be56','#f88851','#eee9cc','#b9d75e']},
  {name:'Off-Road Racing Truck',style:'rally',
    description:'Recovers quickly after a hit and gets back to following the drawn path.',
    length:50,width:32,max:382,accel:315,turn:5.65,resistance:.68,
    engine:49,recovery:2.8,
    palette:['#58bcdf','#f66c50','#ffe081','#b9d75e']},
  {name:'Hot Rod',style:'hotrod',
    length:47,width:27,max:423,accel:387,turn:5.7,resistance:.91,
    engine:48,
    palette:['#f66c50','#ffe081','#505e66','#d685f5']},
  {name:'Van',style:'van',
    length:49,width:28,max:286,accel:218,turn:4.75,resistance:.70,
    engine:54,
    palette:['#eee9cc','#58bcdf','#76dcae','#ffac5e']},
  {name:'Copper Mini',style:'mini',
    length:35,width:23,max:337,accel:344,turn:8.1,resistance:1.07,
    engine:79,
    palette:['#f88851','#f66c50','#43c1d2','#b0dd79']},
  {name:'Electric Car',style:'electric',
    description:'An electric motor hum rises with speed.',
    length:47,width:27,max:406,accel:446,turn:6.35,resistance:.86,
    engine:123,engineRange:2.25,engineTone:'sine',
    palette:['#76dcae','#f7f5e8','#899afa','#505e66']},
  {name:'Big Rig Cab',style:'tractor',
    length:43,width:30,max:294,accel:216,turn:5.1,resistance:.51,
    engine:38,
    palette:['#58bcdf','#f66c50','#505e66','#f9be56']},
  {name:'Big Rig · Long Trailer',style:'tractor',
    length:43,width:30,max:251,accel:174,turn:4.55,resistance:.56,
    engine:37,trailers:[61],
    palette:['#899afa','#58bcdf','#f9be56','#505e66']},
  {name:'Big Rig · Double Trailer',style:'tractor',
    length:43,width:30,max:224,accel:138,turn:4.1,resistance:.60,
    engine:35,trailers:[61,61],
    palette:['#f66c50','#58bcdf','#505e66','#f9be56']},
  {name:'Logging Truck',style:'logging',
    description:'Hard hits can spill logs onto the track. The truck gets quicker with each one it drops.',
    length:43,width:30,max:233,accel:148,turn:4.25,resistance:.58,
    engine:39,trailers:[54],cargo:4,
    palette:['#b0dd79','#f88851','#505e66','#43c1d2']},
  {name:'Police Car',style:'police',
    description:'Flashing red and blue lights.',
    length:48,width:28,max:397,accel:349,turn:6.2,resistance:.78,
    engine:62,
    palette:['#f7f5e8','#505e66','#58bcdf','#899afa']},
  {name:'Magic Carpet',style:'carpet',
    description:'Floats over objects and oil, turns wide and leaves a glitter trail.',
    length:43,width:30,max:259,accel:220,turn:3.45,resistance:.93,
    hover:true,
    palette:['#d685f5','#ed6d98','#43c1d2','#f66c50']}
];

// The first four indices and palette entries belong to existing runs and settings.
const fleetGroups=[
  ['Race',0,1,2,3,6,7], ['Road',8,9,10,15], ['Heavy',4,5,11,12,13,14], ['Magic',16]
];
function normalizePaint(colors) {
  return vehicles.map((spec,i)=>{
    const value=Number(colors?.[i]);
    return Number.isInteger(value)&&spec.palette[value]?value:0;
  });
}
const landscapes = {
  speedway:{ground:'#69a373', grass:'#6daa78', turf:'#60986e', dust:'#bc9d70', road:'#616c67', edge:'#e6e5bc', rail:'#b9c4ae', shade:'#778c76', leaf:['#78af78','#508a66','#91bf80']},
  copper:{ground:'#c99c69', grass:'#d3a675', turf:'#be8d60', dust:'#dfb083', road:'#656963', edge:'#f7ddad', rail:'#ded5b4', shade:'#9a8b70', leaf:['#a8a575','#7f8a62','#e3b780']},
  marsh:{ground:'#70a68a', grass:'#7ab394', turf:'#649b83', dust:'#bfa487', road:'#606f6b', edge:'#e9e2b9', rail:'#c9ceb0', shade:'#7a9581', leaf:['#76b595','#4d927a','#9dc49c']}
};
const yard = {left:95,top:75,right:1105,bottom:585};
const obstacles = [
  {x:370,y:238,w:105,h:27,a:-.20}, {x:706,y:350,w:98,h:29,a:.66}, {x:926,y:219,w:31,h:91,a:.25},
  {x:525,y:487,w:118,h:26,a:.05}, {x:260,y:421,w:31,h:69,a:-.2}
];
const parkPatches = [
  {x:302,y:273,rx:152,ry:108,type:'grass'}, {x:579,y:190,rx:143,ry:90,type:'dirt'},
  {x:855,y:442,rx:149,ry:98,type:'dirt'}, {x:883,y:448,rx:88,ry:40,type:'water'},
  {x:361,y:475,rx:114,ry:69,type:'grass'}
];
const practiceCurb = {x:648,y:249,w:144,h:10};
const streamX = y => 586 + 56 * Math.sin((y - 40) / 107) + (y - 320) * .16;
const prepared = new Map();

function cubic(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return .5 * (2 * p1 + (-p0 + p2) * t + (2*p0 - 5*p1 + 4*p2 - p3) * t2 + (-p0 + 3*p1 - 3*p2 + p3) * t3);
}
function sampleTrack(points,smoothing=50) {
  const raw = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[mod(i-1,n)], b = points[i], c = points[(i+1)%n], d = points[(i+2)%n];
    const count = Math.max(12, Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/2));
    for (let k = 0; k < count; k++) {
      const t = k / count;
      raw.push({x:cubic(a[0],b[0],c[0],d[0],t),y:cubic(a[1],b[1],c[1],d[1],t),u:i+t});
    }
  }
  raw.push({...raw[0],u:n});
  const initial = resampleTrack(raw,5).samples;
  // Soften sharp spline peaks before constructing vehicle-width boundaries.
  const sigma=.60+smoothing*.063;
  const weights=Array.from({length:25},(_,i)=>Math.exp(-.5*((i-12)/sigma)**2));
  const denominator = weights.reduce((sum,weight) => sum+weight,0);
  const smooth = initial.map((_,i) => {
    let x=0,y=0;
    for(let k=0;k<weights.length;k++) {
      const p=initial[mod(i+k-12,initial.length)];
      x+=p.x*weights[k]; y+=p.y*weights[k];
    }
    return {x:x/denominator,y:y/denominator,u:initial[i].u};
  });
  smooth.push({...smooth[0],u:n});
  const {samples,length,step} = resampleTrack(smooth,5);
  const count=samples.length;
  for (let i=0;i<count;i++) {
    const a = samples[mod(i-1,count)], b = samples[(i+1)%count], p = samples[i];
    const norm = dist(a,b);
    p.tx = (b.x-a.x)/norm; p.ty = (b.y-a.y)/norm; p.nx = -p.ty; p.ny = p.tx;
  }
  return {samples,length,step};
}
function resampleTrack(raw, desiredStep) {
  const cumulative = [0];
  for (let i = 1; i < raw.length; i++) cumulative.push(cumulative[i-1] + dist(raw[i],raw[i-1]));
  const length = cumulative.at(-1), count = Math.ceil(length / desiredStep), step = length / count;
  const samples = [];
  let source = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while (cumulative[source+1] < s) source++;
    const a = raw[source], b = raw[source+1], t = (s-cumulative[source])/(cumulative[source+1]-cumulative[source]);
    samples.push({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),s,u:mix(a.u,b.u,t)});
  }
  return {samples,length,step};
}
function offset(p, v) {
  return [p.x+p.nx*v,p.y+p.ny*v];
}
function runoffInfo(course, i, side) {
  const n=course.samples.length, sample=course.samples[mod(i,n)], p=mod(i,n)/n;
  const base=course.widthAt[mod(i,n)], section=course.edgeSections?.find(z=>z.side===side&&segmentIn(sample.u,z.from,z.to));
  const zone = course.runoff?.find(([a,b,s]) => s===side && p>=a && p<=b);
  if(section?.surface===null||!zone&&!section) return {width:base,type:null,curb:false};
  const taper=section?1:clamp(Math.min(p-zone[0],zone[1]-p)/.011,0,1);
  return {width:base+23*taper,type:taper>.16?(section?.surface||zone[3]):null,curb:section?.curb!==false};
}
function segmentCross(a,b,c,d) {
  const dx = b.x-a.x, dy = b.y-a.y, ex = d.x-c.x, ey = d.y-c.y;
  const determinant = dx*ey-dy*ex;
  if (Math.abs(determinant) < .01) return null;
  const x = c.x-a.x, y = c.y-a.y;
  const t = (x*ey-y*ex)/determinant, u = (x*dy-y*dx)/determinant;
  return t>=-1e-8 && t<=1+1e-8 && u>=-1e-8 && u<=1+1e-8 ? {x:a.x+t*dx,y:a.y+t*dy} : null;
}
function getDecks(course) {
  const pts = course.samples, n = pts.length, decks = [];
  for (let i = 0; i < n; i++) {
    for (let j = i+35; j < Math.min(n,n+i-35); j++) {
      const hit = segmentCross(pts[i],pts[(i+1)%n],pts[j],pts[(j+1)%n]);
      if (!hit) continue;
      const crossing = Math.abs(pts[i].tx*pts[j].ty-pts[i].ty*pts[j].tx);
      const half = Math.ceil((course.widthAt[j]/Math.max(crossing,.55)+31)/course.step);
      const nearby = decks.find(deck => Math.abs(deck.index-j)<24 && dist(deck,hit)<25);
      if (nearby) {
        nearby.half = Math.max(nearby.half,half);
        nearby.under.push(i);
      } else decks.push({...hit,index:j,half,under:[i]});
    }
  }
  return decks.sort((a,b) => a.index-b.index);
}
function prepare(courseIndex) {
  const cached=prepared.get(courseIndex);
  const course=cached||prepareDefinition(courses[courseIndex],courseIndex);
  prepared.delete(courseIndex);prepared.set(courseIndex,course);
  if(prepared.size>7) prepared.delete(prepared.keys().next().value);
  return course;
}
function prepareDefinition(definition,index=0,scale=1.35) {
  const course={...definition,index,colors:landscapes[definition.theme]};
  course.openYard=!!(course.training||course.arena);
  if(!course.openYard||course.park) {
    if(course.park) {
      course.practice=true;course.points=parkLoop;course.width=31;course.runoff=[];course.bridges=true;
      course.props??=[{type:'tyres',x:330,y:375,a:0},{type:'barrier',x:494,y:270,a:-.45}];
    }
    setRouteData(course);
    if(course.park&&!course.physicalElevation) {
      const i=project(course,701,177,null).index;
      course.decks.push({index:i,half:10,under:[i],style:'tunnel',flatRoof:true});
    }
    course.waterPatches=(course.puddles||[]).map(([t,r])=>{
      const p=course.samples[Math.round(course.samples.length*t)];
      return {x:p.x+6*p.nx,y:p.y+6*p.ny,rx:r,ry:r*.63,a:Math.atan2(p.ty,p.tx)+.78,type:'water'};
    });
  }
  if(course.damageEvent) {
    const clear=[];
    for(const prop of course.props||[]) {
      if(!propTypes[prop.type].stationary&&clear.some(other=>!propTypes[other.type].stationary&&
        Math.hypot(prop.x-other.x,prop.y-other.y)<propTypes[prop.type].r+propTypes[other.type].r+2)) continue;
      clear.push(prop);
    }
    course.props=clear;
  }
  const river=riverSpec(course);
  if(river) course.riverData={width:river.width,points:curveRiver(river.points)};
  if(course.elevationData) bakeElevation(course);
  else bakeDecks(course);
  course.aboveBase=course.elevationData
    ? i=>heightAt(course,i)!==0
    : i=>(course.decks||[]).some(d=>!d.hidden&&!d.flatRoof&&
      circularIndexDistance(d.index,i,course.samples.length)<d.half);
  course.map=trackCanvas(ctx=>renderMap(ctx,course),scale);
  return course;
}
function drawCoursePreview(ctx,course,props=true,hazards=false) {
  ctx.drawImage(course.map,0,0,W,H);
  drawDecks(ctx,course);
  if(props) for(const o of course.props||[]) drawProp(ctx,o);
  if(hazards) for(const o of course.hazards||[]) drawProp(ctx,o);
}

function project(course, x, y, index, radius = 11) {
  const points = course.samples, n = points.length;
  let best = Infinity, result;
  const lo = index == null ? 0 : index-radius;
  const hi = index == null ? n-1 : index+radius;
  for (let i = lo; i <= hi; i++) {
    const a = points[mod(i,n)], b = points[mod(i+1,n)];
    const dx = b.x-a.x, dy = b.y-a.y;
    const t = clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
    const cx = a.x+t*dx, cy = a.y+t*dy;
    const d = (x-cx)**2+(y-cy)**2;
    if (d < best) {
      best = d;
      const segmentLength = Math.hypot(dx,dy), nx = -dy/segmentLength, ny = dx/segmentLength;
      result = {index:i, t, s:(i+t)*course.step,x:cx,y:cy,nx,ny,d:(x-cx)*nx+(y-cy)*ny};
    }
  }
  return result;
}
function onPatch(x,y,patch) {
  const a = patch.a || 0, dx = x-patch.x, dy = y-patch.y;
  return ((dx*Math.cos(a)+dy*Math.sin(a))/patch.rx)**2+((-dx*Math.sin(a)+dy*Math.cos(a))/patch.ry)**2<1;
}
function surfaceAt(course,x,y,index) {
  if(course.arena) return course.patches?.findLast(p=>onPatch(x,y,p))?.type||'asphalt';
  if (course.training) {
    if (course.park) {
      const b=practiceCurb;
      if(Math.abs(x-b.x)<b.w/2&&Math.abs(y-b.y)<b.h/2) return 'curb';
      const patch = parkPatches.findLast(p => onPatch(x,y,p));
      return patch?.type || 'asphalt';
    }
    return 'asphalt';
  }
  const p = project(course,x,y,index,8);
  if(heightAt(course,p.index)===0) {
    if(course.riverData&&riverDistance(course,x,y)<course.riverData.width*.5) return 'water';
    if(course.waterPatches.some(patch=>onPatch(x,y,patch))) return 'water';
  }
  const j=mod(p.index,course.samples.length), width=course.widthAt[j];
  const info=course.widths[j][p.d>=0?1:0];
  if(info.type&&Math.abs(p.d)>=width-6) {
    return info.curb&&Math.abs(p.d)<=width+4?'curb':info.type;
  }
  return course.roadAt[j];
}
function circularIndexDistance(a,b,n) {
  return Math.abs(mod(a-b+n/2,n)-n/2);
}
function strip(ctx,points,left,right,color) {
  polygon(ctx,points.map((p,i) => offset(p,left(p,i))).concat(points.map((p,i) => offset(p,right(p,i))).reverse()),color);
}
function trackStrip(ctx,points,left,right,color,blocked=()=>false) {
  // Short overlapping pieces preserve the union at crossings.
  for (let i = 0; i < points.length-1; i++) {
    if(blocked(i)) continue;
    const a=points[i], b=points[i+1];
    const q = {...b,x:b.x+b.tx*.75,y:b.y+b.ty*.75};
    polygon(ctx,[offset(a,left(i)),offset(q,left(i+1)),offset(q,right(i+1)),offset(a,right(i))],color);
  }
}
function centerDashes(ctx, points, w, color,blocked=()=>false) {
  for (let i = 4; i < points.length-3; i+=9) {
    if(blocked(i)) continue;
    strip(ctx,points.slice(i,i+3),() => -w,() => w,color);
  }
}
function checkers(ctx,p,x,y,span,count=10) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(Math.atan2(p.ty,p.tx));
  const tile = span*2/count;
  for (let xi=0;xi<2;xi++) for (let k=0;k<count;k++) {
    ctx.fillStyle = (xi+k)%2 ? '#eae8d3' : '#454f4a';
    ctx.fillRect((xi-1)*tile,-span+k*tile,tile+.15,tile+.15);
  }
  ctx.restore();
}
function paintPuddle(ctx,p) {
  ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.a||0);
  oval(ctx,1,3,p.rx+4,p.ry+3,'#547f7a');
  oval(ctx,0,0,p.rx,p.ry,'#66aeb1');
  oval(ctx,-p.rx*.15,-p.ry*.16,p.rx*.7,p.ry*.56,'#78bdc0');
  oval(ctx,p.rx*.17,-p.ry*.29,p.rx*.34,p.ry*.055,'#a9d9d0');
  oval(ctx,-p.rx*.3,p.ry*.3,p.rx*.21,p.ry*.045,'#a9d9d0');
  ctx.restore();
}
function paintStream(ctx,course,onRoad) {
  const {width,points}=course.riverData;
  ctx.lineCap='round';ctx.lineJoin='round';
  const bands=onRoad?[[1.04,'#5b979e'],[.78,'#6bafb4'],[.22,'#84c2bf']]:
    [[1.64,'#a8b89a'],[1.29,'#649b9b'],[1.02,'#70afb1'],[.25,'#87c4c0']];
  for(const [ratio,color] of bands) {
    ctx.beginPath();ctx.moveTo(...points[0]);
    for(const p of points.slice(1)) ctx.lineTo(...p);
    ctx.strokeStyle=color;ctx.lineWidth=width*ratio;ctx.stroke();
  }
}
function paintTree(ctx,x,y,r,palette,rand) {
  oval(ctx,x+4,y+6,r*1.12,r*.7,'#345b4b32');
  oval(ctx,x,y,r,r*.8,palette[1]);
  oval(ctx,x-3,y-4,r*.93,r*.76,palette[0]);
  oval(ctx,x-6,y-7,r*.57,r*.43,palette[2]);
  if (rand()>.42) oval(ctx,x+6,y-4,r*.44,r*.36,palette[0]);
}
function paintStand(ctx,x,y,w) {
  rounded(ctx,x+5,y+5,w,27,5,'#334b4555');
  rounded(ctx,x,y,w,27,5,'#d4c6a6');
  for (let i=0;i<4;i++) rounded(ctx,x+4,y+3+i*5,w-8,3,1,i%2?'#637c75':'#f3e0b7');
}
function paintBarrier(ctx,x,y,w,h,a) {
  ctx.save();ctx.translate(x,y);ctx.rotate(a);
  rounded(ctx,-w/2+4,-h/2+5,w,h,5,'#4b625674');
  rounded(ctx,-w/2,-h/2,w,h,4,'#c8c5a7');
  rounded(ctx,-w/2,-h/2,w,h*.47,4,'#e6dfb9');
  for(let i=-w/2+5;i<w/2-3;i+=13) rounded(ctx,i,-h/2+4,5,h-8,1,'#a0a289');
  ctx.restore();
}
function renderMap(ctx,course) {
  const c=course.colors, rand=random(course.scenerySeed??(673+course.index*87));
  ctx.fillStyle=c.ground;ctx.fillRect(0,0,W,H);
  for (let i=0;i<19;i++) {
    const y=i*38;
    polygon(ctx,[[0,y],[W,y-133],[W,y-114],[0,y+19]],i%3?c.grass:c.turf);
  }
  if(course.riverData) paintStream(ctx,course,false);
  if(course.openYard) {
    rounded(ctx,yard.left-11,yard.top-8,yard.right-yard.left+22,yard.bottom-yard.top+22,23,c.shade);
    rounded(ctx,yard.left-7,yard.top-7,yard.right-yard.left+14,yard.bottom-yard.top+14,18,c.rail);
    ctx.fillStyle=course.floor||'#646e66';ctx.fillRect(yard.left,yard.top,yard.right-yard.left,yard.bottom-yard.top);
    for(let i=0;i<42;i++) {
      const x=yard.left+25+rand()*(yard.right-yard.left-50), y=yard.top+18+rand()*(yard.bottom-yard.top-36);
      oval(ctx,x,y,5+rand()*13,1+rand()*2,'#9fa59553');
    }
    if(course.arena) paintArenaFloor(ctx,course);
    if(course.park) {
      for(const patch of parkPatches) {
        if(patch.type==='water') paintPuddle(ctx,patch);
        else {
          oval(ctx,patch.x,patch.y,patch.rx,patch.ry,patch.type==='grass'?c.turf:c.dust);
          oval(ctx,patch.x-8,patch.y-5,patch.rx*.8,patch.ry*.77,patch.type==='grass'?c.grass:'#c5aa84');
        }
      }
      const curb=practiceCurb;
      for(let i=0;i<12;i++) {
        ctx.fillStyle=i%2?'#f6e2b8':'#dc7162';
        ctx.fillRect(curb.x-curb.w/2+i*curb.w/12,curb.y-curb.h/2,curb.w/12,curb.h);
      }
      const loop=course.samples.concat(course.samples[0]);
      trackStrip(ctx,loop,()=>-35,()=>35,'#b3bfa0',course.aboveBase);
      trackStrip(ctx,loop,()=>-31,()=>31,'#596d67',course.aboveBase);
      centerDashes(ctx,loop,1.05,'#c5c6a17d',course.aboveBase);
      if(course.elevationData) paintTunnelPlan(ctx,course);
      obstacles.forEach(o => paintBarrier(ctx,o.x,o.y,o.w,o.h,o.a));
    }
    rounded(ctx,160,306,84,48,5,'#d0d4a06c');
    rounded(ctx,163,309,78,42,4,'#626e66');
    return;
  }
  const pts=course.samples, n=pts.length, closed=pts.concat(pts[0]);
  const closest = (x,y) => {
    let best=Infinity;
    for(let i=0;i<n;i+=4) best=Math.min(best,(pts[i].x-x)**2+(pts[i].y-y)**2);
    return Math.sqrt(best);
  };
  for(let i=0;i<370;i++) {
    const x=rand()*W,y=rand()*H, d=closest(x,y);
    if(d<course.width+20 || (course.riverData&&i%5===0&&riverDistance(course,x,y)<course.riverData.width)) continue;
    if(i%6===0&&d>course.width+39) paintTree(ctx,x,y,8+rand()*12,c.leaf,rand);
    else {
      const r=2+rand()*6;
      oval(ctx,x,y,r,r*.36,i%2?c.turf:c.leaf[2]);
      if(i%4===0) oval(ctx,x+4,y-3,r*.48,r*.32,c.leaf[0]);
    }
  }
  if(course.id==='oval'||course.grandstand) {
    paintStand(ctx,240,52,240);paintStand(ctx,508,52,235);paintStand(ctx,770,52,167);
    paintStand(ctx,410,566,182);paintStand(ctx,620,566,181);
    rounded(ctx,485,280,228,102,13,'#91b17b');
    rounded(ctx,498,292,202,78,8,'#7ba371');
    for(let i=0;i<5;i++) rounded(ctx,514+i*36,313,23,36,3,i%2?'#d9d4a2':'#bfce9c');
  }
  const r=(i,side) => course.widths[i%n][side].width, w=i=>course.widthAt[i%n];
  const base=course.dirt ? '#b58c67' : c.road;
  trackStrip(ctx,closed,i => -r(i,0)-11,i => r(i,1)+11,c.shade,course.aboveBase);
  trackStrip(ctx,closed,i => -r(i,0)-7,i => r(i,1)+7,c.rail,course.aboveBase);
  trackStrip(ctx,closed,i => -r(i,0),i => r(i,1),base,course.aboveBase);
  if(!course.dirt) {
    trackStrip(ctx,closed,i => -w(i)+10,i => w(i)-10,course.theme==='coast'?'#657e7d':'#65716a',course.aboveBase);
  }
  for(let i=0;i<n;i++) {
    if(course.aboveBase(i)) continue;
    const slice=closed.slice(i,i+2);
    const material=course.roadAt[i];
    if(material!==(course.dirt?'dirt':'asphalt')) {
      const fill={dirt:c.dust,grass:c.turf,asphalt:c.road};
      strip(ctx,slice,(_,k)=>-w(i+k),(_,k)=>w(i+k),fill[material]);
    }
    for(const side of [-1,1]) {
      const si=side===1?1:0, info=course.widths[i][si];
      if(info.type) {
        strip(ctx,slice,(_,k) => side*(w(i+k)-4),(_,k) => side*r(i+k,si),info.type==='grass'?c.grass:c.dust);
        if(info.curb) strip(ctx,slice,(_,k) => side*(w(i+k)-5),(_,k) => side*(w(i+k)+4),Math.floor(i/2)%2?'#f6e2b8':'#dc7162');
      } else {
        const [x,y]=offset(pts[i],side*(r(i,si)+1));
        const p=project(course,x,y,i,12);
        if(Math.hypot(x-p.x,y-p.y)>=r(i,si)-2) {
          if(i%5!==4) strip(ctx,slice,(_,k) => side*(r(i+k,si)+1),(_,k) => side*(r(i+k,si)+4),i%4===0?c.edge:c.rail);
          if(!course.dirt) strip(ctx,slice,(_,k) => side*(w(i+k)-6),(_,k) => side*(w(i+k)-4),'#aeb49a');
        }
      }
    }
  }
  for(let i=0;i<128;i++) {
    const i=Math.floor(rand()*n),p=pts[i],t=(rand()-.5)*(course.width*1.25);
    if(course.aboveBase(i)) continue;
    const k=offset(p,t);
    oval(ctx,k[0],k[1],1+rand()*5,1+rand(),course.dirt?'#dfb38a70':'#a6a88a35');
  }
  if(course.riverData) {
    ctx.save();
    const ribbon = new Path2D();
    for(let i=0;i<n;i++) {
      if(course.aboveBase(i)) continue;
      const a=pts[i],b=pts[(i+1)%n];
      const coords=[offset(a,-w(i)),offset(b,-w(i+1)),offset(b,w(i+1)),offset(a,w(i))];
      ribbon.moveTo(...coords[0]); for(const p of coords.slice(1)) ribbon.lineTo(...p); ribbon.closePath();
    }
    ctx.clip(ribbon); paintStream(ctx,course,true); ctx.restore();
  }
  course.waterPatches.forEach(p=>{
    if(!course.elevationData||heightAt(course,project(course,p.x,p.y,null).index)===0) paintPuddle(ctx,p);
  });
  if(course.elevationData) paintTunnelPlan(ctx,course);
  const start=pts[0];
  checkers(ctx,start,start.x,start.y,w(0)-7);
  for(let k=1;k<=3;k++) {
    const p=pts[mod(-k*5,n)];
    for(const side of [-1,1]) {
      const [x,y]=offset(p,side*course.width*.43);
      ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(p.ty,p.tx));
      rounded(ctx,-8,-5,16,10,2,'#c8c9a07a');ctx.restore();
    }
  }
}
