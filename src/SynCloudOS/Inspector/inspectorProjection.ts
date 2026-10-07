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

import { inspectorPanels, type InspectorProjection, type InspectorNotice, type InspectorPanelSnapshot, type InspectorRow, type InspectorSnapshot, type InspectorSource } from "./inspectorTypes";
import { createInspectorRedactor, inspectorArray, inspectorField, inspectorStatus } from "./redactInspectorSnapshot";

const families = ["animation", "audio", "graphics", "haptics", "image", "location", "lumina", "media", "midi", "motion", "text", "video"];
const pendingStatuses = new Set(["pending", "loading", "active", "excluded"]);
function limit(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new RangeError("Inspector limit is outside its bounded range.");
  return result;
}

export function createInspectorProjection(options: {
  readonly runtimeId: string;
  readonly signal?: AbortSignal;
  readonly sources: readonly InspectorSource[];
  readonly historyLimit?: number;
  now(): number;
}): InspectorProjection {
  const cap = limit(options.historyLimit, 128, 10000);
  if (options.signal?.aborted) throw new Error("Inspector runtime is disposed.");
  const redactor = createInspectorRedactor();
  const notices: InspectorNotice[] = [];
  const listeners = new Set<() => void>();
  const removers: Array<() => void> = [];
  const trusted = new WeakSet<object>();
  // Cache only sanitized DTOs. A notification invalidates its own producer;
  // a changing window must not reread services, routes or other owners.
  const sources = options.sources.map(source => ({ source, dirty: true, rows: [] as readonly InspectorRow[], omitted: 0, unavailable: false }));
  let revision = 0;
  let recorded = 0;
  let dropped = 0;
  let skipped = 0;
  let disposed = false;
  let paused = false;
  let cached: InspectorSnapshot | null = null;
  let dirty = true;
  let lastTime = 0;
  const now = () => {
    const next = options.now();
    if (Number.isFinite(next) && next >= 0) lastTime = Math.max(lastTime, next);
    return lastTime;
  };
  const assertLive = () => { if (disposed || options.signal?.aborted) throw new Error("Inspector is disposed."); };
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* Observers cannot affect owners. */ } } };
  const changed = (entry: typeof sources[number]) => {
    if (disposed) return;
    if (paused) { skipped++; return; }
    entry.dirty = true;
    recorded++; revision++; dirty = true;
    notices.push(Object.freeze({ sequence: recorded, at: now(), panel: entry.source.panel }));
    if (notices.length > cap) { notices.shift(); dropped++; }
    notify();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    options.signal?.removeEventListener("abort", dispose);
    for (const remove of removers.splice(0)) { try { remove(); } catch { /* Release remaining subscriptions. */ } }
    listeners.clear(); notices.length = 0; redactor.clear(); cached = null;
    sources.forEach(entry => { entry.rows = []; });
  };
  try {
    for (const entry of sources) {
      const source = entry.source;
      if (!inspectorPanels.includes(source.panel)) throw new TypeError("Unknown Inspector panel.");
      removers.push(source.subscribe(() => changed(entry)));
    }
  } catch { dispose(); throw new Error("Inspector owner subscription failed."); }
  options.signal?.addEventListener("abort", dispose, { once: true });

  const getSnapshot = (): InspectorSnapshot => {
    assertLive();
    if (cached && paused && cached.capture.skipped !== skipped) {
      cached = Object.freeze({ ...cached, capture: Object.freeze({ ...cached.capture, skipped }) });
      trusted.add(cached);
    }
    if (cached && (!dirty || paused)) return cached;
    const runtimeId = redactor.reference(options.runtimeId, "Runtime") ?? redactor.reference("runtime", "Runtime")!;
    for (const entry of sources) {
      if (!entry.dirty) continue;
      let raw: readonly unknown[] = [];
      entry.unavailable = false;
      try { raw = inspectorArray(entry.source.read()); } catch { entry.unavailable = true; }
      const pending = raw.filter(row => pendingStatuses.has(inspectorStatus(inspectorField(row, "status"))));
      const history = raw.filter(row => !pendingStatuses.has(inspectorStatus(inspectorField(row, "status"))));
      entry.omitted = Math.max(0, history.length - cap);
      entry.rows = Object.freeze([...pending, ...history.slice(-cap)].map((row, i) => redactor.row(row, `${entry.source.panel}:${i}`, entry.source.panel)));
      entry.dirty = false;
    }
    const panels: InspectorPanelSnapshot[] = inspectorPanels.map(panel => {
      const entries = sources.filter(entry => entry.source.panel === panel);
      const status: InspectorPanelSnapshot["status"] = entries.some(entry => entry.unavailable) ? "unavailable" : entries.length || panel === "Runtime" ? "supported" : "unsupported";
      const rows = entries.flatMap(entry => entry.rows);
      if (panel === "Runtime") rows.unshift(redactor.row({ id: options.runtimeId, kind: "runtime", status: "active" }, "runtime", "Runtime"));
      if (panel === "FX" && !entries.length) rows.push(...families.map(kind => redactor.row({ id: `fx:${kind}`, kind, status: "unsupported" }, kind, "FX")));
      const pending = rows.filter(row => pendingStatuses.has(row.status));
      const history = rows.filter(row => !pendingStatuses.has(row.status));
      return Object.freeze({ id: panel, status, omittedHistory: entries.reduce((n, entry) => n + entry.omitted, 0) + Math.max(0, history.length - cap),
        rows: Object.freeze([...pending, ...history.slice(-cap)]) });
    });
    const retainedReferences = new Set([runtimeId]);
    // Include cached source rows as well: a panel cap may hide a row until a
    // different source changes. Keeping its reference preserves stable links.
    for (const row of [...sources.flatMap(entry => entry.rows), ...panels.flatMap(panel => panel.rows)]) {
      retainedReferences.add(row.id);
      row.links.forEach(link => retainedReferences.add(link.id));
      row.pendingRoles.forEach(role => retainedReferences.add(role));
    }
    redactor.prune(retainedReferences);
    cached = Object.freeze({ version: 1, runtimeId, revision, capturedAt: now(),
      capture: Object.freeze({ status: paused ? "paused" : "live", recorded, retained: notices.length, dropped, skipped }),
      panels: Object.freeze(panels) });
    trusted.add(cached); dirty = false;
    return cached;
  };
  return Object.freeze({
    getSnapshot,
    getPage(panel, request = {}) {
      const size = limit(request.limit, 50, 200);
      const snapshot = getSnapshot();
      let offset = 0;
      if (request.cursor !== undefined) {
        const match = /^([^:]+):(\d+):(\d+):(\d+)$/.exec(request.cursor);
        if (!match || match[1] !== snapshot.runtimeId || +match[2] !== snapshot.revision || +match[3] !== inspectorPanels.indexOf(panel)) throw new Error("Inspector page cursor is stale or invalid.");
        offset = +match[4];
        if (!Number.isSafeInteger(offset)) throw new Error("Inspector page cursor is invalid.");
      }
      const rows = snapshot.panels.find(p => p.id === panel)?.rows;
      if (!rows || offset > rows.length) throw new Error("Inspector page cursor is invalid.");
      return Object.freeze({ rows: Object.freeze(rows.slice(offset, offset + size)), total: rows.length,
        nextCursor: offset + size < rows.length ? `${snapshot.runtimeId}:${snapshot.revision}:${inspectorPanels.indexOf(panel)}:${offset + size}` : null });
    },
    getEvents(request = {}) {
      assertLive();
      const size = limit(request.limit, 50, 200);
      const after = request.after ?? 0;
      if (!Number.isSafeInteger(after) || after < 0) throw new RangeError("Invalid event sequence.");
      const rows = notices.filter(row => row.sequence > after);
      return Object.freeze({ rows: Object.freeze(rows.slice(0, size)), total: rows.length,
        nextCursor: rows.length > size ? String(rows[size - 1].sequence) : null });
    },
    subscribe(listener) { assertLive(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    pause() {
      assertLive(); if (paused) return;
      const snapshot = getSnapshot(); paused = true; revision++;
      cached = Object.freeze({ ...snapshot, revision, capture: Object.freeze({ ...snapshot.capture, status: "paused" }) });
      trusted.add(cached); notify();
    },
    resume() { assertLive(); if (!paused) return; paused = false; revision++; dirty = true; sources.forEach(entry => { entry.dirty = true; }); notify(); },
    exportSnapshot(snapshot) {
      assertLive();
      if (!trusted.has(snapshot)) throw new TypeError("Inspector export requires this producer's immutable snapshot.");
      const content = JSON.stringify(snapshot, null, 2);
      return Object.freeze({ fileName: "syncloudos-inspector.json", content, bytes: new TextEncoder().encode(content).byteLength });
    },
    redactTimeout(value) {
      assertLive();
      // A separate ephemeral dictionary prevents timeout exports retaining raw labels.
      const timeoutRedactor = createInspectorRedactor();
      const rows = (key: string) => Object.freeze(inspectorArray(inspectorField(value, key)).map((row, i) => timeoutRedactor.row(row, `${key}:${i}`, "Resources")));
      return Object.freeze({ status: inspectorStatus(inspectorField(value, "status")), pending: rows("pending"), excluded: rows("excluded") });
    },
    dispose,
  } satisfies InspectorProjection);
}
