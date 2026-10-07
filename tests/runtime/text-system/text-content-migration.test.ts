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
import {
  attachmentRun, attributedContent, normalizeNSEAttributedContentNewlines,
  paragraph, parseAttributedContent, serializeAttributedContent, textRun,
} from "../../../src/NSE/Text";

describe("portable attributed-content import fidelity", () => {
  it("retains the immutable original when newline normalization changes imported text", () => {
    const original = attributedContent([paragraph([textRun("A\r\nB\rC\n", { bold: true })], { alignment: "end" })]);
    const receipt = normalizeNSEAttributedContentNewlines(original);
    expect(receipt.original).toEqual(original);
    expect(Object.isFrozen(receipt.original.blocks[0].runs)).toBe(true);
    expect(receipt.changed).toBe(true);
    expect(receipt.newlineKinds).toEqual(["crlf", "cr", "lf"]);
    expect(receipt.content).toEqual(attributedContent([paragraph([textRun("A\nB\nC\n", { bold: true })], { alignment: "end" })]));
  });

  it("round-trips the portable v1 schema without a backend JSON intermediary", () => {
    const content = attributedContent([
      paragraph([textRun("Cloud", { italic: true, font: { familyId: "fixture-family", size: 12 } })], { alignment: "centre" }),
      paragraph([]),
    ]);
    expect(parseAttributedContent(JSON.parse(serializeAttributedContent(content)))).toEqual(content);
  });

  it("preserves optional resource fields, blob metadata and empty captions in portable serialization", () => {
    const content = attributedContent([paragraph([
      attachmentRun({ id: "object:stable", kind: "image", source: { kind: "document-resource", resourceId: "bytes:stable" }, alt: "Stable" }),
      attachmentRun({ id: "object:blob", kind: "image", source: { kind: "blob", blobId: "bytes:blob", mimeType: "image/png", byteLength: 42 }, alt: "Blob", caption: "" }),
    ])]);
    expect(parseAttributedContent(JSON.parse(serializeAttributedContent(content)))).toEqual(content);
  });

  it("rejects unsafe or foreign schema fields instead of dropping them during import", () => {
    const original = attributedContent([paragraph([textRun("safe")])]);
    const foreign = structuredClone(original) as any;
    foreign.blocks[0].runs[0].attributes = { link: "javascript:alert(1)" };
    expect(() => parseAttributedContent(foreign)).toThrow(/link/i);
    foreign.blocks[0].runs[0].attributes = { privateStyleId: "style:one" };
    expect(() => parseAttributedContent(foreign)).toThrow(/unsupported/i);
    expect(original).toEqual(attributedContent([paragraph([textRun("safe")])]));
  });
});
