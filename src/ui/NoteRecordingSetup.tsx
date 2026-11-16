import { useState } from 'react';
import { Effect } from './SurfaceEntrance';
import { Mic, Settings2, X } from 'lucide-react';
import type { Settings } from '../meeting/model';
import type { PreparationProgress } from '../engine/client';
import { isNative } from '../storage/service';
import { EngineSetup } from './EngineSetup';
import { LiquidButton } from './animate-ui/liquid-button';

/** Recording belongs to the open note; no new-meeting form or second document. */
export function NoteRecordingSetup({settings,onSettings,busy,preparation,failed,error,onStart,onCancel}: {
  settings: Settings; onSettings(settings: Settings): void;
  busy: boolean; preparation: PreparationProgress | null; failed: boolean; error: string;
  onStart(audioOnly?: boolean): void; onCancel(): void;
}) {
  const [advanced,setAdvanced]=useState(false);
  return <Effect fade blur className="note-recording-setup" role="region" aria-label="Record in this note">
    <div className="note-recording-heading"><span><Mic size={15}/>{busy?'Starting your voice note':'Voice note recording'}</span><button className="icon-button" aria-label="Cancel recording setup" disabled={busy&&!preparation} onClick={onCancel}><X size={15}/></button></div>
    {preparation ? <div className="note-preparation" role="status"><span>{preparation.stage==='downloading'?'Downloading speech support…':preparation.stage==='copying'?'Preparing included speech support…':'Preparing speech support…'} You can keep typing.</span><progress aria-label="Recording preparation" max={preparation.total} value={preparation.received}/></div> : <>
      <div className="note-recording-actions">{!busy&&<LiquidButton className="liquid-record" onClick={()=>onStart()}><Mic size={14}/>Retry recording</LiquidButton>}{isNative()&&<button className="text-button" aria-expanded={advanced} disabled={busy} onClick={()=>setAdvanced(!advanced)}><Settings2 size={13}/>Audio settings</button>}<span>{isNative()?settings.localTranscription?settings.speechProvider==='local'?'Microphone only · on-device transcription':`${settings.speechProvider==='deepgram'?'Deepgram':'Groq'} · microphone audio sent to cloud`:'Microphone only · audio only':'Audio only in browser · use desktop for transcription'}</span></div>
    </>}
    {advanced&&!busy&&isNative()&&<EngineSetup compact microphoneOnly settings={{...settings,captureMicrophone:true,captureSystemAudio:false}} onChange={next=>onSettings({...next,captureMicrophone:settings.captureMicrophone,captureSystemAudio:settings.captureSystemAudio})}/>}
    {error&&<p className="inline-error" role="alert">{error}</p>}
    {failed&&!busy&&<button className="text-button" onClick={()=>onStart(true)}>Record audio only</button>}
  </Effect>;
}
