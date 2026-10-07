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

import { choreographyTimings } from "../../FX/AnimationFX/choreographyTimings";
import {
  WEBSPRING_RETURN_ROLES,
  type WebspringReturnRole,
} from "../WebspringState/webspringPresentation";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

interface WebspringStateDependency {
  beginReturn(appId: string | null, returnTransitionId?: string): string;
  finishReturn(returnTransitionId?: string | null): void;
}

export function createWebspringChoreography(runtime: SynCloudOSRuntime, dependencies: { webspringState: WebspringStateDependency }) {
const EventBus = runtime.events;
const RuntimeStore = runtime.store;
const WebspringState = dependencies.webspringState;

const returnFallbackTimers = new Map<string, unknown>();

interface ReturnSettlement {
  required: Set<WebspringReturnRole>;
  completed: Set<WebspringReturnRole>;
}

const defaultRequiredReturnRoles: readonly WebspringReturnRole[] = WEBSPRING_RETURN_ROLES;
const returnSettlements = new Map<string, ReturnSettlement>();

function clearReturnFallback(returnTransitionId: string | null | undefined) {
  if (!returnTransitionId) return;
  const timer = returnFallbackTimers.get(returnTransitionId);
  if (timer === undefined) return;
  runtime.environment.clearTimeout(timer);
  returnFallbackTimers.delete(returnTransitionId);
}

function getReturnSettlementSnapshot(returnTransitionId: string) {
  const settlement = returnSettlements.get(returnTransitionId);
  const requiredRoles = Array.from(settlement?.required ?? defaultRequiredReturnRoles);
  const completedRoles = requiredRoles.filter((role) => settlement?.completed.has(role));
  return {
    requiredRoles,
    completedRoles,
    outstandingRoles: requiredRoles.filter((role) => !settlement?.completed.has(role))
  };
}

function completeReturn(returnTransitionId: string, completionSource: "animation" | "fallback" | "manual") {
  const before = RuntimeStore.getSnapshot().webspring;
  if (before.returnTransitionId !== returnTransitionId || before.launchPhase !== "returning") return false;

  const roleSnapshot = getReturnSettlementSnapshot(returnTransitionId);
  clearReturnFallback(returnTransitionId);
  returnSettlements.delete(returnTransitionId);
  WebspringState.finishReturn(returnTransitionId);
  EventBus.publish(
    "webspring.return.complete",
    {
      returnTransitionId,
      appId: before.returningAppId,
      completionSource,
      ...roleSnapshot
    },
    before.returningAppId ?? "Webspring"
  );
  return true;
}

function completeReturnRole(returnTransitionId: string, role: WebspringReturnRole) {
  const webspring = RuntimeStore.getSnapshot().webspring;
  const settlement = returnSettlements.get(returnTransitionId);
  if (
    webspring.returnTransitionId !== returnTransitionId ||
    webspring.launchPhase !== "returning" ||
    !settlement ||
    !settlement.required.has(role) ||
    settlement.completed.has(role)
  ) {
    return false;
  }

  settlement.completed.add(role);
  if (Array.from(settlement.required).every((requiredRole) => settlement.completed.has(requiredRole))) {
    completeReturn(returnTransitionId, "animation");
  }
  return true;
}

function scheduleReturnFallback(returnTransitionId: string) {
  clearReturnFallback(returnTransitionId);
  const timer = runtime.environment.setTimeout(() => {
    returnFallbackTimers.delete(returnTransitionId);
    completeReturn(returnTransitionId, "fallback");
  }, choreographyTimings.webspringReturnFallbackMs);
  returnFallbackTimers.set(returnTransitionId, timer);
}

function restoreHotReturnFallback() {
  const webspring = RuntimeStore.getSnapshot().webspring;
  if (webspring.launchPhase !== "returning" || !webspring.returnTransitionId) return false;

  if (!returnSettlements.has(webspring.returnTransitionId)) {
    returnSettlements.set(webspring.returnTransitionId, {
      required: new Set(defaultRequiredReturnRoles),
      completed: new Set()
    });
  }
  scheduleReturnFallback(webspring.returnTransitionId);
  EventBus.publish(
    "webspring.return.fallbackRearmed",
    {
      appId: webspring.returningAppId,
      returnTransitionId: webspring.returnTransitionId,
      fallbackMs: choreographyTimings.webspringReturnFallbackMs
    },
    webspring.returningAppId ?? "Webspring"
  );
  return true;
}

const webspringChoreography = {
  runtimeId: runtime.runtimeId,
  beginReturn(
    appId: string | null,
    requiredRoles: readonly WebspringReturnRole[] = defaultRequiredReturnRoles
  ) {
    const previousReturnTransitionId = RuntimeStore.getSnapshot().webspring.returnTransitionId;
    clearReturnFallback(previousReturnTransitionId);
    if (previousReturnTransitionId) returnSettlements.delete(previousReturnTransitionId);

    const returnTransitionId = WebspringState.beginReturn(appId);
    returnSettlements.set(returnTransitionId, {
      required: new Set(requiredRoles),
      completed: new Set()
    });
    scheduleReturnFallback(returnTransitionId);
    EventBus.publish(
      "webspring.return.begin",
      {
        appId,
        returnTransitionId,
        fallbackMs: choreographyTimings.webspringReturnFallbackMs,
        requiredRoles: Array.from(new Set(requiredRoles)),
        completedRoles: [],
        outstandingRoles: Array.from(new Set(requiredRoles))
      },
      appId ?? "Webspring"
    );
    return returnTransitionId;
  },

  completeReturn,
  completeReturnRole,

  getMultiSwitchSettleFallbackMs() {
    return choreographyTimings.multiSwitchSettleFallbackMs;
  },

  restoreHotReturnFallback,
  inspect() {
    return {
      returnFallbackIds: Array.from(returnFallbackTimers.keys()),
      returnSettlements: Array.from(returnSettlements.entries()).map(([returnTransitionId, settlement]) => ({
        returnTransitionId,
        requiredRoles: Array.from(settlement.required),
        completedRoles: Array.from(settlement.completed),
        outstandingRoles: Array.from(settlement.required).filter((role) => !settlement.completed.has(role))
      })),
      timings: choreographyTimings
    };
  },

  dispose() {
    for (const transitionId of returnFallbackTimers.keys()) clearReturnFallback(transitionId);
    returnSettlements.clear();
  }
};

restoreHotReturnFallback();
return webspringChoreography;
}

