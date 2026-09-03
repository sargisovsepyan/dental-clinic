import { defineConfig, devices } from "@playwright/test";

const frontendPort = 3100;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  workers: 1,
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
