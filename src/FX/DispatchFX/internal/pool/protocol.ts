/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXQoS } from "../../DFXQoS";

export interface SerializedWorkerError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

export interface SerializedContinuation {
  readonly id: string;
  readonly workerValues: unknown[];
}

export interface PoolWorkRequest {
  readonly jobId: number;
  readonly closureId: string;
  readonly chunkURL: string;
  readonly captures: unknown[];
}

export interface PoolRunBatchMessage {
  readonly type: "run-batch";
  readonly jobs: PoolWorkRequest[];
}

export interface PoolResultMessage {
  readonly type: "result";
  readonly jobId: number;
  readonly workerValues: unknown[];
  readonly continuations?: SerializedContinuation[];
}

export interface PoolErrorMessage {
  readonly type: "error";
  readonly jobId: number;
  readonly error: SerializedWorkerError;
}

export type PoolRequestMessage = PoolRunBatchMessage;
export type PoolResponseMessage = PoolResultMessage | PoolErrorMessage;

export interface PoolWorkerLike {
  onmessage: ((event: MessageEvent<PoolResponseMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: PoolRequestMessage, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface PoolJob {
  readonly appId: string | null;
  readonly sessionKey?: object | null;
  readonly closureId: string;
  readonly chunkURL: string;
  readonly captures: unknown[];
  readonly qos: DFXQoS;
  readonly queueKey: object | string | null;
  onResult(values: unknown[], continuations?: SerializedContinuation[]): void;
  onError(error: Error): void;
}

export function serializeWorkerError(error: unknown): SerializedWorkerError {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message, stack: error.stack };
  }
  return { name: "Error", message: typeof error === "string" ? error : String(error) };
}

export function deserializeWorkerError(payload: SerializedWorkerError): Error {
  const error = new Error(payload.message);
  error.name = payload.name || "Error";
  if (payload.stack !== undefined) error.stack = payload.stack;
  return error;
}

/** Collect transferable ArrayBuffers from structured values without detaching SharedArrayBuffers. */
export function collectTransferables(
  value: unknown,
  seen = new Set<object>(),
  transfers = new Set<Transferable>(),
): Transferable[] {
  if (value === null || typeof value !== "object") return [...transfers];
  if (seen.has(value)) return [...transfers];
  seen.add(value);

  if (value instanceof ArrayBuffer) {
    transfers.add(value);
    return [...transfers];
  }
  if (typeof MessagePort !== "undefined" && value instanceof MessagePort) {
    transfers.add(value);
    return [...transfers];
  }
  if (typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas) {
    transfers.add(value);
    return [...transfers];
  }
  if (typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap) {
    transfers.add(value);
    return [...transfers];
  }
  if (ArrayBuffer.isView(value)) {
    const buffer = value.buffer;
    if (buffer instanceof ArrayBuffer) transfers.add(buffer);
    return [...transfers];
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTransferables(item, seen, transfers);
    return [...transfers];
  }
  if (value instanceof Map) {
    for (const [k, v] of value) {
      collectTransferables(k, seen, transfers);
      collectTransferables(v, seen, transfers);
    }
    return [...transfers];
  }
  if (value instanceof Set) {
    for (const item of value) collectTransferables(item, seen, transfers);
    return [...transfers];
  }
  for (const key of Object.keys(value)) {
    collectTransferables((value as Record<string, unknown>)[key], seen, transfers);
  }
  return [...transfers];
}

/** Freeze plain captured values inside a worker; leave binary views unfrozen as JS forbids freezing them. */
export function deepFreezeWorkerValue<T>(value: T, seen = new Set<object>()): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
  if (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer) return value;

  if (Array.isArray(value)) {
    for (const item of value) deepFreezeWorkerValue(item, seen);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value as object)) {
    deepFreezeWorkerValue((value as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}
