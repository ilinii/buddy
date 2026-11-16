import { expect, test } from '@playwright/test';

test('participant names persist as manual metadata and copy uses the edited meeting', async ({page,context}) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/?demo=meeting');
  await page.getByRole('textbox',{name:'At a glance editor'}).fill('My carefully edited meeting note.');
  await page.getByRole('button',{name:'Add people',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('names here are entered manually');
  await page.getByRole('textbox',{name:'Names',exact:true}).fill('Alex Chen\nMina Patel\nalex chen');
  await page.getByRole('button',{name:'Save people'}).click();
  await expect(page.locator('.participant-avatar')).toHaveCount(2);
  await page.getByRole('button',{name:'Copy meeting',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Copied to clipboard'})).toBeVisible();
  const copied=await page.evaluate(()=>navigator.clipboard.readText());
  expect(copied).toContain('My carefully edited meeting note.');expect(copied).toContain('People (added manually)');expect(copied).toContain('Mina Patel');
  await page.reload();await expect(page.locator('.participant-avatar')).toHaveCount(2);
  await expect(page.getByRole('textbox',{name:'At a glance editor'})).toContainText('My carefully edited meeting note.');
  await page.getByRole('button',{name:'What did we decide?',exact:true}).click();
  const answer=page.locator('.chat-assistant .message-text');await expect(answer).toContainText('We have decided');
  await page.getByRole('button',{name:'Copy answer',exact:true}).click();
  await expect(page.locator('.chat-assistant .copy-action').getByRole('status')).toContainText('Copied to clipboard');
  expect((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(await answer.locator(':scope > .sr-only').textContent());
});

test('clipboard failure never reports success', async ({page})=>{
  await page.goto('/?demo=meeting');
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Denied');}}});});
  await page.getByRole('button',{name:'Copy meeting',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Copy unavailable'})).toBeVisible();
  await expect(page.getByText('Copied to clipboard',{exact:true})).toHaveCount(0);
});

test('device combobox filters, saves a selection and Escape closes only its list', async ({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.enumerateDevices=async()=>[{deviceId:'default',kind:'audioinput',label:'System default microphone',groupId:'one',toJSON(){return{};}},{deviceId:'test-usb',kind:'audioinput',label:'Test USB microphone',groupId:'two',toJSON(){return{};}}];});
  await page.goto('/?demo=home');await page.getByRole('button',{name:'Open settings',exact:true}).click();
  await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'Audio',exact:true}).click();
  const input=page.getByRole('combobox',{name:'Input device'});await input.fill('USB');
  await expect(page.getByRole('option',{name:'Test USB microphone'})).toBeVisible();
  await input.press('ArrowDown');await input.press('Enter');await expect(input).toHaveValue('Test USB microphone');
  await page.getByRole('button',{name:'Show input device options'}).click();await expect(input).toHaveAttribute('aria-expanded','true');await input.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Settings'})).toBeVisible();
  await input.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'Audio',exact:true}).click();await expect(input).toHaveValue('Test USB microphone');
});

test('alert dialog starts on cancel and deletes only after explicit confirmation', async ({page})=>{
  await page.goto('/?demo=meeting');await page.getByRole('button',{name:'Delete meeting',exact:true}).click();
  const dialog=page.getByRole('alertdialog',{name:'Delete this meeting?'});
  await expect(dialog.getByRole('button',{name:'Keep meeting'})).toBeFocused();
  await page.keyboard.press('Enter');await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Meeting title'})).toHaveValue('Q2 growth & priorities');
  await page.getByRole('button',{name:'Delete meeting',exact:true}).click();await dialog.getByRole('button',{name:'Delete meeting',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Meetings',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Open Q2 growth & priorities',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Open Product direction',exact:true})).toBeVisible();
});

for(const reduced of [false,true])test(`fake-device recording stage at phone width, reduced motion ${reduced}`,async({page})=>{
  await page.setViewportSize({width:390,height:844});if(reduced)await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?demo=home');await page.getByRole('button',{name:'Record meeting',exact:true}).click();
  const consent=page.getByRole('checkbox');await consent.check();await expect(consent).toBeChecked();
  await page.getByRole('button',{name:'Start microphone recording'}).click();
  const stage=page.getByRole('region',{name:'Microphone recording studio'});await expect(stage).toBeVisible();
  await expect(stage).toContainText('Recording microphone · no ASR installed');await expect(page.locator('.live-excerpt')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const signal=stage.locator('canvas');if(reduced){await expect(signal).toHaveAttribute('data-static','true');const shot=await signal.screenshot();await page.waitForTimeout(200);expect(shot.equals(await signal.screenshot())).toBe(true);}
  await page.getByRole('button',{name:'Pause meeting'}).click();await expect(stage).toContainText('Paused');await expect(signal).toHaveAttribute('data-static','true');
  await page.getByRole('button',{name:'Resume meeting'}).click();await page.getByRole('button',{name:'Finish',exact:true}).click();
  await expect(stage).toHaveCount(0);await expect(page.locator('.meeting-status')).toContainText('Meeting complete');
  await page.getByRole('tab',{name:/Transcript/}).click();await expect(page.locator('.transcript-segment')).toHaveCount(0);
});


test('live signal moves, freezes on pause and is bounded',async({page})=>{
  await page.goto('/?demo=home');await page.getByRole('button',{name:'Record meeting',exact:true}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Start microphone recording'}).click();
  await expect(page.getByRole('complementary',{name:'Buddy assistant'})).toHaveCount(0);
  const signal=page.locator('.recording-signal');await expect(signal).toBeVisible();await page.waitForTimeout(250);const moving=await signal.screenshot();await page.waitForTimeout(250);expect(moving.equals(await signal.screenshot())).toBe(false);
  const pixels=await signal.evaluate(canvas=>(canvas as HTMLCanvasElement).width*(canvas as HTMLCanvasElement).height);expect(pixels).toBeLessThanOrEqual(902000);
  await page.getByRole('button',{name:'Pause meeting'}).click();await expect(signal).toHaveAttribute('data-static','true');const paused=await signal.screenshot();await page.waitForTimeout(250);expect(paused.equals(await signal.screenshot())).toBe(true);
  await page.getByRole('button',{name:'Finish',exact:true}).click();
});

for(const reduced of [false,true])test(`welcome glyph ${reduced?'stays still':'animates'} and leaves entry controls usable`,async({page})=>{
  if(reduced)await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  const glyph=page.locator('.welcome-glyph canvas');await expect(glyph).toBeVisible();await page.waitForTimeout(300);
  const size=await glyph.evaluate(canvas=>({w:(canvas as HTMLCanvasElement).width,h:(canvas as HTMLCanvasElement).height}));expect(size.w*size.h).toBeLessThanOrEqual(1503000);
  const first=await glyph.screenshot();await page.waitForTimeout(300);expect(first.equals(await glyph.screenshot())).toBe(reduced);
  await page.getByRole('button',{name:'Set up Buddy'}).click();await page.getByRole('button',{name:'Open my workspace'}).click();await expect(page.getByRole('heading',{name:'Meetings',exact:true})).toBeVisible();await expect(glyph).toHaveCount(0);
});

test('welcome works when WebGL is unavailable',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl'||type==='webgl2')return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});
  await page.goto('/');await page.getByRole('button',{name:'Set up Buddy'}).click();await page.getByRole('button',{name:'Open my workspace'}).click();await expect(page.getByRole('heading',{name:'Meetings',exact:true})).toBeVisible();
});
