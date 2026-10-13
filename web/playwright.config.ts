import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 45_000, expect: { timeout: 10_000 }, fullyParallel: false, workers: 1,
  outputDir: '../test/scratch/playwright',
  reporter: [['list'], ['json', { outputFile: '../docs/frontend/interactions.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173/preview/', viewport: { width: 390, height: 844 }, trace: 'off' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
  webServer: { command: 'node scripts/serve.mjs', url: 'http://127.0.0.1:4173/preview/', reuseExistingServer: true, timeout: 15_000 },
});
