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

import type { AUFXAudioPCMBuffer } from "./AUFXAudioPCMBuffer";
import type { AUFXClockObservation } from "./AUFXClockObservation";

export interface AUFXAudioChunk {
  readonly buffer: AUFXAudioPCMBuffer;
  readonly observation: AUFXClockObservation;
}

export interface AUFXAudioChunkStreamOptions {
  readonly chunkFrames?: number;
  readonly signal?: AbortSignal;
}

/** A single-consumer, cancellable stream of owned PCM chunks. */
export class AUFXAudioChunkStream implements AsyncIterable<AUFXAudioChunk> {
  readonly #controller = new AbortController();
  readonly #factory: (signal: AbortSignal) => AsyncGenerator<AUFXAudioChunk>;
  #claimed = false;

  constructor(factory: (signal: AbortSignal) => AsyncGenerator<AUFXAudioChunk>, signal?: AbortSignal) {
    this.#factory = factory;
    if (signal?.aborted) this.#controller.abort(signal.reason);
    else signal?.addEventListener("abort", () => this.#controller.abort(signal.reason), { once: true, signal: this.#controller.signal });
  }

  cancel(reason?: unknown) {
    if (!this.#controller.signal.aborted) this.#controller.abort(reason);
  }

  [Symbol.asyncIterator](): AsyncIterator<AUFXAudioChunk> {
    if (this.#claimed) throw new DOMException("Audio chunk stream already has a consumer.", "InvalidStateError");
    this.#claimed = true;
    return this.#factory(this.#controller.signal);
  }
}
