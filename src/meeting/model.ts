import { z } from 'zod';

export const evidenceStateSchema = z.enum(['explicit', 'inferred', 'unresolved', 'verify']);
export const eventSchema = z.object({
  id: z.string().min(1), meetingId: z.string().min(1),
  type: z.enum(['topic_started', 'proposal', 'question', 'objection', 'alternative', 'decision', 'action_item', 'blocker', 'clarification']),
  title: z.string().min(1), text: z.string().min(1),
  start: z.number().nonnegative(), end: z.number().nonnegative(),
  topic: z.string(), relatedIds: z.array(z.string()), evidenceIds: z.array(z.string()).min(1),
  evidenceState: evidenceStateSchema, owner: z.string().optional(), due: z.string().optional(),
  done: z.boolean().default(false), createdAt: z.string(), updatedAt: z.string(),
}).refine(e => e.end >= e.start, 'Event end precedes start');
export type MeetingEvent = z.infer<typeof eventSchema>;
export type EventType = MeetingEvent['type'];

export const segmentSchema = z.object({
  id: z.string(), start: z.number().nonnegative(), end: z.number().nonnegative(),
  text: z.string(), channel: z.enum(['microphone', 'system', 'import', 'demo']), final: z.boolean(), speaker:z.string().max(150).optional(),
}).refine(s => s.end >= s.start, 'Segment end precedes start');
export type Segment = z.infer<typeof segmentSchema>;

export const blockSchema = z.object({
  id: z.string(), title: z.string(), html: z.string(), eventIds: z.array(z.string()), evidenceIds:z.array(z.string()).optional(),
  revision: z.number().int().nonnegative(), editedBy: z.enum(['user', 'synthesis']), updatedAt: z.string(),
});
export type NoteBlock = z.infer<typeof blockSchema>;

export const participantSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(80) });
export type Participant = z.infer<typeof participantSchema>;

export const meetingSchema = z.object({
  id: z.string(), title: z.string(), date: z.string(), duration: z.number().nonnegative(),
  status: z.enum(['ready', 'live', 'paused', 'complete', 'interrupted']),
  mode: z.enum(['demo', 'microphone', 'manual']), tags: z.array(z.string()),
  kind: z.enum(['meeting','note']).optional(),
  participants: z.array(participantSchema).max(24).default([]),
  report: z.object({status:z.enum(['running','ready','failed','unavailable']),provider:z.enum(['excerpts','local','nvidia']),inputHash:z.string(),message:z.string(),updatedAt:z.string()}).optional(),
  recording: z.object({sessionId:z.uuid(), transcribing:z.boolean(), retainedAudio:z.boolean(), warnings:z.array(z.string()), model:z.string().optional(),language:z.string().optional(),sources:z.array(z.enum(['microphone','system'])).optional()}).optional(),
  segments: z.array(segmentSchema), events: z.array(eventSchema), blocks: z.array(blockSchema),
});
export type Meeting = z.infer<typeof meetingSchema>;
export const isPersonalNote=(meeting:Pick<Meeting,'kind'|'mode'>)=>meeting.kind==='note'||meeting.mode==='manual';

export const settingsSchema = z.object({
  theme:z.enum(['light','dark']).default('light'), cloudLibraryConsent:z.boolean().default(false),
  onboarded: z.boolean().default(false), provider: z.enum(['offline', 'gemini', 'nvidia']).default('offline'),
  nvidiaModel:z.enum(['deepseek-ai/deepseek-v4.1-flash','nvidia/nemotron-3.5-super-vl-120b-a12b']).default('nvidia/nemotron-3.5-super-vl-120b-a12b'),
  nvidiaConsent:z.boolean().default(false), voyageConsent:z.boolean().default(false),
  model: z.string().default('gemini-3.1-flash-lite'), language: z.enum(['en', 'fr']).default('en'),
  deviceId: z.string().default('default'), nativeDeviceId:z.string().default('default'),
  speechProvider:z.enum(['local','groq','deepgram']).default('local'), groqAudioConsent:z.boolean().default(false), deepgramAudioConsent:z.boolean().default(false),
  speechModel:z.enum(['whisper-base','whisper-small']).default('whisper-base'), localTranscription:z.boolean().default(true), captureSystemAudio:z.boolean().default(false), captureMicrophone:z.boolean().default(true), keepNativeAudio:z.boolean().default(false), localNoteModel:z.string().max(150).default(''), retainAudio: z.boolean().default(false),
  focusMode: z.boolean().default(false), reduceMotion: z.boolean().default(false), cloudConsent: z.boolean().default(false),
  recordingSetupVersion:z.number().int().min(0).max(1).default(0),
  synthesisInterval: z.number().min(10).max(120).default(30),
}).transform(settings=>settings.recordingSetupVersion===0?{...settings,localTranscription:true,recordingSetupVersion:1}:settings);
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings = settingsSchema.parse({});

