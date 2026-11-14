// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEWindowController, nseWindowInternals, type WindowMount } from "../../src/NSE/Application/NSEWindowController";
import { WindowLayoutContext, WindowLayoutModel, useNSEContentLayoutProperties, useNSEWindowChromeObstruction } from "../../src/NSE/Layout/windowChromeObstructions";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  const callbacks = new Map<number, FrameRequestCallback>(); let sequence = 0;
  const model = new WindowLayoutModel({ bounds: { x: 0, y: 0, width: 800, height: 600 }, requestFrame: callback => { callbacks.set(++sequence, callback); return sequence; }, cancelFrame: id => { callbacks.delete(id); } });
  const flush = () => { const pending = [...callbacks.values()]; callbacks.clear(); act(() => { for (const callback of pending) callback(0); }); };
  const controller = new NSEWindowController();
  const detach = controller[nseWindowInternals].attach({ windowId: "layout-window", contentLayoutGuide: model,
    getSnapshot: () => ({ title: "Document", bounds: { x: 0, y: 0, width: 800, height: 600 }, state: "open" }), subscribe: () => () => {},
    setTitle() {}, registerCloseGuard: () => () => {}, focus() {}, minimise() {}, zoom() {}, close: async () => ({ outcome: "closed" }),
    presentAlert: async () => "ok", presentModalAlert: async () => "ok",
  } as WindowMount);
  return { model, controller, flush, callbacks, dispose: () => { detach(); controller.dispose(); model.dispose(); } };
}
function Bar({ height }: { height: number }) { useNSEWindowChromeObstruction("top", height, false); return <header style={{ height }} />; }
function Content() { return <div data-testid="content" style={useNSEContentLayoutProperties()} />; }
function Window({ model, toolbar = true }: { model: WindowLayoutModel; toolbar?: boolean }) {
  return <WindowLayoutContext.Provider value={model}><Bar height={44} />{toolbar ? <Bar height={38} /> : null}<Content /></WindowLayoutContext.Provider>;
}

describe("window content layout", () => {
  it("reports the title bar and toolbar through the public window guide", () => {
    const fixture = setup();
    render(<Window model={fixture.model} />); fixture.flush();
    expect(fixture.controller.window.contentLayoutRect).toEqual({ x: 0, y: 82, width: 800, height: 518 });
    expect(fixture.controller.window.contentLayoutGuide.frame).toEqual(fixture.controller.window.contentLayoutRect);
    fixture.dispose();
  });
  it("publishes a toolbar removal once and keeps the guide identity", () => {
    const fixture = setup();
    const view = render(<Window model={fixture.model} />); fixture.flush();
    const guide = fixture.controller.window.contentLayoutGuide, listener = vi.fn();
    const stop = guide.observe(listener);
    view.rerender(<Window model={fixture.model} toolbar={false} />); fixture.flush();
    expect(fixture.controller.window.contentLayoutGuide).toBe(guide);
    expect(guide.frame).toEqual({ x: 0, y: 44, width: 800, height: 556 });
    expect(listener).toHaveBeenCalledTimes(1);
    fixture.flush(); expect(listener).toHaveBeenCalledTimes(1);
    stop(); fixture.dispose();
  });
  it("writes physical content-layout inset properties", () => {
    const fixture = setup();
    render(<Window model={fixture.model} />); fixture.flush();
    const style = screen.getByTestId("content").style;
    expect(style.getPropertyValue("--nse-content-layout-inset-top")).toBe("82px");
    for (const edge of ["left", "bottom", "right"]) expect(style.getPropertyValue(`--nse-content-layout-inset-${edge}`)).toBe("0px");
    fixture.dispose();
  });
  it("releases repeated obstruction registrations and batches changes", () => {
    const fixture = setup(), listener = vi.fn();
    const stop = fixture.model.observe(listener);
    for (let i = 0; i < 100; i++) fixture.model.registerChrome({ edge: "top", thickness: 44, translucent: false })();
    expect(fixture.callbacks.size).toBe(1);
    fixture.flush();
    expect(fixture.model.frame).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(listener).not.toHaveBeenCalled();
    stop(); fixture.dispose(); expect(fixture.callbacks.size).toBe(0);
  });
  it("only applies screen obstructions where they overlap the window", () => {
    const fixture = setup();
    fixture.model.setLogicalScreenInsets({ blockStart: 20, inlineStart: 0, blockEnd: 34, inlineEnd: 0 }, { x: 0, y: 0, width: 1000, height: 800 });
    fixture.model.setBounds({ x: 100, y: 100, width: 800, height: 600 }); fixture.flush();
    expect(fixture.model.frame).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    fixture.model.setBounds({ x: 0, y: 0, width: 1000, height: 800 }); fixture.flush();
    expect(fixture.model.frame).toEqual({ x: 0, y: 20, width: 1000, height: 746 });
    fixture.dispose();
  });
  it("shares one ResizeObserver across the window and its measured bars", () => {
    const observe = vi.fn(), unobserve = vi.fn(), disconnect = vi.fn(); let constructed = 0;
    vi.stubGlobal("ResizeObserver", class { constructor(_callback: ResizeObserverCallback) { constructed++; } observe = observe; unobserve = unobserve; disconnect = disconnect; });
    const fixture = setup(), root = document.createElement("div");
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
    const disconnectRoot = fixture.model.connectRoot(root);
    for (let i = 0; i < 100; i++) fixture.model.observeChrome(document.createElement("header"), "top", false)();
    expect(constructed).toBe(1); expect(unobserve).toHaveBeenCalledTimes(100);
    disconnectRoot(); fixture.dispose(); expect(disconnect).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
