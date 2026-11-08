/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NFXNDEFMessage } from "../NFXNDEFMessage";
import type { NFXNDEFStatus } from "../NFXNDEFStatus";
import { NFXReaderError } from "../NFXReaderError";
export interface NFCNativeTag {
  readonly isAvailable: boolean;
  queryNDEFStatus(): Promise<{ status: NFXNDEFStatus; capacity: number }>;
  readNDEF(): Promise<NFXNDEFMessage>;
  writeNDEF(message: NFXNDEFMessage): Promise<void>;
  writeLock(): Promise<void>;
}
export interface NFCEvents { messages(messages: readonly NFXNDEFMessage[]): void; tags(tags: readonly NFCNativeTag[]): void; error(error: unknown): void; }
export interface NFCNativeSession { connect(tag: NFCNativeTag): Promise<void>; restartPolling(): void; invalidate(): Promise<void>; }
export interface NFCAdapter { readonly readingAvailable: boolean; open(signal: AbortSignal, events: NFCEvents): Promise<NFCNativeSession>; }
export interface NFCPort extends NFCAdapter { readonly generation: number; assertAccess(generation: number, write?: boolean): void; bindAccessLifetime(generation: number): void; observeAccessLoss(listener: () => void): () => void; }
const ports = new WeakMap<object, NFCPort>(); const adapters = new WeakMap<object, NFCAdapter>();
export function associateNFCPort(context: object, port: NFCPort): void { ports.set(context, port); }
export function nfcPortFor(context: object): NFCPort { const port = ports.get(context); if (!port) throw new NFXReaderError("readerErrorUnsupportedFeature", "The NFC service is unavailable."); return port; }
export function associateNFCAdapter(environment: object, adapter: NFCAdapter): void { adapters.set(environment, adapter); }
export function nfcAdapterFor(environment: object): NFCAdapter | undefined { return adapters.get(environment); }
export function isNFCDenial(error: unknown): boolean { return typeof error === "object" && error !== null && "name" in error && (error.name === "NotAllowedError" || error.name === "SecurityError"); }
export function nfcFailure(error: unknown): NFXReaderError {
  if (error instanceof NFXReaderError) return error;
  const name = typeof error === "object" && error !== null && "name" in error ? error.name : "";
  const code = isNFCDenial(error) ? "readerErrorSecurityViolation" : name === "NotSupportedError" ? "readerErrorUnsupportedFeature" : name === "AbortError" ? "readerSessionInvalidationErrorUserCanceled" : "readerTransceiveErrorTagResponseError";
  return new NFXReaderError(code, error instanceof Error ? error.message : "The NFC operation failed.");
}
