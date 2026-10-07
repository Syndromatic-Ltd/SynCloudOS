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

import type {
  OperationCoordinator,
  OperationHandle,
  OperationResult,
} from "../Operations/operationTypes";
import { createRouteCommitPlan, type RouteCommitPlan, type RouteHistoryMode } from "./RouteCommitPlan";
import type { RouteServiceScope } from "./RouteServiceScope";
import type {
  SynCloudOSRouteInfo,
  SynWareNamedRouteTarget,
  SynWareRouteDefinition,
  SynWareRouteGraph,
  SynWareRouteGuardResult,
  SynWareRouteLoadContext,
} from "./appRouteTypes";

class RouteBlockedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "RouteBlockedError";
    this.reason = reason;
  }
}

class RouteRedirectError extends Error {
  readonly target: Readonly<{ name: string; params?: Readonly<Record<string, string | readonly string[]>> }>;
  constructor(target: Readonly<{ name: string; params?: Readonly<Record<string, string | readonly string[]>> }>) {
    super(`Route guard redirected to ${target.name}.`);
    this.name = "RouteRedirectError";
    this.target = target;
  }
}

export type SynCloudOSRouteTransitionResult =
  | Readonly<{
      outcome: "settled";
      operationId: string;
      correlationId: string;
      committed: true;
      route: SynCloudOSRouteInfo;
      postCommit: "completed";
      routeRevision: number;
      sessionId: string;
      authorizationGeneration: number;
    }>
  | Readonly<{
      outcome: "route-error";
      operationId: string;
      correlationId: string;
      committed: true;
      route: SynCloudOSRouteInfo;
      postCommit: "failed";
      code: string;
      reason: string;
      authorizationGeneration: number;
    }>
  | Readonly<{
      outcome: "invalid-query";
      operationId: string;
      correlationId: string;
      committed: false;
      route: SynCloudOSRouteInfo;
      code: "route-invalid-query";
      reason: string;
      authorizationGeneration: number;
    }>
  | Readonly<{
      outcome: "blocked";
      operationId: string;
      correlationId: string;
      committed: false;
      route: SynCloudOSRouteInfo;
      reason: string;
      authorizationGeneration: number;
    }>
  | Readonly<{
      outcome: "denied";
      operationId: string;
      correlationId: string;
      committed: false;
      route: SynCloudOSRouteInfo;
      code: "route-denied" | "route-unauthorised";
      reason: string;
      authorizationGeneration: number;
    }>
  | Readonly<{
      outcome: "redirected";
      operationId: string;
      correlationId: string;
      committed: false;
      route: SynCloudOSRouteInfo;
      successorId: string;
      authorizationGeneration: number;
    }>
  | Readonly<{
      outcome: "cancelled" | "superseded";
      operationId: string;
      correlationId: string;
      committed: false;
      reason: string;
      authorizationGeneration: number;
    }>
  | Readonly<{
      outcome: "cancelled";
      operationId: string;
      correlationId: string;
      committed: true;
      route: SynCloudOSRouteInfo;
      postCommit: "cancelled";
      reason: string;
      authorizationGeneration: number;
    }>
  | Readonly<{
      outcome: "presentation-timeout";
      operationId: string;
      correlationId: string;
      committed: true;
      route: SynCloudOSRouteInfo;
      postCommit: "failed";
      pendingRoles: readonly string[];
      reason: string;
      authorizationGeneration: number;
    }>
  | Readonly<{
      outcome: "not-found" | "failed";
      operationId: string;
      correlationId: string;
      committed: false;
      code: string;
      reason: string;
      authorizationGeneration: number;
    }>;

export interface SynCloudOSRouteTransitionHandle {
  readonly operationId: string;
  readonly correlationId: string;
  readonly signal: AbortSignal;
  readonly result: Promise<SynCloudOSRouteTransitionResult>;
  cancel(reason?: string): void;
  retry(): SynCloudOSRouteTransitionHandle;
  replace(target: Readonly<{ name: string; params?: Readonly<Record<string, string | readonly string[]>> }>): SynCloudOSRouteTransitionHandle;
}

