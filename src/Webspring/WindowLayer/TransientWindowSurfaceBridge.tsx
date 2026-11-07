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

import { selectViewportFoldRegion, screenViewportRegionGeometry } from "../../SynCloudOS/SynCloudOS";
import type { ReactNode } from "react";
import type {
  SynCloudOSRuntime,
  WindowAnchor,
  WindowBounds,
  WindowCloseResult,
  WindowContentDescriptor,
  WindowContentFactoryRegistration,
  WindowContentRegistration,
} from "../../SynCloudOS/SynCloudOS";
import type { NSEWindowSurfaceRequest } from "../../NSE/Overlays/NSEWindowSurfaceBridge";
import { computeNSEPopoverPosition, nsePopoverEdgePlacement, nsePopoverReference, type NSEPopoverPosition } from "../../NSE/Overlays/popoverPosition";
import { logicalPlacementToFloatingPlacement } from "../../NSE/Overlays/computeNSEOverlayPosition";
import type { WindowContentRendererRegistry } from "./WindowContentRendererRegistry";

export type TransientWindowSurfaceRequest = NSEWindowSurfaceRequest;

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
  /** Last normal transient frame; never shared with ordinary window geometry. */
  bookFrameBase: WindowBounds | null;
  popoverPosition: NSEPopoverPosition | null;
  geometryGeneration: number;
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
  anchorIdentity: SurfaceAnchorIdentity | null;
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

function placementViewport(runtime: SynCloudOSRuntime, request: TransientWindowSurfaceRequest): { bounds: WindowBounds | null; bookRegion: boolean } {
  const screen = runtime.screen.getCurrentSnapshot();
  if (screen.geometryState !== "current") return { bounds: null, bookRegion: false };
  const { visualViewport, workArea } = screen;
  for (const bounds of [visualViewport, workArea]) {
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return { bounds: null, bookRegion: false };
  }
  // Both rectangles are in page CSS pixels. Do not subtract safe-area insets
  // again: the host owns its work area and browser env() padding stays in CSS.
  const x = Math.max(visualViewport.x, workArea.x);
  const y = Math.max(visualViewport.y, workArea.y);
  const width = Math.min(visualViewport.x + visualViewport.width, workArea.x + workArea.width) - x;
  const height = Math.min(visualViewport.y + visualViewport.height, workArea.y + workArea.height) - y;
  if (width <= 0 || height <= 0) return { bounds: null, bookRegion: false };
  if (!["popover", "sheet", "modal"].includes(request.role)) return { bounds: { x, y, width, height }, bookRegion: false };
  let owner = request.bounds;
  if (request.parentWindowControllerId) {
    try { owner = runtime.windows.select(request.parentWindowControllerId).record.bounds; } catch { /* normal create validation still applies */ }
  }
  const origin = request.anchor?.isConnected ? request.anchor.getBoundingClientRect() : request.bounds;
  const region = selectViewportFoldRegion(screenViewportRegionGeometry(screen), owner, origin);
  if (!region) return { bounds: { x, y, width, height }, bookRegion: false };
  const left = Math.max(x, region.x), top = Math.max(y, region.y);
  const right = Math.min(x + width, region.x + region.width), bottom = Math.min(y + height, region.y + region.height);
  return { bounds: right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null, bookRegion: true };
}

async function popoverPosition(request: TransientWindowSurfaceRequest, viewport: WindowBounds | null): Promise<NSEPopoverPosition | null> {
  if (request.role !== "popover" || !request.anchor?.isConnected || !viewport) return null;
  const reference = nsePopoverReference(request.anchor, request.relativeTo);
  if (![reference.x, reference.y, reference.width, reference.height].every(Number.isFinite)) return null;
  return computeNSEPopoverPosition({ reference, contentSize: request.bounds, boundary: viewport,
    placement: logicalPlacementToFloatingPlacement(request.preferredEdge ? nsePopoverEdgePlacement[request.preferredEdge] : request.placement ?? "block-end", request.anchor.ownerDocument.defaultView?.getComputedStyle(request.anchor).direction === "rtl" ? "rtl" : "ltr"),
    collisionPadding: request.collisionPadding,
  });
}

