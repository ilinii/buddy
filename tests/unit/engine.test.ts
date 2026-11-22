import { describe, it, expect } from 'vitest';
import { createMeeting, settingsSchema, updateBlock } from '../../src/meeting/model';
import { recordingPermissionIssue, engineEventSchema, sessionSchema, mergeEngineSession, type EngineSession } from '../../src/engine/client';
import { applyDraft, excerptDraft, validateDraft } from '../../src/engine/notes';
const fixture=()=>{const meeting=createMeeting('Real discussion','microphone');meeting.segments=[{id:'native-1',start:0,end:3,text:'We will send the proposal on Friday.',channel:'microphone',final:true},{id:'native-2',start:4,end:8,text:'The budget is still undecided.',channel:'system',final:true}];meeting.duration=8;return meeting;};
const snapshot=(meetingId:string):EngineSession=>({sessionId:crypto.randomUUID(),meetingId,startedAt:1,status:'complete',duration:8,segments:fixture().segments,retainedAudio:false,transcribing:true,warnings:[]});
describe('native engine boundary',()=>{
 it('gates only selected macOS sources and treats support separately from permission',()=>{const settings=settingsSchema.parse({}),caps={platform:'macos',native:true,microphone:true,systemAudio:true,modelReady:false,devices:[],active:null,audioPermissions:{microphone:'denied' as const,system:'required' as const}};expect(recordingPermissionIssue(caps,settings)).toContain('microphone');expect(recordingPermissionIssue(caps,{captureMicrophone:false,captureSystemAudio:true})).toContain('Screen & System');expect(recordingPermissionIssue(caps,{captureMicrophone:false,captureSystemAudio:false})).toBeUndefined();expect(recordingPermissionIssue({...caps,audioPermissions:{microphone:'granted',system:'granted'}},{captureMicrophone:true,captureSystemAudio:true})).toBeUndefined();expect(recordingPermissionIssue({...caps,systemAudio:false},{captureMicrophone:false,captureSystemAudio:true})).toContain('unavailable');expect(recordingPermissionIssue({...caps,platform:'windows'},settings)).toBeUndefined();});
 it('keeps cloud audio separately opt-in and never accepts a credential in settings',()=>{const settings=settingsSchema.parse({groqKey:'never-store-this'});expect(settings.speechProvider).toBe('local');expect(settings.groqAudioConsent).toBe(false);expect(settings.deepgramAudioConsent).toBe(false);expect(settingsSchema.parse({speechProvider:'deepgram',deepgramKey:'never-store'})).not.toHaveProperty('deepgramKey');expect(settings).not.toHaveProperty('groqKey');});
 it('migrates old setup defaults once and preserves a new explicit audio-only choice',()=>{expect(settingsSchema.parse({localTranscription:false}).localTranscription).toBe(true);expect(settingsSchema.parse({localTranscription:false,recordingSetupVersion:1}).localTranscription).toBe(false);});
 it('rejects unsupported journal versions and preserves source provenance',()=>{const m=fixture(),s={...snapshot(m.id),schemaVersion:1,model:'whisper-base',language:'fr',sources:['system' as const]};expect(mergeEngineSession(m,sessionSchema.parse(s)).recording?.model).toBe('whisper-base');expect(sessionSchema.safeParse({...s,schemaVersion:2}).success).toBe(false);});
 it('makes local transcription automatic while keeping audio retention and system capture opt-in',()=>{const settings=settingsSchema.parse({});expect(settings.localTranscription).toBe(true);expect(settings.captureSystemAudio).toBe(false);expect(settings.keepNativeAudio).toBe(false);expect(settings.speechModel).toBe('whisper-base');});
 it('recovers transcript idempotently without changing edited notes',()=>{const original=fixture(),meeting=updateBlock(original,original.blocks[0].id,'<p>My exact words</p>'),session=snapshot(meeting.id);const recovered=mergeEngineSession(mergeEngineSession(meeting,session),session);expect(recovered.segments).toHaveLength(2);expect(recovered.blocks).toEqual(meeting.blocks);expect(recovered.status).toBe('complete');});
 it('rejects another meeting, demo evidence and out-of-range evidence',()=>{const meeting=fixture(),session=snapshot(meeting.id);expect(()=>mergeEngineSession(meeting,{...session,meetingId:crypto.randomUUID()})).toThrow('belong');expect(()=>mergeEngineSession(meeting,{...session,segments:[{...session.segments[0],channel:'demo'}]})).toThrow('evidence');expect(()=>mergeEngineSession(meeting,{...session,duration:1})).toThrow('evidence');});
 it('keeps provisional captions out of evidence and validates their source',()=>{const m=fixture(),session=snapshot(m.id),partial={...session.segments[0],final:false};const event={...session,sequence:1,kind:'interim',level:.1,message:null,source:'microphone',segment:partial};expect(engineEventSchema.safeParse(event).success).toBe(true);expect(engineEventSchema.safeParse({...event,source:'system'}).success).toBe(false);expect(engineEventSchema.safeParse({...event,segment:{...partial,final:true}}).success).toBe(false);expect(engineEventSchema.safeParse({...event,kind:'segment'}).success).toBe(false);expect(()=>mergeEngineSession(m,{...session,segments:[partial]})).toThrow('evidence');});
 it('validates native event timestamps and rejects invalid states',()=>{const session=snapshot(crypto.randomUUID());const event={...session,sequence:1,kind:'segment',level:.2,message:null,segment:session.segments[0]};expect(engineEventSchema.safeParse(event).success).toBe(true);expect(engineEventSchema.safeParse({...event,sequence:-1}).success).toBe(false);expect(engineEventSchema.safeParse({...event,status:'fake'}).success).toBe(false);});
});
describe('evidence-backed drafts',()=>{
 it('extracts real passages without creating actions or decisions',()=>{const m=fixture(),draft=excerptDraft(m),next=applyDraft(m,draft,'excerpts');expect(next.events).toHaveLength(0);expect(next.blocks[1].evidenceIds).toEqual(['native-1','native-2']);expect(next.blocks[0]).toEqual(m.blocks[0]);});
 it('marks local model claims for verification and preserves action completion',()=>{const m=fixture(),draft={items:[{kind:'action_item' as const,title:'Send proposal',text:'Send the proposal on Friday.',evidenceIds:['native-1']}]};let next=applyDraft(m,draft,'local');expect(next.events[0].evidenceState).toBe('verify');next.events[0].done=true;next=applyDraft(next,draft,'local');expect(next.events).toHaveLength(1);expect(next.events[0].done).toBe(true);expect(next.events[0].start).toBe(0);expect(next.events[0].end).toBe(3);});
 it('rejects fabricated and partial evidence instead of applying it',()=>{const m=fixture(),draft=excerptDraft(m);expect(()=>validateDraft({items:[{...draft.items[0],evidenceIds:['fake']}]},m)).toThrow('evidence');expect(()=>validateDraft(draft,{...m,segments:m.segments.map(s=>({...s,final:false}))})).toThrow('evidence');});
 it('refuses to overwrite an edited generated section',()=>{let m=fixture();const draft=excerptDraft(m);m=applyDraft(m,draft,'excerpts');m=updateBlock(m,'transcript-draft-excerpts','<p>Keep my edit</p>');expect(()=>applyDraft(m,draft,'excerpts')).toThrow('edited');expect(m.blocks[1].html).toBe('<p>Keep my edit</p>');});
 it('escapes untrusted generated HTML',()=>{const m=fixture(),draft={items:[{kind:'summary' as const,title:'<script>bad</script>',text:'<img src=x onerror=evil()>',evidenceIds:['native-1']}]};const next=applyDraft(m,draft,'local');expect(next.blocks[1].html).not.toContain('<script>');expect(next.blocks[1].html).toContain('&lt;img');});
 it('isolates real meetings from demo segments',()=>{const m=fixture();m.segments.push({id:'demo-secret',start:0,end:1,text:'Demo only',channel:'demo',final:true});expect(excerptDraft(m).items.flatMap(i=>i.evidenceIds)).not.toContain('demo-secret');});
});

