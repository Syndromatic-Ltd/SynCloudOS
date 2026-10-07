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

import type { DocumentWatchSubscription } from "./Adapters/documentAdapterTypes";
import type { DocumentRecord } from "./documentTypes";
import { immutableDocumentValue } from "./documentTypes";
import { assertDocumentAssetNotAborted, DocumentAssetError } from "./documentAssetErrors";

/** Preserve provider event order, and revoke queued verification with its subscription. */
export function createVerifiedDocumentAssetObservation<T>(options: {
  readonly subscribe: (listener: (event: T) => void) => DocumentWatchSubscription;
  readonly listener: (event: T) => void;
  readonly record: (event: T) => DocumentRecord<unknown> | null;
  readonly verifyAndRetain: (record: DocumentRecord<unknown>, signal: AbortSignal) => Promise<void>;
  readonly observeError?: (error: unknown) => void;
}): DocumentWatchSubscription {
  const lifetime = new AbortController();
  let queue = Promise.resolve(), disposed = false;
  const observe = (error: unknown) => {
    if (error instanceof DocumentAssetError && error.code === "asset-aborted") return;
    try { options.observeError?.(error); } catch { /* observer cannot admit invalid records */ }
  };
  const subscription = options.subscribe(event => {
    if (disposed) return;
    let captured: T;
    try { captured = immutableDocumentValue(event); } catch (error) { observe(error); return; }
    queue = queue.then(async () => {
      assertDocumentAssetNotAborted(lifetime.signal);
      const record = options.record(captured);
      if (record) await options.verifyAndRetain(record, lifetime.signal);
      assertDocumentAssetNotAborted(lifetime.signal);
      options.listener(captured);
    }).catch(observe);
  });
  return Object.freeze({ dispose() {
    if (disposed) return;
    disposed = true; lifetime.abort(); subscription.dispose();
  } });
}
