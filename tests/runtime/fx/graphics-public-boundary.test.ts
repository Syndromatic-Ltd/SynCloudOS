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

import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import * as graphics from "../../../src/FX/GraphicsFX/public";

it("keeps mutable image storage private and public pixel copies independent", () => {
  expect(graphics).not.toHaveProperty("borrowGFXImageBytes");
  const image = new graphics.GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([12, 34, 56, 255]) });
  image.copyData()[0] = 99;
  expect(image.copyData()[0]).toBe(12);
});

it("requires deliberate named exports at the GraphicsFX boundary", () => {
  const source = ts.createSourceFile("public.ts", readFileSync("src/FX/GraphicsFX/public.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const exports = source.statements.filter(ts.isExportDeclaration);
  expect(exports.every(entry => entry.exportClause && ts.isNamedExports(entry.exportClause))).toBe(true);
});
