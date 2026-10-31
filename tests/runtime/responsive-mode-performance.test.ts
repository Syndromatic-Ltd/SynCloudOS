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
import { createTestRuntime, createRuntimeHarness, createTestRuntimeEnvironment } from "./helpers";

describe("ResponsiveModeManager throttling", () => {
  it("observes resize idempotently and removes listeners", async () => {
    const environment = createTestRuntimeEnvironment();
    const remove = vi.fn();
    const runtime = createTestRuntime({ environment });
    const subscribe = vi.spyOn(runtime.screen, "subscribe").mockReturnValue(remove);
    const { ResponsiveModeManager } = createRuntimeHarness(runtime);
    const subscriptions = subscribe.mock.calls.length;

    ResponsiveModeManager.observe();
    ResponsiveModeManager.observe();

    expect(subscribe.mock.calls).toHaveLength(subscriptions + 1);

    ResponsiveModeManager.unobserve();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("coalesces resize events into one runtime commit", async () => {
    vi.useFakeTimers();
    const environment = createTestRuntimeEnvironment();
    const runtime = createTestRuntime({ environment });
    const subscribe = vi.spyOn(runtime.screen, "subscribe");
    const { ResponsiveModeManager, RuntimeStore } = createRuntimeHarness(runtime);
    const listener = vi.fn();
    RuntimeStore.subscribe(listener);

    ResponsiveModeManager.observe();
    listener.mockClear();
    vi.spyOn(environment.layoutViewport, "getSnapshot").mockReturnValue({ width: 900, height: 700 });

    const resize = subscribe.mock.calls.at(-1)?.[0];
    resize?.();
    resize?.();

    await vi.advanceTimersByTimeAsync(16);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(RuntimeStore.getSnapshot().responsive).toMatchObject({
      mode: "tablet",
      width: 900,
      height: 700
    });
  });

  it("classifies layout bounds independently from zoom, keyboard occlusion and physical screen size", async () => {
    const environment = createTestRuntimeEnvironment();
    vi.spyOn(environment.layoutViewport, "getSnapshot").mockReturnValue({ width: 1100, height: 700 });
    const visual = vi.spyOn(environment.visualViewport, "getSnapshot").mockReturnValue({
      width: 390, height: 300, offsetLeft: 20, offsetTop: 30, scale: 2,
    });
    const runtime = createTestRuntime({ environment });
    const { ResponsiveModeManager, RuntimeStore } = createRuntimeHarness(runtime);
    ResponsiveModeManager.sync();
    expect(RuntimeStore.getSnapshot().responsive).toMatchObject({ mode: "desktop", width: 1100, height: 700 });
    const previous = RuntimeStore.getSnapshot().responsive;
    visual.mockReturnValue({ width: 320, height: 200, offsetLeft: 50, offsetTop: 60, scale: 3 });
    ResponsiveModeManager.sync();
    expect(RuntimeStore.getSnapshot().responsive).toBe(previous);
    await runtime.dispose("test");
  });

  it("does not publish invalid transient layout measurements", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createTestRuntime({ environment });
    const { ResponsiveModeManager, RuntimeStore } = createRuntimeHarness(runtime);
    ResponsiveModeManager.sync();
    const previous = RuntimeStore.getSnapshot().responsive;
    vi.spyOn(environment.layoutViewport, "getSnapshot").mockReturnValue({ width: Number.NaN, height: 0 });
    ResponsiveModeManager.sync();
    expect(RuntimeStore.getSnapshot().responsive).toBe(previous);
    await runtime.dispose("test");
  });

  it("holds shell layout classification until the complete host sample is valid", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createTestRuntime({ environment });
    const manager = runtime.responsiveModeManager;
    manager.sync();
    const previous = manager.getSnapshot();
    vi.spyOn(environment.layoutViewport, "getSnapshot").mockReturnValue({ width: 900, height: 700 });
    const visual = vi.spyOn(environment.visualViewport, "getSnapshot").mockReturnValue({ width: 0, height: 0, offsetLeft: 0, offsetTop: 0, scale: 1 });
    manager.sync();
    expect(manager.getSnapshot()).toBe(previous);
    visual.mockReturnValue({ width: 900, height: 700, offsetLeft: 0, offsetTop: 0, scale: 1 });
    manager.sync();
    expect(manager.getSnapshot()).toMatchObject({ mode: "tablet", width: 900, height: 700 });
    await runtime.dispose("test");
  });

  it("does not commit when responsive values are unchanged", async () => {
    const { ResponsiveModeManager, RuntimeStore } = createRuntimeHarness(createTestRuntime());
    const listener = vi.fn();
    RuntimeStore.subscribe(listener);

    ResponsiveModeManager.sync();

    expect(listener).not.toHaveBeenCalled();
  });
});
