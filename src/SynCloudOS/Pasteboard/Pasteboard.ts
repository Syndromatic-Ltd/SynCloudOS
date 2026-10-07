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
  CreatePasteboardRegistryOptions,
  LazyPasteboardRepresentation,
  Pasteboard as PasteboardContract,
  PasteboardAccessContext,
  PasteboardAccessLease,
  PasteboardCanonicalValue,
  PasteboardHandle,
  PasteboardName,
  PasteboardRegistry,
  PasteboardRegistryHandle,
  PasteboardRepresentation,
  PasteboardRepresentationInput,
  PasteboardRuntimeControl,
  PasteboardWriteResult,
} from "./pasteboardTypes";
import { canonicalDocumentJson, immutableDocumentValue } from "../Documents/documentTypes";
import { InvalidPasteboardRepresentationError, PasteboardUnavailableError } from "./pasteboardErrors";

const MAX_REPRESENTATIONS = 64;
const MAX_TEXT_CODE_UNITS = 4 * 1024 * 1024;
const MAX_BINARY_BYTES = 16 * 1024 * 1024;

function abortError(reason?: unknown): DOMException {
  const message = reason instanceof Error
    ? reason.message
    : typeof reason === "string" && reason.length > 0
      ? reason
      : "The pasteboard operation was cancelled.";
  return new DOMException(message, "AbortError");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal.reason);
}

function createOperationSignal(...signals: readonly (AbortSignal | undefined)[]) {
  const controller = new AbortController();
  const abort = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(abortError(source.reason));
  };
  const listeners = signals.flatMap((signal) => signal ? [{ signal, listener: () => abort(signal) }] : []);
  for (const { signal, listener } of listeners) signal.addEventListener("abort", listener, { once: true });
  const aborted = signals.find((signal) => signal?.aborted);
  if (aborted) abort(aborted);
  return {
    signal: controller.signal,
    dispose() {
      for (const { signal, listener } of listeners) signal.removeEventListener("abort", listener);
    },
  };
}

async function awaitAbortable<T>(value: T | PromiseLike<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError(signal.reason)));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(value).then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(error)),
    );
    if (signal.aborted) onAbort();
  });
}

function dataProperty(
  descriptors: Readonly<Record<string, PropertyDescriptor | undefined>>,
  name: string,
): PropertyDescriptor {
  const descriptor = descriptors[name];
  if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
    throw new InvalidPasteboardRepresentationError(
      `Pasteboard field ${name} must be an own data property.`,
    );
  }
  return descriptor;
}

function cloneCanonicalValue(
  value: unknown,
): PasteboardCanonicalValue {
  try {
    const canonical = canonicalDocumentJson(value, "pasteboard.custom", {
      maxDepth: 32,
      maxNodes: 4_096,
      maxBytes: MAX_TEXT_CODE_UNITS,
    });
    return immutableDocumentValue(JSON.parse(canonical), "pasteboard.custom") as PasteboardCanonicalValue;
  } catch (cause) {
    const error = new InvalidPasteboardRepresentationError("Pasteboard custom data must be bounded canonical JSON.");
    (error as Error & { cause?: unknown }).cause = cause;
    throw error;
  }
}

function cloneBlob(value: unknown): Blob {
  if (typeof Blob === "undefined" || !(value instanceof Blob)) {
    throw new InvalidPasteboardRepresentationError("Binary pasteboard representations require a Blob.");
  }
  if (value.size > MAX_BINARY_BYTES) {
    throw new InvalidPasteboardRepresentationError(`Binary pasteboard data exceeds the ${MAX_BINARY_BYTES} byte limit.`);
  }
  return value.slice(0, value.size, value.type);
}

function normaliseType(value: unknown): PasteboardRepresentation["type"] {
  if (typeof value !== "string" || value.length < 3 || value.length > 255 ||
    !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(value)) {
    throw new InvalidPasteboardRepresentationError("Pasteboard representation type is invalid.");
  }
  const supported = value.startsWith("text/") || value.startsWith("image/") ||
    value === "application/octet-stream" || value.startsWith("application/x-syncloudos-");
  if (!supported) {
    throw new InvalidPasteboardRepresentationError(`Unsupported pasteboard representation type ${value}.`);
  }
  return value as PasteboardRepresentation["type"];
}

