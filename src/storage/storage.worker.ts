import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import wasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url';
import { readBytes, writeBytes } from './idb';
import { acquireWorkspaceLock } from './workspace-lock';
import { documentEvidenceChanged,indexDocument, loadState, migrate, replaceGroup, revokeGroup, saveMeeting, saveSettings, searchDocuments } from './sqlite';
import type { IndexedDocument, Meeting } from '../meeting/model';

let sqlite: Sqlite3Static;
let db: Database;
let native = false;
let ephemeral = false;
let releaseWorkspace: (() => void) | undefined;
let queue = Promise.resolve();
self.onmessage = (message: MessageEvent<{ id: number; method: string; args: unknown[] }>) => {
  queue = queue.then(async () => {
    const { id, method, args } = message.data;
    try {
      let result: unknown;
      let mutated = false;
      let knowledgeRoots:string[]=[];let clearKnowledge=false;
      const groupRoots=(group:string)=>db.selectObjects('SELECT id FROM documents WHERE group_name=?',[group]).map(r=>`document:${String(r.id)}`);
      if (method === 'init') {
        native = Boolean(args[0]);
        ephemeral = !native && args[2] === true;
        if (!native && !ephemeral) releaseWorkspace = await acquireWorkspaceLock();
        // Emscripten accepts locateFile; the package's zero-argument TS declaration omits it.
        const initialize = sqlite3InitModule as unknown as (options: { locateFile(file: string): string; print(): void; printErr(): void }) => Promise<Sqlite3Static>;
        sqlite = await initialize({ locateFile: file => file.endsWith('.wasm') ? wasmUrl : file, print: () => {}, printErr: () => {} });
        db = new sqlite.oo1.DB('/buddy.sqlite3', 'c');
        const bytes = native ? (args[1] as Uint8Array | undefined) : ephemeral ? undefined : await readBytes();
        if (bytes?.length) {
          const ptr = sqlite.wasm.allocFromTypedArray(bytes);
          const code = sqlite.capi.sqlite3_deserialize(db.pointer!, 'main', ptr, bytes.length, bytes.length,
            sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE);
          if (code !== 0) { sqlite.wasm.dealloc(ptr); throw new Error('Could not restore the local database. Existing data has not been replaced.'); }
        }
        migrate(db);
        result = loadState(db);
       } else if (method === 'saveMeeting') {
        const next=args[0] as Meeting;const raw=db.selectValue('SELECT json FROM meetings WHERE id=?',[next.id]);
        if(raw){const old=JSON.parse(String(raw)) as Meeting;const revised=old.title!==next.title||old.date!==next.date||old.mode!==next.mode||old.segments.filter(s=>s.final).some(s=>!next.segments.some(n=>n.id===s.id&&n.final&&n.text===s.text&&n.start===s.start&&n.end===s.end&&n.channel===s.channel&&n.speaker===s.speaker))||old.blocks.some(b=>!next.blocks.some(n=>n.id===b.id&&n.revision===b.revision&&n.html===b.html&&n.title===b.title));if(revised)knowledgeRoots=[`meeting:${next.id}`];}
        saveMeeting(db,next);mutated=true;
      }
      else if (method === 'saveSettings') { saveSettings(db, args[0]); mutated = true; }
      else if (method === 'indexDocument') { knowledgeRoots=documentEvidenceChanged(db,args[0] as IndexedDocument)?[`document:${(args[0] as IndexedDocument).id}`]:[];indexDocument(db, args[0] as IndexedDocument); mutated = true; }
      else if (method === 'replaceGroup') { const incoming=args[1] as IndexedDocument[];const changed=incoming.filter(d=>documentEvidenceChanged(db,d)).map(d=>`document:${d.id}`);knowledgeRoots=[...groupRoots(String(args[0])).filter(root=>!incoming.some(d=>root===`document:${d.id}`)),...changed];replaceGroup(db, String(args[0]), args[1] as IndexedDocument[]); mutated = true; }
      else if (method === 'searchDocuments') result = searchDocuments(db, String(args[0]), Boolean(args[1]));
      else if (method === 'revokeGroup') { knowledgeRoots=groupRoots(String(args[0]));revokeGroup(db, String(args[0])); mutated = true; }
      else if (method === 'deleteMeeting') { knowledgeRoots=[`meeting:${String(args[0])}`];db.exec('DELETE FROM meetings WHERE id=?', { bind: [String(args[0])] }); mutated = true; }
      else if (method === 'deleteIndex') { clearKnowledge=true;db.exec('DELETE FROM document_chunks; DELETE FROM documents;'); mutated = true; }
      else if (method === 'clearAll') { clearKnowledge=true;db.exec('DELETE FROM meetings; DELETE FROM settings; DELETE FROM document_chunks; DELETE FROM documents;'); mutated = true; }
      else if (method === 'load') result = loadState(db);
      else throw new Error('Unknown storage operation');
      let bytes: Uint8Array | undefined;
      if (mutated && !ephemeral) {
        bytes = sqlite.capi.sqlite3_js_db_export(db.pointer!);
        if (!native) { await writeBytes(bytes); bytes = undefined; }
      }
      self.postMessage({ id, result, bytes,knowledgeRoots:[...new Set(knowledgeRoots)],clearKnowledge });
    } catch (error) {
      if (method === 'init') { releaseWorkspace?.(); releaseWorkspace = undefined; }
      self.postMessage({ id, error: error instanceof Error ? error.message : 'Local storage failed' });
    }
  });
};
