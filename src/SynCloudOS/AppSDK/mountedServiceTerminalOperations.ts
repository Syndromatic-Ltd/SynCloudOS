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

import type {
  ServiceTerminalOperations,
  ServiceTerminalReceipt,
  SynCloudOSRuntime,
  TerminalProviderOperationClaim,
} from "../SynCloudOS";

export function createMountedServiceTerminalOperations(options: {
  readonly runtime: SynCloudOSRuntime;
  readonly applicationId: string;
  readonly serviceId: string;
  readonly windowControllerId: string | null;
  readonly signal: AbortSignal;
  readonly assertLive: () => void;
  readonly requireOwner: (documentId: string) => unknown;
}): ServiceTerminalOperations {
  const { runtime, applicationId, serviceId, windowControllerId, signal, assertLive, requireOwner } = options;
  const claimant = Object.freeze({ applicationId, serviceId, windowControllerId });
  const claims = new Set<{ release(): void }>();
  signal.addEventListener("abort", () => { for (const claim of claims) claim.release(); }, { once: true });
  function wrap<TState, TResult>(claim: TerminalProviderOperationClaim<TState, TResult>): ServiceTerminalReceipt<TState, TResult> {
    const raw = claim.receipt;
    const controller = new AbortController();
    const flights = new Set<Promise<unknown>>();
    let retired = false;
    const entry = { release() {
      if (retired) return;
      retired = true;
      controller.abort(signal.reason);
      void Promise.allSettled([...flights]).then(() => { claim.release(); claims.delete(entry); });
    } };
    claims.add(entry);
    const assertClaim = () => { assertLive(); if (retired) throw new DOMException("The service receipt claim was revoked.", "SecurityError"); };
    const retire = () => { retired = true; claims.delete(entry); };
    const run = <T>(callerSignal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
      assertClaim();
      const operationSignal = AbortSignal.any([signal, controller.signal, ...(callerSignal ? [callerSignal] : [])]);
      operationSignal.throwIfAborted();
      const flight = operation(operationSignal);
      flights.add(flight);
      const settle = () => { flights.delete(flight); };
      void flight.then(settle, settle);
      return new Promise<T>((resolve, reject) => {
        const abort = () => reject(operationSignal.reason);
        operationSignal.addEventListener("abort", abort, { once: true });
        flight.then(value => {
          operationSignal.removeEventListener("abort", abort);
          if (operationSignal.aborted) reject(operationSignal.reason); else resolve(value);
        }, error => { operationSignal.removeEventListener("abort", abort); reject(error); });
      });
    };
    return Object.freeze<ServiceTerminalReceipt<TState, TResult>>({
      serviceId: raw.serviceId,
      documentId: raw.documentId, operationKind: raw.operationKind, operationIdentity: raw.operationIdentity,
      operationSnapshot() { assertClaim(); return raw.snapshot(); },
      waitForProvider(callerSignal?: AbortSignal) { return run(callerSignal, s => raw.waitForProvider(s)); },
      updateState(state: TState) { assertClaim(); return raw.updateState(state); },
      snapshot<TModel>() { assertClaim(); return raw.documentSnapshot<TModel>(); },
      synchronise<TModel>(transform: (current: Readonly<TModel>) => TModel) { assertClaim(); raw.synchronise(transform); return raw.documentSnapshot<TModel>(); },
      save(callerSignal?: AbortSignal) { return run(callerSignal, s => raw.save(s)); },
      recoverWrite(callerSignal?: AbortSignal) { return run(callerSignal, s => raw.recoverWrite(s)); },
      close(reason, callerSignal) { return run(callerSignal, async s => { const result = await raw.close(reason, s); if (result.outcome === "closed") retire(); return result; }); },
      release() { return run(undefined, async () => { const completed = await raw.complete(); if (completed) retire(); return completed; }); },
    });
  }
  return Object.freeze<ServiceTerminalOperations>({
    reserve(request) {
      assertLive(); requireOwner(request.documentId);
      return wrap(runtime.documents.reserveTerminalProviderOperation({ ...request, applicationId, serviceId, initialClaim: { claimant, windowControllerId } }));
    },
    claim<TState, TResult>() {
      assertLive();
      const claim = runtime.documents.claimTerminalProviderOperation<TState, TResult>(applicationId, { serviceId, claimant, windowControllerId });
      return claim ? wrap(claim) : null;
    },
    subscribe(listener) { assertLive(); const unsubscribe = runtime.documents.subscribe(() => { if (!signal.aborted) listener(); }); signal.addEventListener("abort", unsubscribe, { once: true }); return () => { signal.removeEventListener("abort", unsubscribe); unsubscribe(); }; },
  });
}