export interface RouteTransitionCommitReceipt {
  readonly routeRevision: number;
  readonly sessionId: string;
}

type RouteTransitionOperationValue = Readonly<{
  route: SynCloudOSRouteInfo;
  receipt: RouteTransitionCommitReceipt;
}>;

export interface RouteTransitionControllerOptions {
  readonly runtimeId: string;
  readonly graph: SynWareRouteGraph;
  readonly operations: OperationCoordinator;
  getCurrentRoute(): SynCloudOSRouteInfo | null;
  getAuthorizationGeneration(): number;
  isRuntimeLive(): boolean;
  createPreparationScope(context: Readonly<{
    signal: AbortSignal;
    authorizationGeneration: number;
    route: SynCloudOSRouteInfo;
  }>): RouteServiceScope;
  resolveRouteDefinition?(
    definition: SynWareRouteDefinition,
    signal: AbortSignal,
  ): SynWareRouteDefinition | Promise<SynWareRouteDefinition>;
  commit(request: Readonly<{
    from: SynCloudOSRouteInfo | null;
    to: SynCloudOSRouteInfo;
    plan: RouteCommitPlan;
    signal: AbortSignal;
    operationId: string;
    correlationId: string;
    authorizationGeneration: number;
  }>): RouteTransitionCommitReceipt | Promise<RouteTransitionCommitReceipt>;
  afterCommit?(request: Readonly<{
    from: SynCloudOSRouteInfo | null;
    to: SynCloudOSRouteInfo;
    receipt: RouteTransitionCommitReceipt;
    signal: AbortSignal;
    operationId: string;
    correlationId: string;
    authorizationGeneration: number;
  }>): void | Promise<void>;
  readonly maxRedirectHops?: number;
}

function branchDefinitions(graph: SynWareRouteGraph, route: SynCloudOSRouteInfo): SynWareRouteDefinition[] {
  return route.branch.map((name) => {
    const definition = graph.getRoute(name);
    if (!definition) throw new Error(`Route definition ${name} is unavailable.`);
    return definition;
  });
}

function commonBranchLength(left: SynCloudOSRouteInfo | null, right: SynCloudOSRouteInfo): number {
  if (!left) return 0;
  const maximum = Math.min(left.branch.length, right.branch.length);
  let index = 0;
  while (index < maximum && left.branch[index] === right.branch[index]) index += 1;
  return index;
}

async function runGuard(
  guard: SynWareRouteDefinition["beforeEnter"] | SynWareRouteDefinition["beforeLeave"],
  context: SynWareRouteLoadContext,
): Promise<void> {
  if (!guard) return;
  const decision: SynWareRouteGuardResult = await guard(context);
  if (decision.outcome === "allow") return;
  if (decision.outcome === "block") throw new RouteBlockedError(decision.reason ?? "route-guard-blocked");
  throw new RouteRedirectError(decision.target);
}

function errorCause(result: Extract<OperationResult<unknown>, { status: "failed" | "rolledBack" }>): unknown {
  return result.error.cause;
}

