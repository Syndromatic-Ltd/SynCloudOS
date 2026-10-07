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

import type { SynCloudOSPolicyDecision, SynCloudOSPolicyRequest, SynCloudOSPolicySubject, SynCloudOSPolicySubjectGrant } from "../PolicyKit/policyTypes";

export type SynCloudOSNotificationKind =
  | "news"
  | "system"
  | "app"
  | "error"
  | "publishing"
  | "progress"
  | "backgroundTask";

export type SynCloudOSNotificationCategory = SynCloudOSNotificationKind;
export type SynCloudOSNotificationStatus = "queued" | "displayed" | "dismissed" | "expired" | "acted" | "archived";
export type SynCloudOSNotificationPriority = "passive" | "standard" | "timeSensitive" | "critical";
export type SynCloudOSNotificationBehaviour = "transient" | "persistent" | "silent" | "requiresAction";
export type SynCloudOSNotificationDeliveryChannel = "banner" | "centre" | "badge";

export type SynCloudOSNotificationActionKind =
  | "openApp"
  | "openRoute"
  | "dismiss"
  | "clearGroup"
  | "reply"
  | "retry"
  | "snooze"
  | "viewDetails"
  | "markAsRead";

export type SynCloudOSNotificationPolicyMode = "system" | "audit" | "enforce" | "skip";

export interface SynCloudOSNotificationAction {
  id: string;
  kind: SynCloudOSNotificationActionKind;
  label: string;
  appId?: string;
  route?: string;
  href?: string;
  primary?: boolean;
  destructive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SynCloudOSNotificationActionInput
  extends Partial<Omit<SynCloudOSNotificationAction, "id" | "kind" | "label">> {
  id?: string;
  kind: SynCloudOSNotificationActionKind;
  label?: string;
  title?: string;
}

export interface SynCloudOSNotificationLifecycle {
  status: SynCloudOSNotificationStatus;
  queuedAt: number;
  displayedAt?: number;
  dismissedAt?: number;
  expiredAt?: number;
  actedAt?: number;
  archivedAt?: number;
  updatedAt?: number;
  actionId?: string;
  reason?: string;
}

export interface SynCloudOSNotificationDelivery {
  channel: SynCloudOSNotificationDeliveryChannel;
  interruptible: boolean;
  queuedAt: number;
  displayedAt?: number;
}

export interface SynCloudOSNotificationGroup {
  key: string;
  appId?: string;
  kind: SynCloudOSNotificationKind;
  threadKey?: string;
  dateKey: string;
  title?: string;
}

export interface SynCloudOSNotificationPolicySnapshot {
  decisionId: string;
  allowed: boolean;
  reason: string;
  mode: SynCloudOSNotificationPolicyMode;
  at: number;
  subjectRole: string;
  requiredCapabilities: string[];
  missingCapabilities: string[];
}

export interface SynCloudOSNotification {
  runtimeId?: string;
  id: string;
  kind: SynCloudOSNotificationKind;
  category: SynCloudOSNotificationCategory;
  title: string;
  message: string;
  appId?: string;
  badgeCount?: number;
  icon?: string;
  createdAt: number;
  updatedAt: number;
  status: SynCloudOSNotificationStatus;
  priority: SynCloudOSNotificationPriority;
  behaviours: SynCloudOSNotificationBehaviour[];
  lifecycle: SynCloudOSNotificationLifecycle;
  delivery: SynCloudOSNotificationDelivery;
  actions: SynCloudOSNotificationAction[];
  group: SynCloudOSNotificationGroup;
  groupKey: string;
  threadKey?: string;
  dateKey: string;
  transient?: boolean;
  route?: string;
  expiresAt?: number;
  ttlMs?: number;
  coalesceKey?: string;
  dedupeKey?: string;
  coalescedCount?: number;
  policy?: SynCloudOSNotificationPolicySnapshot;
  data?: Record<string, unknown>;
}

export interface SynCloudOSNotificationPostInput {
  kind: SynCloudOSNotificationKind;
  title: string;
  message: string;
  appId?: string;
  badgeCount?: number;
  icon?: string;
  category?: SynCloudOSNotificationCategory;
  priority?: SynCloudOSNotificationPriority;
  behaviour?: SynCloudOSNotificationBehaviour;
  behavior?: SynCloudOSNotificationBehaviour;
  behaviours?: SynCloudOSNotificationBehaviour[];
  behaviors?: SynCloudOSNotificationBehaviour[];
  transient?: boolean;
  persistent?: boolean;
  silent?: boolean;
  requiresAction?: boolean;
  actions?: SynCloudOSNotificationActionInput[];
  group?: Partial<Omit<SynCloudOSNotificationGroup, "kind" | "dateKey">> & {
    kind?: SynCloudOSNotificationKind;
    dateKey?: string;
  };
  groupKey?: string;
  threadKey?: string;
  route?: string;
  expiresAt?: number;
  ttlMs?: number;
  coalesceKey?: string;
  dedupeKey?: string;
  source?: string;
  createdAt?: number;
  data?: Record<string, unknown>;
}

export interface SynCloudOSNotificationPostOptions {
  policy?: SynCloudOSNotificationPolicyMode;
  /** Descriptive; evaluated only together with a PolicyKit-issued grant. */
  subject?: SynCloudOSPolicySubject;
  subjectGrant?: SynCloudOSPolicySubjectGrant;
  origin?: SynCloudOSPolicyRequest["origin"];
  source?: string;
  requiredCapabilities?: string[];
}

export interface SynCloudOSNotificationQueueItem {
  position: number;
  notification: SynCloudOSNotification;
  channel: SynCloudOSNotificationDeliveryChannel;
  priority: SynCloudOSNotificationPriority;
  queuedAt: number;
  interruptible: boolean;
}

export interface SynCloudOSNotificationGroupSnapshot {
  key: string;
  appId?: string;
  kind: SynCloudOSNotificationKind;
  threadKey?: string;
  dateKey: string;
  title?: string;
  count: number;
  unreadCount: number;
  notificationIds: string[];
  latest: SynCloudOSNotification;
  notifications: SynCloudOSNotification[];
}

export interface SynCloudOSNotificationAppBadgeSnapshot {
  appId: string;
  count: number;
  latestAt: number;
  notificationIds: string[];
}

export interface SynCloudOSNotificationBadgeSnapshot {
  total: number;
  byAppId: Record<string, SynCloudOSNotificationAppBadgeSnapshot>;
}

export interface SynCloudOSNotificationCenterSnapshot {
  generatedAt: number;
  latest: SynCloudOSNotification | null;
  queue: SynCloudOSNotificationQueueItem[];
  history: SynCloudOSNotification[];
  groups: SynCloudOSNotificationGroupSnapshot[];
  badges: SynCloudOSNotificationBadgeSnapshot;
  activeCount: number;
  unreadCount: number;
}

export interface SynCloudOSNotificationPresenterSnapshot extends SynCloudOSNotificationCenterSnapshot {
  banner: SynCloudOSNotification | null;
  liveRegionText: string | null;
  reducedMotion: boolean;
}

export function createNotificationPolicySnapshot(
  decision: SynCloudOSPolicyDecision,
  mode: SynCloudOSNotificationPolicyMode
): SynCloudOSNotificationPolicySnapshot {
  return {
    decisionId: decision.id,
    allowed: decision.allowed,
    reason: decision.reason,
    mode,
    at: decision.at,
    subjectRole: decision.subjectRole,
    requiredCapabilities: [...decision.requiredCapabilities],
    missingCapabilities: [...decision.missingCapabilities]
  };
}
