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

import type { LifecycleRequestOptions } from "../Lifecycle/lifecycleTypes";

export type SynCloudOSStateName =
  | "booting"
  | "active.webspring"
  | "active.application"
  | "active.application.loading"
  | "active.application.ready"
  | "active.application.active"
  | "active.application.failed"
  | "active.error"
  | "locked"
  | "locked.loginWindow"
  | "offline";

export interface SynCloudOSStateTransitionOptions {
  /** @internal Bind route completion to the exact accepted launch request. */
  onLaunchRequest?: (requestId: string) => void;
  /** @internal Parent operation authority forwarded to the canonical lifecycle. */
  lifecycle?: LifecycleRequestOptions;
  appId?: string;
  pathname?: string;
  error?: unknown;
  reason?: string;
  source?: string;
  closeWindows?: boolean;
  focus?: boolean;
  syncRoute?: boolean;
  context?: Record<string, unknown>;
}

export interface SynCloudOSStateDefinition {
  name: SynCloudOSStateName;
  parent?: SynCloudOSStateName;
  description: string;
  allowedFrom?: SynCloudOSStateName[];
}

export interface SynCloudOSStateTransitionExplanation {
  from: SynCloudOSStateName;
  to: SynCloudOSStateName;
  allowed: boolean;
  reason: string;
  blockers: string[];
  fromDefinition: SynCloudOSStateDefinition | null;
  toDefinition: SynCloudOSStateDefinition | null;
}

export interface SynCloudOSStateTransitionRecord {
  id: string;
  from: SynCloudOSStateName;
  to: SynCloudOSStateName;
  at: number;
  source?: string;
  appId?: string;
  pathname?: string;
  reason?: string;
  ok: boolean;
}

export interface SynCloudOSStatechartSnapshot {
  currentState: SynCloudOSStateName;
  previousState: SynCloudOSStateName | null;
  history: SynCloudOSStateTransitionRecord[];
  lastTransitionAt: number | null;
  isTransitioning: boolean;
}

export interface SynCloudOSStatechartInspection extends SynCloudOSStatechartSnapshot {
  inspectedState: SynCloudOSStateName;
  activeDefinition: SynCloudOSStateDefinition | null;
  allowedTransitions: SynCloudOSStateTransitionExplanation[];
  definitions: Record<SynCloudOSStateName, SynCloudOSStateDefinition>;
}
