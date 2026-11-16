import {HookSidebar} from './HookSidebar';
import { useEffect, useRef, useState } from 'react';
import { LiquidButton } from './animate-ui/liquid-button';
import { Button } from './MotionButton';
import { useMotionTokens } from './motion-system';
import { ArrowRight, Clock3, FilePenLine, Mic, Search, ShieldCheck } from 'lucide-react';
import type { Meeting } from '../meeting/model';
import { Empty, MatrixCube } from './components';
interface LibraryProps {
  capability?:string; meetings:Meeting[]; search:string; activeMeeting?:Meeting; reduceMotion:boolean;
  onSearch(value:string):void; onNew(mode:Meeting['mode']):void; onOpen(meeting:Meeting):void; onDemo():void; onPrivacy():void; onExplore():void;
}
function preview(meeting:Meeting) {
  const decision=meeting.events.find(event=>event.type==='decision');
  if(decision) return decision.text;
  for(const block of meeting.blocks) {
    const html=block.html.replace(/<\/(?:p|li|h[1-6]|div)>/gi,'$& ');
    const text=new DOMParser().parseFromString(html,'text/html').body.textContent?.replace(/\s+/g,' ').trim();
    if(text) return text;
  }
  return 'Open this meeting to add your notes.';
}
export function Library({capability,meetings,search,activeMeeting,reduceMotion,onSearch,onNew,onOpen,onDemo,onPrivacy,onExplore}:LibraryProps) {
  const {scale}=useMotionTokens();
  const [activeMonth,setActiveMonth]=useState('');
  const groupRefs=useRef(new Map<string,HTMLElement>());
  const [filter,setFilter]=useState<'all'|'actions'>('all');
  const filtered=meetings.filter(meeting=>`${meeting.title} ${meeting.tags.join(' ')} ${meeting.segments.map(segment=>segment.text).join(' ')}`.toLowerCase().includes(search.toLowerCase())&&(filter==='all'||meeting.events.some(event=>event.type==='action_item'&&!event.done)));
  const groups=[...new Set(filtered.map(m=>Number.isFinite(Date.parse(m.date))?m.date.slice(0,7):'undated'))].sort().reverse().map(id=>({id,label:id==='undated'?'Undated':new Date(`${id}-15T12:00:00`).toLocaleDateString('en-GB',{month:'long',year:'numeric'}),meetings:filtered.filter(m=>(Number.isFinite(Date.parse(m.date))?m.date.slice(0,7):'undated')===id)}));
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)setActiveMonth((entry.target as HTMLElement).dataset.month??'');},{root:document.querySelector('.main-content'),rootMargin:'0px 0px -65% 0px',threshold:0});for(const node of groupRefs.current.values())observer.observe(node);return()=>observer.disconnect();},[groups.map(g=>g.id).join('|')]);
  return <div className="library workspace-home meeting-library matrix-home page-enter">
    <header className="meeting-library-heading">
      <div className="library-title-group"><div className="capture-presence"><MatrixCube size="hero" active={!reduceMotion} state={activeMeeting?.status==='live'?'listening':'idle'} interactive onActivate={onExplore}/></div><h1>Meetings</h1></div>
      <div className="capture-toolbar"><div className="library-capture-actions"><LiquidButton className="liquid-record" disabled={!!activeMeeting} onClick={()=>onNew('microphone')}><Mic size={16}/>Record meeting</LiquidButton><button className="button secondary" disabled={!!activeMeeting} onClick={()=>onNew('manual')}><FilePenLine size={16}/>Take notes</button></div><span className="capture-capability">{capability??'Microphone audio only · Transcription not installed'}</span></div>
    </header>
    {activeMeeting&&<button className="active-capture-strip" onClick={()=>onOpen(activeMeeting)}><span className={activeMeeting.status==='live'?'recording-dot':'status-dot'}/><span>{activeMeeting.status==='paused'?'Paused':activeMeeting.mode==='demo'?'Demo replay':'Recording audio'}<strong>{activeMeeting.title}</strong></span><span>Return to meeting<ArrowRight size={14}/></span></button>}
    <section className="meeting-collection" aria-label="Saved meetings">
      <div className="collection-tools"><div className="meeting-filters" aria-label="Meeting filters"><button aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>All meetings</button><button aria-pressed={filter==='actions'} onClick={()=>setFilter('actions')}>With open actions</button></div><span className="collection-total">{meetings.length} saved</span><div className="conversation-search"><Search size={15}/><label className="sr-only" htmlFor="meeting-search">Search meetings</label><input id="meeting-search" placeholder="Search meetings" value={search} onChange={event=>onSearch(event.target.value)}/></div></div>
        <div className="indexed-meetings"><div className="meeting-groups">{groups.map(group=><section className="meeting-month-group" key={group.id} data-month={group.id} ref={node=>{if(node)groupRefs.current.set(group.id,node);else groupRefs.current.delete(group.id);}}><h2>{group.label}</h2><div className="meeting-list">{group.meetings.map(meeting=>{const actions=meeting.events.filter(event=>event.type==='action_item'&&!event.done).length;const decisions=meeting.events.filter(event=>event.type==='decision').length;return <Button hoverScale={1} tapScale={scale.choice} className="meeting-row glass-meeting" key={meeting.id} onClick={()=>onOpen(meeting)} aria-label={`Open ${meeting.title}`}>
          <span className="glass-meeting-meta"><span>{new Date(meeting.date).toLocaleDateString('en-GB',{day:'numeric',month:'long'})}</span>{meeting.mode==='demo'&&<span className="inline-demo">Demo</span>}</span>
          <span className="meeting-info"><strong>{meeting.title}</strong><span className="meeting-excerpt">{preview(meeting)}</span></span>
          <span className="glass-meeting-footer"><span><Clock3 size={12}/>{Math.floor(meeting.duration/60)} min</span><span>{actions>0?`${actions} open action${actions===1?'':'s'}`:decisions>0?`${decisions} decision${decisions===1?'':'s'}`:meeting.mode==='manual'?'Manual notes':'Meeting notes'}</span></span><ArrowRight className="meeting-row-open" size={16}/>
        </Button>;})}</div></section>)}{!filtered.length&&<Empty title={search?'No matching meetings':filter==='actions'?'No open actions':'Your first meeting starts here'}>{search?'Try a meeting title or a word from its transcript.':filter==='actions'?'Meetings with unfinished actions appear here.':'Record a conversation or begin with notes.'}</Empty>}</div>{groups.length>1&&<HookSidebar items={groups.map(({id,label})=>({id,label}))} value={groups.some(g=>g.id===activeMonth)?activeMonth:groups[0]?.id||''} onSelect={id=>{setActiveMonth(id);groupRefs.current.get(id)?.scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'start'});}}/>}</div>
    </section>
    <footer className="collection-footer"><button onClick={onPrivacy}><ShieldCheck size={12}/>Storage & privacy</button><button onClick={onDemo}>Open sample meeting<ArrowRight size={12}/></button></footer>
  </div>;
}
