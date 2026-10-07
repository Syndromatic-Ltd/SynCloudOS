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
import { attributedContent, paragraph, textRun, createNSETextSnapshot, applyNSETextOperations } from "../../../src/NSE/Text";
import { translateBackendContent } from "../../../src/NSE/TextEditing/backends/backendChangeTranslator";
import { backendDocumentFromContent, contentFromBackendDocument } from "../../../src/NSE/TextEditing/backends/domTextSchema";
describe("private backend changes", () => {
  it.each([false, true])("preserves paragraph topology when flat text is unchanged (reverse=%s)", reverse => {
    const hard = attributedContent([paragraph([textRun("one\ntwo", { bold: true })], { alignment: "end" })]);
    const blocks = attributedContent([paragraph([textRun("one", { bold: true })], { alignment: "end" }), paragraph([textRun("two", { bold: true })], { alignment: "centre" })]);
    const before = createNSETextSnapshot(reverse ? blocks : hard);
    const desired = reverse ? hard : blocks;
    const result = applyNSETextOperations(before, translateBackendContent(before, desired)).snapshot;
    expect(result.attributedContent).toEqual(desired);
  });
  it("retains an empty final paragraph instead of treating its separator as a hard break", () => {
    const before = createNSETextSnapshot(attributedContent([paragraph([textRun("one\n")])]));
    const desired = attributedContent([paragraph([textRun("one")]), paragraph([])]);
    expect(applyNSETextOperations(before, translateBackendContent(before, desired)).snapshot.attributedContent).toEqual(desired);
  });
  it("round-trips character attributes on a hard break", () => {
    const content = attributedContent([paragraph([textRun("one\ntwo", { bold: true, language: "en", foregroundColour: "#123456" })])]);
    const before = createNSETextSnapshot(content);
    const after = createNSETextSnapshot(contentFromBackendDocument(backendDocumentFromContent(content)));
    expect(after.text).toBe(before.text);
    for (let offset = 0; offset < after.text.length; offset++) {
      const span = after.characterSpans.find(value => offset >= value.range.location && offset < value.range.location + value.range.length);
      expect(span?.attributes).toEqual(before.characterSpans[0].attributes);
    }
    expect(translateBackendContent(before, after.attributedContent)).toEqual([]);
  });
  it("translates insertion to one local replacement while retaining other view positions", () => {
    const before = createNSETextSnapshot(attributedContent([paragraph([textRun("hello", { bold: true })])]));
    const after = attributedContent([paragraph([textRun("he!llo", { bold: true })])]);
    const operations = translateBackendContent(before, after);
    expect(operations.filter(x => x.kind === "replace")).toEqual([{ kind: "replace", range: { location: 2, length: 0 }, content: attributedContent([paragraph([textRun("!", { bold: true })])]) }]);
    expect(applyNSETextOperations(before, operations).snapshot.attributedContent).toEqual(after);
  });
  it("translates formatting into semantic attributes without replacing characters", () => {
    const before = createNSETextSnapshot(attributedContent([paragraph([textRun("abc")])]));
    const after = attributedContent([paragraph([textRun("a"), textRun("bc", { italic: true })], { alignment: "centre" })]);
    const operations = translateBackendContent(before, after);
    expect(operations.some(x => x.kind === "replace")).toBe(false);
    expect(applyNSETextOperations(before, operations).snapshot.attributedContent).toEqual(after);
  });
  it("does not split a surrogate pair in a minimal replacement", () => {
    const before = createNSETextSnapshot(attributedContent([paragraph([textRun("a😀b")])]));
    const after = attributedContent([paragraph([textRun("a😁b")])]);
    const operations = translateBackendContent(before, after);
    expect(operations[0]).toMatchObject({ kind: "replace", range: { location: 1, length: 2 } });
    expect(applyNSETextOperations(before, operations).snapshot.text).toBe("a😁b");
  });
});
