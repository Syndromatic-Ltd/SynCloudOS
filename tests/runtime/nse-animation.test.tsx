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

import { useNSEViewAnimator } from "../../src/NSE/Animation/useNSEViewAnimator";
// @vitest-environment jsdom
import { act, render, renderHook } from "@testing-library/react";
import React, { StrictMode, Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AFXAnimation,
  AFXTransaction,
  AFXBasicAnimation,
} from "../../src/FX/AnimationFX/public";
import {
  BrowserAnimationAdapterFactory,
  type BrowserAnimationPlatform,
} from "../../src/SynCloudOS/PlatformAdapters/BrowserAnimationAdapter";
import type {
  RuntimeAnimationAdapterFactory,
  RuntimeAnimationAdapterLease,
  RuntimeAnimationPlayback,
  RuntimeAnimationRequest,
} from "../../src/SynCloudOS/AnimationFX";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

class RecordingPlayback implements RuntimeAnimationPlayback {
  readonly finished: Promise<"completed" | "cancelled">;
  #resolve!: (state: "completed" | "cancelled") => void;
  #progress = 0;
  readonly pause = vi.fn();
  readonly play = vi.fn();
  readonly cancel = vi.fn(() => this.#resolve("cancelled"));
  readonly dispose = vi.fn();
  readonly seek = vi.fn();

  constructor() {
    this.finished = new Promise((resolve) => { this.#resolve = resolve; });
  }

  progress() { return this.#progress; }
  advance(progress: number) {
    this.#progress = progress;
    if (progress >= 1) this.#resolve("completed");
  }
}

class RecordingAnimationFactory implements RuntimeAnimationAdapterFactory {
  readonly requests: RuntimeAnimationRequest[] = [];
  readonly playbacks: RecordingPlayback[] = [];
  readonly releases: Array<ReturnType<typeof vi.fn>> = [];

  acquire(): RuntimeAnimationAdapterLease {
    const release = vi.fn();
    this.releases.push(release);
    return {
      adapter: {
        animate: (request) => {
          this.requests.push(request);
          const playback = new RecordingPlayback();
          this.playbacks.push(playback);
          return playback;
        },
        diagnostics: () => ({ activeCount: this.playbacks.filter((playback) => playback.progress() < 1).length, listenerCount: 0, timerCount: 0 }),
        dispose: vi.fn(),
      },
      release,
    };
  }
}

function runtimeWithAnimations(factory = new RecordingAnimationFactory(), reduced = false) {
  const environment = createTestRuntimeEnvironment();
  environment.matchMedia = vi.fn((query: string) => ({
    media: query,
    matches: reduced && query === "(prefers-reduced-motion: reduce)",
    subscribe: vi.fn(() => () => undefined),
    dispose: vi.fn(),
  }));
  const runtime = createTestRuntime({ environment: { ...environment, animation: factory } });
  if (reduced) runtime.settings.set("motion", "reduced");
  return { runtime, factory };
}

describe("runtime-owned NSE animations", () => {
  it("commits immutable context writes as one adapter group and reports progress", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const lease = runtime.animations.acquireOwner({ appId: "notes", viewId: "editor" });
    const context = new AFXTransaction((target, definition) => runtime.animations.runGroup(target, definition, lease), () => lease.release());
    const target = Object.freeze({ node: "editor" });
    const view = Object.freeze({ id: "editor", target, frame: { x: 0, y: 0, width: 200, height: 120 }, opacity: 1 });

    const handle = context.run({ duration: 0.24, timing: "ease-in-out" }, () => {
      const animator = context.animator(view);
      animator.opacity = 0;
      animator.frame = { x: 40, y: 12, width: 320, height: 180 };
    });

    expect(factory.requests).toHaveLength(1);
    expect(factory.requests[0]?.animations.map(({ keyPath }) => keyPath)).toEqual(["opacity", "frame"]);
    expect(Object.isFrozen(factory.requests[0])).toBe(true);
    factory.playbacks[0]?.advance(0.5);
    expect(handle.progress).toBeCloseTo(0.5);
    factory.playbacks[0]?.advance(1);
    await expect(handle.finished).resolves.toMatchObject({ state: "completed", reduced: false });
    expect(runtime.animations.diagnostics()).toMatchObject({ activeCount: 0, groupCount: 1 });
  });

  it("inherits nested context timing while committing each context as one group", () => {
    const { runtime, factory } = runtimeWithAnimations();
    const lease = runtime.animations.acquireOwner({ appId: "notes", viewId: "nested" });
    const context = new AFXTransaction((target, definition) => runtime.animations.runGroup(target, definition, lease), () => lease.release());
    const target = {};
    const view = { id: "nested", target, frame: { x: 0, y: 0, width: 10, height: 10 }, opacity: 1, transform: "none" };
    context.run({ duration: 0.32, timing: "ease-in" }, () => {
      context.run({ delay: 0.02 }, () => { context.animator(view).transform = "scale(0.9)"; });
      context.animator(view).opacity = 0.5;
    });
    expect(factory.requests).toHaveLength(2);
    expect(factory.requests[0]).toMatchObject({ duration: 0.32, delay: 0.02, timing: "ease-in" });
    expect(factory.requests[0]?.animations).toHaveLength(1);
    expect(factory.requests[1]).toMatchObject({ duration: 0.32, delay: 0, timing: "ease-in" });
    expect(factory.requests[1]?.animations).toHaveLength(1);
  });

  it("interrupts an overlapping target/key-path generation exactly once", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const target = Object.freeze({ node: "card" });
    const definition = new AFXBasicAnimation({
      targetId: "card",
      keyPath: "opacity",
      from: 1,
      to: 0,
      animation: new AFXAnimation({ duration: 0.3, timing: "linear" }),
    });

    const owner = runtime.animations.acquireOwner({ appId: "about", viewId: "card" });
    const first = runtime.animations.animate(target, definition.toRuntime(), owner, 1);
    const second = runtime.animations.animate(target, definition.toRuntime(), owner, 2);
    await expect(first.finished).resolves.toMatchObject({ state: "interrupted" });
    expect(factory.playbacks[0]?.cancel).toHaveBeenCalledTimes(1);
    factory.playbacks[0]?.advance(1);
    expect(runtime.animations.diagnostics().settlementCount).toBe(1);
    second.cancel("view removed");
    await expect(second.finished).resolves.toMatchObject({ state: "cancelled", reason: "view removed" });
  });

  it("rejects a late older generation without interrupting the current playback", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const definition = {
      animations: [{ targetId: "generation", keyPath: "opacity" as const, from: 0, to: 1 }],
      duration: 0.1,
    };
    const owner = runtime.animations.acquireOwner({ appId: "gallery", viewId: "generation" });
    const current = runtime.animations.animate({}, definition, owner, 4);
    const stale = runtime.animations.animate({}, definition, owner, 3);
    await expect(stale.finished).resolves.toMatchObject({ state: "interrupted", reason: "stale animation generation" });
    expect(factory.playbacks).toHaveLength(1);
    expect(factory.playbacks[0]?.cancel).not.toHaveBeenCalled();
    factory.playbacks[0]?.advance(1);
    await expect(current.finished).resolves.toMatchObject({ state: "completed" });
  });

  it("animates a CSS filter as a view key path and rejects a non-string filter", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const owner = runtime.animations.acquireOwner({ appId: "gallery", viewId: "filter" });
    const handle = runtime.animations.animate({}, {
      animations: [{ targetId: "view", keyPath: "filter", from: "brightness(1)", to: "brightness(0.4)" }],
      duration: 0.1,
    }, owner);
    expect(factory.requests[0]?.animations[0]).toMatchObject({ keyPath: "filter", from: "brightness(1)", to: "brightness(0.4)" });
    factory.playbacks[0]?.advance(1);
    await expect(handle.finished).resolves.toMatchObject({ state: "completed" });
    expect(() => runtime.animations.animate({}, {
      animations: [{ targetId: "view", keyPath: "filter", from: 1, to: 0.4 }],
      duration: 0.1,
    }, owner)).toThrow(/bounded CSS value string/i);
  });

  it("animates a view's height as a bounded CSS length", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const owner = runtime.animations.acquireOwner({ appId: "gallery", viewId: "height" });
    runtime.animations.animate({}, {
      animations: [{ targetId: "view", keyPath: "height", from: "0px", to: "120px" }],
      duration: 0.1,
    }, owner);
    expect(factory.requests[0]?.animations[0]).toMatchObject({ keyPath: "height", from: "0px", to: "120px" });
    expect(() => runtime.animations.animate({}, {
      animations: [{ targetId: "view", keyPath: "height", from: 0, to: 120 }],
      duration: 0.1,
    }, owner)).toThrow(/bounded CSS value string/i);
  });