function normaliseRepresentation(typeValue: unknown, value: unknown): PasteboardRepresentation {
  const type = normaliseType(typeValue);
  if (type.startsWith("text/") || type === "application/x-syncloudos-colour") {
    if (typeof value !== "string" || value.length > MAX_TEXT_CODE_UNITS) {
      throw new InvalidPasteboardRepresentationError(`${type} requires bounded string data.`);
    }
    return Object.freeze({ type, value }) as PasteboardRepresentation;
  }
  if (type.startsWith("image/") || type === "application/octet-stream") {
    return Object.freeze({ type, value: cloneBlob(value) }) as PasteboardRepresentation;
  }
  const canonical = cloneCanonicalValue(value);
  if (type === "application/x-syncloudos-document") {
    if (!canonical || Array.isArray(canonical) || typeof canonical !== "object") {
      throw new InvalidPasteboardRepresentationError("Document pasteboard data must be an object.");
    }
    const document = canonical as { readonly [key: string]: PasteboardCanonicalValue };
    const keys = Object.keys(document);
    if (keys.length !== 2 || !keys.includes("typeId") || !keys.includes("documentId") ||
      typeof document.typeId !== "string" || document.typeId.length === 0 ||
      typeof document.documentId !== "string" || document.documentId.length === 0) {
      throw new InvalidPasteboardRepresentationError("Document pasteboard data requires typeId and documentId.");
    }
  }
  return Object.freeze({ type, value: canonical }) as PasteboardRepresentation;
}

function representationDescriptors(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new InvalidPasteboardRepresentationError("Pasteboard representations must be objects.");
  }
  return Object.getOwnPropertyDescriptors(input);
}

export function normalisePasteboardRepresentations(
  inputs: readonly PasteboardRepresentation[],
): readonly PasteboardRepresentation[] {
  const entries = prepareInputs(inputs);
  if (entries.some((entry) => !entry.value)) {
    throw new InvalidPasteboardRepresentationError("Concrete pasteboard normalisation does not accept lazy providers.");
  }
  return Object.freeze(entries.map((entry) => entry.value!));
}

function isLazyRepresentation(
  input: PasteboardRepresentationInput,
  descriptors: PropertyDescriptorMap,
): input is LazyPasteboardRepresentation {
  const provider = descriptors.provide;
  return Boolean(provider && "value" in provider && typeof provider.value === "function" && !provider.get && !provider.set);
}

function arrayDataValues(input: unknown, allowEmpty: boolean): readonly unknown[] {
  if (!Array.isArray(input)) throw new InvalidPasteboardRepresentationError("Pasteboard lists must be arrays.");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const length = dataProperty(descriptors, "length").value;
  if (!Number.isSafeInteger(length) || length < (allowEmpty ? 0 : 1) || length > MAX_REPRESENTATIONS) {
    throw new InvalidPasteboardRepresentationError("Pasteboard list length exceeds the bounded limit.");
  }
  const allowed = new Set<PropertyKey>(["length", ...Array.from({ length }, (_, index) => String(index))]);
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) {
    throw new InvalidPasteboardRepresentationError("Pasteboard arrays must be dense plain data arrays.");
  }
  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = dataProperty(descriptors, String(index));
    if (!descriptor.enumerable) throw new InvalidPasteboardRepresentationError("Pasteboard array slots must be enumerable.");
    values.push(descriptor.value);
  }
  return values;
}

interface OwnedRepresentation {
  readonly type: PasteboardRepresentation["type"];
  value?: PasteboardRepresentation;
  readonly provide?: LazyPasteboardRepresentation["provide"];
  pending?: Promise<PasteboardRepresentation>;
}

