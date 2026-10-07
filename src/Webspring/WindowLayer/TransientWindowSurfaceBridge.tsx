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

import type { ReactNode } from "react";
import type {
  SynCloudOSRuntime,
  WindowAnchor,
  WindowBounds,
  WindowCloseResult,
  WindowContentDescriptor,
  WindowContentFactoryRegistration,
  WindowContentRegistration,
  WindowRole,
} from "../../SynCloudOS/SynCloudOS";
import type { WindowContentRendererRegistry } from "./WindowContentRendererRegistry";

export interface TransientWindowSurfaceRequest {
  readonly id: string;
  readonly role: Extract<WindowRole, "sheet" | "panel" | "modal" | "popover">;
  readonly title: string;
  readonly parentWindowControllerId: string | null;
  readonly anchor: HTMLElement | null;
  readonly bounds: WindowBounds;
  /** "content": `bounds` carries the fitted content size (see NSEWindowSurfaceRequest). */
  readonly sizing?: "content";
  readonly onDidClose?: () => void;
}

export type TransientWindowSurfaceDismissResult =
  | WindowCloseResult
  | { readonly outcome: "missing"; readonly windowControllerId: null };

export interface TransientWindowSurfaceBridge {
  present(request: TransientWindowSurfaceRequest, content: ReactNode): Promise<string>;
  dismiss(requestId: string): Promise<TransientWindowSurfaceDismissResult>;
  dispose(): void;
}

export interface TransientWindowSurfaceBridgeOptions {
  readonly runtime: SynCloudOSRuntime;
  readonly renderers: WindowContentRendererRegistry;
  readonly physicalHostId: string;
  /** A null application is the system itself: its surfaces (the shared Font
   * and Colours panels) belong to no app, so they outlive every app's stage. */
  readonly owner: {
    readonly workspaceId: string;
    readonly applicationId: string | null;
    readonly applicationSessionId: string | null;
  };
  /** Focus restoration remains owned by the nearest runtime React host. */
  readonly restoreFocus?: (anchor: HTMLElement) => void;
}

interface SurfaceEntry {
  readonly generation: number;
  readonly requestId: string;
  readonly windowControllerId: string;
  readonly mountKey: string;
  readonly rendererRegistration: ReturnType<WindowContentRendererRegistry["register"]>;
  request: TransientWindowSurfaceRequest;
  phase: "opening" | "open" | "closing" | "closed";
  closeRequested: boolean;
  suppressCloseNotification: boolean;
  closeNotified: boolean;
  opened: Promise<string>;
  presentation: Promise<string>;
  closePromise: Promise<TransientWindowSurfaceDismissResult> | null;
  queuedPresentation: {
    request: TransientWindowSurfaceRequest;
    content: ReactNode;
    readonly waiters: Array<{ resolve(value: string): void; reject(error: unknown): void }>;
  } | null;
  replayAttached: boolean;
}

export class TransientWindowSurfaceBridgeDisposedError extends Error {
  constructor() {
    super("Transient window surface bridge is disposed.");
    this.name = "TransientWindowSurfaceBridgeDisposedError";
  }
}

function descriptorMountKey(descriptor: WindowContentDescriptor): string {
  const parameters = descriptor.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    throw new TypeError("Transient window surface descriptors require parameters.");
  }
  const descriptorValue = parameters as { readonly [key: string]: import("../../SynCloudOS/SynCloudOS").WindowSerializableValue };
  const mountKey = descriptorValue.mountKey;
  if (typeof mountKey !== "string" || !mountKey.trim()) {
    throw new TypeError("Transient window surface descriptors require a mount key.");
  }
  return mountKey;
}

function stableSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty.`);
  return encodeURIComponent(normalized);
}

function boundsEqual(left: WindowBounds, right: WindowBounds): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

/** Where a popover's pointer sits along its edge, measured from the nearer end. */
const POPOVER_POINTER_INSET = 28;
const POPOVER_ANCHOR_GAP = 10;
const POPOVER_VIEWPORT_MARGIN = 8;

interface PopoverPlacement {
  readonly bounds: WindowBounds;
  readonly edge: WindowAnchor["edge"];
  readonly alignment: WindowAnchor["alignment"];
}

/**
 * Hangs a popover off its anchor: below it, or above when only that fits,
 * centred on the anchor when it can be, otherwise with its pointer near the
 * end that keeps the popover on screen. Null when the anchor has no layout
 * (detached, or a host without one), so the request's bounds stand.
 */
function popoverPlacement(anchor: HTMLElement | null, size: WindowBounds): PopoverPlacement | null {
  const view = anchor?.isConnected ? anchor.ownerDocument.defaultView : null;
  if (!anchor || !view) return null;
  const rect = anchor.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const { width } = size;
  const margin = POPOVER_VIEWPORT_MARGIN;
  const below = rect.bottom + POPOVER_ANCHOR_GAP;
  const roomBelow = view.innerHeight - margin - below;
  const roomAbove = rect.top - POPOVER_ANCHOR_GAP - margin;
  // Hang below when the content fits there or there is more room below;
  // otherwise above. Taller content than the chosen side holds is clamped to
  // it and scrolls inside the window, rather than running off the screen.
  const edge = size.height <= roomBelow || roomBelow >= roomAbove ? "block-end" : "block-start";
  const height = Math.max(Math.min(size.height, 120), Math.min(size.height, edge === "block-end" ? roomBelow : roomAbove));
  const above = rect.top - POPOVER_ANCHOR_GAP - height;
  const centre = rect.left + rect.width / 2;
  const maxX = Math.max(margin, view.innerWidth - width - margin);
  let x = centre - width / 2;
  let alignment: WindowAnchor["alignment"] = "center";
  if (x < margin) {
    x = centre - POPOVER_POINTER_INSET;
    alignment = "start";
  } else if (x > maxX) {
    x = centre - width + POPOVER_POINTER_INSET;
    alignment = "end";
  }
  return {
    bounds: {
      x: Math.round(Math.min(Math.max(x, margin), maxX)),
      y: Math.round(edge === "block-end" ? below : above),
      width,
      height,
    },
    edge,
    alignment,
  };
}

const PANEL_SCREEN_MARGIN = 12;

function keptOnScreen(bounds: WindowBounds, anchor: HTMLElement | null): WindowBounds {
  const view = anchor?.ownerDocument.defaultView ?? (typeof window === "undefined" ? null : window);
  if (!view) return bounds;
  const x = Math.max(PANEL_SCREEN_MARGIN, Math.min(bounds.x, view.innerWidth - PANEL_SCREEN_MARGIN - bounds.width));
  const y = Math.max(PANEL_SCREEN_MARGIN, Math.min(bounds.y, view.innerHeight - PANEL_SCREEN_MARGIN - bounds.height));
  return { ...bounds, x, y };
}

function serialisableAnchor(anchor: HTMLElement | null, fallbackId: string, placement: PopoverPlacement | null = null): WindowAnchor | null {
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  return Object.freeze({
    id: anchor.id || fallbackId,
    rect: Object.freeze({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }),
    edge: placement?.edge ?? "block-end" as const,
    alignment: placement?.alignment ?? "start" as const,
    offset: POPOVER_ANCHOR_GAP,
  });
}

function requiresRecreation(current: TransientWindowSurfaceRequest, next: TransientWindowSurfaceRequest): boolean {
  return current.role !== next.role || current.parentWindowControllerId !== next.parentWindowControllerId;
}

/**
 * Creates a host-scoped adapter over the canonical window manager and content
 * registries. Each entry owns one open/close generation; no parallel window or
 * responder graph is created here.
 */
export function createTransientWindowSurfaceBridge({
  runtime,
  renderers,
  physicalHostId,
  owner,
  restoreFocus,
}: TransientWindowSurfaceBridgeOptions): TransientWindowSurfaceBridge {
  const hostSegment = stableSegment(physicalHostId, "Transient window physical host IDs");
  const ownerSegment = owner.applicationSessionId ?? "system";
  const bridgeId = `${runtime.runtimeId}:${ownerSegment}:${owner.applicationId ?? "system"}:${hostSegment}`;
  const rendererId = `transient-window-surface:${bridgeId}`;
  const entries = new Map<string, SurfaceEntry>();
  const entriesByMountKey = new Map<string, SurfaceEntry>();
  const latestGenerationByRequestId = new Map<string, number>();
  let generation = 0;
  let disposed = false;
  let contentRegistration: WindowContentRegistration | null = null;

  const maybeDisposeFactory = () => {
    if (!disposed || entries.size > 0 || !contentRegistration) return;
    contentRegistration.dispose();
    contentRegistration = null;
  };

  const finaliseEntry = (entry: SurfaceEntry, notify: boolean) => {
    if (entry.phase === "closed") return;
    entry.phase = "closed";
    entry.rendererRegistration.dispose();
    entriesByMountKey.delete(entry.mountKey);
    if (entries.get(entry.requestId) === entry) entries.delete(entry.requestId);
    if (notify && !entry.suppressCloseNotification && !entry.closeNotified) {
      entry.closeNotified = true;
      entry.request.onDidClose?.();
    }
    if (notify && entry.request.anchor && restoreFocus) {
      const anchor = entry.request.anchor;
      const scheduledGeneration = entry.generation;
      runtime.environment.setTimeout(() => {
        if (
          !runtime.signal.aborted &&
          anchor.isConnected &&
          !entries.has(entry.requestId) &&
          latestGenerationByRequestId.get(entry.requestId) === scheduledGeneration
        ) restoreFocus(anchor);
      }, 0);
    }
    maybeDisposeFactory();
  };

  const contentFactory: WindowContentFactoryRegistration = {
    typeId: rendererId,
    create({ descriptor, windowControllerId }) {
      const mountKey = descriptorMountKey(descriptor);
      const entry = entriesByMountKey.get(mountKey);
      if (!entry) throw new Error(`Transient window renderer "${mountKey}" is no longer owned by this host.`);
      let controllerDisposed = false;
      return {
        mountKey,
        responderId: `transient-surface:${windowControllerId}`,
        async load({ signal }) { signal.throwIfAborted(); },
        async prepareClose() {
          return { status: "ready", token: null, commit: () => undefined, rollback: () => undefined };
        },
        unload() { /* WindowController owns settlement order. */ },
        dispose() {
          if (controllerDisposed) return;
          controllerDisposed = true;
          finaliseEntry(entry, entry.phase === "open" || entry.phase === "closing");
        },
      };
    },
  };

  const ensureContentFactory = () => {
    contentRegistration ??= runtime.windows.registerContentFactory(contentFactory);
  };

  const applyMutableRequest = (entry: SurfaceEntry) => {
    if (entry.phase !== "open") return;
    const controller = runtime.windows.select(entry.windowControllerId);
    const request = entry.request;
    const placement = request.role === "popover" ? popoverPlacement(request.anchor, request.bounds) : null;
    // An open content-sized panel (an inspector) is a window the user moves:
    // it keeps its position, follows only its content's size and is brought
    // back on screen when it grows. A popover is re-placed on its anchor.
    const current = controller.record.bounds;
    const bounds = placement?.bounds ?? (request.role === "panel" && request.sizing === "content"
      ? keptOnScreen({ ...request.bounds, x: current.x, y: current.y }, request.anchor)
      : request.bounds);
    if (!boundsEqual(current, bounds)) {
      // A popover's (or a content-sized panel's) size is its content's; only
      // its position is placement.
      const contentSized = request.role === "popover" || request.sizing === "content";
      runtime.windows.setBounds(entry.windowControllerId, bounds, contentSized ? "content-size" : "programmatic");
    }
    const latest = runtime.windows.select(entry.windowControllerId).record;
    const nextAnchor = request.role === "popover"
      ? serialisableAnchor(request.anchor, `${rendererId}:${entry.requestId}:anchor`, placement)
      : null;
    if (latest.title !== request.title || JSON.stringify(latest.anchor) !== JSON.stringify(nextAnchor)) {
      runtime.windows.updatePresentation(entry.windowControllerId, { title: request.title, anchor: nextAnchor });
    }
  };

  const closeEntry = (entry: SurfaceEntry): Promise<TransientWindowSurfaceDismissResult> => {
    if (entry.phase === "closed") return Promise.resolve({ outcome: "missing", windowControllerId: null });
    entry.closeRequested = true;
    if (entry.closePromise) return entry.closePromise;
    entry.closePromise = (async () => {
      try {
        await entry.opened;
      } catch {
        finaliseEntry(entry, false);
        return { outcome: "missing", windowControllerId: null } as const;
      }
      if (entry.phase === "closed") return { outcome: "closed", windowControllerId: entry.windowControllerId } as const;
      entry.phase = "closing";
      let result: WindowCloseResult;
      try {
        result = await runtime.windows.requestClose(entry.windowControllerId, { reason: "command" });
      } catch (error) {
        const controllerStillExists = runtime.windows.snapshot().windowControllerIds.includes(entry.windowControllerId);
        if (controllerStillExists) {
          entry.phase = "open";
          entry.closeRequested = false;
          entry.closePromise = null;
          entry.suppressCloseNotification = false;
        } else {
          finaliseEntry(entry, true);
        }
        throw error;
      }
      if (result.outcome !== "closed") {
        entry.phase = "open";
        entry.closeRequested = false;
        entry.closePromise = null;
      } else {
        finaliseEntry(entry, true);
      }
      return result;
    })();
    return entry.closePromise;
  };

  const openEntry = (request: TransientWindowSurfaceRequest, content: ReactNode): SurfaceEntry => {
    ensureContentFactory();
    const requestId = request.id.trim();
    const entryGeneration = ++generation;
    latestGenerationByRequestId.set(requestId, entryGeneration);
    const identity = `${hostSegment}:${stableSegment(requestId, "Transient window surface request IDs")}`;
    const windowControllerId = `transient:${ownerSegment}:${identity}`;
    const mountKey = `${rendererId}:${identity}:${entryGeneration}`;
    const rendererRegistration = renderers.register(mountKey, () => content);
    const entry: SurfaceEntry = {
      generation: entryGeneration,
      requestId,
      windowControllerId,
      mountKey,
      rendererRegistration,
      request,
      phase: "opening" as const,
      closeRequested: false,
      suppressCloseNotification: false,
      closeNotified: false,
      opened: Promise.resolve(windowControllerId),
      presentation: Promise.resolve(windowControllerId),
      closePromise: null,
      queuedPresentation: null,
      replayAttached: false,
    };
    entries.set(requestId, entry);
    entriesByMountKey.set(mountKey, entry);
    entry.opened = (async () => {
      try {
        const placement = request.role === "popover" ? popoverPlacement(request.anchor, request.bounds) : null;
        runtime.windows.create({
          id: windowControllerId,
          workspaceId: owner.workspaceId,
          applicationId: owner.applicationId,
          applicationSessionId: owner.applicationSessionId,
          documentId: null,
          documentAssociationRole: null,
          representedDocument: null,
          toolbar: null,
          role: request.role,
          // A popover is a pointer-hung panel, not a titled window: it closes by
          // Escape or an outside click, and sizes with its anchor, not by hand.
          style: Object.freeze(request.role === "popover" ? ["closable"] : request.role === "sheet" || request.role === "modal" ? ["titled", "closable"] : ["titled", "closable", "resizable"]),
          title: request.title,
          content: Object.freeze({ rendererId, parameters: Object.freeze({ mountKey, requestId, generation: entryGeneration }) }),
          bounds: placement?.bounds ?? request.bounds,
          minimumSize: Object.freeze({ width: Math.min(240, request.bounds.width), height: Math.min(160, request.bounds.height) }),
          maximumSize: null,
          level: request.role === "panel" || request.role === "popover" ? "floating" : "modal",
          parentWindowControllerId: request.parentWindowControllerId,
          anchor: request.role === "popover" ? serialisableAnchor(request.anchor, `${rendererId}:${requestId}:anchor`, placement) : null,
          pinned: false,
          mobilePolicy: request.role === "popover" ? "popover-to-sheet" : "sheet",
          restorationKey: null,
        });
        await runtime.windows.open(windowControllerId);
        if (entries.get(requestId) !== entry) throw new Error("Transient window surface open continuation is stale.");
        entry.phase = "open";
        applyMutableRequest(entry);
        return windowControllerId;
      } catch (error) {
        finaliseEntry(entry, false);
        throw error;
      }
    })();
    entry.presentation = (async () => {
      const id = await entry.opened;
      if (disposed || entry.closeRequested) {
        await closeEntry(entry);
        throw new TransientWindowSurfaceBridgeDisposedError();
      }
      return id;
    })();
    return entry;
  };

  const queuePresentation = (
    entry: SurfaceEntry,
    request: TransientWindowSurfaceRequest,
    content: ReactNode,
  ): Promise<string> => {
    entry.suppressCloseNotification = true;
    const pending = new Promise<string>((resolve, reject) => {
      if (entry.queuedPresentation) {
        entry.queuedPresentation.request = request;
        entry.queuedPresentation.content = content;
        entry.queuedPresentation.waiters.push({ resolve, reject });
      } else {
        entry.queuedPresentation = { request, content, waiters: [{ resolve, reject }] };
      }
    });
    if (entry.replayAttached) return pending;
    entry.replayAttached = true;
    void closeEntry(entry).then((result) => {
      entry.replayAttached = false;
      const queued = entry.queuedPresentation;
      entry.queuedPresentation = null;
      if (!queued) return;
      if (result.outcome === "closed") {
        if (disposed) {
          const error = new TransientWindowSurfaceBridgeDisposedError();
          for (const waiter of queued.waiters) waiter.reject(error);
          return;
        }
        const reopened = openEntry(queued.request, queued.content).presentation;
        void reopened.then(
          (windowControllerId) => { for (const waiter of queued.waiters) waiter.resolve(windowControllerId); },
          (error: unknown) => { for (const waiter of queued.waiters) waiter.reject(error); },
        );
        return;
      }
      entry.suppressCloseNotification = false;
      if (!requiresRecreation(entry.request, queued.request) && entry.phase === "open") {
        entry.request = queued.request;
        entry.rendererRegistration.update(() => queued.content);
        applyMutableRequest(entry);
        for (const waiter of queued.waiters) waiter.resolve(entry.windowControllerId);
        return;
      }
      const error = new Error(`Transient window surface reconfiguration was ${result.outcome}.`);
      for (const waiter of queued.waiters) waiter.reject(error);
    }, (error: unknown) => {
      entry.replayAttached = false;
      entry.suppressCloseNotification = false;
      const queued = entry.queuedPresentation;
      entry.queuedPresentation = null;
      for (const waiter of queued?.waiters ?? []) waiter.reject(error);
    });
    return pending;
  };

  const present = (request: TransientWindowSurfaceRequest, content: ReactNode): Promise<string> => {
    if (disposed) return Promise.reject(new TransientWindowSurfaceBridgeDisposedError());
    const requestId = request.id.trim();
    if (!requestId) return Promise.reject(new TypeError("Transient window surface request IDs must not be empty."));
    const existing = entries.get(requestId);
    if (existing) {
      if (requiresRecreation(existing.request, request) || existing.phase === "closing" || existing.closePromise) {
        return queuePresentation(existing, request, content);
      }
      existing.request = request;
      existing.rendererRegistration.update(() => content);
      applyMutableRequest(existing);
      return existing.presentation;
    }
    return openEntry(request, content).presentation;
  };

  return {
    present,
    dismiss(requestId) {
      const entry = entries.get(requestId.trim());
      return entry ? closeEntry(entry) : Promise.resolve({ outcome: "missing", windowControllerId: null });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of [...entries.values()]) {
        entry.closeRequested = true;
        void closeEntry(entry).catch(() => undefined);
      }
      maybeDisposeFactory();
    },
  };
}
