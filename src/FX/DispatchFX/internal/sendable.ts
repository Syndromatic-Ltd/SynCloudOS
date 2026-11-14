/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export const dfxSendableSymbol = Symbol.for("syncloudos.dfx.sendable");
export const dfxContinuationSymbol = Symbol.for("syncloudos.dfx.continuation");

export interface SendableContinuationHandle {
  readonly id: string;
  readonly fn: (...workerValues: unknown[]) => unknown;
}

export interface SendableMetadata {
  readonly id: string;
  readonly getCaptures: () => unknown[];
  readonly continuations?: readonly SendableContinuationHandle[];
}

export type SendableFunction<T extends Function = Function> = T & {
  [dfxSendableSymbol]?: SendableMetadata;
};

/** Attach worker closure metadata directly onto `fn` without wrapping or altering calls. */
export function __dfxSendable<T extends Function>(
  fn: T,
  id: string,
  getCaptures: () => unknown[],
  continuations?: readonly SendableContinuationHandle[],
): T {
  Object.defineProperty(fn, dfxSendableSymbol, {
    value: { id, getCaptures, continuations } satisfies SendableMetadata,
    configurable: true,
    enumerable: false,
    writable: true,
  });
  return fn;
}

/** Construct a main-thread continuation handle captured at dispatch time. */
export function __dfxContinuation(
  id: string,
  fn: (...workerValues: unknown[]) => unknown,
): SendableContinuationHandle {
  const handle: SendableContinuationHandle = { id, fn };
  Object.defineProperty(handle, dfxContinuationSymbol, {
    value: true,
    enumerable: false,
  });
  return handle;
}

export function sendableMetadataOf(fn: unknown): SendableMetadata | undefined {
  if (typeof fn !== "function") return undefined;
  return (fn as SendableFunction)[dfxSendableSymbol];
}
