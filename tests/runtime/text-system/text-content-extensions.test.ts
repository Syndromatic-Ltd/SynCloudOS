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
import { attachmentRun, attributedContent, paragraph, parseAttributedContent, textRun } from "../../../src/NSE/Text";

const image = (extra: Record<string, unknown> = {}) => attachmentRun({ id: "image:one", kind: "image", source: { kind: "blob", blobId: "bytes:one" }, alt: "Picture", ...extra } as never);

describe("v1 structure and custom attributes", () => {
  it("accepts heading levels, nested text lists and paragraph spacing at their bounds", () => {
    const lists = Array.from({ length: 8 }, (_, depth) => ({ id: `list.${depth}`, marker: depth % 2 ? "decimal" as const : "disc" as const, ...(depth === 1 ? { start: 3 } : {}) }));
    const content = attributedContent([
      paragraph([textRun("Title")], { headerLevel: 6, paragraphSpacingBefore: 0, paragraphSpacing: 24 }),
      paragraph([textRun("Item")], { headerLevel: 0, textLists: lists }),
    ]);
    expect(content.blocks[0].attributes).toEqual({ headerLevel: 6, paragraphSpacing: 24, paragraphSpacingBefore: 0 });
    expect(content.blocks[1].attributes?.textLists).toHaveLength(8);
    expect(parseAttributedContent(JSON.parse(JSON.stringify(content)))).toEqual(content);
  });

  it.each([
    [{ headerLevel: 7 }, /headerLevel/],
    [{ headerLevel: 1.5 }, /headerLevel/],
    [{ textLists: [{ id: "a", marker: "star" }] }, /marker/],
    [{ textLists: Array.from({ length: 9 }, (_, i) => ({ id: `l${i}`, marker: "disc" })) }, /textLists/],
    [{ textLists: [{ id: "!bad", marker: "disc" }] }, /list id/],
    [{ textLists: [{ id: "a", marker: "decimal", start: 0 }] }, /start/],
    [{ textLists: [{ id: "a", marker: "disc", colour: "red" }] }, /unsupported property colour/],
    [{ paragraphSpacing: -1 }, /paragraphSpacing/],
    [{ paragraphSpacingBefore: 100_001 }, /paragraphSpacingBefore/],
  ])("refuses invalid paragraph structure %j", (attributes, message) => {
    expect(() => paragraph([], attributes as never)).toThrow(message);
  });

  it("accepts namespaced scalar custom attributes on runs and paragraphs", () => {
    const custom = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`journal.key-${i}`, i % 4 === 0 ? null : i % 4 === 1 ? "x".repeat(256) : i % 4 === 2 ? i : true]));
    const run = textRun("A", { bold: true, custom });
    expect(Object.keys(run.attributes!.custom!)).toHaveLength(16);
    const block = paragraph([run], { custom: { "journal.style": "body" } });
    expect(block.attributes?.custom).toEqual({ "journal.style": "body" });
    expect(paragraph([], { custom: {} }).attributes).toEqual({ custom: {} });
  });

  it.each([
    [{ style: "body" }, /custom attribute key/],
    [{ "Journal.style": "body" }, /custom attribute key/],
    [{ "journal.": "body" }, /custom attribute key/],
    [{ "journal.style": { nested: true } }, /custom attribute value/],
    [{ "journal.style": ["a"] }, /custom attribute value/],
    [{ "journal.style": "x".repeat(257) }, /custom attribute value/],
    [Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`journal.k${i}`, 1])), /at most 16/],
  ])("refuses invalid custom attributes %#", (custom, message) => {
    expect(() => textRun("A", { custom } as never)).toThrow(message);
    expect(() => paragraph([], { custom } as never)).toThrow(message);
  });

  it("accepts and bounds attachment display bounds", () => {
    expect(image({ bounds: { width: 320, height: 200 } }).bounds).toEqual({ width: 320, height: 200 });
    expect(() => image({ bounds: { width: 0, height: 10 } })).toThrow(/bounds/);
    expect(() => image({ bounds: { width: 10, height: 32_769 } })).toThrow(/bounds/);
    expect(() => image({ bounds: { width: 10, height: 10, depth: 1 } })).toThrow(/unsupported property depth/);
  });
});
