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

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { NSEPopup, reportNSEWindowSurfaceError, useNSEWindowSurfaceLifecycle, useOptionalNSEWindowSurfaceBridge, type NSEOverlayDismissReason, type NSEWindowSurfaceBridge } from "../Overlays";
import { useNSEPresentedContent } from "../Overlays/useNSEPresentedContent";
import type { NSEToolbarController } from "./NSEToolbarController";
import type { NSEToolbarConfigurationSheetWindowBridge } from "./toolbarTypes";

export interface NSEToolbarConfigurationSheetProps {
  readonly id: string;
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly parentResponderId: string;
  readonly parentScopeId?: string;
  /** Null denotes a top-level application-stage sheet. */
  readonly parentWindowControllerId: string | null;
  readonly controller: NSEToolbarController;
  /** Optional explicit window-host seam; production hosts supply the nearest bridge by context. */
  readonly windowBridge?: NSEToolbarConfigurationSheetWindowBridge;
  onOpenChange(open: boolean, reason: NSEOverlayDismissReason): void;
}

function itemLabel(controller: NSEToolbarController, id: string): string {
  const item = controller.items.find((candidate) => candidate.id === id);
  if (!item) return id;
  return item.kind === "space" ? "Space" : item.kind === "flexible-space" ? "Flexible space" : item.kind === "separator" ? "Separator" : item.label;
}

function allowsAnother(controller: NSEToolbarController, id: string, itemIds: readonly string[]): boolean {
  const item = controller.items.find((candidate) => candidate.id === id);
  const allowsDuplicates = item?.kind === "command" || item?.kind === "custom"
    ? item.allowsDuplicates === true
    : false;
  return allowsDuplicates || !itemIds.includes(id);
}

/**
 * The preference edit transaction is the only persistence transaction in this sheet.
 * The window bridge owns physical sheet records; the overlay wraps the same
 * interaction boundary to retain focus/portal authority in the nearest runtime.
 */
