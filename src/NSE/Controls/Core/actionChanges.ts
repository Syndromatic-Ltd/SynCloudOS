/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Licensed under the GNU General Public License, version 3 or later.
 */

/** Action changes request fresh canonical validation; they never supply presentation authority. */
const listeners = new Map<string, Set<() => void>>();

export function subscribeNSEActionChanges(commandId: string, listener: () => void): () => void {
  const subscriptions = listeners.get(commandId) ?? new Set<() => void>();
  subscriptions.add(listener);
  listeners.set(commandId, subscriptions);
  return () => {
    subscriptions.delete(listener);
    if (subscriptions.size === 0) listeners.delete(commandId);
  };
}

export function publishNSEActionChange(commandId: string): void {
  for (const listener of listeners.get(commandId) ?? []) listener();
}
