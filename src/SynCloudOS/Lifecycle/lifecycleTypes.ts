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

import type { AppLifecycleEvent, AppManagerRuntimeRecord, SynCloudOSAppLifecycleState } from "../AppManager/appManagerTypes";
import type { SynCloudOSRuntimeEvent, SynCloudOSRuntimeEventListener, SynCloudOSRuntimeEventType } from "../EventBus/eventTypes";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { ApplicationSessionCloseLease } from "../Documents/documentTypes";
import type { ApplicationClosePreparationToken } from "../Windows/windowTypes";

export type SynCloudOSLifecycleStage =
  | "install"
  | "register"
  | "preload"
  | "launch"
  | "activate"
  | "deactivate"
  | "suspend"
  | "resume"
  | "routeChange"
  | "saveRequest"
  | "memoryWarning"
  | "close"
  | "uninstall"
  | "errorRecovery";

export interface SynCloudOSLifecycleHookContext<TPayload = unknown> {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly appId: string;
  readonly packageName: string;
  readonly operationId: string;
  readonly correlationId: string;
  readonly signal: AbortSignal;
  readonly stage: SynCloudOSLifecycleStage;
  readonly phase: "will" | "did";
  readonly reason: string;
  readonly payload: TPayload;
  readonly error?: unknown;
}

export type SynCloudOSLifecycleHook<TPayload = unknown> = (
  context: SynCloudOSLifecycleHookContext<TPayload>
) => void | Promise<void>;

export interface SynCloudOSLifecycleStageHooks<TPayload = unknown> {
  readonly will?: SynCloudOSLifecycleHook<TPayload>;
  readonly did?: SynCloudOSLifecycleHook<TPayload>;
}

export type SynCloudOSLifecycleHookMap = Partial<
  Record<SynCloudOSLifecycleStage, SynCloudOSLifecycleStageHooks>
>;

export interface LifecycleRequestOptions {
  readonly reason?: string;
  readonly source?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly correlationId?: string;
  readonly payload?: unknown;
  /** Runtime-internal authority check executed again at the commit boundary. */
  readonly commitGuard?: () => void;
  /** @internal Establish the enclosing operation's commit before publishing lifecycle state. */
  readonly onCommit?: () => void;
  /** @internal Full pathname validated by RouteManager for this activation. */
  readonly routePath?: string;
  /** @internal Prepared host transaction. This is not projected by AppSDK. */
  readonly closeTransaction?: Readonly<{
    authority: ApplicationSessionCloseLease;
    preparation: ApplicationClosePreparationToken;
  }>;
}

export interface LifecycleTransitionResult {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly appId: string;
  readonly from: SynCloudOSAppLifecycleState;
  readonly to: SynCloudOSAppLifecycleState;
  readonly stage: SynCloudOSLifecycleStage;
  readonly reason: string;
}

export type AppLaunchResult = LifecycleTransitionResult & { readonly stage: "launch"; readonly to: "active" };
export type AppActivationResult = LifecycleTransitionResult & { readonly stage: "activate"; readonly to: "active" };
export type AppSuspensionResult = LifecycleTransitionResult & { readonly stage: "suspend"; readonly to: "suspended" };
export type AppCloseResult = LifecycleTransitionResult & { readonly stage: "close"; readonly to: "closed" };

export interface LifecycleDispatchResult {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly appId: string;
  readonly stage: SynCloudOSLifecycleStage;
  readonly payload: unknown;
  readonly reason: string;
}

export interface RuntimeLifecycleOperationRecord {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly appId: string;
  readonly packageName: string;
  readonly operationId: string;
  readonly correlationId: string;
  readonly stage: SynCloudOSLifecycleStage;
  readonly phase: "will" | "did" | "commit";
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly outcome: "completed" | "cancelled" | "failed" | "skipped";
  readonly reason: string;
  readonly error?: string;
}

export type SynCloudOSLifecycleEventName =
  | SynCloudOSRuntimeEventType
  | "boot"
  | "ready"
  | "app.register"
  | "app.launch"
  | "route.open"
  | "statechart.transition"
  | "policy.decision"
  | "error.capture"
  | string;

export type SynCloudOSLifecycleListener = SynCloudOSRuntimeEventListener;

export interface SynCloudOSLifecycleEmission {
  name: SynCloudOSLifecycleEventName;
  event: SynCloudOSRuntimeEvent;
}

export interface SynCloudOSLifecycleTransitionOptions {
  reason?: string;
  source?: string;
  force?: boolean;
}
export type SynCloudOSLifecycleAccessResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly reason: string;
    };

export interface SynCloudOSLifecycleControl {
  validateAccess(appId: string, stage: "launch" | "activate"): SynCloudOSLifecycleAccessResult;
  cancelActiveOperations(reason: string): void;
}


export interface SynCloudOSLifecycleTransitionResult {
  ok: boolean;
  event?: AppLifecycleEvent;
  error?: string;
}

export interface SynCloudOSLifecycleSubscribeOptions {
  appId?: string;
  replay?: boolean;
}

export type SynCloudOSLifecycleTransitionListener = (
  event: AppLifecycleEvent,
  runtimeEvent?: SynCloudOSRuntimeEvent
) => void;

export interface SynCloudOSLifecycleNamespace {
  states: SynCloudOSAppLifecycleState[];
  on(name: SynCloudOSLifecycleEventName, listener: SynCloudOSLifecycleListener): () => void;
  once(name: SynCloudOSLifecycleEventName, listener: SynCloudOSLifecycleListener): () => void;
  off(name: SynCloudOSLifecycleEventName, listener: SynCloudOSLifecycleListener): void;
  emit(name: SynCloudOSLifecycleEventName, payload?: unknown, label?: string): SynCloudOSRuntimeEvent;
  onBoot(listener: SynCloudOSLifecycleListener): () => void;
  onReady(listener: SynCloudOSLifecycleListener): () => void;
  onAppRegister(listener: SynCloudOSLifecycleListener): () => void;
  onAppLaunch(listener: SynCloudOSLifecycleListener): () => void;
  onRouteOpen(listener: SynCloudOSLifecycleListener): () => void;
  onStateTransition(listener: SynCloudOSLifecycleListener): () => void;
  onPolicyDecision(listener: SynCloudOSLifecycleListener): () => void;
  onError(listener: SynCloudOSLifecycleListener): () => void;
  canTransition(from: SynCloudOSAppLifecycleState, to: SynCloudOSAppLifecycleState): boolean;
  getState(appId: string): SynCloudOSAppLifecycleState;
  getRecord(appId: string): AppManagerRuntimeRecord | null;
  getEvents(appId?: string, limit?: number): AppLifecycleEvent[];
  transition(
    appId: string,
    to: SynCloudOSAppLifecycleState,
    options?: SynCloudOSLifecycleTransitionOptions
  ): SynCloudOSLifecycleTransitionResult;
  onTransition(listener: SynCloudOSLifecycleTransitionListener, options?: SynCloudOSLifecycleSubscribeOptions): () => void;
}
