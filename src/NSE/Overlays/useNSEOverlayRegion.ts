/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import { resolveNSEFocusReturnTarget } from "../Focus/focusOrigin";
import { resolveNSEOverlayRegion, type NSEOverlayPresentationSource, type NSEOverlayRegionBounds } from "./overlayRegion";

/** Read-only placement projection. The existing focus owner remains the only
 * focus authority. Capture origin before the trap moves focus; do not switch
 * halves merely because a live dialog's control now has focus. */
export function useNSEOverlayRegion({ source, open, origin, document, direction }: {
  readonly source: NSEOverlayPresentationSource | null;
  readonly open: boolean;
  readonly origin?: HTMLElement | null;
  readonly document: Document | null;
  readonly direction?: "ltr" | "rtl";
}) {
  const captured = useRef<{ source: NSEOverlayPresentationSource | null; element: HTMLElement | null; bounds: NSEOverlayRegionBounds | null; direction: "ltr" | "rtl" } | null>(null);
  if (!open) captured.current = null;
  if (open && (!captured.current || captured.current.source !== source)) {
    const ownerChanged = captured.current !== null;
    const element = origin ?? (ownerChanged ? null : resolveNSEFocusReturnTarget(document?.activeElement ?? null));
    const rect = element?.isConnected ? element.getBoundingClientRect() : null;
    captured.current = { source, element, bounds: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      direction: direction ?? (element && document?.defaultView?.getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr") };
  }
  const read = useCallback(() => {
    if (!open) return null;
    try { return source?.getSnapshot() ?? null; } catch { return null; }
  }, [open, source]);
  const subscribe = useCallback((listener: () => void) => {
    if (!open) return () => undefined;
    try { return source?.subscribe(listener) ?? (() => undefined); } catch { return () => undefined; }
  }, [open, source]);
  const snapshot = useSyncExternalStore(subscribe, read, read);
  const getBoundary = useCallback(() => {
    const traits = read();
    if (!traits) return null;
    const element = origin?.isConnected ? origin : captured.current?.element;
    const rect = element?.isConnected ? element.getBoundingClientRect() : null;
    const bounds = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : captured.current?.bounds;
    return resolveNSEOverlayRegion(traits, bounds, direction ?? captured.current?.direction);
  }, [direction, origin, read]);
  return { region: getBoundary(), hostViewport: snapshot?.hostViewportBounds ?? null, getBoundary };
}
