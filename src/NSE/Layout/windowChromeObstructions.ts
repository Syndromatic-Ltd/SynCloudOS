/* SynCloudOS â€” Copyright Â© 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { createContext, useContext, useLayoutEffect, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { NSEEdgeInsetsMake, NSEEdgeInsetsZero, type NSEEdgeInsets } from "./NSEEdgeInsets";
import { NSELayoutGuideStore, nseEmptyLayoutRect, nseEqualRects } from "./NSELayoutGuide";
import { physicalSafeAreaInsets, resolveSafeAreaInsets, type ChromeObstruction } from "./safeAreaModel";
import type { NSEScrollRect } from "../Scroll/scrollTypes";

interface LayoutSnapshot {
  readonly bounds: NSEScrollRect;
  readonly insets: NSEEdgeInsets;
  readonly direction: "ltr" | "rtl";
}
const emptySnapshot: LayoutSnapshot = Object.freeze({ bounds: nseEmptyLayoutRect, insets: NSEEdgeInsetsZero, direction: "ltr" });
const equalInsets = (a: NSEEdgeInsets, b: NSEEdgeInsets) => a.top === b.top && a.left === b.left && a.bottom === b.bottom && a.right === b.right;

/** @internal One geometry authority and ResizeObserver for a physical window. */
export class NSEWindowLayoutModel extends NSELayoutGuideStore {
  #bounds: NSEScrollRect;
  #screen: NSEEdgeInsets = NSEEdgeInsetsZero;
  #screenBounds: NSEScrollRect | null = null;
  #logicalScreen: Parameters<typeof physicalSafeAreaInsets>[0] | null = null;
  #direction: "ltr" | "rtl" = "ltr";
  #snapshot: LayoutSnapshot;
  #frame: number | null = null;
  #disposed = false;
  #observer: ResizeObserver | null = null;
  #root: HTMLElement | null = null;
  readonly #leadingChrome = new Set<symbol>();
  readonly #chrome = new Map<symbol, ChromeObstruction>();
  readonly #listeners = new Set<() => void>();
  readonly #measurements = new Map<HTMLElement, Set<(rect: NSEScrollRect) => void>>();
  readonly #requestFrame: (callback: FrameRequestCallback) => number;
  readonly #cancelFrame: (frame: number) => void;

