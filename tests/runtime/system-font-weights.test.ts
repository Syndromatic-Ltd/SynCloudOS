/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

/*
 * Apps that declare no typography render system UI in the platform font. Segoe UI and San Francisco
 * resolve a requested 800 or 900 to their Black faces, so system text stops at bold.
 */
describe("system UI font weights", () => {
  it("never asks for a weight heavier than 700", () => {
    const heavy: string[] = [];
    for (const file of cssFiles(resolve(root, "src"))) {
      readFileSync(file, "utf8").split("\n").forEach((line, index) => {
        const weight = /font-weight\s*:\s*(\d+|bolder)/u.exec(line)?.[1]
          ?? /\bfont\s*:\s*(?:[a-z-]+\s+)*(\d{3})\s/u.exec(line)?.[1];
        if (weight && (weight === "bolder" || Number(weight) > 700)) {
          heavy.push(`${relative(root, file)}:${index + 1} ${line.trim()}`);
        }
      });
    }
    expect(heavy).toEqual([]);
  });
});
