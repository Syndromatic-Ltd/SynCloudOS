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

import {
  declareSynCloudOSLifecycleSignal,
  SynCloudOSLifecycleRecord,
  type SynCloudOSLifecycleDisposalReason,
} from "../../SynCloudOS/nseRuntimeContracts";

/**
 * Something that owns the controllers created with it: an application, a
 * window controller or a view controller. Pass it as `owner` to a controller
 * constructor, or pass `ownerSignal` directly.
 */
export interface NSEOwner {
  /** Aborts when the owner is disposed; `undefined` for {@link nseUnowned}. */
  readonly ownerSignal: AbortSignal | undefined;
}

/**
 * Ownership options every controller accepts. `ownerSignal` and `owner` are
 * alternatives; when neither is given the controller adopts the owner that is
 * constructing it, if any.
 */
export interface NSEControllerOwnershipOptions {
  /**
   * Disposes the controller when it aborts. Pass `SCOS.signal` (or the
   * application session signal) to make the application session the owner:
   * the controller is then disposed when the application closes, recording
   * `"application-closed"`; any other signal records `"owner-signal-aborted"`.
   * Construction throws the abort reason when the signal has already aborted.
   */
  readonly ownerSignal?: AbortSignal;
  /**
   * The object whose lifetime bounds the controller. Pass `this` from a
   * method of an application, window controller or view controller; the
   * controller is disposed with it. Pass {@link nseUnowned} for a controller
   * that you dispose yourself (a module singleton).
   */
  readonly owner?: NSEOwner;
}

/**
 * Marks a controller as deliberately unowned: the caller disposes it, or it
 * lives as long as the page. It is the only way to construct a controller
 * outside an owner while a class-based application is running.
 */
export const nseUnowned: NSEOwner = Object.freeze({ ownerSignal: undefined });

/** The internal protocol every owned object implements so its owner can
 * dispose it in order. */
export const nseDisposeFor: unique symbol = Symbol("nse.disposeFor");

export interface NSEOwnedObject {
  [nseDisposeFor](reason: SynCloudOSLifecycleDisposalReason): void;
}

/**
 * The lifetime of one application, window controller or view controller.
 * Controllers created while the framework constructs the object adopt its
 * signal; view controllers created the same way are disposed with it, before
 * the object itself.
 */
export class NSEOwnershipScope {
  readonly #abort = new AbortController();
  readonly #adopted = new Set<NSEOwnedObject>();
  #released = false;

  constructor(readonly kind: string, readonly id: string) {}

  get signal(): AbortSignal {
    return this.#abort.signal;
  }

  get isReleased(): boolean {
    return this.#released;
  }

  /** Disposes `object` with this scope. Returns a function that stops doing so. */
  adopt(object: NSEOwnedObject): () => void {
    this.#adopted.add(object);
    return () => { this.#adopted.delete(object); };
  }

  /** Disposes adopted objects, newest first. Failures are collected and thrown together. */
  disposeAdopted(reason: SynCloudOSLifecycleDisposalReason): void {
    const failures: unknown[] = [];
    for (const object of [...this.#adopted].reverse()) {
      this.#adopted.delete(object);
      try { object[nseDisposeFor](reason); } catch (error) { failures.push(error); }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Owned objects failed to dispose.");
  }

  /** Aborts the signal with `reason` recorded, disposing every controller it owns. */
  release(reason: SynCloudOSLifecycleDisposalReason): void {
    if (this.#released) return;
    this.#released = true;
    declareSynCloudOSLifecycleSignal(this.#abort.signal, reason);
    this.#abort.abort(new DOMException(`The ${this.kind} that owned this object was released.`, "AbortError"));
  }
}

let ambientScope: NSEOwnershipScope | null = null;
let pendingSelf: { readonly scope: NSEOwnershipScope; readonly context: unknown } | null = null;
let classApplicationsLive = 0;

const scopesByOwner = new WeakMap<object, NSEOwnershipScope>();

/** Associates the scope that `owner.ownerSignal` belongs to. */
export function registerOwnerScope(owner: object, scope: NSEOwnershipScope): void {
  scopesByOwner.set(owner, scope);
}

/**
 * Runs `construct` inside `scope`'s ambient slot: controllers and view
 * controllers constructed meanwhile are owned by `scope`. The first
 * application, window controller or view controller constructor to run takes
 * `scope` as its own, together with `context` (the framework's hand-off to
 * the object it is constructing).
 */
export function instantiateInOwnerScope<T>(scope: NSEOwnershipScope, construct: () => T, context?: unknown): T {
  const previousAmbient = ambientScope;
  const previousSelf = pendingSelf;
  ambientScope = scope;
  pendingSelf = { scope, context };
  try {
    return construct();
  } finally {
    ambientScope = previousAmbient;
    pendingSelf = previousSelf;
  }
}

/** Consumed by the base constructors of the framework's owned objects. */
export function takePendingSelf(): { readonly scope: NSEOwnershipScope; readonly context: unknown } | null {
  const taken = pendingSelf;
  pendingSelf = null;
  return taken;
}

/**
 * Marks a class-based application as running. While at least one is, a
 * controller constructed outside an owner and without `owner` or
 * `ownerSignal` throws `NSE_CONTROLLER_UNOWNED`.
 */
export function enterClassApplication(): () => void {
  classApplicationsLive += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    classApplicationsLive -= 1;
  };
}

export interface ResolvedOwnership {
  readonly signal: AbortSignal | undefined;
  /** The scope of the owning object, when it is one of the framework's. */
  readonly scope: NSEOwnershipScope | undefined;
}

/**
 * Resolves who owns a resource that is being constructed: `ownerSignal`, then
 * `owner`, then the ambient owner. Throws `NSE_CONTROLLER_UNOWNED` when there
 * is none and a class-based application is running.
 */
export function resolveOwnership(
  options: NSEControllerOwnershipOptions,
  resource: { readonly kind: string; readonly id: string },
): ResolvedOwnership {
  if (options.ownerSignal) return { signal: options.ownerSignal, scope: undefined };
  if (options.owner) {
    const signal = options.owner.ownerSignal;
    return { signal, scope: signal ? scopesByOwner.get(options.owner) : undefined };
  }
  if (ambientScope) return { signal: ambientScope.signal, scope: ambientScope };
  if (classApplicationsLive > 0) {
    throw new SynCloudOSLifecycleRecord(resource).error({
      code: "NSE_CONTROLLER_UNOWNED",
      operation: "constructor",
      access: "construct",
    });
  }
  return { signal: undefined, scope: undefined };
}
