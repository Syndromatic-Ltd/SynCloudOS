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
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { createSelectionChange, dataViewAllowsMutation, dataViewAllowsNavigation, dataViewAnnouncement, dataViewEventIsComposing, dataViewIsBusy, dataViewIsDisabled, encodeNSEDataViewKey } from "../Core";
import { useNSEVirtualiser } from "../Virtualisation";
import { useNSEDataViewDragHost } from "../../Drag";
import { flattenVisibleTree } from "./flattenVisibleTree";
import type {
  NSEOutlineProps,
  NSEOutlineRow,
  NSEOutlineSelectionEvent,
} from "./outlineTypes";
import "./nse-outline-view.css";

type OutlineStyle = CSSProperties & { readonly "--nse-outline-level"?: number };

export function NSEOutline<T, TId extends string | number>({
  controller,
  idForItem,
  childrenForItem,
  labelForItem,
  isExpandable,
  delegate,
  state = { kind: "ready" },
  selectionMode = "multiple",
  expandedIds,
  defaultExpandedIds,
  onExpandedIdsChange,
  onSelectionChange,
  rowHeight = 23,
  viewportBlockSize = 460,
  onValidateDrop,
  onAcceptDrop,
  dragBinding,
  dragEndpoint,
  dir = "ltr",
  className = "",
  style,
  onKeyDown,
  ...props
}: NSEOutlineProps<T, TId>) {
  const instanceId = useId().replace(/:/g, "");
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [attemptedLoads, setAttemptedLoads] = useState<ReadonlySet<TId>>(() => new Set());
  const rows = useMemo(() => flattenVisibleTree(
    snapshot.roots,
    snapshot.expandedIds,
    (item, node) => {
      const supplied = isExpandable?.(item);
      if (supplied !== undefined) return supplied;
      return node.children.length > 0 || node.loading || node.error !== null || !attemptedLoads.has(node.id);
    },
  ), [attemptedLoads, isExpandable, snapshot.errors, snapshot.expandedIds, snapshot.loadingIds, snapshot.roots]);
  const [activeId, setActiveId] = useState<TId | null>(() => rows[0]?.id ?? null);
  const [typeahead, setTypeahead] = useState({ value: "", time: 0 });
  const [dragStatus, setDragStatus] = useState("");
  const allowsMutation = dataViewAllowsMutation(state);
  const dragHost = useNSEDataViewDragHost({ binding: dragBinding, endpoint: dragEndpoint, validate: onValidateDrop, accept: onAcceptDrop, onStatus: setDragStatus, enabled: allowsMutation });
  const requests = useRef(new Map<TId, AbortController>());
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeIndex = activeId === null ? -1 : rows.findIndex(({ id }) => Object.is(id, activeId));
  const virtualiser = useNSEVirtualiser({
    count: rows.length,
    axis: "block",
    overscan: 2,
    estimateSize: rowHeight,
    sizingGeneration: rowHeight,
    getKey: (index) => encodeNSEDataViewKey(rows[index]!.id),
    retainedIndices: activeIndex < 0 ? undefined : new Set([activeIndex]),
    viewportSize: viewportBlockSize,
    viewportRef,
  });

  useEffect(() => {
    for (const id of defaultExpandedIds ?? []) {
      if (!controller.getSnapshot().expandedIds.has(id)) controller.expand(id);
    }
  }, [controller, defaultExpandedIds]);
  useEffect(() => {
    if (!expandedIds) return;
    const current = controller.getSnapshot().expandedIds;
    for (const id of current) if (!expandedIds.has(id)) controller.collapse(id);
    for (const id of expandedIds) if (!current.has(id)) controller.expand(id);
  }, [controller, expandedIds]);
  useEffect(() => {
    if (activeId !== null && rows.some(({ id }) => Object.is(id, activeId))) return;
    setActiveId(rows[0]?.id ?? null);
  }, [activeId, rows]);
  useEffect(() => () => {
    for (const request of requests.current.values()) request.abort();
    requests.current.clear();
  }, []);
  useEffect(() => {
    for (const row of rows) {
      if (row.expanded && row.node.children.length === 0 && !row.node.loading && row.node.error === null && !attemptedLoads.has(row.id) && !requests.current.has(row.id)) loadRow(row);
    }
  }, [attemptedLoads, rows]);

  const domId = (id: TId) => `nse-outline-${instanceId}-${encodeNSEDataViewKey(id)}`;
  const activeDescendant = activeId === null ? undefined : domId(activeId);
  const allowsInteraction = dataViewAllowsNavigation(state);
  const rowFor = (id: TId) => rows.find((row) => Object.is(row.id, id));
  const isDescendant = (candidate: NSEOutlineRow<T, TId>, ancestorId: TId) => {
    let parentId = candidate.parentId;
    const visited = new Set<TId>();
    while (parentId !== null && !visited.has(parentId)) {
      if (Object.is(parentId, ancestorId)) return true;
      visited.add(parentId);
      parentId = rowFor(parentId)?.parentId ?? null;
    }
    return false;
  };

  const emitSelection = (before: typeof snapshot.selection, reason: NSEOutlineSelectionEvent<TId>["reason"]) => {
    const after = controller.getSnapshot().selection;
    if (before === after) return;
    onSelectionChange?.({ reason, snapshot: after, change: createSelectionChange(before, after) });
  };

  const select = (id: TId, reason: NSEOutlineSelectionEvent<TId>["reason"], mode: "replace" | "toggle" | "range" = "replace") => {
    if (!allowsInteraction || selectionMode === "none") return;
    const before = controller.getSnapshot().selection;
    if (mode === "toggle" && selectionMode === "multiple") {
      const next = new Set(before.selectedIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      controller.select(next);
    } else if (mode === "range" && selectionMode === "multiple") {
      const anchor = before.anchorId ?? before.focusId ?? id;
      const start = rows.findIndex((row) => Object.is(row.id, anchor));
      const end = rows.findIndex((row) => Object.is(row.id, id));
      controller.select(rows.slice(Math.min(start, end), Math.max(start, end) + 1).map((row) => row.id));
    } else controller.select([id]);
    emitSelection(before, reason);
  };

  const expand = (row: NSEOutlineRow<T, TId>) => {
    if (!allowsInteraction || !row.expandable || row.expanded || delegate?.shouldExpand?.(row.id, row.item) === false) return;
    controller.expand(row.id);
    onExpandedIdsChange?.(controller.getSnapshot().expandedIds);
    delegate?.didExpand?.(row.id, row.item);
    if (row.node.children.length === 0) loadRow(row);
  };

  function loadRow(row: NSEOutlineRow<T, TId>): void {
    requests.current.get(row.id)?.abort();
    const request = new AbortController();
    requests.current.set(row.id, request);
    const loading = controller.hasChildLoader()
      ? controller.loadChildren(row.id, request.signal)
      : controller.loadChildren(row.id, request.signal, (item, signal) => childrenForItem(item, signal));
    void loading.finally(() => {
      if (requests.current.get(row.id) === request) requests.current.delete(row.id);
      if (!request.signal.aborted) setAttemptedLoads((current) => new Set(current).add(row.id));
    });
  }

  const collapse = (row: NSEOutlineRow<T, TId>) => {
    if (!allowsInteraction || !row.expanded || delegate?.shouldCollapse?.(row.id, row.item) === false) return;
    const selectedDescendant = rows.some((candidate) => isDescendant(candidate, row.id) && snapshot.selection.selectedIds.has(candidate.id));
    const activeDescendantRow = activeId === null ? undefined : rowFor(activeId);
    requests.current.get(row.id)?.abort();
    requests.current.delete(row.id);
    controller.collapse(row.id);
    onExpandedIdsChange?.(controller.getSnapshot().expandedIds);
    delegate?.didCollapse?.(row.id, row.item);
    if (activeDescendantRow && isDescendant(activeDescendantRow, row.id)) setActiveId(row.id);
    if (selectedDescendant) {
      const before = controller.getSnapshot().selection;
      controller.select([row.id]);
      emitSelection(before, "collapse-parent");
    }
  };

  const moveActive = (nextIndex: number) => {
    if (!allowsInteraction || rows.length === 0) return;
    const index = Math.min(rows.length - 1, Math.max(0, nextIndex));
    setActiveId(rows[index]!.id);
    virtualiser.scrollToIndex(index, "nearest");
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (dataViewEventIsComposing(event)) { onKeyDown?.(event); return; }
    if (!allowsInteraction) { onKeyDown?.(event); return; }
    const currentIndex = activeId === null ? -1 : rows.findIndex(({ id }) => Object.is(id, activeId));
    const current = rows[currentIndex];
    if (allowsMutation && dragBinding && dragEndpoint && event.altKey && event.key.toLowerCase() === "d" && current) {
      event.preventDefault();
      const ids = snapshot.selection.selectedIds.has(current.id)
        ? rows.filter(({ id }) => snapshot.selection.selectedIds.has(id)).map(({ id }) => id)
        : [current.id];
      dragBinding.begin(ids, dragEndpoint);
      setDragStatus(`${ids.length} outline item${ids.length === 1 ? "" : "s"} ready to move.`);
    } else if (allowsMutation && dragBinding && dragEndpoint && event.altKey && event.key === "Enter") {
      event.preventDefault();
      const insertionIndex = current ? current.row : rows.length;
      void dragBinding.drop({ targetId: current?.id ?? null, insertionIndex, operation: "on" }, dragEndpoint, {
        validate: onValidateDrop,
        accept: onAcceptDrop,
      }).then((accepted) => setDragStatus(accepted ? "Drop completed." : "Drop rejected; selection restored."))
        .catch(() => setDragStatus("Drop failed; selection restored."));
    } else if (dragBinding && event.key === "Escape") {
      event.preventDefault();
      dragBinding.cancel("keyboard cancellation");
      setDragStatus("Drag cancelled; selection restored.");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(currentIndex + 1);
      const next = rows[Math.min(rows.length - 1, currentIndex + 1)];
      if (event.shiftKey && next) select(next.id, "keyboard-range", "range");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(currentIndex - 1);
      const next = rows[Math.max(0, currentIndex - 1)];
      if (event.shiftKey && next) select(next.id, "keyboard-range", "range");
    } else if (event.key === "Home") {
      event.preventDefault(); moveActive(0);
    } else if (event.key === "End") {
      event.preventDefault(); moveActive(rows.length - 1);
    } else if (event.key === "ArrowRight" && current) {
      event.preventDefault();
      if (!current.expanded) expand(current);
      else if (rows[currentIndex + 1]?.parentId === current.id) moveActive(currentIndex + 1);
    } else if (event.key === "ArrowLeft" && current) {
      event.preventDefault();
      if (current.expanded) collapse(current);
      else if (current.parentId !== null) {
        const parentIndex = rows.findIndex(({ id }) => Object.is(id, current.parentId));
        if (parentIndex >= 0) moveActive(parentIndex);
      }
    } else if (event.key === " " && current) {
      event.preventDefault(); select(current.id, "keyboard", event.ctrlKey || event.metaKey ? "toggle" : "replace");
    } else if (event.key === "Enter" && current) {
      event.preventDefault(); delegate?.didActivate?.(current.id, current.item);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const query = `${now - typeahead.time > 700 ? "" : typeahead.value}${event.key}`.toLocaleLowerCase();
      setTypeahead({ value: query, time: now });
      for (let offset = 1; offset <= rows.length; offset += 1) {
        const index = (currentIndex + offset) % rows.length;
        if (labelForItem(rows[index]!.item).toLocaleLowerCase().startsWith(query)) { moveActive(index); break; }
      }
    }
    onKeyDown?.(event);
  };

  return (
    <div className="nse-outline-container" data-state={state.kind}>
      <div
        {...props}
        ref={viewportRef}
        role="tree"
        tabIndex={dataViewIsDisabled(state) ? -1 : 0}
        aria-activedescendant={activeDescendant}
        aria-busy={dataViewIsBusy(state)}
        aria-disabled={dataViewIsDisabled(state) || undefined}
        aria-readonly={state.kind === "read-only" || undefined}
        className={`nse-outline-view ${className}`.trim()}
        dir={dir}
        data-nse-control="outline-view"
        data-state={state.kind}
        style={{ ...style, position: "relative", overflow: "auto", blockSize: `${viewportBlockSize}px` }}
        onKeyDown={handleKey}
      >
        <div style={{ position: "relative", blockSize: `${virtualiser.snapshot.range.totalSize}px` }}>
          {virtualiser.snapshot.items.map((virtualItem) => {
            const row = rows[virtualItem.index]!;
            const selected = snapshot.selection.selectedIds.has(row.id);
            const sourceIds = selected
              ? rows.filter(({ id }) => snapshot.selection.selectedIds.has(id)).map(({ id }) => id)
              : [row.id];
            const rowStyle: OutlineStyle = {
              position: "absolute",
              insetBlockStart: `${virtualItem.start}px`,
              blockSize: `${virtualItem.size}px`,
              inlineSize: "100%",
              "--nse-outline-level": row.level - 1,
            };
            return (
              <div
                key={virtualItem.key}
                id={domId(row.id)}
                role="treeitem"
                aria-level={row.level}
                aria-posinset={row.positionInSet}
                aria-setsize={row.setSize}
                aria-expanded={row.expandable ? row.expanded : undefined}
                aria-selected={selected}
                data-nse-part="row"
                data-state={selected ? "selected" : row.row % 2 === 0 ? "even" : "odd"}
                data-kind={row.expandable ? "branch" : "leaf"}
                data-appearance-recipe={selected ? "outline-selected-row" : "outline-row"}
                draggable={Boolean(allowsMutation && dragBinding && dragEndpoint)}
                onDragStart={(event) => dragHost.start(event, sourceIds)}
                onDragOver={(event) => dragHost.over(event, row.id, row.row)}
                onDrop={(event) => dragHost.drop(event, row.id, row.row)}
                onDragEnd={dragHost.end}
                style={rowStyle}
                onClick={(event: MouseEvent) => {
                  if (!allowsInteraction) return;
                  setActiveId(row.id);
                  select(row.id, "pointer", event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace");
                }}
                onDoubleClick={() => { if (allowsInteraction) delegate?.didActivate?.(row.id, row.item); }}
              >
                {row.expandable ? (
                  <button
                    type="button"
                    aria-label={`${row.expanded ? "Collapse" : "Expand"} ${labelForItem(row.item)}`}
                    data-nse-part="disclosure"
                    data-state={row.expanded ? "open" : "closed"}
                    data-appearance-recipe="outline-disclosure"
                    disabled={!allowsInteraction}
                    onClick={(event) => { event.stopPropagation(); row.expanded ? collapse(row) : expand(row); }}
                  />
                ) : null}
                <span data-nse-part="label">{delegate?.renderItem?.(row) ?? labelForItem(row.item)}</span>
                {row.node.loading ? <span data-nse-part="loading">Loading children</span> : null}
                {row.node.error ? (
                  <span data-nse-part="error">
                    {row.node.error}
                    <button type="button" onClick={(event) => { event.stopPropagation(); loadRow(row); }}>Retry loading {labelForItem(row.item)}</button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <span role="status" aria-live="polite" className="nse-outline-status">{dragStatus || dataViewAnnouncement(state)}</span>
      {(state.kind === "error" || state.kind === "denied") && state.retry ? <button type="button" onClick={state.retry}>Retry</button> : null}
      {state.kind === "interrupted" && state.resume ? <button type="button" onClick={state.resume}>Resume</button> : null}
    </div>
  );
}
