// A single serialized SQLite write enforces all caps across Worker isolates.
// Failed provider starts still consume a reservation; no reset or refund endpoint.
export const LIMITS=Object.freeze({lifetime:100,daily:20,clientDaily:3,seconds:45});
export async function clientHash(request,env,day){
 const ip=request.headers.get('CF-Connecting-IP');
 if(!ip||!env.VOICE_IP_SALT)throw Error('Trusted client address unavailable');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.VOICE_IP_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${day}:${ip}`));
 return [...new Uint8Array(signature)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function reserveTrial(db,client,now=Date.now()){
 const day=new Date(now).toISOString().slice(0,10),id=crypto.randomUUID();
 const row=await db.prepare(`INSERT INTO voice_trials (id,client,day,started_at)
 SELECT ?,?,?,? WHERE
 (SELECT COUNT(*) FROM voice_trials) < ? AND
 (SELECT COUNT(*) FROM voice_trials WHERE day=?) < ? AND
 (SELECT COUNT(*) FROM voice_trials WHERE client=? AND day=?) < ? RETURNING id`)
 .bind(id,client,day,now,LIMITS.lifetime,day,LIMITS.daily,client,day,LIMITS.clientDaily).first();
 return row?.id??null;
}
export async function claimTrial(db,id,now=Date.now()){
 if(!/^[a-f0-9-]{36}$/.test(id))return false;
 // A one-use 122-bit bearer ticket survives mobile/proxy address changes.
 // Network limits were already reserved; spending caps remain unchanged.
 const row=await db.prepare('UPDATE voice_trials SET used=1 WHERE id=? AND used=0 AND started_at>=? AND started_at<=? RETURNING id')
 .bind(id,now-60000,now).first();
 return !!row;
}
