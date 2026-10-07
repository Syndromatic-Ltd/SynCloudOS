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

import type { SettlementRegistry, SettlementWorkHandle } from "./settlementTypes";

/** Host-private bridge. Request before publication; acknowledge from the destination layout effect. */
export function createRenderRevisionSettlement(registry: SettlementRegistry, source: { readonly owner: string; readonly label: string }) {
  let pending: { revision: number; operationId: string; work: SettlementWorkHandle } | undefined;
  let disposed = false;
  return Object.freeze({
    request(revision: number, operationId: string) {
      if (disposed) throw new Error("Render settlement bridge is disposed.");
      if (!Number.isSafeInteger(revision) || revision < 0 || !operationId.trim()) throw new TypeError("A render revision and real operation ID are required.");
      if (pending?.revision === revision && pending.operationId === operationId) return;
      // Register the successor before cancelling the old revision: never publish an idle gap.
      const work = registry.begin({ ...source, kind: "react-commit", correlationId: operationId });
      const previous = pending;
      pending = { revision, operationId, work };
      previous?.work.cancel("render-revision-superseded");
    },
    acknowledge(revision: number, operationId: string): boolean {
      if (disposed || !pending || pending.revision !== revision || pending.operationId !== operationId) return false;
      const work = pending.work;
      pending = undefined;
      return work.complete();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending?.work.cancel("render-owner-disposed");
      pending = undefined;
    },
  });
}
