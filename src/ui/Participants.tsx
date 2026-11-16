import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { participantsFromText, type Meeting, type Participant } from '../meeting/model';
import { Modal } from './components';

export function Participants({meeting,onSave}:{meeting:Meeting;onSave(people:Participant[]):void}) {
  const [open,setOpen]=useState(false),[text,setText]=useState(''),[error,setError]=useState('');
  const edit=()=>{setText(meeting.participants.map(p=>p.name).join('\n'));setError('');setOpen(true);};
  const visible=meeting.participants.slice(0,5);
  return <div className="meeting-people">
    {!!visible.length&&<div className="participant-group">{visible.map(person=><button className="participant-avatar" aria-label={`Edit people: ${person.name}`} onClick={edit} key={person.id}>{person.name.split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase()}<span className="participant-tooltip" role="tooltip">{person.name}</span></button>)}</div>}
    <button className="people-edit" onClick={edit}>{visible.length?<Plus size={12}/>:<Users size={14}/>}<span>{visible.length?`${meeting.participants.length} people`:'Add people'}</span></button>
    {open&&<Modal title="People in this meeting" onClose={()=>setOpen(false)} className="people-dialog"><form className="modal-body" onSubmit={event=>{event.preventDefault();try{onSave(participantsFromText(text,meeting.participants));setOpen(false);}catch(reason){setError(String(reason instanceof Error?reason.message:reason));}}}><p>Add names to keep your meeting organised. Deepgram can detect anonymous voices; names here are entered manually and are not matched to a voice automatically.</p><label className="field-label" htmlFor="participant-names">Names<textarea id="participant-names" autoFocus value={text} maxLength={2000} placeholder="One name per line" onChange={event=>setText(event.target.value)} rows={5}/></label><p className="field-help">Separate names with a new line or comma. Up to 24 people.</p>{error&&<p role="alert" className="inline-error">{error}</p>}<div className="button-row"><button className="button secondary" type="button" onClick={()=>setOpen(false)}>Cancel</button><button className="button primary" type="submit">Save people</button></div></form></Modal>}
  </div>;
}
