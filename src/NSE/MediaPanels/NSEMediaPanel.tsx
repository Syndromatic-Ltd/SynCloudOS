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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NSEPopup, reportNSEWindowSurfaceError, useNSEWindowSurfaceLifecycle, useOptionalNSEWindowSurfaceBridge, type NSEOverlayDismissReason, type NSEWindowSurfaceBridge } from "../Overlays";
import { useNSEPresentedContent } from "../Overlays/useNSEPresentedContent";
import { NSEWindowFittingContent, centredWindowBounds, type NSEWindowFittingSize } from "../Overlays/NSEWindowFittingContent";
import { NSEPushButton } from "../Controls/Buttons/NSEButtons";
import { NSESearchField } from "../Controls/Fields/NSESearchField";
import { NSESegmentedControl } from "../Controls/Values/NSESegmentedControl";
import type { MediaPanelItem, MediaPanelQuery, MediaPanelResult, MediaPanelService } from "../../SynCloudOS/SynCloudOS";
import { NSEMediaCollectionPresenter, mediaCollectionItemId, type MediaCollectionPresenterProps, type MediaCollectionSelectionMode } from "./NSEMediaCollectionPresenter";

export type NSEMediaPanelWindowRole = "panel" | "sheet";

export interface NSEMediaPanelWindowRequest {
  readonly id: string;
  readonly role: NSEMediaPanelWindowRole;
  /** Null denotes a top-level application-stage panel. */
  readonly parentWindowControllerId: string | null;
}

/** Window-host seam: WindowManager records and their renderers remain application-owned. */
export interface NSEMediaPanelWindowBridge {
  open?(request: NSEMediaPanelWindowRequest): void;
  close?(request: NSEMediaPanelWindowRequest): void;
  present?: NSEWindowSurfaceBridge["present"];
  dismiss?: NSEWindowSurfaceBridge["dismiss"];
}

export interface NSEMediaPanelLabels {
  readonly title: string;
  readonly search: string;
  readonly chooseFiles: string;
  readonly insertSelected: string;
  readonly cancel: string;
  readonly loadMore: string;
  readonly empty: string;
}

export interface NSEMediaPanelProps {
  readonly id: string;
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly parentResponderId: string;
  readonly parentScopeId?: string;
  /** Null denotes a top-level application-stage panel. */
  readonly parentWindowControllerId: string | null;
  readonly compact?: boolean;
  readonly service: MediaPanelService;
  readonly windowBridge?: NSEMediaPanelWindowBridge;
  readonly query: MediaPanelQuery;
  readonly selection?: MediaCollectionSelectionMode;
  readonly direction?: "ltr" | "rtl";
  readonly labels?: Partial<NSEMediaPanelLabels>;
  readonly CollectionPresenter?: React.ComponentType<MediaCollectionPresenterProps>;
  onInsert?(items: readonly MediaPanelItem[]): void | Promise<void>;
  onOpenChange(open: boolean, reason: NSEOverlayDismissReason): void;
}

const DEFAULT_LABELS: NSEMediaPanelLabels = Object.freeze({
  title: "Insert media",
  search: "Search media",
  chooseFiles: "Choose files",
  insertSelected: "Insert selected",
  cancel: "Cancel",
  loadMore: "Load more",
  empty: "No media found.",
});

function itemKey(item: MediaPanelItem): string {
  return mediaCollectionItemId(item);
}

function resultMessage(result: MediaPanelResult | null): string | null {
  if (!result) return null;
  if (result.kind === "denied" || result.kind === "unavailable" || result.kind === "interrupted" || result.kind === "error") return result.message;
  return null;
}

/**
 * Provider-backed media chooser. It is a focus/overlay surface bridged to
 * a window-manager panel or sheet, without becoming a parallel window or collection API.
 */
