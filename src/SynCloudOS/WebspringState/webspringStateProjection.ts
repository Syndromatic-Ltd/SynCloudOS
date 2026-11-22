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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import {
  WEBSPRING_LAYOUT_PREFERENCE_VERSION,
  type SynCloudOSWebspringFolderConfiguration,
  type SynCloudOSWebspringLayoutPreference,
  type SynCloudOSWebspringLayoutPreferenceSource,
} from "./webspringStateTypes";

export const WEBSPRING_LAYOUT_PREFERENCE_KEY = "webspring.layout.v5";
const DEFAULT_BOARD_PREFERENCE: SynCloudOSWebspringLayoutPreference["board"] = Object.freeze({ version: 1, pageSize: 20, dockSize: 4 });

export const EMPTY_WEBSPRING_FOLDER_CONFIGURATION: SynCloudOSWebspringFolderConfiguration = Object.freeze({
  editable: false,
  initial: Object.freeze([]),
});

export interface WebspringLayoutPersistence {
  getPreference<T>(key: string, fallback: T): T;
}

export interface WebspringLayoutReadResult {
  preference: SynCloudOSWebspringLayoutPreference;
  source: "webspring" | "seed";
}

/** The reconciled layout: what is shown, where. */
export interface WebspringLayoutProjection {
  /** Top-level entry IDs (apps and nonempty folders), in order. */
  readonly order: readonly string[];
  /** Nonempty folder ID to its visible member app IDs, in order. */
  readonly folders: Readonly<Record<string, readonly string[]>>;
  /** Every visible app ID in display order, folder members inline. */
  readonly appOrder: readonly string[];
  /** Member app ID to the folder holding it. */
  readonly folderOfApp: Readonly<Record<string, string>>;
}

/** The persisted layout fields reconciliation reads. */
export type WebspringLayoutInput = Pick<SynCloudOSWebspringLayoutPreference, "order" | "folders" | "source">;

function isVisibleWebspringApp(app: SynCloudOSAppInfo) {
  return app.webspring.visible;
}

