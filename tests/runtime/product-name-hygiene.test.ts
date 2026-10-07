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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanProductNameHygiene, scanRetiredProductNames } from "../../scripts/quality/check-product-name-hygiene.mjs";

describe("product-name hygiene", () => {
  it("inspects the current built SDK directory", () => {
    const root = mkdtempSync(join(tmpdir(), "product-name-package-"));
    const token = ["Cla", "ude"].join("");
    try {
      const directory = join(root, ".artifacts", "synapp-sdk", "packages", "syncloudos");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "sdk.js"), `// ${token}\n`);
      expect(scanRetiredProductNames(root)).toEqual([`.artifacts/synapp-sdk/packages/syncloudos/sdk.js:1:4: retired-name: ${token}`]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("reports no delivery-only identifiers in product source and tooling", () => {
    expect(scanProductNameHygiene()).toEqual([]);
  });

  it("reports no retired product names in shipped source, public docs or the built package", () => {
    expect(scanRetiredProductNames()).toEqual([]);
  });

  it("flags retired product names but not the SynCloudOS name itself", () => {
    const root = mkdtempSync(join(tmpdir(), "product-name-retired-"));
    const theme = ["Ari", "sto"].join("");
    const shell = ["web", "OS"].join("");
    const cloud = ["Cloud", "OS"].join("");
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      mkdirSync(join(root, "tests"), { recursive: true });
      writeFileSync(join(root, "src", "theme.ts"), `// ${theme} chrome\nexport const name = "Syn${cloud}";\n`);
      writeFileSync(join(root, "README.md"), `Inspired by ${shell} and ${cloud}.\n`);
      writeFileSync(join(root, "tests", "guard.test.ts"), `// ${theme} is allowed in tests\n`);

      expect(scanRetiredProductNames(root)).toEqual([
        `README.md:1:13: retired-name: ${shell}`,
        `README.md:1:23: retired-name: ${cloud}`,
        `src/theme.ts:1:4: retired-name: ${theme}`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports exact diagnostics for camel-cased numbered programme identifiers", () => {
    const root = mkdtempSync(join(tmpdir(), "product-name-hygiene-"));
    const camelCaseNumberedIdentifier = ["P", "p", "02"].join("");
    const upperCaseNumberedIdentifier = ["P", "P", "03"].join("");
    const declarationIdentifier = ["P", "P", "02"].join("");
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      mkdirSync(join(root, "tests"), { recursive: true });
      writeFileSync(join(root, "src", "runtime.ts"), `const safe${camelCaseNumberedIdentifier}LineagePath = true;\n`);
      writeFileSync(join(root, "src", "source.d.mts"), `export const ${declarationIdentifier}Metadata = {};\n`);
      writeFileSync(join(root, "tests", `Helper${upperCaseNumberedIdentifier}Probe.test.ts`), "export {};\n");

      expect(scanProductNameHygiene(root)).toEqual([
        `src/runtime.ts:1:11: content: ${camelCaseNumberedIdentifier}`,
        `src/source.d.mts:1:14: content: ${declarationIdentifier}`,
        `tests/Helper${upperCaseNumberedIdentifier}Probe.test.ts:0:13: filename: ${upperCaseNumberedIdentifier}`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scans top-level ignore configuration as product tooling", () => {
    const root = mkdtempSync(join(tmpdir(), "product-name-hygiene-ignore-"));
    const privatePhrase = ["post", "parity"].join("-");
    const prefix = "generated/";
    try {
      writeFileSync(join(root, ".gitignore"), `${prefix}${privatePhrase}/evidence/\n`);

      expect(scanProductNameHygiene(root)).toEqual([
        `.gitignore:1:${prefix.length + 1}: content: ${privatePhrase}`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
