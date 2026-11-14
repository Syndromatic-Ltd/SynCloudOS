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
  synCloudOSLifecycleSignalReason,
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
 * lives as long as the page. A controller with no runtime lifetime otherwise
 * needs an explicit owner outside construction in a class-based application.
 */
export const nseUnowned: NSEOwner = Object.freeze({ ownerSignal: undefined });

/** The internal protocol every owned object implements so its owner can
 * dispose it in order. */
export const nseDisposeFor: unique symbol = Symbol("nse.disposeFor");

export interface OwnedObject {
  [nseDisposeFor](reason: SynCloudOSLifecycleDisposalReason): void;
}

const scopesBySignal = new WeakMap<AbortSignal, OwnershipScope>();

/**
 * The lifetime of one application, window controller or view controller.
 * Controllers created while the framework constructs the object adopt its
 * signal; view controllers created the same way are disposed with it, before
 * the object itself.
 */
export class OwnershipScope {
  readonly #abort = new AbortController();
  readonly #authority = new AbortController();
  readonly #adopted = new Set<OwnedObject>();
  readonly #resources = new Map<object, (reason: SynCloudOSLifecycleDisposalReason) => void>();
  #released = false;
  #disposing = false;

  constructor(readonly kind: string, readonly id: string) {
    scopesBySignal.set(this.signal, this);
  }

  get signal(): AbortSignal {
    return this.#abort.signal;
  }

  get isReleased(): boolean {
    return this.#released;
  }

