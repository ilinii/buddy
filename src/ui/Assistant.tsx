import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, ChevronDown, FileText, ListChecks, MessageSquare, Plus, RotateCcw, Square, X } from 'lucide-react';
import type { ChatMessage, Citation, Meeting, Settings } from '../meeting/model';
import { OfflineProvider, providerError } from '../assistant/service';
import { GeminiProvider } from '../assistant/gemini';
import {NvidiaProvider} from '../assistant/nvidia';
import {corpusDocuments} from '../assistant/retrieval';
import { storage } from '../storage/service';
import { IconButton, Orb } from './components';
import {AiStatus,phaseState,phaseLabel,type AiStatusState} from './AiStatus';
import {TextEffect} from '../components/ui/text-effect';
import { CopyAction } from './AnimatedControls';

export interface AssistantDraft { id:string; text:string; }
export function Assistant({ meeting, settings, draft, onDraftApplied, onExplore, onCitation, onKnowledge, onClose, onSettings }: { meetings: Meeting[]; meeting: Meeting; settings: Settings; draft?:AssistantDraft; onDraftApplied(id:string):void; onExplore():void; onCitation(citation: Citation): void; onKnowledge(): void; onClose(): void; onSettings(): void }) {
  const [input, setInput] = useState('');
  const inputElement=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(draft){setInput(draft.text);inputElement.current?.focus({preventScroll:true});onDraftApplied(draft.id);}},[draft?.id]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiState,setAiState]=useState<AiStatusState>('thinking');
  const [progress,setProgress]=useState('Finding the relevant moments');
  const rawProgress=useRef('');
  const abort = useRef<AbortController | undefined>(undefined);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setInput(''); setError(''); setBusy(true);setProgress('Finding the relevant moments');setAiState('researching');
    const requestFiles=settings.provider==='offline'||settings.cloudLibraryConsent;
    const controller = new AbortController(); abort.current = controller;
    setMessages(old => [...old, { id: crypto.randomUUID(), role: 'user', text: question, citations: [] }]);
    try {
      const latest=await storage.load();
      const documents=settings.provider==='offline'||requestFiles?corpusDocuments(latest.documents):[];
      const provider=settings.provider==='nvidia'?new NvidiaProvider(settings,detail=>{rawProgress.current=detail;setProgress('Finding the relevant moments');},requestFiles,phase=>{setAiState(phaseState(phase));setProgress(phaseLabel(phase,rawProgress.current));}):settings.provider==='gemini'?new GeminiProvider(settings.model):new OfflineProvider();
      if(settings.provider==='gemini'&&!settings.cloudConsent)throw Error('Allow sending meeting excerpts to Gemini in Settings before using this provider.');
      const answer=await provider.answer(question,latest.meetings,meeting.id,documents,controller.signal,{includeHistory:true});
      if(!controller.signal.aborted){setAiState('done');setMessages(old=>[...old,{id:crypto.randomUUID(),role:'assistant',text:answer.text,citations:answer.citations,details:answer.details,provider:answer.provider}]);}
    }catch(e){if(abort.current===controller){setAiState('error');setError(providerError(e));}}
    finally{if(abort.current===controller){setBusy(false);abort.current=undefined;}}

  };
  return <aside className="assistant-panel" aria-label="Buddy assistant">
    <header className="assistant-header"><div className="assistant-identity"><Orb size="large" interactive onActivate={onExplore} active={!settings.reduceMotion&&!settings.focusMode} state={busy ? 'thinking' : meeting.status === 'live' ? 'listening' : 'idle'} /><span>Buddy<small role="status">{busy ? 'Searching your sources' : meeting.status === 'live' ? meeting.mode === 'demo' ? 'Following demo replay' : 'Microphone recording' : 'Ready when you are'}</small></span></div><div><IconButton label="Clear conversation" onClick={() => { abort.current?.abort(); setMessages([]); setError(''); }}><RotateCcw size={15} /></IconButton><IconButton label="Hide assistant" onClick={onClose}><X size={16} /></IconButton></div></header>
    <div className="assistant-scroll" ref={scroll}>
      {!messages.length ? <div className="assistant-welcome"><h2>Find the thread.</h2><p>The decisions, the details,<br />and how you got here.</p><div className="suggestions"><button onClick={() => void ask('What did we decide?')}><ListChecks size={15} /><span>What did we decide?</span><ArrowUpRight size={14} /></button><button onClick={() => void ask('What needs to happen next?')}><MessageSquare size={15} /><span>What needs to happen next?</span><ArrowUpRight size={14} /></button><button onClick={() => void ask('Find the Q2 revenue report')}><FileText size={15} /><span>Find the Q2 revenue report</span><ArrowUpRight size={14} /></button></div></div> : <div className="chat-messages">{messages.map(m => <div key={m.id} className={`chat-message chat-${m.role}`}>{m.role === 'assistant' && <div className="answer-label"><Orb size="tiny" active={false} />Buddy <span>From your workspace</span></div>}{m.role==='assistant'?<TextEffect as="div" className="message-text" per={m.text.length>12000?'line':'word'} preset="blur">{m.text}</TextEffect>:<div className="message-text">{m.text}</div>}{m.role === 'assistant' && <CopyAction content={m.text} label="Copy answer"/>}{m.role==='assistant'&&<div className="answer-complete"><AiStatus state="done" label="Answer ready"/></div>}{m.citations.length > 0 && <details className="answer-sources" open><summary>{m.citations.length} linked {m.citations.length===1?'source':'sources'}</summary><div className="citations">{m.citations.map((c, i) => <button key={`${c.id}-${i}`} onClick={() => onCitation(c)}><span>{i + 1}</span>{c.label}<ArrowUpRight size={12} /></button>)}</div></details>}</div>)}</div>}
      {busy && <div className="thinking"><AiStatus state={aiState} label={progress} busy/></div>}
      {error && <div className="inline-error" role="alert"><AiStatus state="error" label="Request stopped"/><p>{error}</p></div>}
    </div>
    <div className="assistant-compose"><div className="context-tag"><span className="status-dot" />{meeting.mode === 'demo' ? 'Sample workspace' : 'Your meetings & knowledge'}</div><form className="composer" onSubmit={e => { e.preventDefault(); void ask(input); }}><label htmlFor="assistant-input" className="sr-only">Ask Buddy</label><textarea ref={inputElement} id="assistant-input" value={input} maxLength={2000} onChange={e => setInput(e.target.value)} placeholder="Ask about this conversation…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }} /><div className="compose-tools"><IconButton label="Add knowledge sources" onClick={onKnowledge}><Plus size={16} /></IconButton><button type="button" className="provider-select" onClick={onSettings}>Buddy<ChevronDown size={12} /></button>{busy ? <IconButton label="Cancel request" className="send-button" onClick={() => abort.current?.abort()}><Square size={12} /></IconButton> : <IconButton label="Send message" className="send-button" type="submit" disabled={!input.trim()}><ArrowUp size={17} /></IconButton>}</div></form></div>
  </aside>;
}