function fittedBookFrame(bounds: WindowBounds, viewport: WindowBounds): WindowBounds {
  const gap = 8, width = Math.min(bounds.width, viewport.width - 2 * gap), height = Math.min(bounds.height, viewport.height - 2 * gap);
  return { x: Math.max(viewport.x + gap, Math.min(bounds.x, viewport.x + viewport.width - gap - width)),
    y: Math.max(viewport.y + gap, Math.min(bounds.y, viewport.y + viewport.height - gap - height)), width, height };
}

const PANEL_SCREEN_MARGIN = 12;

function keptOnScreen(bounds: WindowBounds, viewport: WindowBounds | null): WindowBounds {
  if (!viewport) return bounds;
  const minX = viewport.x + Math.min(PANEL_SCREEN_MARGIN, viewport.width / 4);
  const minY = viewport.y + Math.min(PANEL_SCREEN_MARGIN, viewport.height / 4);
  const x = Math.max(minX, Math.min(bounds.x, viewport.x + viewport.width - PANEL_SCREEN_MARGIN - bounds.width));
  const y = Math.max(minY, Math.min(bounds.y, viewport.y + viewport.height - PANEL_SCREEN_MARGIN - bounds.height));
  return { ...bounds, x, y };
}

interface SurfaceAnchorIdentity {
  readonly anchor: HTMLElement;
  readonly id: string;
  dispose(): void;
}

// A DOM anchor can be shared by independently owned surfaces. Its generated
// identity lasts until the last surface releases it, including across hosts.
const generatedAnchorIdentities = new WeakMap<HTMLElement, { readonly id: string; readonly previousId: string | null; users: number }>();

function acquireAnchorIdentity(anchor: HTMLElement, fallbackId: string): SurfaceAnchorIdentity {
  let identity = generatedAnchorIdentities.get(anchor);
  if (!identity || anchor.id !== identity.id) {
    if (anchor.id) return { anchor, id: anchor.id, dispose() {} };
    identity = { id: fallbackId, previousId: anchor.getAttribute("id"), users: 0 };
    anchor.id = identity.id;
    generatedAnchorIdentities.set(anchor, identity);
  }
  const acquired = identity;
  acquired.users++;
  let live = true;
  return { anchor, id: acquired.id, dispose() {
    if (!live) return;
    live = false;
    if (--acquired.users > 0) return;
    if (generatedAnchorIdentities.get(anchor) !== acquired) return;
    generatedAnchorIdentities.delete(anchor);
    if (anchor.id !== acquired.id) return;
    if (acquired.previousId === null) anchor.removeAttribute("id");
    else anchor.setAttribute("id", acquired.previousId);
  } };
}

