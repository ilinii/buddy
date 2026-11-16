// Fixed Deepgram endpoint; bounded 45-second PCM relay, no content persistence.
export async function relay(request,env,json){
 const MAX_BYTES=16000*2*45;
 let response;const handshake=new AbortController(),handshakeTimer=setTimeout(()=>handshake.abort(),10000);
 try{response=await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&smart_format=true&diarize=true&endpointing=500&mip_opt_out=true',{headers:{Upgrade:'websocket',Authorization:`Token ${env.DEEPGRAM_DEMO_KEY}`},signal:handshake.signal});}catch{return json({error:'The speech provider is unavailable. Please retry later.'},503);}finally{clearTimeout(handshakeTimer);}
 if(response.status!==101||!response.webSocket)return json({error:'The speech provider could not start. Check the demo service configuration.'},503);
 const upstream=response.webSocket,pair=new WebSocketPair(),client=pair[0],socket=pair[1];
 socket.binaryType='arraybuffer';upstream.binaryType='arraybuffer';
 upstream.accept();socket.accept();let bytes=0,closed=false,draining=false;
 let drainTimer;
 const close=(code=1000,reason='Demo ended')=>{if(closed)return;closed=true;clearTimeout(timer);clearTimeout(drainTimer);try{upstream.close(1000,'Demo ended');}catch{}try{socket.close(code,reason);}catch{}};
 const finish=()=>{if(closed||draining)return;draining=true;try{upstream.send(JSON.stringify({type:'CloseStream'}));}catch{close(1011,'Speech connection ended');return;}drainTimer=setTimeout(()=>close(1000,'Demo complete'),7000);};
 const timer=setTimeout(finish,45000);
 socket.addEventListener('message',event=>{
  if(closed)return;
  if(typeof event.data==='string'){if(event.data==='stop')finish();else close(1008,'Unsupported control');return;}
  if(draining)return;
  const length=event.data?.byteLength;
  if(!Number.isInteger(length)||length<2||length%2||length>6400){close(1008,'Invalid PCM audio frame');return;}
  if(bytes+length>MAX_BYTES){finish();return;}
  bytes+=length;
  if(upstream.bufferedAmount>128000){close(1013,'Speech service is busy');return;}
  try{upstream.send(event.data);}catch{close(1011,'Speech connection ended');}
 });
 upstream.addEventListener('message',event=>{
  if(closed||typeof event.data!=='string'||event.data.length>120000)return;
  try{
   const data=JSON.parse(event.data);
   if(data.type==='Error'){socket.send(JSON.stringify({type:'error',message:'The speech service could not finish this sample.'}));close(1011,'Speech service error');return;}
   if(data.type!=='Results')return;
   const result=data.channel?.alternatives?.[0];
   if(!result||typeof result.transcript!=='string'||result.transcript.length>12000||typeof data.is_final!=='boolean'||!Number.isFinite(data.start)||!Number.isFinite(data.duration))return;
   const speakers=[...new Set((result.words??[]).map(w=>w.speaker).filter(s=>Number.isInteger(s)&&s>=0&&s<128))];
   socket.send(JSON.stringify({type:'result',text:result.transcript,final:data.is_final,start:data.start,duration:data.duration,speakers}));
  }catch{/* Invalid provider data never becomes page markup or a success. */}
 });
 upstream.addEventListener('close',()=>close(1000,draining?'Demo complete':'Speech connection ended'));
 upstream.addEventListener('error',()=>close(1011,'Speech connection failed'));
 socket.addEventListener('close',()=>close());socket.addEventListener('error',()=>close());
 return new Response(null,{status:101,webSocket:client});
}
