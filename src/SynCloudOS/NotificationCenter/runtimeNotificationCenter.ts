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

import type { OperationCoordinator } from "../Runtime/runtimeInstanceTypes";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type {
  UserNotificationActionContext,
  UserNotificationActionHandler,
  UserNotificationDeliveryAdapter,
  UserNotificationDeliveryAttempt,
  UserNotificationPermission,
  UserNotificationPolicySummary,
  UserNotificationPersistenceAdapter,
  UserNotificationPostResult,
  UserNotificationRecord,
  UserNotificationRequest,
  UserNotificationActionResult,
  UserNotificationCenter,
} from "./notificationDeliveryTypes";

interface NotificationPolicyDecision {
  readonly allowed: boolean;
  readonly suppressed?: boolean;
  readonly id: string;
  readonly reason: string;
}

export interface RuntimeUserNotificationCenterOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly now: () => number;
  readonly randomUUID: () => string;
  readonly persistence: UserNotificationPersistenceAdapter;
  readonly delivery?: UserNotificationDeliveryAdapter;
  readonly operations: OperationCoordinator;
  readonly signal: AbortSignal;
  readonly maxRecords?: number;
  readonly maxDeliveryAttempts?: number;
  readonly decide?: (summary: UserNotificationPolicySummary) => NotificationPolicyDecision;
  readonly onRecord?: (record: UserNotificationRecord) => void;
}

function cloneRecord(record: UserNotificationRecord): UserNotificationRecord {
  return {
    ...record,
    request: { ...record.request, actions: record.request.actions?.map((action) => ({ ...action })) },
    deliveryAttempts: record.deliveryAttempts.map((attempt) => ({ ...attempt })),
  };
}


