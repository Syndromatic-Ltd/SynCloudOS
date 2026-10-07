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

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { scanRetiredProductNames } from "../../scripts/quality/check-product-name-hygiene.mjs";

test("upstream attribution stays in release notices while retired names are rejected in product code", () => {
  const root = mkdtempSync(join(tmpdir(), "syncloudos-legal-attribution-"));
  try {
    const directory = join(root, ".artifacts", "synapp-sdk", "packages", "syncloudos");
    mkdirSync(directory, { recursive: true });
    const upstream = ["En", "yo"].join("");
    for (const name of ["THIRD_PARTY.md", "ARTWORK.md"]) writeFileSync(join(directory, name), `Adapted from ${upstream}; upstream notices remain applicable.\n`);
    writeFileSync(join(directory, "sdk.js"), `// ${upstream}\n`);
    assert.deepEqual(scanRetiredProductNames(root), [`.artifacts/synapp-sdk/packages/syncloudos/sdk.js:1:4: retired-name: ${upstream}`]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
