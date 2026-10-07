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
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachmentRun, attributedContent, createInMemoryNSETextOwner, paragraph, textRun, type NSEAttributedAttachmentRun } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import { NSETextView } from "../../../src/NSE/TextEditing/NSETextView";
import { nseAttachmentUpdateOperations, selectedNSETextAttachment } from "../../../src/NSE/TextEditing/textStructureCommands";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const source = "data:image/png;base64,iVBORw0KGgo=";
const picture = (extra: Partial<Parameters<typeof attachmentRun>[0]> = {}) => attachmentRun({
  id: "photo", kind: "image", source: { kind: "document-resource", resourceId: "photo-asset" }, alt: "A photo",
  intrinsicSize: { inline: 800, block: 600 }, bounds: { width: 400, height: 300 }, ...extra,
});
const resolver = () => ({ src: source, naturalWidth: 800, naturalHeight: 600 });
const mount = (run: NSEAttributedAttachmentRun, onDropFiles?: (files: readonly File[], location: number) => boolean | void) => {
  const owner = createInMemoryNSETextOwner({ content: attributedContent([paragraph([textRun("Before "), run, textRun(" after")], { alignment: "centre" })]) });
  const session = new TextEditingSession({ id: "view", owner });
  const { container } = render(<NSETextView session={session} label="Document" attachmentResolver={resolver} onDropFiles={onDropFiles} />);
  const textbox = container.querySelector<HTMLElement>("[role=textbox]")!;
  return { owner, session, textbox, cell: () => textbox.querySelector<HTMLElement>(".nse-text-attachment")! };
};
const update = (session: TextEditingSession, changes: Parameters<typeof nseAttachmentUpdateOperations>[2]) => act(() => {
  session.commit(nseAttachmentUpdateOperations(session.getSnapshot().model, { location: 7, length: 1 }, changes), undefined, { actionName: "Change Image" });
});

describe("attachment placement and appearance", () => {
  it("validates text wrap and keeps inline placement implicit", () => {
    expect(picture({ placement: { wrap: "around", alignment: "end", textFit: "shape", spacing: 12, alphaThreshold: 0.5 } }).placement).toEqual({ wrap: "around", alignment: "end", textFit: "shape", spacing: 12, alphaThreshold: 0.5 });
    expect(picture({ placement: { wrap: "inline" } }).placement).toBeUndefined();
    expect(() => picture({ placement: { wrap: "around", alignment: "centre" } })).toThrow(/centred/);
    expect(() => picture({ placement: { wrap: "behind" as never } })).toThrow(/wrap/);
    expect(() => picture({ placement: { wrap: "around", spacing: 500 } })).toThrow(/spacing/);
  });

  it("validates borders, shadows, reflection and adjustments", () => {
    const appearance = { border: { kind: "line", pattern: "dashed", width: 5, colour: "#000000" }, shadow: { kind: "curved", blur: 10, offset: 1, opacity: 1, angle: 270, colour: "#000000", curvature: 0.2 }, reflection: 0.5, opacity: 0.9, exposure: 0.1, saturation: -0.2, rotation: 15, flipHorizontal: true } as const;
    expect(picture({ appearance }).appearance).toEqual(appearance);
    expect(picture({ appearance: {} }).appearance).toBeUndefined();
    expect(() => picture({ appearance: { border: { kind: "line", pattern: "wavy" as never, width: 1, colour: "#000000" } } })).toThrow(/pattern/);
    expect(() => picture({ appearance: { shadow: { kind: "drop", blur: 1, offset: 1, opacity: 2, angle: 0, colour: "#000000" } } })).toThrow(/shadow/);
    expect(() => picture({ appearance: { exposure: 3 } })).toThrow(/exposure/);
  });

  it("draws wrap, shape fit and appearance on the image cell", () => {
    const { cell } = mount(picture({ placement: { wrap: "around", alignment: "end", textFit: "shape", spacing: 18, alphaThreshold: 0.4 },
      appearance: { shadow: { kind: "drop", blur: 10, offset: 4, opacity: 0.5, angle: 270, colour: "#000000" }, opacity: 0.8, rotation: 10, reflection: 0.5 } }));
    expect(cell().dataset).toMatchObject({ display: "image", wrap: "around", align: "end", textFit: "shape" });
    expect(cell().style.getPropertyValue("shape-image-threshold")).toBe("0.4");
    expect(cell().style.getPropertyValue("shape-margin")).toBe("18px");
    expect(cell().style.getPropertyValue("shape-outside")).toContain("data:image/png");
    const image = cell().querySelector("img")!;
    expect(image.style.filter).toContain("drop-shadow(0px 4px 5px");
    expect(image.style.opacity).toBe("0.8");
    expect(image.style.transform).toBe("rotate(10deg)");
    expect(cell().querySelector<HTMLElement>(".nse-text-attachment-box")!.style.marginBlockEnd).toBe("150px");
    const block = mount(picture({ id: "other", placement: { wrap: "above-and-below" } }));
    expect(block.cell().dataset).toMatchObject({ wrap: "above-and-below", align: "centre" });
  });
});

