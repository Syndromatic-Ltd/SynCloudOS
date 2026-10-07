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

// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNSEAnimationEnvironment } from "../../src/NSE/Animation";
import type { AFXFrameScheduler } from "../../src/FX/AnimationFX/AFXLayer";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  cleanup();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("frame regression cleanup");
});

function frameHost() {
  let time = 0;
  const pending = new Set<(time: number) => void>();
  const listeners = new Set<() => void>();
  const cancellations = vi.fn();
  const requested: Array<(time: number) => void> = [];
  const frames = {
    now: () => time,
    reducedMotion: false,
    suspended: false,
    requestFrame(callback: (time: number) => void) {
      requested.push(callback);
      pending.add(callback);
      return () => { cancellations(); pending.delete(callback); };
    },
    subscribeState(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return {
    frames, pending, requested, listeners, cancellations,
    notify() { for (const listener of [...listeners]) listener(); },
    elapse(ms: number) { time += ms; },
    step(ms: number) {
      time += ms;
      const callbacks = [...pending]; pending.clear();
      for (const callback of callbacks) callback(time);
    },
  };
}

function presentation(owner: "shell" | "mounted") {
  const host = frameHost();
  const runtime = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), animationFrames: host.frames } });
  runtimes.push(runtime);
  registerTestSynWare(runtime, { schemaVersion: 1, id: "frame-probe", version: "1.0.0", title: "Frame Probe", routes: [{ path: "/frame-probe", primary: true }] });
  const app = runtime.apps.getApp("frame-probe")!;
  let frames: AFXFrameScheduler | null = null;
  let environment: ReturnType<typeof useNSEAnimationEnvironment> | undefined;
  function Probe() { environment = useNSEAnimationEnvironment(); frames = environment.frames; return null; }
  const branding = { name: "Frame tests", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null };
  const view = render(<SynCloudOSProvider runtime={runtime}><HostSiteBrandingProvider value={branding}>
    {owner === "shell" ? <Probe /> : <SynWareRuntimeMount runtime={runtime} app={app} responderId={`application:${app.id}`}><Probe /></SynWareRuntimeMount>}
  </HostSiteBrandingProvider></SynCloudOSProvider>);
  if (!frames) throw new Error("Presentation did not receive its frame source.");
  return { runtime, host, frames: frames as AFXFrameScheduler, app, view, get environment() { return environment!; } };
}

describe.each(["shell", "mounted"] as const)("%s NSE frame state", owner => {
  it("ignores unrelated store, settings and unchanged host notifications", () => {
    const { runtime, host, frames } = presentation(owner);
    const changed = vi.fn();
    const release = frames.subscribeState!(changed);
    act(() => {
      runtime.store.mutate(draft => { draft.webspring.selectedAppId = "unrelated-selection"; });
      runtime.settings.set("masterVolume", 0.5);
      host.notify();
    });
    expect(changed).not.toHaveBeenCalled();
    release();
  });

  it("resolves settings, responsive preference and host motion with the NSE precedence", () => {
    const { runtime, host, frames } = presentation(owner);
    const changed = vi.fn();
    const release = frames.subscribeState!(changed);
    act(() => runtime.settings.set("motion", "reduced"));
    expect(frames.reducedMotion).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    act(() => runtime.store.mutate(draft => { draft.responsive.prefersReducedMotion = true; }));
    expect(changed).toHaveBeenCalledTimes(1);
    act(() => runtime.settings.set("motion", "standard"));
    expect(frames.reducedMotion).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
    act(() => runtime.settings.set("motion", "system"));
    expect(frames.reducedMotion).toBe(true);
    expect(changed).toHaveBeenCalledTimes(3);
    act(() => { host.frames.reducedMotion = true; host.notify(); });
    expect(changed).toHaveBeenCalledTimes(3);
    act(() => {
      runtime.settings.set("motion", "standard");
      runtime.store.mutate(draft => { draft.responsive.prefersReducedMotion = false; });
    });
    expect(frames.reducedMotion).toBe(true);
    expect(changed).toHaveBeenCalledTimes(3);
    act(() => { host.frames.reducedMotion = false; host.notify(); });
    expect(frames.reducedMotion).toBe(false);
    expect(changed).toHaveBeenCalledTimes(4);
    act(() => { host.frames.suspended = true; host.notify(); host.notify(); });
    expect(frames.suspended).toBe(true);
    expect(changed).toHaveBeenCalledTimes(5);
    act(() => { host.frames.suspended = false; host.notify(); });
    expect(frames.suspended).toBe(false);
    expect(changed).toHaveBeenCalledTimes(6);
    release();
  });
});

