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

import { useContext, useSyncExternalStore } from "react";
import { MountedWindowContext } from "../Application/NSEWindowContext";
import { NSESplitViewController } from "../DataViews/Split/NSESplitViewController";
import { NSEButton } from "../Controls/Buttons/NSEButton";
import { useNSEActionBinding } from "../Controls/Core/useNSEControlAction";
import { useNSEControlCommand } from "../Controls/Core/useNSEControlCommand";

const noSubscription = () => () => {};
const noSnapshot = () => null;

export function ToggleWindowPane({ pane }: { readonly pane: "sidebar" | "inspector" }) {
  const root = useContext(MountedWindowContext)?.contentViewController;
  const split = root instanceof NSESplitViewController ? root : null;
  const snapshot = useSyncExternalStore(split?.subscribe ?? noSubscription, split?.getSnapshot ?? noSnapshot, noSnapshot);
  const item = split?.splitViewItems.find(value => value.behavior === pane);
  const state = snapshot?.items.find(value => value.identifier === item?.identifier);
  if (!split || !item || !state) return null;
  const name = pane === "sidebar" ? "Sidebar" : "Inspector";
  return <NSEButton title={(state.isCollapsed ? "Show " : "Hide ") + name} aria-pressed={!state.isCollapsed}
    onClick={() => { if (pane === "sidebar") split.toggleSidebar(); else split.toggleInspector(); }} />;
}

export function WindowPreferencesButton() {
  const binding = useNSEActionBinding("showPreferences");
  const command = useNSEControlCommand(binding);
  const presentation = command.presentation;
  if (!presentation?.enabled || presentation.denied || presentation.hidden || presentation.stale) return null;
  return <NSEButton title="Preferences…" onClick={() => void command.dispatch()} />;
}
