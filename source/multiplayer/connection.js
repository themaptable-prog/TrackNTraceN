// Multiplayer connection: protocol version, offline pairing and LAN transport.
const multiplayerVersion='0.09';
const maxNetworkPlayers=4;
const maxNetworkMessage=65536;
const networkToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
const isSnapshot=packet=>packet.kind==='snapshot';

function decodeNetworkPacket(raw) {
  if(typeof raw!=='string'||raw.length>maxNetworkMessage) return null;
  try {
    const packet=JSON.parse(raw);
    return packet&&typeof packet.kind==='string'?packet:null;
  } catch {return null;}
}

async function encodePairing(data) {
  const stream=new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
  return 'TNT-'+btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
async function readPairing(code,role) {
  if(!/^TNT-[A-Za-z0-9_-]{20,2800}$/.test(code)) throw Error('This is not a Track N Trace pairing code.');
  let data;
  try {
    const bytes=Uint8Array.from(atob(code.slice(4).replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks=[];let size=0;
    for(;;) {
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.byteLength;
      if(size>12000) {await reader.cancel();throw Error();}
      chunks.push(value);
    }
    data=JSON.parse(await new Blob(chunks).text());
  } catch {throw Error('Could not read that pairing code. Try scanning again.');}
  if(data?.version!==multiplayerVersion) throw Error('Both devices must use Track N Trace v'+multiplayerVersion+'.');
  if(data.role!==role||!/^[a-f0-9]{24}$/.test(data.id)||typeof data.sdp!=='string'||
    !data.sdp.startsWith('v=0')||!/\na=candidate:/m.test(data.sdp)) throw Error('Scan the '+(role==='offer'?'host’s invite':'guest’s reply')+' code.');
  return data;
}
async function localPairing(peer,id,role) {
  await peer.setLocalDescription(role==='offer'?await peer.createOffer():await peer.createAnswer());
  if(peer.iceGatheringState!=='complete') await new Promise(resolve=>{
    const done=()=>{clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',changed);resolve();};
    const changed=()=>{if(peer.iceGatheringState==='complete'||peer.signalingState==='closed') done();};
    const timer=setTimeout(done,3600);
    peer.addEventListener('icegatheringstatechange',changed);
    changed();
  });
  const sdp=peer.localDescription?.sdp;
  if(!sdp||!/\na=candidate:/m.test(sdp)) throw Error('This browser found no local connection. Try the laptop host on this Wi-Fi.');
  return encodePairing({id,role,sdp,version:multiplayerVersion});
}
class DirectRoomConnection {
  constructor(host,events) {
    this.host=host;this.events=events;this.peers=new Map();this.closed=false;
  }
  createPeer(id) {
    if(typeof RTCPeerConnection!=='function') throw Error('This browser does not support direct pairing.');
    const pc=new RTCPeerConnection({iceServers:[]});
    const peer={pc,id,channel:null,timer:null};
    this.peers.set(id,peer);
    pc.addEventListener('connectionstatechange',()=>{
      if(['failed','closed'].includes(pc.connectionState)) this.remove(id,'The direct connection ended.',true);
      if(pc.connectionState==='disconnected'&&!peer.timer) {
        peer.timer=setTimeout(()=>this.remove(id,'The direct connection was lost.',true),6500);
      } else if(pc.connectionState==='connected'&&peer.timer) {
        clearTimeout(peer.timer);peer.timer=null;
      }
    });
    return peer;
  }
  bind(peer,channel) {
    peer.channel=channel;
    channel.onopen=()=>{clearTimeout(peer.timer);peer.timer=null;this.events.open(peer.id);};
    channel.onmessage=event=>{
      const packet=decodeNetworkPacket(event.data);
      if(packet) this.events.message(peer.id,packet);
    };
    channel.onclose=()=>this.remove(peer.id,'The other device disconnected.',true);
    channel.onerror=()=>this.remove(peer.id,'The direct connection ended.',true);
  }
  async invite() {
    if(this.pending) this.remove(this.pending.id);
    if(this.peers.size>=maxNetworkPlayers-1) throw Error('This room is full.');
    const id=networkToken(), peer=this.createPeer(id);
    this.pending=peer;
    this.bind(peer,peer.pc.createDataChannel('track-n-trace'));
    try {return await localPairing(peer.pc,id,'offer');}
    catch(error) {this.remove(id);throw error;}
  }
  async answer(code) {
    const data=await readPairing(code,'offer'),peer=this.createPeer(data.id);
    peer.pc.ondatachannel=event=>this.bind(peer,event.channel);
    try {
      await peer.pc.setRemoteDescription({sdp:data.sdp,type:'offer'});
      const reply=await localPairing(peer.pc,data.id,'answer');
      if(peer.channel?.readyState!=='open') peer.timer=setTimeout(()=>this.remove(data.id,'Pairing timed out. Make a fresh invite or use the laptop host.',true),90000);
      return reply;
    } catch(error) {this.remove(data.id);throw error;}
  }
  async accept(code) {
    const data=await readPairing(code,'answer'),peer=this.pending;
    if(!peer||data.id!==peer.id) throw Error('That reply is for a different invite. Scan the latest host QR.');
    await peer.pc.setRemoteDescription({sdp:data.sdp,type:'answer'});
    this.pending=null;
    if(peer.channel?.readyState!=='open') peer.timer=setTimeout(()=>this.remove(peer.id,'Pairing timed out. Make a fresh invite or use the laptop host.',true),16000);
  }
  send(id,packet) {
    const channel=this.peers.get(id)?.channel;
    if(channel?.readyState!=='open'||isSnapshot(packet)&&channel.bufferedAmount>24000) return;
    const raw=JSON.stringify(packet);
    if(raw.length<=maxNetworkMessage) channel.send(raw);
  }
  remove(id,reason='',notify=false) {
    const peer=this.peers.get(id);
    if(!peer) return;
    this.peers.delete(id);
    if(this.pending===peer) this.pending=null;
    clearTimeout(peer.timer);
    peer.channel?.close();peer.pc.close();
    if(notify&&!this.closed) this.events.leave(id,reason);
  }
  close() {
    this.closed=true;
    for(const id of this.peers.keys()) this.remove(id);
  }
}

class LanRoomConnection {
  constructor(host,events) {
    this.host=host;this.events=events;this.closed=false;this.outbox=[];this.sending=false;
  }
  async join(secret) {
    const response=await this.request('/lan/join',{version:multiplayerVersion,role:this.host?'host':'guest',secret});
    if(this.closed) {
      fetch('/lan/leave',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:response.key}),keepalive:true}).catch(()=>{});
      return response;
    }
    this.key=response.key;this.id=response.id;
    this.poll();
    return response;
  }
  async request(path,payload,keepalive=false) {
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),cache:'no-store',keepalive,signal:keepalive?undefined:AbortSignal.timeout(12500)});
    const data=await response.json();
    if(!response.ok) throw Object.assign(Error(data.error||'Could not reach the LAN host.'),{status:response.status});
    return data;
  }
  async poll() {
    while(!this.closed) {
      try {
        const data=await this.request('/lan/poll',{key:this.key});
        if(this.closed) return;
        for(const event of data.events) {
          if(event.kind==='message') this.events.message(event.from,event.packet);
          if(event.kind==='joined') this.events.open(event.id);
          if(event.kind==='left') this.events.leave(event.id,event.reason);
          if(this.closed) break;
        }
      } catch(error) {
        if(!this.closed) this.fail(error);
      }
    }
  }
  send(id,packet) {
    if(this.closed||!this.key) return;
    if(isSnapshot(packet)) {
      const index=this.outbox.findIndex(item=>item.to===id&&isSnapshot(item.packet));
      if(index>=0) {this.outbox[index]={to:id,packet};return;}
    }
    if(this.outbox.length>=120) {this.fail(Error('The connection could not keep up.'));return;}
    this.outbox.push({to:id,packet});
    if(!this.sending) this.flush();
  }
  async flush() {
    this.sending=true;
    while(!this.closed&&this.outbox.length) {
      const items=this.outbox.splice(0,8);
      try {await this.request('/lan/send',{key:this.key,items});}
      catch(error) {if(!this.closed) this.fail(error);}
    }
    this.sending=false;
  }
  fail(error) {
    this.close();
    this.events.leave(this.host?'lan':'host',error.status===410?error.message:'Lost contact with the laptop host.');
  }
  remove(id) {
    if(this.host&&this.key&&!this.closed) this.request('/lan/remove',{key:this.key,id}).catch(()=>{});
  }
  close() {
    if(this.closed) return;
    this.closed=true;
    if(this.key) this.request('/lan/leave',{key:this.key},true).catch(()=>{});
  }
}
