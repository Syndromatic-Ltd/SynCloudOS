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

import type { SynCloudOSEventBus, SynCloudOSLoginService, SynCloudOSRuntimeId, SynCloudOSRuntimeStore } from "../Runtime/runtimeInstanceTypes";

export interface InstanceLoginServiceOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly store: SynCloudOSRuntimeStore;
  readonly events: SynCloudOSEventBus;
  readonly now: () => number;
  readonly endIdentitySession: (reason: string) => Promise<void>;
}

/** Runtime-owned login/session view. Identity authority remains exclusively
 * with the configured session adapter; this service projects live store state
 * and requests server-backed revocation. */
export function createInstanceLoginService(options: InstanceLoginServiceOptions): SynCloudOSLoginService {
  const getSessionSnapshot = () => options.store.getSnapshot().loginServices;
  return {
    runtimeId: options.runtimeId,
    getSnapshot: getSessionSnapshot,
    getSessionSnapshot,
    hydrateSession: getSessionSnapshot,
    hasAuthorisedSession: () => getSessionSnapshot().isAuthorised,
    isLocked: () => !getSessionSnapshot().isAuthorised,
    isUnlocked: () => getSessionSnapshot().isAuthorised,
    async lock() {
      await options.endIdentitySession("user-logout");
      options.store.mutate((draft) => {
        draft.loginServices = {
          ...draft.loginServices,
          isAuthorised: false,
          status: "locked",
          synId: null,
          accessClass: null,
          displayName: null,
          sessionId: null,
          storage: null,
          authorisedAt: null,
          expiresAt: null,
          lastCheckedAt: options.now(),
          lastFailureReason: "missingSession",
        };
      });
      options.events.publish("loginServices.session.locked", { reason: "user-logout" }, "LoginServices");
    },
    dispose() {},
  };
}
