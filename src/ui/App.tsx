import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, AudioLines, BookOpen, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, FileText, FolderOpen, Headphones, Home, LayoutPanelLeft, ListChecks, LockKeyhole, Menu, Mic, MoreHorizontal, PanelLeftClose, PanelRightOpen, Pause, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Square, Trash2, Upload, X } from 'lucide-react';
import { defaultSettings, createMeeting, isPersonalNote, evidenceLabels, eventLabels, timestamp, toMarkdown, updateBlock, type Citation, type IndexedDocument, type Meeting, type MeetingEvent, type Segment, type Settings as AppSettings } from '../meeting/model';
import { demoMeeting, replayFrame, sampleMeetings } from '../meeting/demo';
import { storage, isNative } from '../storage/service';
import { extractDocument } from '../documents/service';
import { resolveSelectedFile, supportedExtensions } from '../documents/parser';
import { recordingPermissionIssue, engine, mergeEngineSession, recoverOrphanSession, type EngineSession, type PreparationProgress } from '../engine/client';
import { EngineSetup } from './EngineSetup';
import { TranscriptDraft } from './TranscriptDraft';
import { MeetingReport } from './MeetingReport';
import { SpeakerDetection } from './SpeakerDetection';
import { applyDraft } from '../engine/notes';
import {buildReport,reportProvider,reportSources,reportInput,reportHash} from '../engine/report';
import { MicrophoneCapture } from '../audio/capture';
import { Assistant, type AssistantDraft } from './Assistant';
import { MotionProvider } from './motion-system';
import { ReducedMotionConfig } from './motion-system';
import { FocusDialog } from './FocusDialog';
import { MotionRail } from './MotionRail';
import { BellOff } from 'lucide-react';
import { SourceExcerpt } from './SourceExcerpt';
import { MeetingNavigator } from './MeetingNavigator';
import { Library } from './Library';
import { LiquidButton } from './animate-ui/liquid-button';
import { AnimatedCheckbox, ConfirmationDialog, CopyAction } from './AnimatedControls';
import { RecordingStage } from './RecordingStage';
import { Participants } from './Participants';
import { changeView } from './motion';
import { NoteEditor } from './NoteEditor';
import { NoteRecordingSetup } from './NoteRecordingSetup';
import { Roadmap } from './Roadmap';
import { SettingsDialog } from './Settings';
import { downloadFile, Empty, IconButton, Logo, Modal, Orb } from './components';

import {Sun,Moon} from 'lucide-react';
import { Welcome } from './Welcome';
import { PhoneNavigation, usePhoneViewport } from './PhoneNavigation';
import { isIOS, isShowcase, recordingSettingsForPlatform } from '../platform';

type Page = 'home' | 'meeting' | 'knowledge' | 'actions';
type ModalState = 'draft' | 'new' | 'settings' | 'delete' | 'export' | 'deleteMeeting' | 'navigator' | 'focus' | null;
type Selection = { event?: MeetingEvent; citation?: Citation } | null;
const fixtureNames = ['Q2-revenue.csv', 'Q2-review.md'];
const demoRoute = new URLSearchParams(location.search).get('demo');

let bootPromise: Promise<Awaited<ReturnType<typeof storage.init>>> | undefined;
async function boot() {
  if (!bootPromise) bootPromise = (async () => {
    const state = await storage.init();
    if (!state.meetings.length && !state.settings.onboarded) {
      state.meetings = sampleMeetings();
      for (const m of state.meetings) await storage.saveMeeting(m);
      for (const name of fixtureNames) {
        const response = await fetch(`/fixtures/${name}`);
        if (!response.ok) throw new Error('Could not load the demo fixtures');
        const document = await extractDocument(new File([await response.blob()], name), 'Demo fixtures', true);
        await storage.indexDocument(document); state.documents.push(document);
      }
    }
    for (const meeting of state.meetings) if (meeting.status === 'live' || meeting.status === 'paused') { meeting.status = 'interrupted'; await storage.saveMeeting(meeting); }
    for(const meeting of state.meetings)if(meeting.report?.status==='running'){meeting.report={...meeting.report,status:'failed',message:'Report generation was interrupted. Your saved transcript and notes are intact. Retry to continue.',updatedAt:new Date().toISOString()};await storage.saveMeeting(meeting);}
    if (isNative()) {
      const sessions = await engine.recover();
      for(const session of sessions.reverse()){
        const index=state.meetings.findIndex(m=>m.id===session.meetingId);
        if(index<0){const recovered=recoverOrphanSession(session);state.meetings.unshift(recovered);await storage.saveMeeting(recovered);continue;}
        const previous=state.meetings[index];
        const recovered=mergeEngineSession(previous,session);
        if(JSON.stringify(previous)!==JSON.stringify(recovered)){state.meetings[index]=recovered;await storage.saveMeeting(recovered);}
      }
    }
    return state;
  })();
  return bootPromise;
}

