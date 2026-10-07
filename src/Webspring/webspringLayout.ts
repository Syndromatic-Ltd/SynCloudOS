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

import type { SynCloudOSAppInfo, SynCloudOSStagePoint } from "../SynCloudOS/SynCloudOS";
import {
  WEBSPRING_LAYOUT_PREFERENCE_VERSION,
  type SynCloudOSWebspringLayoutPreference,
  type SynCloudOSWebspringLayoutPreferenceSource
} from "../SynCloudOS/SynCloudOS";
import { getDialPoint, WEBSPRING_STAGE } from "./stage";

export type { SynCloudOSWebspringLayoutPreference } from "../SynCloudOS/SynCloudOS";

export const WEBSPRING_LAYOUT_PREFERENCE_KEY = "webspring.layout.v3";
export const DESKTOP_DIAL_APP_LIMIT = 7;
export const MOBILE_GRID_COLUMNS = 5;
export const MOBILE_GRID_FALLBACK_COLUMNS = 4;
export const MOBILE_GRID_FALLBACK_WIDTH = 390;
export const WEBSPRING_BOARD_PROJECTION_VERSION = 1;
export const WEBSPRING_BOARD_PAGE_SIZE = 20;
export const WEBSPRING_BOARD_DOCK_SIZE = 4;

export interface WebspringBoardProjection<T extends { readonly id: string }> {
  readonly version: 1;
  readonly order: readonly string[];
  readonly dock: readonly T[];
  readonly pages: readonly (readonly T[])[];
  readonly pageSize: number;
  readonly dockSize: number;
}

/** Projects the single persisted Webspring order into Board regions without owning another app order. */
export function createWebspringBoardProjection<T extends { readonly id: string }>(
  apps: readonly T[],
  options: { readonly pageSize?: number; readonly dockSize?: number } = {},
): WebspringBoardProjection<T> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? WEBSPRING_BOARD_PAGE_SIZE));
  const dockSize = Math.max(0, Math.floor(options.dockSize ?? WEBSPRING_BOARD_DOCK_SIZE));
  const dock = apps.slice(0, dockSize);
  const pageApps = apps.slice(dock.length);
  const pages = Array.from(
    { length: Math.max(1, Math.ceil(pageApps.length / pageSize)) },
    (_unused, index) => Object.freeze(pageApps.slice(index * pageSize, (index + 1) * pageSize)),
  );
  return Object.freeze({
    version: WEBSPRING_BOARD_PROJECTION_VERSION,
    order: Object.freeze(apps.map((app) => app.id)),
    dock: Object.freeze(dock),
    pages: Object.freeze(pages),
    pageSize,
    dockSize,
  });
}

export interface WebspringMobileGridOptions {
  order?: readonly string[];
  width?: number;
  maxColumns?: number;
  fallbackColumns?: number;
  fallbackWidth?: number;
}

export interface WebspringMobileGridSlot {
  app: SynCloudOSAppInfo;
  appId: string;
  index: number;
  row: number;
  column: number;
}

export interface WebspringMobileGridLayout {
  columns: number;
  rows: number;
  slots: WebspringMobileGridSlot[];
}

export type WebspringDesktopSlotRegion = "dial" | "overflow";

export interface WebspringDesktopSlot {
  app: SynCloudOSAppInfo;
  appId: string;
  index: number;
  region: WebspringDesktopSlotRegion;
  angle: number | null;
  iconPosition: SynCloudOSStagePoint;
  indicatorPosition: SynCloudOSStagePoint | null;
  labelPosition: SynCloudOSStagePoint;
}

export interface WebspringDesktopLayout {
  dialSlots: WebspringDesktopSlot[];
  overflowSlots: WebspringDesktopSlot[];
  slots: WebspringDesktopSlot[];
}

export type WebspringAppPlacement = WebspringDesktopSlot;

