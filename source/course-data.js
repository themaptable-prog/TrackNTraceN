const addedLandscapes = {
  coast:{ground:'#86b5a3',grass:'#96c0ab',turf:'#73a898',dust:'#e1bb8d',road:'#596f72',edge:'#f3e3c4',rail:'#ccd1ba',shade:'#6e9184',leaf:['#82b29a','#568c80','#b6c6a3']},
  foundry:{ground:'#a4a39a',grass:'#b0afa1',turf:'#95978d',dust:'#c7ae91',road:'#566665',edge:'#e8d3a9',rail:'#c6c1ac',shade:'#79877d',leaf:['#8c9d8a','#677c72','#b6b494']}
};
Object.assign(landscapes,addedLandscapes);
const additions=[
  ['seabreeze','Seabreeze Harbour','coast',42,[[450,111],[750,110],[977,119],[1051,214],[1008,317],[1085,411],[1037,514],[876,550],[632,544],[555,482],[484,428],[387,453],[328,525],[192,514],[121,422],[177,328],[224,240],[182,159],[301,112]]],
  ['switchyard','Signal Switchyard','foundry',36,[[444,113],[770,111],[1006,131],[1061,229],[943,264],[870,321],[931,377],[1035,402],[1061,487],[959,551],[767,532],[686,489],[591,479],[499,549],[345,548],[261,499],[257,407],[174,350],[124,282],[181,184],[285,115]]],
  ['salt','Saltpan Narrows','coast',37,[[427,119],[651,119],[893,118],[1045,176],[1052,259],[944,308],[837,307],[743,322],[739,400],[832,424],[960,427],[1029,488],[956,551],[703,552],[497,553],[325,530],[205,458],[169,345],[230,291],[370,275],[494,267],[531,209],[463,164]]],
  ['slag','Slagbank Works','foundry',39,[[460,108],[756,115],[929,113],[1048,183],[1017,279],[913,328],[1011,416],[1054,497],[965,535],[795,527],[683,465],[591,487],[505,547],[375,549],[330,471],[413,369],[386,307],[258,302],[153,262],[147,173],[245,115]]],
  ['tidal','Tidal Cut','coast',38,[[451,108],[707,108],[901,110],[1019,155],[1043,246],[952,307],[997,385],[1036,477],[920,548],[707,544],[623,498],[616,411],[509,395],[454,481],[382,541],[237,535],[150,460],[157,353],[244,289],[217,213],[153,170],[255,110]]],
  ['gantry','Gantry Pass','foundry',39,[[239,124],[427,122],[523,243],[621,339],[741,431],[821,530],[993,541],[1077,463],[1077,289],[1010,170],[891,127],[791,196],[706,268],[621,339],[489,440],[357,534],[206,522],[138,442],[170,327],[121,242],[147,164]],true],
  ['headland','Headland Overpass','coast',36,[[244,119],[423,120],[525,238],[617,338],[723,419],[834,537],[980,550],[1078,468],[1023,358],[1080,255],[1037,150],[925,120],[799,178],[706,254],[617,338],[486,450],[380,550],[247,535],[116,453],[144,345],[221,276],[158,204],[169,148]],true],
  ['terminal','Terminal Three','foundry',36,[[227,334],[419,333],[600,330],[792,328],[991,326],[1071,280],[1061,189],[980,118],[873,117],[748,220],[600,330],[466,449],[386,513],[391,561],[486,568],[620,546],[740,583],[815,555],[820,507],[738,435],[600,330],[454,208],[344,118],[221,118],[126,183],[154,250],[128,300]],true]
];
for(const [i,[id,name,theme,width,points,bridges]] of additions.entries()) {
  courses.push({id,name,theme,width,points,bridges,kind:(i+9)+' / '+(theme==='coast'?'Coastal':'Industrial'),
    runoff:[[.105,.18,1,'grass'],[.43,.50,-1,'dirt'],[.72,.80,1,'dirt']],
    dirt:id==='slag',
    widthsByPoint:points.map((_,k)=>width+([0,3,1,-2,2][(k+i)%5])),
    river:id==='tidal'?{points:[[582,-30],[570,135],[644,280],[611,426],[673,573],[648,690]],width:35}:null,
    props:i%2===0?[{type:'tyres',at:.13,side:1},{type:'barrier',at:.76,side:1}]:
      [{type:'barrier',at:.46,side:-1},{type:'tyres',at:.125,side:1}]});
}
const parkLoop=[[644,178],[758,172],[831,253],[883,312],[956,393],[1022,422],[1061,365],[1050,256],[1011,207],[955,229],[883,312],[799,392],[716,419],[647,369],[617,269]];
const editorThemes={
  speedway:{name:'Speedway',surface:'asphalt'},copper:{name:'Copper canyon',surface:'dirt'},
  marsh:{name:'Marsh',surface:'dirt'},coast:{name:'Coastal',surface:'asphalt'},
  foundry:{name:'Industrial',surface:'asphalt'}
};
const propTypes={
  tyres:{name:'Tyre stack',r:13,mass:.82,cap:195,bounces:2,drag:1.6},
  barrier:{name:'Wooden barrier',r:18,mass:1.15,cap:169,bounces:1,drag:1.9},
  cone:{name:'Traffic cone',r:9,mass:.34,cap:330,bounces:2,drag:1.7},
  drum:{name:'Traffic drum',r:15,mass:1.34,cap:183,bounces:1,drag:1.6},
  crate:{name:'Pit crate',r:15,mass:1.47,cap:162,bounces:1,drag:1.92},
  wheel:{name:'Spare race wheel',r:12,mass:.68,cap:310,bounces:2,drag:1.21},
  foam:{name:'Foam marker',r:13,mass:.49,cap:278,bounces:2,drag:1.51},
  oil:{name:'Oil spill',r:15,ry:10,stationary:true},
  log:{name:'Loose log',r:11,mass:.92,cap:234,bounces:2,drag:1.37}
};
function courseOptions(category=false) {
  return courses.flatMap((course,index)=>{
    const matches=category==='damage'?course.damageEvent:category?course.training:!course.training&&!course.damageEvent;
    return matches?[index]:[];
  });
}
function riverSpec(course) {
  if(!course.river) return null;
  if(course.river===true) return {width:36,points:Array.from({length:40},(_,i)=>{
    const y=-30+i*19;
    return [streamX(y),y];
  })};
  return course.river;
}
function riverDistance(course,x,y) {
  const river=course.riverData;
  if(!river) return Infinity;
  let best=Infinity;
  for(let i=1;i<river.points.length;i++) {
    const [ax,ay]=river.points[i-1], [bx,by]=river.points[i], dx=bx-ax,dy=by-ay;
    const t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);
    best=Math.min(best,(x-ax-t*dx)**2+(y-ay-t*dy)**2);
  }
  return Math.sqrt(best);
}
function curveRiver(points) {
  if(points.length<3) return points;
  const curved=[];
  for(let i=0;i<points.length-1;i++) {
    const b=points[i],c=points[i+1],a=points[i-1]||b,d=points[i+2]||c;
    const n=Math.max(6,Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/20));
    for(let k=0;k<n;k++) curved.push([cubic(a[0],b[0],c[0],d[0],k/n),cubic(a[1],b[1],c[1],d[1],k/n)]);
  }
  curved.push(points.at(-1));return curved;
}
function segmentIn(value,start,end) {
  return start<=end?value>=start&&value<end:value>=start||value<end;
}
function setRouteData(course) {
  const data=sampleTrack(course.points,course.smoothing);
  Object.assign(course,data);
  const n=course.samples.length;
  course.widthAt=course.samples.map(p => {
    if(!course.widthsByPoint) return course.width;
    const i=Math.floor(p.u), fraction=p.u-i;
    return mix(course.widthsByPoint[mod(i,course.points.length)],course.widthsByPoint[mod(i+1,course.points.length)],fraction);
  });
  course.widths=course.samples.map((_,i)=>[runoffInfo(course,i,-1),runoffInfo(course,i,1)]);
  course.roadAt=course.samples.map(p=>course.roadSections?.find(z=>segmentIn(p.u,z.from,z.to))?.surface ||
    (course.dirt?'dirt':'asphalt'));
  if(course.physicalElevation) solveElevation(course);
  else setLegacyDecks(course);
  course.props=placeCourseProps(course,course.props||[]);
  course.hazards=placeCourseProps(course,course.hazards||[]);
}
function placeCourseProps(course,props) {
  const n=course.samples.length;
  return props.map(o=>{
    if(o.at==null) return {...o};
    const side=o.side===1?1:0,start=Math.floor(o.at*n);
    if(o.lane!=null) {
      const p=course.samples[start],radius=propTypes[o.type].r;
      const clearance=Math.max(0,course.widthAt[start]-radius-4);
      const lateral=clearance*o.lane;
      return {...o,x:p.x+p.nx*lateral,y:p.y+p.ny*lateral,a:Math.atan2(p.ty,p.tx)+(o.a||0),
        routeIndex:start,level:routeLevelAt(course,start)};
    }
    let i=start;
    for(let t=0;t<n*.125;t++) {
      const j=mod(start+t,n);
      if(course.widths[j][side].width-course.widthAt[j]>=20) {i=j;break;}
    }
    const p=course.samples[i], r=course.widths[i][side].width-propTypes[o.type].r*.69;
    return {...o,x:p.x+p.nx*r*o.side,y:p.y+p.ny*r*o.side,a:Math.atan2(p.ty,p.tx),routeIndex:i,level:0};
  });
}
function setLegacyDecks(course) {
  const n=course.samples.length;
  course.decks=course.bridges?getDecks(course):[];
  const used=new Set();
  for(const crossing of course.crossings||[]) {
    const over=Math.round(clamp(crossing.over,0,.999999)*n);
    const under=Math.round(clamp(crossing.under,0,.999999)*n);
    const known=course.decks.find(d=>!used.has(d)&&
      ((circularIndexDistance(d.index,over,n)<19&&d.under.some(k=>circularIndexDistance(k,under,n)<19))||
       (circularIndexDistance(d.index,under,n)<19&&d.under.some(k=>circularIndexDistance(k,over,n)<19))));
    if(!known) {
      if(crossing.style==='tunnel') course.decks.push({index:over,half:10,under:[under],style:'tunnel',flatRoof:true,source:crossing.source});
      continue;
    }
    used.add(known);
    if(circularIndexDistance(known.index,under,n)<19) {
      const upper=known.under.find(k=>circularIndexDistance(k,over,n)<19)??over;
      known.under=known.under.map(k=>k===upper?known.index:k);known.index=upper;
    }
    known.hidden=crossing.style==='none';known.style=crossing.style;known.source=crossing.source;
  }
  course.decks.sort((a,b)=>a.index-b.index);
  const ordered=[];
  while(course.decks.length>ordered.length) {
    const next=course.decks.find(d=>!ordered.includes(d)&&!course.decks.some(b=>b!==d&&!ordered.includes(b)&&
      d.under.some(k=>circularIndexDistance(k,b.index,n)<9)&&!b.under.some(k=>circularIndexDistance(k,d.index,n)<9)));
    ordered.push(next||course.decks.find(d=>!ordered.includes(d)));
  }
  course.decks=ordered;
}
function practiceRoute(course,x,y,index) {
  if(!course.practice) return 0;
  const local=project(course,x,y,index,14), gap=Math.hypot(x-local.x,y-local.y);
  return gap<course.width+21 ? local.index : project(course,x,y,null).index;
}
function deckVisibility(course,deck,x,y,index) {
  const p=course.samples[deck.index], n=course.samples.length;
  if(!deck.under.some(i=>circularIndexDistance(i,index,n)<deck.half+13)) return 1;
  const dx=x-p.x,dy=y-p.y;
  const along=Math.abs(dx*p.tx+dy*p.ty),across=Math.abs(dx*p.nx+dy*p.ny);
  const edge=Math.min(deck.half*course.step-along,course.widthAt[deck.index]+8-across);
  return 1-clamp(edge/20,0,1)*.88;
}
function drawDecks(ctx,course,car=null,afterDeck=null) {
  if(course.elevationData) return drawElevation(ctx,course,car,afterDeck);
  if(!course.decks?.length) return;
  for(const d of course.decks) {
    if(d.hidden) continue;
    ctx.save();
    if(car && course.samples) ctx.globalAlpha=deckVisibility(course,d,car.x,car.y,car.index);
    ctx.drawImage(d.art,d.left,d.top,d.w,d.h);
    ctx.restore();
    afterDeck?.(d);
  }
}
function routeLevelAt(course,index) {
  if(course.elevationData) {
    const h=heightAt(course,index);
    return h<0?Math.min(-1,Math.round(h)):h>0?Math.max(1,Math.round(h)):0;
  }
  const n=course.samples?.length;
  if(!n) return 0;
  const deck=course.decks.find(d=>!d.hidden&&!d.flatRoof&&circularIndexDistance(d.index,index,n)<=d.half);
  return deck?.level||0;
}
function bakeDecks(course) {
  const processed=[];
  for(const d of course.decks||[]) {
    if(d.hidden) continue;
    d.level=d.flatRoof?0:1+Math.max(0,...processed.filter(b=>!b.flatRoof&&
      d.under.some(k=>circularIndexDistance(k,b.index,course.samples.length)<10)).map(b=>b.level));
    processed.push(d);
    const points=[];
    for(let i=-d.half;i<=d.half;i++) points.push(course.samples[mod(d.index+i,course.samples.length)]);
    const width=course.widthAt[d.index], margin=width+19;
    d.left=Math.floor(Math.min(...points.map(p=>p.x))-margin);
    d.top=Math.floor(Math.min(...points.map(p=>p.y))-margin);
    d.w=Math.ceil(Math.max(...points.map(p=>p.x))+margin-d.left);
    d.h=Math.ceil(Math.max(...points.map(p=>p.y))+margin-d.top);
    const art=document.createElement('canvas');art.width=d.w*1.5;art.height=d.h*1.5;
    const ctx=art.getContext('2d');ctx.scale(1.5,1.5);ctx.translate(-d.left,-d.top);
    const raised=points.map(p=>({...p,x:p.x+5,y:p.y+9}));
    strip(ctx,raised,()=>-width-10,()=>width+10,'#263e3d75');
    strip(ctx,points,()=>-width-6,()=>width+6,'#b4b2a0');
    strip(ctx,points,()=>-width,()=>width,d.style==='tunnel'?'#526c65':'#78887d');
    for(const side of [-1,1]) {
      strip(ctx,points,()=>side*(width-5),()=>side*(width-3),'#e1d8ad');
      strip(ctx,points,()=>side*(width+1),()=>side*(width+5),'#ebd4a1');
      for(let k=2;k<points.length;k+=3) {
        const [x,y]=offset(points[k],side*(width+3));
        oval(ctx,x,y,2.4,2.4,'#8b8b72');
      }
    }
    if(d.style==='tunnel') {
      for(let k=1;k<points.length-1;k+=3) {
        strip(ctx,points.slice(k,k+2),()=>-width+6,()=>width-6,'#657e70');
      }
      for(const end of [points.slice(0,2),points.slice(-2)]) strip(ctx,end,()=>-width-4,()=>width+4,'#e5d2a4');
    } else centerDashes(ctx,points,1.1,'#dad6ae8c');
    d.art=art;
  }
}