  it("springs between differently shaped transforms with the browser's interpolation, not a discrete switch", () => {
    const spring = { kind: "spring", stiffness: 145, damping: 18, mass: 0.9 } as const;
    const request = (from: string, to: string): RuntimeAnimationRequest => ({
      target: {},
      animations: [
        { targetId: "icon", keyPath: "transform", from, to },
        { targetId: "icon", keyPath: "opacity", from: 0, to: 1 },
      ],
      duration: 0.92, delay: 0.1, iterations: 1, autoreverses: false, fill: "backwards", timing: spring,
    });
    const played = (supportsLinearEasing: boolean, from: string, to: string) => {
      const animate = vi.fn((_target: object, _frames: readonly Readonly<Record<string, unknown>>[], _options: Readonly<Record<string, unknown>>) => null);
      new BrowserAnimationAdapterFactory({ animate, now: () => 0, schedule: vi.fn(), cancelScheduled: vi.fn(), supportsLinearEasing })
        .acquire("runtime:spring", new AbortController().signal).adapter.animate(request(from, to));
      const [, frames, options] = animate.mock.calls[0]!;
      return { frames, easing: String(options.easing) };
    };
    const radial = "translate(-532px, -173px) scale(2.85) rotate(4deg)";
    const native = played(true, radial, "none");
    expect(native.frames).toEqual([
      { offset: 0, transform: radial, opacity: 0 },
      { offset: 1, transform: "none", opacity: 1 },
    ]);
    // The spring overshoots its target on the way, as a sampled spring does.
    const curve = native.easing.slice("linear(".length, -1).split(", ").map(Number);
    expect(curve).toHaveLength(121);
    expect(curve[0]).toBe(0);
    expect(curve.at(-1)).toBe(1);
    expect(Math.max(...curve)).toBeGreaterThan(1);
    // Values the adapter interpolates itself keep their sampled keyframes.
    const sampled = played(true, "translate(0px, 28px) scale(1.72)", "translate(0px, 0px) scale(1)");
    expect(sampled.easing).toBe("linear");
    expect(sampled.frames).toHaveLength(121);
    expect(played(false, radial, "none").frames).toHaveLength(121);
  });

