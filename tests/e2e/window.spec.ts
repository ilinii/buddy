import {test, expect} from '@playwright/test';

test('compact glass library keeps recording and review clear at desktop and phone widths', async ({page}) => {
  for (const width of [1180, 1024, 768, 390, 320]) {
    await page.setViewportSize({width, height: 760});
    await page.goto('/?demo=home');
    await expect(page.getByRole('heading', {name: 'Meetings', exact: true})).toBeVisible();
    await expect(page.getByRole('group', {name: 'Window controls'})).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Record meeting', exact: true})).toBeVisible();
    await expect(page.locator('.meeting-hook')).toHaveCount(0); // One month needs no duplicate index.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.matrix-home .glass-meeting').first()).toHaveCSS('border-radius', width<=600?'20px':'17px');
    if (width === 1180 || width === 390) await page.screenshot({path: `output/experience-window-${width}.png`});
  }
});

test.describe('Windows caption IPC simulation', () => {
test.use({userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'});
test('Windows caption controls dispatch native actions and reflect maximize state', async ({page}) => {
  // Simulates IPC only. The packaged-window smoke checks real Windows behavior separately.
  await page.addInitScript(() => {
    let sequence = 0, maximized = false;
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<string, number[]>();
    const calls: string[] = [];
    Object.assign(window, {captionCalls: calls, __TAURI_EVENT_PLUGIN_INTERNALS__: {unregisterListener() {}}, __TAURI_INTERNALS__: {
      metadata: {currentWindow: {label: 'main'}, currentWebview: {label: 'main'}},
      transformCallback(fn: (event: unknown) => void) {callbacks.set(++sequence, fn); return sequence;},
      unregisterCallback(id: number) {callbacks.delete(id);},
      async invoke(command: string, args: Record<string, unknown> = {}) {
        calls.push(command);
        if (command === 'plugin:event|listen') {const event = String(args.event); listeners.set(event, [...(listeners.get(event) ?? []), Number(args.handler)]); return args.handler;}
        if (command === 'plugin:event|unlisten') return;
        if (command === 'plugin:window|is_maximized') return maximized;
        if (command === 'plugin:window|toggle_maximize') {
          maximized = !maximized;
          for (const id of listeners.get('tauri://resize') ?? []) callbacks.get(id)?.({payload: {width: 1180, height: 760}});
          return;
        }
        if (command === 'load_database' || command === 'engine_recover' || command === 'engine_models') return [];
        if (command === 'engine_capabilities') return {native: true, microphone: true, systemAudio: true, devices: [], modelReady: false, active: null};
        if (command === 'knowledge_key_status') return {nvidia: false, voyage: false};
        if (command.startsWith('has_')) return false;
      },
    }});
  });
  await page.setViewportSize({width: 1180, height: 760});
  await page.goto('/?demo=home');
  const controls = page.getByRole('group', {name: 'Window controls'});
  await expect(controls).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Meetings', exact: true})).toBeVisible();
  await expect(page.locator('.topbar')).toHaveAttribute('data-tauri-drag-region', 'true');
  await page.getByRole('button', {name: 'Maximize window', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Restore window', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Restore window', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Maximize window', exact: true})).toBeVisible();
  await page.screenshot({path: 'output/experience-windows-caption.png'});
  await page.getByRole('button', {name: 'Switch to dark theme', exact: true}).click();
  await expect(page.locator('.collection-tools')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.glass-rail .main-nav > button.active')).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.meeting-row').first()).toHaveCSS('border-top-color','rgba(255, 255, 255, 0.082)');
  await page.screenshot({path: 'output/experience-windows-caption-dark.png'});
  await page.getByRole('button', {name: 'Minimize window', exact: true}).click();
  await page.getByRole('button', {name: 'Close window', exact: true}).click();
  const calls = await page.evaluate(() => (window as unknown as {captionCalls: string[]}).captionCalls);
  expect(calls.filter(value => value === 'plugin:window|toggle_maximize')).toHaveLength(2);
  expect(calls).toContain('plugin:window|minimize');
  expect(calls).toContain('plugin:window|close');
});
});
