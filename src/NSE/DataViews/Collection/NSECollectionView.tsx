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

import { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { dataViewAllowsMutation, dataViewAnnouncement, dataViewEventIsComposing, encodeNSEDataViewKey, useNSEDataView } from "../Core";
import { useNSEVirtualiser } from "../Virtualisation";
import { useNSEDataViewDragHost } from "../../Drag";
import type { NSECollectionViewProps } from "./collectionTypes";
import "./nse-collection-view.css";

export function NSECollectionView<T, TId extends string | number>({
  adapter,
  layout,
  renderItem,
  state = { kind: "ready" },
  selectionMode = "multiple",
  pointerActivation = "double-click",
  viewportInlineSize = 640,
  viewportBlockSize = 480,
  viewportRef: suppliedViewportRef,
  canvasRef: suppliedCanvasRef,
  editableLabels = false,
  onSelectionChange,
  onActivate,
  onRequestReorder,
  onValidateDrop,
  onAcceptDrop,
  dragBinding,
  dragEndpoint,
  dir,
  className = "",
  style,
  onKeyDown,
  ...props
}: NSECollectionViewProps<T, TId>) {
  const view = useNSEDataView(adapter, {
    selectionMode,
    state,
    onSelectionChange,
    delegate: { didActivate: onActivate },
  });
  const layoutInput = useMemo(() => ({ count: view.snapshot.items.length, viewportInlineSize }), [view.snapshot.items.length, viewportInlineSize]);
  const columnCount = layout.columnCount(layoutInput);
  const rowCount = layout.rowCount(layoutInput);
  if (!Number.isSafeInteger(columnCount) || columnCount <= 0) throw new RangeError("Collection layout column count must be a positive safe integer.");
  if (!Number.isSafeInteger(rowCount) || rowCount < 0) throw new RangeError("Collection layout row count must be a non-negative safe integer.");
  const activeIndex = view.snapshot.activeId === null ? -1 : view.coordinator.indexForId(view.snapshot.activeId);
  const activeRow = activeIndex < 0 ? -1 : layout.itemAt(activeIndex, layoutInput)?.row ?? -1;
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(suppliedViewportRef, () => viewportRef.current!, []);
  useImperativeHandle(suppliedCanvasRef, () => canvasRef.current!, []);
  const [inheritedDirection, setInheritedDirection] = useState<"ltr" | "rtl">("ltr");
  const [dragStatus, setDragStatus] = useState("");
  const allowsMutation = dataViewAllowsMutation(state);
  const dragHost = useNSEDataViewDragHost({ binding: dragBinding, endpoint: dragEndpoint, validate: onValidateDrop, accept: onAcceptDrop, onStatus: setDragStatus, enabled: allowsMutation });
  useLayoutEffect(() => {
    if (dir) { setInheritedDirection(dir === "rtl" ? "rtl" : "ltr"); return; }
    const inherited = viewportRef.current?.closest<HTMLElement>("[dir]")?.dir;
    setInheritedDirection(inherited === "rtl" ? "rtl" : "ltr");
  }, [dir]);
  const effectiveDirection = dir === "rtl" ? "rtl" : dir ? "ltr" : inheritedDirection;
  const virtualiser = useNSEVirtualiser({
    count: rowCount,
    axis: "block",
    overscan: 2,
    estimateSize: layout.itemSize.block + layout.minimumGap,
    sizingGeneration: `${layout.itemSize.block}:${layout.minimumGap}`,
    getKey: (index) => `row-${index}`,
    retainedIndices: activeRow < 0 ? undefined : new Set([activeRow]),
    viewportRef,
    viewportSize: viewportBlockSize,
  });
  const renderedRows = new Set(virtualiser.snapshot.items.map(({ index }) => index));
  const move = (direction: "up" | "down" | "left" | "right") => {
    if (activeIndex < 0) return;
    const logicalDirection = effectiveDirection === "rtl" && direction === "left" ? "right" : effectiveDirection === "rtl" && direction === "right" ? "left" : direction;
    const next = layout.indexInDirection(activeIndex, logicalDirection, layoutInput);
    if (next === null) return;
    const entry = view.snapshot.items[next];
    if (!entry) return;
    view.coordinator.setActive(entry.id);
    virtualiser.scrollToIndex(layout.itemAt(next, layoutInput)!.row, "nearest");
  };

  const requestReorder = (direction: "up" | "down" | "left" | "right") => {
    if (!dataViewAllowsMutation(state) || !onRequestReorder || activeIndex < 0) return false;
    const logicalDirection = effectiveDirection === "rtl" && direction === "left" ? "right" : effectiveDirection === "rtl" && direction === "right" ? "left" : direction;
    const next = layout.indexInDirection(activeIndex, logicalDirection, layoutInput);
    if (next === null) return false;
    const selected = view.snapshot.selection.selectedIds.has(view.snapshot.activeId!)
      ? [...view.snapshot.selection.selectedIds]
      : [view.snapshot.activeId!];
    onRequestReorder(selected, next > activeIndex ? next + 1 : next);
    return true;
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (dataViewEventIsComposing(event)) { onKeyDown?.(event); return; }
    const direction = event.key === "ArrowUp" ? "up" : event.key === "ArrowDown" ? "down" : event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : null;
    if (allowsMutation && dragBinding && dragEndpoint && event.altKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      const selected = view.snapshot.items.filter(({ id }) => view.snapshot.selection.selectedIds.has(id)).map(({ id }) => id);
      const ids = selected.length > 0 ? selected : view.snapshot.activeId === null ? [] : [view.snapshot.activeId];
      if (ids.length > 0) { dragBinding.begin(ids, dragEndpoint); setDragStatus(`${ids.length} item${ids.length === 1 ? "" : "s"} ready to move.`); }
    } else if (allowsMutation && dragBinding && dragEndpoint && event.altKey && event.key === "Enter") {
      event.preventDefault();
      const targetId = view.snapshot.activeId;
      const insertionIndex = targetId === null ? view.snapshot.items.length : view.coordinator.indexForId(targetId);
      void dragBinding.drop({ targetId, insertionIndex, operation: "on" }, dragEndpoint, {
        validate: onValidateDrop,
        accept: onAcceptDrop,
      }).then((accepted) => setDragStatus(accepted ? "Drop completed." : "Drop rejected; selection restored."))
        .catch(() => setDragStatus("Drop failed; selection restored."));
    } else if (dragBinding && event.key === "Escape") {
      dragBinding.cancel("keyboard cancellation"); setDragStatus("Drag cancelled; selection restored.");
    } else if (direction) {
      event.preventDefault();
      if (!event.altKey || !requestReorder(direction)) move(direction);
    } else if (event.key === "F2" && editableLabels && view.snapshot.activeId !== null) {
      event.preventDefault();
      view.coordinator.beginEditing(view.snapshot.activeId, () => undefined);
    } else if (event.key === "Escape" && view.snapshot.editingId !== null) {
      event.preventDefault(); view.coordinator.cancelEditing();
    } else view.rootProps.onKeyDown?.(event);
    onKeyDown?.(event);
  };

  const totalBlockSize = rowCount === 0 ? 0 : layout.sectionInset.blockStart + rowCount * layout.itemSize.block + Math.max(0, rowCount - 1) * layout.minimumGap + layout.sectionInset.blockEnd;
  if (!Number.isFinite(totalBlockSize) || totalBlockSize < 0) throw new RangeError("Collection total block geometry exceeds the supported finite range.");
  const rootStyle = { ...style, "--nse-collection-inline-size": `${viewportInlineSize}px`, "--nse-collection-block-size": `${viewportBlockSize}px` } as CSSProperties;
  return (
    <div className="nse-collection-container" data-state={state.kind}>
      <div
        {...props}
        {...view.rootProps}
        ref={viewportRef}
        dir={dir}
        role="grid"
        aria-rowcount={rowCount}
        aria-colcount={columnCount}
        aria-readonly={state.kind === "read-only" || undefined}
        className={`nse-collection-view ${className}`.trim()}
        data-nse-control="collection-view"
        style={rootStyle}
        onKeyDown={handleKey}
      >
        <div className="nse-collection-canvas-sizer">
          <div ref={canvasRef} className="nse-collection-canvas" style={{ blockSize: totalBlockSize, inlineSize: viewportInlineSize }}>
            {[...renderedRows].sort((a, b) => a - b).map((row) => (
              <div key={row} role="row" className="nse-collection-row">
                {Array.from({ length: Math.max(0, Math.min(columnCount, view.snapshot.items.length - row * columnCount)) }, (_, column) => layout.itemAt(row * columnCount + column, layoutInput)!).map((position) => {
                const entry = view.snapshot.items[position.index]!;
                const itemProps = view.itemProps(entry.id);
                const selectFromPointer = itemProps.onClick;
                const focused = Object.is(view.snapshot.activeId, entry.id);
                const selected = view.snapshot.selection.selectedIds.has(entry.id);
                const editing = Object.is(view.snapshot.editingId, entry.id);
                const sourceIds = selected
                  ? view.snapshot.items.filter(({ id }) => view.snapshot.selection.selectedIds.has(id)).map(({ id }) => id)
                  : [entry.id];
                return (
                  <div
                    {...itemProps}
                    key={encodeNSEDataViewKey(entry.id)}
                    role="gridcell"
                    aria-colindex={position.column + 1}
                    aria-rowindex={position.row + 1}
                    className="nse-collection-item"
                    data-appearance-recipe="collection-item"
                    data-selected={selected || undefined}
                    data-focused={focused || undefined}
                    data-editing={editing || undefined}
                    draggable={Boolean(allowsMutation && !entry.disabled && dragBinding && dragEndpoint)}
                    onClick={(event) => {
                      selectFromPointer?.(event);
                      if (pointerActivation === "single-click" && event.detail <= 1) view.coordinator.activate(entry.id);
                    }}
                    onDoubleClick={pointerActivation === "single-click" ? undefined : itemProps.onDoubleClick}
                    onDragStart={entry.disabled ? undefined : (event) => dragHost.start(event, sourceIds)}
                    onDragOver={entry.disabled ? undefined : (event) => dragHost.over(event, entry.id, position.index)}
                    onDrop={entry.disabled ? undefined : (event) => dragHost.drop(event, entry.id, position.index)}
                    onDragEnd={dragHost.end}
                    style={{ insetInlineStart: position.inlineStart, insetBlockStart: position.blockStart, inlineSize: position.inlineSize, blockSize: position.blockSize }}
                  >
                    {renderItem({ item: entry.item, id: entry.id, selected, focused, editing })}
                  </div>
                );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {(dragStatus || dataViewAnnouncement(state)) && <div className="nse-collection-status" role="status" aria-live="polite">{dragStatus || dataViewAnnouncement(state)}</div>}
    </div>
  );
}