  it("compiles a filter key path to native filter keyframes", () => {
    const animate = vi.fn(() => null);
    const factory = new BrowserAnimationAdapterFactory({ animate, now: () => 0, schedule: vi.fn(), cancelScheduled: vi.fn() });
    const lease = factory.acquire("runtime:filter", new AbortController().signal);
    lease.adapter.animate({
      target: {},
      animations: [{ targetId: "view", keyPath: "filter", from: "brightness(1)", to: "brightness(0.4)" }],
      duration: 0.1, delay: 0, iterations: 1, autoreverses: false, fill: "backwards", timing: "linear",
    });
    expect(animate).toHaveBeenCalledWith({}, [
      { offset: 0, filter: "brightness(1)" },
      { offset: 1, filter: "brightness(0.4)" },
    ], expect.objectContaining({ fill: "backwards" }));
  });

  it("settles reduced motion without allocating an adapter playback", async () => {
    const { runtime, factory } = runtimeWithAnimations(new RecordingAnimationFactory(), true);
    const handle = runtime.animations.animate(
      Object.freeze({ node: "banner" }),
      new AFXBasicAnimation({
        targetId: "banner",
        keyPath: "opacity",
        from: 0,
        to: 1,
        animation: new AFXAnimation({ duration: 0.5, reducedMotion: "system" }),
      }).toRuntime(),
      runtime.animations.acquireOwner({ appId: "notifications", viewId: "banner" }),
      1,
    );

    await expect(handle.finished).resolves.toMatchObject({ state: "completed", reduced: true });
    expect(factory.requests).toHaveLength(0);
    expect(runtime.animations.diagnostics().activeCount).toBe(0);
  });

