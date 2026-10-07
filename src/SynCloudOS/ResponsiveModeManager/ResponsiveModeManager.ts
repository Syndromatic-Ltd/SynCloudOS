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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { WindowBounds } from "../Windows/windowTypes";
import type { SynCloudOSResponsiveMode } from "./responsiveTypes";
import {
  getSynCloudOSHorizontalSizeClass,
  type PresentationTraitsObserverSources,
  type SynCloudOSPresentationTraits,
  type SynCloudOSPresentationTraitsService,
} from "./presentationTypes";

function freezeBounds(bounds: WindowBounds): WindowBounds {
  return Object.freeze({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
}

function sameBounds(left: WindowBounds, right: WindowBounds): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function samePresentationTraits(left: SynCloudOSPresentationTraits, right: SynCloudOSPresentationTraits): boolean {
  return sameBounds(left.contentBounds, right.contentBounds) &&
    sameBounds(left.hostViewportBounds, right.hostViewportBounds) &&
    left.horizontalSizeClass === right.horizontalSizeClass &&
    left.orientation === right.orientation &&
    sameBounds(left.workArea, right.workArea) &&
    sameBounds(left.visualViewportBounds, right.visualViewportBounds) &&
    left.safeAreaInsets.blockStart === right.safeAreaInsets.blockStart &&
    left.safeAreaInsets.inlineEnd === right.safeAreaInsets.inlineEnd &&
    left.safeAreaInsets.blockEnd === right.safeAreaInsets.blockEnd &&
    left.safeAreaInsets.inlineStart === right.safeAreaInsets.inlineStart &&
    left.virtualKeyboardInset === right.virtualKeyboardInset &&
    left.devicePixelRatio === right.devicePixelRatio &&
    left.primaryPointer === right.primaryPointer &&
    left.hover === right.hover &&
    left.touch === right.touch &&
    left.reducedMotion === right.reducedMotion &&
    left.reducedTransparency === right.reducedTransparency &&
    left.forcedColours === right.forcedColours;
}

/**
 * The sole presentation classifier is deliberately kept beside the legacy
 * responsive manager. Callers inject a content/window-bounds source while the
 * ScreenService retains host geometry ownership. That distinction lets a
 * compact desktop window remain compact on a wide display.
 */
export function createContentBoundPresentationTraitsService(
  sources: PresentationTraitsObserverSources,
): SynCloudOSPresentationTraitsService {
  const finePointer = sources.matchMedia("(pointer: fine)");
  const coarsePointer = sources.matchMedia("(pointer: coarse)");
  const anyCoarsePointer = sources.matchMedia("(any-pointer: coarse)");
  const hover = sources.matchMedia("(hover: hover)");
  const reducedMotion = sources.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedTransparency = sources.matchMedia("(prefers-reduced-transparency: reduce)");
  const forcedColours = sources.matchMedia("(forced-colors: active)");
  const mediaQueries = [
    finePointer,
    coarsePointer,
    anyCoarsePointer,
    hover,
    reducedMotion,
    reducedTransparency,
    forcedColours,
  ] as const;
  const listeners = new Set<() => void>();
  const disposers: Array<() => void> = [];
  let disposed = false;
  let frame: unknown = null;

  const project = (revision: number): SynCloudOSPresentationTraits => {
    const contentBounds = sources.contentBounds.getSnapshot();
    // Read the geometry authority atomically at publication time. A content
    // resize can share a frame with a host resize, so the last published
    // ScreenService snapshot alone is intentionally not enough here.
    const screen = sources.screen.getCurrentSnapshot();
    const primaryPointer = finePointer.matches ? "fine" as const : coarsePointer.matches ? "coarse" as const : "none" as const;
    return Object.freeze({
      revision,
      contentBounds: freezeBounds(contentBounds),
      hostViewportBounds: freezeBounds(screen.layoutViewport),
      horizontalSizeClass: getSynCloudOSHorizontalSizeClass(contentBounds.width),
      orientation: screen.orientation,
      workArea: freezeBounds(screen.workArea),
      visualViewportBounds: freezeBounds(screen.visualViewport),
      safeAreaInsets: Object.freeze({ ...screen.safeAreaInsets }),
      virtualKeyboardInset: screen.virtualKeyboardInset,
      devicePixelRatio: screen.devicePixelRatio,
      primaryPointer,
      hover: hover.matches,
      touch: anyCoarsePointer.matches || coarsePointer.matches,
      reducedMotion: reducedMotion.matches,
      reducedTransparency: reducedTransparency.matches,
      forcedColours: forcedColours.matches,
    });
  };

  let snapshot = project(0);
  const publish = () => {
    if (disposed) return;
    const next = project(snapshot.revision + 1);
    if (samePresentationTraits(snapshot, next)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const cancelScheduledPublish = () => {
    if (frame === null) return;
    sources.cancelAnimationFrame?.(frame);
    frame = null;
  };
  const schedulePublish = () => {
    if (disposed) return;
    if (!sources.requestAnimationFrame || !sources.cancelAnimationFrame) {
      publish();
      return;
    }
    if (frame !== null) return;
    frame = sources.requestAnimationFrame(() => {
      frame = null;
      publish();
    });
  };

  disposers.push(sources.contentBounds.subscribe(schedulePublish), sources.screen.subscribe(schedulePublish));
  for (const query of mediaQueries) disposers.push(query.subscribe(schedulePublish));

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelScheduledPublish();
      for (const dispose of disposers.splice(0).reverse()) dispose();
      for (const query of mediaQueries) query.dispose();
      listeners.clear();
    },
  });
}

export function createResponsiveModeManager(runtime: SynCloudOSRuntime) {
const RuntimeStore = runtime.store;

function getMode(width: number): SynCloudOSResponsiveMode {
  if (width < 720) return "mobile";
  if (width < 1080) return "tablet";
  return "desktop";
}
let observing = false;
let resizeFrame: unknown = null;
let removeResizeListener: (() => void) | null = null;
let removeReducedMotionListener: (() => void) | null = null;
let reducedMotionQuery: ReturnType<typeof runtime.environment.matchMedia> | null = null;

function readResponsiveState() {
  const viewport = runtime.environment.visualViewport.getSnapshot();
  const screen = runtime.environment.screen.getSnapshot();
  const width = viewport?.width ?? screen.width;
  const height = viewport?.height ?? screen.height;
  const temporaryReducedMotionQuery = reducedMotionQuery ?? runtime.environment.matchMedia("(prefers-reduced-motion: reduce)");
  const prefersReducedMotion = temporaryReducedMotionQuery.matches;
  if (!reducedMotionQuery) temporaryReducedMotionQuery.dispose();
  return {
    mode: getMode(width),
    width,
    height,
    prefersReducedMotion,
  };
}

function commitResponsiveState() {
  const next = readResponsiveState();
  const current = RuntimeStore.getSnapshot().responsive;
  if (
    current.mode === next.mode &&
    current.width === next.width &&
    current.height === next.height &&
    current.prefersReducedMotion === next.prefersReducedMotion
  ) {
    return;
  }

  RuntimeStore.mutate((draft) => {
    draft.responsive = next;
  });
}

function cancelScheduledSync() {
  if (resizeFrame === null) return;
  runtime.environment.cancelAnimationFrame(resizeFrame);
  resizeFrame = null;
}

function scheduleSync() {
  if (resizeFrame !== null) return;
  resizeFrame = runtime.environment.requestAnimationFrame(() => {
    resizeFrame = null;
    commitResponsiveState();
  }) ?? 0;
}

const responsiveModeManager = {
  runtimeId: runtime.runtimeId,
  getSnapshot() {
    return RuntimeStore.getSnapshot().responsive;
  },
  sync() {
    cancelScheduledSync();
    commitResponsiveState();
  },

  observe() {
    if (observing) return;
    observing = true;
    reducedMotionQuery = runtime.environment.matchMedia("(prefers-reduced-motion: reduce)");
    this.sync();
    removeResizeListener = runtime.environment.addWindowListener("resize", scheduleSync, { passive: true });
    removeReducedMotionListener = reducedMotionQuery.subscribe(scheduleSync);
  },
  unobserve() {
    if (!observing) return;
    observing = false;
    cancelScheduledSync();
    removeResizeListener?.();
    removeResizeListener = null;
    removeReducedMotionListener?.();
    removeReducedMotionListener = null;
    reducedMotionQuery?.dispose();
    reducedMotionQuery = null;
  },

  dispose() {
    this.unobserve();
  }
};

return responsiveModeManager;
}
