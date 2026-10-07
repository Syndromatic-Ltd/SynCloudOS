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
import { installNSEScrollIntoViewFixture } from "../fixtures/browser";
installNSEScrollIntoViewFixture();
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEScroller, NSEScrollView, NSEScrollViewController, computeScrollRectTarget, normalizeRTLScrollLeft } from "../../../src/NSE/Scroll";
import { NSEProgressIndicator } from "../../../src/NSE/Progress";
import { NSEProgressBar, NSEProgressButton, NSEProgressItem, NSEProgressSlider, NSESpinner } from "../../../src/NSE/Progress";
import { NSEAccordionView, NSETabGroup, NSETabView } from "../../../src/NSE/Navigation";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays";
import { NSEControlRuntimeProvider } from "../../../src/NSE/Controls/Core";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const navigationWorkArea = Object.freeze({ width: 1280, height: 720, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
const navigationPresentation = createStaticPresentationPort({ width: 1280, height: 720 });
function NavigationOverlay({ children }: { readonly children: React.ReactNode }) {
  const runtimePort = { runtimeId: "runtime:navigation", signal: new AbortController().signal, environment: { browser: { getDocument: () => document, getWindow: () => window }, workArea: { getSnapshot: () => navigationWorkArea, subscribe: () => () => undefined }, visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined }, presentation: navigationPresentation, setTimeout: (callback: () => void) => { callback(); return 0; }, clearTimeout: () => undefined }, restoreFocus: (_responderId: string, anchor: HTMLElement | null) => anchor?.focus(), reportPlacementFailure: () => undefined, wrapFocusScope: (_options: unknown, node: React.ReactNode) => node };
  return <NSEOverlayProvider runtimePort={runtimePort} defaultParentResponderId="workspace">{children}</NSEOverlayProvider>;
}

describe("scroll progress and navigation", () => {
  it("collapses an expanded item in multiple accordion mode and follows controlled replacement", () => {
    function Harness() {
      const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());
      return <><NSEAccordionView aria-label="Multiple sections" mode="multiple" expandedIds={expanded} onExpandedIdsChange={setExpanded} items={[{ id: "a", label: "A", render: () => "Alpha" }]} /><output data-testid="expanded-count">{expanded.size}</output><button type="button" onClick={() => setExpanded(new Set(["a"]))}>Replace expanded</button></>;
    }
    render(<Harness />);
    const disclosure = screen.getByRole("button", { name: "A" });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Replace expanded" }));
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  });

  it("exposes the mounted scroll controller and renders both scrollers with corner geometry", () => {
    const controllers: Array<NSEScrollViewController | null> = [];
    const view = render(<NSEScrollView aria-label="Canvas" axis="both" horizontalScrollerPolicy="always" verticalScrollerPolicy="always" controllerRef={(controller: NSEScrollViewController | null) => controllers.push(controller)}><div style={{ width: 800, height: 800 }}>Canvas content</div></NSEScrollView>);
    const host = screen.getByLabelText("Canvas") as HTMLElement;
    Object.defineProperties(host, { clientWidth: { configurable: true, value: 100 }, clientHeight: { configurable: true, value: 100 }, scrollWidth: { configurable: true, value: 800 }, scrollHeight: { configurable: true, value: 800 }, scrollTo: { configurable: true, value: vi.fn() } });
    expect(controllers.filter(Boolean)).toHaveLength(1);
    controllers.at(-1)?.scrollRectToVisible({ x: 400, y: 500, width: 20, height: 20 });
    expect(host.scrollTo).toHaveBeenCalledWith({ left: 320, top: 420, behavior: "auto" });
    expect(within(view.container).getByRole("slider", { name: "horizontal scroller" })).not.toBeNull();
    expect(within(view.container).getByRole("slider", { name: "vertical scroller" })).not.toBeNull();
    expect(view.container.querySelector('[data-nse-part="scroller-corner"]')).not.toBeNull();
  });

  it("rubber-bands horizontal and vertical boundaries for axis both without duplicate observers", () => {
    const add = vi.spyOn(HTMLElement.prototype, "addEventListener");
    render(<NSEScrollView aria-label="Both axes" axis="both"><div style={{ width: 800, height: 800 }}>Canvas</div></NSEScrollView>);
    const host = screen.getByLabelText("Both axes") as HTMLElement;
    Object.defineProperties(host, { clientWidth: { configurable: true, value: 100 }, clientHeight: { configurable: true, value: 100 }, scrollWidth: { configurable: true, value: 800 }, scrollHeight: { configurable: true, value: 800 }, scrollLeft: { configurable: true, writable: true, value: 0 }, scrollTop: { configurable: true, writable: true, value: 0 } });
    const horizontal = new WheelEvent("wheel", { deltaX: -20, deltaY: 0, cancelable: true });
    host.dispatchEvent(horizontal);
    expect(horizontal.defaultPrevented).toBe(true);
    const vertical = new WheelEvent("wheel", { deltaX: 0, deltaY: -20, cancelable: true });
    host.dispatchEvent(vertical);
    expect(vertical.defaultPrevented).toBe(true);
    expect(add.mock.calls.filter(([name, , options]) => name === "scroll" && (options as AddEventListenerOptions)?.passive)).toHaveLength(1);
  });
  it("connects one passive observer for every mounted scroll view without optional callbacks", () => {
    const add = vi.spyOn(HTMLElement.prototype, "addEventListener");
    const view = render(<NSEScrollView rubberBand={false} axis="both"><div style={{ minWidth: 400, minHeight: 400 }}>Content</div></NSEScrollView>);
    expect(add.mock.calls.filter(([name, , options]) => name === "scroll" && (options as AddEventListenerOptions)?.passive)).toHaveLength(1);
    view.unmount();
  });

  it("operates both axes through Page, Home, and End keyboard navigation", () => {
    const view = render(<NSEScrollView rubberBand={false} axis="both"><div style={{ minWidth: 800, minHeight: 800 }}>Content</div></NSEScrollView>);
    const root = view.container.querySelector(".nse-scroll-view") as HTMLElement;
    const scrollTo = vi.fn();
    Object.defineProperties(root, {
      clientWidth: { configurable: true, value: 200 }, clientHeight: { configurable: true, value: 160 },
      scrollWidth: { configurable: true, value: 800 }, scrollHeight: { configurable: true, value: 800 },
      scrollLeft: { configurable: true, writable: true, value: 40 }, scrollTop: { configurable: true, writable: true, value: 30 },
      scrollTo: { configurable: true, value: scrollTo },
    });
    expect(root.tabIndex).toBe(0);
    fireEvent.keyDown(root, { key: "PageDown", shiftKey: true });
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 240 }));
    fireEvent.keyDown(root, { key: "End" });
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 600, top: 640 }));
    fireEvent.keyDown(root, { key: "Home" });
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 0, top: 0 }));
  });

  it("allows the initially expanded item in single accordion mode to collapse", () => {
    const change = vi.fn();
    render(<NSEAccordionView aria-label="Sections" items={[{ id: "a", label: "A", render: () => "Alpha" }]} expandedIds={new Set(["a"])} mode="single" onExpandedIdsChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect([...change.mock.calls[0][0]]).toEqual([]);
  });
  it("normalizes RTL geometry and scrolls rectangles into view", () => { expect(normalizeRTLScrollLeft(-20, 100, "negative")).toBe(20); const node = { scrollLeft: 0, scrollTop: 0, clientWidth: 100, clientHeight: 100, scrollWidth: 300, scrollHeight: 300, scrollTo: vi.fn() } as unknown as HTMLElement; const controller = new NSEScrollViewController(node); controller.scrollRectToVisible({ x: 150, y: 160, width: 20, height: 20 }); expect(node.scrollTo).toHaveBeenCalledWith({ left: 70, top: 80, behavior: "auto" }); });
  it("computes bounded inset-aware scroll geometry for zero and oversized content", () => { expect(computeScrollRectTarget({ position: { left: 0, top: 0 }, viewport: { width: 100, height: 100 }, content: { width: 0, height: 0 }, rect: { x: 20, y: 30, width: 10, height: 10 }, insets: { top: 4, right: 5, bottom: 6, left: 7 } })).toEqual({ left: 0, top: 0 }); expect(computeScrollRectTarget({ position: { left: 10, top: 20 }, viewport: { width: 100, height: 100 }, content: { width: 300, height: 300 }, rect: { x: 180, y: 190, width: 20, height: 20 }, insets: { top: 4, right: 5, bottom: 6, left: 7 } })).toEqual({ left: 105, top: 116 }); });
  it("claims nested ownership and installs one passive coalesced observer", () => { const node = document.createElement("div"); const add = vi.spyOn(node, "addEventListener"); const remove = vi.spyOn(node, "removeEventListener"); const first = new NSEScrollViewController(node).connect(() => {}); const second = new NSEScrollViewController(node).connect(() => {}); expect(add.mock.calls.filter(([name, , options]) => name === "scroll" && (options as AddEventListenerOptions)?.passive)).toHaveLength(1); expect(add.mock.calls.filter(([name, , options]) => name === "wheel" && !(options as AddEventListenerOptions)?.passive)).toHaveLength(0); expect(NSEScrollViewController.claim(node, 7)).toBe(true); expect(NSEScrollViewController.claim(node, 8)).toBe(false); NSEScrollViewController.release(node, 7); expect(NSEScrollViewController.claim(node, 8)).toBe(true); first(); expect(remove).not.toHaveBeenCalled(); second(); expect(remove.mock.calls.filter(([name]) => name === "scroll")).toHaveLength(1); });
  it("connects the passive coalesced observer through the real scroll view", () => { vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; }); const add = vi.spyOn(HTMLElement.prototype, "addEventListener"); const remove = vi.spyOn(HTMLElement.prototype, "removeEventListener"); const observed = vi.fn(); const view = render(<NSEScrollView onScrollSnapshot={observed}><div style={{ height: 400 }}>Content</div></NSEScrollView>); const root = view.container.querySelector(".nse-scroll-view") as HTMLElement; expect(add.mock.calls.filter(([name, , options]) => name === "scroll" && (options as AddEventListenerOptions)?.passive)).toHaveLength(1); fireEvent.scroll(root); expect(observed).toHaveBeenCalledTimes(1); view.unmount(); expect(remove.mock.calls.filter(([name]) => name === "scroll")).toHaveLength(1); vi.unstubAllGlobals(); });
  it("publishes inset-aware both-axis geometry and tears down resize observation",()=>{let notify!:()=>void;const disconnect=vi.fn();class ResizeObserverStub{constructor(callback:()=>void){notify=callback}observe=vi.fn();disconnect=disconnect}vi.stubGlobal("ResizeObserver",ResizeObserverStub);const geometry=vi.fn();const view=render(<NSEScrollView axis="both" horizontalScrollerPolicy="always" verticalScrollerPolicy="hidden" scrollInsets={{top:1,right:2,bottom:3,left:4}} onGeometryChange={geometry}><div>Content</div></NSEScrollView>);const root=view.container.querySelector(".nse-scroll-view")as HTMLElement;Object.defineProperties(root,{clientWidth:{configurable:true,value:100},clientHeight:{configurable:true,value:80},scrollWidth:{configurable:true,value:240},scrollHeight:{configurable:true,value:160}});notify();expect(geometry).toHaveBeenLastCalledWith({viewport:{width:100,height:80},content:{width:240,height:160},position:{left:0,top:0},insets:{top:1,right:2,bottom:3,left:4}});expect(root.getAttribute("data-axis")).toBe("both");expect(root.style.overflowX).toBe("scroll");expect(root.style.overflowY).toBe("hidden");expect((root.firstElementChild as HTMLElement).style.padding).toBe("1px 2px 3px 4px");view.unmount();expect(disconnect).toHaveBeenCalledOnce();vi.unstubAllGlobals();});
  it("updates rendered scroller ranges after resize even without an external geometry callback", () => {
    let notify: (() => void) | undefined;
    const disconnect = vi.fn();
    class ResizeObserverStub { constructor(callback: () => void) { notify = callback; } observe = vi.fn(); disconnect = disconnect; }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    let width = 404;
    const view = render(<NSEScrollView axis="both" horizontalScrollerPolicy="always" verticalScrollerPolicy="always"><div>Content</div></NSEScrollView>);
    const root = view.container.querySelector(".nse-scroll-view") as HTMLElement;
    Object.defineProperties(root, {
      clientWidth: { configurable: true, get: () => width }, clientHeight: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 650 }, scrollHeight: { configurable: true, value: 300 },
    });
    expect(notify).toBeTypeOf("function");
    act(() => notify?.());
    expect((screen.getByRole("slider", { name: "horizontal scroller" }) as HTMLInputElement).max).toBe("246");
    width = 328;
    act(() => notify?.());
    expect((screen.getByRole("slider", { name: "horizontal scroller" }) as HTMLInputElement).max).toBe("322");
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("keeps a nested rubber-band gesture with the nearest mounted scroll owner", () => {
    const view = render(<NSEScrollView aria-label="Outer canvas" axis="both"><div><NSEScrollView aria-label="Inner canvas" axis="both"><div>Inner content</div></NSEScrollView></div></NSEScrollView>);
    const outer = screen.getByLabelText("Outer canvas") as HTMLElement;
    const inner = screen.getByLabelText("Inner canvas") as HTMLElement;
    for (const host of [outer, inner]) Object.defineProperties(host, {
      clientWidth: { configurable: true, value: 100 }, clientHeight: { configurable: true, value: 100 },
      scrollWidth: { configurable: true, value: 400 }, scrollHeight: { configurable: true, value: 400 },
      scrollLeft: { configurable: true, writable: true, value: 0 }, scrollTop: { configurable: true, writable: true, value: 0 },
    });
    const outerContent = outer.querySelector(":scope > .nse-scroll-view-content") as HTMLElement;
    const innerContent = inner.querySelector(":scope > .nse-scroll-view-content") as HTMLElement;
    const wheel = new WheelEvent("wheel", { deltaX: -24, deltaY: -16, bubbles: true, cancelable: true });
    inner.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(innerContent.style.transform).not.toBe("");
    expect(outerContent.style.transform).toBe("");
    view.unmount();
  });
  it("keeps an always-visible zero-range scroller disabled", () => { render(<NSEScroller orientation="vertical" policy="always" value={0} maximum={0} onValueChange={() => {}} />); expect(screen.getByRole("slider")).toHaveProperty("disabled", true); });
  it("exposes the spinner's accessible status and visual variant", () => {
    render(<NSESpinner size="large" tone="dark" label="Loading records" />);
    const spinner = screen.getByRole("status", { name: "Loading records" });
    expect(spinner.getAttribute("data-size")).toBe("large");
    expect(spinner.getAttribute("data-tone")).toBe("dark");
    expect(spinner.querySelector(".nse-control-spinner-sprite")?.getAttribute("aria-hidden")).toBe("true");
  });
  it("keeps value tabs separate from panel-owning tab views", () => {
    const change = vi.fn();
    render(
      <>
        <NSETabGroup
          label="Choices"
          defaultValue="first"
          selectionHaptic={false}
          options={[{ value: "first", label: "First" }, { value: "second", label: "Second" }]}
          onValueChange={change}
        />
        <NSETabView
          aria-label="Pages"
          selectedId="first"
          items={[{ id: "first", label: "First", render: () => "First panel" }]}
        />
      </>,
    );
    const group = screen.getByRole("tablist", { name: "Choices" });
    expect(within(group).queryByRole("tabpanel")).toBeNull();
    fireEvent.keyDown(within(group).getByRole("tab", { name: "First" }), { key: "ArrowRight" });
    expect(change).toHaveBeenCalledWith("second");
    expect(screen.getByRole("tabpanel").textContent).toBe("First panel");
  });

  it("uses one normalized progress contract for bars, buttons, items, and locked sliders", () => {
    const cancel = vi.fn();
    const { container } = render(
      <>
        <NSEProgressBar value={23} min={10} max={40} snap={5} altValue={35} label="Transfer" content="Transfer" animatePosition={false} />
        <NSEProgressButton value={58} max={100} label="Transfer action" onCancel={cancel}>Transfer</NSEProgressButton>
        <NSEProgressItem value={42} max={100} variant="pill" label="Transfer item">Item</NSEProgressItem>
        <NSEProgressSlider value={20} min={10} max={30} snap={5} lockBar altBarPosition={28} progressLabel="Buffer" />
      </>,
    );
    const bar = screen.getByRole("progressbar", { name: "Transfer" });
    expect(bar.getAttribute("aria-valuemin")).toBe("10");
    expect(bar.getAttribute("aria-valuemax")).toBe("40");
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(bar.style.getPropertyValue("--nse-control-progress")).toBe("50%");
    expect(Number.parseFloat(bar.style.getPropertyValue("--nse-control-progress-alt"))).toBeCloseTo((25 / 30) * 100, 12);
    expect(bar.getAttribute("data-animate")).toBe("false");
    expect(screen.getByRole("button", { name: "Transfer action" }).style.getPropertyValue("--nse-control-progress")).toBe("58%");
    expect(screen.getByRole("progressbar", { name: "Transfer item" }).getAttribute("data-variant")).toBe("pill");
    const sliderBar = screen.getByRole("progressbar", { name: "Buffer" });
    expect(sliderBar.getAttribute("aria-valuemin")).toBe("10");
    expect(sliderBar.getAttribute("aria-valuemax")).toBe("30");
    expect(sliderBar.getAttribute("aria-valuenow")).toBe("20");
    expect(sliderBar.style.getPropertyValue("--nse-control-progress-alt")).toBe("90%");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(container.querySelector(".nse-control-progress-button-fill")).not.toBeNull();
  });

  it("renders determinate, suspended, error and hidden progress semantically", () => { const { rerender } = render(<NSEProgressIndicator aria-label="Load" state={{ kind: "determinate", value: 5, minimum: 0, maximum: 10 }} />); expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("5"); rerender(<NSEProgressIndicator aria-label="Load" state={{ kind: "error", message: "Failed" }} />); expect(screen.getByRole("status").textContent).toContain("Failed"); rerender(<NSEProgressIndicator aria-label="Load" state={{ kind: "hidden" }} />); expect(screen.queryByRole("progressbar")).toBeNull(); });
  it("uses a static indeterminate fallback under reduced motion", () => { render(<NSEProgressIndicator aria-label="Load" state={{ kind: "indeterminate" }} reducedMotion />); expect(screen.getByRole("progressbar").getAttribute("data-motion")).toBe("static"); });
  it("moves tab focus with roving keys and lazily renders content", () => { const change = vi.fn(); render(<NSETabView aria-label="Pages" items={[{ id: "a", label: "A", render: () => "Alpha" }, { id: "b", label: "B", render: () => "Beta" }]} selectedId="a" onSelectedIdChange={change} />); fireEvent.keyDown(screen.getByRole("tab", { name: "A" }), { key: "ArrowRight" }); expect(change).toHaveBeenCalledWith("b", "keyboard"); expect(screen.getByRole("tabpanel").textContent).toBe("Alpha"); });
  it("supports tab Home/End and keep-alive panel lifecycle", () => { const change = vi.fn(); render(<NSETabView aria-label="Pages" keepAlive items={[{ id: "a", label: "A", render: () => "Alpha" }, { id: "off", label: "Off", disabled: true, render: () => "Off" }, { id: "b", label: "B", render: () => "Beta" }]} selectedId="a" onSelectedIdChange={change} />); fireEvent.keyDown(screen.getByRole("tab", { name: "A" }), { key: "End" }); expect(change).toHaveBeenLastCalledWith("b", "keyboard"); expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(2); });
  it("hosts tab overflow in an overlay and selects an overflow item", () => { const change = vi.fn(); render(<NavigationOverlay><NSETabView aria-label="Pages" maximumVisibleTabs={2} items={[{ id: "a", label: "A", render: () => "Alpha" }, { id: "b", label: "B", render: () => "Beta" }, { id: "c", label: "C", render: () => "Gamma" }]} selectedId="a" onSelectedIdChange={change} /></NavigationOverlay>); fireEvent.click(screen.getByRole("button", { name: "More Pages" })); expect(screen.getByRole("listbox")).not.toBeNull(); fireEvent.click(screen.getByRole("option", { name: "C" })); expect(change).toHaveBeenCalledWith("c", "pointer"); });
  it("requests tab close and keyboard reorder with deterministic focus", () => { const close = vi.fn(); const reorder = vi.fn(); const change = vi.fn(); render(<NSETabView aria-label="Pages" items={[{ id: "a", label: "A", closable: true, render: () => "Alpha" }, { id: "b", label: "B", closable: true, render: () => "Beta" }]} selectedId="a" onSelectedIdChange={change} onRequestClose={close} onRequestReorder={reorder} />); const tab = screen.getByRole("tab", { name: "A" }); fireEvent.keyDown(tab, { key: "ArrowRight", altKey: true }); expect(reorder).toHaveBeenCalledWith("a", 1); fireEvent.click(screen.getByRole("button", { name: "Close A" })); expect(change).toHaveBeenCalledWith("b", "keyboard"); expect(close).toHaveBeenCalledWith("a"); });
  it("selects command tabs only after canonical command execution", async () => { const change = vi.fn(); const dispatch = vi.fn(async () => ({ status: "executed" as const, commandId: "tabs.open", responderId: "workspace", operationId: "op", correlationId: "correlation", value: undefined })); const port = { signal: new AbortController().signal, commands: { getPresentationGeneration: () => ({ registryGeneration: 1, responderGeneration: 1 }), validate: vi.fn(async () => ({ commandId: "tabs.open", responderId: "workspace", title: "Open B", enabled: true, denied: false, hidden: false, state: "off" as const })), prepareDispatch: vi.fn(async () => ({ status: "accepted" as const, acceptance: { commandId: "tabs.open", responderId: "workspace" } as never })), dispatch } }; render(<NSEControlRuntimeProvider port={port}><NSETabView aria-label="Pages" items={[{ id: "a", label: "A", render: () => "Alpha" }, { id: "b", label: "B", commandId: "tabs.open", commandPayload: { id: "b" }, render: () => "Beta" }]} selectedId="a" onSelectedIdChange={change} /></NSEControlRuntimeProvider>); const tab = screen.getByRole("tab", { name: "B" }); await waitFor(() => expect((tab as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(tab); await waitFor(() => expect(dispatch).toHaveBeenCalled()); expect(change).toHaveBeenCalledWith("b", "pointer"); });
  it("uses per-instance tab and accordion relationship ids", () => { render(<><NSETabView aria-label="First pages" items={[{ id: "a", label: "A", render: () => "Alpha" }]} selectedId="a" onSelectedIdChange={() => {}} /><NSETabView aria-label="Second pages" items={[{ id: "a", label: "A", render: () => "Alpha" }]} selectedId="a" onSelectedIdChange={() => {}} /><NSEAccordionView aria-label="First sections" items={[{ id: "a", label: "Section", render: () => "Body" }]} expandedIds={new Set(["a"])} mode="single" onExpandedIdsChange={() => {}} /><NSEAccordionView aria-label="Second sections" items={[{ id: "a", label: "Section", render: () => "Body" }]} expandedIds={new Set(["a"])} mode="single" onExpandedIdsChange={() => {}} /></>); const ids = [...document.querySelectorAll("[id]")].map((node) => node.id); expect(new Set(ids).size).toBe(ids.length); });
  it("implements accessible single and multiple accordions", () => { const change = vi.fn(); render(<NSEAccordionView aria-label="Sections" items={[{ id: "a", label: "A", render: () => "Alpha" }, { id: "b", label: "B", render: () => "Beta" }]} expandedIds={new Set(["a"])} mode="single" onExpandedIdsChange={change} />); expect(screen.getByRole("button", { name: "A" }).getAttribute("aria-expanded")).toBe("true"); fireEvent.click(screen.getByRole("button", { name: "B" })); expect([...change.mock.calls[0][0]]).toEqual(["b"]); });
});
