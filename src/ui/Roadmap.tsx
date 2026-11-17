import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ReactFlow, Controls, Handle, MarkerType, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, ArrowRight, ChevronDown, GitBranch, List } from 'lucide-react';
import type { Meeting } from '../meeting/model';
import { eventLabels, timestamp, type MeetingEvent } from '../meeting/model';
import { Empty, IconButton } from './components';

function MomentContent({ event }: { event: MeetingEvent }) {
  return <><span className="moment-meta"><span className="moment-kind">{eventLabels[event.type]}</span><time>{timestamp(event.start)}</time></span><strong className="moment-title">{event.title}</strong></>;
}
type MomentNode = Node<{ event: MeetingEvent }, 'moment'>;
function MomentGraphNode({ data }: NodeProps<MomentNode>) {
  return <div className={`moment-graph-content event-${data.event.type}`}><Handle type="target" position={Position.Left} /><div className="graph-event-meta"><time>{timestamp(data.event.start)}</time><span>{eventLabels[data.event.type]}</span></div><strong className="graph-event-title">{data.event.title}</strong><Handle type="source" position={Position.Right} /></div>;
}
const nodeTypes = { moment: MomentGraphNode };

export function Roadmap({ meeting, onSelect, expanded = false, initiallyOpen = true }: { meeting: Meeting; onSelect(event: MeetingEvent): void; expanded?: boolean; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [view, setView] = useState<'timeline' | 'graph'>('timeline');
  const [selected, setSelected] = useState<string>();
  const [scrollable, setScrollable] = useState({ back: false, forward: false });
  const track = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const select = (event: MeetingEvent) => { setSelected(event.id); onSelect(event); };
  const nodes = useMemo<MomentNode[]>(() => meeting.events.map((event, index) => ({ id: event.id, type: 'moment', position: { x: index * 275, y: event.type === 'action_item' ? 155 : 30 }, data: { event }, ariaLabel: `${timestamp(event.start)} ${eventLabels[event.type]}: ${event.title}`, style: { width: 236 } })), [meeting.events]);
  const edges = useMemo<Edge[]>(() => meeting.events.flatMap(event => event.relatedIds.filter(id => meeting.events.some(node => node.id === id)).map(id => ({ id: `${id}-${event.id}`, source: id, target: event.id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#a3a4aa' }, style: { stroke: '#a3a4aa', strokeWidth: 1.15 }, labelStyle: { fill: '#72747d', fontSize: 10 } }))), [meeting.events]);
  useEffect(() => {
    const element = track.current;
    if (!element || expanded) return;
    const update = () => setScrollable({ back: element.scrollLeft > 2, forward: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 });
    const observer = new ResizeObserver(update); observer.observe(element);
    element.addEventListener('scroll', update, { passive: true }); update();
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [open, view, expanded, meeting.events.length]);
  const scroll = (direction: number) => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true';
    track.current?.scrollBy({ left: direction * Math.max(220, (track.current?.clientWidth ?? 0) * .75), behavior: reduced ? 'instant' : 'smooth' });
  };
  return <section className={`roadmap ${expanded ? 'roadmap-expanded' : ''}`} aria-label="Conversation roadmap">
    <header className="roadmap-header"><button className="roadmap-toggle" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(!open)}><strong>Conversation roadmap</strong><span className="moment-count">{meeting.events.length} moments</span><ChevronDown className={open ? '' : 'is-collapsed'} size={14} /></button>{open && <div className="roadmap-tools"><div className="segmented" aria-label="Roadmap view"><button aria-pressed={view === 'timeline'} className={view === 'timeline' ? 'selected' : ''} onClick={() => setView('timeline')}><List size={13} />Timeline</button><button aria-pressed={view === 'graph'} className={view === 'graph' ? 'selected' : ''} onClick={() => setView('graph')}><GitBranch size={13} />Graph</button></div>{view === 'timeline' && !expanded && meeting.events.length > 0 && <div className="roadmap-scroll-controls"><IconButton label="Previous moments" disabled={!scrollable.back} onClick={() => scroll(-1)}><ArrowLeft size={14} /></IconButton><IconButton label="Next moments" disabled={!scrollable.forward} onClick={() => scroll(1)}><ArrowRight size={14} /></IconButton></div>}</div>}</header>
    {open && <div id={contentId}>{!meeting.events.length ? <Empty title="The conversation starts here">Recorded insights will appear here when a transcript and synthesis are available.</Empty> : view === 'graph' ? <div className="graph"><ReactFlow nodes={nodes} nodeTypes={nodeTypes} edges={edges} onNodeClick={(_, node) => { const event = meeting.events.find(event => event.id === node.id); if (event) select(event); }} fitView fitViewOptions={{ minZoom: 1, maxZoom: 1, padding: .18 }} minZoom={0.2} maxZoom={1.6} nodesDraggable={false} nodesConnectable={false}><Controls showInteractive={false} /></ReactFlow><span className="graph-hint">Drag to explore · Scroll to zoom</span></div> : <div className="timeline-track" ref={track} aria-label="Meeting moments">{meeting.events.map(event => <div className="timeline-item" key={event.id}><button className={`timeline-node event-${event.type}`} data-event-id={event.id} aria-pressed={selected === event.id} onClick={() => select(event)}><MomentContent event={event} />{expanded && <p className="moment-description">{event.text}</p>}<span className="moment-footer"><span>{event.evidenceIds.length} source{event.evidenceIds.length === 1 ? '' : 's'}<ArrowRight size={12} /></span></span></button></div>)}</div>}</div>}
  </section>;
}
