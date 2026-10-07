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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.(?:tsx?|css)$/.test(path) ? [path] : [];
  });
}

// Retired effect implementations must not re-enter the framework or package.
test("framework source and SDK contain no retired effect subsystem", () => {
  assert.equal(existsSync(resolve(root, "src/NSE/AuroreEngine")), false);
  assert.equal(existsSync(resolve(root, "public/assets/nse/aurore")), false);
  assert.equal(Object.hasOwn(synWareSdkEntries, "nse/aurore"), false);
  const offenders = files(resolve(root, "src"))
    .filter((path) => /AuroreEngine|captureAuroreFrame|AuroreVisibilityProvider|cloudscape/i.test(readFileSync(path, "utf8")));
  assert.deepEqual(offenders, []);
});
