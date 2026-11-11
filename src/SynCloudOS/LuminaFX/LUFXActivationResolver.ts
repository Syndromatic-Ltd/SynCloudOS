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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type { LUFXSearchableItem } from "../../FX/LuminaFX/LUFXSearchableItem";
import type { LuminaIndexService } from "./LuminaIndexService";
import type { LuminaEligibilityRegistry } from "./LuminaEligibility";

export interface LUFXHostPolicySubjectLike {
  readonly fingerprint: string;
}

export interface LUFXHostPolicyPortLike {
  currentFingerprint(): string;
  allows(action: "lumina.activate", input: { readonly ownerAppId: string; readonly destinationAppId: string }): boolean;
}

export interface LUFXResolvedActivation {
  readonly pathname: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface LUFXTrustedActivationResolverInput {
  readonly ownerAppId: string;
  readonly destinationAppId: string;
  readonly item: LUFXSearchableItem;
  readonly parameters: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}

export type LUFXTrustedActivationResolver = (
  input: LUFXTrustedActivationResolverInput,
) => LUFXResolvedActivation | Promise<LUFXResolvedActivation>;

export interface LUFXActivationReference {
  readonly runtimeId: string;
  readonly ownerAppId: string;
  readonly domain: string;
  readonly itemId: string;
  readonly revision: string;
  readonly policyGeneration: number;
  readonly subjectFingerprint: string;
}

export type LUFXActivationStatus =
  | "activated"
  | "denied"
  | "stale"
  | "cancelled"
  | "route-error"
  | "presentation-timeout"
  | "unavailable";

export interface LUFXActivationResult {
  readonly status: LUFXActivationStatus;
  readonly committed: boolean;
  readonly correlationId: string;
  readonly pathname?: string;
  readonly appId?: string;
}

interface RouteOperationHandle {
  readonly correlationId: string;
  readonly result: Promise<any>;
  cancel(reason?: string): void;
}

interface ActivationResolverOptions {
  readonly runtimeId: string;
  readonly indexes: LuminaIndexService;
  readonly eligibility: LuminaEligibilityRegistry;
  readonly policy: LUFXHostPolicyPortLike;
  readonly apps: { getApp(appId: string): { readonly bundleIdentifier: string } | null };
  readonly routes: {
    getAppForRoute(pathname: string): { readonly bundleIdentifier: string } | null;
    openRoute(pathname: string, options?: Record<string, unknown>): RouteOperationHandle;
  };
  readonly presentationSettlements: {
    get(id: string): { readonly result: Promise<{ readonly status: string }>; cancel(reason?: string): void } | null;
  };
  readonly randomUUID: () => string;
}

interface ResolverRegistration {
  readonly ownerAppId: string;
  readonly domain: string;
  readonly destinationAppId: string;
  readonly routeName: string;
  readonly resolve: LUFXTrustedActivationResolver;
}

function resolverKey(ownerAppId: string, domain: string): string {
  return `${normalizeBundleIdentifier(ownerAppId)}\u0000${domain}`;
}

function linkSignals(base: AbortSignal, external?: AbortSignal): { signal: AbortSignal; dispose(): void } {
  if (!external) return { signal: base, dispose() {} };
  const controller = new AbortController();
  const forwardBase = () => controller.abort(base.reason);
  const forwardExternal = () => controller.abort(external.reason);
  base.addEventListener("abort", forwardBase, { once: true });
  external.addEventListener("abort", forwardExternal, { once: true });
  if (base.aborted) forwardBase(); else if (external.aborted) forwardExternal();
  return {
    signal: controller.signal,
    dispose() {
      base.removeEventListener("abort", forwardBase);
      external.removeEventListener("abort", forwardExternal);
    },
  };
}

function awaitWithAbort<T>(value: T | PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(value).then(
      (result) => { cleanup(); resolve(result); },
      (error) => { cleanup(); reject(error); },
    );
    if (signal.aborted) onAbort();
  });
}

export class LUFXActivationResolver {
  readonly #options: ActivationResolverOptions;
  readonly #registrations = new Map<string, ResolverRegistration>();
  readonly #lifetime = new AbortController();

