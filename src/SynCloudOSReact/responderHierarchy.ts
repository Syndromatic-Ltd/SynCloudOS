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
import type { ActiveResponderAnchors, ResponderKind, SynCloudOSRuntime } from "../SynCloudOS/SynCloudOS";

export interface ResponderHierarchyValue {
  readonly runtimeId?: string | null;
  readonly responderId: string | null;
  readonly documentResponderId?: string;
  readonly windowResponderId?: string;
  readonly applicationResponderId?: string;
}

export const ResponderHierarchyContext = createContext<ResponderHierarchyValue>({ runtimeId: null, responderId: null });
export const useResponderHierarchy = () => useContext(ResponderHierarchyContext);

function compactAnchors(anchors: ActiveResponderAnchors): ActiveResponderAnchors {
  return Object.fromEntries(Object.entries(anchors).filter(([, value]) => value != null)) as ActiveResponderAnchors;
}

export function activateResponderHierarchy(runtime: SynCloudOSRuntime, hierarchy: ResponderHierarchyValue) {
  runtime.focus.setActiveAnchors(compactAnchors({
    ...runtime.focus.getActiveAnchors(),
    applicationResponderId: hierarchy.applicationResponderId,
    windowResponderId: hierarchy.windowResponderId,
    documentResponderId: hierarchy.documentResponderId,
  }));
}

export function clearOwnedResponderAnchor(runtime: SynCloudOSRuntime, kind: ResponderKind, responderId: string) {
  const current = runtime.focus.getActiveAnchors();
  const next: ActiveResponderAnchors = { ...current };
  let changed = false;
  if (kind === "document" && current.documentResponderId === responderId) {
    delete (next as { documentResponderId?: string | null }).documentResponderId;
    changed = true;
  }
  if (kind === "window" && current.windowResponderId === responderId) {
    delete (next as { windowResponderId?: string | null }).windowResponderId;
    delete (next as { documentResponderId?: string | null }).documentResponderId;
    changed = true;
  }
  if (kind === "application" && current.applicationResponderId === responderId) {
    delete (next as { applicationResponderId?: string | null }).applicationResponderId;
    delete (next as { windowResponderId?: string | null }).windowResponderId;
    delete (next as { documentResponderId?: string | null }).documentResponderId;
    changed = true;
  }
  if (changed) runtime.focus.setActiveAnchors(next);
}
