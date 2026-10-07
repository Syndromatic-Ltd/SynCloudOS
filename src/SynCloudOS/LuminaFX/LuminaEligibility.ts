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

import type { LUFXSearchableItem } from "../../FX/LuminaFX/LUFXSearchableItem";
import type { SynCloudOSPolicySubject } from "../PolicyKit/policyTypes";
import type { LuminaEligibilityRestriction } from "./luminaEligibilityRestriction";

export interface LuminaDomainProjection {
  readonly ownerAppId: string;
  readonly domain: string;
  readonly destinationAppId: string;
  readonly routeName: string;
}

export interface LuminaItemEligibilityInput {
  readonly ownerAppId: string;
  readonly domain: string;
  readonly itemId: string;
  readonly revision: string;
  readonly eligible: boolean;
  readonly notBeforeMs?: number;
  readonly notAfterMs?: number;
}

export interface LuminaEligibilityBinding extends LuminaDomainProjection {
  readonly itemId: string;
  readonly revision: string;
  readonly generation: number;
}

interface ItemEligibilityRecord {
  readonly ownerAppId: string;
  readonly domain: string;
  readonly itemId: string;
  readonly revision: string;
  readonly notBeforeMs?: number;
  readonly notAfterMs?: number;
}

const encoder = new TextEncoder();

function checkedIdentifier(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0 || encoder.encode(value).byteLength > 256 || /[\u0000-\u001f\u007f\s]/u.test(value)) {
    throw new TypeError(`${label} must be a non-empty identifier of at most 256 bytes with no whitespace/control characters.`);
  }
  return value;
}

function projectionKey(ownerAppId: string, domain: string): string {
  return `${ownerAppId}\u0000${domain}`;
}

function itemKey(ownerAppId: string, domain: string, itemId: string): string {
  return `${ownerAppId}\u0000${domain}\u0000${itemId}`;
}

export function luminaSubjectFingerprint(subject: SynCloudOSPolicySubject): string {
  const login = subject.loginSession;
  return JSON.stringify([
    subject.user.id,
    subject.role,
    subject.isAuthenticated,
    [...subject.capabilities].sort(),
    login?.synId ?? null,
    login?.status ?? null,
    login?.isAuthorised ?? null,
    login?.accessClass ?? null,
  ]);
}

/** Runtime-local live eligibility authority. Physical index deletion is not a
 * privacy boundary: generation and revision checks can revoke visibility first. */
export class LuminaEligibilityRegistry {
  readonly #projections = new Map<string, LuminaDomainProjection>();
  readonly #eligibleItems = new Map<string, ItemEligibilityRecord>();
  readonly #temporalStates = new Map<string, boolean>();
  readonly #listeners = new Set<(generation: number) => void>();
  readonly #now: () => number;
  #generation = 1;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  get generation(): number { return this.#generation; }

