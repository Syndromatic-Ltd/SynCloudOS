/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { NWFXInterfaceType } from "../NWFXInterfaceType";
import type { NWFXPathStatus } from "../NWFXPathStatus";
import type { NWFXPathUnsatisfiedReason } from "../NWFXPathUnsatisfiedReason";
import { NWFXError } from "../NWFXError";
/** Host observations only. Omitted fields are unobserved, never false. */
export interface NetworkInterfaceSnapshot { readonly type: NWFXInterfaceType; readonly name: string; readonly index: number; }
export interface NetworkPathSnapshot {
  readonly status: NWFXPathStatus;
  readonly unsatisfiedReason?: NWFXPathUnsatisfiedReason;
  readonly interfaces?: readonly NetworkInterfaceSnapshot[];
  readonly interfaceTypes?: readonly NWFXInterfaceType[];
  readonly isExpensive?: boolean;
  readonly isConstrained?: boolean;
  readonly supportsIPv4?: boolean;
  readonly supportsIPv6?: boolean;
  readonly supportsDNS?: boolean;
}
export interface NetworkPathAdapter {
  currentPath(): NetworkPathSnapshot;
  subscribe(listener: (path: NetworkPathSnapshot) => void): { dispose(): void };
}
export interface NetworkPort extends NetworkPathAdapter {
  readonly generation: number;
  assertAccess(generation?: number): void;
  observeAccessLoss(listener: () => void): () => void;
}
const ports = new WeakMap<object, NetworkPort>();
export function associateNetworkPort(context: object, port: NetworkPort): void { ports.set(context, port); }
export function networkPortFor(context: object): NetworkPort {
  const port = ports.get(context);
  if (!port) throw NWFXError.posix(45, "Network monitoring is unavailable in this application session.");
  return port;
}
export function unavailableObservation(member: string): never {
  throw NWFXError.posix(45, `${member} is unavailable: the host cannot observe this network property.`);
}
export function networkFailure(error: unknown): NWFXError {
  if (error instanceof NWFXError) return error;
  return NWFXError.posix(error instanceof DOMException && error.name === "SecurityError" ? 13 : 5,
    error instanceof Error ? error.message : "Network host operation failed.");
}

/** Native observations belong to the environment but are never properties of its public model. */
const adapters = new WeakMap<object, NetworkPathAdapter>();
export function associateNetworkAdapter(environment: object, adapter: NetworkPathAdapter): void { adapters.set(environment, adapter); }
export function networkAdapterFor(environment: object): NetworkPathAdapter | undefined { return adapters.get(environment); }
