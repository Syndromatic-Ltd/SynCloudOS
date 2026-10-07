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

import { useRef, type CSSProperties, type ReactNode } from "react";
import "./components.css";
import { useNSEAnimationEnvironment, useNSEPresentation } from "../Animation";
import { resolveNSEAlertMotion } from "./NSEAlert.transitions";
import {
  getOptionalNSESmoothSurfaceProps,
  type NSESmoothSurfaceRequest,
  type NSESmoothSurfaceStyle
} from "../SmoothSurface";


export function NSEAlert({
  children,
  className = "",
  appearance = "dark",
  labelledBy,
  describedBy,
  role = "alertdialog",
  initialFocusSelector,
  smoothSurface = false,
  style
}: {
  children: ReactNode;
  className?: string;
  appearance?: "dark" | "light";
  labelledBy?: string;
  describedBy?: string;
  role?: "alertdialog" | "dialog";
  initialFocusSelector?: string;
  smoothSurface?: NSESmoothSurfaceRequest;
  style?: CSSProperties;
}) {
  const { reducedMotion } = useNSEAnimationEnvironment();
  const alertRef = useRef<HTMLDivElement>(null);
  useNSEPresentation(alertRef, resolveNSEAlertMotion(reducedMotion));
  const surfaceProps = getOptionalNSESmoothSurfaceProps(
    smoothSurface,
    className,
    style as NSESmoothSurfaceStyle | undefined
  );

  return (
    <div
      ref={alertRef}
      className={`nse-control-alert is-${appearance} ${surfaceProps.className ?? ""}`.trim()}
      role={role}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      data-nse-initial-focus-selector={initialFocusSelector}
      tabIndex={-1}
      style={surfaceProps.style as CSSProperties | undefined}
    >
      {children}
    </div>
  );
}
