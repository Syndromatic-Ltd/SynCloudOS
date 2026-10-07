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

import { describe, expect, it, vi } from "vitest";
import {
  attachmentRun, attributedContent, attributedContentLayoutText, attributedContentText,
  paragraph, textRun, parseAttributedContent, serializeAttributedContent, plainNSETextContent,
  createInMemoryNSETextOwner, createNSETextBookmark, mapNSETextBookmark, type NSEAttributedContent,
} from "../../src/NSE/Text";
import { createTestRuntime } from "./helpers";

function fixture(): NSEAttributedContent {
  return attributedContent([paragraph([
    textRun("Cloud ", {
      bold: true, underline: true, language: "en-GB", foregroundColour: "#336699",
      backgroundColour: "#ffeecc", baseline: "superscript", link: "https://example.test/cloud",
      font: { familyId: "test-serif", face: "Test Serif Medium", size: 14 },
    }),
    textRun("café 😀", { italic: true, strike: true, baseline: "subscript" }),
    attachmentRun({ id: "attachment:logo", kind: "image",
      source: { kind: "document-resource", documentId: "document:logo", resourceId: "resource:logo",
        leaseId: "lease:logo", generation: 1, mimeType: "image/png", byteLength: 4 },
      alt: "SynCloud logo", intrinsicSize: { inline: 64, block: 64 }, caption: "A resource-backed logo" }),
  ], { alignment: "centre", firstLineHeadIndent: 2, headIndent: 3, tailIndent: 4,
    lineHeightMultiple: 1.5, tabStops: [6, 12] })]);
}