  constructor(options: ActivationResolverOptions) {
    this.#options = options;
  }

  register(registration: ResolverRegistration): () => void {
    const key = resolverKey(registration.ownerAppId, registration.domain);
    if (this.#registrations.has(key)) throw new TypeError(`Lumina activation resolver ${registration.ownerAppId}/${registration.domain} is already registered.`);
    const frozen = Object.freeze({ ...registration });
    this.#registrations.set(key, frozen);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      if (this.#registrations.get(key) === frozen) this.#registrations.delete(key);
    };
  }

  async activate(reference: LUFXActivationReference, options: { readonly signal?: AbortSignal } = {}): Promise<LUFXActivationResult> {
    const correlationId = this.#options.randomUUID();
    const linked = linkSignals(this.#lifetime.signal, options.signal);
    const revocation = new AbortController();
    const signal = AbortSignal.any([linked.signal, revocation.signal]);
    let routeHandle: RouteOperationHandle | null = null;
    let presentation: { readonly result: Promise<{ readonly status: string }>; cancel(reason?: string): void } | null = null;
    let invalidated = false;
    const unsubscribe = this.#options.eligibility.subscribe((generation) => {
      if (generation === reference.policyGeneration) return;
      invalidated = true;
      revocation.abort(new DOMException("Lumina activation eligibility changed.", "AbortError"));
      routeHandle?.cancel("lumina-eligibility-changed");
      presentation?.cancel("lumina-eligibility-changed");
    });
    const stale = (): LUFXActivationResult => Object.freeze({ status: "stale", committed: false, correlationId });
    const currentSubject = () => this.#options.policy.currentFingerprint() === reference.subjectFingerprint;
    const generationCurrent = () => !invalidated && this.#options.eligibility.generation === reference.policyGeneration;
    const checkCurrent = (item: LUFXSearchableItem) => generationCurrent() && currentSubject() && item.revision === reference.revision && this.#options.eligibility.bindingFor(reference.ownerAppId, item) !== null;
    try {
      signal.throwIfAborted();
      if (reference.runtimeId !== this.#options.runtimeId || !generationCurrent() || !currentSubject()) return stale();
      const registration = this.#registrations.get(resolverKey(reference.ownerAppId, reference.domain));
      if (!registration) return Object.freeze({ status: "unavailable", committed: false, correlationId });
      const index = this.#options.indexes.createIndex(reference.ownerAppId, signal);
      let item: LUFXSearchableItem | undefined;
      try {
        const snapshot = await awaitWithAbort(index.snapshot({ signal }), signal);
        item = snapshot.items.find((candidate) => candidate.id === reference.itemId && candidate.domain === reference.domain);
      } finally {
        index.dispose();
      }
      if (!item || item.revision !== reference.revision) return stale();
      const binding = this.#options.eligibility.bindingFor(reference.ownerAppId, item);
      if (!binding || !checkCurrent(item)) return stale();
      if (binding.destinationAppId !== registration.destinationAppId || item.activation.routeName !== registration.routeName) return Object.freeze({ status: "unavailable", committed: false, correlationId });
      if (!this.#options.apps.getApp(binding.destinationAppId)) return Object.freeze({ status: "unavailable", committed: false, correlationId });
      if (!this.#options.policy.allows("lumina.activate", { ownerAppId: reference.ownerAppId, destinationAppId: binding.destinationAppId })) {
        return Object.freeze({ status: "denied", committed: false, correlationId });
      }
      const resolved = await awaitWithAbort(registration.resolve({
        ownerAppId: reference.ownerAppId,
        destinationAppId: binding.destinationAppId,
        item,
        parameters: item.activation.parameters,
        signal,
      }), signal);
      signal.throwIfAborted();
      if (!checkCurrent(item)) return stale();
      if (!resolved || typeof resolved.pathname !== "string" || resolved.pathname.length === 0) return Object.freeze({ status: "unavailable", committed: false, correlationId });
      if (normalizeBundleIdentifier(this.#options.routes.getAppForRoute(resolved.pathname)?.bundleIdentifier) !== normalizeBundleIdentifier(binding.destinationAppId)) {
        return Object.freeze({ status: "unavailable", committed: false, correlationId, pathname: resolved.pathname });
      }
      routeHandle = this.#options.routes.openRoute(resolved.pathname, {
        source: "lumina",
        signal,
        correlationId,
        context: resolved.context,
        hostBeforeCommit: async () => {
          signal.throwIfAborted();
          if (!checkCurrent(item!)) throw new DOMException("Lumina activation became stale before route commit.", "AbortError");
          if (!this.#options.policy.allows("lumina.activate", { ownerAppId: reference.ownerAppId, destinationAppId: binding.destinationAppId })) {
            throw new DOMException("Lumina activation policy was revoked before route commit.", "SecurityError");
          }
        },
      });
      const routeResult = await routeHandle.result;
      const resultCorrelationId = routeHandle.correlationId;
      if (!generationCurrent() || !currentSubject()) return Object.freeze({ status: "stale", committed: routeResult?.committed === true, correlationId: resultCorrelationId, pathname: resolved.pathname, appId: binding.destinationAppId });
      if (routeResult?.status === "cancelled") return Object.freeze({ status: "cancelled", committed: false, correlationId: resultCorrelationId, pathname: resolved.pathname, appId: binding.destinationAppId });
      if (routeResult?.status !== "completed" || routeResult.committed !== true) {
        const code = routeResult?.error?.code;
        const status: LUFXActivationStatus = code === "route-denied" || code === "route-unauthorised" ? "denied" : "route-error";
        return Object.freeze({ status, committed: false, correlationId: resultCorrelationId, pathname: resolved.pathname, appId: binding.destinationAppId });
      }
      if (routeResult.postCommit === "failed") {
        return Object.freeze({ status: "route-error", committed: true, correlationId: resultCorrelationId, pathname: resolved.pathname, appId: binding.destinationAppId });
      }
      if (!checkCurrent(item) || !this.#options.policy.allows("lumina.activate", { ownerAppId: reference.ownerAppId, destinationAppId: binding.destinationAppId })) {
        const id = routeResult.value?.presentationSettlementId;
        if (typeof id === "string") this.#options.presentationSettlements.get(id)?.cancel("lumina-activation-revoked");
        return Object.freeze({ status: "stale", committed: true, correlationId: resultCorrelationId, pathname: resolved.pathname, appId: binding.destinationAppId });
      }
      const presentationId = routeResult.value?.presentationSettlementId;
      if (typeof presentationId === "string") {
        presentation = this.#options.presentationSettlements.get(presentationId);
        if (presentation) {
          if (!generationCurrent()) presentation.cancel("lumina-eligibility-changed");
          const settlement = await presentation.result;
          if (settlement.status === "timed-out") return Object.freeze({ status: "presentation-timeout", committed: true, correlationId: resultCorrelationId, pathname: resolved.pathname, appId: binding.destinationAppId });
          if (settlement.status === "cancelled") {
            return Object.freeze({ status: generationCurrent() ? "cancelled" : "stale", committed: true, correlationId: resultCorrelationId, pathname: resolved.pathname, appId: binding.destinationAppId });
          }
        }
      }
      if (!checkCurrent(item) || !this.#options.policy.allows("lumina.activate", { ownerAppId: reference.ownerAppId, destinationAppId: binding.destinationAppId })) {
        return Object.freeze({ status: "stale", committed: true, correlationId: resultCorrelationId, pathname: resolved.pathname, appId: binding.destinationAppId });
      }
      return Object.freeze({ status: "activated", committed: true, correlationId: resultCorrelationId, pathname: resolved.pathname, appId: binding.destinationAppId });
    } catch (error) {
      if (!generationCurrent() || !currentSubject()) return stale();
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return Object.freeze({ status: "cancelled", committed: false, correlationId });
      }
      if (error instanceof DOMException && error.name === "SecurityError") return Object.freeze({ status: "denied", committed: false, correlationId });
      return Object.freeze({ status: "route-error", committed: false, correlationId });
    } finally {
      unsubscribe();
      linked.dispose();
    }
  }

  dispose(): void {
    if (!this.#lifetime.signal.aborted) this.#lifetime.abort(new DOMException("Lumina activation resolver disposed.", "AbortError"));
    this.#registrations.clear();
  }
}
