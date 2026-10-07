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

import type { HeavyJobAdmission } from "../Operations/HeavyJobAdmission";
import type { RuntimeResourceLedger } from "../Resources/RuntimeResourceLedger";

/**
 * Adaptive runtime performance policy.
 *
 * Decides, from capability signals and observed pressure, whether the runtime
 * should run in a constrained tier, and applies that to the runtime's own
 * levers: heavy-job concurrency, the framework resource soft budget and
 * speculative work such as prefetch. It never identifies devices (no model or
 * user-agent tables) and never reads or writes accessibility preferences:
 * reduced motion is the user's choice on a separate axis, and a constrained
 * tier is not a reason to change it.
 *
 * Static signals (few logical processors, little device memory) constrain for
 * the runtime's lifetime. Dynamic signals use hysteresis so a single burst
 * does not flip the tier and brief health does not flip it back: memory
 * pressure holds for a dwell time after the last report, and main-thread
 * saturation needs consecutive saturated windows to enter and a longer run of
 * healthy windows to leave. While standard and idle the policy arms no timers.
 */

export type RuntimePerformanceTier = "standard" | "constrained";
export type RuntimePerformanceReason = "cpu" | "memory" | "memory-pressure" | "main-thread";

export interface RuntimePerformanceSignals {
  /** Logical processors (navigator.hardwareConcurrency). */
  readonly logicalProcessorCount?: number;
  /** Approximate device memory in GiB (navigator.deviceMemory: coarse, and
   * capped by browsers). */
  readonly deviceMemoryGiB?: number;
}

export interface RuntimeNetworkHints {
  /** The user asked to reduce data use. */
  readonly saveData?: boolean;
  /** Network Information effective type, such as "4g" or "2g". */
  readonly effectiveType?: string;
}

export interface RuntimePerformanceSnapshot {
  readonly tier: RuntimePerformanceTier;
  /** Why the tier is constrained; empty when standard. */
  readonly reasons: readonly RuntimePerformanceReason[];
  readonly saveData: boolean;
  /** Whether speculative work (prefetch, warm-up) should run. False when
   * constrained, when the user asked to save data, or on a 2G-class link. */
  readonly speculativeWork: boolean;
  readonly heavyJobConcurrency: number;
  readonly resourceSoftBudgetBytes: number | null;
  readonly changedAt: number;
}

export interface RuntimePerformancePolicy {
  snapshot(): RuntimePerformanceSnapshot;
  subscribe(listener: (snapshot: RuntimePerformanceSnapshot) => void): () => void;
  /** Host memory pressure: a lifecycle memory warning or similar. */
  reportMemoryPressure(): void;
  /** A main-thread task that blocked the page for `durationMs`. */
  reportLongTask(durationMs: number): void;
  updateNetworkHints(hints: RuntimeNetworkHints): void;
  dispose(): void;
}

export interface RuntimePerformancePolicyThresholds {
  /** Constrain at or below this many logical processors. */
  readonly constrainedProcessorCount: number;
  /** Constrain at or below this much device memory. */
  readonly constrainedDeviceMemoryGiB: number;
  /** How long memory pressure holds the constrained tier after its last report. */
  readonly memoryPressureDwellMs: number;
  readonly windowMs: number;
  /** A window is saturated when long tasks fill at least this fraction of it. */
  readonly saturatedRatio: number;
  /** A window is healthy when long tasks fill at most this fraction of it. */
  readonly healthyRatio: number;
  readonly saturatedWindowsToEnter: number;
  readonly healthyWindowsToLeave: number;
}

export interface RuntimePerformancePolicyOptions {
  /** False keeps the standard tier (the host manages capacity itself);
   * network hints still gate speculative work. */
  readonly adaptive?: boolean;
  readonly signals: RuntimePerformanceSignals;
  readonly networkHints?: RuntimeNetworkHints;
  readonly standardConcurrency: number;
  readonly standardSoftBudgetBytes: number | null;
  readonly now: () => number;
  readonly setTimeout: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly jobs: Pick<HeavyJobAdmission, "setCapacity">;
  readonly resources: Pick<RuntimeResourceLedger, "setSoftBudget" | "enforceBudget">;
  readonly thresholds?: Partial<RuntimePerformancePolicyThresholds>;
}

const MiB = 1024 * 1024;

const defaultThresholds: RuntimePerformancePolicyThresholds = Object.freeze({
  constrainedProcessorCount: 2,
  constrainedDeviceMemoryGiB: 2,
  memoryPressureDwellMs: 60_000,
  windowMs: 10_000,
  saturatedRatio: 0.25,
  healthyRatio: 0.05,
  saturatedWindowsToEnter: 2,
  healthyWindowsToLeave: 6,
});

const reasonOrder: readonly RuntimePerformanceReason[] = ["cpu", "memory", "memory-pressure", "main-thread"];

