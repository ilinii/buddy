import {expect,test} from '@playwright/test';
declare global { interface Window { pageEntrances:string[]; injectionRan?:boolean; } }

test('sidebar navigation has one entrance and no obsolete destinations or workspace badge',async({page})=>{
  await page.goto('/?demo=home');
  await expect(page.getByText('Local-first workspace',{exact:true})).toHaveCount(0);
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await expect(nav.getByRole('button')).toHaveCount(3);
  await expect(nav.getByRole('button',{name:'Decisions',exact:true})).toHaveCount(0);
  await page.evaluate(()=>{window.pageEntrances=[];document.addEventListener('animationstart',event=>{if(event.animationName==='workspace-arrive'||event.animationName==='quiet-arrive'||event.animationName==='panel-in'&&(event.target as HTMLElement).classList.contains('page-enter'))window.pageEntrances.push(event.animationName);});});
  for(const [name,heading]of[['Action items','Action items'],['Knowledge','Knowledge'],['My meetings','Meetings']]){
    await page.evaluate(()=>{window.pageEntrances=[];});
    await nav.getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.viewTransition??'finished')).toBe('finished');
    // Observe past the old second-entrance window, not just the first transition.
    await page.waitForTimeout(380);
    expect(await page.evaluate(()=>window.pageEntrances)).toEqual(['workspace-arrive']);
  }
});

for(const width of [1440,390]){
  test(`settings sections and safe document reader work at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.goto('/?demo=home');
    if(width===390)await page.getByRole('navigation',{name:'iPhone navigation'}).getByRole('button',{name:'Settings',exact:true}).click();
    else await page.getByRole('button',{name:'Open settings',exact:true}).click();
    const dialog=page.getByRole('dialog');
    for(const [tab,heading]of[['General','Workspace'],['Audio','Audio & permissions'],['AI provider','Assistant'],['Privacy','Privacy']]){
      await dialog.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:tab,exact:true}).click();
      await expect(dialog.getByRole('heading',{name:heading,exact:true})).toBeVisible();
      expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('navigation',{name:width===390?'iPhone navigation':'Main navigation'}).getByRole('button',{name:'Knowledge',exact:true}).click();
    await page.locator('input[type=file][accept=".pdf,.docx,.xlsx,.csv,.txt,.md"]').setInputFiles({name:'source-review.md',mimeType:'text/markdown',buffer:Buffer.from('# Review source\n\nA saved source paragraph.\n\n<img src="https://untrusted.invalid/image" onerror="window.injectionRan=true">\n\n<script>window.injectionRan=true</script>')});
    await page.getByRole('button',{name:/source-review.md/}).click();
    const reader=dialog.getByRole('article',{name:'Source excerpt'});
    await expect(reader.getByRole('heading',{name:'Review source',exact:true})).toBeVisible();
    await expect(reader).toContainText('A saved source paragraph.');
    await expect(reader).toContainText('<script>');
    await expect(reader.locator('img,script')).toHaveCount(0);
    expect(await page.evaluate(()=>window.injectionRan)).toBeUndefined();
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download selected original'}).click();
    expect((await download).suggestedFilename()).toBe('source-review.md');
  });
}

test('Spotlight opens to a question with disconnected search controls',async({page})=>{
  for(const width of[1440,390,320]){
    await page.setViewportSize({width,height:900});await page.goto('/?demo=home');
    await page.getByRole('button',{name:'Open meeting navigator',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Meeting navigator'});
    await expect(dialog.getByRole('textbox',{name:'Your question'})).toBeFocused();
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    const veil=page.locator('.modal-backdrop-clear');
    await expect(veil).toHaveCSS('background-color','rgba(25, 25, 28, 0)');
    await expect(veil).toHaveCSS('backdrop-filter','none');
    await expect(dialog).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await expect(dialog.getByRole('button',{name:'Ask a question',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect.poll(()=>dialog.evaluate(el=>Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42))).toBe(0);
    const search=await dialog.getByRole('button',{name:'Find a meeting',exact:true}).boundingBox();
    const rectangle=await dialog.locator('.navigator-composer').boundingBox();
    expect(search&&rectangle&&search.y+search.height+8<rectangle.y).toBeTruthy();
    expect(rectangle&&rectangle.x>=0&&rectangle.x+rectangle.width<=width).toBeTruthy();
    await dialog.getByRole('button',{name:'Find a meeting',exact:true}).click();
    await dialog.getByRole('searchbox').fill('Q2');await dialog.getByRole('searchbox').press('Enter');
    await expect(dialog.getByRole('region',{name:'Matching meetings'})).toContainText('Q2 growth & priorities');
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  }
});
