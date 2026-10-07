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

import type { LUFXQuery, LUFXQueryDescriptor } from "../../FX/LuminaFX/LUFXQuery";
import { LUFXQueryPlanner, type LUFXQueryExecutionOptions, type LUFXQueryResultEntry, type LUFXQueryResultPage } from "../../FX/LuminaFX/LUFXQueryPlanner";
import type { LUFXSuggestionOptions, LUFXSuggestionResult } from "../../FX/LuminaFX/LUFXSuggestions";
import type { LUFXSearchableItem } from "../../FX/LuminaFX/LUFXSearchableItem";
import type { SynCloudOSPolicySubject } from "../PolicyKit/policyTypes";
import type { LuminaIndexService } from "./LuminaIndexService";
import {
  LuminaEligibilityRegistry,
  luminaSubjectFingerprint,
  type LuminaItemEligibilityInput,
  type LuminaDomainProjection,
} from "./LuminaEligibility";
import {
  LUFXActivationResolver,
  type LUFXActivationReference,
  type LUFXActivationResult,
  type LUFXTrustedActivationResolver,
} from "./LUFXActivationResolver";
import {
  LuminaDonationCoordinator,
  type LuminaDonationCoordinatorOptions,
} from "./LuminaDonationCoordinator";
import type { LuminaIndexMaintenanceDiagnostics } from "./LuminaIndexMaintenance";

export interface LUFXHostPolicyPort {
  getCurrentSubject(): SynCloudOSPolicySubject;
  authorise(request: Readonly<{
    action: "lumina.eligible-query" | "lumina.activate";
    subject: SynCloudOSPolicySubject;
    ownerAppId?: string;
    destinationAppId?: string;
    requiredCapabilities: readonly string[];
  }>): Readonly<{ allowed: boolean }>;
}

export interface LUFXHostQueryResultEntry extends LUFXQueryResultEntry {
  readonly ownerAppId: string;
  readonly reference: LUFXActivationReference;
}

export interface LUFXHostQueryBatch {
  readonly runtimeId: string;
  readonly policyGeneration: number;
  readonly subjectFingerprint: string;
  readonly results: readonly LUFXHostQueryResultEntry[];
  readonly nextCursor?: string;
}

export interface LUFXHostSuggestionBatch {
  readonly runtimeId: string;
  readonly policyGeneration: number;
  readonly subjectFingerprint: string;
  readonly suggestions: LUFXSuggestionResult;
}

export interface LUFXHostDomainRegistration extends LuminaDomainProjection {
  readonly resolve: LUFXTrustedActivationResolver;
}

interface LUFXHostServiceOptions {
  readonly runtimeId: string;
  readonly indexes: LuminaIndexService;
  readonly eligibility: LuminaEligibilityRegistry;
  readonly policy: LUFXHostPolicyPort;
  readonly subscribeState: (listener: () => void) => () => void;
  readonly apps: { getApp(appId: string): { readonly id: string } | null };
  readonly routes: {
    getAppForRoute(pathname: string): { readonly id: string } | null;
    openRoute(pathname: string, options?: Record<string, unknown>): any;
  };
  readonly presentationSettlements: { get(id: string): any };
  readonly randomUUID: () => string;
}

function staleQueryError(): DOMException {
  return new DOMException("Lumina privileged query became stale while eligibility changed.", "InvalidStateError");
}

export class LUFXHostService {
  readonly #options: LUFXHostServiceOptions;
  readonly #planner = new LUFXQueryPlanner();
  readonly #activation: LUFXActivationResolver;
  readonly #lifetime = new AbortController();
  readonly #unsubscribeState: () => void;
  readonly #donationCoordinators = new Map<LuminaDonationCoordinator<unknown>, string>();
  readonly #erasingOwners = new Set<string>();
  #subjectFingerprint: string;
  #disposed = false;

