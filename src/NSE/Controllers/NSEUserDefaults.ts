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

/**
 * Where an NSEUserDefaults keeps its values. In an application that is `SCOS.preferences`, which
 * SynCloudOS persists for it; `set` returns false when the store refuses the value.
 */
export interface NSEUserDefaultsStore {
  get(key: string): unknown;
  set(key: string, value: unknown): boolean | void | PromiseLike<void>;
  remove(key: string): void;
}

function volatileStore(): NSEUserDefaultsStore {
  const values = new Map<string, unknown>();
  return {
    get: (key) => values.get(key),
    set: (key, value) => { values.set(key, value); },
    remove: (key) => { values.delete(key); },
  };
}

/**
 * NSUserDefaults: a person's settings for an application, kept by key. `new NSEUserDefaults(SCOS.preferences)`
 * keeps them with the application's preferences; `new NSEUserDefaults()` keeps them in memory only, like
 * AppKit's volatile domain. NSEUserDefaultsController validates, migrates and binds a group of them.
 */
export class NSEUserDefaults {
  readonly #store: NSEUserDefaultsStore;

  constructor(store: NSEUserDefaultsStore = volatileStore()) {
    if (!store || typeof store.get !== "function" || typeof store.set !== "function" || typeof store.remove !== "function") {
      throw new TypeError("NSEUserDefaults needs a store with get, set and remove.");
    }
    this.#store = store;
  }

  /** NSUserDefaults.object(forKey:): null when nothing is stored. */
  object(forKey: string): unknown {
    const value = this.#store.get(forKey);
    return value === undefined ? null : value;
  }

  /** NSUserDefaults.set(_:forKey:). */
  set(value: unknown, forKey: string): void {
    if (this.#store.set(forKey, value) === false) throw new Error(`The defaults store refused the value for "${forKey}".`);
  }

  /** NSUserDefaults.removeObject(forKey:). */
  removeObject(forKey: string): void { this.#store.remove(forKey); }

  /** @internal The controller writes through the store directly so it can refuse asynchronous writes. */
  static storeOf(defaults: NSEUserDefaults): NSEUserDefaultsStore { return defaults.#store; }
}
