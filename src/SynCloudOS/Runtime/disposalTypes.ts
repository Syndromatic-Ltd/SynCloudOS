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

import type { SynCloudOSRuntimeId } from "./runtimeInstanceTypes";

export type RuntimeDisposalState =
  | "running"
  | "quiescing"
  | "preparing"
  | "committing"
  | "disposed";

export interface RuntimeDisposalRequest {
  readonly reason: string;
  readonly inFlight?: "await" | "cancel";
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface RuntimeDisposalOperationLane {
  run<T>(request: {
    readonly id: string;
    execute(signal: AbortSignal): Promise<T>;
  }): Promise<T>;
  drain(): Promise<
    | { readonly status: "drained" }
    | { readonly status: "cancelled"; readonly reason: string }
  >;
}

export interface RuntimeDisposalPrepareContext {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly reason: string;
  readonly runtimeSignal: AbortSignal;
  readonly preparationSignal: AbortSignal;
  readonly deadlineAt: number | null;
  readonly operations: RuntimeDisposalOperationLane;
}

export type RuntimeDisposalPreparation =
  | {
      readonly status: "ready";
      commit(): void | Promise<void>;
      rollback?(): void | Promise<void>;
    }
  | {
      readonly status: "cancelled";
      readonly reason: string;
    };

export interface RuntimeDisposalParticipant {
  readonly id: string;
  prepare(
    context: RuntimeDisposalPrepareContext,
  ): RuntimeDisposalPreparation | Promise<RuntimeDisposalPreparation>;
}

export interface RuntimeDisposalRegistration {
  readonly participantId: string;
  unregister(): boolean;
}

export interface RuntimeDisposalError {
  readonly phase:
    | "quiesce"
    | "prepare"
    | "rollback"
    | "commit"
    | "core-teardown";
  readonly participantId?: string;
  readonly name: string;
  readonly message: string;
}

export type RuntimeDisposalResult =
  | {
      readonly status: "cancelled";
      readonly runtimeId: SynCloudOSRuntimeId;
      readonly reason: string;
      readonly participantId?: string;
      readonly errors: readonly RuntimeDisposalError[];
    }
  | {
      readonly status: "disposed";
      readonly runtimeId: SynCloudOSRuntimeId;
      readonly reason: string;
      readonly errors: readonly RuntimeDisposalError[];
    };
