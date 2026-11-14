import { useLayoutEffect, useRef } from "react";
import { sampleSpring } from "../../FX/AnimationFX/AFXTimingFunction";
import { updateNSEPopoverFrame } from "./popoverFrame";
import { useNSEOverlayProvider } from "./OverlayProvider";

// The same damped oscillator as AFXSpringAnimation, sampled once for CSS.
// 320 ms, with a small overshoot (about 1% at the presented scale).
export const nsePopoverSpringEasing = `linear(${Array.from({ length: 65 }, (_, index) =>
  index === 64 ? 1 : Number(sampleSpring(index / 64 * 0.32, 1, 620, 34).toFixed(5)),
).join(", ")})`;

/** Keeps painted frame geometry independent of animation and bridges the
 * content root's fill up to its sibling arrow across the portal. */
export function useNSEPopoverSurface(surface: HTMLElement | null, arrow: HTMLElement | null, open: boolean, enabled: boolean) {
  const { runtime } = useNSEOverlayProvider();
  const paintedSurface = useRef<HTMLElement | null>(null);
  const isOpen = useRef(open);
  isOpen.current = open;
  useLayoutEffect(() => {
    if (!surface || !enabled) return;
    const content = surface.querySelector<HTMLElement>(".nse-overlay-popup-content");
    const view = surface.ownerDocument.defaultView;
    const update = () => {
      const root = content?.querySelector("[data-nse-view-controller]")?.firstElementChild ?? content?.firstElementChild;
      const fill = root && view?.getComputedStyle(root).getPropertyValue("--nse-popover-content-fill").trim();
      if (fill && surface.style.getPropertyValue("--nse-popover-arrow-fill") !== fill) surface.style.setProperty("--nse-popover-arrow-fill", fill);
      if (!fill) surface.style.removeProperty("--nse-popover-arrow-fill");
      updateNSEPopoverFrame(surface, arrow);
    };
    update();
    const resize = view?.ResizeObserver ? new view.ResizeObserver(update) : null;
    resize?.observe(surface);
    const mutation = view?.MutationObserver ? new view.MutationObserver(update) : null;
    if (content) mutation?.observe(content, { childList: true, subtree: true, attributes: true });
    return () => { resize?.disconnect(); mutation?.disconnect(); };
  });

  // presentAsPopover disposes its controller on dismissal. Preserve its last
  // painted DOM for the short exit, as attached window sheets do. This copy
  // carries no overlay registration, focus, IDs or live controller.
  useLayoutEffect(() => {
    if (!surface || !enabled) return;
    let snapshot: HTMLElement | null = null;
    let heldController = false;
    const capture = () => {
      if (!isOpen.current || surface.dataset.state === "closing") return;
      const controller = surface.querySelector("[data-nse-view-controller]");
      if (heldController && !controller) return;
      heldController ||= Boolean(controller);
      snapshot = surface.cloneNode(true) as HTMLElement;
      const sources = surface.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
      const targets = snapshot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
      sources.forEach((source, index) => {
        const target = targets[index];
        if (!target) return;
        target.value = source.value;
        if (source instanceof surface.ownerDocument.defaultView!.HTMLTextAreaElement) target.textContent = source.value;
        else target.setAttribute("value", source.value);
        if ("checked" in source && "checked" in target) {
          target.checked = source.checked;
          if (source.checked) target.setAttribute("checked", ""); else target.removeAttribute("checked");
        }
      });
      paintedSurface.current = snapshot;
    };
    capture();
    const Observer = surface.ownerDocument.defaultView?.MutationObserver;
    const observer = Observer ? new Observer(capture) : null;
    observer?.observe(surface, { childList: true, subtree: true, attributes: true, characterData: true });
    surface.addEventListener("input", capture, true);
    const portal = surface.closest<HTMLElement>("[data-nse-overlay-portal-host]");
    return () => {
      observer?.disconnect();
      surface.removeEventListener("input", capture, true);
      queueMicrotask(() => {
        if (!snapshot || !isOpen.current || surface.isConnected || runtime.signal.aborted) return;
        if (!portal?.isConnected) return;
        const copy = snapshot;
        copy.removeAttribute("id");
        copy.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
        copy.setAttribute("inert", "");
        copy.setAttribute("aria-hidden", "true");
        copy.dataset.state = "closing";
        portal.appendChild(copy);
        let handle: unknown;
        const remove = () => { copy.remove(); runtime.signal.removeEventListener("abort", abort); };
        const abort = () => { runtime.environment.clearTimeout(handle); remove(); };
        handle = runtime.environment.setTimeout(remove, copy.dataset.nseReducedMotion === "true" ? 100 : 150);
        runtime.signal.addEventListener("abort", abort, { once: true });
      });
    };
  }, [enabled, runtime, surface]);
  return paintedSurface;
}