  constructor(options: { bounds?: NSEScrollRect; requestFrame?: (callback: FrameRequestCallback) => number; cancelFrame?: (frame: number) => void } = {}) {
    const bounds = options.bounds ?? nseEmptyLayoutRect;
    super({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    this.#bounds = Object.freeze({ ...bounds });
    this.#snapshot = Object.freeze({ ...emptySnapshot, bounds: this.#bounds });
    this.#requestFrame = options.requestFrame ?? (callback => typeof requestAnimationFrame === "function" ? requestAnimationFrame(callback) : window.setTimeout(() => callback(performance.now()), 0));
    this.#cancelFrame = options.cancelFrame ?? (frame => typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(frame) : window.clearTimeout(frame));
  }
  getSnapshot = (): LayoutSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get root(): HTMLElement | null { return this.#root; }
  setBounds(bounds: NSEScrollRect): void {
    if (nseEqualRects(this.#bounds, bounds)) return;
    resolveSafeAreaInsets({ bounds, screen: NSEEdgeInsetsZero, additional: NSEEdgeInsetsZero, chrome: [] });
    this.#bounds = Object.freeze({ ...bounds }); this.#schedule();
  }
  setScreenInsets(insets: NSEEdgeInsets): void {
    if (equalInsets(this.#screen, insets)) return;
    this.#screen = NSEEdgeInsetsMake(insets.top, insets.left, insets.bottom, insets.right); this.#schedule();
  }
  setLogicalScreenInsets(insets: Parameters<typeof physicalSafeAreaInsets>[0], screenBounds?: NSEScrollRect): void {
    if (screenBounds && (!this.#screenBounds || !nseEqualRects(this.#screenBounds, screenBounds))) { this.#screenBounds = Object.freeze({ ...screenBounds }); this.#schedule(); }
    this.#logicalScreen = insets;
    this.setScreenInsets(physicalSafeAreaInsets(insets, this.#direction));
  }
  registerChrome(obstruction: ChromeObstruction): () => void {
    resolveSafeAreaInsets({ bounds: this.#bounds, screen: NSEEdgeInsetsZero, additional: NSEEdgeInsetsZero, chrome: [obstruction] });
    const token = Symbol("window-chrome");
    this.#chrome.set(token, Object.freeze({ ...obstruction })); this.#schedule();
    return () => { if (this.#chrome.delete(token)) this.#schedule(); };
  }
  observeChrome(element: HTMLElement, edge: ChromeObstruction["edge"] | "leading", translucent: boolean): () => void {
    const token = Symbol("measured-window-chrome");
    if (edge === "leading") this.#leadingChrome.add(token);
    const stop = this.observeElement(element, rect => {
      const thickness = edge === "top" || edge === "bottom" ? rect.height : rect.width;
      this.#chrome.set(token, Object.freeze({ edge: edge === "leading" ? this.#direction === "rtl" ? "right" : "left" : edge, thickness, translucent })); this.#schedule();
    });
    return () => { stop(); this.#leadingChrome.delete(token); if (this.#chrome.delete(token)) this.#schedule(); };
  }
  observeElement(element: HTMLElement, listener: (rect: NSEScrollRect) => void, notifyImmediately = true): () => void {
    let listeners = this.#measurements.get(element);
    if (!listeners) { listeners = new Set(); this.#measurements.set(element, listeners); this.#ensureObserver(element); this.#observer?.observe(element); }
    listeners.add(listener);
    if (notifyImmediately) listener(this.#measure(element));
    return () => {
      listeners.delete(listener);
      if (!listeners.size) { this.#measurements.delete(element); this.#observer?.unobserve(element); }
    };
  }
  connectRoot(element: HTMLElement): () => void {
    this.#root = element;
    const readDirection = () => {
      const direction = element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
      if (direction !== this.#direction) { this.#direction = direction;
        for (const token of this.#leadingChrome) { const obstruction = this.#chrome.get(token); if (obstruction) this.#chrome.set(token, Object.freeze({ ...obstruction, edge: direction === "rtl" ? "right" : "left" })); }
        if (this.#logicalScreen) this.setScreenInsets(physicalSafeAreaInsets(this.#logicalScreen, direction)); this.#schedule(); }
    };
    // The root's size comes from layout; its origin stays the logical one its
    // host gave, as a window's frame does while its presentation animates.
    const stop = this.observeElement(element, rect => { if (rect.width > 0 && rect.height > 0) this.setBounds({ x: this.#bounds.x, y: this.#bounds.y, width: rect.width, height: rect.height }); readDirection(); });
    const Mutation = element.ownerDocument.defaultView?.MutationObserver;
    const directionObserver = Mutation ? new Mutation(readDirection) : null;
    directionObserver?.observe(element.ownerDocument.documentElement, { attributes: true, subtree: true, attributeFilter: ["dir"] });
    directionObserver?.observe(element, { attributes: true, attributeFilter: ["dir"] });
    return () => { directionObserver?.disconnect(); stop(); if (this.#root === element) this.#root = null; };
  }
  override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#frame !== null) this.#cancelFrame(this.#frame);
    this.#frame = null; this.#observer?.disconnect(); this.#observer = null;
    this.#measurements.clear(); this.#leadingChrome.clear(); this.#chrome.clear(); this.#listeners.clear(); this.#root = null;
    super.dispose();
  }
  #ensureObserver(element: HTMLElement): void {
    if (this.#observer || this.#disposed) return;
    const Observer = element.ownerDocument.defaultView?.ResizeObserver;
    if (Observer) this.#observer = new Observer(entries => {
      for (const { target } of entries) {
        const listeners = this.#measurements.get(target as HTMLElement);
        if (!listeners) continue;
        const rect = this.#measure(target as HTMLElement);
        for (const listener of [...listeners]) listener(rect);
      }
    });
  }
  #measure(element: HTMLElement): NSEScrollRect {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: element.offsetWidth || rect.width, height: element.offsetHeight || rect.height };
  }
  #schedule(): void {
    if (this.#disposed || this.#frame !== null) return;
    this.#frame = this.#requestFrame(() => { this.#frame = null; this.#publish(); });
  }
  #publish(): void {
    const screen = this.#screenBounds ? NSEEdgeInsetsMake(
      Math.max(0, this.#screenBounds.y + this.#screen.top - this.#bounds.y),
      Math.max(0, this.#screenBounds.x + this.#screen.left - this.#bounds.x),
      Math.max(0, this.#bounds.y + this.#bounds.height - (this.#screenBounds.y + this.#screenBounds.height - this.#screen.bottom)),
      Math.max(0, this.#bounds.x + this.#bounds.width - (this.#screenBounds.x + this.#screenBounds.width - this.#screen.right)),
    ) : this.#screen;
    const insets = resolveSafeAreaInsets({ bounds: this.#bounds, screen, additional: NSEEdgeInsetsZero, chrome: [...this.#chrome.values()] });
    if (nseEqualRects(this.#snapshot.bounds, this.#bounds) && equalInsets(this.#snapshot.insets, insets) && this.#snapshot.direction === this.#direction) return;
    this.#snapshot = Object.freeze({ bounds: this.#bounds, insets, direction: this.#direction });
    this.setFrame({ x: insets.left, y: insets.top, width: Math.max(0, this.#bounds.width - insets.left - insets.right), height: Math.max(0, this.#bounds.height - insets.top - insets.bottom) });
    for (const listener of [...this.#listeners]) listener();
  }
}

export const NSEWindowLayoutContext = createContext<NSEWindowLayoutModel | null>(null);
const emptySubscribe = () => () => {};
const getEmptySnapshot = () => emptySnapshot;

export function useNSEWindowLayoutSnapshot(model?: NSEWindowLayoutModel | null): LayoutSnapshot {
  const inherited = useContext(NSEWindowLayoutContext), selected = model === undefined ? inherited : model;
  return useSyncExternalStore(selected?.subscribe ?? emptySubscribe, selected?.getSnapshot ?? getEmptySnapshot, selected?.getSnapshot ?? getEmptySnapshot);
}
export function useNSEContentLayoutProperties(model?: NSEWindowLayoutModel | null): CSSProperties {
  const { insets } = useNSEWindowLayoutSnapshot(model);
  return { "--nse-content-layout-inset-top": `${insets.top}px`, "--nse-content-layout-inset-left": `${insets.left}px`, "--nse-content-layout-inset-bottom": `${insets.bottom}px`, "--nse-content-layout-inset-right": `${insets.right}px` } as CSSProperties;
}
export function useNSEWindowChromeObstruction(edge: ChromeObstruction["edge"], thickness: number, translucent: boolean): void {
  const model = useContext(NSEWindowLayoutContext);
  useLayoutEffect(() => model?.registerChrome({ edge, thickness, translucent }), [model, edge, thickness, translucent]);
}
export function useNSEWindowChromeElement(ref: RefObject<HTMLElement | null>, edge: ChromeObstruction["edge"] | "leading", translucent: boolean, enabled = true): void {
  const model = useContext(NSEWindowLayoutContext);
  useLayoutEffect(() => model && enabled && ref.current ? model.observeChrome(ref.current, edge, translucent) : undefined, [model, ref, edge, translucent, enabled]);
}
