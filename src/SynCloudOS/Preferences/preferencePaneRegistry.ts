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
import { isPreferencePaneDefinition, type PreferencePaneDefinition } from "./definePreferencePane";

export interface PreferencePaneRegistration {
  readonly id: string;
  dispose(): void;
}

export interface PreferencePaneRegistry {
  readonly runtimeId: SynCloudOSRuntimeId;
  getSnapshot(): readonly PreferencePaneDefinition[];
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const registrars = new WeakMap<PreferencePaneRegistry, (definition: PreferencePaneDefinition) => PreferencePaneRegistration>();

export function createPreferencePaneRegistry(runtimeId: SynCloudOSRuntimeId): PreferencePaneRegistry {
  const registrations = new Map<string, { token: object; definition: PreferencePaneDefinition }>();
  const listeners = new Set<() => void>();
  let snapshot: readonly PreferencePaneDefinition[] = Object.freeze([]);
  let disposed = false;
  const publish = () => {
    snapshot = Object.freeze([...registrations.values()]
      .map(({ definition }) => definition)
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
  registrars.set(registry, (definition) => {
    if (disposed) throw new Error(`Preference pane registry ${runtimeId} is disposed.`);
    if (!isPreferencePaneDefinition(definition)) throw new TypeError("Preference panes must be created with definePreferencePane.");
    if (registrations.has(definition.id)) throw new Error(`Preference pane ${definition.id} is already registered.`);
    const token = {};
    registrations.set(definition.id, { token, definition });
    publish();
    let active = true;
    return Object.freeze({
      id: definition.id,
      dispose() {
        if (!active) return;
        active = false;
        if (registrations.get(definition.id)?.token !== token) return;
        registrations.delete(definition.id);
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
export function registerPreferencePane(registry: PreferencePaneRegistry, definition: PreferencePaneDefinition): PreferencePaneRegistration {
  const register = registrars.get(registry);
  if (!register) throw new Error(`Preference pane registry ${registry.runtimeId} is disposed or foreign.`);
  return register(definition);
}
