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
  createElement,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createNSEOverlayManager } from "./NSEOverlayManager";
import type {
  NSEOverlayFocusScopeOptions,
  NSEOverlayManager,
  NSEOverlayRuntimePort,
} from "./overlayTypes";
import type { NSEFocusPort, NSEFocusScopeOptions } from "../Focus/NSEFocusPort";
import type { SynCloudOSPresentationTraits } from "../../SynCloudOS/SynCloudOS";

export interface NSEStandaloneControlRuntimeOptions {
  readonly document: Document;
  readonly window: Window;
  readonly presentation: NSEOverlayRuntimePort["environment"]["presentation"];
  readonly parentResponderId?: string;
  readonly runtimeId?: string;
  readonly onPlacementFailure?: NSEOverlayRuntimePort["reportPlacementFailure"];
}

export interface NSEStandaloneControlRuntime {
  readonly runtime: NSEOverlayRuntimePort;
  readonly runtimePort: NSEOverlayRuntimePort;
  readonly manager: NSEOverlayManager;
  readonly focusPort: NSEFocusPort;
  readonly parentResponderId: string;
  start(): void;
  dispose(reason?: unknown): void;
}

interface LocalFocusScopeOptions {
  readonly scopeId: string;
  readonly kind: NSEFocusScopeOptions["kind"] | NSEOverlayFocusScopeOptions["kind"];
  readonly parentResponderId?: string;
  readonly parentScopeId?: string;
  readonly modal?: boolean;
  readonly trapFocus?: boolean;
  readonly restoreFocus?: boolean;
  readonly asChild?: boolean;
}

interface LocalFocusScopeRecord {
  readonly id: string;
  readonly options: LocalFocusScopeOptions;
  readonly previous: HTMLElement | null;
  root: HTMLElement | null;
}

interface LocalFocusAuthority {
  readonly runtimeId: string;
  readonly focusPort: NSEFocusPort;
  start(): void;
  restoreFocus(responderId: string, anchor: HTMLElement | null): void;
  enter(options: LocalFocusScopeOptions, root: HTMLElement | null): () => void;
  dispose(): void;
}

let standaloneRuntimeSequence = 0;

function nextRuntimeId(): string {
  standaloneRuntimeSequence += 1;
  return `nse-standalone:${standaloneRuntimeSequence}`;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function workAreaFromPresentation(snapshot: SynCloudOSPresentationTraits) {
  const bounds = snapshot.workArea;
  const safeArea = snapshot.safeAreaInsets;
  return Object.freeze({
    width: finite(bounds.width),
    height: finite(bounds.height),
    safeArea: Object.freeze({
      top: finite(safeArea.blockStart),
      right: finite(safeArea.inlineEnd),
      bottom: finite(safeArea.blockEnd),
      left: finite(safeArea.inlineStart),
    }),
  });
}

function visualViewportFromPresentation(
  browserWindow: Window,
  snapshot: SynCloudOSPresentationTraits,
) {
  const viewport = browserWindow.visualViewport;
  if (viewport) {
    return Object.freeze({
      width: finite(viewport.width),
      height: finite(viewport.height),
      offsetLeft: finite(viewport.offsetLeft),
      offsetTop: finite(viewport.offsetTop),
    });
  }
  const bounds = snapshot.visualViewportBounds;
  return Object.freeze({
    width: finite(bounds.width),
    height: finite(bounds.height),
    offsetLeft: finite(bounds.x),
    offsetTop: finite(bounds.y),
  });
}

function sameWorkArea(
  left: ReturnType<typeof workAreaFromPresentation>,
  right: ReturnType<typeof workAreaFromPresentation>,
): boolean {
  return left.width === right.width
    && left.height === right.height
    && left.safeArea.top === right.safeArea.top
    && left.safeArea.right === right.safeArea.right
    && left.safeArea.bottom === right.safeArea.bottom
    && left.safeArea.left === right.safeArea.left;
}

function sameVisualViewport(
  left: ReturnType<typeof visualViewportFromPresentation>,
  right: ReturnType<typeof visualViewportFromPresentation>,
): boolean {
  return left.width === right.width
    && left.height === right.height
    && left.offsetLeft === right.offsetLeft
    && left.offsetTop === right.offsetTop;
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable='true'], [tabindex]:not([tabindex='-1'])",
  )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

function responderMarker(element: EventTarget | null): string | null {
  if (!(element instanceof HTMLElement)) return null;
  const marked = element.closest<HTMLElement>("[data-nse-responder-id], [data-syncloudos-responder-id]");
  return marked?.dataset.nseResponderId ?? marked?.dataset.syncloudosResponderId ?? null;
}

