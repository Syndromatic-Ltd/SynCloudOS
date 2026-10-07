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
import { createContentBoundPresentationTraitsService } from "../../src/SynCloudOS/SynCloudOS";
import { ScreenService, type WindowBounds } from "../../src/SynCloudOS/Windows";
import type {
  RuntimeMediaQuery,
  RuntimeScreenSnapshot,
  RuntimeSnapshotSource,
  RuntimeVisualViewportSnapshot,
  RuntimeWorkAreaSnapshot,
  SynCloudOSRuntimeEnvironment,
} from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { createRuntimeHarness, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

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

interface PresentationFixture {
  readonly contentBounds: ReturnType<typeof mutableSource<WindowBounds>>;
  readonly layoutViewport: ReturnType<typeof mutableSource<{ readonly width: number; readonly height: number }>>;
  readonly visualViewport: ReturnType<typeof mutableSource<RuntimeVisualViewportSnapshot | null>>;
  readonly screenSource: ReturnType<typeof mutableSource<RuntimeScreenSnapshot>>;
  readonly workArea: ReturnType<typeof mutableSource<RuntimeWorkAreaSnapshot>>;
  readonly screen: ScreenService;
  readonly environment: SynCloudOSRuntimeEnvironment;
  readonly setMedia: (query: string, matches: boolean) => void;
  readonly flush: () => void;
  readonly pendingFrames: () => number;
}

function createPresentationFixture({
  contentWidth = 640,
  contentHeight = 700,
  hostWidth = 1920,
  hostHeight = 1080,
}: {
  readonly contentWidth?: number;
  readonly contentHeight?: number;
  readonly hostWidth?: number;
  readonly hostHeight?: number;
} = {}): PresentationFixture {
  const contentBounds = mutableSource<WindowBounds>({ x: 80, y: 120, width: contentWidth, height: contentHeight });
  const layoutViewport = mutableSource({ width: hostWidth, height: hostHeight });
  const visualViewport = mutableSource<RuntimeVisualViewportSnapshot | null>({
    width: hostWidth,
    height: hostHeight - 180,
    offsetLeft: 0,
    offsetTop: 24,
    scale: 1,
  });
  const screenSource = mutableSource<RuntimeScreenSnapshot>({
    width: hostWidth,
    height: hostHeight,
    availableLeft: 0,
    availableTop: 0,
    availableWidth: hostWidth,
    availableHeight: hostHeight,
    colourDepth: 24,
    pixelDepth: 24,
    orientation: "landscape-primary",
  });
  const workArea = mutableSource<RuntimeWorkAreaSnapshot>({
    x: 0,
    y: 24,
    width: hostWidth,
    height: hostHeight - 24,
    devicePixelRatio: 2,
    safeArea: { top: 11, right: 12, bottom: 13, left: 14 },
  });
  const mediaValues = new Map<string, boolean>([
    ["(pointer: fine)", true],
    ["(pointer: coarse)", false],
    ["(any-pointer: coarse)", false],
    ["(hover: hover)", true],
    ["(prefers-reduced-motion: reduce)", true],
  ]);
  const mediaListeners = new Map<string, Set<(matches: boolean) => void>>();
  const frames = new Map<number, (timestamp: number) => void>();
  let frameId = 0;
  const base = createTestRuntimeEnvironment();
  const matchMedia: SynCloudOSRuntimeEnvironment["matchMedia"] = vi.fn((query: string): RuntimeMediaQuery => {
    const listeners = mediaListeners.get(query) ?? new Set<(matches: boolean) => void>();
    mediaListeners.set(query, listeners);
    return {
      media: query,
      get matches() {
        if (query === "(max-width: 767px)") return layoutViewport.source.getSnapshot().width <= 767;
        if (query === "(min-width: 1280px)") return layoutViewport.source.getSnapshot().width >= 1280;
        return mediaValues.get(query) ?? false;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dispose: vi.fn(() => listeners.clear()),
    };
  });
  const environment: SynCloudOSRuntimeEnvironment = {
    ...base,
    layoutViewport: layoutViewport.source,
    visualViewport: visualViewport.source,
    screen: screenSource.source,
    workArea: workArea.source,
    matchMedia,
    requestAnimationFrame: vi.fn((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn((handle) => frames.delete(handle as number)),
  };
  const screen = new ScreenService(environment);
  return {
    contentBounds,
    layoutViewport,
    visualViewport,
    screenSource,
    workArea,
    screen,
    environment,
    setMedia(query, matches) {
      mediaValues.set(query, matches);
      for (const listener of mediaListeners.get(query) ?? []) listener(matches);
    },
    flush() {
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, callback] of pending) callback(16);
    },
    pendingFrames: () => frames.size,
  };
}

function legacyModeAt(width: number): "desktop" | "tablet" | "mobile" {
  const environment = createTestRuntimeEnvironment();
  vi.spyOn(environment.visualViewport, "getSnapshot").mockReturnValue({ width, height: 700, offsetLeft: 0, offsetTop: 0, scale: 1 });
  const runtime = createTestRuntime({ environment });
  const { ResponsiveModeManager } = createRuntimeHarness(runtime);
  ResponsiveModeManager.sync();
  const mode = runtime.store.getSnapshot().responsive.mode;
  void runtime.dispose("navigation-foundation-characterization");
  return mode;
}

describe("NavigationFoundation presentation-trait characterization", () => {
  it("records the legacy 720 and 1080 responsive classifier boundaries", () => {
    expect(legacyModeAt(719)).toBe("mobile");
    expect(legacyModeAt(720)).toBe("tablet");
    expect(legacyModeAt(1079)).toBe("tablet");
    expect(legacyModeAt(1080)).toBe("desktop");
  });

  it("records the existing ScreenService 768 and 1280 boundaries", () => {
    const expected: Array<readonly [number, "compact" | "regular" | "wide"]> = [
      [767, "compact"],
      [768, "regular"],
      [1279, "regular"],
      [1280, "wide"],
    ];
    for (const [width, breakpoint] of expected) {
      const fixture = createPresentationFixture({ hostWidth: width });
      expect(fixture.screen.getSnapshot().breakpoint).toBe(breakpoint);
      fixture.screen.dispose();
    }
  });

  it("keeps a 390px content host compact on a 1920px desktop instead of projecting the host viewport", () => {
    const fixture = createPresentationFixture({ contentWidth: 390, hostWidth: 1920 });
    const service = createContentBoundPresentationTraitsService({
      contentBounds: fixture.contentBounds.source,
      screen: fixture.screen,
      matchMedia: fixture.environment.matchMedia,
      requestAnimationFrame: fixture.environment.requestAnimationFrame,
      cancelAnimationFrame: fixture.environment.cancelAnimationFrame,
    });
    try {
      const narrowDesktopWindow = service.getSnapshot();
      expect(narrowDesktopWindow).toMatchObject({
        revision: expect.any(Number),
        contentBounds: { x: 80, y: 120, width: 390, height: 700 },
        hostViewportBounds: { x: 0, y: 0, width: 1920, height: 1080 },
        horizontalSizeClass: "compact",
        orientation: "landscape",
        workArea: { x: 0, y: 24, width: 1920, height: 1056 },
        visualViewportBounds: { x: 0, y: 24, width: 1920, height: 900 },
        safeAreaInsets: { blockStart: 11, inlineEnd: 12, blockEnd: 13, inlineStart: 14 },
        virtualKeyboardInset: 156,
        devicePixelRatio: 2,
        primaryPointer: "fine",
        hover: true,
        touch: false,
        reducedMotion: true,
        reducedTransparency: false,
        forcedColours: false,
      });
      expect(Object.isFrozen(narrowDesktopWindow)).toBe(true);
      expect(Object.isFrozen(narrowDesktopWindow.contentBounds)).toBe(true);
      expect(Object.isFrozen(narrowDesktopWindow.safeAreaInsets)).toBe(true);
      expect(fixture.screen.getSnapshot().breakpoint).toBe("wide");

      const expected: Array<readonly [number, "compact" | "regular" | "wide"]> = [
        [719, "compact"],
        [720, "compact"],
        [767, "compact"],
        [768, "regular"],
        [1079, "regular"],
        [1080, "regular"],
        [1279, "regular"],
        [1280, "wide"],
      ];
      for (const [width, sizeClass] of expected) {
        fixture.contentBounds.set({ x: 80, y: 120, width, height: 700 });
        expect(fixture.pendingFrames()).toBe(1);
        fixture.flush();
        expect(service.getSnapshot().horizontalSizeClass).toBe(sizeClass);
      }

      const listener = vi.fn();
      const unsubscribe = service.subscribe(listener);
      fixture.setMedia("(pointer: fine)", false);
      fixture.setMedia("(pointer: coarse)", true);
      fixture.setMedia("(any-pointer: coarse)", true);
      fixture.setMedia("(hover: hover)", false);
      fixture.setMedia("(prefers-reduced-motion: reduce)", false);
      expect(fixture.pendingFrames()).toBe(1);
      fixture.flush();
      expect(service.getSnapshot()).toMatchObject({ primaryPointer: "coarse", hover: false, touch: true, reducedMotion: false });
      expect(listener).toHaveBeenCalled();

      fixture.visualViewport.set({ width: 1920, height: 760, offsetLeft: 10, offsetTop: 30, scale: 1 });
      fixture.workArea.set({
        ...fixture.workArea.source.getSnapshot(),
        devicePixelRatio: 3,
        safeArea: { top: 21, right: 22, bottom: 23, left: 24 },
      });
      fixture.screenSource.set({ ...fixture.screenSource.source.getSnapshot(), orientation: "portrait-primary" });
      // ScreenService owns its source frame; traits then schedule one atomic
      // projection from the settled geometry rather than reading a stale mix.
      expect(fixture.pendingFrames()).toBe(1);
      fixture.flush();
      expect(fixture.pendingFrames()).toBe(1);
      fixture.flush();
      expect(service.getSnapshot()).toMatchObject({
        orientation: "portrait",
        visualViewportBounds: { x: 10, y: 30, width: 1920, height: 760 },
        safeAreaInsets: { blockStart: 21, inlineEnd: 22, blockEnd: 23, inlineStart: 24 },
        devicePixelRatio: 3,
        virtualKeyboardInset: 290,
      });
      unsubscribe();
    } finally {
      service.dispose();
      expect(fixture.contentBounds.listenerCount()).toBe(0);
      fixture.screen.dispose();
    }
  });

  it("publishes reduced-transparency and forced-colours changes from the content-bound media observer", () => {
    const fixture = createPresentationFixture();
    const service = createContentBoundPresentationTraitsService({
      contentBounds: fixture.contentBounds.source,
      screen: fixture.screen,
      matchMedia: fixture.environment.matchMedia,
      requestAnimationFrame: fixture.environment.requestAnimationFrame,
      cancelAnimationFrame: fixture.environment.cancelAnimationFrame,
    });
    try {
      const initial = service.getSnapshot() as {
        readonly reducedTransparency?: boolean;
        readonly forcedColours?: boolean;
        readonly revision: number;
      };
      expect(initial).toMatchObject({ reducedTransparency: false, forcedColours: false });

      const listener = vi.fn();
      const unsubscribe = service.subscribe(listener);
      fixture.setMedia("(prefers-reduced-transparency: reduce)", true);
      expect(fixture.pendingFrames()).toBe(1);
      fixture.flush();
      const reducedTransparency = service.getSnapshot() as typeof initial;
      expect(reducedTransparency).toMatchObject({ reducedTransparency: true, forcedColours: false });
      expect(reducedTransparency.revision).toBeGreaterThan(initial.revision);
      expect(listener).toHaveBeenCalledTimes(1);

      fixture.setMedia("(forced-colors: active)", true);
      expect(fixture.pendingFrames()).toBe(1);
      fixture.flush();
      expect(service.getSnapshot() as typeof initial).toMatchObject({ reducedTransparency: true, forcedColours: true });
      expect(listener).toHaveBeenCalledTimes(2);
      unsubscribe();
    } finally {
      service.dispose();
      fixture.screen.dispose();
    }
  });
});
