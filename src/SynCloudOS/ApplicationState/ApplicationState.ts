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
import type { SynCloudOSMultiSwitchState } from "./applicationStateTypes";

export function createApplicationState(runtime: SynCloudOSRuntime) {
const RuntimeStore = runtime.store;

type BeginMultiSwitchOptions = Pick<SynCloudOSMultiSwitchState, "fromAppId" | "toAppId" | "fromRoute" | "toRoute" | "source"> & {
  id?: string;
};

function createMultiSwitchId(fromAppId: string | null, toAppId: string | null) {
  return `multiswitch-${fromAppId ?? "none"}-${toAppId ?? "none"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
const applicationState = {
  runtimeId: runtime.runtimeId,
  setRoutePath(routePath: string) {
    RuntimeStore.mutate((draft) => {
      draft.application.routePath = routePath;
    });
  },

  setPendingApp(appId: string | null) {
    RuntimeStore.mutate((draft) => {
      draft.application.pendingAppId = appId;
      draft.application.launchingAppId = appId;
    });
  },

  setActiveApp(appId: string | null) {
    RuntimeStore.mutate((draft) => {
      draft.application.previousAppId = draft.application.activeAppId;
      draft.application.activeAppId = appId;
      draft.application.currentAppId = appId;
      if (appId) {
        draft.application.lastActiveAppId = appId;
        draft.application.openAppIds = Array.from(new Set([...draft.application.openAppIds, appId]));
      }
    });
  },

  beginMultiSwitch(options: BeginMultiSwitchOptions) {
    const id = options.id ?? createMultiSwitchId(options.fromAppId, options.toAppId);
    RuntimeStore.mutate((draft) => {
      draft.application.multiSwitch = {
        id,
        status: "switching",
        fromAppId: options.fromAppId,
        toAppId: options.toAppId,
        fromRoute: options.fromRoute,
        toRoute: options.toRoute,
        source: options.source,
        startedAt: Date.now(),
        completedAt: null
      };
    });
    return id;
  },

  finishMultiSwitch(id?: string | null) {
    RuntimeStore.mutate((draft) => {
      if (id && draft.application.multiSwitch.id !== id) return;
      draft.application.multiSwitch = {
        ...draft.application.multiSwitch,
        status: "idle",
        completedAt: Date.now()
      };
    });
  },

  clearMultiSwitch(id?: string | null) {
    RuntimeStore.mutate((draft) => {
      if (id && draft.application.multiSwitch.id !== id) return;
      draft.application.multiSwitch = {
        id: null,
        status: "idle",
        fromAppId: null,
        toAppId: null,
        fromRoute: null,
        toRoute: null,
        source: null,
        startedAt: null,
        completedAt: null
      };
    });
  },

  markSuspended(appId: string) {
    RuntimeStore.mutate((draft) => {
      draft.application.suspendedAppIds = Array.from(new Set([...draft.application.suspendedAppIds, appId]));
      draft.application.openAppIds = draft.application.openAppIds.filter((id) => id !== appId);
    });
  },

  markFailed(appId: string) {
    RuntimeStore.mutate((draft) => {
      draft.application.failedAppIds = Array.from(new Set([...draft.application.failedAppIds, appId]));
    });
  },
  getCurrentAppId() {
    return RuntimeStore.getSnapshot().application.activeAppId;
  },

  dispose() {
  }
};
return applicationState;
}
