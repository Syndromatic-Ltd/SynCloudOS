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
import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import type { DragEndpoint, DragSessionManager, RuntimeDragEndpointAuthority } from "../Drag";
import type { PasteboardAccessContext, PasteboardRegistry, PasteboardRegistryHandle } from "../Pasteboard";
import { getPasteboardRuntimeControl } from "../Pasteboard/Pasteboard";
import type { ResponderGraph, ResponderRegistrationToken } from "../Responders";
import type { SynCloudOSEventBus, SynCloudOSAppRegistry, SynCloudOSLifecycle, SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeWebContentService, RuntimeWebContentSession, RuntimeWebContentSessionRequest } from "../WebContent";
import type { WindowManager } from "../Windows";

export interface RuntimeAppTransferScopeOptions {
  /** Canonical live responder supplied by the application-stage host. */
  readonly responderId: string;
  /** A real owned WindowManager controller when the app is window-hosted. */
  readonly windowControllerId?: string;
}

export type RuntimeScopedWebContentSessionRequest<T = unknown> = Omit<
  RuntimeWebContentSessionRequest<T>,
  "appId" | "applicationSessionId" | "ownerId" | "windowControllerId" | "ownerLease"
>;

export interface RuntimeScopedWebContentService {
  createSession<T>(request: RuntimeScopedWebContentSessionRequest<T>, signal?: AbortSignal): Promise<RuntimeWebContentSession>;
  diagnostics(): Pick<ReturnType<RuntimeWebContentService["diagnostics"]>, "sessionCount" | "pendingOperationCount">;
}

export interface RuntimeScopedDragService {
  readonly manager: DragSessionManager;
  /** Creates an opaque endpoint bound to a responder under this scope's live
   * application responder. A caller-supplied identifier has no authority
   * until the runtime responder graph proves that ownership at use time. */
  endpoint(options?: { readonly responderId?: string }): DragEndpoint;
}

/** The only transfer surface given to a SynWare. Its members are scoped to one
 * canonical app object and revalidated at every async boundary. */
export interface RuntimeAppTransferScope {
  readonly pasteboards: PasteboardRegistryHandle;
  readonly drag: RuntimeScopedDragService;
  readonly webContent: RuntimeScopedWebContentService;
}

/** An opaque live mount generation for one rendered SynWare presentation. */
export interface RuntimeAppTransferMount {
  readonly scope: RuntimeAppTransferScope;
  /** Internal mount lifetime; aborted when responder ownership is revoked. */
  readonly signal: AbortSignal;
  dispose(reason?: unknown): void;
}

export interface RuntimeTransferAuthority {
  readonly runtimeId: SynCloudOSRuntimeId;
  /** Internal host bridge for a rendered application or application window.
   * The mounted facade never receives this issuer. */
  mountApp(app: SynCloudOSAppInfo, options: RuntimeAppTransferScopeOptions): RuntimeAppTransferMount;
  dispose(): void;
}

/** Internal runtime wiring, deliberately not exposed through SynWareRuntime. */
export interface RuntimeTransferAuthorityControl extends RuntimeTransferAuthority {
  revokeApplicationMounts(appId: string): void;
  bindDrag(manager: DragSessionManager): void;
  bindWebContent(service: RuntimeWebContentService): void;
  resolveDragEndpoint(value: unknown, role: "source" | "destination"): RuntimeDragEndpointAuthority | null;
  validateWebContentLease(lease: unknown, request: { readonly appId: string; readonly applicationSessionId: string; readonly ownerId: string; readonly windowControllerId?: string }): boolean;
}

type ResponderGraphWithSynchronousSubscription = ResponderGraph & {
  readonly subscribeSynchronously?: (listener: () => void) => () => void;
};

