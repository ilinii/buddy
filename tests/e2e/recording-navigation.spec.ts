import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`return to the active recording from another meeting at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 840 });
    await page.goto('/?demo=home');
    await page.getByRole('button', { name: 'Take notes', exact: true }).click();
    await page.getByRole('textbox', { name: 'Meeting title' }).fill('Current recording');
    await page.getByRole('button', { name: 'Record in this note' }).click();
    await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'All meetings', exact: true }).click();
    await page.getByRole('button', { name: 'Open Q2 growth & priorities', exact: true }).click();
    const indicator = page.getByRole('button', { name: 'Recording in progress · Return to Current recording' });
    await expect(indicator).toBeInViewport();
    await indicator.click();
    await expect(page.getByRole('textbox', { name: 'Meeting title' })).toHaveValue('Current recording');
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await expect(page.locator('.meeting-status')).toHaveText('Note saved');
  });
}
