import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`meeting moments scroll, inspect evidence and collapse at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?demo=meeting');
    const roadmap = page.getByRole('region', { name: 'Conversation roadmap', exact: true });
    const track = roadmap.locator('.timeline-track');
    await expect(roadmap.locator('.timeline-node')).toHaveCount(9);
    await expect(roadmap.getByRole('button', { name: 'Previous moments' })).toBeDisabled();
    const next = roadmap.getByRole('button', { name: 'Next moments' });
    await next.click();
    await expect.poll(() => track.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect(roadmap.getByRole('button', { name: 'Previous moments' })).toBeEnabled();
    const decision = roadmap.locator('.timeline-node.event-decision');
    await decision.click();
    await expect(page.getByRole('dialog')).toContainText('Original transcript');
    await expect(page.getByRole('dialog')).toContainText('Developed from');
    await page.keyboard.press('Escape');
    await expect(decision).toBeFocused();
    const toggle = roadmap.getByRole('button', { name: /Conversation roadmap/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(track).toHaveCount(0);
    await toggle.click();
    await expect(roadmap.locator('.timeline-node')).toHaveCount(9);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('tab', { name: 'Roadmap', exact: true }).click();
    await expect(page.locator('.roadmap-expanded .moment-description').first()).toBeVisible();
  });
}

test('matrix dispersion stays still under reduced motion and keyboard opens navigator', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo=home');
  const matrix=page.getByRole('button',{name:'Open meeting navigator',exact:true});
  await expect(matrix).toHaveAttribute('data-renderer','webgl');
  const canvas=matrix.locator('canvas');
  const before=await canvas.screenshot();
  await matrix.focus();
  await expect(matrix).toHaveAttribute('data-dispersed','true');
  await page.waitForTimeout(150);
  const after=await canvas.screenshot();
  expect(before.equals(after)).toBe(false);
  await page.waitForTimeout(250);
  expect(after.equals(await canvas.screenshot())).toBe(true);
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog', {name:'Meeting navigator'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(matrix).toBeFocused();
  await page.getByRole('heading',{name:'Meetings',exact:true}).click();
  await page.mouse.move(0,0);
  await expect(matrix).toHaveAttribute('data-dispersed','false');
});

test('touch opens and dismisses the navigator without sticky dispersion', async ({ browser }) => {
  const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844},reducedMotion:'reduce'});
  try {
    const page=await context.newPage(); await page.goto('http://127.0.0.1:1420/?demo=home');
    const matrix=page.getByRole('button',{name:'Open meeting navigator',exact:true});
    await matrix.tap();
    await expect(page.getByRole('dialog', {name:'Meeting navigator'})).toBeVisible();
    await page.getByRole('button', {name:'Close dialog',exact:true}).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(matrix).toHaveAttribute('data-dispersed','false');
  } finally { await context.close(); }
});
