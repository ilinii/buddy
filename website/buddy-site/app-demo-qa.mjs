import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BUDDY_SITE_URL||'http://127.0.0.1:1446';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report=[];
async function storedBytes(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('buddy-local',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,get=db.transaction('data').objectStore('data').get('sqlite');get.onsuccess=async()=>{const bytes=get.result;db.close();const hash=await crypto.subtle.digest('SHA-256',bytes);resolve(Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join(''));};get.onerror=()=>reject(get.error);};}));}
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage(),errors=[],cloud=[];
  context.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));page.on('pageerror',error=>errors.push(error.message));
  await context.route('https://api.github.com/repos/ilinii/buddy',route=>route.fulfill({json:{stargazers_count:7},headers:{'Access-Control-Allow-Origin':'*'}}));
  context.on('request',request=>{if(/deepgram\.com|nvidia\.com|voyageai\.com|\/api\/voice/.test(request.url()))cloud.push(request.url());});
  // Seed a normal persisted workspace. The showcase must not read or change it.
  await page.goto(`${base}/app/?demo=meeting`);
  await page.getByRole('textbox',{name:'Meeting title',exact:true}).fill('Persisted workspace sentinel');
  await expect(page.locator('.save-indicator')).toHaveText('Saved locally');
  const before=await storedBytes(page);
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('.hero-demo-link').click();
  const app=page.frameLocator('[data-demo-slot] iframe');
  await expect(app.locator('.showcase-notice')).toContainText('Changes reset on reload');
  await expect(app.getByRole('textbox',{name:'Meeting title',exact:true})).toHaveValue('Q2 growth & priorities');
  await app.getByRole('textbox',{name:'Meeting title',exact:true}).fill('Temporary showcase edit');
  await expect(app.locator('.save-indicator')).toHaveText('Demo changes only');
  await app.getByRole('textbox',{name:'At a glance editor',exact:true}).fill('A temporary note written inside the real Buddy editor.');
  await expect(app.locator('.save-indicator')).toHaveText('Demo changes only');
  assert.equal(await storedBytes(page),before,'Showcase modified the persisted SQLite snapshot');
  await app.getByRole('tab',{name:/Transcript/}).click();
  await expect(app.locator('.transcript-segment').first()).toBeVisible();
  await app.getByRole('tab',{name:'Notes',exact:true}).click();
  await expect(app.getByRole('textbox',{name:'At a glance editor',exact:true})).toHaveText('A temporary note written inside the real Buddy editor.');
  if(width===390)await app.getByRole('button',{name:'Show assistant',exact:true}).click();
  await app.getByRole('button',{name:'What did we decide?',exact:true}).click();
  await expect(app.locator('.chat-assistant').first()).toBeVisible();
  assert.equal(cloud.length,0,'Demo contacted a speech or AI provider');
  await page.locator('[data-demo-back]').click();assert.equal(await page.locator('[data-demo-slot] iframe').count(),0);
  await page.locator('[data-demo-open]').click();
  await expect(page.frameLocator('[data-demo-slot] iframe').getByRole('textbox',{name:'Meeting title',exact:true})).toHaveValue('Q2 growth & priorities');
  await page.locator('[data-demo-back]').click();
  // Both entry pages open the same actual app with isolated storage.
  await page.goto(`${base}/download/`,{waitUntil:'networkidle'});
  await page.locator('#platform-ios').click();await page.locator('[data-demo-open]').click();
  await expect(page.frameLocator('[data-demo-slot] iframe').locator('.showcase-notice')).toBeVisible();
  await expect(page.frameLocator('[data-demo-slot] iframe').getByRole('textbox',{name:'Meeting title',exact:true})).toHaveValue('Q2 growth & priorities');
  await page.locator('[data-demo-back]').click();
  await page.goto(`${base}/app/?demo=meeting`);
  await expect(page.getByRole('textbox',{name:'Meeting title',exact:true})).toHaveValue('Persisted workspace sentinel');
  assert.deepEqual(errors,[]);assert.deepEqual(cloud,[]);
  report.push({width,actualApp:true,notesAndTranscript:true,localAnswer:true,persistedWorkspaceUntouched:true,reopenResetsDemo:true});
  await context.close();
 }
 console.log(JSON.stringify({status:'passed',checks:report}));
}finally{await browser.close();}
