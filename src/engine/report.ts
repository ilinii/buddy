import {invoke} from '@tauri-apps/api/core';
import type {Meeting,Settings} from '../meeting/model';
import {excerptDraft,localNotes,validateDraft,type NoteDraft} from './notes';

export type ReportProvider='excerpts'|'local'|'nvidia';
export const reportSources=(meeting:Meeting)=>meeting.segments.filter(s=>s.final&&s.text.trim()&&s.channel!=='demo');
// Exact comparison protects against in-flight transcript corrections, not just new segment counts.
export const reportInput=(meeting:Meeting)=>JSON.stringify(reportSources(meeting));
export async function reportHash(input:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function reportProvider(settings:Settings,native:boolean,ios=false):ReportProvider{
  if(native&&settings.provider==='nvidia'&&settings.nvidiaConsent)return 'nvidia';
  return native&&!ios&&settings.localNoteModel?'local':'excerpts';
}
export async function buildReport(meeting:Meeting,settings:Settings,provider:ReportProvider,signal:AbortSignal):Promise<NoteDraft>{
  if(signal.aborted)throw new DOMException('Report cancelled','AbortError');
  if(provider==='excerpts')return excerptDraft(meeting);
  const cancel=()=>{void localNotes.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{
    const result=provider==='local'?await localNotes.generate(meeting,settings.localNoteModel):validateDraft(await invoke('notes_generate_nvidia',{model:settings.nvidiaModel,consent:settings.nvidiaConsent,segments:reportSources(meeting)}),meeting);
    if(signal.aborted)throw new DOMException('Report cancelled','AbortError');
    return result;
  }finally{signal.removeEventListener('abort',cancel);}
}
