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

import { NSEPreferencesController, PreferencePersistenceError, type NSEControllerOwnership } from "../../Controllers";
import { NSEControllerLifetime } from "../../Controllers/controllerLifetime";
import type { NSEControllerOwnershipOptions } from "../../Controllers/ownership";

export interface NSESearchRecent { readonly id: string; readonly query: string; readonly usedAt: number }
export interface NSESearchPreferences { readonly recents: readonly NSESearchRecent[] }
export interface NSESearchFieldSnapshot { readonly revision: number; readonly recents: readonly NSESearchRecent[] }
export interface NSESearchFieldControllerOptions extends NSEControllerOwnershipOptions {
  readonly preferences?: NSEPreferencesController<NSESearchPreferences>;
  readonly maximumRecents?: number;
  readonly now?: () => number;
}
export interface NSESearchPreferencePersistence {
  getPreference<T>(key: string, fallback: T): T;
  setPreference<T>(key: string, value: T): boolean;
  removePreference(key: string): void;
}

const freezeRecent = (recent: NSESearchRecent): NSESearchRecent => Object.freeze({ id: recent.id, query: recent.query, usedAt: recent.usedAt });
const ownData = (value: object, key: keyof NSESearchRecent) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
};
const validRecentList = (value: unknown): value is readonly NSESearchRecent[] => {
  try {
    if (!Array.isArray(value) || value.length > 20) return false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "object" || descriptor.value === null) return false;
      const id = ownData(descriptor.value, "id"), query = ownData(descriptor.value, "query"), usedAt = ownData(descriptor.value, "usedAt");
      if (typeof id !== "string" || !id || typeof query !== "string" || !query.trim() || query.length > 256 || typeof usedAt !== "number" || !Number.isFinite(usedAt)) return false;
    }
    return true;
  } catch { return false; }
};

export function createNSESearchFieldPreferences(persistence: NSESearchPreferencePersistence, namespace = "nse.search-field.recents", ownership: NSEControllerOwnership = {}): NSEPreferencesController<NSESearchPreferences> {
  return new NSEPreferencesController<NSESearchPreferences>({
    ...ownership,
    namespace,
    schema: { version: 1, defaults: Object.freeze({ recents: Object.freeze([]) }), fields: { recents: { validate: validRecentList } }, migrations: Object.freeze([]) },
    adapter: {
      read: (key) => persistence.getPreference<unknown>(key, null),
      write: (key, value) => { if (!persistence.setPreference(key, value)) throw new PreferencePersistenceError(`Could not persist search recents for ${key}.`); },
      remove: (key) => persistence.removePreference(key),
    },
  });
}

export class NSESearchFieldController {
  readonly #preferences?: NSEPreferencesController<NSESearchPreferences>;
  readonly #maximum: number;
  readonly #now?: () => number;
  #sequence: number;
  readonly #listeners = new Set<() => void>();
  #snapshot: NSESearchFieldSnapshot;
  readonly #lifetime: NSEControllerLifetime;

  constructor(options: NSESearchFieldControllerOptions = {}) {
    this.#lifetime = new NSEControllerLifetime(options, { kind: "NSESearchFieldController", id: "search-field" });
    this.#preferences = options.preferences;
    this.#maximum = Math.max(1, Math.min(100, Math.trunc(options.maximumRecents ?? 20)));
    this.#now = options.now;
    const persisted = options.preferences?.getSnapshot().value.recents ?? [];
    const recents = Object.freeze(persisted.slice(0, this.#maximum).map(freezeRecent));
    this.#sequence = recents.reduce((maximum, item) => Math.max(maximum, item.usedAt), 0);
    this.#snapshot = Object.freeze({ revision: 0, recents });
    this.#lifetime.bind(() => this.dispose());
  }

  get isDisposed(): boolean { return this.#lifetime.isDisposed; }
  dispose(): void {
    if (!this.#lifetime.dispose()) return;
    this.#listeners.clear();
  }
  getSnapshot = (): NSESearchFieldSnapshot => this.#snapshot;
  getRecents(): readonly NSESearchRecent[] { return this.#snapshot.recents; }
  subscribe = (listener: () => void): (() => void) => { this.#lifetime.assertLive("subscribe"); this.#listeners.add(listener); return () => this.#listeners.delete(listener); };

  rememberQuery(query: string, options: { readonly privateMode?: boolean } = {}): boolean {
    this.#lifetime.assertLive("rememberQuery");
    if (options.privateMode) return false;
    if (typeof query !== "string") return false;
    const normalized = query.trim();
    if (!normalized || normalized.length > 256) return false;
    const usedAt = this.#now ? this.#now() : ++this.#sequence;
    if (!Number.isFinite(usedAt)) return false;
    return this.#replace(Object.freeze([{ id: normalized, query: normalized, usedAt }, ...this.#snapshot.recents.filter((item) => item.query !== normalized)].slice(0, this.#maximum).map(freezeRecent)));
  }

  remember(value: NSESearchRecent): boolean {
    this.#lifetime.assertLive("remember");
    if (typeof value !== "object" || value === null) return false;
    const id = ownData(value, "id"), query = ownData(value, "query"), usedAt = ownData(value, "usedAt");
    if (typeof id !== "string" || !id || typeof query !== "string" || !query.trim() || query.length > 256 || typeof usedAt !== "number" || !Number.isFinite(usedAt)) return false;
    return this.#replace(Object.freeze([freezeRecent({ id, query: query.trim(), usedAt }), ...this.#snapshot.recents.filter((item) => item.query !== query.trim())].slice(0, this.#maximum)));
  }

  clear(): boolean { this.#lifetime.assertLive("clear"); return this.#snapshot.recents.length ? this.#replace(Object.freeze([])) : false; }

  #replace(recents: readonly NSESearchRecent[]): boolean {
    if (recents.length === this.#snapshot.recents.length && recents.every((item, index) => item.id === this.#snapshot.recents[index]?.id && item.usedAt === this.#snapshot.recents[index]?.usedAt)) return false;
    this.#preferences?.set("recents", recents);
    this.#snapshot = Object.freeze({ revision: this.#snapshot.revision + 1, recents });
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* isolate subscribers */ } }
    return true;
  }
}
