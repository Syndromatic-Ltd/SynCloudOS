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

export type SettlementTerminalStatus = "completed" | "cancelled" | "failed";

export interface SettlementWorkDescriptor {
  readonly id: string;
  readonly owner: string;
  readonly kind: string;
  readonly label: string;
  readonly correlationId?: string;
  readonly startedAt?: number;
}

export interface SettlementTerminalRecord extends SettlementWorkDescriptor {
  readonly status: SettlementTerminalStatus;
  readonly endedAt: number;
  readonly reason?: string;
}

export interface SettlementState {
  readonly disposed?: boolean;
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly revision: number;
  readonly status: "pending" | "settled";
  readonly pending: readonly SettlementWorkDescriptor[];
  readonly excluded: readonly SettlementWorkDescriptor[];
  readonly recent: readonly SettlementTerminalRecord[];
}

export interface SettlementResult {
  /** Bounded diagnostic failures; quiescence does not erase failed work. */
  readonly failures?: readonly SettlementTerminalRecord[];
  readonly status: "settled" | "timed-out" | "cancelled";
  readonly pending: readonly SettlementWorkDescriptor[];
  readonly excluded: readonly SettlementWorkDescriptor[];
  readonly reason?: string;
}

export interface SettlementProducer {
  readonly id: string;
  inspect(): readonly SettlementWorkDescriptor[];
  inspectRecent?(): readonly SettlementTerminalRecord[];
  subscribe(listener: () => void): () => void;
}

export interface SettlementWorkInput {
  readonly owner: string;
  readonly kind: string;
  readonly label: string;
  readonly correlationId?: string;
}

export interface SettlementWorkHandle {
  readonly id: string;
  complete(): boolean;
  cancel(reason?: string): boolean;
  fail(error: unknown): boolean;
}

export interface SettlementExclusionHandle {
  readonly id: string;
  release(): boolean;
}

export interface SettlementRegistry {
  readonly runtimeId: SynCloudOSRuntimeId;
  begin(input: SettlementWorkInput): SettlementWorkHandle;
  exclude(input: SettlementWorkInput): SettlementExclusionHandle;
  registerProducer(producer: SettlementProducer): () => void;
  getState(): SettlementState;
  subscribe(listener: () => void): () => void;
  settled(options: { readonly timeoutMs: number; readonly signal?: AbortSignal }): Promise<SettlementResult>;
  dispose(): void;
}

export interface SettlementRegistryOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  readonly historyLimit?: number;
}
