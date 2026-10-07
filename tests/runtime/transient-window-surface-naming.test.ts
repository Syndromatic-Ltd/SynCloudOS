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

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const productionRoot = join(process.cwd(), "src");
const evidenceGalleryRoot = join(productionRoot, "SynWare", "NSEControlGallery.app");

function productionFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (path.startsWith(evidenceGalleryRoot)) continue;
    if (entry.isDirectory()) files.push(...productionFiles(path));
    else if (/\.(?:css|js|jsx|mjs|ts|tsx)$/iu.test(entry.name)) files.push(path);
  }
  return files;
}

describe("durable production naming", () => {
  it("contains no rollout identity in production filenames or source contracts", () => {
    const forbidden = /(?:programme|program|phase)[ -]?(?:0[0-9]|1[0-3])|\bp(?:0[0-9]|1[0-3])\b|p(?:0[0-9]|1[0-3])-/iu;
    const matches = productionFiles(productionRoot).flatMap((path) => {
      const displayPath = relative(process.cwd(), path).replaceAll("\\", "/");
      const source = readFileSync(path, "utf8");
      return forbidden.test(displayPath) || forbidden.test(source) ? [displayPath] : [];
    });

    expect(matches).toEqual([]);
  });
});
