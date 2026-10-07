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

import { DocumentAbortError, DocumentUnavailableError } from "./DocumentErrors";
import { immutableDocumentValue } from "./documentTypes";
import type { DocumentEditOptions, DocumentEditResult } from "./documentEditTypes";
import type { DocumentEditAdmission } from "./documentEditAdmission";
import type {
  DocumentEditingContext, DocumentEditingLifetimeOptions, DocumentEditingParticipant,
  DocumentEditingParticipantRegistration, DocumentEditingParticipantResult, DocumentEditingReason,
  DocumentEditingSettlementResult,
} from "./documentEditingTypes";

export class DocumentEditingSettlementError extends DocumentUnavailableError {
  constructor(readonly settlement: Exclude<DocumentEditingSettlementResult, { status: "settled" }>) {
    super(settlement.status === "refused"
      ? `Document editing was refused by "${settlement.participantId}": ${settlement.refusalReason}.`
      : `Document editing settlement was revoked: ${settlement.revocationReason}.`, { retryable: false });
  }
}

export function requireSettledDocumentEditing(result: DocumentEditingSettlementResult): void {
  if (result.status !== "settled") throw new DocumentEditingSettlementError(result);
}

interface Member<TModel> {
  readonly participant: DocumentEditingParticipant<TModel>;
  readonly options: DocumentEditingLifetimeOptions;
  readonly controller: AbortController;
  readonly dispose: () => void;
  readonly admission?: DocumentEditAdmission;
}
interface Flight {
  readonly reason: DocumentEditingReason;
  readonly mode: "settle" | "discard";
  readonly signal?: AbortSignal;
  readonly membership: number;
  readonly promise: Promise<DocumentEditingSettlementResult>;
}

function awaitParticipant<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (action: () => void) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      action();
    };
    const abort = () => finish(() => reject(new DocumentAbortError("Editing settlement was aborted.", { cause: signal.reason })));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    // Both handlers remain attached after cancellation to observe detached rejection.
    promise.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
  });
}

/** Document-scoped draft cooperation; no canonical model or history is stored here. */
export class DocumentEditingParticipants<TModel> {
  readonly #members = new Map<string, Member<TModel>>();
  readonly #flights = new Set<Flight>();
  #tail: Promise<unknown> = Promise.resolve();
  #membership = 0;
  #disposed = false;

  constructor(private readonly owner: {
    readonly documentId: string;
    readonly lifecycleSignal: () => AbortSignal;
    readonly assertAvailable: () => void;
    transact(transform: (current: Readonly<TModel>) => TModel, options: DocumentEditOptions<TModel>, admission?: DocumentEditAdmission): DocumentEditResult;
    readonly observeError: (error: unknown, context: string) => void;
  }) {}

