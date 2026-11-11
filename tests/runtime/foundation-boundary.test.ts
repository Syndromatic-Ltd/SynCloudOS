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

import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { validateImportEdges, validateFoundationEnvironment } from "../../scripts/quality/architecture-boundaries.mjs";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), "foundation-boundary-"));
  roots.push(root);
  for (const name of ["Foundation", "NSE", "FX", "SynCloudOS", "SynCloudOSReact", "Webspring"]) {
    mkdirSync(join(root, "src", name), { recursive: true });
    writeFileSync(join(root, "src", name, "public.ts"), name === "Foundation" ? source : "export const value = 1;\n");
  }
  return root;
}
it.each(["NSE", "FX", "SynCloudOS", "SynCloudOSReact", "Webspring"])("rejects Foundation importing %s", target => {
  const root = fixture(`import { value } from "../${target}/public"; export { value };`);
  const layers = ["Foundation", "NSE", "FX", "SynCloudOS", "SynCloudOSReact", "Webspring"].map(name => ({
    id: name, include: [`src/${name}/**`], mayImportLayers: name === "Foundation" ? ["Foundation"] : [name, "Foundation"], mayImportEntrypoints: {},
  }));
  const result = validateImportEdges({ root, policy: { schemaVersion: 1, controlledSources: ["src/**"], exclusions: [], aliases: [], layers, temporaryAllowlist: [] } });
  expect(result.errors.some(error => error.includes(`Foundation may not import ${target}`))).toBe(true);
});
it.each(['import type { ReactNode } from "react";', 'export const element = document.body;', 'export const element = globalThis["document"];', 'export type View = HTMLElement;', 'export const colour = getComputedStyle(null as never).color;'])("rejects a DOM or React dependency: %s", source => {
  const root = fixture(source);
  expect(validateFoundationEnvironment({ root, files: ["src/Foundation/public.ts"] })).not.toEqual([]);
});
it("allows web worker data primitives", () => {
  const root = fixture('export const data = new Uint8Array(); export const blob = new Blob([data]); export const stream = new CompressionStream("gzip");');
  expect(validateFoundationEnvironment({ root, files: ["src/Foundation/public.ts"] })).toEqual([]);
});
