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
import type { NSEResolvedColourScheme } from "../Appearance/nseAppearanceTypes";
import { classes } from "../Controls/Core/nseControlsShared";

/**
 * A layout-neutral projection of the Metal source-list material owned by
 * NSESidebar. It deliberately owns only the appearance surface: callers keep
 * their own navigation/layout semantics instead of importing desktop sidebar
 * geometry into a contained hierarchy page.
 */
export interface NSEMetalSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  readonly mode: NSEResolvedColourScheme;
  readonly children?: ReactNode;
}

export function NSEMetalSurface({
  mode,
  children,
  className = "",
  ...props
}: NSEMetalSurfaceProps) {
  return (
    <div
      {...props}
      className={classes("nse-metal-surface", className)}
      data-nse-material="metal"
      data-mode={mode}
      data-nse-metal-surface-recipe="nse.sidebar.metal.surface"
      data-nse-metal-surface-noise="nse-metal-grain"
    >
      {children}
    </div>
  );
}
