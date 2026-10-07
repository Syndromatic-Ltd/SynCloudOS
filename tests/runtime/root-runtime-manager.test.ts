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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRootRuntimeManager } from "../../src/SynCloudOS/RootRuntime/RootRuntimeManager";

function createPlatformDependencies() {
  return {
    browser: {
      getLocation: () => ({
        href: window.location.href,
        origin: window.location.origin,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      }),
      getWindow: () => window,
      getDocument: () => document,
      getNavigator: () => navigator,
    },
    scheduler: {
      setTimeout: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  };
}

describe("RootRuntimeManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/studio?folder=nse#selected");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("owns coordinator lifecycle and boots the captured initial pathname", async () => {
    const startBrowserRouting = vi.fn();
    const stopBrowserRouting = vi.fn();
    const boot = vi.fn();
    const phases: string[] = [];
    const manager = createRootRuntimeManager({
      ...createPlatformDependencies(),
      startBrowserRouting,
      stopBrowserRouting,
      boot,
      resolveAppearance: () => "dark"
    });

    const stop = manager.start((phase) => phases.push(phase));
    expect(startBrowserRouting).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.mode).toBe("dark");

    await vi.advanceTimersByTimeAsync(90);
    expect(phases).toEqual(["material"]);
    await vi.advanceTimersByTimeAsync(470);

    expect(boot).toHaveBeenCalledTimes(1);
    expect(boot).toHaveBeenCalledWith("/studio?folder=nse#selected");
    expect(phases).toEqual(["material", "complete"]);

    stop();
    expect(stopBrowserRouting).toHaveBeenCalledTimes(1);
  });

  it("keeps the startup layer covering a direct app boot until its presentation is ready", async () => {
    let finishInitialPresentation!: () => void;
    const initialPresentation = new Promise<void>((resolve) => {
      finishInitialPresentation = resolve;
    });
    const phases: string[] = [];
    const manager = createRootRuntimeManager({
      ...createPlatformDependencies(),
      startBrowserRouting: vi.fn(),
      stopBrowserRouting: vi.fn(),
      boot: vi.fn(() => initialPresentation),
      resolveAppearance: () => "dark"
    });

    manager.start((phase) => phases.push(phase));
    await vi.advanceTimersByTimeAsync(560);

    expect(phases).toEqual(["material"]);
    finishInitialPresentation();
    await Promise.resolve();

    expect(phases).toEqual(["material", "complete"]);
  });

  it("cancels startup work when the root unmounts before boot", async () => {
    const stopBrowserRouting = vi.fn();
    const boot = vi.fn();
    const manager = createRootRuntimeManager({
      ...createPlatformDependencies(),
      startBrowserRouting: vi.fn(),
      stopBrowserRouting,
      boot,
      resolveAppearance: () => "light"
    });

    const stop = manager.start(vi.fn());
    stop();
    await vi.advanceTimersByTimeAsync(600);

    expect(boot).not.toHaveBeenCalled();
    expect(stopBrowserRouting).toHaveBeenCalledTimes(1);
  });

  it("does not emit a late completion when disposal races an in-flight boot", async () => {
    let resolveBoot!: () => void;
    const boot = vi.fn(() => new Promise<void>((resolve) => { resolveBoot = resolve; }));
    const stopBrowserRouting = vi.fn();
    const clearTimeout = vi.fn((handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
    const phases: string[] = [];
    const manager = createRootRuntimeManager({
      ...createPlatformDependencies(),
      scheduler: {
        setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
        clearTimeout,
      },
      startBrowserRouting: vi.fn(),
      stopBrowserRouting,
      boot,
      resolveAppearance: () => "dark",
    });

    const stop = manager.start((phase) => phases.push(phase));
    await vi.advanceTimersByTimeAsync(560);
    expect(boot).toHaveBeenCalledTimes(1);

    stop();
    resolveBoot();
    await Promise.resolve();

    expect(phases).toEqual(["material"]);
    expect(clearTimeout).toHaveBeenCalledTimes(2);
    expect(stopBrowserRouting).toHaveBeenCalledTimes(1);
  });
});
