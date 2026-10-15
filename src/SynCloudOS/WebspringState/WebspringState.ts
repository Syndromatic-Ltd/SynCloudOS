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
  createWebspringFolderId,
  createWebspringLayoutPreference,
  getDesktopWebspringSlotForApp,
  getKeyboardReorderIndex,
  moveWebspringEntryToIndex,
  readWebspringLayoutPreference,
  reconcileWebspringLayout,
  type WebspringLayoutProjection,
} from "./webspringStateProjection";
import type {
  SynCloudOSPersistence,
  SynCloudOSRuntime,
  SynCloudOSWebspringStateController,
} from "../Runtime/runtimeInstanceTypes";
import type { RuntimeSnapshot } from "../Runtime/runtimeTypes";
import type {
  SynCloudOSWebspringFolderConfiguration,
  SynCloudOSWebspringLayoutPreference,
} from "./webspringStateTypes";

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

/** A mutable copy of the reconciled layout that an action edits. */
interface WorkingLayout {
  order: string[];
  folders: Record<string, string[]>;
}

export function createWebspringState(
  runtime: SynCloudOSRuntime,
  dependencies: WebspringStateDependencies = {},
): SynCloudOSWebspringStateController {
const EventBus = runtime.events;
const Persistence = dependencies.persistence ?? runtime.persistence;
const RuntimeStore = runtime.store;
let dragOriginalPreference: SynCloudOSWebspringLayoutPreference | null = null;

function getProjection(draft: RuntimeSnapshot): WebspringLayoutProjection {
  return reconcileWebspringLayout(
    Object.values(draft.appInfo),
    draft.webspring.layout.preference,
    draft.webspring.layout.folderConfiguration,
  );
}

function getWorkingLayout(projection: WebspringLayoutProjection): WorkingLayout {
  // Actions index this by caller-supplied IDs, so it has no prototype for an ID to collide with.
  const folders: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [id, apps] of Object.entries(projection.folders)) folders[id] = [...apps];
  return { order: [...projection.order], folders };
}

function setWorkingPreference(
  draft: RuntimeSnapshot,
  layout: WorkingLayout | null,
  source: SynCloudOSWebspringLayoutPreference["source"],
) {
  // Emptied folders drop out here: reconciliation omits folders without a visible member.
  const preference = createWebspringLayoutPreference(
    Object.values(draft.appInfo),
    layout && {
      order: layout.order,
      folders: Object.fromEntries(Object.entries(layout.folders).map(([id, apps]) => [id, { apps }])),
      source,
    },
    draft.webspring.layout.folderConfiguration,
    source,
    Date.now(),
    draft.webspring.layout.preference.board,
  );
  draft.webspring.layout.preference = preference;
  draft.webspring.layout.lastCommittedAt = source === "user" || source === "reset" ? preference.updatedAt : draft.webspring.layout.lastCommittedAt;
  if (draft.webspring.openFolderId && !Object.hasOwn(preference.folders, draft.webspring.openFolderId)) draft.webspring.openFolderId = null;
  return preference;
}

