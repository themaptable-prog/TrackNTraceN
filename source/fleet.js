// Place each trailer behind its hitch. Its axle follows the direction of travel.
function trailerPoses(spec,car) {
  let parent=car, rear=spec.length*.46;
  return (spec.trailers||[]).map((length,i)=>{
    const a=car.trailerAngles?.[i]??parent.a;
    const hx=parent.x-Math.cos(parent.a)*rear, hy=parent.y-Math.sin(parent.a)*rear;
    const reach=length/2+3;
    const pose={x:hx-Math.cos(a)*reach,y:hy-Math.sin(a)*reach,a,length,width:24,hx,hy};
    parent=pose;rear=length/2;
    return pose;
  });
}
function steerTrailers(spec,car,previous) {
  const hitch=spec.length*.46;
  let hx=car.x-Math.cos(car.a)*hitch,hy=car.y-Math.sin(car.a)*hitch, heading=car.a;
  car.trailerAngles=previous.map(p=>{
    const axleX=p.x-Math.cos(p.a)*p.length*.31, axleY=p.y-Math.sin(p.a)*p.length*.31;
    const turn=deltaAngle(heading,Math.atan2(hy-axleY,hx-axleX));
    const a=heading+clamp(turn,-1.34,1.34);
    hx-=Math.cos(a)*(p.length+3);hy-=Math.sin(a)*(p.length+3);heading=a;
    return a;
  });
}
function rigVisualLength(spec) {
  return spec.length+(spec.trailers||[]).reduce((total,length)=>total+length+3,0);
}
function drawTimber(ctx,length,width) {
  rounded(ctx,-length/2,-width/2,length,width,2,'#613f31');
  rounded(ctx,-length/2+2,-width*.35,length-3,width*.66,1,'#a96f46');
  rounded(ctx,-length/2+3,-width*.25,length-8,1.15,.55,'#d59860');
  rounded(ctx,-length/2,-width*.37,3.7,width*.74,1.5,'#dbab73');
  rounded(ctx,length/2-3,-width*.37,3,width*.74,1.3,'#d2a470');
}
function drawTrailers(ctx,spec,color,damage,options) {
  const poses=trailerPoses(spec,{x:0,y:0,a:0,trailerAngles:options.trailerAngles});
  for(const [i,p] of poses.entries()) {
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);
    const l=p.length,w=p.width;
    rounded(ctx,l/2-2,-1.6,6,3.2,1,'#878a78');
    if(!options.ghost) oval(ctx,1,2,l*.52,w*.59,'#263b3659');
    for(const side of [-1,1]) for(const axle of [-.37,-.22]) racingTyre(ctx,l*axle,side*w*.47,7,4.6,0,true);
    panel(ctx,0,0,l,w,10,damage,spec.style==='logging'?'#70584a':hex(color,-.22),2.3);
    if(spec.style==='logging') {
      const count=options.cargo??spec.cargo;
      for(let j=0;j<count;j++) drawTimberAt(ctx,-7.8+j*5.2,l*.91-j*.9);
      for(const x of [-.32,.30]) {
        rounded(ctx,x*l-1,-w*.52,2,w*1.04,.5,'#b7a082');
        for(const y of [-1,1]) rounded(ctx,x*l-2,y*w*.47-2,4,4,1,'#3d4844');
      }
    } else {
      rounded(ctx,-l*.47,-w*.41,l*.94,w*.82,2,hex(color,.19+i*.08));
      for(let x=-l*.41;x<l*.43;x+=5) rounded(ctx,x,-w*.38,1.1,w*.76,.45,hex(color,.35));
      rounded(ctx,-l*.43,-1,l*.84,2,1,'#e3d6ae');
      rounded(ctx,-l*.48,-w*.35,2,4,.6,'#d86456');
      rounded(ctx,-l*.48,w*.35-4,2,4,.6,'#d86456');
    }
    ctx.restore();
  }
}
function drawTimberAt(ctx,y,length) {
  ctx.save();ctx.translate(0,y);drawTimber(ctx,length,5.1);ctx.restore();
}
function drawFleetBody(ctx,spec,color,damage,options) {
  const {style,length:l,width:w}=spec;
  const hi=hex(color,.21), shade=hex(color,-.24), glass='#426663', shine='#89afa1';
  if(spec.trailers) drawTrailers(ctx,spec,color,damage,options);
  if(style==='carpet') {
    const sway=Math.sin((options.time||0)*9)*1.5;
    polygon(ctx,[[-l*.48,-w*.46],[l*.41,-w*.42+sway],[l*.49,w*.40+sway],[-l*.44,w*.47]],'#dcad6f');
    polygon(ctx,[[-l*.41,-w*.35],[l*.35,-w*.31+sway],[l*.41,w*.29+sway],[-l*.38,w*.35]],color);
    polygon(ctx,[[-12,0],[0,-7],[12,sway],[0,7]],hi);
    polygon(ctx,[[-7,0],[0,-4],[7,0],[0,4]],'#ffe79b');
    for(const x of [-1,1]) for(let i=-3;i<=3;i++) rounded(ctx,x*l*.46-2,i*w*.119+(x===1?sway:0),4.6,1.1,.45,'#f8d69a');
    oval(ctx,-l*.24,0,1.8,1.4,'#ffde9c');oval(ctx,l*.24,sway,1.8,1.4,'#ffde9c');
    return;
  }
  const tracked=style==='tank'||style==='dozer';
  if(tracked) {
    for(const side of [-1,1]) {
      const y=side*w*.36;
      rounded(ctx,-l*.45,y-4.2,l*.83,8.4,3,'#394340');
      for(let x=-l*.39;x<l*.36;x+=4) rounded(ctx,x,y-3.4,1.55,6.8,.5,'#69776a');
    }
  } else {
    const chunky=style==='rally'||style==='tractor'||style==='logging';
    for(const [x,left,right] of [[l*.28,3,6],[-l*.30,5,8]]) {
      for(const [side,i] of [[-1,left],[1,right]]) racingTyre(ctx,x,side*w*.41,chunky?10.8:8.7,chunky?6.6:5.1,sectionStage(damage[i]),chunky);
    }
    if(style==='tractor'||style==='logging') for(const y of [-1,1]) racingTyre(ctx,-l*.07,y*w*.41,8.5,6.1,0,true);
  }
  const bodyW=w*(tracked?.6:style==='hotrod'?.59:.76);
  const nose=l*(style==='dozer'?.31:.45);
  rounded(ctx,-l*.44,-bodyW/2,l*.44+nose,bodyW,style==='electric'?bodyW*.43:3,shade);
  for(const side of [-1,1]) for(let i=0;i<3;i++)
    panel(ctx,l*(.27-i*.26),side*bodyW*.38,l*.235,bodyW*.24,(side===1?6:3)+i,damage,side===1?hi:shade,1.4);
  for(let i=0;i<3;i++) {
    panel(ctx,nose-l*.085,bodyW*(i-1)*-.30,l*.185,bodyW*.29,i,damage,hi,1.4);
    panel(ctx,-l*.35,bodyW*(i-1)*.30,l*.19,bodyW*.29,9+i,damage,color,1.4);
  }
  if(style==='tank') {
    panel(ctx,-1,0,l*.45,w*.56,12,damage,hi,5);
    rounded(ctx,1,-2,24,4,1.45,shade);rounded(ctx,17,-1.7,9,3.4,1,hi);
    oval(ctx,-5,-1,4,4,shade);oval(ctx,-5,-1,2.6,2.6,hex(color,.33));
    return;
  }
  if(style==='dozer') {
    panel(ctx,-7,0,19,15,12,damage,hi,2);
    rounded(ctx,-2,-6,3,12,1,glass);rounded(ctx,-12,-6,3,12,1,glass);
    for(const y of [-1,1]) rounded(ctx,4,y*8-1.75,19,3.5,1,shade);
    polygon(ctx,[[l*.32,-w*.47],[l*.48,-w*.48],[l*.43,-w*.29],[l*.43,w*.29],[l*.48,w*.48],[l*.32,w*.47]],'#505854');
    rounded(ctx,l*.42,-w*.49,2.2,w*.98,.65,'#b1ae8e');
    for(const y of [-.38,-.19,0,.19,.38]) rounded(ctx,l*.44,w*y-1.3,3.4,2.6,.6,'#ddd0a3');
    return;
  }
  const isRig=style==='tractor'||style==='logging', box=style==='van'||isRig;
  const cx=box?l*.16:style==='hotrod'?-l*.12:0;
  const roofLength=l*(box?.38:style==='electric'?.60:.35);
  panel(ctx,cx,0,roofLength,bodyW*.79,12,damage,hi,style==='electric'?5:2.5);
  if(sectionStage(damage[12])<3) {
    rounded(ctx,cx+roofLength*.25,-bodyW*.32,roofLength*.16,bodyW*.64,1.25,glass);
    if(!isRig) rounded(ctx,cx-roofLength*.40,-bodyW*.30,roofLength*.15,bodyW*.60,1.15,shine);
  }
  for(const y of [-1,1]) {
    rounded(ctx,l*.385,y*bodyW*.32-1.35,2.7,2.7,.8,style==='electric'?'#c0ffee':'#ffedbe');
    rounded(ctx,-l*.448,y*bodyW*.32-1.25,2,2.5,.65,'#f08266');
  }
  if(style==='rally') {
    for(const y of [-1,1]) racingTyre(ctx,-l*.23,y*bodyW*.23,9,7.1,0,true);
    for(const y of [-1,1]) oval(ctx,l*.466,y*bodyW*.21,1.65,1.6,'#ffe8a5');
  } else if(style==='hotrod') {
    rounded(ctx,3,-4,11,8,1.2,'#96a098');
    for(const y of [-1,1]) rounded(ctx,4,y*4.2-1,10,2,1,'#d7cfad');
    oval(ctx,8,0,2.6,2.3,'#4b5650');
  } else if(style==='van') {
    rounded(ctx,-l*.40,-bodyW*.34,l*.57,bodyW*.68,2,hex(color,.30));
    rounded(ctx,-l*.32,-1,l*.43,2,1,shade);
  } else if(style==='mini') {
    rounded(ctx,-l*.16,-bodyW*.34,l*.30,bodyW*.68,2,'#ede2c9');
    for(const y of [-1,1]) rounded(ctx,l*.24,y*3-1,6,2,1,'#ebd8ad');
  } else if(style==='electric') {
    polygon(ctx,[[7,-1],[2,4],[2,1],[-4,1],[2,-4],[2,-1]],'#a6ead6');
    rounded(ctx,l*.39,-bodyW*.24,1.25,bodyW*.48,.6,'#a6ead6');
  } else if(isRig) {
    if(!spec.trailers) oval(ctx,-l*.28,0,4.3,4.3,'#8d8e7c');
    for(const y of [-1,1]) rounded(ctx,-.5,y*bodyW*.45-1.85,6,3.7,1,'#989c88');
    rounded(ctx,l*.43,-bodyW*.21,1.1,bodyW*.42,.5,'#bdb9a0');
  } else if(style==='police') {
    const phase=options.time==null?0:Math.floor(options.time*4)%2;
    rounded(ctx,-4.5,-bodyW*.39,4,bodyW*.78,1,'#2a4140');
    const left=phase?'#b65a58':'#ff8176',right=phase?'#7dcaff':'#4c7aa4';
    rounded(ctx,-4.2,-bodyW*.36,3.2,bodyW*.34,.85,left);
    rounded(ctx,-4.2,bodyW*.02,3.2,bodyW*.34,.85,right);
    if(!options.ghost) oval(ctx,-2.7,(phase?1:-1)*bodyW*.245,4.9,4.3,phase?'#79caff54':'#ff7b744d');
  }
}
