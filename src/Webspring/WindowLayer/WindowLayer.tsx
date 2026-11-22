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

import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Presence } from "../../NSE/Animation";
import { useNSEAppearanceProjection } from "../../NSE/Appearance";
import { RubberBandProvider } from "../../NSE/Scroll";
import { PresentingDocumentContext } from "../../NSE/hostComposition";
import type { WindowSurfaceBinding } from "../../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS } from "../../SynCloudOSReact";
import { useWindowPresentationContent } from "../WindowPresentationContent";
import { WindowHost, type WindowLayerDiagnostic } from "./WindowHost";
import type { WindowContentRendererRegistry } from "./WindowContentRendererRegistry";
import { readWindowSurfaceScreen, subscribeWindowSurfaceViewport } from "./windowSurfaceScreen";
import "./window-layer.css";

export interface WindowLayerProps {
  readonly contentRegistry: WindowContentRendererRegistry;
  readonly onDiagnostic?: (diagnostic: WindowLayerDiagnostic) => void;
}

function runtimeOwnerRoot(layer: HTMLElement, runtimeId: string): HTMLElement {
  let current = layer.parentElement;
  while (current) {
    if (current.dataset.syncloudosRuntimeOwner === runtimeId) return current;
    current = current.parentElement;
  }
  return layer;
}

function hasOwnedAnchor(root: HTMLElement, runtimeId: string, anchorId: string): boolean {
  return [...root.querySelectorAll<HTMLElement>("[id]")].some((element) => (
    element.id === anchorId &&
    element.closest<HTMLElement>("[data-syncloudos-runtime-owner]")?.dataset.syncloudosRuntimeOwner === runtimeId
  ));
}

function PopoverModalBackdrop({ zIndex }: { readonly zIndex: number }) {
  const appearance = useNSEAppearanceProjection();
  return <div {...appearance} style={{ display: "contents" }}>
    <div className="nse-overlay-popup-modal-host">
      <div className="nse-overlay-popup-backdrop" data-window-modal-backdrop="" data-nse-part="backdrop" data-nse-role="overlay" aria-hidden
        style={{ zIndex, pointerEvents: "auto" }} onPointerDown={event => event.stopPropagation()} />
    </div>
  </div>;
}

export function WindowLayer(props: WindowLayerProps) {
  const runtime = useKernelSynCloudOS();
  const snapshot = useSyncExternalStore(runtime.windows.subscribe, runtime.windows.snapshot, runtime.windows.snapshot);
  const appearance = useNSEAppearanceProjection();
  return <>
    <WindowSurfaceLayer {...props} binding={null} />
    {snapshot.windowControllerIds.flatMap(id => {
      const binding = runtime.windows.detachedSurface(id);
      return binding ? [createPortal(
        <PresentingDocumentContext.Provider value={binding.element.ownerDocument}>
          <RubberBandProvider>
            <div {...appearance} data-syncloudos-runtime-owner={runtime.runtimeId}>
              <WindowSurfaceLayer {...props} binding={binding} />
            </div>
          </RubberBandProvider>
        </PresentingDocumentContext.Provider>, binding.element, String(binding.generation))]
        : [];
    })}
  </>;
}

