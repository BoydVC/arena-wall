import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "node --import tsx cli/arena-wall.ts serve --port 4173",
    url: "http://127.0.0.1:4173/api/state",
    reuseExistingServer: false,
    timeout: 60000,
    env: { ARENA_RESET: "1" },
  },
});
