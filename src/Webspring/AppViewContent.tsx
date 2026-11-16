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

import { useRef } from "react";
import { useNSEViewSafeArea } from "../NSE/hostComposition";
import type { CSSProperties, ReactNode } from "react";
import {
  SmoothSurface,
  nseAppCornerRadius,
  nseSmoothSurfaceDefaultPhysicality,
  type SmoothSurfaceRequest
} from "../NSE/SmoothSurface";
import type { WindowSmoothSurfaceConfiguration } from "../SynCloudOS/SynCloudOS";

function appFrameSmoothSurfaceToNSE(
  smoothSurface: WindowSmoothSurfaceConfiguration
): SmoothSurfaceRequest {
  if (smoothSurface === "off" || smoothSurface === false) return false;

  const base = {
    radius: nseAppCornerRadius,
    curve: "squircle" as const,
    smoothing: 0.6,
    overflow: "hidden" as const,
    physicality: nseSmoothSurfaceDefaultPhysicality,
    performance: "paint" as const,
    autoEffects: false
  };

  if (typeof smoothSurface === "number") {
    return { ...base, radius: smoothSurface };
  }

  return {
    ...base,
    ...smoothSurface,
    physicality: smoothSurface.physicality === "off"
      ? "off"
      : smoothSurface.physicality && smoothSurface.physicality !== "default"
        ? smoothSurface.physicality
        : nseSmoothSurfaceDefaultPhysicality
  };
}

function Surface({
  smoothSurface,
  background,
  header,
  containsHeader = false,
  backgroundColor,
  fullSizeContentView = false,
  children
}: {
  smoothSurface: WindowSmoothSurfaceConfiguration;
  /** What fills the body behind the content: the system light or dark background, nothing, or a surface. */
  background: "system" | "none";
  /** The rounded surface clips the titlebar and its content together. */
  header?: ReactNode;
  containsHeader?: boolean;
  backgroundColor?: string | null;
  fullSizeContentView?: boolean;
  children: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const safeArea = useNSEViewSafeArea(surface);
  const request = appFrameSmoothSurfaceToNSE(smoothSurface);
  const className = containsHeader
    ? "webspring-app-view-body-surface webspring-app-view-body-surface-sourcelist"
    : "webspring-app-view-body-surface";
  const paint = {
    "data-frame-background": background,
    "data-full-size-content": fullSizeContentView ? "" : undefined,
    style: {
      ...safeArea.properties,
      ...(backgroundColor ? { backgroundColor } : {}),
      "--nse-content-inset-top": fullSizeContentView
        ? "var(--nse-content-layout-inset-top, 0px)"
        : containsHeader ? "0px" : "var(--nse-safe-area-inset-top, 0px)",
    } as CSSProperties,
  };

  if (!request) {
    return (
      <div ref={surface} className={`${className} webspring-app-view-body-surface-off`} {...paint}>
        {header}
        {children}
      </div>
    );
  }

  return (
    <SmoothSurface
      ref={surface}
      className={className}
      smoothSurface={request}
      autoEffects={false}
      {...paint}
    >
      {header}
      {children}
    </SmoothSurface>
  );
}

export const AppViewContent = {
  Surface,
};
