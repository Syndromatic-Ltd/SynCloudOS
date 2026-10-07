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
import { attributedContent, paragraph, textRun } from "../../src/NSE/Text/attributedContent";
import { projectNSEAttributedContentToTFX } from "../../src/NSE/TextLayout/shapedTextProjection";
import { NSEShapedTextLayoutAdapter } from "../../src/NSE/TextLayout/shapedTextLayoutAdapter";
const revision = { modelRevision: 1, layoutGeneration: 1, fontGeneration: 1, resourceGeneration: 1, containerGeneration: 1, ownerGeneration: 1 };
let font: TFXFont;
beforeAll(async () => { font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 18 })); });
afterAll(() => font?.dispose());
async function request() { return { flowId: "body", revision, projection: await projectNSEAttributedContentToTFX(attributedContent([paragraph([textRun("office")])]), { resolveFont: () => font }), containers: [new TFXTextContainer({ size: { width: 200, height: 100 } })] }; }
describe("shaped layout operation lifetime", () => {
  it("aborts superseded work before publishing and releases isolated sessions independently", async () => {
    let resume!: () => void, calls = 0;
    const first = new NSEShapedTextLayoutAdapter({ yieldToHost: async () => { if (++calls === 1) await new Promise<void>(resolve => { resume = resolve; }); } }), peer = new NSEShapedTextLayoutAdapter();
    const input = await request(), pending = first.layout(input); const observed = pending.catch(error => error);
    const latest = await first.layout({ ...input, revision: { ...revision, layoutGeneration: 2 } }); resume();
    expect(await observed).toMatchObject({ name: "AbortError" });
    const separate = await peer.layout(input); first.dispose();
    expect(latest.provider.snapshot().current).toBe(false); expect(separate.provider.snapshot().current).toBe(true);
    expect(font.shape("office").glyphs.length).toBeGreaterThan(0);
    await expect(first.layout(input)).rejects.toMatchObject({ name: "AbortError" }); peer.dispose();
  });
  it("never publishes after caller cancellation during a late yield", async () => {
    const controller = new AbortController(), adapter = new NSEShapedTextLayoutAdapter({ yieldToHost: async () => { controller.abort(); } });
    await expect(adapter.layout({ ...await request(), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" }); adapter.dispose();
  });
});
