import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BUDDY_SITE_URL||'http://127.0.0.1:1430';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report=[];
try{
 for(const width of [1440,1024,820,768,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${new URL(r.url()).pathname}`);});
  await page.route('https://api.github.com/repos/ilinii/buddy',r=>r.fulfill({json:{stargazers_count:7},headers:{'Access-Control-Allow-Origin':'*'}}));
  await page.goto(base, {waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('.github-count').textContent==='7');
  assert.equal(await page.locator('#context').count(),0);
  assert.equal(await page.getByRole('link',{name:/Try your voice/i}).count(),0);
  assert.equal(await page.locator('#setup-managed').getAttribute('aria-selected'),'true');
  assert((await page.locator('#setup-panel').textContent()).includes('$8.90'));
  assert((await page.locator('#setup-panel').textContent()).includes('COMING SOON'));
  assert.equal(await page.locator('.hero-action').textContent(),'Download now ↓');assert.equal(await page.locator('.hero-action').getAttribute('href'),'/download/');assert.equal(await page.locator('#step-review').count(),0);assert.equal(await page.locator('[data-step]').count(),2);assert.equal(await page.locator('.faq-list details').count(),7);assert.equal(await page.locator('#setup-keys').textContent(),'Use locally for free');assert.equal(await page.locator('.github-link').getAttribute('href'),'https://github.com/ilinii/buddy');
  if(await page.locator('#voice-demo').count())assert.equal(await page.locator('.voice-permission').textContent(),'No audio or transcript is saved by this demo.');
  const dimensions=await page.evaluate(()=>{const h=document.querySelector('#hero-title').getBoundingClientRect(),v=document.querySelector('#voice-demo')?.getBoundingClientRect(),w=document.querySelector('.workspace-layout').getBoundingClientRect(),nav=document.querySelector('.desktop-nav').getBoundingClientRect();return {height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,heroCenter:h.x+h.width/2-innerWidth/2,demoCenter:v?v.x+v.width/2-innerWidth/2:0,workspaceCenter:w.x+w.width/2-innerWidth/2,navCenter:nav.x+nav.width/2-innerWidth/2};});
  assert(await page.locator('.wordmark img').first().evaluate(img=>img.complete&&img.naturalWidth>0));assert.equal(dimensions.overflow,false);for(const key of ['heroCenter','demoCenter','workspaceCenter'])assert(Math.abs(dimensions[key])<1,`${width} ${key}`);if(width>600)assert(Math.abs(dimensions.navCenter)<1,`${width} navigation centering`);
  assert(dimensions.height<3900,`Page too long at ${width}: ${dimensions.height}`);
  await page.locator('#step-ask').click();await page.locator('[data-question=next]').click();await page.waitForFunction(()=>document.querySelector('#sample-answer').textContent.includes('Test the welcome flow'));
  await page.locator('#answer-sources button').first().click();assert.equal(await page.locator('#source-title').textContent(),'Product check-in');await page.keyboard.press('Escape');
  await page.locator('#setup-keys').click();assert((await page.locator('#setup-panel').textContent()).includes('Use locally for free.'));assert(!(await page.locator('#setup-panel').textContent()).includes('$8.90'));await page.keyboard.press('Home');assert.equal(await page.locator('#setup-managed').getAttribute('aria-selected'),'true');
  if(width===390){await page.locator('.menu-toggle').click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='paused');}
  for(const item of await page.locator('.faq-list details').all()){await item.locator('summary').click();await item.locator('.faq-answer p').waitFor({state:'visible'});assert((await item.locator('.faq-answer').textContent()).trim().length>20);await item.locator('summary').click();}
  assert.deepEqual(errors,[]);report.push({width,...dimensions});await page.close();
 }
 console.log(JSON.stringify({status:'passed',widths:report.map(x=>({width:x.width,height:x.height})),checks:['centered hero/demo/navigation/workspace','single merged section','managed-first price/status','API tab keyboard order','source dialogs','context questions','phone menu','reduced motion','no overflow/page/network errors']}));
}finally{await browser.close();}