  registerProjection(input: LuminaDomainProjection): () => void {
    const projection = Object.freeze({
      ownerAppId: checkedIdentifier(input.ownerAppId, "Lumina owner application ID"),
      domain: checkedIdentifier(input.domain, "Lumina domain"),
      destinationAppId: checkedIdentifier(input.destinationAppId, "Lumina destination application ID"),
      routeName: checkedIdentifier(input.routeName, "Lumina route name"),
    });
    const key = projectionKey(projection.ownerAppId, projection.domain);
    if (this.#projections.has(key)) throw new TypeError(`Lumina projection ${projection.ownerAppId}/${projection.domain} is already registered.`);
    this.#projections.set(key, projection);
    this.#bump();
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      if (this.#projections.get(key) !== projection) return;
      this.#projections.delete(key);
      for (const [entryKey, entry] of this.#eligibleItems) {
        if (entry.ownerAppId === projection.ownerAppId && entry.domain === projection.domain) {
          this.#eligibleItems.delete(entryKey);
          this.#temporalStates.delete(entryKey);
        }
      }
      this.#bump();
    };
  }

  setItem(input: LuminaItemEligibilityInput): number {
    const ownerAppId = checkedIdentifier(input.ownerAppId, "Lumina owner application ID");
    const domain = checkedIdentifier(input.domain, "Lumina domain");
    const itemId = checkedIdentifier(input.itemId, "Lumina item ID");
    const revision = checkedIdentifier(input.revision, "Lumina item revision");
    const notBeforeMs = this.#checkedBoundary(input.notBeforeMs, "Lumina eligibility not-before time");
    const notAfterMs = this.#checkedBoundary(input.notAfterMs, "Lumina eligibility not-after time");
    if (notBeforeMs !== undefined && notAfterMs !== undefined && notAfterMs < notBeforeMs) {
      throw new TypeError("Lumina eligibility not-after time must not precede the not-before time.");
    }
    if (!this.#projections.has(projectionKey(ownerAppId, domain))) {
      throw new DOMException(`Lumina domain ${ownerAppId}/${domain} is not registered.`, "InvalidStateError");
    }
    const key = itemKey(ownerAppId, domain, itemId);
    if (input.eligible) {
      const current = this.#eligibleItems.get(key);
      if (
        current?.revision === revision
        && current.notBeforeMs === notBeforeMs
        && current.notAfterMs === notAfterMs
      ) return this.#generation;
      const next = Object.freeze({
        ownerAppId,
        domain,
        itemId,
        revision,
        ...(notBeforeMs === undefined ? {} : { notBeforeMs }),
        ...(notAfterMs === undefined ? {} : { notAfterMs }),
      });
      this.#eligibleItems.set(key, next);
      this.#temporalStates.set(key, this.#isTemporallyActive(next));
    } else if (!this.#eligibleItems.delete(key)) {
      return this.#generation;
    } else {
      this.#temporalStates.delete(key);
    }
    return this.#bump();
  }

  bindingFor(ownerAppId: string, item: LUFXSearchableItem): LuminaEligibilityBinding | null {
    if (item.visibility !== "eligible-donation") return null;
    const projection = this.#projections.get(projectionKey(ownerAppId, item.domain));
    if (!projection || projection.routeName !== item.activation.routeName) return null;
    const record = this.#eligibleItems.get(itemKey(ownerAppId, item.domain, item.id));
    if (!record || record.revision !== item.revision || !this.#isTemporallyActive(record)) return null;
    return Object.freeze({ ...projection, itemId: item.id, revision: item.revision, generation: this.#generation });
  }

  /** What `bindingFor` would bind for one owner now, as data an index can
   * filter by where it lives (see luminaEligibilityRestriction.ts). */
  restrictionFor(ownerAppId: string): LuminaEligibilityRestriction {
    const routes: (readonly [string, string])[] = [];
    for (const projection of this.#projections.values()) {
      if (projection.ownerAppId === ownerAppId) routes.push(Object.freeze([projection.domain, projection.routeName] as const));
    }
    const items: (readonly [string, string, string])[] = [];
    for (const record of this.#eligibleItems.values()) {
      if (record.ownerAppId !== ownerAppId || !this.#isTemporallyActive(record)) continue;
      items.push(Object.freeze([record.domain, record.itemId, record.revision] as const));
    }
    return Object.freeze({ items: Object.freeze(items), routes: Object.freeze(routes) });
  }

  owners(): readonly string[] {
    return Object.freeze([...new Set([...this.#projections.values()].map((projection) => projection.ownerAppId))].sort());
  }

  eraseOwner(ownerAppId: string): number {
    const owner = checkedIdentifier(ownerAppId, "Lumina owner application ID");
    let changed = false;
    for (const [key, projection] of this.#projections) {
      if (projection.ownerAppId !== owner) continue;
      this.#projections.delete(key);
      changed = true;
    }
    for (const [key, record] of this.#eligibleItems) {
      if (record.ownerAppId !== owner) continue;
      this.#eligibleItems.delete(key);
      this.#temporalStates.delete(key);
      changed = true;
    }
    return changed ? this.#bump() : this.#generation;
  }

  invalidatePolicy(): number {
    return this.#bump();
  }

  refreshTemporal(): number {
    let changed = false;
    for (const [key, record] of this.#eligibleItems) {
      const next = this.#isTemporallyActive(record);
      if (this.#temporalStates.get(key) === next) continue;
      this.#temporalStates.set(key, next);
      changed = true;
    }
    return changed ? this.#bump() : this.#generation;
  }

  subscribe(listener: (generation: number) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  #bump(): number {
    this.#generation += 1;
    for (const listener of [...this.#listeners]) listener(this.#generation);
    return this.#generation;
  }

  #checkedBoundary(value: number | undefined, label: string): number | undefined {
    if (value === undefined) return undefined;
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite when provided.`);
    return Math.trunc(value);
  }

  #isTemporallyActive(record: ItemEligibilityRecord): boolean {
    const now = this.#now();
    return (record.notBeforeMs === undefined || now >= record.notBeforeMs)
      && (record.notAfterMs === undefined || now <= record.notAfterMs);
  }
}
