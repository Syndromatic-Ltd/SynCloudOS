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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import { normalisePasteboardRepresentations } from "../Pasteboard";
import type {
  CreateDragSessionManagerOptions,
  DragDestinationRequest,
  DragEndpoint,
  DragOperation,
  RuntimeDragEndpointAuthority,
  DragSession,
  DragSessionManager,
  TransferDragOperation,
} from "./dragTypes";

function abortError(reason = "The drag session was cancelled.") {
  return new DOMException(reason, "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : typeof error === "object" && error !== null && "name" in error
      && (error as { readonly name?: unknown }).name === "AbortError";
}

function dataRecord(value: unknown, label: string): PropertyDescriptorMap {
  if (!value || typeof value !== "object") throw new TypeError(`${label} must be a data-property descriptor.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain data-property descriptor.`);
  return Object.getOwnPropertyDescriptors(value);
}

function dataField(descriptors: PropertyDescriptorMap, key: string, label: string, optional = false): unknown {
  const descriptor = descriptors[key];
  if (!descriptor && optional) return undefined;
  if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
    throw new TypeError(`${label}.${key} must be an enumerable own data property.`);
  }
  return descriptor.value;
}

function exactFields(descriptors: PropertyDescriptorMap, allowed: readonly string[], label: string): void {
  const names = new Set<PropertyKey>(allowed);
  if (Reflect.ownKeys(descriptors).some((key) => !names.has(key))) {
    throw new TypeError(`${label} contains unsupported descriptor fields.`);
  }
}

function endpoint(value: unknown): DragEndpoint {
  const descriptors = dataRecord(value, "Drag endpoint");
  exactFields(descriptors, ["appId", "windowId", "responderId"], "Drag endpoint");
  const fields = [
    dataField(descriptors, "appId", "Drag endpoint"),
    dataField(descriptors, "windowId", "Drag endpoint"),
    dataField(descriptors, "responderId", "Drag endpoint"),
  ];
  if (fields.some((field) => typeof field !== "string" || field.length === 0 || field.length > 256)) {
    throw new TypeError("Drag endpoints require bounded app, window and responder identities.");
  }
  return Object.freeze({ appId: fields[0] as string, windowId: fields[1] as string, responderId: fields[2] as string });
}

function operations(values: unknown) {
  if (!Array.isArray(values)) throw new TypeError("Drag operations must be a dense data array.");
  const descriptors = Object.getOwnPropertyDescriptors(values) as unknown as PropertyDescriptorMap;
  const lengthDescriptor = descriptors.length;
  const length = lengthDescriptor && "value" in lengthDescriptor && !lengthDescriptor.get && !lengthDescriptor.set
    ? lengthDescriptor.value
    : undefined;
  if (!Number.isSafeInteger(length) || (length as number) === 0 || (length as number) > 3) {
    throw new TypeError("Drag sessions require one to three operations.");
  }
  exactFields(descriptors, ["length", ...Array.from({ length: length as number }, (_, index) => String(index))], "Drag operations");
  const result: TransferDragOperation[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    const value = dataField(descriptors, String(index), "Drag operations");
    if (value !== "copy" && value !== "move" && value !== "link") throw new TypeError("Unsupported drag operation.");
    if (!result.includes(value)) result.push(value);
  }
  if (result.some((value) => value !== "copy" && value !== "move" && value !== "link")) {
    throw new TypeError("Unsupported drag operation.");
  }
  return Object.freeze(result);
}

function representationTypes(values: unknown): readonly string[] {
  if (!Array.isArray(values)) throw new TypeError("Drag payload types must be a dense data array.");
  const descriptors = Object.getOwnPropertyDescriptors(values) as unknown as PropertyDescriptorMap;
  const lengthDescriptor = descriptors.length;
  const length = lengthDescriptor && "value" in lengthDescriptor && !lengthDescriptor.get && !lengthDescriptor.set
    ? lengthDescriptor.value
    : undefined;
  if (!Number.isSafeInteger(length) || (length as number) === 0 || (length as number) > 32) {
    throw new TypeError("Drag payload type requests require one to thirty-two entries.");
  }
  exactFields(descriptors, ["length", ...Array.from({ length: length as number }, (_, index) => String(index))], "Drag payload types");
  const output: string[] = [];
  for (let index = 0; index < (length as number); index += 1) {
    const value = dataField(descriptors, String(index), "Drag payload types");
    if (typeof value !== "string" || value.length < 3 || value.length > 255 ||
      !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(value)) {
      throw new TypeError("Drag payload types must be bounded MIME strings.");
    }
    if (!output.includes(value)) output.push(value);
  }
  return Object.freeze(output);
}