function uniqueIds(order: readonly unknown[] | null | undefined) {
  const seen = new Set<string>();
  const ids: string[] = [];
  (order ?? []).forEach((value) => {
    if (typeof value !== "string") return;
    const id = normalizeBundleIdentifier(value.trim());
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function createPreference(
  order: readonly string[],
  folders: Readonly<Record<string, readonly string[]>>,
  source: SynCloudOSWebspringLayoutPreferenceSource,
  updatedAt: number | null,
  board: SynCloudOSWebspringLayoutPreference["board"] = DEFAULT_BOARD_PREFERENCE,
): SynCloudOSWebspringLayoutPreference {
  return {
    version: WEBSPRING_LAYOUT_PREFERENCE_VERSION,
    order: [...order],
    folders: Object.fromEntries(Object.entries(folders).map(([id, apps]) => [id, { apps: [...apps] }])),
    board: { ...board },
    updatedAt,
    source,
  };
}

export function createEmptyWebspringLayoutPreference(): SynCloudOSWebspringLayoutPreference {
  return createPreference([], {}, "seed", null);
}

function coerceFolders(value: unknown): Record<string, string[]> {
  // Keyed by stored IDs, so it has no prototype for an ID to collide with.
  const folders: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return folders;
  for (const [id, folder] of Object.entries(value)) {
    const folderId = id.trim();
    if (!folderId || typeof folder !== "object" || folder === null || !("apps" in folder) || !Array.isArray(folder.apps)) continue;
    folders[folderId] = uniqueIds(folder.apps);
  }
  return folders;
}

export function coerceWebspringLayoutPreference(value: unknown): SynCloudOSWebspringLayoutPreference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return createEmptyWebspringLayoutPreference();
  }
  const record = value as Partial<Record<keyof SynCloudOSWebspringLayoutPreference, unknown>>;
  if (record.version !== WEBSPRING_LAYOUT_PREFERENCE_VERSION) return createEmptyWebspringLayoutPreference();
  const source = record.source === "persisted" || record.source === "user" || record.source === "reset" || record.source === "seed"
    ? record.source
    : "persisted";
  const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : null;
  const boardRecord = record.board as Partial<SynCloudOSWebspringLayoutPreference["board"]> | undefined;
  const board = boardRecord?.version === 1 && Number.isFinite(boardRecord.pageSize) && Number.isFinite(boardRecord.dockSize)
    ? { version: 1 as const, pageSize: Math.max(1, Math.floor(boardRecord.pageSize!)), dockSize: Math.max(0, Math.floor(boardRecord.dockSize!)) }
    : DEFAULT_BOARD_PREFERENCE;
  return createPreference(uniqueIds(Array.isArray(record.order) ? record.order : []), coerceFolders(record.folders), source, updatedAt, board);
}

/**
 * Reconciles a layout preference with the visible apps and the shell's folders.
 *
 * Seed: visible apps outside every manifest folder, plus manifest folders with a
 * visible member, sorted by order (folders first on a tie, then by ID). Fixed
 * folders (`editable: false`) always take membership from the manifest; only the
 * top-level order persists. Editable folders take membership from the persisted
 * preference once a visitor has changed it: an app listed in more than one folder
 * keeps its first, and a visible app found nowhere joins its manifest folder when
 * the preference still has that folder, otherwise the top level. Folders without
 * a visible member are left out.
 */
export function reconcileWebspringLayout(
  apps: readonly SynCloudOSAppInfo[],
  preference: WebspringLayoutInput | null | undefined,
  configuration: SynCloudOSWebspringFolderConfiguration,
): WebspringLayoutProjection {
  const visibleApps = new Map(apps.filter(isVisibleWebspringApp).map((app) => [normalizeBundleIdentifier(app.bundleIdentifier), app]));
  const manifestFolderOrder = new Map(configuration.initial.map((folder) => [folder.id, folder.order]));
  const manifestFolderOfApp = new Map<string, string>();
  for (const folder of configuration.initial) {
    for (const appId of folder.apps) if (!manifestFolderOfApp.has(normalizeBundleIdentifier(appId))) manifestFolderOfApp.set(normalizeBundleIdentifier(appId), folder.id);
  }
  const membershipFromManifest = !configuration.editable || !preference ||
    preference.source === "seed" || preference.source === "reset";
  const sourceFolders = new Map<string, readonly string[]>(membershipFromManifest
    ? configuration.initial.map((folder) => [folder.id, folder.apps])
    : Object.entries(preference.folders).map(([id, folder]) => [id, folder.apps]));
  for (const id of sourceFolders.keys()) if (visibleApps.has(id)) sourceFolders.delete(id);
  const requested = uniqueIds(preference?.order).filter((id) => visibleApps.has(id) || sourceFolders.has(id));

  // Folder membership is settled first, in display order: an app keeps the first folder listing it.
  const placed = new Set<string>();
  const members = new Map<string, string[]>();
  const folderSequence = [...requested.filter((id) => sourceFolders.has(id)), ...sourceFolders.keys()];
  for (const folderId of folderSequence) {
    if (members.has(folderId)) continue;
    const folderApps = uniqueIds(sourceFolders.get(folderId)).filter((appId) => visibleApps.has(normalizeBundleIdentifier(appId)) && !placed.has(normalizeBundleIdentifier(appId)));
    folderApps.forEach((appId) => placed.add(appId));
    members.set(folderId, folderApps);
  }

  const missingApps = [...visibleApps.keys()].filter((appId) => !placed.has(normalizeBundleIdentifier(appId)) && !requested.includes(appId));
  for (const appId of missingApps) {
    const folderId = manifestFolderOfApp.get(normalizeBundleIdentifier(appId));
    const folder = folderId === undefined ? undefined : members.get(folderId);
    if (!folder) continue;
    folder.push(appId);
    placed.add(appId);
  }

  const isTopLevel = (id: string) => members.has(id) ? members.get(id)!.length > 0 : visibleApps.has(id) && !placed.has(id);
  const order = requested.filter(isTopLevel);
  const seedRank = (id: string) => members.has(id)
    ? manifestFolderOrder.get(id) ?? Number.POSITIVE_INFINITY
    : visibleApps.get(id)!.webspring.order;
  const missing = [...members.keys(), ...missingApps]
    .filter((id) => isTopLevel(id) && !order.includes(id))
    .sort((a, b) => seedRank(a) - seedRank(b) ||
      Number(members.has(b)) - Number(members.has(a)) ||
      a.localeCompare(b));
  order.push(...missing);

  // Keyed by app and folder IDs, so neither has a prototype for an ID to collide with.
  const folders: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;
  const folderOfApp: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const id of order) {
    const folderApps = members.get(id);
    if (!folderApps) continue;
    folders[id] = folderApps;
    folderApps.forEach((appId) => { folderOfApp[appId] = id; });
  }
  return {
    order,
    folders,
    appOrder: order.flatMap((id) => folders[id] ?? [id]),
    folderOfApp,
  };
}

