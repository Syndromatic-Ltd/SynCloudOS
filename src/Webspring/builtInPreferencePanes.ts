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

import type { NSEPreferencePane } from "../NSE/SystemUI";
import type { PreferencePaneDescriptor } from "../SynCloudOS/SynCloudOS";

export interface SystemPreferencePaneContext {
  readonly appearance: NSEPreferencePane;
  readonly sounds: NSEPreferencePane;
  readonly motion: NSEPreferencePane;
  readonly notifications: NSEPreferencePane;
  readonly language: NSEPreferencePane;
}

function descriptor<K extends keyof SystemPreferencePaneContext>(id: K, order: number): PreferencePaneDescriptor<SystemPreferencePaneContext, NSEPreferencePane> {
  return Object.freeze({
    id,
    bundleIdentifier: `com.syndromatic.syncloudos.preference.${id}.prefpane`,
    order,
    create(context: SystemPreferencePaneContext) { return context[id]; },
  });
}

export const builtInPreferencePanes = Object.freeze([
  descriptor("appearance", 100),
  descriptor("sounds", 200),
  descriptor("motion", 300),
  descriptor("notifications", 400),
  descriptor("language", 500),
]);
