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

import { canonicalDocumentJson, immutableDocumentValue } from "../Documents/documentTypes";
import { normaliseWebContentSource, sandboxForWebContentCapabilities, sanitiseWebContentHTML } from "./webContentPolicy";
import type {
  RuntimeWebContentAction,
  RuntimeWebContentAdapter,
  RuntimeWebContentAdapterLease,
  RuntimeWebContentAuthorisationPort,
  RuntimeWebContentCapability,
  RuntimeWebContentNavigationAuthority,
  RuntimeWebContentPreparedNavigation,
  RuntimeWebContentService,
  RuntimeWebContentSession,
  RuntimeWebContentSessionRequest,
  RuntimeWebContentSessionSnapshot,
  RuntimeWebContentSource,
} from "./webContentTypes";

const abortError = (message: string) => new DOMException(message, "AbortError");

function primitiveText(value: unknown, label: string, maximum = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) throw new TypeError(`${label} is invalid.`);
  return value;
}

function dataRecord(value: unknown, label: string, allowed: readonly string[]) {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain record.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) throw new TypeError(`${label} contains an unknown field.`);
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) throw new TypeError(`${label} cannot contain accessors.`);
  }
  return descriptors;
}

function raceSignal<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? abortError("Web content operation aborted."));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => finish(() => reject(signal.reason ?? abortError("Web content operation aborted.")));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then((value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)));
    if (signal.aborted) abort();
  });
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
  try { return typeof (value as { readonly then?: unknown }).then === "function"; }
  catch { return false; }
}

interface NormalisedRequest {
  readonly appId: string;
  readonly applicationSessionId: string;
  readonly ownerId: string;
  readonly windowControllerId?: string;
  readonly ownerLease?: object;
  readonly title: string;
  readonly source: RuntimeWebContentSource;
  readonly capabilities: readonly RuntimeWebContentCapability[];
  readonly decodeMessage: RuntimeWebContentSessionRequest["decodeMessage"];
  readonly onMessage?: RuntimeWebContentSessionRequest["onMessage"];
}

interface SessionRecord {
  readonly id: string;
  readonly request: NormalisedRequest;
  facade: RuntimeWebContentSession;
  readonly listeners: Set<() => void>;
  readonly controller: AbortController;
  readonly correlations: Set<string>;
  readonly outgoingCorrelations: Set<string>;
  /** In-flight candidates prevent duplicate work without admitting a replay
   * key until the complete transaction commits. */
  readonly pendingCorrelations: Set<string>;
  readonly pendingOutgoingCorrelations: Set<string>;
  navigationController: AbortController;
  snapshot: RuntimeWebContentSessionSnapshot;
  source: RuntimeWebContentSource;
  sandbox: string;
  token: string;
  epoch: number;
  operation: AbortController | null;
  prepared: RuntimeWebContentPreparedNavigation | null;
  frame: object | null;
  suspended: boolean;
  loaded: boolean;
  closed: boolean;
}

function validatePreparedNavigation(value: unknown, adapter: RuntimeWebContentAdapter, sessionId: string, epoch: number,
  source: RuntimeWebContentSource, sandbox: string): RuntimeWebContentPreparedNavigation {
  if (!adapter.ownsNavigation(value)) throw new TypeError("Prepared web content navigation is not owned by its adapter.");
  const descriptors = dataRecord(value, "Prepared web content navigation",
    ["id", "sessionId", "navigationEpoch", "frameSource", "expectedOrigin", "objectURL"]);
  if (!Object.isFrozen(value)) throw new TypeError("Prepared web content navigation must be immutable.");
  const id = primitiveText(descriptors.id?.value, "Prepared navigation id", 1_024);
  const preparedSessionId = primitiveText(descriptors.sessionId?.value, "Prepared navigation sessionId", 1_024);
  const navigationEpoch = descriptors.navigationEpoch?.value;
  const frameSource = primitiveText(descriptors.frameSource?.value, "Prepared navigation frameSource", 8_192);
  const expectedOrigin = primitiveText(descriptors.expectedOrigin?.value, "Prepared navigation expectedOrigin", 2_048);
  const objectURL = descriptors.objectURL?.value;
  if (preparedSessionId !== sessionId || navigationEpoch !== epoch || !Number.isSafeInteger(navigationEpoch) || typeof objectURL !== "boolean") {
    throw new TypeError("Prepared web content navigation does not match its request.");
  }
  if (expectedOrigin !== "null") {
    const origin = new URL(expectedOrigin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== expectedOrigin || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new TypeError("Prepared web content origin is invalid.");
    }
  }
  if (objectURL && !frameSource.startsWith("blob:")) throw new TypeError("Prepared inline web content requires an object URL.");
  if (source.kind === "url") {
    const expected = sandbox.split(" ").includes("allow-same-origin") ? new URL(source.url).origin : "null";
    if (objectURL || frameSource !== source.url || expectedOrigin !== expected) {
      throw new TypeError("Prepared navigation does not represent the authorised source.");
    }
  } else if (!objectURL || !frameSource.startsWith("blob:") || expectedOrigin !== "null") {
    throw new TypeError("Prepared navigation does not represent the authorised source.");
  }
  void id;
  return value as RuntimeWebContentPreparedNavigation;
}

