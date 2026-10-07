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
  attachmentRun, attributedContent, paragraph, textRun, parseAttributedContent,
  serializeAttributedContent, attributedContentText,
} from "../../../src/NSE/Text";

describe("current portable text URL security", () => {
  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "blob:https://example.test/id", "file:///secret"])(
    "rejects executable or process-local link URL %s", link => {
      expect(() => textRun("Unsafe", { link })).toThrow(/link URL/);
      expect(() => parseAttributedContent({ type: "nse-attributed-content", version: 1,
        blocks: [{ kind: "paragraph", runs: [{ kind: "text", text: "Unsafe", attributes: { link } }] }] })).toThrow(/link URL/);
    },
  );

  it.each(["https://example.test/page", "http://example.test/page", "mailto:test@example.test", "/journal", "#section"])(
    "preserves supported link URL %s without interpreting literal text", link => {
      const content = attributedContent([paragraph([textRun("<img src=x onerror=alert(1)>", { link })])]);
      expect(parseAttributedContent(JSON.parse(serializeAttributedContent(content)))).toEqual(content);
      expect(attributedContentText(content)).toBe("<img src=x onerror=alert(1)>");
    },
  );

  it("keeps safe remote image dimensions and descriptive text but rejects raw image URL schemes", () => {
    const image = attachmentRun({ id: "safe-image", kind: "image", source: { kind: "remote", url: "https://example.test/image.png" },
      alt: '<script>alert("caption")</script>', caption: "Description", intrinsicSize: { inline: 64, block: 48 } });
    const content = attributedContent([paragraph([image])]);
    expect(parseAttributedContent(JSON.parse(serializeAttributedContent(content)))).toEqual(content);
    expect(attributedContentText(content)).toBe(image.alt);
    for (const url of ["javascript:alert(1)", "data:image/png;base64,AAAA", "blob:https://example.test/id", "/relative.png", "http://example.test/image.png"])
      expect(() => attachmentRun({ id: "unsafe-image", kind: "image", source: { kind: "remote", url }, alt: "Unsafe" })).toThrow(/HTTPS|URL/i);
  });

  it("accepts resource identifiers instead of pretending an object URL grants document resource authority", () => {
    const image = attachmentRun({ id: "resource-image", kind: "image",
      source: { kind: "document-resource", resourceId: "image:1", documentId: "document:1", leaseId: "lease:1", generation: 2 },
      alt: "Resource" });
    expect(image.source).toMatchObject({ kind: "document-resource", resourceId: "image:1" });
    expect(() => attachmentRun({ id: "raw-url", kind: "image", source: { kind: "document-resource", resourceId: "blob:https://example.test/id" }, alt: "Invalid" })).toThrow(/resource identifier/);
  });
});
