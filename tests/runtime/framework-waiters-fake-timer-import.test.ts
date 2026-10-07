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

import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());

it("rejects a default watchdog when its module is first loaded under intercepted timers", async () => {
  vi.useFakeTimers();
  const { createSynWareTesting } = await import("../../src/SynCloudOS/AppSDK/testing/createSynWareTesting");
  const { createSettlementRegistry } = await import("../../src/SynCloudOS/Testing/SettlementRegistry");
  const registry = createSettlementRegistry({
    runtimeId: "runtime:fake-timer-import" as never,
    now: () => 0,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  const host = {
    settlement: {
      getState: () => registry.getState(),
      subscribe: (listener: () => void) => registry.subscribe(listener),
      settled: (options: { timeoutMs: number; signal?: AbortSignal }) => registry.settled(options),
      begin: (input: Parameters<typeof registry.begin>[0]) => registry.begin(input),
      exclude: (input: Parameters<typeof registry.exclude>[0]) => registry.exclude(input),
    },
    navigation: { openRoute: () => ({ result: Promise.resolve({ status: "completed", committed: true }) }) },
  };
  try {
    expect(() => createSynWareTesting(host)).toThrow(/watchdog/i);
  } finally {
    registry.dispose();
  }
});