export function NSEToolbarConfigurationSheet({
  id,
  open,
  anchor,
  parentResponderId,
  parentScopeId,
  parentWindowControllerId,
  controller,
  windowBridge,
  onOpenChange,
}: NSEToolbarConfigurationSheetProps) {
  if (!id.trim()) throw new TypeError("NSE toolbar configuration sheet IDs must not be empty.");
  if (!parentResponderId.trim()) throw new TypeError("NSE toolbar configuration sheets require a parent responder ID.");
  if (parentWindowControllerId !== null && !parentWindowControllerId.trim()) throw new TypeError("NSE toolbar configuration-sheet parent window controller IDs must not be empty.");
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const snapshot = useSyncExternalStore(subscribe, () => controller.snapshot, () => controller.snapshot);
  const ownsTransaction = useRef(false);
  const dismissalSettled = useRef(false);
  const pendingDismiss = useRef<{ readonly reason: NSEOverlayDismissReason; readonly commit: boolean } | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const bridgeRequest = useMemo(() => Object.freeze({
    id,
    role: "sheet" as const,
    parentWindowControllerId,
    owner: controller.configuration.owner,
  }), [controller.configuration.owner, id, parentWindowControllerId]);
  const name = `Customize ${controller.configuration.identifier.replace(/[-_]+/g, " ")}`;
  const hostedBridge = useOptionalNSEWindowSurfaceBridge();
  const canonicalBridge = windowBridge?.present && windowBridge.dismiss ? windowBridge as NSEWindowSurfaceBridge : hostedBridge;
  const settleDismiss = useCallback((reason: NSEOverlayDismissReason, commit: boolean) => {
    if (dismissalSettled.current) return;
    dismissalSettled.current = true;
    pendingDismiss.current = null;
    if (ownsTransaction.current) {
      if (commit) controller.commitConfiguration();
      else controller.discardConfiguration();
      ownsTransaction.current = false;
    }
    setDraggedIndex(null);
    onOpenChange(false, reason);
  }, [controller, onOpenChange]);
  const handleDidClose = useNSEWindowSurfaceLifecycle({
    bridge: canonicalBridge,
    requestId: id,
    open,
    onDismissRefused: () => {
      pendingDismiss.current = null;
      onOpenChange(true, "programmatic");
    },
    onDismissConfirmed: () => {
      const intent = pendingDismiss.current;
      settleDismiss(intent?.reason ?? "programmatic", intent?.commit ?? false);
    },
    onDidClose: () => {
      const intent = pendingDismiss.current;
      settleDismiss(intent?.reason ?? "programmatic", intent?.commit ?? false);
    },
  });
  useEffect(() => {
    if (open) dismissalSettled.current = false;
  }, [open]);

  useEffect(() => {
    if (!open || ownsTransaction.current) return;
    if (controller.preferences.isEditing) {
      throw new Error(`NSE toolbar "${controller.configuration.identifier}" configuration is already being edited.`);
    }
    controller.beginConfiguration({
      id: `${id}:preferences`,
      actionName: `Customize ${controller.configuration.identifier}`,
    });
    ownsTransaction.current = true;
  }, [controller, id, open]);
  // A window owner may close a controlled sheet directly (window teardown,
  // replacement, or responsive presentation change). It must not strand the
  // preference transaction merely because the dismissal did not originate in
  // this component's action buttons.
  useEffect(() => {
    if (open || canonicalBridge || !ownsTransaction.current) return;
    controller.discardConfiguration();
    ownsTransaction.current = false;
    setDraggedIndex(null);
  }, [canonicalBridge, controller, open]);
  useEffect(() => {
    if (!open || canonicalBridge) return;
    windowBridge?.open?.(bridgeRequest);
    return () => windowBridge?.close?.(bridgeRequest);
  }, [bridgeRequest, canonicalBridge, open, windowBridge]);
  useEffect(() => () => {
    pendingDismiss.current = null;
    if (ownsTransaction.current) {
      controller.discardConfiguration();
      ownsTransaction.current = false;
    }
  }, [controller]);

  const dismiss = useCallback((reason: NSEOverlayDismissReason, commit: boolean) => {
    if (dismissalSettled.current || pendingDismiss.current) return;
    if (!canonicalBridge) {
      settleDismiss(reason, commit);
      return;
    }
    // A host can report onDidClose synchronously inside dismiss, before its
    // promise resolves. Keep the requested action authoritative in both paths.
    const intent = { reason, commit };
    pendingDismiss.current = intent;
    void canonicalBridge.dismiss(id).then((result) => {
      if (pendingDismiss.current !== intent) return;
      if (result.outcome === "closed" || result.outcome === "missing") settleDismiss(reason, commit);
      else {
        pendingDismiss.current = null;
        onOpenChange(true, "programmatic");
      }
    }, (error: unknown) => {
      if (pendingDismiss.current === intent) pendingDismiss.current = null;
      reportNSEWindowSurfaceError(canonicalBridge, error, id, "dismiss");
    });
  }, [canonicalBridge, id, onOpenChange, settleDismiss]);
  const selectedIds = snapshot.itemIds;
  const addableItems = controller.configuration.allowedItemIds.filter((itemId) => allowsAnother(controller, itemId, selectedIds));
  const moveDraggedItem = useCallback((targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    const next = [...controller.snapshot.itemIds];
    const [item] = next.splice(draggedIndex, 1);
    if (item === undefined) return;
    next.splice(targetIndex, 0, item);
    controller.setItemOrder(next);
  }, [controller, draggedIndex]);

  const content = (
      <section
        className="nse-toolbar-configuration-content"
        aria-label="Toolbar items"
        data-nse-part="content"
        data-nse-control="toolbar-configuration-sheet"
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          dismiss("escape", false);
        }}
      >
        <p className="nse-toolbar-configuration-help">Choose the controls shown in this window&apos;s toolbar.</p>
        <ol className="nse-toolbar-configuration-items">
          {selectedIds.map((itemId, index) => {
            const label = itemLabel(controller, itemId);
            return (
              <li
                key={`${itemId}:${index}`}
                className="nse-toolbar-configuration-item"
                draggable
                data-nse-part="configured-item"
                data-state={draggedIndex === index ? "dragging" : "normal"}
                data-nse-appearance-recipe="toolbar.configuration.item"
                data-nse-toolbar-drop-position={index}
                onDragStart={() => setDraggedIndex(index)}
                onDragEnd={() => setDraggedIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  moveDraggedItem(index);
                  setDraggedIndex(null);
                }}
              >
                <button className="nse-toolbar-configuration-handle" type="button" draggable aria-label={`Drag ${label} to reorder`} data-nse-part="drag-handle" data-appearance-recipe="toolbar.configuration.drag-handle" />
                <span>{label}</span>
                <span className="nse-toolbar-configuration-move-controls">
                  <button type="button" disabled={index === 0} aria-label={`Move ${label} left`} onClick={() => controller.moveAt(index, -1)}>Move left</button>
                  <button type="button" disabled={index === selectedIds.length - 1} aria-label={`Move ${label} right`} onClick={() => controller.moveAt(index, 1)}>Move right</button>
                  <button type="button" aria-label={`Remove ${label}`} onClick={() => controller.removeAt(index)}>Remove</button>
                </span>
              </li>
            );
          })}
        </ol>
        {addableItems.length > 0 ? (
          <div className="nse-toolbar-configuration-palette" aria-label="Available toolbar items">
            {addableItems.map((itemId) => {
              const label = itemLabel(controller, itemId);
              return <button key={itemId} type="button" aria-label={`Add ${label}`} onClick={() => controller.insert(itemId)}>Add {label}</button>;
            })}
          </div>
        ) : null}
        <div className="nse-toolbar-configuration-actions">
          <button type="button" onClick={() => controller.reset()}>Use Default Set</button>
          <span />
          <button type="button" onClick={() => dismiss("programmatic", false)}>Cancel</button>
          <button type="button" autoFocus onClick={() => dismiss("selection", true)}>Done</button>
        </div>
      </section>
  );
  const canonicalRequest = useMemo(() => ({
    id,
    role: "sheet" as const,
    title: name,
    parentWindowControllerId,
    anchor,
    bounds: { x: 180, y: 110, width: 620, height: 520 },
    onDidClose: handleDidClose,
  }), [anchor, handleDidClose, id, name, parentWindowControllerId]);
  const presentedContent = useNSEPresentedContent(content);
  useEffect(() => {
    if (!open || !canonicalBridge) return;
    canonicalBridge.present(canonicalRequest, presentedContent).catch((error: unknown) => {
      reportNSEWindowSurfaceError(canonicalBridge, error, id, "present");
    });
  }, [canonicalBridge, canonicalRequest, id, open, presentedContent]);
  if (canonicalBridge) return null;
  return (
    <NSEPopup
      id={id}
      open={open}
      anchor={anchor}
      parentResponderId={parentResponderId}
      parentScopeId={parentScopeId}
      presentation={{ mode: "sheet" }}
      overlayKind="action-sheet"
      modal
      title={name}
      aria-label={name}
      className="nse-toolbar-configuration-sheet"
      data-nse-control="toolbar-configuration-sheet"
      data-nse-part="surface"
      data-state={open ? "open" : "closed"}
      data-appearance-recipe="toolbar.configuration.sheet"
      onOpenChange={(nextOpen, reason) => {
        if (!nextOpen) dismiss(reason, false);
      }}
    >
      {/* Window hosts receive this exact content without a parallel popup. */}
      {content}
    </NSEPopup>
  );
}
