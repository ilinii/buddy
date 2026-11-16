import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({permissions:['microphone'],viewport:{width,height:900}}),page=await context.newPage();
  let packets=0,stopped=false;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/voice/config',route=>route.fulfill({json:{available:true,seconds:45}}));
  await page.routeWebSocket('**/api/voice/stream',socket=>{socket.onMessage(message=>{
   if(message==='stop'){stopped=true;socket.send(JSON.stringify({type:'result',text:'Final words on stop.',final:true,start:1,duration:1,speakers:[1]}));socket.close();return;}
   packets++;assert(Buffer.isBuffer(message));assert(message.byteLength<=3200);
   if(packets===1)socket.send(JSON.stringify({type:'result',text:'Actual audio',final:false,start:0,duration:1,speakers:[]}));
   if(packets===3)socket.send(JSON.stringify({type:'result',text:'Actual audio packet received.',final:true,start:0,duration:1,speakers:[0]}));
  });});
  await page.goto('http://127.0.0.1:1430');await page.evaluate(()=>document.documentElement.style.scrollBehavior='auto');assert.equal(packets,0,'No microphone before action');
  await page.locator('#voice-demo button').click();await page.waitForFunction(()=>document.querySelector('.voice-words').textContent.includes('packet received'));
  await page.locator('#voice-demo button').click();await page.waitForFunction(()=>document.querySelector('#voice-demo [role=status]').textContent.includes('Demo complete'));assert(stopped);assert(packets>=3);assert((await page.locator('.voice-words').textContent()).includes('Final words on stop.'));assert((await page.locator('.voice-speakers').textContent()).includes('2 anonymous voices'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#voice-demo').scrollIntoViewIfNeeded();await page.waitForTimeout(250);await page.screenshot({path:`shots/voice-${width}.png`});
  assert.equal(errors.length,0,errors.join('\n'));await context.close();
 }
 console.log('PASS: simulated provider, actual fake-device PCM frames, explicit start, stop-time drain, speaker labels, desktop/phone, no overflow. Not live Deepgram or physical microphone acceptance.');
}finally{await browser.close();}
