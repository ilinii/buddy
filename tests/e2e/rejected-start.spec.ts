import { expect, test } from '@playwright/test';
import { nativeTransport } from './support/native-transport';

test('two rejected recording starts leave no empty meetings after reload', async ({ page }) => {
  await nativeTransport(page);
  await page.goto('/?demo=home');
  await page.getByRole('button', { name: 'Record meeting', exact: true }).click();
  await page.getByRole('textbox', { name: 'Meeting title' }).fill('Unavailable input');
  await page.getByRole('checkbox', { name: 'I have informed participants and have permission to record.' }).check();
  await page.evaluate(() => { window.engineMock.startError = true; });
  const start = page.getByRole('button', { name: 'Start recording', exact: true });
  for (let count = 1; count <= 2; count++) {
    await start.click();
    await expect.poll(() => page.evaluate(() => window.engineMock.calls.filter(call => call === 'engine_start').length)).toBe(count);
    await expect(page.getByRole('alert')).toContainText('Input device is unavailable');
    await expect(start).toBeEnabled();
  }
  await page.reload();
  await expect(page.getByRole('button', { name: 'Take notes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Unavailable input' })).toHaveCount(0);
  await expect(page.locator('.meeting-list .meeting-row')).toHaveCount(2);
});
