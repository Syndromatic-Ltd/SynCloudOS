// @vitest-environment jsdom
/** @jsxRuntime automatic */
// The automatic runtime is what application source compiles to, and what the mirror wraps.
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installNSEHookMirror, setNSEHook } from "../../src/NSE/Theme/contract/hookMirrorDOM";

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const tokens = (node: Element) => [...node.classList];
let uninstall: (() => void) | undefined;
afterEach(() => { uninstall?.(); uninstall = undefined; document.body.replaceChildren(); });

describe("mirror classes for hooks written without the JSX runtime", () => {
  it("mirrors an element built by hand, follows its value and removes tokens with the hook", async () => {
    uninstall = installNSEHookMirror(document);
    const row = document.createElement("div");
    row.className = "mine";
    row.setAttribute("data-nse-part", "row");
    document.body.append(row);
    await settle();
    expect(tokens(row)).toEqual(["mine", "nse:part", "nse:part=row"]);
    row.setAttribute("data-nse-part", "cell");
    row.dataset.nseSelected = "";
    await settle();
    expect(tokens(row)).toEqual(["mine", "nse:part", "nse:part=cell", "nse:selected"]);
    row.removeAttribute("data-nse-part");
    delete row.dataset.nseSelected;
    await settle();
    expect(tokens(row)).toEqual(["mine"]);
  });

  it("mirrors hooks already in the document, and descendants of an inserted subtree", async () => {
    document.body.innerHTML = '<p data-nse-control="box"></p>';
    uninstall = installNSEHookMirror(document);
    expect(tokens(document.body.firstElementChild!)).toEqual(["nse:control", "nse:control=box"]);
    const wrapper = document.createElement("section");
    wrapper.innerHTML = '<span data-nse-part="title"></span>';
    document.body.append(wrapper);
    await settle();
    expect(tokens(wrapper.firstElementChild!)).toEqual(["nse:part", "nse:part=title"]);
  });

  it("does not write to an element the JSX runtime already mirrored", async () => {
    uninstall = installNSEHookMirror(document);
    const add = vi.spyOn(DOMTokenList.prototype, "add");
    const { container } = render(<div data-nse-control="button" data-nse-hovered="" />);
    await settle();
    expect(tokens(container.firstElementChild!)).toEqual(["nse:control", "nse:control=button", "nse:hovered"]);
    expect(add).not.toHaveBeenCalled();
    add.mockRestore();
  });

  it("leaves data-carrying attributes and whitespace values without a value token", async () => {
    uninstall = installNSEHookMirror(document);
    const item = document.createElement("div");
    item.setAttribute("data-nse-toolbar-item-id", "save");
    item.setAttribute("data-nse-key-equivalent", " ");
    document.body.append(item);
    await settle();
    expect(tokens(item)).toEqual(["nse:key-equivalent"]);
  });

  it("setNSEHook writes the attribute and its tokens in the same call", () => {
    const surface = document.createElement("div");
    setNSEHook(surface, "placement", "block-end");
    expect(surface.getAttribute("data-nse-placement")).toBe("block-end");
    expect(tokens(surface)).toEqual(["nse:placement", "nse:placement=block-end"]);
    setNSEHook(surface, "placement", "block-start");
    expect(tokens(surface)).toEqual(["nse:placement", "nse:placement=block-start"]);
    setNSEHook(surface, "placement", null);
    expect(surface.hasAttribute("data-nse-placement")).toBe(false);
    expect(tokens(surface)).toEqual([]);
  });

  it("restores tokens when a renderer rewrites className on an element whose hook was set by hand", async () => {
    uninstall = installNSEHookMirror(document);
    const view = (name: string) => <div className={name} />;
    const { container, rerender } = render(view("one"));
    const node = container.firstElementChild!;
    setNSEHook(node, "placement", "block-end");
    rerender(view("two"));
    await settle();
    expect(tokens(node)).toEqual(["two", "nse:placement", "nse:placement=block-end"]);
  });

  it("is shared per document and stops when its last user leaves", async () => {
    const first = installNSEHookMirror(document), second = installNSEHookMirror(document);
    first(); first();
    const row = document.createElement("div");
    row.setAttribute("data-nse-part", "row");
    document.body.append(row);
    await settle();
    expect(tokens(row)).toEqual(["nse:part", "nse:part=row"]);
    second();
    const later = document.createElement("div");
    later.setAttribute("data-nse-part", "row");
    document.body.append(later);
    await settle();
    expect(tokens(later)).toEqual([]);
  });
});