function prepareInputs(inputs: readonly PasteboardRepresentationInput[]): readonly OwnedRepresentation[] {
  const output: OwnedRepresentation[] = [];
  const types = new Set<string>();
  for (const unknownInput of arrayDataValues(inputs, true)) {
    const input = unknownInput as PasteboardRepresentationInput;
    const descriptors = representationDescriptors(input);
    const type = normaliseType(dataProperty(descriptors, "type").value);
    const lazy = isLazyRepresentation(input, descriptors);
    const allowed = new Set<PropertyKey>(["type", lazy ? "provide" : "value"]);
    if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key)) ||
      !dataProperty(descriptors, "type").enumerable) {
      throw new InvalidPasteboardRepresentationError("Pasteboard representations require exact enumerable data fields.");
    }
    if (types.has(type)) throw new InvalidPasteboardRepresentationError(`Duplicate pasteboard representation ${type}.`);
    types.add(type);
    if (lazy) {
      if (!dataProperty(descriptors, "provide").enumerable) {
        throw new InvalidPasteboardRepresentationError("Pasteboard providers must be enumerable data fields.");
      }
      output.push({ type, provide: descriptors.provide!.value as LazyPasteboardRepresentation["provide"] });
    } else {
      const value = dataProperty(descriptors, "value");
      if (!value.enumerable) throw new InvalidPasteboardRepresentationError("Pasteboard values must be enumerable data fields.");
      output.push({ type, value: normaliseRepresentation(type, value.value) });
    }
  }
  return Object.freeze(output);
}

function validateTypes(types: readonly string[]): readonly string[] {
  return Object.freeze(arrayDataValues(types, false).map(normaliseType));
}

function cloneSnapshot(values: readonly PasteboardRepresentation[]) { return Object.freeze([...values]); }

function transferCapability(name: PasteboardName): "transfer.same-application" | "transfer.cross-application" {
  return name === "system" ? "transfer.cross-application" : "transfer.same-application";
}

function boundedAccessIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new TypeError(`${label} must be a bounded non-empty identity.`);
  }
  return value;
}

function normaliseAccessContext(value: PasteboardAccessContext): PasteboardAccessContext {
  if (!value || typeof value !== "object") throw new TypeError("Pasteboard access context must be an object.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set<PropertyKey>(["appId", "windowControllerId", "responderId"]);
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) {
    throw new TypeError("Pasteboard access context contains unsupported fields.");
  }
  const appId = boundedAccessIdentifier(dataProperty(descriptors, "appId").value, "Pasteboard appId");
  const readOptional = (key: "windowControllerId" | "responderId") => {
    const descriptor = descriptors[key];
    if (!descriptor) return undefined;
    if (!descriptor.enumerable) throw new TypeError(`Pasteboard ${key} must be enumerable.`);
    return boundedAccessIdentifier(dataProperty(descriptors, key).value, `Pasteboard ${key}`);
  };
  const windowControllerId = readOptional("windowControllerId");
  const responderId = readOptional("responderId");
  return Object.freeze({
    appId,
    ...(windowControllerId === undefined ? {} : { windowControllerId }),
    ...(responderId === undefined ? {} : { responderId }),
  });
}

function isPromiseLike(value: unknown): value is PromiseLike<boolean | { readonly allowed?: unknown }> {
  return Boolean(value && typeof value === "object" && "then" in value && typeof value.then === "function");
}

async function resolvePolicyDecision(
  decision: ReturnType<NonNullable<CreatePasteboardRegistryOptions["authorise"]>>,
  signal: AbortSignal,
): Promise<boolean> {
  const resolved = isPromiseLike(decision)
    ? await awaitAbortable(decision, signal)
    : decision;
  if (resolved === true) return true;
  return Boolean(resolved && typeof resolved === "object" && resolved.allowed === true);
}

function committedEntries(
  entries: readonly OwnedRepresentation[],
  result: PasteboardWriteResult | undefined,
): readonly OwnedRepresentation[] {
  if (!result?.partial) return entries;
  const requestedTypes = new Set<PasteboardRepresentation["type"]>(entries.map((entry) => entry.type));
  const writtenTypes = new Set<PasteboardRepresentation["type"]>(result.writtenTypes.map(normaliseType));
  const omittedTypes = new Set<PasteboardRepresentation["type"]>(result.omittedTypes.map(normaliseType));
  if (writtenTypes.size === 0 || result.writtenTypes.length !== writtenTypes.size) {
    throw new PasteboardUnavailableError("The browser reported a partial pasteboard write without a committed representation.");
  }
  if (result.omittedTypes.length !== omittedTypes.size ||
    [...writtenTypes, ...omittedTypes].some((type) => !requestedTypes.has(type)) ||
    [...writtenTypes].some((type) => omittedTypes.has(type)) ||
    writtenTypes.size + omittedTypes.size !== requestedTypes.size) {
    throw new PasteboardUnavailableError("The browser reported an invalid partial pasteboard write result.");
  }
  return Object.freeze(entries.filter((entry) => writtenTypes.has(entry.type)));
}

