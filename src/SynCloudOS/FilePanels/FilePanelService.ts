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

import type {
  FilePanelAcceptType,
  FilePanelAdapter,
  FilePanelCapability,
  FilePanelConflict,
  FilePanelConflictDecision,
  FilePanelReference,
  FilePanelReleaseReason,
  FilePanelResult,
  FilePanelSaveTarget,
  FilePanelService,
  OpenPanelRequest,
  SavePanelRequest,
} from "./filePanelTypes";

const MIME_TYPE = /^[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+-]+|\*)$/;
const FILE_PANEL_CAPABILITIES = new Set<FilePanelCapability>([
  "read",
  "write",
  "multiple-selection",
  "directory",
  "persistent-handle",
  "download-export",
]);

export class FilePanelReferenceError extends Error {
  constructor(
    readonly code: "reference-released" | "permission-required" | "permission-denied" | "permission-revoked" | "operation-aborted" | "operation-failed",
    message: string,
  ) {
    super(message);
    this.name = "FilePanelReferenceError";
  }
}

export function isFilePanelAbort(error: unknown): boolean {
  return error instanceof FilePanelReferenceError && error.code === "operation-aborted"
    || (typeof error === "object" && error !== null && "name" in error && (error as { readonly name?: unknown }).name === "AbortError");
}

export function throwIfFilePanelAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new FilePanelReferenceError("operation-aborted", "The file-panel operation was interrupted.");
}

/** Keeps browser implementation details and potentially sensitive paths out of result diagnostics. */
export function mapFilePanelBrowserException(error: unknown, referenceId?: string): FilePanelResult<never> {
  if (isFilePanelAbort(error)) {
    return { kind: "interrupted", message: "The file-panel request was interrupted." };
  }
  if (error instanceof FilePanelReferenceError) {
    if (error.code === "permission-revoked" && referenceId) {
      return { kind: "revoked", referenceId, message: "File permission was revoked." };
    }
    if (error.code === "permission-denied") {
      return { kind: "denied", reason: "permission", message: "File permission was denied." };
    }
    if (error.code === "permission-required") {
      return { kind: "denied", reason: "policy", message: "File permission requires an active user action." };
    }
  }
  const name = typeof error === "object" && error !== null && "name" in error
    ? (error as { readonly name?: unknown }).name
    : null;
  if (name === "NotAllowedError") {
    return { kind: "denied", reason: "permission", message: "The browser did not grant file access." };
  }
  if (name === "SecurityError") {
    return { kind: "unavailable", missingCapabilities: [], message: "The browser file capability is unavailable in this context." };
  }
  return { kind: "error", message: "The file-panel operation could not be completed." };
}

function stableUnique<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)]);
}

function denseOwnDataArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : null;
  if (!Number.isSafeInteger(length) || length < 0) throw new TypeError(`${label} has an invalid length.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${label} must be dense and contain only enumerable data entries.`);
    }
    result.push(descriptor.value);
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length) {
      throw new TypeError(`${label} must not contain named or symbol entries.`);
    }
  }
  return Object.freeze(result);
}

function ownRecordValues(value: unknown, keys: readonly string[], label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be a record.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain record.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set(keys);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowed.has(key)) throw new TypeError(`${label} contains an unknown property.`);
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) throw new TypeError(`${label}.${key} must be an enumerable data property.`);
    result[key] = descriptor.value;
  }
  for (const key of keys) {
    if (!(key in result)) throw new TypeError(`${label} must own ${key}.`);
  }
  return Object.freeze(result);
}

