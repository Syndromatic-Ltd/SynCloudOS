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

import type { SynCloudOSPolicyProfile } from "./policyTypes";

/** Conservative defaults for a host that has not supplied its own role policy. */
export const defaultPolicyProfile: SynCloudOSPolicyProfile = Object.freeze({
  id: "syncloudos.default",
  roles: Object.freeze({
    public: Object.freeze(["webspring.display", "route.open.public", "app.open.public", "runtime.inspect.public"]),
    authenticated: Object.freeze(["webspring.display", "route.open.public", "app.open.public", "app.open.protected", "runtime.inspect.public"]),
  }),
  anonymousRole: "public",
  resolveRole(session: { readonly isAuthorised: boolean }) {
    return session.isAuthorised ? "authenticated" : "public";
  },
});