export function createRuntimeUserNotificationCenter(options: RuntimeUserNotificationCenterOptions): UserNotificationCenter {
  const records = new Map<string, UserNotificationRecord>();
  const actions = new Map<string, UserNotificationActionHandler>();
  const activeActions = new Map<string, Promise<UserNotificationActionResult>>();
  const maxRecords = Math.max(1, options.maxRecords ?? 120);
  const maxDeliveryAttempts = Math.max(1, Math.min(5, options.maxDeliveryAttempts ?? 2));
  let disposed = false;
  let restored = false;

  const throwIfUnavailable = (signal: AbortSignal = options.signal) => {
    if (!disposed && !signal.aborted) return;
    const reason = signal.reason;
    throw reason instanceof Error ? reason : new Error("Notification centre is disposed or cancelled.");
  };

  const persist = async (record: UserNotificationRecord, signal: AbortSignal = options.signal) => {
    throwIfUnavailable(signal);
    await options.persistence.put(record, signal);
    throwIfUnavailable(signal);
    options.onRecord?.(cloneRecord(record));
  };

  const retain = async (record: UserNotificationRecord, signal: AbortSignal = options.signal) => {
    throwIfUnavailable(signal);
    records.set(record.id, record);
    while (records.size > maxRecords) {
      const oldest = records.values().next().value as UserNotificationRecord | undefined;
      if (!oldest) break;
      records.delete(oldest.id);
      await options.persistence.remove(oldest.id, signal);
      throwIfUnavailable(signal);
    }
    await persist(record, signal);
  };

  const update = async (record: UserNotificationRecord, patch: Partial<UserNotificationRecord>, signal: AbortSignal = options.signal) => {
    throwIfUnavailable(signal);
    const next = { ...record, ...patch, updatedAt: options.now() } as UserNotificationRecord;
    records.set(next.id, next);
    await persist(next, signal);
    return next;
  };

  const getRecord = (id: string) => records.get(id) ?? null;

  const policySummary = (request: UserNotificationRequest): UserNotificationPolicySummary => ({
    idempotencyKey: request.idempotencyKey,
    appId: request.appId,
    delivery: request.delivery,
    expiresAt: request.expiresAt,
    sensitive: request.sensitive,
    actionIds: (request.actions ?? []).map((action) => action.id),
  });

  const postResult = (status: UserNotificationPostResult["status"], record: UserNotificationRecord): UserNotificationPostResult => ({
    status,
    notification: cloneRecord(record),
    runtimeId: record.runtimeId,
    id: record.id,
    title: record.request.title,
    message: record.request.body,
  });

  const deliver = async (record: UserNotificationRecord, signal: AbortSignal): Promise<UserNotificationRecord> => {
    let next = record;
    const attempts: UserNotificationDeliveryAttempt[] = [...record.deliveryAttempts];
    if (record.request.delivery === "browser-if-authorised") {
      const adapter = options.delivery;
      const permission: UserNotificationPermission = adapter?.permission() ?? "unsupported";
      if (adapter && permission === "granted") {
        for (let attempt = 0; attempt < maxDeliveryAttempts; attempt += 1) {
          throwIfUnavailable(signal);
          const result = await adapter.deliver(next, signal);
          throwIfUnavailable(signal);
          attempts.push({ at: options.now(), status: result.status, reason: result.reason });
          if (result.status === "delivered") break;
          if (result.status === "skipped") break;
        }
      } else {
        attempts.push({ at: options.now(), status: "skipped", reason: `permission-${permission}` });
      }
    }
    const failed = attempts.some((attempt) => attempt.status === "failed") && !attempts.some((attempt) => attempt.status === "delivered");
    next = await update(next, {
      state: failed ? "failed" : "delivered",
      deliveryAttempts: attempts,
    }, signal);
    return next;
  };

  return {
    runtimeId: options.runtimeId,
    async restore(signal: AbortSignal = options.signal) {
      if (disposed || restored) return;
      restored = true;
      const loaded = await options.persistence.load(signal);
      throwIfUnavailable(signal);
      const now = options.now();
      for (const record of loaded) {
        if (record.runtimeId !== options.runtimeId) continue;
        if (typeof record.request.expiresAt === "number" && record.request.expiresAt <= now) {
          await options.persistence.remove(record.id, signal);
          throwIfUnavailable(signal);
          continue;
        }
        records.set(record.id, cloneRecord(record));
        options.onRecord?.(cloneRecord(record));
      }
    },
    async post(request: UserNotificationRequest): Promise<UserNotificationPostResult> {
      if (disposed) throw new Error("Notification centre is disposed.");
      const existing = Array.from(records.values()).find((record) => record.idempotencyKey === request.idempotencyKey);
      if (existing) return postResult(existing.state === "denied" ? "denied" : existing.state === "suppressed" ? "suppressed" : existing.state === "failed" ? "failed" : "delivered", existing);
      const policy = options.decide?.(policySummary(request)) ?? { allowed: true, id: `${options.runtimeId}:policy:${options.randomUUID()}`, reason: "allowed" };
      const base: UserNotificationRecord = {
        runtimeId: options.runtimeId,
        id: `${options.runtimeId}:notification:${options.randomUUID()}`,
        idempotencyKey: request.idempotencyKey,
        request,
        state: policy.allowed ? "pending" : policy.suppressed ? "suppressed" : "denied",
        policyDecisionId: policy.id,
        deliveryAttempts: [],
        createdAt: options.now(),
        updatedAt: options.now(),
      };
      await retain(base, options.signal);
      if (!policy.allowed) return postResult(policy.suppressed ? "suppressed" : "denied", base);
      const delivered = await deliver(base, options.signal);
      return postResult(delivered.state === "failed" ? "failed" : "delivered", delivered);
    },
    getHistory() {
      return Array.from(records.values(), cloneRecord);
    },
    registerAction(id: string, handler: UserNotificationActionHandler) {
      actions.set(id, handler);
      const unregister = () => actions.delete(id);
      return unregister;
    },
    async invokeAction(notificationId: string, actionId: string): Promise<UserNotificationActionResult> {
      if (disposed) return { status: "failed", reason: "notification-centre-disposed", actionId };
      const lockKey = `${notificationId}:${actionId}`;
      const active = activeActions.get(lockKey);
      if (active) return active;
      const record = getRecord(notificationId);
      const declaration = record?.request.actions?.find((action) => action.id === actionId);
      const handler = actions.get(actionId);
      if (!record || !declaration || !handler) return { status: "unavailable", reason: "action-unavailable", actionId };
      const invocation = (async () => {
        const operation = options.operations.run<
          { readonly notificationId: string; readonly actionId: string },
          UserNotificationActionResult
        >({
          kind: "notification.action",
          input: { notificationId, actionId },
          commit: async (context) => {
            const actionContext: UserNotificationActionContext = { runtimeId: options.runtimeId, notificationId, actionId, record: cloneRecord(record), signal: context.signal };
            await handler(actionContext);
            context.throwIfCancelled();
            const next = declaration.dismissOnSuccess ? await update(record, { state: "dismissed" }, context.signal) : record;
            return { status: "completed" as const, notification: next, actionId };
          },
        });
        const result = await operation.result;
        if (result.status === "completed") return result.value;
        const reason = result.status === "cancelled" ? result.reason : result.error.message;
        return { status: "failed" as const, reason, actionId };
      })();
      activeActions.set(lockKey, invocation);
      return invocation.then(
        (result) => { activeActions.delete(lockKey); return result; },
        (error) => { activeActions.delete(lockKey); throw error; },
      );
    },
    async acknowledge(notificationId: string) {
      const record = getRecord(notificationId);
      return record ? update(record, { state: "acknowledged" }) : null;
    },
    async dismiss(notificationId: string, reason = "dismissed") {
      const record = getRecord(notificationId);
      return record ? update(record, { state: "dismissed", request: { ...record.request, metadata: { ...record.request.metadata, dismissalReason: reason } } }) : null;
    },
    async requestBrowserPermission(request: { readonly userGesture: true }) {
      if (!options.delivery) return "unsupported" as const;
      return options.delivery.requestPermission(request);
    },
    getDiagnostics() {
      return Array.from(records.values(), (record) => ({
        id: record.id,
        runtimeId: record.runtimeId,
        state: record.state,
        title: record.request.sensitive ? "[redacted]" : record.request.title,
        body: record.request.sensitive ? "[redacted]" : record.request.body,
        deliveryAttempts: record.deliveryAttempts.length,
      }));
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      actions.clear();
      await Promise.all([
        options.persistence.dispose(),
        options.delivery?.dispose(),
      ]);
      records.clear();
      activeActions.clear();
    },
  };
}