describe("portable current attributed content", () => {
  it("round trips all supported attributes, logical paragraph metrics and resource descriptors through the current serializer", () => {
    const content = fixture();
    const decoded = parseAttributedContent(JSON.parse(serializeAttributedContent(content)));
    expect(decoded).toEqual(content);
    expect(Object.isFrozen(decoded)).toBe(true);
    const run = decoded.blocks[0]!.runs[0]!;
    expect(Object.isFrozen(run)).toBe(true);
    expect(run.kind === "text" && Object.isFrozen(run.attributes)).toBe(true);
    expect(attributedContentLayoutText(decoded)).toBe("Cloud café 😀\uFFFC");
    expect(attributedContentText(decoded)).toBe("Cloud café 😀SynCloud logo");
    expect(serializeAttributedContent(decoded)).not.toMatch(/data:image|blob:https|objectURL/);
  });

  it("preserves application font descriptors, language tags and alpha colours as portable data", () => {
    const content = attributedContent([paragraph([textRun("Cloud", {
      language: "und-Custom", foregroundColour: "#33669980",
      font: { familyId: "app-display", face: "Display Nova", size: 18 },
    })])]);
    expect(parseAttributedContent(JSON.parse(serializeAttributedContent(content)))).toEqual(content);
  });

  it("rejects unsupported attributes and non-finite paragraph and attachment metrics", () => {
    const bad = JSON.parse(serializeAttributedContent(fixture()));
    bad.blocks[0].runs[0].attributes.script = "alert(1)";
    expect(() => parseAttributedContent(bad)).toThrow(/unsupported/);
    expect(() => paragraph([textRun("x")], { alignment: "right" as never })).toThrow(/alignment/);
    expect(() => paragraph([textRun("x")], { lineHeightMultiple: Infinity })).toThrow();
    expect(() => attachmentRun({ id: "bad", kind: "image", source: { kind: "blob", blobId: "blob:1" },
      alt: "Bad", intrinsicSize: { inline: 0, block: 20 } })).toThrow(/size/);
  });

  it("rejects accessors, sparse arrays, cycles and oversized bytes without executing caller code", () => {
    const getter = vi.fn(() => "nse-attributed-content");
    const hostile = Object.create(null);
    Object.defineProperty(hostile, "type", { enumerable: true, get: getter });
    expect(() => parseAttributedContent(hostile)).toThrow(/accessor|data propert/i);
    expect(getter).not.toHaveBeenCalled();
    const urlGetter = vi.fn(() => "javascript:alert(1)");
    const source = Object.create(null);
    Object.defineProperty(source, "url", { enumerable: true, get: urlGetter });
    expect(() => attachmentRun({ id: "hostile", kind: "image", source, alt: "Hostile" })).toThrow(/accessor|data propert/i);
    expect(urlGetter).not.toHaveBeenCalled();
    expect(() => parseAttributedContent({ type: "nse-attributed-content", version: 1, blocks: Array(1) })).toThrow(/dense|sparse/i);
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => parseAttributedContent(cycle)).toThrow(/acyclic|cycle|canonical/i);
    expect(() => plainNSETextContent("😀".repeat(300_000))).toThrow(/byte limit|exceed/i);
  });

  it("maps a revision-bound semantic selection bookmark through a canonical prefix insertion", () => {
    const owner = createInMemoryNSETextOwner({ content: plainNSETextContent("alpha cloud omega") });
    try {
      const before = owner.getSnapshot(), bookmark = createNSETextBookmark(before, { location: 6, length: 5 });
      const receipt = owner.commit({ expectedRevision: before.revision, operations: [
        { kind: "replace", range: { location: 0, length: 0 }, content: plainNSETextContent("prefix ") },
      ] });
      const mapped = mapNSETextBookmark(bookmark, receipt.changeMap)!;
      expect({ anchor: mapped.start.offset, head: mapped.end.offset }).toEqual({ anchor: 13, head: 18 });
      expect(mapped.start.revision).toBe(receipt.snapshot.revision);
      expect(mapped.start.ownerGeneration).toBe(receipt.snapshot.ownerGeneration);
    } finally { owner.dispose(); }
  });

  it("keeps blob identifiers and remote descriptors serializable without storing process-local object URLs", () => {
    const content = attributedContent([paragraph([
      attachmentRun({ id: "blob-image", kind: "image", source: { kind: "blob", blobId: "opaque-image", mimeType: "image/png" }, alt: "Local" }),
      attachmentRun({ id: "remote-image", kind: "image", source: { kind: "remote", url: "https://example.test/image.png" }, alt: "Remote" }),
    ])]);
    expect(parseAttributedContent(JSON.parse(serializeAttributedContent(content)))).toEqual(content);
    expect(serializeAttributedContent(content)).not.toContain("blob:https:");
    for (const url of ["data:image/png;base64,AAAA", "blob:https://example.test/id", "javascript:alert(1)", "http://example.test/image.png"])
      expect(() => attachmentRun({ id: "invalid-url", kind: "image", source: { kind: "remote", url }, alt: "Invalid" })).toThrow(/HTTPS|URL/i);
  });
  it("owns bounded image bytes behind document-scoped runtime leases", async () => {
    const first = createTestRuntime({ id: "runtime:editor-resource:first" });
    const second = createTestRuntime({ id: "runtime:editor-resource:second" });
    const descriptor = await first.documentResources.acquire(
      "document:image",
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
      new AbortController().signal,
    );

    expect(first.documentResources.isActive("document:image", descriptor)).toBe(true);
    expect(first.documentResources.resolve("document:image", descriptor)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(second.documentResources.isActive("document:image", descriptor)).toBe(false);
    expect(first.documentResources.isActive("document:other", descriptor)).toBe(false);
    const forged = { ...descriptor, documentId: "document:forged" };
    expect(first.documentResources.isActive("document:forged", forged)).toBe(false);
    expect(first.documentResources.resolve("document:forged", forged)).toBeNull();
    const disposable = await first.documentResources.acquire(
      "document:disposable",
      new Blob([new Uint8Array([5])], { type: "image/png" }),
      new AbortController().signal,
    );
    expect(first.documentResources.releaseDocument("document:disposable")).toBe(1);
    expect(first.documentResources.isActive("document:disposable", disposable)).toBe(false);

    const getter = vi.fn(() => descriptor.leaseId);
    const hostile = Object.create(null);
    Object.defineProperty(hostile, "leaseId", { enumerable: true, get: getter });
    expect(first.documentResources.isActive("document:image", hostile)).toBe(false);
    expect(getter).not.toHaveBeenCalled();

    await expect(first.documentResources.acquire(
      "document:image",
      { type: "image/svg+xml", size: 1, arrayBuffer: async () => new ArrayBuffer(1) },
      new AbortController().signal,
    )).rejects.toThrow(/MIME type/i);
    await expect(first.documentResources.acquire(
      "document:image",
      { type: "image/png", size: 8 * 1024 * 1024 + 1, arrayBuffer: async () => new ArrayBuffer(0) },
      new AbortController().signal,
    )).rejects.toThrow(/byte limit/i);

    let resolveLate!: (value: ArrayBuffer) => void;
    const cancellation = new AbortController();
    const pending = first.documentResources.acquire(
      "document:late",
      { type: "image/png", size: 1, arrayBuffer: () => new Promise((resolve) => { resolveLate = resolve; }) },
      cancellation.signal,
    );
    cancellation.abort(new DOMException("cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    resolveLate(new Uint8Array([1]).buffer);
    await Promise.resolve();

    await first.dispose("resource-test");
    expect(() => first.documentResources.resolve("document:image", descriptor)).toThrow(/resource-test|abort|disposed/i);
    await second.dispose("resource-test");
  });

});
