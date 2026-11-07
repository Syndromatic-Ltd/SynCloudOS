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

import type { SynCloudOSPolicyDecision, SynCloudOSPolicyRequest } from "../ConfigurationProfiles/policyTypes";

/** Authorization Services named rights, separate from device consent and app visibility. */
export const SCAuthorizationRights = Object.freeze({
  "runtime.mutate": "runtime.mutate",
  "diagnostics.view": "diagnostics.view",
  "plugin.register": "plugin.register",
} as const);
export type SCAuthorizationRight = keyof typeof SCAuthorizationRights;
export type SCAuthorizationOptions = Omit<SynCloudOSPolicyRequest, "action" | "requiredCapabilities">;
export interface SCAuthorizationResult {
  readonly allowed: boolean;
  readonly grantedRights: readonly SCAuthorizationRight[];
  readonly decisions: readonly SynCloudOSPolicyDecision[];
}
export class SCAuthorization {
  constructor(private readonly evaluator: { authorise(request: SynCloudOSPolicyRequest): SynCloudOSPolicyDecision }) {}
  copyRights(rights: readonly SCAuthorizationRight[], options: SCAuthorizationOptions = {}): SCAuthorizationResult {
    const unique = [...new Set(rights)];
    const decisions = unique.map(right => this.evaluator.authorise({ ...options, action: Object.hasOwn(SCAuthorizationRights, right) ? right : "authorization.unknownRight",
      context: { ...options.context, requestedRight: right },
      requiredCapabilities: Object.hasOwn(SCAuthorizationRights, right) ? [SCAuthorizationRights[right]] : [],
    }));
    return Object.freeze({ allowed: unique.length > 0 && decisions.every(decision => decision.allowed),
      grantedRights: Object.freeze(unique.filter((_, index) => decisions[index].allowed)),
      decisions: Object.freeze(decisions),
    });
  }
}
