import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createMeeting, segmentSchema, type Meeting, type Settings } from '../meeting/model';
import { isNative } from '../storage/service';
const status = z.enum(['starting','live','paused','finalizing','complete','interrupted']);
export const sessionSchema = z.object({ schemaVersion:z.literal(1).optional(),sequence:z.number().int().nonnegative().optional(),model:z.string().nullable().optional(),language:z.string().nullable().optional(),sources:z.array(z.enum(['microphone','system'])).optional(),sessionId:z.uuid(), meetingId:z.uuid(), startedAt:z.number().nonnegative(), status, duration:z.number().finite().nonnegative(), segments:z.array(segmentSchema).max(30000), retainedAudio:z.boolean(), transcribing:z.boolean(), warnings:z.array(z.string()) });
export type EngineSession=z.infer<typeof sessionSchema>;
export const engineEventSchema=z.object({ sessionId:z.uuid(),meetingId:z.uuid(),sequence:z.number().int().positive(),kind:z.enum(['started','state','level','segment','warning','error','finished','interim','transport']),status,duration:z.number().finite().nonnegative(),level:z.number().finite().min(0).max(1),message:z.string().nullable(),segment:segmentSchema.nullable(),source:z.enum(['microphone','system']).optional() }).superRefine((event,ctx)=>{if(event.kind==='interim'&&(!event.source||(event.segment&&(event.segment.final||event.segment.channel!==event.source))))ctx.addIssue({code:'custom',message:'Invalid provisional source'});if(event.kind==='segment'&&(!event.segment?.final||!['microphone','system'].includes(event.segment.channel)))ctx.addIssue({code:'custom',message:'Invalid finalized evidence'});});
export type EngineEvent=z.infer<typeof engineEventSchema>;
export type AudioPermission='not-determined'|'granted'|'denied'|'restricted'|'required';
export interface EngineCapabilities {platform?:string;audioPermissions?:{microphone:AudioPermission;system:AudioPermission}|null;excludesOwnAudio?:boolean;installingModel?:string|null;modelBundled?:boolean;native:boolean;microphone:boolean;systemAudio:boolean;devices:{id:string;name:string}[];modelReady:boolean;active:EngineSession|null;}
export interface SpeechModel {id:string;name:string;bytes:number;sha256:string;installed:boolean;bundled?:boolean;}
export const preparationSchema=z.object({requestId:z.uuid(),id:z.string(),stage:z.enum(['checking','copying','downloading','verifying','ready']),received:z.number().finite().nonnegative(),total:z.number().finite().positive()});
export type PreparationProgress=z.infer<typeof preparationSchema>;
export function recordingPermissionIssue(capabilities:EngineCapabilities,settings:Pick<Settings,'captureMicrophone'|'captureSystemAudio'>):string|undefined {
  if(settings.captureSystemAudio&&!capabilities.systemAudio)return 'Computer audio is unavailable on this platform. Turn it off before recording.';
  if(!['macos','ios'].includes(capabilities.platform??''))return;
  if(settings.captureMicrophone&&capabilities.audioPermissions?.microphone!=='granted')return 'Allow microphone access in the recording setup before starting.';
  if(settings.captureSystemAudio&&capabilities.audioPermissions?.system!=='granted')return 'Allow Screen & System Audio Recording for Buddy, then relaunch Buddy if macOS requests it.';
}
export const engine={
  requestAudioPermission:(source:'microphone'|'system')=>invoke<AudioPermission>('engine_request_audio_permission',{source}),
  openAudioSettings:(source:'microphone'|'system')=>invoke<void>('engine_open_audio_settings',{source}),
  async capabilities(model:string):Promise<EngineCapabilities>{if(!isNative())return {native:false,microphone:!!navigator.mediaDevices?.getUserMedia,systemAudio:false,devices:[],modelReady:false,active:null};return invoke('engine_capabilities',{model});},
  models:()=>invoke<SpeechModel[]>('engine_models'),
  install:(model:string)=>invoke<void>('engine_install_model',{model}),
  async prepare(model:string,requestId:string,onProgress:(progress:PreparationProgress)=>void,signal:AbortSignal){
    const unlisten=await listen<unknown>('engine-model-progress',({payload})=>{const parsed=preparationSchema.safeParse(payload);if(parsed.success&&parsed.data.requestId===requestId)onProgress(parsed.data);});
    const cancel=()=>{void invoke('engine_cancel_preparation',{requestId}).catch(()=>{});};
    try{if(signal.aborted)throw new DOMException('Preparation cancelled','AbortError');signal.addEventListener('abort',cancel,{once:true});await invoke('engine_prepare_model',{model,requestId});if(signal.aborted)throw new DOMException('Preparation cancelled','AbortError');}
    finally{signal.removeEventListener('abort',cancel);unlisten();}
  },
  cancelInstall:()=>invoke<void>('engine_cancel_install'),
  async start(meetingId:string,settings:Settings){return sessionSchema.parse(await invoke('engine_start',{request:{meetingId,language:settings.language,model:settings.speechModel,microphone:settings.captureMicrophone,systemAudio:settings.captureSystemAudio,deviceId:settings.nativeDeviceId,retainAudio:settings.keepNativeAudio,transcribe:settings.localTranscription,speechProvider:settings.speechProvider,cloudAudioConsent:settings.speechProvider==='deepgram'?settings.deepgramAudioConsent:settings.groqAudioConsent}}));},
  pause:(sessionId:string,paused:boolean)=>invoke<void>('engine_pause',{sessionId,paused}),
  async stop(sessionId:string,cancelTranscription=false){return sessionSchema.parse(await invoke('engine_stop',{sessionId,cancelTranscription}));},
  async status(){const data=await invoke('engine_status');return data?sessionSchema.parse(data):null;},
  async recover(){return z.array(sessionSchema).parse(await invoke('engine_recover'));},
  deleteMeeting:(meetingId:string)=>invoke<void>('engine_delete_meeting',{meetingId}),
  subscribe:(onEvent:(event:EngineEvent)=>void,onError:(error:string)=>void)=>listen<unknown>('meeting-engine',({payload})=>{const parsed=engineEventSchema.safeParse(payload);if(parsed.success)onEvent(parsed.data);else onError('The recording engine returned an invalid event. Finish recording and reopen Buddy.');}),
};
/** Merge only native sources from the matching session. Repeated recovery is idempotent. */
export function mergeEngineSession(meeting:Meeting,session:EngineSession):Meeting {
  if(meeting.id!==session.meetingId||meeting.mode!=='microphone')throw new Error('Recording session does not belong to this meeting');
  const segments=new Map(meeting.segments.map(s=>[s.id,s]));
  for(const segment of session.segments){if(!segment.final||!['microphone','system'].includes(segment.channel)||segment.end>session.duration+0.1)throw new Error('Invalid native transcript evidence');segments.set(segment.id,segment);}
  const mapped=session.status==='starting'||session.status==='finalizing'?meeting.status:session.status;
  return {...meeting,duration:Math.max(session.duration,...[...segments.values()].map(s=>s.end)),status:mapped,segments:[...segments.values()].sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id)),recording:{sessionId:session.sessionId,transcribing:session.transcribing,retainedAudio:session.retainedAudio,warnings:session.warnings,model:session.model??meeting.recording?.model,language:session.language??meeting.recording?.language,sources:session.sources??meeting.recording?.sources}};
}
/** A journal can survive a failed canonical save. Recover speech without inventing a title or report. */
export function recoverOrphanSession(session:EngineSession):Meeting{
  const base=createMeeting('Recovered recording','microphone');
  const recovered=mergeEngineSession({...base,id:session.meetingId,date:new Date(session.startedAt*1000).toISOString(),tags:['Recovered']},session);
  return {...recovered,report:{status:session.segments.length?'failed':'unavailable',provider:'excerpts',inputHash:'',message:session.segments.length?'Recovered saved speech from a recording journal. The original meeting entry was unavailable. Generate a report to continue.':'Recovered an audio session without finalized speech. Check its recording warnings.',updatedAt:new Date().toISOString()}};
}
