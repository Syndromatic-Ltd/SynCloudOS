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
import { describe, expect, it } from "vitest";
import { TFXFont } from "../../src/FX/TextFX/TFXFont";
import { TFXFontDescriptor } from "../../src/FX/TextFX/TFXFontDescriptor";
import { TFXTextContainer } from "../../src/FX/TextFX/TFXTextContainer";
import { attributedContent, paragraph, textRun } from "../../src/NSE/Text/attributedContent";
import { projectNSEAttributedContentToTFX } from "../../src/NSE/TextLayout/shapedTextProjection";
import { NSEShapedTextLayoutAdapter } from "../../src/NSE/TextLayout/shapedTextLayoutAdapter";
describe("headless text layout contracts", () => {
  it("lays out 100000+ UTF16 units, reuses warm results and releases retained state", async () => {
    const font = await TFXFont.create(new Uint8Array(readFileSync("tests/fixtures/fx/fonts/notosans-NotoSans[wdth,wght].ttf")), new TFXFontDescriptor({ size: 18 }));
    const adapter = new NSEShapedTextLayoutAdapter({ yieldToHost: async signal => { signal.throwIfAborted(); } });
    try {
      const content = attributedContent(Array.from({ length: 2200 }, () => paragraph([textRun("office e\u0301 one two three four five six seven eight nine")])));
      const projection = await projectNSEAttributedContentToTFX(content, { resolveFont: () => font });
      expect(projection.text.length).toBeGreaterThan(100000);
      const revision = { modelRevision: 1, layoutGeneration: 1, fontGeneration: 1, resourceGeneration: 1, containerGeneration: 1, ownerGeneration: 1 };
      const request = { flowId: "large-text", revision, projection, containers: [new TFXTextContainer({ size: { width: 1000, height: 100000 } })] };
      const cold = await adapter.layout(request);
      const warmRequest = { ...request, revision: { ...revision, layoutGeneration: 2 } };
      const warm = await adapter.layout(warmRequest);
      const cached = await adapter.layout(warmRequest);
      expect(cached).toBe(warm);
      expect(cold.complete).toBe(true);
      expect(warm.complete).toBe(true);
      expect(warm.consumedRange.length).toBe(projection.text.length);
      for (let offset = 0; offset < projection.text.length; offset += 111) {
        expect(warm.provider.caret({ flowId: "large-text", revision: warm.provider.snapshot().revision, offset, affinity: "downstream" })).not.toBeNull();
      }
      adapter.dispose();
      expect(adapter.diagnostics()).toEqual({ activeOperationCount: 0, retainedWindowCount: 0, retainedResultCount: 0, disposed: true });
      expect(font.shape("peer").glyphs.length).toBeGreaterThan(0);
    } finally { adapter.dispose(); font.dispose(); }
  }, 30000);
});
