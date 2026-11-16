import {test,expect} from '@playwright/test';
test('welcome glyph letters move and honor pause and OS reduced motion',async({page})=>{
 await page.goto('/');const glyph=page.locator('.welcome-glyph canvas');await expect(glyph).toBeVisible();
 const pixels=()=>glyph.evaluate(canvas=>{const data=(canvas as HTMLCanvasElement).toDataURL();let hash=2166136261;for(let i=0;i<data.length;i+=127)hash=Math.imul(hash^data.charCodeAt(i),16777619);return hash>>>0;});
 const initial=await pixels();await expect.poll(pixels).not.toBe(initial);
 await page.getByRole('button',{name:'Pause ambient animation',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-reduced-motion','true');await page.waitForTimeout(180);const paused=await pixels();await page.waitForTimeout(200);expect(await pixels()).toBe(paused);
 await page.getByRole('button',{name:'Resume ambient animation',exact:true}).click();await expect.poll(pixels).not.toBe(paused);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.welcome-wave canvas')).toHaveAttribute('data-static','true');await page.waitForTimeout(180);const reduced=await pixels();await page.waitForTimeout(200);expect(await pixels()).toBe(reduced);
});
for(const width of [1440,1024,768,390,320])test(`first-run entry is readable and keyboard-safe at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/');
 const entry=page.getByRole('main',{name:'Welcome to Buddy'});await expect(entry.getByRole('heading',{name:'Stay with the conversation.'})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toHaveCount(0);
 await expect(page.getByLabel('Sample meeting preview')).toContainText('SAMPLE MEETING');
 await expect(page.locator('.welcome-product')).toHaveCSS('filter','blur(0px)');await expect(page.locator('.welcome-glyph canvas')).toBeVisible();await page.screenshot({path:`output/welcome-intro-${width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Set up Buddy',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Your meetings. Your call.'})).toBeFocused();await expect(entry).toContainText('Cloud transcription is optional');
 await page.screenshot({path:`output/welcome-privacy-${width}.png`});await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('button',{name:'Set up Buddy',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Set up Buddy',exact:true}).click();await page.getByRole('button',{name:'Open my workspace',exact:true}).click();await expect(entry).toHaveCount(0);await expect(page.getByRole('heading',{name:'Meetings',exact:true})).toBeVisible();await page.reload();await expect(entry).toHaveCount(0);
});