function securityDenied(operation: "read" | "write" | "snapshot" | "clear"): DOMException {
  return new DOMException(`Pasteboard ${operation} was denied by PolicyKit.`, "SecurityError");
}

async function materialise(
  entry: OwnedRepresentation,
  callerSignal: AbortSignal,
  createProviderAuthority: () => { readonly signal: AbortSignal; dispose(): void },
  revalidate?: () => void,
): Promise<PasteboardRepresentation> {
  if (entry.value) return entry.value;
  if (!entry.pending) {
    // A previous lazy entry can synchronously retire its mount while this read
    // is traversing the rest of the committed entries. Re-check at the exact
    // provider-invocation boundary, not only before the enclosing read starts.
    revalidate?.();
    const authority = createProviderAuthority();
    let provided: PasteboardRepresentation["value"] | Promise<PasteboardRepresentation["value"]>;
    try {
      provided = entry.provide!.call(undefined, authority.signal);
    } catch (error) {
      provided = Promise.reject(error);
    }
    // A provider result or provider failure is memoised for this committed
    // token. Individual caller cancellation races the shared work below and
    // never changes that memoised result.
    entry.pending = awaitAbortable(provided, authority.signal)
      .then((value) => normaliseRepresentation(entry.type, value))
      .then((value) => { entry.value = value; return value; })
      .finally(() => authority.dispose());
    void entry.pending.catch(() => undefined);
  }
  return await awaitAbortable(entry.pending, callerSignal);
}

export class Pasteboard implements PasteboardContract {
  private entries: readonly OwnedRepresentation[] = Object.freeze([]);
  private committedChanges = 0;
  private operationEpoch = 0;
  private disposed = false;
  private mutationController: AbortController | null = null;
  private tokenController = new AbortController();
  private readonly lifetimeController = new AbortController();
  private readonly onRuntimeAbort = () => {
    if (!this.lifetimeController.signal.aborted) {
      this.lifetimeController.abort(abortError(this.runtimeSignal.reason));
    }
  };

  constructor(
    readonly name: PasteboardName,
    private readonly runtimeId: CreatePasteboardRegistryOptions["runtimeId"] = "runtime:standalone" as CreatePasteboardRegistryOptions["runtimeId"],
    private readonly runtimeSignal: AbortSignal = new AbortController().signal,
    private readonly adapter: CreatePasteboardRegistryOptions["adapter"] = null,
    private readonly authorise: CreatePasteboardRegistryOptions["authorise"] = undefined,
    private readonly standalone = true,
  ) {
    runtimeSignal.addEventListener("abort", this.onRuntimeAbort, { once: true });
    if (runtimeSignal.aborted) this.onRuntimeAbort();
  }

  private async authoriseAccess(
    operation: "read" | "write" | "snapshot" | "clear",
    types: readonly string[],
    signal: AbortSignal,
    context?: PasteboardAccessContext,
  ): Promise<void> {
    if (!this.authorise) return;
    const decision = this.authorise(Object.freeze({
      runtimeId: this.runtimeId,
      name: this.name,
      operation,
      types,
      capability: transferCapability(this.name),
      ...(context === undefined ? {} : { context }),
    }), signal);
    if (!await resolvePolicyDecision(decision, signal)) throw securityDenied(operation);
  }

  get changeCount() { return this.committedChanges; }

  snapshot() {
    if (this.disposed) return Object.freeze([]);
    return cloneSnapshot(this.entries.flatMap((entry) => entry.value ? [entry.value] : []));
  }

  private commit(entries: readonly OwnedRepresentation[]) {
    this.tokenController.abort(abortError("The pasteboard owner changed."));
    this.tokenController = new AbortController();
    this.entries = entries;
    this.committedChanges += 1;
  }

  async write(inputs: readonly PasteboardRepresentationInput[], callerSignal?: AbortSignal) {
    return this.writeWithContext(inputs, callerSignal);
  }

