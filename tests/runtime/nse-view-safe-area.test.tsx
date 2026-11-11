// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEView } from "../../src/NSE/Views/NSEView";
import { NSEViewController, nseUpdateSafeArea } from "../../src/NSE/Application/NSEViewController";
import { NSEEdgeInsetsMake } from "../../src/NSE/Layout/NSEEdgeInsets";
import { NSEWindowLayoutContext, NSEWindowLayoutModel } from "../../src/NSE/Layout/windowChromeObstructions";
import { useNSESafeArea } from "../../src/NSE/Layout/useNSESafeArea";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Read({ id = "read" }: { id?: string }) {
  return <output data-testid={id}>{JSON.stringify(useNSESafeArea())}</output>;
}
function fixture() {
  const pending: FrameRequestCallback[] = [];
  const model = new NSEWindowLayoutModel({ bounds: { x: 0, y: 0, width: 800, height: 600 }, requestFrame: callback => { pending.push(callback); return pending.length; }, cancelFrame() {} });
  model.registerChrome({ edge: "top", thickness: 82, translucent: true });
  act(() => { pending.splice(0).forEach(callback => callback(0)); });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, this.dataset.testid === "lower" ? 300 : 0, 800, this.dataset.testid === "lower" ? 300 : 600);
  });
  return model;
}
describe("view safe areas", () => {
  it("inherits the overlapping window insets and publishes physical CSS properties", () => {
    const model = fixture();
    render(<NSEWindowLayoutContext.Provider value={model}><NSEView data-testid="view"><Read /></NSEView></NSEWindowLayoutContext.Provider>);
    expect(JSON.parse(screen.getByTestId("read").textContent!)).toEqual({ safeAreaInsets: { top: 82, left: 0, bottom: 0, right: 0 }, safeAreaRect: { x: 0, y: 82, width: 800, height: 518 } });
    expect(screen.getByTestId("view").style.getPropertyValue("--nse-safe-area-inset-top")).toBe("82px");
    model.dispose();
  });
  it("does not inset a view below the chrome", () => {
    const model = fixture();
    render(<NSEWindowLayoutContext.Provider value={model}><NSEView data-testid="lower"><Read /></NSEView></NSEWindowLayoutContext.Provider>);
    expect(JSON.parse(screen.getByTestId("read").textContent!).safeAreaInsets.top).toBe(0);
    model.dispose();
  });
  it("adds a view's additional insets to it and its descendants without doubling chrome", () => {
    const model = fixture();
    render(<NSEWindowLayoutContext.Provider value={model}><NSEView additionalSafeAreaInsets={NSEEdgeInsetsMake(10, 0, 0, 0)}><Read id="parent" /><NSEView><Read id="child" /></NSEView></NSEView></NSEWindowLayoutContext.Provider>);
    for (const id of ["parent", "child"]) expect(JSON.parse(screen.getByTestId(id).textContent!).safeAreaInsets.top).toBe(92);
    model.dispose();
  });
  it("only notifies real inset changes", () => {
    const model = fixture(), changed = vi.fn();
    const view = render(<NSEWindowLayoutContext.Provider value={model}><NSEView onSafeAreaInsetsChange={changed} /></NSEWindowLayoutContext.Provider>);
    expect(changed).toHaveBeenCalledTimes(1);
    view.rerender(<NSEWindowLayoutContext.Provider value={model}><NSEView onSafeAreaInsetsChange={changed} /></NSEWindowLayoutContext.Provider>);
    expect(changed).toHaveBeenCalledTimes(1);
    model.dispose();
  });
  it("exposes the controller view properties and calls its AppKit notification once", () => {
    const controller = new NSEViewController();
    const changed = vi.spyOn(controller, "viewSafeAreaInsetsDidChange");
    const value = { safeAreaInsets: NSEEdgeInsetsMake(82, 0, 0, 0), safeAreaRect: { x: 0, y: 82, width: 800, height: 518 } };
    controller[nseUpdateSafeArea](value); controller[nseUpdateSafeArea](value);
    expect(controller.view.safeAreaInsets).toEqual(value.safeAreaInsets);
    expect(controller.view.safeAreaRect).toEqual(value.safeAreaRect);
    expect(changed).toHaveBeenCalledTimes(1);
    controller.view.additionalSafeAreaInsets = NSEEdgeInsetsMake(10, 0, 0, 0);
    expect(controller.view.additionalSafeAreaInsets.top).toBe(10);
    controller.dispose();
  });
  it("reads a laid-out view's frame from layout, so a window zooming open does not move it", () => {
    const model = fixture();
    const root = document.createElement("div"); root.dataset.testid = "root"; document.body.append(root);
    // Layout puts every view at the window's origin, full size...
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
    // ...while the client rectangle is the zoom's presentation: the content scaled and centred.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === "root" ? new DOMRect(0, 0, 800, 600) : new DOMRect(200, 150, 400, 300);
    });
    const stop = model.connectRoot(root);
    render(<NSEWindowLayoutContext.Provider value={model}><NSEView data-testid="zooming"><Read id="zooming-read" /></NSEView></NSEWindowLayoutContext.Provider>);
    expect(JSON.parse(screen.getByTestId("zooming-read").textContent!).safeAreaInsets).toEqual({ top: 82, left: 0, bottom: 0, right: 0 });
    stop(); root.remove(); model.dispose();
  });
});
