import { defineConfig, devices } from '@playwright/test';

// Bounded browser smoke against the explicitly started supervised preview.
// No server launch, remote URL override or provider access is supported here.
export default defineConfig({
  testDir: '.', testMatch: 'smoke.spec.ts', fullyParallel: false,
  forbidOnly: true, retries: 0, workers: 1, reporter: 'list', timeout: 90_000,
  outputDir: '../../test-results/preview-smoke',
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
