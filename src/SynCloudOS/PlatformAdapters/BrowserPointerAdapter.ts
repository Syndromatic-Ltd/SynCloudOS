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
  RuntimeCursorImageLease,
  RuntimePointerAdapter,
  RuntimePointerAdapterEvent,
  RuntimePointerType,
  RuntimeResolvedCursor,
  RuntimeSystemCursor,
} from "../Pointer/pointerTypes";
import type { BrowserPointerAdapterPlatform } from "./browserPointerAdapterTypes";

type BrowserRoot = HTMLElement & {
  contains(other: Node | null): boolean;
};

type RootRecord = {
  readonly root: BrowserRoot;
  readonly listener: (event: RuntimePointerAdapterEvent) => void;
  readonly regions: Map<Element, string>;
  readonly visibility: Map<Element, boolean>;
  readonly disposers: Array<() => void>;
  readonly originalCursor: string;
  resize: ReturnType<BrowserPointerAdapterPlatform["createResizeObserver"]>;
  intersection: ReturnType<BrowserPointerAdapterPlatform["createIntersectionObserver"]>;
};

const cssCursor: Readonly<Record<RuntimeSystemCursor, string>> = Object.freeze({
  default: "default",
  pointer: "pointer",
  text: "text",
  "vertical-text": "vertical-text",
  crosshair: "crosshair",
  move: "move",
  copy: "copy",
  alias: "alias",
  grab: "grab",
  grabbing: "grabbing",
  "resize-column": "col-resize",
  "resize-row": "row-resize",
  "not-allowed": "not-allowed",
  hidden: "none",
});

function browserRoot(value: object): BrowserRoot {
  const candidate = value as Partial<BrowserRoot>;
  if (typeof candidate.addEventListener !== "function" || typeof candidate.removeEventListener !== "function" ||
      typeof candidate.contains !== "function" || !candidate.style || typeof candidate.style !== "object") {
    throw new TypeError("Pointer roots must be browser elements supplied through the host seam.");
  }
  return value as BrowserRoot;
}

function browserElement(value: object): Element {
  const candidate = value as Partial<Element>;
  if (typeof candidate.addEventListener !== "function" || typeof candidate.removeEventListener !== "function") {
    throw new TypeError("Tracking regions must bind browser elements through the host seam.");
  }
  return value as Element;
}

function eventPoint(event: Event): { x: number; y: number } {
  const pointer = event as Event & { clientX?: unknown; clientY?: unknown };
  return {
    x: typeof pointer.clientX === "number" && Number.isFinite(pointer.clientX) ? pointer.clientX : 0,
    y: typeof pointer.clientY === "number" && Number.isFinite(pointer.clientY) ? pointer.clientY : 0,
  };
}

function eventPointerId(event: Event): number {
  const value = (event as Event & { pointerId?: unknown }).pointerId;
  return Number.isSafeInteger(value) ? value as number : 0;
}

/** Keep unknown or vendor-specific values out of runtime diagnostics rather
 * than silently turning them into a false mouse/pen/touch claim. */
function eventPointerType(event: Event): RuntimePointerType | undefined {
  const value = (event as Event & { pointerType?: unknown }).pointerType;
  return value === "mouse" || value === "pen" || value === "touch" ? value : undefined;
}

function pathFromTarget(record: RootRecord, target: EventTarget | null): readonly string[] {
  if (!target || typeof target !== "object") return Object.freeze([]);
  const node = target as Node;
  if (node !== record.root && !record.root.contains(node)) return Object.freeze([]);
  const path: string[] = [];
  let current: Node | null = node;
  while (current) {
    const id = record.regions.get(current as Element);
    if (id) path.push(id);
    if (current === record.root) break;
    current = current.parentNode;
  }
  return Object.freeze(path);
}

function sourceString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError("Cursor resource policy returned an invalid CSS source.");
  }
  return value;
}

export class BrowserPointerAdapter implements RuntimePointerAdapter {
  readonly #roots = new Map<object, RootRecord>();
  readonly #sources = new WeakMap<object, string>();

  constructor(private readonly platform: BrowserPointerAdapterPlatform) {}

