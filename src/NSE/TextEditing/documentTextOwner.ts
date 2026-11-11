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

import { applyNSETextOperations, createNSETextSnapshot, NSETextChangeMap, type NSEAttributedContent, type NSETextOwner, type NSETextSnapshot, type NSETextChangeReceipt, type NSETextCommitRequest } from "../Text";
import { translateBackendContent } from "./backends/backendChangeTranslator";
import { canonicalDocumentJson, declareSynCloudOSLifecycleSignal, SynCloudOSLifecycleRecord, synCloudOSLifecycleSignalReason } from "../../SynCloudOS/nseRuntimeContracts";
import type { DocumentEditOptions, DocumentEditResult } from "../../SynCloudOS/SynCloudOS";

export interface NSETextDocumentPort<TModel> {
  getSnapshot(): { readonly id: string; readonly model: Readonly<TModel>; readonly dirtyRevision: number; readonly readOnly: boolean; readonly state: string };
  subscribe(listener: () => void): () => void;
  transact(transform: (current: Readonly<TModel>) => TModel, options: DocumentEditOptions<TModel>): DocumentEditResult;
}
export interface NSEDocumentTextOwnerOptions<TModel> {
  readonly document: NSETextDocumentPort<TModel>;
  readonly flowId: string;
  readonly readContent: (model: Readonly<TModel>) => NSEAttributedContent;
  /** Preserve semantic text/attributes/paragraphs/attachments on read-back.
   * Apply normalization explicitly before commit; harmless run segmentation may differ. */
  readonly writeContent: (model: Readonly<TModel>, content: NSEAttributedContent) => TModel;
  readonly signal?: AbortSignal;
  readonly observeError?: (error: unknown, context: string) => void;
}
export interface NSEDocumentTextOwner extends NSETextOwner {
  readonly signal: AbortSignal;
  readonly observerErrors: readonly unknown[];
  dispose(): void;
}

/** Ignore harmless text-run segmentation and omitted empty attributes. */
function projectionIdentity(snapshot: NSETextSnapshot): string {
  const characters: Array<{ location: number; length: number; attributes: string; attachment?: unknown }> = [];
  for (const span of snapshot.characterSpans) {
    const attributes = canonicalDocumentJson(span.attributes, "document-text-attributes");
    const last = characters.at(-1);
    if (!span.attachment && last && !last.attachment && last.location + last.length === span.range.location && last.attributes === attributes) last.length += span.range.length;
    else characters.push({ ...span.range, attributes, ...(span.attachment ? { attachment: span.attachment } : {}) });
  }
  return canonicalDocumentJson({ text: snapshot.text, characters, paragraphs: snapshot.paragraphSpans }, "document-text-projection");
}

