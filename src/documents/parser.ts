import type { DocumentChunk, IndexedDocument } from '../meeting/model';

const MAX_FILE = 20 * 1024 * 1024;
const MAX_TEXT = 1_000_000;
const MAX_CHUNKS = 1500;
export const supportedExtensions = ['txt', 'md', 'csv', 'pdf', 'docx', 'xlsx'];
export function safeRelativePath(path: string) {
  const normalized = path.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some(p => p === '..' || p === '.')) throw new Error('File path is outside the selected folder');
  return normalized;
}
function readCsv(text: string, accept: (cells: string[], rowNumber: number) => void) {
  let rowNumber = 1;
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(v => v.length)) accept(row, rowNumber);
      rowNumber++;
      row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  row.push(cell);
  if (row.some(v => v.length)) accept(row, rowNumber);
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  readCsv(text, cells => rows.push(cells));
  return rows;
}
export function columnName(index: number): string {
  let result = '', n = index + 1;
  while (n) { n--; result = String.fromCharCode(65 + n % 26) + result; n = Math.floor(n / 26); }
  return result;
}
export async function parseDocument(file: File, group: string, demo = false): Promise<IndexedDocument> {
  if (file.size > MAX_FILE) throw new Error(`${file.name}: files must be under 20 MB`);
  const ext = file.name.split('.').pop()!.toLowerCase();
  if (!supportedExtensions.includes(ext)) throw new Error(`${file.name}: unsupported format`);
  const path = safeRelativePath(file.webkitRelativePath || file.name);
  const id = `${group}:${path}`;
  const chunks: DocumentChunk[] = [];
  let totalText = 0;
  const add = (text: string, location: string) => {
    if (!text.trim()) return;
    totalText += text.length;
    if (totalText > MAX_TEXT || chunks.length >= MAX_CHUNKS) throw new Error(`${file.name}: extracted content exceeds the safe indexing limit`);
    chunks.push({ id: `${id}:${chunks.length}`, documentId: id, name: file.name, location, text, group, demo });
  };
  if (ext === 'txt' || ext === 'md') {
    const lines = (await file.text()).split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 12) add(lines.slice(i, i + 12).join('\n'), `Lines ${i + 1}–${Math.min(i + 12, lines.length)}`);
  } else if (ext === 'csv') {
    let header: string[] | undefined;
    readCsv(await file.text(), (row, rowNumber) => {
      header ??= row;
      const values = row.map((value, column) => `${columnName(column)}${rowNumber} (${header?.[column] ?? 'column'}): ${value}`);
      add(values.join(' · '), `CSV!A${rowNumber}:${columnName(row.length - 1)}${rowNumber}`);
    });
  } else if (ext === 'xlsx') {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file);
    for (const { sheet, data: rows } of sheets) {
      rows.forEach((row, ri) => add(row.map((cell, ci) => `${columnName(ci)}${ri + 1}: ${cell instanceof Date ? cell.toISOString() : String(cell ?? '')}`).join(' · '), `${sheet}!A${ri + 1}:${columnName(Math.max(row.length - 1, 0))}${ri + 1}`));
    }
  } else if (ext === 'docx') {
    const { default: mammoth } = await import('mammoth/mammoth.browser');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const paras = result.value.split(/\n\n+/);
    paras.forEach((p, i) => add(p, `Paragraph ${i + 1} (extracted text)`));
  } else if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    // We already run in a disposable extraction worker. Load PDF.js's handler
    // there and let its loopback transport execute locally; nested workers can
    // stall in packaged WebViews. Its auxiliary "ready" message is deliberately
    // outside our tagged document-result protocol and must be ignored upstream.
    if (typeof window === 'undefined') await import(/* @vite-ignore */ workerUrl);
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 200) throw new Error('PDF must have 200 pages or fewer');
      for (let page = 1; page <= pdf.numPages; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
        for (let i = 0; i < text.length; i += 1800) add(text.slice(i, i + 1800), `Page ${page}`);
      }
    } finally { await task.destroy(); }
  }
  if (!chunks.length) throw new Error(`${file.name}: no readable text found. Scanned PDFs require OCR, which is not installed.`);
  return { id, name: file.name, type: ext, size: file.size, indexedAt: new Date().toISOString(), group, demo, chunks };
}