export function createRouteTransitionController(options: RouteTransitionControllerOptions) {
  const maxRedirectHops = Math.max(1, options.maxRedirectHops ?? 8);

  const start = (
    target: Readonly<{ name: string; params?: Readonly<Record<string, string | readonly string[]>> }>,
    config: Readonly<{
      historyMode: RouteHistoryMode;
      correlationId?: string;
      redirectDepth: number;
      visited: ReadonlySet<string>;
    }>,
  ): SynCloudOSRouteTransitionHandle => {
    const authorizationGeneration = options.getAuthorizationGeneration();
    let targetPath: string;
    let to: SynCloudOSRouteInfo | null = null;
    try {
      targetPath = options.graph.urlFor(target as never);
      const recognized = options.graph.recognize(targetPath);
      if (recognized.kind === "match") to = recognized;
    } catch {
      targetPath = "";
    }
    const from = options.getCurrentRoute();
    let receipt: RouteTransitionCommitReceipt | null = null;

    const raw: OperationHandle<RouteTransitionOperationValue> = options.operations.run<
      Readonly<{
        target: Readonly<{ name: string; params?: Readonly<Record<string, string | readonly string[]>> }>;
        historyMode: RouteHistoryMode;
      }>,
      RouteTransitionOperationValue
    >({
      kind: "route.transition",
      input: Object.freeze({ target, historyMode: config.historyMode }),
      supersedeKey: "route.transition",
      ...(config.correlationId ? { correlationId: config.correlationId } : {}),
      validate: () => {
        if (!options.isRuntimeLive()) {
          return { ok: false, code: "route-owner-revoked", reason: "route-owner-revoked" };
        }
        if (!to) return { ok: false, code: "route-not-found", reason: "route-not-found" };
        return { ok: true };
      },
      will: [async (context) => {
        if (!to) return;
        const preparationController = new AbortController();
        const guardSignal = AbortSignal.any([context.signal, preparationController.signal]);
        const preparationScope = options.createPreparationScope({
          signal: guardSignal,
          authorizationGeneration,
          route: to,
        });
        const common = commonBranchLength(from, to);
        const leaving = from ? branchDefinitions(options.graph, from).slice(common).reverse() : [];
        const entering = branchDefinitions(options.graph, to).slice(common);
        const leaveContext: SynWareRouteLoadContext = Object.freeze({
          signal: guardSignal,
          params: from?.params ?? Object.freeze({}),
          query: from?.query ?? Object.freeze({}),
          parentData: undefined,
          route: from ?? to,
          services: preparationScope,
        });
        const enterContext: SynWareRouteLoadContext = Object.freeze({
          signal: guardSignal,
          params: to.params,
          query: to.query,
          parentData: undefined,
          route: to,
          services: preparationScope,
        });
        try {
          for (const staticDefinition of leaving) {
            context.throwIfCancelled();
            const definition = options.resolveRouteDefinition
              ? await options.resolveRouteDefinition(staticDefinition, guardSignal)
              : staticDefinition;
            context.throwIfCancelled();
            await runGuard(definition.beforeLeave, leaveContext);
          }
          for (const staticDefinition of entering) {
            context.throwIfCancelled();
            const definition = options.resolveRouteDefinition
              ? await options.resolveRouteDefinition(staticDefinition, guardSignal)
              : staticDefinition;
            context.throwIfCancelled();
            await runGuard(definition.beforeEnter, enterContext);
          }
        } finally {
          preparationController.abort("guard-complete");
        }
      }],
      commit: async (context) => {
        if (!to) throw new Error("route-not-found");
        context.throwIfCancelled();
        const plan = createRouteCommitPlan(to, config.historyMode);
        receipt = await options.commit({
          from,
          to,
          plan,
          signal: context.signal,
          operationId: context.operationId,
          correlationId: context.correlationId,
          authorizationGeneration,
        });
        const value = Object.freeze({ route: to, receipt });
        context.markCommitted(value);
        return value;
      },
      effects: options.afterCommit ? [{
        onError: "stop" as const,
        run: async (context, value) => {
          await options.afterCommit!({
            from,
            to: value.route,
            receipt: value.receipt,
            signal: context.signal,
            operationId: context.operationId,
            correlationId: context.correlationId,
            authorizationGeneration,
          });
        },
      }] : [],
    });

    if (!options.isRuntimeLive()) raw.cancel("route-owner-revoked");

    const mapResult = async (): Promise<SynCloudOSRouteTransitionResult> => {
      const result = await raw.result;
      if (result.status === "cancelled") {
        return Object.freeze({
          outcome: result.reason === "superseded" ? "superseded" as const : "cancelled" as const,
          operationId: raw.operationId,
          correlationId: raw.correlationId,
          committed: false,
          reason: result.reason,
          authorizationGeneration,
        });
      }
      if (result.status === "failed" || result.status === "rolledBack") {
        const cause = errorCause(result);
        if (cause instanceof RouteBlockedError && to) {
          return Object.freeze({
            outcome: "blocked" as const,
            operationId: raw.operationId,
            correlationId: raw.correlationId,
            committed: false as const,
            route: to,
            reason: cause.reason,
            authorizationGeneration,
          });
        }
        if (cause instanceof RouteRedirectError && to) {
          const redirectName = cause.target.name;
          if (
            config.redirectDepth >= maxRedirectHops
            || config.visited.has(redirectName)
          ) {
            return Object.freeze({
              outcome: "failed" as const,
              operationId: raw.operationId,
              correlationId: raw.correlationId,
              committed: false as const,
              code: "route-redirect-cycle",
              reason: "Route redirect cycle or hop limit reached.",
              authorizationGeneration,
            });
          }
          const successor = start(cause.target, {
            historyMode: "replace",
            correlationId: raw.correlationId,
            redirectDepth: config.redirectDepth + 1,
            visited: new Set([...config.visited, redirectName]),
          });
          return Object.freeze({
            outcome: "redirected" as const,
            operationId: raw.operationId,
            correlationId: raw.correlationId,
            committed: false as const,
            route: to,
            successorId: successor.operationId,
            authorizationGeneration,
          });
        }
        return Object.freeze({
          outcome: result.error.code === "route-not-found" ? "not-found" as const : "failed" as const,
          operationId: raw.operationId,
          correlationId: raw.correlationId,
          committed: false as const,
          code: result.error.code,
          reason: result.error.message,
          authorizationGeneration,
        });
      }
      if (result.postCommit === "cancelled") {
        return Object.freeze({
          outcome: "cancelled" as const,
          operationId: raw.operationId,
          correlationId: raw.correlationId,
          committed: true,
          route: result.value.route,
          postCommit: "cancelled" as const,
          reason: "post-commit-cancelled",
          authorizationGeneration,
        });
      }
      if (result.postCommit === "failed") {
        return Object.freeze({
          outcome: "route-error" as const,
          operationId: raw.operationId,
          correlationId: raw.correlationId,
          committed: true as const,
          route: result.value.route,
          postCommit: "failed" as const,
          code: result.issues.at(-1)?.error?.code ?? "route-post-commit-failed",
          reason: result.issues.at(-1)?.message ?? "Route post-commit work failed.",
          authorizationGeneration,
        });
      }
      return Object.freeze({
        outcome: "settled" as const,
        operationId: raw.operationId,
        correlationId: raw.correlationId,
        committed: true as const,
        route: result.value.route,
        postCommit: "completed" as const,
        routeRevision: result.value.receipt.routeRevision,
        sessionId: result.value.receipt.sessionId,
        authorizationGeneration,
      });
    };

    const handle: SynCloudOSRouteTransitionHandle = Object.freeze({
      operationId: raw.operationId,
      correlationId: raw.correlationId,
      signal: raw.signal,
      result: mapResult(),
      cancel: raw.cancel,
      retry() {
        return start(target, {
          historyMode: config.historyMode,
          correlationId: raw.correlationId,
          redirectDepth: 0,
          visited: new Set([target.name]),
        });
      },
      replace(nextTarget: Readonly<{ name: string; params?: Readonly<Record<string, string | readonly string[]>> }>) {
        return start(nextTarget, {
          historyMode: "replace",
          correlationId: raw.correlationId,
          redirectDepth: 0,
          visited: new Set([nextTarget.name]),
        });
      },
    });
    return handle;
  };

  return Object.freeze({
    transitionTo(target: Readonly<{ name: string; params?: Readonly<Record<string, string | readonly string[]>> }>) {
      return start(target, {
        historyMode: "push",
        redirectDepth: 0,
        visited: new Set([target.name]),
      });
    },
    replaceWith(target: Readonly<{ name: string; params?: Readonly<Record<string, string | readonly string[]>> }>) {
      return start(target, {
        historyMode: "replace",
        redirectDepth: 0,
        visited: new Set([target.name]),
      });
    },
  });
}
