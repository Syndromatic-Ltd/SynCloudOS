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
import { GFXPath } from "../../src/FX/GraphicsFX/GFXPath";
import { TFXFont } from "../../src/FX/TextFX/TFXFont";
import { TFXFontDescriptor } from "../../src/FX/TextFX/TFXFontDescriptor";
import { TFXTextContainer } from "../../src/FX/TextFX/TFXTextContainer";
import { attributedContent, paragraph, textRun } from "../../src/NSE/Text/attributedContent";
import { projectNSEAttributedContentToTFX } from "../../src/NSE/TextLayout/shapedTextProjection";
import { NSEShapedTextLayoutAdapter } from "../../src/NSE/TextLayout/shapedTextLayoutAdapter";
const revision = { modelRevision: 0, layoutGeneration: 0, fontGeneration: 0, resourceGeneration: 0, containerGeneration: 0, ownerGeneration: 0 };
let font: TFXFont;
beforeAll(async () => { font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 18 })); });
afterAll(() => font?.dispose());
describe("supplied shaped exclusions and paths", () => {
  it("fits split exclusion fragments on one permitted row and honors margins", async () => {
    const projection = await projectNSEAttributedContentToTFX(attributedContent([paragraph([textRun("one two three four five six")])]), { resolveFont: () => font });
    const adapter = new NSEShapedTextLayoutAdapter();
    const result = await adapter.layout({ flowId: "body", revision, projection, containers: [new TFXTextContainer({ size: { width: 180, height: 100 }, insets: { inlineStart: 10, inlineEnd: 10, blockStart: 5 }, exclusionRects: [{ x: 65, y: 0, width: 40, height: 40 }], maximumLines: 1 })] });
    const lines = result.frames[0]!.frame.lines;
    expect(lines).toHaveLength(2); expect(lines[0]!.origin.x).toBe(10); expect(lines[1]!.origin.x).toBe(105);
    expect(lines[0]!.origin.y).toBe(lines[1]!.origin.y);
    for (const item of lines) {
      expect(item.origin.y - item.line.ascent).toBeGreaterThanOrEqual(5);
      expect(item.origin.x + item.line.width - item.line.trailingWhitespaceWidth <= 65 || item.origin.x >= 105).toBe(true);
    }
    const gap = result.provider.positionAt({ flowId: "body", revision, x: 85, y: lines[0]!.origin.y, space: result.frames[0]!.space, transformRevision: 0 }); expect(gap).toBeNull();
    adapter.dispose();
  });
  it("reuses the caller path across paragraph windows and rejects paths outside insets", async () => {
    const projection = await projectNSEAttributedContentToTFX(attributedContent([paragraph([textRun("one")]), paragraph([textRun("two")])]), { resolveFont: () => font, maximumWindowUnits: 4 });
    const container = new TFXTextContainer({ size: { width: 200, height: 200 }, insets: { inlineStart: 10 } }), path = GFXPath.rect({ x: 10, y: 0, width: 190, height: 200 });
    const adapter = new NSEShapedTextLayoutAdapter(), result = await adapter.layout({ flowId: "body", revision, projection, containers: [container], paths: [path] });
    expect(result.complete).toBe(true); expect(result.frames).toHaveLength(2);
    expect(result.frames.every(record => record.frame.path === path)).toBe(true);
    expect(result.frames[1]!.frame.lines[0]!.origin.y).toBeGreaterThan(result.frames[0]!.frame.lines[0]!.origin.y);
    await expect(adapter.layout({ flowId: "body", revision, projection, containers: [container], paths: [GFXPath.rect({ x: 0, y: 0, width: 200, height: 200 })] })).rejects.toThrow(/insets/);
    adapter.dispose();
  });
});
