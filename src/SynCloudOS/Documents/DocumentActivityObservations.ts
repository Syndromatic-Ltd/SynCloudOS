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

/** Coarse observations owned by DocumentController; no scheduling or mutation authority. */
export type DocumentActivityKind = 'admissions' | 'recovery' | 'cleanup' | 'editingParticipants' | 'editingSettlements' | 'editingCallbacks';
export interface DocumentActivitySnapshot {
  readonly revision: number;
  /** Counts are outstanding stages, not unique documents or user requests. */
  readonly admissions: number;
  readonly recovery: number;
  readonly cleanup: number;
  readonly editingParticipants: number;
  readonly editingSettlements: number;
  readonly editingCallbacks: number;
}
export interface DocumentActivitySource {
  getSnapshot(): DocumentActivitySnapshot;
  subscribe(listener: () => void): () => void;
}
export class DocumentActivityObservations {
  #snapshot: DocumentActivitySnapshot = Object.freeze({ revision: 0, admissions: 0, recovery: 0, cleanup: 0, editingParticipants: 0, editingSettlements: 0, editingCallbacks: 0 });
  readonly #listeners = new Set<() => void>();
  readonly source: DocumentActivitySource = Object.freeze({
    getSnapshot: () => this.#snapshot,
    subscribe: (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; },
  });
  begin = (kind: DocumentActivityKind): (() => void) => {
    this.#change(kind, 1);
    let ended = false;
    return () => { if (ended) return; ended = true; this.#change(kind, -1); };
  };
  track<T>(kind: DocumentActivityKind, run: () => T): T {
    const release = this.begin(kind);
    try {
      const result = run();
      // Observe actual settlement without replacing the owner's promise or racing abort.
      void Promise.resolve(result).then(release, release);
      return result;
    } catch (error) { release(); throw error; }
  }
  #change(kind: DocumentActivityKind, delta: number): void {
    this.#snapshot = Object.freeze({ ...this.#snapshot, revision: this.#snapshot.revision + 1, [kind]: this.#snapshot[kind] + delta });
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Observers cannot own work. */ } }
  }
}
