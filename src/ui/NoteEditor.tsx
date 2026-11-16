import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, Check, Link2 } from 'lucide-react';
import type { MeetingEvent, NoteBlock, Segment } from '../meeting/model';
import { timestamp } from '../meeting/model';
import { IconButton } from './components';

export function NoteEditor({ block, events, onChange, onEvidence, segments=[], onSource, onTranscript, minimal=false, autoFocus=false }: { block: NoteBlock; events: MeetingEvent[];segments?:Segment[];onSource?(source:Segment):void;onTranscript?():void; onChange(html: string): void; onEvidence(event: MeetingEvent): void; minimal?:boolean; autoFocus?:boolean }) {
  const callback = useRef(onChange); callback.current = onChange;
  const [focused, setFocused] = useState(false);
  const [empty,setEmpty]=useState(!block.html.replace(/<[^>]*>|&nbsp;/g,'').trim());
  const [selected,setSelected]=useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false })],
    content: block.html,
    editorProps: { attributes: { class: 'note-editor', 'aria-label': `${block.title} editor`, role: 'textbox', 'aria-multiline': 'true' }, handlePaste: (_view, event) => {
      const text = event.clipboardData?.getData('text/plain');
      if (text) { event.preventDefault(); editor?.commands.insertContent({ type: 'text', text }); return true; }
      return false;
    } },
    onUpdate: ({ editor: e }) => {setEmpty(e.isEmpty);callback.current(e.getHTML());},
    onSelectionUpdate: ({editor:e})=>setSelected(!e.state.selection.empty),
    onFocus: () => setFocused(true), onBlur: () => setTimeout(() => setFocused(false), 120),
  });
  useEffect(() => {
    if (editor && editor.getHTML() !== block.html && !editor.isFocused) {editor.commands.setContent(block.html, { emitUpdate: false });setEmpty(editor.isEmpty);}
  }, [block.html, editor]);
  useEffect(()=>{
    if(!editor||!autoFocus)return;
    const frame=requestAnimationFrame(()=>{
      const active=document.activeElement;
      // Do not steal a title edit/click that happened before the first frame.
      if(active instanceof HTMLElement&&active.matches('button,a,input,textarea,select,[contenteditable="true"]'))return;
      if(!editor.isDestroyed)editor.view.focus();
    });
    return()=>cancelAnimationFrame(frame);
  },[editor,autoFocus]);
  const sources = events.filter(e => block.eventIds.includes(e.id));
  const directSources=segments.filter(s=>block.evidenceIds?.includes(s.id)&&!sources.some(event=>event.evidenceIds.includes(s.id)));
  return <section className={`note-block ${minimal?'minimal-note':''} ${block.title === 'The decision' ? 'decision-block' : ''}`} data-empty={empty} id={`block-${block.id}`}>
    {!minimal&&<div className="block-heading"><h2>{block.title === 'The decision' && <Check size={17} />}{block.title}</h2><div className="block-meta">{block.editedBy === 'user' ? <span className="edited-label">Edited by you</span> : null}{sources.map(source => <button key={source.id} className="time-link" aria-label={`Evidence for ${source.title} at ${timestamp(source.start)}`} onClick={() => onEvidence(source)}><Link2 size={12} />{timestamp(source.start)}</button>)}{directSources.slice(0,3).map(source=><button key={source.id} className="time-link" aria-label={`Transcript evidence at ${timestamp(source.start)}`} onClick={()=>onSource?.(source)}><Link2 size={12}/>{timestamp(source.start)}</button>)}{directSources.length>3&&<button className="time-link" onClick={onTranscript}>View transcript · {directSources.length} sources</button>}</div></div>}
    {focused && (!minimal||selected) && <div className="editor-toolbar" aria-label="Text formatting"><IconButton label="Bold" onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={14} /></IconButton><IconButton label="Italic" onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={14} /></IconButton><IconButton label="Bullet list" onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={14} /></IconButton></div>}
    <EditorContent editor={editor} />
  </section>;
}