/** Normalises only chooser metadata. A file's displayed MIME/name is never content validation. */
export function normalizeFilePanelAcceptTypes(accepts: readonly FilePanelAcceptType[]): readonly FilePanelAcceptType[] {
  const acceptEntries = denseOwnDataArray(accepts, "File panel accepts");
  return Object.freeze(acceptEntries.map((accept, index) => {
    const record = ownRecordValues(accept, ["description", "mimeTypes", "extensions"], `File panel accept ${index}`);
    if (typeof record.description !== "string") throw new TypeError("File panel accept descriptions must be strings.");
    const description = record.description.trim();
    if (!description) throw new TypeError("File panel accept descriptions must not be empty.");
    const mimeTypes = stableUnique(denseOwnDataArray(record.mimeTypes, `File panel accept ${index} MIME types`).map((raw) => {
      if (typeof raw !== "string") throw new TypeError("File panel MIME types must be strings.");
      const value = raw.trim().toLowerCase();
      if (!MIME_TYPE.test(value) || value.startsWith("*/")) {
        throw new TypeError(`File panel MIME type is invalid or has a wildcard outside its final subtype: ${value || "(empty)"}.`);
      }
      return value as `${string}/${string}`;
    }));
    const extensions = stableUnique(denseOwnDataArray(record.extensions, `File panel accept ${index} extensions`).map((raw) => {
      if (typeof raw !== "string") throw new TypeError("File panel extensions must be strings.");
      const value = raw.trim().toLowerCase();
      if (!value.startsWith(".") || value.length < 2 || /[\s*]/.test(value)) {
        throw new TypeError(`File panel extension is invalid: ${value || "(empty)"}.`);
      }
      return value as `.${string}`;
    }));
    return Object.freeze({ description, mimeTypes, extensions });
  }));
}

interface ActiveRequest {
  readonly controller: AbortController;
  readonly removeParentAbort: () => void;
  replaced: boolean;
  disposed: boolean;
}

interface FilePanelOperationContext {
  trackAcceptedValues(values: readonly unknown[]): void;
}

function requestId(value: string): string {
  if (typeof value !== "string") throw new TypeError("File panel request IDs must be strings.");
  const id = value.trim();
  if (!id) throw new TypeError("File panel request IDs must not be empty.");
  return id;
}

function ownData<T>(source: object, key: PropertyKey, optional = false): T | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (!descriptor) {
    if (optional) return undefined;
    throw new TypeError(`File panel requests must own ${String(key)}.`);
  }
  if (!("value" in descriptor) || !descriptor.enumerable) throw new TypeError(`File panel request ${String(key)} must be an enumerable data property.`);
  return descriptor.value as T;
}

function requestRecord(request: unknown): object {
  if (typeof request !== "object" || request === null || Array.isArray(request)) {
    throw new TypeError("File panel requests must be records.");
  }
  const prototype = Object.getPrototypeOf(request);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("File panel requests must be plain records.");
  return request;
}

function normalizeCapabilities(value: unknown): readonly FilePanelCapability[] {
  const capabilities = denseOwnDataArray(value, "File panel requirements").map((entry) => {
    if (typeof entry !== "string" || !FILE_PANEL_CAPABILITIES.has(entry as FilePanelCapability)) {
      throw new TypeError("File panel requirements contain an invalid capability.");
    }
    return entry as FilePanelCapability;
  });
  return stableUnique(capabilities);
}

function safeMessage(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim();
  return normalized ? normalized.slice(0, 240) : fallback;
}

function capabilitiesForOpen(request: OpenPanelRequest): readonly FilePanelCapability[] {
  return stableUnique([
    "read" as const,
    ...request.requires,
    ...(request.selection === "multiple-files" ? ["multiple-selection" as const] : []),
    ...(request.selection === "single-directory" ? ["directory" as const] : []),
    ...(request.access === "readwrite" ? ["write" as const, "persistent-handle" as const] : []),
  ]);
}

function capabilitiesForSave(request: SavePanelRequest): readonly FilePanelCapability[] {
  return stableUnique([
    "write" as const,
    ...(request.destination === "persistent-handle-required" ? ["persistent-handle" as const] : []),
  ]);
}

function hasCapabilities(adapter: FilePanelAdapter, required: readonly FilePanelCapability[]): boolean {
  return required.every((capability) => adapter.capabilities.has(capability));
}

function normalizeOpenRequest(request: OpenPanelRequest): OpenPanelRequest {
  const source = requestRecord(request);
  const selection = ownData<OpenPanelRequest["selection"]>(source, "selection");
  const access = ownData<OpenPanelRequest["access"]>(source, "access");
  const accepts = ownData<readonly FilePanelAcceptType[]>(source, "accepts");
  const requires = ownData<readonly FilePanelCapability[]>(source, "requires");
  const validateContent = ownData<OpenPanelRequest["validateContent"]>(source, "validateContent", true);
  if (!(["single-file", "multiple-files", "single-directory"] as const).includes(selection!)) throw new TypeError("File panel selection is invalid.");
  if (!(["read", "readwrite"] as const).includes(access!)) throw new TypeError("File panel access is invalid.");
  if (!Array.isArray(accepts) || !Array.isArray(requires)) throw new TypeError("File panel accepts and requires must be arrays.");
  if (validateContent !== undefined && typeof validateContent !== "function") throw new TypeError("File panel content validation must be callable.");
  return Object.freeze({
    id: requestId(ownData<string>(source, "id")!),
    accepts: normalizeFilePanelAcceptTypes(accepts),
    selection: selection!,
    access: access!,
    requires: normalizeCapabilities(requires),
    ...(validateContent ? { validateContent } : {}),
  });
}

