// Real WebKitGTK + real in-process WebRTC loopback, never a subscriber token or microphone.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { RTCPeerConnection, MediaStreamTrack, RTCRtpCodecParameters } from 'werift'
import { createHostVoiceMedia } from '../src/voice-host-media.js'

const root=path.resolve('.'),out=path.resolve('.artifacts/native-voice')
fs.mkdirSync(out,{recursive:true})
const require=createRequire(import.meta.url)
const {rolldown}=await import(pathToFileURL(createRequire(require.resolve('tsdown')).resolve('rolldown')).href)
const entry=`import {openVoiceCall} from ${JSON.stringify(root.replaceAll('\\','/')+'/src/voice-call.js')};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await sleep(40)}throw Error('audio deadline')};
const report={secureContext:isSecureContext,nativePeerConnection:typeof RTCPeerConnection,worklet:typeof AudioWorkletNode,noAccount:true,noRealMicrophone:true};
const phase=name=>{report.phase=name;window.webkit.messageHandlers.nativeVoiceResult.postMessage(JSON.stringify({...report,pending:true}))};
const nativeGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
let call,source,oscillator,tracks=[];
const rpc={async call(_channel,endpoint,payload,signal){const response=await fetch('/rpc/'+endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal});return response.json()}};
(async()=>{try{
  // Future engines may regain RTC; record that fact and keep exercising the explicit fallback.
  if(typeof RTCPeerConnection==='function')Object.defineProperty(window,'RTCPeerConnection',{configurable:true,value:undefined});
  phase('mock-microphone');const mock=await nativeGetUserMedia({audio:true});report.mockMicrophone=mock.getAudioTracks().some(t=>t.readyState==='live');mock.getTracks().forEach(t=>t.stop());
  phase('audio-context');source=new AudioContext();await source.resume();const destination=source.createMediaStreamDestination();oscillator=source.createOscillator();const volume=source.createGain();volume.gain.value=.15;oscillator.frequency.value=440;oscillator.connect(volume).connect(destination);oscillator.start();tracks=destination.stream.getTracks();
  navigator.mediaDevices.getUserMedia=async()=>destination.stream;
  phase('open-call');let ended=0;call=await openVoiceCall({rpc,sessionId:'native-voice-test',onEnd:()=>ended++});report.transport=call.transport;
  phase('duplex');await wait(()=>call.levels().mic>.1&&call.levels().assistant>.1);report.duplexPcm=true;
  call.setMuted(true);await sleep(120);report.muted=call.isMuted()&&call.levels().mic===0&&tracks.every(t=>!t.enabled);
  call.setOutputMuted(true);report.speakerMuted=call.isOutputMuted();call.setOutputMuted(false);
  call.setMuted(false);await wait(()=>call.levels().mic>.1);report.unmuted=true;
  phase('stop');await call.stop();await sleep(650);report.ended=ended===1;report.tracksReleased=tracks.every(t=>t.readyState==='ended');
  report.passed=report.secureContext&&report.mockMicrophone&&report.transport==='pcm'&&report.duplexPcm&&report.muted&&report.speakerMuted&&report.unmuted&&report.ended&&report.tracksReleased;
}catch(error){report.passed=false;report.error={name:error.name,code:error.code??null,message:String(error.message).slice(0,120)}}finally{
  await call?.stop();tracks.forEach(t=>t.stop());oscillator?.stop();await Promise.race([source?.close(),sleep(1000)]);
  document.body.textContent=JSON.stringify(report,null,2);window.webkit.messageHandlers.nativeVoiceResult.postMessage(JSON.stringify(report));
}})();`
const built=await rolldown({input:'virtual:native-voice',platform:'browser',plugins:[{name:'native-voice',resolveId:id=>id==='virtual:native-voice'?id:undefined,load:id=>id==='virtual:native-voice'?entry:undefined}]})
const generated=await built.generate({format:'iife'});await built.close()
const html='<!doctype html><meta charset="utf-8"><title>Native voice loopback acceptance</title><body>Testing synthetic audio only<script>'+generated.output[0].code.replaceAll('</script','<\\/script')+'</script>'
const peers=new Set()
let active=0,exchanges=0
const media=createHostVoiceMedia({onStop(){active--}})
const server=http.createServer(async(req,res)=>{
  if(req.url==='/'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(html);return}
  if(req.method!=='POST'||!req.url.startsWith('/rpc/voice/')){res.writeHead(404).end();return}
  let body=''
  for await(const piece of req){body+=piece;if(body.length>40000){res.writeHead(413).end();return}}
  try {
    const payload=JSON.parse(body),endpoint=req.url.slice('/rpc/'.length)
    let value={}
    if(endpoint==='voice/start') {
      const peer=new RTCPeerConnection({codecs:{audio:[new RTCRtpCodecParameters({mimeType:'audio/opus',clockRate:48000,channels:2,payloadType:111})]},iceServers:[],bundlePolicy:'max-bundle'})
      peers.add(peer)
      const echo=new MediaStreamTrack({kind:'audio'});peer.addTrack(echo)
      peer.onTrack.subscribe(track=>track.onReceiveRtp.subscribe(packet=>echo.writeRtp(packet)))
      active++
      value=await media.start({sessionId:payload.sessionId,negotiate:async sdp=>{await peer.setRemoteDescription({type:'offer',sdp});await peer.setLocalDescription(await peer.createAnswer());return peer.localDescription.sdp}})
    }else if(endpoint==='voice/audio'){exchanges++;value=media.exchange(payload)}
    else if(endpoint==='voice/stop')media.stop(payload.sessionId,payload.mediaId)
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:true,value}))
  }catch(error){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:false,error:{code:error.code??'operation-error'}}))}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin='http://127.0.0.1:'+server.address().port
const child=spawn('xvfb-run',['-a','/usr/bin/python3','scripts/verify-native-voice.py',origin,out+'/webkitgtk.json'],{stdio:'inherit',env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1'}})
const timer=setTimeout(()=>child.kill(),60000)
const code=await new Promise(resolve=>{child.on('exit',resolve);child.on('error',error=>{console.error(error.code);resolve(1)})})
clearTimeout(timer)
media.closeAll();await Promise.all([...peers].map(peer=>peer.close()));await new Promise(resolve=>server.close(resolve))
const report=fs.existsSync(out+'/webkitgtk.json')?JSON.parse(fs.readFileSync(out+'/webkitgtk.json')):{passed:false}
report.host={active,exchanges};report.passed=report.passed&&active===0&&exchanges>2
fs.writeFileSync(out+'/webkitgtk.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
process.exit(code===0&&report.passed?0:1)
