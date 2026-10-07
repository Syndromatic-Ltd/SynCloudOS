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

import type { DragEndpoint, DragOperation, PasteboardRepresentation, TransferDragOperation } from "../../SynCloudOS/SynCloudOS";

/** Private NSE lookup handle. It carries no manager state or transfer authority. */
export interface NSEDragSessionHandle {
  readonly id: string;
}

/** NSE consumes operation receipts, never a reconstructed runtime session.
 * A runtime manager satisfies this port directly; AppSDK supplies opaque
 * handle lookup while retaining negotiation, payload and commit authority. */
export interface NSEDragSessionPort {
  readonly ownerToken: unknown;
  begin(input: {
    readonly source: DragEndpoint;
    readonly representations: readonly PasteboardRepresentation[];
    readonly operations: readonly TransferDragOperation[];
  }): NSEDragSessionHandle;
  updateDestination(id: string, request: {
    readonly endpoint: DragEndpoint;
    readonly operations: readonly TransferDragOperation[];
    readonly accept?: (session: NSEDragSessionHandle, signal: AbortSignal) => boolean | void | Promise<boolean | void>;
  }): Promise<Readonly<{ operation: DragOperation }>>;
  claimDrop(id: string): void;
  cancelUnclaimed(id: string, reason?: string): boolean;
  readPayload(id: string, types: readonly string[], signal: AbortSignal): readonly PasteboardRepresentation[];
  performDrop(id: string): Promise<Readonly<{ accepted: boolean; operation: DragOperation }>>;
  cancel(id?: string, reason?: string): void;
  snapshot(): Readonly<{ active: NSEDragSessionHandle | null }>;
}
