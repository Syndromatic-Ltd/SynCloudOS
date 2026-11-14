// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEViewController, nseUpdateTraits } from "../../src/NSE/Application/NSEViewController";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { NSETabViewController, NSETabViewItem } from "../../src/NSE/Navigation/NSETabViewController";
import { NSEScrollView } from "../../src/NSE/Scroll/NSEScrollView";
import { WindowLayoutContext, WindowLayoutModel } from "../../src/NSE/Layout/windowChromeObstructions";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
class Page extends NSEViewController {
  static override view = () => <NSEScrollView rubberBand={false}><div>Last item</div></NSEScrollView>;
}
function setup(width = 390, direction = "ltr") {
  const callbacks = new Map<number, FrameRequestCallback>(); let sequence = 0;
  const model = new WindowLayoutModel({ bounds: { x: 0, y: 0, width, height: 844 }, requestFrame: cb => { callbacks.set(++sequence, cb); return sequence; }, cancelFrame: id => { callbacks.delete(id); } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("nse-adaptive-tab-chrome")) return new DOMRect(0, 752, width, 92);
    if (this.classList.contains("nse-adaptive-tab-sidebar")) return new DOMRect(direction === "rtl" ? width - 264 : 0, 0, 264, 844);
    const x = width >= 768 && this.classList.contains("nse-scroll-view") ? direction === "rtl" ? 0 : 264 : 0;
    return new DOMRect(x, 0, width >= 768 && this.classList.contains("nse-scroll-view") ? width - 264 : width, 844);
  });
  const root = document.createElement("div"); root.style.direction = direction; document.body.append(root);
  const stop = model.connectRoot(root);
  const tabs = new NSETabViewController(); tabs.tabStyle = "sidebarAdaptable";
  tabs[nseUpdateTraits]({ reducedMotion: true, presentation: createStaticPresentationTraits({ width, height: 844 }) });
  const add = (id: string) => tabs.addTabViewItem(new NSETabViewItem({ identifier: id, viewController: tabs.addChild(Page, { title: id }) }));
  add("first");
  const flush = () => act(() => { const work = [...callbacks.values()]; callbacks.clear(); work.forEach(cb => cb(0)); });
  return { model, tabs, add, flush, callbacks, dispose: () => { tabs.dispose(); stop(); model.dispose(); root.remove(); } };
}
describe("framework layout-guide adoption", () => {
  it("keeps compact scrolling content clear of the measured bottom strip", () => {
    const fixture = setup(); fixture.add("second");
    const view = render(<WindowLayoutContext.Provider value={fixture.model}><NSEViewControllerView controller={fixture.tabs} /></WindowLayoutContext.Provider>);
    fixture.flush();
    expect(fixture.model.getSnapshot().insets.bottom).toBe(92);
    expect(view.container.querySelector<HTMLElement>(".nse-scroll-view-content")!.style.paddingBottom).toBe("92px");
    fixture.dispose();
  });
  it("registers an RTL source list on the right without insetting the content twice", () => {
    const fixture = setup(1000, "rtl"); fixture.add("second");
    const view = render(<WindowLayoutContext.Provider value={fixture.model}><NSEViewControllerView controller={fixture.tabs} /></WindowLayoutContext.Provider>);
    fixture.flush();
    expect(fixture.model.getSnapshot().insets).toEqual({ top: 0, left: 0, bottom: 0, right: 264 });
    expect(view.container.querySelector<HTMLElement>(".nse-scroll-view-content")!.style.paddingRight).toBe("0px");
    fixture.dispose();
  });
  it("updates in one animation frame when a second destination enables the strip", () => {
    const fixture = setup();
    render(<WindowLayoutContext.Provider value={fixture.model}><NSEViewControllerView controller={fixture.tabs} /></WindowLayoutContext.Provider>);
    fixture.flush(); expect(fixture.model.getSnapshot().insets.bottom).toBe(0);
    act(() => fixture.add("second"));
    expect(fixture.callbacks.size).toBe(1); fixture.flush();
    expect(fixture.model.getSnapshot().insets.bottom).toBe(92);
    expect(fixture.callbacks.size).toBe(0);
    fixture.dispose();
  });
});
