import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Button } from './MotionButton';
import { ArrowRight, ArrowUp, MessageSquare, Search } from 'lucide-react';
import type { Meeting } from '../meeting/model';
import { IconButton, Modal } from './components';
interface NavigatorProps {
  open:boolean; meetings:Meeting[]; reduceMotion:boolean; initialMeetingId?:string;
  onClose():void; onOpen(meeting:Meeting):void; onAsk(meeting:Meeting,question:string):void;
}
function searchable(meeting:Meeting) {
  const notes=meeting.blocks.map(block=>new DOMParser().parseFromString(block.html,'text/html').body.textContent??'').join(' ');
  return [meeting.title,...meeting.tags,...meeting.segments.map(segment=>segment.text),...meeting.events.map(event=>event.text),notes].join(' ').toLowerCase();
}
export function MeetingNavigator(props:NavigatorProps) {
  return <AnimatePresence>{props.open&&<NavigatorContent key="meeting-navigator" {...props}/>}</AnimatePresence>;
}
function NavigatorContent({meetings,initialMeetingId,onClose,onOpen,onAsk}:NavigatorProps) {
  const [intent,setIntent]=useState<'find'|'ask'>('ask');
  const [query,setQuery]=useState(''),[searched,setSearched]=useState(false),[meetingId]=useState(initialMeetingId??meetings[0]?.id??''),[question,setQuestion]=useState('');
  const target=meetings.find(meeting=>meeting.id===meetingId);
  const results=searched?meetings.filter(meeting=>searchable(meeting).includes(query.trim().toLowerCase())):[];
  return <Modal title="Meeting navigator" onClose={onClose} className="meeting-navigator spotlight-navigator" placement="bottom" initialFocus="textarea,input" chrome={false} transparentBackdrop>
    <div className="navigator-body">
      <div className="spotlight-controls" aria-label="Choose what to do">
        <Button type="button" hoverScale={1} className="spotlight-chip" aria-label="Ask a question" aria-pressed={intent==='ask'} onClick={()=>setIntent('ask')}><MessageSquare size={14}/><span>Ask</span></Button>
        <Button type="button" hoverScale={1} className="spotlight-chip" aria-label="Find a meeting" aria-pressed={intent==='find'} onClick={()=>setIntent('find')}><Search size={14}/><span>Search</span></Button>
        <IconButton label="Close dialog" className="spotlight-close" onClick={onClose}><span aria-hidden="true">×</span></IconButton>
      </div>
      {intent==='find'&&searched&&<section className="navigator-results" aria-label="Matching meetings"><p role="status">{results.length?`${results.length} matching meeting${results.length===1?'':'s'}`:'No matching meetings'}</p>{results.map(meeting=><button key={meeting.id} onClick={()=>onOpen(meeting)} aria-label={`Open ${meeting.title}`}><span><strong>{meeting.title}</strong><small>{new Date(meeting.date).toLocaleDateString('en-GB',{day:'numeric',month:'long'})}{meeting.mode==='demo'?' · Demo':''}</small></span><ArrowRight size={14}/></button>)}{!results.length&&<span className="navigator-empty">{meetings.length?'Try a shorter phrase or a meeting title.':'Record a meeting or add notes to get started.'}</span>}</section>}
      <form onSubmit={event=>{event.preventDefault();if(intent==='find')setSearched(true);else if(target&&question.trim())onAsk(target,question.trim());}}>
        <div className="navigator-composer">
          {intent==='find'?<input aria-label="What are you looking for?" type="search" value={query} maxLength={300} placeholder="Find a meeting…" onChange={event=>setQuery(event.target.value)}/>:<textarea aria-label="Your question" aria-describedby="navigator-draft-hint" value={question} onChange={event=>setQuestion(event.target.value)} maxLength={2000} placeholder={meetings.length?'Ask about this meeting…':'Create a meeting to ask Buddy…'} rows={1} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/>}
          <Button type="submit" hoverScale={1} className="navigator-send" aria-label={intent==='find'?'Search meetings':'Continue in meeting'} title={intent==='find'?'Search saved meetings':'Open a question draft in this meeting'} disabled={intent==='ask'&&(!target||!question.trim())}><ArrowUp size={20} strokeWidth={1.8}/></Button>
        </div>
      </form>
      <p className="sr-only" id="navigator-draft-hint">Your question opens as an editable draft{target?` in ${target.mode==='demo'?'the demo meeting ':''}${target.title}`:''}. Nothing is sent yet.</p>
    </div>
  </Modal>;
}