export interface WebspringLayout {
  order: string[];
  orderedApps: SynCloudOSAppInfo[];
  mainApps: SynCloudOSAppInfo[];
  overflowApps: SynCloudOSAppInfo[];
  placements: Record<string, WebspringAppPlacement>;
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
  board: SynCloudOSWebspringLayoutPreference["board"] = { version: 1, pageSize: WEBSPRING_BOARD_PAGE_SIZE, dockSize: WEBSPRING_BOARD_DOCK_SIZE },
): SynCloudOSWebspringLayoutPreference {
  return {
    version: WEBSPRING_LAYOUT_PREFERENCE_VERSION,
    order: [...order],
    board: { ...board },
    updatedAt,
    source
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
  const source =
    record.source === "persisted" ||
    record.source === "user" ||
    record.source === "reset" ||
    record.source === "seed"
      ? record.source
      : "persisted";
  const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : null;

  const boardRecord = record.board;
  const board = boardRecord?.version === 1 && Number.isFinite(boardRecord.pageSize) && Number.isFinite(boardRecord.dockSize)
    ? { version: 1 as const, pageSize: Math.max(1, Math.floor(boardRecord.pageSize)), dockSize: Math.max(0, Math.floor(boardRecord.dockSize)) }
    : { version: 1 as const, pageSize: WEBSPRING_BOARD_PAGE_SIZE, dockSize: WEBSPRING_BOARD_DOCK_SIZE };
  return createPreference(uniqueIds(record.order), source, updatedAt, board);
}

export function getDefaultWebspringOrder(apps: readonly SynCloudOSAppInfo[]) {
  return apps
    .filter(isVisibleWebspringApp)
    .slice()
    .sort(compareSeedOrder)
    .map((app) => app.id);
}

export function reconcileWebspringOrder(
  apps: readonly SynCloudOSAppInfo[],
  persistedOrder: readonly string[] | null | undefined
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
  updatedAt = Date.now()
) {
  return createPreference(reconcileWebspringOrder(apps, order), source, updatedAt);
}

export function resetWebspringOrder(apps: readonly SynCloudOSAppInfo[]) {
  return getDefaultWebspringOrder(apps);
}

export function persistWebspringOrder(
  apps: readonly SynCloudOSAppInfo[],
  order: readonly string[] | null | undefined
) {
  return reconcileWebspringOrder(apps, order);
}

export function resetPersistedWebspringOrder(apps: readonly SynCloudOSAppInfo[]) {
  return resetWebspringOrder(apps);
}

export function reorderWebspringOrder(order: readonly string[], appId: string, targetIndex: number) {
  return moveWebspringAppToIndex(order, appId, targetIndex);
}

export function getOrderedVisibleWebspringApps(
  apps: readonly SynCloudOSAppInfo[],
  order: readonly string[] | null | undefined
) {
  const visible = apps.filter(isVisibleWebspringApp);
  const appMap = new Map(visible.map((app) => [app.id, app]));
  const reconciledOrder = reconcileWebspringOrder(visible, order);

  return reconciledOrder
    .map((appId) => appMap.get(appId))
    .filter((app): app is SynCloudOSAppInfo => Boolean(app));
}

export function moveWebspringAppToIndex(
  order: readonly string[],
  appId: string,
  toIndex: number
) {
  const nextOrder = uniqueIds(order);
  const fromIndex = nextOrder.indexOf(appId);
  if (fromIndex === -1) return nextOrder;

  const [app] = nextOrder.splice(fromIndex, 1);
  const clampedIndex = Math.max(0, Math.min(toIndex, nextOrder.length));
  nextOrder.splice(clampedIndex, 0, app);

  return nextOrder;
}

export function moveWebspringAppBefore(
  order: readonly string[],
  appId: string,
  beforeAppId: string
) {
  const nextOrder = uniqueIds(order);
  const targetIndex = nextOrder.indexOf(beforeAppId);
  if (targetIndex === -1 || appId === beforeAppId) return nextOrder;

  return moveWebspringAppToIndex(nextOrder, appId, targetIndex);
}

export function getKeyboardReorderIndex(
  order: readonly string[],
  appId: string,
  key: string,
  columns = MOBILE_GRID_COLUMNS
) {
  const currentIndex = order.indexOf(appId);
  if (currentIndex === -1) return -1;

  const deltaByKey: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -Math.max(1, columns),
    ArrowDown: Math.max(1, columns)
  };

  if (key === "Home") return 0;
  if (key === "End") return order.length - 1;
  if (!(key in deltaByKey)) return currentIndex;

  return Math.max(0, Math.min(order.length - 1, currentIndex + deltaByKey[key]));
}

