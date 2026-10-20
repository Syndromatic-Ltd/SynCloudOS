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

import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { TrustedSynWareBundle } from "../../BundleLoader/bundleTypes";
import { trustSynWareBundleForTest } from "../../BundleLoader/trustedBundleProvenance";
import { installHostDiagnosticsProvision } from "../../Testing/hostDiagnosticsProvision";
import { createSynCloudOS } from "../../SynCloudOS";
import { SynCloudOSProvider } from "../../../SynCloudOSReact";
import { ApplicationStageView } from "../../../Webspring/ApplicationStageView";
import { HostSiteBrandingProvider } from "../../../SynCloudOSReact";
import {
  createApplicationWindowContentRendererRegistry,
  WindowContentRendererRegistry,
  WindowLayer,
} from "../../../Webspring/WindowLayer";
import { createSynWare, createSynWareBundle } from "../createSynWare";
import { useSynWareContext } from "../SynWareContext";
import { createSynWareDefinitionFromApplicationClass } from "../applicationClass";
import { applicationSessionFor } from "../applicationSession";
import { applicationLifecycleFor, registerApplicationLifecycle } from "../../Lifecycle/applicationLifecycleHooks";
import { normalizeBundleIdentifier } from "../../Identity/bundleIdentifier.mjs";
import type { SynWareContextValue } from "../appContextTypes";
import type { CreateWindowRequest } from "../../Windows";
import { createDeterministicRuntimeEnvironment } from "./fakeAdapters";
import { getRuntimeSettlement, trackRuntimeSettlement, type SettlementWorkInput } from "../../Testing/appSdkTestingPort";
import type {
  CreateSynWareTestHostOptions,
  SynWareTestHost,
  SynWareTestDisposalReport,
  SynWareTestPersistence,
  SynWareTestResourceLease,
  SynWareTestRenderResult,
} from "./testHostTypes";

function requireDocument(hostDocument: Document | null): Document {
  if (!hostDocument?.body) {
    throw new Error("SynWare test-host rendering requires a DOM document with a body.");
  }
  return hostDocument;
}

function renderAbortError(reason: unknown): DOMException {
  return reason instanceof DOMException && reason.name === "AbortError"
    ? reason
    : new DOMException("The SynWare test-host render was revoked.", "AbortError");
}

/** A test-host lazy gate models the host's own deferred import seam, not an
 * application operation. It must therefore observe host disposal even when a
 * test deliberately supplies a non-cooperative promise. */
function awaitLoadGate(
  loadGate: CreateSynWareTestHostOptions["loadGate"],
  signal: AbortSignal,
): Promise<void> {
  if (!loadGate) return Promise.resolve();
  if (signal.aborted) return Promise.reject(renderAbortError(signal.reason));
  let gate: void | Promise<void>;
  try {
    gate = loadGate(signal);
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(renderAbortError(signal.reason)));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(gate).then(
      () => finish(resolve),
      (error) => finish(() => reject(error)),
    );
  });
}

function matchesRole(element: HTMLElement, role: string): boolean {
  if (element.getAttribute("role") === role) return true;
  return role === "button" && element.tagName.toLowerCase() === "button";
}

function matchesName(element: HTMLElement, name: string | RegExp | undefined): boolean {
  if (name === undefined) return true;
  const accessibleName = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "";
  return typeof name === "string" ? accessibleName === name : name.test(accessibleName);
}

function renderResult(container: HTMLElement, unmount: () => void): SynWareTestRenderResult {
  return Object.freeze({
    container,
    getByRole(role: string, options: { readonly name?: string | RegExp } = {}) {
      const candidate = [...container.querySelectorAll<HTMLElement>("*")]
        .find((element) => matchesRole(element, role) && matchesName(element, options.name));
      if (!candidate) {
        const name = options.name === undefined ? "" : ` with name ${String(options.name)}`;
        throw new Error(`SynWare test host could not find role ${role}${name}.`);
      }
      return candidate;
    },
    unmount,
  });
}


/** Creates one fully isolated, real runtime and mounts a V1 SynWare through
 * the ordinary AppRegistry, definition loader, and production application
 * stage. Kernel instances and managers remain closure-private; this factory
 * returns only test controls. */
