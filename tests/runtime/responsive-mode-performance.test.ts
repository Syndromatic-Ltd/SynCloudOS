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

function getResizeHandler(environment: ReturnType<typeof createTestRuntimeEnvironment>) {
  const call = environment.addWindowListener.mock.calls.find(([type]) => type === "resize");
  return call?.[1] as EventListener | undefined;
}

describe("ResponsiveModeManager throttling", () => {
  it("observes resize idempotently and removes listeners", async () => {
    const environment = createTestRuntimeEnvironment();
    const { ResponsiveModeManager } = createRuntimeHarness(createTestRuntime({ environment }));

    ResponsiveModeManager.observe();
    ResponsiveModeManager.observe();

    expect(environment.addWindowListener.mock.calls.filter(([type]) => type === "resize")).toHaveLength(1);

    ResponsiveModeManager.unobserve();

    const removeResizeListener = environment.addWindowListener.mock.results
      .find((result, index) => environment.addWindowListener.mock.calls[index]?.[0] === "resize")
      ?.value;
    expect(removeResizeListener).toHaveBeenCalledTimes(1);
  });

  it("coalesces resize events into one runtime commit", async () => {
    vi.useFakeTimers();
    const environment = createTestRuntimeEnvironment();
    const { ResponsiveModeManager, RuntimeStore } = createRuntimeHarness(createTestRuntime({ environment }));
    const listener = vi.fn();
    RuntimeStore.subscribe(listener);

    ResponsiveModeManager.observe();
    listener.mockClear();
    vi.spyOn(environment.visualViewport, "getSnapshot").mockReturnValue({ width: 900, height: 700, offsetLeft: 0, offsetTop: 0, scale: 1 });

    const resize = getResizeHandler(environment);
    resize?.(new Event("resize"));
    resize?.(new Event("resize"));

    await vi.advanceTimersByTimeAsync(16);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(RuntimeStore.getSnapshot().responsive).toMatchObject({
      mode: "tablet",
      width: 900,
      height: 700
    });
  });

  it("does not commit when responsive values are unchanged", async () => {
    const { ResponsiveModeManager, RuntimeStore } = createRuntimeHarness(createTestRuntime());
    const listener = vi.fn();
    RuntimeStore.subscribe(listener);

    ResponsiveModeManager.sync();

    expect(listener).not.toHaveBeenCalled();
  });
});
