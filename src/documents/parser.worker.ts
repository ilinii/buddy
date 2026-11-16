import { parseDocument } from './parser';
self.onmessage = async ({ data }: MessageEvent<{ file: File; group: string; demo: boolean }>) => {
  try { self.postMessage({ type:'document-result', document: await parseDocument(data.file, data.group, data.demo) }); }
  catch (e) { self.postMessage({ type:'document-result', error: e instanceof Error ? e.message||e.name : 'Document extraction failed' }); }
};