it("keeps mounted NSE and frame flags aligned when explicit standard overrides the OS fallback", () => {
  const previous = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)", media: query,
    addEventListener() {}, removeEventListener() {},
  })) });
  try {
    const presentationState = presentation("mounted");
    const { runtime, host, frames } = presentationState;
    expect(host.frames.reducedMotion).toBe(false);
    act(() => runtime.settings.set("motion", "standard"));
    expect(frames.reducedMotion).toBe(false);
    expect(presentationState.environment.reducedMotion).toBe(false);
    act(() => runtime.settings.set("motion", "reduced"));
    expect(frames.reducedMotion).toBe(true);
    expect(presentationState.environment.reducedMotion).toBe(true);
    act(() => runtime.settings.set("motion", "standard"));
    expect(frames.reducedMotion).toBe(false);
    expect(presentationState.environment.reducedMotion).toBe(false);
  } finally {
    if (previous) Object.defineProperty(window, "matchMedia", previous);
    else delete (window as Window & { matchMedia?: typeof window.matchMedia }).matchMedia;
  }
});

it("only suspends the mounted frame source whose lifecycle changes", () => {
  const { runtime, frames, app } = presentation("mounted");
  const changed = vi.fn();
  const release = frames.subscribeState!(changed);
  act(() => runtime.store.mutate(draft => { draft.lifecycle.other = "suspended"; }));
  expect(changed).not.toHaveBeenCalled();
  act(() => runtime.store.mutate(draft => { draft.lifecycle[app.id] = "suspended"; }));
  expect(frames.suspended).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
  act(() => runtime.store.mutate(draft => { draft.lifecycle[app.id] = "closed"; }));
  expect(changed).toHaveBeenCalledTimes(1);
  release();
});

it("preserves elapsed effect time across unrelated shell store publications", () => {
  const { runtime, host, frames } = presentation("shell");
  let previous = frames.now(), elapsed = 0;
  const tick = (time: number) => { elapsed += time - previous; previous = time; cancel = frames.requestFrame(tick); };
  let cancel = frames.requestFrame(tick);
  const release = frames.subscribeState!(() => { cancel(); previous = frames.now(); cancel = frames.requestFrame(tick); });
  for (let frame = 0; frame < 5; frame++) {
    host.elapse(15);
    act(() => runtime.store.mutate(draft => { draft.webspring.selectedAppId = `selection-${frame}`; }));
    host.step(1);
  }
  expect(elapsed).toBe(80);
  cancel(); release();
});

it("cancels and fences shell callbacks when the runtime aborts", async () => {
  const { runtime, host, frames } = presentation("shell");
  const callback = vi.fn();
  frames.requestFrame(callback);
  const lateDelivery = host.requested.at(-1)!;
  await act(async () => { await runtime.dispose("frame owner ended"); });
  expect(host.pending.size).toBe(0);
  expect(host.cancellations).toHaveBeenCalledTimes(1);
  lateDelivery(16);
  expect(callback).not.toHaveBeenCalled();
  const before = host.requested.length;
  const cancel = frames.requestFrame(callback);
  cancel();
  expect(host.requested).toHaveLength(before);
});

it("fences cancelled shell deliveries without cancelling completed work on abort", async () => {
  const { runtime, host, frames } = presentation("shell");
  const cancelled = vi.fn(), completed = vi.fn();
  const cancel = frames.requestFrame(cancelled);
  const lateDelivery = host.requested.at(-1)!;
  cancel(); cancel(); lateDelivery(16);
  frames.requestFrame(completed);
  host.step(16);
  expect(cancelled).not.toHaveBeenCalled();
  expect(completed).toHaveBeenCalledTimes(1);
  expect(host.cancellations).toHaveBeenCalledTimes(1);
  await act(async () => { await runtime.dispose("completed owner ended"); });
  expect(host.cancellations).toHaveBeenCalledTimes(1);
});

it("releases frame state subscriptions on runtime abort before React cleanup", async () => {
  const { runtime, host, frames } = presentation("shell");
  const changed = vi.fn();
  const release = frames.subscribeState!(changed);
  await act(async () => { await runtime.dispose("state owner ended"); });
  expect(changed).toHaveBeenCalledTimes(1);
  changed.mockClear();
  expect(host.listeners.size).toBe(0);
  host.notify();
  expect(changed).not.toHaveBeenCalled();
  release(); release();
});

it("releases mounted subscriptions when its React mount ends while the kernel remains live", () => {
  const { runtime, host, frames, view } = presentation("mounted");
  const changed = vi.fn();
  const release = frames.subscribeState!(changed);
  view.unmount();
  expect(runtime.signal.aborted).toBe(false);
  expect(frames.suspended).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(host.listeners.size).toBe(0);
  changed.mockClear();
  host.notify();
  runtime.settings.set("motion", "reduced");
  expect(changed).not.toHaveBeenCalled();
  expect(() => frames.requestFrame(() => {})()).not.toThrow();
  release();
});
