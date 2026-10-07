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

import {
  WEBSPRING_LAYOUT_PREFERENCE_KEY,
  createWebspringLayoutPreference,
  getDesktopWebspringSlotForApp,
  getKeyboardReorderIndex,
  getOrderedVisibleWebspringApps,
  moveWebspringAppToIndex,
  reconcileWebspringOrder,
  resetWebspringOrder,
  readWebspringLayoutPreference
} from "./webspringStateProjection";
import type {
  SynCloudOSPersistence,
  SynCloudOSRuntime,
  SynCloudOSWebspringStateController,
} from "../Runtime/runtimeInstanceTypes";
import type { RuntimeSnapshot } from "../Runtime/runtimeTypes";
import type { SynCloudOSWebspringLayoutPreference } from "./webspringStateTypes";

type WebspringLaunchStageCompletion = (
  launchTransitionId: string,
  appId: string | null | undefined,
  source: "frame" | "fallback",
) => boolean;

type WebspringLaunchCoverCompletion = (
  launchTransitionId: string,
  appId: string | null | undefined,
  source: "animation" | "fallback",
) => boolean;

type WebspringReturnRoleCompletion = (
  returnTransitionId: string,
  role: string,
) => boolean;

type WebspringPersistencePort = Pick<
  SynCloudOSPersistence,
  "getPreference" | "setPreference" | "removePreference"
>;

interface WebspringStateDependencies {
  persistence?: WebspringPersistencePort;
  completeLaunchStage?: WebspringLaunchStageCompletion;
  completeLaunchCover?: WebspringLaunchCoverCompletion;
  completeReturnRole?: WebspringReturnRoleCompletion;
}

