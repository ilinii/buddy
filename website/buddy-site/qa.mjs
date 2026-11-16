import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
await mkdir(new URL('shots/',import.meta.url),{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const failures=[],consoleErrors=[];
try{
  for(const width of [1440,1024,820,768,390,320]){
    const page=await browser.newPage({viewport:{width,height:width<600?844:900},deviceScaleFactor:1});
    page.on('pageerror',e=>consoleErrors.push(e.message));
    await page.goto('http://127.0.0.1:1430');await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>document.documentElement.style.scrollBehavior='auto');
    await page.locator('.hero-product').waitFor();await page.waitForTimeout(1100);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);
    const hero=await page.locator('.hero').boundingBox(),product=await page.locator('.hero-product').boundingBox();
    if(product.y+product.height>hero.y+hero.height)failures.push(`Product clipped at ${width}`);
    assert(await page.locator('#ascii-hands').evaluate(c=>{const ctx=c.getContext('2d');const d=ctx.getImageData(0,0,c.width,c.height).data;return d.some((n,i)=>i%4===3&&n>0);}),`Blank ASCII hands at ${width}`);
    await page.screenshot({path:`${root}/shots/hero-${width}.png`});
    if(width===1440||width===390)await page.screenshot({path:`${root}/shots/full-${width}.png`,fullPage:true});
    if(width===1440){
      for(const id of ['product','context','privacy','questions']){await page.locator(`#${id}`).scrollIntoViewIfNeeded();await page.waitForTimeout(150);await page.screenshot({path:`${root}/shots/${id}-${width}.png`});}
      await page.locator('[data-step=review]').click();assert((await page.locator('#workflow-screen').textContent()).includes('A smaller, clearer launch.'));
      await page.locator('#workflow-screen [data-source=meeting]').first().click();await page.locator('#source-dialog[open]').waitFor();assert((await page.locator('#source-quote').textContent()).includes('welcome flow'));await page.keyboard.press('Escape');
      await page.locator('[data-step=ask]').focus();await page.keyboard.press('Home');assert.equal(await page.locator('[data-step=record]').getAttribute('aria-selected'),'true');
      await page.locator('[data-question=next]').click();await page.waitForFunction(()=>document.querySelector('#sample-answer').textContent.includes('Test the new welcome'));
      await page.locator('[data-question=test]').click();await page.waitForFunction(()=>document.querySelector('#sample-answer').textContent.includes('internal team'));
      await page.locator('#answer-sources button').first().click();assert.equal(await page.locator('#source-title').textContent(),'Launch brief');await page.locator('.close-source').click();
      await page.locator('#setup-managed').click();assert.equal(await page.locator('#setup-managed').getAttribute('aria-selected'),'true');assert((await page.locator('#setup-panel').textContent()).includes('NOT YET AVAILABLE'));assert.equal(await page.locator('#setup-panel').getAttribute('aria-labelledby'),'setup-managed');
      await page.keyboard.press('Home');assert.equal(await page.locator('#setup-keys').getAttribute('aria-selected'),'true');assert((await page.locator('#setup-panel').textContent()).includes('credential store'));assert((await page.locator('.setup-open-source').textContent()).includes('planned'));
      await page.locator('.faq-list summary').first().click();assert(await page.locator('.faq-list details').first().getAttribute('open')!==null);
      await page.locator('#motion-toggle').click();assert.equal(await page.locator('html').getAttribute('data-motion'),'paused');
      await page.locator('#replay-sample').click();await page.waitForFunction(()=>!document.querySelector('#replay-sample').disabled);
      await page.goto('http://127.0.0.1:1430/app/?demo=home');await page.getByRole('heading',{name:'Meetings',exact:true}).waitFor({timeout:25000});
      await page.getByRole('button',{name:'Take notes',exact:true}).click();const editor=page.getByRole('textbox',{name:'Meeting notes editor',exact:true});await editor.fill('Browser demo is functional.');assert((await editor.textContent()).includes('functional'));
      await page.goto('http://127.0.0.1:1430/privacy.html');assert.equal(await page.title(),'Privacy — Buddy');
    }
    if(width===390){await page.locator('#setup-managed').click();assert((await page.locator('#setup-panel').textContent()).includes('NOT YET AVAILABLE'));await page.locator('#setup-panel').screenshot({path:`${root}/shots/setup-managed-phone.png`});await page.locator('#setup-keys').click();await page.locator('.menu-toggle').click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='paused');}
    await page.close();
  }
  assert.equal(consoleErrors.length,0,consoleErrors.join('\n'));assert.equal(failures.length,0,failures.join('\n'));
  console.log(JSON.stringify({status:'passed',widths:[1440,1024,820,768,390,320],checks:['no overflow','ASCII rendered','interactive workflow','keyboard tabs','source dialogs','sample questions','setup tabs and planned labels','FAQ','pause/replay','functional app demo','privacy page','phone menu','reduced motion']},null,2));
}finally{await browser.close();}
