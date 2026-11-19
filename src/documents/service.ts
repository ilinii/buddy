import type { IndexedDocument } from '../meeting/model';
export function extractDocument(file: File, group: string, demo = false, signal?: AbortSignal): Promise<IndexedDocument> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Import cancelled', 'AbortError')); return; }
    const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const timer = setTimeout(() => { cleanup(); reject(new Error(`${file.name}: indexing timed out after 30 seconds`)); }, 30_000);
    const cancel = () => { cleanup(); reject(new DOMException('Import cancelled', 'AbortError')); };
    const cleanup = () => { settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker.terminate(); };
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ type?:string;document?: IndexedDocument; error?: string }>) => {
      if(settled || data?.type!=='document-result')return;
      cleanup();
      if (data.document) resolve(data.document); else reject(new Error(data.error));
    };
    worker.onerror = () => { if (settled) return; cleanup(); reject(new Error(`${file.name}: extraction worker failed`)); };
    worker.postMessage({ file, group, demo });
  });
}
