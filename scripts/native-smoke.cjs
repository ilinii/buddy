const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('@playwright/test');
(async()=>{
 const processes=spawnSync('tasklist.exe',['/FI','IMAGENAME eq buddy.exe','/FO','CSV','/NH'],{windowsHide:true,encoding:'utf8'});
 if(processes.error||processes.status!==0)throw new Error('Could not check for an existing Buddy window');
 if(processes.stdout.toLowerCase().includes('"buddy.exe"'))throw new Error('Close Buddy before running the isolated native startup smoke check');
 const port=19227;
 try{await fetch(`http://127.0.0.1:${port}/json/version`);throw new Error('Native smoke port already in use');}catch(e){if(e.message==='Native smoke port already in use')throw e;}
 const child=spawn(path.resolve(process.env.BUDDY_SMOKE_EXE||'src-tauri/target/release/buddy.exe'),[],{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`}});
 let browser;try{
  for(let i=0;i<150;i++){if(child.exitCode!==null)throw new Error(`Native app exited: ${child.exitCode}`);try{const r=await fetch(`http://127.0.0.1:${port}/json/version`);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context=browser.contexts()[0],page=context.pages()[0];
  await page.waitForURL(/tauri\.localhost|tauri:\/\//,{timeout:20000});
  await page.goto(new URL('?demo=home',page.url()).href);
  await page.getByRole('heading',{name:'Meetings',exact:true}).waitFor({timeout:30000});
  const report=await page.evaluate(async({prepare,deepgram})=>{
   const invoke=window.__TAURI_INTERNALS__.invoke;
   const caps=await invoke('engine_capabilities',{model:'whisper-base'});
   const models=await invoke('engine_models');
   const deepgramKeyConfigured=deepgram?await invoke('has_deepgram_key'):undefined;
   const preparationStages=[];
   if(prepare){
    if(!caps.modelBundled)throw new Error('The packaged base speech model is missing');
    const requestId=crypto.randomUUID();const handler=window.__TAURI_INTERNALS__.transformCallback(({payload})=>{if(payload.requestId===requestId)preparationStages.push(payload.stage);});
    const eventId=await invoke('plugin:event|listen',{event:'engine-model-progress',target:{kind:'Any'},handler});
    try{await invoke('engine_prepare_model',{model:'whisper-base',requestId});}finally{await invoke('plugin:event|unlisten',{event:'engine-model-progress',eventId});window.__TAURI_INTERNALS__.unregisterCallback(handler);}
   }
   const after=await invoke('engine_capabilities',{model:'whisper-base'});
   let invalidStartRejected=false;try{await invoke('engine_start',{request:{meetingId:'invalid',language:'en',model:'whisper-base',microphone:false,systemAudio:false,deviceId:null,retainAudio:false,transcribe:false}});}catch{invalidStartRejected=true;}
   return {deepgramKeyConfigured,packagedAppBooted:true,url:location.origin,native:caps.native,deviceCount:caps.devices.length,systemAudioImplemented:caps.systemAudio,catalog:models.map(m=>m.id),activeSession:caps.active!==null,invalidStartRejected,physicalDeviceVerified:false,modelBundled:caps.modelBundled,modelReadyAfter:after.modelReady,preparationStages};
  },{prepare:process.env.BUDDY_SMOKE_PREPARE==='1',deepgram:process.env.BUDDY_SMOKE_DEEPGRAM==='1'});
  if(process.env.BUDDY_SMOKE_SINGLE_INSTANCE==='1'){
   const second=spawn(path.resolve(process.env.BUDDY_SMOKE_EXE||'src-tauri/target/release/buddy.exe'),[],{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:''}});
   try{for(let i=0;i<50&&second.exitCode===null;i++)await new Promise(r=>setTimeout(r,100));if(second.exitCode!==0)throw new Error('Duplicate instance did not exit cleanly');if(child.exitCode!==null)throw new Error('Original instance exited');await page.getByRole('heading',{name:'Meetings',exact:true}).waitFor();report.singleInstanceVerified=true;}
   finally{if(second.exitCode===null)second.kill();}
  }
  if(process.env.BUDDY_SMOKE_PREPARE==='1'&&(!report.modelReadyAfter||report.preparationStages.includes('downloading')))throw new Error('Included model preparation did not work offline');
  if(!report.native||!report.invalidStartRejected||report.activeSession)throw new Error('Unexpected native engine smoke state');
  await page.getByRole('button',{name:'Record meeting',exact:true}).click();report.transcriptionEnabled=await page.getByRole('checkbox',{name:/^Transcribe (on this device|with Groq|with Deepgram)$/}).isChecked();if(await page.getByRole('button',{name:'Install model',exact:true}).count())throw new Error('Default recording still requires manual setup');
  if(process.env.BUDDY_SMOKE_DEEPGRAM==='1'){if(!report.deepgramKeyConfigured)throw new Error('Deepgram key is missing from the native store');const select=page.getByRole('combobox',{name:'Transcription engine',exact:true});const previous=await select.inputValue();await select.selectOption('deepgram');await page.getByText('Deepgram key saved securely on this device.',{exact:true}).waitFor();await page.getByRole('checkbox',{name:'Allow recording audio to Deepgram',exact:true}).waitFor();await page.screenshot({path:'output/deepgram-native-setup.png'});await select.selectOption(previous);}else{await page.screenshot({path:'output/autosetup-native-record.png'});}
  await fs.writeFile(process.env.BUDDY_SMOKE_DEEPGRAM==='1'?'output/deepgram-native-smoke.json':'output/autosetup-native-smoke.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
