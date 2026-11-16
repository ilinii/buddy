import type {Meeting} from '../meeting/model';
import {AiStatus} from './AiStatus';
export function MeetingReport({meeting,onRetry,onCancel}:{meeting:Meeting;onRetry():void;onCancel():void}){
  const report=meeting.report;if(!report)return null;
  const running=report.status==='running';
  return <section className="meeting-report" aria-label="Meeting report status">
    <div><AiStatus busy={running} state={running?'writing':report.status==='ready'?'done':report.status==='failed'?'error':'thinking'} label={running?'Preparing your meeting report':report.status==='ready'?report.provider==='excerpts'?'Transcript excerpts saved':'Report ready · review against the transcript':report.status==='failed'?'Report needs attention':'No transcript to summarize'}/><p>{report.message}</p></div>
    {running?<button className="button secondary small" onClick={onCancel}>Cancel report</button>:report.status!=='unavailable'&&<button className="button secondary small" onClick={onRetry}>{report.status==='failed'?'Retry report':'Regenerate report'}</button>}
  </section>;
}