interface ScopeRecord {
  readonly app: SynCloudOSAppInfo;
  readonly registrationAuthority: object;
  readonly context: PasteboardAccessContext & { readonly responderId: string };
  readonly applicationSessionId: string;
  readonly ownerId: string;
  readonly webLease: object;
  readonly pasteboardLease: import("../Pasteboard").PasteboardAccessLease;
  readonly mount: ScopeMountRecord;
  readonly responderToken: ResponderRegistrationToken | null;
  readonly resources: {
    readonly webSessions: Set<{ dispose(): void }>;
    readonly pendingWebSessions: Set<PendingWebSession>;
    dragManager: DragSessionManager | null;
  };
}

interface ScopeMountRecord {
  readonly key: string;
  readonly generation: number;
  readonly controller: AbortController;
  live: boolean;
}

interface PendingWebSession {
  settled: boolean;
}

interface EndpointRecord {
  readonly scope: ScopeRecord;
  readonly endpoint: DragEndpoint;
  readonly authority: RuntimeDragEndpointAuthority;
  readonly responderToken: ResponderRegistrationToken | null;
}

function securityError(message: string): DOMException { return new DOMException(message, "SecurityError"); }

function boundedIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) throw new TypeError(`${label} must be a bounded non-empty identity.`);
  return value;
}

