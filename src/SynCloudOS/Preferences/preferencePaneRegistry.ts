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

import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export interface PreferencePaneDescriptor<THost = unknown, TPresentation = unknown> {
  readonly id: string;
  readonly bundleIdentifier: string;
  readonly order: number;
  create(host: THost): TPresentation;
}

export interface PreferencePaneRegistration {
  readonly id: string;
  dispose(): void;
}

export interface PreferencePaneRegistry {
  readonly runtimeId: SynCloudOSRuntimeId;
  getSnapshot(): readonly PreferencePaneDescriptor[];
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const systemRegistrars = new WeakMap<PreferencePaneRegistry, (descriptor: PreferencePaneDescriptor) => PreferencePaneRegistration>();

function prepareDescriptor(descriptor: PreferencePaneDescriptor): Readonly<PreferencePaneDescriptor> {
  if (typeof descriptor !== "object" || descriptor === null) throw new TypeError("Preference pane descriptors must be data-only objects.");
  const read = (key: keyof PreferencePaneDescriptor) => {
    const own = Object.getOwnPropertyDescriptor(descriptor, key);
    if (!own || !("value" in own)) throw new TypeError("Preference pane descriptors must use own data properties.");
    return own.value;
  };
  const rawId = read("id"), rawBundleIdentifier = read("bundleIdentifier"), order = read("order"), create = read("create");
  if (typeof rawId !== "string" || typeof rawBundleIdentifier !== "string") throw new TypeError("Preference pane identifiers must be strings.");
  const id = rawId.trim();
  const bundleIdentifier = rawBundleIdentifier.trim();
  if (!id) throw new TypeError("Preference pane IDs must not be empty.");
  if (!/^com\.syndromatic\.syncloudos\.preference\.[a-z0-9]+(?:[.-][a-z0-9]+)*\.prefpane$/i.test(bundleIdentifier)) {
    throw new TypeError(`Preference pane ${id} requires a system-owned .prefpane bundle identifier.`);
  }
  if (typeof order !== "number" || !Number.isFinite(order)) throw new TypeError(`Preference pane ${id} requires a finite order.`);
  if (typeof create !== "function") throw new TypeError(`Preference pane ${id} requires a presentation factory.`);
  return Object.freeze({ id, bundleIdentifier, order, create });
}

export function createPreferencePaneRegistry(runtimeId: SynCloudOSRuntimeId): PreferencePaneRegistry {
  const registrations = new Map<string, { token: object; descriptor: Readonly<PreferencePaneDescriptor> }>();
  const listeners = new Set<() => void>();
  let snapshot: readonly PreferencePaneDescriptor[] = Object.freeze([]);
  let disposed = false;
  const publish = () => {
    snapshot = Object.freeze([...registrations.values()]
      .map(({ descriptor }) => descriptor)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)));
    for (const listener of [...listeners]) listener();
  };
  const registry: PreferencePaneRegistry = {
    runtimeId,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      registrations.clear();
      snapshot = Object.freeze([]);
      for (const listener of [...listeners]) listener();
      listeners.clear();
      systemRegistrars.delete(registry);
    },
  };
  systemRegistrars.set(registry, (input) => {
      if (disposed) throw new Error(`Preference pane registry ${runtimeId} is disposed.`);
      const descriptor = prepareDescriptor(input);
      if (registrations.has(descriptor.id)) throw new Error(`Preference pane ${descriptor.id} is already registered.`);
      if ([...registrations.values()].some(({ descriptor: registered }) => registered.bundleIdentifier === descriptor.bundleIdentifier)) {
        throw new Error(`Preference pane bundle identifier ${descriptor.bundleIdentifier} is already registered.`);
      }
      const token = {};
      registrations.set(descriptor.id, { token, descriptor });
      publish();
      let active = true;
      return Object.freeze({
        id: descriptor.id,
        dispose() {
          if (!active) return;
          active = false;
          if (registrations.get(descriptor.id)?.token !== token) return;
          registrations.delete(descriptor.id);
          if (!disposed) publish();
        },
      });
    });
  return registry;
}

/** Internal system-shell boundary. This function is deliberately absent from public barrels. */
export function registerSystemPreferencePane(registry: PreferencePaneRegistry, descriptor: PreferencePaneDescriptor): PreferencePaneRegistration {
  const register = systemRegistrars.get(registry);
  if (!register) throw new Error(`Preference pane registry ${registry.runtimeId} is disposed or foreign.`);
  return register(descriptor);
}
