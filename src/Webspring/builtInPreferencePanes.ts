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

import type { PreferencePaneDefinition } from "../SynCloudOS/Preferences";
import appearance from "./Preferences/Appearance.prefPane";
import sounds from "./Preferences/Sounds.prefPane";
import motion from "./Preferences/Motion.prefPane";
import notifications from "./Preferences/Notifications.prefPane";
import language from "./Preferences/Language.prefPane";
import account from "./Preferences/Account.prefPane";

/** The panes every host lists, in their default order. */
export const builtInPreferencePanes: readonly PreferencePaneDefinition[] = Object.freeze([
  appearance,
  sounds,
  motion,
  notifications,
  language,
]);

/** Sign in and out, for hosts whose authentication is not disabled. */
export const accountPreferencePane: PreferencePaneDefinition = account;