function transferScopeOptions(value: RuntimeAppTransferScopeOptions | undefined): Readonly<{
  readonly responderId: string;
  readonly windowControllerId?: string;
}> {
  if (value === undefined) throw new TypeError("Transfer scope options.responderId is required.");
  if (!value || typeof value !== "object") throw new TypeError("Transfer scope options must be plain data objects.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Transfer scope options must be plain data objects.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set<PropertyKey>(["responderId", "windowControllerId"]);
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) {
    throw new TypeError("Transfer scope options contain unsupported descriptor fields.");
  }
  const field = (key: "responderId" | "windowControllerId", required = false) => {
    const descriptor = descriptors[key];
    if (!descriptor) {
      if (required) throw new TypeError(`Transfer scope options.${key} is required.`);
      return undefined;
    }
    if (!("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
      throw new TypeError(`Transfer scope options.${key} must be an enumerable own data property.`);
    }
    return boundedIdentifier(descriptor.value, `Transfer ${key}`);
  };
  const responderId = field("responderId", true)!;
  const windowControllerId = field("windowControllerId");
  return Object.freeze({ responderId, ...(windowControllerId ? { windowControllerId } : {}) });
}

function scopedWebRequest<T>(scope: ScopeRecord, value: RuntimeScopedWebContentSessionRequest<T>): RuntimeWebContentSessionRequest<T> {
  if (!value || typeof value !== "object") throw new TypeError("Scoped web content requests must be plain data objects.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Scoped web content requests must be plain data objects.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set<PropertyKey>(["title", "source", "capabilities", "decodeMessage", "onMessage"]);
  if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) {
    throw new TypeError("Scoped web content requests contain unsupported descriptor fields.");
  }
  const request: Record<string, unknown> = {
    appId: scope.context.appId,
    applicationSessionId: scope.applicationSessionId,
    ownerId: scope.ownerId,
    ownerLease: scope.webLease,
  };
  if (scope.context.windowControllerId) request.windowControllerId = scope.context.windowControllerId;
  for (const key of allowed) {
    const descriptor = descriptors[key as string];
    if (!descriptor) continue;
    if (!("value" in descriptor) || descriptor.get || descriptor.set || !descriptor.enumerable) {
      throw new TypeError(`Scoped web content request.${String(key)} must be an enumerable own data property.`);
    }
    request[key as string] = descriptor.value;
  }
  return Object.freeze(request) as unknown as RuntimeWebContentSessionRequest<T>;
}

export function createRuntimeTransferAuthority(options: {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly signal: AbortSignal;
  readonly apps: SynCloudOSAppRegistry;
  readonly getRegistrationAuthority: (appId: string) => object | null;
  readonly lifecycle: SynCloudOSLifecycle;
  readonly responders: ResponderGraph;
  readonly windows: WindowManager;
  readonly pasteboards: PasteboardRegistry;
  readonly events?: SynCloudOSEventBus;
}): RuntimeTransferAuthorityControl {
  const pasteboards = getPasteboardRuntimeControl(options.pasteboards);
  const endpointRecords = new WeakMap<object, EndpointRecord>();
  const webLeases = new WeakMap<object, ScopeRecord>();
  const activeMounts = new Map<string, ScopeMountRecord>();
  const mountScopes = new Map<ScopeMountRecord, ScopeRecord>();
  const revokingApplications = new Set<string>();
  let mountGeneration = 0;
  let drag: DragSessionManager | null = null;
  let webContent: RuntimeWebContentService | null = null;
  let disposed = false;

  const scopeLive = (scope: ScopeRecord): boolean => {
    if (disposed || options.signal.aborted) return false;
    if (!scope.mount.live || activeMounts.get(scope.mount.key) !== scope.mount) return false;
    if (options.getRegistrationAuthority(scope.context.appId) !== scope.registrationAuthority) return false;
    try {
      if (options.lifecycle.getState(scope.context.appId) === "closed") return false;
    } catch { return false; }
    if (scope.context.windowControllerId) {
      try {
        const record = options.windows.select(scope.context.windowControllerId).record;
        if (normalizeBundleIdentifier(record.applicationId) !== normalizeBundleIdentifier(scope.context.appId) || record.state === "closed") return false;
      } catch { return false; }
    }
    if (scope.context.responderId) {
      const responder = options.responders.get(scope.context.responderId);
      if (!responder || !options.responders.isEnabled(scope.context.responderId)) return false;
      const token = options.responders.getRegistrationToken(scope.context.responderId);
      if (!token || (scope.responderToken && token.generation !== scope.responderToken.generation)) return false;
      const chain = options.responders.resolveChain(scope.context.responderId);
      if (!chain.some((entry) => entry.id === `application:${scope.context.appId}` && entry.kind === "application")) return false;
    }
    return true;
  };

  const assertScope = (scope: ScopeRecord) => {
    if (!scopeLive(scope)) throw securityError("Runtime transfer authority is no longer live for this application.");
  };
  const endpointLive = (scope: ScopeRecord, responderId: string, registrationToken?: ResponderRegistrationToken | null): boolean => {
    if (!scopeLive(scope)) return false;
    if (registrationToken === null) return false;
    const responder = options.responders.get(responderId);
    if (!responder || !options.responders.isEnabled(responderId)) return false;
    const token = options.responders.getRegistrationToken(responderId);
    if (!token || (registrationToken && token.generation !== registrationToken.generation)) return false;
    const chain = options.responders.resolveChain(responderId);
    return chain.some((entry) => entry.id === scope.context.responderId);
  };
  // A responder is registered by React's insertion effect, after render but
  // before an event can invoke an application capability. Issuing an opaque
  // handle may happen in render; consuming it always uses assertScope above.
  const scopeMayIssue = (scope: ScopeRecord): boolean => {
    if (disposed || options.signal.aborted) return false;
    if (!scope.mount.live || activeMounts.get(scope.mount.key) !== scope.mount) return false;
    if (options.getRegistrationAuthority(scope.context.appId) !== scope.registrationAuthority) return false;
    try {
      if (options.lifecycle.getState(scope.context.appId) === "closed") return false;
    } catch { return false; }
    if (!scope.context.windowControllerId) return true;
    try {
      const record = options.windows.select(scope.context.windowControllerId).record;
      return normalizeBundleIdentifier(record.applicationId) === normalizeBundleIdentifier(scope.context.appId) && record.state !== "closed";
    } catch { return false; }
  };
  const currentContext = (scope: ScopeRecord): PasteboardAccessContext | null => scopeLive(scope) ? scope.context : null;

  const scopedManager = (scope: ScopeRecord): DragSessionManager => {
    const ownedSessions = new Set<string>();
    // Runtime ownership is already exposed by the mounted colour-panel port
    // for same-runtime equality checks. Retaining that immutable identity lets
    // React inspect an already-issued drag binding in a departing frame;
    // mutating drag methods below still require the live scope.
    const publicOwnerToken = drag?.ownerToken ?? null;
    const requireManager = () => {
      assertScope(scope);
      if (!drag) throw securityError("Runtime drag authority is unavailable.");
      return drag;
    };
    const owned = (id: string) => {
      if (!ownedSessions.has(id)) throw securityError("Drag session is not owned by this application scope.");
      return requireManager();
    };
    const manager: DragSessionManager = {
      // The runtime id is immutable public metadata. React may inspect an
      // already-issued manager while committing a departing frame after its
      // transfer scope has been revoked; metadata must not revive a drag
      // operation or turn that visual teardown into an unhandled exception.
      get runtimeId() { return options.runtimeId; },
      get ownerToken() { return publicOwnerToken ?? requireManager().ownerToken; },
      begin(input) {
        const record = input && typeof input === "object" ? endpointRecords.get((input as { readonly source?: object }).source as object) : undefined;
        if (!record || record.scope !== scope || !scopeLive(record.scope)) throw securityError("Runtime drag source authority was not issued to this application scope.");
        const session = requireManager().begin(input);
        ownedSessions.add(session.id);
        return session;
      },
      updateDestination(id, request) { return owned(id).updateDestination(id, request); },
      claimDrop(id) { owned(id).claimDrop(id); },
      cancelUnclaimed(id, reason) {
        // Browser dragend follows an accepted drop. The raw manager treats
        // that terminal source cleanup as a no-op, so preserve the same
        // idempotence for a session this scope has already retired. An
        // unowned ID never reaches the kernel manager.
        if (!ownedSessions.has(id)) return false;
        const kernel = requireManager();
        const cancelled = kernel.cancelUnclaimed(id, reason);
        if (cancelled || kernel.snapshot().active?.id !== id) ownedSessions.delete(id);
        return cancelled;
      },
      readPayload(id, types, signal) { return owned(id).readPayload(id, types, signal); },
      performDrop(id) {
        const manager = owned(id);
        return manager.performDrop(id).finally(() => ownedSessions.delete(id));
      },
      cancel(id, reason) {
        if (id) {
          if (!ownedSessions.has(id)) return;
          // A retained drag manager is allowed to finish cleanup after its
          // mount has been revoked.  The live authority has already retired
          // the owned session; do not turn an idempotent browser dragend into
          // a stale-capability exception.
          if (!scopeLive(scope)) {
            ownedSessions.delete(id);
            return;
          }
          requireManager().cancel(id, reason);
          ownedSessions.delete(id);
          return;
        }
        if (!scopeLive(scope)) {
          ownedSessions.clear();
          return;
        }
        const active = requireManager().snapshot().active;
        if (active && ownedSessions.has(active.id)) {
          requireManager().cancel(active.id, reason);
          ownedSessions.delete(active.id);
        }
      },
      snapshot() {
        const active = requireManager().snapshot().active;
        return Object.freeze({ active: active && ownedSessions.has(active.id) ? active : null });
      },
      dispose() {
        // Lifecycle/window events can mark the scope stale before the
        // application mount receives its teardown callback. Cleanup still
        // owns these exact kernel sessions, so cancel them through the bound
        // manager rather than the live-capability guard.
        for (const id of [...ownedSessions]) {
          try { drag?.cancel(id, "application transfer scope disposed"); } catch { /* raw drag cleanup remains idempotent */ }
        }
        ownedSessions.clear();
      },
    };
    return Object.freeze(manager);
  };

  const assertCanonicalApp = (app: SynCloudOSAppInfo): SynCloudOSAppInfo => {
    // Do not read app.id until object identity is proven against this exact
    // runtime registry: an app-shaped accessor/proxy must never participate
    // in capability issuance.
    if (!app || typeof app !== "object" || !options.apps.getAllApps().includes(app)) {
      throw securityError("Transfer scopes require the canonical registered application object.");
    }
    return app;
  };

  const disposeScopeResources = (scope: ScopeRecord) => {
    try { scope.resources.dragManager?.dispose(); } catch { /* one stale transfer cannot strand sibling resources */ }
    scope.resources.dragManager = null;
    for (const session of [...scope.resources.webSessions]) {
      try { session.dispose(); } catch { /* teardown remains best effort and idempotent */ }
    }
    scope.resources.webSessions.clear();
    scope.resources.pendingWebSessions.clear();
    void pasteboards.clearLease(scope.pasteboardLease).catch(() => undefined);
    webLeases.delete(scope.webLease);
  };

  const revokeMount = (
    mount: ScopeMountRecord,
    reason: unknown = new DOMException("Application transfer mount revoked.", "AbortError"),
  ) => {
    if (!mount.live) return;
    const scope = mountScopes.get(mount);
    // The scoped drag manager performs its own cancellation through the live
    // authority. Dispose owned resources while this exact generation is still
    // current, then make every externally held capability permanently stale.
    if (scope) disposeScopeResources(scope);
    mount.controller.abort(reason);
    mount.live = false;
    if (activeMounts.get(mount.key) === mount) activeMounts.delete(mount.key);
    mountScopes.delete(mount);
  };

  const retireMountAtResponderBoundary = (mount: ScopeMountRecord) => {
    if (!mount.live) return;
    const scope = mountScopes.get(mount);
    // Insertion-effect cleanup must invalidate the capability and cancel the
    // kernel drag synchronously, but the rest of resource disposal may notify
    // React-owned stores. Finish that work in the next microtask, after the
    // insertion-effect batch has completed.
    try { scope?.resources.dragManager?.dispose(); } catch { /* stale transfer cleanup remains best effort */ }
    mount.controller.abort(new DOMException("Application transfer mount revoked.", "AbortError"));
    mount.live = false;
    if (activeMounts.get(mount.key) === mount) activeMounts.delete(mount.key);
    mountScopes.delete(mount);
    if (scope) queueMicrotask(() => disposeScopeResources(scope));
  };

  const revokeApplicationMounts = (appId: string) => {
    const appKey = normalizeBundleIdentifier(appId);
    if (revokingApplications.has(appKey)) return;
    // Abort listeners can re-enter mount issuance before the closed state commits.
    revokingApplications.add(appKey);
    try {
      for (const mount of [...activeMounts.values()]) {
        const scope = mountScopes.get(mount);
        if (scope && normalizeBundleIdentifier(scope.context.appId) === appKey) revokeMount(mount);
      }
    } finally {
      revokingApplications.delete(appKey);
    }
  };
  const appRegistrationUnsubscribe = options.events
    ? ["app.register", "app.register.update", "app.unregister"].map((type) => options.events!.subscribe(type, (event) => {
        const payload = event.payload as { readonly appId?: unknown } | undefined;
        if (typeof payload?.appId !== "string") return;
        const canonical = options.apps.getApp(payload.appId);
        const registrationAuthority = options.getRegistrationAuthority(payload.appId);
        for (const mount of [...activeMounts.values()]) {
          const scope = mountScopes.get(mount);
          if (scope && normalizeBundleIdentifier(scope.context.appId) === normalizeBundleIdentifier(payload.appId) && (!canonical || registrationAuthority !== scope.registrationAuthority)) revokeMount(mount);
        }
      }))
    : [];
  const responderChanged = () => {
    for (const mount of [...activeMounts.values()]) {
      const scope = mountScopes.get(mount);
      if (!scope) continue;
      const token = options.responders.getRegistrationToken(scope.context.responderId);
      if (!token || (scope.responderToken && token.generation !== scope.responderToken.generation)) retireMountAtResponderBoundary(mount);
    }
  };
  // Ordinary responder subscribers are deferred to protect React insertion
  // effects. Transfer mounts, however, own kernel drag resources and must be
  // revoked in the same removal turn, before a removed registration token can
  // be replaced by a new generation.
  const responderUnsubscribe = (options.responders as ResponderGraphWithSynchronousSubscription)
    .subscribeSynchronously?.(responderChanged) ?? options.responders.subscribe(responderChanged);
  let knownWindowIds = new Set(options.windows.snapshot().windowControllerIds);
  const windowUnsubscribe = options.windows.subscribe(() => {
    const next = new Set(options.windows.snapshot().windowControllerIds);
    for (const mount of [...activeMounts.values()]) {
      const scope = mountScopes.get(mount);
      const windowId = scope?.context.windowControllerId;
      if (windowId && knownWindowIds.has(windowId) && !next.has(windowId)) revokeMount(mount);
    }
    knownWindowIds = next;
  });

  const createMount = (app: SynCloudOSAppInfo, scopeOptions: ReturnType<typeof transferScopeOptions>): ScopeMountRecord => {
    const key = `${app.bundleIdentifier}\u0000${scopeOptions.responderId}\u0000${scopeOptions.windowControllerId ?? ""}`;
    const previous = activeMounts.get(key);
    if (previous) {
      revokeMount(
        previous,
        new DOMException("Application transfer mount superseded by a newer mounted generation.", "AbortError"),
      );
    }
    const mount: ScopeMountRecord = { key, generation: ++mountGeneration, controller: new AbortController(), live: true };
    activeMounts.set(key, mount);
    return mount;
  };

  const issueScope = (
    app: SynCloudOSAppInfo,
    registrationAuthority: object,
    scopeOptions: ReturnType<typeof transferScopeOptions>,
    mount: ScopeMountRecord,
  ): RuntimeAppTransferScope => {
    const { responderId, windowControllerId } = scopeOptions;
    const context: ScopeRecord["context"] = Object.freeze({ appId: app.bundleIdentifier, ...(windowControllerId ? { windowControllerId } : {}), responderId });
    const resources: ScopeRecord["resources"] = { webSessions: new Set(), pendingWebSessions: new Set(), dragManager: null };
    const pasteboardLease = pasteboards.issueLease(context, () => {
      const current = mountScopes.get(mount);
      return current ? currentContext(current) : null;
    }, { ownsPrivateBoard: true });
    const scope: ScopeRecord = Object.freeze({
      app,
      registrationAuthority,
      context,
      applicationSessionId: `application:${app.bundleIdentifier}`,
      ownerId: responderId,
      webLease: Object.freeze({}),
      pasteboardLease,
      mount,
      resources,
      responderToken: options.responders.getRegistrationToken(responderId),
    });
    webLeases.set(scope.webLease, scope);
    mountScopes.set(mount, scope);
    const manager = scopedManager(scope);
    resources.dragManager = manager;
    const scopeValue: RuntimeAppTransferScope = Object.freeze({
      pasteboards: pasteboards.forLease(pasteboardLease),
      drag: Object.freeze({
        manager,
        endpoint(endpointOptions: { readonly responderId?: string } = {}) {
          if (!scopeMayIssue(scope)) throw securityError("Runtime transfer authority is no longer live for this application.");
          const responder = endpointOptions.responderId === undefined
            ? scope.context.responderId
            : boundedIdentifier(endpointOptions.responderId, "Drag responderId");
          const responderToken = options.responders.getRegistrationToken(responder);
          const endpoint = Object.freeze({
            appId: scope.context.appId,
            windowId: scope.context.windowControllerId ?? `application:${scope.context.appId}`,
            responderId: responder,
          });
          const boardLease = pasteboards.issueLease(scope.context, () => currentContext(scope), { allowDrag: true });
          const authority: RuntimeDragEndpointAuthority = Object.freeze({
            endpoint,
            pasteboard: pasteboards.forLease(boardLease).drag,
            isLive: () => endpointLive(scope, responder, responderToken),
          });
          endpointRecords.set(endpoint, Object.freeze({ scope, endpoint, authority, responderToken }));
          return endpoint;
        },
      }),
      webContent: Object.freeze({
        async createSession<T>(request: RuntimeScopedWebContentSessionRequest<T>, signal?: AbortSignal) {
          assertScope(scope);
          if (!webContent) throw securityError("Runtime web-content authority is unavailable.");
          const operationSignal = signal
            ? AbortSignal.any([options.signal, scope.mount.controller.signal, signal])
            : AbortSignal.any([options.signal, scope.mount.controller.signal]);
          operationSignal.throwIfAborted();
          const pending: PendingWebSession = { settled: false };
          scope.resources.pendingWebSessions.add(pending);
          let createdPromise: Promise<RuntimeWebContentSession>;
          try {
            createdPromise = Promise.resolve(webContent.createSession(scopedWebRequest(scope, request), operationSignal));
          } catch (error) {
            pending.settled = true;
            scope.resources.pendingWebSessions.delete(pending);
            throw error;
          }
          return await new Promise<RuntimeWebContentSession>((resolve, reject) => {
            const finishAbort = () => {
              if (pending.settled) return;
              pending.settled = true;
              scope.resources.pendingWebSessions.delete(pending);
              operationSignal.removeEventListener("abort", finishAbort);
              reject(securityError("Web content authority was revoked before session creation completed."));
            };
            const finishCreated = (created: RuntimeWebContentSession) => {
              operationSignal.removeEventListener("abort", finishAbort);
              if (pending.settled || !scopeLive(scope)) {
                try { created.dispose(); } catch { /* late session cleanup is best effort */ }
                scope.resources.pendingWebSessions.delete(pending);
                if (!pending.settled) {
                  pending.settled = true;
                  reject(securityError("Web content authority was revoked before session commit."));
                }
                return;
              }
              pending.settled = true;
              scope.resources.pendingWebSessions.delete(pending);
              let live = true;
              let tracked!: RuntimeWebContentSession;
              const assertTracked = () => {
                if (!live || !scopeLive(scope)) throw securityError("Runtime web-content session is no longer live for this application scope.");
              };
              const invokeAsync = <T>(operation: () => Promise<T>): Promise<T> => {
                assertTracked();
                return operation().then((value) => {
                  assertTracked();
                  return value;
                });
              };
              tracked = Object.freeze({
                get id() { return created.id; },
                getSnapshot: () => { assertTracked(); return created.getSnapshot(); },
                subscribe: (listener: () => void) => {
                  assertTracked();
                  return created.subscribe(() => { if (live) listener(); });
                },
                // React ref cleanup can arrive after the caller has disposed
                // the session. Clearing a frame is teardown, not a new
                // authority use; attaching a live frame remains guarded.
                bindFrame: (frame: object | null) => {
                  if (frame === null && (!live || !scopeLive(scope))) {
                    try { created.bindFrame(null); } catch { /* stale teardown is idempotent */ }
                    return;
                  }
                  assertTracked();
                  return created.bindFrame(frame);
                },
                didLoad: (authority: Parameters<RuntimeWebContentSession["didLoad"]>[0]) => { assertTracked(); return created.didLoad(authority); },
                didFail: (authority: Parameters<RuntimeWebContentSession["didFail"]>[0], reason?: string) => { assertTracked(); return created.didFail(authority, reason); },
                navigate: (source: Parameters<RuntimeWebContentSession["navigate"]>[0], nextSignal?: AbortSignal) => invokeAsync(() => created.navigate(source, nextSignal)),
                postMessage: (payload: unknown, correlationId: string, nextSignal?: AbortSignal) => invokeAsync(() => created.postMessage(payload, correlationId, nextSignal)),
                openExternal: (url: string, nextSignal?: AbortSignal) => invokeAsync(() => created.openExternal(url, nextSignal)),
                dispose: () => {
                  if (!live) return;
                  live = false;
                  scope.resources.webSessions.delete(tracked);
                  created.dispose();
                },
              }) as RuntimeWebContentSession;
              scope.resources.webSessions.add(tracked);
              resolve(tracked);
            };
            const finishError = (error: unknown) => {
              operationSignal.removeEventListener("abort", finishAbort);
              if (pending.settled) return;
              pending.settled = true;
              scope.resources.pendingWebSessions.delete(pending);
              reject(error);
            };
            operationSignal.addEventListener("abort", finishAbort, { once: true });
            if (operationSignal.aborted) finishAbort();
            createdPromise.then(finishCreated, finishError);
          });
        },
        diagnostics() {
          if (!webContent) throw securityError("Runtime web-content authority is unavailable.");
          assertScope(scope);
          return Object.freeze({
            sessionCount: scope.resources.webSessions.size,
            pendingOperationCount: scope.resources.pendingWebSessions.size,
          });
        },
      }),
    });
    return scopeValue;
  };

  const issueMount = (candidate: SynCloudOSAppInfo, suppliedScopeOptions: RuntimeAppTransferScopeOptions): RuntimeAppTransferMount => {
    const app = assertCanonicalApp(candidate);
    const registrationAuthority = options.getRegistrationAuthority(app.bundleIdentifier);
    if (!registrationAuthority) throw securityError("Transfer scopes require a live application registration authority.");
    const scopeOptions = transferScopeOptions(suppliedScopeOptions);
    if (disposed || options.signal.aborted || revokingApplications.has(normalizeBundleIdentifier(app.bundleIdentifier)) || options.lifecycle.getState(app.bundleIdentifier) === "closed") {
      throw securityError("Transfer scopes cannot be issued to a closing or closed application.");
    }
    const mount = createMount(app, scopeOptions);
    try {
      const scope = issueScope(app, registrationAuthority, scopeOptions, mount);
      return Object.freeze({
        scope,
        signal: mount.controller.signal,
        dispose: (reason?: unknown) => revokeMount(mount, reason),
      });
    } catch (error) {
      revokeMount(mount);
      throw error;
    }
  };

  const control: RuntimeTransferAuthorityControl = {
    runtimeId: options.runtimeId,
    mountApp(app, suppliedScopeOptions) {
      return issueMount(app, suppliedScopeOptions);
    },
    revokeApplicationMounts,
    bindDrag(manager) { if (disposed) throw securityError("Runtime transfer authority is disposed."); drag = manager; },
    bindWebContent(service) { if (disposed) throw securityError("Runtime transfer authority is disposed."); webContent = service; },
    resolveDragEndpoint(value, _role) {
      const record = value && typeof value === "object" ? endpointRecords.get(value as object) : undefined;
      if (!record || !endpointLive(record.scope, record.endpoint.responderId, record.responderToken)) return null;
      return record.authority;
    },
    validateWebContentLease(lease, request) {
      const scope = lease && typeof lease === "object" ? webLeases.get(lease as object) : undefined;
      if (!scope || !scopeLive(scope)) return false;
      return normalizeBundleIdentifier(request.appId) === normalizeBundleIdentifier(scope.context.appId) && request.applicationSessionId === scope.applicationSessionId && request.ownerId === scope.ownerId &&
        request.windowControllerId === scope.context.windowControllerId;
    },
    dispose() {
      if (disposed) return;
      for (const mount of [...activeMounts.values()]) revokeMount(mount);
      for (const unsubscribe of appRegistrationUnsubscribe) unsubscribe();
      responderUnsubscribe();
      windowUnsubscribe();
      disposed = true;
      drag = null;
      webContent = null;
    },
  };
  return Object.freeze(control);
}
