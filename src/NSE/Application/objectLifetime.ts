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
  SynCloudOSLifecycleRecord,
  synCloudOSLifecycleSignalReason,
  type SynCloudOSLifecycleDisposalReason,
} from "../../SynCloudOS/nseRuntimeContracts";
import {
  nseDisposeFor,
  journalNSEAcquisition,
  OwnershipScope,
  registerOwnerScope,
  resolveOwnership,
  takePendingSelf,
  type NSEControllerOwnershipOptions,
  type OwnedObject,
} from "../Controllers/ownership";

interface ObjectOwnership {
  readonly scope: OwnershipScope;
  ownerScope: OwnershipScope | undefined;
  ownerSignal: AbortSignal | undefined;
}

const ownershipByObject = new WeakMap<object, ObjectOwnership>();
const objectByScope = new WeakMap<OwnershipScope, object>();
const scopeBySignal = new WeakMap<AbortSignal, OwnershipScope>();
const lifetimes = new WeakMap<object, ObjectLifetime>();

/** @internal Lifetime/context registry for authoring descriptors; no application getters. */
export function getNSEObjectLifetime(owner: object): ObjectLifetime | undefined { return lifetimes.get(owner); }

/**
 * @internal The target and its recorded lifetime owners, nearest first.
 * Uses framework records only, never application getters. No public barrel export.
 */
export function getNSEObjectOwners(target: object): readonly object[] {
  const owners: object[] = [];
  const visited = new Set<object>();
  let current: object | undefined = target;
  while (current && !visited.has(current)) {
    owners.push(current);
    visited.add(current);
    const ownership = ownershipByObject.get(current);
    const scope = ownership?.ownerScope ?? (ownership?.ownerSignal ? scopeBySignal.get(ownership.ownerSignal) : undefined);
    current = scope ? objectByScope.get(scope) : undefined;
  }
  return owners;
}

/**
 * The lifetime shared by applications, window controllers and view
 * controllers: its own ownership scope, the disposal record and the order in
 * which an object is torn down. Internal; the classes expose the parts they
 * document.
 *
 * An object constructed by the framework takes the scope the framework
 * prepared for it. Any other object (a view controller written as
 * `child = new DetailViewController()`) joins the owner that is constructing
 * it, or the one named by `owner` / `ownerSignal`.
 */
export class ObjectLifetime {
  readonly scope: OwnershipScope;
  readonly record: SynCloudOSLifecycleRecord;
  /** What the framework handed to the constructor, when it constructed the object. */
  readonly context: unknown;
  readonly constructedByFramework: boolean;
  readonly #listeners = new Set<(reason: SynCloudOSLifecycleDisposalReason) => void>();
  #reason: SynCloudOSLifecycleDisposalReason | undefined;
  #leaveOwner: (() => void) | undefined;
  readonly #ownership: ObjectOwnership;

  constructor(
    self: OwnedObject,
    kind: string,
    id: string,
    options: NSEControllerOwnershipOptions,
  ) {
    this.record = new SynCloudOSLifecycleRecord({ kind, id });
    const pending = takePendingSelf();
    let ownerScope: OwnershipScope | undefined;
    let ownerSignal: AbortSignal | undefined;
    if (pending) {
      pending.scope.assertLive();
      this.scope = pending.scope;
      this.context = pending.context;
      this.constructedByFramework = true;
      // The framework's window construction context is a data record. Do not
      // discover parentage through an application's overridable `app` getter.
      const app = pending.context && typeof pending.context === "object"
        ? Object.getOwnPropertyDescriptor(pending.context, "app")?.value as object | undefined
        : undefined;
      ownerScope = app ? ownershipByObject.get(app)?.scope : undefined;
    } else {
      this.scope = new OwnershipScope(kind, id);
      this.context = undefined;
      this.constructedByFramework = false;
      const owner = resolveOwnership(options, { kind, id });
      if (owner.scope) {
        this.#leaveOwner = owner.scope.adopt(self);
        ownerScope = owner.scope;
      } else if (owner.signal) {
        const signal = owner.signal;
        signal.throwIfAborted();
        ownerSignal = signal;
        const release = () => self[nseDisposeFor](synCloudOSLifecycleSignalReason(signal));
        signal.addEventListener("abort", release, { once: true });
        this.#leaveOwner = () => signal.removeEventListener("abort", release);
      }
    }
    this.#ownership = { scope: this.scope, ownerScope, ownerSignal };
    ownershipByObject.set(self, this.#ownership);
    objectByScope.set(this.scope, self);
    scopeBySignal.set(this.scope.signal, this.scope);
    registerOwnerScope(self, this.scope);
    lifetimes.set(self, this);
    journalNSEAcquisition(() => self[nseDisposeFor]("explicit"));
    if (pending) pending.object = self;
  }

  /** Moves the object under `scope`: it is disposed with that scope instead of its previous owner. */
  adoptBy(self: OwnedObject, scope: OwnershipScope): void {
    scope.assertLive();
    if (this.#ownership.ownerScope === scope) return;
    const leaveOwner = scope.adopt(self);
    this.#leaveOwner?.();
    this.#leaveOwner = leaveOwner;
    this.#ownership.ownerScope = scope;
    this.#ownership.ownerSignal = undefined;
  }

  get isDisposed(): boolean {
    return this.#reason !== undefined;
  }

  get reason(): SynCloudOSLifecycleDisposalReason | undefined {
    return this.#reason;
  }

  onDispose(listener: (reason: SynCloudOSLifecycleDisposalReason) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  /**
   * Disposes the object once: adopted objects (child view controllers) first,
   * then the object itself (`dispose` runs its own teardown), then every
   * controller it owns. Failures are collected so one cannot skip the rest.
   */
  dispose(reason: SynCloudOSLifecycleDisposalReason, dispose: () => void): void {
    if (this.#reason !== undefined) return;
    this.#reason = reason;
    this.record.markDisposed(reason);
    this.#leaveOwner?.();
    const failures: unknown[] = [];
    const attempt = (step: () => void) => {
      try { step(); } catch (error) { failures.push(error); }
    };
    attempt(() => this.scope.beginDisposal(reason));
    attempt(() => this.scope.disposeAdopted(reason));
    attempt(dispose);
    for (const listener of [...this.#listeners]) attempt(() => listener(reason));
    this.#listeners.clear();
    attempt(() => this.scope.release(reason));
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, `${this.record.resource.kind} failed to dispose.`);
  }
}
