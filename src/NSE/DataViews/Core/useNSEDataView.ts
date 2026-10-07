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
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
  type HTMLAttributes,
} from "react";
import { useNSEDeferredDisposal, type NSEDisposalScheduler } from "../../interactionLifecycle";

import { dataViewAnnouncement, dataViewEventIsComposing, dataViewIsBusy, dataViewIsDisabled } from "./dataViewAccessibility";
import { NSEDataViewCoordinator } from "./NSEDataViewCoordinator";
import { encodeNSEDataViewKey } from "./dataViewIdentity";
import type {
  NSEDataViewAdapter,
  NSEDataViewCoordinatorOptions,
  NSEDataViewKey,
} from "./dataViewTypes";

interface MicrotaskHandle { cancelled: boolean }
const disposalScheduler: NSEDisposalScheduler = {
  setTimeout(callback) {
    const handle: MicrotaskHandle = { cancelled: false };
    queueMicrotask(() => { if (!handle.cancelled) callback(); });
    return handle;
  },
  clearTimeout(handle) { (handle as MicrotaskHandle).cancelled = true; },
};

type DataViewRootAttributes = HTMLAttributes<HTMLDivElement> & {
  readonly "data-state": string;
};

type DataViewItemAttributes = HTMLAttributes<HTMLElement> & {
  readonly "data-selected"?: boolean;
  readonly "data-focused"?: boolean;
};

export function useNSEDataView<T, TId extends NSEDataViewKey>(
  adapter: NSEDataViewAdapter<T, TId>,
  options: NSEDataViewCoordinatorOptions<T, TId>,
) {
  const generatedId = useId().replace(/:/g, "");
  const coordinator = useMemo(() => new NSEDataViewCoordinator(adapter, options), [adapter]);
  coordinator.updateOptions(options);
  useNSEDeferredDisposal(coordinator, disposalScheduler);
  useEffect(() => coordinator.setState(options.state ?? { kind: "ready" }), [coordinator, options.state]);
  const snapshot = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  const itemDomId = (id: TId) => `nse-data-view-${generatedId}-${encodeNSEDataViewKey(id)}`;
  const activeDescendant = snapshot.activeId === null ? undefined : itemDomId(snapshot.activeId);
  const typeaheadRef = useRef({ value: "", updatedAt: 0 });

  const rootProps: DataViewRootAttributes = {
    id: `nse-data-view-${generatedId}`,
    tabIndex: dataViewIsDisabled(snapshot.state) ? -1 : 0,
    "aria-activedescendant": activeDescendant,
    "aria-busy": dataViewIsBusy(snapshot.state),
    "aria-disabled": dataViewIsDisabled(snapshot.state),
    "data-state": snapshot.state.kind,
    onKeyDown(event) {
      if (dataViewEventIsComposing(event)) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        coordinator.moveActive(1);
        if (event.shiftKey && coordinator.getSnapshot().activeId !== null) {
          coordinator.select(coordinator.getSnapshot().activeId!, "keyboard-range", "range");
        }
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        coordinator.moveActive(-1);
        if (event.shiftKey && coordinator.getSnapshot().activeId !== null) {
          coordinator.select(coordinator.getSnapshot().activeId!, "keyboard-range", "range");
        }
      } else if (event.key === "Home") {
        event.preventDefault();
        coordinator.moveActiveTo("start");
      } else if (event.key === "End") {
        event.preventDefault();
        coordinator.moveActiveTo("end");
      } else if (event.key === "PageDown") {
        event.preventDefault();
        coordinator.moveActive(10);
      } else if (event.key === "PageUp") {
        event.preventDefault();
        coordinator.moveActive(-10);
      } else if (event.key === "Enter" && coordinator.getSnapshot().activeId !== null) {
        event.preventDefault();
        coordinator.activate();
      } else if (event.key === " " && coordinator.getSnapshot().activeId !== null) {
        event.preventDefault();
        coordinator.select(coordinator.getSnapshot().activeId!, "keyboard", event.ctrlKey || event.metaKey ? "toggle" : "replace");
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = Date.now();
        const prefix = now - typeaheadRef.current.updatedAt > 700 ? "" : typeaheadRef.current.value;
        typeaheadRef.current = { value: `${prefix}${event.key}`, updatedAt: now };
        coordinator.moveActiveByTypeahead(typeaheadRef.current.value);
      }
    },
  };

  return {
    snapshot,
    coordinator,
    announcement: dataViewAnnouncement(snapshot.state),
    rootProps,
    itemDomId,
    itemProps(id: TId): DataViewItemAttributes {
      const entry = coordinator.entryForId(id);
      const selected = snapshot.selection.selectedIds.has(id);
      return {
        id: itemDomId(id),
        "aria-selected": selected,
        "aria-disabled": entry?.disabled,
        "data-selected": selected || undefined,
        "data-focused": Object.is(snapshot.activeId, id) || undefined,
        onClick(event) {
          coordinator.select(id, "pointer", event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace");
        },
        onDoubleClick() {
          coordinator.setActive(id);
          coordinator.activate(id);
        },
        onContextMenu(event) {
          coordinator.requestContextMenu(id, event.currentTarget);
        },
      };
    },
  };
}