class LocalFocusAuthorityImpl implements LocalFocusAuthority {
  readonly runtimeId: string;
  readonly focusPort: NSEFocusPort;
  #document: Document;
  #scopes = new Map<string, LocalFocusScopeRecord>();
  #lastFocusedByResponder = new Map<string, HTMLElement>();
  #started = false;
  #disposed = false;
  #onFocusIn = (event: FocusEvent) => {
    const responderId = responderMarker(event.target);
    if (responderId && event.target instanceof HTMLElement) this.#lastFocusedByResponder.set(responderId, event.target);
  };

  documentActiveElement(): Element | null {
    return this.#document.activeElement;
  }

  constructor(document: Document, runtimeId: string) {
    this.#document = document;
    this.runtimeId = runtimeId;
    this.focusPort = {
      runtimeId,
      wrapFocusScope: (options: NSEFocusScopeOptions, children: ReactNode) => createElement(StandaloneFocusScope, {
        authority: this,
        options,
        children,
      }),
    };
  }

  start(): void {
    if (this.#started || this.#disposed) return;
    this.#started = true;
    this.#document.addEventListener("focusin", this.#onFocusIn, true);
  }

  restoreFocus(responderId: string, anchor: HTMLElement | null): void {
    if (this.#disposed) return;
    if (anchor?.isConnected) {
      anchor.focus({ preventScroll: true });
      return;
    }
    const previous = this.#lastFocusedByResponder.get(responderId);
    if (previous?.isConnected) {
      previous.focus({ preventScroll: true });
      return;
    }
    const candidates = this.#document.querySelectorAll<HTMLElement>("[data-nse-responder-id], [data-syncloudos-responder-id]");
    for (const candidate of candidates) {
      if (responderMarker(candidate) !== responderId) continue;
      candidate.focus({ preventScroll: true });
      return;
    }
  }

  enter(options: LocalFocusScopeOptions, root: HTMLElement | null): () => void {
    if (this.#disposed) return () => undefined;
    const id = `${this.runtimeId}:${options.scopeId}`;
    const record: LocalFocusScopeRecord = {
      id,
      options,
      previous: this.#document.activeElement instanceof HTMLElement ? this.#document.activeElement : null,
      root,
    };
    this.#scopes.set(id, record);
    if (root && options.trapFocus) {
      const active = this.#document.activeElement;
      if (!(active instanceof HTMLElement) || !root.contains(active)) {
        focusableElements(root)[0]?.focus({ preventScroll: true });
      }
    }
    return () => {
      const current = this.#scopes.get(id);
      if (!current) return;
      this.#scopes.delete(id);
      if (current.options.restoreFocus === false) return;
      const active = this.#document.activeElement;
      if (active && current.root?.contains(active)) return;
      if (current.previous?.isConnected) current.previous.focus({ preventScroll: true });
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#started) this.#document.removeEventListener("focusin", this.#onFocusIn, true);
    this.#started = false;
    this.#scopes.clear();
    this.#lastFocusedByResponder.clear();
  }
}

function StandaloneFocusScope({
  authority,
  options,
  children,
}: {
  readonly authority: LocalFocusAuthorityImpl;
  readonly options: NSEFocusScopeOptions;
  readonly children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    releaseRef.current?.();
    releaseRef.current = authority.enter(options, rootRef.current);
    return () => {
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [authority, options]);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!options.trapFocus || event.defaultPrevented || event.key !== "Tab") return;
    const root = rootRef.current;
    if (!root) return;
    const focusable = focusableElements(root);
    if (focusable.length === 0) return;
    const active = authority.documentActiveElement();
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && (active === first || !root.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !root.contains(active))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };
  return createElement("div", {
    ref: rootRef,
    "data-nse-focus-scope": options.scopeId,
    "data-nse-focus-scope-kind": options.kind,
    "data-nse-focus-scope-runtime": authority.runtimeId,
    style: { display: "contents" },
    onKeyDown,
  }, children);
}

// The local authority exposes the active element through the explicit
// document supplied by the standalone host; scopes never consult globals.

export function createStandaloneNSEControlRuntime(options: NSEStandaloneControlRuntimeOptions): NSEStandaloneControlRuntime {
  if (!options.document || !options.window || !options.presentation) throw new TypeError("Standalone NSE controls require a document, window and presentation port.");
  const runtimeId = options.runtimeId?.trim() || nextRuntimeId();
  const parentResponderId = options.parentResponderId?.trim() || `standalone:${runtimeId}`;
  const manager = createNSEOverlayManager();
  const controller = new AbortController();
  const focusAuthority = new LocalFocusAuthorityImpl(options.document, runtimeId);
  const workAreaListeners = new Set<() => void>();
  const visualViewportListeners = new Set<() => void>();
  const timers = new Set<number>();
  let presentationUnsubscribe: (() => void) | null = null;
  let started = false;
  let disposed = false;
  let workAreaSnapshot = workAreaFromPresentation(options.presentation.getSnapshot());
  let visualViewportSnapshot = visualViewportFromPresentation(options.window, options.presentation.getSnapshot());

  const refreshSnapshots = () => {
    if (disposed) return;
    const presentationSnapshot = options.presentation.getSnapshot();
    const nextWorkArea = workAreaFromPresentation(presentationSnapshot);
    const nextVisualViewport = visualViewportFromPresentation(options.window, presentationSnapshot);
    const workAreaChanged = !sameWorkArea(workAreaSnapshot, nextWorkArea);
    const visualViewportChanged = !sameVisualViewport(visualViewportSnapshot, nextVisualViewport);
    workAreaSnapshot = nextWorkArea;
    visualViewportSnapshot = nextVisualViewport;
    if (workAreaChanged) for (const listener of [...workAreaListeners]) listener();
    if (visualViewportChanged) for (const listener of [...visualViewportListeners]) listener();
  };

  const start = () => {
    if (started || disposed) return;
    started = true;
    focusAuthority.start();
    presentationUnsubscribe = options.presentation.subscribe(refreshSnapshots);
    options.window.addEventListener("resize", refreshSnapshots, { passive: true });
    options.window.addEventListener("orientationchange", refreshSnapshots, { passive: true });
    options.window.visualViewport?.addEventListener("resize", refreshSnapshots, { passive: true });
    options.window.visualViewport?.addEventListener("scroll", refreshSnapshots, { passive: true });
  };

  const clearTimer = (handle: unknown) => {
    // The scheduler port treats handles as opaque. Ownership is established
    // by registration, including when an instrumented Window wraps its timers.
    if (!timers.delete(handle as number)) return;
    options.window.clearTimeout(handle as number);
  };

  const runtime: NSEOverlayRuntimePort = {
    runtimeId,
    signal: controller.signal,
    environment: {
      browser: {
        getDocument: () => options.document,
        getWindow: () => options.window,
      },
      workArea: {
        getSnapshot: () => workAreaSnapshot,
        subscribe(listener) {
          start();
          workAreaListeners.add(listener);
          return () => workAreaListeners.delete(listener);
        },
      },
      visualViewport: {
        getSnapshot: () => visualViewportSnapshot,
        subscribe(listener) {
          start();
          visualViewportListeners.add(listener);
          return () => visualViewportListeners.delete(listener);
        },
      },
      presentation: options.presentation,
      setTimeout(callback, delayMs) {
        start();
        if (controller.signal.aborted) return undefined;
        let handle = 0;
        handle = options.window.setTimeout(() => {
          timers.delete(handle);
          if (!controller.signal.aborted) callback();
        }, Math.max(0, delayMs));
        timers.add(handle);
        return handle;
      },
      clearTimeout: clearTimer,
    },
    restoreFocus: (responderId, anchor) => focusAuthority.restoreFocus(responderId, anchor),
    reportPlacementFailure: (input) => options.onPlacementFailure?.(input),
    wrapFocusScope: (scopeOptions, children) => focusAuthority.focusPort.wrapFocusScope({
      ...scopeOptions,
      kind: scopeOptions.kind === "sheet" ? "modal" : scopeOptions.kind,
    }, children),
  };

  const dispose = (reason?: unknown) => {
    if (disposed) return;
    disposed = true;
    controller.abort(reason);
    manager.dispose();
    presentationUnsubscribe?.();
    presentationUnsubscribe = null;
    options.window.removeEventListener("resize", refreshSnapshots);
    options.window.removeEventListener("orientationchange", refreshSnapshots);
    options.window.visualViewport?.removeEventListener("resize", refreshSnapshots);
    options.window.visualViewport?.removeEventListener("scroll", refreshSnapshots);
    for (const handle of [...timers]) clearTimer(handle);
    workAreaListeners.clear();
    visualViewportListeners.clear();
    focusAuthority.dispose();
    started = false;
  };

  return Object.freeze({
    runtime,
    runtimePort: runtime,
    manager,
    focusPort: focusAuthority.focusPort,
    parentResponderId,
    start,
    dispose,
  });
}
