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

import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeOwnerToken } from "../Runtime/runtimeOwner";
import type { PasteboardRepresentation } from "../Pasteboard";
import type { Pasteboard as PasteboardContract, PasteboardHandle } from "../Pasteboard/pasteboardTypes";

export type DragOperation = "none" | "copy" | "move" | "link";
export type TransferDragOperation = Exclude<DragOperation, "none">;
export type DragPhase = "dragging" | "over-destination" | "dropping" | "completed" | "cancelled";

export interface DragEndpoint {
  readonly appId: string;
  readonly windowId: string;
  readonly responderId: string;
}

export interface DragSession {
  readonly id: string;
  readonly phase: DragPhase;
  readonly source: DragEndpoint;
  readonly destination: DragEndpoint | null;
  readonly operations: readonly TransferDragOperation[];
  readonly operation: DragOperation;
  readonly representations: readonly PasteboardRepresentation[];
  readonly representationTypes: readonly string[];
}

export interface DragDestinationRequest {
  readonly endpoint: DragEndpoint;
  readonly operations: readonly TransferDragOperation[];
  readonly accept?: (session: DragSession, signal: AbortSignal) => boolean | void | Promise<boolean | void>;
}

export interface DragPolicyRequest {
  readonly sessionId: string;
  readonly generation: number;
  readonly leaseId: string;
  readonly source: DragEndpoint;
  readonly destination: DragEndpoint;
  readonly operation: TransferDragOperation;
  readonly representationTypes: readonly string[];
  readonly origin: "drag";
  readonly capability: "transfer.same-application" | "transfer.cross-application";
  readonly phase: "negotiate" | "commit";
}

/** Internal result returned only by the runtime transfer authority.  The
 * manager keeps the opaque original endpoint separately and revalidates this
 * record at negotiation and commit. */
export interface RuntimeDragEndpointAuthority {
  readonly endpoint: DragEndpoint;
  readonly pasteboard: PasteboardHandle;
  isLive(): boolean;
}

/** Explicit cross-application transfer authority. The manager presents the
 * same exact generation-bound lease at negotiation and commit. */
export interface DragAuthorisationPort {
  authorise(request: DragPolicyRequest, signal: AbortSignal): boolean | Promise<boolean>;
}

export interface DragSessionManager {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly ownerToken: RuntimeOwnerToken;
  begin(input: {
    readonly source: DragEndpoint;
    readonly representations: readonly PasteboardRepresentation[];
    readonly operations: readonly TransferDragOperation[];
  }): DragSession;
  updateDestination(id: string, request: DragDestinationRequest): Promise<DragSession>;
  /** Claims a native drop synchronously before validation or policy awaits. */
  claimDrop(id: string): void;
  /** Cancels only an unclaimed source when the browser emits dragend. */
  cancelUnclaimed(id: string, reason?: string): boolean;
  /** Reads manager-owned payload only from the exact active drop lease. */
  readPayload(id: string, types: readonly string[], signal: AbortSignal): readonly PasteboardRepresentation[];
  performDrop(id: string): Promise<Readonly<{ accepted: boolean; operation: DragOperation }>>;
  cancel(id?: string, reason?: string): void;
  snapshot(): Readonly<{ active: DragSession | null }>;
  dispose(): void;
}

export interface CreateDragSessionManagerOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly ownerToken: RuntimeOwnerToken;
  readonly signal: AbortSignal;
  readonly pasteboard: PasteboardContract;
  readonly randomUUID: () => string;
  readonly authorise?: DragAuthorisationPort["authorise"];
  readonly resolveEndpoint?: (endpoint: unknown, role: "source" | "destination") => RuntimeDragEndpointAuthority | null;
}
