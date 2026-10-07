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

import { defineSyncUndoAction, type SyncUndoAction } from "../Undo/undoTypes";
import { immutableDocumentValue } from "./documentTypes";
import type { DocumentEditOptions, DocumentEditResourceRetention } from "./documentEditTypes";

/** Immutable model history belongs to the document, independent of mount leases. */
export function createDocumentEditHistoryAction<TModel>(input: {
  readonly documentId: string;
  readonly before: TModel;
  readonly after: TModel;
  readonly options: Omit<DocumentEditOptions<TModel>, "expectedRevision">;
  readonly retention?: DocumentEditResourceRetention;
  readonly apply: (model: TModel) => void;
  readonly revision: () => number;
  readonly observeError: (error: unknown, context: string) => void;
}): SyncUndoAction {
  const selection = input.options.selection ? immutableDocumentValue(input.options.selection) : undefined;
  const before = selection?.before === undefined ? undefined : Object.freeze({ selection: selection.before });
  const after = selection?.after === undefined ? undefined : Object.freeze({ selection: selection.after });
  let released = false;
  return defineSyncUndoAction({
    name: input.options.actionName,
    asyncPolicy: "forbid",
    estimatedBytes: new TextEncoder().encode(JSON.stringify([input.before, input.after, selection ?? null])).byteLength,
    undo: () => { input.apply(input.before); },
    redo: () => { input.apply(input.after); },
    ...(input.options.restoreSelection && selection ? {
      restoration: {
        before, after,
        restore: (snapshot) => {
          try {
            input.options.restoreSelection!(Object.freeze({
              documentId: input.documentId,
              direction: snapshot === before ? "undo" : "redo",
              revision: input.revision(),
              bookmark: snapshot.selection,
            }));
          } catch (error) { input.observeError(error, "document-edit-selection-restoration"); }
        },
      },
    } : {}),
    cleanup: () => {
      if (released) return;
      released = true;
      try { input.retention?.release(); }
      catch (error) { input.observeError(error, "document-edit-history-retention-release"); }
    },
  });
}
