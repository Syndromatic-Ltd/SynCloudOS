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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TFXFont } from "../../src/FX/TextFX/TFXFont";
import { TFXFontDescriptor } from "../../src/FX/TextFX/TFXFontDescriptor";
import { TFXTextContainer } from "../../src/FX/TextFX/TFXTextContainer";
import { attributedContent, paragraph, textRun } from "../../src/NSE/Text/attributedContent";
import { projectNSEAttributedContentToTFX } from "../../src/NSE/TextLayout/shapedTextProjection";
import { NSEShapedTextLayoutAdapter } from "../../src/NSE/TextLayout/shapedTextLayoutAdapter";
const revision = { modelRevision: 1, layoutGeneration: 1, fontGeneration: 1, resourceGeneration: 1, containerGeneration: 1, ownerGeneration: 1 };
let font: TFXFont;
beforeAll(async () => { font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 18 })); });
afterAll(() => font?.dispose());
async function request() { return { flowId: "body", revision, projection: await projectNSEAttributedContentToTFX(attributedContent([paragraph([textRun("office")])]), { resolveFont: () => font }), containers: [new TFXTextContainer({ size: { width: 200, height: 100 } })] }; }
describe("font and resource generation fences", () => {
  it.each([{ rows: undefined, expectedYields: 13, bound: 2 }, { rows: 8, expectedYields: 4, bound: 8 }])("honors the two-row default and explicit row override: $bound", async ({ rows, expectedYields, bound }) => {
    const yieldToHost = vi.fn(async () => {}), adapter = new NSEShapedTextLayoutAdapter({ yieldToHost, ...(rows === undefined ? {} : { maximumRowsPerSlice: rows }) });
    const projection = await projectNSEAttributedContentToTFX(attributedContent(Array.from({ length: 25 }, () => paragraph([textRun("office")]))), { resolveFont: () => font });
    try {
      const result = await adapter.layout({ ...await request(), projection, containers: [new TFXTextContainer({ size: { width: 200, height: 2000 } })] });
      expect(result.complete).toBe(true); expect(yieldToHost).toHaveBeenCalledTimes(expectedYields);
      expect(result.frames.every(record => record.frame.lines.length <= bound)).toBe(true);
    } finally { adapter.dispose(); }
  });
  it.each([1, 2, 8, 256])("keeps exact line/caret/selection/hit geometry with configurable %i row slices", async rows => {
    const projection = await projectNSEAttributedContentToTFX(attributedContent(Array.from({ length: 25 }, () => paragraph([textRun("office e\u0301 one two three")]))), { resolveFont: () => font });
    const input = { flowId: "body", revision, projection, containers: [new TFXTextContainer({ size: { width: 200, height: 2000 }, exclusionRects: [{ x: 80, y: 0, width: 60, height: 75 }] })] };
    const adapter = new NSEShapedTextLayoutAdapter({ maximumRowsPerSlice: rows, yieldToHost: async () => {} });
    const reference = new NSEShapedTextLayoutAdapter({ maximumRowsPerSlice: 256, yieldToHost: async () => {} });
    try {
      const actual = await adapter.layout(input), expected = await reference.layout(input);
      const lines = (result: typeof actual) => result.frames.flatMap(record => record.frame.lines.map(item => ({
        containerId: record.containerId, start: record.textOffset + item.line.start, end: record.textOffset + item.line.end, origin: item.origin, width: item.line.width,
      })));
      expect(actual.complete).toBe(true); expect(lines(actual)).toEqual(lines(expected));
      expect(actual.consumedRange).toEqual(expected.consumedRange); expect(actual.overflowRange).toEqual(expected.overflowRange); expect(actual.containers).toEqual(expected.containers);
      for (const offset of [0, 1, projection.text.length - 1]) {
        const query = { flowId: "body", revision, offset, affinity: "downstream" as const };
        expect(actual.provider.caret(query)).not.toBeNull(); expect(actual.provider.caret(query)).toEqual(expected.provider.caret(query));
      }
      const range = { flowId: "body", revision, location: 0, length: 50 };
      expect(actual.provider.selection(range).length).toBeGreaterThan(0); expect(actual.provider.selection(range)).toEqual(expected.provider.selection(range));
      const point = { flowId: "body", revision, x: 20, y: 10, space: actual.frames[0]!.space, transformRevision: 0 };
      expect(actual.provider.positionAt(point)).not.toBeNull(); expect(actual.provider.positionAt(point)).toEqual(expected.provider.positionAt(point));
    } finally { adapter.dispose(); reference.dispose(); }
  });
  it.each([0, -1, 257, 1.5, NaN, Infinity])("keeps the 1..256 integral configuration fence for %s", rows => {
    expect(() => new NSEShapedTextLayoutAdapter({ maximumRowsPerSlice: rows })).toThrow(RangeError);
  });
  it("revokes published queries on readiness and refuses resubmission with the old font generation", async () => {
    let ready!: () => void;
    const unsubscribe = vi.fn(), adapter = new NSEShapedTextLayoutAdapter({ subscribeFontReadiness: listener => { ready = listener; return unsubscribe; } });
    const input = await request(), first = await adapter.layout(input); ready();
    expect(first.provider.snapshot().current).toBe(false);
    await expect(adapter.layout(input)).rejects.toMatchObject({ name: "AbortError" });
    const next = await adapter.layout({ ...input, revision: { ...revision, fontGeneration: 2, layoutGeneration: 2 } });
    expect(next.provider.snapshot().current).toBe(true);
    adapter.dispose(); adapter.dispose(); expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("checks external owner/container/resource revisions after a cooperative yield", async () => {
    let current = true;
    const adapter = new NSEShapedTextLayoutAdapter({ isCurrent: () => current, yieldToHost: async () => { current = false; } });
    await expect(adapter.layout(await request())).rejects.toMatchObject({ name: "AbortError" }); adapter.dispose();
  });
});
