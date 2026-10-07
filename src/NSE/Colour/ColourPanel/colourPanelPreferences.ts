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

import { NSEPreferencesController, PreferencePersistenceError } from "../../Controllers";
import { GFXColour } from "../../../FX/GraphicsFX/public";

export interface NSEColourPanelPreferences {
  readonly recents: readonly string[];
  readonly swatches: readonly string[];
}

export type NSEColourPanelPreferencesController = NSEPreferencesController<NSEColourPanelPreferences>;

export interface NSEColourPanelPreferencePersistence {
  getPreference<T>(key: string, fallback: T): T;
  setPreference<T>(key: string, value: T): boolean;
  removePreference(key: string): void;
}

const validPalette = (maximum: number) => (value: unknown): value is readonly string[] =>
  Array.isArray(value)
  && value.length <= maximum
  && value.every((item) => {
    if (typeof item !== "string" || item.length > 64) return false;
    try { return GFXColour.parse(item).toCSS() === item; }
    catch { return false; }
  });

export function createNSEColourPanelPreferences(
  persistence: NSEColourPanelPreferencePersistence,
  namespace = "nse.colour-panel.palette",
): NSEColourPanelPreferencesController {
  return new NSEPreferencesController<NSEColourPanelPreferences>({
    namespace,
    schema: {
      version: 1,
      defaults: Object.freeze({ recents: Object.freeze([]), swatches: Object.freeze([]) }),
      fields: {
        recents: { validate: validPalette(16) },
        swatches: { validate: validPalette(64) },
      },
      migrations: Object.freeze([]),
    },
    adapter: {
      read: (key) => persistence.getPreference<unknown>(key, null),
      write: (key, value) => {
        if (!persistence.setPreference(key, value)) throw new PreferencePersistenceError(`Could not persist colour panel preferences for ${key}.`);
      },
      remove: (key) => persistence.removePreference(key),
    },
  });
}