function normalizeSaveRequest(request: SavePanelRequest): SavePanelRequest {
  const source = requestRecord(request);
  const rawName = ownData<string>(source, "suggestedName");
  if (typeof rawName !== "string") throw new TypeError("File panel save names must be strings.");
  const suggestedName = rawName.trim();
  if (!suggestedName) throw new TypeError("File panel save names must not be empty.");
  const accepts = ownData<readonly FilePanelAcceptType[]>(source, "accepts");
  const destination = ownData<SavePanelRequest["destination"]>(source, "destination");
  const conflictPolicy = ownData<SavePanelRequest["conflictPolicy"]>(source, "conflictPolicy");
  const existingTarget = ownData<FilePanelSaveTarget>(source, "existingTarget", true);
  const confirmConflict = ownData<(conflict: FilePanelConflict, signal: AbortSignal) => Promise<FilePanelConflictDecision>>(source, "confirmConflict", true);
  if (!Array.isArray(accepts)) throw new TypeError("File panel accepts must be an array.");
  if (destination !== "persistent-handle-required" && destination !== "handle-or-download") throw new TypeError("File panel destination is invalid.");
  if (conflictPolicy !== "fail-if-exists" && conflictPolicy !== "confirm-replace") throw new TypeError("File panel conflict policy is invalid.");
  if (conflictPolicy === "confirm-replace" && typeof confirmConflict !== "function") throw new TypeError("File panel conflict confirmation must be callable.");
  return Object.freeze({
    id: requestId(ownData<string>(source, "id")!),
    suggestedName,
    accepts: normalizeFilePanelAcceptTypes(accepts),
    destination,
    conflictPolicy,
    ...(existingTarget ? { existingTarget } : {}),
    ...(confirmConflict ? { confirmConflict } : {}),
  }) as SavePanelRequest;
}

function unavailable(required: readonly FilePanelCapability[], adapters: readonly FilePanelAdapter[]): FilePanelResult<never> {
  const available = new Set<FilePanelCapability>();
  for (const adapter of adapters) for (const capability of adapter.capabilities) available.add(capability);
  const missing = required.filter((capability) => !available.has(capability));
  return {
    kind: "unavailable",
    missingCapabilities: Object.freeze(missing.length > 0 ? missing : [...required]),
    message: "No permitted file-panel capability can fulfil this request.",
  };
}

function conflictFor(target: FilePanelSaveTarget): FilePanelConflict {
  return {
    kind: "existing-file",
    displayName: target.kind === "file-handle" ? target.reference.name : target.suggestedName,
    target,
  };
}

/**
 * One active user-originated request per stable ID. The service owns lifetime
 * fencing and wrapper cleanup, while adapters own their narrow browser ports.
 */
class DefaultFilePanelService implements FilePanelService {
  readonly #adapters: readonly FilePanelAdapter[];
  readonly #active = new Map<string, ActiveRequest>();
  readonly #references = new Set<FilePanelReference>();
  #disposed = false;

  constructor(adapters: readonly FilePanelAdapter[]) {
    const ids = new Set<string>();
    for (const adapter of adapters) {
      if (!adapter.id.trim()) throw new TypeError("File panel adapter IDs must not be empty.");
      if (ids.has(adapter.id)) throw new TypeError(`File panel adapter IDs must be unique: ${adapter.id}`);
      ids.add(adapter.id);
    }
    this.#adapters = Object.freeze([...adapters]);
  }

