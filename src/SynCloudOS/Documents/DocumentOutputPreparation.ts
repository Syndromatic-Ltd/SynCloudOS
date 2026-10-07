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

import { GFXPDFContext } from "../../FX/GraphicsFX/pdf/GFXPDFContext";
import { immutableDocumentValue } from "./documentTypes";
import type {
  DocumentOutputDependencies, DocumentOutputDependencyReceipt, DocumentOutputLease,
  DocumentOutputPage, DocumentOutputPDFResult, DocumentOutputPreparation,
  DocumentOutputPreparationResult, DocumentOutputReceipt, DocumentOutputRequest, DocumentOutputSnapshot,
} from "./documentOutputTypes";

const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const canceled = () => new DOMException("Document output was canceled or released.", "AbortError");

/** Read capabilities only; neither callbacks nor borrowed Map methods receive the backing map. */
function readOnlyDependencies<K, V>(values: Map<K, V>): ReadonlyMap<K, V> {
  const facade: ReadonlyMap<K, V> = {
    get size() { return values.size; },
    get: key => values.get(key),
    has: key => values.has(key),
    entries: () => values.entries(),
    keys: () => values.keys(),
    values: () => values.values(),
    forEach(callback, thisArg) { values.forEach((value, key) => callback.call(thisArg, value, key, facade)); },
    [Symbol.iterator]: () => values[Symbol.iterator](),
  };
  for (const key of Reflect.ownKeys(facade)) {
    const descriptor = Object.getOwnPropertyDescriptor(facade, key)!;
    if (typeof descriptor.value === "function") Object.freeze(descriptor.value);
    if (descriptor.get) Object.freeze(descriptor.get);
  }
  return Object.freeze(facade);
}

function drawingContext(recorder: GFXPDFContext): GFXPDFContext {
  const lifecycle = new Set(["beginPage", "endPage", "finish", "dispose"]);
  return new Proxy(recorder, { get(target, property) {
    if (typeof property === "string" && lifecycle.has(property)) throw new TypeError("Output preparation owns the PDF page lifecycle.");
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

/** Race uncooperative adapters too. Late fulfillment/rejection is still observed by the promise handlers. */
function untilAborted<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason ?? canceled()); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void task.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => {
      signal.removeEventListener("abort", abort); reject(error);
    });
  });
}

