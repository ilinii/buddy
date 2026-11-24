import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import { appendEvent, mergeSynthesisBlock, timestamp, type Meeting, type NoteBlock } from '../meeting/model';
export const draftSchema=z.object({items:z.array(z.object({kind:z.enum(['summary','decision','action_item','question']),title:z.string().trim().min(1).max(200),text:z.string().trim().min(1).max(3000),evidenceIds:z.array(z.string()).min(1).max(12).transform(ids => [...new Set(ids)])}).strict()).min(1).max(48)}).strict();
export type NoteDraft=z.infer<typeof draftSchema>;
export function validateDraft(value:unknown,meeting:Meeting):NoteDraft{
  const draft=draftSchema.parse(value);
  for(const item of draft.items)if(item.evidenceIds.some(id=>!meeting.segments.some(s=>s.id===id&&s.final&&(meeting.mode==='demo'||s.channel!=='demo'))))throw new Error('Draft references unavailable transcript evidence. Nothing was applied.');
  return draft;
}
export function excerptDraft(meeting:Meeting):NoteDraft{
  const segments=meeting.segments.filter(s=>s.final&&s.text.trim()&&(meeting.mode==='demo'||s.channel!=='demo'));
  // Select evenly across the conversation, rather than presenting the beginning as a full summary.
  const selected=Array.from({length:Math.min(12,segments.length)},(_,i)=>segments[Math.floor(i*segments.length/Math.min(12,segments.length))]);
  return validateDraft({items:selected.map(s=>({kind:'summary',title:`Source excerpt · ${timestamp(s.start)}`,text:s.text.slice(0,3000),evidenceIds:[s.id]}))},meeting);
}
const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
// Constrain carry-over to one action with the same title and source passages on
// both sides. A segment can contain several tasks.
function actionKey(item: {title: string; evidenceIds: string[]}) {
  return JSON.stringify([item.title.trim().toLowerCase(), [...new Set(item.evidenceIds)].sort()]);
}
/** Idempotent generated section. Personal notes and edited generated sections are never overwritten. */
export function applyDraft(meeting:Meeting,value:NoteDraft,provider:'excerpts'|'local'|'nvidia'):Meeting{
  const draft=validateDraft(value,meeting),now=new Date().toISOString(),blockId=`transcript-draft-${provider}`;
  const old=meeting.blocks.find(b=>b.id===blockId);
  if(old?.editedBy==='user')throw new Error('You edited this generated section. Add a personal note or keep your existing version.');
  const previousActions = meeting.events.filter(event => event.type === 'action_item' && old?.eventIds.includes(event.id));
  const incomingActions = draft.items.filter(item => item.kind === 'action_item').map(actionKey);
  let next=meeting;const ids:string[]=[];
  draft.items.forEach(item=>{
    if(item.kind==='summary')return;
    const evidence=meeting.segments.filter(s=>item.evidenceIds.includes(s.id));
    const fingerprint=JSON.stringify(item);let hash=2166136261;for(let j=0;j<fingerprint.length;j++)hash=Math.imul(hash^fingerprint.charCodeAt(j),16777619);
    let id=`${blockId}-${(hash>>>0).toString(16)}`;
    const collision=meeting.events.find(e=>e.id===id);
    if(collision&&(collision.text!==item.text||collision.title!==item.title||JSON.stringify(collision.evidenceIds)!==JSON.stringify(item.evidenceIds)))id=`${blockId}-${crypto.randomUUID()}`;
    if (item.kind === 'action_item') {
      const key = actionKey(item);
      const matches = previousActions.filter(event => actionKey(event) === key);
      if (matches.length === 1 && incomingActions.filter(candidate => candidate === key).length === 1) {
        id = matches[0].id;
      }
    }
    ids.push(id);
    const existing=meeting.events.find(e=>e.id===id);
    next=appendEvent(next,{id,meetingId:meeting.id,type:item.kind,title:item.title,text:item.text,start:Math.min(...evidence.map(s=>s.start)),end:Math.max(...evidence.map(s=>s.end)),topic:'Transcript draft',relatedIds:[],evidenceIds:item.evidenceIds,evidenceState:provider==='excerpts'?'explicit':'verify',done:existing?.done??false,createdAt:existing?.createdAt??now,updatedAt:now});
  });
  // Keep reviewed completions even when a later draft omits or renames the task.
  const obsolete=meeting.events.filter(e=>e.id.startsWith(`${blockId}-`)&&!(e.type==='action_item'&&e.done)&&!ids.includes(e.id)&&!meeting.blocks.some(b=>b.id!==blockId&&b.eventIds.includes(e.id))).map(e=>e.id);
  next={...next,events:next.events.filter(e=>!obsolete.includes(e.id))};
  const block:NoteBlock={id:blockId,title:provider==='excerpts'?'Transcript excerpts':provider==='local'?'AI draft · verify against transcript':'Meeting report · AI draft',html:draft.items.map(item=>`<p><strong>${escape(item.title)}</strong></p><p>${escape(item.text)}</p>`).join(''),eventIds:ids,evidenceIds:[...new Set(draft.items.flatMap(item=>item.evidenceIds))],revision:(old?.revision??0)+1,editedBy:'synthesis',updatedAt:now};
  return {...next,blocks:old?next.blocks.map(b=>b.id===blockId?mergeSynthesisBlock(b,block):b):[...next.blocks,block]};
}
export const localNotes={models:()=>invoke<string[]>('notes_models'),cancel:()=>invoke<void>('notes_cancel'),async generate(meeting:Meeting,model:string){return validateDraft(await invoke('notes_generate',{model,segments:meeting.segments.filter(s=>s.final&&s.channel!=='demo')}),meeting);}};
