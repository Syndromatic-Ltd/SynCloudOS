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

import type { OperationCoordinator, OperationQuiesceLease } from "../Operations/operationTypes";
import type {
  RuntimeDisposalError,
  RuntimeDisposalParticipant,
  RuntimeDisposalPreparation,
  RuntimeDisposalRegistration,
  RuntimeDisposalRequest,
  RuntimeDisposalResult,
  RuntimeDisposalState,
  RuntimeDisposalPrepareContext,
} from "./disposalTypes";
import type { SynCloudOSRuntimeId } from "./runtimeInstanceTypes";

export interface RuntimeDisposalCoordinatorOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly runtimeController: AbortController;
  readonly operations: OperationCoordinator;
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  readonly coreParticipants: readonly RuntimeDisposalParticipant[];
  onStateChange(state: RuntimeDisposalState): void;
}

export interface RuntimeDisposalCoordinator {
  readonly state: RuntimeDisposalState;
  register(participant: RuntimeDisposalParticipant): RuntimeDisposalRegistration;
  dispose(request?: string | RuntimeDisposalRequest): Promise<RuntimeDisposalResult>;
}

function normaliseError(error: unknown, phase: RuntimeDisposalError["phase"], participantId?: string): RuntimeDisposalError {
  return {
    phase,
    participantId,
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  };
}

function signalReason(signal: AbortSignal, fallback: string): string {
  const reason = signal.reason;
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === "string" && reason.length > 0) return reason;
  return fallback;
}

function awaitSignal<T>(value: T | Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Operation cancelled."));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(signal.reason ?? new Error("Operation cancelled.")));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(value).then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error)),
    );
  });
}

function alwaysReady(id: string, dispose: () => void | Promise<void>): RuntimeDisposalParticipant {
  return {
    id,
    prepare: () => ({
      status: "ready",
      commit: dispose,
    }),
  };
}

export { alwaysReady };

