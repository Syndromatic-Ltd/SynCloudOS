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

import { normalizeBundleIdentifier } from "../../../SynCloudOS/Identity/bundleIdentifier.mjs";
/**
 * The command ID an action name stands for. A bare name (`newNote`) belongs to
 * the application that declared it, so it becomes `<appId>.newNote`. A name
 * with a dot (`document.save`) is a standard command and is used as written.
 */
export function nseActionCommandId(appId: string, action: string): string {
  if (action.trim().length === 0) throw new TypeError("An action name must not be empty.");
  return action.includes(".") ? action : `${normalizeBundleIdentifier(appId)}.${action}`;
}
