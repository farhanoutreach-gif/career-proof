import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000, hookTimeout: 60000 },
});