export function createDocumentOutputPreparation<TModel>(dependencies: DocumentOutputDependencies<TModel>): DocumentOutputPreparation<TModel> {
  return Object.freeze({
    async prepare(request: DocumentOutputRequest<TModel>): Promise<DocumentOutputPreparationResult<TModel>> {
      const controller = new AbortController();
      const signal = controller.signal;
      const externalSignals = [dependencies.signal, request.signal].filter((entry): entry is AbortSignal => !!entry);
      const detach: (() => void)[] = [];
      const leases: DocumentOutputLease[] = [];
      const releasedLeases = new Set<DocumentOutputLease>();
      const retainedValues = new Map<string, unknown>();
      const resourceReceipts: DocumentOutputDependencyReceipt[] = [];
      const fallbacks: DocumentOutputReceipt["fallbacks"][number][] = [];
      const cleanupErrors: string[] = [];
      let released = false;
      let recorder: GFXPDFContext | null = null;
      let captured: DocumentOutputSnapshot<TModel> | null = null;
      let pages: readonly DocumentOutputPage<TModel>[] = [];
      let readiness: DocumentOutputReceipt["readiness"] = "unavailable";
      const purpose = request.purpose ?? "export";
      const configurationId = request.configurationId ?? "pdf";
      const acceptFallbacks = request.acceptFallbacks === true;
      const engine = request.engine;
      const receipt = (reason?: string): DocumentOutputReceipt => immutableDocumentValue({
        documentId: captured?.documentId ?? null, revision: captured?.revision ?? null,
        purpose, configurationId, readiness, pageUnit: "pt", pages: pages.map(page => page.geometry),
        dependencies: resourceReceipts, fallbacks, cleanupErrors, ...(reason === undefined ? {} : { reason }),
      });
      const releaseLease = (lease: DocumentOutputLease) => {
        if (releasedLeases.has(lease)) return;
        releasedLeases.add(lease);
        try { lease.release(); } catch (error) { cleanupErrors.push(message(error)); }
      };
      const release = (): readonly string[] => {
        if (!released) {
          released = true;
          for (const remove of detach) remove();
          signal.removeEventListener("abort", onAbort);
          controller.abort(canceled());
          recorder?.dispose();
          for (const lease of [...leases].reverse()) releaseLease(lease);
          leases.length = 0;
          retainedValues.clear();
        }
        return Object.freeze([...cleanupErrors]);
      };
      const onAbort = () => { release(); };
      signal.addEventListener("abort", onAbort, { once: true });
      for (const external of externalSignals) {
        if (released) break;
        const abort = () => controller.abort(external.reason ?? canceled());
        external.addEventListener("abort", abort, { once: true });
        detach.push(() => external.removeEventListener("abort", abort));
        if (external.aborted) abort();
      }
      const failure = (status: Exclude<DocumentOutputPreparationResult<TModel>["status"], "prepared">, reason: string): DocumentOutputPreparationResult<TModel> => {
        release();
        return Object.freeze({ status, receipt: receipt(reason) });
      };
      try {
        signal.throwIfAborted();
        const settlement = await untilAborted(Promise.resolve(dependencies.settle(purpose, signal)), signal);
        signal.throwIfAborted();
        if (settlement.status !== "settled") {
          if (settlement.status === "revoked") return failure("canceled", settlement.revocationReason);
          return failure("refused", "refusalReason" in settlement ? settlement.refusalReason : settlement.reason);
        }
        captured = immutableDocumentValue(dependencies.capture());
        if (!captured.documentId || !Number.isSafeInteger(captured.revision) || captured.revision < 0) {
          throw new TypeError("Output capture needs a document id and non-negative monotonic revision.");
        }
        const snapshot = captured;
        const plan = await untilAborted(Promise.resolve(engine(snapshot, signal)), signal);
        signal.throwIfAborted();
        // Copy both geometry and callback identity; edits to the engine's plan cannot retarget this output.
        pages = Object.freeze(plan.pages.map(page => Object.freeze({ geometry: immutableDocumentValue(page.geometry), draw: page.draw })));
        const metadata = plan.metadata ? immutableDocumentValue(plan.metadata) : undefined;
        const requiredDependencies = (plan.dependencies ?? []).map(dependency => Object.freeze({
          id: dependency.id, kind: dependency.kind, retain: dependency.retain.bind(dependency),
        }));
        const seenDependencies = new Set<string>();
        for (const dependency of requiredDependencies) {
          signal.throwIfAborted();
          if (!dependency.id || seenDependencies.has(dependency.id) || !["font", "resource"].includes(dependency.kind)) {
            throw new TypeError("Output dependency ids must be unique and identify a font or resource.");
          }
          seenDependencies.add(dependency.id);
          const retained = await untilAborted(Promise.resolve(dependency.retain(signal)).then(result => {
            if (result.status === "retained") {
              if (signal.aborted) releaseLease(result.lease);
              else leases.push(result.lease);
            }
            return result;
          }), signal);
          signal.throwIfAborted();
          const entry = { id: dependency.id, kind: dependency.kind, status: retained.status };
          resourceReceipts.push(Object.freeze(retained.status === "retained" ? entry : { ...entry, reason: retained.reason }));
          if (retained.status !== "retained") {
            const status = retained.status === "unsupported" ? "unsupported" : retained.status === "pending" ? "pending-resources" : "missing-resources";
            readiness = status;
            return failure(status, retained.reason);
          }
          retainedValues.set(dependency.id, retained.lease.value);
          if (retained.fallback) {
            fallbacks.push(immutableDocumentValue({ dependencyId: dependency.id, ...retained.fallback }));
            if (!acceptFallbacks) {
              readiness = "unsupported";
              return failure("unsupported", "Output fallback requires explicit acceptance.");
            }
          }
        }
        if (!pages.length) throw new RangeError("Output requires at least one engine-supplied page.");
        // Use the existing PDF validator and limits rather than creating separate page rules.
        recorder = new GFXPDFContext(metadata);
        for (const page of pages) {
          if (typeof page.draw !== "function") throw new TypeError("Each output page requires a drawing callback.");
          recorder.beginPage(page.geometry);
          recorder.endPage();
        }
        recorder.dispose();
        recorder = null;
        readiness = fallbacks.length ? "accepted-fallback" : "complete";
        const preparedReceipt = receipt();
        let exporting: Promise<DocumentOutputPDFResult> | null = null;
        const exportPDF = (): Promise<DocumentOutputPDFResult> => {
          if (exporting) return exporting;
          // Assign the shared promise before entering arbitrary engine drawing, including reentrant calls.
          exporting = Promise.resolve().then(async (): Promise<DocumentOutputPDFResult> => {
            let result: DocumentOutputPDFResult;
            try {
              signal.throwIfAborted();
              recorder = new GFXPDFContext(metadata);
              const context = drawingContext(recorder);
              const drawing = Object.freeze({ snapshot, dependencies: readOnlyDependencies(retainedValues), signal });
              for (const page of pages) {
                signal.throwIfAborted();
                recorder.beginPage(page.geometry);
                await untilAborted(Promise.resolve(page.draw(context, drawing)), signal);
                signal.throwIfAborted();
                recorder.endPage();
              }
              const bytes = await untilAborted(recorder.finish(undefined, signal), signal);
              signal.throwIfAborted();
              release();
              result = cleanupErrors.length
                ? { status: "failed", receipt: receipt("Output retention cleanup failed.") }
                : { status: "exported", mimeType: "application/pdf", bytes, receipt: receipt() };
            } catch (error) {
              const status = signal.aborted ? "canceled" : "failed";
              release();
              result = { status, receipt: receipt(message(error)) };
            }
            return Object.freeze(result);
          });
          return exporting;
        };
        return Object.freeze({ status: "prepared", output: Object.freeze({ snapshot, receipt: preparedReceipt, exportPDF, release }) });
      } catch (error) {
        return failure(signal.aborted ? "canceled" : "failed", message(error));
      }
    },
  });
}
