/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createNSEDocumentTextOwner, type NSEDocumentTextOwnerOptions } from "../../NSE/public/text";
import { TextEditingSession } from "../../NSE/public/text";
import type { AppWorkspaceDocumentsClient } from "./appClientTypes";
import type { DocumentEditingLifetimeOptions } from "../Documents";
import type { DocumentEditOptions } from "../Documents";

export interface SynWareNSETextOwnerOptions<TModel> extends Omit<NSEDocumentTextOwnerOptions<TModel>, "document"> {
  readonly documents: AppWorkspaceDocumentsClient;
  readonly documentId: string;
}
/** Scoped AppSDK capability adaptation; native content extraction remains application policy. */
export function createSynWareNSETextOwner<TModel>(supplied: SynWareNSETextOwnerOptions<TModel>) {
  const options = Object.freeze({ ...supplied });
  const document = {
    getSnapshot() { const snapshot = options.documents.getDocument<TModel>(options.documentId); if (!snapshot) throw new Error("The app document is unavailable."); return snapshot; },
    subscribe: (listener: () => void) => options.documents.subscribeDocument(options.documentId, listener),
    transact: (transform: (current: Readonly<TModel>) => TModel, editOptions: DocumentEditOptions<TModel>) => {
      if (!options.documents.transactDocument) throw new Error("The document transaction capability is unavailable.");
      return options.documents.transactDocument<TModel>(options.documentId, transform, editOptions);
    },
  };
  return createNSEDocumentTextOwner({ ...options, document });
}

export function bindSynWareNSETextEditingSession(supplied: {
  readonly documents: AppWorkspaceDocumentsClient;
  readonly documentId: string;
  readonly session: TextEditingSession;
  readonly lifetime?: Pick<DocumentEditingLifetimeOptions, "signal">;
}) {
  const options = Object.freeze({ ...supplied });
  if (!options.documents.registerEditingParticipant) throw new Error("The editing participant capability is unavailable.");
  const snapshot = options.session.getSnapshot();
  if (snapshot.selection.documentId !== options.documentId) throw new Error("The text session belongs to another document.");
  return options.documents.registerEditingParticipant(options.documentId, {
    id: `text-session:${snapshot.selection.sessionId}`,
    settle() {
      const result = options.session.settleEditing();
      return result.status === "settled" ? { status: "settled" as const } : { status: "refused" as const, reason: result.status === "revoked" ? "text-session-revoked" : "text-composition-active", ...(result.status === "refused" ? { issues: result.issues } : {}) };
    },
    discard() { if (options.session.getSnapshot().disposed) return { status: "refused" as const, reason: "text-session-revoked" }; options.session.cancelMarkedText(); return { status: "settled" as const }; },
  }, { signal: options.lifetime?.signal ? AbortSignal.any([options.lifetime.signal, options.session.signal]) : options.session.signal });
}
