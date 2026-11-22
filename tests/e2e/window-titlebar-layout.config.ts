import { defineConfig, devices } from "playwright/test";
import { resolve } from "node:path";
const port = process.env.PLAYWRIGHT_PORT ?? "5418";
export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: "window-titlebar-layout.spec.ts",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: {
    cwd: resolve(import.meta.dirname, "../.."),
    command: `node node_modules/vite/bin/vite.js --config tests/e2e/window-titlebar-layout.vite.config.ts --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: process.env.FRAMEWORK_E2E_SERVER_READY === "1", timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-high-dpr", use: { ...devices["Desktop Chrome"], deviceScaleFactor: 2 } },
  ],
});