export function createSynWareTestHost(options: CreateSynWareTestHostOptions): SynWareTestHost {
  const hostDocument = options.document ?? options.container?.ownerDocument ?? null;
  const environment = createDeterministicRuntimeEnvironment({
    now: options.now,
    locale: options.locale,
    timeZone: options.timeZone,
    document: hostDocument,
  });
  // The test-host option is a declaration convenience, not an out-of-band
  // entitlement. Merge it into the V1 manifest before canonical capture so
  // bundle permissions, PolicyKit's app/bundle view, and the app facade all
  // observe exactly the same immutable declaration.
  let context: SynWareContextValue | null = null;
  const supplied = options.application
    ? createSynWareDefinitionFromApplicationClass(options.application, options.manifest)
    : options.app;
  const declaredPermissions = [...new Set([...(supplied.manifest.permissions ?? []), ...(options.permissions ?? [])])];
  const manifest = declaredPermissions.length === (supplied.manifest.permissions?.length ?? 0)
    ? supplied
    : { ...supplied, manifest: { ...supplied.manifest, permissions: declaredPermissions } };
  const AppRoot = supplied.root;
  const loadGateController = new AbortController();
  const appDefinition = createSynWare({
    manifest: manifest.manifest,
    root: function SynWareTestRoot() {
      context = useSynWareContext();
      return <AppRoot />;
    },
    ...(supplied.migrations === undefined ? {} : { migrations: supplied.migrations }),
    ...(supplied.windowChrome === undefined ? {} : { windowChrome: supplied.windowChrome }),
    ...(supplied.createBackgroundHandler === undefined ? {} : { createBackgroundHandler: supplied.createBackgroundHandler }),
    ...(supplied.routes === undefined ? {} : { routes: supplied.routes }),
  });
  const classLifecycle = applicationLifecycleFor(AppRoot);
  if (classLifecycle) registerApplicationLifecycle(appDefinition.root, classLifecycle);
  const bundle = createSynWareBundle(appDefinition, {
    loadModule: () => trackRuntimeSettlement(runtime, (async () => {
      await awaitLoadGate(options.loadGate, loadGateController.signal);
      if (loadGateController.signal.aborted) throw renderAbortError(loadGateController.signal.reason);
      return { default: appDefinition };
    })(), { owner: "test-host", kind: "lazy-load", label: manifest.manifest.bundleIdentifier }),
  }) as TrustedSynWareBundle;
  // The test host mints only diagnostics provenance. A declaration and a live
  // provider are still required at the ordinary trusted-client boundary.
  trustSynWareBundleForTest(bundle, { sourceKey: "synware-test-host:diagnostics", privileges: ["diagnostics"] });
  const runtime = (() => {
    const finishBootstrap = environment.prepareRuntimeBootstrap();
    try {
      return createSynCloudOS({
        id: `runtime:synapp-test:${environment.clock.now()}:${bundle.manifest.bundleIdentifier}`,
        environment: environment.environment,
        initialPathname: bundle.manifest.route,
        ...(options.documentTypes ? { applicationDocuments: { initialTypes: options.documentTypes } } : {}),
        policyProfile: {
          id: "syncloudos.testing",
          anonymousRole: "public",
          roles: {
            public: ["webspring.display", "route.open.public", "app.open.public"],
            tester: ["webspring.display", "route.open.public", "app.open.public", "app.open.protected", ...declaredPermissions],
          },
          resolveRole: (session) => session.isAuthorised ? "tester" : "public",
        },
        identity: {
          sessionAdapter: {
            id: "synware-test-session",
            async read() {
              return {
                id: "synware-test-session",
                subjectId: "test-host",
                state: "active",
                // Test authority is explicitly scoped to the declared permissions.
                claims: { displayName: "SynWare Test Host", roles: "tester" },
              };
            },
            subscribe() { return () => undefined; },
            async end() {},
            dispose() {},
          },
        },
      });
    } finally {
      finishBootstrap();
    }
  })();
  const diagnosticsProvision = installHostDiagnosticsProvision(runtime, options.diagnostics);
  for (const [token, client] of options.services ?? []) {
    runtime.services.registerService({ id: token.id, displayName: token.id, description: "Test-host service", availability: "available" });
    runtime.services.register({ id: token.id, version: token.minimumVersion ?? "1.0.0", contractVersion: token.contractVersion, createAppClient: () => client });
  }
  const app = runtime.apps.register(bundle);
  if (!app) {
    void runtime.dispose("SynWare testing host could not register its application.");
    environment.dispose();
    throw new Error(`SynWare testing host could not register ${bundle.manifest.bundleIdentifier}.`);
  }
  const settlementRegistry = getRuntimeSettlement(runtime);
  // The production stage owns the application responder lifecycle. The former
  // direct mount needed a host-side registration here; retaining it would
  // collide with ApplicationStageView's ResponderScope.
  const windowContentRegistry = options.surface === "window"
    ? createApplicationWindowContentRendererRegistry(runtime, { [app.bundleIdentifier]: app })
    : new WindowContentRendererRegistry();
  const stage = Object.freeze({
    id: `application-stage:synapp-test:${app.bundleIdentifier}`,
    appId: app.bundleIdentifier,
    title: app.displayName,
    isFocused: true,
    zIndex: 1,
  });
  const preferencePrefix = `${normalizeBundleIdentifier(app.bundleIdentifier)}:`;
  const storagePrefix = `SynCloudOS4:${runtime.runtimeId}:${preferencePrefix}`;
  const appPersistence: SynWareTestPersistence = Object.freeze({
    getPreference: (key: string, fallback?: unknown) => runtime.persistence.getPreference(`${preferencePrefix}${key}`, fallback),
    setPreference: (key: string, value: unknown) => runtime.persistence.setPreference(`${preferencePrefix}${key}`, value),
    removePreference: (key: string) => runtime.persistence.removePreference(`${preferencePrefix}${key}`),
    entries: () => Object.freeze(environment.adapters.storage.local.entries()
      .filter(entry => entry.key.startsWith(storagePrefix))
      .map(entry => Object.freeze({ key: entry.key.slice(storagePrefix.length), value: JSON.parse(entry.value) as unknown }))),
  });
  let root: Root | null = null;
  let view: SynWareTestRenderResult | null = null;
  let rendering: Promise<SynWareTestRenderResult> | null = null;
  let container: HTMLElement | null = null;
  let ownsContainer = false;
  let disposed = false;
  let disposal: Promise<SynWareTestDisposalReport> | null = null;
  const renderController = new AbortController();
  let renderGeneration = 0;
  let windowControllerId: string | null = null;
  let resourceSequence = 0;
  const ownedResources = new Set<string>();

  const assertRenderLive = (generation: number) => {
    if (disposed || generation !== renderGeneration || renderController.signal.aborted) {
      throw renderAbortError(renderController.signal.reason);
    }
  };

  const ensurePhysicalWindow = async (generation: number) => {
    if (windowControllerId) return windowControllerId;
    assertRenderLive(generation);
    const request: CreateWindowRequest = {
      id: `synapp-test-window:${app.bundleIdentifier}`,
      workspaceId: "workspace-main",
      applicationId: app.bundleIdentifier,
      applicationSessionId: app.bundleIdentifier,
      documentId: null,
      documentAssociationRole: null,
      representedDocument: null,
      toolbar: null,
      role: app.window.role,
      style: app.window.style,
      chromeMode: app.window.chrome,
      smoothSurface: app.window.smoothSurface,
      title: app.window.title,
      content: { rendererId: "application", parameters: { appId: app.bundleIdentifier } },
      bounds: app.window.defaultBounds,
      minimumSize: app.window.minimumSize,
      maximumSize: null,
      level: app.window.role === "standard" ? "normal" : "floating",
      parentWindowControllerId: null,
      anchor: null,
      pinned: false,
      mobilePolicy: app.window.mobilePolicy,
      restorationKey: app.window.restorationKey,
    };
    const controller = runtime.windows.create(request);
    await runtime.windows.open(controller.id, { signal: renderController.signal });
    assertRenderLive(generation);
    windowControllerId = controller.id;
    return controller.id;
  };

  const acquireResource = (label: string): SynWareTestResourceLease => {
    if (disposed) throw new Error("A disposed SynWare test host cannot acquire resources.");
    const normalised = label.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "resource";
    const id = `test-resource:${normalised}:${++resourceSequence}`;
    ownedResources.add(id);
    let released = false;
    return Object.freeze({
      id,
      release() {
        if (released) return;
        released = true;
        ownedResources.delete(id);
      },
    });
  };

  const unmount = () => {
    if (!root) return;
    const current = root;
    root = null;
    flushSync(() => current.unmount());
    view = null;
    context = null;
  };

  const host: SynWareTestHost = {
    get application() { return options.application ? applicationSessionFor({ runtimeId: runtime.runtimeId, appId: app.bundleIdentifier })?.app ?? null : null; },
    clock: environment.clock,
    mediaClock: environment.mediaClock,
    persistence: appPersistence,
    lifecycle: Object.freeze({
      launch: () => runtime.lifecycle.launch(app.bundleIdentifier).result,
      activate: () => runtime.lifecycle.activate(app.bundleIdentifier).result,
      suspend: () => runtime.lifecycle.suspend(app.bundleIdentifier).result,
      close: () => runtime.lifecycle.close(app.bundleIdentifier).result,
      state: () => runtime.lifecycle.getState(app.bundleIdentifier),
    }),
    documents: Object.freeze({
      records: () => {
        return Object.freeze(runtime.documents.applicationDocumentIds(app.bundleIdentifier).flatMap((documentId) => {
          const document = runtime.documents.getDocument(documentId);
          if (!document) return [];
          const snapshot = document.snapshot();
          return [Object.freeze({
            id: snapshot.id,
            typeId: snapshot.typeId,
            state: snapshot.state,
            dirty: snapshot.dirtyRevision > 0,
          })];
        }));
      },
    }),
    commands: Object.freeze({
      inspect: () => Object.freeze(runtime.commands.inspect().registrations.map((entry) => Object.freeze({ id: entry.commandId, responderId: entry.responderId }))),
    }),
    diagnostics: Object.freeze({
      replace(provider: NonNullable<CreateSynWareTestHostOptions["diagnostics"]>) {
        if (disposed) throw new DOMException("The SynWare test host was disposed.", "AbortError");
        diagnosticsProvision.replace(provider);
      },
      revoke() {
        if (disposed) throw new DOMException("The SynWare test host was disposed.", "AbortError");
        diagnosticsProvision.revoke();
      },
    }),
    mediaQueries: environment.mediaQueries,
    adapters: environment.adapters,
    resources: Object.freeze({
      active: () => Object.freeze([
        ...(root ? ["react-root"] : []),
        ...ownedResources,
        ...environment.active(),
      ].sort()),
      acquire: acquireResource,
    }),
    settlement: Object.freeze({
      getState: () => settlementRegistry.getState(),
      subscribe: (listener: () => void) => settlementRegistry.subscribe(listener),
      settled: (settledOptions: { readonly timeoutMs: number; readonly signal?: AbortSignal }) => settlementRegistry.settled(settledOptions),
      begin: (input: SettlementWorkInput) => settlementRegistry.begin(input),
      exclude: (input: SettlementWorkInput) => settlementRegistry.exclude(input),
    }),
    navigation: Object.freeze({
      openRoute(pathname: string, navigationOptions: { readonly signal?: AbortSignal } = {}) {
        return runtime.routes.openRoute(pathname, {
          source: "test",
          syncRoute: false,
          signal: navigationOptions.signal,
        });
      },
    }),
    get appContext() {
      if (!context) throw new Error("SynWare test-host appContext is available after render().");
      return context;
    },
    render() {
      if (disposed) throw new Error("A disposed SynWare test host cannot render.");
      if (view) return Promise.resolve(view);
      if (rendering) return rendering;
      rendering = trackRuntimeSettlement(runtime, (async () => {
        const generation = ++renderGeneration;
        // The production boot path refreshes host identity before application
        // routing. The portable host mounts the production stage directly, so
        // perform that same session refresh here before issuing app capabilities.
        try {
          await runtime.identity.session.refresh({ signal: renderController.signal });
        } catch (error) {
          if (disposed || generation !== renderGeneration || renderController.signal.aborted) {
            throw renderAbortError(renderController.signal.reason ?? error);
          }
          throw error;
        }
        assertRenderLive(generation);
        // This host mounts the production stage without booting the shell.
        // Bind the ordinary responsive observer before class presentation so
        // animation state receives initial and live host media preferences.
        runtime.responsiveModeManager.observe();
        await runtime.bundles.loadBundle(app.bundleIdentifier, { signal: renderController.signal });
        assertRenderLive(generation);
        if (options.application) {
          const launched = await runtime.lifecycle.launch(app.bundleIdentifier, { signal: renderController.signal }).result;
          if (launched.status !== "completed") throw new Error(`The test application failed to launch: ${launched.status}.`);
          if (launched.postCommit !== "completed") throw new Error(`The test application launch did not complete: ${launched.issues.map(issue => issue.message).join("; ") || launched.postCommit}.`);
        }
        if (options.surface === "window") await ensurePhysicalWindow(generation);
        assertRenderLive(generation);
        const document = requireDocument(hostDocument);
        if (!container) {
          container = options.container ?? document.createElement("div");
          ownsContainer = options.container === undefined;
          if (ownsContainer) document.body.append(container);
        }
        const nextRoot = createRoot(container);
        root = nextRoot;
        const content = (
          <HostSiteBrandingProvider value={options.branding ?? Object.freeze({ name: "SynWare Test Host", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null, logoAlt: "" })}>
          <SynCloudOSProvider runtime={runtime}>
            {options.surface === "window" ? (
              <WindowLayer contentRegistry={windowContentRegistry} />
            ) : (
              <ApplicationStageView
                windowContentRegistry={windowContentRegistry}
                stage={stage}
                app={app}
                lifecycle="ready"
              />
            )}
          </SynCloudOSProvider>
          </HostSiteBrandingProvider>
        );
        try {
          assertRenderLive(generation);
          flushSync(() => nextRoot.render(options.strictMode ? <React.StrictMode>{content}</React.StrictMode> : content));
          assertRenderLive(generation);
          view = renderResult(container!, unmount);
          return view;
        } catch (error) {
          if (root === nextRoot) unmount();
          throw error;
        }
      })().finally(() => { rendering = null; }), { owner: "test-host", kind: "render", label: app.bundleIdentifier });
      return rendering;
    },
    dispose() {
      if (disposal) return disposal;
      disposal = (async () => {
        if (disposed) {
          return Object.freeze({ runtimeDisposed: true, remaining: Object.freeze([]), leaked: Object.freeze([]) });
        }
        // Capture forgotten application waiters before registry disposal tells
        // drivers to cancel them and release their independent watchdogs.
        const forgottenWaiters = settlementRegistry.getState().pending
          .filter(item => item.owner === "app-waiter")
          .map(item => `settlement:${item.id}:${item.label}`);
        disposed = true;
        diagnosticsProvision.dispose();
        renderGeneration += 1;
        if (!renderController.signal.aborted) renderController.abort(new DOMException("SynWare test host disposed.", "AbortError"));
        if (!loadGateController.signal.aborted) loadGateController.abort(new DOMException("SynWare test host disposed.", "AbortError"));
        const activeRender = rendering;
        if (activeRender) await activeRender.catch(() => undefined);
        unmount();
        applicationSessionFor({ runtimeId: runtime.runtimeId, appId: app.bundleIdentifier })?.dispose("explicit");
        windowContentRegistry.dispose();
        await runtime.dispose("SynWare test-host disposed.");
        // Inspect every host-owned resource only after the real runtime graph
        // finishes disposing and before the deterministic environment clears it.
        const remaining = Object.freeze([
          ...ownedResources,
          ...environment.active(),
        ].sort());
        const report = Object.freeze({
          runtimeDisposed: true,
          remaining,
          leaked: Object.freeze([...remaining, ...forgottenWaiters].sort()),
        });
        environment.dispose();
        ownedResources.clear();
        if (ownsContainer && container?.parentElement) container.parentElement.removeChild(container);
        return report;
      })();
      return disposal;
    },
  };
  return Object.freeze(host);
}
