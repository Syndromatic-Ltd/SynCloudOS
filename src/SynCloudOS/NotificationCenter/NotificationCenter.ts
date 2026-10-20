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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type { SynCloudOSNotificationCenter, SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeSnapshot } from "../Runtime/runtimeTypes";
import type { SynCloudOSPolicyDecision, SynCloudOSPolicyRequest, SynCloudOSPolicySubject } from "../PolicyKit/policyTypes";
import {
  createNotificationPolicySnapshot,
  type SynCloudOSNotification,
  type SynCloudOSNotificationAction,
  type SynCloudOSNotificationActionInput,
  type SynCloudOSNotificationAppBadgeSnapshot,
  type SynCloudOSNotificationBadgeSnapshot,
  type SynCloudOSNotificationBehaviour,
  type SynCloudOSNotificationCenterSnapshot,
  type SynCloudOSNotificationGroup,
  type SynCloudOSNotificationGroupSnapshot,
  type SynCloudOSNotificationPolicyMode,
  type SynCloudOSNotificationPolicySnapshot,
  type SynCloudOSNotificationPostInput,
  type SynCloudOSNotificationPostOptions,
  type SynCloudOSNotificationPresenterSnapshot,
  type SynCloudOSNotificationPriority,
  type SynCloudOSNotificationQueueItem,
  type SynCloudOSNotificationStatus
} from "./notificationTypes";
import type {
  UserNotificationActionHandler,
  UserNotificationActionResult,
  UserNotificationDiagnostic,
  UserNotificationPermission,
  UserNotificationPostResult,
  UserNotificationRecord,
  UserNotificationRequest,
  UserNotificationCenter,
} from "./notificationDeliveryTypes";

const MAX_NOTIFICATION_HISTORY = 64;
const POST_REQUIRED_CAPABILITIES = ["notification.post"];
const ACTIVE_STATUSES = new Set<SynCloudOSNotificationStatus>(["queued", "displayed"]);

const systemNotificationSubject: SynCloudOSPolicySubject = {
  user: {
    id: "syncloudos.system",
    displayName: "SynCloudOS",
    role: "system",
    isAuthenticated: true,
    isAnonymous: false
  },
  role: "system",
  capabilities: ["*"],
  isAuthenticated: true
};