function syncSelector(draft: RuntimeSnapshot, appId: string | null) {
  const app = appId ? draft.appInfo[appId] : null;
  const slot = getDesktopWebspringSlotForApp(getProjection(draft), appId);

  draft.webspring.activeIndicatorId = slot?.region === "dial" ? slot.id : null;
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

function isDragging() {
  return RuntimeStore.getSnapshot().webspring.layout.draggingItemId !== null;
}

function findContainer(layout: WorkingLayout, itemId: string) {
  const folderId = Object.keys(layout.folders).find((id) => layout.folders[id].includes(itemId));
  return folderId === undefined ? layout.order : layout.folders[folderId];
}

function removeFromFolders(layout: WorkingLayout, appId: string) {
  for (const [folderId, apps] of Object.entries(layout.folders)) {
    const index = apps.indexOf(appId);
    if (index < 0) continue;
    apps.splice(index, 1);
    if (apps.length === 0) {
      delete layout.folders[folderId];
      layout.order = layout.order.filter((id) => id !== folderId);
    }
    return folderId;
  }
  return null;
}

function createWebspringTransitionId(kind: "return", appId: string | null) {
  return `webspring-${kind}-${appId ?? "none"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const webspringState = {
  runtimeId: runtime.runtimeId,
  configureFolders(configuration: SynCloudOSWebspringFolderConfiguration) {
    RuntimeStore.mutate((draft) => {
      draft.webspring.layout.folderConfiguration = {
        editable: configuration.editable,
        initial: configuration.initial.map((folder) => ({ id: folder.id, order: folder.order, apps: [...folder.apps] })),
      };
      if (draft.webspring.openFolderId && !getProjection(draft).folders[draft.webspring.openFolderId]) draft.webspring.openFolderId = null;
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });
  },

  hydrateLayoutPreference() {
    const stored = readWebspringLayoutPreference(Persistence).preference;

    RuntimeStore.mutate((draft) => {
      draft.webspring.layout.preference = stored;
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });

    EventBus.publish("webspring.layout.hydrate", { order: stored.order }, "Webspring");
    return stored;
  },

  hydrateLayoutOrder(order: string[]) {
    RuntimeStore.mutate((draft) => {
      draft.webspring.layout.preference = {
        version: 4,
        order: [...order],
        folders: {},
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
      if (appId) draft.webspring.focusIndex = getProjection(draft).appOrder.indexOf(appId);
    });
    EventBus.publish("webspring.select", { appId }, appId ?? "none");
  },

  enterEditMode(itemId?: string | null) {
    RuntimeStore.mutate((draft) => {
      setWorkingPreference(draft, getWorkingLayout(getProjection(draft)), "user");
      draft.webspring.layout.isEditing = true;
      draft.webspring.layout.draggingItemId = itemId ?? null;
      draft.webspring.layout.dropTargetId = null;
      draft.webspring.layout.keyboardAppId = itemId ?? draft.webspring.focusedAppId;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 650;
      if (itemId) draft.webspring.focusedAppId = itemId;
      syncSelector(draft, itemId ?? draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });
    EventBus.publish("webspring.edit.begin", { itemId: itemId ?? null }, itemId ?? "Webspring");
  },

  exitEditMode(commit = true) {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;

    RuntimeStore.mutate((draft) => {
      if (commit) {
        preference = setWorkingPreference(draft, getWorkingLayout(getProjection(draft)), "user");
      } else {
        draft.webspring.layout.preference = readWebspringLayoutPreference(Persistence).preference;
        if (draft.webspring.openFolderId && !getProjection(draft).folders[draft.webspring.openFolderId]) draft.webspring.openFolderId = null;
      }

      draft.webspring.layout.isEditing = false;
      draft.webspring.layout.draggingItemId = null;
      draft.webspring.layout.dropTargetId = null;
      draft.webspring.layout.keyboardAppId = null;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 260;
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });

    if (commit) persistPreference(preference);
    dragOriginalPreference = null;
    EventBus.publish("webspring.edit.end", { commit }, "Webspring");
  },

  beginDrag(itemId: string) {
    if (!dragOriginalPreference) dragOriginalPreference = structuredClone(RuntimeStore.getSnapshot().webspring.layout.preference);
    RuntimeStore.mutate((draft) => {
      draft.webspring.layout.isEditing = true;
      draft.webspring.layout.draggingItemId = itemId;
      draft.webspring.layout.dropTargetId = null;
      draft.webspring.layout.keyboardAppId = itemId;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 650;
      draft.webspring.focusedAppId = itemId;
    });
    EventBus.publish("webspring.reorder.drag.begin", { itemId }, itemId);
  },

  finishDrag(commit = true) {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;

    RuntimeStore.mutate((draft) => {
      if (commit) {
        preference = setWorkingPreference(draft, getWorkingLayout(getProjection(draft)), "user");
      } else if (dragOriginalPreference) {
        draft.webspring.layout.preference = dragOriginalPreference;
        syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
      }
      draft.webspring.layout.draggingItemId = null;
      draft.webspring.layout.dropTargetId = null;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 260;
    });

    if (commit) persistPreference(preference);
    dragOriginalPreference = null;
    EventBus.publish("webspring.reorder.drag.end", { commit }, "Webspring");
  },

  moveItem(itemId: string, targetIndex: number, commit = false) {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;
    let didMove = false;

    RuntimeStore.mutate((draft) => {
      const projection = getProjection(draft);
      const folderId = projection.folderOfApp[itemId];
      if (folderId !== undefined && !draft.webspring.layout.folderConfiguration.editable) return;
      const layout = getWorkingLayout(projection);
      const container = findContainer(layout, itemId);
      if (!container.includes(itemId)) return;
      const nextContainer = moveWebspringEntryToIndex(container, itemId, targetIndex);
      didMove = nextContainer.join("\u0000") !== container.join("\u0000");
      if (!didMove) return;
      if (folderId === undefined) layout.order = nextContainer;
      else layout.folders[folderId] = nextContainer;
      preference = setWorkingPreference(draft, layout, "user");
      draft.webspring.focusedAppId = itemId;
      draft.webspring.layout.keyboardAppId = itemId;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 450;
      syncSelector(draft, itemId);
    });

    if (didMove && commit) persistPreference(preference);
    if (didMove) EventBus.publish("webspring.reorder.commit", { itemId, targetIndex, commit }, itemId);
    return didMove;
  },

  moveItemByKeyboard(itemId: string, key: string, columns?: number) {
    const layout = getWorkingLayout(getProjection(RuntimeStore.getSnapshot()));
    const targetIndex = getKeyboardReorderIndex(findContainer(layout, itemId), itemId, key, columns);

    if (targetIndex < 0) return false;
    return this.moveItem(itemId, targetIndex, false);
  },

  reorder(order: readonly string[]) {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;

    RuntimeStore.mutate((draft) => {
      const layout = getWorkingLayout(getProjection(draft));
      if (order.length !== layout.order.length || new Set(order).size !== order.length || order.some((id) => !layout.order.includes(id))) return;
      layout.order = [...order];
      preference = setWorkingPreference(draft, layout, "user");
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 260;
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });

    if (!preference) return false;
    persistPreference(preference);
    EventBus.publish("webspring.layout.commit", { order: [...order] }, "Webspring");
    return true;
  },

  setDropTarget(itemId: string | null) {
    RuntimeStore.mutate((draft) => {
      const layout = draft.webspring.layout;
      const draggingItemId = layout.draggingItemId;
      const projection = getProjection(draft);
      const accepted = itemId !== null &&
        layout.folderConfiguration.editable &&
        draggingItemId !== null &&
        itemId !== draggingItemId &&
        !projection.folders[draggingItemId] &&
        projection.order.includes(itemId) &&
        projection.folderOfApp[draggingItemId] !== itemId;
      const next = accepted ? itemId : null;
      if (layout.dropTargetId !== next) layout.dropTargetId = next;
    });
  },

  dropOnItem(appId: string, targetItemId: string) {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;
    let folderId: string | null = null;

    RuntimeStore.mutate((draft) => {
      if (!draft.webspring.layout.folderConfiguration.editable || appId === targetItemId) return;
      const projection = getProjection(draft);
      if (!projection.appOrder.includes(appId) || projection.folders[appId] || !projection.order.includes(targetItemId)) return;
      if (projection.folderOfApp[appId] === targetItemId) return;
      const layout = getWorkingLayout(projection);
      removeFromFolders(layout, appId);
      layout.order = layout.order.filter((id) => id !== appId);
      const targetFolder = layout.folders[targetItemId];
      if (targetFolder) {
        targetFolder.push(appId);
        folderId = targetItemId;
      } else {
        const index = layout.order.indexOf(targetItemId);
        if (index < 0) return;
        folderId = createWebspringFolderId();
        layout.folders[folderId] = [targetItemId, appId];
        layout.order.splice(index, 1, folderId);
      }
      preference = setWorkingPreference(draft, layout, "user");
      draft.webspring.layout.dropTargetId = null;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 450;
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });

    if (!preference) return false;
    if (!isDragging()) persistPreference(preference);
    EventBus.publish("webspring.folder.drop", { appId, targetItemId, folderId }, appId);
    return true;
  },

  moveAppOutOfFolder(appId: string, targetIndex: number) {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;

    RuntimeStore.mutate((draft) => {
      if (!draft.webspring.layout.folderConfiguration.editable) return;
      const projection = getProjection(draft);
      if (projection.folderOfApp[appId] === undefined) return;
      const layout = getWorkingLayout(projection);
      removeFromFolders(layout, appId);
      layout.order.splice(Math.max(0, Math.min(targetIndex, layout.order.length)), 0, appId);
      preference = setWorkingPreference(draft, layout, "user");
      draft.webspring.layout.dropTargetId = null;
      draft.webspring.focusedAppId = appId;
      draft.webspring.layout.keyboardAppId = appId;
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 450;
      syncSelector(draft, appId);
    });

    if (!preference) return false;
    if (!isDragging()) persistPreference(preference);
    EventBus.publish("webspring.folder.moveOut", { appId, targetIndex }, appId);
    return true;
  },

  openFolder(folderId: string) {
    let opened = false;
    RuntimeStore.mutate((draft) => {
      if (draft.webspring.layout.draggingItemId || draft.webspring.launchPhase !== "idle") return;
      if (!getProjection(draft).folders[folderId]) return;
      draft.webspring.openFolderId = folderId;
      opened = true;
    });
    if (opened) EventBus.publish("webspring.folder.open", { folderId }, folderId);
    return opened;
  },

  closeFolder() {
    const folderId = RuntimeStore.getSnapshot().webspring.openFolderId;
    if (!folderId) return;
    RuntimeStore.mutate((draft) => {
      draft.webspring.openFolderId = null;
      draft.webspring.layout.dropTargetId = null;
    });
    EventBus.publish("webspring.folder.close", { folderId }, folderId);
  },

  commitLayoutOrder() {
    let preference: SynCloudOSWebspringLayoutPreference | null = null;
    let committedOrder: string[] = [];

    RuntimeStore.mutate((draft) => {
      preference = setWorkingPreference(draft, getWorkingLayout(getProjection(draft)), "user");
      committedOrder = [...preference.order];
      draft.webspring.layout.launchSuppressedUntil = Date.now() + 260;
      syncSelector(draft, draft.webspring.hoveredAppId ?? draft.webspring.selectedAppId);
    });

    persistPreference(preference);
    EventBus.publish("webspring.layout.commit", { order: committedOrder }, "Webspring");
  },

  resetLayoutOrder() {
    RuntimeStore.mutate((draft) => {
      const preference = setWorkingPreference(draft, null, "reset");
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
