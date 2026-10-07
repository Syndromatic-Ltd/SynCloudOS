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

export interface MIDIOutputPort {
  send(data: Uint8Array, timestampMilliseconds?: number): void;
  clear?(): void;
}

export interface MIDIOutputArbiterLease {
  readonly ownerKey: string;
  readonly exclusive: boolean;
  send(data: Uint8Array, timestampMilliseconds?: number): void;
  dispose(): void;
}

function checkedOwner(ownerKey: string): string {
  if (typeof ownerKey !== "string" || !ownerKey.trim() || /[\u0000-\u001f\u007f]/u.test(ownerKey))
    throw new TypeError("MIDI output arbiter owner key must be non-empty and contain no control characters.");
  return ownerKey;
}

export class MIDIOutputArbiter {
  readonly #port: MIDIOutputPort;
  readonly #leases = new Set<MIDIOutputArbiterLease>();
  #exclusive: MIDIOutputArbiterLease | null = null;
  #disposed = false;

  constructor(port: MIDIOutputPort) {
    if (!port || typeof port.send !== "function") throw new TypeError("MIDI output arbiter requires a send-capable port.");
    this.#port = port;
  }

  acquire(ownerKey: string, options: { readonly exclusive?: boolean } = {}): MIDIOutputArbiterLease {
    if (this.#disposed) throw new DOMException("MIDI output arbiter is disposed.", "AbortError");
    const owner = checkedOwner(ownerKey);
    const exclusive = options.exclusive === true;
    if (this.#exclusive || (exclusive && this.#leases.size > 0))
      throw new DOMException("MIDI output is already leased incompatibly with the requested exclusivity.", "InvalidStateError");
    let active = true;
    const lease: MIDIOutputArbiterLease = Object.freeze({
      ownerKey: owner,
      exclusive,
      send: (data: Uint8Array, timestampMilliseconds?: number) => {
        if (!active || this.#disposed || !this.#leases.has(lease)) throw new DOMException("MIDI output lease is no longer active.", "InvalidStateError");
        if (!(data instanceof Uint8Array)) throw new TypeError("MIDI output data must be Uint8Array.");
        if (timestampMilliseconds !== undefined && (!Number.isFinite(timestampMilliseconds) || timestampMilliseconds < 0))
          throw new RangeError("MIDI output timestamp must be a nonnegative finite millisecond value.");
        this.#port.send(new Uint8Array(data), timestampMilliseconds);
      },
      dispose: () => {
        if (!active) return;
        active = false;
        this.#leases.delete(lease);
        if (this.#exclusive === lease) {
          this.#exclusive = null;
          this.#port.clear?.();
        }
      },
    });
    this.#leases.add(lease);
    if (exclusive) this.#exclusive = lease;
    return lease;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const exclusive = this.#exclusive;
    this.#exclusive = null;
    this.#leases.clear();
    if (exclusive) this.#port.clear?.();
  }
}