export function NSEMediaPanel({
  id,
  open,
  anchor,
  parentResponderId,
  parentScopeId,
  parentWindowControllerId,
  compact = false,
  service,
  windowBridge,
  query,
  selection = "single",
  direction = "ltr",
  labels: labelOverrides,
  CollectionPresenter = NSEMediaCollectionPresenter,
  onInsert,
  onOpenChange,
}: NSEMediaPanelProps) {
  if (!id.trim()) throw new TypeError("NSE media panel IDs must not be empty.");
  if (!parentResponderId.trim()) throw new TypeError("NSE media panels require a parent responder ID.");
  if (parentWindowControllerId !== null && !parentWindowControllerId.trim()) throw new TypeError("NSE media-panel parent window controller IDs must not be empty.");
  const labels = useMemo(() => Object.freeze({ ...DEFAULT_LABELS, ...labelOverrides }), [labelOverrides]);
  const kindsKey = query.kinds.join(",");
  const requestBase = useMemo(() => Object.freeze({
    id: query.id,
    kinds: Object.freeze([...query.kinds]),
    ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
  }), [kindsKey, query.id, query.pageSize]);
  const [providerId, setProviderId] = useState(query.providerId);
  const [search, setSearch] = useState(query.search);
  const [result, setResult] = useState<MediaPanelResult | null>(null);
  const [items, setItems] = useState<readonly MediaPanelItem[]>(Object.freeze([]));
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [inserting, setInserting] = useState(false);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const dismissalSettled = useRef(false);
  const bridgeRequest = useMemo(() => Object.freeze({
    id,
    role: compact ? "sheet" as const : "panel" as const,
    parentWindowControllerId,
  }), [compact, id, parentWindowControllerId]);
  const hostedBridge = useOptionalNSEWindowSurfaceBridge();
  const canonicalBridge = windowBridge?.present && windowBridge.dismiss ? windowBridge as NSEWindowSurfaceBridge : hostedBridge;
  const provider = service.providers.find((candidate) => candidate.id === providerId) ?? null;

  const cancelActive = useCallback(() => {
    generation.current += 1;
    active.current?.abort();
    active.current = null;
  }, []);
  const clearPresentation = useCallback(() => {
    cancelActive();
    service.clear(query.id);
    setItems(Object.freeze([]));
    setSelectedIds(new Set());
    setResult(null);
    setLoading(false);
  }, [cancelActive, query.id, service]);
  const settleClosed = useCallback((reason: NSEOverlayDismissReason) => {
    if (dismissalSettled.current) return;
    dismissalSettled.current = true;
    clearPresentation();
    onOpenChange(false, reason);
  }, [clearPresentation, onOpenChange]);
  const handleDidClose = useNSEWindowSurfaceLifecycle({
    bridge: canonicalBridge,
    requestId: id,
    open,
    onDismissRefused: () => onOpenChange(true, "programmatic"),
    onDismissConfirmed: clearPresentation,
    onDidClose: () => settleClosed("programmatic"),
  });
  useEffect(() => {
    if (open) dismissalSettled.current = false;
  }, [open]);
  const load = useCallback(async (cursor: string | null, userInitiated: boolean) => {
    cancelActive();
    const nextGeneration = ++generation.current;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    try {
      const next = await service.query({
        ...requestBase,
        providerId,
        search,
        cursor,
        ...(userInitiated ? { userInitiated: true } : {}),
      }, controller.signal);
      if (controller.signal.aborted || nextGeneration !== generation.current) return;
      active.current = null;
      setResult(next);
      setItems(next.kind === "accepted" ? (current) => Object.freeze(cursor === null
        ? [...next.items]
        : [...current, ...next.items.filter((item) => !current.some((existing) => itemKey(existing) === itemKey(item)))]) : Object.freeze([]));
    } catch {
      if (controller.signal.aborted || nextGeneration !== generation.current) return;
      active.current = null;
      setResult({ kind: "error", message: "The media provider could not complete the request." });
      setItems(Object.freeze([]));
    } finally {
      if (nextGeneration === generation.current) setLoading(false);
    }
  }, [cancelActive, providerId, requestBase, search, service]);

  useEffect(() => {
    setProviderId(query.providerId);
    setSearch(query.search);
  }, [query.providerId, query.search]);
  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((key) => items.some((item) => itemKey(item) === key))));
  }, [items]);
  useEffect(() => {
    if (!open || canonicalBridge) return;
    windowBridge?.open?.(bridgeRequest);
    return () => windowBridge?.close?.(bridgeRequest);
  }, [bridgeRequest, canonicalBridge, open, windowBridge]);
  useEffect(() => {
    if (!open) {
      if (!canonicalBridge) clearPresentation();
      return;
    }
    if (provider?.requiresUserActivation) {
      cancelActive();
      setResult(null);
      setItems(Object.freeze([]));
      return;
    }
    void load(null, false);
    return cancelActive;
  }, [cancelActive, canonicalBridge, clearPresentation, load, open, provider?.requiresUserActivation, providerId, search]);
  useEffect(() => () => {
    cancelActive();
    service.clear(query.id);
  }, [cancelActive, query.id, service]);

  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(itemKey(item))), [items, selectedIds]);
  const preview = selectedItems[0] ?? null;
  const dismiss = useCallback((nextOpen: boolean, reason: NSEOverlayDismissReason) => {
    if (!nextOpen) clearPresentation();
    onOpenChange(nextOpen, reason);
  }, [clearPresentation, onOpenChange]);
  // Bumped when the host refuses to close the window: the panel is still the
  // canonical owner, so it re-asserts its presentation rather than relying on
  // an incidental re-render to do so (presentation is once per request).
  const [reassertion, setReassertion] = useState(0);
  const requestDismiss = useCallback(async (reason: NSEOverlayDismissReason) => {
    if (!canonicalBridge) {
      dismiss(false, reason);
      return;
    }
    try {
      const result = await canonicalBridge.dismiss(id);
      if (result.outcome === "closed" || result.outcome === "missing") settleClosed(reason);
      else if (result.outcome === "refused") setReassertion((count) => count + 1);
    } catch (error) {
      reportNSEWindowSurfaceError(canonicalBridge, error, id, "dismiss");
    }
  }, [canonicalBridge, dismiss, id, settleClosed]);
  const activate = useCallback((item: MediaPanelItem) => {
    setSelectedIds(new Set([itemKey(item)]));
  }, []);
  const insert = useCallback(async () => {
    if (selectedItems.length === 0 || inserting) return;
    setInserting(true);
    try {
      await onInsert?.(Object.freeze([...selectedItems]));
      await requestDismiss("selection");
    } catch {
      setResult({ kind: "error", message: "The selected media could not be inserted." });
    } finally {
      setInserting(false);
    }
  }, [inserting, onInsert, requestDismiss, selectedItems]);
  const message = resultMessage(result);
  const nextCursor = result?.kind === "accepted" ? result.nextCursor : null;

  const content = (
      <section className="nse-media-panel-content" data-nse-part="content" data-nse-control="media-panel" dir={direction}>
        {service.providers.length > 1 ? (
          <div className="nse-media-panel-tabs">
            <NSESegmentedControl
              aria-label="Media providers"
              items={service.providers.map((candidate) => ({ id: candidate.id, label: candidate.label }))}
              selection={{ mode: "select-one", selectedIds: new Set(providerId ? [providerId] : []), allowsEmpty: false }}
              onSelectionChange={(next) => {
                const nextId = [...next.selectedIds][0];
                if (!nextId || nextId === providerId) return;
                clearPresentation();
                setProviderId(nextId);
              }}
            />
          </div>
        ) : null}
        <NSESearchField className="nse-media-panel-search" aria-label={labels.search} placeholder={labels.search} value={search} onValueChange={setSearch} disabled={Boolean(provider?.requiresUserActivation)} />
        {provider?.requiresUserActivation ? <NSEPushButton tone="light" data-nse-part="choose-files" data-nse-initial-focus="" onClick={() => void load(null, true)} disabled={loading}>{labels.chooseFiles}</NSEPushButton> : null}
        {loading ? <p role="status" data-state="loading">Loading media…</p> : null}
        {message ? <p role="status" data-state={result?.kind}>{message}</p> : null}
        {result?.kind === "empty" ? <p role="status" data-state="empty">{labels.empty}</p> : null}
        {items.length > 0 ? <CollectionPresenter items={items} selectedIds={selectedIds} selection={selection} direction={direction} onSelectionChange={setSelectedIds} onActivate={activate} /> : null}
        {preview ? <aside className="nse-media-panel-preview" aria-label="Media preview"><strong>{preview.name}</strong><span>{preview.kind}</span><span>{preview.mimeType}</span></aside> : null}
        {nextCursor ? <NSEPushButton tone="light" data-nse-part="load-more" onClick={() => void load(nextCursor, false)} disabled={loading}>{labels.loadMore}</NSEPushButton> : null}
        <div className="nse-media-panel-actions"><NSEPushButton tone="light" data-nse-part="cancel" onClick={() => void requestDismiss("programmatic")}>{labels.cancel}</NSEPushButton><NSEPushButton tone="affirmative" data-nse-part="insert" onClick={() => void insert()} disabled={selectedItems.length === 0 || inserting}>{labels.insertSelected}</NSEPushButton></div>
      </section>
  );
  const [fitting, setFitting] = useState<NSEWindowFittingSize | null>(null);
  const onFittingSize = useCallback((next: NSEWindowFittingSize) => {
    setFitting((current) => current && current.width === next.width && current.height === next.height ? current : next);
  }, []);
  const canonicalRequest = useMemo(() => ({
    id,
    role: compact ? "sheet" as const : "panel" as const,
    title: labels.title,
    parentWindowControllerId,
    anchor,
    bounds: centredWindowBounds(anchor, fitting?.width ?? (compact ? 560 : 680), fitting?.height ?? (compact ? 440 : 520)),
    sizing: "content" as const,
    onDidClose: handleDidClose,
  }), [anchor, compact, fitting?.height, fitting?.width, handleDidClose, id, labels.title, parentWindowControllerId]);
  const presentedContent = useNSEPresentedContent(<NSEWindowFittingContent onFittingSize={onFittingSize}>{content}</NSEWindowFittingContent>);
  useEffect(() => {
    if (!open || !canonicalBridge) return;
    canonicalBridge.present(canonicalRequest, presentedContent).catch((error: unknown) => {
      reportNSEWindowSurfaceError(canonicalBridge, error, id, "present");
    });
  }, [canonicalBridge, canonicalRequest, id, open, presentedContent, reassertion]);
  if (canonicalBridge) return null;

  return (
    <NSEPopup
      id={id}
      open={open}
      anchor={anchor}
      parentResponderId={parentResponderId}
      parentScopeId={parentScopeId}
      presentation={{ mode: compact ? "sheet" : "anchored" }}
      overlayKind={compact ? "action-sheet" : "popover"}
      modal={compact}
      title={labels.title}
      aria-label={labels.title}
      className="nse-media-panel"
      data-nse-control="media-panel"
      data-nse-part="surface"
      data-appearance-recipe={`media-panel.${compact ? "sheet" : "panel"}`}
      onOpenChange={dismiss}
    >
      {/* Window hosts receive this content without a parallel popup. */}
      {content}
    </NSEPopup>
  );
}
