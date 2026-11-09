/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { physicalSafeAreaInsets } from "./safeAreaModel";

/** @internal Device padding stays distinct from chrome's obstruction of content. */
export function useNSEScreenSafeAreaProperties(logical: Parameters<typeof physicalSafeAreaInsets>[0]) {
  const ref = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () => setDirection(element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr");
    read();
    const Observer = element.ownerDocument.defaultView?.MutationObserver;
    const observer = Observer ? new Observer(read) : null;
    observer?.observe(element.ownerDocument.documentElement, { attributes: true, subtree: true, attributeFilter: ["dir"] });
    return () => observer?.disconnect();
  }, []);
  const insets = physicalSafeAreaInsets(logical, direction);
  const properties = Object.fromEntries(Object.entries(insets).map(([edge, value]) => [`--nse-screen-safe-area-inset-${edge}`, `${value}px`])) as CSSProperties;
  return { ref, insets, properties };
}
