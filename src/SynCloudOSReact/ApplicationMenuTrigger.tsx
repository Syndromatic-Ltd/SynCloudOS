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

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

export interface ApplicationMenuTriggerPort {
  readonly label: string;
  readonly open: boolean;
  setAnchor(element: HTMLElement | null): void;
  toggle(): void;
}

const ApplicationMenuTriggerContext = createContext<ApplicationMenuTriggerPort | null>(null);

export function ApplicationMenuTriggerProvider({ port, children }: { port: ApplicationMenuTriggerPort | null; children: ReactNode }) {
  return <ApplicationMenuTriggerContext.Provider value={port}>{children}</ApplicationMenuTriggerContext.Provider>;
}

export function useApplicationMenuTrigger(): ApplicationMenuTriggerPort | null {
  return useContext(ApplicationMenuTriggerContext);
}

/** The open state and anchor of one application's menu, shared by whichever
 * control triggers it (the top bar's User Info item or the app's own content
 * trigger) and the overlay that presents it. */
export interface ApplicationMenuSnapshot {
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
}

export interface ApplicationMenuStore {
  readonly getSnapshot: () => ApplicationMenuSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setAnchor: (element: HTMLElement | null) => void;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
}

export function createApplicationMenuStore(): ApplicationMenuStore {
  let snapshot: ApplicationMenuSnapshot = { open: false, anchor: null };
  const listeners = new Set<() => void>();
  const publish = (next: ApplicationMenuSnapshot) => {
    if (next.open === snapshot.open && next.anchor === snapshot.anchor) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAnchor(element) {
      publish({ ...snapshot, anchor: element });
    },
    setOpen(open) {
      publish({ ...snapshot, open });
    },
    toggle() {
      publish({ ...snapshot, open: !snapshot.open });
    },
  };
}

export function useApplicationMenuSnapshot(menuStore: ApplicationMenuStore): ApplicationMenuSnapshot {
  return useSyncExternalStore(menuStore.subscribe, menuStore.getSnapshot, menuStore.getSnapshot);
}
