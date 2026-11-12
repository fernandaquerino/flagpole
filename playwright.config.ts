import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'apps/api/e2e',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    actionTimeout: 10000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
