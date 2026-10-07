/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { defineConfig, devices } from "playwright/test";

const playwrightPort = process.env.PLAYWRIGHT_PORT ?? "5377";
const playwrightBaseUrl = `http://127.0.0.1:${playwrightPort}`;
// Shared suites exercise actual browser rendering, platform APIs and persistence.
const parityMatrix = /(?:^|[\\/])(?:fx-animation-spatial|fx-animation-compositor|fx-animation-video-wall|fx-image-worker|fx-image-feature-analysis|fx-image-barcodes|fx-image-raw|fx-image-orientation|fx-extended-colour|fx-pdf-isolation|fx-pdf-structure-text|fx-text-multilingual-geometry|fx-text-incremental|fx-expanded-authority|fx-video-frames|fx-video-codecs|fx-video-processing|fx-media-timeline|fx-lumina-storage|host-font-inheritance|text-editing-contract|custom-text-surface|custom-text-output|native-document-assets)\.spec\.ts$/;
const highDprVisualMatrix = /(?:^|[\\/])(?:fx-animation-spatial|host-font-inheritance|text-editing-contract|custom-text-surface)\.spec\.ts$/;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: playwrightBaseUrl,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --config tests/e2e/vite.config.ts --port ${playwrightPort} --strictPort`,
    url: playwrightBaseUrl,
    reuseExistingServer: process.env.FRAMEWORK_E2E_SERVER_READY === "1",
    timeout: 120_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      outputDir: "test-results/chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "firefox",
      testMatch: parityMatrix,
      outputDir: "test-results/firefox",
      use: { ...devices["Desktop Firefox"], headless: process.env.FRAMEWORK_E2E_FIREFOX_HEADED !== "1" }
    },
    {
      name: "webkit",
      testMatch: parityMatrix,
      outputDir: "test-results/webkit",
      use: { ...devices["Desktop Safari"], deviceScaleFactor: 1 }
    },
    {
      name: "mobile-webkit",
      testMatch: parityMatrix,
      use: { ...devices["iPhone 15"], viewport: { width: 390, height: 844 } }
    },
    {
      name: "mobile-chromium",
      testMatch: parityMatrix,
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 800 } }
    },
    {
      name: "chromium-high-dpr",
      testMatch: highDprVisualMatrix,
      use: { ...devices["Desktop Chrome"], deviceScaleFactor: 2 }
    },
    {
      name: "chromium-reduced-motion",
      testMatch: parityMatrix,
      use: { ...devices["Desktop Chrome"], contextOptions: { reducedMotion: "reduce" } }
    }
  ]
});
