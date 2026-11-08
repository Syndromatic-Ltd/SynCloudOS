/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXTimeInterval } from "../DFXTimeInterval";

const intervals = new WeakMap<DFXTimeInterval, number>();
export const maximumNanoseconds = Number.MAX_SAFE_INTEGER;

export function clientError(message: string): never {
  throw new Error(`BUG IN CLIENT OF LIBDISPATCH: ${message}`);
}
export function checkedInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) clientError(`${label} must be a safe integer`);
  return value;
}
export function initialiseInterval(interval: DFXTimeInterval, value: number): void {
  intervals.set(interval, value);
}
/** Private interval payload; deliberately absent from the public interval shape. */
export function nanoseconds(interval: DFXTimeInterval): number {
  const value = intervals.get(interval);
  if (value === undefined) clientError("invalid DispatchTimeInterval");
  return value;
}
/** Exact subtraction precedes the safe-number projection. */
export function safeDistance(value: bigint): number {
  const limit = BigInt(maximumNanoseconds);
  return value > limit ? maximumNanoseconds : value < -limit ? -maximumNanoseconds : Number(value);
}
