// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineNSETheme, NSEThemeProvider, neutralNSETheme } from "../../src/NSE/Appearance";
import { NSETabBar, NSETabBarController } from "../../src/NSE/Navigation";
import { neutralPeerNavigation } from "../../src/NSE/Navigation/peerNavigationPresentation";
import { metroTheme } from "../../src/NSE/Themes/Metro";

Object.assign(globalThis, { React });
const policy = { ...neutralPeerNavigation, selectedHeaderAlignment: "start" as const };
const theme = defineNSETheme({ id: "test.leading-headers", displayName: "Leading headers", presentation: {
  ...neutralNSETheme.presentation,
  peerNavigation: { compact: policy, regular: neutralPeerNavigation },
  motion: { peerNavigation: { kind: "slide", durationMs: 300, easing: "decelerate" } },
} });
let width = 200, contentWidth = 420, now = 0, nextFrame = 0, reduce = false;
let frames: Map<number, FrameRequestCallback>;
let observers: Set<() => void>;
let mediaListeners: Set<() => void>;
const rect = (left: number, width: number) => ({ left, right: left + width, width, top: 40, bottom: 100, height: 60, x: left, y: 40, toJSON() {} }) as DOMRect;
beforeEach(() => {
  width = 200; contentWidth = 420; now = 0; nextFrame = 0; reduce = false;
  frames = new Map(); observers = new Set(); mediaListeners = new Set();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class {
    callback: () => void;
    constructor(callback: () => void) { this.callback = callback; observers.add(callback); }
    observe() {} disconnect() { observers.delete(this.callback); }
  });
  vi.stubGlobal("matchMedia", () => ({ get matches() { return reduce; }, addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn), removeEventListener: (_: string, fn: () => void) => mediaListeners.delete(fn) }));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function () { return this.hasAttribute("data-nse-tab-scroll-viewport") ? width : 0; });
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function () { return this.getAttribute("role") === "tablist" ? contentWidth : 0; });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    if (this.hasAttribute("data-nse-tab-scroll-viewport")) return rect(0, width);
    if (this.getAttribute("role") !== "tab") return rect(0, contentWidth);
    const viewport = this.closest("[data-nse-tab-scroll-viewport]") as HTMLElement;
    const index = Number(this.getAttribute("data-nse-tab-destination"));
    const rtl = this.closest("[dir]")?.getAttribute("dir") === "rtl";
    return rect(rtl ? width - index * 140 - 140 - viewport.scrollLeft : index * 140 - viewport.scrollLeft, 140);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function advance(time: number) {
  act(() => { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); });
}
function fixture(dir: "ltr" | "rtl" = "ltr", reducedMotion = false) {
  const controller = new NSETabBarController<React.ReactNode>({ id: "header-test", initialSelectedId: "0", destinations: [0, 1, 2].map(i => ({ id: String(i), label: `Section ${i}`, icon: { kind: "template", name: "test" }, createContent: () => <p>Content {i}</p> })) });
  const view = render(<NSEThemeProvider theme={theme}><NSETabBar controller={controller} aria-label="Sections" renderPanels={false} dir={dir} reducedMotion={reducedMotion} /></NSEThemeProvider>);
  const viewport = view.container.querySelector("[data-nse-tab-scroll-viewport]") as HTMLElement;
  return { controller, view, viewport };
}