  async open(request: OpenPanelRequest, signal?: AbortSignal): Promise<FilePanelResult<FilePanelReference>> {
    let normalized: OpenPanelRequest;
    try { normalized = normalizeOpenRequest(request); } catch (error) {
      return { kind: "error", message: safeMessage(error instanceof Error ? error.message : null, "The open request is invalid.") };
    }
    return this.#run(normalized.id, signal, async (operationSignal, context) => {
      const required = capabilitiesForOpen(normalized);
      const candidates = this.#adapters.filter((candidate) => hasCapabilities(candidate, required) && candidate.supports(normalized));
      if (candidates.length === 0) return unavailable(required, this.#adapters);
      let lastUnavailable: FilePanelResult<FilePanelReference> | null = null;
      for (const adapter of candidates) {
        let result: FilePanelResult<FilePanelReference>;
        try {
          result = await adapter.open(normalized, operationSignal);
        } catch (error) {
          const mapped = mapFilePanelBrowserException(error);
          if (mapped.kind === "unavailable") {
            lastUnavailable = mapped;
            continue;
          }
          throw error;
        }
        if (result.kind === "unavailable") {
          lastUnavailable = result;
          continue;
        }
        if (result.kind !== "accepted") return result;
        context.trackAcceptedValues(result.values);
        const validation = await this.#validateAccepted(normalized, result.values, operationSignal);
        if (validation) return validation;
        return result;
      }
      return lastUnavailable ?? unavailable(required, this.#adapters);
    });
  }

