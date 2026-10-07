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

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { dataViewAllowsMutation, dataViewAllowsNavigation, dataViewIsBusy, dataViewIsDisabled, encodeNSEDataViewKey } from "../Core";
import { NSEBrowserColumn } from "./NSEBrowserColumn";
import { NSEBrowserRequestGate } from "./browserRequestGate";
import { NSEBrowserDataError, type NSEBrowserColumnState, type NSEBrowserDataSource, type NSEBrowserItemPresentation, type NSEBrowserPathItem, type NSEBrowserProps } from "./browserTypes";
import "./nse-browser.css";

function ownData(error: unknown, name: string): unknown {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  try { const descriptor = Object.getOwnPropertyDescriptor(error, name); return descriptor && "value" in descriptor ? descriptor.value : undefined; }
  catch { return undefined; }
}

function errorState<T, TId extends string | number>(error: unknown, owner?: { readonly signal: AbortSignal; accepts(): boolean }): NSEBrowserColumnState<T, TId> {
  const candidate = ownData(error, "message");
  const message = typeof candidate === "string" && candidate.length > 0 ? candidate.slice(0, 512) : "Browser data could not be loaded.";
  const retryValue = ownData(error, "retry");
  const retry = typeof retryValue === "function" && owner !== undefined
    ? () => {
      if (owner.signal.aborted || !owner.accepts()) return;
      try { void Promise.resolve(Reflect.apply(retryValue, error, [owner.signal])).catch(() => undefined); }
      catch { /* A retry failure remains contained by the current error presentation. */ }
    }
    : undefined;
  return Object.freeze({ parentId: null, items: [], presentation: [], activeId: null, status: "error", message, retry });
}

interface ValidatedBrowserItems<T, TId extends string | number> {
  readonly items: readonly T[];
  readonly ids: readonly TId[];
  readonly presentation: readonly NSEBrowserItemPresentation<T, TId>[];
}

function validatedItems<T, TId extends string | number>(value: unknown, dataSource: NSEBrowserDataSource<T, TId>): ValidatedBrowserItems<T, TId> {
  if (!Array.isArray(value)) throw new NSEBrowserDataError("shape", "Browser columns must load a dense array.");
  let descriptors: PropertyDescriptorMap;
  try { descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap; } catch { throw new NSEBrowserDataError("shape", "Browser columns must expose own data entries."); }
  const length = descriptors.length && "value" in descriptors.length ? descriptors.length.value : undefined;
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) throw new NSEBrowserDataError("shape", "Browser columns must have a supported array length.");
  const items: T[] = []; const ids: TId[] = []; const presentation: NSEBrowserItemPresentation<T, TId>[] = []; const seen = new Set<string>();
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) throw new NSEBrowserDataError("shape", "Browser columns must be dense data arrays.");
    const item = descriptor.value as T;
    if ((typeof item === "object" || typeof item === "function") && item !== null) {
      let prototype: object | null;
      try { prototype = Object.getPrototypeOf(item) as object | null; } catch { throw new NSEBrowserDataError("shape", "Browser items must expose own data properties."); }
      if (prototype !== Object.prototype && prototype !== null) throw new NSEBrowserDataError("shape", "Browser items must use own data properties without inherited prototypes.");
      let itemDescriptors: PropertyDescriptorMap;
      try { itemDescriptors = Object.getOwnPropertyDescriptors(item); } catch { throw new NSEBrowserDataError("shape", "Browser items must expose own data properties."); }
      if (Object.values(itemDescriptors).some((property) => !("value" in property))) throw new NSEBrowserDataError("shape", "Browser item properties must be own data properties.");
    }
    let id: TId; let key: string; let label: string; let leaf: boolean; let icon;
    id = dataSource.idForItem(item);
    try { key = encodeNSEDataViewKey(id); }
    catch { throw new NSEBrowserDataError("identity", "Browser item identity must be a supported finite string or number."); }
    label = dataSource.labelForItem(item);
    leaf = dataSource.isLeaf(item);
    icon = dataSource.iconForItem?.(item);
    if (typeof label !== "string") throw new NSEBrowserDataError("shape", "Browser item labels must be strings.");
    if (typeof leaf !== "boolean") throw new NSEBrowserDataError("shape", "Browser leaf projections must be booleans.");
    if (seen.has(key)) throw new NSEBrowserDataError("duplicate", "Browser item identities must be unique within each column.");
    seen.add(key); items.push(item); ids.push(id); presentation.push(Object.freeze({ item, id, label, leaf, icon }));
  }
  return Object.freeze({ items: Object.freeze(items), ids: Object.freeze(ids), presentation: Object.freeze(presentation) });
}

