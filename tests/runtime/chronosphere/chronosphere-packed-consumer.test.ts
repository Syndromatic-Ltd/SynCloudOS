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

import { copyFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../../scripts/synware/installed-consumer.mjs";

// The parent runs this after building the frozen SDK. It never builds or changes receipts.
it("preserves typed neutral versions and prepared custom views in an installed SDK", () => {
  const consumer = createInstalledConsumer(process.cwd(), "chronosphere-versions-");
  copyFileSync(resolve("tests/fixtures/synware-authoring/chronosphere-versions.tsx"), join(consumer.root, "consumer.tsx"));
  for (const mode of ["NodeNext", "Bundler"]) {
    writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        target: "ES2022", module: mode === "NodeNext" ? "NodeNext" : "ESNext", moduleResolution: mode,
        strict: true, skipLibCheck: false, noEmit: true, jsx: "react-jsx", lib: ["ES2022", "DOM", "DOM.Iterable"], types: ["vite/client"],
      }, files: ["consumer.tsx"],
    }));
    expect(runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root)).toBe("");
  }
}, 120_000);
