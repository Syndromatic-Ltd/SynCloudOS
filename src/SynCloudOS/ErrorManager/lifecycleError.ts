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

import * as React from "react";

/** Why a lifecycle-managed resource was released. Resource families may record
 * other reasons; these are the ones the framework itself records. */
export type SynCloudOSLifecycleDisposalReason =
  | "explicit"
  | "owner-unmounted"
  | "owner-signal-aborted"
  | "application-closed"
  | "window-closed"
  | "removed-from-parent";

export interface SynCloudOSLifecycleResource {
  /** The resource family, such as `"NSEArrayController"`. */
  readonly kind: string;
  /** The caller-supplied identity, when the resource has one. */
  readonly id?: string;
}

export interface SynCloudOSLifecycleDisposal {
  readonly reason: string;
  /** Development builds only: where the disposal happened. */
  readonly stack?: string;
}

export interface SynCloudOSLifecycleErrorOptions {
  /** Stable machine-readable code, such as `"NSE_CONTROLLER_DISPOSED"`. */
  readonly code: string;
  readonly resource: SynCloudOSLifecycleResource;
  /** The member that could not run, such as `"select"` or `"hidden"`. */
  readonly operation: string;
  /** How the member was reached: a method call, a property read or a property
   * write. Without it the message says the member could not be used. */
  readonly access?: "call" | "get" | "set" | "construct";
  /** A sentence describing a resource-specific cause, when the disposal
   * reason alone does not explain it. */
  readonly problem?: string;
  readonly disposal?: SynCloudOSLifecycleDisposal;
  readonly ownerStack?: string;
  readonly creationStack?: string;
}

const reasonDescriptions: Readonly<Record<SynCloudOSLifecycleDisposalReason, string>> = Object.freeze({
  explicit: "an explicit dispose() call",
  "owner-unmounted": "the component that owned it unmounted",
  "owner-signal-aborted": "its owner signal aborted",
  "application-closed": "the application session that owned it ended",
  "window-closed": "the window that owned it closed",
  "removed-from-parent": "its parent removed it",
});

/** A readable description of a recorded disposal reason, for diagnostics. */
export function describeSynCloudOSLifecycleDisposal(reason: string): string {
  return Object.hasOwn(reasonDescriptions, reason)
    ? reasonDescriptions[reason as SynCloudOSLifecycleDisposalReason]
    : reason;
}

function describeAttempt(options: SynCloudOSLifecycleErrorOptions): string {
  const member = `${options.resource.kind}.${options.operation}`;
  switch (options.access) {
    case "call": return `call ${member}()`;
    case "get": return `read ${member}`;
    case "set": return `set ${member}`;
    case "construct": return `create ${options.resource.kind}${options.resource.id === undefined ? "" : ` "${options.resource.id}"`}`;
    default: return `use ${member}`;
  }
}

/**
 * Thrown when code uses a framework resource outside its lifetime: after it
 * was disposed, or before its owner mounted. `code` is stable and safe to
 * branch on. The message states only what could not run; the disposal reason,
 * resource identity and stacks are structured fields, and the remediation is
 * the code's catalogue entry.
 */
export class SynCloudOSLifecycleError extends Error {
  readonly code: string;
  readonly resource: Readonly<SynCloudOSLifecycleResource>;
  readonly operation: string;
  readonly access?: "call" | "get" | "set" | "construct";
  readonly problem?: string;
  readonly disposal?: Readonly<SynCloudOSLifecycleDisposal>;
  /** Development builds only: the React owner stack of the creating component. */
  readonly ownerStack?: string;
  /** Development builds only: where the resource was created. */
  readonly creationStack?: string;

  constructor(options: SynCloudOSLifecycleErrorOptions) {
    super(options.access === "construct"
      ? `Cannot ${describeAttempt(options)} outside an owner.`
      : `Cannot ${describeAttempt(options)} ${options.disposal ? "after disposal" : "while it is inactive"}.`);
    this.name = "SynCloudOSLifecycleError";
    this.code = options.code;
    this.resource = Object.freeze({ ...options.resource });
    this.operation = options.operation;
    if (options.access !== undefined) this.access = options.access;
    if (options.problem !== undefined) this.problem = options.problem;
    if (options.disposal) this.disposal = Object.freeze({ ...options.disposal });
    if (options.ownerStack !== undefined) this.ownerStack = options.ownerStack;
    if (options.creationStack !== undefined) this.creationStack = options.creationStack;
  }
}

function developmentOwnerStack(): string | undefined {
  if (!import.meta.env.DEV) return undefined;
  // React ships captureOwnerStack in development builds only, so read it
  // through the namespace and check it exists before calling it.
  if (typeof React.captureOwnerStack !== "function") return undefined;
  try {
    return React.captureOwnerStack() ?? undefined;
  } catch {
    return undefined;
  }
}

const signalReasons = new WeakMap<AbortSignal, SynCloudOSLifecycleDisposalReason>();

/** Declares what the abort of a lifetime signal means, so resources owned by
 * it record that reason (for example `"application-closed"`) on disposal. */
export function declareSynCloudOSLifecycleSignal(signal: AbortSignal, reason: SynCloudOSLifecycleDisposalReason): void {
  signalReasons.set(signal, reason);
}

/** The disposal reason a resource should record when `signal` aborts. */
export function synCloudOSLifecycleSignalReason(signal: AbortSignal): SynCloudOSLifecycleDisposalReason {
  return signalReasons.get(signal) ?? "owner-signal-aborted";
}

/**
 * Records where a resource was created and why it was disposed, and builds
 * the matching {@link SynCloudOSLifecycleError}. Stacks are captured only in
 * development builds; production records hold the reason alone.
 */
export class SynCloudOSLifecycleRecord {
  readonly resource: Readonly<SynCloudOSLifecycleResource>;
  readonly creationStack: string | undefined;
  readonly ownerStack: string | undefined;
  #disposal: Readonly<SynCloudOSLifecycleDisposal> | undefined;

  constructor(resource: SynCloudOSLifecycleResource) {
    this.resource = Object.freeze({ ...resource });
    this.creationStack = import.meta.env.DEV ? new Error().stack : undefined;
    this.ownerStack = developmentOwnerStack();
  }

  get isDisposed(): boolean {
    return this.#disposal !== undefined;
  }

  get disposal(): Readonly<SynCloudOSLifecycleDisposal> | undefined {
    return this.#disposal;
  }

  /** Records the first disposal; later calls return `false` and change nothing. */
  markDisposed(reason: string): boolean {
    if (this.#disposal) return false;
    const stack = import.meta.env.DEV ? new Error().stack : undefined;
    this.#disposal = Object.freeze(stack === undefined ? { reason } : { reason, stack });
    return true;
  }

  error(options: Pick<SynCloudOSLifecycleErrorOptions, "code" | "operation" | "access" | "problem">): SynCloudOSLifecycleError {
    const ownerStack = this.ownerStack ?? developmentOwnerStack();
    return new SynCloudOSLifecycleError({
      ...options,
      resource: this.resource,
      ...(this.#disposal ? { disposal: this.#disposal } : {}),
      ...(ownerStack === undefined ? {} : { ownerStack }),
      ...(this.creationStack === undefined ? {} : { creationStack: this.creationStack }),
    });
  }
}
