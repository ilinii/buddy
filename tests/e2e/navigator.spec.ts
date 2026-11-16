import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`navigator finds actual saved content and carries a question draft at ${width}px`, async ({ page }) => {
    await page.setViewportSize({width,height:900});
    await page.goto('/?demo=home');
    await page.getByRole('button',{name:'Open meeting navigator',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Meeting navigator'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox',{name:'Your question'})).toBeFocused();
    await dialog.getByRole('button',{name:'Find a meeting',exact:true}).click();
    await dialog.getByRole('searchbox').fill('nonexistent phrase');
    await dialog.locator('form').getByRole('button',{name:'Search meetings',exact:true}).click();
    await expect(dialog.getByRole('status')).toHaveText('No matching meetings');
    await dialog.getByRole('searchbox').fill('acquisition');
    await dialog.getByRole('searchbox').press('Enter');
    const matches=dialog.getByRole('region',{name:'Matching meetings'});
    await expect(matches.getByRole('button',{name:'Open Q2 growth & priorities',exact:true})).toBeVisible();
    await expect(matches).toContainText('Demo');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await matches.getByRole('button',{name:'Open Q2 growth & priorities',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Meeting title',exact:true})).toHaveValue('Q2 growth & priorities');
    if(width===390)await page.getByRole('button',{name:'Show assistant',exact:true}).click();
    await page.getByRole('button',{name:'Open meeting navigator',exact:true}).click();
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(dialog.getByRole('button',{name:'Continue in meeting'})).toBeDisabled();
    await dialog.getByRole('textbox',{name:'Your question'}).fill('What did we decide?');
    await dialog.getByRole('button',{name:'Continue in meeting'}).click();
    const draft=page.getByRole('textbox',{name:'Ask Buddy',exact:true});
    await expect(draft).toHaveValue('What did we decide?');
    await expect(draft).toBeVisible();
    await expect(page.locator('.chat-message')).toHaveCount(0);
    await page.getByRole('button',{name:'Send message',exact:true}).click();
    await expect(page.locator('.chat-assistant .message-text')).toContainText('We have decided');
    await page.getByRole('button',{name:'Hide assistant',exact:true}).click();
    await page.getByRole('button',{name:'Show assistant',exact:true}).click();
    await expect(draft).toHaveValue('');
  });
}

test('home question draft uses existing context and traps/restores keyboard focus',async({page})=>{
  await page.goto('/?demo=home');
  const cube=page.getByRole('button',{name:'Open meeting navigator',exact:true});
  await cube.focus(); await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');

  await expect(dialog.getByRole('textbox',{name:'Your question'})).toBeFocused();
  await dialog.getByRole('button',{name:'Find a meeting',exact:true}).click();
  await dialog.locator('form').getByRole('button',{name:'Search meetings',exact:true}).focus();
  await expect(dialog.locator('form').getByRole('button',{name:'Search meetings',exact:true})).toBeFocused();
  await page.keyboard.press('Tab'); await expect(dialog.getByRole('button',{name:'Ask a question',exact:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button',{name:'Search meetings',exact:true})).toBeFocused();
  await dialog.getByRole('button',{name:'Ask a question'}).click();
  await expect(dialog.getByRole('button',{name:'Continue in meeting'})).toBeDisabled();
  await dialog.getByRole('textbox',{name:'Your question'}).fill('What did we decide?');
  await expect(dialog.getByRole('button',{name:'Continue in meeting'})).toBeEnabled();
  await page.keyboard.press('Escape'); await expect(cube).toBeFocused();
  await page.getByRole('button',{name:'Open Buddy navigator'}).click();
  await expect(dialog).toBeVisible();
});

test('bottom sheet slides from the screen edge, reopens safely and honors OS and app reduced motion',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?demo=home');
  const cube=page.getByRole('button',{name:'Open meeting navigator',exact:true});
  await cube.click();
  const sheet=page.getByRole('dialog',{name:'Meeting navigator'});
  await expect(sheet).toBeVisible();
  await expect.poll(async()=>Math.round(Number(await sheet.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)))).toBe(0);
  const box=await sheet.boundingBox();
  expect(box&&box.y>450&&box.y+box.height>=875).toBeTruthy();
  const send=await sheet.getByRole('button',{name:'Continue in meeting',exact:true}).boundingBox();
  expect(send&&send.width<=48&&send.height<=48&&Math.abs(send.width-send.height)<1).toBeTruthy();
  await sheet.getByRole('textbox',{name:'Your question'}).fill('Q2');
  await page.keyboard.press('Escape');
  await expect(cube).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(sheet).toHaveCount(1);
  await expect(sheet.getByRole('textbox',{name:'Your question'})).toBeFocused();
  await sheet.getByRole('textbox',{name:'Your question'}).fill('Q2');
  await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await cube.click();
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBe(0);
  await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'Open settings',exact:true}).click();
  await page.getByRole('checkbox',{name:/Reduce ambient motion/}).check();await page.keyboard.press('Escape');
  await cube.click();await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBe(0);
  expect(errors).toEqual([]);
});

test('navigator remains usable without WebGL',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...options:unknown[]){
      if(type==='webgl'||type==='webgl2')return null;
      return original.apply(this,[type,...options] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto('/?demo=home');
  await page.getByRole('button',{name:'Open meeting navigator',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Find a meeting',exact:true}).click();
  await expect(dialog.locator('form').getByRole('button',{name:'Search meetings',exact:true})).toBeVisible();
  await expect(page.locator('.capture-presence .presence')).toHaveAttribute('data-renderer','css');
  await dialog.locator('form').getByRole('button',{name:'Search meetings',exact:true}).click();
  await expect(dialog.getByRole('region',{name:'Matching meetings'}).getByRole('button')).toHaveCount(2);
});
