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

import type {
  NSENavigationStackRestorationSnapshot,
  NSENavigationStackSnapshot,
} from "./navigationTypes";

export interface NSENavigationStackControllerOptions {
  readonly id: string;
  readonly rootDestinationId?: string | null;
  readonly destinationIds: readonly string[];
  readonly onPush?: (destinationId: string, options: { readonly signal: AbortSignal }) => void | Promise<void>;
}

function abortError(reason?: unknown): DOMException {
  return reason instanceof DOMException && reason.name === "AbortError"
    ? reason
    : new DOMException("Navigation operation was cancelled.", "AbortError");
}

function requireId(value: string, label: string): string {
  if (!value.trim()) throw new TypeError(`${label} must not be empty.`);
  return value;
}

function awaitAbortable<T>(value: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError(signal.reason)));
    signal.addEventListener("abort", onAbort, { once: true });
    value.then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error)),
    );
  });
}

function freezeSnapshot(input: Omit<NSENavigationStackSnapshot, "path"> & { readonly path: readonly string[] }): NSENavigationStackSnapshot {
  return Object.freeze({ ...input, path: Object.freeze([...input.path]) });
}

/** Owns hierarchy path semantics only; it never creates or replaces content. */
export interface NSENavigationStackController {
  getSnapshot(): NSENavigationStackSnapshot;
  subscribe(listener: () => void): () => void;
  hasDestination(destinationId: string): boolean;
  push(destinationId: string, options?: { readonly signal?: AbortSignal }): Promise<void>;
  pop(): void;
  popToRoot(): void;
  restore(snapshot: NSENavigationStackRestorationSnapshot): void;
  dispose(): void;
}

export class NSENavigationStackController {
  readonly id: string;
  readonly #destinationIds: ReadonlySet<string>;
  readonly #rootDestinationId: string | null;
  readonly #onPush: NSENavigationStackControllerOptions["onPush"];
  readonly #listeners = new Set<() => void>();
  #path: readonly string[] = Object.freeze([]);
  #snapshot: NSENavigationStackSnapshot;
  #revision = 0;
  #disposed = false;
  #pending: AbortController | null = null;
  #intentRevision = 0;

  constructor(options: NSENavigationStackControllerOptions) {
    this.id = requireId(options.id, "Navigation stack id");
    const ids = options.destinationIds.map((id) => requireId(id, "Navigation destination id"));
    if (new Set(ids).size !== ids.length) throw new TypeError("Navigation stack destination ids must be unique.");
    this.#destinationIds = new Set(ids);
    this.#rootDestinationId = options.rootDestinationId === undefined || options.rootDestinationId === null
      ? null
      : requireId(options.rootDestinationId, "Navigation root destination id");
    if (this.#rootDestinationId !== null && !this.#destinationIds.has(this.#rootDestinationId)) {
      throw new RangeError("Navigation stack root must be declared as a destination.");
    }
    this.#onPush = options.onPush;
    this.#snapshot = this.#makeSnapshot();
  }

  getSnapshot = (): NSENavigationStackSnapshot => this.#snapshot;

  hasDestination(destinationId: string): boolean {
    return this.#destinationIds.has(destinationId);
  }

  subscribe(listener: () => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(listener);
    };
  }

  async push(destinationId: string, options: { readonly signal?: AbortSignal } = {}): Promise<void> {
    this.#assertLive();
    const id = requireId(destinationId, "Navigation destination id");
    if (!this.#destinationIds.has(id) || id === this.#rootDestinationId) {
      throw new RangeError(`Unknown navigation stack destination "${id}".`);
    }
    const intentRevision = this.#beginIntent();
    const operation = new AbortController();
    this.#pending = operation;
    const signal = options.signal ? AbortSignal.any([operation.signal, options.signal]) : operation.signal;
    try {
      await awaitAbortable(Promise.resolve(this.#onPush?.(id, { signal })), signal);
      if (this.#disposed || this.#intentRevision !== intentRevision || this.#pending !== operation || signal.aborted) {
        throw abortError(signal.reason);
      }
      this.#path = Object.freeze([...this.#path, id]);
      this.#publish();
    } finally {
      if (this.#pending === operation) this.#pending = null;
    }
  }

  pop(): void {
    this.#invalidatePendingIntent();
    if (this.#disposed || this.#path.length === 0) return;
    this.#path = Object.freeze(this.#path.slice(0, -1));
    this.#publish();
  }

  popToRoot(): void {
    this.#invalidatePendingIntent();
    if (this.#disposed || this.#path.length === 0) return;
    this.#path = Object.freeze([]);
    this.#publish();
  }

  restore(snapshot: NSENavigationStackRestorationSnapshot): void {
    this.#invalidatePendingIntent();
    this.#assertLive();
    const path = (snapshot?.version === undefined || snapshot.version === 1) && Array.isArray(snapshot?.path)
      ? snapshot.path.filter((id): id is string => typeof id === "string" && this.#destinationIds.has(id) && id !== this.#rootDestinationId)
      : [];
    const uniquePath = path.filter((id, index) => path.indexOf(id) === index);
    if (uniquePath.length === this.#path.length && uniquePath.every((id, index) => this.#path[index] === id)) return;
    this.#path = Object.freeze(uniquePath);
    this.#publish();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#invalidatePendingIntent();
    this.#disposed = true;
    this.#listeners.clear();
  }

  #assertLive(): void {
    if (this.#disposed) throw abortError();
  }

  #beginIntent(): number {
    this.#invalidatePendingIntent();
    return this.#intentRevision;
  }

  #invalidatePendingIntent(): void {
    this.#intentRevision += 1;
    const pending = this.#pending;
    this.#pending = null;
    pending?.abort(abortError());
  }

  #makeSnapshot(): NSENavigationStackSnapshot {
    const currentDestinationId = this.#path.at(-1) ?? this.#rootDestinationId;
    const backDestinationId = this.#path.length > 0
      ? this.#path.length > 1 ? this.#path.at(-2)! : this.#rootDestinationId
      : null;
    return freezeSnapshot({
      revision: this.#revision,
      id: this.id,
      rootDestinationId: this.#rootDestinationId,
      path: this.#path,
      currentDestinationId,
      backDestinationId,
    });
  }

  #publish(): void {
    if (this.#disposed) return;
    this.#revision += 1;
    this.#snapshot = this.#makeSnapshot();
    for (const listener of [...this.#listeners]) listener();
  }
}
