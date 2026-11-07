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

import type { HTMLAttributes } from "react";

import { classes } from "../Controls/Core/nseControlsShared";
import { useNSEProgressVisibility } from "./progressCore";

/** @internal */
export interface NSESpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: "small" | "large";
  tone?: "light" | "dark";
  label?: string;
}

/**
 * The theme's filmstrip spinner that system chrome (the login window) draws.
 * SynWare uses NSEProgressIndicator with style spinning.
 *
 * @internal
 */
export function NSESpinner({ size = "small", tone = "light", label = "Loading", className = "", ...props }: NSESpinnerProps) {
  const rootRef = useNSEProgressVisibility<HTMLSpanElement>();

  return (
    <span ref={rootRef} className={classes("nse-control-spinner", className)} data-size={size} data-tone={tone} role="status" aria-label={label} {...props}>
      <span className="nse-control-spinner-sprite" aria-hidden="true" />
    </span>
  );
}
