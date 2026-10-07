/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  createNSEDataViewDragBinding,
  type NSEDataViewDragBinding,
  type NSEDataViewDropLocation,
} from "../../NSE/DataViews/Drag";
import type { NSEColourPanelProviderProps } from "../../NSE/Colour/ColourPanel/NSEColourPanelProvider";
import type { PasteboardRepresentation } from "../SynCloudOS";
import type { AppDragClient, AppDragOperation, AppDragRepresentation, AppDragSession } from "./appClientTypes";

type NSETransferKey = string | number;
type NSEDragSessionPort = NonNullable<NSEColourPanelProviderProps["drag"]>["manager"];
type NSEDragSessionHandle = ReturnType<NSEDragSessionPort["begin"]>;

/**
 * Binds NSE's private lookup handles to opaque AppSDK sessions. The mounted
 * client remains authoritative for every operation receipt and payload read;
 * application code receives neither a manager nor a manager session record.
 */
function createNSEDragSessionPort(drag: AppDragClient, ownerToken: unknown = Object.freeze({})): NSEDragSessionPort {
  const issuedBySession = new WeakMap<object, NSEDragSessionHandle>();
  const sessionsById = new Map<string, AppDragSession>();
  let sequence = 0;
  const issue = (session: AppDragSession): NSEDragSessionHandle => {
    const existing = issuedBySession.get(session as object);
    if (existing) return existing;
    const id = `synapp:nse-drag:${++sequence}`;
    const issued = Object.freeze({ id });
    issuedBySession.set(session as object, issued);
    sessionsById.set(id, session);
    return issued;
  };
  const resolve = (id: string): AppDragSession => {
    const session = sessionsById.get(id);
    if (!session) throw new DOMException("The NSE drag session is not current for this application.", "SecurityError");
    return session;
  };
  return Object.freeze<NSEDragSessionPort>({
    ownerToken,
    begin(input) {
      const session = drag.begin(input);
      return issue(session);
    },
    async updateDestination(id, request) {
      const session = resolve(id);
      return drag.updateDestination(session, {
        endpoint: request.endpoint,
        operations: request.operations,
        ...(request.accept ? {
          accept: async (_candidate, signal) => request.accept!(issue(session), signal),
        } : {}),
      });
    },
    claimDrop(id) { drag.claimDrop(resolve(id)); },
    cancelUnclaimed(id, reason) {
      const session = sessionsById.get(id);
      if (!session) return false;
      const cancelled = drag.cancelUnclaimed(session, reason);
      if (cancelled) sessionsById.delete(id);
      return cancelled;
    },
    readPayload(id, types, signal) {
      // The runtime manager has validated these representations and owns the
      // payload lease; AppSDK intentionally exposes only their generic shape.
      return drag.readPayload(resolve(id), types, signal) as readonly PasteboardRepresentation[];
    },
    async performDrop(id) {
      try { return await drag.performDrop(resolve(id)); }
      finally { sessionsById.delete(id); }
    },
    cancel(id, reason) {
      if (id === undefined) return;
      const session = sessionsById.get(id);
      if (!session) return;
      drag.cancel(session, reason);
      sessionsById.delete(id);
    },
    snapshot() {
      const active = drag.active();
      return Object.freeze({ active: active ? issue(active) : null });
    },
  });
}

export interface SynWareNSEDataViewDropProposal<TId extends NSETransferKey> extends NSEDataViewDropLocation<TId> {
  readonly sessionId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
  readonly ids: readonly TId[];
  readonly operation: "above" | "on" | "below";
}

export interface SynWareNSEDataViewDragOptions<TId extends NSETransferKey> {
  readonly drag: AppDragClient;
  readonly ownerSignal?: AbortSignal;
  readonly operations?: readonly AppDragOperation[];
  readonly representations: (ids: readonly TId[]) => readonly AppDragRepresentation[];
  readonly captureSelection: () => readonly TId[];
  readonly restoreSelection: (snapshot: readonly TId[]) => void;
  readonly onValidateDrop?: (proposal: SynWareNSEDataViewDropProposal<TId>) => boolean | Promise<boolean>;
  readonly onAcceptDrop?: (proposal: SynWareNSEDataViewDropProposal<TId>) => void | Promise<void>;
}

export function createSynWareNSEDataViewDragBinding<TId extends NSETransferKey>(
  options: SynWareNSEDataViewDragOptions<TId>,
): NSEDataViewDragBinding<TId> {
  return createNSEDataViewDragBinding({
    manager: createNSEDragSessionPort(options.drag),
    ownerSignal: options.ownerSignal,
    operations: options.operations,
    representations: options.representations as (ids: readonly TId[]) => readonly PasteboardRepresentation[],
    captureSelection: options.captureSelection,
    restoreSelection: options.restoreSelection,
    onValidateDrop: options.onValidateDrop,
    onAcceptDrop: options.onAcceptDrop,
  });
}

/** Internal bridge for the NSE colour-control provider. It binds the panel to
 * opaque AppSDK drag sessions without exposing a drag manager to its caller. */
export function createSynWareNSEColourPanelDragPort(
  drag: AppDragClient,
  ownerToken: object,
): NonNullable<NSEColourPanelProviderProps["drag"]> {
  const manager = createNSEDragSessionPort(drag, ownerToken);
  return Object.freeze({
    manager,
    endpoint: drag.endpoint(),
    endpointForResponder(responderId: string) {
      return drag.endpoint({ responderId });
    },
  });
}
