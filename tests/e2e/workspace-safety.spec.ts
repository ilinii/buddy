import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page) {
  await page.goto('/?demo=home');
  await expect(page.getByRole('button', { name: 'Take notes', exact: true })).toBeVisible();
}
async function note(page: Page, title: string) {
  await page.getByRole('button', { name: 'Take notes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Meeting title', exact: true }).fill(title);
  await page.getByRole('textbox', { name: 'Meeting notes editor', exact: true }).fill('Fictional audit notes.');
  await expect(page.getByText(/^(Saved locally|Demo changes only)$/)).toBeVisible();
}
async function deleteWorkspace(page: Page) {
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Privacy', exact: true }).click();
  await page.getByRole('button', { name: 'Delete all workspace data', exact: true }).click();
  await page.getByRole('button', { name: 'Delete all data', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('a second tab is blocked before restoration; closing the owner allows safe reload', async ({ page, context }) => {
  await enter(page);
  const other = await context.newPage(); await other.goto('/?demo=home');
  await expect(other.getByRole('alert')).toContainText('already open in another tab');
  await expect(other.getByRole('button', { name: 'Take notes', exact: true })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await other.setViewportSize({ width, height: 900 });
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await other.screenshot({ path: `output/workspace-locked-${width}.png` });
  }
  await note(page, 'Preserve tab A');
  await page.close();
  await other.getByRole('button', { name: 'Reload workspace', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Open Preserve tab A', exact: true })).toBeVisible();
  await note(other, 'Safe tab B');
  await other.reload();
  await expect(other.getByRole('button', { name: 'Open Preserve tab A', exact: true })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Open Safe tab B', exact: true })).toBeVisible();
});
test('a blocked tab cannot restore records deleted by the workspace owner', async ({ page, context }) => {
  await enter(page); await note(page, 'Delete this note');
  const other = await context.newPage(); await other.goto('/?demo=home');
  await expect(other.getByRole('alert')).toContainText('already open in another tab');
  await deleteWorkspace(page); await page.close(); await other.reload();
  await expect(other.getByRole('button', { name: 'Take notes', exact: true })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Open Delete this note', exact: true })).toHaveCount(0);
});
test('the ephemeral showcase works alongside a locked persistent workspace', async ({ page, context }) => {
  await enter(page); await note(page, 'Private workspace note');
  const showcase = await context.newPage(); await showcase.goto('/?demo=home&showcase=1');
  await expect(showcase.getByRole('button', { name: 'Take notes', exact: true })).toBeVisible();
  await expect(showcase.getByRole('button', { name: 'Open Private workspace note', exact: true })).toHaveCount(0);
  await note(showcase, 'Ephemeral note'); await showcase.close(); await page.reload();
  await expect(page.getByRole('button', { name: 'Open Private workspace note', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Ephemeral note', exact: true })).toHaveCount(0);
});

for (const width of [1440, 390]) test(`deletion cancels pending extraction and the rest of its batch at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const state = { pending: false, created: 0, terminated: 0, release: () => {} };
    Object.assign(window, { importAudit: state });
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('parser.worker')) return;
        Object.defineProperty(this, 'onmessage', { set: (callback: (event: MessageEvent) => void) => {
          this.addEventListener('message', event => {
            if (event.data?.type === 'document-result' && !event.data.document?.demo) {
              state.pending = true; state.release = () => callback(event);
            } else callback(event);
          });
        } });
        const post = this.postMessage.bind(this);
        this.postMessage = (message: {demo?: boolean}, options?: StructuredSerializeOptions | Transferable[]) => {
          if (!message.demo) state.created++;
          if (Array.isArray(options)) post(message, options); else post(message, options);
        };
        const terminate = this.terminate.bind(this);
        this.terminate = () => { state.terminated++; terminate(); };
      }
    };
  });
  await enter(page); await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await page.locator('input[type=file][accept=".pdf,.docx,.xlsx,.csv,.txt,.md"]').setInputFiles([
    { name: 'pending.txt', mimeType: 'text/plain', buffer: Buffer.from('Fictional private document.') },
    { name: 'next.txt', mimeType: 'text/plain', buffer: Buffer.from('Must not import after deletion.') },
  ]);
  await page.waitForFunction(() => (window as unknown as {importAudit:{pending:boolean}}).importAudit.pending);
  // Mobile uses the phone navigation label.
  if (width < 600) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Privacy', exact: true }).click();
    await page.getByRole('button', { name: 'Delete all workspace data', exact: true }).click();
    await page.getByRole('button', { name: 'Delete all data', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } else await deleteWorkspace(page);
  await page.evaluate(() => (window as unknown as {importAudit:{release():void}}).importAudit.release());
  const batch = await page.evaluate(() => (window as unknown as {importAudit:{created:number;terminated:number}}).importAudit);
  expect(batch.created).toBe(1); expect(batch.terminated).toBeGreaterThan(0);
  await page.reload(); await expect(page.getByRole('button', { name: 'Take notes', exact: true })).toBeVisible();
  const docs = await page.evaluate(async () => { const path = '/src/storage/service.ts'; return (await (await import(path)).storage.load()).documents; });
  expect(docs).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `output/workspace-deletion-${width}.png` });
});
