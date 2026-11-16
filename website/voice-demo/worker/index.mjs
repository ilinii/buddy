import {LIMITS,clientHash,reserveTrial,claimTrial} from './budget.mjs';
import {relay} from './relay.mjs';
const ALLOWED=new Set(['https://meetbuddy.me','https://www.meetbuddy.me']);
export default {async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('Origin');
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(ALLOWED.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
 const json=(body,status=200)=>Response.json(body,{status,headers});
 if(url.pathname==='/')return Response.redirect('https://meetbuddy.me/#voice-demo',302);
 if(!ALLOWED.has(origin))return json({error:'Start the voice demo at meetbuddy.me.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 const available=env.VOICE_DEMO_ENABLED==='true'&&!!env.DEEPGRAM_DEMO_KEY&&!!env.VOICE_IP_SALT&&!!env.DB;
 if(url.pathname==='/api/voice/config'&&request.method==='GET')return json({available,seconds:LIMITS.seconds,provider:'Deepgram Nova-3',trainingOptOut:true});
 if(!available)return json({error:'The live demo is temporarily unavailable.'},503);
 try{
  if(url.pathname==='/api/voice/session'&&request.method==='POST'){
   const day=new Date().toISOString().slice(0,10),client=await clientHash(request,env,day);
   const ticket=await reserveTrial(env.DB,client);
   return ticket?json({ticket,seconds:LIMITS.seconds}):json({error:'The demo sample limit has been reached. Please try another day or explore the workspace.'},429);
  }
  if(url.pathname==='/api/voice/stream'&&request.method==='GET'){
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket required'},426);
   if(!await claimTrial(env.DB,url.searchParams.get('ticket')??''))return json({error:'This demo session expired. Start a fresh sample.'},403);
   return await relay(request,env,json);
  }
  return json({error:'Not found'},404);
 }catch{return json({error:'The demo could not start. Please try again later.'},503);}
}};
