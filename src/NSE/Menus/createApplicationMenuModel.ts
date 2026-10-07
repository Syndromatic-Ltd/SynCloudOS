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

import type { NSEMenuEntry, NSEMenuModel, NSEMenuSection } from "./menuTypes";

export interface NSEApplicationMenuLabels {
  readonly label: string;
  readonly about: string;
  readonly preferences: string;
  readonly logOut: string;
}

export interface NSEApplicationMenuModelOptions {
  readonly appId: string;
  readonly labels: NSEApplicationMenuLabels;
  readonly appPreferences?: Readonly<{ commandId: string; label: string }>;
  readonly extensions?: readonly NSEMenuSection[];
  readonly includeLogOut?: boolean;
  /** Mounted apps must create cross-boundary payloads through their runtime. */
  readonly createPayload?: (key: string, value: unknown) => Readonly<Record<string, unknown>>;
}

export function createNSEApplicationMenuModel({ appId, labels, appPreferences, extensions = [], includeLogOut = true, createPayload }: NSEApplicationMenuModelOptions): NSEMenuModel {
  if (!appId.trim()) throw new TypeError("NSE application menus require a stable app ID.");
  const aboutPayload = createPayload?.("appId", appId) ?? Object.freeze({ appId });
  const entries: readonly NSEMenuEntry[] = Object.freeze([
    Object.freeze({ kind: "command" as const, id: "about", commandId: "application.showAbout", payload: aboutPayload, labelOverride: labels.about }),
    ...(appPreferences ? [Object.freeze({ kind: "command" as const, id: "app-preferences", commandId: appPreferences.commandId, labelOverride: appPreferences.label })] : []),
    Object.freeze({ kind: "command" as const, id: "preferences", commandId: "system.showPreferences", labelOverride: labels.preferences }),
    ...(includeLogOut ? [
      Object.freeze({ kind: "separator" as const, id: "session-divider" }),
      Object.freeze({ kind: "command" as const, id: "log-out", commandId: "session.requestLogOut", labelOverride: labels.logOut }),
    ] : []),
  ]);
  return Object.freeze({ id: `application-menu:${appId}`, label: labels.label, entries, sections: Object.freeze([...extensions]) });
}
