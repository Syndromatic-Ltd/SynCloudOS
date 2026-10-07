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

import { useCallback, useEffect, useRef, useState } from "react";
import type { NSEOverlayDismissReason } from "../Overlays";
import type { FilePanelDocumentSaveBinding, FilePanelDocumentSaveResult, FilePanelResult, FilePanelSaveTarget, SavePanelRequest } from "../../SynCloudOS/SynCloudOS";
import { saveFilePanelTarget } from "../../SynCloudOS/nseRuntimeContracts";
import { NSEFilePanelView, type NSEFilePanelWindowBridge } from "./NSEFilePanelView";
import type { NSEFilePanelService } from "./NSEOpenPanel";
import { NSEPushButton } from "../Controls/Buttons/NSEButtons";

export interface NSESavePanelProps {
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
  readonly request: SavePanelRequest;
  /** Optional document bridge; selected browser handles never become synthetic locations. */
  readonly documentSaveBinding?: FilePanelDocumentSaveBinding;
  onResult?(result: FilePanelResult<FilePanelSaveTarget>): void;
  onDocumentSaveResult?(result: FilePanelDocumentSaveResult): void;
  onOpenChange(open: boolean, reason: NSEOverlayDismissReason): void;
}

function retryRequestAfterChooseAnother(request: SavePanelRequest): SavePanelRequest {
  const { existingTarget: _existingTarget, ...withoutExistingTarget } = request;
  return withoutExistingTarget as SavePanelRequest;
}

function releaseRejectedTarget(service: NSEFilePanelService, target: FilePanelSaveTarget): void {
  if (target.kind === "file-handle") service.release(target.reference, "caller-finished");
}

/** Typed save-panel presenter; conflict policy stays attached to its request. */
export function NSESavePanel({
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
  documentSaveBinding,
  onResult,
  onDocumentSaveResult,
  onOpenChange,
}: NSESavePanelProps) {
  const [result, setResult] = useState<FilePanelResult<FilePanelSaveTarget> | null>(null);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const retryWithoutExistingTarget = useRef(false);
  const cancelActive = useCallback(() => {
    generation.current += 1;
    active.current?.abort();
    active.current = null;
  }, []);
  useEffect(() => cancelActive, [cancelActive]);
  useEffect(() => {
    if (!open) {
      retryWithoutExistingTarget.current = false;
      cancelActive();
    }
  }, [cancelActive, open]);
  const choose = useCallback(async () => {
    cancelActive();
    const nextGeneration = ++generation.current;
    const controller = new AbortController();
    active.current = controller;
    try {
      const next = await service.save(
        retryWithoutExistingTarget.current ? retryRequestAfterChooseAnother(request) : request,
        controller.signal,
      );
      if (controller.signal.aborted || nextGeneration !== generation.current) return;
      if (next.kind === "choose-another") {
        retryWithoutExistingTarget.current = true;
        setResult(next);
        onResult?.(next);
        return;
      }
      if (next.kind === "accepted" && documentSaveBinding) {
        const target = next.values[0];
        if (target) {
          try {
            const documentResult = await saveFilePanelTarget(documentSaveBinding, target, controller.signal);
            if (controller.signal.aborted || nextGeneration !== generation.current) return;
            onDocumentSaveResult?.(documentResult);
            if ("kind" in documentResult && documentResult.kind === "choose-another") {
              releaseRejectedTarget(service, target);
              retryWithoutExistingTarget.current = true;
              const choice: FilePanelResult<FilePanelSaveTarget> = { kind: "choose-another" };
              setResult(choice);
              onResult?.(choice);
              return;
            }
            if ("kind" in documentResult && documentResult.kind === "cancelled") {
              releaseRejectedTarget(service, target);
              const cancelled: FilePanelResult<FilePanelSaveTarget> = { kind: "cancelled" };
              setResult(cancelled);
              onResult?.(cancelled);
              onOpenChange(false, "selection");
              return;
            }
          } catch {
            if (controller.signal.aborted || nextGeneration !== generation.current) return;
            releaseRejectedTarget(service, target);
            const failure: FilePanelResult<FilePanelSaveTarget> = {
              kind: "error",
              message: "The document destination could not be saved.",
            };
            setResult(failure);
            onResult?.(failure);
            return;
          }
        }
      }
      setResult(next);
      onResult?.(next);
      if (next.kind === "accepted" || next.kind === "cancelled") onOpenChange(false, "selection");
    } catch {
      if (controller.signal.aborted || nextGeneration !== generation.current) return;
      const failure: FilePanelResult<FilePanelSaveTarget> = {
        kind: "error",
        message: "The file-panel operation could not be completed.",
      };
      setResult(failure);
      onResult?.(failure);
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [cancelActive, documentSaveBinding, onDocumentSaveResult, onOpenChange, onResult, request, service]);
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
      title="Save file"
      windowBridge={windowBridge}
      result={result}
      onOpenChange={dismiss}
    >
      <p className="nse-file-panel-prompt" data-nse-part="prompt">Save <strong className="nse-file-panel-suggested-name" data-nse-part="suggested-name">{request.suggestedName}</strong> to a destination you choose.</p>
      <div className="nse-file-panel-actions">
        <NSEPushButton tone="light" data-nse-part="cancel" onClick={() => dismiss(false, "programmatic")}>Cancel</NSEPushButton>
        <NSEPushButton tone="affirmative" data-nse-part="choose" data-nse-initial-focus="" data-appearance-recipe="file-panel.choose" onClick={() => void choose()}>Choose destination</NSEPushButton>
      </div>
    </NSEFilePanelView>
  );
}
