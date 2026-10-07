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

import type { LUFXIndexCheckpoint } from "../../FX/LuminaFX/LUFXIndexBackend";
import { LUFXSearchableItem, type LUFXSearchableItemJSON } from "../../FX/LuminaFX/LUFXSearchableItem";
import { LUFX_TOKENIZER_VERSION } from "../../FX/LuminaFX/LUFXTokenizer";

export type LuminaIndexMaintenanceState = "ready" | "rebuild-required" | "erased";

export interface LuminaIndexMaintenanceDiagnostics {
  readonly state: LuminaIndexMaintenanceState;
  readonly schemaVersion: number;
  readonly tokenizerVersion: string;
  readonly checkpoint: LUFXIndexCheckpoint;
  readonly itemCount: number;
  readonly approximateBytes: number;
}

export interface LuminaIndexReplacementMetadata {
  readonly tokenizerVersion: typeof LUFX_TOKENIZER_VERSION;
  readonly expectedCheckpoint?: LUFXIndexCheckpoint;
  readonly expectedState?: LuminaIndexMaintenanceState;
}

export interface LuminaIndexMaintenanceBackend {
  replaceAll(
    items: readonly LUFXSearchableItemJSON[],
    metadata: LuminaIndexReplacementMetadata,
    signal?: AbortSignal,
  ): Promise<LuminaIndexMaintenanceDiagnostics>;
  eraseOwner(signal?: AbortSignal): Promise<LuminaIndexMaintenanceDiagnostics>;
  diagnostics(signal?: AbortSignal): Promise<LuminaIndexMaintenanceDiagnostics>;
  dispose(): void;
}

export interface LuminaIndexMaintenanceOperationOptions {
  readonly signal?: AbortSignal;
}

export class LuminaIndexMaintenance {
  readonly #backend: LuminaIndexMaintenanceBackend;
  #disposed = false;

  constructor(backend: LuminaIndexMaintenanceBackend) {
    if (!backend
      || typeof backend.replaceAll !== "function"
      || typeof backend.eraseOwner !== "function"
      || typeof backend.diagnostics !== "function"
      || typeof backend.dispose !== "function") {
      throw new TypeError("Lumina index maintenance requires a complete maintenance backend.");
    }
    this.#backend = backend;
  }

  async rebuild(
    items: readonly LUFXSearchableItem[],
    options: LuminaIndexMaintenanceOperationOptions = {},
  ): Promise<LuminaIndexMaintenanceDiagnostics> {
    this.#assertActive(options.signal);
    if (!Array.isArray(items)) throw new TypeError("Lumina index rebuild items must be an array.");
    const validated = items.map((item) => {
      if (!(item instanceof LUFXSearchableItem)) {
        throw new TypeError("Lumina index rebuild items must be LUFXSearchableItem values.");
      }
      return item.toJSON();
    });
    validated.sort((left, right) => left.id.localeCompare(right.id));
    for (let index = 1; index < validated.length; index += 1) {
      if (validated[index - 1]?.id === validated[index]?.id) {
        throw new TypeError(`Lumina index rebuild contains duplicate item ID: ${validated[index]?.id}.`);
      }
    }
    this.#assertActive(options.signal);
    const baseline = await this.#backend.diagnostics(options.signal);
    this.#assertActive(options.signal);
    const result = await this.#backend.replaceAll(
      Object.freeze(validated),
      Object.freeze({
        tokenizerVersion: LUFX_TOKENIZER_VERSION,
        expectedCheckpoint: Object.freeze({ ...baseline.checkpoint }),
        expectedState: baseline.state,
      }),
      options.signal,
    );
    this.#assertActive(options.signal);
    return result;
  }

  async eraseOwner(options: LuminaIndexMaintenanceOperationOptions = {}): Promise<LuminaIndexMaintenanceDiagnostics> {
    this.#assertActive(options.signal);
    const result = await this.#backend.eraseOwner(options.signal);
    this.#assertActive(options.signal);
    return result;
  }

  async diagnostics(options: LuminaIndexMaintenanceOperationOptions = {}): Promise<LuminaIndexMaintenanceDiagnostics> {
    this.#assertActive(options.signal);
    const result = await this.#backend.diagnostics(options.signal);
    this.#assertActive(options.signal);
    return result;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#backend.dispose();
  }

  #assertActive(signal?: AbortSignal): void {
    if (this.#disposed) throw new DOMException("Lumina index maintenance is disposed.", "AbortError");
    signal?.throwIfAborted();
  }
}