function beginInput(value: unknown) {
  const descriptors = dataRecord(value, "Drag session input");
  exactFields(descriptors, ["source", "representations", "operations"], "Drag session input");
  return {
    source: dataField(descriptors, "source", "Drag session input"),
    representations: dataField(descriptors, "representations", "Drag session input") as Parameters<typeof normalisePasteboardRepresentations>[0],
    operations: dataField(descriptors, "operations", "Drag session input"),
  };
}

function destinationRequest(value: unknown): DragDestinationRequest {
  const descriptors = dataRecord(value, "Drag destination request");
  exactFields(descriptors, ["endpoint", "operations", "accept"], "Drag destination request");
  const accept = dataField(descriptors, "accept", "Drag destination request", true);
  if (accept !== undefined && typeof accept !== "function") throw new TypeError("Drag destination accept must be a function.");
  return Object.freeze({
    // Preserve the opaque runtime-issued endpoint object for later identity
    // revalidation; normalisation happens only after the authority resolves it.
    endpoint: dataField(descriptors, "endpoint", "Drag destination request") as DragEndpoint,
    operations: operations(dataField(descriptors, "operations", "Drag destination request")),
    ...(accept === undefined ? {} : { accept: accept as DragDestinationRequest["accept"] }),
  });
}

function publish(session: DragSession): DragSession {
  return Object.freeze({ ...session });
}

function leaseId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new TypeError("Drag authority lease identities must be bounded strings.");
  }
  return value;
}

function endpointEquals(left: DragEndpoint, right: DragEndpoint): boolean {
  return normalizeBundleIdentifier(left.appId) === normalizeBundleIdentifier(right.appId) && left.windowId === right.windowId && left.responderId === right.responderId;
}

function authorityError() { return new DOMException("Drag endpoint authority was denied.", "SecurityError"); }

