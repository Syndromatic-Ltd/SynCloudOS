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
import { GFXImage } from "../../src/FX/GraphicsFX/GFXImage";
import { TFXFont } from "../../src/FX/TextFX/TFXFont";
import { TFXFontDescriptor } from "../../src/FX/TextFX/TFXFontDescriptor";
import { TFXRunDelegate } from "../../src/FX/TextFX/TFXRunDelegate";
import { TFXTextContainer } from "../../src/FX/TextFX/TFXTextContainer";
import { attachmentRun, attributedContent, paragraph } from "../../src/NSE/Text/attributedContent";
import { NSEAttachmentProjection } from "../../src/NSE/TextLayout/attachmentProjection";
import { projectNSEAttributedContentToTFX } from "../../src/NSE/TextLayout/shapedTextProjection";
import { NSEShapedTextLayoutAdapter } from "../../src/NSE/TextLayout/shapedTextLayoutAdapter";
const revision = { modelRevision: 0, layoutGeneration: 0, fontGeneration: 0, resourceGeneration: 0, containerGeneration: 0, ownerGeneration: 0 };
const source = { kind: "document-resource" as const, documentId: "doc", resourceId: "image", leaseId: "lease", generation: 1, mimeType: "image/png", byteLength: 4 };
let font: TFXFont;
beforeAll(async () => { font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 18 })); });
afterAll(() => font?.dispose());
function delegate(width: number) { return new TFXRunDelegate({ width, ascent: 25, descent: 5, attachment: { image: new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([0, 0, 0, 255]) }), accessibilityLabel: "chart" } }); }
describe("attachment metrics and leased resource geometry", () => {
  it("uses delegated baseline metrics and reports oversize attachment no progress", async () => {
    const content = attributedContent([paragraph([attachmentRun({ id: "a", kind: "image", source, alt: "chart" })])]);
    const projection = await projectNSEAttributedContentToTFX(content, { resolveFont: () => font, attachments: new NSEAttachmentProjection({ resolveRunDelegate: async () => delegate(30) }) });
    const adapter = new NSEShapedTextLayoutAdapter(), result = await adapter.layout({ flowId: "body", revision, projection, containers: [new TFXTextContainer({ size: { width: 30, height: 30 } })] });
    expect(result.complete).toBe(true); expect(result.frames[0]!.frame.lines[0]).toMatchObject({ origin: { y: 25 }, line: { ascent: 25, descent: 5, width: 30 } });
    const tooSmall = await adapter.layout({ flowId: "body", revision, projection, containers: [new TFXTextContainer({ size: { width: 29, height: 30 } })] });
    expect(tooSmall.consumedRange.length).toBe(0); expect(tooSmall.containers[0]!.outcome).toBe("no-progress"); expect(tooSmall.overflowRange).toEqual({ location: 0, length: 1 }); adapter.dispose();
  });
  it("rejects late resource resolution after the owner invalidates its attachment", async () => {
    let finish!: (value: TFXRunDelegate) => void;
    const projection = new NSEAttachmentProjection({ resolveRunDelegate: async () => new Promise(resolve => { finish = resolve; }) });
    const pending = projection.project(attachmentRun({ id: "a", kind: "image", source, alt: "chart" })); const observed = pending.catch(error => error);
    projection.invalidate("a"); finish(delegate(30)); expect(await observed).toMatchObject({ name: "AbortError" });
  });
  it("refuses a closed-document lease and produces changed dimensions only with a fresh generation", async () => {
    let live = true, width = 30, resourceChanged!: () => void;
    const authority = new NSEAttachmentProjection({ resolveRunDelegate: async () => { if (!live) throw new DOMException("Document lease closed", "AbortError"); return delegate(width); } });
    const content = attributedContent([paragraph([attachmentRun({ id: "a", kind: "image", source, alt: "chart" })])]);
    const project = () => projectNSEAttributedContentToTFX(content, { resolveFont: () => font, attachments: authority });
    const adapter = new NSEShapedTextLayoutAdapter({ subscribeResourceReadiness: listener => { resourceChanged = listener; return () => {}; } }), containers = [new TFXTextContainer({ size: { width: 100, height: 40 } })];
    const first = await adapter.layout({ flowId: "body", revision, projection: await project(), containers });
    width = 50; resourceChanged(); expect(first.provider.snapshot().current).toBe(false);
    const next = await adapter.layout({ flowId: "body", revision: { ...revision, resourceGeneration: 1, layoutGeneration: 1 }, projection: await project(), containers });
    expect(next.frames[0]!.frame.lines[0]!.line.width).toBe(50);
    live = false; resourceChanged(); expect(next.provider.snapshot().current).toBe(false);
    await expect(project()).rejects.toMatchObject({ name: "AbortError" }); adapter.dispose();
  });
});
