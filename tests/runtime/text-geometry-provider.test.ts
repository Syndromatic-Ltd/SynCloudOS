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
import { TFXAttributedString } from "../../src/FX/TextFX/TFXAttributedString";
import { TFXFramesetter } from "../../src/FX/TextFX/TFXFramesetter";
import { createNSEShapedTextGeometryProvider } from "../../src/NSE/TextLayout/textGeometryProvider";
const revision = Object.freeze({ modelRevision: 2, layoutGeneration: 3, fontGeneration: 4, resourceGeneration: 5, containerGeneration: 6, ownerGeneration: 7 });
const space = { name: "container:a", units: "points" as const };
let font: TFXFont;
beforeAll(async () => { font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 18 })); });
afterAll(() => font?.dispose());
function fixture(text = "office e\u0301 😀 abc אבג", complete = true) {
  const frame = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createFrame({ bounds: { x: 10, y: 20, width: 400, height: 100 } });
  let current = true;
  const provider = createNSEShapedTextGeometryProvider({ flowId: "body", revision, textLength: text.length, complete, frames: [{ frame, textOffset: 0, containerId: "a", space }], isCurrent: () => current });
  return { frame, provider, query: { flowId: "body", revision }, stale: () => { current = false; } };
}
describe("immutable shaped geometry provider", () => {
  it("answers from real ligature/cluster and bidi frame offsets", () => {
    const { provider, frame, query } = fixture(); const item = frame.lines[0]!;
    const caret = provider.caret({ ...query, offset: 2, affinity: "downstream" })!;
    expect(caret.primary.rect.x).toBeCloseTo(item.origin.x + item.line.offsetForStringIndex(2).primary);
    expect(caret.primary.rect.y).toBeCloseTo(item.origin.y - item.line.ascent);
    const hit = provider.positionAt({ ...query, x: caret.primary.rect.x, y: item.origin.y, space, transformRevision: 0 });
    expect(hit?.offset).toBe(2);
    const bidiOffset = "office e\u0301 😀 abc ".length;
    const bidi = provider.caret({ ...query, offset: bidiOffset, affinity: "downstream" })!;
    expect(bidi.secondary).not.toBeNull();
    expect(bidi.primary.rect.x).not.toBe(bidi.secondary?.rect.x);
    expect(Object.isFrozen(caret.primary.rect)).toBe(true);
  });
  it("rejects stale generations, foreign flows, invalid offsets and disposed providers", () => {
    const { provider, query, stale } = fixture();
    expect(provider.caret({ ...query, revision: { ...revision, resourceGeneration: 6 }, offset: 0, affinity: "downstream" })).toBeNull();
    expect(provider.caret({ ...query, flowId: "other", offset: 0, affinity: "downstream" })).toBeNull();
    expect(provider.caret({ ...query, offset: NaN, affinity: "downstream" })).toBeNull();
    stale(); expect(provider.snapshot().current).toBe(false);
    expect(provider.selection({ ...query, location: 0, length: 3 })).toEqual([]);
    provider.dispose(); provider.dispose(); expect(provider.caret({ ...query, offset: 0, affinity: "downstream" })).toBeNull();
  });
  it("declares incomplete geometry and makes outside clamping explicit", () => {
    const { provider, query } = fixture("abc", false);
    expect(provider.snapshot()).toMatchObject({ kind: "shaped", complete: false, current: true, units: "points" });
    const outside = { ...query, x: -100, y: -100, space, transformRevision: 0 };
    expect(provider.positionAt(outside)).toBeNull();
    expect(provider.positionAt({ ...outside, outside: "nearest" })?.offset).toBe(0);
    expect(provider.positionAt({ ...outside, outside: "nearest", transformRevision: 1 })).toBeNull();
    expect(provider.selection({ ...query, location: 1, length: 1 })[0]?.rect.width).toBeGreaterThan(0);
  });
});
