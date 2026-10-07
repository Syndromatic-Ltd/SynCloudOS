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

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import "./nse-list-item.css";
import "../../Navigation/SourceList/nse-sourcelist.css";
import type { HFXFeedbackRequest } from "../../Feedback";
import type { NSESmoothSurfaceRequest } from "../../SmoothSurface";
import { classes, getControlSmoothSurfaceProps, useNSEControlFeedback } from "../Core/nseControlsShared";

export interface NSEListItemProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  disabled?: boolean;
  /** Show the held (#555→#888) press highlight on tap. Default true. */
  tapHighlight?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  meta?: ReactNode;
  selectionHaptic?: HFXFeedbackRequest;
  smoothSurface?: NSESmoothSurfaceRequest;
}

export const NSEListItem = forwardRef<HTMLDivElement, NSEListItemProps>(function NSEListItem({
  selected = false,
  disabled = false,
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
}: NSEListItemProps, ref) {
  const { triggerNSEControlHaptic, triggerNSEControlHapticForEvent } = useNSEControlFeedback();

  const surfaceProps = getControlSmoothSurfaceProps(smoothSurface, className, style);

  return (
    <div
      ref={ref}
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
      {leading ? <span className="nse-control-list-leading">{leading}</span> : null}
      <span className="nse-control-list-body">
        <span className="nse-control-list-primary">{children}</span>
        {meta ? <span className="nse-control-list-meta">{meta}</span> : null}
      </span>
      {trailing ? <span className="nse-control-list-trailing">{trailing}</span> : null}
    </div>
  );
});
