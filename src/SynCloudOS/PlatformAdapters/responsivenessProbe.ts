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

/** Private worker protocol. A suspended worker cannot establish a page stall. */
export type ResponsivenessMessage =
  | { kind: "ping"; epoch: number; id: number }
  | { kind: "stalled"; epoch: number; id: number; durationMs: number };

export function createResponsivenessProbe(deadlineMs = 10000, intervalMs = 1000) {
  let visible = false;
  let epoch = 0;
  let sequence = 0;
  let pending: { id: number; startedAt: number; reported: boolean } | null = null;
  let previousTick: number | null = null;
  return {
    reset(nextVisible: boolean, nextEpoch: number, now: number) {
      visible = nextVisible;
      epoch = nextEpoch;
      pending = null;
      previousTick = now;
    },
    acknowledge(replyEpoch: number, id: number, now: number) {
      if (replyEpoch !== epoch || pending?.id !== id) return;
      pending = null;
      previousTick = now;
    },
    tick(now: number): ResponsivenessMessage[] {
      if (!visible) return [];
      if (previousTick !== null && (now < previousTick || now - previousTick > intervalMs * 4)) pending = null;
      previousTick = now;
      if (!pending) {
        pending = { id: ++sequence, startedAt: now, reported: false };
        return [{ kind: "ping", epoch, id: pending.id }];
      }
      if (!pending.reported && now - pending.startedAt >= deadlineMs) {
        pending.reported = true;
        return [{ kind: "stalled", epoch, id: pending.id, durationMs: now - pending.startedAt }];
      }
      return [];
    },
  };
}
