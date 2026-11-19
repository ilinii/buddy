import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import type { Answer, Citation, DocumentChunk, Meeting } from '../meeting/model';
import type { AssistantProvider } from './service';
import { isNative, storage } from '../storage/service';
import {buildCorpus,keywordEvidence,evidenceUnchanged,type RetrievalOptions} from './retrieval';

const responseSchema = z.object({ answer: z.string().max(16000), sourceIds: z.array(z.string()).max(20) });
export class GeminiProvider implements AssistantProvider {
  constructor(private model: string) {}
  async answer(question: string, meetings: Meeting[], currentId: string, documents: DocumentChunk[], signal: AbortSignal, options:RetrievalOptions={}): Promise<Answer> {
    if (!isNative()) throw new Error('Secure Gemini integration requires the desktop app. Use offline mode in browser preview.');
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const corpus=await buildCorpus(question,meetings,currentId,documents,options);
    const evidence=keywordEvidence(corpus,question,12);
    const citations: Citation[]=evidence.map(c=>c.citation);
    const sourceData=evidence.map(c=>({id:c.id,text:`${c.title} · ${c.location}\n${c.text}`}));
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const requestId = crypto.randomUUID();
    const cancel = () => { void invoke('cancel_gemini', { requestId }).catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const raw = await invoke<string>('ask_gemini', { requestId, model: this.model, question: question.slice(0, 2000), sources: sourceData });
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const response = responseSchema.parse(JSON.parse(raw));
      const latest=await storage.load();if(!await evidenceUnchanged(evidence,latest.meetings,latest.documents))throw Error('A source changed or was removed. Ask again using the current sources.');
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const valid = new Set(citations.map(c => c.id));
      if (!response.sourceIds.every(id => valid.has(id))) throw new Error('The provider returned an unknown citation. The answer was discarded.');
      if (response.sourceIds.length === 0) return { text: 'The provider did not supply supporting sources. I cannot verify its answer. Try offline search or a more specific question.', citations: [], provider: 'gemini' };
      return { text: `${response.answer}\n\nAI-generated interpretation. Check the linked excerpts.`, citations: citations.filter(c => response.sourceIds.includes(c.id)), provider: 'gemini' };
    } finally { signal.removeEventListener('abort', cancel); }
  }
}
