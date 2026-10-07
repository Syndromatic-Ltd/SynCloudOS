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

export type SynCloudOSErrorCode =
  | "APP_NOT_FOUND"
  | "APP_LAUNCH_FAILED"
  | "APP_CONTENT_FAILED"
  | "APP_DISABLED"
  | "APP_NOT_RESPONDING"
  | "SITE_NOT_RESPONDING"
  | "CONNECTION_ERROR"
  | "ROUTE_NOT_FOUND"
  | "ASSET_LOAD_FAILED"
  | "FEATURE_NOT_IMPLEMENTED"
  | "GLOBAL_SCRIPT_ERROR"
  | "RUNTIME_TRANSACTION_FAILED"
  | "RUNTIME_EVENT_LISTENER_FAILED"
  | "UNHANDLED_PROMISE_REJECTION"
  | "UNRECOVERABLE_LOGIN_SESSION_MISMATCH"
  | "UNKNOWN_RUNTIME_ERROR";

export type SynCloudOSErrorCategory = "runtime" | "app" | "resource" | "event" | "watchdog";

export interface SynCloudOSErrorPayload {
  code: SynCloudOSErrorCode;
  title: string;
  message: string;
  appId?: string;
  packageName?: string;
  technicalMessage?: string;
  technicalDetails?: string;
  source?: string;
  severity?: "info" | "warning" | "error" | "fatal";
  recoverable?: boolean;
  suggestedActions?: Array<"reload" | "retry" | "returnToWebspring" | "openMailClient" | "dismiss">;
  context?: Record<string, unknown>;
  route?: string;
  statechartFrom?: string;
  statechartTo?: string;
  retry?: () => void;
  fingerprint?: string;
  category?: SynCloudOSErrorCategory;
}

export interface CapturedSynCloudOSError extends SynCloudOSErrorPayload {
  runtimeId?: string;
  id: string;
  at: number;
  timestamp: string;
}
