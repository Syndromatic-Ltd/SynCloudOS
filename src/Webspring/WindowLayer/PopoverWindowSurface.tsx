/*
 * SynCloudOS
 * Copyright Â© 2026 Syndromatic Ltd. All rights reserved.
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

import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useNSEAppearanceProjection } from "../../NSE/Appearance";
import { useNSEAnimationEnvironment } from "../../NSE/Animation";
import { useNSEPresenceExiting } from "../../NSE/Animation";
import { PopoverFrame } from "../../NSE/hostComposition";
import { applyNSEPopoverPosition } from "../../NSE/hostComposition";
import { nsePopoverSpringEasing, useNSEPopoverSurface } from "../../NSE/hostComposition";
import { useKernelSynCloudOS } from "../../SynCloudOSReact";
import type { WindowSurfacePresentation } from "./WindowContentRendererRegistry";

/** A real window's plate, using exactly the standalone popover's frame. */
export function PopoverWindowSurface({ surface, windowControllerId, anchored, children }: {
  readonly surface: WindowSurfacePresentation;
  readonly windowControllerId: string;
  readonly anchored: boolean;
  readonly children: ReactNode;
}) {
  const runtime = useKernelSynCloudOS();
  const appearance = useNSEAppearanceProjection();
  const { reducedMotion } = useNSEAnimationEnvironment();
  const exiting = useNSEPresenceExiting();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [arrow, setArrow] = useState<HTMLSpanElement | null>(null);
  const { request, popoverPosition: position } = surface;
  const frameArrow = anchored && (position?.arrowX !== undefined || position?.arrowY !== undefined) ? arrow : null;
  const painted = useNSEPopoverSurface(element, frameArrow, !exiting, true);
  useLayoutEffect(() => {
    if (!element) return;
    if (!anchored) element.style.removeProperty("transform-origin");
    if (position) applyNSEPopoverPosition(element, frameArrow, position);
  }, [element, anchored, frameArrow, position]);
  useLayoutEffect(() => {
    if (!exiting || !element || !painted.current) return;
    // Disposing the presenting controller removes its live view immediately.
    // Hold only its last paint for the window's inert exit presentation.
    const fill = painted.current.style.getPropertyValue("--nse-popover-arrow-fill");
    if (fill) element.style.setProperty("--nse-popover-arrow-fill", fill);
  }, [element, exiting, painted]);
  const closingContent = exiting ? painted.current?.querySelector(".nse-overlay-popup-content")?.cloneNode(true) as HTMLElement | undefined : undefined;
  closingContent?.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  return <div
    ref={setElement}
    {...appearance}
    className={`nse-overlay-popup nse-popover nse-overlay-popup--${anchored ? "popover" : "action-sheet"}`}
    data-nse-control="popover" data-nse-role="overlay" data-nse-part="surface" data-nse-style={anchored ? "popover" : "action-sheet"}
    data-nse-window-popover=""
    data-nse-popover-draws-background={String(request.drawsBackground ?? true)}
    data-nse-reduced-motion={String(reducedMotion)}
    data-nse-overlay-kind={anchored ? "popover" : "action-sheet"}
    data-nse-presentation={anchored ? "anchored" : "sheet"}
    data-state={exiting ? "closing" : "open"}
    role="dialog" tabIndex={-1}
    aria-modal={!anchored || undefined}
    aria-label={request.labelledBy ? undefined : request.title}
    aria-labelledby={request.labelledBy} aria-describedby={request.describedBy}
    style={{ width: "100%", height: "100%", minWidth: 0, "--nse-popover-spring": nsePopoverSpringEasing } as CSSProperties}
    onKeyDown={event => {
      if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing || request.behavior === "applicationDefined") return;
      event.preventDefault(); event.stopPropagation();
      void runtime.windows.requestClose(windowControllerId, { reason: "command" });
    }}
  >
    <PopoverFrame arrowRef={setArrow} anchored={anchored} />
    <div className="nse-overlay-popup-content" dangerouslySetInnerHTML={exiting ? { __html: closingContent?.innerHTML ?? "" } : undefined}>{exiting ? undefined : children}</div>
  </div>;
}
