import { expect, test } from '@playwright/test';

for (const mode of ['animated', 'unsupported', 'reduced'] as const) {
  test(`navigation preserves notes with ${mode} transitions`, async ({ page }) => {
    if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
    if (mode === 'unsupported') await page.addInitScript(() => { Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true }); });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?demo=home');
    await page.getByRole('button', { name: 'Open Q2 growth & priorities', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'At a glance editor', exact: true });
    await editor.fill(`Notes preserved through ${mode} navigation.`);
    await page.getByRole('button', { name: 'All meetings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Meetings', exact: true })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    // Dispatch two navigation events in one frame to cover interrupted transitions.
    await nav.getByRole('button', { name: 'Action items', exact: true }).evaluate(button => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const knowledge = Array.from(button.parentElement!.querySelectorAll('button')).find(item => item.textContent === 'Knowledge');
      knowledge?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(page.getByRole('heading', { name: 'Knowledge', exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'My meetings', exact: true }).click();
    await page.getByRole('button', { name: 'Open Q2 growth & priorities', exact: true }).click();
    await expect(editor).toContainText(`Notes preserved through ${mode} navigation.`);
    await page.getByRole('tab', { name: /Transcript/ }).click();
    await expect(page.locator('.transcript-segment')).toHaveCount(8);
    expect(errors).toEqual([]);
  });
}
