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
import { TFXTextContainer } from "../../src/FX/TextFX/TFXTextContainer";
import { TFXAttributedString } from "../../src/FX/TextFX/TFXAttributedString";
import { TFXFramesetter } from "../../src/FX/TextFX/TFXFramesetter";
import { attributedContent, paragraph, textRun } from "../../src/NSE/Text/attributedContent";
import { projectNSEAttributedContentToTFX } from "../../src/NSE/TextLayout/shapedTextProjection";
import { NSEShapedTextLayoutAdapter } from "../../src/NSE/TextLayout/shapedTextLayoutAdapter";
const revision = { modelRevision: 0, layoutGeneration: 0, fontGeneration: 0, resourceGeneration: 0, containerGeneration: 0, ownerGeneration: 0 };
let font: TFXFont;
beforeAll(async () => { font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 18 })); });
afterAll(() => font?.dispose());
const project = (text: string, maximumWindowUnits?: number) => projectNSEAttributedContentToTFX(attributedContent(text.split("\n").map(text => paragraph([textRun(text)]))), { resolveFont: () => font, maximumWindowUnits });
describe("supplied shaped container flow", () => {
  it("preserves empty and final paragraphs as real font-sized caret lines", async () => {
    const adapter = new NSEShapedTextLayoutAdapter(), containers = [new TFXTextContainer({ size: { width: 200, height: 100 } })];
    const empty = await adapter.layout({ flowId: "body", revision, projection: await project(""), containers });
    expect(empty.provider.caret({ flowId: "body", revision, offset: 0, affinity: "downstream" })?.primary.rect.height).toBeCloseTo(font.ascent + font.descent);
    const final = await adapter.layout({ flowId: "body", revision, projection: await project("one\n"), containers });
    expect(final.frames.flatMap(record => record.frame.lines)).toHaveLength(2);
    const caret = final.provider.caret({ flowId: "body", revision, offset: 4, affinity: "downstream" })!;
    expect(caret.primary.rect.y).toBeCloseTo(font.ascent + font.descent + font.leading);
    adapter.dispose();
  });
  it("honors primitive row limits and block continuation without changing path ownership", () => {
    const text = "one\ntwo\nthree";
    const setter = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }]));
    const frame = setter.createFrame({ bounds: { x: 0, y: 0, width: 200, height: 200 }, maximumLines: 1, blockOffset: 30 });
    expect(frame.lines).toHaveLength(1);
    expect(frame.visibleRange.end).toBe(4);
    expect(frame.lines[0]!.origin.y - frame.lines[0]!.line.ascent).toBe(30);
  });
  it("orders only supplied containers and publishes precise consumption/overflow", async () => {
    const projection = await project("one\ntwo\nthree");
    const adapter = new NSEShapedTextLayoutAdapter();
    const result = await adapter.layout({ flowId: "body", revision, projection, containers: [new TFXTextContainer({ size: { width: 200, height: 100 }, maximumLines: 1, flowOrder: 1 }), new TFXTextContainer({ size: { width: 200, height: 100 }, maximumLines: 1, flowOrder: 0 })] });
    expect(result.frames.map(frame => frame.containerId)).toEqual(["container:1", "container:0"]);
    expect(result.consumedRange).toEqual({ location: 0, length: 8 });
    expect(result.overflowRange).toEqual({ location: 8, length: 5 }); expect(result.complete).toBe(false);
    expect(result.frames[1]!.textOffset + result.frames[1]!.frame.visibleRange.start).toBe(4);
    adapter.dispose();
  });
  it("continues paragraph windows inside one container and agrees with full frame geometry", async () => {
    const text = "office\noffice\noffice";
    const adapter = new NSEShapedTextLayoutAdapter();
    const request = { flowId: "body", revision, projection: await project(text, 8), containers: [new TFXTextContainer({ size: { width: 200, height: 200 } })] };
    const result = await adapter.layout(request);
    const full = new TFXFramesetter(new TFXAttributedString(text, [{ start: 0, end: text.length, font }])).createFrame({ bounds: { x: 0, y: 0, width: 200, height: 200 } });
    expect(result.complete).toBe(true);
    expect(result.frames.flatMap(record => record.frame.lines.map(item => ({ origin: item.origin, start: item.line.start + record.textOffset, end: item.line.end + record.textOffset, width: item.line.width })))).toEqual(full.lines.map(item => ({ origin: item.origin, start: item.line.start, end: item.line.end, width: item.line.width })));
    expect(await adapter.layout(request)).toBe(result);
    adapter.dispose();
  });
  it("reports a zero-area container as no progress and accepts explicit UTF16 continuation", async () => {
    const adapter = new NSEShapedTextLayoutAdapter(), projection = await project("one\ntwo");
    const result = await adapter.layout({ flowId: "body", revision, projection, fromCharacter: 4, containers: [new TFXTextContainer({ size: { width: 0, height: 0 } }), new TFXTextContainer({ size: { width: 200, height: 100 } })] });
    expect(result.containers[0]).toMatchObject({ range: { location: 4, length: 0 }, outcome: "no-progress" });
    expect(result.consumedRange).toEqual({ location: 4, length: 3 }); expect(result.complete).toBe(true);
    adapter.dispose();
  });
});
