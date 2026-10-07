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

import type { SynCloudOSIdentityUser } from "./identityTypes";
import type { SynCloudOSPolicyProfile } from "../PolicyKit/policyTypes";
import { defaultPolicyProfile } from "../PolicyKit/defaultPolicyProfile";

export function createIdentity(dependencies: { loginServices: any; runtimeId?: string; profile?: SynCloudOSPolicyProfile }) {
const LoginServices = dependencies.loginServices;
const profile = dependencies.profile ?? defaultPolicyProfile;

const anonymousUser: SynCloudOSIdentityUser = {
  id: "public.anonymous",
  displayName: "Public Visitor",
  role: profile.anonymousRole,
  isAuthenticated: false,
  isAnonymous: true
};

const identity = {
  runtimeId: dependencies.runtimeId,
  getCurrentUser() {
    const session = LoginServices.getSnapshot();
    if (session.isAuthorised && session.synId) {
      return {
        id: `synid.${session.synId}`,
        synId: session.synId,
        displayName: session.displayName ?? session.synId,
        // Which role a signed-in person holds is host policy.
        role: profile.resolveRole({ isAuthorised: true, synId: session.synId, accessClass: session.accessClass ?? null }),
        isAuthenticated: true,
        isAnonymous: false
      } satisfies SynCloudOSIdentityUser;
    }
    return anonymousUser;
  },

  isAuthenticated() {
    return this.getCurrentUser().isAuthenticated;
  },

  getRole() {
    return this.getCurrentUser().role;
  },

  getSubject() {
    const user = this.getCurrentUser();
    return {
      user,
      role: user.role,
      isAuthenticated: user.isAuthenticated
    };
  }
};
return identity;
}