  it("pauses on owner suspension, resumes on activation and cancels on close", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const owner = runtime.animations.acquireOwner({ appId: "calendar", windowControllerId: "window:calendar", viewId: "root" });
    const handle = runtime.animations.animate(Object.freeze({ node: "window" }), {
      animations: [{ targetId: "window", keyPath: "transform", from: "translateX(0px)", to: "translateX(40px)" }],
      duration: 0.24,
      timing: "ease-out",
    }, owner, 1);

    runtime.animations.suspendOwner("calendar");
    expect(factory.playbacks[0]?.pause).toHaveBeenCalledTimes(1);
    factory.playbacks[0]?.advance(1);
    await Promise.resolve();
    expect(runtime.animations.diagnostics()).toMatchObject({ activeCount: 1, pausedCount: 1, settlementCount: 0 });
    runtime.animations.resumeOwner("calendar");
    await expect(handle.finished).resolves.toMatchObject({ state: "completed" });
    expect(factory.playbacks[0]?.play).not.toHaveBeenCalled();
    expect(factory.playbacks[0]?.dispose).toHaveBeenCalledTimes(1);
    const closingOwner = runtime.animations.acquireOwner({ appId: "calendar", windowControllerId: "window:calendar", viewId: "closing-window" });
    const closing = runtime.animations.animate(Object.freeze({ node: "closing-window" }), {
      animations: [{ targetId: "closing-window", keyPath: "opacity", from: 1, to: 0 }],
      duration: 0.24,
    }, closingOwner, 1);
    runtime.animations.closeOwner("calendar", "application closed");
    await expect(closing.finished).resolves.toMatchObject({ state: "cancelled", reason: "application closed" });
  });

  it("keeps two runtimes isolated when they share one environment factory", async () => {
    const factory = new RecordingAnimationFactory();
    const environment = { ...createTestRuntimeEnvironment(), animation: factory };
    const first = createTestRuntime({ id: "runtime:same", environment });
    const second = createTestRuntime({ id: "runtime:same", environment });
    const definition = {
      animations: [{ targetId: "shared", keyPath: "opacity" as const, from: 0, to: 1 }],
      duration: 0.1,
      timing: "linear" as const,
    };
    const firstHandle = first.animations.animate({}, definition, first.animations.acquireOwner({ appId: "a", viewId: "shared" }), 1);
    const secondHandle = second.animations.animate({}, definition, second.animations.acquireOwner({ appId: "a", viewId: "shared" }), 1);

    await first.dispose("first runtime closed");
    await expect(firstHandle.finished).resolves.toMatchObject({ state: "cancelled" });
    expect(factory.releases[0]).toHaveBeenCalledTimes(1);
    expect(factory.releases[1]).not.toHaveBeenCalled();
    factory.playbacks[1]?.advance(1);
    await expect(secondHandle.finished).resolves.toMatchObject({ state: "completed" });
  });

  it("keeps same-app same-view animation owners independent across windows", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const definition = {
      animations: [{ targetId: "shared", keyPath: "opacity" as const, from: 0, to: 1 }],
      duration: 0.1,
    };
    const first = runtime.animations.animate({}, definition, runtime.animations.acquireOwner({ appId: "app", viewId: "shared", windowControllerId: "window:one" }), 1);
    const second = runtime.animations.animate({}, definition, runtime.animations.acquireOwner({ appId: "app", viewId: "shared", windowControllerId: "window:two" }), 1);
    expect(runtime.animations.diagnostics().activeCount).toBe(2);
    runtime.animations.closeWindowController("window:one", "window one closed");
    await expect(first.finished).resolves.toMatchObject({ state: "cancelled" });
    expect(runtime.animations.diagnostics().activeCount).toBe(1);
    factory.playbacks[1]?.advance(1);
    await expect(second.finished).resolves.toMatchObject({ state: "completed" });
  });

  it("binds canonical application lifecycle state to pause, resume and cancellation", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const owner = runtime.animations.acquireOwner({ appId: "lifecycle-app", viewId: "lifecycle" });
    const handle = runtime.animations.animate({}, {
      animations: [{ targetId: "lifecycle", keyPath: "opacity", from: 0, to: 1 }],
      duration: 0.2,
    }, owner, 1);
    runtime.store.mutate((draft) => { draft.lifecycle["lifecycle-app"] = "suspended"; });
    expect(factory.playbacks[0]?.pause).toHaveBeenCalledTimes(1);
    runtime.store.mutate((draft) => { draft.lifecycle["lifecycle-app"] = "active"; });
    expect(factory.playbacks[0]?.play).toHaveBeenCalledTimes(1);
    runtime.store.mutate((draft) => { draft.lifecycle["lifecycle-app"] = "closed"; });
    await expect(handle.finished).resolves.toMatchObject({ state: "cancelled", reason: "application closed" });
    expect(runtime.animations.diagnostics().activeCount).toBe(0);
  });

  it("closes windowless animations when the app leaves the lifecycle table", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const owner = runtime.animations.acquireOwner({ appId: "windowless-app", viewId: "orphan" });
    runtime.animations.animate({}, {
      animations: [{ targetId: "orphan", keyPath: "opacity", from: 0, to: 1 }],
      duration: 0.2,
    }, owner, 1);
    runtime.store.mutate((draft) => { draft.lifecycle["windowless-app"] = "active"; });
    runtime.store.mutate((draft) => { delete draft.lifecycle["windowless-app"]; });
    expect(runtime.animations.diagnostics().activeCount).toBe(0);
    expect(factory.playbacks[0]?.dispose).toHaveBeenCalled();
  });

  it("keeps runtime-issued owner leases revoked after view, window and application closure", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    expect(runtime.animations.acquireOwner).toBeTypeOf("function");
    if (typeof runtime.animations.acquireOwner !== "function") return;
    const definition = {
      animations: [{ targetId: "lease-target", keyPath: "opacity" as const, from: 0, to: 1 }],
      duration: 0.1,
    };
    const viewLease = runtime.animations.acquireOwner({ appId: "lease-app", viewId: "lease-view" });
    runtime.animations.cancelView("lease-app", "lease-view", "view unmounted");
    const viewLate = runtime.animations.animate({}, definition, viewLease, 1);
    await expect(viewLate.finished).resolves.toMatchObject({ state: "cancelled", reason: "view unmounted" });

    const windowLease = runtime.animations.acquireOwner({ appId: "lease-app", viewId: "window-view", windowControllerId: "window:lease" });
    runtime.animations.closeWindowController("window:lease", "window closed");
    const windowLate = runtime.animations.animate({}, definition, windowLease, 1);
    await expect(windowLate.finished).resolves.toMatchObject({ state: "cancelled", reason: "window closed" });

    const appLease = runtime.animations.acquireOwner({ appId: "lease-app", viewId: "app-view" });
    runtime.animations.closeOwner("lease-app", "application closed");
    const appLate = runtime.animations.animate({}, definition, appLease, 1);
    await expect(appLate.finished).resolves.toMatchObject({ state: "cancelled", reason: "application closed" });
    expect(() => runtime.animations.animate({}, definition, { ...appLease } as never, 1)).toThrow(/runtime-issued owner lease/i);
    expect(factory.requests).toHaveLength(0);
    expect(runtime.animations.diagnostics().activeCount).toBe(0);
  });

  it("settles a browser-adapter startup failure without retaining partial runtime ownership", async () => {
    let installs = 0;
    const adapterFactory = new BrowserAnimationAdapterFactory({
      animate: () => ({
        currentTime: 0, playState: "running",
        play: vi.fn(), pause: vi.fn(), cancel: vi.fn(),
        addEventListener: () => { installs += 1; if (installs === 2) throw new Error("listener denied"); },
        removeEventListener: vi.fn(),
      }),
      now: () => 0,
    });
    const runtime = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), animation: adapterFactory } });
    const owner = runtime.animations.acquireOwner({ appId: "startup", viewId: "failure" });
    const handle = runtime.animations.animate({}, {
      animations: [{ targetId: "failure", keyPath: "opacity", from: 0, to: 1 }],
      duration: 0.1,
    }, owner);
    await expect(handle.finished).resolves.toMatchObject({ state: "failed", reason: "animation adapter failed to start" });
    expect(runtime.animations.diagnostics()).toMatchObject({ activeCount: 0, listenerCount: 0, timerCount: 0 });
    expect(adapterFactory.diagnostics()).toMatchObject({ activeCount: 0, listenerCount: 0, timerCount: 0 });
  });


  it("rejects hostile descriptors and sparse groups before adapter ownership", () => {
    const { runtime, factory } = runtimeWithAnimations();
    const owner = runtime.animations.acquireOwner({ appId: "gallery", viewId: "hostile" });
    const poison = vi.fn(() => { throw new Error("getter executed"); });
    const entries: unknown[] = [];
    Object.defineProperty(entries, "0", { get: poison, enumerable: true });
    entries.length = 1;
    expect(() => runtime.animations.animate({}, {
      animations: entries as never,
      duration: 0.01,
    }, owner)).toThrow(/dense data slots/);
    expect(poison).not.toHaveBeenCalled();

    const sparse = new Array(2);
    sparse[0] = { targetId: "view", keyPath: "opacity", from: 0, to: 1 };
    expect(() => runtime.animations.animate({}, {
      animations: sparse as never,
      duration: 0.01,
    }, owner)).toThrow(/dense data slots/);
    expect(factory.requests).toHaveLength(0);
  });

  it("rejects invalid key-path values and a non-boolean autoreverse before adapter work", () => {
    const { runtime, factory } = runtimeWithAnimations();
    const owner = runtime.animations.acquireOwner({ appId: "gallery", viewId: "invalid-values" });
    expect(() => runtime.animations.animate({}, {
      animations: [{ targetId: "view", keyPath: "scrollPosition", from: { x: 0, y: 0 }, to: { x: 1, y: Number.NaN } }],
      duration: 0.1,
    }, owner)).toThrow(/outside its supported bounds|scrollPosition geometry/i);
    expect(() => runtime.animations.animate({}, {
      animations: [{ targetId: "view", keyPath: "opacity", from: 0, to: 1 }],
      duration: 0.1,
      autoreverses: "yes" as unknown as boolean,
    }, owner)).toThrow(/autoreverses must be boolean/i);
    expect(factory.requests).toHaveLength(0);
  });

  it.each(["native-pause", "clock", "cancel-scheduled", "native-play", "resume-schedule"] as const)(
    "settles lifecycle failure atomically for %s",
    async (lane) => {
      let fail = false;
      let sequence = 0;
      const pending = new Map<number, () => void>();
      const native = {
        currentTime: 0,
        playState: "running",
        pause: vi.fn(() => { if (fail && lane === "native-pause") throw new Error("pause denied"); }),
        play: vi.fn(() => { if (fail && lane === "native-play") throw new Error("play denied"); }),
        cancel: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      const adapterFactory = new BrowserAnimationAdapterFactory({
        animate: () => native,
        now: () => { if (fail && lane === "clock") throw new Error("clock denied"); return 0; },
        schedule: (callback) => {
          if (fail && lane === "resume-schedule") throw new Error("schedule denied");
          sequence += 1;
          pending.set(sequence, callback);
          return sequence;
        },
        cancelScheduled: (handle) => {
          pending.delete(handle as number);
          if (fail && lane === "cancel-scheduled") throw new Error("cancel denied");
        },
      });
      const runtime = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), animation: adapterFactory } });
      const owner = runtime.animations.acquireOwner({ appId: `failure-${lane}`, viewId: "view" });
      const handle = runtime.animations.animate({}, {
        animations: [{ targetId: "view", keyPath: "opacity", from: 0, to: 1 }],
        duration: 0.1,
      }, owner);
      fail = true;
      let thrown: unknown = null;
      try {
        runtime.store.mutate((draft) => { draft.lifecycle[`failure-${lane}`] = "suspended"; });
        if (lane === "native-play" || lane === "resume-schedule") {
          runtime.store.mutate((draft) => { draft.lifecycle[`failure-${lane}`] = "active"; });
        }
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeNull();
      if (thrown) {
        runtime.animations.closeOwner(`failure-${lane}`, "test cleanup");
        return;
      }
      await expect(handle.finished).resolves.toMatchObject({ state: "failed" });
      expect(native.cancel).toHaveBeenCalledTimes(1);
      expect(runtime.animations.diagnostics()).toMatchObject({ activeCount: 0, pausedCount: 0, settlementCount: 1, listenerCount: 0, timerCount: 0 });
      expect(adapterFactory.diagnostics()).toMatchObject({ activeCount: 0, listenerCount: 0, timerCount: 0 });
    },
  );

  it("provides an imperative hook and cancels its view generation on unmount", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const target = Object.freeze({ node: "hook-view" });
    const { result, unmount } = renderHook(() => useNSEViewAnimator({
      animations: runtime.animations,
      owner: { appId: "gallery", viewId: "hook-view" },
      target,
      targetId: "hook-view",
    }));
    let handle!: ReturnType<typeof result.current.animate>;
    act(() => {
      handle = result.current.animate("opacity", 1, 0, new AFXAnimation({ duration: 0.12 }));
    });
    const staleFacade = result.current;
    unmount();
    await expect(handle.finished).resolves.toMatchObject({ state: "cancelled" });
    expect(factory.playbacks[0]?.cancel).toHaveBeenCalledTimes(1);
    const late = staleFacade.animate("opacity", 0, 1, new AFXAnimation({ duration: 0.12 }));
    await expect(late.finished).resolves.toMatchObject({ state: "cancelled", reason: "animation view is not committed" });
    expect(factory.requests).toHaveLength(1);
  });

  it("does not acquire owner authority for an abandoned suspended render", () => {
    const { runtime, factory } = runtimeWithAnimations();
    const acquireOwner = vi.spyOn(runtime.animations, "acquireOwner");
    const committed = renderHook(() => useNSEViewAnimator({
      animations: runtime.animations,
      owner: { appId: "gallery", viewId: "abandoned" },
      target: {},
      targetId: "committed",
    }));
    const committedAcquireCount = acquireOwner.mock.calls.length;
    const pending = new Promise<void>(() => undefined);
    function AbandonedAnimator() {
      useNSEViewAnimator({
        animations: runtime.animations,
        owner: { appId: "gallery", viewId: "abandoned" },
        target: {},
        targetId: "abandoned",
      });
      throw pending;
    }
    render(<Suspense fallback={<span>waiting</span>}><AbandonedAnimator /></Suspense>);
    expect(acquireOwner).toHaveBeenCalledTimes(committedAcquireCount);
    act(() => { committed.result.current.animate("opacity", 0, 1, new AFXAnimation({ duration: 0.1 })); });
    expect(factory.requests).toHaveLength(1);
    committed.unmount();
  });

  it("activates one usable committed owner after StrictMode replay and revokes it on unmount", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const wrapper = ({ children }: { children: React.ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result, unmount } = renderHook(() => useNSEViewAnimator({
      animations: runtime.animations,
      owner: { appId: "gallery", viewId: "strict" },
      target: {},
      targetId: "strict",
    }), { wrapper });
    let handle!: ReturnType<typeof result.current.animate>;
    act(() => { handle = result.current.animate("opacity", 0, 1, new AFXAnimation({ duration: 0.1 })); });
    expect(factory.requests).toHaveLength(1);
    unmount();
    await expect(handle.finished).resolves.toMatchObject({ state: "cancelled" });
    const late = result.current.animate("opacity", 1, 0, new AFXAnimation({ duration: 0.1 }));
    await expect(late.finished).resolves.toMatchObject({ state: "cancelled" });
    expect(factory.requests).toHaveLength(1);
  });

  it("keeps a retained facade inert after owner and target replacement", async () => {
    const { runtime, factory } = runtimeWithAnimations();
    const firstTarget = { node: "first" };
    const secondTarget = { node: "second" };
    const { result, rerender } = renderHook(({ viewId, target }: { viewId: string; target: object }) => useNSEViewAnimator({
      animations: runtime.animations,
      owner: { appId: "gallery", viewId },
      target,
      targetId: viewId,
    }), { initialProps: { viewId: "first", target: firstTarget } });
    const retained = result.current;
    rerender({ viewId: "second", target: secondTarget });

    let stale!: ReturnType<typeof retained.animate>;
    expect(() => { stale = retained.animate("opacity", 0, 1, new AFXAnimation({ duration: 0.1 })); }).not.toThrow();
    await expect(stale.finished).resolves.toMatchObject({ state: "cancelled", reason: "animation view is not committed" });
    expect(factory.requests).toHaveLength(0);

    act(() => { result.current.animate("opacity", 0, 1, new AFXAnimation({ duration: 0.1 })); });
    expect(factory.requests).toHaveLength(1);
    expect(factory.requests[0]?.target).toBe(secondTarget);
  });

  it("keeps a retained facade inert across runtime replacement without cross-runtime lease use", async () => {
    const first = runtimeWithAnimations();
    const second = runtimeWithAnimations();
    const firstTarget = { node: "first-runtime" };
    const secondTarget = { node: "second-runtime" };
    const { result, rerender } = renderHook(({ runtime, target }: { runtime: typeof first.runtime; target: object }) => useNSEViewAnimator({
      animations: runtime.animations,
      owner: { appId: "gallery", viewId: "runtime-view" },
      target,
      targetId: "runtime-view",
    }), { initialProps: { runtime: first.runtime, target: firstTarget } });
    const retained = result.current;
    rerender({ runtime: second.runtime, target: secondTarget });

    let stale!: ReturnType<typeof retained.animate>;
    expect(() => { stale = retained.animate("opacity", 0, 1, new AFXAnimation({ duration: 0.1 })); }).not.toThrow();
    await expect(stale.finished).resolves.toMatchObject({ state: "cancelled" });
    expect(first.factory.requests).toHaveLength(0);
    expect(second.factory.requests).toHaveLength(0);

    act(() => { result.current.animate("opacity", 0, 1, new AFXAnimation({ duration: 0.1 })); });
    expect(first.factory.requests).toHaveLength(0);
    expect(second.factory.requests).toHaveLength(1);
    expect(second.factory.requests[0]?.target).toBe(secondTarget);
  });
});