export function getMobileWebspringGrid(
  apps: readonly SynCloudOSAppInfo[],
  options: WebspringMobileGridOptions = {}
): WebspringMobileGridLayout {
  const width = options.width ?? Number.POSITIVE_INFINITY;
  const maxColumns = options.maxColumns ?? MOBILE_GRID_COLUMNS;
  const fallbackColumns = options.fallbackColumns ?? MOBILE_GRID_FALLBACK_COLUMNS;
  const fallbackWidth = options.fallbackWidth ?? MOBILE_GRID_FALLBACK_WIDTH;
  const columns = width < fallbackWidth ? fallbackColumns : maxColumns;
  const orderedApps = getOrderedVisibleWebspringApps(apps, options.order);
  const slots = orderedApps.map((app, index) => ({
    app,
    appId: app.id,
    index,
    row: Math.floor(index / columns),
    column: index % columns
  }));

  return {
    columns,
    rows: Math.ceil(slots.length / columns),
    slots
  };
}

export function getDesktopDialAngles(count: number) {
  if (count <= 0) return [];
  if (count === 1) return [0];

  const arc = count <= 5 ? 144 : 176;
  const start = -arc / 2;

  return Array.from({ length: count }, (_unused, index) =>
    start + (index / (count - 1)) * arc
  );
}

function getOverflowPoint(index: number): SynCloudOSStagePoint {
  const columns = 5;
  const column = index % columns;
  const row = Math.floor(index / columns);
  const gapX = 118;
  const gapY = 100;
  const startX = WEBSPRING_STAGE.orbCenter.x - ((columns - 1) * gapX) / 2;

  return {
    x: startX + column * gapX,
    y: WEBSPRING_STAGE.shelfY + 154 + row * gapY
  };
}

export function getDesktopWebspringSlots(
  apps: readonly SynCloudOSAppInfo[],
  order?: readonly string[] | null
): WebspringDesktopLayout {
  const orderedApps = getOrderedVisibleWebspringApps(apps, order);
  const dialApps = orderedApps.slice(0, DESKTOP_DIAL_APP_LIMIT);
  const overflowApps = orderedApps.slice(DESKTOP_DIAL_APP_LIMIT);
  const dialAngles = getDesktopDialAngles(dialApps.length);
  const dialSlots = dialApps.map((app, index) => {
    const angle = dialAngles[index] ?? 0;

    return {
      app,
      appId: app.id,
      index,
      region: "dial" as const,
      angle,
      iconPosition: getDialPoint(angle, WEBSPRING_STAGE.iconRadius),
      indicatorPosition: getDialPoint(angle, WEBSPRING_STAGE.indicatorRadius),
      labelPosition: getDialPoint(angle, WEBSPRING_STAGE.labelRadius)
    };
  });
  const overflowSlots = overflowApps.map((app, overflowIndex) => {
    const iconPosition = getOverflowPoint(overflowIndex);

    return {
      app,
      appId: app.id,
      index: DESKTOP_DIAL_APP_LIMIT + overflowIndex,
      region: "overflow" as const,
      angle: null,
      iconPosition,
      indicatorPosition: null,
      labelPosition: {
        x: iconPosition.x,
        y: iconPosition.y - 82
      }
    };
  });

  return {
    dialSlots,
    overflowSlots,
    slots: [...dialSlots, ...overflowSlots]
  };
}

export function getDesktopWebspringSlotForApp(
  apps: readonly SynCloudOSAppInfo[],
  appId: string | null | undefined,
  order?: readonly string[] | null
) {
  if (!appId) return null;
  return getDesktopWebspringSlots(apps, order).slots.find((slot) => slot.appId === appId) ?? null;
}

export function createWebspringLayout(
  apps: readonly SynCloudOSAppInfo[],
  order: readonly string[] | null | undefined
): WebspringLayout {
  const orderedApps = getOrderedVisibleWebspringApps(apps, order);
  const desktop = getDesktopWebspringSlots(orderedApps, order);
  const placements = Object.fromEntries(desktop.slots.map((slot) => [slot.appId, slot]));

  return {
    order: reconcileWebspringOrder(apps, order),
    orderedApps,
    mainApps: desktop.dialSlots.map((slot) => slot.app),
    overflowApps: desktop.overflowSlots.map((slot) => slot.app),
    placements
  };
}
