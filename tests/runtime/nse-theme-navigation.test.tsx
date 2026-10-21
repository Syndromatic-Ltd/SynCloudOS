// @vitest-environment jsdom
import React, { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineNSETheme, NSEThemeProvider } from "../../src/NSE/Appearance";
import { NSEAdaptiveNavigationController, NSETabBar, NSETabBarController } from "../../src/NSE/Navigation";
import { NSESourceListScene } from "../../src/NSE/Navigation/SourceList";
import { bottomPeerNavigation, neutralPeerNavigation } from "../../src/NSE/Navigation/peerNavigationPresentation";
import { atmoTheme } from "../../src/NSE/Themes/Atmo";
import { metroTheme } from "../../src/NSE/Themes/Metro";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";

const neutral = defineNSETheme({ id: "test.neutral", displayName: "Neutral" });
const floating = defineNSETheme({ id: "test.floating", displayName: "Floating", presentation: {
  ...neutral.presentation, tabStyle: "layered", peerNavigation: { compact: bottomPeerNavigation, regular: bottomPeerNavigation },
}});
const scrolling = defineNSETheme({ id: "test.scrolling", displayName: "Scrolling", presentation: {
  ...neutral.presentation, peerNavigation: { compact: neutralPeerNavigation, regular: neutralPeerNavigation },
}});
afterEach(cleanup);
function makeTabs(content: () => React.ReactNode = () => <p>Content</p>) {
  return new NSETabBarController<React.ReactNode>({ id: "theme-tabs", initialSelectedId: "item-5", destinations:
    Array.from({ length: 7 }, (_, i) => ({ id: `item-${i}`, label: `Item ${i}`, icon: { kind: "template" as const, name: "item" }, createContent: content })),
  });
}