  get hasParticipants(): boolean { return this.#members.size > 0; }

  register(participant: DocumentEditingParticipant<TModel>, options: DocumentEditingLifetimeOptions = {}, admission?: DocumentEditAdmission): DocumentEditingParticipantRegistration {
    this.owner.assertAvailable();
    const participantId = participant.id;
    const suppliedOptions = { ...options };
    const isCurrent = () => {
      try { return suppliedOptions.isCurrent?.() ?? true; }
      catch (error) { this.owner.observeError(error, "document-editing-lifetime"); return false; }
    };
    options = Object.freeze({ ...suppliedOptions, isCurrent });
    if (this.#disposed || !isCurrent()) throw new DocumentUnavailableError("The editing lifetime was revoked.", { retryable: false });
    if (options.signal?.aborted) throw new DocumentAbortError("The editing lifetime was aborted.");
    if (!participantId?.trim() || typeof participant.settle !== "function") throw new TypeError("Editing participants require an ID and settle callback.");
    if (this.#members.has(participantId)) throw new TypeError(`Editing participant "${participantId}" is already registered.`);
    const controller = new AbortController();
    const dispose = () => {
      if (controller.signal.aborted) return;
      controller.abort("editing-participant-revoked");
      options.signal?.removeEventListener("abort", dispose);
      this.#members.delete(participantId);
      this.#membership += 1;
    };
    const member: Member<TModel> = { admission, participant: Object.freeze({
      id: participantId, settle: participant.settle.bind(participant),
      ...(participant.discard ? { discard: participant.discard.bind(participant) } : {}),
    }), options: { ...options }, controller, dispose };
    this.#members.set(participantId, member);
    this.#membership += 1;
    options.signal?.addEventListener("abort", dispose, { once: true });
    return Object.freeze({
      get isLive() { return !controller.signal.aborted && (!options.isCurrent || options.isCurrent()); }, dispose,
    });
  }

  settle(reason: DocumentEditingReason, signal?: AbortSignal): Promise<DocumentEditingSettlementResult> { return this.#enqueue("settle", reason, signal); }
  discard(reason: DocumentEditingReason, signal?: AbortSignal): Promise<DocumentEditingSettlementResult> { return this.#enqueue("discard", reason, signal); }

  revokeWindow(windowControllerId: string): void {
    for (const member of [...this.#members.values()]) if (member.options.windowControllerId === windowControllerId) member.dispose();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const member of [...this.#members.values()]) member.dispose();
  }

  #enqueue(mode: "settle" | "discard", reason: DocumentEditingReason, signal?: AbortSignal): Promise<DocumentEditingSettlementResult> {
    for (const flight of this.#flights) if (flight.reason === reason && flight.mode === mode && flight.signal === signal && flight.membership === this.#membership) return flight.promise;
    const members = [...this.#members.values()];
    const membership = this.#membership;
    const lifecycle = this.owner.lifecycleSignal();
    const queueSignal = AbortSignal.any([lifecycle, ...(signal ? [signal] : []), ...members.map((member) => member.controller.signal)]);
    let started = false;
    let detachQueueAbort = () => {};
    const execution = this.#tail.then(() => {
      started = true;
      detachQueueAbort();
      return this.#run(members, membership, lifecycle, mode, reason, signal);
    });
    const promise = new Promise<DocumentEditingSettlementResult>((resolve, reject) => {
      const abort = () => {
        if (started) return; // Active settlement owns its richer partial-commit receipt.
        detachQueueAbort();
        const member = members.find((candidate) => candidate.controller.signal.aborted);
        resolve(Object.freeze({ status: "revoked", documentId: this.owner.documentId, reason,
          revocationReason: this.#disposed || lifecycle.aborted ? "document-revoked" : signal?.aborted ? "aborted" : "participant-revoked",
          ...(member ? { participantId: member.participant.id } : {}), settledParticipantIds: Object.freeze([]),
        }));
      };
      detachQueueAbort = () => queueSignal.removeEventListener("abort", abort);
      queueSignal.addEventListener("abort", abort, { once: true });
      if (queueSignal.aborted) abort();
      execution.then(resolve, reject);
    });
    const flight: Flight = { mode, reason, signal, membership, promise };
    this.#flights.add(flight);
    this.#tail = execution.catch(() => undefined);
    void promise.then(() => this.#flights.delete(flight), () => this.#flights.delete(flight));
    return promise;
  }

  async #run(members: readonly Member<TModel>[], membership: number, lifecycle: AbortSignal, mode: "settle" | "discard", reason: DocumentEditingReason, caller?: AbortSignal): Promise<DocumentEditingSettlementResult> {
    const completed: string[] = [];
    const operation = new AbortController();
    const revoked = (revocationReason: Extract<DocumentEditingSettlementResult, { status: "revoked" }> ["revocationReason"], participantId?: string): DocumentEditingSettlementResult => Object.freeze({
      status: "revoked", documentId: this.owner.documentId, reason, revocationReason,
      ...(participantId ? { participantId } : {}), settledParticipantIds: Object.freeze([...completed]),
    });
    const check = (member?: Member<TModel>) => {
      if (this.#disposed || lifecycle.aborted || lifecycle !== this.owner.lifecycleSignal()) return revoked("document-revoked", member?.participant.id);
      if (caller?.aborted) return revoked("aborted", member?.participant.id);
      if (member && (member.controller.signal.aborted || (member.options.isCurrent && !member.options.isCurrent()))) return revoked("participant-revoked", member.participant.id);
      if (membership !== this.#membership) return revoked("membership-changed", member?.participant.id);
      try { this.owner.assertAvailable(); } catch { return revoked("document-revoked", member?.participant.id); }
      return null;
    };
    const refuse = (id: string, refusalReason: string, issues: readonly { readonly message: string; readonly code?: string }[] = []): DocumentEditingSettlementResult => immutableDocumentValue({
      status: "refused", documentId: this.owner.documentId, reason, participantId: id, refusalReason,
      issues, settledParticipantIds: [...completed],
    });
    try {
      const initial = check(); if (initial) return initial;
      for (const member of members) {
        const stale = check(member); if (stale) return stale;
        const signal = AbortSignal.any([lifecycle, operation.signal, member.controller.signal, ...(caller ? [caller] : [])]);
        const context: DocumentEditingContext<TModel> = Object.freeze({
          documentId: this.owner.documentId, reason, signal,
          isCurrent: () => !operation.signal.aborted && !check(member),
          transact: (transform: (current: Readonly<TModel>) => TModel, options: DocumentEditOptions<TModel>): DocumentEditResult => {
            if (operation.signal.aborted || check(member)) return Object.freeze({ status: "rejected", documentId: this.owner.documentId, reason: signal.aborted ? "aborted" : "unavailable", error: new DocumentUnavailableError("The editing commitment context was revoked.", { retryable: false }) });
            return this.owner.transact(transform, { ...options, signal: options.signal ? AbortSignal.any([options.signal, signal]) : signal }, member.admission);
          },
        });
        try {
          const callback = mode === "discard" ? member.participant.discard : member.participant.settle;
          if (!callback) return refuse(member.participant.id, "discard-unavailable");
          const result: DocumentEditingParticipantResult = await awaitParticipant(Promise.resolve(callback.call(member.participant, context)), signal);
          const changed = check(member); if (changed) return changed;
          if (result?.status === "refused") return refuse(member.participant.id, result.reason, result.issues);
          if (result?.status !== "settled") return refuse(member.participant.id, "invalid-participant-result");
          completed.push(member.participant.id);
        } catch (error) {
          const stale = check(member); if (stale) return stale;
          this.owner.observeError(error, "document-editing-participant");
          return refuse(member.participant.id, "participant-error", [{ message: error instanceof Error ? error.message : String(error) }]);
        }
      }
      const changed = check(); if (changed) return changed;
      return Object.freeze({ status: "settled", documentId: this.owner.documentId, reason, settledParticipantIds: Object.freeze([...completed]) });
    } finally {
      operation.abort("editing-settlement-finished");
    }
  }
}
