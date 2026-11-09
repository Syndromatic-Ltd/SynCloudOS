/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { useEffect, useRef, useState, type DOMAttributes } from "react";

/** @internal Publishes pointer/keyboard drawing state without owning activation. */
export function useNSEThemeInteraction<T extends HTMLElement>(enabled = true, nativeHighlight = false, handlers: DOMAttributes<T> = {}) {
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [highlighted, setHighlighted] = useState(false);
  const element = useRef<T | null>(null);
  useEffect(() => {
    if (!highlighted) return;
    const view = element.current?.ownerDocument.defaultView;
    const end = () => setHighlighted(false);
    view?.addEventListener("pointerup", end, true);
    view?.addEventListener("pointercancel", end, true);
    view?.addEventListener("blur", end);
    return () => { view?.removeEventListener("pointerup", end, true); view?.removeEventListener("pointercancel", end, true); view?.removeEventListener("blur", end); };
  }, [highlighted]);
  const events: DOMAttributes<T> = {
    onPointerOverCapture(event) { setHovered(true); handlers.onPointerOverCapture?.(event); },
    onPointerOutCapture(event) { if (!event.relatedTarget || !(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setHovered(false); handlers.onPointerOutCapture?.(event); },
    onFocusCapture(event) { setFocused((event.target as Element).matches(":focus-visible")); handlers.onFocusCapture?.(event); },
    onBlurCapture(event) { setFocused(false); setHighlighted(false); handlers.onBlurCapture?.(event); },
    onPointerDownCapture(event) { if (enabled && nativeHighlight && event.button === 0) { element.current = event.currentTarget; setHighlighted(true); } handlers.onPointerDownCapture?.(event); },
    onKeyDownCapture(event) { if (enabled && nativeHighlight && (event.key === " " || event.key === "Enter")) { element.current = event.currentTarget; setHighlighted(true); } handlers.onKeyDownCapture?.(event); },
    onKeyUpCapture(event) { if (event.key === " " || event.key === "Enter") setHighlighted(false); handlers.onKeyUpCapture?.(event); },
  };
  return { hovered, focused, highlighted: highlighted && enabled, events };
}
