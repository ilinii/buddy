import {test,expect,type Page} from '@playwright/test';
import {nativeTransport} from './support/native-transport';

// The SQLite worker is real; only native IPC and acknowledgement timing are simulated.
type Audit={pending:boolean;held:boolean;returned:boolean;releaseReport():void;releaseDelete():void};
async function prepare(page:Page,reject=false,failDelete=false){
  await nativeTransport(page);await page.goto('/?demo=home');
  await expect(page.getByRole('button',{name:'Take notes',exact:true})).toBeVisible();
  await page.evaluate(async()=>{
    const storageUrl='/src/storage/service.ts';
    const {storage}=await import(/* @vite-ignore */ storageUrl) as typeof import('../../src/storage/service');
    const modelUrl='/src/meeting/model.ts';
    const {createMeeting}=await import(/* @vite-ignore */ modelUrl) as typeof import('../../src/meeting/model');
    const meeting=createMeeting('Report deletion regression','microphone');
    meeting.status='complete';meeting.duration=8;
    meeting.segments=[{id:'saved-final',start:1,end:7,text:'Review the proposal on Friday.',channel:'microphone',final:true}];
    meeting.report={status:'failed',provider:'nvidia',message:'Retry this saved report.',inputHash:'',updatedAt:new Date().toISOString()};
    await storage.saveMeeting(meeting);
    const state=await storage.load();await storage.saveSettings({...state.settings,onboarded:true,provider:'nvidia',nvidiaConsent:true});
  });
  await page.reload();await page.getByRole('button',{name:'Open Report deletion regression',exact:true}).click();
  await page.getByRole('textbox',{name:'Meeting notes editor',exact:true}).fill('Keep my personal notes.');
  await page.evaluate(async({reject,failDelete})=>{
    const storageUrl='/src/storage/service.ts';
    const {storage}=await import(/* @vite-ignore */ storageUrl) as typeof import('../../src/storage/service');
    const audit:Audit={pending:false,held:false,returned:false,releaseReport(){},releaseDelete(){}};
    Object.assign(window,{reportDeleteAudit:audit});
    const native=window as unknown as {__TAURI_INTERNALS__:{invoke(command:string,args?:Record<string,unknown>):Promise<unknown>}};
    const invoke=native.__TAURI_INTERNALS__.invoke;
    native.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
      if(command==='engine_delete_meeting'&&failDelete)throw Error('Simulated cleanup failure');
      if(command==='notes_generate_nvidia'){
        audit.pending=true;await new Promise<void>(resolve=>audit.releaseReport=resolve);
        try{if(reject)throw Error('Late provider failure');return await invoke(command,args);}
        finally{audit.returned=true;}
      }
      return invoke(command,args);
    };
    const worker=(storage as unknown as {worker:Worker}).worker;
    const post=worker.postMessage.bind(worker),receive=worker.onmessage!;
    let deleteId:unknown;
    worker.postMessage=((message: {id:unknown;method:string})=>{if(message.method==='deleteMeeting')deleteId=message.id;post(message);}) as Worker['postMessage'];
    worker.onmessage=event=>{
      if(event.data.id===deleteId){audit.held=true;audit.releaseDelete=()=>receive.call(worker,event);}
      else receive.call(worker,event);
    };
  },{reject,failDelete});
  await page.getByRole('button',{name:'Retry report',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {reportDeleteAudit:Audit}).reportDeleteAudit.pending)).toBe(true);
}
for(const reject of [false,true])test(`late report ${reject?'failure':'success'} cannot recreate a deleted meeting`,async({page})=>{
  await prepare(page,reject);
  await page.getByRole('button',{name:'Delete meeting',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Delete meeting',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {reportDeleteAudit:Audit}).reportDeleteAudit.held)).toBe(true);
  await page.evaluate(()=>(window as unknown as {reportDeleteAudit:Audit}).reportDeleteAudit.releaseReport());
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {reportDeleteAudit:Audit}).reportDeleteAudit.returned)).toBe(true);
  await page.evaluate(()=>(window as unknown as {reportDeleteAudit:Audit}).reportDeleteAudit.releaseDelete());
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await page.evaluate(()=>window.engineMock.calls.includes('notes_cancel'))).toBe(true);
  await page.reload();await expect(page.getByRole('button',{name:'Take notes',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open Report deletion regression',exact:true})).toHaveCount(0);
});

test('failed deletion preserves personal notes and makes the cancelled report retryable',async({page})=>{
  await prepare(page,false,true);
  await page.getByRole('button',{name:'Delete meeting',exact:true}).click();
  const dialog=page.getByRole('alertdialog');await dialog.getByRole('button',{name:'Delete meeting',exact:true}).click();
  await expect(dialog).toContainText('Simulated cleanup failure');
  await page.evaluate(()=>(window as unknown as {reportDeleteAudit:Audit}).reportDeleteAudit.releaseReport());
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {reportDeleteAudit:Audit}).reportDeleteAudit.returned)).toBe(true);
  await dialog.getByRole('button',{name:'Keep meeting',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Meeting notes editor',exact:true})).toContainText('Keep my personal notes.');
  await expect(page.getByRole('region',{name:'Meeting report status'})).toContainText('Report cancelled while deleting');
  await page.evaluate(()=>{(window as unknown as {reportDeleteAudit:Audit}).reportDeleteAudit.pending=false;});
  await page.getByRole('button',{name:'Retry report',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {reportDeleteAudit:Audit}).reportDeleteAudit.pending)).toBe(true);
  await page.evaluate(()=>(window as unknown as {reportDeleteAudit:Audit}).reportDeleteAudit.releaseReport());
  await expect(page.getByRole('textbox',{name:'Meeting report · AI draft editor'})).toContainText('proposal');
  await expect(page.getByRole('textbox',{name:'Meeting notes editor',exact:true})).toContainText('Keep my personal notes.');
});
