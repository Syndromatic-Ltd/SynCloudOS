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

import type {
  CreateTrackingRegionManagerOptions,
  RuntimeCursorDescriptor,
  RuntimeCursorImageLease,
  RuntimeCursorStack,
  RuntimeCursorToken,
  RuntimePointerAdapterEvent,
  RuntimePointerType,
  RuntimeResolvedCursor,
  RuntimeSystemCursor,
  RuntimeTrackingEvent,
  RuntimeTrackingOption,
  RuntimeTrackingRegionRegistration,
  TrackingRegionManager,
} from "./pointerTypes";

const systemCursors = new Set<RuntimeSystemCursor>([
  "default", "pointer", "text", "vertical-text", "crosshair", "move", "copy", "alias",
  "grab", "grabbing", "resize-column", "resize-row", "not-allowed", "hidden",
]);
const trackingOptions = new Set<RuntimeTrackingOption>([
  "entered-and-exited", "moved", "active-always", "assume-inside", "visible-rect",
]);
const maxCursorBytes = 1024 * 1024;
const maxCursorPhysicalDimension = 1024;
const maxCursorLogicalDimension = 256;
const maxRoots = 256;
const maxRegions = 4096;
const maxPointersPerRoot = 64;

function dataRecord(value: unknown, label: string): PropertyDescriptorMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain data-property record.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain data-property record.`);
  return Object.getOwnPropertyDescriptors(value);
}

function field(descriptors: PropertyDescriptorMap, key: string, label: string, optional = false): unknown {
  const descriptor = descriptors[key];
  if (!descriptor && optional) return undefined;
  if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
    throw new TypeError(`${label}.${key} must be an enumerable own data property.`);
  }
  return descriptor.value;
}

function exactFields(descriptors: PropertyDescriptorMap, allowed: readonly string[], label: string): void {
  const names = new Set<PropertyKey>(allowed);
  if (Reflect.ownKeys(descriptors).some((key) => !names.has(key))) throw new TypeError(`${label} contains unsupported fields.`);
}

function boundedId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be a bounded non-empty string.`);
  }
  return value;
}

function finiteCoordinate(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  if (value < 0 || value > maxCursorPhysicalDimension) throw new RangeError(`${label} is outside the bounded hotspot range.`);
  return Object.is(value, -0) ? 0 : value;
}

function systemCursor(value: unknown, label = "Cursor kind"): RuntimeSystemCursor {
  if (typeof value !== "string" || !systemCursors.has(value as RuntimeSystemCursor)) throw new TypeError(`${label} is unsupported.`);
  return value as RuntimeSystemCursor;
}

export function normaliseRuntimeCursorDescriptor(value: unknown): RuntimeCursorDescriptor {
  const descriptors = dataRecord(value, "Cursor descriptor");
  const kind = field(descriptors, "kind", "Cursor descriptor");
  if (kind !== "image") {
    exactFields(descriptors, ["kind"], "Cursor descriptor");
    return Object.freeze({ kind: systemCursor(kind) });
  }
  exactFields(descriptors, ["kind", "resourceId", "hotspot", "fallback"], "Cursor descriptor");
  const hotspotDescriptors = dataRecord(field(descriptors, "hotspot", "Cursor descriptor"), "Cursor hotspot");
  exactFields(hotspotDescriptors, ["x", "y"], "Cursor hotspot");
  const resourceId = boundedId(field(descriptors, "resourceId", "Cursor descriptor"), "Cursor resource identity");
  return Object.freeze({
    kind: "image",
    resourceId,
    hotspot: Object.freeze({
      x: finiteCoordinate(field(hotspotDescriptors, "x", "Cursor hotspot"), "Cursor hotspot x"),
      y: finiteCoordinate(field(hotspotDescriptors, "y", "Cursor hotspot"), "Cursor hotspot y"),
    }),
    fallback: systemCursor(field(descriptors, "fallback", "Cursor descriptor"), "Cursor fallback"),
  });
}

