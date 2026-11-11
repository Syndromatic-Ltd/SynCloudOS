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

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { auditSynWareImports } from "../../scripts/synware/audit-sdk-imports.mjs";

it("rejects new-family private paths, computed loaders and production testing imports without rejecting public roots", () => {
  const root = mkdtempSync(join(tmpdir(), "synware-fx-imports-"));
  try {
    const source = [
      'import "@syndromatic/syncloudos/fx/media";',
      'import "@syndromatic/syncloudos/fx/video/private";',
      'void import("@syndromatic/syncloudos/sdk/testing");',
      'void import("@syndromatic/syncloudos/fx/" + family + "/backend");',
      'import.meta["glob"]("../../../SynCloudOS/LuminaFX/**/*.ts");',
      'import.meta[method](pattern);',
      'require.resolve("@syndromatic/syncloudos/fx/location/internal");',
      'require["resolve"]("@syndromatic/syncloudos/sdk/testing");',
      'type Fake = import("@syndromatic/syncloudos/sdk/testing").Fake;',
      'import "@syndromatic/syncloudos/fx/midi";',
      'import.meta.glob("./Resources/*.json");',
      'export * from "@syndromatic/syncloudos/sdk/testing";',
      'const glob = import.meta["glob"]; glob(pattern);',
      'void import.meta.resolve("@syndromatic/syncloudos/sdk/testing");',
    ].join("\n");
    const path = join(root, "src/SynWare/Example.app/Contents/index.ts");
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, source);
    writeFileSync(join(root, "src/SynWare/Example.app/Contents/Info.ts"), 'export default { bundleIdentifier: "com.example.example", displayName: "Example", version: "1.0.0" };\n');
    expect(auditSynWareImports(root).internalImports.map((record: any) => record.line)).toEqual([2,3,4,5,6,7,8,9,12,13,14]);
  } finally { expect(root.startsWith(join(tmpdir(), "synware-fx-imports-"))).toBe(true); rmSync(root, { recursive: true, force: true }); }
});
