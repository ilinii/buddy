import {test,expect,type Page} from '@playwright/test';

type Audit={bytes:number;stream?:MediaStream;recorder?:MediaRecorder;holdStop:boolean;stopHeld:boolean;releaseStop():void};
async function record(page:Page,retain=true,holdStop=false){
  await page.addInitScript(holdStop=>{
    const audit:Audit={bytes:0,holdStop,stopHeld:false,releaseStop(){}};Object.assign(window,{captureAudit:audit});
    const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async constraints=>{audit.stream=await get(constraints);return audit.stream;};
    const NativeRecorder=window.MediaRecorder;
    window.MediaRecorder=class extends NativeRecorder{
      constructor(...args:ConstructorParameters<typeof MediaRecorder>){
        super(...args);audit.recorder=this;
        this.addEventListener('dataavailable',event=>audit.bytes+=event.data.size);
      }
      stop(){
        if(audit.holdStop){audit.stopHeld=true;audit.releaseStop=()=>{audit.holdStop=false;super.stop();};}
        else super.stop();
      }
    };
  },holdStop);
  await page.goto('/?demo=home');
  await expect(page.getByRole('button',{name:'Take notes',exact:true})).toBeVisible();
  await page.evaluate(async retain=>{
    const url='/src/storage/service.ts';const {storage}=await import(/* @vite-ignore */ url) as typeof import('../../src/storage/service');
    const {settings}=await storage.load();await storage.saveSettings({...settings,onboarded:true,retainAudio:retain});
  },retain);
  await page.reload();await page.getByRole('button',{name:'Take notes',exact:true}).click();
  await page.getByRole('textbox',{name:'Meeting notes editor',exact:true}).fill('Keep these notes after interruption.');
  await page.getByRole('button',{name:'Record in this note',exact:true}).click();
  await expect(page.getByRole('button',{name:'Finish',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {captureAudit:Audit}).captureAudit.bytes)).toBeGreaterThan(0);
}
async function disconnect(page:Page){await page.evaluate(()=>(window as unknown as {captureAudit:Audit}).captureAudit.stream!.getAudioTracks()[0].dispatchEvent(new Event('ended')));}
async function recovered(page:Page){
  await expect(page.getByText('Interrupted',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Finish',exact:true})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Meeting notes editor',exact:true})).toContainText('Keep these notes after interruption.');
  await expect(page.getByRole('button',{name:'Download audio',exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('audio').evaluate((audio:HTMLAudioElement)=>audio.readyState)).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(()=>(window as unknown as {captureAudit:Audit}).captureAudit.stream!.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
  expect(await page.locator('audio').evaluate(async(audio:HTMLAudioElement)=>(await (await fetch(audio.src)).blob()).size)).toBeGreaterThan(0);
}
for(const width of [1440,390])test(`disconnect retains playable captured audio and notes at ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await record(page);await disconnect(page);await recovered(page);
  await page.screenshot({path:testInfo.outputPath('interrupted-audio.png')});
  await page.reload();await page.getByRole('button',{name:'Open New note',exact:true}).click();
  await expect(page.getByText('Interrupted',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Meeting notes editor',exact:true})).toContainText('Keep these notes after interruption.');
  await page.getByRole('tab',{name:/Transcript/}).click();await expect(page.locator('.transcript-segment')).toHaveCount(0);
});
test('recorder failure retains the collected audio',async({page})=>{
  await record(page);await page.evaluate(()=>(window as unknown as {captureAudit:Audit}).captureAudit.recorder!.dispatchEvent(new Event('error')));
  await recovered(page);
});
test('a disconnect while Finish is draining stays interrupted and completes only once',async({page})=>{
  await record(page,true,true);await page.getByRole('button',{name:'Finish',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {captureAudit:Audit}).captureAudit.stopHeld)).toBe(true);
  await disconnect(page);await page.evaluate(()=>(window as unknown as {captureAudit:Audit}).captureAudit.releaseStop());
  await recovered(page);await expect(page.locator('audio')).toHaveCount(1);
});
test('retention disabled releases capture without offering interrupted audio for download',async({page})=>{
  await record(page,false);await disconnect(page);
  await expect(page.getByText('Interrupted',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Download audio',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as unknown as {captureAudit:Audit}).captureAudit.stream!.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
});
test('normal Finish still offers playable audio and completes the note',async({page})=>{
  await record(page);await page.getByRole('button',{name:'Finish',exact:true}).click();
  await expect(page.getByText('Note saved',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Download audio',exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('audio').evaluate((audio:HTMLAudioElement)=>audio.readyState)).toBeGreaterThanOrEqual(1);
  await expect(page.getByText('Interrupted',{exact:true})).toHaveCount(0);
});