describe("attachment editing", () => {
  it("changes an attachment's wrap, size and look as one action, keeping its paragraph and identity", () => {
    const { owner, session, cell } = mount(picture());
    act(() => session.select(7, 8));
    expect(selectedNSETextAttachment(session.getSnapshot().model, session.getSnapshot().selection.range)?.run.id).toBe("photo");
    update(session, { placement: { wrap: "around", alignment: "start" }, bounds: { width: 200, height: 150 }, appearance: { reflection: 0.3 } });
    const block = owner.getSnapshot().attributedContent.blocks[0]!;
    expect(owner.getSnapshot().attributedContent.blocks).toHaveLength(1);
    expect(block.attributes).toEqual({ alignment: "centre" });
    expect(block.runs[1]).toMatchObject({ kind: "attachment", id: "photo", bounds: { width: 200, height: 150 }, placement: { wrap: "around", alignment: "start" }, appearance: { reflection: 0.3 }, source: { resourceId: "photo-asset" } });
    act(() => session.select(7, 8));
    expect(cell().dataset).toMatchObject({ wrap: "around", align: "start", selected: "true" });
    update(session, { placement: null, appearance: null, source: { kind: "document-resource", resourceId: "other-asset" } });
    expect(owner.getSnapshot().attributedContent.blocks[0]!.runs[1]).toMatchObject({ id: "photo", source: { resourceId: "other-asset" }, bounds: { width: 200, height: 150 } });
    expect(owner.getSnapshot().attributedContent.blocks[0]!.runs[1]).not.toHaveProperty("placement");
    expect(() => nseAttachmentUpdateOperations(session.getSnapshot().model, { location: 0, length: 1 }, { alt: "x" })).toThrow(/Select one attachment/);
  });

  it("shows eight handles on a selected image and resizes it in proportion from any of them", () => {
    const { owner, session, cell } = mount(picture());
    act(() => session.select(7, 8));
    const handles = () => [...cell().querySelectorAll<HTMLElement>(".nse-text-attachment-handle")];
    expect(handles().map((handle) => handle.dataset.handle)).toEqual(["top-start", "top", "top-end", "end", "bottom-end", "bottom", "bottom-start", "start"]);
    const drag = (name: string, dx: number, dy: number) => {
      const image = cell().querySelector("img")!;
      vi.spyOn(image, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: image.width / 2, bottom: image.height / 2, width: image.width / 2, height: image.height / 2, toJSON() {} });
      Object.defineProperty(image, "offsetWidth", { configurable: true, value: image.width });
      Object.defineProperty(image, "offsetHeight", { configurable: true, value: image.height });
      const pointer = (type: string, target: Element, clientX: number, clientY: number) => {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
        Object.defineProperty(event, "pointerId", { value: 1 });
        act(() => { target.dispatchEvent(event); });
      };
      pointer("pointerdown", handles().find((handle) => handle.dataset.handle === name)!, 100, 100);
      pointer("pointermove", cell(), 100 + dx, 100 + dy);
      pointer("pointerup", cell(), 100 + dx, 100 + dy);
    };
    // The page is drawn at half size: 40 client pixels are 80 layout pixels.
    drag("bottom-end", 40, 0);
    expect(owner.getSnapshot().attributedContent.blocks[0]!.runs[1]).toMatchObject({ bounds: { width: 480, height: 360 } });
    expect(session.getSnapshot().selection.range).toEqual({ location: 7, length: 1 });
    // An edge handle follows its own axis; the image keeps its shape.
    drag("bottom", 0, 30);
    expect(owner.getSnapshot().attributedContent.blocks[0]!.runs[1]).toMatchObject({ bounds: { width: 560, height: 420 } });
    drag("start", 50, 0);
    expect(owner.getSnapshot().attributedContent.blocks[0]!.runs[1]).toMatchObject({ bounds: { width: 460, height: 345 } });
  });

  it("moves with the pointer rather than the browser's drag proxy: a press selects the image", () => {
    const { session, cell } = mount(picture());
    expect(cell().draggable).toBe(false);
    const image = cell().querySelector("img")!;
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, toJSON() {} });
    const press = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 30, clientY: 40, button: 0 });
    Object.defineProperty(press, "pointerId", { value: 7 });
    act(() => { image.dispatchEvent(press); });
    expect(press.defaultPrevented).toBe(true);
    expect(session.getSnapshot().selection.range).toEqual({ location: 7, length: 1 });
    const release = new MouseEvent("pointerup", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 });
    Object.defineProperty(release, "pointerId", { value: 7 });
    act(() => { document.dispatchEvent(release); });
    expect(session.getSnapshot().selection.range).toEqual({ location: 7, length: 1 });
  });

  it("offers dropped and pasted files to the owner at the drop location", () => {
    const onDropFiles = vi.fn(() => true);
    const { textbox, session } = mount(picture(), onDropFiles);
    const file = new File([new Uint8Array([1])], "photo.png", { type: "image/png" });
    act(() => session.select(3));
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { files: [file], getData: () => "", types: ["Files"] } });
    act(() => { textbox.dispatchEvent(paste); });
    expect(onDropFiles).toHaveBeenCalledWith([file], 3);
    expect(paste.defaultPrevented).toBe(true);
    const declined = mount(picture({ id: "second" }), () => false);
    const again = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(again, "clipboardData", { value: { files: [file], getData: () => "", types: ["Files"] } });
    act(() => { declined.textbox.dispatchEvent(again); });
    expect(again.defaultPrevented).toBe(false);
  });
});