let ownerGeneration = 1000000;
/** A semantic flow projection into an application-owned native model, with one document transaction. */
export function createNSEDocumentTextOwner<TModel>(supplied: NSEDocumentTextOwnerOptions<TModel>): NSEDocumentTextOwner {
  const options = Object.freeze({ ...supplied });
  const generation = ownerGeneration++;
  const initial = options.document.getSnapshot();
  const lifecycle = new SynCloudOSLifecycleRecord({ kind: "NSEDocumentTextOwner", id: initial.id });
  if (initial.state === "closed" || options.signal?.aborted) {
    lifecycle.markDisposed(initial.state === "closed" ? "document-closed" : synCloudOSLifecycleSignalReason(options.signal!));
    throw lifecycle.error({ code: "NSE_DOCUMENT_TEXT_OWNER_DISPOSED", operation: "createNSEDocumentTextOwner" });
  }
  let snapshot = createNSETextSnapshot(options.readContent(initial.model), options.flowId, initial.dirtyRevision, generation);
  let nativeIdentity = canonicalDocumentJson(initial.model, "document-text-model");
  let disposed = false, publishing = false, committing = false;
  const lifetime = new AbortController();
  let unsubscribe = () => {};
  let pending: { prepared: NSETextChangeReceipt; verified?: NSETextSnapshot; nativeIdentity?: string } | null = null;
  let lastReceipt: NSETextChangeReceipt | null = null;
  const errors: unknown[] = [];
  const listeners = new Set<(receipt: NSETextChangeReceipt) => void>();
  const diagnose = (error: unknown, context: string) => {
    errors.push(error);
    try { options.observeError?.(error, context); } catch (observerError) { errors.push(observerError); }
  };
  const dispose = (reason = "explicit") => {
    if (disposed) return;
    lifecycle.markDisposed(reason);
    disposed = true;
    try { unsubscribe(); } catch (error) { diagnose(error, "document-text-unsubscribe"); }
    listeners.clear(); options.signal?.removeEventListener("abort", ownerAbort); lifetime.abort();
  };
  const ownerAbort = () => {
    const reason = synCloudOSLifecycleSignalReason(options.signal!);
    declareSynCloudOSLifecycleSignal(lifetime.signal, reason);
    dispose(reason);
  };
  const assertLive = (operation: string) => {
    if (disposed || options.signal?.aborted) {
      if (!disposed) ownerAbort();
      throw lifecycle.error({ code: "NSE_DOCUMENT_TEXT_OWNER_DISPOSED", operation });
    }
  };
  const readDocument = (operation: string) => {
    assertLive(operation);
    try {
      const document = options.document.getSnapshot();
      const identity = canonicalDocumentJson(document.model, "document-text-model");
      if (document.id !== initial.id || document.state === "closed" || !Number.isSafeInteger(document.dirtyRevision) || document.dirtyRevision < snapshot.revision ||
        document.dirtyRevision === snapshot.revision && identity !== nativeIdentity) {
        dispose(document.state === "closed" ? "document-closed" : "document-revoked");
        throw lifecycle.error({ code: "NSE_DOCUMENT_TEXT_OWNER_DISPOSED", operation, problem: "The native document closed, or its model identity changed without a current revision." });
      }
      return { document, identity };
    } catch (error) { diagnose(error, "document-text-lifetime"); dispose("document-revoked"); throw error; }
  };
  const makeReceipt = (before: NSETextSnapshot, actual: NSETextSnapshot): NSETextChangeReceipt => {
    const staged = pending?.prepared;
    let operations = staged?.before === before && projectionIdentity(staged.snapshot) === projectionIdentity(actual) ? staged.operations : translateBackendContent(before, actual.attributedContent);
    let projected = applyNSETextOperations(before, operations);
    // Never supply a change map for a different canonical projection.
    if (projectionIdentity(projected.snapshot) !== projectionIdentity(actual)) {
      operations = Object.freeze([{ kind: "replace" as const, range: { location: 0, length: before.text.length }, content: actual.attributedContent }]);
      projected = applyNSETextOperations(before, operations);
    }
    return Object.freeze({ before, snapshot: actual, operations, changeMap: new NSETextChangeMap(before, actual, projected.changeMap.steps), observerErrors: Object.freeze([]) });
  };
  const publish = (actual: NSETextSnapshot, identity: string, diagnosticErrors: readonly unknown[] = []) => {
    const receipt = makeReceipt(snapshot, actual);
    snapshot = actual; nativeIdentity = identity;
    const observerErrors = [...diagnosticErrors];
    publishing = true;
    try {
      for (const listener of [...listeners]) if (listeners.has(listener)) {
        try { listener(receipt); } catch (error) { observerErrors.push(error); diagnose(error, "document-text-observer"); }
      }
    } finally { publishing = false; }
    lastReceipt = Object.freeze({ ...receipt, observerErrors: Object.freeze(observerErrors) });
  };
  const refresh = (operation: string) => {
    const { document, identity } = readDocument(operation);
    if (document.dirtyRevision === snapshot.revision) return;
    try {
      publish(createNSETextSnapshot(options.readContent(document.model), options.flowId, document.dirtyRevision, generation), identity);
    } catch (error) {
      diagnose(error, "document-text-projection");
      // Exactly the native model validated before history admission: its cached
      // semantic projection is verified rather than a guessed staged result.
      if (pending?.verified && pending.nativeIdentity === identity) {
        const actual = Object.freeze({ ...pending.verified, revision: document.dirtyRevision });
        publish(actual, identity, [error]);
      }
      dispose("document-revoked");
    }
  };
  unsubscribe = options.document.subscribe(() => {
    if (disposed) return;
    try { refresh(committing ? "commit" : "subscribe"); } catch { /* Lifetime diagnostics and revocation already recorded. */ }
  });
  options.signal?.addEventListener("abort", ownerAbort, { once: true });
  if (options.signal?.aborted) ownerAbort();
  return Object.freeze({
    signal: lifetime.signal,
    get observerErrors() { return Object.freeze([...errors]); },
    getSnapshot() { refresh("getSnapshot"); assertLive("getSnapshot"); return snapshot; },
    subscribe(listener: (receipt: NSETextChangeReceipt) => void) { refresh("subscribe"); assertLive("subscribe"); listeners.add(listener); return () => { listeners.delete(listener); }; },
    commit(request: NSETextCommitRequest) {
      refresh("commit");
      assertLive("commit");
      if (publishing || committing) throw new Error("Reentrant text commit during document publication or staging is forbidden.");
      const { document } = readDocument("commit");
      if (document.readOnly) throw new Error("Document text is read-only.");
      if (request.expectedRevision !== snapshot.revision || request.expectedGeneration !== undefined && request.expectedGeneration !== generation) throw new Error("Document text revision is stale.");
      const prepared = applyNSETextOperations(snapshot, request.operations);
      if (prepared.snapshot === snapshot) return prepared;
      pending = { prepared }; lastReceipt = null; committing = true;
      try {
        const result = options.document.transact(model => options.writeContent(model, prepared.snapshot.attributedContent), {
          expectedRevision: request.expectedRevision, actionName: request.actionName ?? "Text Edit", coalescingKey: request.coalescingKey, signal: options.signal,
          validateModel: next => {
            const verified = createNSETextSnapshot(options.readContent(next), options.flowId, prepared.snapshot.revision, generation);
            if (projectionIdentity(verified) !== projectionIdentity(prepared.snapshot)) throw new Error("Native text writer round-trip changes semantic content; stage normalization explicitly before commitment.");
            pending!.verified = verified; pending!.nativeIdentity = canonicalDocumentJson(next, "document-text-model");
          },
        });
        if (result.status === "rejected") throw result.error;
        if (!lastReceipt && !disposed) { try { refresh("commit"); } catch { /* An admitted edit cannot become a rejected edit. */ } }
        if (!lastReceipt) {
          const diagnostic = Object.assign(new Error("Native edit committed, but its text projection was revoked or unavailable."), { documentReceipt: result });
          diagnose(diagnostic, "document-text-postcommit");
          let actual = prepared.before;
          try {
            const current = options.document.getSnapshot();
            if (pending.verified && pending.nativeIdentity === canonicalDocumentJson(current.model, "document-text-model")) actual = Object.freeze({ ...pending.verified, revision: current.dirtyRevision });
            else actual = createNSETextSnapshot(options.readContent(current.model), options.flowId, current.dirtyRevision, generation);
          } catch (error) { diagnose(error, "document-text-postcommit-unavailable"); }
          lastReceipt = Object.freeze({ ...makeReceipt(prepared.before, actual), observerErrors: Object.freeze([...errors]) });
          dispose("document-revoked");
        }
        return lastReceipt;
      } finally { pending = null; committing = false; }
    },
    dispose: () => dispose(),
  });
}
