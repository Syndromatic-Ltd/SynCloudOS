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

import type { AwaitUndoAction, AutomaticUndoGroup, SyncUndoAction, UndoAction, UndoGroup, UndoGroupOptions, UndoManager, UndoManagerOptions, UndoRegistrationLease, UndoReservation, UndoRestorationSnapshot, UndoResult } from "./undoTypes";

interface RegistrationLeaseState { readonly token: object; live: boolean }

interface UndoEntry {
  id: string;
  name: string;
  actions: UndoAction[];
  estimatedBytes: number;
  automaticGroup?: AutomaticUndoGroup;
  restoration?: UndoGroupOptions["restoration"];
  lease?: RegistrationLeaseState;
  poisoned?: { readonly direction: "undo" | "redo"; readonly code: string; readonly message: string };
}
interface OpenGroup {
  id: string;
  name: string;
  actions: UndoAction[];
  estimatedBytes: number;
  restoration?: UndoGroupOptions["restoration"];
  /** null means actions from multiple registration leases share this group. */
  lease?: RegistrationLeaseState | null;
}

export class UndoAsyncPolicyError extends Error {
  readonly code = "undo-async-policy-violation";
  constructor(actionName: string) { super(`Undo action "${actionName}" returned a thenable despite its synchronous policy.`); this.name = "UndoAsyncPolicyError"; }
}

export class UndoCompensationError extends Error {
  readonly code = "undo-compensation-failed";
  constructor(
    readonly primary: Error,
    readonly compensation: readonly Error[],
  ) {
    super(`Undo recovery failed after ${primary.message}: ${compensation.map((error) => error.message).join("; ")}`);
    this.name = "UndoCompensationError";
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === "object" || typeof value === "function") && value !== null && typeof (value as { then?: unknown }).then === "function";
}
function sameAutomatic(left?: AutomaticUndoGroup, right?: AutomaticUndoGroup) {
  return Boolean(left && right && left.kind === right.kind && left.key === right.key && left.boundaryId === right.boundaryId);
}

