const elevationChoices=['auto','up','same','down'];
const heightText=level=>level===0?'Ground':level>0?'+'+level:String(level);

function crossingGroups(course) {
  const points=course.samples,n=points.length, groups=[];
  const gap=Math.ceil(145/course.step);
  for(let a=0;a<n;a++) for(let b=a+gap;b<Math.min(n,n+a-gap);b++) {
    const pa=points[a],pb=points[b];
    if(Math.abs(pa.x-pb.x)>course.step*2||Math.abs(pa.y-pb.y)>course.step*2) continue;
    const intersection=segmentCross(pa,points[(a+1)%n],pb,points[(b+1)%n]);
    if(!intersection) continue;
    const angle=Math.max(.32,Math.abs(pa.tx*pb.ty-pa.ty*pb.tx));
    let group=groups.find(g=>dist(g,intersection)<23);
    if(!group) {group={...intersection,passes:[]};groups.push(group);}
    for(const [index,other] of [[a,b],[b,a]]) {
      const edges=course.widths[other];
      const half=Math.ceil(clamp((Math.max(edges[0].width,edges[1].width)+9)/angle,42,146)/course.step);
      const prior=group.passes.find(p=>circularIndexDistance(p.index,index,n)<13);
      if(prior) prior.half=Math.max(prior.half,half);
      else group.passes.push({index,half,group});
    }
  }
  groups.forEach((g,i)=>{g.id=i;g.passes.sort((a,b)=>a.index-b.index);});
  return groups;
}
function visitReference(course,pass) {
  const u=course.samples[pass.index].u, i=Math.floor(u), ids=course.pointIds;
  return {at:pass.index/course.samples.length,from:ids?.[i],to:ids?.[(i+1)%ids.length],t:u-i};
}
function matchVisit(course,ref,remaining) {
  let best=null, cost=Infinity;
  for(const pass of remaining) {
    const key=visitReference(course,pass);
    const byAnchor=ref.from&&key.from===ref.from&&key.to===ref.to;
    const shift=circularIndexDistance(ref.at,key.at,1);
    const score=byAnchor?Math.abs(ref.t-key.t)*.012:shift+.028;
    if(score<cost&&(byAnchor||shift<.085)) {best=pass;cost=score;}
  }
  return best;
}
function applyCrossingOrders(course,groups,intent) {
  const n=course.samples.length;
  for(const group of groups) {
    group.order=group.passes.slice().sort((a,b)=>intent[a.index]-intent[b.index]||a.index-b.index);
    let nearby=Infinity;
    for(const saved of course.elevationOrders||[]) {
      const gap=Math.hypot(saved.x-group.x,saved.y-group.y);
      if(gap>=nearby||gap>115||group.passes.length!==saved.order.length) continue;
      const free=group.passes.slice(), order=[];
      for(const ref of saved.order) {
        const pass=matchVisit(course,ref,free);
        if(!pass) break;
        order.push(pass);free.splice(free.indexOf(pass),1);
      }
      if(!free.length) {group.order=order;group.saved=saved;nearby=gap;}
    }
  }
  // Preserve swaps from earlier course files that stored just a pair of route distances.
  for(const old of course.crossings||[]) {
    if(old.style!=='bridge') continue;
    for(const group of groups) {
      if(group.saved) continue;
      const over=group.passes.find(p=>circularIndexDistance(p.index/n,old.over,1)<.026);
      const under=group.passes.find(p=>p!==over&&circularIndexDistance(p.index/n,old.under,1)<.026);
      if(!over||!under) continue;
      const a=group.order.indexOf(over),b=group.order.indexOf(under);
      if(a<b) [group.order[a],group.order[b]]=[group.order[b],group.order[a]];
    }
  }
}
function pointSampleIndices(course) {
  let k=0;
  return course.points.map((_,i)=>{
    while(k+1<course.samples.length&&Math.abs(course.samples[k+1].u-i)<Math.abs(course.samples[k].u-i)) k++;
    return k;
  });
}
function authoredHeight(course,anchors,automatic) {
  const n=course.samples.length, levels=[0], commands=course.elevation||[], portals=[];
  for(let p=1;p<anchors.length;p++) {
    const command=commands[p]||'auto', previous=levels[p-1];
    const prior=previous===0&&(!commands[p-1]||commands[p-1]==='auto')?automatic?.[anchors[p-1]]||0:previous;
    let next;
    if(command==='auto') next=previous<0?previous:0;
    else if(command==='same') next=prior;
    else next=prior+(command==='up'?1:-1);
    levels.push(clamp(next,-7,7));
    if((previous<0)!==(next<0)) portals.push({index:anchors[p],point:p,entry:next<0});
  }
  const unfinished=levels.at(-1)<0;
  if(unfinished) portals.push({index:0,point:0,entry:false,unfinished:true});
  const samples=new Float32Array(n);
  for(let p=0;p<anchors.length;p++) {
    const from=anchors[p],to=anchors[p+1]??n, a=levels[p], b=levels[p+1]??0;
    for(let i=from;i<to;i++) {
      if(a<0) samples[i]=b<0?mix(a,b,(i-from)/Math.max(1,to-from)):a;
      else if(b>=0) samples[i]=mix(a,b,(i-from)/Math.max(1,to-from));
      else samples[i]=a;
    }
  }
  // A previous editor represented an isolated tunnel as a cover with coincident route references.
  for(const old of course.crossings||[]) {
    if(old.style!=='tunnel') continue;
    const center=Math.round(old.under*n), radius=Math.ceil(53/course.step);
    for(let d=-radius;d<radius;d++) {
      const i=mod(center+d,n);
      if(i!==0&&samples[i]===0) samples[i]=-1;
    }
  }
  return {samples,levels,portals,unfinished};
}
function solveCrossingHeights(course,groups,base,anchors,merge) {
  const n=course.samples.length, passes=groups.flatMap(g=>g.passes), warnings=[];
  passes.forEach((p,i)=>{p.component=i;});
  if(merge) {
    const byRoute=passes.slice().sort((a,b)=>a.index-b.index);
    for(let i=0;i<byRoute.length;i++) {
      const a=byRoute[i],b=byRoute[(i+1)%byRoute.length];
      if(a.group===b.group||mod(b.index-a.index,n)>a.half+b.half+Math.ceil(38/course.step)) continue;
      if((base[a.index]<0)!==(base[b.index]<0)) continue;
      const sameGroup=passes.some(p=>p.component===a.component&&passes.some(q=>q.component===b.component&&q.group===p.group));
      if(sameGroup) continue;
      const old=b.component;
      for(const pass of passes) if(pass.component===old) pass.component=a.component;
    }
  }
  const nodes=new Map();
  for(const p of passes) {
    let node=nodes.get(p.component);
    if(!node) {node={lo:base[p.index]<0?-64:0,hi:base[p.index]<0?-1:64,ideal:0,children:new Set(),parents:new Set(),passes:[]};nodes.set(p.component,node);}
    node.passes.push(p);p.node=node;
    const target=Math.round(base[p.index]);
    node.ideal=node.hi<0?Math.min(node.ideal,target):Math.max(node.ideal,target);
    for(const [i,at] of anchors.entries()) {
      const command=course.elevation?.[i]||'auto';
      if(circularIndexDistance(at,p.index,n)<=Math.ceil(24/course.step)&&command!=='auto') {
        const fixed=Math.round(base[at]);
        node.lo=Math.max(node.lo,fixed);node.hi=Math.min(node.hi,fixed);
      }
    }
  }
  for(const g of groups) for(let i=1;i<g.order.length;i++) {
    const above=g.order[i].node,below=g.order[i-1].node;
    below.children.add(above);above.parents.add(below);
  }
  const ready=[...nodes.values()].filter(node=>!node.parents.size), sorted=[];
  const incoming=new Map([...nodes.values()].map(node=>[node,node.parents.size]));
  for(let i=0;i<ready.length;i++) {
    const node=ready[i];
    sorted.push(node);
    for(const child of node.children) {
      incoming.set(child,incoming.get(child)-1);
      if(incoming.get(child)===0) ready.push(child);
    }
  }
  if(sorted.length!==nodes.size) return null;
  for(const node of sorted.slice().reverse()) {
    for(const child of node.children) node.hi=Math.min(node.hi,child.hi-1);
  }
  for(const node of sorted) {
    const floor=Math.max(node.lo,...[...node.parents].map(p=>p.level+1));
    if(floor>node.hi) {
      node.passes.forEach(p=>{p.group.conflict=true;});
      warnings.push('The crossing order conflicts with a point’s elevation. Adjust the point or swap the passes.');
    }
    node.level=clamp(node.ideal,floor,Math.max(floor,node.hi));
  }
  return warnings;
}
function solveElevation(course) {
  const n=course.samples.length,anchors=pointSampleIndices(course),groups=crossingGroups(course);
  const ground=new Float32Array(n);
  applyCrossingOrders(course,groups,ground);
  solveCrossingHeights({...course,elevation:null},groups,ground,anchors,false);
  const automatic=ground.slice();
  for(const g of groups) for(const p of g.passes) {
    for(let d=-p.half;d<=p.half;d++) {
      const i=mod(p.index+d,n);automatic[i]=Math.max(automatic[i],p.node?.level||0);
    }
  }
  const authored=authoredHeight(course,anchors,automatic);
  applyCrossingOrders(course,groups,authored.samples);
  let warnings=solveCrossingHeights(course,groups,authored.samples,anchors,true);
  if(!warnings) {
    warnings=['Two close crossings demand opposite heights on a shared section. Adjust the crossing order or give the ramps more space.'];
    groups.forEach(g=>{g.conflict=true;});
    warnings.push(...(solveCrossingHeights(course,groups,authored.samples,anchors,false)||[]));
  }
  if(authored.unfinished) warnings.push('Add a tunnel exit before returning to the start.');
  for(let i=1;i<anchors.length;i++) {
    const rise=Math.abs(authored.levels[i]-authored.levels[i-1]);
    if(rise&&(anchors[i]-anchors[i-1])*course.step<28*rise) {
      warnings.push('Points '+i+' and '+(i+1)+' are too close for their elevation change.');
    }
  }
  const heights=authored.samples.slice(), elevationSections=[];
  for(const group of groups) for(const pass of group.passes) {
    pass.level=pass.node.level;
    const ramp=Math.ceil((38+20*Math.min(4,Math.abs(pass.level)))/course.step);
    const extent=pass.half+ramp;
    const underground=authored.samples[pass.index]<0;
    if(pass.level===0) continue;
    if(pass.level>0&&circularIndexDistance(0,pass.index,n)<=pass.half) {
      group.conflict=true;
      warnings.push('Move the start to a section that can stay at ground level.');
    }
    for(let d=-extent;d<=extent;d++) {
      const i=mod(pass.index+d,n);
      if(i===0||(authored.samples[i]<0)!==underground) continue;
      const weight=clamp((extent-Math.abs(d))/ramp,0,1);
      const target=mix(authored.samples[i],pass.level,weight);
      heights[i]=underground?Math.min(heights[i],target):Math.max(heights[i],target);
    }
  }
  for(let i=0;i<n;i++) {
    if(heights[i]<0) {
      const portals=authored.portals;
      if(heights[mod(i-1,n)]>=0&&!portals.some(p=>p.index===i)) portals.push({index:i,entry:true});
      if(heights[(i+1)%n]>=0&&!portals.some(p=>p.index===(i+1)%n)) portals.push({index:(i+1)%n,entry:false});
    }
  }
  const sectionByIndex=new Array(n);
  const band=h=>h<0?Math.min(-1,Math.round(h)):h>0?Math.max(1,Math.round(h)):0;
  let start=0;
  while(start<n&&heights[start]!==0) start++;
  let current=null;
  for(let k=0;k<n;k++) {
    const index=mod(start+k,n),level=band(heights[index]);
    if(!level) {current=null;continue;}
    if(!current||current.level!==level) {
      current={first:index,count:0,index,negative:level<0,level,passes:[]};
      elevationSections.push(current);
    }
    current.count++;
    sectionByIndex[index]=current;
  }
  for(const group of groups) for(const pass of group.order) {
    const section=sectionByIndex[pass.index];
    if(section) section.passes.push(pass);
  }
  course.elevationData={heights,anchors,groups,sections:elevationSections,sectionByIndex,portals:authored.portals,
    warnings:[...new Set(warnings)]};
  course.decks=elevationSections;
}
function heightAt(course,index) {
  const heights=course.elevationData?.heights;
  return heights?heights[mod(Math.round(index),heights.length)]:0;
}
function elevationSectionAt(course,index) {
  const data=course.elevationData;
  return data?.sectionByIndex[mod(index,data.heights.length)];
}
function elevatedAlpha(course,section,index) {
  const n=course.samples.length, current=heightAt(course,index);
  if(current<0||mod(index-section.first,n)<section.count) return 1;
  let alpha=1;
  for(const pass of section.passes) {
    for(const lower of pass.group.order) {
      if(lower.level>=pass.level||lower.level<0||current>=pass.level-.05) continue;
      const distance=circularIndexDistance(lower.index,index,n)*course.step;
      const fade=clamp((distance-(lower.half*course.step+54))/70,0,1);
      alpha=Math.min(alpha,fade);
    }
  }
  return alpha;
}
function tunnelWindows(course,car) {
  const data=course.elevationData,n=course.samples.length, i=mod(car.index,n);
  const p=course.samples[i], forward=Math.cos(car.a)*p.tx+Math.sin(car.a)*p.ty>=0?1:-1;
  const ahead=Math.ceil(115/course.step), behind=Math.ceil(48/course.step);
  const reach=[],active=data.sectionByIndex[i];
  if(data.heights[i]<0) {
    // Scan along the driven route. A change in depth along the same run stays connected.
    for(const direction of [-1,1]) {
      const range=direction===forward?ahead:behind;
      for(let distance=direction===1?0:1;distance<range;distance++) {
        const k=mod(i+direction*distance,n), h=data.heights[k];
        if(h>=0||(direction!==forward&&data.sectionByIndex[k]!==active)) break;
        reach.push({index:k,height:h,opacity:clamp((range-distance)/6,0,1)});
      }
    }
  } else {
    for(let distance=1;distance<ahead;distance++) {
      const k=mod(i+forward*distance,n);
      if(data.heights[k]>=0) continue;
      if(distance*course.step>76) break;
      const strength=clamp((82-distance*course.step)/46,0,1);
      for(let d=0;d<ahead-distance;d++) {
        const j=mod(k+forward*d,n), h=data.heights[j];
        if(h>=0) break;
        reach.push({index:j,height:h,opacity:strength*clamp((ahead-distance-d)/6,0,1)});
      }
      break;
    }
  }
  return reach.sort((a,b)=>a.height-b.height);
}
function paintElevationPiece(ctx,course,index,below=false) {
  const a=course.samples[index], j=mod(index+1,course.samples.length), b=course.samples[j];
  const points=[a,{...b,x:b.x+b.tx*.42,y:b.y+b.ty*.42}], c=course.colors;
  const width=(k,side)=>course.widths[k?j:index][side].width;
  const nominal=k=>course.widthAt[k?j:index];
  const surface={asphalt:'#77877e',dirt:c.dust,grass:c.turf}[course.roadAt[index]]||c.road;
  strip(ctx,points,(_,k)=>-width(k,0)-5,(_,k)=>width(k,1)+5,below?'#4b5d56':c.rail);
  strip(ctx,points,(_,k)=>-width(k,0),(_,k)=>width(k,1),below?hex(surface,-.23):surface);
  for(const side of [-1,1]) {
    const edge=course.widths[index][side===1?1:0];
    if(edge.type) {
      strip(ctx,points,(_,k)=>side*nominal(k),(_,k)=>side*width(k,side===1?1:0),edge.type==='dirt'?c.dust:c.grass);
      if(edge.curb) strip(ctx,points,(_,k)=>side*(nominal(k)-3),(_,k)=>side*(nominal(k)+4),Math.floor(index/2)%2?'#f6e2b8':'#dc7162');
    } else strip(ctx,points,(_,k)=>side*(nominal(k)-4),(_,k)=>side*(nominal(k)-2),below?'#929d82':'#e4dab0');
  }
  if(index%10<3) strip(ctx,points,()=>-1.1,()=>1.1,below?'#bfc4a2':'#dad6aeaa');
}
function bakeElevation(course) {
  const n=course.samples.length;
  for(const section of course.elevationData.sections) {
    if(section.negative) continue;
    const indices=Array.from({length:section.count},(_,i)=>mod(section.first+i,n));
    const pts=indices.map(i=>course.samples[i]), pad=105;
    section.left=Math.floor(Math.min(...pts.map(p=>p.x))-pad);section.top=Math.floor(Math.min(...pts.map(p=>p.y))-pad);
    section.w=Math.ceil(Math.max(...pts.map(p=>p.x))+pad-section.left);
    section.h=Math.ceil(Math.max(...pts.map(p=>p.y))+pad-section.top);
    const canvas=document.createElement('canvas');canvas.width=section.w*1.25;canvas.height=section.h*1.25;
    const ctx=canvas.getContext('2d');ctx.scale(1.25,1.25);ctx.translate(-section.left,-section.top);
    ctx.save();ctx.translate(5,8);
    for(const i of indices) {
      const p=course.samples[i],q=course.samples[(i+1)%n],w=course.widthAt[i]+9;
      strip(ctx,[p,q],()=>-w,()=>w,'#263e3d75');
    }
    ctx.restore();
    for(const i of indices) paintElevationPiece(ctx,course,i);
    section.art=canvas;
  }
}
function paintTunnelPlan(ctx,course) {
  const data=course.elevationData,n=course.samples.length;
  ctx.strokeStyle='#e2e1bba6';ctx.lineWidth=1.9;
  for(const below of data.sections.filter(s=>s.negative)) {
    for(const side of [-1,1]) {
      ctx.beginPath();
      for(let k=0;k<below.count;k++) {
        const i=mod(below.first+k,n),p=offset(course.samples[i],side*(course.widthAt[i]-3));
        if(k%3===0) ctx.moveTo(...p);else ctx.lineTo(...p);
      }
      ctx.stroke();
    }
  }
  for(const {index} of data.portals) {
    const p=course.samples[index], w=course.widthAt[index];
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.ty,p.tx));
    rounded(ctx,-4,-w-4,8,13,2,'#e5d2a4');rounded(ctx,-4,w-9,8,13,2,'#e5d2a4');
    ctx.fillStyle='#bbb885';ctx.fillRect(-2,-w+8,4,w*2-16);ctx.restore();
  }
}
function drawElevation(ctx,course,car,afterDeck) {
  const data=course.elevationData;
  if(car&&course.practice) {
    const p=project(course,car.x,car.y,car.index,8);
    if(Math.hypot(p.x-car.x,p.y-car.y)>course.width+9) car=null;
  }
  const layers=data.sections.filter(s=>!s.negative).sort((a,b)=>a.level-b.level);
  for(const section of layers) {
    ctx.save();
    if(car) ctx.globalAlpha=elevatedAlpha(course,section,car.index);
    if(ctx.globalAlpha>0) {
      ctx.drawImage(section.art,section.left,section.top,section.w,section.h);
      afterDeck?.(section);
    }
    ctx.restore();
  }
  if(!car) return;
  const reveal=tunnelWindows(course,car), drawn=new Set();
  for(const piece of reveal) {
    ctx.globalAlpha=piece.opacity;paintElevationPiece(ctx,course,piece.index,true);
    drawn.add(piece.index);
  }
  ctx.globalAlpha=1;
  return drawn;
}
