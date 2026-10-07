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
import { applyNSETextOperations, attributedContent, createNSETextSnapshot, paragraph, textRun } from "../../../src/NSE/Text";
import { translateBackendContent } from "../../../src/NSE/TextEditing/backends/backendChangeTranslator";

const snapshot = (content: ReturnType<typeof attributedContent>) => createNSETextSnapshot(content, "body");

describe("custom attribute operations", () => {
  it("merges custom keys when applying character attributes", () => {
    const before = snapshot(attributedContent([paragraph([textRun("Hello", { custom: { "journal.char-style": "strong" } })])]));
    const after = applyNSETextOperations(before, [{ kind: "apply-attributes", range: { location: 0, length: 5 }, attributes: { custom: { "journal.comment": "c1" } } }]).snapshot;
    expect(after.attributedContent.blocks[0].runs[0]).toEqual(textRun("Hello", { custom: { "journal.char-style": "strong", "journal.comment": "c1" } }));
  });

  it("removes single custom keys, or the whole map, from runs", () => {
    const before = snapshot(attributedContent([paragraph([textRun("Hello", { bold: true, custom: { "journal.comment": "c1", "journal.char-style": "strong" } })])]));
    const one = applyNSETextOperations(before, [{ kind: "remove-attributes", range: { location: 1, length: 2 }, keys: [], customKeys: ["journal.comment"] }]).snapshot;
    expect(one.attributedContent.blocks[0].runs.map(run => run.kind === "text" ? [run.text, run.attributes] : null)).toEqual([
      ["H", { bold: true, custom: { "journal.char-style": "strong", "journal.comment": "c1" } }],
      ["el", { bold: true, custom: { "journal.char-style": "strong" } }],
      ["lo", { bold: true, custom: { "journal.char-style": "strong", "journal.comment": "c1" } }],
    ]);
    const all = applyNSETextOperations(before, [{ kind: "remove-attributes", range: { location: 0, length: 5 }, keys: ["custom"] }]).snapshot;
    expect(all.attributedContent.blocks[0].runs[0]).toEqual(textRun("Hello", { bold: true }));
    const emptied = applyNSETextOperations(before, [{ kind: "remove-attributes", range: { location: 0, length: 5 }, keys: [], customKeys: ["journal.comment", "journal.char-style"] }]).snapshot;
    expect(emptied.attributedContent.blocks[0].runs[0]).toEqual(textRun("Hello", { bold: true }));
  });

  it("merges, removes and clears paragraph custom keys and structure", () => {
    const before = snapshot(attributedContent([paragraph([textRun("Item")], { textLists: [{ id: "l1", marker: "disc" }], custom: { "journal.style": "body" } })]));
    const merged = applyNSETextOperations(before, [{ kind: "paragraph-attributes", range: { location: 0, length: 0 }, attributes: { headerLevel: 2, custom: { "journal.note": true } } }]).snapshot;
    expect(merged.attributedContent.blocks[0].attributes).toEqual({ headerLevel: 2, textLists: [{ id: "l1", marker: "disc" }], custom: { "journal.style": "body", "journal.note": true } });
    const removed = applyNSETextOperations(merged, [{ kind: "paragraph-attributes", range: { location: 0, length: 0 }, attributes: {}, remove: ["textLists"], removeCustom: ["journal.note"] }]).snapshot;
    expect(removed.attributedContent.blocks[0].attributes).toEqual({ headerLevel: 2, custom: { "journal.style": "body" } });
    const replaced = applyNSETextOperations(removed, [{ kind: "paragraph-attributes", range: { location: 0, length: 0 }, attributes: { custom: { "journal.style": "heading" } }, removeCustom: ["journal.style"] }]).snapshot;
    expect(replaced.attributedContent.blocks[0].attributes?.custom).toEqual({ "journal.style": "heading" });
  });

  it("refuses removal keys the grammar does not know", () => {
    const before = snapshot(attributedContent([paragraph([textRun("A")])]));
    expect(() => applyNSETextOperations(before, [{ kind: "remove-attributes", range: { location: 0, length: 1 }, keys: [], customKeys: ["Bad"] }])).toThrow(/custom/i);
    expect(() => applyNSETextOperations(before, [{ kind: "paragraph-attributes", range: { location: 0, length: 0 }, attributes: {}, remove: ["bogus" as never] }])).toThrow(/removal/i);
  });

  it("translates backend custom-key differences exactly", () => {
    const before = snapshot(attributedContent([
      paragraph([textRun("One", { custom: { "journal.comment": "c1", "journal.char-style": "x" } })], { custom: { "journal.style": "body", "journal.extra": 1 } }),
      paragraph([textRun("Two")], { textLists: [{ id: "a", marker: "decimal" }] }),
    ]));
    const desired = attributedContent([
      paragraph([textRun("One", { custom: { "journal.char-style": "x" } })], { custom: { "journal.style": "heading" } }),
      paragraph([textRun("Two")], { headerLevel: 1 }),
    ]);
    const operations = translateBackendContent(before, desired);
    expect(operations.every(operation => operation.kind !== "replace")).toBe(true);
    expect(applyNSETextOperations(before, operations).snapshot.attributedContent).toEqual(desired);
  });
});
