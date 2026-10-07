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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TFXFont } from "../../src/FX/TextFX/TFXFont";
import { TFXFontDescriptor } from "../../src/FX/TextFX/TFXFontDescriptor";
import { TFXTypesetter } from "../../src/FX/TextFX/TFXTypesetter";
import { TFXAttributedString } from "../../src/FX/TextFX/TFXAttributedString";
import { attributedContent, paragraph, textRun } from "../../src/NSE/Text/attributedContent";
import { projectNSEAttributedContentToTFX } from "../../src/NSE/TextLayout/shapedTextProjection";
let font: TFXFont;
beforeAll(async () => { font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 18 })); });
afterAll(() => font?.dispose());
describe("semantic to resolved TextFX projection", () => {
  it("preserves Unicode offsets, resolved features, language, paragraph tabs/indents and semantic styles", async () => {
    const content = attributedContent([paragraph([textRun("office e\u0301 😀", { font: { familyId: "Noto", size: 18 }, language: "en", foregroundColour: "#112233" })], { alignment: "centre", headIndent: 8, tabStops: [20, 40] }), paragraph([textRun("אבג")])]);
    const projection = await projectNSEAttributedContentToTFX(content, { resolveFont: () => ({ font, features: { liga: 0 } }), units: "points" });
    expect(projection.text).toBe("office e\u0301 😀\nאבג");
    const run = projection.windows[0]!.input.runs[0]!;
    expect(run.features).toEqual({ liga: 0 }); expect(run.language).toBe("en");
    expect(run.paragraphStyle).toMatchObject({ alignment: "center", headIndent: 6 });
    expect(run.paragraphStyle!.tabStops.map(stop => stop.location)).toEqual([15, 30]);
    expect(projection.content.blocks[0]!.runs[0]).toMatchObject({ attributes: { foregroundColour: "#112233" } });
  });
  it("matches windowed and full shaping glyphs, positions and clusters within bounded input", async () => {
    const content = attributedContent(Array.from({ length: 5 }, () => paragraph([textRun("office e\u0301 😀 abc אבג")])));
    const projection = await projectNSEAttributedContentToTFX(content, { resolveFont: () => font, maximumWindowUnits: 30 });
    const full = new TFXTypesetter(new TFXAttributedString(projection.text, [{ start: 0, end: projection.text.length, font }]));
    for (const window of projection.windows) {
      const expected = full.createLine(window.start, window.end - window.start), actual = new TFXTypesetter(window.input).createLine(0, window.input.text.length);
      expect(actual.runs.map(run => ({ x: run.x, direction: run.shaped.direction, glyphs: run.shaped.glyphs }))).toEqual(expected.runs.map(run => ({ x: run.x, direction: run.shaped.direction, glyphs: run.shaped.glyphs })));
    }
  });
  it("rejects unsupported baseline and line-height geometry instead of flattening it", async () => {
    await expect(projectNSEAttributedContentToTFX(attributedContent([paragraph([textRun("x", { baseline: "superscript" })])]), { resolveFont: () => font })).rejects.toMatchObject({ name: "NSEUnsupportedShapedTextError", feature: "baseline-shift" });
    await expect(projectNSEAttributedContentToTFX(attributedContent([paragraph([textRun("x")], { lineHeightMultiple: 2 })]), { resolveFont: () => font })).rejects.toMatchObject({ name: "NSEUnsupportedShapedTextError", feature: "line-height-multiple" });
  });
  it.each([
    [{ textLists: [{ id: "l", marker: "disc" as const }] }, "text-lists"],
    [{ headerLevel: 2 as const }, "header-level"],
    [{ paragraphSpacing: 12 }, "paragraph-spacing"],
  ])("refuses paragraph structure it cannot draw (%j)", async (attributes, feature) => {
    await expect(projectNSEAttributedContentToTFX(attributedContent([paragraph([textRun("x")], attributes)]), { resolveFont: () => font })).rejects.toMatchObject({ name: "NSEUnsupportedShapedTextError", feature });
  });
});
