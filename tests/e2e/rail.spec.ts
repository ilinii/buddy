import { expect, test } from '@playwright/test';
test('glass rail exposes labels on keyboard focus', async ({ page }) => {
  await page.goto('/?demo=home');
  const knowledge=page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Knowledge',exact:true});
  await knowledge.focus();
  await expect(knowledge.locator('.rail-tooltip')).toHaveCSS('opacity','1');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Knowledge',exact:true})).toBeVisible();
});
for(const width of [390,320]) {
  test(`phone bottom bar navigates at ${width}px`, async ({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto('/?demo=home');
    const nav=page.getByRole('navigation',{name:'iPhone navigation'});
    await nav.getByRole('button',{name:'Knowledge',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Knowledge',exact:true})).toBeVisible();
    await expect(nav.getByRole('button',{name:'Knowledge',exact:true})).toHaveAttribute('aria-current','page');
    await nav.getByRole('button',{name:'Meetings',exact:true}).click();
    await expect(page.getByRole('region',{name:'Saved meetings',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