describe("theme-selected peer presentation", () => {
  it("defaults to unpartitioned semantics and accepts bounded More policies without changing selection or content", () => {
    const tabs = makeTabs();
    const content = tabs.getContent("item-5");
    expect(tabs.getSnapshot().directDestinationIds).toHaveLength(7);
    tabs.setOverflowPolicy({ kind: "more", maximumVisibleItems: 3 });
    expect(tabs.getSnapshot().directDestinationIds).toHaveLength(2);
    expect(tabs.getSnapshot().activeTabId).toBe("__nse-more");
    tabs.setOverflowPolicy({ kind: "scroll" });
    expect(tabs.getSnapshot().selectedDestinationId).toBe("item-5");
    expect(tabs.getContent("item-5")).toBe(content);
    expect(() => tabs.setOverflowPolicy({ kind: "more", maximumVisibleItems: 1 })).toThrow();
    tabs.dispose();
  });

  it("retains mounted local input state when a selected overflow peer becomes a scrolling tab and back", () => {
    const mounts = vi.fn(), unmounts = vi.fn();
    function Form() {
      const [value, setValue] = useState("");
      useEffect(() => { mounts(); return unmounts; }, []);
      return <input aria-label="Draft" value={value} onChange={e => setValue(e.target.value)} />;
    }
    const tabs = makeTabs(() => <Form />);
    const fixture = (theme: typeof floating) => <NSEThemeProvider theme={theme}><NSETabBar controller={tabs} aria-label="Peers" /></NSEThemeProvider>;
    const view = render(fixture(floating));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "retained draft" } });
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    view.rerender(fixture(scrolling));
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    expect(screen.getByRole("textbox")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("retained draft");
    expect(screen.getByRole("tab", { name: "Item 5" }).getAttribute("aria-selected")).toBe("true");
    view.rerender(fixture(floating));
    expect(screen.getByRole("textbox")).toBe(input);
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(unmounts).not.toHaveBeenCalled();
    view.unmount(); tabs.dispose();
  });

  it("preserves keyboard focus when presentation removes More or moves a peer behind it", () => {
    const tabs = makeTabs(() => <input aria-label="Focus draft" />);
    const fixture = (theme: typeof floating) => <NSEThemeProvider theme={theme}><NSETabBar controller={tabs} aria-label="Peers" /></NSEThemeProvider>;
    const view = render(fixture(floating));
    act(() => screen.getByRole("tab", { name: "More destinations" }).focus());
    view.rerender(fixture(scrolling));
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Item 5" }));
    view.rerender(fixture(floating));
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "More destinations" }));
    const input = screen.getByRole("textbox");
    act(() => input.focus());
    view.rerender(fixture(scrolling));
    expect(document.activeElement).toBe(input);
    view.unmount(); tabs.dispose();
  });

  it("switches real Atmo and Metro packages without replacing selected content", () => {
    const tabs = makeTabs(() => <input aria-label="Package draft" defaultValue="saved" />);
    const adaptive = new NSEAdaptiveNavigationController({ id: "packages", model: "peer", tabController: tabs, traits: createStaticPresentationTraits({ width: 640, height: 800 }) });
    const fixture = (theme: typeof atmoTheme) => <NSEThemeProvider theme={theme}><NSESourceListScene projection={{ controller: tabs, adaptiveController: adaptive }} /></NSEThemeProvider>;
    const view = render(fixture(atmoTheme));
    const input = screen.getByRole("textbox");
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    view.rerender(fixture(metroTheme));
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    expect(view.container.querySelector('[data-navigation-flow="in-flow"][data-navigation-placement="block-start"]')).not.toBeNull();
    expect(screen.getByRole("textbox")).toBe(input);
    view.rerender(fixture(atmoTheme));
    expect(screen.getByRole("textbox")).toBe(input);
    expect(tabs.getSnapshot().selectedDestinationId).toBe("item-5");
    view.unmount(); adaptive.dispose(); tabs.dispose();
  });

  it("scrolls keyboard-focused pivots into view and respects public RTL direction", async () => {
    const tabs = makeTabs();
    const scroll = vi.fn();
    const view = render(<NSEThemeProvider theme={scrolling}><NSETabBar controller={tabs} aria-label="Peers" dir="rtl" /></NSEThemeProvider>);
    const next = screen.getByRole("tab", { name: "Item 4" });
    next.scrollIntoView = scroll;
    const viewport = view.container.querySelector('[data-nse-tab-scroll-viewport]') as HTMLElement;
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ left: 0, right: 200 } as DOMRect);
    vi.spyOn(next, "getBoundingClientRect").mockImplementation(() => ({ left: -40 - viewport.scrollLeft, right: 40 - viewport.scrollLeft } as DOMRect));
    const focus = vi.spyOn(next, "focus");
    await act(async () => fireEvent.keyDown(screen.getByRole("tab", { name: "Item 5" }), { key: "ArrowRight" }));
    expect(document.activeElement).toBe(next);
    expect(scroll).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(viewport.scrollLeft).toBe(-40);
    expect(tabs.getSnapshot().selectedDestinationId).toBe("item-4");
    expect(view.container.querySelector('[data-nse-navigation-destination-host]')?.getAttribute("dir")).toBe("rtl");
    view.unmount(); tabs.dispose();
  });

  it("retains the destination node across source-list and tabs, with explicit app precedence", () => {
    const tabs = makeTabs(() => <input aria-label="Retained" defaultValue="draft" />);
    const adaptive = new NSEAdaptiveNavigationController({ id: "adaptive", model: "peer", tabController: tabs, traits: createStaticPresentationTraits({ width: 1024, height: 768 }) });
    const fixture = (theme: typeof neutral, explicit = false) => <NSEThemeProvider theme={theme}><NSESourceListScene projection={{ controller: tabs, adaptiveController: adaptive, ...(explicit ? { presentation: bottomPeerNavigation } : {}) }} /></NSEThemeProvider>;
    const view = render(fixture(neutral));
    const input = screen.getByRole("textbox");
    view.rerender(fixture(scrolling));
    expect(view.container.querySelector('[data-navigation-renderer="tabs"]')).not.toBeNull();
    expect(screen.getByRole("textbox")).toBe(input);
    view.rerender(fixture(neutral));
    expect(view.container.querySelector('[data-navigation-renderer="source-list-content"]')).not.toBeNull();
    expect(screen.getByRole("textbox")).toBe(input);
    view.rerender(fixture(scrolling, true));
    expect(view.container.querySelector('[data-navigation-placement="block-end"]')).not.toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    view.unmount(); adaptive.dispose(); tabs.dispose();
  });
});
