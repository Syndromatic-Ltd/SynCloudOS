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

import { createDocumentOutputPreparation } from "../Documents";
import type { AppWorkspaceDocumentsClient } from "./appClientTypes";

export function createSynWareDocumentOutputPreparation<TModel>(supplied: {
  readonly documents: AppWorkspaceDocumentsClient;
  readonly documentId: string;
  readonly signal?: AbortSignal;
}) {
  const options = Object.freeze({ ...supplied });
  return createDocumentOutputPreparation<TModel>({
    signal: options.signal,
    settle: (purpose, signal) => {
      if (!options.documents.settleEditing) throw new Error("The document editing settlement capability is unavailable.");
      return options.documents.settleEditing(options.documentId, purpose, signal);
    },
    capture: () => {
      const snapshot = options.documents.getDocument<TModel>(options.documentId);
      if (!snapshot || snapshot.state === "closed") throw new Error("The document output owner is unavailable.");
      return { documentId: snapshot.id, revision: snapshot.dirtyRevision, model: snapshot.model as TModel };
    },
  });
}