describe("declarative selected header motion", () => {
  it.each(["ltr", "rtl"] as const)("moves selected labels to logical start in %s without remounting", async dir => {
    const { controller, view, viewport } = fixture(dir);
    const tabs = view.getAllByRole("tab");
    await act(async () => { fireEvent.click(tabs[1]); });
    expect(viewport.scrollLeft).toBe(0);
    act(() => observers.forEach(fn => fn())); // initial ResizeObserver delivery
    advance(150);
    expect(Math.abs(viewport.scrollLeft)).toBeGreaterThan(70);
    expect(Math.abs(viewport.scrollLeft)).toBeLessThan(140);
    advance(300);
    expect(viewport.scrollLeft).toBe(dir === "rtl" ? -140 : 140);
    await act(async () => { fireEvent.click(tabs[2]); });
    advance(600);
    expect(viewport.scrollLeft).toBe(dir === "rtl" ? -280 : 280);
    expect(view.getAllByRole("tab")).toEqual(tabs);
    expect((view.container.querySelector("[data-nse-tab-scroll-tail]") as HTMLElement).style.width).toBe("60px");
    controller.dispose();
  });

  it("cancels stale frames and retargets from the current offset on rapid selection", async () => {
    const { controller, view, viewport } = fixture();
    await act(async () => { fireEvent.click(view.getAllByRole("tab")[1]); });
    advance(70);
    const interrupted = viewport.scrollLeft;
    await act(async () => { fireEvent.click(view.getAllByRole("tab")[2]); });
    expect(viewport.scrollLeft).toBe(interrupted);
    expect(frames.size).toBe(1);
    advance(370);
    expect(viewport.scrollLeft).toBe(280);
    expect(frames.size).toBe(0);
    view.unmount(); expect(frames.size).toBe(0); controller.dispose();
  });

  it("keeps fitting headers stationary and remeasures without animation", async () => {
    contentWidth = 180;
    const { controller, view, viewport } = fixture();
    await act(async () => { fireEvent.click(view.getAllByRole("tab")[2]); });
    expect(viewport.scrollLeft).toBe(0); expect(frames.size).toBe(0);
    contentWidth = 420;
    act(() => observers.forEach(fn => fn()));
    expect(viewport.scrollLeft).toBe(280);
    width = 500;
    act(() => observers.forEach(fn => fn()));
    expect(viewport.scrollLeft).toBe(0);
    expect((view.container.querySelector("[data-nse-tab-scroll-tail]") as HTMLElement).style.width).toBe("0px");
    controller.dispose();
  });

  it("honors reduced motion and a preference change during animation", async () => {
    const { controller, view, viewport } = fixture();
    await act(async () => { fireEvent.click(view.getAllByRole("tab")[1]); });
    advance(50);
    reduce = true; act(() => mediaListeners.forEach(fn => fn()));
    expect(viewport.scrollLeft).toBe(140); expect(frames.size).toBe(0);
    await act(async () => { fireEvent.click(view.getAllByRole("tab")[2]); });
    expect(viewport.scrollLeft).toBe(280); expect(frames.size).toBe(0);
    view.unmount(); controller.dispose();
    const second = fixture("ltr", true);
    await act(async () => { fireEvent.click(second.view.getAllByRole("tab")[1]); });
    expect(second.viewport.scrollLeft).toBe(140); expect(frames.size).toBe(0);
    second.controller.dispose();
  });

  it("uses preventScroll for keyboard focus and cancels motion for manual header scrolling", async () => {
    const { controller, view, viewport } = fixture();
    const focus = vi.spyOn(view.getAllByRole("tab")[1], "focus");
    await act(async () => { fireEvent.keyDown(view.getAllByRole("tab")[0], { key: "ArrowRight" }); });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(frames.size).toBe(1);
    fireEvent.wheel(viewport);
    expect(frames.size).toBe(0);
    controller.dispose();
  });

  it("validates neutral policy and opts only compact Metro into leading headers", () => {
    expect(metroTheme.presentation.peerNavigation.compact.selectedHeaderAlignment).toBe("start");
    expect(metroTheme.presentation.peerNavigation.regular.selectedHeaderAlignment).toBeUndefined();
    for (const invalid of ["center", false, { kind: "start" }]) {
      expect(() => defineNSETheme({ id: "test.invalid", displayName: "Invalid", presentation: { ...theme.presentation, peerNavigation: { ...theme.presentation.peerNavigation, compact: { ...policy, selectedHeaderAlignment: invalid as never } } } })).toThrow();
    }
    expect(() => defineNSETheme({ id: "test.invalid", displayName: "Invalid", presentation: { ...theme.presentation, peerNavigation: { ...theme.presentation.peerNavigation, compact: { ...policy, overflow: { kind: "more", maximumVisibleItems: 5 } } } } })).toThrow();
  });
});
