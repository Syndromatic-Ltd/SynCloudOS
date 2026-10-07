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

import React, { useEffect, useMemo, useRef } from "react";

import { NSEArrayController, NSETreeController } from "../../../src/NSE/Controllers";
import { NSEOutline, NSETable, type NSEDataViewAdapter, type NSEDataViewState, type NSETableColumn } from "../../../src/NSE/DataViews";
import { useNSEDeferredDisposal, type NSEDisposalScheduler } from "../../../src/NSE/NSE";

export interface DiagnosticRecord {
  readonly id: string;
  readonly label: string;
  readonly value: unknown;
  readonly children: readonly DiagnosticRecord[];
}

export interface DiagnosticRow { readonly id: string; readonly label: string; readonly valueText: string }

function diagnosticValueText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return `${value}`;
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "symbol") return "[Symbol]";
  if (typeof value === "function") return "[Function]";
  const seen = new WeakSet<object>();
  let remaining = 256;
  const quote = (text: string) => JSON.stringify(text);
  const visit = (candidate: unknown, depth: number): string => {
    if (candidate === null) return "null";
    if (typeof candidate === "string") return quote(candidate);
    if (typeof candidate === "number" || typeof candidate === "boolean") return `${candidate}`;
    if (typeof candidate === "bigint") return quote(`${candidate}`);
    if (typeof candidate === "undefined") return quote("[Undefined]");
    if (typeof candidate === "symbol") return quote("[Symbol]");
    if (typeof candidate === "function") return quote("[Function]");
    if (seen.has(candidate)) return quote("[Circular]");
    if (depth >= 6 || remaining-- <= 0) return quote("[Truncated]");
    seen.add(candidate);
    let descriptors: PropertyDescriptorMap;
    try { descriptors = Object.getOwnPropertyDescriptors(candidate); } catch { return quote("[Uninspectable]"); }
    const array = Array.isArray(candidate);
    const parts: string[] = [];
    for (const key of Object.keys(descriptors).sort()) {
      if (array && key === "length") continue;
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable) continue;
      const rendered = "value" in descriptor ? visit(descriptor.value, depth + 1) : quote("[Accessor]");
      parts.push(array && /^(0|[1-9]\d*)$/.test(key) ? rendered : `${quote(key)}:${rendered}`);
      if (parts.join(",").length > 4_000) { parts.push(quote("[Truncated]")); break; }
    }
    return array ? `[${parts.join(",")}]` : `{${parts.join(",")}}`;
  };
  return visit(value, 0).slice(0, 4_096);
}

export function createDiagnosticsRows(records: readonly DiagnosticRecord[]): readonly DiagnosticRow[] {
  const rows: DiagnosticRow[] = [];
  const stack = [...records].reverse();
  while (stack.length) {
    const record = stack.pop()!;
    rows.push(Object.freeze({ id: record.id, label: record.label, valueText: diagnosticValueText(record.value) }));
    for (let index = record.children.length - 1; index >= 0; index -= 1) stack.push(record.children[index]!);
  }
  return Object.freeze(rows);
}

const scheduler: NSEDisposalScheduler = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
};

export function DiagnosticsDataViewFixture({ records, state = { kind: "ready" } }: { readonly records: readonly DiagnosticRecord[]; readonly state?: NSEDataViewState }) {
  const rows = useMemo(() => createDiagnosticsRows(records), [records]);
  const treeRef = useRef<NSETreeController<DiagnosticRecord, string> | null>(null);
  const tableRef = useRef<NSEArrayController<DiagnosticRow, string> | null>(null);
  if (!treeRef.current) treeRef.current = new NSETreeController({ id: "diagnostics-tree", content: records, getId: (item) => item.id, getChildren: (item) => item.children, withChildren: (item, children) => ({ ...item, children }), clone: (item) => ({ ...item, children: item.children }), selection: { mode: "single", allowsEmpty: true } });
  if (!tableRef.current) tableRef.current = new NSEArrayController({ id: "diagnostics-values", content: rows, getId: (row) => row.id, selection: { mode: "single", allowsEmpty: true, preservesSelection: true } });
  const tree = treeRef.current;
  const table = tableRef.current;
  useEffect(() => { tree.setContent(records); }, [records, tree]);
  useEffect(() => { table.setContent(rows); }, [rows, table]);
  useNSEDeferredDisposal(tree, scheduler);
  useNSEDeferredDisposal(table, scheduler);
  const adapter = useMemo<NSEDataViewAdapter<DiagnosticRow, string>>(() => ({ controller: table, idForItem: (row) => row.id, labelForItem: (row) => row.label }), [table]);
  const columns = useMemo<readonly NSETableColumn<DiagnosticRow, string, unknown>[]>(() => [
    { id: "name", title: "Name", value: (row) => row.label, width: { min: 100, ideal: 180, max: 360 } },
    { id: "value", title: "Value", value: (row) => row.valueText, width: { min: 100, ideal: 240, max: 480 } },
  ], []);
  return <div data-fixture="diagnostics-data-views">
    <NSEOutline aria-label="Diagnostics" controller={tree} idForItem={(item) => item.id} childrenForItem={(item) => item.children} labelForItem={(item) => item.label} isExpandable={(item) => item.children.length > 0} state={state} />
    <NSETable aria-label="Diagnostic values" adapter={adapter} columns={columns} state={state} />
  </div>;
}
