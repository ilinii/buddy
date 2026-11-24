import { expect, test } from '@playwright/test';

test('hide and reopen preserves an answer, its citations and the follow-up draft', async ({ page }) => {
  await page.goto('/?demo=home');
  await page.getByRole('button', { name: 'Take notes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Meeting notes editor' }).fill('The cedar invoice is due Monday.');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show assistant' }).click();
  const input = page.getByRole('textbox', { name: 'Ask Buddy' });
  await input.fill('When is the cedar invoice due?');
  await page.getByRole('button', { name: 'Send message' }).click();
  const citation = page.locator('.citations button').first();
  await expect(citation).toBeVisible();
  await input.fill('Who will pay it?');
  await page.getByRole('button', { name: 'Hide assistant' }).click();
  await expect(input).toHaveCount(0);
  await page.getByRole('button', { name: 'Show assistant' }).click();
  await expect(page.locator('.chat-message')).toHaveCount(2);
  await expect(citation).toBeVisible();
  await expect(input).toHaveValue('Who will pay it?');
  await page.getByRole('button', { name: 'Clear conversation' }).click();
  await expect(page.locator('.chat-message')).toHaveCount(0);
});
