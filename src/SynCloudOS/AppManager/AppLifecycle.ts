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

import { canEnterState, defineStateMachine } from "../../Foundation/internal/StateMachine";
import type { AppManagerRuntimeRecord, SynCloudOSAppLifecycleState } from "./appManagerTypes";

export type AppLifecycleMove = "prepare" | "load" | "loaded" | "launch" | "activate" | "suspend" | "close" | "fail" | "disable" | "enable";

/** Every legal move of an application's lifecycle state. Nothing else decides what may follow what. */
export const appLifecycleMachine = defineStateMachine<SynCloudOSAppLifecycleState, AppLifecycleMove>({
  initial: "registered",
  states: {
    registered: { prepare: "idle", load: "loading", disable: "disabled", fail: "failed" },
    idle: { load: "loading", launch: "launching", disable: "disabled", close: "closed" },
    loading: { loaded: "ready", fail: "failed", close: "closed" },
    ready: { launch: "launching", activate: "active", suspend: "suspended", close: "closed" },
    launching: { activate: "active", fail: "failed", close: "closed" },
    active: { suspend: "suspended", close: "closed", fail: "failed" },
    suspended: { launch: "launching", activate: "active", close: "closed" },
    failed: { load: "loading", close: "closed" },
    closed: { prepare: "idle", load: "loading" },
    disabled: { enable: "idle", fail: "failed" },
  },
});

export type AppLifecycleOperation = "launch" | "activate" | "suspend" | "close";

/** The states a lifecycle operation may begin from. An operation spans several moves, so this sits beside the table rather than in it. */
export const appLifecycleOperationStartStates: Readonly<Record<AppLifecycleOperation, readonly SynCloudOSAppLifecycleState[]>> = Object.freeze({
  launch: Object.freeze(["registered", "idle", "ready", "suspended"] as const),
  activate: Object.freeze(["registered", "idle", "ready", "suspended"] as const),
  suspend: Object.freeze(["active"] as const),
  close: Object.freeze(["active", "suspended", "ready", "idle", "failed", "registered"] as const),
});

export function canBeginAppLifecycleOperation(operation: AppLifecycleOperation, state: SynCloudOSAppLifecycleState): boolean {
  return appLifecycleOperationStartStates[operation].includes(state);
}

/** Readiness each state implies. A state left out keeps the readiness the application already had. */
export const appReadinessByLifecycleState: Readonly<Partial<Record<SynCloudOSAppLifecycleState, AppManagerRuntimeRecord["readiness"]>>> = Object.freeze({
  disabled: "cold",
  failed: "failed",
  loading: "loading",
  ready: "ready",
  launching: "ready",
  active: "ready",
  suspended: "ready",
});

export function createAppLifecycleRules() {
  return {
    canTransition(from: SynCloudOSAppLifecycleState, to: SynCloudOSAppLifecycleState) {
      return from === to || canEnterState(appLifecycleMachine.definition, from, to);
    }
  };
}
