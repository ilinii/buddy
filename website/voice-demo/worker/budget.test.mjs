import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reserveTrial,claimTrial,clientHash} from './budget.mjs';
import worker from './index.mjs';
function database(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../drizzle/0000_voice_budget.sql',import.meta.url),'utf8'));
 return {sql,prepare(text){return {bind(...args){return {async first(){return sql.prepare(text).get(...args)??null;}};}};}};
}
const now=Date.UTC(2026,10,16,12);
test('atomic reservations enforce per-network, daily and lifetime caps',async()=>{
 const db=database();
 try{
  const outcomes=await Promise.all(Array.from({length:10},()=>reserveTrial(db,'shared-network',now)));
  assert.equal(outcomes.filter(Boolean).length,3);
  const day=await Promise.all(Array.from({length:40},(_,i)=>reserveTrial(db,`client-${i}`,now)));
  assert.equal(day.filter(Boolean).length,17);
  for(let d=1;d<5;d++){
   const rows=await Promise.all(Array.from({length:30},(_,i)=>reserveTrial(db,`day-${d}-${i}`,now+d*86400000)));
   assert.equal(rows.filter(Boolean).length,20);
  }
  assert.equal(await reserveTrial(db,'new-day',now+5*86400000),null);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM voice_trials').get().n,100);
 }finally{db.sql.close();}
});
test('a short-lived bearer ticket is consumable once across address changes',async()=>{
 const db=database();try{
  const ticket=await reserveTrial(db,'client',now);
  assert.equal(await claimTrial(db,'not-a-ticket',now+1),false);
  const claims=await Promise.all([claimTrial(db,ticket,now+1),claimTrial(db,ticket,now+1)]);
  assert.equal(claims.filter(Boolean).length,1);
  const expired=await reserveTrial(db,'client',now);
  assert.equal(await claimTrial(db,expired,now+60001),false);
 }finally{db.sql.close();}
});
test('network addresses are keyed and unlinkable across days',async()=>{
 const request=new Request('https://demo.example/',{headers:{'CF-Connecting-IP':'192.0.2.4'}});
 const env={VOICE_IP_SALT:'test-salt'};
 const a=await clientHash(request,env,'2026-11-16');
 assert.equal(a.length,64);assert(!a.includes('192.0.2'));
 assert.equal(a,await clientHash(request,env,'2026-11-16'));
 assert.notEqual(a,await clientHash(request,env,'2026-11-17'));
 await assert.rejects(clientHash(new Request('https://demo.example/'),env,'2026-11-16'));
});
test('gateway rejects unknown origins, fails closed and returns CORS quota errors',async()=>{
 const db=database(),base='https://gateway.example/api/voice/';
 const env={DB:db,VOICE_DEMO_ENABLED:'true',VOICE_IP_SALT:'salt',DEEPGRAM_DEMO_KEY:'fixture-only'};
 try{
  assert.equal((await worker.fetch(new Request(base+'session',{method:'POST',headers:{Origin:'https://evil.example'}}),env)).status,403);
  const headers={Origin:'https://meetbuddy.me','CF-Connecting-IP':'192.0.2.1'};
  assert.equal((await worker.fetch(new Request(base+'config',{headers}),{})).status,200);
  assert.equal((await worker.fetch(new Request(base+'session',{method:'POST',headers}),{...env,DB:null})).status,503);
  for(let i=0;i<3;i++)assert.equal((await worker.fetch(new Request(base+'session',{method:'POST',headers}),env)).status,200);
  const denied=await worker.fetch(new Request(base+'session',{method:'POST',headers}),env);
  assert.equal(denied.status,429);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),'https://meetbuddy.me');
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM voice_trials').get().n,3);
 }finally{db.sql.close();}
});
