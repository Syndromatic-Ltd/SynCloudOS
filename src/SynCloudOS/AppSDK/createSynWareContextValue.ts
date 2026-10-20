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

import { Config } from "../SynCloudOS";
import type { SynWareRuntime } from "./appRuntimeTypes";
import { getMountedAppEnvironmentClients } from "./mountedEnvironmentClientRegistry";
import type {
  AppColourPanelClient,
  AppDocumentClient,
  AppDragClient,
  AppNavigationClient,
  AppNavigationOptions,
  AppNavigationRoute,
  AppNavigationTransitionHandle,
  AppNavigationTransitionResult,
  AppPasteboardClient,
  AUFXAudioClient,
  AppWindowClient,
  AppWindowSnapshot,
} from "./appClientTypes";
import type { SynWareContextValue, SynWareRuntimeInfo } from "./appContextTypes";
import { registerSCOSAppSession } from "./scos/scosSessionRegistry";

function runtimeIdFor(runtime: SynWareRuntime): string {
  if (!runtime.id) throw new Error("Mounted SynWare facade did not provide a runtime identity.");
  return runtime.id;
}

function runtimeInfoFor(runtime: SynWareRuntime): SynWareRuntimeInfo {
  // React can inspect context values while committing an outgoing application
  // frame after its transfer mount has been revoked.  Runtime info is
  // presentation-only, so retain its last online value for that final render
  // instead of asking the fail-closed platform capability after revocation.
  let presentationOnline = runtime.platform.online();
  return Object.freeze({
    get id() { return runtimeIdFor(runtime); },
    get version() { return Config.version; },
    get online() {
      if (!runtime.signal.aborted) presentationOnline = runtime.platform.online();
      return presentationOnline;
    },
    get locale() { return runtime.locale.getSnapshot().locale; },
    get timeZone() { return runtime.locale.getSnapshot().timeZone ?? "UTC"; },
  });
}

type RawNavigationHandle = ReturnType<SynWareRuntime["navigation"]["openRoute"]>;

function appNavigationRoute(value: Readonly<{ pathname: string; kind: AppNavigationRoute["kind"]; appId?: string }>): AppNavigationRoute {
  return Object.freeze({
    pathname: value.pathname,
    kind: value.kind,
    ...(value.appId ? { appId: value.appId } : {}),
  });
}

async function appNavigationResult(raw: RawNavigationHandle): Promise<AppNavigationTransitionResult> {
  const result = await raw.result;
  const base = { operationId: raw.operationId, correlationId: raw.correlationId };
  if (result.status === "cancelled") {
    return Object.freeze({
      ...base,
      outcome: result.reason === "superseded" ? "superseded" as const : "cancelled" as const,
      committed: false as const,
      reason: result.reason,
    });
  }
  if (result.status !== "completed") {
    const cause = result.error.cause as { readonly reason?: string; readonly successorId?: string } | undefined;
    if (result.error.code === "route-denied" || result.error.code === "route-unauthorised") {
      return Object.freeze({ ...base, outcome: "denied" as const, committed: false as const, code: result.error.code, reason: result.error.message });
    }
    if (result.error.code === "route-invalid-query") {
      return Object.freeze({ ...base, outcome: "invalid-query" as const, committed: false as const, code: "route-invalid-query" as const, reason: result.error.message });
    }
    if (result.error.code === "route-guard-blocked") {
      return Object.freeze({ ...base, outcome: "blocked" as const, committed: false as const, reason: cause?.reason ?? result.error.message });
    }
    if (result.error.code === "route-not-found") {
      return Object.freeze({ ...base, outcome: "not-found" as const, committed: false as const, code: "route-not-found" as const, reason: result.error.message });
    }
    if (result.error.code === "route-redirect" && cause?.successorId) {
      return Object.freeze({ ...base, outcome: "redirected" as const, committed: false as const, successorId: cause.successorId, reason: result.error.message });
    }
    return Object.freeze({ ...base, outcome: "failed" as const, committed: false as const, code: result.error.code, reason: result.error.message });
  }
  const route = appNavigationRoute(result.value);
  if (result.postCommit === "cancelled") {
    return Object.freeze({ ...base, outcome: "cancelled" as const, committed: true as const, route, postCommit: "cancelled" as const, reason: "post-commit-cancelled" });
  }
  if (result.postCommit === "failed") {
    const issue = result.issues.at(-1);
    if (issue?.error?.code === "route-presentation-timeout") {
      const cause = issue.error.cause as { readonly pendingRoles?: readonly string[] } | undefined;
      return Object.freeze({
        ...base,
        outcome: "presentation-timeout" as const,
        committed: true as const,
        route,
        postCommit: "failed" as const,
        pendingRoles: Object.freeze([...(cause?.pendingRoles ?? [])]),
        reason: issue.message,
      });
    }
    return Object.freeze({
      ...base,
      outcome: "route-error" as const,
      committed: true as const,
      route,
      postCommit: "failed" as const,
      code: issue?.error?.code ?? "route-post-commit-failed",
      reason: issue?.message ?? "Route post-commit work failed.",
    });
  }
  return Object.freeze({ ...base, outcome: "settled" as const, committed: true as const, route, postCommit: "completed" as const });
}

