/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { createContext, createElement, Fragment, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PropsWithChildren, type RefObject } from "react";
import { NSEEdgeInsetsMake, NSEEdgeInsetsZero, type NSEEdgeInsets } from "./NSEEdgeInsets";
import { nseEmptyLayoutRect, nseEqualRects } from "./NSELayoutGuide";
import { WindowLayoutContext, useNSEWindowLayoutSnapshot } from "./windowChromeObstructions";
import type { NSEScrollRect } from "../Scroll/scrollTypes";

export interface NSESafeArea {
  readonly safeAreaInsets: NSEEdgeInsets;
  readonly safeAreaRect: NSEScrollRect;
}
export const nseEqualInsets = (a: NSEEdgeInsets, b: NSEEdgeInsets) => a.top === b.top && a.left === b.left && a.bottom === b.bottom && a.right === b.right;
interface ViewSafeArea extends NSESafeArea { readonly additional: NSEEdgeInsets }
/** @internal The accumulated additional insets are distinct from the window overlap. */
export const ViewSafeAreaContext = createContext<ViewSafeArea | null>(null);

type TransformAnswers = Map<HTMLElement | null, Map<HTMLElement, boolean>>;
type MeasureView = (answers?: TransformAnswers) => (() => void) | undefined;
let standaloneTransformAnswers: TransformAnswers | null = null;

function transformAnswersForStandaloneViews(): TransformAnswers {
  if (!standaloneTransformAnswers) {
    standaloneTransformAnswers = new Map();
    queueMicrotask(() => { standaloneTransformAnswers = null; });
  }
  return standaloneTransformAnswers;
}

interface SafeAreaMeasurementQueue {
  enqueue(ref: RefObject<HTMLElement | null>, measure: MeasureView): void;
  remove(ref: RefObject<HTMLElement | null>): void;
}
const SafeAreaMeasurements = createContext<SafeAreaMeasurementQueue | null>(null);

/** @internal A layout update schedules the reader even when only a descendant commits. */
export function SafeAreaMeasurementProvider({ children }: PropsWithChildren) {
  const batch = useMemo(() => {
    const pending = new Map<RefObject<HTMLElement | null>, MeasureView>();
    let schedule: (() => void) | undefined;
    return {
      enqueue(ref: RefObject<HTMLElement | null>, measure: MeasureView) {
        const first = pending.size === 0;
        pending.set(ref, measure);
        if (first) schedule?.();
      },
      remove(ref: RefObject<HTMLElement | null>) { pending.delete(ref); },
      connect(request: () => void) {
        schedule = request;
        return () => { schedule = undefined; pending.clear(); };
      },
      flush() {
        if (!pending.size) return;
        const measurements = [...pending.values()];
        pending.clear();
        const answers: TransformAnswers = new Map();
        const apply = measurements.map(measure => measure(answers));
        for (const update of apply) update?.();
      },
    };
  }, []);
  return createElement(SafeAreaMeasurements.Provider, { value: batch },
    createElement(Fragment, null, children, createElement(SafeAreaReader, { batch })));
}

function SafeAreaReader({ batch }: { batch: { connect(request: () => void): () => void; flush(): void } }) {
  const [, schedule] = useState(0);
  useLayoutEffect(() => batch.connect(() => schedule(pass => pass + 1)), [batch]);
  useLayoutEffect(() => batch.flush());
  return null;
}

export function useNSESafeArea(): NSESafeArea {
  const inherited = useContext(ViewSafeAreaContext);
  const { bounds, insets } = useNSEWindowLayoutSnapshot();
  return useMemo(() => inherited ? { safeAreaInsets: inherited.safeAreaInsets, safeAreaRect: inherited.safeAreaRect } : {
    safeAreaInsets: insets,
    safeAreaRect: Object.freeze({ x: insets.left, y: insets.top, width: Math.max(0, bounds.width - insets.left - insets.right), height: Math.max(0, bounds.height - insets.top - insets.bottom) }),
  }, [inherited, bounds, insets]);
}

/**
 * @internal A view's layout origin in document coordinates, before any CSS
 * transform. AppKit reads a view's frame from the model layer while a
 * presentation animation runs; offsets play that part here, so a window
 * zooming open never moves the frame its safe area is computed from.
 * Returns null where nothing has been laid out (no layout engine, or a view
 * not rendered), and the caller falls back to the client rectangle.
 */
export function nseLayoutOrigin(element: HTMLElement): { readonly x: number; readonly y: number } | null {
  if (!element.offsetWidth && !element.offsetHeight) return null;
  let x = 0, y = 0;
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft; y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (parent) { x += parent.clientLeft; y += parent.clientTop; }
  }
  for (let node = element.parentElement; node; node = node.parentElement) { x -= node.scrollLeft; y -= node.scrollTop; }
  return { x, y };
}