/** A reconciled preference for the given layout, ready to store. */
export function createWebspringLayoutPreference(
  apps: readonly SynCloudOSAppInfo[],
  layout: WebspringLayoutInput | null | undefined,
  configuration: SynCloudOSWebspringFolderConfiguration,
  source: SynCloudOSWebspringLayoutPreferenceSource = "user",
  updatedAt = Date.now(),
  board: SynCloudOSWebspringLayoutPreference["board"] = DEFAULT_BOARD_PREFERENCE,
) {
  const projection = reconcileWebspringLayout(apps, layout, configuration);
  return createPreference(projection.order, projection.folders, source, updatedAt, board);
}

/** Every visible app in display order, folder members inline. */
export function getOrderedVisibleWebspringApps(
  apps: readonly SynCloudOSAppInfo[],
  layout: WebspringLayoutInput | null | undefined,
  configuration: SynCloudOSWebspringFolderConfiguration,
) {
  const appMap = new Map(apps.map((app) => [normalizeBundleIdentifier(app.bundleIdentifier), app]));
  return reconcileWebspringLayout(apps, layout, configuration).appOrder.map((appId) => appMap.get(normalizeBundleIdentifier(appId))!);
}

/** A new user folder ID: `folder.user-<base36 time><4 random>`. */
export function createWebspringFolderId(now = Date.now(), random = Math.random) {
  const suffix = Array.from({ length: 4 }, () => Math.floor(random() * 36).toString(36)).join("");
  return `folder.user-${now.toString(36)}${suffix}`;
}

export function moveWebspringEntryToIndex(order: readonly string[], id: string, toIndex: number) {
  const nextOrder = uniqueIds(order);
  const fromIndex = nextOrder.indexOf(normalizeBundleIdentifier(id));
  if (fromIndex === -1) return nextOrder;
  const [entry] = nextOrder.splice(fromIndex, 1);
  const clampedIndex = Math.max(0, Math.min(toIndex, nextOrder.length));
  nextOrder.splice(clampedIndex, 0, entry);
  return nextOrder;
}

export function getKeyboardReorderIndex(
  order: readonly string[],
  id: string,
  key: string,
  columns = 5,
) {
  const currentIndex = order.findIndex(entry => normalizeBundleIdentifier(entry) === normalizeBundleIdentifier(id));
  if (currentIndex === -1) return -1;
  const deltaByKey: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -Math.max(1, columns),
    ArrowDown: Math.max(1, columns),
  };
  if (key === "Home") return 0;
  if (key === "End") return order.length - 1;
  if (!(key in deltaByKey)) return currentIndex;
  return Math.max(0, Math.min(order.length - 1, currentIndex + deltaByKey[key]));
}

export function readWebspringLayoutPreference(
  persistence: WebspringLayoutPersistence,
): WebspringLayoutReadResult {
  const canonical = persistence.getPreference<unknown>(WEBSPRING_LAYOUT_PREFERENCE_KEY, null);
  if (canonical !== null) {
    return { preference: coerceWebspringLayoutPreference(canonical), source: "webspring" };
  }
  return { preference: createEmptyWebspringLayoutPreference(), source: "seed" };
}
