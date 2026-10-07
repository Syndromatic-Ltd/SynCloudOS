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

// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";
import { afterEach, describe, expect, it } from "vitest";
import { attachmentRun, attributedContent, attributedContentText, createInMemoryNSETextOwner, paragraph, textRun, type NSETextList } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import { NSETextView } from "../../../src/NSE/TextEditing/NSETextView";
import { contentFromBackendDocument, domTextSchema } from "../../../src/NSE/TextEditing/backends/domTextSchema";
import { formatNSETextListMarker, nseTextListMarkers } from "../../../src/NSE/TextEditing/backends/domTextLists";

afterEach(cleanup);
const mount = (content: ReturnType<typeof attributedContent>, resolver?: Parameters<typeof NSETextView>[0]["attachmentResolver"]) => {
  const owner = createInMemoryNSETextOwner({ content });
  const session = new TextEditingSession({ id: "view", owner });
  const view = render(<NSETextView session={session} label="Document" attachmentResolver={resolver} />);
  return { owner, session, view, textbox: screen.getByRole("textbox") };
};
const decimal = (id: string, start?: number): NSETextList => ({ id, marker: "decimal", ...(start ? { start } : {}) });
const parse = (html: string) => {
  const host = document.createElement("div"); host.innerHTML = html;
  return contentFromBackendDocument(PMDOMParser.fromSchema(domTextSchema).parse(host));
};

describe("text view structure", () => {
  it("renders heading levels as real heading elements and keeps spacing", () => {
    const { textbox } = mount(attributedContent([paragraph([textRun("Title")], { headerLevel: 2, paragraphSpacing: 12, paragraphSpacingBefore: 4 }), paragraph([textRun("Body")])]));
    const heading = textbox.querySelector("h2")!;
    expect(heading.textContent).toBe("Title");
    expect(heading.style.marginBlockEnd).toBe("12px");
    expect(heading.style.marginBlockStart).toBe("4px");
    expect(textbox.querySelector("p")?.textContent).toBe("Body");
  });

  it("parses foreign headings and refuses smuggled invalid paragraph data", () => {
    expect(parse("<h3>Hello</h3>").blocks[0].attributes).toEqual({ headerLevel: 3 });
    const smuggled = parse(`<p data-nse-paragraph='{"textLists":[{"id":"!","marker":"disc"}]}'>x</p>`);
    expect(smuggled.blocks[0].attributes ?? {}).toEqual({});
  });

  it("numbers lists continuously per id, across nested items, and restarts on a new id", () => {
    const outer = decimal("outer"), nested: NSETextList = { id: "inner", marker: "disc" };
    const content = attributedContent([
      paragraph([textRun("one")], { textLists: [outer] }),
      paragraph([textRun("nested")], { textLists: [outer, nested] }),
      paragraph([textRun("two")], { textLists: [outer] }),
      paragraph([textRun("break")]),
      paragraph([textRun("again")], { textLists: [outer] }),
      paragraph([textRun("five")], { textLists: [decimal("other", 5)] }),
      paragraph([textRun("six")], { textLists: [decimal("other", 5)] }),
    ]);
    expect(nseTextListMarkers(content)).toEqual(["1.", "•", "2.", null, "1.", "5.", "6."]);
    expect([4, 9, 27].map(n => formatNSETextListMarker("lower-roman", n))).toEqual(["iv.", "ix.", "xxvii."]);
    expect([1, 26, 27].map(n => formatNSETextListMarker("upper-alpha", n))).toEqual(["A.", "Z.", "AA."]);
  });

  it("draws markers as decorations, never as text", () => {
    const content = attributedContent([paragraph([textRun("one")], { textLists: [decimal("l")] }), paragraph([textRun("two")], { textLists: [decimal("l")] })]);
    const { textbox } = mount(content);
    const items = [...textbox.querySelectorAll("[data-nse-list-marker]")] as HTMLElement[];
    expect(items.map(item => item.dataset.nseListMarker)).toEqual(["1.", "2."]);
    expect(textbox.textContent).toBe("onetwo");
    expect(attributedContentText(content)).toBe("one\ntwo");
    expect(items[0].style.paddingInlineStart).toContain("1.75em");
  });

  it("computes markers for a large list document quickly", () => {
    const list = decimal("big");
    const content = attributedContent(Array.from({ length: 1000 }, (_, i) => paragraph([textRun(`item ${i}`)], { textLists: [list] })));
    const started = performance.now();
    const markers = nseTextListMarkers(content);
    expect(performance.now() - started).toBeLessThan(50);
    expect(markers[999]).toBe("1000.");
  });

  it("renders resolved image attachments at their bounds and falls back to the placeholder", () => {
    const run = attachmentRun({ id: "img.one", kind: "image", source: { kind: "blob", blobId: "bytes.one" }, alt: "A glass decanter", bounds: { width: 320, height: 200 } });
    const content = attributedContent([paragraph([run])]);
    const resolved = mount(content, () => ({ src: "https://example.test/decanter.jpg" }));
    const image = resolved.textbox.querySelector(".nse-text-attachment img")!;
    expect(image.alt).toBe("A glass decanter");
    expect(image.width).toBe(320);
    act(() => { image.dispatchEvent(new Event("error")); });
    expect(resolved.textbox.querySelector(".nse-text-attachment img")).toBeNull();
    expect(resolved.textbox.querySelector(".nse-text-attachment")?.textContent).toBe("A glass decanter");
    cleanup();
    const unresolved = mount(content);
    expect(unresolved.textbox.querySelector(".nse-text-attachment img")).toBeNull();
    expect(unresolved.textbox.querySelector("[role=img]")?.getAttribute("aria-label")).toBe("A glass decanter");
    cleanup();
    const unsafe = mount(content, () => ({ src: "javascript:alert(1)" }));
    expect(unsafe.textbox.querySelector(".nse-text-attachment img")).toBeNull();
  });

  it("draws a font face through the host's resolver and keeps explicit bold", () => {
    const content = attributedContent([paragraph([textRun("Face", { font: { familyId: "prelude-condensed", face: "prelude-condensed-light", size: 18 } }), textRun("Bold", { bold: true, font: { familyId: "prelude-condensed", face: "prelude-condensed-light" } })])]);
    const owner = createInMemoryNSETextOwner({ content });
    const session = new TextEditingSession({ id: "fonts", owner });
    render(<NSETextView session={session} label="Doc" fontResolver={font => font.face === "prelude-condensed-light" ? { family: '"Prelude Condensed", system-ui, sans-serif', weight: 300 } : null} />);
    const [face, bold] = [...screen.getByRole("textbox").querySelectorAll("span[data-nse-attributes]")] as HTMLElement[];
    expect(face!.style.fontFamily).toContain("Prelude Condensed");
    expect(face!.style.fontWeight).toBe("300");
    expect(face!.style.fontSize).toBe("18px");
    expect(bold!.style.fontWeight).toBe("700");
  });
});
