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

import { synWareSdkEntries, synWarePackageName } from "./scripts/synware/sdk-entries.mjs";
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: [
        ...Object.entries(synWareSdkEntries).map(([entry, source]) => ({ find: new RegExp("^" + synWarePackageName + "/" + entry + "$"), replacement: resolve(import.meta.dirname, source) })),
        { find: "@syndromatic/syncloudos/nse/styles.css", replacement: resolve(import.meta.dirname, "src/NSE/public/styles.css") },
      ],
  },
  define: {
    "import.meta.env.DEV": "true"
  },
  test: {
    clearMocks: true,
    environment: "node",
    include: [
      "tests/nse/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
      "tests/runtime/**/*.test.{ts,tsx}",
      "tests/performance/**/*.test.{ts,tsx}",
      "tests/decoupling/**/*.test.{ts,tsx}",
    ],
    maxWorkers: 2,
    setupFiles: ["tests/setup/runtimeEnvironment.ts"]
  }
});