/**
 * @internal Whether a CSS transform sits on the view or an ancestor up to its
 * window root. Only then does the client rectangle differ from the laid-out
 * frame; otherwise it is the frame, at sub-pixel precision offsets lack.
 */
function nseTransformedWithin(element: HTMLElement, root: HTMLElement | null | undefined, answers: TransformAnswers): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  let known = answers.get(root ?? null);
  if (!known) answers.set(root ?? null, known = new Map());
  const set = (value: string) => value !== "" && value !== "none";
  const walked: HTMLElement[] = [];
  let answer = false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const earlier = known.get(node);
    if (earlier !== undefined) { answer = earlier; break; }
    walked.push(node);
    const style = view.getComputedStyle(node);
    if (set(style.transform) || set(style.translate) || set(style.scale) || set(style.rotate)) { answer = true; break; }
    if (node === root) break;
  }
  // Every element walked lies below the one that decided the answer, so it shares that answer.
  for (const node of walked) known.set(node, answer);
  return answer;
}

/** @internal Measures an existing view element; never inserts a layout wrapper. */
export function useNSEViewSafeArea(ref: RefObject<HTMLElement | null>, additional: NSEEdgeInsets = NSEEdgeInsetsZero, onChange?: (insets: NSEEdgeInsets) => void, onResize?: () => void, contentRef?: RefObject<HTMLElement | null>) {
  const model = useContext(WindowLayoutContext);
  const measurements = useContext(SafeAreaMeasurements);
  const parent = useContext(ViewSafeAreaContext);
  const window = useNSEWindowLayoutSnapshot(model);
  const [rect, setRect] = useState<NSEScrollRect>(nseEmptyLayoutRect);
  const resizeCallback = useRef(onResize);
  resizeCallback.current = onResize;
  const accumulated = useMemo(() => NSEEdgeInsetsMake(additional.top + (parent?.additional.top ?? 0), additional.left + (parent?.additional.left ?? 0), additional.bottom + (parent?.additional.bottom ?? 0), additional.right + (parent?.additional.right ?? 0)), [additional.top, additional.left, additional.bottom, additional.right, parent?.additional]);
  const read: MeasureView = (answers = new Map()) => {
    const element = ref.current;
    if (!element) return;
    const transformed = nseTransformedWithin(element, model?.root, answers);
    const origin = transformed ? nseLayoutOrigin(element) : null;
    const rootOrigin = model?.root ? nseLayoutOrigin(model.root) : { x: window.bounds.x, y: window.bounds.y };
    if (origin && rootOrigin) {
      const laidOut = Object.freeze({ x: origin.x - rootOrigin.x, y: origin.y - rootOrigin.y, width: element.offsetWidth, height: element.offsetHeight });
      return () => setRect(previous => previous && nseEqualRects(previous, laidOut) ? previous : laidOut);
    }
    const measured = element.getBoundingClientRect();
    const root = model?.root?.getBoundingClientRect();
    const scaleX = root?.width ? window.bounds.width / root.width : 1;
    const scaleY = root?.height ? window.bounds.height / root.height : 1;
    const next = Object.freeze({ x: (measured.x - (root?.x ?? window.bounds.x)) * scaleX, y: (measured.y - (root?.y ?? window.bounds.y)) * scaleY, width: element.offsetWidth || measured.width * scaleX, height: element.offsetHeight || measured.height * scaleY });
    return () => setRect(previous => previous && nseEqualRects(previous, next) ? previous : next);
  };
  // Re-measure on a committed parent layout as well as on size notifications:
  // sibling chrome can move a view without changing its own size.
  useLayoutEffect(() => {
    if (!measurements) { read(transformAnswersForStandaloneViews())?.(); return; }
    measurements.enqueue(ref, read);
    return () => measurements.remove(ref);
  });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (model) {
      const stop = model.observeElement(element, () => { read()?.(); resizeCallback.current?.(); }, false);
      const stopContent = contentRef?.current ? model.observeElement(contentRef.current, () => resizeCallback.current?.(), false) : undefined;
      return () => { stop(); stopContent?.(); };
    }
    const Observer = element.ownerDocument.defaultView?.ResizeObserver;
    const observer = Observer ? new Observer(() => { read()?.(); resizeCallback.current?.(); }) : null;
    observer?.observe(element);
    if (contentRef?.current) observer?.observe(contentRef.current);
    return () => observer?.disconnect();
  }, [model, ref, contentRef, window.bounds]);
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