  /** @internal Revoked before child/owner/resource teardown begins. */
  get authoritySignal(): AbortSignal { return this.#authority.signal; }
  /** @internal Construction finalization follows the existing ownership tree. */
  get adoptedObjects(): readonly OwnedObject[] { return [...this.#adopted]; }

  /** @internal Keep resource disposal separate from structural children. */
  registerResource(object: object, dispose: (reason: SynCloudOSLifecycleDisposalReason) => void): () => void {
    this.assertLive();
    this.#resources.set(object, dispose);
    return () => { this.#resources.delete(object); };
  }

  /** @internal Ends publication authority without changing 6C teardown order. */
  beginDisposal(reason: SynCloudOSLifecycleDisposalReason): void {
    this.#disposing = true;
    declareSynCloudOSLifecycleSignal(this.#authority.signal, reason);
    this.#authority.abort(new DOMException(`The ${this.kind} owner is disposing.`, "AbortError"));
  }

  /** @internal Refuses new resources as soon as teardown starts. */
  assertLive(): void {
    this.signal.throwIfAborted();
    if (this.#disposing) throw new DOMException(`The ${this.kind} owner is disposing.`, "InvalidStateError");
  }

  /** Disposes `object` with this scope. Returns a function that stops doing so. */
  adopt(object: OwnedObject): () => void {
    this.assertLive();
    this.#adopted.add(object);
    return () => { this.#adopted.delete(object); };
  }

  /** Disposes adopted objects, newest first. Failures are collected and thrown together. */
  disposeAdopted(reason: SynCloudOSLifecycleDisposalReason): void {
    this.#disposing = true;
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
    this.beginDisposal(reason);
    this.#released = true;
    const failures: unknown[] = [];
    for (const [object, dispose] of [...this.#resources]) {
      this.#resources.delete(object);
      try { dispose(reason); } catch (error) { failures.push(error); }
    }
    declareSynCloudOSLifecycleSignal(this.#abort.signal, reason);
    this.#abort.abort(new DOMException(`The ${this.kind} that owned this object was released.`, "AbortError"));
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Owned resources failed to dispose.");
  }
}

let ambientScope: OwnershipScope | null = null;
interface PendingSelf {
  readonly scope: OwnershipScope;
  readonly context: unknown;
  /** The base constructor registers itself for rollback if a derived constructor throws. */
  object?: OwnedObject;
}
let pendingSelf: PendingSelf | null = null;
/** @internal Nested owner finalization waits until the synchronous construction boundary. */
export function hasNSEConstructionOwner(): boolean { return ambientScope !== null; }
let classApplicationsLive = 0;

const scopesByOwner = new WeakMap<object, OwnershipScope>();

/** Associates the scope that `owner.ownerSignal` belongs to. */
export function registerOwnerScope(owner: object, scope: OwnershipScope): void {
  scopesByOwner.set(owner, scope);
}

/** @internal Recorded scopes only; never evaluates application getters. */
export function getNSEOwnerScope(owner: object): OwnershipScope | undefined { return scopesByOwner.get(owner); }

interface ResourceRegistration {
  readonly signal: AbortSignal | undefined;
  active: boolean;
  dispose(reason: SynCloudOSLifecycleDisposalReason): void;
}
const resources = new WeakMap<object, ResourceRegistration>();
const acquisitionJournals: Array<Array<() => void>> = [];

/** @internal Records only acquisitions, so rollback never touches existing resources. */
export function journalNSEAcquisition(rollback: () => void): void {
  for (const journal of acquisitionJournals) journal.push(rollback);
}

/** @internal Data controllers and plain disposables share one identity registration. */
export function bindNSEOwnedResource(object: object, signal: AbortSignal | undefined, dispose: (reason: SynCloudOSLifecycleDisposalReason) => void): () => void {
  const existing = resources.get(object);
  if (existing?.active && existing.signal === signal) return () => {};
  if (existing?.active && existing.signal && !existing.signal.aborted) throw new TypeError("A resource already belongs to another live owner; implicit ownership transfer is forbidden.");
  signal?.throwIfAborted();
  let remove = () => {};
  const registration: ResourceRegistration = {
    signal, active: true,
    dispose(reason) {
      if (!registration.active) return;
      registration.active = false;
      remove();
      dispose(reason);
    },
  };
  const scope = signal ? scopesBySignal.get(signal) : undefined;
  if (scope) remove = scope.registerResource(object, reason => registration.dispose(reason));
  else if (signal) {
    const abort = () => registration.dispose(synCloudOSLifecycleSignalReason(signal));
    signal.addEventListener("abort", abort, { once: true });
    remove = () => signal.removeEventListener("abort", abort);
  }
  resources.set(object, registration);
  journalNSEAcquisition(() => registration.dispose("explicit"));
  return () => { registration.active = false; remove(); };
}

/** @internal An existing factory result must have the same live owner. */
export function isNSEOwnedResource(object: object, signal: AbortSignal): boolean {
  const registration = resources.get(object);
  if (!registration) return false;
  if (!registration.active) throw new TypeError("An owned factory cannot return an already disposed resource.");
  if (registration.signal === signal) return true;
  if (registration.signal) throw new TypeError("A resource already belongs to another owner; implicit ownership transfer is forbidden.");
  return false;
}

/** @internal Synchronous construction slot, deliberately separate from pendingSelf. */
export function constructNSEOwnedResource<T>(scope: OwnershipScope, construct: () => T): T {
  scope.assertLive();
  const previousAmbient = ambientScope;
  const previousSelf = pendingSelf;
  const journal: Array<() => void> = [];
  acquisitionJournals.push(journal);
  ambientScope = scope;
  pendingSelf = null;
  try { return construct(); }
  catch (error) {
    for (const rollback of journal.reverse()) { try { rollback(); } catch { /* Preserve the construction error; finish every release. */ } }
    throw error;
  } finally {
    acquisitionJournals.pop();
    ambientScope = previousAmbient;
    pendingSelf = previousSelf;
  }
}

/**
 * Runs `construct` inside `scope`'s ambient slot: controllers and view
 * controllers constructed meanwhile are owned by `scope`. The first
 * application, window controller or view controller constructor to run takes
 * `scope` as its own, together with `context` (the framework's hand-off to
 * the object it is constructing).
 */
export function instantiateInOwnerScope<T>(scope: OwnershipScope, construct: () => T, context?: unknown): T {
  scope.assertLive();
  const previousAmbient = ambientScope;
  const previousSelf = pendingSelf;
  ambientScope = scope;
  const pending: PendingSelf = { scope, context };
  pendingSelf = pending;
  try {
    return construct();
  } catch (error) {
    // A derived constructor may fail after super() acquired resources. Finish
    // every cleanup step, but never replace the original construction error.
    const reason = scope.kind === "NSEApplication" ? "application-closed" : "explicit";
    try { pending.object?.[nseDisposeFor](reason); } catch { /* Preserve error. */ }
    try { scope.disposeAdopted(reason); } catch { /* Preserve error. */ }
    try { scope.release(reason); } catch { /* Preserve error. */ }
    throw error;
  } finally {
    ambientScope = previousAmbient;
    pendingSelf = previousSelf;
  }
}

/** Consumed by the base constructors of the framework's owned objects. */
export function takePendingSelf(): PendingSelf | null {
  const taken = pendingSelf;
  pendingSelf = null;
  return taken;
}

/**
 * Marks a class-based application as running. While at least one is, a
 * controller constructed outside an owner, without explicit ownership or an
 * admitted runtime lifetime, throws `NSE_CONTROLLER_UNOWNED`.
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
  readonly scope: OwnershipScope | undefined;
}

/**
 * Resolves who owns a resource that is being constructed: `ownerSignal`, then
 * `owner`, then the ambient owner. Throws `NSE_CONTROLLER_UNOWNED` when there
 * is none and a class-based application is running. Presentation controllers
 * with an existing runtime lifetime may supply that signal as a final fallback.
 */
export function resolveOwnership(
  options: NSEControllerOwnershipOptions,
  resource: { readonly kind: string; readonly id: string },
  fallbackSignal?: AbortSignal,
): ResolvedOwnership {
  if (options.ownerSignal) {
    scopesBySignal.get(options.ownerSignal)?.assertLive();
    return { signal: options.ownerSignal, scope: undefined };
  }
  if (options.owner) {
    const signal = options.owner.ownerSignal;
    const scope = signal ? scopesByOwner.get(options.owner) : undefined;
    (scope ?? (signal ? scopesBySignal.get(signal) : undefined))?.assertLive();
    return { signal, scope };
  }
  if (ambientScope) {
    ambientScope.assertLive();
    return { signal: ambientScope.signal, scope: ambientScope };
  }
  if (fallbackSignal) {
    scopesBySignal.get(fallbackSignal)?.assertLive();
    fallbackSignal.throwIfAborted();
    return { signal: fallbackSignal, scope: undefined };
  }
  if (classApplicationsLive > 0) {
    throw new SynCloudOSLifecycleRecord(resource).error({
      code: "NSE_CONTROLLER_UNOWNED",
      operation: "constructor",
      access: "construct",
    });
  }
  return { signal: undefined, scope: undefined };
}
