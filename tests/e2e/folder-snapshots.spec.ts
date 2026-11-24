import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

test('two identically named folders remain independent through reload and targeted refresh', async ({page}, testInfo) => {
  const dirs = ['Client A', 'Client B'].map(parent => testInfo.outputPath(parent, 'Minutes'));
  for (const [index, dir] of dirs.entries()) {
    await mkdir(dir, {recursive: true});
    await writeFile(path.join(dir, 'agenda.txt'), index === 0 ? 'First client agenda' : 'Second client agenda');
  }
  await page.goto('/?demo=home');
  const knowledge = page.getByRole('button', {name: 'Knowledge', exact: true});
  await knowledge.click();
  const add = page.getByRole('button', {name: 'Add folder snapshot'});
  const groups = page.locator('.source-groups section').filter({hasText: 'Folder: Minutes'});
  for (const [index, dir] of dirs.entries()) {
    const chooser = page.waitForEvent('filechooser');
    await add.click();
    await (await chooser).setFiles(dir);
    await expect(groups).toHaveCount(index + 1);
  }
  await page.reload();
  await knowledge.click();
  await expect(groups).toHaveCount(2);
  const first = groups.filter({hasNotText: 'Folder: Minutes (2)'});
  const second = groups.filter({hasText: 'Folder: Minutes (2)'});
  await writeFile(path.join(dirs[0], 'agenda.txt'), 'Updated first client agenda');
  await writeFile(path.join(dirs[0], 'actions.txt'), 'Follow-up actions');
  const chooser = page.waitForEvent('filechooser');
  await first.getByRole('button', {name: 'Refresh folder'}).click();
  await (await chooser).setFiles(dirs[0]);
  await expect(page.getByRole('button', {name: /actions\.txt/})).toBeVisible();
  await expect(groups).toHaveCount(2);
  await second.getByRole('button', {name: /agenda\.txt/}).click();
  await expect(page.getByLabel('Source excerpt')).toHaveText('Second client agenda');
  await page.getByRole('button', {name: 'Close dialog'}).click();
  await groups.filter({hasText: 'actions.txt'}).getByRole('button', {name: /agenda\.txt/}).click();
  await expect(page.getByLabel('Source excerpt')).toHaveText('Updated first client agenda');
});
