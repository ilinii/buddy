// Build the debug executable with identifier com.buddy.meeting.frame-preview first.
// Uses a separate app-data/WebView profile; never opens a microphone or provider.
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('@playwright/test');

(async()=>{
 const port=19231,base='http://127.0.0.1:1420';
 let server,child,browser;
 try{
  try{await fetch(`${base}/`);throw Error('Port 1420 is already used; do not interrupt its server.');}catch(error){if(error.message.startsWith('Port 1420'))throw error;}
  try{await fetch(`http://127.0.0.1:${port}/json/version`);throw Error('Window smoke port is already used.');}catch(error){if(error.message.startsWith('Window smoke port'))throw error;}
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','1420','--strictPort'],{windowsHide:true,stdio:'ignore'});
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Preview server exited');try{if((await fetch(base)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  child=spawn(path.resolve('src-tauri/target/debug/buddy.exe'),[],{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`}});
  for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('Isolated preview exited before connecting');try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page=browser.contexts()[0].pages()[0];
  await page.waitForURL(/127\.0\.0\.1:1420/);
  const identifier=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:app|identifier'));
  if(identifier!=='com.buddy.meeting.frame-preview')throw Error('Wrong app identifier; refusing to inspect a personal workspace');
  await page.goto(`${base}/?demo=home`);
  await page.getByRole('heading',{name:'Meetings',exact:true}).waitFor();
  const lightToggle=page.getByRole('button',{name:'Switch to light theme',exact:true});
  if(await lightToggle.count())await lightToggle.click();
  const state=()=>page.evaluate(async()=>{
   const invoke=window.__TAURI_INTERNALS__.invoke,args={label:'main'};
   return {decorated:await invoke('plugin:window|is_decorated',args),size:await invoke('plugin:window|inner_size',args),scale:await invoke('plugin:window|scale_factor',args),maximized:await invoke('plugin:window|is_maximized',args)};
  });
  const initial=await state();
  if(initial.decorated||initial.maximized||initial.size.width/initial.scale>1181||initial.size.height/initial.scale>761)throw Error('Incorrect default frame or size');
  await page.getByRole('group',{name:'Window controls'}).waitFor();
  await page.getByRole('button',{name:'Maximize window',exact:true}).click();
  await page.getByRole('button',{name:'Restore window',exact:true}).waitFor();
  if(!(await state()).maximized)throw Error('Native maximize did not work');
  await page.getByRole('button',{name:'Restore window',exact:true}).click();
  await page.getByRole('button',{name:'Maximize window',exact:true}).waitFor();
  if((await state()).maximized)throw Error('Native restore did not work');
  await page.screenshot({path:'output/experience-native-window.png'});
  if(process.env.BUDDY_SMOKE_NOTE==='1'){
   await page.getByRole('button',{name:'Take notes',exact:true}).click();
   await page.getByRole('textbox',{name:'Meeting notes editor',exact:true}).waitFor();
   await page.waitForFunction(()=>document.documentElement.dataset.viewTransition!=='true');
   if(await page.getByRole('dialog').count())throw Error('Take notes still opens a dialog');
   if(await page.getByRole('complementary',{name:'Buddy assistant'}).count())throw Error('The blank note is obscured by the assistant');
   await page.screenshot({path:'output/notes-native-blank.png'});
  }
  await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();
  await page.locator(process.env.BUDDY_SMOKE_NOTE==='1'?'.notes-canvas .document-column':'.meeting-row').first().evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
  await page.screenshot({path:process.env.BUDDY_SMOKE_NOTE==='1'?'output/notes-native-dark.png':'output/experience-native-window-dark.png'});
  await page.getByRole('button',{name:'Minimize window',exact:true}).click();
  const minimized=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|is_minimized',{label:'main'}));
  if(!minimized)throw Error('Native minimize did not work');
  // CDP clicks the real close control while minimized; no user window is targeted.
  await page.evaluate(()=>document.querySelector('[aria-label="Close window"]').click()).catch(()=>{});
  for(let i=0;i<50&&child.exitCode===null;i++)await new Promise(resolve=>setTimeout(resolve,100));
  if(child.exitCode!==0)throw Error('Native close did not exit cleanly');
  const report={identifier,initial,nativeMaximizeRestore:true,nativeMinimize:true,nativeClose:true,blankNoteDirect:process.env.BUDDY_SMOKE_NOTE==='1',personalWorkspaceTouched:false,physicalCaptureTested:false};
  await fs.writeFile('output/installer-previews/window-native-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{
  if(browser)await browser.close().catch(()=>{});
  if(child&&child.exitCode===null)child.kill();
  if(server&&server.exitCode===null)server.kill();
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
