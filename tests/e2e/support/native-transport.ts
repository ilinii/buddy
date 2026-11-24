import type {Page} from '@playwright/test';
import type {EngineEvent,EngineSession} from '../../../src/engine/client';
// This suite simulates only the Tauri transport. It never verifies physical devices.
declare global {interface Window {engineMock:{session:EngineSession|null;emit(kind:EngineEvent['kind'],segment?:EngineEvent['segment']):void;push(text:string,end:number):void;installed:boolean;calls:string[];startError?:boolean;groqKey?:boolean;deepgramKey?:boolean;signal(kind:EngineEvent['kind'],source:'microphone'|'system',segment?:EngineEvent['segment'],message?:string):void;lastStart?:{speechProvider?:string;cloudAudioConsent?:boolean;microphone?:boolean;systemAudio?:boolean};reportError?:boolean;reportDelay?:number;reportSources?:string[];invalidDraft?:boolean;repeatReportEvidence?:boolean;statusDelay?:number;holdDownload?:boolean;prepareError?:boolean;ignoreCancel?:boolean;bundled?:boolean;platform?:'macos'|'windows'|'ios';audioPermissions?:{microphone:'granted'|'denied'|'not-determined';system:'granted'|'required'|'denied'};denyPermission?:boolean;releasePreparation?():void;installingModel?:string|null;};}}
export async function nativeTransport(page:Page){await page.addInitScript(()=>{
 const callbacks=new Map<number,(v:unknown)=>void>(),listeners=new Map<string,number[]>();let callbackId=0,sequence=0;let finishDownload:(()=>void)|undefined,cancelDownload=false;
 const state:Window['engineMock']={session:null,installed:false,calls:[],signal(){},emit(kind,segment=null){if(!state.session)return;sessionStorage.setItem('engine-journal',JSON.stringify(state.session));state.session.sequence=++sequence;const payload={...state.session,sequence,kind,level:.12,message:null,segment};for(const id of listeners.get('meeting-engine')??[])callbacks.get(id)?.({payload});},push(text,end){if(!state.session)return;const segment={id:`${state.session.sessionId}-microphone-${state.session.segments.length}`,start:Math.max(0,end-3),end,text,channel:'microphone' as const,final:true};state.session.duration=end;state.session.segments.push(segment);state.emit('segment',segment);}};
 state.signal=(kind,source,segment=null,message='')=>{if(!state.session)return;const payload={...state.session,sequence:++sequence,kind,source,segment,message,level:.12};state.session.sequence=sequence;for(const id of listeners.get('meeting-engine')??[])callbacks.get(id)?.({payload});};window.engineMock=state;
 const internals={transformCallback(fn:(v:unknown)=>void){callbacks.set(++callbackId,fn);return callbackId;},unregisterCallback(id:number){callbacks.delete(id);},async invoke(command:string,args:Record<string,unknown>={}){
  state.calls.push(command);
  if(command==='share_iphone_document')return;
  if(command==='plugin:event|listen'){const event=String(args.event);listeners.set(event,[...(listeners.get(event)??[]),Number(args.handler)]);return args.handler;}
  if(command==='plugin:event|unlisten'){listeners.set(String(args.event),(listeners.get(String(args.event))??[]).filter(id=>id!==args.eventId));return;}
  if(command==='load_database')return JSON.parse(sessionStorage.getItem('engine-db')??'[]');
  if(command==='save_database'){sessionStorage.setItem('engine-db',JSON.stringify(args.bytes));return;}
  if(['invalidate_knowledge_roots','clear_knowledge_index','delete_knowledge_key'].includes(command))return;
  if(command==='knowledge_key_status')return {nvidia:false,voyage:false};
  if(command==='has_api_key')return false;
  if(command==='has_deepgram_key')return !!state.deepgramKey;
  if(command==='set_deepgram_key'){state.deepgramKey=true;return;}
  if(command==='delete_deepgram_key'){state.deepgramKey=false;return;}
  if(command==='has_groq_key')return !!state.groqKey;
  if(command==='set_groq_key'){state.groqKey=true;return;}
  if(command==='delete_groq_key'){state.groqKey=false;return;}
  if(command==='engine_capabilities')return {native:true,microphone:true,platform:state.platform??'windows',audioPermissions:['macos','ios'].includes(state.platform??'')?(state.audioPermissions??{microphone:'granted',system:'granted'}):null,excludesOwnAudio:state.platform==='macos',systemAudio:state.platform!=='ios',modelReady:state.installed,installingModel:state.installingModel??null,devices:[{id:'test-mic',name:'Simulated native microphone'}],active:state.session};
  if(command==='engine_request_audio_permission'){const source=args.source as 'microphone'|'system';state.audioPermissions??={microphone:'not-determined',system:'required'};if(!state.denyPermission)state.audioPermissions[source]='granted';return state.audioPermissions[source];}
  if(command==='engine_open_audio_settings')return;
  if(command==='engine_models')return [{id:'whisper-base',name:'Whisper Base',bytes:147951465,sha256:'test',installed:state.installed}];
  if(command==='engine_prepare_model'){
   state.installingModel=String(args.model);cancelDownload=false;
   const progress=(stage:string,received:number)=>{for(const id of listeners.get('engine-model-progress')??[])callbacks.get(id)?.({payload:{id:args.model,requestId:args.requestId,stage,received,total:147951465}});};
   progress(state.bundled?'copying':'downloading',73000000);
   try{if(state.holdDownload)await new Promise<void>(resolve=>{finishDownload=resolve;state.releasePreparation=resolve;});if(cancelDownload&&!state.ignoreCancel)throw new Error('Preparation cancelled');if(state.prepareError)throw new Error('Offline: speech resources could not be prepared');state.installed=true;progress('ready',147951465);}finally{state.installingModel=null;}return;
  }
  if(command==='engine_cancel_preparation'){cancelDownload=true;if(!state.ignoreCancel)finishDownload?.();return;}
  if(command==='engine_install_model'){state.installingModel=String(args.model);cancelDownload=false;try{if(state.holdDownload)await new Promise<void>(resolve=>{finishDownload=resolve;});if(cancelDownload)throw new Error('Model installation cancelled');state.installed=true;}finally{state.installingModel=null;}return;}
  if(command==='engine_cancel_install'){cancelDownload=true;finishDownload?.();return;}
  if(command==='delete_api_key'||command==='notes_cancel')return;
  if(command==='engine_recover'){const saved=JSON.parse(sessionStorage.getItem('engine-journal')??'null');return saved?[{...saved,status:saved.status==='complete'?'complete':'interrupted'}]:[];}
  if(command==='engine_status'){const snapshot=state.session?structuredClone(state.session):null;if(state.statusDelay)await new Promise(r=>setTimeout(r,state.statusDelay));return snapshot;}
  if(command==='engine_start'){if(state.startError)throw new Error('Input device is unavailable');const request=args.request as {meetingId:string;transcribe:boolean;retainAudio:boolean;microphone:boolean;systemAudio:boolean;model:string;language:string;speechProvider?:string;cloudAudioConsent?:boolean};state.lastStart={speechProvider:request.speechProvider,cloudAudioConsent:request.cloudAudioConsent,microphone:request.microphone,systemAudio:request.systemAudio};state.session={sessionId:crypto.randomUUID(),meetingId:request.meetingId,schemaVersion:1,sequence:0,model:request.transcribe?(request.speechProvider==='groq'?'groq/whisper-large-v3-turbo':request.speechProvider==='deepgram'?'deepgram/nova-3':request.model):null,language:request.language,sources:[...(request.microphone?['microphone' as const]:[]),...(request.systemAudio?['system' as const]:[])],startedAt:1,status:'live',duration:0,segments:[],retainedAudio:request.retainAudio,transcribing:request.transcribe,warnings:[]};state.emit('started');return structuredClone(state.session);}
  if(command==='engine_pause'&&state.session){state.session.status=args.paused?'paused':'live';state.emit('state');return;}
  if(command==='engine_stop'&&state.session){state.session.status='finalizing';state.emit('state');await new Promise(r=>setTimeout(r,200));if(state.session.transcribing&&!args.cancelTranscription)state.push('Final passage captured during stop.',16);state.session.status=args.cancelTranscription?'interrupted':'complete';state.emit('finished');return structuredClone(state.session);}
  if(command==='engine_delete_meeting'||command==='engine_clear_history'){sessionStorage.removeItem('engine-journal');return;}
  if(command==='notes_models')return ['test-local:small'];
  if(command==='notes_generate_nvidia'){state.reportSources=(args.segments as {id:string}[]).map(s=>s.id);if(state.reportDelay)await new Promise(r=>setTimeout(r,state.reportDelay));if(state.reportError)throw new Error('NVIDIA quota unavailable. Your transcript is saved.');return {items:[{kind:'summary',title:'Overview',text:'The team reviewed the proposal.',evidenceIds:[state.invalidDraft?'fake-id':state.reportSources[0]]},{kind:'action_item',title:'Review proposal',text:'Review the proposal on Friday.',evidenceIds:state.repeatReportEvidence?[state.reportSources[0],state.reportSources[0]]:[state.reportSources[0]]}]};}
  if(command==='notes_generate')return {items:[{kind:'decision',title:'Review proposal',text:'Review the proposal on Friday.',evidenceIds:[state.invalidDraft?'fake-id':state.session!.segments[0].id]}]};
  throw new Error(`Unexpected mock command: ${command}`);
 }};
 Object.assign(window,{__TAURI_INTERNALS__:internals,__TAURI_EVENT_PLUGIN_INTERNALS__:{unregisterListener:(_event:string,id:number)=>callbacks.delete(id)}});
});}
