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
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  isValidElement,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { createSelectionChange, dataViewAllowsMutation, dataViewAllowsNavigation, dataViewAnnouncement, dataViewEventIsComposing, dataViewIsBusy, dataViewIsDisabled, encodeNSEDataViewKey } from "../Core";
import { dataViewDisposedControllerState, warnDisposedDataViewController } from "../Core/disposedController";
import { useNSEVirtualiser } from "../Virtualisation";
import { useNSEDataViewDragHost } from "../../Drag";
import { NSEDivider } from "../../Controls/Selection/NSEDivider";
import { NSEListItem } from "../../Controls/Selection/NSEListItem";
import { NSETableCellView } from "../Table/NSETableCellView";
import type { NSETableCellViewProps } from "../Core/dataViewTypes";
import { useNSERubberBandScroll } from "../../Scroll";
import type { TreeControllerNodeSnapshot } from "../../Controllers/treeControllerSnapshot";
import { flattenVisibleTree } from "./flattenVisibleTree";
import type {
  NSEOutlineViewProps,
  NSEOutlineViewRow,
  NSEOutlineViewSelectionEvent,
} from "./outlineTypes";
import "./nse-outline-view.css";

type OutlineStyle = CSSProperties & { readonly "--nse-outline-level"?: number };

export function NSEOutlineView<T, TId extends string | number>({
  controller,
  idForItem,
  childrenForItem,
  labelForItem,
  isExpandable,
  delegate,
  state: requestedState = { kind: "ready" },
  selectionMode = "multiple",
  expandedIds,
  defaultExpandedIds,
  onExpandedIdsChange,
  onSelectionChange,
  rowHeight = 23,
  selectionHighlightStyle = "regular",
  floatingSubviews,
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
}: NSEOutlineViewProps<T, TId>) {
  const instanceId = useId().replace(/:/g, "");
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const subscribeToDisposal = useCallback((notify: () => void) => controller.onDispose(notify), [controller]);
  const readDisposed = useCallback(() => controller.isDisposed, [controller]);
  const controllerDisposed = useSyncExternalStore(subscribeToDisposal, readDisposed, readDisposed);
  // A disposed controller keeps its last rows on screen; the outline turns
  // disabled and drops interactions instead of letting the controller throw.
  const state = controllerDisposed ? dataViewDisposedControllerState : requestedState;
  const warnedDisposal = useRef(false);
  const ignoresStaleEvent = (interaction: string) => {
    if (!controllerDisposed) return false;
    if (!warnedDisposal.current) {
      warnedDisposal.current = true;
      warnDisposedDataViewController(controller, interaction);
    }
    return true;
  };
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
  const sourceListContentRef = useRef<HTMLDivElement>(null);
  const sourceList = selectionHighlightStyle === "sourceList";
  const fills = viewportBlockSize === "fill";
  const [measuredBlockSize, setMeasuredBlockSize] = useState<number | null>(null);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!fills || !viewport) return;
    const measure = () => setMeasuredBlockSize(viewport.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fills]);
  // Before the first measurement a filling outline assumes the default, so the virtualiser renders rows.
  const outlineBlockSize = fills
    ? (measuredBlockSize !== null && measuredBlockSize > 0 ? measuredBlockSize : 460)
    : viewportBlockSize;
  // A source list scrolls with the system rubber band, as the sidebar rail always has.
  useNSERubberBandScroll(viewportRef, sourceListContentRef);
  const activeIndex = activeId === null ? -1 : rows.findIndex(({ id }) => Object.is(id, activeId));
  const virtualiser = useNSEVirtualiser({
    count: rows.length,
    axis: "block",
    overscan: 2,
    estimateSize: rowHeight,
    sizingGeneration: rowHeight,
    getKey: (index) => encodeNSEDataViewKey(rows[index]!.id),
    retainedIndices: activeIndex < 0 ? undefined : new Set([activeIndex]),
    viewportSize: outlineBlockSize,
    viewportRef,
  });

  useEffect(() => {
    if (controller.isDisposed) return;
    for (const id of defaultExpandedIds ?? []) {
      if (!controller.getSnapshot().expandedIds.has(id)) controller.expand(id);
    }
  }, [controller, defaultExpandedIds]);
  useEffect(() => {
    if (!expandedIds || controller.isDisposed) return;
    const current = controller.getSnapshot().expandedIds;
    for (const id of current) if (!expandedIds.has(id)) controller.collapse(id);
    for (const id of expandedIds) if (!current.has(id)) controller.expand(id);
  }, [controller, expandedIds]);
  useEffect(() => {
    if (activeId !== null && rows.some(({ id }) => Object.is(id, activeId))) return;
    setActiveId(rows[0]?.id ?? null);
  }, [activeId, rows]);
  // The keyboard's active row follows a selection made elsewhere (the controller, a binding).
  useEffect(() => {
    const selected = snapshot.selection.selectedIds;
    if (selected.size === 0 || (activeId !== null && selected.has(activeId))) return;
    const next = rows.find(({ id }) => selected.has(id));
    if (next) setActiveId(next.id);
  }, [snapshot.selection]);
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
  const isDescendant = (candidate: NSEOutlineViewRow<T, TId>, ancestorId: TId) => {
    let parentId = candidate.parentId;
    const visited = new Set<TId>();
    while (parentId !== null && !visited.has(parentId)) {
      if (Object.is(parentId, ancestorId)) return true;
      visited.add(parentId);
      parentId = rowFor(parentId)?.parentId ?? null;
    }
    return false;
  };

  const isGroup = (row: NSEOutlineViewRow<T, TId>) => delegate?.isGroupItem?.(row.id, row.item) === true;
  const showsOutlineCell = (row: NSEOutlineViewRow<T, TId>) => row.expandable && delegate?.shouldShowOutlineCell?.(row.id, row.item) !== false;
  const selectable = (row: NSEOutlineViewRow<T, TId>) => delegate?.shouldSelect?.(row.id, row.item) ?? !isGroup(row);

  const emitSelection = (before: typeof snapshot.selection, reason: NSEOutlineViewSelectionEvent<TId>["reason"]) => {
    const after = controller.getSnapshot().selection;
    if (before === after) return;
    onSelectionChange?.({ reason, snapshot: after, change: createSelectionChange(before, after) });
  };

  const select = (id: TId, reason: NSEOutlineViewSelectionEvent<TId>["reason"], mode: "replace" | "toggle" | "range" = "replace") => {
    if (ignoresStaleEvent("selection") || !allowsInteraction || selectionMode === "none") return;
    const target = rowFor(id);
    if (target && !selectable(target)) return;
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

  const expand = (row: NSEOutlineViewRow<T, TId>) => {
    if (ignoresStaleEvent("expansion") || !allowsInteraction || !row.expandable || row.expanded || delegate?.shouldExpand?.(row.id, row.item) === false) return;
    controller.expand(row.id);
    onExpandedIdsChange?.(controller.getSnapshot().expandedIds);
    delegate?.didExpand?.(row.id, row.item);
    if (row.node.children.length === 0) loadRow(row);
  };

  function loadRow(row: NSEOutlineViewRow<T, TId>): void {
    if (controller.isDisposed) return;
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

  const collapse = (row: NSEOutlineViewRow<T, TId>) => {
    if (ignoresStaleEvent("collapse") || !allowsInteraction || !row.expanded || delegate?.shouldCollapse?.(row.id, row.item) === false) return;
    const selectedDescendant = rows.some((candidate) => isDescendant(candidate, row.id) && snapshot.selection.selectedIds.has(candidate.id));
    const activeDescendantRow = activeId === null ? undefined : rowFor(activeId);
    requests.current.get(row.id)?.abort();
    requests.current.delete(row.id);
    controller.collapse(row.id);
    onExpandedIdsChange?.(controller.getSnapshot().expandedIds);
    delegate?.didCollapse?.(row.id, row.item);
    if (activeDescendantRow && isDescendant(activeDescendantRow, row.id)) setActiveId(row.id);
    // A selected child moves the selection to its parent, unless the parent
    // cannot be selected (a source-list section), where the child stays selected.
    if (selectedDescendant && selectable(row)) {
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
    if (!allowsInteraction) { ignoresStaleEvent("keyboard navigation"); onKeyDown?.(event); return; }
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

  const disclosureFor = (row: NSEOutlineViewRow<T, TId>) => showsOutlineCell(row) ? (
    <button
      type="button"
      aria-label={`${row.expanded ? "Collapse" : "Expand"} ${labelForItem(row.item)}`}
      data-nse-part="disclosure"
      data-nse-expanded={String(row.expanded)} data-state={row.expanded ? "open" : "closed"}

      disabled={!allowsInteraction}
      onClick={(event) => { event.stopPropagation(); if (row.expanded) collapse(row); else expand(row); }}
    />
  ) : null;

  const rowStatus = (row: NSEOutlineViewRow<T, TId>) => (
    <>
      {row.node.loading ? <span data-nse-part="loading">Loading children</span> : null}
      {row.node.error ? (
        <span data-nse-part="error">
          {row.node.error}
          <button type="button" onClick={(event) => { event.stopPropagation(); loadRow(row); }}>Retry loading {labelForItem(row.item)}</button>
        </span>
      ) : null}
    </>
  );

  const rowProps = (row: NSEOutlineViewRow<T, TId>, selected: boolean) => {
    const sourceIds = selected
      ? rows.filter(({ id }) => snapshot.selection.selectedIds.has(id)).map(({ id }) => id)
      : [row.id];
    return {
      id: domId(row.id),
      role: "treeitem",
      "aria-level": row.level,
      "aria-posinset": row.positionInSet,
      "aria-setsize": row.setSize,
      "aria-expanded": row.expandable ? row.expanded : undefined,
      "aria-selected": selected,
      "data-nse-selected": selected ? "" : undefined, "data-nse-enabled": controllerDisposed ? "false" : undefined,
      "aria-disabled": controllerDisposed || undefined,
      draggable: Boolean(allowsMutation && dragBinding && dragEndpoint),
      onDragStart: (event: DragEvent<HTMLDivElement>) => dragHost.start(event, sourceIds),
      onDragOver: (event: DragEvent<HTMLDivElement>) => dragHost.over(event, row.id, row.row),
      onDrop: (event: DragEvent<HTMLDivElement>) => dragHost.drop(event, row.id, row.row),
      onDragEnd: dragHost.end,
      onClick: (event: MouseEvent) => {
        if (ignoresStaleEvent("selection") || !allowsInteraction) return;
        setActiveId(row.id);
        select(row.id, "pointer", event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace");
      },
      onDoubleClick: () => { if (!ignoresStaleEvent("activation") && allowsInteraction) delegate?.didActivate?.(row.id, row.item); },
    };
  };

  // A source list draws every loaded item, so a section's rows slide closed
  // rather than vanish; rows inside a collapsed item are built here.
  const visibleRows = new Map(rows.map((row) => [row.id, row] as const));
  const sourceListRow = (node: TreeControllerNodeSnapshot<T, TId>, level: number, positionInSet: number, setSize: number): NSEOutlineViewRow<T, TId> => {
    const visible = visibleRows.get(node.id);
    if (visible) return visible;
    const supplied = isExpandable?.(node.value);
    const expandable = supplied ?? (node.children.length > 0 || node.loading || node.error !== null || !attemptedLoads.has(node.id));
    return Object.freeze({
      id: node.id, item: node.value, node, row: -1, level, parentId: node.parentId, positionInSet, setSize,
      expandable, expanded: expandable && snapshot.expandedIds.has(node.id),
    });
  };

  const renderSourceListNodes = (nodes: readonly TreeControllerNodeSnapshot<T, TId>[], level: number, indent: number): ReactNode => nodes.map((node, index) => {
    const row = sourceListRow(node, level, index + 1, nodes.length);
    const group = isGroup(row);
    const selected = snapshot.selection.selectedIds.has(row.id);
    const content = delegate?.renderItem?.(row) ?? labelForItem(row.item);
    // A table cell view is drawn by the source list's own row: its image, title,
    // detail and badge take the row's icon, title, detail and badge places.
    const cell = isValidElement<NSETableCellViewProps>(content) && content.type === NSETableCellView ? content.props : null;
    const children = row.expandable ? node.children : [];
    return (
      <div key={encodeNSEDataViewKey(row.id)} className="nse-outline-node" data-group={group || undefined}>
        {group ? (
          <div {...rowProps(row, false)} aria-selected={undefined} className="nse-outline-group-row" data-nse-part="group-row">
            <span className="nse-outline-group-label">{content}</span>
            <span className="nse-outline-group-line" aria-hidden="true" />
            {showsOutlineCell(row) ? (
              <NSEDivider
                variant="arrow"
                className="nse-outline-group-toggle"
                expanded={row.expanded}
                onToggle={() => { if (row.expanded) collapse(row); else expand(row); }}
                label={`${row.expanded ? "Collapse" : "Expand"} ${labelForItem(row.item)}`}
              />
            ) : null}
          </div>
        ) : (
          <NSEListItem
            {...rowProps(row, selected)}
            className="nse-outline-source-row"
            data-nse-part="row"
            selected={selected}
            isEnabled={!controllerDisposed}
            style={{ "--nse-outline-level": indent } as OutlineStyle}
            leading={disclosureFor(row) ?? (cell?.image ? <img data-nse-part="image" src={cell.image.src} alt={cell.image.alt} /> : undefined)}
            meta={cell?.secondary}
            trailing={cell ? cell.badge ?? cell.accessory : undefined}
          >
            {cell ? cell.primary : content}
            {rowStatus(row)}
          </NSEListItem>
        )}
        {children.length ? (
          <div className="nse-outline-children" data-collapsed={row.expanded ? "false" : "true"} inert={!row.expanded}>
            <div className="nse-outline-children-inner">{renderSourceListNodes(children, level + 1, group ? indent : indent + 1)}</div>
          </div>
        ) : null}
      </div>
    );
  });

  return (
    <div className="nse-outline-container" data-state={state.kind} data-fill={fills || undefined} data-style={sourceList ? "source-list" : undefined}>
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
        data-nse-control="outline-view" data-nse-part="background" data-nse-selection-highlight-style={selectionHighlightStyle} data-nse-enabled={dataViewIsDisabled(state) ? "false" : undefined}
        data-state={state.kind}
        data-style={sourceList ? "source-list" : undefined}
        style={{ ...style, position: "relative", overflow: "auto", blockSize: fills ? "100%" : `${viewportBlockSize}px` }}
        onKeyDown={handleKey}
      >
        {floatingSubviews != null ? <div className="nse-outline-floating-subviews">{floatingSubviews}</div> : null}
        {sourceList ? (
          <div className="nse-outline-source-list" ref={sourceListContentRef}>
            {renderSourceListNodes(snapshot.roots, 1, 0)}
          </div>
        ) : (
        <div style={{ position: "relative", blockSize: `${virtualiser.snapshot.range.totalSize}px` }}>
          {virtualiser.snapshot.items.map((virtualItem) => {
            const row = rows[virtualItem.index]!;
            const selected = snapshot.selection.selectedIds.has(row.id);
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
                {...rowProps(row, selected)}
                data-nse-part={isGroup(row) ? "group-row" : "row"}
                data-state={selected ? "selected" : row.row % 2 === 0 ? "even" : "odd"}
                data-nse-type={row.expandable ? "branch" : "leaf"} data-kind={row.expandable ? "branch" : "leaf"}

                style={rowStyle}
              >
                {disclosureFor(row)}
                <span data-nse-part="label">{delegate?.renderItem?.(row) ?? labelForItem(row.item)}</span>
                {rowStatus(row)}
              </div>
            );
          })}
        </div>
        )}
      </div>
      <span role="status" aria-live="polite" className="nse-outline-status">{dragStatus || dataViewAnnouncement(state)}</span>
      {(state.kind === "error" || state.kind === "denied") && state.retry ? <button type="button" onClick={state.retry}>Retry</button> : null}
      {state.kind === "interrupted" && state.resume ? <button type="button" onClick={state.resume}>Resume</button> : null}
    </div>
  );
}