  /** @internal Runtime-scoped facade entry point. */
  async writeWithContext(
    inputs: readonly PasteboardRepresentationInput[],
    callerSignal?: AbortSignal,
    context?: PasteboardAccessContext,
    revalidate?: () => void,
  ) {
    if (this.disposed || this.lifetimeController.signal.aborted) throw abortError("The pasteboard is disposed.");
    const entries = prepareInputs(inputs);
    this.mutationController?.abort(abortError("A newer pasteboard operation superseded this operation."));
    const controller = new AbortController();
    this.mutationController = controller;
    const epoch = ++this.operationEpoch;
    const operation = createOperationSignal(this.runtimeSignal, this.lifetimeController.signal, callerSignal, controller.signal);
    try {
      throwIfAborted(operation.signal);
      await this.authoriseAccess("write", Object.freeze(entries.map((entry) => entry.type)), operation.signal, context);
      revalidate?.();
      throwIfAborted(operation.signal);
      let writeResult: PasteboardWriteResult | undefined;
      if (this.name === "system") {
        if (!this.adapter && !this.standalone) throw new PasteboardUnavailableError("The system pasteboard is unavailable in this environment.");
        const values = await Promise.all(entries.map((entry) => materialise(entry, operation.signal, () => ({
          signal: operation.signal,
          dispose() {},
        }), revalidate)));
        if (this.adapter) {
          writeResult = await awaitAbortable(this.adapter.write(Object.freeze(values), operation.signal), operation.signal) ?? undefined;
        }
      }
      throwIfAborted(operation.signal);
      revalidate?.();
      if (this.disposed || epoch !== this.operationEpoch) throw abortError("The pasteboard owner changed.");
      this.commit(committedEntries(entries, writeResult));
      return writeResult;
    } finally {
      if (this.mutationController === controller) this.mutationController = null;
      operation.dispose();
    }
  }

  async read(types: readonly string[], callerSignal?: AbortSignal) {
    return this.readWithContext(types, callerSignal);
  }

  /** @internal Runtime-scoped facade entry point. */
  async readWithContext(
    types: readonly string[],
    callerSignal?: AbortSignal,
    context?: PasteboardAccessContext,
    revalidate?: () => void,
  ) {
    if (this.disposed || this.lifetimeController.signal.aborted) throw abortError("The pasteboard is disposed.");
    const preferences = validateTypes(types);
    if (this.name === "system") {
      this.mutationController?.abort(abortError("A newer pasteboard operation superseded this operation."));
      const controller = new AbortController();
      this.mutationController = controller;
      const epoch = ++this.operationEpoch;
      const operation = createOperationSignal(this.runtimeSignal, this.lifetimeController.signal, callerSignal, controller.signal);
      try {
        throwIfAborted(operation.signal);
        await this.authoriseAccess("read", preferences, operation.signal, context);
        revalidate?.();
        throwIfAborted(operation.signal);
        if (!this.adapter && !this.standalone) throw new PasteboardUnavailableError("The system pasteboard is unavailable in this environment.");
        if (this.adapter) {
          const raw = await awaitAbortable(this.adapter.read(preferences, operation.signal), operation.signal);
          const entries = prepareInputs(raw);
          throwIfAborted(operation.signal);
          revalidate?.();
          if (this.disposed || epoch !== this.operationEpoch) throw abortError("The pasteboard owner changed.");
          this.commit(entries);
        }
      } finally {
        if (this.mutationController === controller) this.mutationController = null;
        operation.dispose();
      }
    }
    const token = this.tokenController;
    const operation = createOperationSignal(this.runtimeSignal, this.lifetimeController.signal, callerSignal, token.signal);
    try {
      if (this.name !== "system") {
        await this.authoriseAccess("read", preferences, operation.signal, context);
        revalidate?.();
        throwIfAborted(operation.signal);
      }
      const selected = this.entries.filter((entry) => preferences.includes(entry.type));
      const values = await Promise.all(selected.map((entry) => materialise(entry, operation.signal, () =>
        createOperationSignal(this.runtimeSignal, this.lifetimeController.signal, token.signal), revalidate)));
      throwIfAborted(operation.signal);
      revalidate?.();
      return cloneSnapshot(values);
    } finally { operation.dispose(); }
  }

  async readFirst(types: readonly string[], callerSignal?: AbortSignal) {
    return this.readFirstWithContext(types, callerSignal);
  }

  /** @internal Runtime-scoped facade entry point. */
  async readFirstWithContext(
    types: readonly string[],
    callerSignal?: AbortSignal,
    context?: PasteboardAccessContext,
    revalidate?: () => void,
  ) {
    const preferences = validateTypes(types);
    const values = await this.readWithContext(preferences, callerSignal, context, revalidate);
    for (const type of preferences) {
      const match = values.find((value) => value.type === type);
      if (match) return match;
    }
    return null;
  }

