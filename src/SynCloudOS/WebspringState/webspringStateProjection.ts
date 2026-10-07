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

import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type { SynCloudOSStagePoint } from "../AppRegistry/appRegistryTypes";
import type { SynCloudOSWebspringLayoutPreference, SynCloudOSWebspringLayoutPreferenceSource } from "./webspringStateTypes";

export const WEBSPRING_LAYOUT_PREFERENCE_KEY = "webspring.layout.v3";
const WEBSPRING_LAYOUT_PREFERENCE_VERSION = 3;
const DEFAULT_BOARD_PREFERENCE: SynCloudOSWebspringLayoutPreference["board"] = Object.freeze({ version: 1, pageSize: 20, dockSize: 4 });
const DESKTOP_DIAL_APP_LIMIT = 7;
const WEBSPRING_STAGE = {
  orbCenter: { x: 490, y: 423 },
  indicatorRadius: 207,
} as const;

export interface WebspringLayoutPersistence {
  getPreference<T>(key: string, fallback: T): T;
}

export interface WebspringLayoutReadResult {
  preference: SynCloudOSWebspringLayoutPreference;
  source: "webspring" | "seed";
}

function isVisibleWebspringApp(app: SynCloudOSAppInfo) {
  return app.webspring.visible;
}

function compareSeedOrder(a: SynCloudOSAppInfo, b: SynCloudOSAppInfo) {
  return a.webspring.order - b.webspring.order || a.id.localeCompare(b.id);
}

function uniqueIds(order: readonly string[] | null | undefined) {
  const seen = new Set<string>();
  const ids: string[] = [];
  (order ?? []).forEach((value) => {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function createPreference(
  order: string[],
  source: SynCloudOSWebspringLayoutPreferenceSource,
  updatedAt: number | null,
  board = DEFAULT_BOARD_PREFERENCE,
): SynCloudOSWebspringLayoutPreference {
  return {
    version: WEBSPRING_LAYOUT_PREFERENCE_VERSION,
    order: [...order],
    board: { ...board },
    updatedAt,
    source,
  };
}

export function createEmptyWebspringLayoutPreference(): SynCloudOSWebspringLayoutPreference {
  return createPreference([], "seed", null);
}

export function coerceWebspringLayoutPreference(value: unknown): SynCloudOSWebspringLayoutPreference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return createEmptyWebspringLayoutPreference();
  }
  const record = value as Partial<SynCloudOSWebspringLayoutPreference>;
  const source = record.source === "persisted" || record.source === "user" || record.source === "reset" || record.source === "seed"
    ? record.source
    : "persisted";
  const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : null;
  const boardRecord = record.board;
  const board = boardRecord?.version === 1 && Number.isFinite(boardRecord.pageSize) && Number.isFinite(boardRecord.dockSize)
    ? { version: 1 as const, pageSize: Math.max(1, Math.floor(boardRecord.pageSize)), dockSize: Math.max(0, Math.floor(boardRecord.dockSize)) }
    : DEFAULT_BOARD_PREFERENCE;
  return createPreference(uniqueIds(record.order), source, updatedAt, board);
}

export function getDefaultWebspringOrder(apps: readonly SynCloudOSAppInfo[]) {
  return apps.filter(isVisibleWebspringApp).slice().sort(compareSeedOrder).map((app) => app.id);
}

export function reconcileWebspringOrder(
  apps: readonly SynCloudOSAppInfo[],
  persistedOrder: readonly string[] | null | undefined,
) {
  const seedOrder = getDefaultWebspringOrder(apps);
  const visibleIds = new Set(seedOrder);
  const requested = uniqueIds(persistedOrder).filter((id) => visibleIds.has(id));
  const missing = seedOrder.filter((id) => !requested.includes(id));
  return [...requested, ...missing];
}

export function createWebspringLayoutPreference(
  apps: readonly SynCloudOSAppInfo[],
  order: readonly string[] | null | undefined,
  source: SynCloudOSWebspringLayoutPreferenceSource = "user",
  updatedAt = Date.now(),
) {
  return createPreference(reconcileWebspringOrder(apps, order), source, updatedAt);
}

export function getOrderedVisibleWebspringApps(
  apps: readonly SynCloudOSAppInfo[],
  order: readonly string[] | null | undefined,
) {
  const visible = apps.filter(isVisibleWebspringApp);
  const appMap = new Map(visible.map((app) => [app.id, app]));
  const reconciledOrder = reconcileWebspringOrder(visible, order);
  return reconciledOrder.map((appId) => appMap.get(appId)).filter((app): app is SynCloudOSAppInfo => Boolean(app));
}

export function moveWebspringAppToIndex(order: readonly string[], appId: string, toIndex: number) {
  const nextOrder = uniqueIds(order);
  const fromIndex = nextOrder.indexOf(appId);
  if (fromIndex === -1) return nextOrder;
  const [app] = nextOrder.splice(fromIndex, 1);
  const clampedIndex = Math.max(0, Math.min(toIndex, nextOrder.length));
  nextOrder.splice(clampedIndex, 0, app);
  return nextOrder;
}

export function getKeyboardReorderIndex(
  order: readonly string[],
  appId: string,
  key: string,
  columns = 5,
) {
  const currentIndex = order.indexOf(appId);
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

export function resetWebspringOrder(apps: readonly SynCloudOSAppInfo[]) {
  return getDefaultWebspringOrder(apps);
}

function getDialPoint(angle: number, radius: number): SynCloudOSStagePoint {
  const radians = (angle * Math.PI) / 180;
  return {
    x: WEBSPRING_STAGE.orbCenter.x + Math.sin(radians) * radius,
    y: WEBSPRING_STAGE.orbCenter.y - Math.cos(radians) * radius,
  };
}

function getDesktopDialAngles(count: number) {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const arc = count <= 5 ? 144 : 176;
  const start = -arc / 2;
  return Array.from({ length: count }, (_unused, index) => start + (index / (count - 1)) * arc);
}

export function getDesktopWebspringSlotForApp(
  apps: readonly SynCloudOSAppInfo[],
  appId: string | null | undefined,
  order?: readonly string[] | null,
) {
  if (!appId) return null;
  const orderedApps = getOrderedVisibleWebspringApps(apps, order);
  const dialApps = orderedApps.slice(0, DESKTOP_DIAL_APP_LIMIT);
  const dialAngles = getDesktopDialAngles(dialApps.length);
  const index = dialApps.findIndex((app) => app.id === appId);
  if (index < 0) return null;
  const angle = dialAngles[index] ?? 0;
  return {
    app: dialApps[index],
    appId,
    index,
    region: "dial" as const,
    angle,
    iconPosition: getDialPoint(angle, 270),
    indicatorPosition: getDialPoint(angle, WEBSPRING_STAGE.indicatorRadius),
    labelPosition: getDialPoint(angle, 226),
  };
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
