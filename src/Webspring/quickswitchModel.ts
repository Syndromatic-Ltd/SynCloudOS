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

import type { SynCloudOSAppInfo, SynCloudOSAppLifecycleState } from "../SynCloudOS/SynCloudOS";

export type WebspringQuickSwitchAppLike = Pick<SynCloudOSAppInfo, "id" | "displayName" | "shortName">;

export interface WebspringQuickSwitchOpenStateInput {
  activeAppId?: string | null;
  lifecycle?: Record<string, SynCloudOSAppLifecycleState>;
  openAppIds?: readonly string[];
}

export type WebspringQuickSwitchSelectablePredicate = (
  app: WebspringQuickSwitchAppLike,
  index: number
) => boolean;

const quickSwitchOpenLifecycleStates = new Set<SynCloudOSAppLifecycleState>([
  "launching",
  "active",
  "suspended"
]);

export function normalizeQuickSwitchKey(key: string | null | undefined) {
  if (!key || key.length !== 1) return null;
  const normalized = key.toLocaleUpperCase();
  return /^[A-Z0-9]$/.test(normalized) ? normalized : null;
}

export function getQuickSwitchMnemonic(app: WebspringQuickSwitchAppLike) {
  const source = app.shortName || app.displayName || app.id;
  for (const character of source.toLocaleUpperCase()) {
    if (/^[A-Z0-9]$/.test(character)) return character;
  }
  return "#";
}

export function splitQuickSwitchMnemonicLabel(label: string, mnemonic: string) {
  const normalizedLabel = label.toLocaleUpperCase();
  const index = normalizedLabel.indexOf(mnemonic.toLocaleUpperCase());
  if (index < 0) {
    return { before: label, match: "", after: "" };
  }

  return {
    before: label.slice(0, index),
    match: label.slice(index, index + 1),
    after: label.slice(index + 1)
  };
}

export function getQuickSwitchInitialIndex(
  apps: readonly WebspringQuickSwitchAppLike[],
  selectedAppId?: string | null,
  activeAppId?: string | null,
  isSelectable: WebspringQuickSwitchSelectablePredicate = () => true
) {
  const firstSelectableIndex = apps.findIndex(isSelectable);
  if (firstSelectableIndex < 0) return -1;
  const selectedIndex = selectedAppId
    ? apps.findIndex((app, index) => app.id === selectedAppId && isSelectable(app, index))
    : -1;
  if (selectedIndex >= 0) return selectedIndex;
  const activeIndex = activeAppId
    ? apps.findIndex((app, index) => app.id === activeAppId && isSelectable(app, index))
    : -1;
  return activeIndex >= 0 ? activeIndex : firstSelectableIndex;
}

export function moveQuickSwitchSelection(
  currentIndex: number,
  appCount: number,
  key: string,
  selectableIndices?: readonly number[]
) {
  const selectable = selectableIndices?.length
    ? [...selectableIndices].filter((index) => index >= 0 && index < appCount)
    : Array.from({ length: Math.max(0, appCount) }, (_unused, index) => index);
  if (!selectable.length) return -1;
  const current = currentIndex >= 0 ? currentIndex : 0;

  if (key === "Home") return selectable[0];
  if (key === "End") return selectable[selectable.length - 1];
  const selectablePosition = selectable.indexOf(current);
  const currentPosition = selectablePosition >= 0 ? selectablePosition : 0;
  if (key === "ArrowLeft" || key === "ArrowUp") return selectable[(currentPosition - 1 + selectable.length) % selectable.length];
  if (key === "ArrowRight" || key === "ArrowDown") return selectable[(currentPosition + 1) % selectable.length];

  return selectablePosition >= 0 ? current : selectable[0];
}

export function selectQuickSwitchMnemonicIndex(
  apps: readonly WebspringQuickSwitchAppLike[],
  key: string,
  currentIndex: number,
  isSelectable: WebspringQuickSwitchSelectablePredicate = () => true
) {
  const normalizedKey = normalizeQuickSwitchKey(key);
  if (!normalizedKey) return currentIndex;

  const matches = apps
    .map((app, index) => ({ index, mnemonic: getQuickSwitchMnemonic(app) }))
    .filter((item) => item.mnemonic === normalizedKey && isSelectable(apps[item.index], item.index))
    .map((item) => item.index);

  if (!matches.length) return currentIndex;

  const currentMatchIndex = matches.indexOf(currentIndex);
  if (currentMatchIndex < 0) return matches[0];
  return matches[(currentMatchIndex + 1) % matches.length];
}

export function isQuickSwitchOpenedApp(appId: string, input: WebspringQuickSwitchOpenStateInput) {
  if (input.activeAppId === appId) return true;
  if (input.openAppIds?.includes(appId)) return true;
  const state = input.lifecycle?.[appId];
  return state ? quickSwitchOpenLifecycleStates.has(state) : false;
}

export function isQuickSwitchShortcutEvent(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey">
) {
  return event.key.toLocaleLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.altKey;
}

export function isEditableQuickSwitchTarget(target: EventTarget | null) {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  const editable = target.closest(
    [
      "input",
      "textarea",
      "select",
      "[contenteditable]",
      ".nse-editor",
      ".nse-editor-font-menu",
      "[role='menu']",
      "[role='menuitem']",
      "[role='listbox']",
      "[role='option']"
    ].join(", ")
  );
  return Boolean(editable);
}

export interface QuickSwitchFitInput {
  readonly count: number;
  readonly iconSize: number;
  readonly iconGap: number;
  /** Width the icon slots may span: the screen less its insets and the frame's padding. */
  readonly room: number;
  readonly overflow: "shrink" | "scroll";
}

/** Judged from icon slots only, so an icon effect's paint can never make the row scroll. */
export function fitQuickSwitch({ count, iconSize, iconGap, room, overflow }: QuickSwitchFitInput) {
  const natural = count * iconSize + Math.max(0, count - 1) * iconGap;
  if (overflow === "scroll") return { fit: 1, overflowing: natural > room + 0.5 };
  return { fit: natural > 0 ? Math.max(0.25, Math.min(1, room / natural)) : 1, overflowing: false };
}
