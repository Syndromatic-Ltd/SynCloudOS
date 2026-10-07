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
import type { RuntimePostCommitEffect, RuntimeTransactionCallback, RuntimeTransactionOptions } from "./runtimeTypes";
import { createRuntimeTransactions } from "./transactions";

export function createRuntimeController(runtime: SynCloudOSRuntime) {
  const transactions = createRuntimeTransactions(runtime);
  function transaction<T>(callback: RuntimeTransactionCallback<Promise<T>>, options?: RuntimeTransactionOptions | string): Promise<T | undefined>;
  function transaction<T>(callback: RuntimeTransactionCallback<T>, options?: RuntimeTransactionOptions | string): T | Promise<T | undefined> | undefined;
  function transaction<T>(label: string, callback: RuntimeTransactionCallback<Promise<T>>): Promise<T | undefined>;
  function transaction<T>(label: string, callback: RuntimeTransactionCallback<T>): T | Promise<T | undefined> | undefined;
  function transaction<T>(
    callbackOrLabel: RuntimeTransactionCallback<T> | RuntimeTransactionCallback<Promise<T>> | string,
    optionsOrCallback?: RuntimeTransactionOptions | string | RuntimeTransactionCallback<T> | RuntimeTransactionCallback<Promise<T>>,
  ) {
    return typeof callbackOrLabel === "string"
      ? transactions.transaction(optionsOrCallback as RuntimeTransactionCallback<T>, { label: callbackOrLabel, source: "SynCloudOS.Runtime.transaction" })
      : transactions.transaction(callbackOrLabel as RuntimeTransactionCallback<T>, optionsOrCallback as RuntimeTransactionOptions | string | undefined);
  }
  return {
    runtimeId: runtime.runtimeId,
    getSnapshot: runtime.store.getSnapshot,
    inspect: runtime.store.cloneSnapshot,
    subscribe: runtime.store.subscribe,
    commit: runtime.store.mutate,
    batch: runtime.store.batch,
    transaction,
    afterCommit(effect: RuntimePostCommitEffect, label = "SynCloudOS.Runtime.afterCommit") {
      return transactions.transaction((context) => { context.afterCommit(effect, label); }, { label, source: "SynCloudOS.Runtime.afterCommit" });
    },
    getTransactionHistory: transactions.getTransactionHistory,
    clearTransactionHistory: transactions.clearTransactionHistory,
    getHistory: transactions.getTransactionHistory,
    /** Bounded runtime event history (diagnostic, not reactive state). */
    getEventHistory: (limit?: number) => runtime.events.getHistory(limit),
    Lifecycle: runtime.lifecycle,
    lifecycle: runtime.lifecycle,
    assertInvariant() {
      const snapshot = runtime.store.getSnapshot();
      const activeAppId = snapshot.application.activeAppId;
      if (activeAppId && !snapshot.appInfo[activeAppId]) throw new Error(`Active app "${activeAppId}" is not registered.`);
      return true as const;
    },
    markBooted() {
      runtime.store.mutate((draft) => {
        draft.booted = true;
        draft.webspring.isBooted = true;
      });
    },
  };
}
