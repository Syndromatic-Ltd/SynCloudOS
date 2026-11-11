// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEScrollView } from "../../src/NSE/Scroll/NSEScrollView";
import { NSEWindowLayoutContext, NSEWindowLayoutModel } from "../../src/NSE/Layout/windowChromeObstructions";
import { NSEEdgeInsetsMake, NSEEdgeInsetsZero } from "../../src/NSE/Layout/NSEEdgeInsets";
import type { NSEScrollViewController } from "../../src/NSE/Scroll/scrollTypes";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup() {
  const callbacks: FrameRequestCallback[] = [];
  const model = new NSEWindowLayoutModel({ bounds: { x: 0, y: 0, width: 800, height: 600 }, requestFrame: callback => { callbacks.push(callback); return callbacks.length; }, cancelFrame() {} });
  const flush = () => act(() => { callbacks.splice(0).forEach(callback => callback(0)); });
  const remove = model.registerChrome({ edge: "bottom", thickness: 72, translucent: true }); flush();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
  return { model, flush, remove };
}
describe("scroll content insets", () => {
  it("automatically clears a translucent bar and can reveal the entire last row above it", () => {
    const { model } = setup(); let controller: NSEScrollViewController | null = null;
    const view = render(<NSEWindowLayoutContext.Provider value={model}><NSEScrollView rubberBand={false} controllerRef={value => { controller = value; }}><div>Last row</div></NSEScrollView></NSEWindowLayoutContext.Provider>);
    const host = view.container.querySelector<HTMLElement>(".nse-scroll-view")!;
    expect((host.firstElementChild as HTMLElement).style.paddingBottom).toBe("72px");
    Object.defineProperties(host, { clientHeight: { value: 600 }, clientWidth: { value: 800 }, scrollHeight: { value: 2072 }, scrollWidth: { value: 800 } });
    host.scrollTo = vi.fn(); controller!.scrollRectToVisible({ x: 0, y: 1980, width: 100, height: 20 });
    expect(host.scrollTo).toHaveBeenCalledWith({ left: 0, top: 1472, behavior: "auto" });
    model.dispose();
  });
  it("allows explicit zero content insets when automatic adjustment is disabled", () => {
    const { model } = setup();
    const view = render(<NSEWindowLayoutContext.Provider value={model}><NSEScrollView rubberBand={false} automaticallyAdjustsContentInsets={false} contentInsets={NSEEdgeInsetsZero}>Content</NSEScrollView></NSEWindowLayoutContext.Provider>);
    expect(view.container.querySelector<HTMLElement>(".nse-scroll-view-content")!.style.paddingBottom).toBe("0px");
    model.dispose();
  });
  it("adds scrollerInsets to the automatic content inset", () => {
    const { model } = setup();
    const view = render(<NSEWindowLayoutContext.Provider value={model}><NSEScrollView rubberBand={false} axis="both" scrollerInsets={NSEEdgeInsetsMake(3, 4, 5, 6)}>Content</NSEScrollView></NSEWindowLayoutContext.Provider>);
    const vertical = view.container.querySelector<HTMLElement>('[data-nse-control="scroller"][data-orientation="vertical"]')!;
    const horizontal = view.container.querySelector<HTMLElement>('[data-nse-control="scroller"][data-orientation="horizontal"]')!;
    expect(vertical.style.marginTop).toBe("3px"); expect(vertical.style.marginBottom).toBe("77px");
    expect(horizontal.style.marginLeft).toBe("4px"); expect(horizontal.style.marginRight).toBe("6px");
    model.dispose();
  });
  it("updates both the padding and scrolling controller when chrome disappears", () => {
    const { model, remove, flush } = setup(); let controller: NSEScrollViewController | null = null;
    const view = render(<NSEWindowLayoutContext.Provider value={model}><NSEScrollView rubberBand={false} controllerRef={value => { controller = value; }}>Content</NSEScrollView></NSEWindowLayoutContext.Provider>);
    expect(controller!.insets.bottom).toBe(72);
    act(() => { remove(); }); flush();
    expect(controller!.insets.bottom).toBe(0);
    expect(view.container.querySelector<HTMLElement>(".nse-scroll-view-content")!.style.paddingBottom).toBe("0px");
    model.dispose();
  });
});
