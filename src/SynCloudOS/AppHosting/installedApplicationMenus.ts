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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { applicationSessionFor } from "./applicationSession";
import type { NSEMenuSection } from "../../NSE/NSE";
import { shortcutCommandIdentifier } from "../SynCloudOS";
/** The Dock contribution is also available in the application's Webspring menu. */
export function installedApplicationMenuSections(runtime: SynCloudOSRuntime, appId: string): readonly NSEMenuSection[] {
  const app = applicationSessionFor({ runtimeId: runtime.runtimeId, appId })?.app;
  const dockMenu = app?.delegate?.applicationDockMenu?.(app);
  const info = runtime.bundles.getBundle(appId)?.synWareManifest;
  const shortcuts = info?.shortcutItems?.map(item => ({ kind: "command" as const, id: `shortcut:${item.type}`, commandId: shortcutCommandIdentifier(appId, item.type), labelOverride: item.title })) ?? [];
  return [
    ...(shortcuts.length ? [{ id: "shortcut-items", beforeId: "preferences", entries: shortcuts }] : []),
    ...(dockMenu ? [{ id: "dock-menu", beforeId: "preferences", entries: dockMenu.model.entries }] : []),
  ];
}
