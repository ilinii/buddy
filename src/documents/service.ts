import type { IndexedDocument } from '../meeting/model';
export function extractDocument(file: File, group: string, demo = false): Promise<IndexedDocument> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error(`${file.name}: indexing timed out after 30 seconds`)); }, 30_000);
    const cleanup = () => { clearTimeout(timer); worker.terminate(); };
    worker.onmessage = ({ data }: MessageEvent<{ type?:string;document?: IndexedDocument; error?: string }>) => {
      if(data?.type!=='document-result')return;
      cleanup();
      if (data.document) resolve(data.document); else reject(new Error(data.error));
    };
    worker.onerror = () => { cleanup(); reject(new Error(`${file.name}: extraction worker failed`)); };
    worker.postMessage({ file, group, demo });
  });
}
