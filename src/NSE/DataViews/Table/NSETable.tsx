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
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { SortDescriptor } from "../../../SynCloudOS/Models";
import { dataViewAllowsMutation, dataViewAnnouncement, dataViewEventIsComposing, dataViewIsBusy, encodeNSEDataViewKey, useNSEDataView } from "../Core";
import { useNSEVirtualiser } from "../Virtualisation";
import { nseDragCommandIds, nseDragNoPayload, useNSEDataViewDragHost } from "../../Drag";
import { useNSEThemeRecipe } from "../../Appearance";
import { NSETableCell } from "./NSETableCell";
import { NSETableHeader } from "./NSETableHeader";
import type {
  NSETableColumn,
  NSETableColumnConfiguration,
  NSETableEditContext,
  NSETableProps,
} from "./tableTypes";
import "./nse-table-view.css";

export function rowAtNSETablePoint(input: { readonly block: number; readonly rowHeight: number; readonly rowCount: number }): number {
  if (input.block < 0 || input.rowHeight <= 0) return -1;
  const row = Math.floor(input.block / input.rowHeight);
  return row >= input.rowCount ? -1 : row;
}

export function columnAtNSETablePoint(input: { readonly inline: number; readonly widths: readonly number[] }): number {
  if (input.inline < 0) return -1;
  let offset = 0;
  for (let index = 0; index < input.widths.length; index += 1) {
    offset += input.widths[index]!;
    if (input.inline < offset) return index;
  }
  return -1;
}

function validateColumns<T, TId>(columns: readonly NSETableColumn<T, TId, unknown>[]): void {
  const ids = new Set<string>();
  for (const column of columns) {
    if (!column.id.trim() || ids.has(column.id)) throw new TypeError("Table column ids must be unique and non-empty.");
    ids.add(column.id);
    if (
      !Number.isFinite(column.width.min) || !Number.isFinite(column.width.ideal) || !Number.isFinite(column.width.max) ||
      column.width.min < 0 || column.width.ideal < column.width.min || column.width.max < column.width.ideal
    ) throw new RangeError(`Table column "${column.id}" has invalid width constraints.`);
  }
}

interface EditState<TId> {
  readonly id: TId;
  readonly columnId: string;
  readonly text: string;
  readonly error: string | null;
  readonly pending: boolean;
}