  constructor(options: LUFXHostServiceOptions) {
    this.#options = options;
    this.#subjectFingerprint = luminaSubjectFingerprint(options.policy.getCurrentSubject());
    this.#activation = new LUFXActivationResolver({
      runtimeId: options.runtimeId,
      indexes: options.indexes,
      eligibility: options.eligibility,
      policy: {
        currentFingerprint: () => luminaSubjectFingerprint(options.policy.getCurrentSubject()),
        allows: (_action, input) => options.policy.authorise({
          action: "lumina.activate",
          subject: options.policy.getCurrentSubject(),
          ownerAppId: input.ownerAppId,
          destinationAppId: input.destinationAppId,
          requiredCapabilities: ["lumina.eligible-query"],
        }).allowed,
      },
      apps: options.apps,
      routes: options.routes,
      presentationSettlements: options.presentationSettlements,
      randomUUID: options.randomUUID,
    });
    this.#unsubscribeState = options.subscribeState(() => {
      if (this.#disposed) return;
      const next = luminaSubjectFingerprint(options.policy.getCurrentSubject());
      if (next === this.#subjectFingerprint) return;
      this.#subjectFingerprint = next;
      options.eligibility.invalidatePolicy();
    });
  }

  registerDomain(input: LUFXHostDomainRegistration): () => void {
    this.#assertLive();
    const unregisterEligibility = this.#options.eligibility.registerProjection(input);
    try {
      const unregisterResolver = this.#activation.register(input);
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        unregisterResolver();
        unregisterEligibility();
      };
    } catch (error) {
      unregisterEligibility();
      throw error;
    }
  }

  setEligibility(input: LuminaItemEligibilityInput): number {
    this.#assertLive();
    return this.#options.eligibility.setItem(input);
  }

  createDonationCoordinator<TValue>(
    input: Omit<LuminaDonationCoordinatorOptions<TValue>, "indexes" | "eligibility">,
  ): LuminaDonationCoordinator<TValue> {
    this.#assertLive();
    if (this.#erasingOwners.has(input.ownerAppId)) {
      throw new DOMException("Lumina owner erasure is in progress.", "InvalidStateError");
    }
    const coordinator = new LuminaDonationCoordinator<TValue>({
      ...input,
      indexes: this.#options.indexes,
      eligibility: this.#options.eligibility,
    });
    this.#donationCoordinators.set(coordinator as LuminaDonationCoordinator<unknown>, input.ownerAppId);
    return coordinator;
  }

  async eraseOwner(ownerAppId: string, options: { readonly signal?: AbortSignal } = {}): Promise<LuminaIndexMaintenanceDiagnostics | null> {
    this.#assertLive();
    const signal = this.#operationSignal(options.signal);
    signal.throwIfAborted();
    this.#erasingOwners.add(ownerAppId);
    this.#options.eligibility.eraseOwner(ownerAppId);
    try {
      const owned = [...this.#donationCoordinators].filter(([, owner]) => owner === ownerAppId);
      await Promise.all(owned.map(async ([coordinator]) => {
        await coordinator.prepareForOwnerErasure();
        this.#donationCoordinators.delete(coordinator);
      }));
      signal.throwIfAborted();
      let maintenance;
      try {
        maintenance = this.#options.indexes.createMaintenance(ownerAppId, signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotSupportedError") return null;
        throw error;
      }
      try {
        return await maintenance.eraseOwner({ signal });
      } finally {
        maintenance.dispose();
      }
    } finally {
      this.#erasingOwners.delete(ownerAppId);
    }
  }

  async queryEligible(value: LUFXQuery | LUFXQueryDescriptor, options: LUFXQueryExecutionOptions = {}): Promise<LUFXHostQueryBatch> {
    this.#options.eligibility.refreshTemporal();
    const signal = this.#operationSignal(options.signal);
    const executionOptions = { ...options, signal };
    const snapshot = await this.#eligibleSnapshot(signal);
    signal.throwIfAborted();
    const page = this.#planner.execute(snapshot.snapshot, value, executionOptions);
    this.#assertStable(snapshot.policyGeneration, snapshot.subjectFingerprint);
    this.#assertPrivileged("lumina.eligible-query");
    signal.throwIfAborted();
    const results = page.results.map((entry) => {
      const ownerAppId = snapshot.owners.get(entry.item);
      if (!ownerAppId) throw staleQueryError();
      return Object.freeze({
        ...entry,
        ownerAppId,
        reference: Object.freeze({
          runtimeId: this.#options.runtimeId,
          ownerAppId,
          domain: entry.item.domain,
          itemId: entry.item.id,
          revision: entry.item.revision,
          policyGeneration: snapshot.policyGeneration,
          subjectFingerprint: snapshot.subjectFingerprint,
        }),
      });
    });
    return Object.freeze({
      runtimeId: this.#options.runtimeId,
      policyGeneration: snapshot.policyGeneration,
      subjectFingerprint: snapshot.subjectFingerprint,
      results: Object.freeze(results),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    });
  }

  /** Trusted owner-scoped eligible query used by a host contribution to project
   * its own public search surface. The contribution wrapper constrains the
   * owner ID to one of its prepared applications; this never grants an app the
   * privileged cross-owner Lumina query client. */
  async queryOwnedEligible(
    ownerAppId: string,
    value: LUFXQuery | LUFXQueryDescriptor,
    options: LUFXQueryExecutionOptions = {},
  ): Promise<LUFXQueryResultPage> {
    this.#options.eligibility.refreshTemporal();
    const signal = this.#operationSignal(options.signal);
    const generation = this.#options.eligibility.generation;
    signal.throwIfAborted();
    // The owner's eligibility travels to the index, which filters and plans
    // where it lives: the index itself no longer crosses to this thread.
    const restriction = this.#options.eligibility.restrictionFor(ownerAppId);
    const page = await this.#options.indexes.queryRestricted(ownerAppId, value, restriction, { ...options, signal });
    if (this.#options.eligibility.generation !== generation) throw staleQueryError();
    signal.throwIfAborted();
    return page;
  }

  async suggestEligible(value: LUFXQuery | LUFXQueryDescriptor, options: LUFXSuggestionOptions & { readonly signal?: AbortSignal } = {}): Promise<LUFXHostSuggestionBatch> {
    this.#options.eligibility.refreshTemporal();
    const signal = this.#operationSignal(options.signal);
    const executionOptions = { ...options, signal };
    const snapshot = await this.#eligibleSnapshot(signal);
    signal.throwIfAborted();
    const suggestions = this.#planner.suggest(snapshot.snapshot, value, executionOptions);
    this.#assertStable(snapshot.policyGeneration, snapshot.subjectFingerprint);
    this.#assertPrivileged("lumina.eligible-query");
    signal.throwIfAborted();
    return Object.freeze({
      runtimeId: this.#options.runtimeId,
      policyGeneration: snapshot.policyGeneration,
      subjectFingerprint: snapshot.subjectFingerprint,
      suggestions,
    });
  }

  filterCurrent(batch: LUFXHostQueryBatch): LUFXHostQueryBatch {
    this.#assertLive();
    this.#options.eligibility.refreshTemporal();
    if (batch.runtimeId !== this.#options.runtimeId || batch.subjectFingerprint !== luminaSubjectFingerprint(this.#options.policy.getCurrentSubject())) {
      return Object.freeze({ ...batch, results: Object.freeze([]) });
    }
    try {
      this.#assertPrivileged("lumina.eligible-query");
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") {
        return Object.freeze({ ...batch, results: Object.freeze([]) });
      }
      throw error;
    }
    const results = batch.results.filter((entry) => this.#options.eligibility.bindingFor(entry.ownerAppId, entry.item) !== null);
    return Object.freeze({ ...batch, results: Object.freeze(results) });
  }

  activate(reference: LUFXActivationReference, options: { readonly signal?: AbortSignal } = {}): Promise<LUFXActivationResult> {
    this.#assertLive();
    this.#options.eligibility.refreshTemporal();
    return this.#activation.activate(reference, options);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribeState();
    if (!this.#lifetime.signal.aborted) this.#lifetime.abort(new DOMException("Lumina host service disposed.", "AbortError"));
    for (const coordinator of this.#donationCoordinators.keys()) coordinator.dispose();
    this.#donationCoordinators.clear();
    this.#activation.dispose();
  }

  async #eligibleSnapshot(signal?: AbortSignal): Promise<{
    readonly policyGeneration: number;
    readonly subjectFingerprint: string;
    readonly owners: WeakMap<LUFXSearchableItem, string>;
    readonly snapshot: Readonly<{ state: "ready"; schemaVersion: number; checkpoint: { generation: number; revision: number }; items: readonly LUFXSearchableItem[] }>;
  }> {
    this.#assertLive();
    signal?.throwIfAborted();
    this.#assertPrivileged("lumina.eligible-query");
    const policyGeneration = this.#options.eligibility.generation;
    const subjectFingerprint = luminaSubjectFingerprint(this.#options.policy.getCurrentSubject());
    const items: LUFXSearchableItem[] = [];
    const owners = new WeakMap<LUFXSearchableItem, string>();
    for (const ownerAppId of this.#options.eligibility.owners()) {
      signal?.throwIfAborted();
      const index = this.#options.indexes.createIndex(ownerAppId, signal ?? this.#lifetime.signal);
      try {
        const ownerSnapshot = await index.snapshot({ signal });
        for (const item of ownerSnapshot.items) {
          if (!this.#options.eligibility.bindingFor(ownerAppId, item)) continue;
          owners.set(item, ownerAppId);
          items.push(item);
        }
      } finally {
        index.dispose();
      }
    }
    this.#assertStable(policyGeneration, subjectFingerprint);
    return Object.freeze({
      policyGeneration,
      subjectFingerprint,
      owners,
      snapshot: Object.freeze({
        state: "ready" as const,
        schemaVersion: 1,
        checkpoint: Object.freeze({ generation: policyGeneration, revision: policyGeneration }),
        items: Object.freeze(items),
      }),
    });
  }

  #assertStable(policyGeneration: number, subjectFingerprint: string): void {
    if (this.#options.eligibility.generation !== policyGeneration || luminaSubjectFingerprint(this.#options.policy.getCurrentSubject()) !== subjectFingerprint) {
      throw staleQueryError();
    }
  }

  #assertPrivileged(action: "lumina.eligible-query"): void {
    const subject = this.#options.policy.getCurrentSubject();
    const decision = this.#options.policy.authorise({ action, subject, requiredCapabilities: ["lumina.eligible-query"] });
    if (!decision.allowed) throw new DOMException("PolicyKit denied privileged Lumina query authority.", "SecurityError");
  }

  #assertLive(): void {
    if (this.#disposed || this.#lifetime.signal.aborted) throw new DOMException("Lumina host service is disposed.", "AbortError");
  }

  #operationSignal(signal?: AbortSignal): AbortSignal {
    return signal && signal !== this.#lifetime.signal
      ? AbortSignal.any([this.#lifetime.signal, signal])
      : this.#lifetime.signal;
  }
}
