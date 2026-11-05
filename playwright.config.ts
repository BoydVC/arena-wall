import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4317",
    channel: "chrome",
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: {
    command: "rm -rf .arena-wall/e2e && node --import tsx cli/arena-wall.ts serve --port 4317 --log .arena-wall/e2e/events.jsonl",
    url: "http://127.0.0.1:4317/",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
