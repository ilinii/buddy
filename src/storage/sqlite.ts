import type { Database, BindingSpec } from '@sqlite.org/sqlite-wasm';
import { meetingSchema, settingsSchema, type Meeting, type Settings, type IndexedDocument, type DocumentChunk } from '../meeting/model';
import schema from './schema.sql?raw';

export function migrate(db: Database) { db.exec(schema); }
export function saveMeeting(db: Database, data: unknown) {
  const meeting = meetingSchema.parse(data);
  db.transaction(() => {
    db.exec('INSERT INTO meetings(id,title,date,json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,date=excluded.date,json=excluded.json', { bind: [meeting.id, meeting.title, meeting.date, JSON.stringify(meeting)] });
    for (const table of ['transcript_segments', 'meeting_events', 'note_blocks', 'event_relationships', 'action_items', 'source_references']) db.exec(`DELETE FROM ${table} WHERE meeting_id=?`, { bind: [meeting.id] });
    for (const s of meeting.segments) db.exec('INSERT INTO transcript_segments VALUES(?,?,?,?,?,?)', { bind: [s.id, meeting.id, s.start, s.end, s.text, s.final ? 1 : 0] });
    for (const e of meeting.events) {
      db.exec('INSERT INTO meeting_events VALUES(?,?,?,?)', { bind: [e.id, meeting.id, e.type, JSON.stringify(e)] });
      for (const related of e.relatedIds) db.exec('INSERT INTO event_relationships VALUES(?,?,?,?)', { bind: [meeting.id, related, e.id, 'discussion_developed'] });
      for (const sid of e.evidenceIds) db.exec('INSERT INTO source_references VALUES(?,?,?)', { bind: [e.id, meeting.id, sid] });
      if (e.type === 'action_item') db.exec('INSERT INTO action_items VALUES(?,?,?,?,?)', { bind: [e.id, meeting.id, e.owner ?? null, e.due ?? null, e.done ? 1 : 0] });
    }
    for (const b of meeting.blocks) db.exec('INSERT INTO note_blocks VALUES(?,?,?,?,?)', { bind: [b.id, meeting.id, b.revision, b.editedBy, JSON.stringify(b)] });
  });
}
export function loadState(db: Database) {
  return {
    meetings: db.selectObjects('SELECT json FROM meetings ORDER BY date DESC').map(r => meetingSchema.parse(JSON.parse(String(r.json)))) as Meeting[],
    settings: settingsSchema.parse(JSON.parse(String(db.selectValue('SELECT json FROM settings WHERE id=1') ?? '{}'))) as Settings,
    documents: db.selectObjects('SELECT json FROM documents ORDER BY name').map(r => JSON.parse(String(r.json))) as IndexedDocument[],
  };
}
export function saveSettings(db: Database, data: unknown) {
  const parsed = settingsSchema.parse(data);
  db.exec('INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json', { bind: [JSON.stringify(parsed)] });
}
/** Reimport timestamps/binary metadata do not invalidate unchanged extracted evidence. */
export function documentEvidenceChanged(db:Database,doc:IndexedDocument):boolean {
 const raw=db.selectValue('SELECT json FROM documents WHERE id=?',[doc.id]);if(!raw)return true;
 const previous=JSON.parse(String(raw)) as IndexedDocument;
 const evidence=(d:IndexedDocument)=>JSON.stringify([d.id,d.name,d.group,d.demo,d.chunks.map(c=>[c.id,c.documentId,c.name,c.location,c.group,c.demo,c.text])]);
 return evidence(previous)!==evidence(doc);
}
export function indexDocument(db: Database, doc: IndexedDocument) {
  db.transaction(() => writeDocument(db, doc));
}
function writeDocument(db: Database, doc: IndexedDocument) {
    db.exec('DELETE FROM document_chunks WHERE document_id=?', { bind: [doc.id] });
    db.exec('INSERT INTO documents VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,group_name=excluded.group_name,json=excluded.json', { bind: [doc.id, doc.name, doc.group, JSON.stringify(doc)] });
    for (const c of doc.chunks) db.exec('INSERT INTO document_chunks VALUES(?,?,?,?,?,?,?)', { bind: [c.id, c.documentId, c.name, c.location, c.text, c.group, c.demo ? 1 : 0] });
}
export function replaceGroup(db: Database, group: string, documents: IndexedDocument[]) {
  if (documents.some(d => d.group !== group)) throw new Error('Document is outside the selected source group');
  db.transaction(() => {
    db.exec('DELETE FROM document_chunks WHERE group_name=?', { bind: [group] });
    db.exec('DELETE FROM documents WHERE group_name=?', { bind: [group] });
    for (const doc of documents) writeDocument(db, doc);
  });
}
export function tokenizeQuery(query: string) {
  const stop = new Set(['the','a','an','my','find','report','tell','me','whether','did','we','what','was','were','is','are','and','in','by','to','of','for','it','from','how','our','you','can','please','with','on','have','has','had','this','that','do','does']);
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(t => !stop.has(t) && t.length > 1).slice(0, 12);
}
export function searchDocuments(db: Database, query: string, includeDemo = true): DocumentChunk[] {
  const words = tokenizeQuery(query);
  if (!words.length) return [];
  const match = words.map(w => `"${w.replaceAll('"','')}"*`).join(' OR ');
  const rows = db.selectObjects('SELECT * FROM document_chunks WHERE document_chunks MATCH ? AND (?=1 OR demo=0) ORDER BY rank LIMIT 8', [match, includeDemo ? 1 : 0] as BindingSpec);
  return rows.map(r => ({ id: String(r.id), documentId: String(r.document_id), name: String(r.name), location: String(r.location), text: String(r.text), group: String(r.group_name), demo: Number(r.demo) === 1 }));
}
export function revokeGroup(db: Database, group: string) {
  db.transaction(() => {
    db.exec('DELETE FROM document_chunks WHERE group_name=?', { bind: [group] });
    db.exec('DELETE FROM documents WHERE group_name=?', { bind: [group] });
  });
}
