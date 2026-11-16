import type { Answer, DocumentChunk, Meeting } from '../meeting/model';
import {buildCorpus,keywordEvidence,type RetrievalOptions} from './retrieval';

export interface AssistantProvider {
  answer(question: string, meetings: Meeting[], currentId: string, documents: DocumentChunk[], signal: AbortSignal, options?:RetrievalOptions): Promise<Answer>;
}
const stopIfAborted = (signal: AbortSignal) => { if (signal.aborted) throw new DOMException('Request cancelled', 'AbortError'); };
export class OfflineProvider implements AssistantProvider {
  async answer(question: string, meetings: Meeting[], currentId: string, documents: DocumentChunk[], signal: AbortSignal, options:RetrievalOptions={}): Promise<Answer> {
    stopIfAborted(signal);
    const corpus=await buildCorpus(question,meetings,currentId,documents,options);
    const evidence=keywordEvidence(corpus,question);
    stopIfAborted(signal);
    return {
      text:evidence.length
        ?`${evidence.map(c=>`“${c.text}”`).join('\n\n')}\n\nOffline mode returns source excerpts. It does not infer facts beyond these sources.`
        :'I couldn’t find supporting evidence in the selected meeting or files. Broaden the source scope or try a specific topic.',
      citations:evidence.map(c=>c.citation),provider:'offline',details:'Local keyword search',
    };
  }
}
export function providerError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Request cancelled.';
  const text = error instanceof Error ? error.message : String(error);
  if (/429|quota|rate limit/i.test(text)) return 'The provider quota is exhausted. Your meeting remains available; switch to offline mode or retry later.';
  if (/401|403|api.key/i.test(text)) return 'The provider rejected the API key. Check it in Settings. Offline mode is still available.';
  return `Assistant unavailable: ${text}`;
}