function navigationClientFor(runtime: SynWareRuntime): AppNavigationClient {
  const openRoute = (pathname: string, options: AppNavigationOptions = {}): AppNavigationTransitionHandle => {
    const raw = runtime.navigation.openRoute(pathname, options as Parameters<SynWareRuntime["navigation"]["openRoute"]>[1]);
    const wrap = (handle: RawNavigationHandle): AppNavigationTransitionHandle => Object.freeze({
      operationId: handle.operationId,
      correlationId: handle.correlationId,
      signal: handle.signal,
      result: appNavigationResult(handle),
      cancel: handle.cancel,
      retry() { return wrap(handle.retry()); },
      replace(nextPathname: string) {
        return openRoute(nextPathname, Object.freeze({ ...options, historyMode: "replace", correlationId: handle.correlationId }));
      },
    });
    return wrap(raw);
  };
  return Object.freeze({ openRoute });
}

function windowClientFor(runtime: SynWareRuntime, sessionId: string): AppWindowClient {
  const project = (state: "open" | "closed") => {
    const source = runtime.windows.getSnapshot();
    const safeSource = state === "open"
      ? source
      : { current: null, owned: Object.freeze([]) as AppWindowSnapshot["owned"], surface: source.surface };
    return Object.freeze({
      appId: runtime.app.id,
      sessionId,
      state,
      current: safeSource.current,
      owned: safeSource.owned,
      surface: safeSource.surface,
    });
  };
  let snapshot = project(runtime.signal.aborted ? "closed" : "open");
  const getSnapshot = () => {
    const state = runtime.signal.aborted ? "closed" as const : "open" as const;
    if (snapshot.state !== state) snapshot = project(state);
    else if (state === "open") {
      const source = runtime.windows.getSnapshot();
      if (snapshot.current !== source.current || snapshot.owned !== source.owned) snapshot = project(state);
    }
    return snapshot;
  };
  return Object.freeze({
    getSnapshot,
    subscribe(listener: () => void) {
      let observed = getSnapshot();
      const notify = () => {
        const next = getSnapshot();
        if (next === observed) return;
        observed = next;
        listener();
      };
      const unsubscribe = runtime.windows.subscribe(notify);
      runtime.signal.addEventListener("abort", notify, { once: true });
      return () => {
        runtime.signal.removeEventListener("abort", notify);
        unsubscribe();
      };
    },
    openDocumentWindow: runtime.windows.openDocumentWindow,
    focus: runtime.windows.focus,
    minimise: runtime.windows.minimise,
    zoom: runtime.windows.zoom,
    setTitle: runtime.windows.setTitle,
    close: runtime.windows.close,
  });
}

