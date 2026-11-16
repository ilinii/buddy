import {test} from 'node:test';
import assert from 'node:assert/strict';
import {relay} from './relay.mjs';
const origin='https://meetbuddy.me';
test('gateway fixes model/privacy parameters, bounds PCM audio and never returns a provider key',async()=>{
 const originalFetch=globalThis.fetch,OriginalResponse=globalThis.Response,OriginalPair=globalThis.WebSocketPair;
 class Socket{
  handlers=new Map();sent=[];bufferedAmount=0;
  accept(){}addEventListener(type,fn){this.handlers.set(type,fn);}send(data){this.sent.push(data);}close(){this.closed=true;}emit(type,data){this.handlers.get(type)?.({data});}
 }
 const upstream=new Socket(),server=new Socket(),client=new Socket();let requested;
 try{
  globalThis.fetch=async(url,options)=>{requested={url,options};return {status:101,webSocket:upstream};};
  globalThis.WebSocketPair=class {constructor(){return {0:client,1:server};}};
  globalThis.Response=class extends OriginalResponse{constructor(body,options){if(options.status===101)return {status:101,webSocket:options.webSocket};super(body,options);}};
  const result=await relay(new Request(origin+'/api/voice/stream?model=malicious',{headers:{Origin:origin,Upgrade:'websocket','CF-Connecting-IP':'test-1'}}),{VOICE_DEMO_ENABLED:'true',DEEPGRAM_DEMO_KEY:'fixture-key-only'},(body,status=200)=>Response.json(body,{status}));
  assert.equal(result.status,101);assert.equal(server.binaryType,'arraybuffer');const url=new URL(requested.url);assert.equal(url.hostname,'api.deepgram.com');assert.equal(url.searchParams.get('mip_opt_out'),'true');assert.equal(url.searchParams.get('model'),'nova-3');assert.equal(url.searchParams.get('diarize'),'true');
  upstream.emit('message',JSON.stringify({type:'Results',is_final:true,start:0,duration:1,channel:{alternatives:[{transcript:'<script>inert speech</script>',words:[{speaker:0}]}]}}));assert.equal(JSON.parse(server.sent[0]).text,'<script>inert speech</script>');assert(!server.sent[0].includes('fixture-key-only'));
  for(let i=0;i<451;i++)server.emit('message',new ArrayBuffer(3200));
  assert.equal(upstream.sent.filter(x=>x instanceof ArrayBuffer).length,450);assert.equal(upstream.sent.at(-1),'\u007b"type":"CloseStream"\u007d');
  server.emit('close');assert(server.closed);assert(upstream.closed);
 }finally{globalThis.fetch=originalFetch;globalThis.Response=OriginalResponse;globalThis.WebSocketPair=OriginalPair;}
});