  clear() {
    if (this.disposed) return;
    this.operationEpoch += 1;
    this.mutationController?.abort(abortError("The pasteboard was cleared."));
    this.commit(Object.freeze([]));
  }

  async snapshotWithContext(callerSignal: AbortSignal | undefined, context: PasteboardAccessContext, revalidate: () => void): Promise<readonly PasteboardRepresentation[]> {
    if (this.disposed || this.lifetimeController.signal.aborted) throw abortError("The pasteboard is disposed.");
    const operation = createOperationSignal(this.runtimeSignal, this.lifetimeController.signal, callerSignal);
    try {
      revalidate();
      await this.authoriseAccess("snapshot", Object.freeze([]), operation.signal, context);
      revalidate();
      throwIfAborted(operation.signal);
      return cloneSnapshot(this.entries.flatMap((entry) => entry.value ? [entry.value] : []));
    } finally { operation.dispose(); }
  }

  async clearWithContext(callerSignal: AbortSignal | undefined, context: PasteboardAccessContext, revalidate: () => void): Promise<void> {
    if (this.disposed || this.lifetimeController.signal.aborted) throw abortError("The pasteboard is disposed.");
    const operation = createOperationSignal(this.runtimeSignal, this.lifetimeController.signal, callerSignal);
    try {
      revalidate();
      await this.authoriseAccess("clear", Object.freeze(this.entries.map((entry) => entry.type)), operation.signal, context);
      revalidate();
      throwIfAborted(operation.signal);
      this.operationEpoch += 1;
      this.mutationController?.abort(abortError("The pasteboard was cleared."));
      this.commit(Object.freeze([]));
    } finally { operation.dispose(); }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.operationEpoch += 1;
    this.mutationController?.abort(abortError("The pasteboard was disposed."));
    this.lifetimeController.abort(abortError("The pasteboard was disposed."));
    this.tokenController.abort(abortError("The pasteboard was disposed."));
    this.runtimeSignal.removeEventListener("abort", this.onRuntimeAbort);
    this.entries = Object.freeze([]);
  }
}

function validateName(name: PasteboardName): PasteboardName {
  if (name === "system" || name === "drag" || name === "find") return name;
  if (typeof name === "string" && /^app:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(name)) return name;
  throw new TypeError("Pasteboard names must be system, drag, find or a bounded app identity.");
}

interface LeaseRecord {
  readonly context: PasteboardAccessContext;
  readonly validate: () => PasteboardAccessContext | null;
  readonly allowDrag: boolean;
  readonly ownsPrivateBoard: boolean;
  readonly privateBoardGeneration?: number;
}

const runtimeControls = new WeakMap<PasteboardRegistry, PasteboardRuntimeControl>();

/** Obtains the kernel-side issuer attached to a concrete registry.  SynWare
 * never receive this function or the registry's raw board state. */
export function getPasteboardRuntimeControl(registry: PasteboardRegistry): PasteboardRuntimeControl {
  const control = runtimeControls.get(registry);
  if (!control) throw new TypeError("Pasteboard registry has no runtime control.");
  return control;
}

