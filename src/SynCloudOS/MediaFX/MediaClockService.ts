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

import { MEFXMonotonicClock, type MEFXClock } from "../../FX/MediaFX/MEFXClock";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export class MediaClockService {
  readonly #clock: MEFXMonotonicClock | null;
  #disposed = false;

  constructor(
    readonly runtimeId: SynCloudOSRuntimeId,
    monotonicNowSeconds: (() => number) | undefined,
  ) {
    this.#clock = monotonicNowSeconds
      ? new MEFXMonotonicClock(`runtime:${runtimeId}:monotonic`, 0.001, monotonicNowSeconds)
      : null;
  }

  get available(): boolean {
    return !this.#disposed && this.#clock !== null;
  }

  observeClock(): MEFXClock {
    if (this.#disposed) throw new DOMException("The runtime media clock service is disposed.", "AbortError");
    if (!this.#clock) throw new DOMException("This runtime has no monotonic media clock.", "NotSupportedError");
    return this.#clock;
  }

  invalidate(): void {
    if (this.#disposed) return;
    this.#clock?.invalidate();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clock?.dispose();
  }
}
