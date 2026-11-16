// Explicit opt-in: public JFK speech fixture only, never the user's microphone or meetings.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
if(process.env.BUDDY_LIVE_VOICE!=='1')throw Error('Set BUDDY_LIVE_VOICE=1 for the public speech fixture check.');
const wav=await readFile(new URL('../../output/engine-probe/jfk.wav',import.meta.url));let pcm;
for(let offset=12;offset+8<=wav.length;){const length=wav.readUInt32LE(offset+4);if(wav.toString('ascii',offset,offset+4)==='data'){pcm=wav.subarray(offset+8,offset+8+length);break;}offset+=8+length+(length%2);}
assert(pcm?.length,'Missing public PCM fixture');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:1430');
 const report=await page.evaluate(bytes=>new Promise((resolve,reject)=>{
  const socket=new WebSocket(`ws://${location.host}/api/voice/stream`),start=performance.now();let finals=[],interims=0,firstInterimMs=null,stopped=false,packets=0,errors=[];
  const timeout=setTimeout(()=>{socket.close();reject(Error('Public speech fixture timed out'));},30000);
  socket.onopen=async()=>{const data=new Uint8Array(bytes);for(let i=0;i<data.length;i+=3200){if(socket.readyState!==WebSocket.OPEN)break;socket.send(data.slice(i,i+3200));packets++;await new Promise(r=>setTimeout(r,100));}stopped=true;if(socket.readyState===WebSocket.OPEN)socket.send('stop');};
  socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.type==='error')errors.push(data.message);if(data.type==='result'){if(data.final&&data.text)finals.push(data.text);else if(data.text){interims++;firstInterimMs??=Math.round(performance.now()-start);}}};
  socket.onerror=()=>{clearTimeout(timeout);reject(Error('Live Worker speech connection failed'));};
  socket.onclose=event=>{clearTimeout(timeout);resolve({code:event.code,reason:event.reason,packets,errors,text:finals.join(' '),finals:finals.length,interims,firstInterimMs,stopped,elapsedMs:Math.round(performance.now()-start),physicalMicrophone:false,publicFixtureOnly:true});};
 }),Array.from(pcm));
 if(!report.finals){const {text,...diagnostic}=report;console.log(JSON.stringify(diagnostic));}
 assert(report.stopped);assert(report.finals>0);assert(report.interims>0);assert(report.text.toLowerCase().includes('country'));
 await mkdir(new URL('shots/',import.meta.url),{recursive:true});await writeFile(new URL('shots/voice-live.json',import.meta.url),JSON.stringify(report,null,2));
 const {text,...metadata}=report;console.log(JSON.stringify({status:'passed',...metadata}));
}finally{await browser.close();}