function serialisableAnchor(identity: SurfaceAnchorIdentity | null, request: TransientWindowSurfaceRequest, position: NSEPopoverPosition | null = null): WindowAnchor | null {
  if (!identity) return null;
  const { anchor, id } = identity;
  const rect = nsePopoverReference(anchor, request.relativeTo);
  const side = position?.placement.split("-")[0] ?? "bottom";
  const edge = ({ top: "block-start", bottom: "block-end", left: "inline-start", right: "inline-end" } as const)[side as "top"];
  return Object.freeze({
    id,
    rect: Object.freeze({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }),
    edge,
    alignment: "center" as const,
    offset: 12,
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
  let geometryFrame: unknown = null;
  const geometryDisposers: Array<() => void> = [];
  let anchorResizeObserver: ResizeObserver | null = null;
  let observedAnchors = new Set<HTMLElement>();

  function stopGeometryObservation() {
    if (geometryFrame !== null) runtime.environment.cancelAnimationFrame(geometryFrame);
    geometryFrame = null;
    for (const dispose of geometryDisposers.splice(0)) dispose();
    anchorResizeObserver?.disconnect();
    anchorResizeObserver = null;
    observedAnchors.clear();
  }

  function scheduleGeometry() {
    if (disposed || runtime.signal.aborted || geometryFrame !== null) return;
    geometryFrame = runtime.environment.requestAnimationFrame(() => {
      geometryFrame = null;
      if (disposed || runtime.signal.aborted) return;
      for (const entry of entries.values()) {
        if (entry.phase === "open" && (entry.request.role === "sheet" || entry.request.role === "modal" || (entry.request.role === "popover" && entry.request.anchor?.isConnected))) void applyMutableRequest(entry, true).catch(() => undefined);
      }
    });
  }

  function refreshGeometryObservation() {
    const anchors = new Set([...entries.values()]
      .filter(entry => entry.phase !== "closed" && ["popover", "sheet", "modal"].includes(entry.request.role))
      .flatMap(entry => entry.request.anchor?.isConnected ? [entry.request.anchor] : []));
    if (disposed || runtime.signal.aborted || ![...entries.values()].some(entry => entry.phase !== "closed" && ["popover", "sheet", "modal"].includes(entry.request.role))) {
      stopGeometryObservation();
      return;
    }
    if (geometryDisposers.length === 0) {
      geometryDisposers.push(
        runtime.screen.subscribe(scheduleGeometry),
        runtime.windows.subscribe(scheduleGeometry),
        runtime.environment.addWindowListener("scroll", scheduleGeometry, { capture: true, passive: true }),
      );
      const view = runtime.environment.browser.getWindow() as (Window & { ResizeObserver?: typeof ResizeObserver }) | null;
      anchorResizeObserver = view?.ResizeObserver ? new view.ResizeObserver(scheduleGeometry) : null;
    }
    if (anchors.size !== observedAnchors.size || [...anchors].some(anchor => !observedAnchors.has(anchor))) {
      anchorResizeObserver?.disconnect();
      for (const anchor of anchors) anchorResizeObserver?.observe(anchor);
      observedAnchors = anchors;
    }
  }

  runtime.signal.addEventListener("abort", stopGeometryObservation, { once: true });

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
    entry.anchorIdentity?.dispose();
    entry.anchorIdentity = null;
    if (entries.get(entry.requestId) === entry) entries.delete(entry.requestId);
    refreshGeometryObservation();
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

  const updateAnchorIdentity = (entry: SurfaceEntry) => {
    const anchor = entry.request.role === "popover" ? entry.request.anchor : null;
    if (entry.anchorIdentity?.anchor === anchor && entry.anchorIdentity?.id === anchor?.id) { refreshGeometryObservation(); return; }
    const previous = entry.anchorIdentity;
    entry.anchorIdentity = anchor ? acquireAnchorIdentity(anchor, `${entry.mountKey}:anchor`) : null;
    previous?.dispose();
    refreshGeometryObservation();
  };

  const applyMutableRequest = async (entry: SurfaceEntry, geometryOnly = false) => {
    if (entry.phase !== "open") return;
    const generation = ++entry.geometryGeneration;
    const controller = runtime.windows.select(entry.windowControllerId);
    const request = entry.request;
    updateAnchorIdentity(entry);
    const anchoredTransient = request.role === "modal" || request.role === "sheet";
    const normalOrigin = entry.bookFrameBase ?? (geometryOnly ? controller.record.bounds : null);
    const geometryRequest = anchoredTransient && normalOrigin && !request.anchor?.isConnected
      ? { ...request, bounds: { ...request.bounds, x: normalOrigin.x, y: normalOrigin.y } } : request;
    const { bounds: viewport, bookRegion } = placementViewport(runtime, geometryRequest);
    const wasBook = entry.bookFrameBase;
    if (anchoredTransient) {
      if (bookRegion && !entry.bookFrameBase) entry.bookFrameBase = controller.record.bounds;
      if (!bookRegion && geometryOnly && !entry.bookFrameBase) return;
      if (bookRegion && entry.bookFrameBase && !geometryOnly) entry.bookFrameBase = { ...entry.bookFrameBase, width: request.bounds.width, height: request.bounds.height };
    }
    if (["popover", "sheet", "modal"].includes(request.role) && !viewport) return;
    const placement = request.role === "popover" ? await popoverPosition(request, viewport) : null;
    if (entry.phase !== "open" || generation !== entry.geometryGeneration || request !== entry.request) return;
    entry.popoverPosition = placement;
    // An open content-sized panel (an inspector) is a window the user moves:
    // it keeps its position, follows only its content's size and is brought
    // back on screen when it grows. A popover is re-placed on its anchor.
    const current = controller.record.bounds;
    const bounds = placement?.bounds ?? (request.role === "panel" && request.sizing === "content"
      ? keptOnScreen({ ...request.bounds, x: current.x, y: current.y }, viewport)
      : bookRegion && viewport && anchoredTransient ? fittedBookFrame({ ...request.bounds, ...(entry.bookFrameBase ? { x: entry.bookFrameBase.x, y: entry.bookFrameBase.y } : {}) }, viewport)
        : geometryOnly && wasBook ? wasBook : request.bounds);
    if (anchoredTransient && !bookRegion) entry.bookFrameBase = null;
    if (!boundsEqual(current, bounds)) {
      // A popover's (or a content-sized panel's) size is its content's; only
      // its position is placement.
      const contentSized = request.role === "popover" || request.sizing === "content" || (anchoredTransient && (bookRegion || Boolean(wasBook)));
      runtime.windows.setBounds(entry.windowControllerId, bounds, contentSized ? "content-size" : "programmatic");
    }
    const latest = runtime.windows.select(entry.windowControllerId).record;
    const nextAnchor = request.role === "popover"
      ? serialisableAnchor(entry.anchorIdentity, request, placement)
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
    const rendererRegistration = renderers.register(mountKey, () => content, () => ({ request: entry.request, popoverPosition: entry.popoverPosition }));
    const entry: SurfaceEntry = {
      bookFrameBase: null,
      popoverPosition: null,
      geometryGeneration: 0,
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
      anchorIdentity: null,
    };
    entries.set(requestId, entry);
    entriesByMountKey.set(mountKey, entry);
    entry.opened = (async () => {
      try {
        updateAnchorIdentity(entry);
        const { bounds: viewport, bookRegion } = placementViewport(runtime, request);
        if (bookRegion && (request.role === "modal" || request.role === "sheet")) entry.bookFrameBase = request.bounds;
        const placement = await popoverPosition(request, viewport);
        entry.popoverPosition = placement;
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
          bounds: placement?.bounds ?? (bookRegion && viewport && (request.role === "sheet" || request.role === "modal") ? fittedBookFrame(request.bounds, viewport) : request.bounds),
          // Popovers are fitted, non-resizable surfaces. A desktop inspector's
          // minimum must not force them beyond a shallow visible viewport.
          minimumSize: Object.freeze(request.role === "popover"
            ? { width: 1, height: 1 }
            : { width: Math.min(240, request.bounds.width), height: Math.min(160, request.bounds.height) }),
          maximumSize: null,
          level: request.role === "panel" || request.role === "popover" ? "floating" : "modal",
          parentWindowControllerId: request.parentWindowControllerId,
          anchor: request.role === "popover" ? serialisableAnchor(entry.anchorIdentity, request, placement) : null,
          pinned: false,
          mobilePolicy: request.role === "popover" ? "popover-to-sheet" : "sheet",
          restorationKey: null,
        });
        await runtime.windows.open(windowControllerId);
        if (entries.get(requestId) !== entry) throw new Error("Transient window surface open continuation is stale.");
        entry.phase = "open";
        await applyMutableRequest(entry);
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
    void closeEntry(entry).then(async (result) => {
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
        await applyMutableRequest(entry);
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
      return applyMutableRequest(existing).then(() => existing.presentation);
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
      runtime.signal.removeEventListener("abort", stopGeometryObservation);
      stopGeometryObservation();
      for (const entry of [...entries.values()]) {
        entry.closeRequested = true;
        void closeEntry(entry).catch(() => undefined);
      }
      maybeDisposeFactory();
    },
  };
}
