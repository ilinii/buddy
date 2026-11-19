import {test,expect,type Page} from '@playwright/test';
// UI/IPC simulation only. Live provider acceptance is a separate opt-in native script.
async function transport(page:Page){await page.addInitScript(()=>{
 const callbacks=new Map<number,(v:unknown)=>void>(),listeners=new Map<string,number[]>();let id=0;
 const state={requests:[] as Record<string,unknown>[],calls:[] as string[],hold:false,invalid:false,ignoreCancel:false,completed:0,release:()=>{},cancel:()=>{}};
 Object.assign(window,{knowledgeMock:state});
 const internals={transformCallback(fn:(v:unknown)=>void){callbacks.set(++id,fn);return id;},unregisterCallback(key:number){callbacks.delete(key);},async invoke(command:string,args:Record<string,unknown>={}){
  state.calls.push(command);
  if(command==='plugin:event|listen'){listeners.set(String(args.event),[...(listeners.get(String(args.event))??[]),Number(args.handler)]);return args.handler;}
  if(command==='plugin:event|unlisten'){listeners.set(String(args.event),(listeners.get(String(args.event))??[]).filter(x=>x!==args.eventId));return;}
  if(command==='load_database')return JSON.parse(sessionStorage.getItem('knowledge-db')??'[]');
  if(command==='save_database'){sessionStorage.setItem('knowledge-db',JSON.stringify(args.bytes));return;}
  if(command==='engine_recover')return [];if(command==='engine_status')return null;
  if(command==='engine_capabilities')return {native:true,microphone:true,systemAudio:true,devices:[],modelReady:true,active:null,platform:'windows'};
  if(command==='engine_models')return [];if(command==='has_api_key')return false;
  if(command==='knowledge_key_status')return {nvidia:true,voyage:true};
  if(['set_knowledge_key','delete_knowledge_key','clear_knowledge_index','invalidate_knowledge_roots'].includes(command)){if(command==='invalidate_knowledge_roots')state.cancel();return;}
  if(command==='knowledge_cancel'||command==='cancel_gemini'){if(!state.ignoreCancel)state.cancel();return;}
  if(command==='knowledge_answer'||command==='ask_gemini'){
   const request=(command==='ask_gemini'?args:args.request) as {requestId:string;sources:{id:string;text:string}[];forceRetrieval:boolean;model:string};state.requests.push(structuredClone(request));
   for(const callback of listeners.get('knowledge-progress')??[])callbacks.get(callback)?.({payload:{requestId:request.requestId,phase:'waiting',detail:'Voyage rate limit - retrying in 1 s'}});
   await new Promise<void>((resolve,reject)=>{state.release=resolve;state.cancel=()=>reject(Error('Request cancelled or sources changed'));if(!state.hold)setTimeout(resolve,80);});
   state.completed++;
   if(command==='ask_gemini')return JSON.stringify({answer:'Alex sends the brief Friday.',sourceIds:[request.sources[0].id]});
   const selected=request.sources.slice(0,8).map(s=>s.id);return {text:'Alex sends the brief Friday. [S1]',sourceIds:[state.invalid?'invented-evidence':selected[0]],selected,route:request.forceRetrieval?'hybrid':'focused-context',model:request.model,embedded:0,cacheHits:selected.length,warnings:[],embeddingModel:'voyage-4-large',rerankModel:'rerank-3'};
  }
  throw Error(`Unexpected knowledge mock command ${command}`);
 }};
 Object.assign(window,{__TAURI_INTERNALS__:internals,__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:(_event:string,key:number)=>callbacks.delete(key)}});
});}
async function setup(page:Page,consent=true){
 await transport(page);await page.goto('/?demo=home');await page.getByRole('button',{name:(page.viewportSize()?.width??1440)<=600?'Settings':'Open settings',exact:true}).click();await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'AI provider',exact:true}).click();await page.getByRole('combobox',{name:'Provider',exact:true}).selectOption('nvidia');
 await expect(page.getByRole('textbox',{name:'Answer model',exact:true})).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Answer model'})).toHaveValue('Nemotron 3.5 Super · NVIDIA');
 if(consent){await page.getByRole('checkbox',{name:'Allow selected text to NVIDIA',exact:true}).check();await page.getByRole('checkbox',{name:'Allow selected text to Voyage',exact:true}).check();}
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.getByRole('button',{name:'Take notes',exact:true}).click();await page.getByRole('textbox',{name:'Meeting title',exact:true}).fill('Evidence review');await page.getByRole('textbox',{name:'Meeting notes editor'}).fill('Alex sends the brief Friday.');await expect(page.getByText('Saved locally',{exact:true})).toBeVisible();
 if(await page.getByRole('button',{name:'Show assistant',exact:true}).count())await page.getByRole('button',{name:'Show assistant',exact:true}).click();
}
const mock=(page:Page,code:string)=>page.evaluate(code);
async function ask(page:Page){await page.getByRole('textbox',{name:'Ask Buddy',exact:true}).fill('Who sends the brief?');await page.getByRole('button',{name:'Send message',exact:true}).click();}
for(const width of [1440,390])test(`automatic meeting context, real progress and note evidence at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);
 await expect(page.locator('.assistant-compose input[type=checkbox],.assistant-compose [role=checkbox]')).toHaveCount(0);
 await mock(page,'window.knowledgeMock.hold=true');await ask(page);await expect(page.locator('.thinking')).toContainText('Waiting to continue');await mock(page,'window.knowledgeMock.release()');
 await expect(page.locator('.chat-assistant .message-text')).toContainText('Friday. [1]');await expect(page.locator('.answer-complete')).toContainText('Answer ready');await page.screenshot({path:`output/knowledge-assistant-${width}.png`});await page.locator('.chat-assistant .citations button').click();await expect(page.getByRole('dialog')).toContainText('Alex sends the brief Friday.');await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 expect(await mock(page,'window.knowledgeMock.requests[0].sources.every(s=>s.rootId.startsWith("meeting:")&&s.kind==="note")')).toBe(true);
 await ask(page);await expect.poll(()=>mock(page,'window.knowledgeMock.requests.length')).toBe(2);expect(await mock(page,'window.knowledgeMock.requests[1].forceRetrieval')).toBe(true);
 await page.getByRole('button',{name:'Cancel request',exact:true}).click();await expect(page.getByRole('alert')).toContainText('cancelled');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`output/knowledge-cancel-${width}.png`});
});

for (const permission of ['Allow selected text to NVIDIA', 'Allow selected text to Voyage', 'Use imported files in cloud answers', 'Provider']) {
 test(`changing ${permission} cancels an active answer and discards a late result`, async ({page}) => {
  await setup(page);
  const openSettings = async () => {
   await page.getByRole('button',{name:'Open settings',exact:true}).click();
   await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'AI provider',exact:true}).click();
  };
  if(permission==='Use imported files in cloud answers') {
   await openSettings();await page.getByRole('checkbox',{name:permission,exact:true}).check();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  }
  await mock(page,'window.knowledgeMock.hold=true;window.knowledgeMock.ignoreCancel=true');await ask(page);
  await expect(page.locator('.thinking')).toContainText('Waiting to continue');await openSettings();
  if(permission==='Provider')await page.getByRole('combobox',{name:'Provider',exact:true}).selectOption('offline');
  else await page.getByRole('checkbox',{name:permission,exact:true}).uncheck();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect.poll(()=>mock(page,'window.knowledgeMock.calls.filter(c=>c==="knowledge_cancel").length')).toBe(1);
  await expect(page.getByRole('alert')).toContainText('Content already sent cannot be recalled');
  await mock(page,'window.knowledgeMock.release()');await expect.poll(()=>mock(page,'window.knowledgeMock.completed')).toBe(1);
  await expect(page.locator('.chat-assistant')).toHaveCount(0);await expect(page.locator('.thinking')).toHaveCount(0);
  if(permission!=='Provider') {
   await openSettings();await page.getByRole('checkbox',{name:permission,exact:true}).check();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  }
  await mock(page,'window.knowledgeMock.hold=false');await ask(page);await expect(page.locator('.chat-assistant')).toHaveCount(1);
 });
}

test('revoking Gemini permission propagates native cancellation and discards a late response', async ({page}) => {
 await setup(page);
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'AI provider',exact:true}).click();
 await page.getByRole('combobox',{name:'Provider',exact:true}).selectOption('gemini');
 await page.getByRole('checkbox',{name:'Allow meeting excerpts to Gemini',exact:true}).check();
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await mock(page,'window.knowledgeMock.hold=true;window.knowledgeMock.ignoreCancel=true');await ask(page);
 await expect.poll(()=>mock(page,'window.knowledgeMock.requests.length')).toBe(1);
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'AI provider',exact:true}).click();
 await page.getByRole('checkbox',{name:'Allow meeting excerpts to Gemini',exact:true}).uncheck();
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await expect.poll(()=>mock(page,'window.knowledgeMock.calls.filter(c=>c==="cancel_gemini").length')).toBe(1);
 await mock(page,'window.knowledgeMock.release()');await expect.poll(()=>mock(page,'window.knowledgeMock.completed')).toBe(1);
 await expect(page.locator('.chat-assistant')).toHaveCount(0);
});
test('unconsented requests never reach the native provider; fabricated citations are rejected',async({page})=>{
 await setup(page,false);await ask(page);await expect(page.getByRole('alert')).toContainText('Allow selected text to NVIDIA');expect(await mock(page,'window.knowledgeMock.requests.length')).toBe(0);
 await page.getByRole('button',{name:(page.viewportSize()?.width??1440)<=600?'Settings':'Open settings',exact:true}).click();await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'AI provider',exact:true}).click();await page.getByRole('checkbox',{name:'Allow selected text to NVIDIA',exact:true}).check();await page.getByRole('button',{name:'Close dialog',exact:true}).click();await mock(page,'window.knowledgeMock.invalid=true');await ask(page);await expect(page.getByRole('alert')).toContainText('unknown evidence');await expect(page.locator('.chat-assistant')).toHaveCount(0);
});
test('editing a note during an answer revokes its native evidence and discards the answer',async({page})=>{
 await setup(page);await mock(page,'window.knowledgeMock.hold=true');await ask(page);await expect(page.locator('.thinking')).toContainText('Waiting to continue');await page.getByRole('textbox',{name:'Meeting notes editor'}).fill('The owner changed to Priya.');await expect(page.getByRole('alert')).toContainText('sources changed');await expect(page.locator('.chat-assistant')).toHaveCount(0);
});
test('files require one Settings permission then work automatically, with demo isolation',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Knowledge',exact:true}).click();await page.locator('input[type=file][accept=".pdf,.docx,.xlsx,.csv,.txt,.md"]').setInputFiles({name:'launch-brief.txt',mimeType:'text/plain',buffer:Buffer.from('Alex sends the launch brief on Friday. No launch date is approved.')});await expect(page.locator('.import-status')).toContainText('1 file indexed locally.');
 await page.getByRole('button',{name:'My meetings',exact:true}).click();await page.getByRole('button',{name:'Open Evidence review',exact:true}).click();await ask(page);await expect(page.locator('.chat-assistant')).toHaveCount(1);expect(await mock(page,'window.knowledgeMock.requests[0].sources.some(s=>s.kind==="document")')).toBe(false);
 await page.getByRole('button',{name:(page.viewportSize()?.width??1440)<=600?'Settings':'Open settings',exact:true}).click();await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'AI provider',exact:true}).click();await page.getByRole('checkbox',{name:'Use imported files in cloud answers',exact:true}).check();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await ask(page);await expect(page.locator('.chat-assistant')).toHaveCount(2);expect(await mock(page,'window.knowledgeMock.requests[1].sources.filter(s=>s.kind==="document").map(s=>s.title)')).toEqual(['launch-brief.txt']);
 await ask(page);await expect(page.locator('.chat-assistant')).toHaveCount(3);expect(await mock(page,'window.knowledgeMock.requests[2].sources.some(s=>s.kind==="document")')).toBe(true);

});
