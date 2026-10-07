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

import { createContext, useContext } from "react";
import type { SynCloudOSRuntimeId } from "../SynCloudOS/SynCloudOS";

/**
 * DOM events can travel through several React roots (including portals), so a
 * module-global handled marker is not a safe ownership boundary.  Each input
 * boundary owns its own claimed-event set and consults the nearest physical
 * runtime marker before it accepts an event.
 */
export interface RuntimeInputProtocol {
  readonly runtimeId: SynCloudOSRuntimeId;
  owns(event: Event, fallbackTarget?: EventTarget | null): boolean;
  hasClaimed(event: Event): boolean;
  claim(event: Event): boolean;
}

const RuntimeInputProtocolContext = createContext<RuntimeInputProtocol | null>(null);

function eventPath(event: Event, fallbackTarget?: EventTarget | null): readonly EventTarget[] {
  return typeof event.composedPath === "function" ? event.composedPath() : [fallbackTarget ?? event.target].filter(Boolean) as EventTarget[];
}

export function nearestRuntimeOwner(event: Event, fallbackTarget?: EventTarget | null): string | null {
  for (const target of eventPath(event, fallbackTarget)) {
    if (!(target instanceof HTMLElement)) continue;
    const owner = target.dataset.syncloudosRuntimeOwner
      ?? (target.dataset.syncloudosRuntimeRoot ? target.dataset.syncloudosRuntimeId : undefined);
    if (owner) return owner;
  }
  return null;
}

export function focusScopeFromEvent(event: Event, fallbackTarget?: EventTarget | null): string | undefined {
  for (const target of eventPath(event, fallbackTarget)) {
    if (target instanceof HTMLElement && target.dataset.syncloudosFocusScope) return target.dataset.syncloudosFocusScope;
  }
  return undefined;
}

export function createRuntimeInputProtocol(runtimeId: SynCloudOSRuntimeId): RuntimeInputProtocol {
  const claimedEvents = new WeakSet<Event>();
  return {
    runtimeId,
    owns(event, fallbackTarget) {
      const owner = nearestRuntimeOwner(event, fallbackTarget);
      // Mounted SynWare deliberately mark their DOM with an application lease
      // (`app:<id>`) rather than the kernel runtime id. They still execute on
      // this host runtime's responder/command graph, so the host boundary must
      // admit those events while retaining strict isolation for nested runtime
      // owners.
      return owner === null || owner === runtimeId || owner.startsWith("app:");
    },
    hasClaimed: (event) => claimedEvents.has(event),
    claim(event) {
      if (claimedEvents.has(event)) return false;
      claimedEvents.add(event);
      return true;
    },
  };
}

export const RuntimeInputProtocolProvider = RuntimeInputProtocolContext.Provider;

export function useRuntimeInputProtocol(): RuntimeInputProtocol | null {
  return useContext(RuntimeInputProtocolContext);
}
