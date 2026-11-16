import { invoke } from '@tauri-apps/api/core';
import type { DocumentChunk, IndexedDocument, Meeting, Settings } from '../meeting/model';

import { isNative } from '../platform';
export { isNative } from '../platform';
type State = { meetings: Meeting[]; settings: Settings; documents: IndexedDocument[] };
class StorageService {
  private worker?: Worker;
  private sequence = 0;
  private queue = Promise.resolve<unknown>(undefined);
  private pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
  private saves = new Map<string, { latest?: Meeting; running: Promise<void> }>();
  private rpc<T>(method: string, ...args: unknown[]): Promise<T> {
    const job = () => new Promise<T>((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
      this.worker!.postMessage({ id, method, args });
    });
    const next = this.queue.then(job, job);
    this.queue = next.catch(() => {});
    return next;
  }
  async init(): Promise<State> {
    this.worker = new Worker(new URL('./storage.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = async ({ data }: MessageEvent<{ id: number; result: unknown; error?: string; bytes?: Uint8Array;knowledgeRoots?:string[];clearKnowledge?:boolean }>) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) { pending.reject(new Error(data.error)); return; }
      let canonicalSaved=false;
      try {
        if (data.bytes) await invoke('save_database', { bytes: Array.from(data.bytes) });
        canonicalSaved=!!data.bytes;
        if(isNative()){if(data.clearKnowledge)await invoke('clear_knowledge_index');else if(data.knowledgeRoots?.length)await invoke('invalidate_knowledge_roots',{roots:data.knowledgeRoots});}
        pending.resolve(data.result);
      } catch (error) { pending.reject(new Error(canonicalSaved?`Data saved, but semantic index cleanup failed. Clear the semantic search cache in Settings before retrying. ${String(error)}`:`Desktop save failed: ${String(error)}`)); }
    };
    this.worker.onerror = () => {
      for (const p of this.pending.values()) p.reject(new Error('The local database worker stopped. Reload to recover saved data.'));
      this.pending.clear();
    };
    const native = isNative();
    const bytes = native ? new Uint8Array(await invoke<number[]>('load_database')) : undefined;
    return this.rpc('init', native, bytes);
  }
  load() { return this.rpc<State>('load'); }
  saveMeeting(meeting: Meeting): Promise<void> {
    const existing = this.saves.get(meeting.id);
    if (existing) { existing.latest = meeting; return existing.running; }
    if (this.saves.size >= 16) return Promise.reject(new Error('Too many meetings are waiting to save. Please wait and retry.'));
    const entry: { latest?: Meeting; running: Promise<void> } = { latest: meeting, running: Promise.resolve() };
    this.saves.set(meeting.id, entry);
    entry.running = Promise.resolve().then(async () => {
      try {
        while (entry.latest) { const latest = entry.latest; entry.latest = undefined; await this.rpc<void>('saveMeeting', latest); }
      } finally { this.saves.delete(meeting.id); }
    });
    return entry.running;
  }
  saveSettings(settings: Settings) { return this.rpc<void>('saveSettings', settings); }
  indexDocument(document: IndexedDocument) { return this.rpc<void>('indexDocument', document); }
  replaceGroup(group: string, documents: IndexedDocument[]) { return this.rpc<void>('replaceGroup', group, documents); }
  searchDocuments(query: string, includeDemo: boolean) { return this.rpc<DocumentChunk[]>('searchDocuments', query, includeDemo); }
  revokeGroup(group: string) { return this.rpc<void>('revokeGroup', group); }
  async deleteMeeting(id: string) { await this.saves.get(id)?.running; return this.rpc<void>('deleteMeeting', id); }
  deleteIndex() { return this.rpc<void>('deleteIndex'); }
  async clearAll() { await Promise.all([...this.saves.values()].map(e => e.running)); return this.rpc<void>('clearAll'); }
}
export const storage = new StorageService();
