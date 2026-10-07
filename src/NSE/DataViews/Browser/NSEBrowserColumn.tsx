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

import { useId, useRef, useState, type KeyboardEvent } from "react";

import { dataViewEventIsComposing, encodeNSEDataViewKey, type NSEDataViewKey } from "../Core";
import { useNSEVirtualiser } from "../Virtualisation";
import type { NSEBrowserColumnState, NSEBrowserItemPresentation } from "./browserTypes";

interface NSEBrowserColumnProps<T, TId extends NSEDataViewKey> {
  readonly label: string;
  readonly index: number;
  readonly state: NSEBrowserColumnState<T, TId>;
  readonly expandedId: TId | null;
  readonly onActiveChange: (id: TId) => void;
  readonly onChoose: (item: NSEBrowserItemPresentation<T, TId>) => void;
  readonly onBack: () => void;
  readonly disabled: boolean;
}

export function NSEBrowserColumn<T, TId extends NSEDataViewKey>({ label, index, state, expandedId, onActiveChange, onChoose, onBack, disabled }: NSEBrowserColumnProps<T, TId>) {
  const instanceId = useId().replace(/:/g, "");
  const [typeahead, setTypeahead] = useState({ text: "", at: 0 });
  const activeIndex = state.activeId === null ? -1 : state.presentation.findIndex(({ id }) => Object.is(id, state.activeId));
  const optionId = (id: TId) => `nse-browser-${instanceId}-${encodeNSEDataViewKey(id)}`;
  const viewportRef = useRef<HTMLDivElement>(null);
  const virtualiser = useNSEVirtualiser({
    count: state.items.length,
    axis: "block",
    overscan: 2,
    estimateSize: 23,
    getKey: (itemIndex) => encodeNSEDataViewKey(state.presentation[itemIndex]!.id),
    retainedIndices: activeIndex < 0 ? undefined : new Set([activeIndex]),
    viewportRef,
    viewportSize: 360,
  });

  const move = (next: number) => {
    if (state.items.length === 0) return;
    const target = Math.max(0, Math.min(state.items.length - 1, next));
    onActiveChange(state.presentation[target]!.id);
    virtualiser.scrollToIndex(target, "nearest");
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || dataViewEventIsComposing(event)) return;
    if (event.key === "ArrowDown") { event.preventDefault(); move(activeIndex + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(activeIndex - 1); }
    else if (event.key === "Home") { event.preventDefault(); move(0); }
    else if (event.key === "End") { event.preventDefault(); move(state.items.length - 1); }
    else if (event.key === "ArrowRight" || event.key === "Enter") {
      const item = state.presentation[activeIndex];
      if (item) { event.preventDefault(); onChoose(item); }
    } else if (event.key === "ArrowLeft") { event.preventDefault(); onBack(); }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const query = `${now - typeahead.at > 700 ? "" : typeahead.text}${event.key}`.toLocaleLowerCase();
      setTypeahead({ text: query, at: now });
      for (let offset = 1; offset <= state.items.length; offset += 1) {
        const candidate = (activeIndex + offset) % state.items.length;
        if (state.presentation[candidate]!.label.toLocaleLowerCase().startsWith(query)) { move(candidate); break; }
      }
    }
  };

  return (
    <div className="nse-browser-column" data-appearance-recipe="browser-column">
      <div
        ref={viewportRef}
        role="listbox"
        aria-label={label}
        aria-busy={state.status === "loading"}
        aria-disabled={disabled || undefined}
        aria-activedescendant={state.activeId === null ? undefined : optionId(state.activeId)}
        data-column-index={index}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKey}
      >
        <div className="nse-browser-options" style={{ blockSize: virtualiser.snapshot.range.totalSize }}>
        {virtualiser.snapshot.items.map((virtualItem) => {
          const item = state.presentation[virtualItem.index]!;
          const { id, leaf } = item;
          const active = Object.is(id, state.activeId);
          return (
            <div
              id={optionId(id)}
              key={encodeNSEDataViewKey(id)}
              role="option"
              aria-selected={active}
              aria-expanded={leaf ? undefined : Object.is(expandedId, id)}
              aria-posinset={virtualItem.index + 1}
              aria-setsize={state.items.length}
              className="nse-browser-option"
              data-focused={active || undefined}
              data-leaf={leaf || undefined}
              data-appearance-recipe={leaf ? "browser-leaf" : "browser-branch"}
              style={{ insetBlockStart: virtualItem.start, blockSize: virtualItem.size }}
              onClick={() => { if (!disabled) { onActiveChange(id); onChoose(item); } }}
            >
              {item.icon}
              <span>{item.label}</span>
              {!leaf && <span aria-hidden="true" data-appearance-recipe="browser-leaf-glyph" />}
            </div>
          );
        })}
        </div>
      </div>
      {state.status !== "ready" && state.status !== "empty" && <div role="status">{state.message ?? "Loading"}</div>}
      {state.status === "empty" && <div role="status">{state.message ?? "No items"}</div>}
      {state.retry && <button type="button" onClick={state.retry}>Retry</button>}
    </div>
  );
}
