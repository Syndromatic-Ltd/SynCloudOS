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

import type {
  OperationContext,
  OperationCoordinator,
  OperationCoordinatorOptions,
  OperationDefinition,
  OperationError,
  OperationHandle,
  OperationIssue,
  OperationQuiesceLease,
  OperationRecord,
  OperationResult,
  OperationSkippedWork,
} from "./operationTypes";

class OperationCancelled extends Error {
  readonly reason: string;
  readonly timeout: boolean;

  constructor(reason: string, timeout = false) {
    super(reason);
    this.name = "OperationCancelled";
    this.reason = reason;
    this.timeout = timeout;
  }
}

function normaliseError(error: unknown, phase: OperationRecord["phase"]): OperationError {
  const message = error instanceof Error ? error.message : String(error);
  const declaredCode = error && typeof error === "object" &&
    typeof (error as { readonly code?: unknown }).code === "string"
    ? (error as { readonly code: string }).code
    : null;
  return {
    code: declaredCode ?? "operation-failed",
    name: error instanceof Error ? error.name : "Error",
    message,
    phase,
    cause: error,
  };
}

function withAbort<T>(value: T | Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new OperationCancelled(String(signal.reason ?? "cancelled")));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(signal.reason instanceof Error ? signal.reason : new OperationCancelled(String(signal.reason ?? "cancelled"))));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(value).then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function createOperationCoordinator(options: OperationCoordinatorOptions): OperationCoordinator {
  const historyLimit = Math.max(1, options.historyLimit ?? 160);
  const pending = new Map<string, { handle: OperationHandle<unknown>; record: OperationRecord }>();
  const keyed = new Map<string, OperationHandle<unknown>>();
  const history: OperationRecord[] = [];
  const listeners = new Set<() => void>();
  let disposed = false;
  let quiescing = false;
  let activeLease: { id: string; committed: boolean; resumed: boolean } | null = null;
  const notify = () => {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* Diagnostic observers cannot affect operation truth. */ }
    }
  };

  const saveRecord = (record: OperationRecord) => {
    const immutable = { ...record, issues: [...record.issues] };
    const index = history.findIndex((item) => item.operationId === record.operationId);
    if (index >= 0) history[index] = immutable;
    else history.push(immutable);
    while (history.length > historyLimit) history.shift();
    options.record?.(immutable);
    notify();
  };

  const createImmediateCancellation = <T,>(reason: string): OperationHandle<T> => {
    const controller = new AbortController();
    controller.abort(new OperationCancelled(reason));
    const operationId = `${options.runtimeId}:operation:${options.randomUUID()}`;
    const correlationId = operationId;
    return {
      operationId,
      correlationId,
      signal: controller.signal,
      result: Promise.resolve({ status: "cancelled", committed: false, reason } as OperationResult<T>),
      cancel(nextReason = reason) {
        if (!controller.signal.aborted) controller.abort(new OperationCancelled(nextReason));
      },
    };
  };

  const run = <I, T>(definition: OperationDefinition<I, T>): OperationHandle<T> => {
    if (disposed) return createImmediateCancellation<T>("runtime-disposed");
    if (quiescing) return createImmediateCancellation<T>("runtime-quiescing");
    const operationId = `${options.runtimeId}:operation:${options.randomUUID()}`;
    const correlationId = definition.correlationId ?? `${options.runtimeId}:correlation:${options.randomUUID()}`;
    const controller = new AbortController();
    let cancelReason = "cancelled";
    let timedOut = false;
    let timeoutHandle: unknown = null;
    const startedAt = options.now();
    let currentRecord: OperationRecord = {
      runtimeId: options.runtimeId,
      operationId,
      correlationId,
      parentCorrelationId: definition.parentCorrelationId,
      kind: definition.kind,
      phase: "validating",
      committed: false,
      startedAt,
      updatedAt: startedAt,
      issues: [],
    };
    const checkpoints: Array<{ restore(): void }> = [];
    let commitEstablished = false;
    let committedValue: T | undefined;
    const update = (patch: Partial<OperationRecord>) => {
      currentRecord = { ...currentRecord, ...patch, updatedAt: options.now() };
      const admitted = pending.get(operationId);
      if (admitted) admitted.record = currentRecord;
      saveRecord(currentRecord);
    };
    const context: OperationContext<I, T> = {
      runtimeId: options.runtimeId,
      operationId,
      correlationId,
      kind: definition.kind,
      input: definition.input,
      signal: controller.signal,
      startedAt,
      checkpoint(capture, restore) {
        const snapshot = capture();
        checkpoints.push({ restore: () => restore(snapshot) });
      },
      markCommitted(value) {
        if (currentRecord.phase !== "committing") {
          throw new Error("The irreversible commit checkpoint is available only during the committing phase.");
        }
        if (commitEstablished) {
          throw new Error("The irreversible commit checkpoint may be established only once.");
        }
        commitEstablished = true;
        committedValue = value;
        update({ committed: true });
      },
      throwIfCancelled() {
        if (!controller.signal.aborted) return;
        throw controller.signal.reason instanceof Error
          ? controller.signal.reason
          : new OperationCancelled(cancelReason, timedOut);
      },
      cancel(reason = "cancelled") {
        cancel(reason);
        throw new OperationCancelled(reason);
      },
    };

    const cancel = (reason = "cancelled") => {
      cancelReason = reason;
      if (!controller.signal.aborted) controller.abort(new OperationCancelled(reason, timedOut));
    };
    if (typeof definition.timeoutMs === "number" && definition.timeoutMs >= 0) {
      const timeoutMs = definition.timeoutMs;
      timeoutHandle = options.setTimeout(() => {
        timedOut = true;
        cancel(`Operation timed out after ${timeoutMs}ms.`);
      }, timeoutMs);
    }

    let handle!: OperationHandle<T>;
    const execute = async (): Promise<OperationResult<T>> => {
      saveRecord(currentRecord);
      try {
        if (definition.validate) {
          update({ phase: "validating" });
          const validation = await withAbort(definition.validate(context), controller.signal);
          if (!validation.ok) {
            const error: OperationError = {
              code: validation.code ?? "validation-denied",
              name: "OperationValidationError",
              message: validation.reason ?? "Operation validation was denied.",
              phase: "validating",
            };
            update({ phase: "failed", status: "failed", committed: false, endedAt: options.now(), reason: error.message });
            return { status: "failed", committed: false, phase: "validating", error };
          }
        }
        context.throwIfCancelled();
        update({ phase: "will" });
        for (const hook of definition.will ?? []) {
          await withAbort(hook(context), controller.signal);
          context.throwIfCancelled();
        }
        context.throwIfCancelled();
        update({ phase: "committing" });
        let value: T;
        try {
          value = await definition.commit(context);
          if (!commitEstablished) context.markCommitted(value);
          else value = committedValue as T;
        } catch (error) {
          if (commitEstablished) {
            const cancelled = error instanceof OperationCancelled || controller.signal.aborted;
            const issues: OperationIssue[] = cancelled
              ? []
              : [{
                  phase: "committing",
                  message: error instanceof Error ? error.message : String(error),
                  error: normaliseError(error, "committing"),
                }];
            const reason = cancelled ? cancelReason : issues[0]?.message;
            const skipped: OperationSkippedWork[] = [
              ...(definition.effects ?? []).map((_step, index) => ({ phase: "effects" as const, index, reason: reason ?? "post-commit-failure" })),
              ...(definition.did ?? []).map((_step, index) => ({ phase: "did" as const, index, reason: reason ?? "post-commit-failure" })),
            ];
            update({
              phase: "completed",
              status: "completed",
              committed: true,
              endedAt: options.now(),
              issues,
              reason,
            });
            return {
              status: "completed",
              committed: true,
              value: committedValue as T,
              postCommit: cancelled ? "cancelled" : "failed",
              issues,
              skipped,
            };
          }
          if (error instanceof OperationCancelled) throw error;
          const operationError = normaliseError(error, "committing");
          if (definition.reversible && checkpoints.length > 0) {
            for (const checkpoint of [...checkpoints].reverse()) {
              try { checkpoint.restore(); } catch { /* rollback errors are retained by the caller's semantic state */ }
            }
            update({ phase: "rolledBack", status: "rolledBack", committed: false, endedAt: options.now(), reason: operationError.message });
            return { status: "rolledBack", committed: false, phase: "committing", error: operationError };
          }
          update({ phase: "failed", status: "failed", committed: false, endedAt: options.now(), reason: operationError.message });
          return { status: "failed", committed: false, phase: "committing", error: operationError };
        }
        const issues: OperationIssue[] = [];
        const skipped: OperationSkippedWork[] = [];
        const skip = (phase: OperationSkippedWork["phase"], start: number, reason: string) => {
          const steps = phase === "effects" ? definition.effects ?? [] : definition.did ?? [];
          for (let index = start; index < steps.length; index += 1) skipped.push({ phase, index, reason });
        };
        if (controller.signal.aborted) {
          skip("effects", 0, cancelReason);
          skip("did", 0, cancelReason);
          update({ phase: "completed", status: "completed", committed: true, endedAt: options.now(), reason: cancelReason });
          return { status: "completed", committed: true, value, postCommit: "cancelled", issues, skipped };
        }
        let postCommit: "completed" | "cancelled" | "failed" = "completed";
        let stopPostCommit = false;
        update({ phase: "effects" });
        const effects = definition.effects ?? [];
        for (let index = 0; index < effects.length; index += 1) {
          const effect = effects[index];
          if (controller.signal.aborted) {
            postCommit = "cancelled";
            skip("effects", index, cancelReason);
            skip("did", 0, cancelReason);
            stopPostCommit = true;
            break;
          }
          try {
            await withAbort(effect.run(context, value), controller.signal);
          } catch (error) {
            if (error instanceof OperationCancelled || controller.signal.aborted) {
              postCommit = "cancelled";
              skip("effects", index + 1, cancelReason);
              skip("did", 0, cancelReason);
              stopPostCommit = true;
              break;
            }
            postCommit = "failed";
            issues.push({ phase: "effects", message: error instanceof Error ? error.message : String(error), error: normaliseError(error, "effects") });
            if (effect.onError === "stop") {
              skip("effects", index + 1, "policy-stop");
              skip("did", 0, "policy-stop");
              stopPostCommit = true;
              break;
            }
          }
        }
        if (!stopPostCommit) {
          update({ phase: "did" });
          const didHooks = definition.did ?? [];
          for (let index = 0; index < didHooks.length; index += 1) {
            const hook = didHooks[index];
            if (controller.signal.aborted) {
              postCommit = "cancelled";
              skip("did", index, cancelReason);
              break;
            }
            try {
              await withAbort(hook.run(context, value), controller.signal);
            } catch (error) {
              if (error instanceof OperationCancelled || controller.signal.aborted) {
                postCommit = "cancelled";
                skip("did", index + 1, cancelReason);
                break;
              }
              postCommit = "failed";
              issues.push({ phase: "did", message: error instanceof Error ? error.message : String(error), error: normaliseError(error, "did") });
              if (hook.onError === "stop") {
                skip("did", index + 1, "policy-stop");
                break;
              }
            }
          }
        }
        const terminalReason = postCommit === "cancelled"
          ? cancelReason
          : postCommit === "failed"
            ? issues.at(-1)?.message
            : undefined;
        update({ phase: "completed", status: "completed", committed: true, endedAt: options.now(), issues, reason: terminalReason });
        return { status: "completed", committed: true, value, postCommit, issues, skipped };
      } catch (error) {
        if (error instanceof OperationCancelled || controller.signal.aborted) {
          const reason = timedOut ? `Operation timed out after ${definition.timeoutMs}ms.` : cancelReason;
          if (timedOut) {
            const timeoutError: OperationError = { code: "operation-timeout", name: "OperationTimeoutError", message: reason, phase: currentRecord.phase };
            const phase = currentRecord.phase === "validating" ? "validating" : currentRecord.phase === "committing" ? "committing" : "will";
            update({ phase: "failed", status: "failed", committed: false, endedAt: options.now(), reason });
            return { status: "failed", committed: false, phase, error: timeoutError };
          }
          update({ phase: "cancelled", status: "cancelled", committed: false, endedAt: options.now(), reason });
          return { status: "cancelled", committed: false, reason };
        }
        const operationError = normaliseError(error, currentRecord.phase);
        update({ phase: "failed", status: "failed", committed: false, endedAt: options.now(), reason: operationError.message });
        const phase = currentRecord.phase === "validating" ? "validating" : currentRecord.phase === "committing" ? "committing" : "will";
        return { status: "failed", committed: false, phase, error: operationError };
      }
    };

    const result = Promise.resolve().then(execute).finally(() => {
      if (timeoutHandle !== null) options.clearTimeout(timeoutHandle);
      pending.delete(operationId);
      if (definition.supersedeKey && keyed.get(definition.supersedeKey) === handle) keyed.delete(definition.supersedeKey);
      notify();
    });
    handle = { operationId, correlationId, signal: controller.signal, result, cancel };
    pending.set(operationId, { handle: handle as OperationHandle<unknown>, record: currentRecord });
    notify();
    if (definition.supersedeKey) {
      keyed.get(definition.supersedeKey)?.cancel("superseded");
      keyed.set(definition.supersedeKey, handle as OperationHandle<unknown>);
    }
    return handle;
  };

  const coordinator: OperationCoordinator = {
    runtimeId: options.runtimeId,
    run,
    inspectPending() {
      return Array.from(pending.values()).map(({ record }) => ({ ...record }));
    },
    inspectHistory(limit) {
      return typeof limit === "number" ? history.slice(-limit).map((record) => ({ ...record })) : history.map((record) => ({ ...record }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      disposed = true;
      for (const { handle } of pending.values()) handle.cancel("runtime-disposed");
      pending.clear();
      keyed.clear();
      notify();
      listeners.clear();
    },
    quiesce(reason) {
      if (activeLease && !activeLease.resumed) return createLease(activeLease.id);
      quiescing = true;
      const lease = { id: `${options.runtimeId}:quiesce:${options.randomUUID()}`, committed: false, resumed: false };
      activeLease = lease;
      return createLease(lease.id, reason);
    },
  };

  function createLease(id: string, _reason = "quiesce"): OperationQuiesceLease {
    const lease = activeLease;
    const lanePromises = new Set<Promise<unknown>>();
    return {
      id,
      async drain(request) {
        if (request.signal.aborted) {
          return { status: "cancelled", reason: request.signal.reason instanceof Error ? request.signal.reason.message : String(request.signal.reason ?? "quiesce-cancelled") };
        }
        if (request.mode === "cancel") {
          for (const { handle } of pending.values()) handle.cancel("runtime-quiescing");
        }
        const all = Promise.allSettled(Array.from(pending.values()).map(({ handle }) => handle.result));
        let timeout: unknown = null;
        let removeAbort: () => void = () => undefined;
        const cancellation = new Promise<{ status: "cancelled"; reason: string }>((resolve) => {
          const onAbort = () => resolve({
            status: "cancelled",
            reason: request.signal.reason instanceof Error ? request.signal.reason.message : String(request.signal.reason ?? "quiesce-cancelled"),
          });
          request.signal.addEventListener("abort", onAbort, { once: true });
          removeAbort = () => request.signal.removeEventListener("abort", onAbort);
        });
        const timeoutPromise = typeof request.timeoutMs === "number"
          ? new Promise<{ status: "cancelled"; reason: string }>((resolve) => {
            timeout = options.setTimeout(() => resolve({ status: "cancelled", reason: "operation-drain-timeout" }), Math.max(0, request.timeoutMs!));
          })
          : new Promise<never>(() => undefined);
        const winner = await Promise.race([all.then(() => ({ status: "drained" } as const)), cancellation, timeoutPromise]);
        if (timeout !== null) options.clearTimeout(timeout);
        removeAbort();
        return winner;
      },
      createPreparationLane(_participantId, signal) {
        let closed = false;
        const active = new Set<Promise<unknown>>();
        return {
          run<T>(request: { readonly id: string; execute(signal: AbortSignal): Promise<T> }) {
            if (closed) return Promise.reject(new Error("preparation lane is closed"));
            if (signal.aborted) return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("preparation lane is cancelled"));
            const promise = withAbort(request.execute(signal), signal);
            active.add(promise);
            lanePromises.add(promise);
            const cleanup = () => {
              active.delete(promise);
              lanePromises.delete(promise);
            };
            promise.then(cleanup, cleanup);
            return promise;
          },
          async drain() {
            closed = true;
            await Promise.allSettled(Array.from(active));
            return signal.aborted ? { status: "cancelled", reason: "preparation-cancelled" } : { status: "drained" };
          },
        };
      },
      resume() {
        if (!lease || lease.id !== id || lease.committed || lease.resumed) return false;
        lease.resumed = true;
        quiescing = false;
        return true;
      },
      commit() {
        if (!lease || lease.id !== id || lease.committed || lease.resumed) return false;
        lease.committed = true;
        return true;
      },
    };
  }

  return coordinator;
}
