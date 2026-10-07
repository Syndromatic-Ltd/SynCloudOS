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

import { useEffect, useId, useRef, useState } from "react";
import {
  type DocumentCloseReviewDecision,
  type DocumentCloseReviewRequest,
  type DocumentType,
} from "../../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS } from "../../SynCloudOSReact";

interface NoteModel {
  readonly title: string;
}

const noteType: DocumentType<NoteModel> = {
  id: "com.syncloudos.framework-test.workspace-note",
  displayName: "Note",
  schemaVersion: 1,
  extensions: ["synnote"],
  mimeTypes: ["application/x-syncloudos-framework-note"],
  capabilities: { versions: true, conflicts: true },
  autosave: "disabled",
  create: () => ({ title: "Untitled" }),
  read: (serialized) => serialized,
  write: (model) => model,
  validate: (serialized): serialized is NoteModel => (
    typeof serialized === "object" &&
    serialized !== null &&
    typeof Reflect.get(serialized, "title") === "string"
  ),
};

interface PendingReview {
  readonly request: DocumentCloseReviewRequest;
  readonly title: string;
  settle(decision: DocumentCloseReviewDecision): void;
}

export function DocumentWorkspaceFixture() {
  const runtime = useKernelSynCloudOS();
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const pendingReviewRef = useRef<PendingReview | null>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    const typeRegistration = runtime.documents.registerType(noteType);
    const destinationRegistration = runtime.documents.registerSaveDestinationProvider({
      chooseDestination: async ({ documentId }) => ({
        destination: {
          kind: "memory",
          namespace: "framework:document-workspace",
          key: documentId,
        },
      }),
    });
    const reviewerRegistration = runtime.documents.registerCloseReviewer({
      review: (request) => new Promise<DocumentCloseReviewDecision>((resolve) => {
        const document = runtime.documents.getDocument(request.documentId);
        const title = document && noteType.validate(document.model)
          ? document.model.title
          : request.displayName;
        let settled = false;
        const onAbort = () => settle("cancel");
        const settle = (decision: DocumentCloseReviewDecision) => {
          if (settled) return;
          settled = true;
          request.signal?.removeEventListener("abort", onAbort);
          pendingReviewRef.current = null;
          setPendingReview(null);
          resolve(decision);
        };
        const pending = { request, title, settle };
        pendingReviewRef.current = pending;
        setPendingReview(pending);
        request.signal?.addEventListener("abort", onAbort, { once: true });
        if (request.signal?.aborted) onAbort();
      }),
    });
    const unsubscribe = runtime.documents.subscribe(() => setRevision((value) => value + 1));

    return () => {
      pendingReviewRef.current?.settle("cancel");
      unsubscribe();
      reviewerRegistration.dispose();
      destinationRegistration.dispose();
      typeRegistration.dispose();
    };
  }, [runtime]);

  const documents = runtime.documents.openDocuments;
  const activeDocument = runtime.documents.activeDocumentId
    ? runtime.documents.getDocument(runtime.documents.activeDocumentId)
    : null;
  const activeModel = activeDocument && noteType.validate(activeDocument.model)
    ? activeDocument.model
    : null;

  const createNote = async () => {
    try {
      await runtime.documents.newDocument<NoteModel>({ typeId: noteType.id });
      setStatus("Created");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create note");
    }
  };

  const save = async () => {
    if (!activeDocument) return;
    try {
      await runtime.documents.saveDocument(activeDocument.id);
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save note");
    }
  };

  const close = async () => {
    if (!activeDocument) return;
    try {
      const result = await runtime.documents.closeDocument(activeDocument.id, "user");
      setStatus(result.outcome === "cancelled" ? "Close cancelled" : "Closed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to close note");
    }
  };

  return (
    <main aria-label="Application document workspace" data-revision={revision}>
      <h1>Application document workspace</h1>
      <div role="tablist" aria-label="Open documents">
        {documents.map((document) => {
          const title = noteType.validate(document.model) ? document.model.title : document.type.displayName;
          return (
            <button
              key={document.id}
              type="button"
              role="tab"
              aria-selected={document.id === runtime.documents.activeDocumentId}
              onClick={() => runtime.documents.activateDocument(document.id)}
            >
              {title}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => void createNote()}>New Note</button>
      {activeDocument && activeModel ? (
        <section aria-label="Active document">
          <label>
            Document title
            <input
              aria-label="Document title"
              value={activeModel.title}
              onChange={(event) => {
                activeDocument.update(
                  (model) => noteType.validate(model)
                    ? { ...model, title: event.currentTarget.value }
                    : { title: event.currentTarget.value },
                  { actionName: "Change Title", coalescingKey: "document-title" },
                );
              }}
            />
          </label>
          <button type="button" onClick={() => void save()} disabled={activeDocument.state === "clean"}>Save</button>
          <button type="button" onClick={() => void close()}>Close document</button>
        </section>
      ) : null}
      <p role="status">{status}</p>
      {pendingReview ? (
        <div role="dialog" aria-modal="true" aria-labelledby={dialogTitleId}>
          <h2 id={dialogTitleId}>Save changes to {pendingReview.title}?</h2>
          <button type="button" onClick={() => pendingReview.settle("save")}>Save</button>
          <button type="button" onClick={() => pendingReview.settle("discard")}>Discard</button>
          <button type="button" autoFocus onClick={() => pendingReview.settle("cancel")}>Cancel</button>
        </div>
      ) : null}
    </main>
  );
}
