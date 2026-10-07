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

import { afterEach, describe, expect, it } from "vitest";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";

const pendingDisposals: Array<{ dispose: () => Promise<unknown> }> = [];

afterEach(async () => {
  await Promise.all(pendingDisposals.splice(0).map(({ dispose }) => dispose()));
});

describe("runtime disposal", () => {
  it("rolls back a cancelled preparation and resumes the unchanged runtime", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createTestRuntime({ id: "runtime:dispose-cancel", environment });
    pendingDisposals.push({ dispose: () => runtime.dispose({ reason: "cleanup", inFlight: "cancel", timeoutMs: 100 }) });
    await runtime.boot({ initialPathname: "/" });
    const installedListeners = environment.activeListenerCount();
    expect(installedListeners).toBeGreaterThan(0);
    const runtimeSignal = runtime.signal;
    const trace: string[] = [];
    const firstRegistration = runtime.registerDisposalParticipant({
      id: "prepared-before-documents",
      prepare: () => ({
        status: "ready",
        commit: () => trace.push("commit"),
        rollback: () => trace.push("rollback"),
      }),
    });
    runtime.registerDisposalParticipant({
      id: "dirty-document-review",
      prepare: () => ({ status: "cancelled", reason: "Keep the dirty document open." }),
    });

    const result = await runtime.dispose({ reason: "test", inFlight: "await", timeoutMs: 1_000 });

    expect(result).toMatchObject({
      status: "cancelled",
      runtimeId: "runtime:dispose-cancel",
      participantId: "dirty-document-review",
      reason: "Keep the dirty document open.",
    });
    expect(runtimeSignal.aborted).toBe(false);
    expect(runtime.disposalState).toBe("running");
    expect(environment.activeListenerCount()).toBe(installedListeners);
    expect(trace).toEqual(["rollback"]);
    expect(firstRegistration.unregister()).toBe(true);
    expect(firstRegistration.unregister()).toBe(false);
    expect((await runtime.operations.run({
      kind: "after-cancelled-disposal",
      input: undefined,
      commit: () => "completed",
    }).result)).toMatchObject({ status: "completed", committed: true, value: "completed" });
  });

  it("drains admitted work, aborts after preparation, and commits teardown in LIFO order", async () => {
    const environment = createTestRuntimeEnvironment();
    const runtime = createTestRuntime({ id: "runtime:dispose-lifo", environment });
    pendingDisposals.push({ dispose: () => runtime.dispose({ reason: "cleanup", inFlight: "cancel", timeoutMs: 100 }) });
    const trace: string[] = [];
    let releaseWork!: () => void;
    const work = new Promise<void>((resolve) => { releaseWork = resolve; });
    const admitted = runtime.operations.run({
      kind: "admitted-work",
      input: undefined,
      commit: async () => {
        await work;
        return "work-done";
      },
    });

    for (const id of ["one", "two"]) {
      runtime.registerDisposalParticipant({
        id,
        prepare: ({ runtimeSignal }) => {
          expect(runtimeSignal.aborted).toBe(false);
          trace.push(`prepare:${id}`);
          return {
            status: "ready",
            commit: () => {
              expect(runtime.signal.aborted).toBe(true);
              trace.push(`commit:${id}`);
            },
            rollback: () => trace.push(`rollback:${id}`),
          };
        },
      });
    }

    const firstPromise = runtime.dispose({ reason: "test", inFlight: "await" });
    const secondPromise = runtime.dispose({ reason: "test", inFlight: "await" });
    expect(secondPromise).toBe(firstPromise);
    expect(runtime.disposalState).toBe("quiescing");
    releaseWork();
    await expect(admitted.result).resolves.toMatchObject({ status: "completed", committed: true });
    const result = await firstPromise;

    expect(result).toMatchObject({ status: "disposed", runtimeId: "runtime:dispose-lifo", errors: [] });
    expect(trace).toEqual(["prepare:one", "prepare:two", "commit:two", "commit:one"]);
    expect(runtime.disposalState).toBe("disposed");
    expect(runtime.signal.aborted).toBe(true);
    expect(runtime.operations.inspectPending()).toEqual([]);
    expect(runtime.presentationSettlements.inspectPending()).toEqual([]);
    expect(runtime.store.listenerCount()).toBe(0);
    expect(environment.activeListenerCount()).toBe(0);
    await expect(runtime.operations.run({ kind: "after-disposal", input: undefined, commit: () => true }).result)
      .resolves.toMatchObject({ status: "cancelled", committed: false, reason: "runtime-disposed" });
  });

  it("cancels preparation on timeout without aborting the live runtime", async () => {
    const runtime = createTestRuntime({ id: "runtime:dispose-timeout" });
    pendingDisposals.push({ dispose: () => runtime.dispose({ reason: "cleanup", inFlight: "cancel", timeoutMs: 100 }) });
    runtime.registerDisposalParticipant({
      id: "slow-participant",
      prepare: ({ preparationSignal }) => new Promise((resolve) => {
        preparationSignal.addEventListener("abort", () => resolve({ status: "cancelled", reason: "preparation-timeout" }), { once: true });
      }),
    });

    const result = await runtime.dispose({ reason: "timeout-test", timeoutMs: 1 });

    expect(result).toMatchObject({ status: "cancelled", participantId: "slow-participant" });
    expect(runtime.signal.aborted).toBe(false);
    expect(runtime.disposalState).toBe("running");
  });

  it("continues LIFO teardown after collecting commit errors", async () => {
    const runtime = createTestRuntime({ id: "runtime:dispose-errors" });
    pendingDisposals.push({ dispose: () => runtime.dispose({ reason: "cleanup", inFlight: "cancel", timeoutMs: 100 }) });
    const trace: string[] = [];
    for (const id of ["one", "two", "three"]) {
      runtime.registerDisposalParticipant({
        id,
        prepare: () => ({
          status: "ready",
          commit: () => {
            trace.push(`commit:${id}`);
            if (id === "two") throw new Error("two failed");
          },
        }),
      });
    }

    const result = await runtime.dispose("commit-errors");

    expect(result).toMatchObject({ status: "disposed" });
    expect(trace).toEqual(["commit:three", "commit:two", "commit:one"]);
    expect(result.errors).toEqual([
      expect.objectContaining({ phase: "commit", participantId: "two", message: "two failed" }),
    ]);
  });
  it("removes presentation report diagnostics from animation disposal", async () => {
    const runtime = createTestRuntime({ id: "runtime:dispose-animation-reports" });

    expect(runtime.animations).not.toHaveProperty("reportPresentationCompletion");
    expect(runtime.animations.diagnostics()).not.toHaveProperty("presentationReportCount");

    const result = await runtime.dispose({ reason: "test", inFlight: "cancel" });
    expect(result).toMatchObject({ status: "disposed" });
    expect(runtime.animations.diagnostics()).not.toHaveProperty("presentationReportCount");
  });
});
