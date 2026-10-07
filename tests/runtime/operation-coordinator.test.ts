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
import { createTestRuntime } from "./helpers";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe("OperationCoordinator", () => {
  it("orders validation, will hooks, commit, effects, and did hooks", async () => {
    const trace: string[] = [];
    const runtime = createTestRuntime();
    const handle = runtime.operations.run({
      kind: "test.ordered",
      input: undefined,
      validate: () => { trace.push("validate"); return { ok: true }; },
      will: [
        () => { trace.push("will:one"); },
        async () => { trace.push("will:two"); },
      ],
      commit: () => { trace.push("commit"); return 42; },
      effects: [{ onError: "stop", run: () => { trace.push("effect"); } }],
      did: [{ onError: "stop", run: () => { trace.push("did"); } }],
    });

    await expect(handle.result).resolves.toMatchObject({
      status: "completed",
      committed: true,
      value: 42,
      postCommit: "completed",
    });
    expect(trace).toEqual(["validate", "will:one", "will:two", "commit", "effect", "did"]);
  });

  it("returns typed validation failure without committing", async () => {
    const runtime = createTestRuntime();
    const handle = runtime.operations.run({
      kind: "test.denied",
      input: undefined,
      validate: () => ({ ok: false, reason: "not-authorised" }),
      commit: () => { throw new Error("must not commit"); },
    });
    await expect(handle.result).resolves.toMatchObject({
      status: "failed",
      committed: false,
      phase: "validating",
      error: { code: "validation-denied" },
    });
  });

  it("cancels during will and skips semantic commit", async () => {
    const runtime = createTestRuntime();
    const entered = deferred<void>();
    const release = deferred<void>();
    let committed = false;
    const handle = runtime.operations.run({
      kind: "test.cancel",
      input: undefined,
      will: [async ({ signal }) => {
        entered.resolve();
        await Promise.race([release.promise, new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))]);
      }],
      commit: () => { committed = true; },
    });
    await entered.promise;
    handle.cancel("user-cancelled");
    release.resolve();
    await expect(handle.result).resolves.toMatchObject({ status: "cancelled", committed: false, reason: "user-cancelled" });
    expect(committed).toBe(false);
  });

  it("restores registered checkpoints when a reversible commit fails", async () => {
    const runtime = createTestRuntime();
    let state = "before";
    const handle = runtime.operations.run({
      kind: "test.rollback",
      input: undefined,
      reversible: true,
      commit: ({ checkpoint }) => {
        checkpoint(() => state, (value) => { state = value; });
        state = "mutated";
        throw new Error("commit failed");
      },
    });
    await expect(handle.result).resolves.toMatchObject({ status: "rolledBack", committed: false, phase: "committing" });
    expect(state).toBe("before");
  });

  it("times out owned work and supersedes older keyed operations", async () => {
    const runtime = createTestRuntime();
    const first = runtime.operations.run({
      kind: "test.keyed",
      input: 1,
      supersedeKey: "same",
      will: [async ({ signal }) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))],
      commit: () => 1,
    });
    const second = runtime.operations.run({ kind: "test.keyed", input: 2, supersedeKey: "same", commit: () => 2 });
    await expect(first.result).resolves.toMatchObject({ status: "cancelled", reason: "superseded" });
    await expect(second.result).resolves.toMatchObject({ status: "completed", value: 2 });

    const timed = runtime.operations.run({
      kind: "test.timeout",
      input: undefined,
      timeoutMs: 5,
      will: [async ({ signal }) => new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))],
      commit: () => undefined,
    });
    await expect(timed.result).resolves.toMatchObject({ status: "failed", error: { code: "operation-timeout" } });
  });

  it("keeps post-commit cancellation distinct from semantic cancellation", async () => {
    const runtime = createTestRuntime();
    let effectRan = false;
    const handle = runtime.operations.run({
      kind: "test.post-commit-cancel",
      input: undefined,
      commit: (context) => {
        context.signal.addEventListener("abort", () => undefined, { once: true });
        handle.cancel("after-commit");
        return "committed";
      },
      effects: [{ onError: "stop", run: () => { effectRan = true; } }],
    });
    await expect(handle.result).resolves.toMatchObject({ status: "completed", committed: true, postCommit: "cancelled" });
    expect(effectRan).toBe(false);
  });

  it("keeps an explicitly established semantic commit after cancellation is observed", async () => {
    const runtime = createTestRuntime();
    let state = "before";
    let handle!: ReturnType<typeof runtime.operations.run<undefined, string>>;

    handle = runtime.operations.run({
      kind: "test.irreversible-checkpoint",
      input: undefined,
      commit: (context) => {
        (context as typeof context & { markCommitted(value: string): void }).markCommitted?.("committed");
        state = "committed";
        handle.cancel("after-observable-mutation");
        context.throwIfCancelled();
        return "committed";
      },
      effects: [{ onError: "stop", run: () => { throw new Error("must be skipped"); } }],
      did: [{ onError: "stop", run: () => { throw new Error("must be skipped"); } }],
    });

    await expect(handle.result).resolves.toMatchObject({
      status: "completed",
      committed: true,
      value: "committed",
      postCommit: "cancelled",
      skipped: [
        { phase: "effects", index: 0, reason: "after-observable-mutation" },
        { phase: "did", index: 0, reason: "after-observable-mutation" },
      ],
    });
    expect(state).toBe("committed");
  });

  it("honours explicit continue and stop policy for post-commit work", async () => {
    const runtime = createTestRuntime();
    const trace: string[] = [];
    const result = await runtime.operations.run({
      kind: "test.post-commit-policy",
      input: undefined,
      commit: () => "committed",
      effects: [
        { onError: "continue", run: () => { trace.push("effect:continue-fails"); throw new Error("continue failure"); } },
        { onError: "continue", run: () => { trace.push("effect:after-continue"); } },
      ],
      did: [
        { onError: "stop", run: () => { trace.push("did:stop-fails"); throw new Error("stop failure"); } },
        { onError: "continue", run: () => { trace.push("did:skipped"); } },
      ],
    }).result;

    expect(result).toMatchObject({
      status: "completed",
      committed: true,
      postCommit: "failed",
      issues: [
        { phase: "effects", message: "continue failure" },
        { phase: "did", message: "stop failure" },
      ],
      skipped: [{ phase: "did", index: 1, reason: "policy-stop" }],
    });
    expect(trace).toEqual(["effect:continue-fails", "effect:after-continue", "did:stop-fails"]);
  });
});