export function App() {
  usePhoneViewport();
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState('');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const meetingRef = useRef<Meeting[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const settingsRef=useRef(settings);settingsRef.current=settings;
  const reportJobs=useRef(new Map<string,AbortController>());
  const deletingMeetings=useRef(new Set<string>());
  const reportedSessions=useRef(new Set<string>());
  const stoppingCapture=useRef(false);
  const [documents, setDocuments] = useState<IndexedDocument[]>([]);
  const [page, setPage] = useState<Page>(demoRoute === 'meeting' ? 'meeting' : 'home');
  const [selectedId, setSelectedId] = useState('demo-q2');
  const [modal, setModal] = useState<ModalState>(null);
  const [assistantDraft,setAssistantDraft]=useState<AssistantDraft>();
  const [selection, setSelection] = useState<Selection>(null);
  const [showAssistant, setShowAssistant] = useState(window.innerWidth > 980);
  const [showSidebar, setShowSidebar] = useState(false);
  const [tab, setTab] = useState<'notes' | 'transcript' | 'roadmap'>('notes');
  const [search, setSearch] = useState('');
  const [saveState, setSaveState] = useState('Saved locally');
  const [error, setError] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newMode, setNewMode] = useState<Meeting['mode']>('microphone');
  const [inlineCaptureId,setInlineCaptureId]=useState<string|null>(null);
  const [focusNoteId,setFocusNoteId]=useState<string|null>(null);
  const pendingNote=useRef<string|null>(null);
  useEffect(()=>{if(page==='meeting'&&selectedId===pendingNote.current)pendingNote.current=null;},[page,selectedId]);
  const [consent, setConsent] = useState(false);
  const [captureMeetingId, setCaptureMeetingId] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioName, setAudioName] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | undefined>();
  const [busy, setBusy] = useState(false);
  const [preparation,setPreparation]=useState<PreparationProgress|null>(null);
  const [preparationFailed,setPreparationFailed]=useState(false);
  const prepareAttempt=useRef<{id:string;controller:AbortController}|null>(null);
  function cancelPreparation(){prepareAttempt.current?.controller.abort();}
  useEffect(()=>{if(modal!=='new'&&!inlineCaptureId)cancelPreparation();},[modal,inlineCaptureId]);
  useEffect(()=>()=>prepareAttempt.current?.controller.abort(),[]);
  const [importStatus, setImportStatus] = useState('');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const capture = useRef(new MicrophoneCapture());
  const browserCaptureId=useRef<string|null>(null);
  const engineSession=useRef<string|null>(null);
  const activeNativeSession=useRef<EngineSession|null>(null);
  const speechCancellation=useRef<string|null>(null);
  const revokedCloudSession=useRef<string|null>(null);
  const startingCapture=useRef(false);
  const [enginePhase,setEnginePhase]=useState('');
  const [interimCaptions,setInterimCaptions]=useState<Record<string,Segment>>({});
  const [streamHealth,setStreamHealth]=useState<Record<string,string>>({});
  useEffect(()=>{if(!isNative())return;const subscription=listen('recording-exit-blocked',()=>setError('Finish recording and wait for transcription to save before quitting Buddy. If speech preparation is running, finish or cancel it first.'));return()=>{void subscription.then(stop=>stop()).catch(()=>{});};},[]);
  const engineListener=useRef<Promise<()=>void>|null>(null);
  const engineSequences=useRef(new Map<string,number>());
  const terminalSessions=useRef(new Set<string>());
  const replayIndex = useRef(0);
  const originals = useRef(new Map<string, File>());
  const importJob = useRef<AbortController | null>(null);
  const deletingWorkspace = useRef(false);
  useEffect(() => () => importJob.current?.abort(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const saveCount = useRef(0);

  useEffect(() => { let mounted = true; void boot().then(state => {
    if (!mounted) return;
    meetingRef.current = state.meetings; setMeetings(state.meetings); setSettings(state.settings); setDocuments(state.documents); setSelectedId(state.meetings[0]?.id ?? ''); setReady(true);
  }).catch(e => { if (mounted) setFatal(e instanceof Error ? e.message : String(e)); }); return () => { mounted = false; }; }, []);
  function applyNative(session:EngineSession){
    if(session.sessionId===revokedCloudSession.current&&session.status==='complete')session={...session,status:'interrupted'};
    const terminal=['complete','interrupted'].includes(session.status);
    if((engineSession.current&&engineSession.current!==session.sessionId)||(!terminal&&terminalSessions.current.has(session.sessionId))||(session.sequence!==undefined&&session.sequence<(engineSequences.current.get(session.sessionId)??0)))return;
    activeNativeSession.current=terminal?null:session;
    if(!terminal)enforceCloudAudioPermission(session,settingsRef.current);
    if(terminal){terminalSessions.current.add(session.sessionId);setInterimCaptions({});setStreamHealth({});}
    if(session.sequence!==undefined)engineSequences.current.set(session.sessionId,session.sequence);
    const current=meetingRef.current.find(m=>m.id===session.meetingId);if(!current)return;persist(mergeEngineSession(current,session));if(terminal&&!reportedSessions.current.has(session.sessionId)){reportedSessions.current.add(session.sessionId);void generateReport(session.meetingId);}if(['complete','interrupted'].includes(session.status)){setCaptureMeetingId(id=>id===session.meetingId?null:id);engineSession.current=null;setEnginePhase('');}else{engineSession.current=session.sessionId;setCaptureMeetingId(session.meetingId);setEnginePhase(session.status);}}
  useEffect(()=>{if(!ready||!isNative())return;let disposed=false;const subscription=engine.subscribe(event=>{
    if(disposed||terminalSessions.current.has(event.sessionId)||event.sequence<=(engineSequences.current.get(event.sessionId)??0))return;
    engineSequences.current.set(event.sessionId,event.sequence);
    const current=meetingRef.current.find(m=>m.id===event.meetingId);
    if(!current||current.mode!=='microphone')return;
    if(engineSession.current&&engineSession.current!==event.sessionId)return;
    setLevel(event.level);
    if(event.kind==='level')return;
    if(event.kind==='interim'){setInterimCaptions(previous=>{const next={...previous};const source=event.source??event.segment?.channel;if(!source)return previous;if(event.segment?.text)next[source]=event.segment;else delete next[source];return next;});return;}
    if(event.kind==='transport'){if(event.source)setStreamHealth(previous=>({...previous,[event.source!]:event.message??''}));return;}
    if(event.kind==='segment'&&event.segment){setInterimCaptions(previous=>{const next={...previous};delete next[event.segment!.channel];return next;});}
    engineSession.current=event.sessionId;setEnginePhase(event.status);
    if(event.message)setError(event.message);
    if(event.kind==='state'){void engine.status().then(session=>{if(session&&session.sessionId===event.sessionId&&!disposed)applyNative(session);}).catch(e=>setError(String(e)));}
    if(event.kind==='finished'){setInterimCaptions({});setStreamHealth({});void engine.status().then(session=>{if(session&&session.sessionId===event.sessionId&&!disposed)applyNative(session);}).catch(e=>setError(String(e)));return;}
    try{if(event.segment)persist(mergeEngineSession(current,{sessionId:event.sessionId,meetingId:event.meetingId,startedAt:0,status:event.status as EngineSession['status'],duration:event.duration,segments:[event.segment],transcribing:current.recording?.transcribing??settings.localTranscription,retainedAudio:current.recording?.retainedAudio??settings.keepNativeAudio,warnings:current.recording?.warnings??[]}));}catch(e){setError(String(e));}
  },setError);engineListener.current=subscription;void subscription.catch(e=>setError(String(e)));void subscription.then(()=>engine.status()).then(session=>{if(session&&!disposed&&!['complete','interrupted'].includes(session.status))applyNative(session);}).catch(e=>setError(String(e)));return()=>{disposed=true;void subscription.then(unlisten=>unlisten()).catch(()=>{});};},[ready]);
  useEffect(()=>{
    if(!ready||!isNative())return;
    let disposed=false;
    const refresh=()=>{if(document.visibilityState==='visible')void engine.status().then(session=>{if(session&&!disposed)applyNative(session);}).catch(e=>{if(!disposed)setError(String(e));});};
    document.addEventListener('visibilitychange',refresh);
    window.addEventListener('pageshow',refresh);
    return()=>{disposed=true;document.removeEventListener('visibilitychange',refresh);window.removeEventListener('pageshow',refresh);};
  },[ready]);
  useEffect(()=>{document.documentElement.dataset.theme=settings.theme;document.documentElement.style.colorScheme=settings.theme;},[settings.theme]);
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(settings.reduceMotion); }, [settings.reduceMotion]);
  useEffect(() => { return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }; }, [audioUrl]);
  useEffect(() => {
    capture.current.onError = message => {setError(message);if(browserCaptureId.current)void finishBrowserRecording(browserCaptureId.current);};
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (capture.current.state !== 'idle' || engineSession.current || saveCount.current || reportJobs.current.size) { event.preventDefault(); } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  const meeting = meetings.find(m => m.id === selectedId);
  const activeMeeting = meetings.find(m => m.id === captureMeetingId);
  function persist(next: Meeting) {
    if(deletingWorkspace.current||deletingMeetings.current.has(next.id))return;
    const updated = meetingRef.current.some(m => m.id === next.id) ? meetingRef.current.map(m => m.id === next.id ? next : m) : [next, ...meetingRef.current];
    meetingRef.current = updated; setMeetings(updated); setSaveState('Saving…'); saveCount.current++;
    void storage.saveMeeting(next).then(() => { saveCount.current--; if (!saveCount.current) setSaveState('Saved locally'); }).catch(e => { saveCount.current--; setSaveState('Save failed'); setError(String(e)); });
  }
  async function generateReport(id:string,force=false){
    const source=meetingRef.current.find(m=>m.id===id);
    if(deletingWorkspace.current||deletingMeetings.current.has(id)||!source||source.mode==='demo'||reportJobs.current.has(id)||['live','paused'].includes(source.status))return;
    const controller=new AbortController();reportJobs.current.set(id,controller);
    const ownsJob=()=>reportJobs.current.get(id)===controller;
    const snapshot=reportInput(source),configuration=settingsRef.current,provider=reportProvider(configuration,isNative(),isIOS());
    const stamp=()=>new Date().toISOString();let inputHash="";
    try{
      inputHash=await reportHash(snapshot);
      const current=meetingRef.current.find(m=>m.id===id);if(!current||!ownsJob()||controller.signal.aborted)return;
      if(!force&&current.report?.inputHash===inputHash)return;
      if(!reportSources(current).length){persist({...current,report:{status:'unavailable',provider,inputHash,message:current.recording?.transcribing?'No finalized speech was received. Check the recording warnings, selected input and transcription engine. Buddy cannot create notes from missing speech.':'This was an audio-only recording. No transcript was generated. Enable transcription before your next recording.',updatedAt:stamp()}});return;}
      const running={...current,report:{status:'running' as const,provider,inputHash,message:provider==='excerpts'?'Saving source-linked excerpts. Choose NVIDIA with text permission or an installed local note model for an AI report.':'Your transcript is saved. Preparing an evidence-linked AI draft; your personal notes stay unchanged.',updatedAt:stamp()}};
      persist(running);await storage.saveMeeting(running);
      if(!ownsJob())return;
      if(controller.signal.aborted)throw Error('Report cancelled. Your transcript and personal notes are saved.');
      const draft=await buildReport(source,configuration,provider,controller.signal);
      const latest=meetingRef.current.find(m=>m.id===id);if(!latest||!ownsJob())return;
      if(controller.signal.aborted)throw Error('Report cancelled. Your transcript and personal notes are saved.');
      if(reportInput(latest)!==snapshot)throw Error('The transcript changed while generating. Retry using the latest speech.');
      persist({...applyDraft(latest,draft,provider),report:{status:'ready',provider,inputHash,message:provider==='excerpts'?'Selected passages from the saved transcript, not an AI summary. Configure an AI provider to generate a report.':'AI-generated draft with transcript evidence. Check decisions and actions before relying on them.',updatedAt:stamp()}});
    }catch(e){const current=meetingRef.current.find(m=>m.id===id);if(current&&ownsJob())persist({...current,report:{status:'failed',provider,inputHash,message:e instanceof Error?e.message:String(e),updatedAt:stamp()}});}
    finally{if(ownsJob())reportJobs.current.delete(id);}
  }
  async function deleteMeeting(target:Meeting){
    if(target.id===captureMeetingId)throw new Error('Finish the active meeting before deleting it.');
    const id=target.id;
    deletingMeetings.current.add(id);
    const job=reportJobs.current.get(id);
    // Revoke ownership before awaiting native cleanup or the storage queue. Even a
    // provider that ignores cancellation must not write a late result or error.
    reportJobs.current.delete(id);job?.abort();
    try{
      if(isNative()&&target.mode!=='demo')await engine.deleteMeeting(id);
      await storage.deleteMeeting(id);
      const next=meetingRef.current.filter(m=>m.id!==id);
      meetingRef.current=next;setMeetings(next);navigate('home');setModal(null);
    }catch(error){
      deletingMeetings.current.delete(id);
      const current=meetingRef.current.find(m=>m.id===id);
      if(current?.report?.status==='running')persist({...current,report:{...current.report,status:'failed',message:'Report cancelled while deleting. Your saved transcript and personal notes are intact. Retry the report or delete again.',updatedAt:new Date().toISOString()}});
      throw error;
    }finally{deletingMeetings.current.delete(id);}
  }
  useEffect(()=>{for(const controller of reportJobs.current.values())controller.abort();},[settings.provider,settings.nvidiaConsent,settings.nvidiaModel,settings.localNoteModel]);
  useEffect(()=>()=>{for(const controller of reportJobs.current.values())controller.abort();},[]);
  function enforceCloudAudioPermission(session:EngineSession,next:AppSettings){
    if(!session.transcribing||['complete','interrupted'].includes(session.status))return;
    // The provider belongs to the running native session, not the newly selected setting.
    const provider=session.model?.startsWith('deepgram/')?'deepgram':session.model?.startsWith('groq/')?'groq':null;
    if(!provider)return;
    const allowed=next.localTranscription&&next.speechProvider===provider&&(provider==='deepgram'?next.deepgramAudioConsent:next.groqAudioConsent);
    if(allowed||speechCancellation.current===session.sessionId)return;
    speechCancellation.current=session.sessionId;revokedCloudSession.current=session.sessionId;
    stoppingCapture.current=true;setBusy(true);setEnginePhase('finalizing');
    setError('Stopping cloud transcription because its audio permission or transcription setting changed. Already sent audio cannot be recalled. Saved speech and personal notes are kept.');
    // Escalate even when a normal Finish is draining: cancel=true closes streams
    // and cancels in-flight uploads rather than sending the remaining audio.
    void engine.stop(session.sessionId,true).then(applyNative).catch(error=>setError(`Could not stop cloud transcription: ${String(error)}. Use Finish to retry stopping the recording.`)).finally(()=>{
      if(speechCancellation.current===session.sessionId){speechCancellation.current=null;stoppingCapture.current=false;setBusy(false);}
    });
  }
  const changeSettings = (next: AppSettings) => {
    settingsRef.current=next;setSettings(next);
    if(activeNativeSession.current)enforceCloudAudioPermission(activeNativeSession.current,next);
    void storage.saveSettings(next).catch(e => setError(`Settings were not saved: ${String(e)}`));
  };
  useEffect(() => {
    if (!captureMeetingId) return;
    const timer = setInterval(() => {
      const current = meetingRef.current.find(m => m.id === captureMeetingId);
      if (!current || current.status !== 'live') return;
      if (current.mode === 'demo') {
        if (replayIndex.current < demoMeeting.segments.length) { persist(replayFrame(current, replayIndex.current)); replayIndex.current++; }
        else { persist({ ...current, status: 'complete' }); setCaptureMeetingId(null); }
      } else if(enginePhase!=='finalizing') persist({ ...current, duration: current.duration + 1 });
    }, activeMeeting?.mode === 'demo' ? 4500 : 1000);
    const meter = setInterval(() => {if(!engineSession.current)setLevel(capture.current.level);}, 120);
    return () => { clearInterval(timer); clearInterval(meter); };
  }, [captureMeetingId, activeMeeting?.mode,enginePhase]);

  function navigate(next: Page) { if(startingCapture.current){setError('Recording is starting. Please wait a moment.');return;}if (next === page) { setShowSidebar(false); return; } cancelPreparation();setInlineCaptureId(null);changeView(() => { setPage(next); setShowSidebar(false); }); }
  useEffect(()=>{const query=window.matchMedia('(max-width: 980px)');const narrow=()=>{if(query.matches)setShowAssistant(false);};query.addEventListener('change',narrow);return()=>query.removeEventListener('change',narrow);},[]);
  const assistantBeforeFocus=useRef(showAssistant);
  const wasFocused=useRef(false);
  useEffect(()=>{
    if(settings.focusMode&&!wasFocused.current){assistantBeforeFocus.current=showAssistant;setShowAssistant(false);setShowSidebar(false);}
    else if(!settings.focusMode&&wasFocused.current)setShowAssistant(assistantBeforeFocus.current);
    wasFocused.current=settings.focusMode;
  },[settings.focusMode]);
  function openNavigator() { if(startingCapture.current)return;setSelection(null); setModal('navigator'); }
  function openMeeting(m: Meeting, question?:string, focusEditor=false) { if(startingCapture.current){setError('Recording is starting. Please wait a moment.');return;}cancelPreparation();setInlineCaptureId(null);changeView(() => {setFocusNoteId(focusEditor?m.id:null);setAssistantDraft(question?{id:crypto.randomUUID(),text:question}:undefined); if(question)setShowAssistant(true);else if(focusEditor)setShowAssistant(false); setSelectedId(m.id); setPage('meeting'); setTab('notes'); setShowSidebar(false); setTranscriptSearch(''); setSelection(null); }); }
  function takeNotes(){
    if(busy||captureMeetingId||pendingNote.current)return;
    const note=createMeeting('New note','manual');pendingNote.current=note.id;persist(note);setError('');setModal(null);openMeeting(note,undefined,true);
  }
  function focusNoteEditor(){document.querySelector<HTMLElement>('.notes-canvas .minimal-note [role="textbox"]')?.focus({preventScroll:true});}
  function cancelInlineRecording(){cancelPreparation();setInlineCaptureId(null);setConsent(false);setError('');focusNoteEditor();}
  const create = async (audioOnly=false, targetId?:string) => {
    if(busy||prepareAttempt.current)return;
    if (captureMeetingId) { setError('Finish the active meeting before starting another.'); return; }
    const mode=targetId?'microphone':newMode;
    if(mode==='microphone'&&!targetId&&!consent){setError('Confirm permission to record before starting.');return;}
    if(targetId&&meetingRef.current.find(m=>m.id===targetId)?.mode!=='manual'){setError('Open a note without a recording to add audio.');return;}
    setBusy(true); setError('');setPreparationFailed(false);
    const attempt={id:crypto.randomUUID(),controller:new AbortController()};prepareAttempt.current=attempt;
    setInterimCaptions({});setStreamHealth({});
    const recordingSettings=recordingSettingsForPlatform({...settings,...(audioOnly?{localTranscription:false}:{})},isIOS(),!!targetId);
    let preparing=false;
    try {
      if(mode==='microphone'&&isNative()){let capabilities=await engine.capabilities(recordingSettings.speechModel);if((capabilities.platform==='ios'||(targetId&&capabilities.platform==='macos'))&&['not-determined','required'].includes(capabilities.audioPermissions?.microphone??'required')){await engine.requestAudioPermission('microphone');capabilities=await engine.capabilities(recordingSettings.speechModel);}if(attempt.controller.signal.aborted)return;const issue=recordingPermissionIssue(capabilities,recordingSettings);if(issue)throw new Error(issue);}
      if(mode==='microphone'&&isNative()&&recordingSettings.localTranscription&&recordingSettings.speechProvider!=='local'){const provider=recordingSettings.speechProvider,label=provider==='deepgram'?'Deepgram':'Groq';if(!(provider==='deepgram'?recordingSettings.deepgramAudioConsent:recordingSettings.groqAudioConsent))throw new Error(`Allow recording audio to ${label} before starting cloud transcription.`);if(!await invoke<boolean>(`has_${provider}_key`))throw new Error(`Save a ${label} API key before starting cloud transcription.`);}
      if(mode==='microphone'&&isNative()&&recordingSettings.localTranscription&&recordingSettings.speechProvider==='local'){preparing=true;setPreparation({requestId:attempt.id,id:recordingSettings.speechModel,stage:'checking',received:0,total:147951465});await engine.prepare(recordingSettings.speechModel,attempt.id,progress=>{if(prepareAttempt.current?.id===attempt.id)setPreparation(progress);},attempt.controller.signal);if(attempt.controller.signal.aborted)return;preparing=false;setPreparation(null);}
      if(attempt.controller.signal.aborted)return;
      const existing=targetId?meetingRef.current.find(note=>note.id===targetId):undefined;
      if(targetId&&!existing)throw new Error('This note is no longer available.');
      const m:Meeting = existing?{...existing,kind:'note',mode}:createMeeting(newTitle || (mode === 'demo' ? 'Q2 growth · demo replay' : mode==='manual'?'New note':'Untitled meeting'), mode);
      m.status = mode === 'manual' ? 'ready' : 'live';
      if (mode === 'demo') { m.blocks = []; replayIndex.current = 0; }
      if(mode==='microphone'){
        startingCapture.current=true;
        if(isNative()){
          m.status='interrupted';persist(m);await storage.saveMeeting(m);await engineListener.current;
          if(attempt.controller.signal.aborted)return;
          const session=await engine.start(m.id,recordingSettings);engineSession.current=session.sessionId;activeNativeSession.current=session;
          Object.assign(m,mergeEngineSession(meetingRef.current.find(item=>item.id===m.id)??m,session));setEnginePhase('live');
        }else {browserCaptureId.current=m.id;try{await capture.current.start(settings.deviceId);}catch(error){browserCaptureId.current=null;throw error;}if(targetId)Object.assign(m,{...(meetingRef.current.find(note=>note.id===targetId)??m),kind:'note',mode,status:'live'});}
      }
      startingCapture.current=false;persist(m);if(targetId){setInlineCaptureId(null);focusNoteEditor();}else openMeeting(m,undefined,mode==='manual');setModal(null);setNewTitle('');setConsent(false);
      if (mode !== 'manual') { setCaptureMeetingId(m.id); setShowAssistant(false); }
      if(activeNativeSession.current)enforceCloudAudioPermission(activeNativeSession.current,settingsRef.current);
    } catch (e) {if(targetId&&!engineSession.current){const latest=meetingRef.current.find(note=>note.id===targetId);if(latest?.mode==='microphone'&&!latest.segments.length)persist({...latest,mode:'manual',status:'ready'});}if(!attempt.controller.signal.aborted){setPreparationFailed(preparing);setError(`${preparing?'Could not prepare local transcription':'Could not start recording'}: ${e instanceof Error?e.message:String(e)}`);} }
    finally {startingCapture.current=false;if(prepareAttempt.current?.id===attempt.id){prepareAttempt.current=null;setPreparation(null);if(!speechCancellation.current)setBusy(false);} }
  };
  async function finishBrowserRecording(id:string){
    if(stoppingCapture.current)return;
    const current=meetingRef.current.find(m=>m.id===id);
    if(!current||current.mode!=='microphone')return;
    stoppingCapture.current=true;setBusy(true);
    try{
      const blob=await capture.current.stop();
      if(blob?.size&&settingsRef.current.retainAudio){setAudioBlob(blob);setAudioUrl(URL.createObjectURL(blob));setAudioName(`Recording · ${current.title}`);}
      const latest=meetingRef.current.find(m=>m.id===id);
      if(latest)persist({...latest,status:capture.current.error?'interrupted':'complete'});
      browserCaptureId.current=null;setCaptureMeetingId(null);
      if(!capture.current.error)void generateReport(id);
    }catch(error){setError(String(error));}
    finally{stoppingCapture.current=false;setBusy(false);}
  }
  const stopMeeting = async () => {
    if (!activeMeeting||stoppingCapture.current) return;
    if(activeMeeting.mode==='microphone'&&!engineSession.current){await finishBrowserRecording(activeMeeting.id);return;}
    stoppingCapture.current=true;
    const current = activeMeeting;
    setBusy(true);
    try {
      if(current.mode==='microphone'&&engineSession.current){setEnginePhase('finalizing');const session=await engine.stop(engineSession.current);applyNative(session);return;}
      setCaptureMeetingId(null); persist({ ...(meetingRef.current.find(m=>m.id===current.id)??current), status: 'complete' });if(current.mode==='microphone')void generateReport(current.id);
    } catch (e) { setError(String(e)); } finally { if(!speechCancellation.current){stoppingCapture.current=false;setBusy(false);} }
  };
  const pauseMeeting = async () => {
    if (!activeMeeting||busy||enginePhase==='finalizing') return;
    const paused=activeMeeting.status==='paused';setBusy(true);
    try{if(activeMeeting.mode==='microphone'){if(engineSession.current)await engine.pause(engineSession.current,!paused);else if(paused)capture.current.resume();else capture.current.pause();}
      const current=meetingRef.current.find(m=>m.id===activeMeeting.id);if(current)persist({...current,status:paused?'live':'paused'});
    }catch(e){setError(String(e));}finally{setBusy(false);}
  };
  const openCitation = (citation: Citation) => setSelection({ citation });
  const gotoTranscript = (meetingId: string, segmentId: string) => {
    const found = meetings.find(m => m.id === meetingId);
    if (!found) return;
    setSelectedId(meetingId); setPage('meeting'); setTab('transcript'); setSelection(null); setTranscriptSearch('');
    setTimeout(() => { const node = document.getElementById(`segment-${segmentId}`); node?.scrollIntoView({ behavior: 'smooth', block: 'center' }); node?.classList.add('source-highlight'); setTimeout(() => node?.classList.remove('source-highlight'), 2000); }, 100);
  };
  const toggleAction = (m: Meeting, e: MeetingEvent) => persist({ ...m, events: m.events.map(item => item.id === e.id ? { ...item, done: !item.done, updatedAt: new Date().toISOString() } : item) });
  const importFiles = async (files: FileList | null, folder = false) => {
    if (!files?.length || deletingWorkspace.current) return;
    const supported = Array.from(files).filter(f => supportedExtensions.includes(f.name.split('.').pop()!.toLowerCase()));
    if (supported.length > 200) { setError('Choose at most 200 supported files per import.'); return; }
    if (!supported.length) { setError('No supported files found. Choose PDF, DOCX, XLSX, CSV, TXT, or Markdown.'); return; }
    importJob.current?.abort();
    const controller = new AbortController(); importJob.current = controller;
    setBusy(true); setError(''); let count = 0;
    const errors: string[] = [];
    let nextDocs = [...documents];
    const imported: IndexedDocument[] = [];
    try {
      for (const file of supported) {
        if (controller.signal.aborted) return;
        setImportStatus(`Indexing ${count + 1} of ${supported.length} · ${file.name}`);
        try {
          const group = folder ? `Folder: ${file.webkitRelativePath.split('/')[0]}` : 'Selected files';
          const extracted = await extractDocument(file, group, false, controller.signal);
          const doc = resolveSelectedFile(extracted, nextDocs);
          if (controller.signal.aborted) return;
          await storage.indexDocument(doc);
          if (controller.signal.aborted) return;
          originals.current.set(doc.id, file);
          imported.push(doc);
          const existing = nextDocs.findIndex(d => d.id === doc.id); if (existing >= 0) nextDocs[existing] = doc; else nextDocs.push(doc);
          count++;
        } catch (e) { if (controller.signal.aborted) return; errors.push(e instanceof Error ? e.message : String(e)); }
      }
      if (controller.signal.aborted) return;
      if (folder && !errors.length && imported.length) {
        const group = imported[0].group;
        try { await storage.replaceGroup(group, imported); nextDocs = [...nextDocs.filter(d => d.group !== group), ...imported]; }
        catch (e) { errors.push(`Folder snapshot could not be refreshed: ${String(e)}`); }
      }
      if (controller.signal.aborted) return;
      setDocuments(nextDocs); setBusy(false); setImportStatus(`${count} file${count === 1 ? '' : 's'} indexed locally.${folder ? ' Folder access is a snapshot; reselect to refresh.' : ''}`);
      if (errors.length) setError(errors.join('\n'));
      if (fileInput.current) fileInput.current.value = ''; if (folderInput.current) folderInput.current.value = '';
    } finally {
      if (importJob.current === controller) { importJob.current = null; setBusy(false); }
    }
  };
  const revoke = async (group: string) => {
    try { await storage.revokeGroup(group); setDocuments(old => old.filter(d => d.group !== group)); for (const [id] of originals.current) if (id.startsWith(`${group}:`)) originals.current.delete(id); }
    catch (e) { setError(String(e)); }
  };
  const deleteAll = async () => {
    if (captureMeetingId) throw new Error('Stop the active meeting before deleting the workspace.');
    deletingWorkspace.current = true;
    importJob.current?.abort(); importJob.current = null; setBusy(false); setImportStatus('');
    try {
      const jobs=[...reportJobs.current.values()];reportJobs.current.clear();
      for(const controller of jobs)controller.abort();
      if (isNative()) {await invoke('engine_clear_history');await invoke('delete_api_key');await invoke('delete_groq_key');await invoke('delete_deepgram_key');await invoke('delete_knowledge_key',{provider:'nvidia'});await invoke('delete_knowledge_key',{provider:'voyage'});}
      await storage.clearAll(); meetingRef.current = []; setMeetings([]); setDocuments([]); originals.current.clear();
      setAudioUrl(''); setAudioBlob(undefined);
      const next = { ...defaultSettings, onboarded: true }; await storage.saveSettings(next); setSettings(next); navigate('home'); setModal(null); setSelection(null);
    } catch (e) {
      deletingWorkspace.current=false;
      for(const current of meetingRef.current)if(current.report?.status==='running')persist({...current,report:{...current.report,status:'failed',message:'Report cancelled while deleting. Your saved transcript and personal notes are intact. Retry the report or delete again.',updatedAt:new Date().toISOString()}});
      setError(String(e));throw e;
    }
    finally { deletingWorkspace.current = false; }
  };
  const importAudio = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { setError('Choose an audio file smaller than 100 MB.'); return; }
    setAudioUrl(URL.createObjectURL(file)); setAudioBlob(file); setAudioName(file.name);
  };
  const eventMeeting = selection?.event ? meetings.find(m => m.id === selection.event?.meetingId) : selection?.citation?.meetingId ? meetings.find(m => m.id === selection.citation?.meetingId) : undefined;
  const evidenceSegments = selection?.event ? eventMeeting?.segments.filter(s => selection.event?.evidenceIds.includes(s.id)) : selection?.citation?.segmentId ? eventMeeting?.segments.filter(s => s.id === selection.citation?.segmentId) : [];

  const notesCanvas=!!meeting&&meeting.mode!=='demo'&&meeting.events.length===0;

  if (fatal) return <main className="boot-screen"><Logo /><h1>Your workspace couldn’t open.</h1><p role="alert">{fatal}</p><p>Your saved data has not been reset. Follow the message above, then reload.</p><button className="button primary" onClick={() => location.reload()}>Reload workspace</button></main>;
  if (!ready) return <main className="boot-screen"><Orb size="large" /><p>Opening your meetings…</p></main>;

  if(!settings.onboarded&&!demoRoute)return <MotionProvider reducedMotion={settings.reduceMotion?'always':'user'}><ReducedMotionConfig><Welcome quiet={settings.reduceMotion} onQuiet={reduceMotion=>changeSettings({...settings,reduceMotion})} onComplete={()=>changeSettings({...settings,onboarded:true})}/></ReducedMotionConfig></MotionProvider>;

  return <MotionProvider reducedMotion={settings.reduceMotion?'always':'user'}><ReducedMotionConfig><div className={`app-shell ${showSidebar ? 'sidebar-visible' : ''} ${settings.focusMode?'focus-mode':''}`}>
    <a className="skip-link" href="#main-content">Skip to workspace</a>
    <input ref={fileInput} type="file" accept=".pdf,.docx,.xlsx,.csv,.txt,.md" multiple hidden onChange={e => void importFiles(e.target.files)} />
    <input ref={folderInput} type="file" multiple hidden {...{ webkitdirectory: '', directory: '' }} onChange={e => void importFiles(e.target.files, true)} />
    <input ref={audioInput} type="file" accept="audio/*,.wav,.mp3,.m4a,.webm" hidden onChange={e => importAudio(e.target.files?.[0])} />
    <MotionRail page={page} open={showSidebar} actions={meetings.some(m=>m.events.some(event=>event.type==='action_item'&&!event.done))} focusMode={settings.focusMode} onClose={()=>setShowSidebar(false)} onNavigate={navigate} onExplore={openNavigator} onNew={()=>{setNewTitle('');setNewMode('microphone');setConsent(false);setModal('new');}} onSettings={()=>setModal('settings')}/>

    <div className="main-shell">{isShowcase&&<div className="showcase-notice" role="note">Interactive demo · Sample workspace · Changes reset on reload</div>}<header className="topbar" data-tauri-drag-region><div className="breadcrumb" data-tauri-drag-region><IconButton label="Open navigation" aria-expanded={showSidebar} aria-controls="workspace-navigation" className="mobile-menu" onClick={() => setShowSidebar(!showSidebar)}><Menu size={18} /></IconButton><span className="topbar-wordmark" data-tauri-drag-region>buddy<span data-tauri-drag-region>.</span></span><span className="topbar-slash" data-tauri-drag-region>/</span><strong data-tauri-drag-region>{page === 'meeting' ? meeting&&isPersonalNote(meeting)?'Note':'Meeting' : page === 'home' ? 'My meetings' : page === 'knowledge' ? 'Knowledge' : 'Action items'}</strong></div><div className="topbar-right"><IconButton label={settings.theme==='dark'?'Switch to light theme':'Switch to dark theme'} onClick={()=>changeSettings({...settings,theme:settings.theme==='dark'?'light':'dark'})}>{settings.theme==='dark'?<Sun size={16}/>:<Moon size={16}/>}</IconButton><button className="focus-control" aria-label="Focus mode" aria-pressed={settings.focusMode} onClick={()=>setModal('focus')}><BellOff size={15}/><span>{settings.focusMode?'Focus on':'Focus'}</span></button><IconButton label="Open settings" onClick={() => setModal('settings')}><Settings2 size={16} /></IconButton></div></header>
    {error && modal!=='new' && !inlineCaptureId && <div className="global-error" role="alert"><span>{error}</span><IconButton label="Dismiss error" onClick={() => setError('')}><X size={14} /></IconButton></div>}
    {activeMeeting && page !== 'home' && (page !== 'meeting' || selectedId !== activeMeeting.id) &&
      <button className="recording-banner" onClick={() => openMeeting(activeMeeting)}>
        <span className={activeMeeting.status === 'paused' ? 'status-dot' : 'recording-dot'} />
        {activeMeeting.mode === 'demo' ? 'Demo replay' : 'Recording'} {activeMeeting.status === 'paused' ? 'paused' : 'in progress'} · Return to {activeMeeting.title}<ArrowRight size={15} />
      </button>}

    <main id="main-content" className={`main-content page-${page}`}>
    {page === 'home' && <Library capability={isNative()?(settings.localTranscription?(settings.speechProvider==='deepgram'?'Deepgram · real-time captions':settings.speechProvider==='groq'?'Groq cloud · Whisper large-v3-turbo':'On-device Whisper · prepared automatically'):'Recording audio · transcription off'):'Microphone audio only · desktop required for transcription'} onExplore={openNavigator} meetings={meetings} reduceMotion={settings.reduceMotion||settings.focusMode} search={search} activeMeeting={activeMeeting} onSearch={setSearch} onNew={mode => {if(mode==='manual'){takeNotes();return;}setNewTitle('');setNewMode(mode);setConsent(false);setModal('new');}} onOpen={openMeeting} onDemo={() => { const sample = meetings.find(m => m.id === 'demo-q2'); if (sample) openMeeting(sample); else { setNewMode('demo'); setModal('new'); } }} onPrivacy={() => setModal('settings')} />}

    {page === 'meeting' && meeting && <div className={`meeting-layout ${showAssistant ? '' : 'assistant-hidden'} ${notesCanvas?'notes-canvas':''}`} data-personal-note={isPersonalNote(meeting)} data-notes-only={notesCanvas&&meeting.mode==='manual'&&!meeting.segments.length&&meeting.id!==captureMeetingId}><div className="document-column"><div className="meeting-toolbar"><button className="back-link" onClick={() => navigate('home')}><ArrowLeft size={14} />All meetings</button><div><span className="save-indicator"><Check size={12} />{isShowcase&&saveState==='Saved locally'?'Demo changes only':saveState}</span><CopyAction content={toMarkdown(meeting)} label="Copy meeting"/><IconButton label="Export meeting" onClick={() => setModal('export')}><ArrowDownToLine size={16} /></IconButton><IconButton label="Delete meeting" disabled={meeting.id === captureMeetingId} onClick={() => setModal('deleteMeeting')}><Trash2 size={15} /></IconButton>{!showAssistant && <IconButton label="Show assistant" onClick={() => setShowAssistant(true)}><PanelRightOpen size={16} /></IconButton>}</div></div><div className="document-scroll"><div className="document-heading"><div className="meeting-labels"><span className="eyebrow">MEETING NOTES</span>{meeting.mode === 'demo' && <span className="badge demo">Demo meeting</span>}{meeting.status === 'interrupted' && <span className="badge warning">Interrupted · recovered</span>}</div><input className="meeting-title" aria-label="Meeting title" value={meeting.title} maxLength={150} onChange={e => persist({ ...meeting, title: e.target.value })} /><div className="meeting-meta"><span><CalendarDays size={13} />{new Date(meeting.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span><span><Clock3 size={13} />{timestamp(meeting.duration)}</span><span><Headphones size={13} />{meeting.mode === 'demo' ? 'Sample conversation' : meeting.mode === 'microphone' ? meeting.recording?.sources?.includes('system')?meeting.recording.sources.includes('microphone')?'Microphone + computer':'Computer audio':meeting.segments.some(s=>s.channel==='system')?'Microphone + computer':'Microphone' : 'Manual notes'}</span>{(!isPersonalNote(meeting)||meeting.participants.length>0)&&<Participants meeting={meeting} onSave={participants=>{const latest=meetingRef.current.find(m=>m.id===meeting.id);if(latest)persist({...latest,participants});}}/>}</div>{meeting.mode==='manual'&&<div className="note-page-actions"><LiquidButton className="liquid-record note-record-entry" aria-label="Record in this note" disabled={!!captureMeetingId||busy} onClick={()=>{setInlineCaptureId(meeting.id);void create(false,meeting.id);}}><Mic size={14}/>Record a voice note</LiquidButton></div>}<div className="document-tabs" role="tablist" aria-label="Meeting views">{([{ id: 'notes', label: 'Notes', icon: FileText }, { id: 'transcript', label: 'Transcript', icon: AudioLines }, { id: 'roadmap', label: 'Roadmap', icon: LayoutPanelLeft }] as const).filter(view=>!isPersonalNote(meeting)||view.id!=='roadmap').map(({ id, label, icon: Icon }) => <button role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} key={id} onClick={() => changeView(() => setTab(id))}><Icon size={14} />{label}{id === 'transcript' && <span>{meeting.segments.length}</span>}</button>)}<div className="meeting-status"><span className={meeting.status === 'live' ? 'recording-dot' : 'status-dot'} />{meeting.status === 'live' ? meeting.mode === 'demo' ? 'Demo replay' : 'Recording' : meeting.status === 'paused' ? 'Paused' : meeting.status === 'complete' ? isPersonalNote(meeting)?'Note saved':'Meeting complete' : meeting.status === 'interrupted' ? 'Interrupted' : 'Ready'}</div></div></div>
    {inlineCaptureId===meeting.id&&<NoteRecordingSetup settings={settings} onSettings={changeSettings} busy={busy} preparation={preparation} failed={preparationFailed} error={error} onStart={audioOnly=>void create(audioOnly,meeting.id)} onCancel={cancelInlineRecording}/>}
    {meeting.id === captureMeetingId && <RecordingStage interim={Object.values(interimCaptions)} health={Object.values(streamHealth).filter(text=>text.startsWith('Reconnecting')).join(' · ')} meeting={meeting} level={level} busy={busy} quiet={settings.focusMode} onPause={()=>void pauseMeeting()} phase={enginePhase} onCancelTranscription={engineSession.current?()=>{const id=engineSession.current;if(id)void engine.stop(id,true).then(applyNative).catch(e=>setError(String(e)));}:undefined} onFinish={()=>void stopMeeting()} onTranscript={()=>setTab('transcript')}/>}

    {tab === 'notes' && <div className="document-body"><MeetingReport meeting={meeting} onRetry={()=>void generateReport(meeting.id,true)} onCancel={()=>reportJobs.current.get(meeting.id)?.abort()}/>{meeting.mode === 'demo' && <div className="demo-note"><Sparkles size={14} />A sample conversation. Edit the notes, follow the evidence, or ask Buddy.</div>}{meeting.mode === 'microphone' && meeting.segments.length>0 && meeting.id !== captureMeetingId && <div className="info-box"><Mic size={16} /><span>Review the transcript before relying on it. Speech recognition can miss words or confuse speakers. Your personal notes stay editable.</span></div>}{meeting.mode!=='demo'&&!meeting.report&&meeting.id!==captureMeetingId&&meeting.segments.some(s=>s.final)&&<button className="button primary small" onClick={()=>void generateReport(meeting.id,true)}><Sparkles size={14}/>Generate report</button>}{meeting.mode!=='demo'&&meeting.segments.some(s=>s.final)&&<button className="button secondary small" onClick={()=>setModal('draft')}><Sparkles size={14}/>Draft notes from transcript</button>}{meeting.recording?.warnings.map((warning,i)=><p className="inline-error" key={i}>{warning}</p>)}{meeting.blocks.map((block,index) => <NoteEditor minimal={notesCanvas&&index===0&&block.editedBy==='user'&&!block.eventIds.length&&!block.evidenceIds?.length} autoFocus={focusNoteId===meeting.id&&index===0} key={block.id} block={block} events={meeting.events} segments={meeting.segments} onSource={source=>openCitation({kind:'transcript',id:source.id,meetingId:meeting.id,segmentId:source.id,label:timestamp(source.start)})} onTranscript={()=>setTab('transcript')} onChange={html => { const latest = meetingRef.current.find(m => m.id === meeting.id); if (latest) persist(updateBlock(latest, block.id, html)); }} onEvidence={event => setSelection({ event })} />)}{!meeting.blocks.length && <Empty title="Room for the conversation">{meeting.mode === 'demo' && meeting.status === 'live' ? 'Sample insights will appear as the replay progresses.' : 'Add a note to begin.'}</Empty>}{meeting.events.some(e => e.type === 'action_item') && <section className="action-block"><div className="block-heading"><h2>Next steps</h2><span className="muted">{meeting.events.filter(e => e.type === 'action_item' && !e.done).length} open</span></div>{meeting.events.filter(e => e.type === 'action_item').map(e => <div className={`action-row ${e.done ? 'done' : ''}`} key={e.id}><AnimatedCheckbox className="meeting-action-check" label={`${e.done ? 'Reopen' : 'Complete'} ${e.title}`} checked={e.done} onChange={()=>toggleAction(meeting,e)}/><div><strong>{e.title}</strong><span>{e.owner}<span>·</span>{e.due && new Date(`${e.due}T12:00:00`).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}</span></div><button className="time-link" onClick={() => setSelection({ event: e })}>{timestamp(e.start)}<ArrowUpRight size={11} /></button></div>)}</section>}{!notesCanvas&&<button className="add-note" onClick={() => persist({ ...meeting, blocks: [...meeting.blocks, { id: crypto.randomUUID(), title: 'Personal note', html: '<p></p>', revision: 0, editedBy: 'user', eventIds: [], updatedAt: new Date().toISOString() }] })}><Plus size={14} />Add a personal note</button>}{!notesCanvas&&<div className="document-end"><span />Your thoughts, kept in context.<span /></div>}</div>}
    {tab === 'transcript' && <div className="document-body transcript"><SpeakerDetection meeting={meeting}/><div className="search-field"><Search size={14} /><input aria-label="Search transcript" placeholder="Search this transcript…" value={transcriptSearch} onChange={e => setTranscriptSearch(e.target.value)} /></div>{meeting.segments.filter(s => s.text.toLowerCase().includes(transcriptSearch.toLowerCase())).map(s => <article className="transcript-segment" id={`segment-${s.id}`} key={s.id}><div><button className="time-link" onClick={() => setSelection({ citation: { kind: 'transcript', id: `${meeting.id}:${s.id}`, meetingId: meeting.id, segmentId: s.id, label: timestamp(s.start) } })}>{timestamp(s.start)}–{timestamp(s.end)}</button><span>{s.channel === 'demo' ? 'Demo conversation' : s.speaker??(s.channel==='system'?'Computer audio':'Microphone')} · {s.final ? 'Final' : 'Partial'}</span></div><p>{s.text}</p></article>)}{!meeting.segments.length && <Empty title="No transcript yet">Finalized speech will appear here when transcription is enabled. Live captions may still be changing; audio-only recordings have no transcript.</Empty>}</div>}
    {tab === 'roadmap' && <div className="document-body full-roadmap"><h2>How the conversation evolved</h2><p className="muted">Follow each moment back to its original words.</p><Roadmap meeting={meeting} onSelect={event => setSelection({ event })} expanded /></div>}
    </div>{tab !== 'roadmap' && !notesCanvas && !settings.focusMode && !(meeting.mode==='microphone'&&meeting.id===captureMeetingId&&!meeting.events.length) && <Roadmap meeting={meeting} onSelect={event => setSelection({ event })} initiallyOpen={!isShowcase} />}</div>{showAssistant && <Assistant draft={assistantDraft} onDraftApplied={id=>setAssistantDraft(current=>current?.id===id?undefined:current)} onExplore={openNavigator} key={meeting.id} meeting={meeting} meetings={meetings} settings={settings} onCitation={openCitation} onClose={() => setShowAssistant(false)} onKnowledge={() => navigate('knowledge')} onSettings={() => setModal('settings')} />}</div>}
    {page === 'meeting' && !meeting && <Empty title="Choose a conversation">Open a meeting from your library.</Empty>}

    {page === 'actions' && <div className="collection actions-page"><h1>Action items</h1><p className="collection-intro">Keep track of what needs to happen next.</p><div className="collection-list">{meetings.flatMap(m=>m.events.filter(event=>event.type==='action_item').map(event=><article className="collection-row" key={`${m.id}-${event.id}`}><AnimatedCheckbox className="meeting-action-check" label={`${event.done?'Reopen':'Complete'} ${event.title}`} checked={event.done} onChange={()=>toggleAction(m,event)}/><div><button className={`collection-title ${event.done?'struck':''}`} onClick={()=>setSelection({event})}>{event.title}<ArrowUpRight size={14}/></button><p>{event.text}</p><button className="text-button subtle" onClick={()=>openMeeting(m)}>{m.title} · {timestamp(event.start)}{m.mode==='demo'?' · Demo':''}</button></div><span className="badge neutral">{event.done?'Completed':event.due??'No due date'}</span></article>))}{!meetings.some(m=>m.events.some(event=>event.type==='action_item'))&&<Empty title="No action items yet">Actions from your meetings will appear here.</Empty>}</div></div>}

    {page === 'knowledge' && <div className="collection knowledge page-enter"><div className="eyebrow">CONTEXT BEYOND THE CONVERSATION</div><div className="knowledge-heading"><div><h1>Knowledge</h1><p className="collection-intro">Add the documents Buddy can search. Every answer starts with a source.</p></div><span className="knowledge-symbol"><BookOpen size={50} strokeWidth={0.8} /></span></div><div className="knowledge-actions"><button className="button primary" disabled={busy} onClick={() => fileInput.current?.click()}><Plus size={16} />Add files</button><button className="button secondary desktop-folder-import" disabled={busy} onClick={() => folderInput.current?.click()}><FolderOpen size={16} />Add folder snapshot</button><button className="text-button" onClick={() => audioInput.current?.click()}><Upload size={15} />Import audio</button></div><p className="field-help">PDF, DOCX, XLSX, CSV, TXT, Markdown · 20 MB per document · Selected files only · No background disk access</p>{importStatus && (!settings.focusMode||busy) && <p className="import-status" role="status">{busy ? <span className="status-dot" /> : <Check size={13} />}{importStatus}</p>}<div className="source-groups">{[...new Set(documents.map(d => d.group))].map(group => <section key={group}><header><h2><FolderOpen size={15} />{group}<span>{documents.filter(d => d.group === group).length} files</span></h2><button className="text-button subtle" disabled={busy} onClick={() => void revoke(group)}><Trash2 size={13} />Remove source</button></header>{documents.filter(d => d.group === group).map(doc => <button className="source-row" key={doc.id} onClick={() => setSelection({ citation: { kind: 'document', id: doc.chunks[0].id, label: doc.name, chunk: doc.chunks[0] } })}><span className={`file-type file-${doc.type}`}>{doc.type.toUpperCase()}</span><div><strong>{doc.name}</strong><span>{doc.chunks.length} indexed excerpts · {Math.max(1, Math.round(doc.size / 1024))} KB{doc.demo ? ' · Fictional demo fixture' : ''}</span></div><span className="source-indexed"><Check size={12} />Indexed locally</span><ArrowUpRight size={15} /></button>)}</section>)}</div>{!documents.length && <Empty title="Choose what Buddy can know">Add a file or select a folder snapshot. Only readable text is indexed, locally.</Empty>}<div className="knowledge-privacy"><ShieldCheck size={22} strokeWidth={1.3} /><div><h3>You choose the context.</h3><p>Files are read only after you select them. Removing a source deletes its index. Original files are never edited. Reimport a folder to update its snapshot.</p></div></div></div>}
    </main>
    {audioUrl && <div className="audio-preview"><span><AudioLines size={15} />{audioName}<small>Local playback · no transcript generated</small></span><audio controls src={audioUrl} aria-label={audioName} /><IconButton label="Download audio" onClick={() => audioBlob && downloadFile(audioBlob, audioBlob.type.includes('mp4') ? 'buddy-recording.m4a' : 'buddy-recording.webm')}><ArrowDownToLine size={16} /></IconButton><IconButton label="Discard audio preview" onClick={() => { setAudioUrl(''); setAudioBlob(undefined); }}><X size={16} /></IconButton></div>}
    <PhoneNavigation page={page} onNavigate={navigate} onSettings={()=>setModal('settings')}/>
    </div>



    {modal==='draft'&&meeting&&<TranscriptDraft meeting={meeting} settings={settings} onClose={()=>setModal(null)} onApply={draft=>{const current=meetingRef.current.find(m=>m.id===meeting.id);if(current)persist(draft(current));setModal(null);}}/>}
    {modal === 'new' && <Modal title="New meeting" onClose={() => {if(preparation){cancelPreparation();setModal(null);}else if(!busy)setModal(null);}}><div className="new-meeting-form"><p>Choose how to capture this meeting.</p><label className="field-label">Meeting title<input autoComplete="off" placeholder="e.g. Weekly research sync" disabled={busy} value={newTitle} onChange={e => setNewTitle(e.target.value)} maxLength={150} /></label><div className="mode-options">{([{ id: 'demo', label: 'Replay a demo meeting', sub: 'Watch notes and the roadmap build from sample data.', icon: Sparkles }, { id: 'microphone', label: isNative()?'Record a conversation':'Record my microphone', sub: isNative()?(settings.speechProvider!=='local'&&settings.localTranscription?`Audio transcription by ${settings.speechProvider==='deepgram'?'Deepgram · real-time Nova-3':'Groq · Whisper large-v3-turbo'}.`:'Recording on your device. No extra software to install.'):'Real audio capture. Desktop app required for local transcription.', icon: Mic }, { id: 'manual', label: 'Just take notes', sub: 'An editable document, without recording.', icon: FileText }] as const).map(({ id, label, sub, icon: Icon }) => <button className={newMode === id ? 'selected' : ''} key={id} disabled={busy} onClick={() => setNewMode(id)}><Icon size={19} /><span><strong>{label}</strong><small>{sub}</small></span><span className="radio-dot">{newMode === id && <span />}</span></button>)}</div>{newMode==='microphone'&&isNative()&&(preparation?<div className="recording-preparation" aria-label="Preparing recording"><div role="status"><strong>Getting Buddy ready</strong><p>{preparation.stage==='copying'?'Preparing the speech engine included with Buddy.':preparation.stage==='downloading'?'Downloading the speech engine once. Your audio stays on this device.':preparation.stage==='verifying'?'Checking the speech engine…':'Checking local speech support…'}</p></div><progress aria-label="Recording preparation" max={preparation.total} value={preparation.received}/><span>{Math.min(100,Math.round(preparation.received/preparation.total*100))}%</span><button className="button secondary small" onClick={cancelPreparation}>Cancel preparation</button><p className="field-help">Nothing is being recorded yet.</p></div>:<EngineSetup settings={settings} onChange={changeSettings} compact onCredentialChange={()=>setError('')}/>)}{newMode === 'microphone' && <label className="checkbox-label consent" htmlFor="recording-consent"><AnimatedCheckbox id="recording-consent" disabled={busy} label="I have informed participants and have permission to record." checked={consent} onChange={setConsent} />I have informed participants and have permission to record.</label>}{captureMeetingId && <p className="inline-error">Finish your active meeting before starting another.</p>}{error && <p className="inline-error" role="alert">{error}</p>}{preparationFailed&&!busy&&newMode==='microphone'&&<button className="button secondary small" onClick={()=>void create(true)}>Record audio only</button>}<LiquidButton className="liquid-record full" disabled={busy || !!captureMeetingId || (newMode === 'microphone' && (!consent||(isNative()&&(!settings.captureMicrophone&&!settings.captureSystemAudio||(settings.localTranscription&&settings.speechProvider!=='local'&&!(settings.speechProvider==='deepgram'?settings.deepgramAudioConsent:settings.groqAudioConsent))))))} onClick={() => void create()}>{busy ? preparation?'Preparing…':'Starting…' : newMode === 'demo' ? 'Start demo replay' : newMode === 'microphone' ? isNative()?(settings.localTranscription&&settings.speechProvider!=='local'?`Start recording with ${settings.speechProvider==='deepgram'?'Deepgram':'Groq'}`:'Start recording'):'Start microphone recording' : 'Create meeting notes'}<ArrowRight size={16} /></LiquidButton><p className="form-footnote"><LockKeyhole size={12} />{newMode==='microphone'&&isNative()&&settings.localTranscription&&settings.speechProvider!=='local'?`Selected recording audio will be sent to ${settings.speechProvider==='deepgram'?'Deepgram':'Groq'}.`:'Nothing is sent to meeting participants.'}</p></div></Modal>}
    <MeetingNavigator open={modal==='navigator'} meetings={meetings} reduceMotion={settings.reduceMotion} initialMeetingId={page==='meeting'?meeting?.id:undefined} onClose={()=>setModal(null)} onOpen={target=>{setModal(null);openMeeting(target);}} onAsk={(target,question)=>{setModal(null);openMeeting(target,question);}}/>
    {modal === 'focus' && <FocusDialog enabled={settings.focusMode} onChange={enabled=>changeSettings({...settings,focusMode:enabled})} onClose={()=>setModal(null)}/>}
    {modal === 'settings' && <SettingsDialog settings={settings} onChange={changeSettings} onClose={() => setModal(null)} onDelete={() => setModal('delete')} onKnowledge={() => { setModal(null); navigate('knowledge'); }} />}
    <ConfirmationDialog open={modal==='delete'} title="Delete this workspace?" description="This deletes all saved meetings, notes, settings, and indexed excerpts from this device. It does not change your source files. Export anything you want to keep first." confirmLabel="Delete all data" cancelLabel="Keep workspace" disabled={!!captureMeetingId} onClose={()=>setModal(null)} onConfirm={deleteAll}/>
    <ConfirmationDialog open={modal==='deleteMeeting'&&!!meeting} title="Delete this meeting?" description={`“${meeting?.title??''}” and its notes, transcript, and events will be permanently removed from this workspace.`} confirmLabel="Delete meeting" cancelLabel="Keep meeting" disabled={meeting?.id===captureMeetingId} onClose={()=>setModal(null)} onConfirm={async()=>{if(!meeting)throw new Error('No meeting selected.');await deleteMeeting(meeting);}}/>
    {modal === 'export' && meeting && <Modal title="Keep the conversation" onClose={() => setModal(null)}><div className="modal-body"><p>Export your notes and timestamped evidence. Audio is not included.</p><div className="export-options"><button onClick={() => downloadFile(toMarkdown(meeting), `${meeting.title.replace(/[^a-z0-9 -]/gi,'') || 'meeting'}.md`, 'text/markdown')}><FileText size={23} /><strong>Markdown</strong><span>Readable notes and transcript</span><ArrowDownToLine size={17} /></button><button onClick={() => downloadFile(JSON.stringify(meeting, null, 2), 'buddy-meeting.json', 'application/json')}><LayoutPanelLeft size={23} /><strong>JSON</strong><span>Structured meeting and evidence</span><ArrowDownToLine size={17} /></button></div></div></Modal>}
    {selection && <Modal title={selection.event ? 'Behind this moment' : 'Source evidence'} onClose={() => setSelection(null)} wide={!!selection.citation?.chunk} className={selection.citation?.chunk?'source-sheet':'evidence-sheet'}><div className="evidence-body">{selection.event && <><div className={`evidence-kind event-${selection.event.type}`}>{eventLabels[selection.event.type]}<span>{timestamp(selection.event.start)}–{timestamp(selection.event.end)}</span></div><h3>{selection.event.title}</h3><p>{selection.event.text}</p><span className={`badge ${selection.event.evidenceState === 'explicit' ? 'confirmed' : 'warning'}`}><Check size={12} />{evidenceLabels[selection.event.evidenceState]}</span>{selection.event.relatedIds.length > 0 && <div className="related-moments"><span>Developed from</span>{selection.event.relatedIds.map(id => { const related = eventMeeting?.events.find(e => e.id === id); return related && <button key={id} onClick={() => setSelection({ event: related })}>{related.title}<ChevronRight size={13} /></button>; })}</div>}</>}{evidenceSegments?.map(s => <div className="evidence-excerpt" key={s.id}><div><AudioLines size={14} />Original transcript<span>{timestamp(s.start)}–{timestamp(s.end)}</span></div><blockquote>{s.text}</blockquote><button className="text-button" onClick={() => eventMeeting && gotoTranscript(eventMeeting.id, s.id)}>Go to transcript<ArrowRight size={13} /></button></div>)}{selection.event && eventMeeting && <button className="button secondary small" onClick={() => { const id = selection.event?.id; const block = eventMeeting.blocks.find(b => b.eventIds.includes(id ?? '')); openMeeting(eventMeeting); setTimeout(() => block && document.getElementById(`block-${block.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); }}>Open meeting notes<ArrowRight size={14} /></button>}{selection.citation?.kind==='note' && <><h3>{selection.citation.label}</h3>{eventMeeting?.blocks.find(b=>b.id===selection.citation?.blockId&&b.revision===selection.citation?.revision)?<><SourceExcerpt text={eventMeeting.blocks.find(b=>b.id===selection.citation?.blockId)!.html.replace(/<[^>]*>/g,' ')} name="Meeting note"/><button className="button secondary small" onClick={()=>{const id=selection.citation?.blockId;openMeeting(eventMeeting);setTimeout(()=>id&&document.getElementById(`block-${id}`)?.scrollIntoView({block:'center',behavior:settings.reduceMotion?'instant':'smooth'}),100);}}>Open meeting note<ArrowRight size={14}/></button></>:<p role="alert">This note was edited or removed after the answer. Ask again to use the current revision.</p>}</>}{selection.citation?.chunk && <><div className="document-source-heading"><FileText size={26} /><h3>{selection.citation.chunk.name}</h3></div><span className="badge neutral">{selection.citation.chunk.location}</span>{selection.citation.chunk.demo && <p className="demo-source-label">Fictional demo fixture · not real financial data</p>}<SourceExcerpt text={selection.citation.chunk.text} name={selection.citation.chunk.name}/><p className="field-help">Selected excerpt from your saved source. {selection.citation.chunk.name.endsWith('.xlsx') && 'Displays saved cell values; formulas are not recalculated.'}</p>{selection.citation.chunk.demo ? <a className="button secondary small" href={`/fixtures/${selection.citation.chunk.name}`} download>Download source file<ArrowDownToLine size={14} /></a> : originals.current.has(selection.citation.chunk.documentId) ? <button className="button secondary small" onClick={() => { const f = originals.current.get(selection.citation!.chunk!.documentId)!; downloadFile(f, f.name); }}>Download selected original<ArrowDownToLine size={14} /></button> : <div className="info-box">Your excerpt is saved. Reselect the original file in Knowledge to download it in this session.</div>}</>}<p className="evidence-footnote"><ShieldCheck size={13} />Text evidence only. Timestamped audio verification is not available.</p></div></Modal>}
  </div></ReducedMotionConfig></MotionProvider>;
}
