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

import { createUndoManager } from "../../SynCloudOS/nseRuntimeContracts";
import { defineSyncUndoAction } from "../../SynCloudOS/nseRuntimeContracts";
import type { SynCloudOSRuntimeId } from "../../SynCloudOS/SynCloudOS";
import { createInMemoryNSETextOwner, applyNSETextOperations, canonicalNSETextData, type NSETextCommitRequest, type NSETextOwner, type NSEInMemoryTextOwnerOptions } from "../Text";
import { translateBackendContent } from "./backends/backendChangeTranslator";
export interface NSETextHistorySnapshot { readonly canUndo: boolean; readonly canRedo: boolean; readonly undoTitle: string; readonly redoTitle: string }
export interface NSETextHistory {
  getSnapshot(): NSETextHistorySnapshot;
  subscribe(listener: () => void): () => void;
  undo(): Promise<unknown>;
  redo(): Promise<unknown>;
}
/** Optional standalone composition of a text owner and the existing generic undo manager. */
export function createUndoableNSETextOwner(options: NSEInMemoryTextOwnerOptions & { readonly maximumHistoryEntries?: number } = {}): NSETextOwner & { readonly history: NSETextHistory; dispose(): void } {
  const base = createInMemoryNSETextOwner(options);
  const manager = createUndoManager({ runtimeId: "standalone-text" as SynCloudOSRuntimeId, owner: { kind: "application", id: options.flowId ?? "text" }, maxEntries: options.maximumHistoryEntries ?? 100 });
  let disposed = false, committing = false;
  const assertLive = () => { if (disposed) throw new Error("Text history owner is disposed."); };
  const history: NSETextHistory = Object.freeze({
    getSnapshot() { assertLive(); return Object.freeze({ canUndo: manager.canUndo, canRedo: manager.canRedo, undoTitle: manager.undoTitle, redoTitle: manager.redoTitle }); },
    subscribe(listener: () => void) { assertLive(); return manager.subscribe(listener); },
    async undo() { assertLive(); if (committing) throw new Error("Text edit admission is in progress."); return manager.undo(); },
    async redo() { assertLive(); if (committing) throw new Error("Text edit admission is in progress."); return manager.redo(); },
  });
  return Object.freeze({
    signal: base.signal,
    history,
    getSnapshot: () => { assertLive(); return base.getSnapshot(); },
    subscribe: base.subscribe,
    commit(request: NSETextCommitRequest) {
      assertLive();
      if (options.editable === false) throw new Error("Text history owner is read-only.");
      if (committing || manager.isExecuting) throw new Error("Text history admission is reentrant.");
      const safe = canonicalNSETextData(request, "Text commit request", { maxDepth: 24, maxNodes: 100000, maxBytes: 4 * 1024 * 1024 });
      if (Object.keys(safe).some(key => !["expectedRevision", "expectedGeneration", "operations", "actionName", "coalescingKey"].includes(key))) throw new TypeError("Invalid text commit request.");
      for (const value of [safe.actionName, safe.coalescingKey]) if (value !== undefined && (typeof value !== "string" || !value.trim() || value.length > 256)) throw new TypeError("Invalid text history metadata.");
      const before = base.getSnapshot();
      if (safe.expectedRevision !== before.revision || safe.expectedGeneration !== undefined && safe.expectedGeneration !== before.ownerGeneration) throw new Error("Text history revision is stale.");
      const staged = applyNSETextOperations(before, safe.operations);
      if (staged.snapshot === before) return base.commit(safe);
      const replay = (content: typeof before.attributedContent) => {
        const current = base.getSnapshot();
        base.commit({ expectedRevision: current.revision, operations: translateBackendContent(current, content) });
      };
      const reservation = manager.reserve();
      committing = true;
      try {
        reservation.commit(defineSyncUndoAction({ name: safe.actionName ?? "Text Edit", asyncPolicy: "forbid", undo: () => { replay(before.attributedContent); }, redo: () => { replay(staged.snapshot.attributedContent); }, estimatedBytes: new TextEncoder().encode(JSON.stringify([before.attributedContent, staged.snapshot.attributedContent])).byteLength }), safe.coalescingKey ? { automaticGroup: { kind: "typing", key: safe.coalescingKey, boundaryId: "standalone-text" } } : undefined);
        return base.commit(safe);
      } finally { committing = false; reservation.cancel(); }
    },
    dispose() { if (disposed) return; disposed = true; manager.dispose(); base.dispose(); },
  });
}