export function createWebspringState(
  runtime: SynCloudOSRuntime,
  dependencies: WebspringStateDependencies = {},
): SynCloudOSWebspringStateController {
const EventBus = runtime.events;
const Persistence = dependencies.persistence ?? runtime.persistence;
const RuntimeStore = runtime.store;
let dragOriginalPreference: SynCloudOSWebspringLayoutPreference | null = null;

function getVisibleApps(draft: RuntimeSnapshot) {
  return Object.values(draft.appInfo).filter((app) => app.webspring.visible);
}

function getWorkingOrder(draft: RuntimeSnapshot) {
  return draft.webspring.layout.preference.order;
}

function setWorkingPreference(
  draft: RuntimeSnapshot,
  order: readonly string[],
  source: SynCloudOSWebspringLayoutPreference["source"]
) {
  const preference = {
    ...createWebspringLayoutPreference(getVisibleApps(draft), order, source),
    board: { ...draft.webspring.layout.preference.board },
  };
  draft.webspring.layout.preference = preference;
  draft.webspring.layout.lastCommittedAt = source === "user" || source === "reset" ? preference.updatedAt : draft.webspring.layout.lastCommittedAt;
  return preference;
}

function syncSelector(draft: RuntimeSnapshot, appId: string | null) {
  const app = appId ? draft.appInfo[appId] : null;
  const slot = getDesktopWebspringSlotForApp(getVisibleApps(draft), appId, getWorkingOrder(draft));

  draft.webspring.activeIndicatorId = slot?.region === "dial" ? app?.id ?? null : null;
  draft.webspring.selectorAngle = slot?.angle ?? app?.webspring.selectorAngle ?? app?.webspring.dialPosition ?? 180;
  draft.webspring.selectorPosition = slot?.indicatorPosition ?? null;
}

function persistPreference(preference: SynCloudOSWebspringLayoutPreference | null) {
  if (!preference) return false;
  return Persistence.setPreference(WEBSPRING_LAYOUT_PREFERENCE_KEY, {
    ...preference,
    source: "persisted" as const
  });
}

function createWebspringTransitionId(kind: "return", appId: string | null) {
  return `webspring-${kind}-${appId ?? "none"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const webspringState = {
  runtimeId: runtime.runtimeId,
  hydrateLayoutPreference() {
    const stored = readWebspringLayoutPreference(Persistence).preference;

    RuntimeStore.mutate((draft) => {
      draft.webspring.layout.preference = stored;
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });

    EventBus.publish("webspring.layout.hydrate", { order: stored.order }, "Webspring");
    return stored;
  },

  hydrateLayoutOrder(appIds: string[]) {
    RuntimeStore.mutate((draft) => {
      draft.webspring.layout.preference = {
        version: 3,
        order: [...appIds],
        board: { version: 1, pageSize: 20, dockSize: 4 },
        updatedAt: null,
        source: "seed"
      };
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });
  },

  hoverApp(appId: string | null) {
    RuntimeStore.mutate((draft) => {
      draft.webspring.hoveredAppId = appId;
      draft.webspring.previewAppId = appId;
      draft.webspring.hoverLabelAppId = appId;
      draft.webspring.lowerShelfMode = appId ? "preview" : "news";
      syncSelector(draft, appId);
    });
    EventBus.publish("webspring.hover", { appId }, appId ?? "none");
  },

  selectApp(appId: string | null) {
    RuntimeStore.mutate((draft) => {
      draft.webspring.selectedAppId = appId;
      draft.webspring.focusedAppId = appId;
      draft.webspring.layout.keyboardAppId = appId;
      syncSelector(draft, appId);
      if (appId) {
        const apps = getOrderedVisibleWebspringApps(getVisibleApps(draft), getWorkingOrder(draft));
        draft.webspring.focusIndex = apps.findIndex((app) => app.id === appId);
      }
    });
    EventBus.publish("webspring.select", { appId }, appId ?? "none");
  },

  enterEditMode(appId?: string | null) {
    RuntimeStore.mutate((draft) => {
      const order = reconcileWebspringOrder(getVisibleApps(draft), getWorkingOrder(draft));
      draft.webspring.layout.preference = {
        ...createWebspringLayoutPreference(getVisibleApps(draft), order, "user"),
        board: { ...draft.webspring.layout.preference.board },
      };
      draft.webspring.layout.isEditing = true;
      draft.webspring.layout.draggingAppId = appId ?? null;
      draft.webspring.layout.dragOverAppId = null;
      draft.webspring.layout.keyboardAppId = appId ?? draft.webspring.focusedAppId;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 650;
      if (appId) draft.webspring.focusedAppId = appId;
      syncSelector(draft, appId ?? draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });
    EventBus.publish("webspring.edit.begin", { appId: appId ?? null }, appId ?? "Webspring");
  },

  exitEditMode(commit = true) {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;

    RuntimeStore.mutate((draft) => {
      if (commit) {
        preference = setWorkingPreference(draft, getWorkingOrder(draft), "user");
      } else {
        const stored = readWebspringLayoutPreference(Persistence).preference;
        draft.webspring.layout.preference = stored;
      }

      draft.webspring.layout.isEditing = false;
      draft.webspring.layout.draggingAppId = null;
      draft.webspring.layout.dragOverAppId = null;
      draft.webspring.layout.keyboardAppId = null;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 260;
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });

    if (commit) persistPreference(preference);
    dragOriginalPreference = null;
    EventBus.publish("webspring.edit.end", { commit }, "Webspring");
  },

  beginDrag(appId: string) {
    this.startDraggingApp(appId);
  },

  startDraggingApp(appId: string) {
    if (!dragOriginalPreference) dragOriginalPreference = structuredClone(RuntimeStore.getSnapshot().webspring.layout.preference);
    RuntimeStore.mutate((draft) => {
      draft.webspring.layout.isEditing = true;
      draft.webspring.layout.draggingAppId = appId;
      draft.webspring.layout.dragOverAppId = null;
      draft.webspring.layout.keyboardAppId = appId;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 650;
      draft.webspring.focusedAppId = appId;
    });
    EventBus.publish("webspring.reorder.drag.begin", { appId }, appId);
  },

  endDrag(commit = true) {
    this.finishDraggingApp(commit);
  },

  finishDraggingApp(commit = true) {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;

    RuntimeStore.mutate((draft) => {
      if (commit) {
        preference = setWorkingPreference(draft, getWorkingOrder(draft), "user");
      } else if (dragOriginalPreference) {
        draft.webspring.layout.preference = dragOriginalPreference;
        syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
      }
      draft.webspring.layout.draggingAppId = null;
      draft.webspring.layout.dragOverAppId = null;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 260;
    });

    if (commit) persistPreference(preference);
    dragOriginalPreference = null;
    EventBus.publish("webspring.reorder.drag.end", { commit }, "Webspring");
  },

  reorderApp(appId: string, targetIndex: number, commit = true) {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;
    let didMove = false;

    RuntimeStore.mutate((draft) => {
      const currentOrder = reconcileWebspringOrder(getVisibleApps(draft), getWorkingOrder(draft));
      const nextOrder = moveWebspringAppToIndex(currentOrder, appId, targetIndex);
      didMove = nextOrder.join("\u0000") !== currentOrder.join("\u0000");
      preference = setWorkingPreference(draft, nextOrder, "user");
      draft.webspring.focusedAppId = appId;
      draft.webspring.layout.keyboardAppId = appId;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 450;
      syncSelector(draft, appId);
    });

    if (commit) persistPreference(preference);
    if (didMove) EventBus.publish("webspring.reorder.commit", { appId, targetIndex, commit }, appId);
    return didMove;
  },

  reorderDraggedAppBefore(targetAppId: string, commit = false) {
    const draggingAppId = RuntimeStore.getSnapshot().webspring.layout.draggingAppId;
    if (!draggingAppId || draggingAppId === targetAppId) return false;

    const snapshot = RuntimeStore.getSnapshot();
    const targetIndex = reconcileWebspringOrder(getVisibleApps(snapshot), getWorkingOrder(snapshot)).indexOf(targetAppId);

    if (targetIndex < 0) return false;
    return this.reorderApp(draggingAppId, targetIndex, commit);
  },

  moveEditingAppByKeyboard(appId: string, key: string, columns?: number) {
    const snapshot = RuntimeStore.getSnapshot();
    const order = reconcileWebspringOrder(getVisibleApps(snapshot), getWorkingOrder(snapshot));
    const targetIndex = getKeyboardReorderIndex(order, appId, key, columns);

    if (targetIndex < 0) return false;
    return this.reorderApp(appId, targetIndex, false);
  },

  commitLayoutOrder() {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;
    let committedOrder: string[] = [];

    RuntimeStore.mutate((draft) => {
      preference = setWorkingPreference(draft, getWorkingOrder(draft), "user");
      committedOrder = [...preference.order];
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 260;
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });

    persistPreference(preference);
    EventBus.publish("webspring.layout.commit", { order: committedOrder }, "Webspring");
  },

  resetLayoutOrder() {
    RuntimeStore.mutate((draft) => {
      const order = resetWebspringOrder(getVisibleApps(draft));
      const preference = setWorkingPreference(draft, order, "reset");
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 320;
      draft.webspring.focusIndex = -1;
      draft.webspring.layout.lastCommittedAt = preference.updatedAt;
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });
    Persistence.removePreference(WEBSPRING_LAYOUT_PREFERENCE_KEY);
    EventBus.publish("webspring.reorder.reset", {}, "Webspring");
  },

  isLaunchSuppressed() {
    const layout = RuntimeStore.getSnapshot().webspring.layout;
    return layout.isEditing || (layout.launchSuppressedUntil ?? 0) > Date.now();
  },

  setLoadingApp(appId: string | null, launchTransitionId: string | null = null) {
    RuntimeStore.mutate((draft) => {
      if (!appId) {
        if (draft.webspring.launchPhase !== "staging") return;
        draft.webspring.launchingAppId = null;
        draft.webspring.launchTransitionId = null;
        draft.webspring.launchPhase = "idle";
        draft.webspring.isAnimating = false;
        draft.webspring.lowerShelfMode = draft.webspring.previewAppId ? "preview" : "news";
        syncSelector(draft, draft.webspring.previewAppId);
        return;
      }

      draft.webspring.launchingAppId = appId;
      draft.webspring.launchTransitionId = launchTransitionId ?? draft.webspring.launchTransitionId;
      draft.webspring.launchPhase = "staging";
      draft.webspring.returningAppId = null;
      draft.webspring.returnTransitionId = null;
      draft.webspring.isAnimating = true;
      draft.webspring.lowerShelfMode = "launching";
      syncSelector(draft, appId);
    });
  },

  setLaunching(appId: string | null, launchTransitionId: string | null = null) {
    RuntimeStore.mutate((draft) => {
      draft.webspring.launchingAppId = appId;
      draft.webspring.launchTransitionId = appId ? launchTransitionId ?? draft.webspring.launchTransitionId : null;
      draft.webspring.launchPhase = appId ? "launching" : draft.webspring.launchPhase === "launching" ? "idle" : draft.webspring.launchPhase;
      draft.webspring.returningAppId = null;
      draft.webspring.returnTransitionId = null;
      draft.webspring.isAnimating = Boolean(appId);
      draft.webspring.lowerShelfMode = appId ? "launching" : draft.webspring.previewAppId ? "preview" : "news";
      syncSelector(draft, appId ?? draft.webspring.previewAppId);
    });
  },

  coverForApp(appId: string | null, launchTransitionId: string | null = null) {
    const contentMotion = appId !== null && runtime.apps.getApp(appId)?.frame.presentationMotion === "content";
    RuntimeStore.mutate((draft) => {
      if (
        appId &&
        launchTransitionId &&
        draft.webspring.launchTransitionId &&
        draft.webspring.launchTransitionId !== launchTransitionId
      ) {
        return;
      }
      draft.webspring.launchingAppId = null;
      draft.webspring.launchTransitionId = appId ? launchTransitionId ?? draft.webspring.launchTransitionId : null;
      draft.webspring.launchPhase = appId && !contentMotion ? "covered" : "idle";
      draft.webspring.returningAppId = null;
      draft.webspring.returnTransitionId = null;
      draft.webspring.isAnimating = Boolean(appId) && !contentMotion;
      draft.webspring.lowerShelfMode = "news";
      syncSelector(draft, appId);
    });
  },

  beginReturn(appId: string | null, returnTransitionId = createWebspringTransitionId("return", appId)) {
    RuntimeStore.mutate((draft) => {
      draft.webspring.launchingAppId = null;
      draft.webspring.launchTransitionId = null;
      draft.webspring.launchPhase = "returning";
      draft.webspring.returningAppId = appId;
      draft.webspring.returnTransitionId = returnTransitionId;
      draft.webspring.isAnimating = true;
      draft.webspring.hoveredAppId = null;
      draft.webspring.previewAppId = null;
      draft.webspring.hoverLabelAppId = null;
      draft.webspring.lowerShelfMode = "news";
      syncSelector(draft, null);
    });
    return returnTransitionId;
  },

  finishReturn(returnTransitionId?: string | null) {
    RuntimeStore.mutate((draft) => {
      if (returnTransitionId && draft.webspring.returnTransitionId !== returnTransitionId) return;
      draft.webspring.launchPhase = "idle";
      draft.webspring.returningAppId = null;
      draft.webspring.returnTransitionId = null;
      draft.webspring.isAnimating = false;
      syncSelector(draft, draft.webspring.hoveredAppId);
    });
  },

  refresh() {
    RuntimeStore.mutate((draft) => {
      draft.webspring.lastRefreshAt = Date.now();
      draft.webspring.isBooted = true;
      syncSelector(draft, draft.webspring.hoveredAppId);
    });
  },

  returnToWebspring() {
    RuntimeStore.mutate((draft) => {
      draft.webspring.isAppContainerOpen = false;
      draft.application.routePath = "/";
    });
  },

  completeLaunchStage(launchTransitionId: string, appId?: string | null) {
    return dependencies.completeLaunchStage?.(launchTransitionId, appId, "frame") ?? false;
  },

  completeLaunchCover(launchTransitionId: string, appId?: string | null) {
    return dependencies.completeLaunchCover?.(launchTransitionId, appId, "animation") ?? false;
  },

  completeReturnRole(returnTransitionId: string, role: string) {
    return dependencies.completeReturnRole?.(returnTransitionId, role) ?? false;
  },

  getSnapshot() {
    const snapshot = RuntimeStore.getSnapshot().webspring;
    return {
      selectedAppId: snapshot.selectedAppId,
      hoveredAppId: snapshot.hoveredAppId,
    };
  },

  dispose() {
    dragOriginalPreference = null;
  }
};

return webspringState;
}
