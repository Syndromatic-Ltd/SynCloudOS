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

import { describe, expect, it, vi } from "vitest";
import { ScreenService } from "../../src/SynCloudOS/Windows";
import type {
  RuntimeMediaQuery,
  RuntimeScreenSnapshot,
  RuntimeSnapshotSource,
  RuntimeVisualViewportSnapshot,
  RuntimeWorkAreaSnapshot,
  SynCloudOSRuntimeEnvironment,
} from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { createTestRuntimeEnvironment } from "./helpers";

function mutableSource<T>(initial: T) {
  let snapshot = initial;
  const listeners = new Set<(value: T) => void>();
  const source: RuntimeSnapshotSource<T> = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    set(value: T) {
      snapshot = value;
      for (const listener of listeners) listener(value);
    },
    listenerCount: () => listeners.size,
  };
}

function mediaQuery(media: string, initial: boolean) {
  let matches = initial;
  const listeners = new Set<(matches: boolean) => void>();
  const query: RuntimeMediaQuery = {
    media,
    get matches() { return matches; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: vi.fn(() => listeners.clear()),
  };
  return {
    query,
    set(value: boolean) {
      matches = value;
      for (const listener of listeners) listener(value);
    },
    listenerCount: () => listeners.size,
  };
}

function fixture() {
  const visualViewport = mutableSource<RuntimeVisualViewportSnapshot | null>({
    width: 720,
    height: 430,
    offsetLeft: 10,
    offsetTop: 20,
    scale: 1,
  });
  const layoutViewport = mutableSource({ width: 1024, height: 700 });
  const screen = mutableSource<RuntimeScreenSnapshot>({
    width: 1280,
    height: 800,
    availableLeft: 0,
    availableTop: 0,
    availableWidth: 1240,
    availableHeight: 760,
    colourDepth: 24,
    pixelDepth: 24,
    orientation: "landscape-primary",
  });
  const workArea = mutableSource<RuntimeWorkAreaSnapshot>({
    x: 20,
    y: 30,
    width: 1200,
    height: 700,
    devicePixelRatio: 2,
    safeArea: { top: 4, right: 5, bottom: 6, left: 7 },
    safeAreaAvailability: "available",
  });
  const compact = mediaQuery("(max-width: 767px)", true);
  const wide = mediaQuery("(min-width: 1280px)", false);
  const frames = new Map<number, (timestamp: number) => void>();
  let frameId = 0;
  const base = createTestRuntimeEnvironment();
  const environment: SynCloudOSRuntimeEnvironment = {
    ...base,
    layoutViewport: layoutViewport.source,
    visualViewport: visualViewport.source,
    screen: screen.source,
    workArea: workArea.source,
    matchMedia: vi.fn((query: string) => query.includes("max-width") ? compact.query : wide.query),
    requestAnimationFrame: vi.fn((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn((handle) => frames.delete(handle as number)),
  };
  return {
    visualViewport,
    layoutViewport,
    screen,
    workArea,
    compact,
    wide,
    environment,
    flush() {
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, callback] of pending) callback(16);
    },
    pendingFrames: () => frames.size,
  };
}

describe("ScreenService", () => {
  it("distinguishes measured zero insets from unavailable and legacy unknown values", () => {
    const f = fixture();
    f.workArea.set({ ...f.workArea.source.getSnapshot(), safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    const service = new ScreenService(f.environment);
    expect(service.getSnapshot().safeAreaAvailability).toBe("available");
    f.workArea.set({ ...f.workArea.source.getSnapshot(), safeAreaAvailability: "unavailable" });
    expect(service.getCurrentSnapshot().safeAreaAvailability).toBe("unavailable");
    f.workArea.set({ ...f.workArea.source.getSnapshot(), safeAreaAvailability: undefined });
    expect(service.getCurrentSnapshot().safeAreaAvailability).toBe("unknown");
    service.dispose();
  });

  it("does not publish invalid insets as an available measurement", () => {
    const f = fixture();
    const service = new ScreenService(f.environment);
    f.workArea.set({ ...f.workArea.source.getSnapshot(), safeArea: { top: Number.NaN, right: 0, bottom: -1, left: 0 } });
    expect(service.getCurrentSnapshot()).toMatchObject({ geometryState: "current", safeAreaAvailability: "unavailable", safeAreaInsets: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 } });
    service.dispose();
  });

  it.each(["layout", "visual", "work", "dpr", "disjoint"] as const)("retains a complete sample through invalid %s geometry and recovers", source => {
    const f = fixture();
    const service = new ScreenService(f.environment);
    const previous = service.getSnapshot();
    const work = f.workArea.source.getSnapshot();
    if (source === "layout") f.layoutViewport.set({ width: 0, height: Number.NaN });
    if (source === "visual") f.visualViewport.set({ width: -1, height: 0, offsetLeft: 0, offsetTop: 0, scale: 1 });
    if (source === "work") f.workArea.set({ ...work, height: 0 });
    if (source === "dpr") f.workArea.set({ ...work, devicePixelRatio: Number.NaN });
    if (source === "disjoint") f.workArea.set({ ...work, x: 5000 });
    f.flush();
    const retained = service.getSnapshot();
    expect(retained.geometryState).toBe("retained");
    expect(retained.invalidGeometrySources.length).toBeGreaterThan(0);
    expect(Object.isFrozen(retained.invalidGeometrySources)).toBe(true);
    expect(retained.layoutViewport).toBe(previous.layoutViewport);
    expect(retained.visualViewport).toBe(previous.visualViewport);
    expect(retained.workArea).toBe(previous.workArea);
    expect(retained.virtualKeyboardInset).toBe(previous.virtualKeyboardInset);
    f.layoutViewport.set({ width: 900, height: 600 });
    f.visualViewport.set({ width: 900, height: 500, offsetLeft: 0, offsetTop: 0, scale: 1 });
    f.workArea.set({ ...work, x: 0, y: 0, width: 900, height: 600 });
    f.flush();
    expect(service.getSnapshot()).toMatchObject({ geometryState: "current", invalidGeometrySources: [], layoutViewport: { width: 900, height: 600 }, virtualKeyboardInset: 100 });
    service.dispose();
  });

  it("marks initial invalid geometry unavailable and treats an absent visual API as layout geometry", () => {
    const f = fixture();
    f.layoutViewport.set({ width: 0, height: 0 });
    f.visualViewport.set(null);
    f.workArea.set({ ...f.workArea.source.getSnapshot(), safeAreaAvailability: "unavailable" });
    const service = new ScreenService(f.environment);
    expect(service.getSnapshot().geometryState).toBe("unavailable");
    expect(service.getSnapshot().safeAreaAvailability).toBe("unavailable");
    f.layoutViewport.set({ width: 900, height: 700 });
    f.flush();
    expect(service.getSnapshot()).toMatchObject({ geometryState: "current", visualViewport: { x: 0, y: 0, width: 900, height: 700 }, virtualKeyboardInset: 0 });
    service.dispose();
  });

  it("retains a valid current read even if a source becomes invalid before publication", () => {
    const f = fixture();
    const service = new ScreenService(f.environment);
    f.layoutViewport.set({ width: 900, height: 700 });
    const current = service.getCurrentSnapshot();
    f.layoutViewport.set({ width: Number.NaN, height: 0 });
    f.flush();
    expect(service.getSnapshot().geometryState).toBe("retained");
    expect(service.getSnapshot().layoutViewport).toBe(current.layoutViewport);
    service.dispose();
  });

  it("projects immutable CSS-pixel screen state from injected runtime ports", () => {
    const f = fixture();
    const service = new ScreenService(f.environment);

    expect(service.getSnapshot()).toEqual({
      geometryState: "current",
      invalidGeometrySources: [],
      safeAreaAvailability: "available",
      layoutViewport: { x: 0, y: 0, width: 1024, height: 700 },
      visualViewport: { x: 10, y: 20, width: 720, height: 430 },
      workArea: { x: 20, y: 30, width: 1200, height: 700 },
      safeAreaInsets: { blockStart: 4, inlineEnd: 5, blockEnd: 6, inlineStart: 7 },
      devicePixelRatio: 2,
      // The injected layout geometry is the canonical classifier. The fixture
      // intentionally reports a contradictory compact media query so this
      // cannot regress into a second ScreenService breakpoint authority.
      breakpoint: "regular",
      orientation: "landscape",
      virtualKeyboardInset: 250,
    });
    expect(Object.isFrozen(service.getSnapshot())).toBe(true);
    expect(Object.isFrozen(service.getSnapshot().workArea)).toBe(true);
    expect(f.environment.matchMedia).not.toHaveBeenCalled();
  });

  it("coalesces every source onto one injected frame and disposes all authority", () => {
    const f = fixture();
    const service = new ScreenService(f.environment);
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    f.visualViewport.set({ width: 700, height: 600, offsetLeft: 0, offsetTop: 0, scale: 1 });
    f.layoutViewport.set({ width: 1000, height: 720 });
    f.workArea.set({ ...f.workArea.source.getSnapshot(), width: 1000 });
    f.compact.set(false);
    expect(listener).not.toHaveBeenCalled();
    expect(f.pendingFrames()).toBe(1);

    f.flush();
    expect(listener).toHaveBeenCalledOnce();
    expect(service.getSnapshot()).toMatchObject({
      visualViewport: { width: 700, height: 600 },
      workArea: { width: 1000 },
      breakpoint: "regular",
    });

    f.screen.set({ ...f.screen.source.getSnapshot(), width: 1440 });
    expect(f.pendingFrames()).toBe(1);
    service.dispose();
    expect(f.pendingFrames()).toBe(0);
    expect(f.visualViewport.listenerCount()).toBe(0);
    expect(f.layoutViewport.listenerCount()).toBe(0);
    expect(f.screen.listenerCount()).toBe(0);
    expect(f.workArea.listenerCount()).toBe(0);
    expect(f.environment.matchMedia).not.toHaveBeenCalled();
    unsubscribe();
    service.dispose();
  });
});
