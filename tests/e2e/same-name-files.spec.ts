import { expect, test } from '@playwright/test';

test('same-name files retain distinct searchable sources after reload and reimport', async ({ page }) => {
  await page.goto('/?demo=home');
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  const picker = page.locator('input[type=file][accept^=".pdf"]');
  const files = ['Alder milestone', 'Birch budget'].map(text => ({
    name: 'minutes.txt', mimeType: 'text/plain', buffer: Buffer.from(text),
  }));
  await picker.setInputFiles(files);
  await expect(page.locator('.import-status')).toContainText('2 files indexed');
  await page.reload();
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await picker.setInputFiles(files[1]);
  await expect(page.locator('.import-status')).toContainText('1 file indexed');
  const rows = page.locator('.source-row').filter({ hasText: 'minutes.txt' });
  await expect(rows).toHaveCount(2);
  const excerpts = [];
  for (const row of await rows.all()) {
    await row.click();
    excerpts.push(await page.getByLabel('Source excerpt').innerText());
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
  expect(excerpts.sort()).toEqual(['Alder milestone', 'Birch budget']);
});
