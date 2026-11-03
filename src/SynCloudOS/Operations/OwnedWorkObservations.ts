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

/** Immutable coarse facts at existing owners, never scheduling/activation authority. */
export interface OwnedWorkSnapshot {
  readonly revision: number;
  readonly pending: number;
  readonly ended: boolean;
}
export interface OwnedWorkSource {
  getSnapshot(): OwnedWorkSnapshot;
  subscribe(listener: () => void): () => void;
}
const sources = new WeakMap<object, OwnedWorkSource>();

/** A facade or foreign owner without this instrumentation remains unknown. */
export function observeOwnedWork(owner: object): OwnedWorkSource | null {
  return sources.get(owner) ?? null;
}

/** Internal lifetime sampler, instantiated by the operation/lifecycle owners. */
export class OwnedWorkObservations {
  #snapshot: OwnedWorkSnapshot = Object.freeze({ revision: 0, pending: 0, ended: false });
  readonly #listeners = new Set<() => void>();
  readonly source: OwnedWorkSource = Object.freeze({
    getSnapshot: () => this.#snapshot,
    subscribe: (listener: () => void) => {
      this.#listeners.add(listener);
      return () => { this.#listeners.delete(listener); };
    },
  });
  bind(owner: object): void { sources.set(owner, this.source); }
  end(): void {
    if (!this.#snapshot.ended) this.#change(this.#snapshot.pending, true);
  }
  track<T>(run: () => T): T {
    this.#change(this.#snapshot.pending + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.#change(this.#snapshot.pending - 1);
    };
    try {
      const value = run();
      // Follow actual work, never the abort-raced receipt. Return the owner's
      // original value so observation cannot change cancellation/commit order.
      void Promise.resolve(value).then(release, release);
      return value;
    } catch (error) { release(); throw error; }
  }
  #change(pending: number, ended = this.#snapshot.ended): void {
    this.#snapshot = Object.freeze({ revision: this.#snapshot.revision + 1, pending, ended });
    for (const listener of [...this.#listeners]) {
      try { listener(); } catch { /* Observers cannot interrupt owned work. */ }
    }
  }
}
