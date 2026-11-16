// Opt-in live provider check. Synthetic evidence only; no microphone, real file
// or saved meeting is read or sent. Keys remain inside the native commands.
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');const path=require('node:path');
const {chromium}=require('@playwright/test');
(async()=>{
 if(process.env.BUDDY_LIVE_KNOWLEDGE!=='1')throw Error('Set BUDDY_LIVE_KNOWLEDGE=1 to authorize the small live API fixture.');
 const processes=spawnSync('tasklist.exe',['/FI','IMAGENAME eq buddy.exe','/FO','CSV','/NH'],{windowsHide:true,encoding:'utf8'});
 if(processes.error||processes.status!==0||processes.stdout.toLowerCase().includes('"buddy.exe"'))throw Error('Close Buddy before running the native knowledge smoke check.');
 const port=19229;try{await fetch(`http://127.0.0.1:${port}/json/version`);throw Error('Smoke port is already used');}catch(e){if(e.message==='Smoke port is already used')throw e;}
 const child=spawn(path.resolve('src-tauri/target/release/buddy.exe'),[],{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`}});
 let browser;try{
  for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('Native app exited early');try{const r=await fetch(`http://127.0.0.1:${port}/json/version`);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];await page.waitForURL(/tauri\.localhost|tauri:\/\//,{timeout:20000});
  if(process.env.BUDDY_KNOWLEDGE_DIAGNOSTIC==='1'){page.on('console',message=>{if(/worker|security|module|script|pdf|blocked/i.test(message.text()))console.log(message.type(),message.text().slice(0,800));});page.on('pageerror',error=>console.log('WebView error',error.message));console.log(await page.evaluate(()=>({origin:location.origin,ua:navigator.userAgent,promiseResolvers:typeof Promise.withResolvers,worker:typeof Worker})));}
  const workerAsset=(await fs.readdir('dist/assets')).find(name=>/^parser\.worker-.*\.js$/.test(name));if(!workerAsset)throw Error('Built parser worker is missing');
  if(process.env.BUDDY_KNOWLEDGE_DIAGNOSTIC==='1'){const pdfAsset=(await fs.readdir('dist/assets')).find(name=>/^pdf\.worker.*\.mjs$/.test(name));console.log(await page.evaluate(async(paths)=>Promise.all(paths.map(async path=>{const r=await fetch(`/assets/${path}`);return {path,status:r.status,type:r.headers.get('content-type'),size:(await r.arrayBuffer()).byteLength};})),[workerAsset,pdfAsset]));}
  const fixtures=await Promise.all(['Q2-report.pdf','Q2-report.docx','Q2-finance.xlsx'].map(async name=>({name,bytes:Array.from(await fs.readFile(path.join('tests/fixtures',name)))})));
  const productionExtraction=await page.evaluate(async({workerAsset,fixtures})=>{
   const results=[];for(const fixture of fixtures){
    const result=await new Promise((resolve,reject)=>{const worker=new Worker(new URL(`/assets/${workerAsset}`,location.href),{type:'module'});const timer=setTimeout(()=>{worker.terminate();reject(Error(`Packaged extraction timed out: ${fixture.name}`));},30000);const finish=()=>{clearTimeout(timer);worker.terminate();};worker.onerror=event=>{finish();reject(Error(`Packaged worker failed: ${fixture.name}: ${event.message}`));};worker.onmessage=({data})=>{if(data?.type!=='document-result')return;finish();if(data.error||!data.document?.chunks.length)reject(Error(`Packaged extraction failed: ${fixture.name}: ${data.error}`));else resolve({name:fixture.name,chunks:data.document.chunks.length,location:data.document.chunks[0].location});};worker.postMessage({file:new File([new Uint8Array(fixture.bytes)],fixture.name),group:'Synthetic smoke fixture',demo:false});});results.push(result);
   }return results;
  },{workerAsset,fixtures});
  const report=await page.evaluate(async()=>{
   const invoke=window.__TAURI_INTERNALS__.invoke;
   const status=await invoke('knowledge_key_status');if(!status.nvidia||!status.voyage)throw Error('Native knowledge credentials are missing');
   const root=`document:smoke-${crypto.randomUUID()}`;const texts=['Synthetic launch meeting, 12 November. Alex owns the launch brief and will send it Friday. The launch date has not been approved.','Synthetic office update. A new garden is being planned for next spring.','Synthetic product proposal. Priya proposed a December launch; the team did not approve the date.'];
   const sources=await Promise.all(texts.map(async(text,i)=>({id:`${root}:${i}`,rootId:root,revision:[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join(''),title:'Synthetic test fixture',location:`Passage ${i+1}`,text,kind:'document',lexicalScore:i===0?2:0})));
   const request={requestId:crypto.randomUUID(),question:'Who sends the launch brief, when, and is the launch date approved?',sources,model:'nvidia/nemotron-3.5-super-vl-120b-a12b',hybrid:true,forceRetrieval:true,includeFiles:true,nvidiaConsent:true,voyageConsent:true};
   const phases=[];const handler=window.__TAURI_INTERNALS__.transformCallback(({payload})=>{if(payload.requestId===request.requestId)phases.push(payload.phase);});const eventId=await invoke('plugin:event|listen',{event:'knowledge-progress',target:{kind:'Any'},handler});
   try{
    const started=performance.now();const cold=await invoke('knowledge_answer',{request});const coldMs=Math.round(performance.now()-started);
    request.requestId=crypto.randomUUID();const warm=await invoke('knowledge_answer',{request});
    if(cold.route!=='hybrid'||cold.embedded!==3||warm.embedded!==0||warm.cacheHits!==3||!warm.queryCacheHit||!cold.sourceIds.length||!warm.sourceIds.length||!/Alex/i.test(cold.text)||!/Friday/i.test(cold.text)||!/not|no |unapproved/i.test(cold.text))throw Error('Synthetic hybrid answer or cache reuse failed');
    request.requestId=crypto.randomUUID();request.sources=sources.slice(0,1).map(s=>({...s,kind:'note'}));request.forceRetrieval=false;request.includeFiles=false;
    const focused=await invoke('knowledge_answer',{request});if(focused.route!=='focused-context'||focused.embedded!==0)throw Error('Focused meeting routing failed');
    let consentRejected=false;try{await invoke('knowledge_answer',{request:{...request,requestId:crypto.randomUUID(),nvidiaConsent:false}});}catch{consentRejected=true;}if(!consentRejected)throw Error('Consent guard failed');
    const cancelledId=crypto.randomUUID();await invoke('knowledge_cancel',{requestId:cancelledId});let earlyCancelRejected=false;try{await invoke('knowledge_answer',{request:{...request,requestId:cancelledId}});}catch{earlyCancelRejected=true;}if(!earlyCancelRejected)throw Error('Early cancellation guard failed');
    return {syntheticOnly:true,nativeCredentialRead:true,model:cold.model,embedding:cold.embeddingModel,reranker:cold.rerankModel,coldMs,coldEmbedded:cold.embedded,warmEmbedded:warm.embedded,warmCacheHits:warm.cacheHits,warmQueryCacheHit:warm.queryCacheHit,citations:cold.sourceIds.length,answer:cold.text,focusedRoute:focused.route,consentRejected,earlyCancelRejected,phases,physicalAudioTested:false};
   }finally{await invoke('invalidate_knowledge_roots',{roots:[root]});await invoke('plugin:event|unlisten',{event:'knowledge-progress',eventId});window.__TAURI_INTERNALS__.unregisterCallback(handler);}
  });
  report.productionExtraction=productionExtraction;
  await fs.mkdir('output/knowledge-review',{recursive:true});await fs.writeFile('output/knowledge-review/native-live-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
