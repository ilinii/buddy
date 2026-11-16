import {expect,test} from '@playwright/test';

test('focus mode persists, quiets the workspace and preserves edited notes',async({page})=>{
  await page.goto('/?demo=meeting');
  const notes=page.getByRole('textbox',{name:'At a glance editor'});
  await notes.fill('Keep this personal note through focus mode.');
  await expect(page.getByText('Saved locally',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Focus mode',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Focus mode',exact:true});
  const toggle=dialog.getByRole('switch',{name:'Focus in Buddy'});
  await expect(toggle).toHaveAttribute('aria-checked','false');await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked','true');
  await expect(dialog).toContainText('Buddy can’t enable it automatically.');
  await expect(dialog.getByRole('button',{name:'Open device notification settings'})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Focus mode',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('complementary',{name:'Buddy assistant'})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Conversation roadmap',exact:true})).toHaveCount(0);
  await expect(notes).toContainText('Keep this personal note');
  await page.reload();await expect(notes).toContainText('Keep this personal note');
  await expect(page.getByRole('complementary',{name:'Buddy assistant'})).toHaveCount(0);
  await page.getByRole('button',{name:'All meetings',exact:true}).click();
  const surface=page.locator('.capture-presence canvas');await expect(surface).toBeVisible();
  await page.mouse.move(1000,100);await page.waitForTimeout(400);
  const still=await surface.screenshot();await page.waitForTimeout(350);expect(still.equals(await surface.screenshot())).toBe(true);
  await expect(page.locator('.rail-action-dot')).toHaveCount(0);
  await page.getByRole('button',{name:'Open Q2 growth & priorities',exact:true}).click();
  await page.getByRole('button',{name:'Focus mode',exact:true}).click();await toggle.click();await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary',{name:'Buddy assistant'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Conversation roadmap',exact:true})).toBeVisible();
  await expect(notes).toContainText('Keep this personal note');
});

test('focus mode keeps fake-device recording controls and real import errors visible',async({page})=>{
  await page.goto('/?demo=home');
  await page.getByRole('button',{name:'Record meeting',exact:true}).click();
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Start microphone recording'}).click();
  await expect(page.getByText('Recording microphone · no ASR installed')).toBeVisible();
  await page.getByRole('button',{name:'Focus mode',exact:true}).click();
  await page.getByRole('switch',{name:'Focus in Buddy'}).click();await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Finish',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Pause meeting',exact:true}).click();
  await page.getByRole('button',{name:'Resume meeting',exact:true}).click();
  await page.getByRole('button',{name:'Finish',exact:true}).click();
  await expect(page.locator('.meeting-status')).toContainText('Meeting complete');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Knowledge',exact:true}).click();
  const input=page.locator('input[type=file][accept=".pdf,.docx,.xlsx,.csv,.txt,.md"]');
  await input.setInputFiles({name:'focus-note.md',mimeType:'text/markdown',buffer:Buffer.from('Focus mode document test.')});
  await expect(page.getByText('focus-note.md',{exact:true})).toBeVisible();
  await expect(page.locator('.import-status')).toHaveCount(0);
  await input.setInputFiles({name:'broken.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('not a spreadsheet')});
  await expect(page.getByRole('alert')).toBeVisible();
});

test('phone focus dialog restores keyboard focus and bottom navigation works',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?demo=home');
  const focus=page.getByRole('button',{name:'Focus mode',exact:true});
  await focus.click();await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(focus).toBeFocused();
  const actions=page.getByRole('navigation',{name:'iPhone navigation'}).getByRole('button',{name:'Actions',exact:true});
  await actions.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Action items',exact:true})).toBeVisible();
  await expect(actions).toHaveAttribute('aria-current','page');
});
