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

import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export type UserNotificationPermission = "granted" | "denied" | "default" | "unsupported";
export type UserNotificationState = "pending" | "delivered" | "suppressed" | "denied" | "failed" | "acknowledged" | "dismissed";

export interface UserNotificationActionDeclaration {
  readonly id: string;
  readonly title: string;
  readonly dismissOnSuccess?: boolean;
}

export interface UserNotificationRequest {
  readonly idempotencyKey: string;
  readonly title: string;
  readonly body: string;
  readonly actions?: readonly UserNotificationActionDeclaration[];
  readonly delivery: "in-app" | "browser-if-authorised";
  readonly expiresAt?: number;
  readonly sensitive?: boolean;
  readonly appId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface UserNotificationDeliveryAttempt {
  readonly at: number;
  readonly status: "delivered" | "skipped" | "failed";
  readonly reason?: string;
}

export interface UserNotificationDeliveryResult {
  readonly status: "delivered" | "skipped" | "failed";
  readonly reason?: string;
}

export interface UserNotificationPolicySummary {
  readonly idempotencyKey: string;
  readonly appId?: string;
  readonly delivery: UserNotificationRequest["delivery"];
  readonly expiresAt?: number;
  readonly sensitive?: boolean;
  readonly actionIds: readonly string[];
}

export interface UserNotificationRecord {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly id: string;
  readonly idempotencyKey: string;
  readonly request: UserNotificationRequest;
  readonly state: UserNotificationState;
  readonly policyDecisionId: string;
  readonly deliveryAttempts: readonly UserNotificationDeliveryAttempt[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface UserNotificationPersistenceAdapter {
  load(signal?: AbortSignal): Promise<readonly UserNotificationRecord[]>;
  put(record: UserNotificationRecord, signal?: AbortSignal): Promise<void>;
  remove(id: string, signal?: AbortSignal): Promise<void>;
  dispose(): void | Promise<void>;
}

export interface UserNotificationDeliveryAdapter {
  readonly id: string;
  permission(): UserNotificationPermission;
  requestPermission(request: { readonly userGesture: true }): Promise<UserNotificationPermission>;
  deliver(record: UserNotificationRecord, signal: AbortSignal): Promise<UserNotificationDeliveryResult>;
  dispose(): void | Promise<void>;
}

export interface UserNotificationActionContext {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly notificationId: string;
  readonly actionId: string;
  readonly record: UserNotificationRecord;
  readonly signal: AbortSignal;
}

export type UserNotificationActionHandler = (context: UserNotificationActionContext) => void | Promise<void>;

export type UserNotificationPostStatus = "delivered" | "suppressed" | "denied" | "failed";

export interface UserNotificationPostResult {
  readonly status: UserNotificationPostStatus;
  readonly notification: UserNotificationRecord;
  /** Flat identifiers mirror the persisted record for host integrations. */
  readonly runtimeId?: SynCloudOSRuntimeId;
  readonly id?: string;
  readonly title?: string;
  readonly message?: string;
}

export interface UserNotificationActionResult {
  readonly status: "completed" | "unavailable" | "failed";
  readonly notification?: UserNotificationRecord;
  readonly actionId?: string;
  readonly reason?: string;
}

export interface UserNotificationDiagnostic {
  readonly id: string;
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly state: UserNotificationState;
  readonly title: string;
  readonly body: string;
  readonly deliveryAttempts: number;
}
export interface UserNotificationCenter {
  readonly runtimeId: SynCloudOSRuntimeId;
  post(request: UserNotificationRequest): Promise<UserNotificationPostResult>;
  getHistory(): UserNotificationRecord[];
  dismiss(notificationId: string, reason?: string): Promise<UserNotificationRecord | null>;
  invokeAction?(notificationId: string, actionId: string): Promise<UserNotificationActionResult>;
  restore?(signal?: AbortSignal): Promise<void>;
  registerAction?(id: string, handler: UserNotificationActionHandler): () => boolean;
  acknowledge?(notificationId: string): Promise<UserNotificationRecord | null>;
  requestBrowserPermission?(request: { readonly userGesture: true }): Promise<UserNotificationPermission>;
  getDiagnostics?(): UserNotificationDiagnostic[];
  dispose?(): void | Promise<void>;
}
