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

import type { CNFXContact } from "./CNFXContact";
import type { CNFXContactRequest, CNFXContactStore } from "./CNFXContactStore";

/** Owns a browser system picker request; no NSE or native view is rendered. */
export class CNFXContactPickerViewController {
  private readonly owner = new AbortController();
  private readonly request: CNFXContactRequest;
  private presenting = false;

  constructor(private readonly store: CNFXContactStore, request: CNFXContactRequest = {}) {
    this.request = Object.freeze({ ...request, properties: request.properties ? Object.freeze([...request.properties]) : undefined });
  }

  async present(): Promise<readonly CNFXContact[]> {
    this.owner.signal.throwIfAborted();
    this.request.signal?.throwIfAborted();
    if (this.presenting) throw new DOMException("The contact picker is already presented.", "InvalidStateError");
    this.presenting = true;
    const operation = new AbortController();
    return new Promise<readonly CNFXContact[]>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        this.presenting = false;
        this.owner.signal.removeEventListener("abort", abort);
        this.request.signal?.removeEventListener("abort", abort);
      };
      const fail = (error: unknown) => { if (settled) return; settled = true; cleanup(); reject(error); };
      const abort = () => {
        const reason = this.owner.signal.aborted ? this.owner.signal.reason : this.request.signal?.reason;
        fail(reason);
        operation.abort(reason);
      };
      this.owner.signal.addEventListener("abort", abort, { once: true });
      this.request.signal?.addEventListener("abort", abort, { once: true });
      try {
        this.store.requestAccess({ ...this.request, signal: operation.signal }).then(contacts => {
          if (settled) return;
          settled = true; cleanup(); resolve(contacts);
        }, fail);
      } catch (error) { fail(error); }
    });
  }

  /** Cancels app work; the browser may leave its system dialog visible. */
  dispose(): void {
    if (!this.owner.signal.aborted) this.owner.abort(new DOMException("The contact picker was disposed.", "AbortError"));
  }
}
