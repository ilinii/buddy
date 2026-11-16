import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:1420', viewport: { width: 1440, height: 900 },
    headless: true,
    permissions: ['microphone'],
    launchOptions: {
      executablePath: process.env.BUDDY_PLAYWRIGHT_BUNDLED ? undefined : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI, timeout: 30000 },
  reporter: [['list'], ['html', { open: 'never' }]],
});
