import { useLayoutEffect, useState, type RefObject } from "react";

/** Resolve direction at the real DOM boundary and follow ancestor dir changes.
 * A nested framework layout must not silently reset an app's RTL context. */
export function useNSEInheritedDirection(ref: RefObject<HTMLElement | null>, explicit?: "ltr" | "rtl") {
  const [direction, setDirection] = useState<"ltr" | "rtl">(explicit ?? "ltr");
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const declared = explicit ?? node.closest("[dir]")?.getAttribute("dir");
      const value = declared === "rtl" || declared === "ltr" ? declared
        : node.ownerDocument.defaultView?.getComputedStyle(node).direction;
      setDirection(value === "rtl" ? "rtl" : "ltr");
    };
    update();
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(update);
    for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ["dir"] });
    }
    return () => observer.disconnect();
  }, [ref, explicit]);
  return direction;
}
