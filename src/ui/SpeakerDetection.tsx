import type {Meeting} from '../meeting/model';
import {detectedSpeakers} from '../meeting/speakers';
export function SpeakerDetection({meeting}:{meeting:Meeting}){
 const sources=detectedSpeakers(meeting);
 if(!sources.length)return null;
 return <details className="speaker-detection"><summary>{sources.length===1?`${sources[0].count} voice${sources[0].count===1?'':'s'} detected`:'Speaker detection'} <span>Estimated</span></summary><div>{sources.map(s=><p key={s.source}><strong>{s.source==='microphone'?'Microphone':'Computer audio'}</strong> · {s.count} speaker label{s.count===1?'':'s'}{s.reconnected?' · maximum in one connection':''}</p>)}<p>Anonymous voice labels, not identified people. Labels reset after reconnecting and are separate for each audio source. Overlapping speech or echoed audio can affect the estimate.</p></div></details>;
}
