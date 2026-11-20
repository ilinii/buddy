import {test,expect,type Page} from '@playwright/test';
import {nativeTransport} from './support/native-transport';

type Audit={stops:boolean[];normalHeld:boolean;releaseNormal():void};
async function record(page:Page,provider:'deepgram'|'groq'|'local',holdFinish=false){
  await nativeTransport(page);await page.goto('/?demo=home');
  await page.evaluate(async provider=>{
    const url='/src/storage/service.ts';const {storage}=await import(/* @vite-ignore */ url) as typeof import('../../src/storage/service');
    const {settings}=await storage.init();await storage.saveSettings({...settings,onboarded:true,speechProvider:provider,localTranscription:true,deepgramAudioConsent:true,groqAudioConsent:true});
  },provider);
  await page.reload();
  await page.evaluate(holdFinish=>{
    window.engineMock.deepgramKey=true;window.engineMock.groqKey=true;window.engineMock.installed=true;
    const audit:Audit={stops:[],normalHeld:false,releaseNormal(){}};Object.assign(window,{speechAudit:audit});
    const native=window as unknown as {__TAURI_INTERNALS__:{invoke(command:string,args?:Record<string,unknown>):Promise<unknown>}};
    const invoke=native.__TAURI_INTERNALS__.invoke;
    native.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
      if(command==='engine_stop'){
        audit.stops.push(!!args.cancelTranscription);
        if(holdFinish&&!args.cancelTranscription){
          audit.normalHeld=true;await new Promise<void>(resolve=>audit.releaseNormal=resolve);
          // Both native waiters observe the same cancelled control/session.
          return structuredClone(window.engineMock.session);
        }
      }
      return invoke(command,args);
    };
  },holdFinish);
  await page.getByRole('button',{name:'Take notes',exact:true}).click();
  await page.getByRole('button',{name:'Record in this note',exact:true}).click();
  await expect(page.getByRole('button',{name:'Finish',exact:true})).toBeVisible();
  await page.evaluate(()=>window.engineMock.push('This finalized passage must be kept.',8));
  await page.getByRole('textbox',{name:'Meeting notes editor',exact:true}).fill('My personal notes stay.');
}
async function audioSettings(page:Page){
  const desktop=page.getByRole('button',{name:'Open settings',exact:true});
  if(await desktop.isVisible())await desktop.click();
  else await page.getByRole('navigation',{name:'iPhone navigation'}).getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'Audio',exact:true}).click();
}
async function expectCancelled(page:Page){
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {speechAudit:Audit}).speechAudit.stops.includes(true))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.engineMock.session?.status)).toBe('interrupted');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect(page.getByText('Interrupted',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Meeting notes editor',exact:true})).toContainText('My personal notes stay.');
  await page.getByRole('tab',{name:/Transcript/}).click();
  await expect(page.locator('.transcript-segment')).toContainText('This finalized passage must be kept.');
}
for(const provider of ['deepgram','groq'] as const)for(const paused of [false,true])test(`${provider} audio revocation cancels ${paused?'paused':'live'} recording and keeps saved evidence`,async({page},testInfo)=>{
  await page.setViewportSize({width:paused?390:1440,height:900});await record(page,provider);
  if(paused)await page.getByRole('button',{name:'Pause meeting',exact:true}).click();
  await audioSettings(page);
  if(provider==='deepgram')await page.screenshot({path:testInfo.outputPath('audio-permission.png')});
  await page.getByRole('checkbox',{name:`Allow recording audio to ${provider==='deepgram'?'Deepgram':'Groq'}`,exact:true}).uncheck();
  await expectCancelled(page);
  expect(await page.evaluate(()=>(window as unknown as {speechAudit:Audit}).speechAudit.stops)).toEqual([true]);
  await page.reload();await page.getByRole('button',{name:'Open New note',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Meeting notes editor',exact:true})).toContainText('My personal notes stay.');
  await page.getByRole('tab',{name:/Transcript/}).click();await expect(page.locator('.transcript-segment')).toContainText('This finalized passage must be kept.');
  await audioSettings(page);await expect(page.getByRole('checkbox',{name:`Allow recording audio to ${provider==='deepgram'?'Deepgram':'Groq'}`,exact:true})).not.toBeChecked();
});
for(const change of ['provider','transcription'] as const)test(`${change} change stops the existing cloud provider`,async({page})=>{
  await record(page,'deepgram');await audioSettings(page);
  if(change==='provider')await page.getByRole('combobox',{name:'Transcription engine',exact:true}).selectOption('local');
  else await page.getByRole('checkbox',{name:'Transcribe with Deepgram',exact:true}).uncheck();
  await expectCancelled(page);
});
test('revocation escalates a Finish already waiting for transcription',async({page})=>{
  await record(page,'groq',true);await page.getByRole('button',{name:'Finish',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {speechAudit:Audit}).speechAudit.normalHeld)).toBe(true);
  await audioSettings(page);await page.getByRole('checkbox',{name:'Allow recording audio to Groq',exact:true}).uncheck();
  await expectCancelled(page);
  expect(await page.evaluate(()=>(window as unknown as {speechAudit:Audit}).speechAudit.stops)).toEqual([false,true]);
  await page.evaluate(()=>(window as unknown as {speechAudit:Audit}).speechAudit.releaseNormal());
  await expect(page.getByText('Interrupted',{exact:true})).toBeVisible();
});
test('cloud permission changes leave local speech recording running',async({page})=>{
  await record(page,'local');await audioSettings(page);
  await page.getByRole('combobox',{name:'Transcription engine',exact:true}).selectOption('deepgram');
  await page.getByRole('checkbox',{name:'Allow recording audio to Deepgram',exact:true}).uncheck();
  expect(await page.evaluate(()=>(window as unknown as {speechAudit:Audit}).speechAudit.stops)).toEqual([]);
  expect(await page.evaluate(()=>window.engineMock.session?.status)).toBe('live');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByRole('button',{name:'Finish',exact:true}).click();
  await expect(page.getByText('Note saved',{exact:true})).toBeVisible();
});