export function createDragSessionManager(options: CreateDragSessionManagerOptions): DragSessionManager {
  let active: DragSession | null = null;
  let destination: DragDestinationRequest | null = null;
  let grant: Readonly<{ readonly generation: number; readonly leaseId: string }> | null = null;
  let operationController: AbortController | null = null;
  let payload: ReturnType<typeof normalisePasteboardRepresentations> = Object.freeze([]);
  let dropClaimed = false;
  let disposed = false;
  let generation = 0;
  let ready: Promise<void> = Promise.resolve();
  let sourceAuthority: RuntimeDragEndpointAuthority | null = null;
  let destinationAuthority: RuntimeDragEndpointAuthority | null = null;
  let sourceEndpointValue: unknown = null;
  let destinationEndpointValue: unknown = null;

  const replace = (next: DragSession | null) => { active = next ? publish(next) : null; };
  const authorise = options.authorise ?? (() => false);
  const policyRequest = (
    session: DragSession,
    target: DragEndpoint,
    operation: TransferDragOperation,
    phase: "negotiate" | "commit",
    authority: Readonly<{ readonly generation: number; readonly leaseId: string }>,
  ) => Object.freeze({
    sessionId: session.id,
    generation: authority.generation,
    leaseId: authority.leaseId,
    source: session.source,
    destination: target,
    operation,
    representationTypes: session.representationTypes,
    origin: "drag" as const,
    capability: normalizeBundleIdentifier(session.source.appId) === normalizeBundleIdentifier(target.appId)
      ? "transfer.same-application" as const
      : "transfer.cross-application" as const,
    phase,
  });
  const abortOperation = (reason: string) => {
    if (operationController && !operationController.signal.aborted) operationController.abort(abortError(reason));
    operationController = null;
  };
  const current = (id: string) => {
    if (!active || active.id !== id || disposed) throw abortError("The drag session is no longer authoritative.");
    return active;
  };
  // The drag board is a kernel-owned single-session mirror. Source endpoint
  // leases are intentionally used for publication but never for teardown: a
  // mount can revoke its lease while cancellation is still required. A
  // synchronous kernel clear also increments the board epoch before a newer
  // session can publish, so an old delayed source clear cannot erase it.
  const clearSourceBoard = () => { options.pasteboard.clear(); };
  const resolveEndpointAuthority = (value: unknown, role: "source" | "destination") => {
    if (!options.resolveEndpoint) return { endpoint: endpoint(value), authority: null };
    const authority = options.resolveEndpoint(value, role);
    if (!authority || !authority.isLive()) throw authorityError();
    return { endpoint: endpoint(authority.endpoint), authority };
  };
  const authorityStillLive = (value: unknown, role: "source" | "destination", expected: RuntimeDragEndpointAuthority | null, expectedEndpoint: DragEndpoint | null) => {
    if (!options.resolveEndpoint) return true;
    const authority = options.resolveEndpoint(value, role);
    return Boolean(authority && authority === expected && authority.isLive() && expectedEndpoint && endpointEquals(authority.endpoint, expectedEndpoint));
  };
  const beginOperation = (id: string) => {
    current(id);
    abortOperation("A newer drag operation superseded this request.");
    const controller = new AbortController();
    const runtimeAbort = () => controller.abort(abortError("The runtime disposed the drag session."));
    options.signal.addEventListener("abort", runtimeAbort, { once: true });
    if (options.signal.aborted) runtimeAbort();
    operationController = controller;
    return { controller, release: () => options.signal.removeEventListener("abort", runtimeAbort) };
  };

  return {
    runtimeId: options.runtimeId,
    ownerToken: options.ownerToken,
    begin(input) {
      if (disposed || options.signal.aborted) throw abortError("The drag manager is disposed.");
      const ownedInput = beginInput(input);
      const representations = normalisePasteboardRepresentations(ownedInput.representations);
      if (representations.some(({ type }) => type.startsWith("image/") || type === "application/octet-stream")) {
        throw new TypeError("Drag sessions accept only string or bounded canonical representations; files require resource leases.");
      }
      const resolvedSource = resolveEndpointAuthority(ownedInput.source, "source");
      const next: DragSession = {
        id: `${options.runtimeId}:drag:${leaseId(options.randomUUID())}`,
        phase: "dragging",
        source: resolvedSource.endpoint,
        destination: null,
        operations: operations(ownedInput.operations),
        operation: "none",
        representations,
        representationTypes: Object.freeze(representations.map(({ type }) => type)),
      };
      if (active) this.cancel(active.id, "A newer drag session began.");
      generation += 1;
      destination = null;
      grant = null;
      sourceAuthority = resolvedSource.authority;
      destinationAuthority = null;
      sourceEndpointValue = ownedInput.source;
      destinationEndpointValue = null;
      payload = representations;
      dropClaimed = false;
      replace(next);
      const authority = generation;
      const sourceBoard = resolvedSource.authority?.pasteboard ?? options.pasteboard;
      ready = sourceBoard.write(representations).then(() => undefined).catch((error: unknown) => {
        // The session owns its canonical payload. An unrelated board mutation
        // may supersede this mirroring write, but it cannot revoke that lease.
        if (isAbortError(error) && authority === generation && active?.id === next.id) return;
        if (authority === generation && active?.id === next.id) this.cancel(next.id, "The drag payload was rejected.");
        throw error;
      });
      // Cancellation may happen before a destination awaits readiness. Keep the
      // rejecting promise observable to later operations without leaking an
      // unhandled rejection from an owner-driven cancellation.
      void ready.catch(() => undefined);
      return active!;
    },
    async updateDestination(id, request) {
      const session = current(id);
      const ownedRequest = destinationRequest(request);
      const authority = ++generation;
      const operation = beginOperation(id);
      try {
        await ready;
        operation.controller.signal.throwIfAborted();
        const resolvedDestination = resolveEndpointAuthority(ownedRequest.endpoint, "destination");
        const target = resolvedDestination.endpoint;
        const offered = ownedRequest.operations;
        let selected: DragOperation = "none";
        let selectedGrant: typeof grant = null;
        for (const candidate of offered) {
          if (!session.operations.includes(candidate)) continue;
          const candidateGrant = Object.freeze({ generation: authority, leaseId: leaseId(options.randomUUID()) });
          if (!authorityStillLive(sourceEndpointValue, "source", sourceAuthority, session.source) ||
            !authorityStillLive(ownedRequest.endpoint, "destination", resolvedDestination.authority, target)) throw authorityError();
          if (await authorise(policyRequest(session, target, candidate, "negotiate", candidateGrant), operation.controller.signal)) {
            if (!authorityStillLive(sourceEndpointValue, "source", sourceAuthority, session.source) ||
              !authorityStillLive(ownedRequest.endpoint, "destination", resolvedDestination.authority, target)) throw authorityError();
            selected = candidate;
            selectedGrant = candidateGrant;
            break;
          }
          operation.controller.signal.throwIfAborted();
        }
        if (authority !== generation || active?.id !== id) throw abortError();
        destination = ownedRequest;
        destinationAuthority = resolvedDestination.authority;
        destinationEndpointValue = ownedRequest.endpoint;
        grant = selectedGrant;
        replace({ ...session, phase: "over-destination", destination: target, operation: selected });
        return active!;
      } catch (error) {
        if (active?.id === id) this.cancel(id, "Drag destination authorisation failed.");
        throw error;
      } finally {
          operation.release();
          if (operationController === operation.controller) operationController = null;
        }
    },
    claimDrop(id) {
      const session = current(id);
      if (session.phase !== "dragging" && session.phase !== "over-destination") {
        throw abortError("The drag session cannot claim a drop in its current phase.");
      }
      dropClaimed = true;
    },
    cancelUnclaimed(id, reason = "The native drag source ended without a claimed drop.") {
      if (!active || active.id !== id || disposed) return false;
      if (dropClaimed) return false;
      this.cancel(id, reason);
      return true;
    },
    readPayload(id, types, signal) {
      signal.throwIfAborted();
      const session = current(id);
      if (!dropClaimed || session.phase !== "dropping" || !grant || !destination || operationController?.signal !== signal) {
        throw abortError("The drag payload is not owned by the active dropping lease.");
      }
      if (!authorityStillLive(sourceEndpointValue, "source", sourceAuthority, session.source) ||
        !authorityStillLive(destinationEndpointValue, "destination", destinationAuthority, session.destination)) throw authorityError();
      const requested = representationTypes(types);
      return Object.freeze(payload.filter(({ type }) => requested.includes(type)));
    },
    async performDrop(id) {
      const session = current(id);
      if (!destination || !grant || session.phase !== "over-destination" || session.operation === "none") {
        this.cancel(id, "No authorised drop destination.");
        return { accepted: false, operation: "none" };
      }
      const authority = ++generation;
      const operation = beginOperation(id);
      replace({ ...session, phase: "dropping" });
      try {
        if (!authorityStillLive(sourceEndpointValue, "source", sourceAuthority, session.source) ||
          !authorityStillLive(destinationEndpointValue, "destination", destinationAuthority, session.destination)) throw authorityError();
        if (!await authorise(
          policyRequest(session, session.destination!, session.operation as TransferDragOperation, "commit", grant),
          operation.controller.signal,
        )) {
          this.cancel(id, "Transfer policy denied the drop at commit.");
          return { accepted: false, operation: "none" };
        }
        operation.controller.signal.throwIfAborted();
        if (!authorityStillLive(sourceEndpointValue, "source", sourceAuthority, session.source) ||
          !authorityStillLive(destinationEndpointValue, "destination", destinationAuthority, session.destination)) throw authorityError();
        const accepted = (await destination.accept?.(active!, operation.controller.signal)) !== false;
        operation.controller.signal.throwIfAborted();
        if (!authorityStillLive(sourceEndpointValue, "source", sourceAuthority, session.source) ||
          !authorityStillLive(destinationEndpointValue, "destination", destinationAuthority, session.destination)) throw authorityError();
        if (authority !== generation || active?.id !== id) throw abortError();
        const selected = active.operation;
        replace({ ...active, phase: accepted ? "completed" : "cancelled" });
        replace(null);
        destination = null;
        grant = null;
        sourceAuthority = null;
        destinationAuthority = null;
        sourceEndpointValue = null;
        destinationEndpointValue = null;
        payload = Object.freeze([]);
        dropClaimed = false;
        clearSourceBoard();
        return { accepted, operation: selected };
      } catch (error) {
        if (active?.id === id) this.cancel(id, "Drop failed.");
        throw error;
      } finally {
        operation.release();
        if (operationController === operation.controller) operationController = null;
      }
    },
    cancel(id, reason = "The drag session was cancelled.") {
      if (!active || (id && active.id !== id)) return;
      generation += 1;
      abortOperation(reason);
      replace(null);
      destination = null;
      grant = null;
      sourceAuthority = null;
      destinationAuthority = null;
      sourceEndpointValue = null;
      destinationEndpointValue = null;
      payload = Object.freeze([]);
      dropClaimed = false;
      clearSourceBoard();
    },
    snapshot() { return Object.freeze({ active }); },
    dispose() {
      if (disposed) return;
      this.cancel(undefined, "The drag manager was disposed.");
      disposed = true;
    },
  };
}