export interface DocumentChunk {
  id: string; documentId: string; name: string; location: string; text: string;
  group: string; demo: boolean;
}
export interface IndexedDocument {
  id: string; name: string; type: string; size: number; indexedAt: string; group: string; demo: boolean; contentHash?: string;
  chunks: DocumentChunk[];
}
export interface Citation {
  kind: 'transcript' | 'document' | 'note'; id: string; label: string;
  meetingId?: string; segmentId?: string; blockId?: string; revision?: number; chunk?: DocumentChunk;
}
export interface Answer { text: string; citations: Citation[]; provider: 'offline' | 'gemini' | 'nvidia'; details?:string; }
export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; citations: Citation[]; details?:string; provider?:Answer['provider']; }

export const evidenceLabels: Record<MeetingEvent['evidenceState'], string> = {
  explicit: 'Explicitly confirmed', inferred: 'Inferred from discussion', unresolved: 'Unresolved', verify: 'Needs verification',
};
export const eventLabels: Record<EventType, string> = {
  topic_started: 'Topic', proposal: 'Proposal', question: 'Open question', objection: 'Challenge',
  alternative: 'Alternative', decision: 'Decision', action_item: 'Action', blocker: 'Blocker', clarification: 'Clarification',
};
export function timestamp(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
export function updateBlock(meeting: Meeting, blockId: string, html: string): Meeting {
  return { ...meeting, blocks: meeting.blocks.map(block => block.id === blockId
    ? { ...block, html, editedBy: 'user', revision: block.revision + 1, updatedAt: new Date().toISOString() }
    : block) };
}
export function mergeSynthesisBlock(existing: NoteBlock, incoming: NoteBlock): NoteBlock {
  if (existing.editedBy === 'user' || incoming.revision <= existing.revision) return existing;
  return incoming;
}
export function validateEvent(event: unknown, meeting: Meeting): MeetingEvent {
  const parsed = eventSchema.parse(event);
  if (parsed.meetingId !== meeting.id) throw new Error('Event belongs to a different meeting');
  if (!parsed.evidenceIds.every(id => meeting.segments.some(s => s.id === id && s.final)))
    throw new Error('Event references missing or partial transcript evidence');
  if (!parsed.relatedIds.every(id => meeting.events.some(e => e.id === id)))
    throw new Error('Event references an unknown related event');
  const evidence = meeting.segments.filter(s => parsed.evidenceIds.includes(s.id));
  if (parsed.start < Math.min(...evidence.map(s => s.start)) || parsed.end > Math.max(...evidence.map(s => s.end)))
    throw new Error('Event timestamps lie outside its evidence');
  return parsed;
}
export function appendEvent(meeting: Meeting, event: MeetingEvent): Meeting {
  const parsed = validateEvent(event, meeting);
  return { ...meeting, events: [...meeting.events.filter(e => e.id !== parsed.id), parsed] };
}
export function createMeeting(title: string, mode: Meeting['mode']): Meeting {
  return { id: crypto.randomUUID(), title: title.trim() || (mode==='manual'?'New note':'Untitled meeting'), kind:mode==='manual'?'note':'meeting', date: new Date().toISOString(),
    duration: 0, status: 'ready', mode, tags: [], participants: [], segments: [], events: [], blocks: [
      { id: crypto.randomUUID(), title: 'Meeting notes', html: '<p></p>', revision: 0, editedBy: 'user', eventIds: [], updatedAt: new Date().toISOString() },
    ] };
}
export function toMarkdown(meeting: Meeting) {
  const plain = (html: string) => html.replace(/<li>/g, '\n- ').replace(/<\/p>|<\/h[1-6]>/g, '\n\n').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
  return `# ${meeting.title}\n\n${meeting.mode === 'demo' ? 'DEMO MEETING — fictional sample discussion\n\n' : ''}${new Date(meeting.date).toLocaleString()}\n\n`
    + (meeting.participants.length ? `People (added manually): ${meeting.participants.map(p => p.name).join(', ')}\n\n` : '')
    + meeting.blocks.map(b => `## ${b.title}\n\n${plain(b.html).trim()}`).join('\n\n')
    + '\n\n## Decisions and actions\n\n' + meeting.events.filter(e => ['decision', 'action_item'].includes(e.type)).map(e => `- ${e.done ? '[x]' : '[ ]'} ${e.text} (${evidenceLabels[e.evidenceState]}; ${timestamp(e.start)}; evidence: ${e.evidenceIds.join(', ')})`).join('\n')
    + '\n\n## Transcript\n\n' + meeting.segments.map(s => `**${timestamp(s.start)}** [${s.id}; ${s.channel}] ${s.text}`).join('\n\n');
}

/** Explicit user-entered names only; never inferred from a transcript or microphone. */
export function participantsFromText(text: string, existing: Participant[]): Participant[] {
  const names = text.split(/[,\n]/).map(name => name.trim()).filter(Boolean);
  const unique = [...new Map(names.map(name => [name.toLocaleLowerCase(), name])).values()];
  if (unique.length > 24) throw new Error('Add up to 24 people per meeting.');
  if (unique.some(name => name.length > 80)) throw new Error('Keep each name to 80 characters or fewer.');
  return unique.map(name => ({ id: existing.find(person => person.name.toLocaleLowerCase() === name.toLocaleLowerCase())?.id ?? crypto.randomUUID(), name }));
}
