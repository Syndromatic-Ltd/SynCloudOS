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

import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type { SynCloudOSAppManifest } from "../AppRegistry/appRegistryTypes";
import type { SynCloudOSAppLifecycleState, AppLifecycleEvent, AppManagerRuntimeRecord } from "../AppManager/appManagerTypes";
import type { CapturedSynCloudOSError } from "../ErrorManager/errorTypes";
import type { SynCloudOSNotification } from "../NotificationCenter/notificationTypes";
import type { SynCloudOSApplicationState } from "../ApplicationState/applicationStateTypes";
import type { SynCloudOSWebspringState } from "../WebspringState/webspringStateTypes";
import type { SynCloudOSResponsiveState } from "../ResponsiveModeManager/responsiveTypes";
import type { SynCloudOSRuntimeEvent, SynCloudOSRuntimeEventType } from "../EventBus/eventTypes";
import type { SynCloudOSServiceDefinition } from "../ServiceRegistry/serviceTypes";
import type { SynCloudOSStatechartSnapshot } from "../Statechart/statechartTypes";
import type { SynCloudOSLoginSessionSnapshot } from "../LoginServices/loginServicesTypes";
import type { SynCloudOSLocaleServicesSnapshot } from "../LocaleServices/localeTypes";
import type { OperationRecord } from "../Operations/operationTypes";
import type { RuntimeLifecycleOperationRecord } from "../Lifecycle/lifecycleTypes";

export type RuntimeTransactionStatus = "pending" | "committed" | "rolledBack";
export type RuntimePostCommitEffectStatus = "pending" | "running" | "completed" | "failed";

export interface RuntimeTransactionEffectRecord {
  id: string;
  label?: string;
  status: RuntimePostCommitEffectStatus;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface RuntimeTransactionRecord {
  id: string;
  label?: string;
  source?: string;
  status: RuntimeTransactionStatus;
  startedAt: number;
  committedAt?: number;
  rolledBackAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
  effectCount: number;
  effects: RuntimeTransactionEffectRecord[];
}

export interface RuntimeTransactionOptions {
  label?: string;
  source?: string;
  captureErrors?: boolean;
  historyLimit?: number;
}

export type RuntimePostCommitEffect = () => void | Promise<void>;

export interface RuntimeTransactionContext {
  readonly id: string;
  readonly label?: string;
  readonly source?: string;
  readonly startedAt: number;
  readonly transaction: RuntimeTransactionRecord;
  getSnapshot(): RuntimeSnapshot;
  mutate(mutator: RuntimeMutator): void;
  afterCommit(effect: RuntimePostCommitEffect, label?: string): string;
  publishAfterCommit(type: SynCloudOSRuntimeEventType | string, payload?: unknown, label?: string): string;
}

export type RuntimeTransactionCallback<T> = (context: RuntimeTransactionContext) => T | Promise<T>;

export interface RuntimeSnapshot {
  runtimeId: string;
  rawApps: Record<string, SynCloudOSAppManifest>;
  appInfo: Record<string, SynCloudOSAppInfo>;
  lifecycle: Record<string, SynCloudOSAppLifecycleState>;
  managers: Record<string, AppManagerRuntimeRecord>;
  lifecycleEvents: AppLifecycleEvent[];
  services: Record<string, SynCloudOSServiceDefinition>;
  statechart: SynCloudOSStatechartSnapshot;
  errors: CapturedSynCloudOSError[];
  notifications: SynCloudOSNotification[];
  application: SynCloudOSApplicationState;
  webspring: SynCloudOSWebspringState;
  responsive: SynCloudOSResponsiveState;
  localeServices: SynCloudOSLocaleServicesSnapshot;
  loginServices: SynCloudOSLoginSessionSnapshot;
  lifecycleOperations: RuntimeLifecycleOperationRecord[];
  booted: boolean;
}

export type RuntimeListener = () => void;
export type RuntimeMutator = (draft: RuntimeSnapshot) => void;

export type RuntimeEvent = SynCloudOSRuntimeEvent;