describe("browser animation adapter", () => {
  it("owns native listeners per runtime lease and releases them on cancellation", async () => {
    const listeners = new Map<string, Set<() => void>>();
    const native = {
      currentTime: 0,
      playState: "running",
      play: vi.fn(),
      pause: vi.fn(),
      cancel: vi.fn(),
      addEventListener: vi.fn((type: string, listener: () => void) => {
        const bucket = listeners.get(type) ?? new Set();
        bucket.add(listener);
        listeners.set(type, bucket);
      }),
      removeEventListener: vi.fn((type: string, listener: () => void) => listeners.get(type)?.delete(listener)),
    };
    const platform: BrowserAnimationPlatform = {
      animate: vi.fn(() => native),
      now: () => 0,
    };
    const factory = new BrowserAnimationAdapterFactory(platform);
    const controller = new AbortController();
    const lease = factory.acquire("runtime:browser", controller.signal);
    const playback = lease.adapter.animate({
      target: {},
      animations: [{ targetId: "view", keyPath: "opacity", from: 0, to: 1 }],
      duration: 0.1,
      delay: 0,
      iterations: 1,
      autoreverses: false,
      fill: "forwards",
      timing: "linear",
    });
    expect(lease.adapter.diagnostics()).toMatchObject({ activeCount: 1, listenerCount: 2, timerCount: 0 });
    playback.cancel();
    await expect(playback.finished).resolves.toBe("cancelled");
    expect(lease.adapter.diagnostics()).toMatchObject({ activeCount: 0, listenerCount: 0, timerCount: 0 });
    lease.release();
    expect(factory.diagnostics()).toMatchObject({ runtimeLeaseCount: 0, activeCount: 0 });
  });

  it("rolls back native listeners and active ownership when startup listener installation throws", () => {
    const removeEventListener = vi.fn();
    const cancel = vi.fn();
    let installs = 0;
    const factory = new BrowserAnimationAdapterFactory({
      animate: () => ({
        currentTime: 0,
        playState: "running",
        play: vi.fn(), pause: vi.fn(), cancel,
        addEventListener: () => { installs += 1; if (installs === 2) throw new Error("listener denied"); },
        removeEventListener,
      }),
      now: () => 0,
    });
    const lease = factory.acquire("runtime:listener-throw", new AbortController().signal);
    expect(() => lease.adapter.animate({
      target: {}, animations: [{ targetId: "view", keyPath: "opacity", from: 0, to: 1 }],
      duration: 0.1, delay: 0, iterations: 1, autoreverses: false, fill: "forwards", timing: "linear",
    })).toThrow("listener denied");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalled();
    expect(lease.adapter.diagnostics()).toEqual({ activeCount: 0, listenerCount: 0, timerCount: 0 });
  });

  it("rolls back active ownership when the injected scheduler throws during startup", () => {
    const cancel = vi.fn();
    const removeEventListener = vi.fn();
    const factory = new BrowserAnimationAdapterFactory({
      animate: () => ({
        currentTime: 0, playState: "running",
        play: vi.fn(), pause: vi.fn(), cancel,
        addEventListener: vi.fn(), removeEventListener,
      }),
      now: () => 0,
      schedule: () => { throw new Error("scheduler denied"); },
      cancelScheduled: vi.fn(),
    });
    const lease = factory.acquire("runtime:scheduler-throw", new AbortController().signal);
    expect(() => lease.adapter.animate({
      target: {}, animations: [{ targetId: "view", keyPath: "opacity", from: 0, to: 1 }],
      duration: 0.1, delay: 0, iterations: 1, autoreverses: false, fill: "forwards", timing: "linear",
    })).toThrow("scheduler denied");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledTimes(2);
    expect(lease.adapter.diagnostics()).toEqual({ activeCount: 0, listenerCount: 0, timerCount: 0 });
  });

  it("pauses and resumes its injected fallback timer without a second completion source", async () => {
    let now = 0;
    let sequence = 0;
    const pending = new Map<number, { callback: () => void; delayMs: number }>();
    const platform: BrowserAnimationPlatform = {
      animate: () => null,
      now: () => now,
      schedule: (callback, delayMs) => { sequence += 1; pending.set(sequence, { callback, delayMs }); return sequence; },
      cancelScheduled: (handle) => pending.delete(handle as number),
    };
    const factory = new BrowserAnimationAdapterFactory(platform);
    const lease = factory.acquire("runtime:fallback", new AbortController().signal);
    const playback = lease.adapter.animate({
      target: {},
      animations: [{ targetId: "view", keyPath: "opacity", from: 0, to: 1 }],
      duration: 0.1,
      delay: 0.02,
      iterations: 1,
      autoreverses: false,
      fill: "forwards",
      timing: "linear",
    });
    expect(pending.get(1)?.delayMs).toBe(120);
    now = 50;
    playback.pause();
    expect(pending.size).toBe(0);
    expect(playback.progress()).toBeCloseTo(50 / 120);
    now = 500;
    playback.play();
    expect(pending.get(2)?.delayMs).toBe(70);
    pending.get(2)?.callback();
    await expect(playback.finished).resolves.toBe("completed");
    expect(lease.adapter.diagnostics()).toEqual({ activeCount: 0, listenerCount: 0, timerCount: 0 });
  });

  it("applies a hidden target's final state without starting native animation or a timer", async () => {
    const applyFinal = vi.fn();
    const animate = vi.fn(() => null);
    const factory = new BrowserAnimationAdapterFactory({
      animate,
      isHidden: () => true,
      applyFinal,
      now: () => 0,
      schedule: vi.fn(),
      cancelScheduled: vi.fn(),
    });
    const lease = factory.acquire("runtime:hidden", new AbortController().signal);
    const playback = lease.adapter.animate({
      target: {},
      animations: [{ targetId: "hidden", keyPath: "frame", from: { x: 0, y: 0, width: 10, height: 10 }, to: { x: 4, y: 8, width: 20, height: 30 } }],
      duration: 0.1,
      delay: 0,
      iterations: 1,
      autoreverses: false,
      fill: "forwards",
      timing: "linear",
    });
    await expect(playback.finished).resolves.toBe("completed");
    expect(animate).not.toHaveBeenCalled();
    expect(applyFinal).toHaveBeenCalledWith(expect.anything(), {
      left: "4px", top: "8px", width: "20px", height: "30px",
    });
    expect(lease.adapter.diagnostics()).toEqual({ activeCount: 0, listenerCount: 0, timerCount: 0 });
  });

  it("animates scroll position through the injected scheduler and applies the exact final point", async () => {
    let now = 0;
    let sequence = 0;
    const pending = new Map<number, { callback: () => void; delayMs: number }>();
    const applyScrollPosition = vi.fn();
    const factory = new BrowserAnimationAdapterFactory({
      animate: vi.fn(() => null),
      applyScrollPosition,
      now: () => now,
      schedule: (callback, delayMs) => { sequence += 1; pending.set(sequence, { callback, delayMs }); return sequence; },
      cancelScheduled: (handle) => pending.delete(handle as number),
    });
    const lease = factory.acquire("runtime:scroll", new AbortController().signal);
    const playback = lease.adapter.animate({
      target: {},
      animations: [{ targetId: "scroller", keyPath: "scrollPosition", from: { x: 5, y: 10 }, to: { x: 45, y: 90 } }],
      duration: 0.1,
      delay: 0,
      iterations: 1,
      autoreverses: false,
      fill: "forwards",
      timing: "linear",
    });
    expect(lease.adapter.diagnostics()).toMatchObject({ activeCount: 1, timerCount: 2 });
    now = 50;
    const tick = [...pending.values()].find(({ delayMs }) => delayMs === 16);
    tick?.callback();
    expect(applyScrollPosition).toHaveBeenCalledWith(expect.anything(), { x: 25, y: 50 });
    const completion = [...pending.values()].find(({ delayMs }) => delayMs === 100);
    completion?.callback();
    await expect(playback.finished).resolves.toBe("completed");
    expect(applyScrollPosition).toHaveBeenLastCalledWith(expect.anything(), { x: 45, y: 90 });
    expect(lease.adapter.diagnostics()).toEqual({ activeCount: 0, listenerCount: 0, timerCount: 0 });
  });
});
