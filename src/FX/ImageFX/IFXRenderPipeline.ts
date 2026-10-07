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

import { IFXContext } from "./IFXContext";
import type { IFXImage } from "./IFXImage";
import type { IFXBackendRenderOptions, IFXRenderBackend } from "./IFXRenderBackend";
import type { IFXRenderDestination } from "./IFXRenderDestination";
import type { IFXRenderResult } from "./IFXRenderTask";

/** Selects a preferred backend only after a side-effect-free eligibility check. */
export class IFXRenderPipeline {
  readonly #fallback: IFXContext;
  readonly backends: readonly IFXRenderBackend[];
  readonly preferred: IFXRenderBackend | null;
  #disposed = false;

  constructor(preferred: IFXRenderBackend | readonly IFXRenderBackend[] | null = null, fallback = new IFXContext()) {
    const backends = preferred === null ? [] : Array.isArray(preferred) ? [...preferred] : [preferred as IFXRenderBackend];
    if (backends.some(backend => !backend || typeof backend.canRender !== "function" || typeof backend.render !== "function" || typeof backend.dispose !== "function"))
      throw new TypeError("IFXRenderBackend required.");
    if (!(fallback instanceof IFXContext)) throw new TypeError("IFXContext fallback required.");
    this.backends = Object.freeze(backends);
    this.preferred = this.backends[0] ?? null;
    this.#fallback = fallback;
    Object.freeze(this);
  }

  /** Always settles through the returned Promise. A backend that declines a
   * graph (ineligible format, over its job budget) passes it on; an error
   * raised while checking eligibility is a failure, not a reason to fall back. */
  render(image: IFXImage, destination: IFXRenderDestination, options: IFXBackendRenderOptions = {}): Promise<IFXRenderResult> {
    if (this.#disposed) return Promise.reject(new DOMException("Image render pipeline is disposed.", "AbortError"));
    try {
      options.signal?.throwIfAborted();
      for (const backend of this.backends)
        if (backend.canRender(image, destination)) return backend.render(image, destination, options);
      return this.#fallback.render(image, destination, options);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const backend of new Set(this.backends)) backend.dispose();
    this.#fallback.dispose();
  }
}
