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

import type { AFXFrameScheduler } from './AFXLayer';

/** One host callback for a renderer's layer tree; scheduling semantics stay intact. */
export function batchAFXFrameScheduler(host: AFXFrameScheduler): AFXFrameScheduler {
  type Entry = { callback: (timestamp: number) => void; active: boolean };
  const pending = new Set<Entry>();
  let cancelHost: (() => void) | null = null;
  const schedule = () => {
    if (cancelHost || !pending.size) return;
    cancelHost = host.requestFrame(timestamp => {
      cancelHost = null;
      // Requests made inside a callback belong to the following frame, just
      // as with requestAnimationFrame. An earlier callback may cancel a later
      // one in this batch without suppressing unrelated layers.
      const batch = [...pending];
      pending.clear();
      for (const entry of batch) {
        if (!entry.active) continue;
        entry.active = false;
        try { entry.callback(timestamp); }
        catch (error) { queueMicrotask(() => { throw error; }); }
      }
      schedule();
    });
  };
  return Object.freeze({
    now: () => host.now(),
    get reducedMotion() { return host.reducedMotion; },
    get suspended() { return host.suspended; },
    ...(host.subscribeState ? { subscribeState: (callback: () => void) => host.subscribeState!(callback) } : {}),
    requestFrame(callback: (timestamp: number) => void) {
      const entry: Entry = { callback, active: true };
      pending.add(entry);
      schedule();
      return () => {
        entry.active = false;
        pending.delete(entry);
        if (!pending.size && cancelHost) { const cancel = cancelHost; cancelHost = null; cancel(); }
      };
    },
  });
}
