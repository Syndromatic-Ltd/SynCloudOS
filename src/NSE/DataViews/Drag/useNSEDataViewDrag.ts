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

import type { PasteboardRepresentation, DragEndpoint, TransferDragOperation } from "../../../SynCloudOS/SynCloudOS";
import type { NSEDragSessionPort } from "../../Drag/dragSessionPort";

type NSETransferKey = string | number;

function stableIds<TId extends NSETransferKey>(value: readonly TId[], label: string): readonly TId[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a dense data array.`);
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap;
  const length = descriptors.length;
  if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value > 10_000) {
    throw new TypeError(`${label} exceeds the bounded dense-array limit.`);
  }
  const allowed = new Set<PropertyKey>(["length", ...Array.from({ length: length.value as number }, (_, index) => String(index))]);
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) throw new TypeError(`${label} must be a dense data array.`);
  const output: TId[] = [];
  const seen = new Set<NSETransferKey>();
  for (let index = 0; index < (length.value as number); index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
      throw new TypeError(`${label} must contain enumerable data entries.`);
    }
    const id = descriptor.value;
    if ((typeof id !== "string" || id.length === 0 || id.length > 256) &&
      (typeof id !== "number" || !Number.isSafeInteger(id))) throw new TypeError(`${label} requires bounded stable ids.`);
    if (seen.has(id)) throw new TypeError(`${label} must not contain duplicate ids.`);
    seen.add(id);
    output.push(id as TId);
  }
  return Object.freeze(output);
}

function dropLocation<TId extends NSETransferKey>(value: NSEDataViewDropLocation<TId>): NSEDataViewDropLocation<TId> {
  if (!value || typeof value !== "object") throw new TypeError("Drop location must be a data-property descriptor.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set<PropertyKey>(["targetId", "insertionIndex", "operation"]);
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) throw new TypeError("Drop location contains unsupported fields.");
  const read = (key: string, optional = false) => {
    const descriptor = descriptors[key];
    if (!descriptor && optional) return undefined;
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
      throw new TypeError(`Drop location ${key} must be an enumerable data property.`);
    }
    return descriptor.value;
  };
  const targetId = read("targetId");
  const insertionIndex = read("insertionIndex");
  const operation = read("operation", true) ?? "on";
  if (targetId !== null && (typeof targetId !== "string" || targetId.length === 0 || targetId.length > 256) &&
    (typeof targetId !== "number" || !Number.isSafeInteger(targetId))) throw new TypeError("Drop location requires a bounded stable target id.");
  if (!Number.isSafeInteger(insertionIndex) || (insertionIndex as number) < 0 || (insertionIndex as number) > 10_000_000) {
    throw new TypeError("Drop insertion index must be a bounded non-negative integer.");
  }
  if (operation !== "above" && operation !== "on" && operation !== "below") throw new TypeError("Drop location operation is invalid.");
  return Object.freeze({ targetId: targetId as TId | null, insertionIndex: insertionIndex as number, operation });
}

export interface NSEDataViewDropLocation<TId extends NSETransferKey> {
  readonly targetId: TId | null;
  readonly insertionIndex: number;
  readonly operation?: "above" | "on" | "below";
}

export interface NSEDataViewDropProposal<TId extends NSETransferKey> extends NSEDataViewDropLocation<TId> {
  readonly sessionId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
  readonly ids: readonly TId[];
  readonly operation: "above" | "on" | "below";
}

export interface NSEDataViewDragBinding<TId extends NSETransferKey> {
  begin(ids: readonly TId[], source: DragEndpoint): readonly PasteboardRepresentation[];
  update(location: NSEDataViewDropLocation<TId>, target: DragEndpoint): Promise<boolean>;
  drop(location: NSEDataViewDropLocation<TId>, target: DragEndpoint, handlers?: {
    readonly validate?: (proposal: NSEDataViewDropProposal<TId>) => boolean | Promise<boolean>;
    readonly accept?: (proposal: NSEDataViewDropProposal<TId>) => void | Promise<void>;
  }): Promise<boolean>;
  end(reason?: string): void;
  cancel(reason?: string): void;
  dispose(): void;
}

export function createNSEDataViewDragBinding<TId extends NSETransferKey>(options: {
  readonly manager: Pick<NSEDragSessionPort, "begin" | "updateDestination" | "claimDrop" | "cancelUnclaimed" | "performDrop" | "cancel">;
  readonly ownerSignal?: AbortSignal;
  readonly operations?: readonly TransferDragOperation[];
  readonly representations: (ids: readonly TId[]) => readonly PasteboardRepresentation[];
  readonly captureSelection: () => readonly TId[];
  readonly restoreSelection: (snapshot: readonly TId[]) => void;
  readonly onValidateDrop?: (proposal: NSEDataViewDropProposal<TId>) => boolean | Promise<boolean>;
  readonly onAcceptDrop?: (proposal: NSEDataViewDropProposal<TId>) => void | Promise<void>;
}): NSEDataViewDragBinding<TId> {
  let sessionId: string | null = null;
  let orderedIds: readonly TId[] = Object.freeze([]);
  let selection: readonly TId[] = Object.freeze([]);
  let generation = 0;
  let controller: AbortController | null = null;
  let dropClaimed = false;
  let disposed = false;

  const proposal = (location: NSEDataViewDropLocation<TId>, signal: AbortSignal, proposalGeneration = generation) => Object.freeze({
    sessionId: sessionId!,
    generation: proposalGeneration,
    signal,
    ids: orderedIds,
    targetId: location.targetId,
    insertionIndex: location.insertionIndex,
    operation: location.operation ?? "on" as const,
  });
  const restore = () => options.restoreSelection(selection);
  const clear = (reason: string, restoreSource = true) => {
    const currentId = sessionId;
    controller?.abort(new DOMException(reason, "AbortError"));
    controller = null;
    generation += 1;
    sessionId = null;
    dropClaimed = false;
    if (currentId) options.manager.cancel(currentId, reason);
    if (currentId && restoreSource) restore();
  };
  const ownerAbort = () => clear("drag owner was cancelled");
  options.ownerSignal?.addEventListener("abort", ownerAbort, { once: true });
  if (options.ownerSignal?.aborted) ownerAbort();

  return {
    begin(ids, source) {
      if (disposed || options.ownerSignal?.aborted) throw new DOMException("The data-view drag binding is disposed.", "AbortError");
      const nextIds = stableIds(ids, "Data-view drag ids");
      const nextSelection = stableIds(options.captureSelection(), "Data-view selection snapshot");
      const representations = options.representations(nextIds);
      const session = options.manager.begin({
        source,
        operations: options.operations ?? ["move", "copy"],
        representations,
      });
      const previousId = sessionId;
      const previousSelection = selection;
      controller?.abort();
      if (previousId) options.restoreSelection(previousSelection);
      generation += 1;
      orderedIds = nextIds;
      selection = nextSelection;
      sessionId = session.id;
      dropClaimed = false;
      return representations;
    },
    async update(location, target) {
      if (!sessionId) return false;
      const ownedLocation = dropLocation(location);
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const authority = ++generation;
      const currentId = sessionId;
      const valid = (await options.onValidateDrop?.(proposal(ownedLocation, request.signal))) !== false;
      if (!valid || request.signal.aborted || authority !== generation) return false;
      const updated = await options.manager.updateDestination(currentId, {
        endpoint: target,
        operations: options.operations ?? ["move", "copy"],
      });
      return updated.operation !== "none" && !request.signal.aborted && authority === generation;
    },
    async drop(location, target, handlers) {
      if (!sessionId) return false;
      const ownedLocation = dropLocation(location);
      const claimedId = sessionId;
      options.manager.claimDrop(claimedId);
      dropClaimed = true;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const authority = ++generation;
      const currentId = sessionId;
      const currentProposal = proposal(ownedLocation, request.signal, authority);
      const validate = handlers?.validate ?? options.onValidateDrop;
      const accept = handlers?.accept ?? options.onAcceptDrop;
      try {
        if ((await validate?.(currentProposal)) === false) {
          clear("drop rejected");
          return false;
        }
        if (request.signal.aborted || authority !== generation || currentId !== sessionId) return false;
        const negotiated = await options.manager.updateDestination(currentId, {
          endpoint: target,
          operations: options.operations ?? ["move", "copy"],
          accept: async (_session, signal) => {
            signal.throwIfAborted();
            await accept?.(proposal(ownedLocation, signal, authority));
            signal.throwIfAborted();
            return true;
          },
        });
        if (request.signal.aborted || authority !== generation || currentId !== sessionId) return false;
        if (negotiated.operation === "none") {
          clear("drop denied");
          return false;
        }
        const result = await options.manager.performDrop(currentId);
        sessionId = null;
        controller = null;
        dropClaimed = false;
        if (!result.accepted) restore();
        return result.accepted;
      } catch (error) {
        if (sessionId === currentId) clear("drop failed");
        throw error;
      }
    },
    end(reason = "native data-view drag ended") {
      if (!sessionId || dropClaimed) return;
      const currentId = sessionId;
      options.manager.cancelUnclaimed(currentId, reason);
      controller?.abort(new DOMException(reason, "AbortError"));
      controller = null;
      generation += 1;
      sessionId = null;
      restore();
    },
    cancel(reason = "drag cancelled") {
      clear(reason);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      options.ownerSignal?.removeEventListener("abort", ownerAbort);
      clear("drag binding disposed");
    },
  };
}
