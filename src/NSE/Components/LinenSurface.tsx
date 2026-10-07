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

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import {
  getOptionalNSESmoothSurfaceProps,
  type NSESmoothSurfaceRequest,
  type NSESmoothSurfaceStyle
} from "../SmoothSurface";

export function LinenSurface({
  children,
  smoothSurface = false,
  className = "",
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; smoothSurface?: NSESmoothSurfaceRequest }) {
  const surfaceProps = getOptionalNSESmoothSurfaceProps(
    smoothSurface,
    className,
    style as NSESmoothSurfaceStyle | undefined
  );

  return (
    <div
      className={`nse-material-linen atmo-linen ${surfaceProps.className ?? ""}`.trim()}
      style={surfaceProps.style as CSSProperties | undefined}
      {...props}
    >
      {children}
    </div>
  );
}
