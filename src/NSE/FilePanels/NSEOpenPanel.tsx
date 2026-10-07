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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NSEOverlayDismissReason } from "../Overlays";
import type { FilePanelResult, FilePanelService, OpenPanelRequest } from "../../SynCloudOS/SynCloudOS";
import { NSEFilePanelView, type NSEFilePanelWindowBridge } from "./NSEFilePanelView";
import { NSEPushButton } from "../Controls/Buttons/NSEButtons";

export type NSEFilePanelService = Pick<FilePanelService, "open" | "save" | "release" | "dispose">;

export interface NSEOpenPanelProps {
  readonly id: string;
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly parentResponderId: string;
  readonly parentScopeId?: string;
  /** Null denotes a top-level application-stage panel. */
  readonly parentWindowControllerId: string | null;
  readonly compact?: boolean;
  readonly service: NSEFilePanelService;
  readonly windowBridge?: NSEFilePanelWindowBridge;
  readonly request: OpenPanelRequest;
  onResult?(result: FilePanelResult<import("../../SynCloudOS/SynCloudOS").FilePanelReference>): void;
  onOpenChange(open: boolean, reason: NSEOverlayDismissReason): void;
}

function acceptSummary(request: OpenPanelRequest): readonly string[] {
  return Object.freeze(request.accepts.map((accept) => {
    const extensions = accept.extensions.join(", ");
    return extensions ? `${accept.description} (${extensions})` : accept.description;
  }));
}

/** Typed open-panel presenter; browser acquisition stays in the supplied core service. */
export function NSEOpenPanel({
  id,
  open,
  anchor,
  parentResponderId,
  parentScopeId,
  parentWindowControllerId,
  compact,
  service,
  windowBridge,
  request,
  onResult,
  onOpenChange,
}: NSEOpenPanelProps) {
  const [result, setResult] = useState<FilePanelResult<import("../../SynCloudOS/SynCloudOS").FilePanelReference> | null>(null);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const accepts = useMemo(() => acceptSummary(request), [request]);
  const cancelActive = useCallback(() => {
    generation.current += 1;
    active.current?.abort();
    active.current = null;
  }, []);
  useEffect(() => cancelActive, [cancelActive]);
  useEffect(() => {
    if (!open) cancelActive();
  }, [cancelActive, open]);
  const choose = useCallback(async () => {
    cancelActive();
    const nextGeneration = ++generation.current;
    const controller = new AbortController();
    active.current = controller;
    try {
      const next = await service.open(request, controller.signal);
      if (controller.signal.aborted || nextGeneration !== generation.current) return;
      active.current = null;
      setResult(next);
      onResult?.(next);
      if (next.kind === "accepted" || next.kind === "cancelled") onOpenChange(false, "selection");
    } catch {
      if (controller.signal.aborted || nextGeneration !== generation.current) return;
      active.current = null;
      const failure: FilePanelResult<import("../../SynCloudOS/SynCloudOS").FilePanelReference> = {
        kind: "error",
        message: "The file-panel operation could not be completed.",
      };
      setResult(failure);
      onResult?.(failure);
    }
  }, [cancelActive, onOpenChange, onResult, request, service]);
  const dismiss = useCallback((nextOpen: boolean, reason: NSEOverlayDismissReason) => {
    if (!nextOpen) cancelActive();
    onOpenChange(nextOpen, reason);
  }, [cancelActive, onOpenChange]);
  return (
    <NSEFilePanelView
      id={id}
      open={open}
      anchor={anchor}
      parentResponderId={parentResponderId}
      parentScopeId={parentScopeId}
      parentWindowControllerId={parentWindowControllerId}
      compact={compact}
      title="Open files"
      windowBridge={windowBridge}
      result={result}
      onOpenChange={dismiss}
    >
      <p className="nse-file-panel-prompt" data-nse-part="prompt">{request.selection === "multiple-files" ? "Choose files to open." : request.selection === "single-directory" ? "Choose a folder to open." : "Choose a file to open."}</p>
      {accepts.length > 0 ? <ul className="nse-file-panel-accepts" aria-label="Accepted file types">{accepts.map((summary) => <li key={summary}>{summary}</li>)}</ul> : null}
      <div className="nse-file-panel-actions">
        <NSEPushButton tone="light" data-nse-part="cancel" onClick={() => dismiss(false, "programmatic")}>Cancel</NSEPushButton>
        <NSEPushButton tone="affirmative" data-nse-part="choose" data-nse-initial-focus="" data-appearance-recipe="file-panel.choose" onClick={() => void choose()}>Choose files</NSEPushButton>
      </div>
    </NSEFilePanelView>
  );
}
