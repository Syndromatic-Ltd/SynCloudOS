/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { NSEEdgeInsetsMake, NSEEdgeInsetsZero, type NSEEdgeInsets } from "./NSEEdgeInsets";
import { nseEmptyLayoutRect, nseEqualRects } from "./NSELayoutGuide";
import { NSEWindowLayoutContext, useNSEWindowLayoutSnapshot } from "./windowChromeObstructions";
import type { NSEScrollRect } from "../Scroll/scrollTypes";

export interface NSESafeArea {
  readonly safeAreaInsets: NSEEdgeInsets;
  readonly safeAreaRect: NSEScrollRect;
}
export const nseEqualInsets = (a: NSEEdgeInsets, b: NSEEdgeInsets) => a.top === b.top && a.left === b.left && a.bottom === b.bottom && a.right === b.right;
interface ViewSafeArea extends NSESafeArea { readonly additional: NSEEdgeInsets }
/** @internal The accumulated additional insets are distinct from the window overlap. */
export const NSEViewSafeAreaContext = createContext<ViewSafeArea | null>(null);

export function useNSESafeArea(): NSESafeArea {
  const inherited = useContext(NSEViewSafeAreaContext);
  const { bounds, insets } = useNSEWindowLayoutSnapshot();
  return useMemo(() => inherited ? { safeAreaInsets: inherited.safeAreaInsets, safeAreaRect: inherited.safeAreaRect } : {
    safeAreaInsets: insets,
    safeAreaRect: Object.freeze({ x: insets.left, y: insets.top, width: Math.max(0, bounds.width - insets.left - insets.right), height: Math.max(0, bounds.height - insets.top - insets.bottom) }),
  }, [inherited, bounds, insets]);
}

/** @internal Measures an existing view element; never inserts a layout wrapper. */
export function useNSEViewSafeArea(ref: RefObject<HTMLElement | null>, additional: NSEEdgeInsets = NSEEdgeInsetsZero, onChange?: (insets: NSEEdgeInsets) => void, onResize?: () => void) {
  const model = useContext(NSEWindowLayoutContext);
  const parent = useContext(NSEViewSafeAreaContext);
  const window = useNSEWindowLayoutSnapshot(model);
  const [rect, setRect] = useState<NSEScrollRect>(nseEmptyLayoutRect);
  const resizeCallback = useRef(onResize);
  resizeCallback.current = onResize;
  const accumulated = useMemo(() => NSEEdgeInsetsMake(additional.top + (parent?.additional.top ?? 0), additional.left + (parent?.additional.left ?? 0), additional.bottom + (parent?.additional.bottom ?? 0), additional.right + (parent?.additional.right ?? 0)), [additional.top, additional.left, additional.bottom, additional.right, parent?.additional]);
  const measure = () => {
    const element = ref.current;
    if (!element) return;
    const measured = element.getBoundingClientRect();
    const root = model?.root?.getBoundingClientRect();
    const scaleX = root?.width ? window.bounds.width / root.width : 1;
    const scaleY = root?.height ? window.bounds.height / root.height : 1;
    const next = Object.freeze({ x: (measured.x - (root?.x ?? window.bounds.x)) * scaleX, y: (measured.y - (root?.y ?? window.bounds.y)) * scaleY, width: element.offsetWidth || measured.width * scaleX, height: element.offsetHeight || measured.height * scaleY });
    setRect(previous => previous && nseEqualRects(previous, next) ? previous : next);
  };
  // Re-measure on a committed parent layout as well as on size notifications:
  // sibling chrome can move a view without changing its own size.
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (model) {
      let initial = true;
      const stop = model.observeElement(element, () => { measure(); if (!initial) resizeCallback.current?.(); });
      initial = false;
      return stop;
    }
    const Observer = element.ownerDocument.defaultView?.ResizeObserver;
    const observer = Observer ? new Observer(() => { measure(); resizeCallback.current?.(); }) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [model, ref, window.bounds]);
  const value = useMemo<ViewSafeArea>(() => {
    const bounds = rect ?? nseEmptyLayoutRect;
    const overlaps = (edge: keyof NSEEdgeInsets) => !model ? 0 : edge === "top" ? window.insets.top - bounds.y : edge === "left" ? window.insets.left - bounds.x : edge === "bottom" ? bounds.y + bounds.height - (window.bounds.height - window.insets.bottom) : bounds.x + bounds.width - (window.bounds.width - window.insets.right);
    const clamp = (n: number, maximum: number) => Math.min(maximum, Math.max(0, n));
    const top = clamp(Math.max(0, overlaps("top")) + accumulated.top, bounds.height);
    const left = clamp(Math.max(0, overlaps("left")) + accumulated.left, bounds.width);
    const bottom = clamp(Math.max(0, overlaps("bottom")) + accumulated.bottom, bounds.height - top);
    const right = clamp(Math.max(0, overlaps("right")) + accumulated.right, bounds.width - left);
    return Object.freeze({ additional: accumulated, safeAreaInsets: NSEEdgeInsetsMake(top, left, bottom, right), safeAreaRect: Object.freeze({ x: left, y: top, width: bounds.width - left - right, height: bounds.height - top - bottom }) });
  }, [rect, model, window, accumulated]);
  const lastInsets = useRef<NSEEdgeInsets>(NSEEdgeInsetsZero);
  useLayoutEffect(() => {
    if (!rect || nseEqualInsets(lastInsets.current, value.safeAreaInsets)) return;
    lastInsets.current = value.safeAreaInsets;
    onChange?.(value.safeAreaInsets);
  }, [rect, value.safeAreaInsets, onChange]);
  const { top, left, bottom, right } = value.safeAreaInsets;
  const properties = { "--nse-safe-area-inset-top": `${top}px`, "--nse-safe-area-inset-left": `${left}px`, "--nse-safe-area-inset-bottom": `${bottom}px`, "--nse-safe-area-inset-right": `${right}px` } as CSSProperties;
  return { value, properties };
}
