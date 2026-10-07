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

import type { HTMLAttributes, ReactNode } from "react";
import { classes } from "../Core/nseControlsShared";

export interface NSEDividerProps extends HTMLAttributes<HTMLHRElement> {
  variant?: "plain" | "soft" | "gray" | "alpha" | "arrow";
  label?: string;
  /** Visible inline caption — renders the divider grammar: [caption][line-to-edge]. */
  caption?: ReactNode;
  /** Optional leading icon URL for the captioned form. */
  icon?: string;
  /** Disclosure state for the `arrow` variant (steps the sprite to its expanded rows). */
  expanded?: boolean;
  /**
   * When provided, the divider becomes an interactive disclosure control: it renders as an
   * accessible <button> (keyboard + aria-expanded) instead of a presentational <hr>. Used for
   * collapsible source-list section headers. Without it, behaviour is unchanged.
   */
  onToggle?: () => void;
}

export function NSEDivider({
  variant = "plain",
  label,
  caption,
  icon,
  className = "",
  expanded,
  onToggle,
  style,
  ...props
}: NSEDividerProps) {
  if (onToggle) {
    return (
      <button
        type="button"
        className={classes("nse-control-divider", "nse-control-divider-toggle", className)}
        data-variant={variant}
        data-expanded={expanded ? "true" : "false"}
        aria-expanded={expanded}
        aria-label={label}
        style={style}
        onClick={onToggle}
      />
    );
  }
  if (variant === "alpha" && caption !== undefined) {
    // Alphabetical divider: a single-letter index caption in a left gutter, then line-to-edge.
    return (
      <div
        className={classes("nse-control-divider", "nse-control-divider-alpha-captioned", className)}
        data-variant="alpha"
        role="separator"
        aria-label={label ?? (typeof caption === "string" ? caption : undefined)}
        style={style}
      >
        <span className="nse-control-divider-alpha-caption">{caption}</span>
      </div>
    );
  }
  if (caption !== undefined) {
    return (
      <div
        className={classes("nse-control-divider", "nse-control-divider-captioned", className)}
        data-variant={variant}
        role="separator"
        aria-label={label}
        style={style}
      >
        {icon ? (
          <span
            className="nse-control-divider-icon"
            style={{ backgroundImage: `url("${icon}")` }}
            aria-hidden="true"
          />
        ) : null}
        <span className="nse-control-divider-caption">{caption}</span>
        <span className="nse-control-divider-cap" aria-hidden="true" />
      </div>
    );
  }
  return (
    <hr
      className={classes("nse-control-divider", className)}
      data-variant={variant}
      data-expanded={expanded ? "true" : undefined}
      aria-label={label}
      style={style}
      {...props}
    />
  );
}
