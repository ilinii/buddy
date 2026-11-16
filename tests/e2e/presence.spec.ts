import { expect, test } from '@playwright/test';

for (const view of ['home', 'meeting']) {
test(`the ${view} matrix presence renders, animates, pauses and resumes`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/?demo=${view}`);
  const blob = page.locator(view === 'home' ? '.capture-presence .presence' : '.assistant-identity .presence');
  await expect(blob).toHaveAttribute('data-renderer', 'webgl');
  const surface = blob.locator('.presence-canvas');
  // Pixel comparisons verify actual rendered motion, not just a CSS class.
  const first = await surface.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(700);
  const second = await surface.screenshot({ animations: 'disabled' });
  expect(first.equals(second)).toBe(false);
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByRole('checkbox', { name: /Reduce ambient motion/ }).check();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await page.waitForTimeout(350);
  const still = await surface.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(450);
  const stillAgain = await surface.screenshot({ animations: 'disabled' });
  expect(still.equals(stillAgain)).toBe(true);
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByRole('checkbox', { name: /Reduce ambient motion/ }).uncheck();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.waitForTimeout(500);
  const resumed = await surface.screenshot({ animations: 'disabled' });
  expect(resumed.equals(still)).toBe(false);
  expect(errors).toEqual([]);
});
}

test('OS reduced motion leaves the matrix visible and still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo=meeting');
  const blob = page.locator('.assistant-identity .presence');
  await expect(blob).toHaveAttribute('data-renderer', 'webgl');
  await page.waitForTimeout(500);
  const first = await blob.screenshot();
  await page.waitForTimeout(500);
  expect(first.equals(await blob.screenshot())).toBe(true);
});

test('WebGL unavailability falls back to a visible CSS matrix', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...options: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return original.apply(this, [type, ...options] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto('/?demo=meeting');
  const blob = page.locator('.assistant-identity .presence');
  await expect(blob).toHaveAttribute('data-renderer', 'css');
  await expect(blob.locator('.presence-fallback')).toBeVisible();
  expect(await blob.locator('.presence-fallback').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await expect(page.getByRole('textbox', { name: 'At a glance editor' })).toBeVisible();
});

test('the meeting library and recording actions fit narrow widths', async ({ page }) => {
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?demo=home');
    await expect(page.getByRole('button', { name: 'Record meeting', exact: true })).toBeVisible();
    await expect(page.locator('.meeting-list')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Meetings', exact: true })).toBeVisible();
    await expect(page.locator('.meeting-library textarea')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const stage = await page.locator('.library-capture-actions').boundingBox();
    expect(stage && stage.x >= 0 && stage.x + stage.width <= width).toBe(true);
  }
});

test('take notes creates a meeting from the library', async ({ page }) => {
  await page.goto('/?demo=home');
  await page.getByRole('button', { name: 'Take notes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Meeting title', exact: true }).fill('Research workshop');
  await expect(page.getByRole('textbox', { name: 'Meeting title', exact: true })).toHaveValue('Research workshop');
  await expect(page.getByRole('textbox', { name: 'Meeting notes editor' })).toBeVisible();
});

test('record meeting opens microphone setup and requires consent', async ({ page }) => {
  await page.goto('/?demo=home');
  await page.getByRole('button', { name: 'Record meeting', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('New meeting');
  await expect(page.getByRole('button', { name: 'Start microphone recording' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start microphone recording' }).click();
  await expect(page.getByText('Recording microphone · no ASR installed')).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('.meeting-status')).toContainText('Meeting complete');
});

test('meeting library filters open actions and opens review notes', async ({ page }) => {
  await page.goto('/?demo=home');
  await expect(page.locator('.meeting-list .meeting-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'With open actions' }).click();
  await expect(page.locator('.meeting-list .meeting-row')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search meetings' }).fill('not-a-real-meeting');
  await expect(page.getByRole('heading', { name: 'No matching meetings' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search meetings' }).fill('');
  await page.getByRole('button', { name: 'Open Q2 growth & priorities', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'At a glance editor' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Buddy assistant' })).toBeVisible();
});
