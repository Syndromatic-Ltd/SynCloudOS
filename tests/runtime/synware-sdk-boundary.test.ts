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
import { join } from "node:path";
import { expect, it } from "vitest";

it("rejects framework barrels and host imports even when they resolve", async () => {
  const { auditSynWareImports } = await import("../../scripts/synware/audit-sdk-imports.mjs");
  const root = mkdtempSync(join(tmpdir(), "synware-boundary-"));
  try {
    const files = {
      "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@host/*": ["src/SynCloudOS/*"] } } }),
      "src/NSE/NSE.ts": "export const NSEPopup = 1;",
      "src/NSE/Private/index.ts": "export const NSEPushButton = 1;",
      "src/SynCloudOS/Runtime/private.ts": "export const secret = 1;",
      "src/SynCloudOSReact/index.ts": "export const provider = 1;",
      "src/SynWare/Example.app/Contents/helper.js": 'export { secret } from "../../../SynCloudOS/Runtime/private";',
      "src/SynWare/Example.app/Contents/private.css": '@import "../../../NSE/internal.css";',
      "src/SynWare/Example.app/Contents/root.css": '@import "/src/NSE/Private/internal.css";',
      "src/SynWare/Example.app/Contents/Info.ts": 'export default { bundleIdentifier: "com.example.example", displayName: "Example", version: "1.0.0" };\n',
      "src/SynWare/Example.app/Contents/index.ts": [
        'import { NSEPopup } from "../../../NSE/NSE";',
        'export { NSEPushButton } from "../../../NSE/Private";',
        'void import("@host/Runtime/private");',
        'import "../../../SynCloudOSReact";',
        'const modules = import.meta.glob("../../../NSE/**/*.tsx");',
        'const target = "../../../NSE/NSE"; require(target);',
        'import "../../Other.app/Contents/private.css";',
        'type Hidden = import("../../../SynCloudOS/Runtime/private").secret;',
        'const escaped = import.meta.glob("./{local,../../../NSE}/**/*.tsx");',
      ].join("\n"),
    };
    for (const [name, source] of Object.entries(files)) {
      const path = join(root, name);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, source);
    }
    const violations = auditSynWareImports(root).internalImports;
    expect(violations.filter((item) => item.file.endsWith("index.ts")).map((item) => item.line)).toEqual([1,2,3,4,5,6,7,8,9]);
    expect(violations.some((item) => item.file.endsWith("helper.js"))).toBe(true);
    expect(violations.some((item) => item.file.endsWith("private.css"))).toBe(true);
    expect(violations.some((item) => item.file.endsWith("root.css"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
