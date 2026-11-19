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
import {
  capturePreferencePaneClass,
  isPreferencePaneDescriptor,
  type NSEPreferencePaneClass,
  type PreferencePaneDescriptor,
} from "./NSEPreferencePane";

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

const registrars = new WeakMap<PreferencePaneRegistry, (descriptor: PreferencePaneDescriptor) => PreferencePaneRegistration>();

export function createPreferencePaneRegistry(runtimeId: SynCloudOSRuntimeId): PreferencePaneRegistry {
  const registrations = new Map<string, { token: object; descriptor: PreferencePaneDescriptor }>();
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
      registrars.delete(registry);
    },
  };
  registrars.set(registry, (descriptor) => {
    if (disposed) throw new Error(`Preference pane registry ${runtimeId} is disposed.`);
    if (!isPreferencePaneDescriptor(descriptor)) {
      throw new TypeError("Preference panes must be a class extending NSEPreferencePane.");
    }
    if (registrations.has(descriptor.id)) throw new Error(`Preference pane ${descriptor.id} is already registered.`);
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

/**
 * Lists a pane in the runtime's System Preferences. A pane id is listed once
 * per runtime, and a disposed or foreign registry refuses the registration.
 */
export function registerPreferencePane(
  registry: PreferencePaneRegistry,
  pane: PreferencePaneDescriptor | NSEPreferencePaneClass,
): PreferencePaneRegistration {
  const register = registrars.get(registry);
  if (!register) throw new Error(`Preference pane registry ${registry.runtimeId} is disposed or foreign.`);
  const descriptor = isPreferencePaneDescriptor(pane) ? pane : capturePreferencePaneClass(pane);
  return register(descriptor);
}
