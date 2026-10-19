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

// @vitest-environment jsdom

import React from "react";
import { expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import {
  SynWareProvider,
  createSynWare,
  defineSynWareRoutes,
  defineSynWareServiceToken,
  useSynWare,
  useSynWareRouteState,
  useSynWareAppearance,
  useSynWareColourPanel,
  useSynWareCommands,
  useSynWareDocument,
  useSynWareDrag,
  useSynWareLifecycle,
  useSynWarePersistence,
  useSynWarePasteboard,
  useSynWareService,
  useSynWareAudio,
  useSynWareTrustedClient,
  useSynWareWindow,
} from "../../src/SynCloudOS/AppSDK";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { routeQuery } from "../../src/SynCloudOS/Routing/routeQuery";
import { createBrowserRouteCoordinator } from "../../src/SynCloudOS/Routing/BrowserRouteCoordinator";
import { createBrowserRoutePlatform } from "../../src/SynCloudOS/PlatformAdapters/BrowserRoutePlatform";
import { HostSiteBrandingProvider, ResponderScope, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import {
  createTestRuntime,
  createTestRuntimeEnvironment,
  createRuntimeHarness,
  mountTestSynWareRuntime,
  registerTestSynWare,
  unlockRuntime,
} from "./helpers";
import type { AppCloseResult, RuntimeOperationHandle } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";

const missingToken = defineSynWareServiceToken<{ readonly name: string }>({ id: "example.missing" });
const queryGraph = defineSynWareRoutes({ id: "hooks.example", routes: [{
  name: "example", path: "",
  query: { view: routeQuery.enum(["folders", "notes"] as const, { defaultValue: "folders" }) },
}] } as const);

async function renderNamedRoute() {
  const priorHref = window.location.href;
  window.history.replaceState({}, "", "/example?view=folders");
  const environment = createTestRuntimeEnvironment();
  environment.addWindowListener = ((type: string, listener: EventListener) => {
    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
  }) as typeof environment.addWindowListener;
  const runtime = createTestRuntime({ environment });
  const { RuntimeController, Statechart } = createRuntimeHarness(runtime);
  unlockRuntime(runtime);
  RuntimeController.markBooted();
  Statechart.gotoState("active.webspring", { source: "test" });
  const app = registerTestSynWare(runtime, createSynWare({
    manifest: { schemaVersion: 1, id: "example", version: "1.0.0", title: "Example",
      routes: [{ path: "/example", primary: true }], permissions: ["app.open.public"] },
    root: () => null, routes: queryGraph,
  }));
  expect(await runtime.routes.openRoute("/example?view=folders").result).toMatchObject({ status: "completed" });
  let context!: ReturnType<typeof useSynWare>;
  let query!: ReturnType<typeof useSynWareRouteState<typeof queryGraph.routes, "example">>;
  function Probe() {
    context = useSynWare();
    query = useSynWareRouteState(queryGraph, "example");
    const state = React.useSyncExternalStore(query.subscribe, query.getQuery, query.getQuery);
    return <output data-testid="query-view">{state.view}</output>;
  }
  const view = render(<SynCloudOSProvider runtime={runtime}>
    <HostSiteBrandingProvider value={{ name: "Hooks", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null, logoAlt: "Hooks" }}>
      <ResponderScope responderId="application:example" kind="application" parentResponderId="runtime" scopeId="application:example">
        <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:example"><Probe /></SynWareRuntimeMount>
      </ResponderScope>
    </HostSiteBrandingProvider>
  </SynCloudOSProvider>);
  const coordinator = createBrowserRouteCoordinator({
    platform: createBrowserRoutePlatform(environment),
    getRuntimeSnapshot: runtime.store.getSnapshot, subscribeRuntime: runtime.store.subscribe,
    subscribeRouteOpen: listener => runtime.events.subscribe("route.open", event => listener(event.payload as {
      browserHref: string; syncRoute: boolean; historyMode?: "push" | "replace";
    })),
    resolveRoute: runtime.routes.resolveRoute, openRoute: runtime.routes.openRoute,
    getRedirectSuccessor: runtime.routes.getRedirectSuccessor,
    waitForPresentationSettlement: async () => undefined, run: operation => operation(),
  });
  coordinator.start();
  await waitFor(() => expect(view.getByTestId("query-view").textContent).toBe("folders"));
  return { runtime, view, query, context, async dispose() {
    coordinator.stop(); view.unmount(); await runtime.dispose();
    window.history.replaceState({}, "", priorHref);
  } };
}

it("closes a route-hosted app through the SDK without reissuing transfer scopes or retaining its URL", async () => {
  const fixture = await renderNamedRoute();
  try {
    await act(async () => {
      const close = fixture.context.lifecycle.closeSelf() as RuntimeOperationHandle<AppCloseResult>;
      expect(await close.result).toMatchObject({ status: "completed", committed: true });
    });
    expect(fixture.runtime.lifecycle.getState("example")).toBe("closed");
    expect(fixture.view.queryByTestId("query-view")).toBeNull();
    expect(window.location.pathname).toBe("/");
    expect(fixture.runtime.store.getSnapshot()).toMatchObject({
      application: { activeAppId: null, currentAppId: null, routePath: "/" },
      statechart: { currentState: "active.webspring" },
    });
    fixture.view.rerender(<SynCloudOSProvider runtime={fixture.runtime}>
      <HostSiteBrandingProvider value={{ name: "Hooks", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null, logoAlt: "Hooks" }}>
        <SynWareRuntimeMount runtime={fixture.runtime} app={fixture.runtime.apps.getApp("example")!} responderId="application:example">
          <span data-testid="closed-app-content">Closed app must not remount</span>
        </SynWareRuntimeMount>
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>);
    expect(fixture.view.queryByTestId("closed-app-content")).toBeNull();
  } finally {
    await fixture.dispose();
  }
});

function renderWithSynWare(
  runtime: ReturnType<typeof createTestRuntime>,
  renderHook: () => React.ReactNode,
) {
  const app = registerTestSynWare(runtime, { schemaVersion: 1, id: "example", version: "1.0.0", title: "Example" });
  const mounted = mountTestSynWareRuntime(runtime, app.id);
  runtime.focus.requestFocus(`application:${app.id}`);
  const context = createSynWareContextValue(mounted.runtime);

  function Probe() {
    return <>{renderHook()}</>;
  }

  const view = render(
    <SynWareProvider value={context}>
      <Probe />
    </SynWareProvider>,
  );
  return {
    ...view,
    context,
    dispose() {
      view.unmount();
      mounted.dispose();
    },
  };
}

it("removes app commands when the declaring component unmounts", async () => {
  const runtime = createTestRuntime();
  const view = renderWithSynWare(runtime, () => {
    useSynWareCommands([{ id: "example.refresh", title: "Refresh", execute: () => undefined }]);
    return null;
  });

  await expect(runtime.commands.dispatch("example.refresh", undefined))
    .resolves.toMatchObject({ status: "executed" });

  view.unmount();

  await expect(runtime.commands.dispatch("example.refresh", undefined))
    .resolves.toMatchObject({ status: "unhandled" });
  view.dispose();
});

it("keeps an inline declaration structurally stable while using its current handler", async () => {
  const runtime = createTestRuntime();
  const first = vi.fn();
  const second = vi.fn();
  function Probe({ handler }: { readonly handler: () => void }) {
    useSynWareCommands([{ id: "example.refresh", title: "Refresh", execute: () => handler() }]);
    return null;
  }
  const app = registerTestSynWare(runtime, { schemaVersion: 1, id: "example", version: "1.0.0", title: "Example" });
  const mounted = mountTestSynWareRuntime(runtime, app.id);
  runtime.focus.requestFocus(`application:${app.id}`);
  const context = createSynWareContextValue(mounted.runtime);
  const view = render(
    <SynWareProvider value={context}>
      <Probe handler={first} />
    </SynWareProvider>,
  );

  await runtime.commands.dispatch("example.refresh", undefined);
  expect(first).toHaveBeenCalledTimes(1);
  const registration = runtime.commands.inspect().registrations.find(({ commandId }) => commandId === "example.refresh");
  expect(registration).toBeTruthy();

  view.rerender(
    <SynWareProvider value={context}>
      <Probe handler={second} />
    </SynWareProvider>,
  );

  await runtime.commands.dispatch("example.refresh", undefined);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  expect(runtime.commands.inspect().registrations.find(({ commandId }) => commandId === "example.refresh")).toEqual(registration);
  view.unmount();
  mounted.dispose();
});

it("keeps one command registration through the StrictMode effect probe", () => {
  const runtime = createTestRuntime();
  const app = registerTestSynWare(runtime, { schemaVersion: 1, id: "example", version: "1.0.0", title: "Example" });
  const mounted = mountTestSynWareRuntime(runtime, app.id);
  const context = createSynWareContextValue(mounted.runtime);
  function Probe() {
    useSynWareCommands([{ id: "example.refresh", title: "Refresh", execute: () => undefined }]);
    return null;
  }

  const view = render(
    <React.StrictMode>
      <SynWareProvider value={context}>
        <Probe />
      </SynWareProvider>
    </React.StrictMode>,
  );

  expect(runtime.commands.inspect().registrations.filter(({ commandId }) => commandId === "example.refresh")).toHaveLength(1);
  view.unmount();
  expect(runtime.commands.inspect().registrations.filter(({ commandId }) => commandId === "example.refresh")).toHaveLength(0);
  mounted.dispose();
});

it("returns only app-scoped clients and immutable presentation snapshots", () => {
  const runtime = createTestRuntime();
  let observed!: {
    context: ReturnType<typeof useSynWare>;
    commands: ReturnType<typeof useSynWareCommands>;
    documents: ReturnType<typeof useSynWareDocument>;
    lifecycle: ReturnType<typeof useSynWareLifecycle>;
    window: ReturnType<typeof useSynWareWindow>;
    service: ReturnType<typeof useSynWareService>;
  };
  const view = renderWithSynWare(runtime, () => {
    const context = useSynWare();
    const commands = useSynWareCommands([]);
    const lifecycle = useSynWareLifecycle();
    const documents = useSynWareDocument();
    const window = useSynWareWindow();
    const service = useSynWareService(missingToken);
    const pasteboards = useSynWarePasteboard();
    const drag = useSynWareDrag();
    const colourPanel = useSynWareColourPanel();
    const audio = useSynWareAudio();
    const appearance = useSynWareAppearance();
    observed = { context, commands, documents, lifecycle, window, service };
    return <output>{[
      typeof lifecycle.closeSelf,
      typeof documents.workspaceDocuments.getDocument,
      window.snapshot.state,
      service.available,
      pasteboards.context.appId,
      typeof drag.endpoint,
      colourPanel.snapshot.open,
      typeof audio.load,
      typeof audio.fileCapabilities,
      typeof audio.openFile,
      typeof audio.exportFile,
      appearance.resolvedMode,
    ].join(":")}</output>;
  });

  expect(view.getByText("function:function:open:false:example:function:false:function:function:function:function:light")).toBeTruthy();
  expect(observed.context).toBe(view.context);
  expect(observed.context).not.toHaveProperty("runtime");
  expect(observed.commands).toBe(view.context.commands);
  expect(observed.documents).toBe(view.context.documents);
  expect(observed.lifecycle).toBe(view.context.lifecycle);
  expect(observed.window.client).toBe(view.context.windows);
  expect(observed.service).toMatchObject({ available: false, client: null });
  view.dispose();
});

it("persists an app preference through the focused persistence hook", () => {
  const runtime = createTestRuntime();
  const view = renderWithSynWare(runtime, () => {
    const persistence = useSynWarePersistence();
    return <button onClick={() => persistence.setPreference("hook-value", "present")}>Save preference</button>;
  });

  view.getByRole("button", { name: "Save preference" }).click();
  expect(view.context.persistence.getPreference("hook-value", "missing")).toBe("present");
  view.dispose();
});

it("observes named query changes through canonical browser history traversal", async () => {
  const fixture = await renderNamedRoute();
  const listener = vi.fn();
  const unsubscribe = fixture.query.subscribe(listener);
  try {
    await act(async () => {
      expect(await fixture.query.pushQuery({ view: "notes" }).result).toMatchObject({ outcome: "settled" });
    });
    expect(fixture.query.getQuery()).toEqual({ view: "notes" });
    listener.mockClear();
    act(() => window.history.back());
    await waitFor(() => expect(fixture.query.getQuery()).toEqual({ view: "folders" }));
    expect(listener).toHaveBeenCalled();
    expect(fixture.view.getByTestId("query-view").textContent).toBe("folders");
    expect(fixture.context.signal.aborted).toBe(false);
  } finally { unsubscribe(); await fixture.dispose(); }
});

it("replaces named query state without replacing history or revoking the mount", async () => {
  const fixture = await renderNamedRoute();
  const historyLength = window.history.length;
  const listener = vi.fn();
  const unsubscribe = fixture.query.subscribe(listener);
  try {
    await act(async () => {
      expect(await fixture.query.replaceQuery({ view: "notes" }).result).toMatchObject({ outcome: "settled" });
    });
    expect(window.location.search).toBe("?view=notes");
    expect(window.history.length).toBe(historyLength);
    expect(fixture.context.signal.aborted).toBe(false);
    expect(fixture.query.getQuery()).toEqual({ view: "notes" });
    expect(listener).toHaveBeenCalled();
    expect(fixture.view.getByTestId("query-view").textContent).toBe("notes");
  } finally { unsubscribe(); await fixture.dispose(); }
});

it("pushes named query state as a distinct history entry and stops unsubscribed delivery", async () => {
  const fixture = await renderNamedRoute();
  const historyLength = window.history.length;
  const listener = vi.fn();
  const unsubscribe = fixture.query.subscribe(listener);
  try {
    await act(async () => {
      expect(await fixture.query.pushQuery({ view: "notes" }).result).toMatchObject({ outcome: "settled" });
    });
    expect(window.location.search).toBe("?view=notes");
    expect(window.history.length).toBe(historyLength + 1);
    expect(fixture.context.signal.aborted).toBe(false);
    expect(fixture.query.getQuery()).toEqual({ view: "notes" });
    expect(listener).toHaveBeenCalled();
    unsubscribe(); listener.mockClear();
    await act(async () => { await fixture.query.replaceQuery({ view: "folders" }).result; });
    expect(fixture.query.getQuery()).toEqual({ view: "folders" });
    expect(listener).not.toHaveBeenCalled();
  } finally { unsubscribe(); await fixture.dispose(); }
});

it("isolates a retained named query from foreign state and revokes mutation on unmount", async () => {
  const fixture = await renderNamedRoute();
  const retained = fixture.query;
  try {
    registerTestSynWare(fixture.runtime, { schemaVersion: 1, id: "foreign-route-app", version: "1.0.0",
      title: "Foreign Route App", routes: [{ path: "/foreign-route-app", primary: true }], permissions: ["app.open.public"] });
    const listener = vi.fn();
    const unsubscribe = retained.subscribe(listener);
    await act(async () => {
      expect(await fixture.runtime.routes.openRoute("/foreign-route-app?document=foreign-document&mode=edit").result)
        .toMatchObject({ status: "completed" });
    });
    expect(retained.getQuery()).toEqual({ view: "folders" });
    expect(listener).not.toHaveBeenCalled();
    expect(new URL(retained.createUrl({ view: "notes" })).pathname).toBe("/example");
    expect(() => retained.replaceQuery({ document: "foreign-document" } as never)).toThrow(/unknown query key/i);
    expect(fixture.runtime.store.getSnapshot().application.activeAppId).toBe("foreign-route-app");
    fixture.view.unmount();
    expect(fixture.context.signal.aborted).toBe(true);
    expect(() => retained.replaceQuery({ view: "notes" })).toThrow(/revoked/i);
    unsubscribe();
  } finally { await fixture.dispose(); }
});

it("exposes the stable trusted-client collection while ordinary apps remain fail-closed", () => {
  const runtime = createTestRuntime();
  let trusted: ReturnType<typeof useSynWareTrustedClient> | null = null;
  const view = renderWithSynWare(runtime, () => {
    trusted = useSynWareTrustedClient();
    return <output>{typeof trusted.diagnostics}</output>;
  });

  expect(view.getByText("undefined")).toBeTruthy();
  expect(trusted).toBe(view.context.trusted);
  expect(trusted?.diagnostics).toBeUndefined();
  view.dispose();
});