export function createRuntimeDisposalCoordinator(options: RuntimeDisposalCoordinatorOptions): RuntimeDisposalCoordinator {
  const participants = new Map<string, RuntimeDisposalParticipant>();
  const coreIds = new Set(options.coreParticipants.map((participant) => participant.id));
  let currentState: RuntimeDisposalState = "running";
  let activePromise: Promise<RuntimeDisposalResult> | null = null;
  let successfulPromise: Promise<RuntimeDisposalResult> | null = null;
  let quiesceLease: OperationQuiesceLease | null = null;
  let controllerAborted = false;

  const setState = (state: RuntimeDisposalState) => {
    currentState = state;
    options.onStateChange(state);
  };

  const rollback = async (
    prepared: Array<{ participant: RuntimeDisposalParticipant; preparation: Extract<RuntimeDisposalPreparation, { status: "ready" }> }>,
    errors: RuntimeDisposalError[],
  ) => {
    for (const { participant, preparation } of [...prepared].reverse()) {
      if (!preparation.rollback) continue;
      try {
        await preparation.rollback();
      } catch (error) {
        errors.push(normaliseError(error, "rollback", participant.id));
      }
    }
  };

  const cancelled = async (
    reason: string,
    participantId: string | undefined,
    prepared: Array<{ participant: RuntimeDisposalParticipant; preparation: Extract<RuntimeDisposalPreparation, { status: "ready" }> }>,
    errors: RuntimeDisposalError[],
  ): Promise<RuntimeDisposalResult> => {
    setState("preparing");
    await rollback(prepared, errors);
    quiesceLease?.resume();
    quiesceLease = null;
    setState("running");
    return {
      status: "cancelled",
      runtimeId: options.runtimeId,
      reason,
      participantId,
      errors,
    };
  };

  const beginPreparationSignal = (request: RuntimeDisposalRequest) => {
    const controller = new AbortController();
    let timeoutHandle: unknown = null;
    let reason = request.reason;
    const abort = (nextReason: string) => {
      reason = nextReason;
      if (!controller.signal.aborted) controller.abort(nextReason);
    };
    const onCallerAbort = () => abort(signalReason(request.signal!, "runtime-disposal-cancelled"));
    if (request.signal) {
      if (request.signal.aborted) onCallerAbort();
      else request.signal.addEventListener("abort", onCallerAbort, { once: true });
    }
    if (typeof request.timeoutMs === "number") {
      const timeoutMs = Math.max(0, request.timeoutMs);
      timeoutHandle = options.setTimeout(() => abort("runtime-disposal-timeout"), timeoutMs);
    }
    return {
      controller,
      get reason() { return reason; },
      dispose() {
        if (timeoutHandle !== null) options.clearTimeout(timeoutHandle);
        request.signal?.removeEventListener("abort", onCallerAbort);
      },
    };
  };

  const perform = async (request: RuntimeDisposalRequest): Promise<RuntimeDisposalResult> => {
    const preparation = beginPreparationSignal(request);
    const errors: RuntimeDisposalError[] = [];
    const prepared: Array<{ participant: RuntimeDisposalParticipant; preparation: Extract<RuntimeDisposalPreparation, { status: "ready" }> }> = [];
    try {
      quiesceLease = options.operations.quiesce?.(request.reason) ?? null;
      if (!quiesceLease) {
        errors.push({ phase: "quiesce", name: "DisposalQuiesceError", message: "The runtime operation coordinator cannot quiesce." });
        return await cancelled("runtime-quiesce-unavailable", undefined, prepared, errors);
      }

      const drained = await quiesceLease.drain({
        mode: request.inFlight ?? "await",
        signal: preparation.controller.signal,
        timeoutMs: request.timeoutMs,
      });
      if (drained.status === "cancelled") {
        errors.push({ phase: "quiesce", name: "DisposalDrainError", message: drained.reason });
        return await cancelled(drained.reason, undefined, prepared, errors);
      }
      if (preparation.controller.signal.aborted) {
        return await cancelled(preparation.reason, undefined, prepared, errors);
      }

      setState("preparing");
      const allParticipants = [
        ...options.coreParticipants,
        ...participants.values(),
      ];
      for (const participant of allParticipants) {
        if (preparation.controller.signal.aborted) {
          return await cancelled(preparation.reason, participant.id, prepared, errors);
        }
        const lane = quiesceLease.createPreparationLane(participant.id, preparation.controller.signal);
        const context: RuntimeDisposalPrepareContext = {
          runtimeId: options.runtimeId,
          reason: request.reason,
          runtimeSignal: options.runtimeController.signal,
          preparationSignal: preparation.controller.signal,
          deadlineAt: typeof request.timeoutMs === "number" ? options.now() + Math.max(0, request.timeoutMs) : null,
          operations: lane,
        };
        let result: RuntimeDisposalPreparation;
        try {
          result = await awaitSignal(participant.prepare(context), preparation.controller.signal);
        } catch (error) {
          errors.push(normaliseError(error, "prepare", participant.id));
          return await cancelled(preparation.reason === request.reason ? signalReason(preparation.controller.signal, request.reason) : preparation.reason, participant.id, prepared, errors);
        }
        const laneResult = await lane.drain();
        if (laneResult.status === "cancelled") {
          errors.push({ phase: "prepare", participantId: participant.id, name: "DisposalPreparationCancelled", message: laneResult.reason });
          return await cancelled(laneResult.reason, participant.id, prepared, errors);
        }
        if (result.status === "cancelled") {
          return await cancelled(result.reason, participant.id, prepared, errors);
        }
        prepared.push({ participant, preparation: result });
      }

      if (preparation.controller.signal.aborted) {
        return await cancelled(preparation.reason, undefined, prepared, errors);
      }
      if (!quiesceLease.commit()) {
        errors.push({ phase: "quiesce", name: "DisposalQuiesceError", message: "The runtime operation coordinator rejected the disposal commit." });
        return await cancelled("runtime-quiesce-commit-failed", undefined, prepared, errors);
      }

      setState("committing");
      if (!controllerAborted) {
        controllerAborted = true;
        options.runtimeController.abort(request.reason);
      }
      for (const { participant, preparation: preparedParticipant } of [...prepared].reverse()) {
        try {
          await preparedParticipant.commit();
        } catch (error) {
          errors.push(normaliseError(error, "commit", participant.id));
        }
      }
      participants.clear();
      setState("disposed");
      const result: RuntimeDisposalResult = {
        status: "disposed",
        runtimeId: options.runtimeId,
        reason: request.reason,
        errors,
      };
      return result;
    } catch (error) {
      errors.push(normaliseError(error, "core-teardown"));
      return await cancelled("runtime-disposal-failed", undefined, prepared, errors);
    } finally {
      preparation.dispose();
    }
  };

  const coordinator: RuntimeDisposalCoordinator = {
    get state() { return currentState; },
    register(participant) {
      if (coreIds.has(participant.id)) throw new Error(`Disposal participant id ${participant.id} is reserved.`);
      if (currentState !== "running") throw new Error("Runtime disposal has already started.");
      if (participants.has(participant.id)) throw new Error(`Duplicate disposal participant ${participant.id}.`);
      participants.set(participant.id, participant);
      let active = true;
      return {
        participantId: participant.id,
        unregister() {
          if (!active) return false;
          active = false;
          return currentState === "running" && participants.delete(participant.id);
        },
      };
    },
    dispose(request: string | RuntimeDisposalRequest = "runtime disposal") {
      if (successfulPromise) return successfulPromise;
      if (activePromise) return activePromise;
      const normalized: RuntimeDisposalRequest = typeof request === "string" ? { reason: request } : request;
      setState("quiescing");
      activePromise = perform(normalized).then((result) => {
        if (result.status === "disposed") successfulPromise = activePromise;
        else activePromise = null;
        return result;
      }, (error) => {
        activePromise = null;
        throw error;
      });
      return activePromise;
    },
  };
  return coordinator;
}