function canonicalPayload(value: unknown, typeId: string): unknown {
  const json = canonicalDocumentJson(value, typeId, { maxDepth: 16, maxNodes: 2_048, maxBytes: 64 * 1024 });
  return immutableDocumentValue(JSON.parse(json), typeId);
}

function matchesNavigationAuthority(value: unknown, record: SessionRecord): boolean {
  if (!value || typeof value !== "object") return false;
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = dataRecord(value, "Web content navigation authority", ["epoch", "navigationId", "frameSource"]);
  } catch {
    return false;
  }
  const epoch = descriptors.epoch?.value;
  const navigationId = descriptors.navigationId?.value;
  const frameSource = descriptors.frameSource?.value;
  return Boolean(record.prepared && record.frame && epoch === record.epoch && navigationId === record.prepared.id &&
    frameSource === record.prepared.frameSource && frameSource !== "" && frameSource !== "about:blank");
}

export function createRuntimeWebContentSessionManager(input: {
  readonly runtimeId: string;
  readonly signal: AbortSignal;
  readonly baseURL: string;
  readonly randomUUID: () => string;
  readonly adapterLease?: RuntimeWebContentAdapterLease | null;
  readonly authorisation?: RuntimeWebContentAuthorisationPort;
  /** Kernel-side validation of an opaque app scope lease. A lease is
   * rechecked before each policy/commit boundary, never trusted from ids. */
  readonly validateOwnerLease?: (lease: unknown, request: {
    readonly appId: string;
    readonly applicationSessionId: string;
    readonly ownerId: string;
    readonly windowControllerId?: string;
  }) => boolean;
}): RuntimeWebContentService {
  const runtimeOrigin = new URL(input.baseURL).origin;
  const adapter: RuntimeWebContentAdapter | null = input.adapterLease?.adapter ?? null;
  const sessions = new Map<string, SessionRecord>();
  const suspendedApps = new Set<string>();
  const closedApps = new Set<string>();
  const closedWindows = new Set<string>();
  let disposed = false;
  let sequence = 0;
  let pendingOperationCount = 0;

  const normaliseRequest = <T,>(value: RuntimeWebContentSessionRequest<T>): NormalisedRequest => {
    const descriptors = dataRecord(value, "Web content session request", ["appId", "applicationSessionId", "ownerId", "windowControllerId", "ownerLease", "title", "source", "capabilities", "decodeMessage", "onMessage"]);
    const callback = descriptors.onMessage?.value;
    if (callback !== undefined && typeof callback !== "function") throw new TypeError("Web content message handler must be a function.");
    const decoder = descriptors.decodeMessage?.value;
    if (typeof decoder !== "function") throw new TypeError("Web content message decoder must be a function.");
    const source = normaliseWebContentSource(descriptors.source?.value, input.baseURL);
    const sandbox = sandboxForWebContentCapabilities(descriptors.capabilities?.value, source, runtimeOrigin);
    const capabilities = sandbox === "" ? [] : sandbox.split(" ").map((token) => ({
      "allow-forms": "forms", "allow-scripts": "scripts", "allow-same-origin": "same-origin",
      "allow-downloads": "downloads", "allow-popups": "popups",
    } as const)[token]!).filter(Boolean);
    const windowController = descriptors.windowControllerId?.value;
    const ownerLease = descriptors.ownerLease?.value;
    if (ownerLease !== undefined && (!ownerLease || typeof ownerLease !== "object")) {
      throw new TypeError("Web content ownerLease must be an opaque object.");
    }
    return Object.freeze({
      appId: primitiveText(descriptors.appId?.value, "Web content appId"),
      applicationSessionId: primitiveText(descriptors.applicationSessionId?.value, "Web content applicationSessionId"),
      ownerId: primitiveText(descriptors.ownerId?.value, "Web content ownerId"),
      ...(windowController === undefined ? {} : { windowControllerId: primitiveText(windowController, "Web content windowControllerId") }),
      ...(ownerLease === undefined ? {} : { ownerLease: ownerLease as object }),
      title: primitiveText(descriptors.title?.value, "Web content title", 1_024), source,
      capabilities: Object.freeze(capabilities), decodeMessage: decoder, ...(callback ? { onMessage: callback } : {}),
    });
  };

  const emit = (record: SessionRecord) => { for (const listener of [...record.listeners]) listener(); };
  const setSnapshot = (record: SessionRecord, patch: Partial<RuntimeWebContentSessionSnapshot>) => {
    record.snapshot = Object.freeze({ ...record.snapshot, ...patch }); emit(record);
  };
  const active = (record: SessionRecord) => !disposed && !input.signal.aborted && !record.closed && sessions.get(record.id) === record;
  const hasLiveOwnerLease = (request: NormalisedRequest) => {
    if (request.ownerLease === undefined) return true;
    return input.validateOwnerLease?.(request.ownerLease, {
      appId: request.appId,
      applicationSessionId: request.applicationSessionId,
      ownerId: request.ownerId,
      ...(request.windowControllerId === undefined ? {} : { windowControllerId: request.windowControllerId }),
    }) === true;
  };
  const operationSignal = (record: SessionRecord, external?: AbortSignal) => {
    record.operation?.abort(abortError("Web content operation was replaced."));
    const controller = new AbortController(); record.operation = controller;
    const abort = (reason: unknown) => { if (!controller.signal.aborted) controller.abort(reason); };
    const listeners: Array<[AbortSignal, () => void]> = [];
    for (const signal of [input.signal, record.controller.signal, external].filter(Boolean) as AbortSignal[]) {
      const listener = () => abort(signal.reason ?? abortError("Web content operation aborted."));
      if (signal.aborted) listener(); else { signal.addEventListener("abort", listener, { once: true }); listeners.push([signal, listener]); }
    }
    return { controller, dispose() { for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener); } };
  };

  const authorise = async (record: SessionRecord, action: RuntimeWebContentAction, source: RuntimeWebContentSource, targetOrigin: string, epoch: number, signal: AbortSignal) => {
    if (!hasLiveOwnerLease(record.request)) return false;
    if (!input.authorisation) return false;
    const capability = action === "load" ? "web-content.load" : action === "navigate" ? "web-content.navigate" :
      action === "open-external" ? "web-content.external" : "web-content.message";
    const sourceOrigin = source.kind === "url" ? new URL(source.url).origin : runtimeOrigin;
    const request = Object.freeze({ runtimeId: input.runtimeId, appId: record.request.appId,
      applicationSessionId: record.request.applicationSessionId, ownerId: record.request.ownerId,
      ...(record.request.windowControllerId ? { windowControllerId: record.request.windowControllerId } : {}),
      sessionId: record.id, action, sourceKind: source.kind, sourceOrigin, targetOrigin,
      navigationEpoch: epoch, capability, requestedCapabilities: record.request.capabilities } as const);
    return await raceSignal(Promise.resolve(input.authorisation.authorise(request, signal)), signal) === true;
  };

  const releasePrepared = (record: SessionRecord) => {
    if (!record.prepared) return;
    try { adapter?.releaseNavigation(record.prepared); } finally { record.prepared = null; }
  };

  const close = (record: SessionRecord, reason = "Web content session closed.") => {
    if (record.closed) return;
    record.closed = true; record.operation?.abort(abortError(reason)); record.navigationController.abort(abortError(reason)); record.controller.abort(abortError(reason));
    if (record.frame) adapter?.bindFrame(record.id, record.epoch, null);
    record.frame = null; releasePrepared(record); record.correlations.clear(); record.outgoingCorrelations.clear();
    record.pendingCorrelations.clear(); record.pendingOutgoingCorrelations.clear();
    setSnapshot(record, { state: "closed", frameSource: "", failure: reason });
    record.listeners.clear(); sessions.delete(record.id);
  };

  const navigate = async (record: SessionRecord, sourceValue: RuntimeWebContentSource, action: "load" | "navigate", external?: AbortSignal) => {
    if (!active(record)) throw abortError("Web content session is closed.");
    if (action === "navigate" && record.suspended) throw abortError("Web content owner is suspended.");
    if (!adapter) throw new DOMException("Web content is unavailable in this environment.", "NotSupportedError");
    const source = normaliseWebContentSource(sourceValue, input.baseURL);
    const sandbox = sandboxForWebContentCapabilities(record.request.capabilities, source, runtimeOrigin);
    const epoch = record.epoch + 1;
    const token = primitiveText(adapter.issueToken(), "Web content token", 128);
    if (!/^[a-f0-9]{64}$/.test(token)) throw new TypeError("Web content adapter issued an invalid security token.");
    const operation = operationSignal(record, external); pendingOperationCount += 1;
    let prepared: RuntimeWebContentPreparedNavigation | null = null;
    try {
      const targetOrigin = source.kind === "url" ? new URL(source.url).origin : runtimeOrigin;
      if (!await authorise(record, action, source, targetOrigin, epoch, operation.controller.signal)) {
        throw new DOMException("Web content policy denied navigation.", "SecurityError");
      }
      const sanitisedHTML = source.kind === "html"
        ? sanitiseWebContentHTML(source, sandbox.includes("allow-scripts") ? token : undefined, epoch, input.baseURL) : undefined;
      const preparePromise = Promise.resolve(adapter.prepare(Object.freeze({ sessionId: record.id, navigationEpoch: epoch,
        token, source, sandbox, ...(sanitisedHTML ? { sanitisedHTML } : {}) }), operation.controller.signal)).then((candidate) => {
          try {
            const validated = validatePreparedNavigation(candidate, adapter, record.id, epoch, source, sandbox);
            operation.controller.signal.throwIfAborted();
            if (!active(record) || record.operation !== operation.controller) throw abortError("Web content preparation became stale.");
            return validated;
          } catch (error) { adapter.releaseNavigation(candidate); throw error; }
        });
      prepared = await raceSignal(preparePromise, operation.controller.signal);
      operation.controller.signal.throwIfAborted();
      if (!active(record) || record.operation !== operation.controller ||
        !await authorise(record, action, source, prepared.expectedOrigin, epoch, operation.controller.signal)) {
        throw new DOMException("Web content policy denied navigation commit.", "SecurityError");
      }
      const previous = record.prepared;
      if (record.frame) adapter.bindFrame(record.id, record.epoch, null);
      record.navigationController.abort(abortError("Web content navigation was replaced."));
      record.navigationController = new AbortController();
      record.frame = null; record.loaded = false; record.prepared = prepared; prepared = null; record.source = source;
      record.sandbox = sandbox; record.token = token; record.epoch = epoch; record.correlations.clear(); record.outgoingCorrelations.clear();
      record.pendingCorrelations.clear(); record.pendingOutgoingCorrelations.clear();
      const committed = record.prepared;
      setSnapshot(record, { state: record.suspended ? "suspended" : "loading", navigationEpoch: epoch,
        navigationId: committed.id, frameSource: committed.frameSource, expectedOrigin: committed.expectedOrigin, sandbox, failure: undefined });
      if (previous) adapter.releaseNavigation(previous);
      return true;
    } catch (error) {
      if (prepared) adapter.releaseNavigation(prepared);
      if (active(record) && record.operation === operation.controller && action === "navigate") {
        // Owner suspension deliberately aborts work after publishing the
        // suspended snapshot.  That transition is authoritative: treating
        // its expected AbortError as a navigation failure would re-expose a
        // suspended frame and discard the last resumable committed snapshot.
        setSnapshot(record, record.suspended
          ? { state: "suspended", failure: undefined }
          : { state: "failed", failure: error instanceof Error ? error.message : "Navigation failed." });
      }
      throw error;
    } finally {
      pendingOperationCount -= 1; operation.dispose();
      if (record.operation === operation.controller) record.operation = null;
    }
  };

  const makeFacade = (record: SessionRecord): RuntimeWebContentSession => Object.freeze({
    get id() { return record.id; },
    getSnapshot: () => record.snapshot,
    subscribe(listener: () => void) {
      if (record.closed) return () => undefined;
      record.listeners.add(listener); return () => record.listeners.delete(listener);
    },
    bindFrame(frame: object | null) {
      if (!active(record) || !record.prepared) return;
      if (frame !== null && (typeof frame !== "object" && typeof frame !== "function")) throw new TypeError("Web content frame handle is invalid.");
      record.frame = frame; adapter?.bindFrame(record.id, record.epoch, frame);
    },
    didLoad(authority: RuntimeWebContentNavigationAuthority) {
      if (!active(record) || !matchesNavigationAuthority(authority, record)) return;
      const prepared = record.prepared;
      if (!prepared) return;
      record.loaded = true;
      setSnapshot(record, { state: record.suspended ? "suspended" : "ready", failure: undefined });
      if (record.suspended) return;
      if (prepared.expectedOrigin !== "null") {
        adapter?.postMessage(record.id, record.epoch, Object.freeze({ kind: "syncloudos.web-content.handshake",
          direction: "to-frame", token: record.token, navigationEpoch: record.epoch }), prepared.expectedOrigin);
      }
    },
    didFail(authority: RuntimeWebContentNavigationAuthority, reason?: string) {
      if (!active(record) || !matchesNavigationAuthority(authority, record)) return;
      record.loaded = false;
      setSnapshot(record, { state: record.suspended ? "suspended" : "failed",
        failure: reason ?? "Web content failed to load." });
    },
    navigate: (source: RuntimeWebContentSource, signal?: AbortSignal) => navigate(record, source, "navigate", signal),
    async postMessage(payload: unknown, correlationId: string, signal?: AbortSignal) {
      if (!active(record) || record.suspended || !record.prepared || !record.frame || record.prepared.expectedOrigin === "null") return false;
      const correlation = primitiveText(correlationId, "Web content correlationId", 256);
      const canonical = canonicalPayload(payload, "web-content.outgoing-message");
      if (record.outgoingCorrelations.has(correlation) || record.pendingOutgoingCorrelations.has(correlation) ||
        record.outgoingCorrelations.size + record.pendingOutgoingCorrelations.size >= 256) return false;
      record.pendingOutgoingCorrelations.add(correlation);
      const operation = operationSignal(record, signal); pendingOperationCount += 1;
      try {
        if (!await authorise(record, "message-send", record.source, record.prepared.expectedOrigin, record.epoch, operation.controller.signal)) return false;
        if (!active(record) || record.operation !== operation.controller || !record.prepared || !record.frame) return false;
        if (!await authorise(record, "message-send", record.source, record.prepared.expectedOrigin, record.epoch, operation.controller.signal)) return false;
        if (!active(record) || record.operation !== operation.controller || !record.prepared || !record.frame) return false;
        if (record.outgoingCorrelations.has(correlation) || record.outgoingCorrelations.size >= 256) return false;
        adapter!.postMessage(record.id, record.epoch, Object.freeze({ kind: "syncloudos.web-content.message", direction: "to-frame",
          token: record.token, navigationEpoch: record.epoch, correlationId: correlation, payload: canonical }), record.prepared.expectedOrigin);
        // This is the transaction commit point: a malformed payload, rejected
        // policy decision, stale navigation, or throwing adapter has not
        // consumed a bounded replay entry.
        record.outgoingCorrelations.add(correlation);
        return true;
      } finally {
        record.pendingOutgoingCorrelations.delete(correlation);
        pendingOperationCount -= 1; operation.dispose(); if (record.operation === operation.controller) record.operation = null;
      }
    },
    async openExternal(url: string, signal?: AbortSignal) {
      if (!active(record) || record.suspended) return false;
      const target = normaliseWebContentSource({ kind: "url", url }, input.baseURL) as Extract<RuntimeWebContentSource, { kind: "url" }>;
      const operation = operationSignal(record, signal); pendingOperationCount += 1;
      try {
        const targetOrigin = new URL(target.url).origin;
        if (!await authorise(record, "open-external", record.source, targetOrigin, record.epoch, operation.controller.signal)) return false;
        if (!active(record) || record.operation !== operation.controller) return false;
        if (!await authorise(record, "open-external", record.source, targetOrigin, record.epoch, operation.controller.signal)) return false;
        if (!active(record) || record.operation !== operation.controller) return false;
        return adapter?.openExternal(target.url) ?? false;
      } finally { pendingOperationCount -= 1; operation.dispose(); if (record.operation === operation.controller) record.operation = null; }
    },
    dispose: () => close(record),
  });

  const unsubscribeMessages = adapter?.subscribeMessages((event) => {
    const record = [...sessions.values()].find((candidate) => active(candidate) && !candidate.suspended && candidate.prepared &&
      adapter.ownsMessage(candidate.id, candidate.epoch, event.source));
    if (!record || event.origin === "null" || event.origin === "*" || event.origin !== record.prepared!.expectedOrigin) return;
    let envelope: Record<string, unknown>;
    try {
      const canonical = canonicalPayload(event.data, "web-content.incoming-message");
      if (!canonical || typeof canonical !== "object" || Array.isArray(canonical)) return;
      envelope = canonical as Record<string, unknown>;
    } catch { return; }
    const envelopeKeys = Object.keys(envelope).sort();
    if (envelopeKeys.length !== 6 || envelopeKeys.some((key, index) => key !== ["correlationId", "direction", "kind", "navigationEpoch", "payload", "token"][index]) ||
      envelope.kind !== "syncloudos.web-content.message" || envelope.direction !== "to-host" ||
      envelope.token !== record.token || envelope.navigationEpoch !== record.epoch) return;
    let correlation: string;
    try { correlation = primitiveText(envelope.correlationId, "Web content correlationId", 256); } catch { return; }
    if (record.correlations.has(correlation) || record.pendingCorrelations.has(correlation) ||
      record.correlations.size + record.pendingCorrelations.size >= 256) return;
    const epoch = record.epoch; const prepared = record.prepared; const navigationController = record.navigationController;
    const deliver = async (decodedPayload: unknown) => {
      if (!active(record) || record.navigationController !== navigationController || record.epoch !== epoch || record.prepared !== prepared ||
        !adapter.ownsMessage(record.id, epoch, event.source)) return;
      if (!await authorise(record, "message-receive", record.source, event.origin, epoch, navigationController.signal)) return;
      if (!active(record) || record.navigationController !== navigationController || record.epoch !== epoch || record.prepared !== prepared ||
        !adapter.ownsMessage(record.id, epoch, event.source)) return;
      if (!await authorise(record, "message-receive", record.source, event.origin, epoch, navigationController.signal)) return;
      if (!active(record) || record.navigationController !== navigationController || record.epoch !== epoch || record.prepared !== prepared ||
        !adapter.ownsMessage(record.id, epoch, event.source)) return;
      const delivered = record.request.onMessage?.(decodedPayload, Object.freeze({ sessionId: record.id, origin: event.origin,
        correlationId: correlation, navigationEpoch: epoch }));
      if (delivered === false) return;
      if (delivered) await raceSignal(Promise.resolve(delivered), navigationController.signal);
      if (!active(record) || record.navigationController !== navigationController || record.epoch !== epoch || record.prepared !== prepared ||
        !adapter.ownsMessage(record.id, epoch, event.source) || record.correlations.has(correlation) || record.correlations.size >= 256) return;
      // Delivery has committed only after decode, both final authority
      // checks, and the optional application callback settle successfully.
      record.correlations.add(correlation);
    };
    let decoded: unknown;
    try { decoded = record.request.decodeMessage(envelope.payload); }
    catch { return; }
    if (decoded === false) return;
    record.pendingCorrelations.add(correlation);
    pendingOperationCount += 1;
    const complete = async (decodedPayload: unknown) => {
      try {
        await deliver(decodedPayload);
      } catch { /* rejected messages and handlers do not escape the runtime listener */ }
      finally { record.pendingCorrelations.delete(correlation); pendingOperationCount -= 1; }
    };
    if (isPromiseLike<unknown>(decoded)) {
      void (async () => {
        try {
          const resolved = await raceSignal(Promise.resolve(decoded), navigationController.signal);
          if (resolved === false) {
            record.pendingCorrelations.delete(correlation);
            pendingOperationCount -= 1;
            return;
          }
          await complete(canonicalPayload(resolved, "web-content.decoded-message"));
        } catch {
          record.pendingCorrelations.delete(correlation);
          pendingOperationCount -= 1;
        }
      })();
      return;
    }
    let decodedPayload: unknown;
    try { decodedPayload = canonicalPayload(decoded, "web-content.decoded-message"); }
    catch {
      record.pendingCorrelations.delete(correlation);
      pendingOperationCount -= 1;
      return;
    }
    void complete(decodedPayload);
  }) ?? (() => undefined);

  const service: RuntimeWebContentService = {
    runtimeId: input.runtimeId,
    async createSession(value, signal) {
      if (disposed || input.signal.aborted) throw input.signal.reason ?? abortError("Web content runtime disposed.");
      signal?.throwIfAborted();
      const request = normaliseRequest(value);
      if (!hasLiveOwnerLease(request)) {
        throw new DOMException("Web content owner lease was denied.", "SecurityError");
      }
      if (closedApps.has(request.appId) || (request.windowControllerId && closedWindows.has(request.windowControllerId))) {
        throw abortError("Web content owner authority is closed.");
      }
      const id = `web-content:${input.randomUUID()}:${++sequence}`;
      let record!: SessionRecord;
      const placeholder = Object.freeze({ id, title: request.title, state: "loading", navigationEpoch: 0, navigationId: "",
        frameSource: "", expectedOrigin: "null", sandbox: "" } as const);
      record = { id, request, facade: null as unknown as RuntimeWebContentSession, listeners: new Set(), controller: new AbortController(),
        correlations: new Set(), outgoingCorrelations: new Set(), pendingCorrelations: new Set(), pendingOutgoingCorrelations: new Set(), navigationController: new AbortController(),
        snapshot: placeholder, source: request.source, sandbox: "", token: "", epoch: 0,
        operation: null, prepared: null, frame: null, suspended: suspendedApps.has(request.appId), loaded: false, closed: false };
      record.facade = makeFacade(record); sessions.set(id, record);
      try { await navigate(record, request.source, "load", signal); return record.facade; }
      catch (error) { close(record, "Web content session creation failed."); throw error; }
    },
    get(sessionId) { return sessions.get(primitiveText(sessionId, "Web content sessionId", 1_024))?.facade ?? null; },
    suspendOwner(appId) {
      const id = primitiveText(appId, "Web content appId");
      suspendedApps.add(id);
      for (const record of sessions.values()) if (record.request.appId === id && !record.suspended) {
        record.suspended = true; record.operation?.abort(abortError("Web content owner suspended."));
        record.navigationController.abort(abortError("Web content owner suspended."));
        setSnapshot(record, { state: "suspended" });
      }
    },
    resumeOwner(appId) {
      const id = primitiveText(appId, "Web content appId");
      suspendedApps.delete(id); closedApps.delete(id);
      for (const record of sessions.values()) if (record.request.appId === id && record.suspended) {
        record.suspended = false; record.navigationController = new AbortController();
        setSnapshot(record, { state: record.loaded ? "ready" : "loading" });
        if (record.loaded && record.frame && record.prepared && record.prepared.expectedOrigin !== "null") {
          adapter?.postMessage(record.id, record.epoch, Object.freeze({ kind: "syncloudos.web-content.handshake",
            direction: "to-frame", token: record.token, navigationEpoch: record.epoch }), record.prepared!.expectedOrigin);
        }
      }
    },
    closeOwner(appId, reason) { const id = primitiveText(appId, "Web content appId"); suspendedApps.delete(id); closedApps.add(id); for (const record of [...sessions.values()]) if (record.request.appId === id) close(record, reason); },
    closeWindowController(windowControllerId, reason) { const id = primitiveText(windowControllerId, "Web content windowControllerId"); closedWindows.add(id); for (const record of [...sessions.values()]) if (record.request.windowControllerId === id) close(record, reason); },
    diagnostics() { const diagnostics = adapter?.diagnostics() ?? { listenerCount: 0, objectURLCount: 0, frameCount: 0 };
      return Object.freeze({ sessionCount: sessions.size, ...diagnostics, pendingOperationCount }); },
    dispose() {
      if (disposed) return; disposed = true;
      unsubscribeMessages(); for (const record of [...sessions.values()]) close(record, "Web content runtime disposed.");
      suspendedApps.clear(); closedApps.clear(); closedWindows.clear();
      input.adapterLease?.release();
    },
  };
  return service;
}
