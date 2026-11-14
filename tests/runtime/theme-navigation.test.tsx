// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { freezeNSETheme } from "../../src/NSE/Theme/NSETheme";
import { atmoTheme } from "../../src/NSE/Appearance/atmoTheme";
import { NSEViewController, nseUpdateTraits } from "../../src/NSE/Application/NSEViewController";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { NSETabViewController, NSETabViewItem } from "../../src/NSE/Navigation/NSETabViewController";
import { NSEScrollView } from "../../src/NSE/Scroll/NSEScrollView";
import { WindowLayoutContext, WindowLayoutModel } from "../../src/NSE/Layout/windowChromeObstructions";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
class Page extends NSEViewController { static override view = () => <NSEScrollView><p>Document content</p></NSEScrollView>; }
describe("theme navigation placement and chrome registration", () => {
  for (const widthClass of ["compact", "regular"] as const) for (const placement of widthClass === "compact" ? ["block-start", "block-end"] as const : ["source-list", "block-start"] as const) for (const flow of ["in-flow", "overlay"] as const) it(`${widthClass} ${placement} ${flow}`, () => {
    const width = widthClass === "compact" ? 390 : 1000;
    const theme = freezeNSETheme({ ...atmoTheme, bundleIdentifier: "com.example.navigation", navigation: { compact: { ...atmoTheme.navigation.compact, ...(widthClass === "compact" ? { placement: placement as "block-start" | "block-end", flow } : {}) }, regular: { ...atmoTheme.navigation.regular, ...(widthClass === "regular" ? { placement: placement as "source-list" | "block-start", flow } : {}) } } });
    const callbacks = new Map<number, FrameRequestCallback>(); let sequence = 0;
    const model = new WindowLayoutModel({ bounds: { x: 0, y: 0, width, height: 844 }, requestFrame: cb => { callbacks.set(++sequence, cb); return sequence; }, cancelFrame: id => { callbacks.delete(id); } });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("nse-adaptive-tab-chrome")) return new DOMRect(0, placement === "block-end" ? 752 : 0, width, 92);
      if (this.classList.contains("nse-adaptive-tab-sidebar")) return new DOMRect(0, 0, 264, 844);
      return new DOMRect(0, 0, width, 844);
    });
    const root = document.createElement("div"); document.body.append(root); const stop = model.connectRoot(root);
    const tabs = new NSETabViewController(); tabs.tabStyle = "sidebarAdaptable";
    tabs[nseUpdateTraits]({ reducedMotion: true, presentation: createStaticPresentationTraits({ width, height: 844 }) });
    for (const id of ["first", "second"]) tabs.addTabViewItem(new NSETabViewItem({ identifier: id, viewController: tabs.addChild(Page, { title: id }) }));
    try {
      const view = render(<NSEAppearanceProvider theme={theme}><WindowLayoutContext.Provider value={model}><NSEViewControllerView controller={tabs} /></WindowLayoutContext.Provider></NSEAppearanceProvider>);
      act(() => { const work = [...callbacks.values()]; callbacks.clear(); work.forEach(cb => cb(0)); });
      const element = view.container.querySelector<HTMLElement>(".nse-adaptive-tab-controller")!;
      expect(element.dataset.nseNavigationPlacement).toBe(placement); expect(element.dataset.nseNavigationFlow).toBe(flow);
      expect(model.getSnapshot().insets).toEqual({ top: placement === "block-start" ? 92 : 0, left: placement === "source-list" ? 264 : 0, bottom: placement === "block-end" ? 92 : 0, right: 0 });
    } finally { tabs.dispose(); stop(); model.dispose(); root.remove(); }
  });
});
