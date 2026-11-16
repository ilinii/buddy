import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => { const found: string[] = []; errors.set(page, found); page.on('pageerror', e => found.push(e.message)); });
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });
async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up Buddy' }).click();
  await page.getByRole('button', { name: 'Open my workspace' }).click();
  await expect(page.getByRole('region', { name: 'Saved meetings', exact: true })).toBeVisible();
}

async function sourceMeeting(page:Page){
  await page.getByRole('button',{name:'Take notes',exact:true}).click();await page.getByRole('textbox',{name:'Meeting title',exact:true}).fill('Document review');await page.getByRole('button',{name:'Show assistant',exact:true}).click();
}

test('onboarding, notes, evidence, assistant, actions, exports and reopening', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Open sample meeting' }).click();
  const editor = page.getByRole('textbox', { name: 'At a glance editor' });
  await editor.fill('My personal note survives a reload.');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'What did we decide?' }).click();
  await expect(page.locator('.chat-assistant .message-text')).toContainText('We have decided');
  await page.locator('.chat-assistant .citations button').first().click();
  await expect(page.getByRole('dialog')).toContainText('Original transcript');
  await page.getByRole('button', { name: 'Go to transcript' }).click();
  await expect(page.getByRole('tab', { name: /Transcript/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Notes', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Complete Share the new flow' }).click();
  await expect(page.getByRole('checkbox', { name: 'Reopen Share the new flow' })).toBeChecked();
  await page.getByRole('button', { name: 'Export meeting', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown Readable notes and transcript' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.md$/);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Open sample meeting' }).click();
  await expect(editor).toContainText('My personal note survives a reload.');
  await expect(page.getByRole('checkbox', { name: 'Reopen Share the new flow' })).toBeChecked();
});

