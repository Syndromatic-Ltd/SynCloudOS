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
  | "application-closed";

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
  /** The member that could not run, such as `"select"`. */
  readonly operation: string;
  /** Replaces the derived description of what is wrong with the resource. */
  readonly problem?: string;
  /** Replaces the suggested fix derived from the disposal reason. */
  readonly fix?: string;
  readonly disposal?: SynCloudOSLifecycleDisposal;
  readonly ownerStack?: string;
  readonly creationStack?: string;
}

const reasonDescriptions: Readonly<Record<SynCloudOSLifecycleDisposalReason, string>> = Object.freeze({
  explicit: "by an explicit dispose() call",
  "owner-unmounted": "because the component that owned it unmounted",
  "owner-signal-aborted": "because its owner signal aborted",
  "application-closed": "because the application session that owned it ended",
});

const reasonFixes: Readonly<Record<SynCloudOSLifecycleDisposalReason, string>> = Object.freeze({
  explicit: "Stop using it once it is disposed, or create a new one. A dispose() in a useEffect cleanup also runs during React StrictMode's effect replay while the component stays mounted; let a managed hook own the resource instead.",
  "owner-unmounted": "Do not keep a component-owned resource after its component unmounts; read it from the mounted component instead.",
  "owner-signal-aborted": "Create a new one, or give it an owner signal that lives as long as you use it.",
  "application-closed": "The application session has ended; create the resource again when the application opens.",
});

function isKnownReason(reason: string): reason is SynCloudOSLifecycleDisposalReason {
  return Object.hasOwn(reasonDescriptions, reason);
}

function describeProblem(disposal: SynCloudOSLifecycleDisposal | undefined): string {
  if (!disposal) return "is not active";
  return isKnownReason(disposal.reason)
    ? `was disposed ${reasonDescriptions[disposal.reason]}`
    : `was disposed (${disposal.reason})`;
}

/**
 * Thrown when code uses a framework resource outside its lifetime: after it
 * was disposed, or before its owner mounted. `code` is stable and safe to
 * branch on; the message explains the cause and suggests a fix.
 */
export class SynCloudOSLifecycleError extends Error {
  readonly code: string;
  readonly resource: Readonly<SynCloudOSLifecycleResource>;
  readonly operation: string;
  readonly disposal?: Readonly<SynCloudOSLifecycleDisposal>;
  /** Development builds only: the React owner stack of the creating component. */
  readonly ownerStack?: string;
  /** Development builds only: where the resource was created. */
  readonly creationStack?: string;

  constructor(options: SynCloudOSLifecycleErrorOptions) {
    const subject = options.resource.id === undefined
      ? options.resource.kind
      : `${options.resource.kind} "${options.resource.id}"`;
    const problem = options.problem ?? describeProblem(options.disposal);
    const fix = options.fix ?? (options.disposal && isKnownReason(options.disposal.reason)
      ? reasonFixes[options.disposal.reason]
      : undefined);
    super(`${subject} ${problem}, so ${options.operation}() cannot run.${fix ? ` ${fix}` : ""} [${options.code}]`);
    this.name = "SynCloudOSLifecycleError";
    this.code = options.code;
    this.resource = Object.freeze({ ...options.resource });
    this.operation = options.operation;
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

  error(options: { readonly code: string; readonly operation: string; readonly problem?: string; readonly fix?: string }): SynCloudOSLifecycleError {
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