function dragClientFor(runtime: SynWareRuntime): AppDragClient {
  const sessions = new WeakMap<object, object>();
  const issuedSessions = new WeakMap<object, object>();
  const issue = (raw: object) => {
    const existing = issuedSessions.get(raw);
    if (existing) return existing;
    const issued = Object.freeze({ opaque: Symbol("synapp-drag-session") });
    sessions.set(issued, raw);
    issuedSessions.set(raw, issued);
    return issued;
  };
  const resolve = (issued: object) => {
    const raw = sessions.get(issued);
    if (!raw) throw new DOMException("The drag session was not issued to this mounted application.", "SecurityError");
    return raw as { readonly id: string };
  };
  const manager = runtime.drag.manager;
  return Object.freeze({
    endpoint(options: Parameters<AppDragClient["endpoint"]>[0]) {
      return runtime.drag.endpoint(options) as unknown as ReturnType<AppDragClient["endpoint"]>;
    },
    begin(input) {
      const session = manager.begin(input as never);
      return issue(session) as ReturnType<AppDragClient["begin"]>;
    },
    active() {
      const active = manager.snapshot().active;
      return active ? issue(active) as ReturnType<AppDragClient["active"]> : null;
    },
    async updateDestination(session, request) {
      const raw = resolve(session as object);
      const updated = await manager.updateDestination(raw.id, {
        endpoint: request.endpoint as never,
        operations: request.operations as never,
        ...(request.accept ? {
          accept: async (candidate, signal) => request.accept!(issue(candidate) as ReturnType<AppDragClient["begin"]>, signal),
        } : {}),
      });
      return Object.freeze({ operation: updated.operation }) as Awaited<ReturnType<AppDragClient["updateDestination"]>>;
    },
    claimDrop(session) {
      manager.claimDrop(resolve(session as object).id);
    },
    readPayload(session, types, signal) {
      return manager.readPayload(resolve(session as object).id, types, signal) as unknown as ReturnType<AppDragClient["readPayload"]>;
    },
    async performDrop(session) {
      const result = await manager.performDrop(resolve(session as object).id);
      return Object.freeze({ accepted: result.accepted, operation: result.operation }) as Awaited<ReturnType<AppDragClient["performDrop"]>>;
    },
    cancel(session, reason) {
      manager.cancel(resolve(session as object).id, reason);
    },
    cancelUnclaimed(session, reason) {
      return manager.cancelUnclaimed(resolve(session as object).id, reason);
    },
  } as AppDragClient);
}

function colourPanelClientFor(runtime: SynWareRuntime): AppColourPanelClient {
  const colourPanel = runtime.colourPanel;
  return Object.freeze({
    authorityToken: colourPanel.ownerToken,
    getSnapshot: colourPanel.getSnapshot,
    getPickers: colourPanel.getPickers,
    subscribe: colourPanel.subscribe,
    registerPicker: colourPanel.registerPicker,
    activateTarget: colourPanel.activateTarget,
    open: colourPanel.open,
    close: colourPanel.close,
    choosePicker: colourPanel.choosePicker,
    preview: colourPanel.preview,
    commit: colourPanel.commit,
    cancel: colourPanel.cancel,
    addRecent: colourPanel.addRecent,
    setSwatches: colourPanel.setSwatches,
  } as unknown as AppColourPanelClient);
}

function documentClientFor(runtime: SynWareRuntime): AppDocumentClient {
  return Object.freeze({
    documentResources: runtime.documentResources,
    workspaceDocuments: runtime.workspaceDocuments,
  } as unknown as AppDocumentClient);
}

function pasteboardClientFor(runtime: SynWareRuntime): AppPasteboardClient {
  const client = runtime.pasteboards;
  const projectBoard = (board: typeof client.system) => Object.freeze({
    name: board.name,
    context: Object.freeze({ appId: board.context.appId, ...(board.context.responderId === undefined ? {} : { sessionId: board.context.responderId }) }),
    get changeCount() { return board.changeCount; },
    snapshot: board.snapshot,
    write: board.write,
    read: board.read,
    readFirst: board.readFirst,
    clear: board.clear,
  });
  return Object.freeze({
    context: Object.freeze({ appId: client.context.appId, ...(client.context.responderId === undefined ? {} : { sessionId: client.context.responderId }) }),
    system: projectBoard(client.system),
    drag: projectBoard(client.drag),
    find: projectBoard(client.find),
    named(name: string) { return projectBoard(client.named(name as Parameters<typeof client.named>[0])); },
  } as unknown as AppPasteboardClient);
}

