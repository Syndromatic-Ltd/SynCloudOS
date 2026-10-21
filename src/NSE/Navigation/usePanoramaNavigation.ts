import { useNSEInheritedDirection } from "./useNSEInheritedDirection";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject, type PointerEvent } from "react";

/** One unbounded logical position drives every Panorama layer. Ratios and
 * settling curve are calibrated adaptations, not undocumented WP7 constants. */
export function panoramaSlot(index: number, position: number, count: number): number {
  if (count < 2) return 0;
  // Two unique trees cannot occupy both neighboring slots simultaneously.
  // For larger tracks move a fully exited pane around immediately, so the
  // upcoming neighbor is already present during the last pixels of settling.
  return index + (count === 2
    ? Math.floor((position - index + 1) / count)
    : Math.ceil((position - index - 1) / count)) * count;
}
export function usePanoramaNavigation({ host, ids, selectedId, enabled, reducedMotion, select, dir, disabledIds = [] }: {
  host: RefObject<HTMLDivElement | null>; ids: readonly string[]; disabledIds?: readonly string[]; selectedId: string;
  enabled: boolean; reducedMotion: boolean; select: (id: string) => Promise<void>; dir?: "ltr" | "rtl";
}) {
  const initial = Math.max(0, ids.indexOf(selectedId));
  const [position, setPosition] = useState(initial);
  const [width, setWidth] = useState(1);
  const current = useRef(initial);
  const frame = useRef(0);
  const target = useRef(initial);
  const previousSelected = useRef(selectedId);
  const previousEnabled = useRef(false);
  const previousReducedMotion = useRef(reducedMotion);
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  const selectionRevision = useRef(0);
  const gesture = useRef<{ id: number; x: number; y: number; start: number; axis: "pending" | "horizontal" | "vertical"; samples: { x: number; time: number }[] } | null>(null);
  const inheritedDirection = useNSEInheritedDirection(host, dir);
  const sign = (dir ?? inheritedDirection) === "rtl" ? -1 : 1;
  const publish = useCallback((value: number) => { current.current = value; setPosition(value); }, []);
  const stop = useCallback(() => { cancelAnimationFrame(frame.current); frame.current = 0; }, []);
  const settle = useCallback((value: number) => {
    stop(); target.current = value;
    if (reducedMotion) { publish(value); return; }
    const start = current.current; const time = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - time) / 320);
      publish(start + (value - start) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else frame.current = 0;
    };
    frame.current = requestAnimationFrame(tick);
  }, [publish, reducedMotion, stop]);
  useLayoutEffect(() => {
    if (!enabled || !host.current) return;
    const node = host.current;
    const measure = () => setWidth(Math.max(1, node.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, host]);
  useEffect(() => {
    const enabledChanged = previousEnabled.current !== enabled;
    const reducedChanged = previousReducedMotion.current !== reducedMotion;
    previousEnabled.current = enabled; previousReducedMotion.current = reducedMotion;
    if (!enabled) { stop(); gesture.current = null; previousSelected.current = selectedId; return; }
    const index = ids.indexOf(selectedId);
    if (index < 0) return;
    if (enabledChanged || reducedChanged && reducedMotion) {
      stop(); gesture.current = null; previousSelected.current = selectedId;
      target.current = index + Math.round((target.current - index) / ids.length) * ids.length;
      publish(target.current); return;
    }
    if (previousSelected.current !== selectedId) {
      previousSelected.current = selectedId;
      const nearest = index + Math.round((target.current - index) / Math.max(1, ids.length)) * ids.length;
      settle(nearest);
    } else if (((Math.round(target.current) % ids.length) + ids.length) % ids.length !== index) {
      target.current = index; publish(index);
    }
  }, [enabled, reducedMotion, selectedId, ids.join("\0"), settle, stop, publish]);
  useEffect(() => () => { selectionRevision.current += 1; stop(); }, [stop]);
  const commit = useCallback((next: number) => {
    const revision = ++selectionRevision.current;
    target.current = next;
    settle(next);
    void select(ids[((next % ids.length) + ids.length) % ids.length]).catch(() => {
      if (revision !== selectionRevision.current) return;
      const index = Math.max(0, ids.indexOf(selectedRef.current));
      settle(index + Math.round((current.current - index) / ids.length) * ids.length);
    });
  }, [ids, select, settle]);
  const move = useCallback((delta: number) => {
    if (ids.length < 2) return;
    let next = Math.round(target.current) + delta;
    let attempts = 0;
    while (disabledIds.includes(ids[((next % ids.length) + ids.length) % ids.length]) && attempts++ < ids.length) next += delta;
    if (attempts >= ids.length) return;
    commit(next);
  }, [ids, disabledIds, commit]);
  // Include the next panel’s 24px inner gutter before the actual 5% content reveal.
  const stride = Math.max(width * .5, width * .95 - 24);
  const handlers = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (!enabled || ids.length < 2 || !event.isPrimary || event.button !== 0) return;
      const element = event.target as HTMLElement;
      if (element.closest('input,textarea,select,button,a,[contenteditable="true"],[role="slider"],[data-nse-panorama-no-swipe]')) return;
      const editableOwner = element.closest("[contenteditable]");
      if (element.isContentEditable || editableOwner && editableOwner.getAttribute("contenteditable") !== "false") return;
      if (window.getSelection()?.toString()) return;
      // Desktop text selection is not a navigation gesture. Touch still pans
      // across reading content, while editable and slider surfaces never do.
      if (event.pointerType === "mouse" && element.closest("[data-nse-tab-panel]")
        && (element.textContent?.trim() || element.closest("p,h1,h2,h3,h4,span,output,label,li"))) return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: current.current, axis: "pending", samples: [{ x: event.clientX, time: event.nativeEvent.timeStamp }] };
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const g = gesture.current; if (!g || g.id !== event.pointerId) return;
      if (event.pointerType === "mouse" && event.buttons === 0) {
        gesture.current = null; if (g.axis === "horizontal") settle(target.current); return;
      }
      if (event.pointerType === "mouse" && window.getSelection()?.toString()) {
        gesture.current = null; if (g.axis === "horizontal") settle(target.current); return;
      }
      const dx = event.clientX - g.x; const dy = event.clientY - g.y;
      if (g.axis === "pending" && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
        g.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "horizontal" : "vertical";
        if (g.axis === "horizontal") {
          stop(); g.start = current.current;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }
      }
      if (g.axis !== "horizontal") return;
      event.preventDefault();
      g.samples = [...g.samples.filter(sample => event.nativeEvent.timeStamp - sample.time <= 80), { x: event.clientX, time: event.nativeEvent.timeStamp }];
      publish(g.start - dx * sign / stride);
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      const g = gesture.current; if (!g || g.id !== event.pointerId) return;
      gesture.current = null;
      if (g.axis !== "horizontal") { settle(target.current); return; }
      const finalPosition = g.start - (event.clientX - g.x) * sign / stride;
      publish(finalPosition);
      const travel = finalPosition - g.start;
      const recent = [...g.samples].reverse().find(sample => event.nativeEvent.timeStamp - sample.time <= 80 && event.nativeEvent.timeStamp > sample.time && Math.abs(sample.x - event.clientX) >= 8);
      const velocity = recent ? (recent.x - event.clientX) * sign / (event.nativeEvent.timeStamp - recent.time) : 0;
      // Authored flick calibration: recent velocity expires after a pause.
      // A fast reversal toward the starting pane cancels, rather than jumping
      // to the pane opposite the net drag. Direct items still follow 1:1.
      const fastRelease = Math.abs(velocity) >= .5 && Math.abs(travel * stride) >= 12;
      const direction = fastRelease
        ? Math.sign(velocity) === Math.sign(travel) ? Math.sign(travel) : 0
        : Math.abs(travel) > .18 ? Math.sign(travel) : 0;
      let next = Math.round(g.start) + direction;
      if (disabledIds.includes(ids[((next % ids.length) + ids.length) % ids.length])) next = Math.round(g.start);
      commit(next);
    },
    onPointerLeave() { if (gesture.current?.axis === "pending") gesture.current = null; },
    onPointerCancel() { gesture.current = null; settle(target.current); },
    onLostPointerCapture() { if (!gesture.current) return; gesture.current = null; settle(target.current); },
  };
  return { position, width, stride, sign, handlers, move };
}