describe('action identity across report revisions', () => {
 const action = (title: string, text: string) => ({kind: 'action_item' as const, title, text, evidenceIds: ['native-1']});
 const original = action('Send the brief', 'Send it Friday.');
 const paraphrase = action('Send the brief', 'Alex will send it on Friday.');
 function withCompletedAction() {
   const meeting = applyDraft(fixture(), {items: [original]}, 'nvidia');
   meeting.events[0].done = true;
   return meeting;
 }
 it('keeps the completed action ID when its description is paraphrased', () => {
   const before = withCompletedAction();
   const after = applyDraft(before, {items: [paraphrase]}, 'nvidia');
   expect(after.events).toHaveLength(1);
   expect(after.events[0]).toMatchObject({id: before.events[0].id, done: true, text: paraphrase.text});
   expect(after.blocks.at(-1)?.eventIds).toEqual([before.events[0].id]);
 });
 it('leaves a new or ambiguous task from the same passage unchecked', () => {
   const before = withCompletedAction();
   const revised = applyDraft(before, {items: [action('Call supplier', 'Call Friday.')]}, 'nvidia');
   expect(revised.events.find(event => event.title === 'Call supplier')?.done).toBe(false);
   expect(revised.events.find(event => event.id === before.events[0].id)?.done).toBe(true);
   const split = applyDraft(before, {items: [paraphrase, action(original.title, 'Send the second brief.')]}, 'nvidia');
   expect(split.events.filter(event => event.id !== before.events[0].id).map(event => event.done)).toEqual([false, false]);
   expect(split.events.find(event => event.id === before.events[0].id)?.done).toBe(true);
 });
});
