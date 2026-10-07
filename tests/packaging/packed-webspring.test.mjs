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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("the packed Webspring stylesheet includes the Board and leaves site launchers to their sites", () => {
  const root = resolve(".artifacts/synapp-sdk/packages/syncloudos");
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  assert.equal(manifest.exports["./webspring/styles.css"], "./webspring/styles.css");
  const stylesheet = readFileSync(resolve(root, "webspring/styles.css"), "utf8");
  const content = [...stylesheet.matchAll(/@import "([^"]+)"/g)].map(match => readFileSync(resolve(root, "webspring", match[1]), "utf8")).join("\n");
  assert.match(content, /\.webspring-board/);
  assert.doesNotMatch(content, /\.webspring-dial-scene/);
});