  bindRoot(rootHandle: object, listener: (event: RuntimePointerAdapterEvent) => void): () => void {
    if (this.#roots.has(rootHandle)) throw new Error("A pointer root may be bound only once per runtime adapter.");
    const root = browserRoot(rootHandle);
    const record: RootRecord = {
      root, listener, regions: new Map(), visibility: new Map(), disposers: [], originalCursor: root.style.cursor,
      resize: null,
      intersection: null,
    };
    record.resize = this.platform.createResizeObserver((entries) => {
        for (const entry of entries) {
          const regionId = record.regions.get(entry.target);
          if (regionId) listener(Object.freeze({ kind: "visibility", regionId, visible: record.visibility.get(entry.target) !== false }));
        }
      });
    record.intersection = this.platform.createIntersectionObserver((entries) => {
        for (const entry of entries) {
          const regionId = record.regions.get(entry.target);
          if (!regionId) continue;
          const visible = Boolean(entry.isIntersecting && entry.intersectionRatio > 0);
          record.visibility.set(entry.target, visible);
          listener(Object.freeze({ kind: "visibility", regionId, visible }));
        }
      });
    this.#roots.set(rootHandle, record);
    const update = (event: Event, target: EventTarget | null, input: "pointer" | "keyboard") => {
      const coordinates = eventPoint(event);
      const pointerType = input === "pointer" ? eventPointerType(event) : undefined;
      listener(Object.freeze({
        kind: "update", input, pointerId: input === "keyboard" ? 0 : eventPointerId(event),
        ...coordinates, regionPath: pathFromTarget(record, target),
        ...(pointerType ? { pointerType } : {}),
      }));
    };
    const cancel = (event: Event, reason: "pointercancel" | "lostpointercapture") => {
      const coordinates = eventPoint(event);
      const pointerType = eventPointerType(event);
      listener(Object.freeze({
        kind: "cancel", input: "pointer", pointerId: eventPointerId(event), ...coordinates,
        regionPath: Object.freeze([]) as readonly [], reason,
        ...(pointerType ? { pointerType } : {}),
      }));
    };
    const bindings: ReadonlyArray<readonly [string, EventListener]> = [
      ["pointerover", (event) => update(event, event.target, "pointer")],
      ["pointermove", (event) => update(event, event.target, "pointer")],
      ["pointerout", (event) => update(event, (event as FocusEvent).relatedTarget, "pointer")],
      ["pointercancel", (event) => cancel(event, "pointercancel")],
      ["lostpointercapture", (event) => cancel(event, "lostpointercapture")],
      ["focusin", (event) => update(event, event.target, "keyboard")],
      ["focusout", (event) => update(event, (event as FocusEvent).relatedTarget, "keyboard")],
    ];
    for (const [type, handler] of bindings) {
      root.addEventListener(type, handler);
      record.disposers.push(() => root.removeEventListener(type, handler));
    }
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.#roots.delete(rootHandle);
      for (const dispose of record.disposers.splice(0).reverse()) dispose();
      record.resize?.disconnect();
      record.intersection?.disconnect();
      record.regions.clear();
      record.visibility.clear();
      root.style.cursor = record.originalCursor;
    };
  }

  bindRegion(rootHandle: object, elementHandle: object, regionId: string): () => void {
    const record = this.#roots.get(rootHandle);
    if (!record) throw new Error("Tracking region root is not bound.");
    const element = browserElement(elementHandle);
    if (!record.root.contains(element)) throw new Error("Tracking region must be contained by its exact runtime root.");
    if (record.regions.has(element)) throw new Error("A browser element may host only one region in a tracking manager.");
    record.regions.set(element, regionId);
    record.visibility.set(element, true);
    record.resize?.observe(element);
    record.intersection?.observe(element);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      record.resize?.unobserve(element);
      record.intersection?.unobserve(element);
      record.regions.delete(element);
      record.visibility.delete(element);
    };
  }

  orderRegionIds(rootHandle: object, regionIds: readonly string[]): readonly string[] {
    const record = this.#roots.get(rootHandle);
    if (!record) throw new Error("Tracking region root is not bound.");
    const elementsById = new Map([...record.regions].map(([element, id]) => [id, element] as const));
    const indexed = regionIds.map((id, index) => ({ id, index, element: elementsById.get(id) }));
    if (indexed.some(({ element }) => !element)) throw new Error("Tracking region ordering contains an unbound identity.");
    return Object.freeze(indexed.sort((left, right) => {
      if (left.element!.contains(right.element!)) return -1;
      if (right.element!.contains(left.element!)) return 1;
      return left.index - right.index;
    }).map(({ id }) => id));
  }

  applyCursor(rootHandle: object, cursor: RuntimeResolvedCursor | null): void {
    const record = this.#roots.get(rootHandle);
    if (!record) return;
    if (!cursor) {
      record.root.style.cursor = record.originalCursor;
      return;
    }
    if (cursor.kind !== "image") {
      record.root.style.cursor = cssCursor[cursor.kind];
      return;
    }
    const source = this.#sources.get(cursor.handle);
    if (!source) {
      record.root.style.cursor = cssCursor[cursor.fallback];
      return;
    }
    record.root.style.cursor = `url(${JSON.stringify(source)}) ${cursor.hotspot.x} ${cursor.hotspot.y}, ${cssCursor[cursor.fallback]}`;
  }

  async resolveCursorImage(resourceId: string, signal: AbortSignal): Promise<RuntimeCursorImageLease> {
    signal.throwIfAborted();
    const policy = this.platform.cursorImages;
    if (!policy) throw new DOMException("Custom cursor resources are unavailable.", "NotSupportedError");
    const sourceLease = await policy.acquireCursorImage(resourceId, signal);
    let transferred = false;
    try {
      signal.throwIfAborted();
      const source = sourceString(sourceLease.source);
      const handle = Object.freeze(Object.create(null)) as object;
      this.#sources.set(handle, source);
      let released = false;
      const lease = Object.freeze({
        handle,
        resourceId: sourceLease.resourceId,
        byteLength: sourceLease.byteLength,
        intrinsicWidth: sourceLease.intrinsicWidth,
        intrinsicHeight: sourceLease.intrinsicHeight,
        devicePixelRatio: sourceLease.devicePixelRatio,
        release: () => {
          if (released) return;
          released = true;
          this.#sources.delete(handle);
          sourceLease.release();
        },
      });
      transferred = true;
      return lease;
    } finally {
      if (!transferred) {
        try { sourceLease.release(); } catch { /* Preserve the acquisition/validation failure. */ }
      }
    }
  }
}
