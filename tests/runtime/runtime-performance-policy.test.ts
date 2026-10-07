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

import { describe, expect, it } from "vitest";
import {
  createRuntimePerformancePolicy,
  type RuntimePerformancePolicyOptions,
} from "../../src/SynCloudOS/Performance/RuntimePerformancePolicy";
import { createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const MiB = 1024 * 1024;

function harness(overrides: Partial<RuntimePerformancePolicyOptions> = {}) {
  let now = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  let nextTimer = 1;
  const capacity: number[] = [];
  const budgets: (number | null)[] = [];
  const enforced: string[] = [];
  const policy = createRuntimePerformancePolicy({
    signals: { logicalProcessorCount: 16, deviceMemoryGiB: 8 },
    standardConcurrency: 4,
    standardSoftBudgetBytes: null,
    now: () => now,
    setTimeout: (callback, delayMs) => { const id = nextTimer++; timers.set(id, { at: now + delayMs, callback }); return id; },
    clearTimeout: (handle) => { timers.delete(handle as number); },
    jobs: { setCapacity: (value) => { if (value.concurrency !== undefined) capacity.push(value.concurrency); } },
    resources: { setSoftBudget: (bytes) => { budgets.push(bytes); }, enforceBudget: (reason) => { enforced.push(reason ?? ""); return { reason: reason ?? "", reclaimedBytes: 0, steps: [] }; } },
    ...overrides,
  });
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].callback();
    }
    now = target;
  };
  return { policy, capacity, budgets, enforced, advance, timers, setNow: (value: number) => { now = value; } };
}

describe("runtime performance policy", () => {
  it("stays standard on capable hardware and changes nothing", () => {
    const { policy, capacity, budgets } = harness();
    expect(policy.snapshot()).toMatchObject({ tier: "standard", reasons: [], speculativeWork: true, heavyJobConcurrency: 4, resourceSoftBudgetBytes: null });
    expect(capacity).toEqual([]);
    expect(budgets).toEqual([]);
  });

  it("constrains from capability signals, not device identity", () => {
    const lowMemory = harness({ signals: { logicalProcessorCount: 4, deviceMemoryGiB: 1 } });
    expect(lowMemory.policy.snapshot()).toMatchObject({ tier: "constrained", reasons: ["memory"], speculativeWork: false, heavyJobConcurrency: 1 });
    expect(lowMemory.capacity).toEqual([1]);
    expect(lowMemory.budgets.at(-1)).toBe(32 * MiB);
    expect(lowMemory.enforced).toEqual(["performance-constrained"]);

    const fewCores = harness({ signals: { logicalProcessorCount: 2 } });
    expect(fewCores.policy.snapshot()).toMatchObject({ tier: "constrained", reasons: ["cpu"], resourceSoftBudgetBytes: 64 * MiB });

    // A host's own budget is never raised.
    const hostBudget = harness({ signals: { deviceMemoryGiB: 2 }, standardSoftBudgetBytes: 16 * MiB });
    expect(hostBudget.policy.snapshot().resourceSoftBudgetBytes).toBe(16 * MiB);
  });

  it("treats save-data and slow networks as a speculative-work signal, not a CPU tier", () => {
    const { policy, capacity } = harness({ networkHints: { saveData: true } });
    expect(policy.snapshot()).toMatchObject({ tier: "standard", saveData: true, speculativeWork: false });
    expect(capacity).toEqual([]);
    policy.updateNetworkHints({ saveData: false, effectiveType: "2g" });
    expect(policy.snapshot().speculativeWork).toBe(false);
    policy.updateNetworkHints({ saveData: false, effectiveType: "4g" });
    expect(policy.snapshot().speculativeWork).toBe(true);
  });

  it("holds memory pressure for a dwell time before recovering", () => {
    const { policy, capacity, budgets, advance } = harness();
    const seen: string[] = [];
    policy.subscribe((snapshot) => seen.push(snapshot.tier));
    policy.reportMemoryPressure();
    expect(policy.snapshot()).toMatchObject({ tier: "constrained", reasons: ["memory-pressure"] });
    expect(capacity).toEqual([1]);
    advance(59_000);
    expect(policy.snapshot().tier).toBe("constrained");
    policy.reportMemoryPressure(); // renewed pressure extends the hold
    advance(59_000);
    expect(policy.snapshot().tier).toBe("constrained");
    advance(2_000);
    expect(policy.snapshot().tier).toBe("standard");
    expect(capacity).toEqual([1, 4]);
    expect(budgets.at(-1)).toBeNull();
    expect(seen).toEqual(["constrained", "standard"]);
  });

  it("needs sustained main-thread saturation to constrain and sustained health to recover", () => {
    const { policy, advance } = harness();
    // One heavy burst in one window: not sustained.
    policy.reportLongTask(4_000);
    advance(10_000);
    policy.reportLongTask(60);
    expect(policy.snapshot().tier).toBe("standard");
    // Two consecutive saturated windows.
    advance(10_000);
    policy.reportLongTask(3_000);
    advance(10_000);
    policy.reportLongTask(3_000);
    advance(10_000);
    policy.reportLongTask(3_000);
    expect(policy.snapshot()).toMatchObject({ tier: "constrained", reasons: ["main-thread"] });
    // Brief health does not flip back.
    advance(30_000);
    expect(policy.snapshot().tier).toBe("constrained");
    advance(40_000);
    expect(policy.snapshot().tier).toBe("standard");
  });

  it("does not arm timers while standard and idle", () => {
    const { timers } = harness();
    expect(timers.size).toBe(0);
  });

  it("adapts a runtime from its environment without touching accessibility preferences", async () => {
    const constrained = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), deviceMemoryGiB: 1, logicalProcessorCount: 4 } });
    expect(constrained.performancePolicy.snapshot()).toMatchObject({ tier: "constrained", reasons: ["memory"] });
    expect(constrained.jobs.snapshot().concurrency).toBe(1);
    expect(constrained.resources.snapshot().softBudgetBytes).toBe(32 * MiB);
    expect(constrained.settings.get().motion).toBe("system");

    const capable = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), deviceMemoryGiB: 8, logicalProcessorCount: 8 } });
    capable.settings.set("motion", "reduced");
    expect(capable.performancePolicy.snapshot().tier).toBe("standard");
    expect(capable.jobs.snapshot().concurrency).toBe(4);

    const warned = createTestRuntime({
      environment: { ...createTestRuntimeEnvironment(), deviceMemoryGiB: 8, logicalProcessorCount: 8 },
      initialBundles: [createTestBundle({ id: "memory-app" })],
    });
    await warned.lifecycle.dispatch("memoryWarning", "memory-app", { pressure: "high" }).result;
    expect(warned.performancePolicy.snapshot()).toMatchObject({ tier: "constrained", reasons: ["memory-pressure"] });
    expect(warned.jobs.snapshot().concurrency).toBe(1);

    const fixed = createTestRuntime({
      environment: { ...createTestRuntimeEnvironment(), deviceMemoryGiB: 1 },
      performancePolicy: "fixed",
    });
    expect(fixed.performancePolicy.snapshot().tier).toBe("standard");
  });
});
