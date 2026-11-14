/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getSynCloudOSHorizontalSizeClass } from "../../SynCloudOS/ResponsiveModeManager/presentationTypes";
import type { ScreenSnapshot } from "../../SynCloudOS/Windows/ScreenService";
import { unavailableViewportFeatures } from "../../SynCloudOS/Windows/viewportFeatures";
import type { WindowBounds } from "../../SynCloudOS/Windows/windowTypes";

const noInsets = { blockStart: 0, blockEnd: 0, inlineStart: 0, inlineEnd: 0 };

export function readWindowSurfaceScreen(view: Window): ScreenSnapshot {
  const width = Math.max(1, view.innerWidth);
  const height = Math.max(1, view.innerHeight);
  const layoutViewport: WindowBounds = { x: 0, y: 0, width, height };
  const viewport = view.visualViewport;
  const visualViewport = viewport && viewport.width > 0 && viewport.height > 0
    ? { x: viewport.offsetLeft, y: viewport.offsetTop, width: viewport.width, height: viewport.height }
    : layoutViewport;
  return {
    geometryState: "current",
    viewportFeatures: unavailableViewportFeatures,
    invalidGeometrySources: [],
    layoutViewport,
    visualViewport,
    workArea: layoutViewport,
    safeAreaInsets: noInsets,
    safeAreaAvailability: "unavailable",
    devicePixelRatio: view.devicePixelRatio,
    breakpoint: getSynCloudOSHorizontalSizeClass(width),
    orientation: width < height ? "portrait" : "landscape",
    virtualKeyboardInset: Math.max(0, height - visualViewport.y - visualViewport.height),
  };
}

export function subscribeWindowSurfaceViewport(view: Window, listener: () => void): () => void {
  const viewport = view.visualViewport;
  view.addEventListener("resize", listener);
  viewport?.addEventListener("resize", listener);
  viewport?.addEventListener("scroll", listener);
  return () => {
    view.removeEventListener("resize", listener);
    viewport?.removeEventListener("resize", listener);
    viewport?.removeEventListener("scroll", listener);
  };
}