export function createPasteboardRegistry(options: CreatePasteboardRegistryOptions): PasteboardRegistry {
  const boards = new Map<PasteboardName, Pasteboard>();
  const leases = new WeakMap<object, LeaseRecord>();
  // The same application may be mounted more than once. Its private board is
  // app-scoped, so teardown must be ref-counted by the mounts that actually
  // own that board rather than by every incidental endpoint lease.
  const privateBoardClaims = new Map<PasteboardName, Set<object>>();
  // A generation identifies one contiguous live set of mounts. Siblings share
  // it; the first mount after the last claim advances it. Board data carries
  // the generation that wrote it so a reopened mount cannot observe a prior
  // generation while that prior generation's PolicyKit clear is still pending.
  const privateBoardGenerations = new Map<PasteboardName, number>();
  const privateBoardDataGenerations = new Map<PasteboardName, number>();
  const advancePrivateBoardGeneration = (name: PasteboardName): number => {
    const generation = (privateBoardGenerations.get(name) ?? 0) + 1;
    privateBoardGenerations.set(name, generation);
    return generation;
  };
  let disposed = false;
  const named = (input: PasteboardName): Pasteboard => {
    const name = validateName(input);
    const existing = boards.get(name);
    if (existing) return existing;
    if (disposed) throw new Error(`Pasteboard registry ${options.runtimeId} is disposed.`);
    const board = new Pasteboard(
      name,
      options.runtimeId,
      options.signal,
      name === "system" ? options.adapter : null,
      options.authorise,
      false,
    );
    boards.set(name, board);
    return board;
  };
  const resolveLease = (lease: PasteboardAccessLease, operation: "read" | "write" | "snapshot" | "clear") => {
    const record = lease && typeof lease === "object" ? leases.get(lease as object) : undefined;
    if (!record) throw securityDenied(operation);
    const current = record.validate();
    if (!current) throw securityDenied(operation);
    const access = normaliseAccessContext(current);
    if (access.appId !== record.context.appId || access.windowControllerId !== record.context.windowControllerId || access.responderId !== record.context.responderId) {
      throw securityDenied(operation);
    }
    return record.context;
  };
  const handleFor = (board: Pasteboard, lease: PasteboardAccessLease): PasteboardHandle => {
    // Handle construction is deliberately non-authorising. React mounts an
    // application scope before its responder insertion effect has registered
    // the responder. Every value-bearing operation below resolves the opaque
    // lease afresh, so no operation can run through that short render window.
    const record = lease && typeof lease === "object" ? leases.get(lease as object) : undefined;
    if (!record) throw securityDenied("read");
    const context = record.context;
    const privateBoardGeneration = board.name.startsWith("app:") ? record.privateBoardGeneration : undefined;
    const assertPrivateBoardGeneration = () => {
      if (privateBoardGeneration === undefined) return;
      if (privateBoardGenerations.get(board.name) !== privateBoardGeneration) {
        throw abortError("The application-private pasteboard generation retired.");
      }
    };
    const revalidate = (operation: "read" | "write" | "snapshot" | "clear") => () => {
      resolveLease(lease, operation);
      assertPrivateBoardGeneration();
    };
    const requireBoardAuthority = (operation: "read" | "write" | "snapshot" | "clear") => {
      if (board.name === "drag" && !record.allowDrag) throw securityDenied(operation);
    };
    const privateDataIsCurrent = () => privateBoardGeneration === undefined ||
      privateBoardGenerations.get(board.name) === privateBoardGeneration &&
      privateBoardDataGenerations.get(board.name) === privateBoardGeneration;
    const snapshotPrivate = async (signal?: AbortSignal) => {
      const access = resolveLease(lease, "snapshot");
      assertPrivateBoardGeneration();
      if (!privateDataIsCurrent()) return Object.freeze([]);
      const values = await board.snapshotWithContext(signal, access, revalidate("snapshot"));
      return privateDataIsCurrent() ? values : Object.freeze([]);
    };
    const readPrivate = async (types: readonly string[], signal?: AbortSignal) => {
      const access = resolveLease(lease, "read");
      assertPrivateBoardGeneration();
      if (!privateDataIsCurrent()) return Object.freeze([]);
      const values = await board.readWithContext(types, signal, access, revalidate("read"));
      return privateDataIsCurrent() ? values : Object.freeze([]);
    };
    return Object.freeze({
      name: board.name,
      context,
      get changeCount() {
        if (board.name === "drag" && !record.allowDrag) return 0;
        return privateDataIsCurrent() ? board.changeCount : 0;
      },
      async snapshot(signal?: AbortSignal) {
        requireBoardAuthority("snapshot");
        return await snapshotPrivate(signal);
      },
      async write(values: readonly PasteboardRepresentationInput[], signal?: AbortSignal) {
        requireBoardAuthority("write");
        const access = resolveLease(lease, "write");
        const result = await board.writeWithContext(values, signal, access, revalidate("write"));
        if (privateBoardGeneration !== undefined) {
          assertPrivateBoardGeneration();
          privateBoardDataGenerations.set(board.name, privateBoardGeneration);
        }
        return result;
      },
      async read(types: readonly string[], signal?: AbortSignal) {
        requireBoardAuthority("read");
        return await readPrivate(types, signal);
      },
      async readFirst(types: readonly string[], signal?: AbortSignal) {
        requireBoardAuthority("read");
        const values = await readPrivate(types, signal);
        for (const type of types) {
          const match = values.find((value) => value.type === type);
          if (match) return match;
        }
        return null;
      },
      async clear(signal?: AbortSignal) {
        requireBoardAuthority("clear");
        const access = resolveLease(lease, "clear");
        await board.clearWithContext(signal, access, revalidate("clear"));
        if (privateBoardGeneration !== undefined) {
          assertPrivateBoardGeneration();
          privateBoardDataGenerations.delete(board.name);
        }
      },
    });
  };
  const registry: PasteboardRegistry = {
    runtimeId: options.runtimeId,
    get system() { return named("system"); },
    get drag() { return named("drag"); },
    get find() { return named("find"); },
    named,
    forLease(lease: PasteboardAccessLease): PasteboardRegistryHandle {
      const record = lease && typeof lease === "object" ? leases.get(lease as object) : undefined;
      if (!record) throw securityDenied("read");
      const handle = (name: PasteboardName) => {
        const boardName = validateName(name);
        // Application-private boards are a runtime-owned namespace. A live
        // lease for app B can never even acquire a handle for app A's board,
        // so snapshot and clear cannot become cross-owner mutations.
        if (boardName.startsWith("app:") && (!record.ownsPrivateBoard || boardName !== `app:${record.context.appId}`)) {
          throw securityDenied("read");
        }
        return handleFor(named(boardName), lease);
      };
      const system = handleFor(named("system"), lease);
      const drag = handleFor(named("drag"), lease);
      const find = handleFor(named("find"), lease);
      return Object.freeze({
        context: system.context,
        system,
        drag,
        find,
        named: handle,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const board of boards.values()) board.dispose();
    },
  };
  runtimeControls.set(registry, Object.freeze({
    issueLease(
      context: PasteboardAccessContext,
      validate: () => PasteboardAccessContext | null,
      leaseOptions: { readonly allowDrag?: boolean; readonly ownsPrivateBoard?: boolean } = {},
    ): PasteboardAccessLease {
      if (disposed || options.signal.aborted) throw securityDenied("write");
      if (typeof validate !== "function") throw new TypeError("Pasteboard lease validation must be a function.");
      const access = normaliseAccessContext(context);
      const lease = Object.freeze({}) as PasteboardAccessLease;
      const leaseObject = lease as object;
      const ownsPrivateBoard = leaseOptions.ownsPrivateBoard === true;
      let privateBoardGeneration: number | undefined;
      if (ownsPrivateBoard) {
        const name = `app:${access.appId}` as PasteboardName;
        const claims = privateBoardClaims.get(name) ?? new Set<object>();
        privateBoardGeneration = claims.size === 0
          ? advancePrivateBoardGeneration(name)
          : privateBoardGenerations.get(name);
        if (privateBoardGeneration === undefined) privateBoardGeneration = advancePrivateBoardGeneration(name);
        claims.add(leaseObject);
        privateBoardClaims.set(name, claims);
      }
      leases.set(leaseObject, Object.freeze({
        context: access,
        validate,
        allowDrag: leaseOptions.allowDrag === true,
        ownsPrivateBoard,
        ...(privateBoardGeneration === undefined ? {} : { privateBoardGeneration }),
      }));
      return lease;
    },
    async clearLease(lease: PasteboardAccessLease) {
      const record = lease && typeof lease === "object" ? leases.get(lease as object) : undefined;
      if (!record || disposed) return;
      if (!record.ownsPrivateBoard) return;
      const name = `app:${record.context.appId}` as PasteboardName;
      const claims = privateBoardClaims.get(name);
      if (!claims || !claims.delete(lease as object)) return;
      if (claims.size > 0) return;
      privateBoardClaims.delete(name);
      const generation = record.privateBoardGeneration;
      if (generation === undefined) return;
      // Only clear the private board owned by this lease. Shared system/find
      // boards belong to the runtime, while drag cleanup is owned by the drag
      // session manager and must not erase a sibling's payload.
      const board = named(name);
      await board.clearWithContext(undefined, record.context, () => {
        if (privateBoardGenerations.get(name) !== generation) {
          throw abortError("A newer application mount owns this private pasteboard.");
        }
      });
      if (privateBoardGenerations.get(name) === generation) privateBoardDataGenerations.delete(name);
    },
    forLease(lease: PasteboardAccessLease) { return registry.forLease(lease); },
  }));
  return registry;
}
