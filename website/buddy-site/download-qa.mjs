import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BUDDY_SITE_URL||'http://127.0.0.1:1446';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report=[];
try{
 for(const width of [1440,1024,820,768,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>requests.push(request.url()));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await page.route('https://api.github.com/repos/ilinii/buddy',route=>route.fulfill({json:{stargazers_count:7},headers:{'Access-Control-Allow-Origin':'*'}}));
  // The approved logo should render even if the old separate brand request fails.
  await page.route('**/brand/keepsake-mark.png',route=>route.abort());
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('.hero-action').click();
  await page.waitForURL('**/download/');
  await page.waitForFunction(()=>document.querySelector('.github-count').textContent==='7');
  assert.equal(await page.locator('.github-count').isVisible(),true);
  assert.equal(await page.title(),'Download Buddy — Your meeting workspace');
  assert.deepEqual(await page.locator('.platform-tab>span').evaluateAll(nodes=>nodes.map(n=>n.firstChild.textContent)),['macOS','Windows','iOS','Android']);
  assert.deepEqual((await page.locator('.platform-tab small').allTextContents()).map(x=>x.trim()),Array(4).fill('Coming soon'));
  assert.equal(await page.locator('a[href*="/releases/download/"]').count(),0);
  assert.equal(await page.locator('form,input,button[disabled]').count(),0);
  for(const logo of await page.locator('img').all())assert(await logo.evaluate(img=>img.complete&&img.naturalWidth>0),'Logo did not decode');
  assert.equal(await page.locator('.waveform i').count(),42);await page.locator('#platform-ios').click();assert.equal(await page.locator('#device-preview').getAttribute('data-device'),'phone');assert.equal(await page.locator('.selected-platform').textContent(),'Buddy for iOS');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#platform-android').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('#platform-mac').getAttribute('aria-selected'),'true');
  const metrics=await page.evaluate(()=>({width:innerWidth,height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.equal(metrics.overflow,false);
  await page.locator('#motion-toggle').click();
  assert.equal(await page.locator('html').getAttribute('data-motion'),'paused');
  assert.equal(await page.locator('.fluted-light').evaluate(el=>getComputedStyle(el,'::after').animationPlayState),'paused');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.fluted-light').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
  if(width<=600){await page.locator('.menu-toggle').click();assert(await page.locator('#mobile-nav').isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('#mobile-nav').isVisible(),false);assert(await page.locator('.menu-toggle').evaluate(el=>el===document.activeElement));}
  assert(requests.every(url=>!url.includes('/api/voice')&&!url.includes('deepgram.com')));assert(!requests.some(url=>new URL(url).pathname.startsWith('/app/')),'App loaded before an explicit demo action');
  await page.getByRole('link',{name:'Try live transcription',exact:true}).last().click();
  await page.waitForURL('**/#voice-demo');assert(await page.locator('#voice-demo').isVisible());
  assert.deepEqual(errors,[]);
  report.push(metrics);await page.close();
 }
 console.log(JSON.stringify({status:'passed',widths:report,checks:['download navigation','four coming-soon platforms','inline Keepsake logos with old asset blocked','no premature speech requests','phone menu/escape/focus','motion pause/reduced motion','no overflow or browser errors']}));
}finally{await browser.close();}
