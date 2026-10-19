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

/** Codes for conditions the framework reports itself. A captured thrown
 * value that carries a catalogue code keeps that code instead. */
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
  /** The condition's code. When `error` carries a catalogue code, that code
   * replaces this one: one error has exactly one authoritative code. */
  code: SynCloudOSErrorCode;
  title: string;
  /** What the person sees. Required unless `error` is supplied, in which case
   * the thrown value's own message is used. */
  message?: string;
  /** The thrown value this capture reports. Its class name, catalogue code,
   * message, stack, cause and lifecycle fields become the captured identity
   * and technical details. */
  error?: unknown;
  appId?: string;
  packageName?: string;
  /** A one-line technical statement of the condition, for captures without a thrown value. */
  technicalMessage?: string;
  /** Extra condition-specific detail lines. */
  technicalDetails?: string;
  /** The component that caught or reported the condition. */
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

export interface CapturedSynCloudOSError extends Omit<SynCloudOSErrorPayload, "code" | "message" | "error" | "technicalMessage"> {
  /** The one authoritative code: the thrown value's catalogue code when it has one, otherwise the condition's code. */
  code: string;
  message: string;
  /** The thrown value's class name (such as `SynCloudOSLifecycleError` or
   * `TypeError`); absent when no value was thrown. */
  exception?: string;
  /** The complete technical details: everything not shown in the summary. */
  technicalDetails?: string;
  runtimeId?: string;
  id: string;
  at: number;
  timestamp: string;
}
