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

import { LUFXIndex } from "../../FX/LuminaFX/LUFXIndex";
import type { LUFXIndexBackend } from "../../FX/LuminaFX/LUFXIndexBackend";
import { LUFXQuery, type LUFXQueryDescriptor } from "../../FX/LuminaFX/LUFXQuery";
import { LUFXQueryPlanner, type LUFXQueryExecutionOptions, type LUFXQueryResultPage } from "../../FX/LuminaFX/LUFXQueryPlanner";
import { luminaRestrictionMatcher, type LuminaEligibilityRestriction } from "./luminaEligibilityRestriction";
import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import {
  LuminaIndexMaintenance,
  type LuminaIndexMaintenanceBackend,
} from "./LuminaIndexMaintenance";

export interface LuminaIndexBackendFactory {
  create(ownerKey: string, signal: AbortSignal): LUFXIndexBackend;
}

/** A backend that can filter by an eligibility restriction where its index
 * lives (the worker backend). */
interface LuminaRestrictedQueryBackend {
  queryRestricted(value: LUFXQueryDescriptor, restriction: LuminaEligibilityRestriction, options?: LUFXQueryExecutionOptions): Promise<LUFXQueryResultPage>;
}

function restrictedQueryBackend(backend: LUFXIndexBackend): LuminaRestrictedQueryBackend | null {
  const candidate = backend as LUFXIndexBackend & Partial<LuminaRestrictedQueryBackend>;
  return typeof candidate.queryRestricted === "function" ? candidate as LUFXIndexBackend & LuminaRestrictedQueryBackend : null;
}

function isMaintenanceBackend(backend: LUFXIndexBackend): backend is LUFXIndexBackend & LuminaIndexMaintenanceBackend {
  const candidate = backend as Partial<LuminaIndexMaintenanceBackend>;
  return typeof candidate.replaceAll === "function"
    && typeof candidate.eraseOwner === "function"
    && typeof candidate.diagnostics === "function";
}

/** Runtime owner for durable Lumina indexes. Owner identity is supplied by the
 * mounted host and never accepted from application data. */
export class LuminaIndexService {
  readonly #factory: LuminaIndexBackendFactory | null;
  readonly #indexes = new Set<LUFXIndex>();
  readonly #maintenance = new Set<LuminaIndexMaintenance>();
  #disposed = false;

  constructor(factory?: LuminaIndexBackendFactory | null) {
    this.#factory = factory ?? null;
  }

  createIndex(ownerKey: string, signal: AbortSignal): LUFXIndex {
    if (this.#disposed) throw new DOMException("Lumina index service is disposed.", "AbortError");
    signal.throwIfAborted();
    if (!this.#factory) throw new DOMException("Durable Lumina indexing is unavailable on this host.", "NotSupportedError");
    const backend = this.#factory.create(normalizeBundleIdentifier(ownerKey), signal);
    const index = new LUFXIndex(backend);
    this.#indexes.add(index);
    const rawDispose = index.dispose.bind(index);
    let released = false;
    const dispose = () => {
      if (released) return;
      released = true;
      this.#indexes.delete(index);
      signal.removeEventListener("abort", dispose);
      rawDispose();
    };
    Object.defineProperty(index, "dispose", { configurable: true, value: dispose });
    signal.addEventListener("abort", dispose, { once: true });
    if (signal.aborted) dispose();
    return index;
  }

  /**
   * Runs a query over the items of one owner's index that a restriction
   * admits. A backend that can filter where its index lives does so, and only
   * the result page crosses back; otherwise the snapshot is filtered and
   * planned here. Both plan over exactly the admitted items.
   */
  async queryRestricted(
    ownerKey: string,
    value: LUFXQuery | LUFXQueryDescriptor,
    restriction: LuminaEligibilityRestriction,
    options: LUFXQueryExecutionOptions & { readonly signal: AbortSignal },
  ): Promise<LUFXQueryResultPage> {
    const index = this.createIndex(ownerKey, options.signal);
    try {
      const capable = restrictedQueryBackend(index.backend);
      if (capable) {
        const descriptor = value instanceof LUFXQuery ? value.toJSON() : new LUFXQuery(value).toJSON();
        return await capable.queryRestricted(descriptor, restriction, options);
      }
      const snapshot = await index.snapshot({ signal: options.signal });
      options.signal.throwIfAborted();
      const admitted = Object.freeze(snapshot.items.filter(luminaRestrictionMatcher(restriction)));
      return new LUFXQueryPlanner().execute(Object.freeze({ ...snapshot, items: admitted }), value, options);
    } finally {
      index.dispose();
    }
  }

  createMaintenance(ownerKey: string, signal: AbortSignal): LuminaIndexMaintenance {
    if (this.#disposed) throw new DOMException("Lumina index service is disposed.", "AbortError");
    signal.throwIfAborted();
    if (!this.#factory) throw new DOMException("Durable Lumina indexing is unavailable on this host.", "NotSupportedError");
    const backend = this.#factory.create(normalizeBundleIdentifier(ownerKey), signal);
    if (!isMaintenanceBackend(backend)) {
      backend.dispose();
      throw new DOMException("Lumina index maintenance is unavailable on this host backend.", "NotSupportedError");
    }
    const maintenance = new LuminaIndexMaintenance(backend);
    this.#maintenance.add(maintenance);
    const rawDispose = maintenance.dispose.bind(maintenance);
    let released = false;
    const dispose = () => {
      if (released) return;
      released = true;
      this.#maintenance.delete(maintenance);
      signal.removeEventListener("abort", dispose);
      rawDispose();
    };
    Object.defineProperty(maintenance, "dispose", { configurable: true, value: dispose });
    signal.addEventListener("abort", dispose, { once: true });
    if (signal.aborted) dispose();
    return maintenance;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const index of [...this.#indexes]) index.dispose();
    this.#indexes.clear();
    for (const maintenance of [...this.#maintenance]) maintenance.dispose();
    this.#maintenance.clear();
  }
}