  async save(request: SavePanelRequest, signal?: AbortSignal): Promise<FilePanelResult<FilePanelSaveTarget>> {
    let normalized: SavePanelRequest;
    try { normalized = normalizeSaveRequest(request); } catch (error) {
      return { kind: "error", message: safeMessage(error instanceof Error ? error.message : null, "The save request is invalid.") };
    }
    return this.#run(normalized.id, signal, async (operationSignal, context) => {
      const selected = normalized.existingTarget
        ? { kind: "accepted", values: [normalized.existingTarget] } as const
        : await this.#selectSaveTarget(normalized, operationSignal, context);
      if (selected.kind !== "accepted") return selected;
      context.trackAcceptedValues(selected.values);
      const target = selected.values[0];
      if (!target) return { kind: "cancelled" };
      const conflictResult = await this.#confirmSaveConflict(normalized, target, operationSignal);
      if (conflictResult) return conflictResult;
      return { kind: "accepted", values: Object.freeze([target]) };
    });
  }

  release(reference: FilePanelReference, reason: FilePanelReleaseReason): void {
    this.#references.delete(reference);
    reference.release(reason);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const active of this.#active.values()) {
      active.disposed = true;
      active.controller.abort();
      active.removeParentAbort();
    }
    this.#active.clear();
    for (const reference of [...this.#references]) this.release(reference, "runtime-disposed");
  }

  async #selectSaveTarget(
    request: SavePanelRequest,
    signal: AbortSignal,
    context: FilePanelOperationContext,
  ): Promise<FilePanelResult<FilePanelSaveTarget>> {
    const required = capabilitiesForSave(request);
    const candidates = this.#adapters.filter((candidate) => hasCapabilities(candidate, required) && candidate.supports(request));
    if (candidates.length === 0) return unavailable(required, this.#adapters);
    let lastUnavailable: FilePanelResult<FilePanelSaveTarget> | null = null;
    for (const adapter of candidates) {
      let result: FilePanelResult<FilePanelSaveTarget>;
      try {
        result = await adapter.save(request, signal);
      } catch (error) {
        const mapped = mapFilePanelBrowserException(error);
        if (mapped.kind === "unavailable") {
          lastUnavailable = mapped;
          continue;
        }
        throw error;
      }
      if (result.kind === "unavailable") {
        lastUnavailable = result;
        continue;
      }
      if (result.kind === "accepted") context.trackAcceptedValues(result.values);
      return result;
    }
    return lastUnavailable ?? unavailable(required, this.#adapters);
  }

  async #confirmSaveConflict(
    request: SavePanelRequest,
    target: FilePanelSaveTarget,
    signal: AbortSignal,
  ): Promise<FilePanelResult<FilePanelSaveTarget> | null> {
    if (!target.exists) return null;
    if (request.conflictPolicy === "fail-if-exists") {
      return { kind: "denied", reason: "policy", message: "The selected destination already exists." };
    }
    const decision = await request.confirmConflict(conflictFor(target), signal);
    throwIfFilePanelAborted(signal);
    if (decision === "replace") return null;
    if (decision === "choose-another") return { kind: "choose-another" };
    return { kind: "cancelled" };
  }

  async #validateAccepted(
    request: OpenPanelRequest,
    references: readonly FilePanelReference[],
    signal: AbortSignal,
  ): Promise<FilePanelResult<FilePanelReference> | null> {
    if (!request.validateContent) return null;
    for (const reference of references) {
      try {
        throwIfFilePanelAborted(signal);
        const result = await request.validateContent(reference, signal);
        throwIfFilePanelAborted(signal);
        if (result.ok) continue;
        return { kind: "denied", reason: "policy", message: safeMessage(result.message, "The selected file is not accepted.") };
      } catch (error) {
        return mapFilePanelBrowserException(error, reference.id) as FilePanelResult<FilePanelReference>;
      }
    }
    return null;
  }

  #retain(references: readonly FilePanelReference[]): void {
    for (const reference of references) this.#references.add(reference);
  }

  #retainAcceptedValues(values: readonly unknown[]): void {
    for (const value of values) {
      if (isReference(value)) this.#retain([value]);
      else if (isSaveTarget(value) && value.kind === "file-handle" && isReference(value.reference)) this.#retain([value.reference]);
    }
  }

  async #run<T>(
    id: string,
    parentSignal: AbortSignal | undefined,
    operation: (signal: AbortSignal, context: FilePanelOperationContext) => Promise<FilePanelResult<T>>,
  ): Promise<FilePanelResult<T>> {
    if (this.#disposed) return { kind: "interrupted", message: "The file-panel service is disposed." };
    const previous = this.#active.get(id);
    if (previous) {
      previous.replaced = true;
      previous.controller.abort();
      previous.removeParentAbort();
    }
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (parentSignal?.aborted) controller.abort();
    else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    const active: ActiveRequest = {
      controller,
      replaced: false,
      disposed: false,
      removeParentAbort: () => parentSignal?.removeEventListener("abort", abortFromParent),
    };
    this.#active.set(id, active);
    const provisional = new Set<FilePanelReference>();
    const context: FilePanelOperationContext = {
      trackAcceptedValues: (values) => {
        for (const reference of referencesIn(values)) provisional.add(reference);
      },
    };
    const interruptionReason = (): FilePanelReleaseReason => {
      if (active.replaced) return "request-replaced";
      if (active.disposed || this.#disposed) return "runtime-disposed";
      return "caller-finished";
    };
    const releaseProvisional = (reason: FilePanelReleaseReason) => {
      for (const reference of provisional) this.release(reference, reason);
      provisional.clear();
    };
    try {
      const result = await operation(controller.signal, context);
      if (result.kind === "accepted") context.trackAcceptedValues(result.values);
      const current = this.#active.get(id);
      if (this.#disposed || active.replaced || current !== active || controller.signal.aborted) {
        releaseProvisional(interruptionReason());
        return { kind: "interrupted", message: active.replaced ? "The file-panel request was replaced." : "The file-panel request was interrupted." };
      }
      if (result.kind === "accepted") {
        this.#retainAcceptedValues(result.values);
        provisional.clear();
      } else {
        releaseProvisional("caller-finished");
      }
      return result;
    } catch (error) {
      const interrupted = this.#disposed || active.replaced || active.disposed || controller.signal.aborted || isFilePanelAbort(error);
      releaseProvisional(interrupted ? interruptionReason() : "caller-finished");
      if (interrupted) {
        return { kind: "interrupted", message: active.replaced ? "The file-panel request was replaced." : "The file-panel request was interrupted." };
      }
      return mapFilePanelBrowserException(error);
    } finally {
      active.removeParentAbort();
      if (this.#active.get(id) === active) this.#active.delete(id);
    }
  }

}

function referencesIn(values: readonly unknown[]): readonly FilePanelReference[] {
  const references = new Set<FilePanelReference>();
  for (const value of values) {
    if (isReference(value)) references.add(value);
    else if (isSaveTarget(value) && value.kind === "file-handle" && isReference(value.reference)) references.add(value.reference);
  }
  return [...references];
}

function isReference(value: unknown): value is FilePanelReference {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { readonly kind?: unknown; readonly release?: unknown; readonly issuedByRequestId?: unknown };
  return (candidate.kind === "ephemeral-file" || candidate.kind === "file-handle" || candidate.kind === "directory-handle")
    && typeof candidate.release === "function"
    && typeof candidate.issuedByRequestId === "string";
}

function isSaveTarget(value: unknown): value is FilePanelSaveTarget {
  return typeof value === "object" && value !== null && "sink" in value && "exists" in value;
}

export function createFilePanelService(adapters: readonly FilePanelAdapter[]): FilePanelService {
  return new DefaultFilePanelService(adapters);
}