export function NSETable<T, TId extends string | number>({
  adapter,
  columns,
  state: requestedState = { kind: "ready" },
  selectionMode = "multiple",
  allowsEmptySelection = true,
  rowHeight = 23,
  headerHeight: suppliedHeaderHeight = 23,
  headerHidden = false,
  viewportBlockSize = 460,
  locale = "en-GB",
  columnVisibility = {},
  columnOrder,
  columnWidths = {},
  sortDescriptors,
  columnMenu,
  onColumnConfigurationChange,
  onSortDescriptorsChange,
  onSelectionChange,
  onDoubleAction,
  onEditCommit,
  onValidateDrop,
  onAcceptDrop,
  dragBinding,
  dragEndpoint,
  commands,
  responderId,
  onCommandFocus,
  className = "",
  style,
  onKeyDown,
  ...props
}: NSETableProps<T, TId>) {
  validateColumns(columns);
  const headerHeight = headerHidden ? 0 : suppliedHeaderHeight;
  const domProps = { ...props };
  Reflect.deleteProperty(domProps, "appearanceLoader");
  const instanceId = useId().replace(/:/g, "");
  const [internalWidths, setInternalWidths] = useState<Record<string, number>>(() => Object.fromEntries(columns.map((column) => [column.id, column.width.ideal])));
  const [activeColumn, setActiveColumn] = useState(0);
  const [edit, setEdit] = useState<EditState<TId> | null>(null);
  const [dragStatus, setDragStatus] = useState("");
  const view = useNSEDataView(adapter, { selectionMode, state: requestedState, onSelectionChange });
  const state = view.state;
  const allowsMutation = dataViewAllowsMutation(state);
  const dragHost = useNSEDataViewDragHost({
    binding: dragBinding,
    endpoint: dragEndpoint,
    validate: onValidateDrop,
    accept: onAcceptDrop,
    onStatus: setDragStatus,
    enabled: allowsMutation,
  });
  const editRequest = useRef<{ generation: number; controller: AbortController } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const tableHeaderAppearance = useNSEThemeRecipe("table.header.normal");
  const tableHeaderHoverAppearance = useNSEThemeRecipe("table.header.hover");
  const tableHeaderPressedAppearance = useNSEThemeRecipe("table.header.pressed");
  const tableHeaderHoverPressedAppearance = useNSEThemeRecipe("table.header.hover-pressed");
  const tableSortAscendingAppearance = useNSEThemeRecipe("table.sort-glyph.ascending");
  const tableSortDescendingAppearance = useNSEThemeRecipe("table.sort-glyph.descending");

  const orderedColumns = useMemo(() => {
    const byId = new Map(columns.map((column) => [column.id, column]));
    const requested = (columnOrder ?? columns.map(({ id }) => id)).filter((id, index, values) => values.indexOf(id) === index);
    return [...requested, ...columns.map(({ id }) => id).filter((id) => !requested.includes(id))]
      .map((id) => byId.get(id))
      .filter((column): column is NSETableColumn<T, TId, unknown> => column !== undefined && columnVisibility[column.id] !== false);
  }, [columnOrder, columnVisibility, columns]);
  const widths = useMemo(() => Object.fromEntries(orderedColumns.map((column) => [
    column.id,
    Math.min(column.width.max, Math.max(column.width.min, columnWidths[column.id] ?? internalWidths[column.id] ?? column.width.ideal)),
  ])), [columnWidths, internalWidths, orderedColumns]);
  const activeRowIndex = view.snapshot.activeId === null
    ? 0
    : Math.max(0, view.coordinator.indexForId(view.snapshot.activeId));
  const virtualiser = useNSEVirtualiser({
    count: view.snapshot.items.length,
    axis: "block",
    overscan: 2,
    estimateSize: rowHeight,
    sizingGeneration: rowHeight,
    getKey: (index) => encodeNSEDataViewKey(view.snapshot.items[index]!.id),
    retainedIndices: view.snapshot.activeId === null ? undefined : new Set([activeRowIndex]),
    viewportSize: headerHeight + viewportBlockSize,
    viewportInsetEnd: headerHeight,
    viewportRef,
  });

  useEffect(() => () => editRequest.current?.controller.abort(), []);
  useEffect(() => {
    // A disposed controller keeps its last rows on screen but accepts no changes.
    if (sortDescriptors && !adapter.controller.isDisposed) adapter.controller.setSortDescriptors(sortDescriptors);
  }, [adapter.controller, sortDescriptors]);
  useEffect(() => {
    if (!allowsEmptySelection && !adapter.controller.isDisposed && view.snapshot.selection.selectedIds.size === 0) {
      const first = view.snapshot.items.find(({ disabled }) => !disabled);
      if (first) adapter.controller.select([first.id]);
    }
  }, [adapter.controller, allowsEmptySelection, view.snapshot.items, view.snapshot.selection.selectedIds.size]);
  useEffect(() => {
    if (activeColumn >= orderedColumns.length) setActiveColumn(Math.max(0, orderedColumns.length - 1));
  }, [activeColumn, orderedColumns.length]);

  const cellId = useCallback((id: TId, columnId: string) => `nse-table-${instanceId}-${encodeNSEDataViewKey(id)}-${encodeNSEDataViewKey(columnId)}`, [instanceId]);
  const activeColumnDefinition = orderedColumns[activeColumn];
  const activeDescendant = view.snapshot.activeId === null || !activeColumnDefinition
    ? undefined
    : cellId(view.snapshot.activeId, activeColumnDefinition.id);
  const publishConfiguration = (nextWidths: Readonly<Record<string, number>>) => {
    const configuration: NSETableColumnConfiguration = {
      order: Object.freeze(orderedColumns.map(({ id }) => id)),
      visibility: Object.freeze({ ...columnVisibility }),
      widths: Object.freeze({ ...nextWidths }),
    };
    onColumnConfigurationChange?.(configuration);
  };

  const resizeColumn = (column: NSETableColumn<T, TId, unknown>, width: number) => {
    if (!allowsMutation) return;
    const next = { ...internalWidths, [column.id]: Math.min(column.width.max, Math.max(column.width.min, Math.round(width))) };
    setInternalWidths(next);
    publishConfiguration({ ...widths, [column.id]: next[column.id]! });
  };

  const sortColumn = (column: NSETableColumn<T, TId, unknown>) => {
    if (!allowsMutation || !column.sort) return;
    const current = adapter.controller.getSnapshot().sortDescriptors.find((descriptor) => descriptor instanceof SortDescriptor && descriptor.id === column.id) as SortDescriptor<T, unknown> | undefined;
    const next = current
      ? [current.reversed()]
      : [new SortDescriptor<T, unknown>({ id: column.id, select: column.value, compare: column.sort.compare, direction: "ascending" })];
    onSortDescriptorsChange?.(next);
    adapter.controller.setSortDescriptors(next);
  };

  const cancelEdit = useCallback(() => {
    editRequest.current?.controller.abort();
    editRequest.current = null;
    setEdit(null);
  }, []);

  const beginEdit = (id: TId, column: NSETableColumn<T, TId, unknown>) => {
    if (!column.editable || (!column.format && !column.editor) || !allowsMutation) return false;
    const entry = view.coordinator.entryForId(id);
    if (!entry) return false;
    const value = column.value(entry.item);
    editRequest.current?.controller.abort();
    const request = { generation: (editRequest.current?.generation ?? 0) + 1, controller: new AbortController() };
    editRequest.current = request;
    if (!view.coordinator.beginEditing(id, cancelEdit)) { request.controller.abort(); editRequest.current = null; return false; }
    setEdit({ id, columnId: column.id, text: column.format?.editingText(value, { locale }) ?? String(value ?? ""), error: null, pending: false });
    return true;
  };

  const commitEdit = async (providedValue?: unknown) => {
    if (!edit) return;
    const entry = view.coordinator.entryForId(edit.id);
    const column = orderedColumns.find(({ id }) => id === edit.columnId);
    if (!entry || !column || (!column.format && providedValue === undefined)) return view.coordinator.cancelEditing();
    const parsed = providedValue === undefined
      ? column.format!.parse(edit.text, { locale })
      : ({ ok: true, value: providedValue } as const);
    if (!parsed.ok) {
      setEdit({ ...edit, error: parsed.error.message, pending: false });
      return;
    }
    const request = editRequest.current;
    if (!request) return;
    const { generation, controller } = request;
    setEdit({ ...edit, error: null, pending: true });
    const context: NSETableEditContext<T, TId, unknown> = {
      item: entry.item,
      id: entry.id,
      columnId: column.id,
      previousValue: column.value(entry.item),
      value: parsed.value,
      signal: controller.signal,
    };
    try {
      await onEditCommit?.(context);
      if (editRequest.current?.generation !== generation || controller.signal.aborted) return;
      controller.abort();
      editRequest.current = null;
      setEdit(null);
      view.coordinator.finishEditing();
    } catch (error) {
      if (controller.signal.aborted || editRequest.current?.generation !== generation) return;
      setEdit({ ...edit, error: error instanceof Error ? error.message : "The value could not be saved.", pending: false });
    }
  };

  const keyboardDragIds = () => {
    const selected = view.snapshot.items
      .filter(({ id }) => view.snapshot.selection.selectedIds.has(id))
      .map(({ id }) => id);
    return selected.length > 0 ? selected : view.snapshot.activeId === null ? [] : [view.snapshot.activeId];
  };
  const canBeginKeyboardDrag = () => allowsMutation && Boolean(dragBinding && dragEndpoint) && keyboardDragIds().length > 0;
  const beginKeyboardDrag = () => {
    if (!allowsMutation || !dragBinding || !dragEndpoint) return false;
    const ids = keyboardDragIds();
    if (ids.length === 0) return false;
    dragBinding.begin(ids, dragEndpoint);
    setDragStatus(`${ids.length} row${ids.length === 1 ? "" : "s"} ready to move.`);
    return true;
  };
  const dropKeyboardDrag = async (signal?: AbortSignal) => {
    if (!allowsMutation || !dragBinding || !dragEndpoint) return false;
    signal?.throwIfAborted();
    const targetId = view.snapshot.activeId;
    const insertionIndex = targetId === null ? view.snapshot.items.length : view.coordinator.indexForId(targetId);
    const accepted = await dragBinding.drop({ targetId, insertionIndex, operation: "on" }, dragEndpoint, {
      validate: onValidateDrop,
      accept: onAcceptDrop,
    });
    signal?.throwIfAborted();
    setDragStatus(accepted ? "Drop completed." : "Drop rejected; selection restored.");
    return accepted;
  };
  const cancelKeyboardDrag = () => {
    if (!dragBinding) return false;
    dragBinding.cancel("keyboard cancellation");
    setDragStatus("Drag cancelled; selection restored.");
    return true;
  };
  const dragCommandState = useRef({ beginKeyboardDrag, canBeginKeyboardDrag, dropKeyboardDrag, cancelKeyboardDrag, allowsMutation, hasEndpoint: Boolean(dragBinding && dragEndpoint) });
  dragCommandState.current = { beginKeyboardDrag, canBeginKeyboardDrag, dropKeyboardDrag, cancelKeyboardDrag, allowsMutation, hasEndpoint: Boolean(dragBinding && dragEndpoint) };
  useEffect(() => {
    if (!commands || !responderId) return;
    const beginRegistration = commands.register({
      id: nseDragCommandIds.begin,
      responderId,
      title: { key: "command.drag.begin", fallback: "Begin Drag" },
      payload: nseDragNoPayload,
      defaultKeyBindings: [],
      scope: "focused",
      undo: { kind: "none" },
      validate: () => {
        const current = dragCommandState.current;
        return { enabled: current.allowsMutation && current.hasEndpoint && current.canBeginKeyboardDrag(), disabledReason: "No selected table rows can be dragged." };
      },
      execute: () => dragCommandState.current.beginKeyboardDrag(),
    });
    const dropRegistration = commands.register({
      id: nseDragCommandIds.drop,
      responderId,
      title: { key: "command.drag.drop", fallback: "Drop Drag" },
      payload: nseDragNoPayload,
      defaultKeyBindings: [],
      scope: "focused",
      undo: { kind: "none" },
      validate: () => {
        const current = dragCommandState.current;
        return { enabled: current.allowsMutation && current.hasEndpoint, disabledReason: "This table cannot receive a drag." };
      },
      execute: ({ signal }: { readonly signal: AbortSignal }) => dragCommandState.current.dropKeyboardDrag(signal),
    });
    const cancelRegistration = commands.register({
      id: nseDragCommandIds.cancel,
      responderId,
      title: { key: "command.drag.cancel", fallback: "Cancel Drag" },
      payload: nseDragNoPayload,
      defaultKeyBindings: [],
      scope: "focused",
      undo: { kind: "none" },
      validate: () => ({ enabled: dragCommandState.current.hasEndpoint, disabledReason: "This table has no drag binding." }),
      execute: () => dragCommandState.current.cancelKeyboardDrag(),
    });
    return () => { cancelRegistration.dispose(); dropRegistration.dispose(); beginRegistration.dispose(); };
  }, [commands, responderId]);

  const handleGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (dataViewEventIsComposing(event)) { onKeyDown?.(event); return; }
    if (commands && responderId) onCommandFocus?.(responderId);
    if (allowsMutation && dragBinding && dragEndpoint && event.altKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      if (commands && responderId) void commands.dispatch(nseDragCommandIds.begin, undefined, { source: "keyboard" }).then((result) => {
        if (result.status !== "executed") setDragStatus("Drag unavailable.");
      }).catch(() => setDragStatus("Drag failed."));
      else beginKeyboardDrag();
    } else if (allowsMutation && dragBinding && dragEndpoint && event.altKey && event.key === "Enter") {
      event.preventDefault();
      if (commands && responderId) void commands.dispatch(nseDragCommandIds.drop, undefined, { source: "keyboard" }).then((result) => {
        if (result.status !== "executed") setDragStatus("Drop rejected; selection restored.");
      }).catch(() => setDragStatus("Drop failed; selection restored."));
      else void dropKeyboardDrag().catch(() => setDragStatus("Drop failed; selection restored."));
    } else if (dragBinding && event.key === "Escape") {
      if (commands && responderId) void commands.dispatch(nseDragCommandIds.cancel, undefined, { source: "keyboard" }).catch(() => setDragStatus("Drag cancellation failed."));
      else cancelKeyboardDrag();
    } else if (event.key === "End" && event.ctrlKey) {
      event.preventDefault();
      view.coordinator.moveActiveTo("end");
      setActiveColumn(Math.max(0, orderedColumns.length - 1));
      virtualiser.scrollToIndex(Math.max(0, view.snapshot.items.length - 1), "end");
    } else if (event.key === "Home" && event.ctrlKey) {
      event.preventDefault();
      view.coordinator.moveActiveTo("start");
      setActiveColumn(0);
      virtualiser.scrollToIndex(0, "start");
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveColumn((column) => Math.max(0, column - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveColumn((column) => Math.min(orderedColumns.length - 1, column + 1));
    } else if (event.key === "Enter" && view.snapshot.activeId !== null && activeColumnDefinition && beginEdit(view.snapshot.activeId, activeColumnDefinition)) {
      event.preventDefault();
    } else {
      view.rootProps.onKeyDown?.(event);
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "PageDown" || event.key === "PageUp") {
        const active = view.coordinator.getSnapshot().activeId;
        const index = active === null ? -1 : view.coordinator.indexForId(active);
        if (index >= 0) virtualiser.scrollToIndex(index, "nearest");
      }
    }
    onKeyDown?.(event);
  };

  const status = edit?.error ?? (dragStatus || dataViewAnnouncement(state));
  const totalWidth = orderedColumns.reduce((sum, column) => sum + widths[column.id]!, 0);
  const sortSnapshot = adapter.controller.getSnapshot().sortDescriptors;

  return (
    <div className="nse-table-view-container" data-state={state.kind}>
      <div
        {...domProps}
        id={view.rootProps.id}
        ref={viewportRef}
        role="grid"
        tabIndex={view.rootProps.tabIndex}
        aria-activedescendant={activeDescendant}
        aria-busy={dataViewIsBusy(state) || edit?.pending || undefined}
        aria-disabled={view.rootProps["aria-disabled"]}
        aria-readonly={state.kind === "read-only" || undefined}
        aria-rowcount={view.snapshot.items.length + (headerHidden ? 0 : 1)}
        aria-colcount={orderedColumns.length}
        className={`nse-table-view ${className}`.trim()}
        style={{ ...style, blockSize: `${headerHeight + viewportBlockSize}px`, overflow: "auto" }}
        data-nse-control="table-view"
        {...tableHeaderAppearance.attributes}
        data-nse-table-header-hover-slot={tableHeaderHoverAppearance.slot}
        data-nse-table-header-hover-recipe-id={tableHeaderHoverAppearance.recipeId}
        data-nse-table-header-pressed-slot={tableHeaderPressedAppearance.slot}
        data-nse-table-header-pressed-recipe-id={tableHeaderPressedAppearance.recipeId}
        data-nse-table-header-hover-pressed-slot={tableHeaderHoverPressedAppearance.slot}
        data-nse-table-header-hover-pressed-recipe-id={tableHeaderHoverPressedAppearance.recipeId}
        data-nse-table-sort-ascending-slot={tableSortAscendingAppearance.slot}
        data-nse-table-sort-ascending-recipe-id={tableSortAscendingAppearance.recipeId}
        data-nse-table-sort-descending-slot={tableSortDescendingAppearance.slot}
        data-nse-table-sort-descending-recipe-id={tableSortDescendingAppearance.recipeId}
        data-state={state.kind}
        data-appearance-recipe="table-view"
        onKeyDown={handleGridKey}
      >
      {headerHidden ? null : <NSETableHeader
        height={headerHeight}
        width={totalWidth}
        menu={columnMenu}
        disabled={!allowsMutation}
        columns={orderedColumns.map((column) => {
          const descriptor = sortSnapshot.find((candidate) => candidate instanceof SortDescriptor && candidate.id === column.id) as SortDescriptor<T, unknown> | undefined;
          return {
            id: column.id,
            title: column.title,
            width: widths[column.id]!,
            minimum: column.width.min,
            maximum: column.width.max,
            sortable: column.sort !== undefined,
            sortDirection: descriptor?.direction ?? null,
            onSort: () => sortColumn(column),
            onResize: (width: number) => resizeColumn(column, width),
          };
        })}
      />}
      <div role="rowgroup" data-nse-part="body" style={{ position: "relative", blockSize: `${virtualiser.snapshot.range.totalSize}px`, inlineSize: `${totalWidth}px` }}>
        {virtualiser.snapshot.items.map((virtualItem) => {
          const entry = view.snapshot.items[virtualItem.index]!;
          const rowProps = view.itemProps(entry.id);
          const selected = view.snapshot.selection.selectedIds.has(entry.id);
          const sourceIds = selected
            ? view.snapshot.items.filter(({ id }) => view.snapshot.selection.selectedIds.has(id)).map(({ id }) => id)
            : [entry.id];
          return (
            <div
              key={virtualItem.key}
              role="row"
              aria-rowindex={virtualItem.index + (headerHidden ? 1 : 2)}
              aria-selected={selected}
              data-nse-part="row"
              data-state={selected ? "selected" : virtualItem.index % 2 === 0 ? "even" : "odd"}
              data-appearance-recipe={selected ? "table-selected-row" : "table-row"}
              draggable={Boolean(allowsMutation && !entry.disabled && dragBinding && dragEndpoint)}
              onDragStart={entry.disabled ? undefined : (event) => dragHost.start(event, sourceIds)}
              onDragOver={entry.disabled ? undefined : (event) => dragHost.over(event, entry.id, virtualItem.index)}
              onDrop={entry.disabled ? undefined : (event) => dragHost.drop(event, entry.id, virtualItem.index)}
              onDragEnd={dragHost.end}
              style={{ display: "flex", position: "absolute", insetBlockStart: `${virtualItem.start}px`, blockSize: `${virtualItem.size}px`, inlineSize: `${totalWidth}px` }}
            >
              {orderedColumns.map((column, columnIndex) => {
                const value = column.value(entry.item);
                const editing = edit !== null && Object.is(edit.id, entry.id) && edit.columnId === column.id ? edit : null;
                const customEditorContext = editing && column.editor && editRequest.current ? {
                  item: entry.item,
                  id: entry.id,
                  columnId: column.id,
                  previousValue: value,
                  value,
                  signal: editRequest.current.controller.signal,
                  commit: (next: unknown) => { void commitEdit(next); },
                  cancel: () => { view.coordinator.cancelEditing(); },
                } satisfies NSETableEditContext<T, TId, unknown> : null;
                const content = customEditorContext && column.editor ? column.editor(customEditorContext) : editing && column.format ? (
                  <input
                    autoFocus
                    aria-label={`Edit ${column.title}`}
                    aria-invalid={editing.error !== null}
                    aria-describedby={editing.error ? `${cellId(entry.id, column.id)}-error` : undefined}
                    disabled={editing.pending}
                    value={editing.text}
                    onChange={(event) => {
                      const partial = column.format!.validatePartial(event.target.value, { locale });
                      setEdit({ ...editing, text: partial.replacement ?? event.target.value, error: partial.valid ? null : partial.error?.message ?? "Invalid value" });
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") { event.preventDefault(); void commitEdit(); }
                      else if (event.key === "Escape") { event.preventDefault(); cancelEdit(); view.coordinator.cancelEditing(); }
                    }}
                    onBlur={() => { if (!editing.error && !editing.pending) void commitEdit(); }}
                  />
                ) : column.render
                  ? column.render(value, entry.item, entry.id)
                  : column.format?.format(value, { locale }) ?? String(value ?? "");
                return (
                  <NSETableCell
                    key={column.id}
                    id={cellId(entry.id, column.id)}
                    columnIndex={columnIndex}
                    width={widths[column.id]!}
                    alignment={column.alignment ?? "start"}
                    selected={selected}
                    focused={Object.is(view.snapshot.activeId, entry.id) && activeColumn === columnIndex}
                    onClick={(event) => {
                      setActiveColumn(columnIndex);
                      rowProps.onClick?.(event);
                    }}
                    onDoubleClick={() => { if (allowsMutation) onDoubleAction?.(entry.id, entry.item); }}
                  >
                    {content}
                    {editing?.error ? <span id={`${cellId(entry.id, column.id)}-error`} hidden>{editing.error}</span> : null}
                  </NSETableCell>
                );
              })}
            </div>
          );
        })}
      </div>
      </div>
      <span role="status" aria-live="polite" className="nse-table-view-status">{status}</span>
      {(state.kind === "error" || state.kind === "denied") && state.retry ? (
        <button type="button" data-nse-part="recovery" onClick={state.retry}>Retry</button>
      ) : state.kind === "interrupted" && state.resume ? (
        <button type="button" data-nse-part="recovery" onClick={state.resume}>Resume</button>
      ) : null}
    </div>
  );
}