export function createUndoManager(options: UndoManagerOptions): UndoManager {
  const entries: UndoEntry[] = [];
  const groups: OpenGroup[] = [];
  const listeners = new Set<() => void>();
  const createId = options.randomUUID ?? (() => `undo:${Math.random().toString(36).slice(2)}`);
  let cursor = 0;
  let executing = false;
  let disposed = false;
  let cleanKey: string | null = "0";
  let lastFailure: { code: string; message: string } | null = null;
  let activeReservations = 0;
  const actionLeases = new WeakMap<object, RegistrationLeaseState>();
  const pendingLeaseRemovals = new Set<RegistrationLeaseState>();
  let activeEntry: UndoEntry | null = null;

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        // History observers are informational. In particular, an exception
        // before execute's try/finally must not strand `executing`, and an
        // exception after registration must not make a caller roll its model
        // back while retaining the new history entry.
        try { options.observeListenerError?.(error); } catch { /* diagnostics cannot own history either */ }
      }
    }
  };
  const cleanup = (entry: UndoEntry) => { for (const action of entry.actions) action.cleanup?.(); };
  const stateKey = () => `${cursor}:${entries.slice(0, cursor).map((entry) => `${entry.id}/${entry.actions.length}`).join("|")}:${groups.map((group) => `${group.id}/${group.actions.length}`).join("|")}`;
  const hasPoisonedEntry = () => entries.some((entry) => entry.poisoned);
  const entryHasRevokedLease = (entry: UndoEntry) =>
    entry.actions.some((action) => {
      const lease = actionLeases.get(action);
      return Boolean(lease && !lease.live);
    });
  // A group can temporarily contain actions from several mount leases. Once a
  // revoked segment is removed, recompute its remaining ownership rather than
  // preserving the old mixed marker: a sole surviving mount must regain its
  // own history projection without seeing any removed sibling action.
  const commonActionLease = (actions: readonly UndoAction[]): RegistrationLeaseState | undefined => {
    const first = actions[0] ? actionLeases.get(actions[0]) : undefined;
    return first && actions.every((action) => actionLeases.get(action) === first) ? first : undefined;
  };
  const assertCanRegister = () => {
    if (disposed) throw new Error("Undo manager is disposed.");
    if (executing) throw new Error("Undo history is executing an action.");
    if (hasPoisonedEntry()) {
      throw new Error("Undo history is unsafe after a failed action and cannot accept more entries.");
    }
  };
  const makeEntry = (name: string, actions: UndoAction[], estimatedBytes: number, automaticGroup?: AutomaticUndoGroup, restoration?: UndoGroupOptions["restoration"]): UndoEntry => ({ id: createId(), name, actions, estimatedBytes, automaticGroup, restoration });
  const entryFromGroup = (group: OpenGroup): UndoEntry => ({
    id: group.id,
    name: group.name,
    actions: group.actions,
    estimatedBytes: group.estimatedBytes,
    restoration: group.restoration,
    ...(group.lease ? { lease: group.lease } : {}),
  });
  const discardRedo = () => {
    for (const entry of entries.splice(cursor)) cleanup(entry);
  };
  const evict = () => {
    if (groups.length > 0) return;
    const maxBytes = options.maxEstimatedBytes ?? Number.POSITIVE_INFINITY;
    let bytes = entries.reduce((sum, entry) => sum + entry.estimatedBytes, 0);
    while (entries.length > options.maxEntries || bytes > maxBytes) {
      const removed = entries.shift();
      if (!removed) break;
      bytes -= removed.estimatedBytes;
      cursor = Math.max(0, cursor - 1);
      cleanup(removed);
      cleanKey = null;
    }
  };
  const restorationFor = (entry: UndoEntry, direction: "undo" | "redo"): { restoration: NonNullable<UndoAction["restoration"]>; snapshot: UndoRestorationSnapshot } | null => {
    const action = direction === "undo" ? entry.actions[0] : entry.actions.at(-1);
    const restoration = entry.restoration ?? action?.restoration;
    const snapshot = direction === "undo" ? restoration?.before : restoration?.after;
    return restoration && snapshot ? { restoration, snapshot } : null;
  };
  const invoke = async (action: UndoAction, direction: "undo" | "redo") => {
    const callback = direction === "undo" ? action.undo : action.redo;
    const result: unknown = callback.call(action);
    if (action.asyncPolicy === "forbid") {
      if (isThenable(result)) {
        void Promise.resolve(result).catch(() => undefined);
        throw new UndoAsyncPolicyError(action.name);
      }
      return;
    }
    await result;
  };
  const execute = async (direction: "undo" | "redo", requiredLease?: RegistrationLeaseState): Promise<UndoResult> => {
    if (executing || activeReservations > 0) return { status: "busy", direction };
    if (requiredLease && !requiredLease.live) {
      return { status: "cancelled", direction, actionName: "Undo history", reason: "The undo registration lease has been revoked." };
    }
    const poisoned = entries.find((entry) => entry.poisoned && (!requiredLease || entry.lease === requiredLease));
    if (poisoned?.poisoned) {
      const error = new Error(`Undo entry "${poisoned.name}" is unsafe after a prior ${poisoned.poisoned.direction} failure: ${poisoned.poisoned.message}`);
      lastFailure = { code: "undo-entry-poisoned", message: error.message };
      return { status: "failed", direction, actionName: poisoned.name, code: "undo-entry-poisoned", error };
    }
    const index = direction === "undo" ? cursor - 1 : cursor;
    const entry = entries[index];
    if (!entry) return { status: "empty", direction };
    if (requiredLease && entry.lease !== requiredLease) return { status: "empty", direction };
    executing = true;
    activeEntry = entry;
    lastFailure = null;
    notify();
    try {
      const actions = direction === "undo" ? [...entry.actions].reverse() : entry.actions;
      const applied: UndoAction[] = [];
      let restorationAttempted = false;
      const authorityWasLost = () => Boolean((requiredLease && !requiredLease.live) || entryHasRevokedLease(entry));
      const compensate = async (): Promise<Error[]> => {
        const inverse = direction === "undo" ? "redo" : "undo";
        const compensationErrors: Error[] = [];
        for (const action of [...applied].reverse()) {
          try {
            await invoke(action, inverse);
          } catch (compensationError) {
            compensationErrors.push(compensationError instanceof Error ? compensationError : new Error(String(compensationError)));
          }
        }
        if (restorationAttempted) {
          const restoration = restorationFor(entry, inverse);
          if (restoration) {
            try {
              await restoration.restoration.restore(restoration.snapshot);
            } catch (compensationError) {
              compensationErrors.push(compensationError instanceof Error ? compensationError : new Error(String(compensationError)));
            }
          }
        }
        return compensationErrors;
      };
      try {
        for (const action of actions) {
          await invoke(action, direction);
          applied.push(action);
        }
        const restoration = restorationFor(entry, direction);
        if (restoration) {
          restorationAttempted = true;
          await restoration.restoration.restore(restoration.snapshot);
        }
        if (authorityWasLost()) {
          const compensationErrors = await compensate();
          if (compensationErrors.length > 0) {
            const primary = new Error("Undo authority was revoked while the action was in flight.");
            const failure = new UndoCompensationError(primary, compensationErrors);
            entry.poisoned = { direction, code: "undo-compensation-failed", message: failure.message };
            cleanKey = null;
            lastFailure = { code: "undo-compensation-failed", message: failure.message };
            return { status: "failed", direction, actionName: entry.name, code: "undo-compensation-failed", error: failure };
          }
          return {
            status: "cancelled",
            direction,
            actionName: entry.name,
            reason: "Undo authority was revoked while the action was in flight; completed effects were compensated.",
          };
        }
      } catch (error) {
        const primary = error instanceof Error ? error : new Error(String(error));
        const compensationErrors = await compensate();
        if (authorityWasLost() && compensationErrors.length === 0) {
          return {
            status: "cancelled",
            direction,
            actionName: entry.name,
            reason: "Undo authority was revoked while the action was in flight; completed effects were compensated.",
          };
        }
        const code = compensationErrors.length > 0
          ? "undo-compensation-failed"
          : error instanceof UndoAsyncPolicyError
            ? error.code
            : "undo-action-failed";
        const failure = compensationErrors.length > 0 ? new UndoCompensationError(primary, compensationErrors) : primary;
        // An action that rejects or leaks a thenable can have committed an
        // unknown partial effect.  Compensation restores every completed
        // sibling, then poisons the entry so cursor and model state are never
        // silently treated as safely retryable.
        entry.poisoned = { direction, code, message: failure.message };
        cleanKey = null;
        lastFailure = { code, message: failure.message };
        return { status: "failed", direction, actionName: entry.name, code, error: failure };
      }
      cursor += direction === "undo" ? -1 : 1;
      return { status: "completed", direction, actionName: entry.name };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      const code = error instanceof UndoAsyncPolicyError ? error.code : "undo-action-failed";
      lastFailure = { code, message: failure.message };
      return { status: "failed", direction, actionName: entry.name, code, error: failure };
    } finally {
      executing = false;
      activeEntry = null;
      for (const lease of [...pendingLeaseRemovals]) {
        pendingLeaseRemovals.delete(lease);
        removeLease(lease);
      }
      notify();
    }
  };

  const registerInternal = (action: UndoAction, registerOptions: { readonly automaticGroup?: AutomaticUndoGroup } = {}, lease?: RegistrationLeaseState): string => {
    if (lease && !lease.live) throw new Error("The undo registration lease has been revoked.");
    assertCanRegister();
    const bytes = Math.max(0, action.estimatedBytes ?? 0);
    actionLeases.set(action, lease ?? { token: managerToken, live: true });
    const open = groups.at(-1);
    if (open) {
      const actionLease = lease ?? null;
      if (open.lease === undefined) open.lease = actionLease;
      else if (open.lease !== actionLease) open.lease = null;
      open.actions.push(action);
      open.estimatedBytes += bytes;
      notify();
      return open.id;
    }
    const beginsAtCleanPoint = cleanKey === stateKey();
    discardRedo();
    const previous = entries[cursor - 1];
    if (!beginsAtCleanPoint && previous && previous.lease === lease && sameAutomatic(previous.automaticGroup, registerOptions.automaticGroup)) {
      previous.actions.push(action);
      previous.estimatedBytes += bytes;
      notify();
      evict();
      return previous.id;
    }
    const entry = makeEntry(action.name, [action], bytes, registerOptions.automaticGroup);
    entry.lease = lease;
    entries.push(entry);
    cursor = entries.length;
    evict();
    notify();
    return entry.id;
  };
  const removeLease = (lease: RegistrationLeaseState): void => {
    // An action may have yielded to a mounted owner.  Retiring its history
    // (and therefore running cleanup) while that invocation is in flight can
    // invalidate the callback it needs to compensate.  The execute finalizer
    // retires every queued lease after the action has settled instead.
    if (executing) {
      pendingLeaseRemovals.add(lease);
      return;
    }
    const wasClean = cleanKey !== null && cleanKey === stateKey();
    for (const group of groups) {
      const retained: UndoAction[] = [];
      for (const action of group.actions) {
        if (actionLeases.get(action) === lease) cleanup({ id: group.id, name: group.name, actions: [action], estimatedBytes: action.estimatedBytes ?? 0 });
        else retained.push(action);
      }
      group.actions = retained;
      group.estimatedBytes = retained.reduce((sum, action) => sum + Math.max(0, action.estimatedBytes ?? 0), 0);
      group.lease = commonActionLease(retained) ?? null;
    }
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      if (groups[index]!.actions.length === 0) groups.splice(index, 1);
    }
    const oldEntries = [...entries];
    const oldCursor = cursor;
    let retainedCursor = 0;
    const retainedEntries: UndoEntry[] = [];
    oldEntries.forEach((entry, index) => {
      const retainedActions = entry.actions.filter((action) => actionLeases.get(action) !== lease);
      const removedActions = entry.actions.filter((action) => actionLeases.get(action) === lease);
      for (const action of removedActions) cleanup({ id: entry.id, name: entry.name, actions: [action], estimatedBytes: action.estimatedBytes ?? 0 });
      if (retainedActions.length === 0) return;
      if (removedActions.length === 0) retainedEntries.push(entry);
      else retainedEntries.push({
        ...entry,
        actions: retainedActions,
        estimatedBytes: retainedActions.reduce((sum, action) => sum + Math.max(0, action.estimatedBytes ?? 0), 0),
        lease: commonActionLease(retainedActions),
      });
      if (index < oldCursor) retainedCursor += 1;
    });
    entries.splice(0, entries.length, ...retainedEntries);
    cursor = retainedCursor;
    if (wasClean) cleanKey = stateKey();
    else cleanKey = null;
    notify();
  };
  const managerToken = Object.freeze({});
  const createLease = (): UndoRegistrationLease => {
    const state: RegistrationLeaseState = { token: Object.freeze({}), live: true };
    const undoEntryForLease = () => {
      if (!state.live || disposed || hasPoisonedEntry()) return null;
      const entry = entries[cursor - 1];
      return entry?.lease === state ? entry : null;
    };
    const redoEntryForLease = () => {
      if (!state.live || disposed || hasPoisonedEntry()) return null;
      const entry = entries[cursor];
      return entry?.lease === state ? entry : null;
    };
    const lease: UndoRegistrationLease = {
      get isLive() { return state.live && !disposed; },
      get canUndo() { return Boolean(undoEntryForLease()); },
      get canRedo() { return Boolean(redoEntryForLease()); },
      get undoTitle() { return undoEntryForLease() ? `Undo ${undoEntryForLease()!.name}` : "Undo"; },
      get redoTitle() { return redoEntryForLease() ? `Redo ${redoEntryForLease()!.name}` : "Redo"; },
      get isExecuting() { return Boolean(executing && activeEntry?.lease === state); },
      register(action, options) {
        if (!state.live || disposed) throw new Error("The undo registration lease has been revoked.");
        return registerInternal(action, options, state);
      },
      reserve() {
        if (!state.live || disposed) throw new Error("The undo registration lease has been revoked.");
        return reserve(state);
      },
      undo() { return execute("undo", state); },
      redo() { return execute("redo", state); },
      subscribe(listener) {
        // The lease is a projection, not a manager observation capability.
        // It can safely wake for a sibling change, but the only state it can
        // subsequently read remains its own frontier projection.
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      revoke() {
        if (!state.live) return;
        state.live = false;
        removeLease(state);
      },
    };
    return Object.freeze(lease);
  };
  const reserve = (lease?: RegistrationLeaseState): UndoReservation => {
    if (lease && !lease.live) throw new Error("The undo registration lease has been revoked.");
    assertCanRegister();
    if (executing) throw new Error("Undo history is executing an action.");
    activeReservations += 1;
    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true;
      activeReservations = Math.max(0, activeReservations - 1);
    };
    return Object.freeze({
      commit(action: UndoAction, options?: { readonly automaticGroup?: AutomaticUndoGroup }) {
        if (settled) throw new Error("The undo reservation is no longer live.");
        if (lease && !lease.live) { release(); throw new Error("The undo registration lease has been revoked."); }
        if (disposed) { release(); throw new Error("Undo manager is disposed."); }
        if (executing) { release(); throw new Error("Undo history is executing an action."); }
        try { return registerInternal(action, options, lease); }
        finally { release(); }
      },
      cancel: release,
    });
  };
  const manager: UndoManager = {
    runtimeId: options.runtimeId,
    owner: options.owner,
    get canUndo() { return !disposed && !hasPoisonedEntry() && cursor > 0; },
    get canRedo() { return !disposed && !hasPoisonedEntry() && cursor < entries.length; },
    get undoTitle() { return cursor > 0 ? `Undo ${entries[cursor - 1].name}` : "Undo"; },
    get redoTitle() { return cursor < entries.length ? `Redo ${entries[cursor].name}` : "Redo"; },
    get isExecuting() { return executing; },
    get isDirty() { return hasPoisonedEntry() || cleanKey === null || cleanKey !== stateKey(); },
    assertCanRegister,
    register(action, registerOptions = {}) { return registerInternal(action, registerOptions); },
    reserve: () => reserve(),
    createRegistrationLease: createLease,
    beginGroup(name, groupOptions = {}) {
      if (disposed) throw new Error("Undo manager is disposed.");
      if (hasPoisonedEntry()) throw new Error("Undo history is unsafe after a failed action and cannot open a group.");
      groups.push({ id: createId(), name, actions: [], estimatedBytes: 0, restoration: groupOptions.restoration });
      notify();
    },
    endGroup(): UndoGroup | null {
      const group = groups.pop();
      if (!group) throw new Error("No undo group is open.");
      if (group.actions.length === 0) { notify(); return null; }
      const parent = groups.at(-1);
      if (parent) {
        parent.actions.push(...group.actions);
        parent.estimatedBytes += group.estimatedBytes;
        if (parent.lease === undefined) parent.lease = group.lease ?? null;
        else if (parent.lease !== group.lease) parent.lease = null;
      } else {
        discardRedo();
        entries.push(entryFromGroup(group));
        cursor = entries.length;
        evict();
      }
      notify();
      return { id: group.id, name: group.name, actionCount: group.actions.length, estimatedBytes: group.estimatedBytes };
    },
    cancelGroup() {
      const group = groups.pop();
      if (!group) throw new Error("No undo group is open.");
      cleanup(entryFromGroup(group));
      notify();
    },
    undo: () => execute("undo"),
    redo: () => execute("redo"),
    markClean() { cleanKey = hasPoisonedEntry() ? null : stateKey(); notify(); },
    clear() {
      for (const group of groups.splice(0)) cleanup(entryFromGroup(group));
      for (const entry of entries.splice(0)) cleanup(entry);
      cursor = 0;
      cleanKey = stateKey();
      lastFailure = null;
      notify();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    inspect: () => ({ owner: options.owner, canUndo: manager.canUndo, canRedo: manager.canRedo, undoTitle: manager.undoTitle, redoTitle: manager.redoTitle, isExecuting: executing, isDirty: manager.isDirty, groupDepth: groups.length, cursor, entries: entries.map(({ id, name, actions, estimatedBytes, poisoned }) => ({ id, name, actionCount: actions.length, estimatedBytes, poisoned: Boolean(poisoned) })), lastFailure }),
    dispose() { if (disposed) return; disposed = true; activeReservations = 0; for (const group of groups.splice(0)) cleanup(entryFromGroup(group)); for (const entry of entries.splice(0)) cleanup(entry); cursor = 0; listeners.clear(); },
  };
  return manager;
}