function unique<T>(items: T[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDateKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function hasBehaviour(notification: Pick<SynCloudOSNotification, "behaviours">, behaviour: SynCloudOSNotificationBehaviour) {
  return notification.behaviours.includes(behaviour);
}

function isExpired(notification: SynCloudOSNotification, now: number) {
  return typeof notification.expiresAt === "number" && notification.expiresAt <= now;
}

function isActive(notification: SynCloudOSNotification, now: number) {
  return ACTIVE_STATUSES.has(notification.status) && !isExpired(notification, now);
}

function isBannerEligible(notification: SynCloudOSNotification, now: number) {
  return isActive(notification, now) && notification.delivery.channel === "banner" && !hasBehaviour(notification, "silent");
}

function cloneAction(action: SynCloudOSNotificationAction): SynCloudOSNotificationAction {
  return {
    ...action,
    metadata: action.metadata ? { ...action.metadata } : undefined
  };
}

function cloneGroup(group: SynCloudOSNotificationGroup): SynCloudOSNotificationGroup {
  return { ...group };
}

function clonePolicySnapshot(policy: SynCloudOSNotificationPolicySnapshot): SynCloudOSNotificationPolicySnapshot {
  return {
    ...policy,
    requiredCapabilities: [...policy.requiredCapabilities],
    missingCapabilities: [...policy.missingCapabilities]
  };
}

function cloneNotification(notification: SynCloudOSNotification): SynCloudOSNotification {
  return {
    ...notification,
    behaviours: [...notification.behaviours],
    actions: notification.actions.map(cloneAction),
    lifecycle: { ...notification.lifecycle },
    delivery: { ...notification.delivery },
    group: cloneGroup(notification.group),
    policy: notification.policy ? clonePolicySnapshot(notification.policy) : undefined,
    data: notification.data ? { ...notification.data } : undefined
  };
}

function cloneForRead(notification: SynCloudOSNotification, now: number): SynCloudOSNotification {
  const clone = cloneNotification(notification);
  if (isExpired(clone, now) && ACTIVE_STATUSES.has(clone.status)) {
    clone.status = "expired";
    clone.updatedAt = now;
    clone.lifecycle = {
      ...clone.lifecycle,
      status: "expired",
      expiredAt: clone.lifecycle.expiredAt ?? clone.expiresAt ?? now,
      updatedAt: now,
      reason: clone.lifecycle.reason ?? "expired"
    };
  }
  return clone;
}

function normaliseBehaviours(input: SynCloudOSNotificationPostInput) {
  return unique<SynCloudOSNotificationBehaviour>([
    ...(input.behaviours ?? []),
    ...(input.behaviors ?? []),
    input.behaviour,
    input.behavior,
    input.transient ? "transient" : undefined,
    input.persistent ? "persistent" : undefined,
    input.silent ? "silent" : undefined,
    input.requiresAction ? "requiresAction" : undefined
  ].filter((value): value is SynCloudOSNotificationBehaviour => Boolean(value)));
}

function normaliseAction(input: SynCloudOSNotificationActionInput, index: number): SynCloudOSNotificationAction {
  return {
    id: input.id ?? `${input.kind}-${index + 1}`,
    kind: input.kind,
    label: input.label ?? input.title ?? input.kind,
    appId: input.appId,
    route: input.route,
    href: input.href,
    primary: input.primary,
    destructive: input.destructive,
    metadata: input.metadata ? { ...input.metadata } : undefined
  };
}

function normalisePriority(input: SynCloudOSNotificationPostInput): SynCloudOSNotificationPriority {
  if (input.priority) return input.priority;
  if (input.kind === "error") return "timeSensitive";
  if (input.requiresAction) return "timeSensitive";
  return "standard";
}

function createGroup(input: SynCloudOSNotificationPostInput, createdAt: number): SynCloudOSNotificationGroup {
  const dateKey = input.group?.dateKey ?? createDateKey(createdAt);
  const kind = input.group?.kind ?? input.kind;
  const threadKey = input.group?.threadKey ?? input.threadKey;
  const appId = input.group?.appId ?? input.appId;
  const key = input.groupKey ?? input.group?.key ?? [appId ? normalizeBundleIdentifier(appId) : "system", kind, threadKey ?? "general", dateKey].join(":");

  return {
    key,
    appId,
    kind,
    threadKey,
    dateKey,
    title: input.group?.title
  };
}

function createNotification(
  input: SynCloudOSNotificationPostInput,
  policy: SynCloudOSNotificationPolicySnapshot | undefined,
  now: number
): SynCloudOSNotification {
  const createdAt = input.createdAt ?? now;
  const behaviours = normaliseBehaviours(input);
  const group = createGroup(input, createdAt);
  const silent = behaviours.includes("silent");
  const requiresAction = behaviours.includes("requiresAction");
  const expiresAt = input.expiresAt ?? (typeof input.ttlMs === "number" ? createdAt + input.ttlMs : undefined);

  return {
    id: createId("notification"),
    kind: input.kind,
    category: input.category ?? input.kind,
    title: input.title,
    message: input.message,
    appId: input.appId,
    badgeCount: input.badgeCount,
    icon: input.icon,
    createdAt,
    updatedAt: now,
    status: "queued",
    priority: normalisePriority(input),
    behaviours,
    lifecycle: {
      status: "queued",
      queuedAt: now,
      updatedAt: now
    },
    delivery: {
      channel: silent ? "centre" : "banner",
      interruptible: !requiresAction && !behaviours.includes("persistent"),
      queuedAt: now
    },
    actions: (input.actions ?? []).map(normaliseAction),
    group,
    groupKey: group.key,
    threadKey: group.threadKey,
    dateKey: group.dateKey,
    transient: input.transient ?? behaviours.includes("transient"),
    route: input.route,
    expiresAt,
    ttlMs: input.ttlMs,
    coalesceKey: input.coalesceKey,
    dedupeKey: input.dedupeKey,
    coalescedCount: 1,
    policy,
    data: input.data ? { ...input.data } : undefined
  };
}

function markStatus(
  notification: SynCloudOSNotification,
  status: SynCloudOSNotificationStatus,
  now: number,
  reason?: string,
  actionId?: string
) {
  notification.status = status;
  notification.updatedAt = now;
  notification.lifecycle = {
    ...notification.lifecycle,
    status,
    updatedAt: now,
    reason: reason ?? notification.lifecycle.reason,
    actionId: actionId ?? notification.lifecycle.actionId
  };

  if (status === "displayed") {
    notification.lifecycle.displayedAt = notification.lifecycle.displayedAt ?? now;
    notification.delivery.displayedAt = notification.delivery.displayedAt ?? now;
  }
  if (status === "dismissed") notification.lifecycle.dismissedAt = now;
  if (status === "expired") notification.lifecycle.expiredAt = now;
  if (status === "acted") notification.lifecycle.actedAt = now;
  if (status === "archived") notification.lifecycle.archivedAt = now;
}

function moveNotificationToFront(notifications: SynCloudOSNotification[], notificationId: string) {
  const index = notifications.findIndex((notification) => notification.id === notificationId);
  if (index <= 0) return;
  const [notification] = notifications.splice(index, 1);
  notifications.unshift(notification);
}

function sweepExpiredInPlace(notifications: SynCloudOSNotification[], now: number) {
  const expiredIds: string[] = [];
  for (const notification of notifications) {
    if (!isExpired(notification, now) || !ACTIVE_STATUSES.has(notification.status)) continue;
    markStatus(notification, "expired", now, "expired");
    expiredIds.push(notification.id);
  }
  return expiredIds;
}

function rebalanceQueue(notifications: SynCloudOSNotification[], now: number) {
  const nextDisplayed = notifications.find((notification) => isBannerEligible(notification, now));
  for (const notification of notifications) {
    if (!ACTIVE_STATUSES.has(notification.status) || isExpired(notification, now)) continue;
    if (!isBannerEligible(notification, now)) {
      markStatus(notification, "queued", now);
      continue;
    }
    markStatus(notification, notification.id === nextDisplayed?.id ? "displayed" : "queued", now);
  }
}

function trimHistory(notifications: SynCloudOSNotification[]) {
  notifications.splice(MAX_NOTIFICATION_HISTORY, Math.max(0, notifications.length - MAX_NOTIFICATION_HISTORY));
}

function createBadgeSnapshot(notifications: SynCloudOSNotification[], now: number): SynCloudOSNotificationBadgeSnapshot {
  const records: Record<string, SynCloudOSNotificationAppBadgeSnapshot & { explicitCount?: number }> = {};

  for (const notification of notifications) {
    if (!notification.appId || !isActive(notification, now)) continue;

    const current = records[normalizeBundleIdentifier(notification.appId)];
    const explicitCount = current?.explicitCount ?? (
      typeof notification.badgeCount === "number" ? notification.badgeCount : undefined
    );
    const notificationIds = [...(current?.notificationIds ?? []), notification.id];

    records[normalizeBundleIdentifier(notification.appId)] = {
      appId: notification.appId,
      count: explicitCount ?? notificationIds.length,
      explicitCount,
      latestAt: Math.max(current?.latestAt ?? 0, notification.createdAt),
      notificationIds
    };
  }

  const byAppId = Object.fromEntries(
    Object.entries(records).map(([appId, { explicitCount, ...badge }]) => {
      void explicitCount;
      return [appId, badge];
    })
  );

  return {
    total: Object.values(byAppId).reduce((sum, badge) => sum + badge.count, 0),
    byAppId
  };
}

function syncAppBadges(draft: RuntimeSnapshot, now: number) {
  const badgeSnapshot = createBadgeSnapshot(draft.notifications, now);
  const notificationAppIds = new Set(
    draft.notifications.flatMap((notification) => (notification.appId ? [notification.appId] : []))
  );

  for (const appId of notificationAppIds) {
    const app = draft.appInfo[normalizeBundleIdentifier(appId)];
    if (!app) continue;
    draft.appInfo[normalizeBundleIdentifier(appId)] = {
      ...app,
      notifications: {
        ...app.notifications,
        badgeCount: badgeSnapshot.byAppId[normalizeBundleIdentifier(appId)]?.count ?? 0
      }
    };
  }
}

function applyCoalescedUpdate(target: SynCloudOSNotification, candidate: SynCloudOSNotification, now: number) {
  const previousCount = target.coalescedCount ?? 1;
  target.kind = candidate.kind;
  target.category = candidate.category;
  target.title = candidate.title;
  target.message = candidate.message;
  target.appId = candidate.appId;
  target.badgeCount = candidate.badgeCount;
  target.icon = candidate.icon;
  target.priority = candidate.priority;
  target.behaviours = [...candidate.behaviours];
  target.delivery = {
    ...candidate.delivery,
    queuedAt: target.delivery.queuedAt
  };
  target.actions = candidate.actions.map(cloneAction);
  target.group = cloneGroup(candidate.group);
  target.groupKey = candidate.groupKey;
  target.threadKey = candidate.threadKey;
  target.dateKey = candidate.dateKey;
  target.transient = candidate.transient;
  target.route = candidate.route;
  target.expiresAt = candidate.expiresAt;
  target.ttlMs = candidate.ttlMs;
  target.policy = candidate.policy ? clonePolicySnapshot(candidate.policy) : undefined;
  target.data = candidate.data ? { ...candidate.data } : undefined;
  target.coalescedCount = previousCount + 1;
  markStatus(target, "queued", now, "coalesced");
}

function createGroups(notifications: SynCloudOSNotification[], now: number) {
  const groups = new Map<string, SynCloudOSNotification[]>();
  for (const notification of notifications) {
    const key = notification.groupKey;
    groups.set(key, [...(groups.get(key) ?? []), notification]);
  }

  return Array.from(groups.entries()).map<SynCloudOSNotificationGroupSnapshot>(([key, items]) => {
    const sorted = [...items].sort((left, right) => right.createdAt - left.createdAt);
    const latest = sorted[0];
    return {
      key,
      appId: latest.group.appId,
      kind: latest.group.kind,
      threadKey: latest.group.threadKey,
      dateKey: latest.group.dateKey,
      title: latest.group.title,
      count: sorted.length,
      unreadCount: sorted.filter((notification) => isActive(notification, now)).length,
      notificationIds: sorted.map((notification) => notification.id),
      latest: cloneNotification(latest),
      notifications: sorted.map(cloneNotification)
    };
  });
}

function createQueue(notifications: SynCloudOSNotification[], now: number): SynCloudOSNotificationQueueItem[] {
  return notifications.filter((notification) => isBannerEligible(notification, now)).map((notification, index) => ({
    position: index,
    notification: cloneNotification(notification),
    channel: notification.delivery.channel,
    priority: notification.priority,
    queuedAt: notification.delivery.queuedAt,
    interruptible: notification.delivery.interruptible
  }));
}


type NotificationCenterPostInput = SynCloudOSNotificationPostInput | UserNotificationRequest;

export function createNotificationCenter(
  runtime: SynCloudOSRuntime,
  dependencies: {
    policyKit?: { authorise(request: SynCloudOSPolicyRequest): SynCloudOSPolicyDecision };
    userNotifications?: UserNotificationCenter;
  } = {}
): SynCloudOSNotificationCenter {
const EventBus = runtime.events;
const PolicyKit = dependencies.policyKit ?? runtime.policy;
const RuntimeStore = runtime.store;
const SettingsService = runtime.settings;

function createCenterSnapshot(now = Date.now()): SynCloudOSNotificationCenterSnapshot {
  const notifications = RuntimeStore.getSnapshot().notifications.map((notification) => cloneForRead(notification, now));
  const active = notifications.filter((notification) => isActive(notification, now));
  const queue = createQueue(notifications, now);
  const latest = queue[0]?.notification ?? active[0] ?? null;

  return {
    generatedAt: now,
    latest: latest ? cloneNotification(latest) : null,
    queue,
    history: notifications.map(cloneNotification),
    groups: createGroups(notifications, now),
    badges: createBadgeSnapshot(notifications, now),
    activeCount: active.length,
    unreadCount: active.length
  };
}

function evaluatePolicy(
  input: SynCloudOSNotificationPostInput,
  options: SynCloudOSNotificationPostOptions
) {
  const mode = options.policy ?? "system";
  if (mode === "skip") return { mode, decision: null, snapshot: undefined };

  const app = input.appId ? RuntimeStore.getSnapshot().appInfo[normalizeBundleIdentifier(input.appId)] ?? null : null;
  const decision = PolicyKit.authorise({
    action: "notification.post",
    source: options.source ?? input.source ?? "SynCloudOS.NotificationCenter.post",
    origin: options.origin ?? "runtime",
    app,
    route: input.route,
    subject: options.subject ?? (mode === "system" ? systemNotificationSubject : undefined),
    ...(options.subjectGrant ? { subjectGrant: options.subjectGrant } : {}),
    requiredCapabilities: unique([...POST_REQUIRED_CAPABILITIES, ...(options.requiredCapabilities ?? [])]),
    context: {
      notificationKind: input.kind,
      appId: input.appId,
      title: input.title
    }
  });

  return {
    mode,
    decision,
    snapshot: createNotificationPolicySnapshot(decision, mode)
  };
}

const presentationNotifications = {
  post(
    notification: SynCloudOSNotificationPostInput,
    options: SynCloudOSNotificationPostOptions = {}
  ): SynCloudOSNotification | null {
    const now = Date.now();

    // The user's own choice, checked before policy: an app the user has muted
    // never reaches the queue at all. Suppressing here rather than at the banner
    // keeps the badge, the history and the Notification Centre consistent with
    // what was asked for — a silenced notification should not exist, not merely
    // go unseen. Notifications with no appId are the system's own and stay
    // outside the master switch, so a boot failure can still speak up.
    if (notification.appId && !SettingsService.notificationsAllowed(notification.appId)) {
      EventBus.publish(
        "notification.policy.denied",
        { kind: notification.kind, appId: notification.appId, reason: "user.notificationsMuted" },
        notification.title
      );
      return null;
    }

    const policy = evaluatePolicy(notification, options);

    if (policy.mode === "enforce" && policy.decision && !policy.decision.allowed) {
      EventBus.publish(
        "notification.policy.denied",
        { kind: notification.kind, appId: notification.appId, reason: policy.decision.reason },
        notification.title
      );
      return null;
    }

    const candidate = createNotification(notification, policy.snapshot, now);
    let item: SynCloudOSNotification | null = null;
    let result: "posted" | "coalesced" | "deduplicated" = "posted";

    RuntimeStore.mutate((draft) => {
      sweepExpiredInPlace(draft.notifications, now);

      const deduped = candidate.dedupeKey
        ? draft.notifications.find((entry) => entry.dedupeKey === candidate.dedupeKey && isActive(entry, now))
        : undefined;

      if (deduped) {
        deduped.updatedAt = now;
        deduped.lifecycle.updatedAt = now;
        item = deduped;
        result = "deduplicated";
      } else {
        const coalesced = candidate.coalesceKey
          ? draft.notifications.find((entry) => entry.coalesceKey === candidate.coalesceKey && isActive(entry, now))
          : undefined;

        if (coalesced) {
          applyCoalescedUpdate(coalesced, candidate, now);
          moveNotificationToFront(draft.notifications, coalesced.id);
          item = coalesced;
          result = "coalesced";
        } else {
          draft.notifications.unshift(candidate);
          item = candidate;
        }
      }

      trimHistory(draft.notifications);
      rebalanceQueue(draft.notifications, now);
      syncAppBadges(draft, now);
    });

    const mutatedItem = item as SynCloudOSNotification | null;
    const postedItem = mutatedItem
      ? RuntimeStore.getSnapshot().notifications.find((entry) => entry.id === mutatedItem.id) ?? mutatedItem
      : null;
    if (postedItem) {
      EventBus.publish(
        "notification.post",
        {
          notificationId: postedItem.id,
          kind: postedItem.kind,
          appId: postedItem.appId,
          status: postedItem.status,
          result,
          policy: postedItem.policy
        },
        postedItem.title
      );
    }

    return postedItem ? cloneNotification(postedItem) : null;
  },

  dismiss(notificationId: string, reason = "dismissed") {
    const now = Date.now();
    let dismissed: SynCloudOSNotification | null = null;

    RuntimeStore.mutate((draft) => {
      sweepExpiredInPlace(draft.notifications, now);
      const notification = draft.notifications.find((item) => item.id === notificationId);
      if (!notification) return;
      markStatus(notification, "dismissed", now, reason);
      dismissed = notification;
      rebalanceQueue(draft.notifications, now);
      syncAppBadges(draft, now);
    });

    const dismissedItem = dismissed as SynCloudOSNotification | null;
    if (dismissedItem) {
      EventBus.publish("notification.dismiss", { notificationId, reason }, dismissedItem.title);
    }

    return dismissedItem ? cloneNotification(dismissedItem) : null;
  },

  archive(notificationId: string, reason = "archived") {
    const now = Date.now();
    let archived: SynCloudOSNotification | null = null;

    RuntimeStore.mutate((draft) => {
      sweepExpiredInPlace(draft.notifications, now);
      const notification = draft.notifications.find((item) => item.id === notificationId);
      if (!notification) return;
      markStatus(notification, "archived", now, reason);
      archived = notification;
      rebalanceQueue(draft.notifications, now);
      syncAppBadges(draft, now);
    });

    const archivedItem = archived as SynCloudOSNotification | null;
    if (archivedItem) {
      EventBus.publish("notification.archive", { notificationId, reason }, archivedItem.title);
    }

    return archivedItem ? cloneNotification(archivedItem) : null;
  },

  act(notificationId: string, actionId: string) {
    const now = Date.now();
    let acted: SynCloudOSNotification | null = null;
    let action: SynCloudOSNotificationAction | null = null;

    RuntimeStore.mutate((draft) => {
      sweepExpiredInPlace(draft.notifications, now);
      const notification = draft.notifications.find((item) => item.id === notificationId);
      const selectedAction = notification?.actions.find((item) => item.id === actionId);
      if (!notification || !selectedAction) return;

      action = selectedAction;
      markStatus(
        notification,
        selectedAction.kind === "dismiss" || selectedAction.kind === "markAsRead" ? "dismissed" : "acted",
        now,
        selectedAction.kind,
        selectedAction.id
      );
      acted = notification;
      rebalanceQueue(draft.notifications, now);
      syncAppBadges(draft, now);
    });

    const actedItem = acted as SynCloudOSNotification | null;
    const actedAction = action as SynCloudOSNotificationAction | null;
    if (!actedItem || !actedAction) return null;

    EventBus.publish(
      "notification.action",
      {
        notificationId,
        actionId,
        actionKind: actedAction.kind,
        route: actedAction.route,
        appId: actedAction.appId,
        metadata: actedAction.metadata ? { ...actedAction.metadata } : undefined,
        data: actedItem.data ? { ...actedItem.data } : undefined
      },
      actedItem.title
    );

    return {
      notification: cloneNotification(actedItem),
      action: cloneAction(actedAction)
    };
  },

  clearGroup(groupKey: string, reason = "groupCleared") {
    const now = Date.now();
    const clearedIds: string[] = [];

    RuntimeStore.mutate((draft) => {
      sweepExpiredInPlace(draft.notifications, now);
      for (const notification of draft.notifications) {
        if (notification.groupKey !== groupKey || !isActive(notification, now)) continue;
        markStatus(notification, "archived", now, reason);
        clearedIds.push(notification.id);
      }
      rebalanceQueue(draft.notifications, now);
      syncAppBadges(draft, now);
    });

    if (clearedIds.length > 0) {
      EventBus.publish("notification.group.clear", { groupKey, notificationIds: clearedIds, reason }, groupKey);
    }

    return clearedIds;
  },

  sweepExpired(now = Date.now()) {
    let expiredIds: string[] = [];

    RuntimeStore.mutate((draft) => {
      expiredIds = sweepExpiredInPlace(draft.notifications, now);
      if (expiredIds.length === 0) return;
      rebalanceQueue(draft.notifications, now);
      syncAppBadges(draft, now);
    });

    if (expiredIds.length > 0) {
      EventBus.publish("notification.expire", { notificationIds: expiredIds }, "Notifications expired");
    }

    return expiredIds;
  },

  latest() {
    return createCenterSnapshot().latest;
  },

  getQueue() {
    return createCenterSnapshot().queue;
  },

  getHistory() {
    return createCenterSnapshot().history;
  },

  getGroups() {
    return createCenterSnapshot().groups;
  },

  getBadgeSnapshot() {
    return createCenterSnapshot().badges;
  },

  getSnapshot(): SynCloudOSNotificationCenterSnapshot {
    return createCenterSnapshot();
  },

  getPresenterSnapshot(): SynCloudOSNotificationPresenterSnapshot {
    const snapshot = createCenterSnapshot();
    const banner = snapshot.queue[0]?.notification ?? null;
    const reducedMotion = RuntimeStore.getSnapshot().responsive.prefersReducedMotion;

    return {
      ...snapshot,
      banner,
      liveRegionText: banner ? `${banner.title}. ${banner.message}` : null,
      reducedMotion
    };
  }
};

const userNotifications = dependencies.userNotifications;
const presentationNotificationIds = new Set<string>();

function isUserNotificationRequest(input: NotificationCenterPostInput): input is UserNotificationRequest {
  return "idempotencyKey" in input && typeof input.idempotencyKey === "string" &&
    "body" in input && typeof input.body === "string" &&
    "delivery" in input && (input.delivery === "in-app" || input.delivery === "browser-if-authorised");
}

function isPresentationNotificationRequest(input: NotificationCenterPostInput): input is SynCloudOSNotificationPostInput {
  return "kind" in input && typeof input.kind === "string" &&
    "title" in input && typeof input.title === "string" &&
    "message" in input && typeof input.message === "string";
}

function postNotification(input: UserNotificationRequest): Promise<UserNotificationPostResult>;
function postNotification(input: SynCloudOSNotificationPostInput, options?: SynCloudOSNotificationPostOptions): SynCloudOSNotification | null;
function postNotification(
  input: NotificationCenterPostInput,
  options: SynCloudOSNotificationPostOptions = {},
): Promise<UserNotificationPostResult> | SynCloudOSNotification | null {
  if (isUserNotificationRequest(input)) {
    if (!userNotifications) {
      return Promise.reject(new Error("User notifications are not configured for this runtime."));
    }
    return userNotifications.post(input);
  }
  if (!isPresentationNotificationRequest(input)) return null;
  const posted = presentationNotifications.post(input, options);
  if (!posted) return null;
  presentationNotificationIds.add(posted.id);
  return { ...posted, runtimeId: runtime.runtimeId };
}

function dismissNotification(notificationId: string, reason?: string) {
  if (presentationNotificationIds.has(notificationId) || !userNotifications) {
    return presentationNotifications.dismiss(notificationId, reason);
  }
  return userNotifications.dismiss(notificationId, reason);
}

const notificationCenter = {
  runtimeId: runtime.runtimeId,
  ...presentationNotifications,
  post: postNotification,
  getPresentationHistory() {
    return presentationNotifications.getHistory();
  },
  getUserNotificationHistory() {
    return userNotifications?.getHistory() ?? [];
  },
  getHistory() {
    return [
      ...presentationNotifications.getHistory(),
      ...(userNotifications?.getHistory() ?? []),
    ];
  },
  dismiss: dismissNotification,
  invokeAction(notificationId: string, actionId: string) {
    return userNotifications?.invokeAction?.(notificationId, actionId) ?? Promise.resolve({
      status: "unavailable" as const,
      notificationId,
      actionId,
      reason: "User notifications are not configured for this runtime.",
    });
  },
  restore: userNotifications?.restore?.bind(userNotifications),
  registerAction: userNotifications?.registerAction?.bind(userNotifications),
  acknowledge: userNotifications?.acknowledge?.bind(userNotifications),
  requestBrowserPermission: userNotifications?.requestBrowserPermission?.bind(userNotifications),
  getDiagnostics: userNotifications?.getDiagnostics?.bind(userNotifications),
  async dispose() {
    presentationNotificationIds.clear();
    await userNotifications?.dispose?.();
  },
};

return notificationCenter;
}
