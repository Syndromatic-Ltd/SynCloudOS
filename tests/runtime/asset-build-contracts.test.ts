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

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicRoot = path.join(projectRoot, "public");
const archivePattern = /\.(7z|zip|tar|tar\.gz|tgz|rar)$/i;

async function collectForbiddenPublicEntries(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const forbidden: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    const isForbidden =
      entry.name === ".DS_Store" ||
      entry.name === ".AppleDouble" ||
      entry.name === "__MACOSX" ||
      entry.name.startsWith("._") ||
      archivePattern.test(entry.name);

    if (isForbidden) forbidden.push(relativePath);
    if (entry.isDirectory()) forbidden.push(...await collectForbiddenPublicEntries(root, absolutePath));
  }

  return forbidden;
}

describe("asset build contracts", () => {
  it("keeps deployable public assets free of AppleDouble, macOS metadata, and archives", async () => {
    await expect(collectForbiddenPublicEntries(publicRoot)).resolves.toEqual([]);
  });

  it("uses the Webspring current-product asset namespace", () => {
    expect(existsSync(path.join(publicRoot, "assets/webspring"))).toBe(true);
    const legacyAssetDirectory = ["spring", "board"].join("");
    expect(existsSync(path.join(publicRoot, `assets/${legacyAssetDirectory}`))).toBe(false);
    expect(existsSync(path.join(publicRoot, "assets/icons/system/Webspring.png"))).toBe(true);
  });
});

