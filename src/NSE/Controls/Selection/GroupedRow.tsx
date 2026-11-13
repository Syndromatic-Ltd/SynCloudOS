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

import { nseControlHooks } from "../../Theme/contract/hooks";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import "./nse-list-item.css";
import "../../Navigation/SourceList/nse-sourcelist.css";
import type { HFXFeedbackRequest } from "../../Feedback";
import type { NSESmoothSurfaceRequest } from "../../SmoothSurface";
import { classes, getControlSmoothSurfaceProps, useNSEControlFeedback } from "../Core/nseControlsShared";

export interface GroupedRowProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  isEnabled?: boolean;
  /** Show the held (#555→#888) press highlight on tap. Default true. */
  tapHighlight?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  meta?: ReactNode;
  selectionHaptic?: HFXFeedbackRequest;
  smoothSurface?: NSESmoothSurfaceRequest;
}

export const GroupedRow = forwardRef<HTMLDivElement, GroupedRowProps>(function GroupedRow({
  selected = false,
  isEnabled = true,
  tapHighlight = true,
  leading,
  trailing,
  meta,
  selectionHaptic = "selection",
  smoothSurface = false,
  children,
  className = "",
  onClick,
  style,
  ...props
}: GroupedRowProps, ref) {
  const disabled = !isEnabled;
  const { triggerNSEControlHaptic, triggerNSEControlHapticForEvent } = useNSEControlFeedback();

  const surfaceProps = getControlSmoothSurfaceProps(smoothSurface, className, style);

  return (
    <div
      ref={ref}
      {...nseControlHooks({ control: "table-cell-view", selected, enabled: isEnabled, highlighted: (props as Record<string, unknown>)["data-pressed"] === "true", variants: { style: "list", "highlight-style": tapHighlight ? "regular" : "none" } })}
      data-nse-part="cell-content"
      className={classes("nse-control-list-item", disabled && "is-disabled", surfaceProps.className)}
      data-selected={selected ? "true" : "false"}
      data-tap-highlight={tapHighlight ? undefined : "false"}
      aria-disabled={disabled || undefined}
      style={surfaceProps.style}
      onClick={(event) => {
        onClick?.(event);
        triggerNSEControlHapticForEvent(selectionHaptic, event, !disabled);
      }}
      {...props}
    >
      {leading ? <span data-nse-part="leading" className="nse-control-list-leading">{leading}</span> : null}
      <span data-nse-part="text-content" className="nse-control-list-body">
        <span data-nse-part="primary-text" className="nse-control-list-primary">{children}</span>
        {meta ? <span data-nse-part="secondary-text" className="nse-control-list-meta">{meta}</span> : null}
      </span>
      {trailing ? <span data-nse-part="trailing" className="nse-control-list-trailing">{trailing}</span> : null}
    </div>
  );
});
