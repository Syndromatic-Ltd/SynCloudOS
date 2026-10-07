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

import { useRef, type ReactNode } from "react";
import { useNSEPresentation } from "../NSE/Animation";
import type { AppViewPresentation } from "./AppViewChrome";
import {
  NSESmoothSurface,
  nseSmoothSurfaceDefaultPhysicality,
  type NSESmoothSurfaceRequest
} from "../NSE/SmoothSurface";
import type { SynCloudOSAppFrameSmoothSurfaceManifest } from "../SynCloudOS/SynCloudOS";

function appFrameSmoothSurfaceToNSE(
  smoothSurface: SynCloudOSAppFrameSmoothSurfaceManifest
): NSESmoothSurfaceRequest {
  if (smoothSurface === "off" || smoothSurface === false) return false;

  const base = {
    radius: 31,
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
  header,
  sourceList = false,
  children
}: {
  smoothSurface: SynCloudOSAppFrameSmoothSurfaceManifest;
  /** Rendered as a non-scrolling header inside the rounded surface (source-list windows), so the
   *  smooth-surface clip rounds the bar's top corners to match the body's bottom corners. */
  header?: ReactNode;
  sourceList?: boolean;
  children: ReactNode;
}) {
  const request = appFrameSmoothSurfaceToNSE(smoothSurface);
  const className = sourceList
    ? "webspring-app-view-body-surface webspring-app-view-body-surface-sourcelist"
    : "webspring-app-view-body-surface";

  if (!request) {
    return (
      <div className={`${className} webspring-app-view-body-surface-off`}>
        {header}
        {children}
      </div>
    );
  }

  return (
    <NSESmoothSurface
      className={className}
      smoothSurface={request}
      autoEffects={false}
    >
      {header}
      {children}
    </NSESmoothSurface>
  );
}

function Main({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <main className="webspring-app-view-content" aria-label={label}>
      {children}
    </main>
  );
}

function Card({
  children,
  presentation
}: {
  children: ReactNode;
  presentation?: AppViewPresentation;
}) {
  const cardRef = useRef<HTMLElement>(null);
  useNSEPresentation(cardRef, {
    state: presentation?.motion.state,
    enter: presentation?.motion.enter ?? null,
    exit: presentation?.motion.exit ?? null,
    onPresented: presentation?.onPresented,
  });
  return (
    <section
      ref={cardRef}
      className="webspring-app-view-content-card"
      style={presentation?.motion.style}
    >
      {children}
    </section>
  );
}

export const AppViewContent = {
  Surface,
  Main,
  Card
};
