import {AudioWave} from './AudioWave';
import { useShouldReduceMotion } from './motion-system';
import { ArrowUpRight, Mic, Monitor, Pause, Play, Square } from 'lucide-react';
import { type Meeting, type Segment, timestamp, isPersonalNote } from '../meeting/model';
import { TextEffect } from '../components/ui/text-effect';
import { LiquidButton } from './animate-ui/liquid-button';
import { Button } from './MotionButton';

export function RecordingStage({meeting,level,busy,quiet,onPause,onFinish,onTranscript,phase,onCancelTranscription,interim=[],health}:{interim?:Segment[];health?:string;phase?:string;onCancelTranscription?:()=>void;meeting:Meeting;level:number;busy:boolean;quiet:boolean;onPause():void;onFinish():void;onTranscript():void}) {
  const reduced=useShouldReduceMotion(),paused=meeting.status==='paused',demo=meeting.mode==='demo';
  const latest=meeting.segments.at(-1);
  const personal=isPersonalNote(meeting);
  const streaming=meeting.recording?.model?.startsWith('deepgram/');
  const live=interim.filter(segment=>!segment.final&&segment.text.trim());
  const systemOnly=meeting.recording?.sources?.length===1&&meeting.recording.sources[0]==='system';
  const sourceLabel=systemOnly?'computer audio':meeting.recording?.sources?.includes('system')?'microphone + computer':'microphone';
  const status=phase==='finalizing'?'Transcribing remaining audio':paused?'Paused':demo?'Demo replay':'Recording';
  return <section className={`recording-stage ${paused?'is-paused':''}`} aria-label={demo?'Demo replay studio':systemOnly?'Computer audio recording studio':'Microphone recording studio'}>
    <div className="recording-strip">
      <span className="recording-state" role="status"><span className={paused?'paused-dot':'recording-dot'}/><TextEffect as="span" per="word" preset="blur">{status}</TextEffect></span>
      <span className="recording-time" aria-label={`Elapsed ${timestamp(meeting.duration)}`}>{timestamp(meeting.duration)}</span>
      <div className="recording-signal-wrap"><AudioWave className="recording-signal" level={level} paused={paused} quiet={quiet||reduced} preview={demo}/></div>
      <div className="recording-controls"><LiquidButton className="recording-pause" aria-label={paused?'Resume meeting':'Pause meeting'} title={paused?'Resume recording':'Pause recording'} onClick={onPause} disabled={busy||phase==='finalizing'}>{paused?<Play size={14}/>:<Pause size={14}/>}<span className="sr-only">{paused?'Resume':'Pause'}</span></LiquidButton><Button className="recording-finish" hoverScale={1} onClick={onFinish} disabled={busy}><Square size={10} fill="currentColor"/>{busy?'Finishing…':'Finish'}</Button></div>
    </div>
    <div className="recording-caption">{!demo&&(systemOnly?<Monitor size={11}/>:<Mic size={11}/>)}<span>{demo?'Demo data · no microphone is being recorded':meeting.recording?.transcribing?(streaming?'Deepgram · Nova-3 · real-time captions':meeting.recording.model?.startsWith('groq/')?'Groq · Whisper large-v3-turbo · audio sent to cloud':'Local Whisper · finalized passages appear after processing'):meeting.recording?`Recording ${sourceLabel} · transcription off`:'Recording microphone · no ASR installed'}</span>{!demo&&<meter min={0} max={1} value={paused?0:level} aria-label={`Audio level ${Math.round((paused?0:level)*100)} percent`}/>}</div>
    {health&&<p className="field-help streaming-health" role="status">{health}</p>}
    {phase==='finalizing'&&onCancelTranscription&&<button className="text-button" onClick={onCancelTranscription}>Cancel remaining transcription</button>}{(demo||meeting.recording?.transcribing)&&<div className="live-excerpt"><div className="live-excerpt-meta"><span>{demo?'Sample transcript':live.length?'Live captions · words may change':personal?'Voice note · live transcript':'Live transcript · review for accuracy'}</span>{latest&&<time>{timestamp(latest.start)}</time>}<button onClick={onTranscript} disabled={!latest}>View transcript<ArrowUpRight size={12}/></button></div><div className="live-excerpt-content" data-segment-id={latest?.id}>{live.length?live.map(segment=><p key={segment.channel} className="live-excerpt-text live-interim" data-channel={segment.channel}><span className="field-help">{personal?'Your voice':segment.channel==='system'?'Computer audio':'Microphone'} · live</span><br/><TextEffect className="rolling-caption" as="span" per="word" preset="blur" incremental>{segment.text}</TextEffect></p>):latest?<TextEffect key={latest.id} className="live-excerpt-text rolling-caption" as="p" per="word" preset="blur">{latest.text}</TextEffect>:<p className="live-excerpt-waiting">{demo?'Sample passages appear as the demo progresses.':streaming?'Listening. Words appear as you speak.':'Listening. Finalized passages appear after an audio chunk is processed.'}</p>}</div></div>}

  </section>;
}
