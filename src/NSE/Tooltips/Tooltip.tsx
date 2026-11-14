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

import { createPortal } from "react-dom";
import { useState } from "react";
import { useNSEOverlay, useNSEOverlayProvider } from "../Overlays";
import type { TooltipProps } from "./tooltipTypes";
import { useNSEAppearanceProjection } from "../Appearance";

/** A noninteractive overlay; focus stays on its anchor. */
export function Tooltip({ id, content, open, anchor, placement = "block-end-inline-start", onOpenChange, onPointerEnter, onPointerLeave }: TooltipProps) {
  const appearanceProjection = useNSEAppearanceProjection();
  if (!id.trim()) throw new TypeError("NSE tooltip IDs must not be empty.");
  const { runtime, defaultParentResponderId } = useNSEOverlayProvider();
  const [arrow, setArrow] = useState<HTMLSpanElement | null>(null);
  const overlay = useNSEOverlay({
    id,
    kind: "tooltip",
    parentResponderId: defaultParentResponderId ?? runtime.runtimeId,
    anchor,
    open,
    placement,
    // Clears the 4px the pointer stands proud of the bubble.
    offset: 9,
    arrow,
    restoreFocus: false,
    dismissOn: ["escape", "anchor-removed", "programmatic", "parent-dismissed"],
    onDismiss: () => onOpenChange?.(false),
  });
  if (!open || !anchor || !overlay.portalHost) return null;
  const surface = (
    <div
      {...overlay.surfaceProps}
      {...appearanceProjection}
      id={id}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="nse-tooltip"
      data-nse-control="tooltip"
      data-nse-part="surface"
      data-state="open"

    >
      <span ref={setArrow} className="nse-tooltip-arrow" aria-hidden="true" data-nse-part="arrow"  />
      <span className="nse-tooltip-content" data-nse-part="content">{content}</span>
    </div>
  );
  return createPortal(overlay.withFocusScope(surface), overlay.portalHost);
}
