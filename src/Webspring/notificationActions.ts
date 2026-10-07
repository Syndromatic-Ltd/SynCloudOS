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
  SynCloudOSNotification,
  SynCloudOSNotificationAction,
  SynCloudOSNotificationActionKind
} from "../SynCloudOS/SynCloudOS";

export type WebspringNotificationActionPlanKind =
  | SynCloudOSNotificationActionKind
  | "openNotificationCentre";

export interface WebspringNotificationActionPlan {
  kind: WebspringNotificationActionPlanKind;
  notificationId: string;
  actionId?: string;
  appId?: string;
  route?: string;
  href?: string;
  groupKey: string;
  shouldAct: boolean;
  shouldCloseCentre: boolean;
}

const defaultActionOrder: SynCloudOSNotificationActionKind[] = [
  "openRoute",
  "openApp",
  "viewDetails",
  "reply",
  "retry",
  "snooze",
  "markAsRead",
  "dismiss"
];

export function getPrimaryNotificationAction(
  notification: SynCloudOSNotification
): SynCloudOSNotificationAction | null {
  return (
    notification.actions.find((action) => action.primary) ??
    defaultActionOrder
      .map((kind) => notification.actions.find((action) => action.kind === kind))
      .find((action): action is SynCloudOSNotificationAction => Boolean(action)) ??
    null
  );
}

export function createNotificationActionPlan(
  notification: SynCloudOSNotification,
  action: SynCloudOSNotificationAction | null = getPrimaryNotificationAction(notification)
): WebspringNotificationActionPlan {
  if (!action) {
    if (notification.route) {
      return {
        kind: "openRoute",
        notificationId: notification.id,
        route: notification.route,
        appId: notification.appId,
        groupKey: notification.groupKey,
        shouldAct: false,
        shouldCloseCentre: true
      };
    }

    if (notification.appId) {
      return {
        kind: "openApp",
        notificationId: notification.id,
        appId: notification.appId,
        groupKey: notification.groupKey,
        shouldAct: false,
        shouldCloseCentre: true
      };
    }

    return {
      kind: "openNotificationCentre",
      notificationId: notification.id,
      groupKey: notification.groupKey,
      shouldAct: false,
      shouldCloseCentre: false
    };
  }

  return {
    kind: action.kind,
    notificationId: notification.id,
    actionId: action.id,
    appId: action.appId ?? notification.appId,
    route: action.route ?? notification.route,
    href: action.href,
    groupKey: notification.groupKey,
    shouldAct: action.kind !== "clearGroup",
    shouldCloseCentre: action.kind === "openApp" || action.kind === "openRoute" || action.kind === "dismiss" || action.kind === "markAsRead"
  };
}
