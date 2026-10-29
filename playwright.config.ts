import { defineConfig } from "@playwright/test";

// Runs against a dev server on :3000 (started automatically unless one is already running).
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000", headless: true },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
