import { test, expect, devices } from '@playwright/test';
import { nativeTransport } from './support/native-transport';

// Chromium iPhone-size UI/IPC checks, not an Apple SDK or physical microphone test.
test.use({viewport:{width:393,height:852},userAgent:devices['iPhone 15'].userAgent,isMobile:true,hasTouch:true,deviceScaleFactor:1});
const nav=(page:import('@playwright/test').Page)=>page.getByRole('navigation',{name:'iPhone navigation'});
async function shot(page:import('@playwright/test').Page,name:string){
  await expect(page.locator('.boot-screen')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-view-transition','true');
  await page.screenshot({path:`output/${name}.png`,animations:'disabled'});
}
async function fits(page:import('@playwright/test').Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const box=await nav(page).boundingBox();expect(box).not.toBeNull();expect(box!.y+box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}
test('iPhone home, saved note and dark appearance',async({page})=>{
  await page.goto('/?demo=home');await expect(nav(page)).toBeVisible();await fits(page);
  for(const name of ['Record meeting','Take notes'])expect((await page.getByRole('button',{name,exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await shot(page,'iphone-home');
  await page.getByRole('button',{name:'Take notes',exact:true}).click();
  await page.getByRole('textbox',{name:'Meeting title',exact:true}).fill('Notes on the go');
  await page.getByRole('textbox',{name:'Meeting notes editor',exact:true}).fill('Follow up with the design team tomorrow.');
  await shot(page,'iphone-note');
  await nav(page).getByRole('button',{name:'Meetings',exact:true}).click();
  await page.getByRole('button',{name:'Open Notes on the go',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Meeting notes editor',exact:true})).toContainText('design team tomorrow');
  await nav(page).getByRole('button',{name:'Meetings',exact:true}).click();
  await page.getByRole('button',{name:'Switch to dark theme',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await fits(page);
  await shot(page,'iphone-home-dark');
});
test('iPhone knowledge, settings and detached question launcher',async({page})=>{
  await page.goto('/?demo=home');await nav(page).getByRole('button',{name:'Knowledge',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Knowledge',exact:true})).toBeVisible();await fits(page);
  await shot(page,'iphone-knowledge');
  await nav(page).getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Settings',exact:true})).toBeVisible();
  await shot(page,'iphone-settings');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await nav(page).getByRole('button',{name:'Meetings',exact:true}).click();
  await page.locator('.capture-presence').getByRole('button',{name:'Open meeting navigator'}).click();
  await expect(page.getByRole('textbox',{name:'Your question',exact:true})).toBeFocused();
  await page.getByRole('textbox',{name:'Your question',exact:true}).fill('What was the next step?');
  await shot(page,'iphone-launcher');
  await expect(page.locator('.modal-backdrop-clear')).toHaveCSS('backdrop-filter','none');
  await page.getByRole('button',{name:'Continue in meeting',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Buddy assistant'})).toBeVisible();
  await page.getByRole('button',{name:'Hide assistant',exact:true}).click();await fits(page);
});
test('iPhone IPC permission, microphone-only recording and foreground reconciliation',async({page})=>{
  await nativeTransport(page);
  await page.addInitScript(()=>{window.engineMock.platform='ios';window.engineMock.installed=true;window.engineMock.audioPermissions={microphone:'not-determined',system:'required'};});
  await page.goto('/?demo=home');await shot(page,'iphone-home-native');await page.getByRole('button',{name:'Take notes',exact:true}).click();
  await page.getByRole('textbox',{name:'Meeting notes editor',exact:true}).fill('Keep my typed note.');
  await page.getByRole('button',{name:'Record in this note',exact:true}).click();
  const studio=page.getByRole('region',{name:'Microphone recording studio'});await expect(studio).toBeVisible();
  expect(await page.evaluate(()=>window.engineMock.calls.includes('engine_request_audio_permission'))).toBe(true);
  expect(await page.evaluate(()=>window.engineMock.lastStart)).toMatchObject({microphone:true,systemAudio:false});
  await page.evaluate(()=>window.engineMock.push('The next review is on Friday.',8));
  await expect(studio.locator('.live-excerpt-text')).toContainText('Friday');
  await shot(page,'iphone-recording');
  // Simulate a missed webview event while the native journal advances.
  await page.evaluate(()=>{const s=window.engineMock.session!;s.duration=14;s.segments.push({id:crypto.randomUUID(),start:9,end:14,text:'Saved while the webview was suspended.',channel:'microphone',final:true});window.dispatchEvent(new PageTransitionEvent('pageshow'));});
  await page.getByRole('button',{name:'Finish',exact:true}).click();
  await expect(page.locator('.meeting-status')).toContainText('Note saved');
  await expect(page.getByRole('textbox',{name:'Meeting notes editor',exact:true})).toContainText('Keep my typed note.');
  await page.getByRole('tab',{name:/Transcript/}).click();
  await expect(page.locator('.transcript')).toContainText('Saved while the webview was suspended.');
  await page.getByRole('button',{name:'Export meeting',exact:true}).click();
  await page.getByRole('button',{name:/Markdown/}).click();
  await expect.poll(()=>page.evaluate(()=>window.engineMock.calls.includes('share_iphone_document'))).toBe(true);
});

test('iPhone landscape and reduced motion retain touch navigation',async({page})=>{
  await page.setViewportSize({width:852,height:393});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?demo=home');await expect(nav(page)).toBeVisible();await fits(page);
  await nav(page).getByRole('button',{name:'Knowledge',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Knowledge',exact:true})).toBeVisible();await fits(page);
  await nav(page).getByRole('button',{name:'Settings',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Settings',exact:true});await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('denied iPhone permission never prepares a model or starts capture',async({page})=>{
  await nativeTransport(page);
  await page.addInitScript(()=>{window.engineMock.platform='ios';window.engineMock.audioPermissions={microphone:'denied',system:'required'};});
  await page.goto('/?demo=home');await page.getByRole('button',{name:'Take notes',exact:true}).click();
  await page.getByRole('button',{name:'Record in this note',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('microphone access');
  expect(await page.evaluate(()=>window.engineMock.calls.some(c=>['engine_start','engine_prepare_model'].includes(c)))).toBe(false);
  await expect(page.getByRole('region',{name:'Microphone recording studio'})).toHaveCount(0);
});

test('phone launcher stays above the simulated software keyboard',async({page})=>{
  await page.goto('/?demo=home');await page.getByRole('button',{name:'Open meeting navigator',exact:true}).click();
  await page.getByRole('textbox',{name:'Your question',exact:true}).fill('What should I follow up?');
  await page.evaluate(()=>{const viewport=window.visualViewport!;Object.defineProperty(viewport,'height',{value:440,configurable:true});viewport.dispatchEvent(new Event('resize'));});
  await expect(page.locator('html')).toHaveAttribute('data-keyboard','true');await expect(nav(page)).toBeHidden();
  await expect.poll(async()=>{const input=await page.locator('.navigator-composer').boundingBox();return input!.y+input!.height;}).toBeLessThanOrEqual(440);
});
