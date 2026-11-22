import { expect, it } from 'vitest';
import { parseDocument } from '../../src/documents/parser';

it('keeps CSV record numbers across blank rows and quoted multiline cells', async () => {
  const file = new File(['\r\nItem,Total\r\n,\r\n"Travel\r\nticket",85\r\nMeals,20\r\n'], 'budget.csv');
  const doc = await parseDocument(file, 'Selected files');
  expect(doc.chunks.map(chunk => chunk.location)).toEqual(['CSV!A2:B2', 'CSV!A4:B4', 'CSV!A5:B5']);
  expect(doc.chunks[1].text).toContain('B4 (Total): 85');
});
