// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEOutlineView } from "../../src/NSE/DataViews/Outline";
import { NSETreeController } from "../../src/NSE/Controllers/NSETreeController";
import { SourceListFrameProvider, type SourceListFrameContextValue } from "../../src/NSE/Navigation/SourceList/sourceListFrameContext";
import { defineNSEAppearance, NSEAppearanceProvider } from "../../src/NSE/Appearance";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

interface Node { readonly id: string; readonly label: string; readonly children: readonly Node[]; }
const nodes: readonly Node[] = [{ id: "controls", label: "Controls", children: [{ id: "buttons", label: "Buttons", children: [] }] }];
function sourceList() {
  const controller = new NSETreeController({ id: "source-list", content: nodes, getId: (node: Node) => node.id, getChildren: (node: Node) => node.children, withChildren: (node: Node, children: readonly Node[]) => ({ ...node, children }), selection: { mode: "single" } });
  controller.expand("controls");
  const view = <NSEOutlineView controller={controller} aria-label="Sections" selectionHighlightStyle="sourceList"
    idForItem={node => node.id} labelForItem={node => node.label} childrenForItem={node => node.children} isExpandable={node => node.children.length > 0}
    delegate={{ isGroupItem: id => id === "controls" }} />;
  return { controller, view };
}
const hosts: ClassApplicationHost[] = [];
afterEach(async () => { cleanup(); for (const host of hosts.splice(0)) await host.dispose(); });

describe("source-list chrome ownership", () => {
  it("honours a view's explicit appearance override inside a differently themed source-list frame", () => {
    const frame: SourceListFrameContextValue = { railWidth: 254, defaultWidth: 254, minWidth: 220, maxWidth: 320, setRailWidth: vi.fn(), railLabel: "Gallery", scheme: "dark" };
    const list = sourceList();
    const view = render(<SourceListFrameProvider value={frame}><NSEAppearanceProvider appearance={defineNSEAppearance({ id: "atmo", displayName: "Atmo" })} colourScheme="light">{list.view}</NSEAppearanceProvider></SourceListFrameProvider>);
    expect(view.container.querySelector(".nse-appearance-provider")?.getAttribute("data-mode")).toBe("light");
    expect(view.container.querySelector('[data-style="source-list"]')).not.toBeNull();
    list.controller.dispose();
  });

  it("collapses group rows while retaining their content inert, and lets the controller own expansion", () => {
    const list = sourceList();
    const view = render(list.view);
    fireEvent.click(screen.getByRole("button", { name: "Collapse Controls" }));
    expect(list.controller.getSnapshot().expandedIds.has("controls")).toBe(false);
    const collapsed = view.container.querySelector('.nse-outline-children[data-collapsed="true"]')!;
    expect(collapsed.hasAttribute("inert")).toBe(true);
    expect(collapsed.textContent).toContain("Buttons");
    act(() => list.controller.expand("controls"));
    expect(screen.getByRole("treeitem", { name: /Buttons/ })).not.toBeNull();
    act(() => list.controller.collapse("controls"));
    expect(list.controller.getSnapshot().expandedIds.has("controls")).toBe(false);
    list.controller.dispose();
  });

  it("keeps a caller's search header beside the source list without stealing its Home key", () => {
    const list = sourceList();
    const view = render(<section data-testid="source-scroll" style={{ overflow: "auto" }}><header><input aria-label="Find sections" /></header>{list.view}</section>);
    const scroll = screen.getByTestId("source-scroll");
    const header = screen.getByRole("textbox");
    expect(scroll.contains(screen.getByRole("treeitem", { name: /Buttons/ }))).toBe(true);
    fireEvent.change(header, { target: { value: "Button" } }); header.focus(); fireEvent.keyDown(header, { key: "Home" });
    expect(document.activeElement).toBe(header);
    expect((header as HTMLInputElement).value).toBe("Button");
    expect(view.container.querySelectorAll('.nse-outline-view[data-style="source-list"]')).toHaveLength(1);
    list.controller.dispose();
  });

  it("owns a single footer accessory in its window border, and retains content when the accessory goes", async () => {
    let window!: FooterWindow;
    class FooterWindow extends NSEWindowController {
      static override view = () => <input aria-label="Retained draft" defaultValue="Draft" />;
      constructor() { super(); window = this; }
      override windowDidLoad() {
        this.window.setContentBorderThickness(56, "minY");
        this.window.bottomBarAccessory = <footer><span>25 sections</span><span>Ready</span></footer>;
      }
    }
    class FooterApp extends NSEApplication { static override mainWindow = FooterWindow; }
    const host = createClassApplicationHost(FooterApp); hosts.push(host);
    await host.launch(); host.mountWindows(); await host.openMainWindow();
    const draft = await screen.findByRole("textbox", { name: "Retained draft" });
    fireEvent.change(draft, { target: { value: "Edited draft" } });
    expect(document.querySelectorAll("footer")).toHaveLength(1);
    expect(document.querySelector('[data-nse-part="bottom-bar-accessory"] footer')?.textContent).toContain("25 sections");
    expect(document.querySelector('[data-nse-part="bottom-bar-accessory"]')?.getAttribute("style")).toContain("56px");
    await act(async () => { window.window.bottomBarAccessory = null; window.window.setContentBorderThickness(0, "minY"); });
    expect(document.querySelector("footer")).toBeNull();
    expect(screen.getByRole("textbox")).toBe(draft); expect((draft as HTMLInputElement).value).toBe("Edited draft");
  });
});