function denseValues(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a dense data array.`);
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap;
  const rawLength = descriptors.length && "value" in descriptors.length ? descriptors.length.value : undefined;
  if (typeof rawLength !== "number" || !Number.isSafeInteger(rawLength) || rawLength < 0 || rawLength > maximum) throw new TypeError(`${label} exceeds its element limit.`);
  const length = rawLength;
  const allowed = new Set<PropertyKey>(["length", ...Array.from({ length }, (_, index) => String(index))]);
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) throw new TypeError(`${label} must contain only dense indexed values.`);
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
      throw new TypeError(`${label} must contain only enumerable data properties.`);
    }
    result.push(descriptor.value);
  }
  return result;
}

function normaliseOptions(value: unknown): readonly RuntimeTrackingOption[] {
  const result: RuntimeTrackingOption[] = [];
  for (const candidate of denseValues(value, "Tracking options", 5)) {
    if (typeof candidate !== "string" || !trackingOptions.has(candidate as RuntimeTrackingOption)) throw new TypeError("Tracking options contain an unsupported value.");
    if (!result.includes(candidate as RuntimeTrackingOption)) result.push(candidate as RuntimeTrackingOption);
  }
  if (!result.includes("entered-and-exited") && !result.includes("moved")) throw new TypeError("Tracking requires an entered/exited or moved event option.");
  return Object.freeze(result);
}

function point(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 100_000_000) throw new TypeError(`${label} must be a bounded finite number.`);
  return Object.is(value, -0) ? 0 : value;
}

function pointerId(value: unknown): number {
  if (!Number.isSafeInteger(value) || Math.abs(value as number) > 0x7fffffff) throw new TypeError("Pointer identity must be a bounded safe integer.");
  return value as number;
}

function pointerType(value: unknown): RuntimePointerType | undefined {
  if (value === undefined) return undefined;
  if (value === "mouse" || value === "pen" || value === "touch") return value;
  throw new TypeError("Pointer type is invalid.");
}

function validateLease(lease: RuntimeCursorImageLease, descriptor: Extract<RuntimeCursorDescriptor, { kind: "image" }>): RuntimeCursorImageLease {
  const descriptors = dataRecord(lease, "Cursor image lease");
  for (const key of ["handle", "resourceId", "byteLength", "intrinsicWidth", "intrinsicHeight", "devicePixelRatio", "release"] as const) {
    field(descriptors, key, "Cursor image lease");
  }
  const handle = field(descriptors, "handle", "Cursor image lease");
  const resourceId = field(descriptors, "resourceId", "Cursor image lease");
  const byteLength = field(descriptors, "byteLength", "Cursor image lease");
  const width = field(descriptors, "intrinsicWidth", "Cursor image lease");
  const height = field(descriptors, "intrinsicHeight", "Cursor image lease");
  const dpr = field(descriptors, "devicePixelRatio", "Cursor image lease");
  const release = field(descriptors, "release", "Cursor image lease");
  if (!handle || typeof handle !== "object" || resourceId !== descriptor.resourceId || typeof release !== "function") throw new TypeError("Cursor image lease identity is invalid.");
  if (!Number.isSafeInteger(byteLength) || (byteLength as number) <= 0 || (byteLength as number) > maxCursorBytes) throw new RangeError("Cursor image exceeds the byte limit.");
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || width > maxCursorPhysicalDimension ||
      typeof height !== "number" || !Number.isFinite(height) || height <= 0 || height > maxCursorPhysicalDimension) {
    throw new RangeError("Cursor image intrinsic size is invalid.");
  }
  if (typeof dpr !== "number" || !Number.isFinite(dpr) || dpr < 1 || dpr > 4 || width / dpr > maxCursorLogicalDimension || height / dpr > maxCursorLogicalDimension) {
    throw new RangeError("Cursor image DPR or logical size is invalid.");
  }
  if (descriptor.hotspot.x >= width / dpr || descriptor.hotspot.y >= height / dpr) throw new RangeError("Cursor hotspot exceeds decoded intrinsic bounds.");
  return lease;
}

type RootRecord = {
  readonly root: object;
  readonly regions: Set<string>;
  readonly pointers: Map<string, PointerState>;
  disposeAdapter: () => void;
};
type PointerState = {
  readonly key: string;
  readonly input: "pointer" | "keyboard";
  readonly pointerId: number;
  pointerType?: RuntimePointerType;
  readonly regionIds: string[];
  assumed: boolean;
  x: number;
  y: number;
};
type RegionRecord = {
  readonly id: string;
  readonly ownerId: string;
  readonly windowControllerId?: string;
  readonly root: object;
  readonly element: object;
  readonly options: readonly RuntimeTrackingOption[];
  readonly cursor?: RuntimeCursorDescriptor;
  readonly onEvent?: (event: RuntimeTrackingEvent) => void;
  visible: boolean;
  disposed: boolean;
  disposeAdapter: () => void;
  readonly cursorTokens: Map<string, RuntimeCursorToken>;
};
type CursorEntry = {
  readonly id: string;
  readonly ownerId: string;
  readonly windowControllerId?: string;
  readonly root: object;
  readonly pointerId: number;
  readonly descriptor: RuntimeCursorDescriptor;
  readonly controller: AbortController;
  runtimeAbort?: () => void;
  sequence: number;
  published: RuntimeCursorDescriptor;
  resolved: RuntimeResolvedCursor;
  lease: RuntimeCursorImageLease | null;
  disposed: boolean;
};

export function createTrackingRegionManager(options: CreateTrackingRegionManagerOptions): TrackingRegionManager {
  const roots = new Map<object, RootRecord>();
  const regions = new Map<string, RegionRecord>();
  const cursorEntries: CursorEntry[] = [];
  let cursorSequence = 0;
  let identitySequence = 0;
  let disposed = false;

  const adapter = options.adapter ?? null;
  const nextId = (kind: string) => `${options.runtimeId}:${kind}:${++identitySequence}:${boundedId(options.randomUUID(), `${kind} identity`)}`;
  const ensureAvailable = () => {
    if (disposed || options.signal.aborted) throw new DOMException("The tracking manager is disposed.", "AbortError");
    if (!adapter) throw new Error("Pointer tracking is unavailable in this runtime environment.");
  };
  const getRoot = (root: object) => {
    let record = roots.get(root);
    if (record) return record;
    ensureAvailable();
    if (roots.size >= maxRoots) throw new RangeError("Tracking root limit exceeded.");
    record = { root, regions: new Set(), pointers: new Map(), disposeAdapter: () => undefined };
    roots.set(root, record);
    try {
      record.disposeAdapter = adapter!.bindRoot(root, (event) => receive(record!, event));
    } catch (error) {
      roots.delete(root);
      throw error;
    }
    return record;
  };
  const cleanupRoot = (record: RootRecord) => {
    if (record.regions.size > 0 || cursorEntries.some((entry) => !entry.disposed && entry.root === record.root)) return;
    if (roots.get(record.root) !== record) return;
    roots.delete(record.root);
    record.disposeAdapter();
  };
  const applyRootCursor = (root: object) => {
    if (!adapter) return;
    const entry = cursorEntries.filter((candidate) => !candidate.disposed && candidate.root === root)
      .sort((left, right) => left.sequence - right.sequence).at(-1);
    adapter.applyCursor(root, entry?.resolved ?? null);
  };
  const releaseEntry = (entry: CursorEntry) => {
    if (entry.disposed) return;
    entry.disposed = true;
    if (!entry.controller.signal.aborted) entry.controller.abort(new DOMException("The cursor token was released.", "AbortError"));
    try { entry.lease?.release(); } catch { /* Resource release is best effort during teardown. */ }
    entry.lease = null;
    if (entry.runtimeAbort) options.signal.removeEventListener("abort", entry.runtimeAbort);
    const index = cursorEntries.indexOf(entry);
    if (index >= 0) cursorEntries.splice(index, 1);
    applyRootCursor(entry.root);
    const root = roots.get(entry.root);
    if (root) cleanupRoot(root);
  };
  const cursorStack: RuntimeCursorStack = {
    get current() {
      return cursorEntries.filter((entry) => !entry.disposed).sort((left, right) => left.sequence - right.sequence).at(-1)?.published ?? null;
    },
    currentFor(root) {
      return cursorEntries.filter((entry) => !entry.disposed && entry.root === root).sort((left, right) => left.sequence - right.sequence).at(-1)?.published ?? null;
    },
    push(input) {
      ensureAvailable();
      const descriptors = dataRecord(input, "Cursor push");
      exactFields(descriptors, ["ownerId", "windowControllerId", "root", "pointerId", "cursor"], "Cursor push");
      const ownerId = boundedId(field(descriptors, "ownerId", "Cursor push"), "Cursor owner identity");
      const rawWindowControllerId = field(descriptors, "windowControllerId", "Cursor push", true);
      const windowControllerId = rawWindowControllerId === undefined
        ? undefined
        : boundedId(rawWindowControllerId, "Cursor window controller identity");
      const root = field(descriptors, "root", "Cursor push");
      if (!root || typeof root !== "object") throw new TypeError("Cursor root must be an opaque object handle.");
      const ownedPointerId = pointerId(field(descriptors, "pointerId", "Cursor push"));
      const descriptor = normaliseRuntimeCursorDescriptor(field(descriptors, "cursor", "Cursor push"));
      getRoot(root);
      const controller = new AbortController();
      const onRuntimeAbort = () => controller.abort(options.signal.reason ?? new DOMException("The runtime disposed.", "AbortError"));
      options.signal.addEventListener("abort", onRuntimeAbort, { once: true });
      const fallback: RuntimeResolvedCursor = descriptor.kind === "image" ? Object.freeze({ kind: descriptor.fallback }) : descriptor;
      const entry: CursorEntry = {
        id: nextId("cursor"), ownerId, ...(windowControllerId ? { windowControllerId } : {}),
        root, pointerId: ownedPointerId, descriptor, controller,
        sequence: ++cursorSequence, published: descriptor.kind === "image" ? Object.freeze({ kind: descriptor.fallback }) : descriptor,
        resolved: fallback, lease: null, disposed: false,
      };
      entry.runtimeAbort = onRuntimeAbort;
      cursorEntries.push(entry);
      applyRootCursor(root);
      if (descriptor.kind === "image") {
        void adapter!.resolveCursorImage(descriptor.resourceId, controller.signal).then((candidate) => {
          let lease: RuntimeCursorImageLease | null = candidate;
          try {
            const valid = validateLease(candidate, descriptor);
            if (entry.disposed || controller.signal.aborted || !cursorEntries.includes(entry)) {
              valid.release();
              lease = null;
              return;
            }
            entry.lease = valid;
            lease = null;
            entry.published = descriptor;
            entry.resolved = Object.freeze({
              kind: "image", resourceId: descriptor.resourceId, handle: valid.handle,
              hotspot: descriptor.hotspot, fallback: descriptor.fallback,
            });
            applyRootCursor(root);
          } catch {
            try { lease?.release(); } catch { /* Invalid resources are still released. */ }
          }
        }).catch(() => undefined).finally(() => options.signal.removeEventListener("abort", onRuntimeAbort));
      } else {
        options.signal.removeEventListener("abort", onRuntimeAbort);
      }
      let tokenDisposed = false;
      return Object.freeze({
        id: entry.id,
        get disposed() { return tokenDisposed; },
        dispose() {
          if (tokenDisposed) return;
          tokenDisposed = true;
          releaseEntry(entry);
        },
      });
    },
    disposeOwner(ownerId) {
      const owned = boundedId(ownerId, "Cursor owner identity");
      for (const entry of [...cursorEntries].reverse()) if (entry.ownerId === owned) releaseEntry(entry);
    },
  };

  const emit = (region: RegionRecord, state: PointerState, type: RuntimeTrackingEvent["type"], reason?: string) => {
    if (region.disposed) return;
    if (type !== "moved" && !region.options.includes("entered-and-exited")) return;
    if (type === "moved" && !region.options.includes("moved")) return;
    const event = Object.freeze({
      type, input: state.input, regionId: region.id, ownerId: region.ownerId,
      pointerId: state.pointerId, x: state.x, y: state.y,
      ...(state.pointerType ? { pointerType: state.pointerType } : {}),
      ...(reason ? { reason } : {}),
    });
    region.onEvent?.(event);
  };
  const exitRegion = (region: RegionRecord, state: PointerState, reason?: string) => {
    const token = region.cursorTokens.get(state.key);
    region.cursorTokens.delete(state.key);
    token?.dispose();
    emit(region, state, "exited", reason);
  };
  const enterRegion = (region: RegionRecord, state: PointerState) => {
    if (region.cursor) {
      region.cursorTokens.set(state.key, cursorStack.push({
        ownerId: region.ownerId,
        ...(region.windowControllerId ? { windowControllerId: region.windowControllerId } : {}),
        root: region.root,
        pointerId: state.pointerId,
        cursor: region.cursor,
      }));
    }
    emit(region, state, "entered");
  };
  const canonicalRegionOrder = (root: RootRecord, regionIds: readonly string[]) => {
    const ordered = denseValues(adapter!.orderRegionIds(root.root, Object.freeze([...regionIds])), "Ordered tracking region identities", maxRegions)
      .map((id) => boundedId(id, "Ordered tracking region identity"));
    const expected = new Set(regionIds);
    if (ordered.length !== regionIds.length || new Set(ordered).size !== expected.size || ordered.some((id) => !expected.has(id))) {
      throw new TypeError("Pointer adapter changed tracking region membership while ordering containment.");
    }
    return ordered;
  };
  const reorderStateCursors = (root: RootRecord, state: PointerState) => {
    const stateEntries = state.regionIds.flatMap((id) => {
      const token = regions.get(id)?.cursorTokens.get(state.key);
      const entry = token ? cursorEntries.find((candidate) => candidate.id === token.id && !candidate.disposed) : undefined;
      return entry ? [entry] : [];
    });
    const sequences = stateEntries.map((entry) => entry.sequence).sort((left, right) => left - right);
    stateEntries.forEach((entry, index) => { entry.sequence = sequences[index]; });
    applyRootCursor(root.root);
  };
  const seedRegionInside = (root: RootRecord, region: RegionRecord) => {
    const activePointerStates = [...root.pointers.values()].filter((state) => state.input === "pointer" && state.key !== "pointer:assumed");
    const state = activePointerStates.length === 1
      ? activePointerStates[0]
      : root.pointers.get("pointer:assumed") ?? {
          key: "pointer:assumed", input: "pointer", pointerId: 0, regionIds: [], assumed: true, x: 0, y: 0,
        };
    const ordered = canonicalRegionOrder(root, state.regionIds.includes(region.id) ? state.regionIds : [...state.regionIds, region.id]);
    let token: RuntimeCursorToken | undefined;
    if (region.cursor && !region.cursorTokens.has(state.key)) {
      token = cursorStack.push({
        ownerId: region.ownerId,
        ...(region.windowControllerId ? { windowControllerId: region.windowControllerId } : {}),
        root: region.root,
        pointerId: state.pointerId,
        cursor: region.cursor,
      });
    }
    state.regionIds.splice(0, state.regionIds.length, ...ordered);
    state.assumed = true;
    if (token) region.cursorTokens.set(state.key, token);
    root.pointers.set(state.key, state);
    reorderStateCursors(root, state);
  };
  const transition = (root: RootRecord, state: PointerState, nextOuterFirst: string[], reason?: string) => {
    let common = 0;
    while (common < state.regionIds.length && common < nextOuterFirst.length && state.regionIds[common] === nextOuterFirst[common]) common += 1;
    for (let index = state.regionIds.length - 1; index >= common; index -= 1) {
      const region = regions.get(state.regionIds[index]);
      if (region) exitRegion(region, state, reason);
    }
    state.regionIds.splice(common);
    for (let index = common; index < nextOuterFirst.length; index += 1) {
      const region = regions.get(nextOuterFirst[index]);
      if (!region) continue;
      state.regionIds.push(region.id);
      enterRegion(region, state);
    }
    if (state.regionIds.length === 0) root.pointers.delete(state.key);
    else root.pointers.set(state.key, state);
  };
  const reconcileAssumedPath = (root: RootRecord, state: PointerState, nextOuterFirst: string[]) => {
    const previous = new Set(state.regionIds);
    const next = new Set(nextOuterFirst);
    for (let index = state.regionIds.length - 1; index >= 0; index -= 1) {
      if (next.has(state.regionIds[index])) continue;
      const region = regions.get(state.regionIds[index]);
      if (region) exitRegion(region, state);
    }
    state.regionIds.splice(0, state.regionIds.length, ...nextOuterFirst);
    for (const id of nextOuterFirst) {
      if (previous.has(id)) continue;
      const region = regions.get(id);
      if (region) enterRegion(region, state);
    }
    state.assumed = false;
    if (state.regionIds.length === 0) root.pointers.delete(state.key);
    else root.pointers.set(state.key, state);
    reorderStateCursors(root, state);
  };
  const claimPendingAssumptions = (
    root: RootRecord,
    current: PointerState | undefined,
    key: string,
    ownedPointerId: number,
  ): PointerState | undefined => {
    const pending = root.pointers.get("pointer:assumed");
    if (!pending) return current;
    const orderedCurrent = current
      ? canonicalRegionOrder(root, [
          ...current.regionIds,
          ...pending.regionIds.filter((id) => !current.regionIds.includes(id)),
        ])
      : undefined;
    const state = current ?? {
      ...pending,
      key,
      pointerId: ownedPointerId,
      regionIds: [...pending.regionIds],
    };
    root.pointers.delete("pointer:assumed");
    if (current) {
      current.regionIds.splice(0, current.regionIds.length, ...orderedCurrent!);
      current.assumed = true;
    }
    for (const regionId of pending.regionIds) {
      const region = regions.get(regionId);
      const token = region?.cursorTokens.get("pointer:assumed");
      if (!region || !token) continue;
      region.cursorTokens.delete("pointer:assumed");
      const existing = region.cursorTokens.get(key);
      if (existing) token.dispose();
      else region.cursorTokens.set(key, token);
    }
    reorderStateCursors(root, state);
    return state;
  };
  function receive(root: RootRecord, event: RuntimePointerAdapterEvent) {
    if (disposed || roots.get(root.root) !== root) return;
    if (event.kind === "visibility") {
      const region = regions.get(boundedId(event.regionId, "Tracking region identity"));
      if (!region || region.root !== root.root || region.disposed) return;
      region.visible = Boolean(event.visible);
      if (!region.visible && region.options.includes("visible-rect")) {
        for (const state of [...root.pointers.values()]) {
          const index = state.regionIds.indexOf(region.id);
          if (index >= 0) transition(root, state, state.regionIds.slice(0, index), "region hidden");
        }
      }
      return;
    }
    const ownedPointerId = pointerId(event.pointerId);
    const input = event.input === "pointer" || event.input === "keyboard" ? event.input : (() => { throw new TypeError("Tracking input is invalid."); })();
    const reportedPointerType = pointerType(event.pointerType);
    if (input === "keyboard" && reportedPointerType !== undefined) throw new TypeError("Keyboard tracking events cannot report a pointer type.");
    const key = `${input}:${ownedPointerId}`;
    let state = root.pointers.get(key);
    if (input === "pointer") state = claimPendingAssumptions(root, state, key, ownedPointerId);
    state ??= {
      key,
      input,
      pointerId: ownedPointerId,
      ...(reportedPointerType ? { pointerType: reportedPointerType } : {}),
      regionIds: [],
      assumed: false,
      x: 0,
      y: 0,
    };
    if (reportedPointerType) state.pointerType = reportedPointerType;
    if (!root.pointers.has(key) && root.pointers.size >= maxPointersPerRoot) throw new RangeError("Active pointer limit exceeded for tracking root.");
    state.x = point(event.x, "Pointer x");
    state.y = point(event.y, "Pointer y");
    if (event.kind === "cancel") {
      transition(root, state, [], event.reason);
      return;
    }
    const deepestFirst = denseValues(event.regionPath, "Tracking region path", Math.max(32, regions.size))
      .map((id) => boundedId(id, "Tracking region path identity"));
    const seen = new Set<string>();
    const outerFirst = deepestFirst.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      const region = regions.get(id);
      return Boolean(region && !region.disposed && region.root === root.root && (!region.options.includes("visible-rect") || region.visible));
    }).reverse();
    if (state.assumed) reconcileAssumedPath(root, state, outerFirst);
    else transition(root, state, outerFirst);
    if (outerFirst.length > 0) {
      root.pointers.set(key, state);
      for (const id of [...state.regionIds].reverse()) {
        const region = regions.get(id);
        if (region) emit(region, state, "moved");
      }
    }
  }

  const disposeRegion = (region: RegionRecord, reason: string) => {
    if (region.disposed) return;
    const root = roots.get(region.root);
    if (root) {
      for (const state of [...root.pointers.values()]) {
        const index = state.regionIds.indexOf(region.id);
        if (index < 0) continue;
        // A removed ancestor invalidates its contained descendants too.
        transition(root, state, state.regionIds.slice(0, index), reason);
      }
      root.regions.delete(region.id);
    }
    region.disposed = true;
    for (const token of region.cursorTokens.values()) token.dispose();
    region.cursorTokens.clear();
    region.disposeAdapter();
    regions.delete(region.id);
    if (root) cleanupRoot(root);
  };

  const manager: TrackingRegionManager = {
    runtimeId: options.runtimeId,
    cursors: cursorStack,
    register(input) {
      ensureAvailable();
      if (regions.size >= maxRegions) throw new RangeError("Tracking region limit exceeded.");
      const descriptors = dataRecord(input, "Tracking region");
      exactFields(descriptors, ["ownerId", "windowControllerId", "root", "element", "options", "cursor", "onEvent"], "Tracking region");
      const ownerId = boundedId(field(descriptors, "ownerId", "Tracking region"), "Tracking owner identity");
      const rawWindowControllerId = field(descriptors, "windowControllerId", "Tracking region", true);
      const windowControllerId = rawWindowControllerId === undefined
        ? undefined
        : boundedId(rawWindowControllerId, "Tracking window controller identity");
      const root = field(descriptors, "root", "Tracking region");
      const element = field(descriptors, "element", "Tracking region");
      const onEvent = field(descriptors, "onEvent", "Tracking region", true);
      if (!root || typeof root !== "object" || !element || typeof element !== "object") throw new TypeError("Tracking roots and elements must be opaque object handles.");
      if (onEvent !== undefined && typeof onEvent !== "function") throw new TypeError("Tracking event listener must be a function.");
      const cursorValue = field(descriptors, "cursor", "Tracking region", true);
      const ownedOptions = normaliseOptions(field(descriptors, "options", "Tracking region"));
      const ownedCursor = cursorValue === undefined ? undefined : normaliseRuntimeCursorDescriptor(cursorValue);
      const id = nextId("tracking-region");
      const rootRecord = getRoot(root);
      const region: RegionRecord = {
        id, ownerId, ...(windowControllerId ? { windowControllerId } : {}), root, element, options: ownedOptions,
        ...(ownedCursor === undefined ? {} : { cursor: ownedCursor }),
        ...(onEvent === undefined ? {} : { onEvent: onEvent as RegionRecord["onEvent"] }),
        visible: true, disposed: false, disposeAdapter: () => undefined, cursorTokens: new Map(),
      };
      regions.set(id, region);
      rootRecord.regions.add(id);
      try {
        region.disposeAdapter = adapter!.bindRegion(root, element, id);
        if (ownedOptions.includes("assume-inside")) seedRegionInside(rootRecord, region);
      }
      catch (error) {
        for (const token of region.cursorTokens.values()) token.dispose();
        region.cursorTokens.clear();
        region.disposeAdapter();
        regions.delete(id);
        rootRecord.regions.delete(id);
        cleanupRoot(rootRecord);
        throw error;
      }
      let registrationDisposed = false;
      return Object.freeze({
        id,
        get disposed() { return registrationDisposed; },
        dispose(reason = "tracking region unmounted") {
          if (registrationDisposed) return;
          registrationDisposed = true;
          disposeRegion(region, reason);
        },
      } as RuntimeTrackingRegionRegistration);
    },
    disposeOwner(ownerId, reason = "tracking owner disposed") {
      const owned = boundedId(ownerId, "Tracking owner identity");
      const ownedRegions = [...regions.values()].filter((region) => region.ownerId === owned).reverse();
      for (const region of ownedRegions) disposeRegion(region, reason);
      cursorStack.disposeOwner(owned);
    },
    disposeWindowController(windowControllerId, reason = "tracking window disposed") {
      const ownedWindow = boundedId(windowControllerId, "Tracking window controller identity");
      const ownedRegions = [...regions.values()].filter((region) => region.windowControllerId === ownedWindow).reverse();
      for (const region of ownedRegions) disposeRegion(region, reason);
      for (const entry of [...cursorEntries].reverse()) {
        if (entry.windowControllerId === ownedWindow) releaseEntry(entry);
      }
    },
    diagnostics() {
      return Object.freeze({
        rootCount: roots.size,
        regionCount: regions.size,
        activePointerCount: [...roots.values()].reduce((count, root) => count + root.pointers.size, 0),
        cursorEntryCount: cursorEntries.length,
      });
    },
    dispose() {
      if (disposed) return;
      for (const root of roots.values()) {
        for (const state of [...root.pointers.values()]) transition(root, state, [], "runtime disposed");
      }
      for (const region of [...regions.values()].reverse()) disposeRegion(region, "runtime disposed");
      for (const entry of [...cursorEntries].reverse()) releaseEntry(entry);
      for (const root of [...roots.values()]) {
        roots.delete(root.root);
        root.disposeAdapter();
      }
      disposed = true;
    },
  };

  const onRuntimeAbort = () => manager.dispose();
  options.signal.addEventListener("abort", onRuntimeAbort, { once: true });
  return manager;
}
