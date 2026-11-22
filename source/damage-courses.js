const pitProps=['cone','wheel','foam','drum','crate','tyres','barrier'];

function circuitObjects(stations,types,phase=0) {
  const props=[];
  for(let i=0;i<stations;i++) {
    const at=.055+i*.90/stations, side=i%2===0?-1:1;
    props.push({type:types[(i+phase)%types.length],at,lane:side*.78,a:side*.35});
    props.push({type:types[(i+2+phase)%types.length],at:at+.011,lane:side*.35,a:-side*.42});
    if(i%3!==1) props.push({type:types[(i+4+phase)%types.length],at:at+.024,lane:i%2===0?.20:-.17,a:.28});
  }
  return props;
}
function objectRow(x,y,dx,dy,types) {
  return types.map((type,i)=>({type,x:x+dx*i,y:y+dy*i,a:(i%3-1)*.21,level:0}));
}
function repeatedProps(count,phase) {
  return Array.from({length:count},(_,i)=>pitProps[(phase+i)%pitProps.length]);
}

courses.push(
  {
    id:'pit-lane-pileup',name:'Pit Lane Pile-Up',kind:'Obstacle circuit',theme:'foundry',
    width:58,physicalElevation:true,damageEvent:true,
    points:[[211,246],[257,144],[433,118],[665,119],[910,123],[1023,166],[1071,268],[1042,413],
      [957,518],[806,548],[700,493],[607,449],[515,482],[429,540],[316,550],[202,479],[158,363]],
    runoff:[[.105,.21,1,'grass'],[.49,.61,-1,'dirt'],[.74,.84,1,'grass']],
    props:circuitObjects(15,pitProps)
  },
  {
    id:'runoff-rumble',name:'Runoff Rumble',kind:'Obstacle circuit',theme:'coast',
    width:52,physicalElevation:true,damageEvent:true,dirt:true,
    points:[[220,345],[147,249],[171,156],[339,117],[547,121],[681,173],[663,274],[746,332],
      [884,285],[946,176],[1044,178],[1094,292],[1072,424],[954,497],[791,471],[681,505],
      [609,555],[453,555],[331,523],[281,419]],
    runoff:[[.06,.155,-1,'grass'],[.30,.40,1,'dirt'],[.63,.73,-1,'grass'],[.82,.91,1,'grass']],
    props:circuitObjects(17,['foam','drum','wheel','crate','cone','tyres','barrier'],3)
  },
  {
    id:'paddock-pinball',name:'Paddock Pinball',kind:'Open damage arena',theme:'foundry',damageEvent:true,arena:60,
    floor:'#5b6966',parking:[150,255,365,475],
    props:[
      ...objectRow(325,165,58,0,repeatedProps(11,0)),
      ...objectRow(375,251,55,0,repeatedProps(12,3)),
      ...objectRow(336,330,56,0,['wheel','cone','foam','cone','tyres','cone','drum','foam','cone','crate','wheel','barrier']),
      ...objectRow(370,413,62,0,repeatedProps(11,1)),
      ...objectRow(320,502,70,0,repeatedProps(10,5))
    ]
  },
  {
    id:'scrapyard-shuffle',name:'Scrapyard Shuffle',kind:'Open damage arena',theme:'copper',damageEvent:true,arena:60,
    floor:'#a38263',
    patches:[
      {x:817,y:173,rx:206,ry:78,type:'dirt',fill:'#c2a078'},
      {x:938,y:468,rx:120,ry:77,type:'grass',fill:'#90936b'},
      {x:440,y:452,rx:177,ry:90,type:'dirt',fill:'#c39d75'}
    ],
    props:[
      ...objectRow(343,126,64,24,repeatedProps(10,3)),
      ...objectRow(574,130,45,44,repeatedProps(9,4)),
      ...objectRow(1013,209,-61,10,repeatedProps(8,2)),
      ...objectRow(322,323,63,16,['wheel','cone','cone','foam','cone','crate','wheel','foam','drum','tyres']),
      ...objectRow(378,507,61,-15,repeatedProps(10,5)),
      ...objectRow(427,248,43,45,repeatedProps(5,0)),
      ...objectRow(982,508,0,-56,repeatedProps(5,5))
    ]
  }
);
const builtInCount=courses.length;
function paintArenaFloor(ctx,course) {
  for(const p of course.patches||[]) {
    oval(ctx,p.x,p.y,p.rx,p.ry,p.fill);
    oval(ctx,p.x,p.y,p.rx*.89,p.ry*.81,hex(p.fill,.07));
  }
  ctx.save();
  ctx.strokeStyle='#ddd6a364';ctx.lineWidth=2;
  ctx.setLineDash([13,14]);
  for(const y of course.parking||[]) {
    ctx.beginPath();ctx.moveTo(276,y);ctx.lineTo(1051,y);ctx.stroke();
  }
  ctx.setLineDash([]);
  if(course.parking) for(let x=305;x<1030;x+=58) {
    ctx.fillStyle='#e0ddb053';ctx.fillRect(x,113,2,26);ctx.fillRect(x,527,2,26);
  }
  ctx.restore();
}
