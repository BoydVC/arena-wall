import { defineConfig } from "@playwright/test";

const port = 4177;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
  },
  webServer: {
    command: `node --import tsx cli/arena-wall.ts serve --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
