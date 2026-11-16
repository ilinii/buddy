import {test,expect} from '@playwright/test';

for(const width of [1180,390])test(`Take notes opens an editable blank page directly at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:820});
  await page.goto('/?demo=home');
  await page.getByRole('button',{name:'Take notes',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const editor=page.getByRole('textbox',{name:'Meeting notes editor',exact:true});
  await expect(editor).toBeFocused();
  await expect(editor).toBeEmpty();
  await expect(page.getByRole('textbox',{name:'Meeting title',exact:true})).toHaveValue('New note');
  await expect(page.locator('.breadcrumb strong')).toHaveText('Note');
  await expect(page.getByRole('complementary',{name:'Buddy assistant'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Record in this note',exact:true})).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-view-transition','true');
  await page.screenshot({path:`output/notes-blank-${width}.png`});
  await page.getByRole('textbox',{name:'Meeting title',exact:true}).fill('Research workshop');
  await editor.fill('My notes start here.');
  await expect(page.getByText('Saved locally',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'All meetings',exact:true}).click();
  await expect(page.locator('.meeting-list .meeting-row')).toHaveCount(3);
  await page.getByRole('button',{name:'Open Research workshop',exact:true}).click();
  await expect(editor).toContainText('My notes start here.');
  await page.reload();
  await page.getByRole('button',{name:'Open Research workshop',exact:true}).click();
  await expect(editor).toContainText('My notes start here.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const width of [1180,390])test(`recording can be added inline to the same typed note at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:820});
  await page.goto('/?demo=home');
  await page.getByRole('button',{name:'Take notes',exact:true}).click();
  await page.getByRole('textbox',{name:'Meeting title',exact:true}).fill('One document');
  await expect(page.getByRole('textbox',{name:'Meeting title',exact:true})).toHaveValue('One document');
  const editor=page.getByRole('textbox',{name:'Meeting notes editor',exact:true});
  await editor.fill('Keep these typed notes.');
  const blockId=await page.locator('.minimal-note').getAttribute('id');
  await page.getByRole('button',{name:'Record in this note',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('checkbox',{name:'I have informed participants and have permission to record.',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Microphone recording studio'})).toBeVisible();
  await page.screenshot({path:`output/notes-record-direct-${width}.png`});
  await expect(editor).toContainText('Keep these typed notes.');
  expect(await page.locator('.minimal-note').getAttribute('id')).toBe(blockId);
  await editor.fill('Keep these typed notes. Added while recording.');
  await page.getByRole('button',{name:'Finish',exact:true}).click();
  await expect(page.locator('.meeting-status')).toContainText('Note saved');
  await expect(page.getByRole('tab',{name:'Roadmap',exact:true})).toHaveCount(0);
  await expect(page.locator('.live-excerpt')).toHaveCount(0); // Browser capture invents no ASR.
  await page.getByRole('button',{name:'All meetings',exact:true}).click();
  await expect(page.locator('.meeting-list .meeting-row')).toHaveCount(3);
  await page.getByRole('button',{name:'Open One document',exact:true}).click();
  await expect(editor).toContainText('Added while recording.');
});


test('a rapid double activation creates just one blank note',async({page})=>{
 await page.goto('/?demo=home');await page.getByRole('button',{name:'Take notes',exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});await expect(page.getByRole('textbox',{name:'Meeting notes editor',exact:true})).toBeVisible();await page.getByRole('textbox',{name:'Meeting title',exact:true}).fill('Only one note');await page.getByRole('button',{name:'All meetings',exact:true}).click();await expect(page.locator('.meeting-list .meeting-row')).toHaveCount(3);
});
