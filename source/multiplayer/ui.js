// Multiplayer UI: pairing screens, lobby, input capture and race presentation.
let networkRoom=null;
let networkScanner=null;
let lanOwnerKey=null;
let networkRaceView=null;
let networkPointerId=null;
const netText=(id,text)=>{$(id).textContent=text;};
const netStatus=text=>netText('net-status',text);
const netSelect=(id,entries,selected)=>{
  const control=$(id);
  control.replaceChildren(...entries.map(([value,label])=>new Option(label,String(value))));
  control.value=String(selected);
};
function openMultiplayer() {
  closeModal();$('setup').hidden=true;$('multiplayer').hidden=false;
  renderNetworkLobby();
}
function closeMultiplayer() {
  leaveNetworkRoom();
  $('multiplayer').hidden=true;$('setup').hidden=false;$('net-open').focus();
}
function leaveNetworkRoom(message='') {
  stopNetworkScan();
  const room=networkRoom;networkRoom=null;
  if(room) room.link?.close();
  if(run?.network) leaveNetworkRace();
  $('net-pair').hidden=true;
  $('net-code').value='';$('net-code-out').value='';
  $('net-lan-link').hidden=true;$('net-address-row').hidden=true;
  renderNetworkLobby();
  netStatus(message);
}
function localNetworkDriver() {
  let name='';
  try {name=localStorage.getItem('tnt-multiplayer-name')||'';} catch {}
  return networkDriver({name,type:options.type,color:options.colors[options.type]});
}
function makeNetworkRoom(host,mode) {
  leaveNetworkRoom();
  const room={host,mode,id:host?'host':null,phase:'waiting',players:[],settings:null,turn:null,round:null,pendingPeer:null,draft:localNetworkDriver()};
  if(host) {
    room.phase='lobby';room.players.push({id:'host',...room.draft,name:room.draft.name||'Host',ready:false});
    room.settings=networkSeedSettings();room.turn='host';
  }
  const events={
    open:id=>{if(networkRoom!==room) return;if(room.host) room.pendingPeer=id;else sendNetworkHello(room,id);},
    message:(id,packet)=>{if(networkRoom===room) networkMessage(room,id,packet);},
    leave:(id,reason)=>{if(networkRoom===room) networkDeparture(room,id,reason);}
  };
  room.link=mode==='direct'?new DirectRoomConnection(host,events):new LanRoomConnection(host,events);
  networkRoom=room;openMultiplayer();
  return room;
}
function sendNetworkHello(room,id) {
  room.hostId=id;
  room.link.send(id,{kind:'hello',version:multiplayerVersion,driver:room.draft});
}
function networkDeparture(room,id,reason) {
  if(!room.host||id==='lan') {leaveNetworkRoom(reason||'The room closed.');return;}
  if(room.pendingPeer===id) room.pendingPeer=null;
  const player=room.players.find(p=>p.id===id);
  if(!player) {netStatus(reason||'Pairing ended.');return;}
  room.players=room.players.filter(p=>p.id!==id);
  if(room.phase==='lobby'&&room.turn===id) room.turn=room.players[0].id;
  if(room.phase==='lobby') resetNetworkReady(room);
  room.round?.withdraw(id);
  sendNetworkLobby(room);
  netStatus(player.name+' disconnected.');
}
function transmitNetwork(room,packet) {
  for(const player of room.players) if(player.id!=='host') room.link.send(player.id,packet);
}
function sendNetworkLobby(room) {
  transmitNetwork(room,{kind:'lobby',players:room.players,turn:room.turn,settings:room.settings,phase:room.phase});
  renderNetworkLobby();
}
function resetNetworkReady(room) {
  for(const player of room.players) player.ready=false;
}
function manageNetworkLobby(room,id,packet) {
  const player=room.players.find(p=>p.id===id);
  if(packet.kind==='hello') {
    const error=packet.version!==multiplayerVersion?'Both devices must use Track N Trace v'+multiplayerVersion+'.':
      room.phase!=='lobby'?'A race is running. Try again when the host returns to the lobby.':
      room.players.length>=maxNetworkPlayers&&!player?'The room is full.':'';
    if(error) {room.link.send(id,{kind:'reject',error});return;}
    if(!player) {
      const driver=networkDriver(packet.driver);
      room.players.push({id,...driver,name:driver.name||'Driver '+(room.players.length+1),ready:false});
      resetNetworkReady(room);
    }
    room.link.send(id,{kind:'welcome',id,version:multiplayerVersion});
    if(room.mode==='direct') {$('net-pair').hidden=true;stopNetworkScan();}
    sendNetworkLobby(room);netStatus('Player joined.');
    return;
  }
  if(!player) return;
  if(room.phase==='race') {
    if(packet.kind==='input') room.round.input(id,packet.rows);
    if(packet.kind==='withdraw') room.round.withdraw(id);
    return;
  }
  if(room.phase!=='lobby') return;
  if(packet.kind==='driver') {
    const driver=networkDriver(packet.driver);
    Object.assign(player,{...driver,name:driver.name||player.name,ready:false});
  } else if(packet.kind==='ready') player.ready=packet.ready===true;
  else if(packet.kind==='settings'&&id===room.turn) {
    try {room.settings=networkSettings(packet.settings);resetNetworkReady(room);}
    catch(error) {
      if(id==='host') netStatus(error.message);
      else room.link.send(id,{kind:'notice',text:error.message});
    }
  } else return;
  sendNetworkLobby(room);
}
function networkMessage(room,id,packet) {
  if(room.host) {manageNetworkLobby(room,id,packet);return;}
  if(room.hostId!==id) return;
  if(packet.kind==='reject') {leaveNetworkRoom(packet.error);return;}
  if(packet.kind==='notice') {netStatus(packet.text);return;}
  if(packet.kind==='welcome') {
    if(packet.version!==multiplayerVersion) {leaveNetworkRoom('Both devices must use Track N Trace v'+multiplayerVersion+'.');return;}
    room.id=packet.id;$('net-pair').hidden=true;stopNetworkScan();netStatus('Connected.');
  }
  if(!room.id) return;
  if(packet.kind==='lobby') {
    room.players=packet.players;room.settings=packet.settings;room.turn=packet.turn;room.phase=packet.phase;
    if(packet.phase==='lobby'&&run?.network) leaveNetworkRace();
    renderNetworkLobby();
  } else if(packet.kind==='round') {
    try {
      room.phase='race';
      enterNetworkRace(room,packet);
    } catch(error) {leaveNetworkRoom(error.message);}
  } else if(packet.kind==='snapshot'&&packet.id===networkRaceView?.id) {
    receiveNetworkSnapshot(room,packet);
  }
}
function localNetworkAction(packet) {
  const room=networkRoom;
  if(!room) return;
  if(room.host) manageNetworkLobby(room,'host',packet);
  else room.link.send(room.hostId,packet);
}
function drawNetworkQR(canvas,value) {
  const code=qrcode(0,'M');code.addData(value);code.make();
  const count=code.getModuleCount(),cell=Math.max(3,Math.floor(560/(count+8))),side=(count+8)*cell;
  canvas.width=canvas.height=side;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,side,side);
  ctx.fillStyle='#111';
  for(let y=0;y<count;y++) for(let x=0;x<count;x++)
    if(code.isDark(y,x)) ctx.fillRect((x+4)*cell,(y+4)*cell,cell,cell);
}
function showNetworkPair(title,text,code='',action='') {
  stopNetworkScan();netText('net-pair-title',title);netText('net-pair-help',text);
  $('net-pair').hidden=false;$('net-pair').dataset.action=action;
  $('net-hide-pair').hidden=!networkRoom?.host;
  $('net-code').value='';$('net-code-out').value=code;
  $('net-qr-wrap').hidden=!code;$('net-code-entry').hidden=!action;
  $('net-camera').hidden=!navigator.mediaDevices?.getUserMedia;
  if(code) drawNetworkQR($('net-qr'),code);
  $('net-pair').scrollIntoView?.({block:'nearest'});
}
async function makeNetworkInvite() {
  const room=networkRoom;
  if(room.busy||room.phase!=='lobby') return;
  try {
    room.busy=true;renderNetworkLobby();netStatus('Making an invite…');
    const code=await room.link.invite();
    if(networkRoom!==room) return;
    showNetworkPair('Invite a player','Have the guest open Multiplayer → Join direct and scan this QR. Then scan the reply shown on their device.',code,'answer');
    netStatus('');
  } catch(error) {if(networkRoom===room) netStatus(error.message);}
  finally {room.busy=false;if(networkRoom===room) renderNetworkLobby();}
}
async function applyNetworkCode(input) {
  const room=networkRoom,action=$('net-pair').dataset.action;
  const code=input.trim();
  if(!room||!action||room.busy||!code) return;
  stopNetworkScan();room.busy=true;netStatus('Connecting…');
  try {
    if(action==='offer') {
      const reply=await room.link.answer(code);
      if(networkRoom!==room) return;
      showNetworkPair('Reply to the host','Have the host scan this reply to finish pairing.',reply);
    } else {
      await room.link.accept(code);
      if(networkRoom===room) $('net-pair').hidden=true;
    }
  } catch(error) {if(networkRoom===room) netStatus(error.message);}
  finally {room.busy=false;if(networkRoom===room) renderNetworkLobby();}
}
function stopNetworkScan() {
  for(const track of networkScanner?.stream?.getTracks()||[]) track.stop();
  networkScanner=null;
  const video=$('net-video');
  if(video) {video.srcObject=null;video.hidden=true;}
}
function readNetworkImage(source,width,height) {
  if(!width||!height) return '';
  const ratio=Math.min(1,1150/Math.max(width,height));
  const canvas=$('net-scan-canvas');
  canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
  return window.jsQR(frame.data,frame.width,frame.height,{inversionAttempts:'dontInvert'})?.data||'';
}
async function scanNetworkCamera() {
  stopNetworkScan();
  const scanner={stream:null};networkScanner=scanner;
  try {
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
    if(networkScanner!==scanner) {for(const track of stream.getTracks()) track.stop();return;}
    scanner.stream=stream;
    const video=$('net-video');video.srcObject=stream;video.hidden=false;
    await video.play();
    const scan=()=>{
      if(networkScanner!==scanner) return;
      const code=readNetworkImage(video,video.videoWidth,video.videoHeight);
      if(code) applyNetworkCode(code);
      else setTimeout(scan,160);
    };
    scan();
  } catch {
    if(networkScanner===scanner) {stopNetworkScan();netStatus('Camera unavailable. Take a photo of the QR and choose it, or paste the pairing code.');}
  }
}
async function scanNetworkFile(file) {
  if(!file) return;
  stopNetworkScan();
  const room=networkRoom;
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();image.src=url;await image.decode();
    if(networkRoom!==room) return;
    const code=readNetworkImage(image,image.naturalWidth,image.naturalHeight);
    if(!code) throw Error();
    await applyNetworkCode(code);
  } catch {if(networkRoom===room) netStatus('No QR found in that image. Try a closer, sharper photo.');}
  finally {URL.revokeObjectURL(url);}
}
async function openLanRoom(host,secret) {
  const room=makeNetworkRoom(host,'lan');room.phase='waiting';renderNetworkLobby();
  try {
    netStatus('Connecting to the laptop…');
    const result=await room.link.join(secret);
    if(networkRoom!==room) return;
    if(host) {
      room.phase='lobby';room.lanKey=result.invite;room.addresses=result.addresses;room.address=result.address;
      showLanInvite(room);
      netStatus('LAN lobby is open.');
      renderNetworkLobby();
    } else {
      if(location.hash) history.replaceState(null,'',location.pathname+location.search);
      sendNetworkHello(room,'host');
    }
  } catch(error) {if(networkRoom===room) leaveNetworkRoom(error.message);}
}
function showLanInvite(room) {
  const url=room.address+'/#lan='+room.lanKey;
  showNetworkPair('Join on another device','Scan this QR with your phone or tablet’s Camera app. Open the link to join.',url);
  $('net-lan-link').href=url;$('net-lan-link').textContent=url;$('net-lan-link').hidden=false;
  netSelect('net-address',room.addresses.map(value=>[value,value]),room.address);
  $('net-address-row').hidden=room.addresses.length<2;
}
function renderNetworkLobby() {
  const room=networkRoom;
  $('net-entry').hidden=!!room;
  $('net-reopen-lan').hidden=!lanOwnerKey;
  $('net-lobby').hidden=!room?.id||room.phase!=='lobby';
  $('net-leave').hidden=!room;
  if(!room?.id||room.phase!=='lobby') return;
  const own=room.players.find(p=>p.id===room.id);
  const chooser=room.players.find(p=>p.id===room.turn);
  if(!own||!room.settings) return;
  const canChoose=chooser===own;
  netText('net-turn',canChoose?'Your turn to choose the course and rules.':
    (chooser?.name||'Host')+' is choosing the course and rules.');
  const rows=$('net-roster');rows.replaceChildren();
  for(const player of room.players) {
    const row=document.createElement('li');
    const name=document.createElement('strong');name.textContent=player.name+(player===own?' (you)':'');
    const swatch=document.createElement('span');swatch.className='net-car-colour';
    swatch.style.background=vehicles[player.type].palette[player.color];
    const details=document.createTextNode(vehicles[player.type].name);
    const ready=document.createElement('span');ready.className='net-ready';
    ready.textContent=player.ready?'Ready':'Choosing';ready.dataset.ready=String(player.ready);
    row.append(swatch,name,details,ready);
    if(room.host&&player!==own) {
      const remove=button('Remove',()=>room.link.remove(player.id,'Removed from the room.',true));
      remove.setAttribute('aria-label','Remove '+player.name);row.append(remove);
    }
    rows.append(row);
  }
  if(document.activeElement!==$('net-name')) $('net-name').value=own.name;
  $('net-vehicle').value=String(own.type);
  const paint=vehicles[own.type].palette.map((c,i)=>[i,paintChoices.find(p=>p[1]===c)?.[0]||c]);
  netSelect('net-paint',paint,own.color);
  const settings=room.settings;
  const choices=networkCourseOptions().map(c=>[c.id,c.name]);
  if(!choices.some(c=>c[0]===settings.course)&&settings.courseFile) choices.push([settings.course,settings.courseFile.name]);
  netSelect('net-course',choices,settings.course);
  const course=courses.find(c=>c.id===settings.course);
  const isArena=!!(course?.arena||settings.courseFile?.arena);
  const forceDamage=course?.damageEvent||settings.courseFile?.damageEvent;
  $('net-event').value=settings.event;$('net-event').disabled=!canChoose||forceDamage;
  $('net-damage').value=settings.damage;
  $('net-steer').value=settings.drag;
  $('net-music').value=settings.music==null?'shuffle':String(settings.music);
  $('net-laps').value=String(settings.laps);$('net-laps-row').hidden=isArena;
  $('net-hazards-row').hidden=!course?.hazards?.length;
  $('net-hazards').value=settings.hazards?'on':'off';
  for(const id of ['net-course','net-damage','net-steer','net-laps','net-hazards','net-music']) $(id).disabled=!canChoose;
  netText('net-ready-button',own.ready?'Cancel ready':'Ready');
  $('net-start').hidden=!room.host;
  $('net-start').disabled=room.players.length<2||!room.players.every(p=>p.ready);
  $('net-invite').hidden=!room.host;
  $('net-invite').disabled=room.busy||room.players.length>=maxNetworkPlayers;
}
function submitNetworkDriver() {
  const driver={name:$('net-name').value,type:Number($('net-vehicle').value),color:Number($('net-paint').value)};
  const room=networkRoom, own=room?.players.find(p=>p.id===room.id);
  if(!own) return;
  if(driver.type!==own.type) driver.color=0;
  try {localStorage.setItem('tnt-multiplayer-name',networkName(driver.name));} catch {}
  localNetworkAction({kind:'driver',driver});
}
function submitNetworkSettings() {
  const room=networkRoom;
  if(room?.turn!==room?.id) return;
  const course=courses.find(c=>c.id===$('net-course').value);
  const courseFile=course?.courseFile||(room.settings.courseFile?.id===$('net-course').value?room.settings.courseFile:undefined);
  localNetworkAction({kind:'settings',settings:{course:$('net-course').value,courseFile,
    laps:Number($('net-laps').value),event:$('net-event').value,damage:$('net-damage').value,
    drag:$('net-steer').value,hazards:$('net-hazards').value==='on',music:musicChoice($('net-music').value)}});
}
function networkBegin() {
  const room=networkRoom;
  if(!room?.host||room.phase!=='lobby'||room.players.length<2||!room.players.every(p=>p.ready)) return;
  let round;
  try {round=new NetworkRound(room.settings,room.players.map(p=>({...p})),networkToken(),room.id);}
  catch(error) {netStatus('Could not prepare the course '+error.message);return;}
  room.round=round;room.phase='race';
  const packet={kind:'round',id:round.id,settings:room.settings,players:round.players,tune:round.tune,snapshot:round.snapshot()};
  transmitNetwork(room,packet);
  enterNetworkRace(room,packet,round.local);
  fullscreen();
}
function enterNetworkRace(room,packet,hostGame=null) {
  stopNetworkScan();closeModal();audio.unlock();
  const course=hostGame?.course||networkCourse(packet.settings);
  const player=packet.players.find(p=>p.id===room.id), settings=packet.settings;
  if(!player) throw Error('Your player is missing from this round.');
  const config={type:player.type,color:player.color,laps:settings.laps,mode:settings.event,
    damage:settings.damage,drag:settings.drag,hazards:settings.hazards};
  const game=hostGame||makeRun(config,null,course);
  Object.assign(game,{network:true,networkId:room.id,networkRemote:false,started:true,tune:packet.tune,
    networkPlayers:packet.players});
  networkRaceView={id:packet.id,players:packet.players,settings,snapshot:packet.snapshot,prev:null,entered:performance.now(),
    inputs:[],flushAt:0,seenImpact:null,done:false};
  $('multiplayer').hidden=true;
  showGame(game);
  receiveNetworkSnapshot(room,packet.snapshot);
}
function networkCountdownValue() {return networkRoom?.round?.countdown??networkRaceView?.snapshot?.countdown??0;}
function renderNetworkControls() {
  $('run-controls').hidden=true;$('finish-controls').hidden=true;
  $('pause').disabled=false;$('pause').textContent='☰';$('pause').setAttribute('aria-label','Race menu');
}
function stopNetworkPointer() {
  const pointer=networkPointerId;
  if(pointer==null) return;
  networkPointerId=null;
  if($('track').hasPointerCapture(pointer)) $('track').releasePointerCapture(pointer);
  if(run?.network&&!networkRaceView?.done) {
    const time=performance.now();
    if(!networkRoom?.host) drivePointerEnd(run,false,time);
    queueNetworkInput([['cancel',0,0,time]],true);
  }
}
function queueNetworkInput(rows,flush=false) {
  const room=networkRoom, view=networkRaceView;
  if(!room||!view) return;
  if(room.host) room.round?.input(room.id,rows);
  else {
    view.inputs.push(...rows);
    if(flush||view.inputs.length>=48) flushNetworkInput();
  }
}
function flushNetworkInput() {
  const view=networkRaceView;
  if(!view?.inputs.length) return;
  localNetworkAction({kind:'input',rows:view.inputs.splice(0,70)});
  view.flushAt=performance.now()+30;
}
function networkPointer(kind,event) {
  const view=networkRaceView;
  if(!view||view.done||run.finished||networkCountdownValue()>0||!$('rotation').hidden||!$('modal').hidden) return;
  const pointer=event.pointerId, time=event.timeStamp??performance.now();
  if(kind==='down') {
    if(networkPointerId!=null||(run.config.drag==='free'&&dist(inputPoint(event),run.car)>60)) return;
    event.preventDefault();audio.unlock();networkPointerId=pointer;$('track').setPointerCapture(pointer);
  } else if(pointer!==networkPointerId) return;
  const events=kind==='move'?(event.getCoalescedEvents?.()||[]):[];
  const rows=(events.length?events.slice(-36):[event]).map(e=>{
    const point=kind==='down'||kind==='move'?inputPoint(e):{x:0,y:0};
    return [kind,point.x,point.y,e.timeStamp??time];
  });
  if(!networkRoom.host&&run.config.drag==='trace') {
    for(const [type,x,y,t] of rows) {
      if(type==='down') drivePointerStart(run,{x,y},pointer,t);
      else if(type==='move') drivePointerMove(run,{x,y},t);
      else drivePointerEnd(run,type==='up',t);
    }
  }
  if(kind==='up'||kind==='cancel') networkPointerId=null;
  queueNetworkInput(rows,kind!=='move');
}
function receiveNetworkSnapshot(room,snapshot) {
  const view=networkRaceView;
  if(!view||snapshot.id!==view.id) return;
  if(room.host) view.snapshot=snapshot;
  else {
    view.prev=view.snapshot;view.snapshot=snapshot;view.entered=performance.now();
    const state=snapshot.cars.find(c=>c.id===room.id);
    if(!state) return;
    const impact=state.impact;
    if(impact&&impact.t!==view.seenImpact) {
      view.seenImpact=impact.t;
      audio.effect(impact.prop?'prop':'impact',impact.strength);
      spark(run,impact.x,impact.y,'impact',impact.strength,Math.atan2(-impact.ny,-impact.nx),impact.burst||1);
    }
    run.props=snapshot.props.map(([type,x,y,a,level,routeIndex])=>({type,x,y,a,level,routeIndex:routeIndex??undefined}));
    run.splits=state.splits;run.elapsed=state.finishTime??snapshot.elapsed;run.progress=state.progress;
    run.cargo=state.cargo;run.finished=!!state.result;run.networkResult=state.result;
    run.car.score=[state.score,0,0];
  }
  renderNetworkRaceHud();
  if(snapshot.done&&!view.done) {
    view.done=true;stopNetworkPointer();
    if(!$('rotation').hidden) $('rotation').hidden=true;
    showNetworkResults();
  }
}
function updateNetworkRace(dt) {
  const room=networkRoom,view=networkRaceView;
  if(!room||!view||view.done) return;
  if(room.host) {
    if(room.round.step(dt)) {
      const snapshot=room.round.snapshot();
      transmitNetwork(room,snapshot);receiveNetworkSnapshot(room,snapshot);
    }
  } else {
    if(performance.now()>=view.flushAt) flushNetworkInput();
    const state=shownNetworkCar(room.id);
    if(state) {
      const moved=dist(run.car,state);
      Object.assign(run.car,state,{score:[state.score,0,0]});run.totalDistance+=moved;
      if(moved>.15) addTrail(run);
      if(run.route.length) shiftRoute(run);
    }
    updateEffects(run,dt);
  }
}
function shownNetworkCar(id) {
  const view=networkRaceView;
  if(networkRoom?.host) {
    const game=networkRoom.round?.drivers.get(id);
    return game&&{...game.car,cargo:game.cargo,result:game.networkResult};
  }
  const now=view?.snapshot.cars.find(car=>car.id===id), before=view?.prev?.cars.find(car=>car.id===id);
  if(!now||!before) return now;
  const blend=clamp((performance.now()-view.entered)/55,0,1);
  const heading=(a,b)=>a+deltaAngle(a,b)*blend;
  return {...now,x:mix(before.x,now.x,blend),y:mix(before.y,now.y,blend),a:heading(before.a,now.a),
    trailerAngles:now.trailerAngles?.map((a,i)=>heading(before.trailerAngles?.[i]??a,a))};
}
function drawNetworkOpponents(ctx,game) {
  for(const player of game.networkPlayers) {
    if(player.id===game.networkId) continue;
    const state=shownNetworkCar(player.id);
    if(!state||state.result==='Disconnected') continue;
    ctx.save();
    if(routeLevelAt(game.course,state.index)!==routeLevelAt(game.course,game.car.index)&&dist(state,game.car)<100) ctx.globalAlpha=.33;
    drawVehicle(ctx,state.x,state.y,state.a,player.type,vehicles[player.type].palette[player.color],state.damage,
      {time:game.elapsed,trailerAngles:state.trailerAngles,cargo:state.cargo});
    drawNetworkLabel(ctx,game,state,player.id);ctx.restore();
  }
}
function drawNetworkLabel(ctx,game,pose,id) {
  const index=game.networkPlayers.findIndex(p=>p.id===id),player=game.networkPlayers[index];
  if(!player) return;
  const label=(index+1)+' '+(id===game.networkId?'You':player.name);
  const x=clamp(pose.x,48,W-48),y=Math.max(18,pose.y-23);
  ctx.save();ctx.font='700 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
  const width=ctx.measureText(label).width+11;
  rounded(ctx,x-width/2,y-8,width,16,4,'#192e29ed');
  ctx.fillStyle=['#ffe191','#aaf4d0','#b8d4ff','#ffbdda'][index];ctx.fillText(label,x,y+.5);ctx.restore();
}
function renderNetworkRaceHud() {
  const view=networkRaceView;
  const state=view.snapshot.cars.find(c=>c.id===networkRoom.id);
  const count=view.snapshot.countdown;
  $('net-race-hud').hidden=false;
  netText('net-race-hud',count>0?'Starting in '+Math.ceil(Math.min(3,count)):
    state?.result?state.result+' · waiting for the other drivers':
      view.snapshot.cars.filter(c=>c.result).length+' / '+view.players.length+' finished');
}
function leaveNetworkRace() {
  stopNetworkPointer();
  run=null;networkRaceView=null;$('play').hidden=true;$('net-race-hud').hidden=true;
  $('multiplayer').hidden=false;closeModal();renderNetworkLobby();
}
function showNetworkResults() {
  const room=networkRoom, view=networkRaceView;
  if(!room||!view?.done) return;
  openModal('net-result','Race results',body=>{
    const rows=document.createElement('ol');rows.className='net-results';
    for(const result of networkResults(view.snapshot,view.settings,view.players)) {
      const row=document.createElement('li'),name=document.createElement('strong');
      name.textContent=result.name;
      const score=view.settings.event==='damage'?result.score.toLocaleString()+' pts':
        result.result==='Finished'?clock(result.finishTime):'';
      const status=result.result==='Finished'?'':result.result||'Did not finish';
      row.append(name,document.createTextNode([score,status].filter(Boolean).join(' · ')));rows.append(row);
    }
    body.append(rows);
    if(!room.host) body.append(paragraph('The host can return everyone to the lobby.'));
    setModalActions(button('Leave room',()=>leaveNetworkRoom('You left the room.')),
      ...(room.host?[button('Next round',networkNextRound,'primary')]:[]));
  });
}
function networkNextRound() {
  const room=networkRoom;
  if(!room?.host||!room.round?.done) return;
  const roster=room.round.players,was=roster.findIndex(p=>p.id===room.turn);
  const following=roster.slice(was+1).concat(roster.slice(0,was+1)).find(p=>room.players.some(q=>p.id===q.id));
  room.turn=following?.id||'host';room.round=null;room.phase='lobby';
  resetNetworkReady(room);leaveNetworkRace();sendNetworkLobby(room);
  netStatus('Choose the next course and rules.');
}
function networkExitControls() {
  const room=networkRoom, view=networkRaceView;
  if(!room||!view) return;
  if(view.done) {showNetworkResults();return;}
  stopNetworkPointer();
  openModal('net-race','Race menu',body=>{
    body.append(paragraph('The race keeps running while this menu is open.'));
    const keep=button('Keep racing',closeModal),full=button('Fullscreen',()=>{fullscreen();closeModal();});
    const leave=button('Leave room',()=>leaveNetworkRoom('You left the room.'));
    if(room.host) {
      setModalActions(keep,full,leave,button('End round',()=>{
        closeModal();room.round.end('Round ended');
        const snapshot=room.round.snapshot();transmitNetwork(room,snapshot);receiveNetworkSnapshot(room,snapshot);
      }));
    } else setModalActions(keep,full,leave,button('Withdraw',()=>{
      localNetworkAction({kind:'withdraw'});closeModal();
    }));
  });
}
function initializeMultiplayer() {
  const on=(id,event,listener)=>$(id).addEventListener(event,listener);
  on('net-open','click',openMultiplayer);
  on('net-back','click',closeMultiplayer);
  on('net-leave','click',()=>leaveNetworkRoom('You left the room.'));
  on('net-host-direct','click',()=>{
    makeNetworkRoom(true,'direct');makeNetworkInvite();
  });
  on('net-join-direct','click',()=>{
    makeNetworkRoom(false,'direct');
    showNetworkPair('Scan host invite','Scan the host’s QR code. Once scanned, show your reply QR to the host.',null,'offer');
  });
  on('net-invite','click',()=>{
    if(networkRoom.mode==='direct') makeNetworkInvite();
    else showLanInvite(networkRoom);
  });
  on('net-address','change',e=>{networkRoom.address=e.target.value;showLanInvite(networkRoom);});
  on('net-scan-code','click',()=>applyNetworkCode($('net-code').value));
  on('net-copy','click',async()=>{
    const field=$('net-code-out');field.select();
    try {if(navigator.clipboard) await navigator.clipboard.writeText(field.value);else if(!document.execCommand('copy')) throw Error();netStatus('Code copied.');}
    catch {netStatus('Code selected. Use your device’s Copy command.');}
  });
  on('net-camera','click',scanNetworkCamera);
  on('net-image','change',e=>{scanNetworkFile(e.target.files?.[0]);e.target.value='';});
  on('net-hide-pair','click',()=>{$('net-pair').hidden=true;stopNetworkScan();});
  on('net-reopen-lan','click',()=>{if(lanOwnerKey) openLanRoom(true,lanOwnerKey);});
  on('net-name','change',submitNetworkDriver);
  on('net-vehicle','change',submitNetworkDriver);
  on('net-paint','change',submitNetworkDriver);
  for(const id of ['net-course','net-laps','net-event','net-damage','net-steer','net-hazards','net-music']) on(id,'change',submitNetworkSettings);
  on('net-ready-button','click',()=>{
    audio.unlock();
    const player=networkRoom.players.find(p=>p.id===networkRoom.id);
    localNetworkAction({kind:'ready',ready:!player.ready});
  });
  on('net-start','click',networkBegin);
  netSelect('net-vehicle',vehicles.map((v,i)=>[i,v.name]),0);
  netSelect('net-music',[['shuffle','Shuffle'],...tunes.map((t,i)=>[i,t.name])],'shuffle');
  netSelect('net-laps',Array.from({length:10},(_,i)=>[i+1,String(i+1)]),3);
  if(typeof location==='undefined') return;
  if(location.protocol==='http:'||location.protocol==='https:') {
    const query=new URLSearchParams(location.hash.slice(1));
    const host=query.get('host'),guest=query.get('lan');
    if(/^[a-f0-9]{48}$/.test(host||guest||'')) {
      lanOwnerKey=host;
      openLanRoom(!!host,host||guest);
    }
  }
  window.addEventListener('pagehide',()=>networkRoom?.link.close());
}
