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

import { defaultConfigurationProfile } from "./defaultConfigurationProfile";
import type { SynCloudOSConfigurationProfile } from "./policyTypes";

/** Capabilities a single application may grant to its anonymous visitors by declaring them. */
const DOCUMENT_STORE_CAPABILITY = /^documentStore\.[A-Za-z.]+$/u;

/**
 * The configuration profile of a single-application host without sign-in: the default profile, with the
 * document-store capabilities the primary application declares in `permissions` granted to the
 * anonymous role. Other declared capabilities are not granted this way. A host that passes its own
 * `configurationProfile` keeps it unchanged.
 */
export function singleApplicationConfigurationProfile(permissions: readonly string[]): SynCloudOSConfigurationProfile {
  const granted = [...new Set(permissions.filter(permission => DOCUMENT_STORE_CAPABILITY.test(permission)))];
  if (granted.length === 0) return defaultConfigurationProfile;
  const anonymous = defaultConfigurationProfile.anonymousRole;
  const roles = Object.fromEntries(Object.entries(defaultConfigurationProfile.roles).map(([role, capabilities]) => [
    role,
    Object.freeze(role === anonymous || role === "authenticated" ? [...new Set([...capabilities, ...granted])] : [...capabilities]),
  ]));
  return Object.freeze({ ...defaultConfigurationProfile, id: "syncloudos.single-application", roles: Object.freeze(roles) });
}
