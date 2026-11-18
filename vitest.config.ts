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
import { decoratorEsbuildOptions } from "./scripts/synware/decorators.mjs";
import { hookMirrorJSX } from "./scripts/synware/hook-mirror-jsx.mjs";
import { configDefaults, defineConfig } from "vitest/config";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";

/** Tests that install the packed SDK into a consumer; they need `npm run sdk:build` first and run in `npm run test:packaging`. */
export const packagingTests = [
  "tests/runtime/**/*-packed.test.ts",
  "tests/runtime/**/*-packed-consumer.test.ts",
  "tests/runtime/fx/packed-*.test.ts",
  "tests/runtime/fx/app-attribution-dev.test.ts",
  "tests/runtime/fx/dispatch-sendable-e2e.test.ts",
  "tests/runtime/fx/installed-browser-consumer.test.ts",
  "tests/runtime/fx/package-boundary.test.ts",
  "tests/runtime/fx/package-resources.test.ts",
  "tests/runtime/synapp-sdk-package.test.ts",
  "tests/runtime/synware-public-api-boundary-guard.test.ts",
];

/** CPU-bound source scanners, timing budgets and in-test browsers. They run first and alone, on a quarter of the cores, so their deadlines hold. */
export const heavyTests = [
  "tests/performance/**/*.test.{ts,tsx}",
  "tests/runtime/**/*boundar*.test.ts",
  "tests/runtime/**/*-counterparts.test.ts",
  "tests/runtime/**/*-guard.test.ts",
  "tests/runtime/**/*-hygiene.test.ts",
  "tests/runtime/**/*public-types.test.ts",
  "tests/runtime/atmo-theme-bundle.test.ts",
  "tests/runtime/error-catalogue.test.ts",
  "tests/runtime/heritage-inspector-source.test.ts",
  "tests/runtime/idiom-errors.test.ts",
  "tests/runtime/nse-page-tear.test.ts",
  "tests/runtime/selector-performance.test.ts",
  "tests/runtime/theme-bundles.test.ts",
];

const unitTests = [
  "tests/nse/**/*.test.{ts,tsx}",
  "tests/integration/**/*.test.{ts,tsx}",
  "tests/runtime/**/*.test.{ts,tsx}",
  "src/FX/DispatchFX/__tests__/**/*.test.ts",
  "tests/performance/**/*.test.{ts,tsx}",
  "tests/decoupling/**/*.test.{ts,tsx}",
];

const shared = {
  // Standard decorators (`@action`, `@observable accessor`) are lowered by esbuild; Node cannot parse them.
  esbuild: { ...decoratorEsbuildOptions },
  // Tests render through the same mirroring JSX runtime the SynWare plugin gives a project.
  plugins: [hookMirrorJSX()],
  resolve: {
    alias: [
      ...Object.entries(synWareSdkEntries).map(([entry, source]) => ({ find: new RegExp("^" + synWarePackageName + (entry === "index" ? "" : "/" + entry) + "$"), replacement: resolve(import.meta.dirname, source) })),
      { find: "@syndromatic/syncloudos/nse/styles.css", replacement: resolve(import.meta.dirname, "src/NSE/public/styles.css") },
    ],
  },
  define: {
    "import.meta.env.DEV": "true"
  },
};
const sharedTest = { clearMocks: true, environment: "node" as const, setupFiles: ["tests/setup/runtimeEnvironment.ts"] };

// Measured on 32 cores: a quarter for the heavy project keeps its deadlines, and three quarters for the rest is past the knee.
export const heavyWorkers = Math.max(1, Math.min(8, Math.floor(availableParallelism() / 4)));
export const unitWorkers = Math.max(2, Math.floor(availableParallelism() * 0.75));

export function syncloudosTestConfig(suite: "unit" | "packaging") {
  if (suite === "packaging") return defineConfig({ ...shared, test: { ...sharedTest, include: packagingTests, maxWorkers: 4 } });
  return defineConfig({
    ...shared,
    test: {
      projects: [
        { ...shared, test: { ...sharedTest, name: "heavy", include: heavyTests, exclude: [...configDefaults.exclude, ...packagingTests], maxWorkers: heavyWorkers, testTimeout: 30_000, sequence: { groupOrder: 0 } } },
        { ...shared, test: { ...sharedTest, name: "unit", include: unitTests, exclude: [...configDefaults.exclude, ...packagingTests, ...heavyTests], maxWorkers: unitWorkers, sequence: { groupOrder: 1 } } },
      ],
    },
  });
}

export default syncloudosTestConfig("unit");