function known(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Framework-held (cache-class) memory allowed when constrained: 32 MiB per
 * GiB of device memory, between 32 and 128 MiB; 64 MiB when unknown. */
function constrainedBudgetBytes(deviceMemoryGiB: number | undefined): number {
  if (!known(deviceMemoryGiB)) return 64 * MiB;
  return Math.min(128 * MiB, Math.max(32 * MiB, Math.round(32 * MiB * deviceMemoryGiB)));
}

function slowNetwork(hints: RuntimeNetworkHints): boolean {
  return typeof hints.effectiveType === "string" && /(^|-)2g$/.test(hints.effectiveType);
}

export function createRuntimePerformancePolicy(options: RuntimePerformancePolicyOptions): RuntimePerformancePolicy {
  const thresholds = { ...defaultThresholds, ...options.thresholds };
  const adaptive = options.adaptive !== false;
  const { signals, now, jobs, resources } = options;
  const staticReasons = new Set<RuntimePerformanceReason>();
  if (adaptive && known(signals.logicalProcessorCount) && signals.logicalProcessorCount <= thresholds.constrainedProcessorCount) {
    staticReasons.add("cpu");
  }
  if (adaptive && known(signals.deviceMemoryGiB) && signals.deviceMemoryGiB <= thresholds.constrainedDeviceMemoryGiB) {
    staticReasons.add("memory");
  }
  const listeners = new Set<(snapshot: RuntimePerformanceSnapshot) => void>();
  let network: RuntimeNetworkHints = { ...options.networkHints };
  let pressureUntil = Number.NEGATIVE_INFINITY;
  let windowStart = now();
  let windowBusyMs = 0;
  let saturatedWindows = 0;
  let healthyWindows = 0;
  let mainThreadConstrained = false;
  let timer: unknown = null;
  let disposed = false;
  let current: RuntimePerformanceSnapshot;

  const closeElapsedWindows = (at: number) => {
    while (at >= windowStart + thresholds.windowMs) {
      const ratio = windowBusyMs / thresholds.windowMs;
      if (ratio >= thresholds.saturatedRatio) {
        saturatedWindows += 1;
        healthyWindows = 0;
      } else if (ratio <= thresholds.healthyRatio) {
        healthyWindows += 1;
        saturatedWindows = 0;
      }
      if (!mainThreadConstrained && saturatedWindows >= thresholds.saturatedWindowsToEnter) mainThreadConstrained = true;
      if (mainThreadConstrained && healthyWindows >= thresholds.healthyWindowsToLeave) mainThreadConstrained = false;
      windowStart += thresholds.windowMs;
      windowBusyMs = 0;
    }
  };

  const reasonsAt = (at: number): RuntimePerformanceReason[] => {
    const active = new Set(staticReasons);
    if (adaptive && at < pressureUntil) active.add("memory-pressure");
    if (adaptive && mainThreadConstrained) active.add("main-thread");
    return reasonOrder.filter((reason) => active.has(reason));
  };

  const compute = (at: number): RuntimePerformanceSnapshot => {
    const reasons = reasonsAt(at);
    const tier: RuntimePerformanceTier = reasons.length > 0 ? "constrained" : "standard";
    const saveData = network.saveData === true;
    const resourceSoftBudgetBytes = tier === "standard"
      ? options.standardSoftBudgetBytes
      : Math.min(options.standardSoftBudgetBytes ?? Number.POSITIVE_INFINITY, constrainedBudgetBytes(signals.deviceMemoryGiB));
    return Object.freeze({
      tier,
      reasons: Object.freeze(reasons),
      saveData,
      speculativeWork: tier === "standard" && !saveData && !slowNetwork(network),
      heavyJobConcurrency: tier === "standard" ? options.standardConcurrency : 1,
      resourceSoftBudgetBytes,
      changedAt: at,
    });
  };

  const same = (a: RuntimePerformanceSnapshot, b: RuntimePerformanceSnapshot) =>
    a.tier === b.tier && a.saveData === b.saveData && a.speculativeWork === b.speculativeWork &&
    a.reasons.length === b.reasons.length && a.reasons.every((reason, index) => reason === b.reasons[index]);

  const hasDynamicReason = (snapshot: RuntimePerformanceSnapshot) =>
    snapshot.reasons.includes("memory-pressure") || snapshot.reasons.includes("main-thread");

  const arm = () => {
    if (disposed || timer !== null || !hasDynamicReason(current)) return;
    const delay = Math.max(1, windowStart + thresholds.windowMs - now());
    timer = options.setTimeout(() => {
      timer = null;
      evaluate();
    }, delay);
  };

  const apply = (previous: RuntimePerformanceSnapshot | null, next: RuntimePerformanceSnapshot) => {
    if (previous?.heavyJobConcurrency !== next.heavyJobConcurrency && (previous || next.tier === "constrained")) {
      jobs.setCapacity({ concurrency: next.heavyJobConcurrency });
    }
    if (previous?.resourceSoftBudgetBytes !== next.resourceSoftBudgetBytes && (previous || next.tier === "constrained")) {
      resources.setSoftBudget(next.resourceSoftBudgetBytes);
      if (next.tier === "constrained") resources.enforceBudget("performance-constrained");
    }
  };

  function evaluate() {
    if (disposed) return;
    const at = now();
    closeElapsedWindows(at);
    const next = compute(at);
    if (!same(current, next)) {
      const previous = current;
      current = next;
      apply(previous, next);
      for (const listener of [...listeners]) listener(next);
    }
    arm();
  }

  current = compute(now());
  apply(null, current);
  arm();

  return {
    snapshot: () => current,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    reportMemoryPressure() {
      if (disposed || !adaptive) return;
      pressureUntil = now() + thresholds.memoryPressureDwellMs;
      evaluate();
    },
    reportLongTask(durationMs) {
      if (disposed || !adaptive || !Number.isFinite(durationMs) || durationMs <= 0) return;
      closeElapsedWindows(now());
      windowBusyMs += durationMs;
      evaluate();
    },
    updateNetworkHints(hints) {
      if (disposed) return;
      network = { ...hints };
      evaluate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) options.clearTimeout(timer);
      timer = null;
      listeners.clear();
    },
  };
}