test('actual document import, FTS search, original download and revocation', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await page.locator('input[type=file][accept=".pdf,.docx,.xlsx,.csv,.txt,.md"]').setInputFiles({ name: 'private-plan.md', mimeType: 'text/markdown', buffer: Buffer.from('The Helios launch deadline is 24 November. Owner: research team.') });
  await expect(page.getByText('1 file indexed locally.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'My meetings', exact: true }).click();
  await sourceMeeting(page);
  await page.getByRole('textbox', { name: 'Ask Buddy', exact: true }).fill('Find the Helios launch deadline');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.chat-assistant .message-text')).toContainText('24 November');
  await page.locator('.citations button').filter({ hasText: 'private-plan.md' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Lines 1');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download selected original' }).click();
  expect((await download).suggestedFilename()).toBe('private-plan.md');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await page.locator('.source-groups section').filter({ hasText: 'Selected files' }).getByRole('button', { name: 'Remove source' }).click();
  await expect(page.getByText('private-plan.md', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'My meetings', exact: true }).click();
  await page.getByRole('button',{name:'Open Document review',exact:true}).click();
  await page.getByRole('textbox', { name: 'Ask Buddy', exact: true }).fill('Helios');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.chat-assistant .message-text')).toContainText('couldn’t find supporting evidence');
});

test('demo replay continues while querying and preserves manual edits', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'New meeting', exact: false }).first().click();
  await page.getByRole('textbox', { name: 'Meeting title', exact: true }).fill('Replay integration');
  await page.getByRole('button', { name: 'Replay a demo meeting', exact: false }).click();
  await page.getByRole('button', { name: 'Start demo replay' }).click();
  await expect(page.getByRole('textbox', { name: 'Q2 performance editor' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('textbox', { name: 'Q2 performance editor' }).fill('These are my checked numbers.');
  await page.getByRole('button', { name: 'Show assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Find the Q2 revenue report' }).click();
  await expect(page.locator('.chat-assistant .message-text')).toContainText('1240000');
  await expect(page.getByRole('textbox', { name: 'Growth strategy editor' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('textbox', { name: 'Q2 performance editor' })).toContainText('my checked numbers');
  await page.getByRole('button', { name: 'Pause meeting' }).click();
  await expect(page.getByRole('button', { name: 'Resume meeting' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('.meeting-status')).toContainText('Meeting complete');
  await page.reload();
  await page.getByRole('button', { name: 'Replay integration' }).first().click();
  await expect(page.getByRole('textbox', { name: 'Q2 performance editor' })).toContainText('my checked numbers');
});

test('real MediaRecorder controls with an explicitly fake browser audio device', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'New meeting', exact: false }).first().click();
  await page.getByRole('button', { name: 'Record my microphone', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Start microphone recording' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start microphone recording' }).click();
  await expect(page.getByText('Recording microphone · no ASR installed')).toBeVisible();
  await page.getByRole('button', { name: 'Pause meeting' }).click();
  await expect(page.getByRole('button', { name: 'Resume meeting' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume meeting' }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('.meeting-status')).toContainText('Meeting complete');
  await page.getByRole('tab', { name: /Transcript/ }).click();
  await expect(page.getByRole('heading', { name: 'No transcript yet' })).toBeVisible();
});

test('keyboard-safe settings and graph navigation', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByRole('button', { name: 'AI provider', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Browser preview never stores API keys');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open sample meeting' }).click();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(9);
  await page.locator('.react-flow__node').first().focus();
  expect(await page.locator('.react-flow__node').first().evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid');
  await page.locator('.react-flow__node').filter({ hasText: 'Prioritize onboarding' }).click();
  await expect(page.getByRole('dialog')).toContainText('Developed from');
});

test('PDF, DOCX and XLSX extraction preserves page, paragraph, cached values and sparse cells', async ({ page }) => {
  await enter(page);
  const pdfDiagnostic = await page.evaluate(async () => {
    try {
      const modulePath: string = '/src/documents/service.ts';
      const { extractDocument:parseDocument } = await import(modulePath);
      const response = await fetch('/tests/fixtures/Q2-report.pdf');
      const document = await parseDocument(new File([await response.blob()], 'Q2-report.pdf'), 'Diagnostic');
      return { ok: document.chunks.length > 0 };
    } catch (e) { return { error: String(e), stack: e instanceof Error ? e.stack : undefined }; }
  });
  expect(pdfDiagnostic).toEqual({ ok: true });
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await page.locator('input[type=file][accept=".pdf,.docx,.xlsx,.csv,.txt,.md"]').setInputFiles([
    path.resolve('tests/fixtures/Q2-report.pdf'), path.resolve('tests/fixtures/Q2-report.docx'), path.resolve('tests/fixtures/Q2-finance.xlsx'),
  ]);
  await expect(page.locator('.import-status')).toContainText('files indexed locally.', { timeout: 20000 });
  expect(await page.locator('.global-error').allTextContents()).toEqual([]);
  await expect(page.getByText('3 files indexed locally.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'My meetings', exact: true }).click();
  await sourceMeeting(page);
  await page.getByRole('textbox', { name: 'Ask Buddy', exact: true }).fill('Orion');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.chat-assistant .message-text')).toContainText('1240000');
  await expect(page.locator('.citations')).toContainText('Page 1');
  await expect(page.locator('.citations')).toContainText('Paragraph 2');
  await expect(page.locator('.citations')).toContainText('Notes!A3:B3');
  await page.getByRole('textbox', { name: 'Ask Buddy', exact: true }).fill('Find Total');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.chat-assistant').last()).toContainText('C5: 1240000');
  await expect(page.locator('.chat-assistant').last().locator('.citations')).toContainText('Revenue!A5:C5');
});

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`responsive workspace at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
    await page.goto('/?demo=meeting');
    await expect(page.getByRole('textbox', { name: 'Meeting title', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('tab', { name: /Transcript/ }).click();
    await expect(page.getByRole('heading', { name: 'No transcript yet' })).toHaveCount(0);
    await expect(page.locator('.transcript-segment')).toHaveCount(8);
    if (width < 981) {
      await page.getByRole('button', { name: 'Show assistant' }).click();
      await expect(page.getByRole('textbox', { name: 'Ask Buddy', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Hide assistant' }).click();
    }
  });
}