export function NSEBrowser<T, TId extends string | number>({
  dataSource,
  presentation,
  path,
  defaultPath = [],
  onPathChange,
  onActivateLeaf,
  columnWidths,
  defaultColumnWidth = 220,
  onColumnWidthsChange,
  minimumColumnWidth = 140,
  maximumColumnWidth = 480,
  state = { kind: "ready" },
  dir = "ltr",
  className = "",
  ...props
}: NSEBrowserProps<T, TId>) {
  const allowsNavigation = dataViewAllowsNavigation(state);
  const allowsMutation = dataViewAllowsMutation(state);
  const disabled = dataViewIsDisabled(state);
  const label = String(props["aria-label"] ?? "Browser");
  const [internalPath, setInternalPath] = useState<readonly NSEBrowserPathItem<T, TId>[]>(defaultPath);
  const effectivePath = path ?? internalPath;
  const [columns, setColumns] = useState<readonly NSEBrowserColumnState<T, TId>[]>([
    { parentId: null, items: [], presentation: [], activeId: null, status: "loading", message: "Loading" },
  ]);
  const [rootItems, setRootItems] = useState<ValidatedBrowserItems<T, TId> | null>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const [focusColumn, setFocusColumn] = useState<number | null>(null);
  const rootGate = useMemo(() => new NSEBrowserRequestGate(), [dataSource]);
  const pathGate = useMemo(() => new NSEBrowserRequestGate(), [dataSource]);

  const publishPath = useCallback((next: readonly NSEBrowserPathItem<T, TId>[]) => {
    if (path === undefined) setInternalPath(Object.freeze([...next]));
    onPathChange?.(Object.freeze([...next]));
  }, [onPathChange, path]);

  const loadRoot = useCallback(async () => {
    const request = rootGate.begin();
    setRootItems(null);
    setColumns([{ parentId: null, items: [], presentation: [], activeId: null, status: "loading", message: "Loading" }]);
    try {
      const loaded = await dataSource.rootItems(request.signal);
      if (!rootGate.accepts(request.generation)) return;
      setRootItems(validatedItems(loaded, dataSource));
    } catch (error) {
      if (!rootGate.accepts(request.generation)) return;
      setColumns([errorState(error, { signal: request.signal, accepts: () => rootGate.accepts(request.generation) })]);
    }
  }, [dataSource, rootGate]);

  useEffect(() => {
    void loadRoot();
    return () => { rootGate.abort(); pathGate.abort(); };
  }, [loadRoot, pathGate, rootGate]);

  useEffect(() => {
    if (rootItems === null) return;
    const request = pathGate.begin();
    const hydrate = async () => {
      const next: NSEBrowserColumnState<T, TId>[] = [];
      try {
        let { items, ids, presentation: itemPresentation } = rootItems;
        for (let columnIndex = 0; ; columnIndex += 1) {
        const requested = effectivePath[columnIndex];
        const matchedIndex = requested === undefined ? -1 : ids.findIndex((id) => Object.is(id, requested.id));
        const matched = matchedIndex < 0 ? undefined : items[matchedIndex];
        const activeId = matched === undefined
          ? (ids[0] ?? null)
          : ids[matchedIndex]!;
        next.push({
          parentId: columnIndex === 0 ? null : effectivePath[columnIndex - 1]?.id ?? null,
          items: Object.freeze([...items]),
          presentation: itemPresentation,
          activeId,
          status: items.length === 0 ? "empty" : "ready",
          message: items.length === 0 ? "No items" : undefined,
        });
        if (matched === undefined) break;
        if (itemPresentation[matchedIndex]!.leaf) break;
        try {
          const loaded = await dataSource.children(matched, request.signal);
          if (!pathGate.accepts(request.generation)) return;
          ({ items, ids, presentation: itemPresentation } = validatedItems(loaded, dataSource));
        } catch (error) {
          if (!pathGate.accepts(request.generation)) return;
          next.push({ ...errorState<T, TId>(error, { signal: request.signal, accepts: () => pathGate.accepts(request.generation) }), parentId: requested!.id });
          setColumns(Object.freeze(next));
          return;
        }
        if (!pathGate.accepts(request.generation)) return;
        }
        if (pathGate.accepts(request.generation)) setColumns(Object.freeze(next));
      } catch (error) {
        if (!pathGate.accepts(request.generation)) return;
        next.push(errorState<T, TId>(error, { signal: request.signal, accepts: () => pathGate.accepts(request.generation) }));
        setColumns(Object.freeze(next));
      }
    };
    void hydrate();
    return () => pathGate.abort();
  }, [dataSource, effectivePath, pathGate, rootItems]);

  useEffect(() => {
    if (focusColumn === null) return;
    const target = browserRef.current?.querySelector<HTMLElement>(`[data-column-index="${focusColumn}"]`);
    if (target?.isConnected) target.focus();
    setFocusColumn(null);
  }, [columns, focusColumn, presentation]);

  const setActive = (columnIndex: number, id: TId) => {
    if (!allowsNavigation) return;
    setColumns((current) => current.map((column, index) => index === columnIndex ? { ...column, activeId: id } : column));
  };

  const choose = (columnIndex: number, selected: NSEBrowserItemPresentation<T, TId>) => {
    if (!allowsNavigation) return;
    const { id, item, leaf } = selected;
    if (leaf) {
      onActivateLeaf?.(Object.freeze({ id, item }));
      return;
    }
    const nextPath = Object.freeze([...effectivePath.slice(0, columnIndex), Object.freeze({ id, item })]);
    publishPath(nextPath);
    setFocusColumn(columnIndex + 1);
    setColumns((current) => [...current.slice(0, columnIndex + 1), { parentId: id, items: [], presentation: [], activeId: null, status: "loading", message: "Loading" }]);
  };

  const back = (columnIndex: number) => {
    if (!allowsNavigation || columnIndex <= 0) return;
    pathGate.abort();
    publishPath(effectivePath.slice(0, columnIndex - 1));
    setColumns((current) => current.slice(0, columnIndex));
    setFocusColumn(columnIndex - 1);
  };

  const visibleIndices = presentation === "compact" ? [Math.max(0, columns.length - 1)] : columns.map((_, index) => index);
  const widths = columns.map((_, index) => Math.max(minimumColumnWidth, Math.min(maximumColumnWidth, columnWidths?.[index] ?? defaultColumnWidth)));
  const resize = (index: number, delta: number) => {
    if (!allowsMutation) return;
    const next = [...widths];
    next[index] = Math.max(minimumColumnWidth, Math.min(maximumColumnWidth, next[index]! + delta));
    onColumnWidthsChange?.(Object.freeze(next));
  };

  return (
    <div {...props} ref={browserRef} className={`nse-browser ${className}`.trim()} data-nse-control="browser" data-presentation={presentation} data-state={state.kind} aria-busy={dataViewIsBusy(state) || undefined} aria-disabled={disabled || undefined}>
      {presentation === "compact" && columns.length > 1 && (
        <button type="button" className="nse-browser-back" onClick={() => back(columns.length - 1)}>Back to {columns.length === 2 ? label : columns.at(-2)?.presentation.find((item) => Object.is(item.id, effectivePath.at(-2)?.id))?.label ?? label}</button>
      )}
      <div className="nse-browser-columns" data-testid="browser-columns" dir={dir} data-appearance-recipe="browser-scroller">
        {visibleIndices.map((columnIndex) => {
          const column = columns[columnIndex]!;
          return (
            <div key={`${columnIndex}-${column.parentId === null ? "root" : encodeNSEDataViewKey(column.parentId)}`} className="nse-browser-column-shell" style={{ inlineSize: widths[columnIndex] }}>
              <NSEBrowserColumn
                label={`${label} column ${columnIndex + 1}`}
                index={columnIndex}
                state={column}
                expandedId={effectivePath[columnIndex]?.id ?? null}
                onActiveChange={(id) => setActive(columnIndex, id)}
                onChoose={(item) => choose(columnIndex, item)}
                onBack={() => back(columnIndex)}
                disabled={!allowsNavigation}
              />
              <div
                role="separator"
                aria-label={`Resize ${label} column ${columnIndex + 1}`}
                aria-orientation="vertical"
                aria-valuemin={minimumColumnWidth}
                aria-valuemax={maximumColumnWidth}
                aria-valuenow={widths[columnIndex]}
                aria-disabled={!allowsMutation || undefined}
                tabIndex={allowsMutation ? 0 : -1}
                className="nse-browser-resize"
                data-appearance-recipe="browser-resize-grip"
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "ArrowRight") { event.preventDefault(); resize(columnIndex, dir === "rtl" ? -8 : 8); }
                  if (event.key === "ArrowLeft") { event.preventDefault(); resize(columnIndex, dir === "rtl" ? 8 : -8); }
                  if (event.key === "Home") { event.preventDefault(); resize(columnIndex, minimumColumnWidth - widths[columnIndex]!); }
                  if (event.key === "End") { event.preventDefault(); resize(columnIndex, maximumColumnWidth - widths[columnIndex]!); }
                }}
              />
            </div>
          );
        })}
      </div>
      {state.kind !== "ready" && <div role="status">{state.message}</div>}
      {(state.kind === "denied" || state.kind === "error") && state.retry && <button type="button" onClick={state.retry}>Retry</button>}
      {state.kind === "interrupted" && state.resume && <button type="button" onClick={state.resume}>Resume</button>}
    </div>
  );
}
