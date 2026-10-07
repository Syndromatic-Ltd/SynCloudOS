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

import { describe, expect, it } from "vitest";
import * as content from "../../../src/NSE/public/content";
import * as contentModule from "../../../src/NSE/Content";

describe("current portable content entries", () => {
  it("uses one current text model at the public and NSE content entry points", () => {
    expect(Object.keys(contentModule).sort()).toEqual(Object.keys(content).sort());
    expect(contentModule.parseAttributedContent).toBe(content.parseAttributedContent);
    expect(contentModule.textRun).toBe(content.textRun);
    expect(Object.keys(contentModule).some(name => /editor|preset|jsonnode|rtf/i.test(name))).toBe(false);
  });

  it.each([content, contentModule])("round-trips the self-described current format without resolving site fonts", entry => {
    const model = entry.attributedContent([entry.paragraph([
      entry.textRun("Cloud ☁️", { font: { familyId: "registered-by-caller", face: "Caller Regular", size: 14 }, bold: true }),
    ])]);
    const encoded = entry.serializeAttributedContent(model);
    expect(JSON.parse(encoded)).toMatchObject({ type: "nse-attributed-content", version: 1 });
    const restored = entry.parseAttributedContent(JSON.parse(encoded));
    expect(restored).toEqual(model);
    expect(Object.isFrozen(restored.blocks[0].runs[0])).toBe(true);
    expect(entry.attributedContentText(restored)).toBe("Cloud ☁️");
  });

  it.each([content, contentModule])("projects alternative text separately from inline attachment layout", entry => {
    const model = entry.attributedContent([
      entry.paragraph([entry.textRun("Before "), entry.attachmentRun({ id: "private-image", kind: "image", source: { kind: "blob", blobId: "caller-blob" }, alt: "Cloud image" })]),
      entry.paragraph([entry.textRun("After")]),
    ]);
    expect(entry.attributedContentText(model)).toBe("Before Cloud image\nAfter");
    expect(entry.attributedContentLayoutText(model)).toBe("Before \uFFFC\nAfter");
  });

  it.each([content, contentModule])("rejects retired editor JSON and unknown current versions", entry => {
    expect(() => entry.parseAttributedContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Old editor" }] }] })).toThrow(/unsupported/i);
    expect(() => entry.parseAttributedContent({ type: "nse-attributed-content", version: 2, blocks: [] })).toThrow(/version/i);
    expect(() => entry.parseAttributedContent({ type: "nse-attributed-content", version: 1, blocks: [], editorState: {} })).toThrow(/unsupported/i);
  });

  it.each([content, contentModule])("refuses accessor payloads and oversized content at the codec boundary", entry => {
    let reads = 0;
    const hostile = { type: "nse-attributed-content", version: 1, get blocks() { reads += 1; return []; } };
    expect(() => entry.parseAttributedContent(hostile)).toThrow(/accessor/i);
    expect(reads).toBe(0);
    expect(() => entry.textRun("x".repeat(1024 * 1024))).toThrow(/byte limit/i);
  });
});