function WindowSurfaceLayer({ contentRegistry, onDiagnostic, binding }: WindowLayerProps & { readonly binding: WindowSurfaceBinding | null }) {
  const runtime = useKernelSynCloudOS();
  const sharedPresentation = useWindowPresentationContent();
  const layerRef = useRef<HTMLDivElement>(null);
  const clearSuppressedAnchorClickRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { clearSuppressedAnchorClickRef.current?.(); }, []);
  const managerSnapshot = useSyncExternalStore(
    runtime.windows.subscribe,
    runtime.windows.snapshot,
    runtime.windows.snapshot,
  );
  const openerScreen = useSyncExternalStore(
    runtime.screen.subscribe,
    runtime.screen.getSnapshot,
    runtime.screen.getSnapshot,
  );
  const documentPort = binding?.element.ownerDocument ?? runtime.environment.browser.getDocument();
  const childView = binding ? documentPort?.defaultView ?? null : null;
  const [viewportRevision, viewportChanged] = useReducer(revision => revision + 1, 0);
  useLayoutEffect(() => childView ? subscribeWindowSurfaceViewport(childView, viewportChanged) : undefined, [childView]);
  const childScreen = useMemo(() => childView ? readWindowSurfaceScreen(childView) : null, [childView, viewportRevision]);
  const screen = childScreen ?? openerScreen;
  const windowIds = managerSnapshot.windowControllerIds.filter(id => runtime.windows.presentingSurface(id) === binding);
  const transientAnchors = windowIds.flatMap((windowControllerId) => {
    const record = runtime.windows.select(windowControllerId).record;
    return record.role === "popover" && !record.pinned && record.anchor ? [record.anchor.id] : [];
  });

  useEffect(() => {
    const layer = layerRef.current;
    if (!documentPort || !layer) return;
    const ownerRoot = runtimeOwnerRoot(layer, runtime.runtimeId);
    const dismissTransients = (reason: "outside-pointer" | "anchor-removed", except?: string) => {
      const popoverSheets = runtime.windows.list({ role: "sheet" }).filter(controller => {
        const state = controller.contentState;
        return state.status === "loaded" && contentRegistry.surface(state.mountKey)?.request.drawsBackground !== undefined;
      });
      const candidates = [...runtime.windows.list({ role: "popover" }), ...popoverSheets].filter(({ record }) =>
        !record.pinned && record.id !== except && runtime.windows.presentingSurface(record.id) === binding);
      const eligible = candidates.filter(controller => {
        const state = controller.contentState;
        const request = state.status === "loaded" ? contentRegistry.surface(state.mountKey)?.request : null;
        if (reason === "anchor-removed") return request?.anchor
          ? !request.anchor.isConnected
          : controller.record.anchor && !hasOwnedAnchor(ownerRoot, runtime.runtimeId, controller.record.anchor.id);
        return !request?.behavior || request.behavior === "transient";
      });
      if (eligible.length === candidates.length && candidates.every(({ record }) => record.role === "popover") &&
          !runtime.windows.list({ role: "popover" }).some(({ id }) => runtime.windows.presentingSurface(id) !== binding)) {
        void runtime.windows.dismissTransientWindows({ reason, ...(except ? { except } : {}) }).catch(() => undefined);
      } else {
        for (const controller of eligible) void runtime.windows.requestClose(controller.id, { reason: "command" }).catch(() => undefined);
      }
    };
    const dismissOutside = (event: PointerEvent) => {
      clearSuppressedAnchorClickRef.current?.();
      const ElementPort = documentPort.defaultView?.Element;
      const target = ElementPort && event.target instanceof ElementPort ? event.target : null;
      if (target?.closest<HTMLElement>("[data-syncloudos-runtime-owner]")?.dataset.syncloudosRuntimeOwner !== runtime.runtimeId) return;
      const host = target?.closest<HTMLElement>("[data-window-host]") ?? null;
      const except = host?.dataset.windowHost;
      // Clicking the anchor button that opened a transient popover dismisses it
      // on pointerdown; suppress the matching click from the same press so the
      // button does not immediately re-open the popover it just dismissed.
      const dismissedAnchors: Element[] = [];
      if (target) {
        const popoverSheets = runtime.windows.list({ role: "sheet" }).filter(controller => {
          const state = controller.contentState;
          return state.status === "loaded" && contentRegistry.surface(state.mountKey)?.request.drawsBackground !== undefined;
        });
        for (const controller of [...runtime.windows.list({ role: "popover" }), ...popoverSheets]) {
          if (controller.record.pinned || controller.record.id === except || runtime.windows.presentingSurface(controller.record.id) !== binding) continue;
          const state = controller.contentState;
          const request = state.status === "loaded" ? contentRegistry.surface(state.mountKey)?.request : null;
          if (request?.behavior && request.behavior !== "transient") continue;
          const anchor = request?.anchor
            ?? (controller.record.anchor ? ownerRoot.querySelector(`[data-window-anchor="${CSS.escape(controller.record.anchor.id)}"]`) : null);
          if (anchor && anchor.contains(target)) dismissedAnchors.push(anchor);
        }
      }
      dismissTransients("outside-pointer", except);
      if (dismissedAnchors.length > 0) {
        let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
          if (cleanupTimer !== null) { clearTimeout(cleanupTimer); cleanupTimer = null; }
          documentPort.removeEventListener("click", suppressAnchorClick, true);
          documentPort.removeEventListener("pointerup", scheduleCleanup, true);
          documentPort.removeEventListener("pointercancel", cleanup, true);
          if (clearSuppressedAnchorClickRef.current === cleanup) clearSuppressedAnchorClickRef.current = null;
        };
        const suppressAnchorClick = (clickEvent: MouseEvent) => {
          const clickTarget = ElementPort && clickEvent.target instanceof ElementPort ? clickEvent.target : null;
          if (clickTarget && dismissedAnchors.some((anchor) => anchor.contains(clickTarget))) {
            clickEvent.preventDefault();
            clickEvent.stopImmediatePropagation();
          }
          cleanup();
        };
        const scheduleCleanup = () => {
          if (cleanupTimer !== null) clearTimeout(cleanupTimer);
          cleanupTimer = setTimeout(cleanup, 0);
        };
        clearSuppressedAnchorClickRef.current = cleanup;
        documentPort.addEventListener("click", suppressAnchorClick, true);
        documentPort.addEventListener("pointerup", scheduleCleanup, true);
        documentPort.addEventListener("pointercancel", cleanup, true);
      }
    };
    ownerRoot.addEventListener("pointerdown", dismissOutside, true);
    const MutationObserverPort = documentPort.defaultView?.MutationObserver;
    const observer = MutationObserverPort && transientAnchors.length > 0
      ? new MutationObserverPort(() => {
          // The bridge may have replaced an anchor or closed its surface since
          // this observer was installed. Inspect the current records so releasing
          // an old generated identity cannot dismiss the replacement surface.
          const currentAnchors = runtime.windows.list({ role: "popover" }).flatMap(({ record }) => (
            !record.pinned && record.anchor && runtime.windows.presentingSurface(record.id) === binding ? [record.anchor.id] : []
          ));
          if (currentAnchors.some((anchorId) => !hasOwnedAnchor(ownerRoot, runtime.runtimeId, anchorId))) {
            dismissTransients("anchor-removed");
          }
        })
      : null;
    observer?.observe(ownerRoot, { childList: true, subtree: true });
    return () => {
      ownerRoot.removeEventListener("pointerdown", dismissOutside, true);
      observer?.disconnect();
    };
  }, [binding, contentRegistry, documentPort, managerSnapshot.generation, runtime, transientAnchors.join("\u0000")]);

  const modalControllers = windowIds
    .map((id) => runtime.windows.select(id))
    .filter(controller => {
      const { record, contentState } = controller;
      const request = contentState.status === "loaded" ? contentRegistry.surface(contentState.mountKey)?.request : null;
      return record.state === "open" && (record.role === "modal" || record.role === "sheet" || record.role === "popover" && request && (screen.breakpoint === "compact" || request.presentation?.mode === "sheet"));
    });
  const topModal = modalControllers.at(-1);
  const topModalZ = topModal?.record.zIndex ?? null;

  return (
    <div
      ref={layerRef}
      className="webspring-window-layer"
      data-window-layer=""
      data-window-modal-active={topModalZ !== null || managerSnapshot.blockedWindowControllerIds.length > 0 ? "true" : "false"}
    >
      {topModalZ !== null && topModal?.record.role === "popover" ? <PopoverModalBackdrop zIndex={Math.max(0, topModalZ - 0.5)} /> : topModalZ !== null && !topModal?.record.applicationId && !topModal?.record.parentWindowControllerId ? (
        <div
          className="webspring-window-modal-backdrop"
          data-nse-control="window" data-nse-part="backdrop" data-nse-role="modal"
          data-window-modal-backdrop=""
          aria-hidden="true"
          style={{ zIndex: Math.max(0, topModalZ - 0.5) }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : null}
      <Presence>
        {windowIds.filter(id => {
          if (!sharedPresentation) return true;
          const { record } = runtime.windows.select(id);
          if (record.role !== "standard" || (record.fullScreen !== "on" && record.fullScreen !== "exiting")) return true;
          const app = record.applicationId ? runtime.apps.getApp(record.applicationId) : null;
          return app?.presentation !== "stage";
        }).map((windowControllerId) => (
          <WindowHost
            key={windowControllerId}
            controller={runtime.windows.select(windowControllerId)}
            manager={runtime.windows}
            managerSnapshot={managerSnapshot}
            screen={screen}
            commands={runtime.commands}
            renderers={contentRegistry}
            onDiagnostic={onDiagnostic}
            detached={binding !== null && binding.windowId === windowControllerId}
            nativeChrome={Boolean(binding !== null && binding.windowId === windowControllerId && binding.nativeChrome)}
          />
        ))}
      </Presence>
    </div>
  );
}
