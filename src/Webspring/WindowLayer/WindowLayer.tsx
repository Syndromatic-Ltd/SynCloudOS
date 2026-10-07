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

import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { NSEPresence } from "../../NSE/Animation";
import { useKernelSynCloudOS } from "../../SynCloudOSReact";
import { WindowHost, type WindowLayerDiagnostic } from "./WindowHost";
import type { WindowContentRendererRegistry } from "./WindowContentRendererRegistry";
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

export function WindowLayer({ contentRegistry, onDiagnostic }: WindowLayerProps) {
  const runtime = useKernelSynCloudOS();
  const layerRef = useRef<HTMLDivElement>(null);
  const managerSnapshot = useSyncExternalStore(
    runtime.windows.subscribe,
    runtime.windows.snapshot,
    runtime.windows.snapshot,
  );
  const screen = useSyncExternalStore(
    runtime.screen.subscribe,
    runtime.screen.getSnapshot,
    runtime.screen.getSnapshot,
  );
  const documentPort = runtime.environment.browser.getDocument();
  const transientAnchors = managerSnapshot.windowControllerIds.flatMap((windowControllerId) => {
    const record = runtime.windows.select(windowControllerId).record;
    return record.role === "popover" && !record.pinned && record.anchor ? [record.anchor.id] : [];
  });

  useEffect(() => {
    const layer = layerRef.current;
    if (!documentPort || !layer) return;
    const ownerRoot = runtimeOwnerRoot(layer, runtime.runtimeId);
    const dismissOutside = (event: PointerEvent) => {
      const ElementPort = documentPort.defaultView?.Element;
      const target = ElementPort && event.target instanceof ElementPort ? event.target : null;
      if (target?.closest<HTMLElement>("[data-syncloudos-runtime-owner]")?.dataset.syncloudosRuntimeOwner !== runtime.runtimeId) return;
      const host = target?.closest<HTMLElement>("[data-window-host]") ?? null;
      const except = host?.dataset.windowHost;
      void runtime.windows.dismissTransientWindows({
        reason: "outside-pointer",
        ...(except ? { except } : {}),
      }).catch(() => undefined);
    };
    ownerRoot.addEventListener("pointerdown", dismissOutside, true);
    const MutationObserverPort = documentPort.defaultView?.MutationObserver;
    const observer = MutationObserverPort && transientAnchors.length > 0
      ? new MutationObserverPort(() => {
          if (transientAnchors.some((anchorId) => !hasOwnedAnchor(ownerRoot, runtime.runtimeId, anchorId))) {
            void runtime.windows.dismissTransientWindows({ reason: "anchor-removed" }).catch(() => undefined);
          }
        })
      : null;
    observer?.observe(ownerRoot, { childList: true, subtree: true });
    return () => {
      ownerRoot.removeEventListener("pointerdown", dismissOutside, true);
      observer?.disconnect();
    };
  }, [documentPort, managerSnapshot.generation, runtime, transientAnchors.join("\u0000")]);

  const modalControllers = managerSnapshot.windowControllerIds
    .map((id) => runtime.windows.select(id))
    .filter(({ record }) => record.state === "open" && (record.role === "modal" || record.role === "sheet"));
  const topModalZ = modalControllers.at(-1)?.record.zIndex ?? null;

  return (
    <div
      ref={layerRef}
      className="webspring-window-layer"
      data-window-layer=""
      data-window-modal-active={managerSnapshot.blockedWindowControllerIds.length > 0 ? "true" : "false"}
    >
      {topModalZ !== null ? (
        <div
          className="webspring-window-modal-backdrop"
          data-window-modal-backdrop=""
          aria-hidden="true"
          style={{ zIndex: Math.max(0, topModalZ - 0.5) }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      ) : null}
      <NSEPresence>
        {managerSnapshot.windowControllerIds.map((windowControllerId) => (
          <WindowHost
            key={windowControllerId}
            controller={runtime.windows.select(windowControllerId)}
            manager={runtime.windows}
            managerSnapshot={managerSnapshot}
            screen={screen}
            commands={runtime.commands}
            renderers={contentRegistry}
            onDiagnostic={onDiagnostic}
          />
        ))}
      </NSEPresence>
    </div>
  );
}
