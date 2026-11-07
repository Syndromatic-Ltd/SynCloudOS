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

import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export type OperationPhase =
  | "validating"
  | "will"
  | "committing"
  | "effects"
  | "did"
  | "completed"
  | "cancelled"
  | "failed"
  | "rolledBack";

export interface OperationValidation {
  readonly ok: boolean;
  readonly reason?: string;
  readonly code?: string;
}

export interface OperationIssue {
  readonly phase: "committing" | "effects" | "did";
  readonly message: string;
  readonly error?: OperationError;
}

export interface OperationSkippedWork {
  readonly phase: "effects" | "did";
  readonly index: number;
  readonly reason: string;
}

export interface OperationError {
  readonly code: string;
  readonly name: string;
  readonly message: string;
  readonly phase?: OperationPhase;
  readonly cause?: unknown;
}

export interface OperationContext<I = unknown, T = unknown> {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly operationId: string;
  readonly correlationId: string;
  readonly kind: string;
  readonly input: I;
  readonly signal: AbortSignal;
  readonly startedAt: number;
  checkpoint<T>(capture: () => T, restore: (checkpoint: T) => void): void;
  markCommitted(value: T): void;
  throwIfCancelled(): void;
  /** Cancels the operation from inside one of its own steps: the result reports `cancelled` with `reason`, and nothing commits. */
  cancel(reason?: string): never;
}

export type OperationHook<I, T = unknown> = (context: OperationContext<I, T>) => void | Promise<void>;
export type OperationEffect<I, T> = (context: OperationContext<I, T>, value: T) => void | Promise<void>;
export type OperationDidHook<I, T> = (context: OperationContext<I, T>, value: T) => void | Promise<void>;

export interface OperationPostCommitStep<TStep> {
  readonly run: TStep;
  readonly onError: "continue" | "stop";
}

export interface OperationDefinition<I, T> {
  readonly kind: string;
  readonly input: I;
  readonly timeoutMs?: number;
  readonly supersedeKey?: string;
  readonly correlationId?: string;
  readonly parentCorrelationId?: string;
  readonly reversible?: boolean;
  readonly validate?: (context: OperationContext<I>) => OperationValidation | Promise<OperationValidation>;
  readonly will?: readonly OperationHook<I, T>[];
  readonly commit: (context: OperationContext<I, T>) => T | Promise<T>;
  readonly effects?: readonly OperationPostCommitStep<OperationEffect<I, T>>[];
  readonly did?: readonly OperationPostCommitStep<OperationDidHook<I, T>>[];
}

export type OperationResult<T> =
  | {
      readonly status: "completed";
      readonly committed: true;
      readonly value: T;
      readonly postCommit: "completed" | "cancelled" | "failed";
      readonly issues: readonly OperationIssue[];
      readonly skipped: readonly OperationSkippedWork[];
    }
  | {
      readonly status: "cancelled";
      readonly committed: false;
      readonly reason: string;
    }
  | {
      readonly status: "failed";
      readonly committed: false;
      readonly phase: "validating" | "will" | "committing";
      readonly error: OperationError;
    }
  | {
      readonly status: "rolledBack";
      readonly committed: false;
      readonly phase: "committing";
      readonly error: OperationError;
    };

export interface OperationRecord {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly operationId: string;
  readonly correlationId: string;
  readonly parentCorrelationId?: string;
  readonly kind: string;
  readonly phase: OperationPhase;
  readonly committed: boolean;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly endedAt?: number;
  readonly status?: OperationResult<unknown>["status"];
  readonly reason?: string;
  readonly issues: readonly OperationIssue[];
}

export interface OperationHandle<T> {
  readonly operationId: string;
  readonly correlationId: string;
  readonly signal: AbortSignal;
  readonly result: Promise<OperationResult<T>>;
  cancel(reason?: string): void;
}

export interface OperationQuiesceLease {
  readonly id: string;
  drain(request: { readonly mode: "await" | "cancel"; readonly signal: AbortSignal; readonly timeoutMs?: number }): Promise<{ status: "drained" } | { status: "cancelled"; reason: string }>;
  createPreparationLane(participantId: string, signal: AbortSignal): {
    run<T>(request: { readonly id: string; execute(signal: AbortSignal): Promise<T> }): Promise<T>;
    drain(): Promise<{ status: "drained" } | { status: "cancelled"; reason: string }>;
  };
  resume(): boolean;
  commit(): boolean;
}

export interface OperationCoordinatorOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  now(): number;
  randomUUID(): string;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  readonly historyLimit?: number;
  record?(record: OperationRecord): void;
}

export interface OperationCoordinator {
  readonly runtimeId: SynCloudOSRuntimeId;
  run<I, T>(definition: OperationDefinition<I, T>): OperationHandle<T>;
  inspectPending(): OperationRecord[];
  inspectHistory(limit?: number): OperationRecord[];
  subscribe(listener: () => void): () => void;
  dispose(): void;
  quiesce(reason: string): OperationQuiesceLease;
}

export interface PresentationSettlementRequest {
  readonly operationId: string;
  readonly roles: readonly string[];
  readonly timeoutMs: number;
}

export type PresentationSettlementResult =
  | { readonly status: "completed"; readonly roles: readonly string[] }
  | { readonly status: "cancelled"; readonly reason: string; readonly pendingRoles: readonly string[] }
  | { readonly status: "timed-out"; readonly pendingRoles: readonly string[] };

export interface PresentationSettlementHandle {
  readonly id: string;
  readonly result: Promise<PresentationSettlementResult>;
  completeRole(role: string): boolean;
  cancel(reason?: string): void;
}

export interface PresentationSettlementInspectionRecord {
  readonly id: string;
  readonly operationId: string;
  readonly roles: readonly string[];
  readonly completedRoles: readonly string[];
}

export interface PresentationSettlementCoordinator {
  readonly runtimeId: SynCloudOSRuntimeId;
  begin(request: PresentationSettlementRequest): PresentationSettlementHandle;
  get(id: string): PresentationSettlementHandle | null;
  inspect(id: string): { readonly status: "pending" | "settled"; readonly roles?: readonly string[]; readonly completedRoles?: readonly string[] };
  inspectPending(id?: string): PresentationSettlementInspectionRecord[];
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