function audioClientFor(runtime: SynWareRuntime): AUFXAudioClient {
  const createSession = getMountedAppEnvironmentClients(runtime).audioSessions.createSession;
  const createEngine = getMountedAppEnvironmentClients(runtime).audioGraphs.createEngine;
  const files = getMountedAppEnvironmentClients(runtime).audioFiles;
  const audio = runtime.audio;
  return Object.freeze({
    createSession,
    createEngine,
    fileCapabilities: files.capabilities,
    openFile: files.openFile,
    exportFile: files.exportFile,
    exportStream: files.exportStream,
    activation: audio.activation,
    load: audio.load,
    play: audio.play,
    pause: audio.pause,
    stop: audio.stop,
    setLoop: audio.setLoop,
    setVolume: audio.setVolume,
    setRate: audio.setRate,
    setCurrentTime: audio.setCurrentTime,
    release: audio.release,
    suspend: audio.suspend,
    resume: audio.resume,
  } as unknown as AUFXAudioClient);
}

/** Creates one stable context value per already-mounted app/session facade.
 * The facade is intentionally consumed only while constructing individually
 * whitelisted clients; it is never stored on, or reachable from, the result. */
export function createSynWareContextValue(runtime: SynWareRuntime, branding: SynWareContextValue["branding"] = Object.freeze({ name: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null, logoAlt: "" })): SynWareContextValue {
  const sessionId = `${runtime.app.id}:${runtime.responderId}`;
  const environment = getMountedAppEnvironmentClients(runtime);
  const context: SynWareContextValue = Object.freeze({
    runtimeInfo: runtimeInfoFor(runtime),
    branding,
    appId: runtime.app.id,
    appInfo: Object.freeze({
      id: runtime.app.id,
      version: runtime.app.version,
      title: runtime.app.displayName || runtime.app.name,
    }),
    launcher: environment.launcher,
    responderId: runtime.responderId,
    sessionId,
    signal: runtime.signal,
    presentation: runtime.presentation as unknown as SynWareContextValue["presentation"],
    lifecycle: runtime.application as unknown as SynWareContextValue["lifecycle"],
    commands: runtime.commands as unknown as SynWareContextValue["commands"],
    responders: runtime.focus as unknown as SynWareContextValue["responders"],
    undo: runtime.undo as unknown as SynWareContextValue["undo"],
    documents: documentClientFor(runtime),
    windows: windowClientFor(runtime, sessionId),
    pasteboards: pasteboardClientFor(runtime),
    drag: dragClientFor(runtime),
    colourPanel: colourPanelClientFor(runtime),
    audio: audioClientFor(runtime),
    services: runtime.services,
    navigation: navigationClientFor(runtime),
    locale: runtime.locale as unknown as SynWareContextValue["locale"],
    appearance: runtime.appearance as unknown as SynWareContextValue["appearance"],
    persistence: environment.persistence,
    scheduler: environment.scheduler,
    mediaQueries: environment.mediaQueries,
    identity: environment.identity,
    notifications: environment.notifications,
    errors: environment.errors,
    alerts: environment.alerts,
    externalActions: environment.externalActions,
    share: environment.share,
    workArea: environment.workArea,
    settingsAvailability: environment.settingsAvailability,
    connectivity: environment.connectivity,
    events: environment.events,
    tracking: environment.tracking,
    textLayout: environment.textLayout,
    animations: environment.animations,
    images: environment.images,
    filePanels: environment.filePanels,
    motion: environment.motion,
    media: environment.media,
    video: environment.video,
    location: environment.location,
    midi: environment.midi,
    lumina: environment.lumina,
    haptics: environment.haptics,
    webContent: environment.webContent,
    trusted: environment.trusted,
  });
  const unregister = registerSCOSAppSession({ appId: context.appId, ...context.appInfo, context });
  runtime.signal.addEventListener("abort", unregister, { once: true });
  if (runtime.signal.aborted) unregister();
  return context;
}
