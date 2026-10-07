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

export interface NSERoundedBoxProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "roundy" | "frame" | "shadow";
}

export function NSERoundedBox({ variant = "roundy", className = "", children, ...props }: NSERoundedBoxProps) {
  return (
    <div className={classes("nse-control-rounded-box", className)} data-variant={variant} {...props}>
      {children}
    </div>
  );
}
