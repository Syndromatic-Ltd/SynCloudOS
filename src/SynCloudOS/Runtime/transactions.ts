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

import type { SynCloudOSRuntime } from "./runtimeInstanceTypes";
import type {
  RuntimeSnapshot,
  RuntimePostCommitEffect,
  RuntimeTransactionCallback,
  RuntimeTransactionContext,
  RuntimeTransactionEffectRecord,
  RuntimeTransactionOptions,
  RuntimeTransactionRecord,
  RuntimeTransactionStatus,
} from "./runtimeTypes";

export interface RuntimeTransaction {
  id: string;
  startedAt: number;
  committedAt?: number;
  rolledBackAt?: number;
  completedAt?: number;
  label?: string;
  source?: string;
  effects: RuntimeTransactionEffectRecord[];
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value && typeof (value as Promise<T>).then === "function");
}

function resolveOptions(options?: RuntimeTransactionOptions | string): RuntimeTransactionOptions {
  return typeof options === "string" ? { label: options } : options ?? {};
}

export function createRuntimeTransactions(runtime: SynCloudOSRuntime) {
  const now = () => Date.now();
  const id = (prefix: string) => `${runtime.runtimeId}:${prefix}:${now()}:${Math.random().toString(16).slice(2)}`;

  function createTransaction(label?: string, source?: string): RuntimeTransaction {
    return { id: id("transaction"), startedAt: now(), label, source, effects: [] };
  }

  function finish(transaction: RuntimeTransaction, committed: boolean): RuntimeTransaction {
    const completedAt = now();
    return {
      ...transaction,
      completedAt,
      ...(committed ? { committedAt: completedAt } : { rolledBackAt: completedAt }),
    };
  }

  function toRecord(transaction: RuntimeTransaction, status: RuntimeTransactionStatus, error?: unknown): RuntimeTransactionRecord {
    const endedAt = transaction.committedAt ?? transaction.rolledBackAt ?? transaction.completedAt ?? now();
    return {
      id: transaction.id,
      label: transaction.label,
      source: transaction.source,
      status,
      startedAt: transaction.startedAt,
      committedAt: transaction.committedAt,
      rolledBackAt: transaction.rolledBackAt,
      completedAt: status === "pending" ? undefined : endedAt,
      durationMs: endedAt - transaction.startedAt,
      error: error instanceof Error ? error.message : error ? String(error) : undefined,
      effectCount: transaction.effects.length,
      effects: transaction.effects.map((effect) => ({ ...effect })),
    };
  }

  // Transaction records are runtime diagnostics, not application state:
  // recording one never publishes the runtime store.
  function record(record: RuntimeTransactionRecord, historyLimit = 120) {
    runtime.diagnostics.transactions.append(record, historyLimit);
  }

  function getTransactionHistory(limit?: number) {
    return runtime.diagnostics.transactions.entries(limit);
  }

  function clearTransactionHistory() {
    runtime.diagnostics.transactions.clear();
  }

  function transaction<T>(
    callback: RuntimeTransactionCallback<T>,
    options?: RuntimeTransactionOptions | string,
  ): T | Promise<T | undefined> | undefined {
    const resolved = resolveOptions(options);
    const current = createTransaction(resolved.label, resolved.source);
    const missingValue = Symbol("missing-runtime-transaction-value");
    type MutationPath = readonly PropertyKey[];
    type OwnedMutation = {
      readonly path: MutationPath;
      readonly before: unknown;
      readonly existed: boolean;
      written: unknown;
    };
    type MutationPlan = {
      readonly path: MutationPath;
      readonly before: unknown;
      readonly existed: boolean;
      readonly after: unknown;
      readonly afterExisted: boolean;
    };
    const ownedMutations = new Map<string, OwnedMutation>();
    const effects: Array<{ record: RuntimeTransactionEffectRecord; effect: RuntimePostCommitEffect }> = [];
    const historyLimit = resolved.historyLimit ?? 120;
    const isStructuredValue = (value: unknown): value is Record<PropertyKey, unknown> =>
      Boolean(value && typeof value === "object") && (
        Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype
      );
    const hasOwn = (value: unknown, key: PropertyKey) =>
      Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key));
    // Detached draft proxy -> its plain target (see createDetachedDraft).
    const detachedTargets = new WeakMap<object, Record<PropertyKey, unknown>>();
    const rawValue = (value: unknown): unknown =>
      value && typeof value === "object" ? detachedTargets.get(value) ?? value : value;
    const cloneOwnedValue = <T,>(value: T, seen = new WeakMap<object, unknown>()): T => {
      const source = rawValue(value);
      if (!isStructuredValue(source)) return source as T;
      const cached = seen.get(source as object);
      if (cached) return cached as T;
      const clone = (Array.isArray(source) ? [] : {}) as Record<PropertyKey, unknown>;
      seen.set(source as object, clone);
      for (const key of Reflect.ownKeys(source as object)) {
        clone[key] = cloneOwnedValue((source as Record<PropertyKey, unknown>)[key], seen);
      }
      return clone as T;
    };
    /**
     * A detached view of `root` for a mutator. Each object or array is copied
     * (shallowly) only when the mutator first reaches it; untouched subtrees
     * keep their snapshot references, so the write-set diff skips them by
     * identity instead of cloning and walking the whole runtime snapshot. A
     * snapshot object reachable through several paths gets one copy, as a deep
     * clone would. Objects the mutator creates are returned as-is.
     */
    const createDetachedDraft = (root: unknown): unknown => {
      const copies = new WeakMap<object, object>();
      const snapshotOwned = new WeakSet<object>();
      const detach = (value: Record<PropertyKey, unknown>): object => {
        const existing = copies.get(value);
        if (existing) return existing;
        const target = (Array.isArray(value) ? [] : {}) as Record<PropertyKey, unknown>;
        for (const key of Reflect.ownKeys(value)) {
          const child = value[key];
          if (isStructuredValue(child)) snapshotOwned.add(child as object);
          target[key] = child;
        }
        const draft = new Proxy(target, {
          get(copy, key, receiver) {
            const current = Reflect.get(copy, key, receiver);
            if (!isStructuredValue(current) || !snapshotOwned.has(current as object)) return current;
            const child = detach(current as Record<PropertyKey, unknown>);
            copy[key] = child;
            return child;
          },
        });
        detachedTargets.set(draft, target);
        copies.set(value, draft);
        return draft;
      };
      return isStructuredValue(root) ? detach(root as Record<PropertyKey, unknown>) : root;
    };
    const pathKey = (path: MutationPath) => path.map((part) => `${typeof part}:${String(part)}`).join("/");
    const readPath = (value: unknown, path: MutationPath): unknown => {
      let current = value as Record<PropertyKey, unknown> | null;
      for (const key of path) {
        const container = current;
        if (!hasOwn(container, key)) return missingValue;
        current = (container as Record<PropertyKey, unknown>)[key] as Record<PropertyKey, unknown>;
      }
      return current;
    };
    const sameWrittenValue = (current: unknown, written: unknown) => current === missingValue
      ? written === missingValue
      : Object.is(current, written);
    const restorePath = (draft: Record<PropertyKey, unknown>, mutation: OwnedMutation) => {
      if (mutation.path.length === 0) return;
      let target: Record<PropertyKey, unknown> | null = draft;
      for (const key of mutation.path.slice(0, -1)) {
        const child = target?.[key];
        if (!child || typeof child !== "object") return;
        target = child as Record<PropertyKey, unknown>;
      }
      if (!target) return;
      const leaf = mutation.path.at(-1)!;
      if (mutation.existed) target[leaf] = cloneOwnedValue(mutation.before);
      else delete target[leaf];
    };
    const collectMutationPlans = (
      before: unknown,
      draftValue: unknown,
      path: MutationPath,
      plans: MutationPlan[],
    ) => {
      if (Object.is(before, draftValue)) return;
      const after = rawValue(draftValue);
      if (Object.is(before, after)) return;
      if (
        isStructuredValue(before) &&
        isStructuredValue(after) &&
        Array.isArray(before) === Array.isArray(after)
      ) {
        const keys = new Set<PropertyKey>([
          ...Reflect.ownKeys(before),
          ...Reflect.ownKeys(after),
        ]);
        for (const key of keys) {
          const existed = hasOwn(before, key);
          const afterExisted = hasOwn(after, key);
          if (existed && afterExisted) {
            collectMutationPlans(before[key], after[key], [...path, key], plans);
          } else {
            plans.push({
              path: [...path, key],
              before: existed ? before[key] : missingValue,
              existed,
              after: afterExisted ? after[key] : missingValue,
              afterExisted,
            });
          }
        }
        return;
      }
      if (path.length > 0) {
        plans.push({
          path,
          before,
          existed: before !== missingValue,
          after,
          afterExisted: after !== missingValue,
        });
      }
    };
    const applyMutationPlan = (draft: Record<PropertyKey, unknown>, plan: MutationPlan) => {
      if (plan.path.length === 0) return;
      let target: Record<PropertyKey, unknown> | null = draft;
      for (const key of plan.path.slice(0, -1)) {
        const child = target?.[key];
        if (!child || typeof child !== "object") return;
        target = child as Record<PropertyKey, unknown>;
      }
      if (!target) return;
      const leaf = plan.path.at(-1)!;
      if (plan.afterExisted) target[leaf] = cloneOwnedValue(plan.after);
      else delete target[leaf];
    };
    const context: RuntimeTransactionContext = {
      id: current.id,
      label: current.label,
      source: current.source,
      startedAt: current.startedAt,
      transaction: toRecord(current, "pending"),
      getSnapshot: runtime.store.getSnapshot,
      mutate(mutator) {
        // RuntimeStore drafts intentionally use copy-on-write proxies. Wrapping
        // one of those proxies again makes an assignment such as
        // `draft.webspring = { ...draft.webspring, ... }` appear locally but
        // disappear when the inner draft is finalised. Mutate a detached
        // view, then replay the leaf-level diff into the current store draft.
        // This also gives rollback the narrow ownership information it needs
        // to preserve concurrent writes in the same top-level branch. The view
        // copies only what the mutator reaches, so the cost follows the
        // transaction's write set rather than the snapshot's size.
        const before = runtime.store.getSnapshot();
        const detachedDraft = createDetachedDraft(before) as RuntimeSnapshot;
        mutator(detachedDraft);
        const plans: MutationPlan[] = [];
        collectMutationPlans(before, detachedDraft, [], plans);
        if (plans.length === 0) return;
        const touched = new Set<string>();
        for (const plan of plans) {
          const key = pathKey(plan.path);
          if (!ownedMutations.has(key)) {
            ownedMutations.set(key, {
              path: plan.path,
              before: cloneOwnedValue(plan.before),
              existed: plan.existed,
              written: missingValue,
            });
          }
          touched.add(key);
        }
        runtime.store.mutate((draft) => {
          for (const plan of plans) applyMutationPlan(draft as unknown as Record<PropertyKey, unknown>, plan);
        });
        const snapshot = runtime.store.getSnapshot();
        for (const key of touched) {
          const mutation = ownedMutations.get(key);
          if (mutation) mutation.written = readPath(snapshot, mutation.path);
        }
      },
      afterCommit(effect, label) {
        const effectRecord: RuntimeTransactionEffectRecord = {
          id: id("effect"),
          label,
          status: "pending",
          queuedAt: now(),
        };
        current.effects.push(effectRecord);
        effects.push({ record: effectRecord, effect });
        return effectRecord.id;
      },
      publishAfterCommit(type, payload, label) {
        return this.afterCommit(() => { runtime.events.publish(type, payload, label); }, label ?? `publish:${type}`);
      },
    };

    const restoreOwnedMutations = () => {
      if (ownedMutations.size === 0) return;
      const snapshot = runtime.store.getSnapshot();
      const restore = Array.from(ownedMutations.values())
        .filter((mutation) => sameWrittenValue(readPath(snapshot, mutation.path), mutation.written))
        .sort((left, right) => left.path.length - right.path.length);
      if (restore.length === 0) return;
      runtime.store.mutate((draft) => {
        for (const mutation of restore) restorePath(draft as unknown as Record<PropertyKey, unknown>, mutation);
      });
    };

    const rollback = (error: unknown) => {
      restoreOwnedMutations();
      const rolledBack = finish(current, false);
      record(toRecord(rolledBack, "rolledBack", error), historyLimit);
      runtime.events.publish("runtime.transaction.rollback", { transaction: rolledBack, error: error instanceof Error ? error.message : String(error) }, current.label);
      if (resolved.captureErrors !== false) {
        runtime.errors.capture({
          code: "RUNTIME_TRANSACTION_FAILED",
          title: "SynCloudOS could not complete a runtime transaction.",
          message: "A runtime command failed before it could finish.",
          technicalDetails: `${current.id}: ${error instanceof Error ? error.message : String(error)}`,
          context: { label: current.label, source: current.source },
        });
      }
      return undefined;
    };

    const flushEffects = async () => {
      for (const item of effects) {
        item.record.status = "running";
        item.record.startedAt = now();
        try {
          await item.effect();
          item.record.status = "completed";
        } catch (error) {
          item.record.status = "failed";
          item.record.error = error instanceof Error ? error.message : String(error);
        }
        item.record.completedAt = now();
      }
    };

    const commitResult = (value: T) => {
      const committed = finish(current, true);
      record(toRecord(committed, "committed"), historyLimit);
      runtime.events.publish("runtime.transaction.commit", { transaction: committed }, current.label);
      return effects.length ? flushEffects().then(() => value) : value;
    };

    record(toRecord(current, "pending"), historyLimit);
    runtime.events.publish("runtime.transaction.begin", { transaction: current }, current.label);
    try {
      const result = callback(context);
      return isPromiseLike(result) ? result.then(commitResult).catch(rollback) : commitResult(result);
    } catch (error) {
      return rollback(error);
    }
  }

  return { transaction, getTransactionHistory, clearTransactionHistory };
}
