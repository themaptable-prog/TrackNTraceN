const zeroDamage = () => Array(13).fill(0);
const sectionStage = damage => damage>=100 ? 4 : damage>=67 ? 3 : damage>=36 ? 2 : damage>0 ? 1 : 0;
function packDamage(damage) {
  return damage.reduceRight((code,points) => code*5+sectionStage(points),0);
}
function unpackDamage(code) {
  const values=[];
  for(let i=0;i<13;i++) {values.push([0,12,36,67,100][code%5]);code=Math.floor(code/5);}
  return values;
}
function panel(ctx,cx,cy,w,h,index,damage,color,r=2.5) {
  const stage=sectionStage(damage[index]);
  if(stage===4) {
    const a=index%2 ? 1 : -1;
    polygon(ctx,[[cx-w*.26,cy-h*.17],[cx+w*.27,cy-h*.15],[cx+w*.14,cy+h*.17*a],[cx-w*.1,cy+h*.3]],'#706958');
    return;
  }
  const shrink=[1,.99,.91,.73][stage], nudge=(index%2?.8:-.8)*stage;
  ctx.save();ctx.translate(cx+nudge,cy+nudge*.42);ctx.rotate(nudge*.045);
  const shade=stage ? hex(color,-stage*.118) : color;
  rounded(ctx,-w*shrink/2,-h*shrink/2,w*shrink,h*shrink,r,shade);
  rounded(ctx,-w*shrink*.32,-h*shrink*.39,w*shrink*.64,Math.max(1,h*shrink*.16),1,hex(shade,.28));
  if(stage) {
    const crease=stage>1?'#766d5f':'#ead5b19e';
    polygon(ctx,[[-w*.26,-h*.07],[w*.24,-h*.16],[w*.12,h*.07],[-w*.26,h*.08]],crease);
    if(stage>1) polygon(ctx,[[0,-h*.21],[w*.12,h*.24],[-w*.11,h*.16]],hex(shade,-.37));
  }
  ctx.restore();
}
function racingTyre(ctx,x,y,w,h,stage=0,truck=false) {
  if(stage===4) {rounded(ctx,x-2,y-2,4,4,1,'#746f58');return;}
  const twist=(stage%2?.06:-.05)*stage;
  ctx.save();ctx.translate(x,y);ctx.rotate(twist);
  rounded(ctx,-w/2,-h/2,w,h,truck?3.4:2.5,hex('#364d49',-stage*.07));
  rounded(ctx,-w*.30,-h*.46,w*.60,h*.13,1,'#6c8174');
  if(truck) for(let i=-2;i<=2;i++) rounded(ctx,i*w*.17-1,-h*.36,1.65,h*.72,.5,'#5c7166');
  else rounded(ctx,-w*.20,-h*.23,w*.40,h*.46,1.5,'#87978a');
  ctx.restore();
}
function drawVehicle(ctx,x,y,a,type,color,damage,options={}) {
  const spec=vehicles[type], l=spec.length, w=spec.width, ghost=options.ghost||false;
  const side=hex(color,-.19), hi=hex(color,.14), pale=hex(color,.33), glass='#4a716c', light='#8bb4a7';
  ctx.save();ctx.translate(x,y);ctx.rotate(a);
  if(options.scale) ctx.scale(options.scale,options.scale);
  if(!ghost) oval(ctx,1,3,l*.53,w*.46,'#263b3663');
  const put=(x,y,wide,tall,i,fill=color,r=2)=>panel(ctx,x,y,wide,tall,i,damage,fill,r);
  const sidePanels=(xs,y,sizes,heights)=>{
    for(let i=0;i<3;i++) {
      put(xs[i],y,sizes[i],heights[i],6+i,hi);
      put(xs[i],-y,sizes[i],heights[i],3+i,side);
    }
  };
  if(type===0) {
    for(const [px,s1,s2] of [[14,3,6],[-15,5,8]]) {
      racingTyre(ctx,px,-10.4,9,6,sectionStage(damage[s1]));
      racingTyre(ctx,px,10.4,9,6,sectionStage(damage[s2]));
      rounded(ctx,px-1.2,-9.8,2.4,19.6,1,'#66796a');
    }
    polygon(ctx,[[-20,-3.5],[-9,-5.4],[1,-4.8],[20,-1.8],[22,1.8],[1,4.8],[-9,5.4],[-20,3.5]],side);
    sidePanels([6,-2.5,-10.4],5.65,[7,10,6],[2.8,4.3,3.5]);
    put(20,8.2,5.4,7.6,0,pale);put(20,-8.2,5.4,7.6,2,pale);
    put(14,0,15,4.5,1,pale,1.6);
    put(-21,-7.5,5.7,6.1,9,hi);put(-21,0,6.1,8.2,10,color);put(-21,7.5,5.7,6.1,11,hi);
    put(-3.3,0,15,8.1,12,color,2.7);
    if(sectionStage(damage[12])<3) {
      rounded(ctx,-6.1,-2.9,7,5.8,2.6,'#526663');
      rounded(ctx,-2.8,-3.15,1.2,6.3,.6,'#a6b9a1');
      rounded(ctx,-12,-.9,4,1.8,.6,pale);
    }
  } else if(type===1) {
    for(const [px,left,right] of [[13,3,6],[-13,5,8]]) {
      racingTyre(ctx,px,-10.35,9.4,5.5,sectionStage(damage[left]));
      racingTyre(ctx,px,10.35,9.4,5.5,sectionStage(damage[right]));
    }
    polygon(ctx,[[-21,-9.4],[-16,-11],[16,-11],[22,-8.6],[23,7.5],[17,10.5],[-16,11],[-21,9.4]],side);
    sidePanels([12,0,-12],9.1,[11,12.2,11],[4.2,4.4,4.2]);
    put(19,7,7.7,5.8,0,hi);put(16,0,13,9.3,1,pale);put(19,-7,7.7,5.8,2,hi);
    put(-19,-7,6,5.5,9,hi);put(-16,0,9.9,9,10,color);put(-19,7,6,5.5,11,hi);
    put(-1,0,21,14.5,12,color,3.6);
    if(sectionStage(damage[12])<3) {
      polygon(ctx,[[8,-6.1],[11,-4.6],[11,4.6],[8,6.1],[4,5.2],[4,-5.2]],glass);
      polygon(ctx,[[-9,-5.9],[-6,-4.9],[-6,4.9],[-9,5.9],[-12,4.6],[-12,-4.6]],light);
      rounded(ctx,-5,-4.7,9,9.4,2.7,hi);
    }
    for(const [sy,i,j] of [[1,0,11],[-1,2,9]]) {
      if(sectionStage(damage[i])<3) rounded(ctx,21,sy*7.3-1.45,2.1,2.9,.7,'#ffedbf');
      if(sectionStage(damage[j])<3) rounded(ctx,-21,sy*7.3-1.4,1.7,2.8,.6,'#df785f');
    }
    if(sectionStage(damage[10])<4) rounded(ctx,-22,-8,2.6,16,1,side);
  } else if(type===2) {
    for(const [px,left,right] of [[14,3,6],[-14,5,8]]) {
      racingTyre(ctx,px,-12.8,13.6,9.3,sectionStage(damage[left]),true);
      racingTyre(ctx,px,12.8,13.6,9.3,sectionStage(damage[right]),true);
      rounded(ctx,px-1.3,-12,2.6,24,1,'#687a68');
    }
    rounded(ctx,-21,-6.3,42,12.6,2.5,side);
    sidePanels([11.6,0,-11.6],6.15,[9.4,10.5,9.4],[3.8,4.4,3.8]);
    put(20,5.3,6.7,4.5,0,pale);put(17,0,11.4,7.9,1,hi);put(20,-5.3,6.7,4.5,2,pale);
    put(-20,-5,5.7,4.5,9,color);put(-16,0,10.9,7.8,10,side);put(-20,5,5.7,4.5,11,color);
    put(0,0,17.2,11.1,12,hi,2.1);
    if(sectionStage(damage[12])<3) {
      rounded(ctx,4,-4,4.3,8,1.2,glass);
      rounded(ctx,-5,-4.1,8,8.2,1.8,pale);
    }
    if(sectionStage(damage[10])<3) {
      for(let i=0;i<3;i++) rounded(ctx,-17+i*2.4,-2.9,.8,5.8,.3,hi);
    }
  } else if(type===3) {
    racingTyre(ctx,18.1,0,11.5,6.3,sectionStage(damage[1]));
    racingTyre(ctx,-18.2,0,12.1,7.2,sectionStage(damage[10]));
    rounded(ctx,-14,-2.4,28,4.8,2.1,side);
    sidePanels([8.8,0,-8.8],3.65,[5.1,6.4,5.1],[2.6,2.8,2.5]);
    put(11.3,3.8,4.4,2.2,0,pale);put(11.3,-3.8,4.4,2.2,2,pale);
    put(-11.3,-3.45,4.5,2.3,9,hi);put(-11.3,3.45,4.5,2.3,11,hi);
    put(1.1,0,14.7,6.4,12,color,2.7);
    if(sectionStage(damage[12])<3) {
      oval(ctx,1,0,4.4,3.3,pale);
      rounded(ctx,-10,-1.85,7.3,3.7,1.8,'#53655c');
    }
    rounded(ctx,10,-5.05,1.55,10.1,.7,'#728475');
  } else {
    const trailerAngles=options.trailerAngles?.map(heading=>deltaAngle(a,heading));
    drawFleetBody(ctx,spec,color,damage,{...options,trailerAngles});
  }
  if(options.lights&&!spec.hover) oval(ctx,-l*.44,0,2,1.3,'#ff9670');
  ctx.restore();
}
const audioStates={both:'Music and effects',effects:'Sound effects only',music:'Music only',off:'Sound off'};
const tunes = [
  {name:'Sunset Sprint',bpm:113, lead:[0,7,10,12,10,7,3,7,0,7,12,15,12,10,7,3],roots:[40,40,43,38],tone:'triangle'},
  {name:'Pit Lane',bpm:124, lead:[0,3,7,10,7,3,2,7,0,5,10,12,14,12,10,5],roots:[43,41,46,38],tone:'triangle'},
  {name:'Marsh Drift',bpm:101, lead:[0,7,12,7,2,9,14,9,3,10,15,10,2,7,12,7],roots:[45,43,48,40],tone:'sine'},
  {name:'Copper Run',bpm:117, lead:[0,2,5,9,5,2,7,9,0,5,7,12,9,5,2,7],roots:[38,41,45,43],tone:'triangle'},
  {name:'Night Freight',bpm:88,lead:[0,null,12,10,7,null,3,5,10,7,5,null,3,null,-2,3],
    roots:[36,39,34,41],tone:'sine',syncopated:true,accent:7},
  {name:'Glass Circuit',bpm:136,lead:[0,7,11,14,16,null,14,11,9,7,11,14,19,16,null,11],
    roots:[42,45,38,40],tone:'triangle',syncopated:true,accent:4},
  {name:'After the Rain',bpm:96,lead:[7,null,9,12,14,null,12,9,5,null,7,9,12,7,5,null],
    roots:[43,40,36,38],tone:'sine',syncopated:true,accent:9},
  {name:'Switchback Shuffle',bpm:126,lead:[0,3,null,7,10,7,6,null,5,0,3,null,12,10,7,5],
    roots:[41,44,46,39],tone:'triangle',syncopated:true,accent:3}
];
let lastShuffledTune=-1;
function chooseTune(choice) {
  if(Number.isInteger(choice)&&tunes[choice]) return choice;
  const excluded=lastShuffledTune>=0?1:0;
  const pick=Math.floor(Math.random()*(tunes.length-excluded));
  lastShuffledTune=excluded&&pick>=lastShuffledTune?pick+1:pick;
  return lastShuffledTune;
}
const frequency = midi => 440*2**((midi-69)/12);
class GameAudio {
  constructor() {
    this.mode='both'; this.ready=false; this.step=0; this.tune=0;
  }
  unlock() {
    if(!this.ready) {
      const AudioContext=window.AudioContext || window.webkitAudioContext;
      if(!AudioContext) return;
      try {
        this.audio=new AudioContext();
        const ac=this.audio;
        this.master=ac.createGain();this.master.gain.value=.69;this.master.connect(ac.destination);
        this.music=ac.createGain();this.music.gain.value=0;this.music.connect(this.master);
        this.effects=ac.createGain();this.effects.gain.value=['both','effects'].includes(this.mode)?.55:0;this.effects.connect(this.master);
        this.engine=ac.createOscillator();this.engine.type='sawtooth';this.engine.frequency.value=61;
        this.filter=ac.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=220;
        this.engineGain=ac.createGain();this.engineGain.gain.value=0;
        this.engine.connect(this.filter);this.filter.connect(this.engineGain);this.engineGain.connect(this.effects);
        this.engine.start();
        this.noise=ac.createBuffer(1,Math.ceil(ac.sampleRate*.65),ac.sampleRate);
        const data=this.noise.getChannelData(0);
        for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
        this.air=ac.createBufferSource();this.air.buffer=this.noise;this.air.loop=true;
        this.airFilter=ac.createBiquadFilter();this.airFilter.type='bandpass';this.airFilter.Q.value=.62;
        this.airGain=ac.createGain();this.airGain.gain.value=0;
        this.air.connect(this.airFilter);this.airFilter.connect(this.airGain);this.airGain.connect(this.effects);this.air.start();
        this.ready=true;
      } catch { return; }
    }
    if(this.audio.state!=='running') this.audio.resume().catch(()=>{});
  }
  setMode(value) {
    this.mode=value;
    if(this.ready) this.effects.gain.setTargetAtTime(['both','effects'].includes(value)?.55:0,this.audio.currentTime,.04);
  }
  begin(tune) {
    this.tune=tunes[tune]?tune:0;this.step=0;
    this.next=this.ready?this.audio.currentTime+.03:0;
  }
  tone(out,when,f,len,amp,type='sine',end=f) {
    const ac=this.audio, wave=ac.createOscillator(), gain=ac.createGain();
    wave.type=type;wave.frequency.setValueAtTime(f,when);wave.frequency.exponentialRampToValueAtTime(Math.max(9,end),when+len);
    gain.gain.setValueAtTime(.0001,when);gain.gain.linearRampToValueAtTime(amp,when+.009);
    gain.gain.exponentialRampToValueAtTime(.0001,when+len);
    wave.connect(gain);gain.connect(out);wave.start(when);wave.stop(when+len+.01);
  }
  noiseHit(out,when,length,hz,volume,type='bandpass',end=hz) {
    const ac=this.audio, source=ac.createBufferSource(), band=ac.createBiquadFilter(), gain=ac.createGain();
    source.buffer=this.noise;band.type=type;band.Q.value=type==='bandpass'?3.2:.65;
    band.frequency.setValueAtTime(hz,when);band.frequency.exponentialRampToValueAtTime(end,when+length);
    gain.gain.setValueAtTime(.0001,when);gain.gain.linearRampToValueAtTime(volume,when+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,when+length);
    source.connect(band);band.connect(gain);gain.connect(out);source.start(when,Math.random()*.15);source.stop(when+length+.01);
  }
  engage(type) {
    const spec=vehicles[type];
    if(spec.hover||spec.style==='electric') return;
    if(!this.ready||!['both','effects'].includes(this.mode)) return;
    const pitch=spec.engine||53, heavy=spec.blade||spec.style==='tank';
    this.tone(this.effects,this.audio.currentTime+.004,pitch,heavy?.36:.24,.105,'triangle',pitch*(heavy?1.48:2.38));
  }
  effect(name,strength=1) {
    if(!this.ready || !['both','effects'].includes(this.mode)) return;
    const t=this.audio.currentTime+.004, out=this.effects;
    if(name==='launch'||name==='brake') {
      const braking=name==='brake';
      this.noiseHit(out,t,braking?.32:.27,braking?2080:1290,.29*strength,'bandpass',braking?710:2340);
      this.tone(out,t,braking?970:490,.17,.033*strength,'triangle',braking?330:1380);
    }
    if(name==='curb') for(const gap of [0,.056]) {
      this.tone(out,t+gap,128,.095,.11*strength,'triangle',49);
      this.noiseHit(out,t+gap,.091,390,.13*strength,'lowpass',220);
    }
    if(name==='rub') this.noiseHit(out,t,.21,1080,.118*strength,'bandpass',495);
    if(name==='prop') this.noiseHit(out,t,.13,620,.19*strength,'bandpass',255);
    if(name==='water') this.noiseHit(out,t,.28,680,.30*strength,'bandpass',1290);
    if(name==='rough') this.noiseHit(out,t,.12,350,.072*strength,'lowpass',230);
    if(name==='impact') {
      this.tone(out,t,94,.2,.19*strength,'triangle',35);
      this.noiseHit(out,t,.185,940,.26*strength,'bandpass',380);
    }
    if(name==='finish') [60,64,67,72].forEach((n,i)=>this.tone(out,t+i*.074,frequency(n),.25,.14,'triangle'));
  }
  tick(active,intense,speed,type,engaged) {
    if(!this.ready) return;
    const now=this.audio.currentTime,spec=vehicles[type],r=clamp(speed/spec.max,0,1.25);
    const moving=active&&engaged, electric=spec.style==='electric';
    const oscillator=spec.engineTone||'sawtooth';
    if(this.engine.type!==oscillator) this.engine.type=oscillator;
    this.engineGain.gain.setTargetAtTime(moving&&!spec.hover?(electric?.052+.073*r:.037+.072*r):0,now,.045);
    const pitch=spec.engine??[75,60,42,89][type]??55;
    this.engine.frequency.setTargetAtTime(pitch*(1+r*(spec.engineRange||1.77)),now,.05);
    const low=spec.style==='tank'||spec.blade;
    this.filter.frequency.setTargetAtTime(electric?650+r*650:low?88+174*r:140+460*r,now,.075);
    this.airGain.gain.setTargetAtTime(moving&&spec.hover?.48*clamp(r,0,1):0,now,.10);
    this.airFilter.frequency.setTargetAtTime(360+870*r,now,.09);
    const playMusic=active&&['both','music'].includes(this.mode);
    this.music.gain.setTargetAtTime(playMusic?.38:0,now,.06);
    if(!playMusic) {this.next=now+.035;return;}
    const tune=tunes[this.tune];
    if(this.next<now-.03) this.next=now+.025;
    while(this.next<now+.095) {
      const beat=this.step%16, chord=Math.floor(this.step/16)%4;
      const root=tune.roots[chord], tick=60/(tune.bpm*(intense?1.15:1))/4;
      const t=this.next, out=this.music;
      const note=tune.lead[beat];
      if(note!=null&&(beat%2===0||intense||tune.syncopated)) {
        this.tone(out,t,frequency(root+24+note),tick*(intense?1.18:1.6),beat%4===0?.15:.075,tune.tone);
      }
      if(tune.accent&&(beat===2||beat===10)) {
        this.tone(out,t,frequency(root+12+tune.accent),tick*3.4,.055,'sine');
      }
      if(beat%4===0||beat===10) {
        this.tone(out,t,frequency(root-(beat===10?5:0)),tick*2.8,.23,'triangle');
        this.tone(out,t,92,.125,.26,'sine',39);
      }
      if(beat===4||beat===12) this.noiseHit(out,t,.12,1600,intense?.19:.14,'bandpass',860);
      if(beat%2===0||intense) this.noiseHit(out,t,.045,5100,beat%4===0?.057:.095,'highpass',4200);
      this.next+=tick*(tune.syncopated?(beat%2===0?1.13:.87):1);this.step++;
    }
  }
}
const audio = new GameAudio();
