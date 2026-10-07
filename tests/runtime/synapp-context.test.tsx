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
import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  SynWareProvider,
  createSynWare,
  createSynWareBundle,
  defineSynWareRoutes,
  defineSynWareServiceToken,
  routeQuery,
  useSynWare,
} from "../../src/SynCloudOS/AppSDK";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import {
  createTestRuntime,
  mountTestSynWareRuntime,
  registerTestSynWare,
} from "./helpers";
import { diagnosticsApp } from "./diagnostics-fixture";
import { HostSiteBrandingProvider } from "../../src/SynCloudOSReact";

const siteBranding = Object.freeze({
  name: "Context fixture", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null,
  compactLogoUrl: null, logoAlt: "Context fixture",
});

const mountedApps: Array<ReturnType<typeof mountTestSynWareRuntime>> = [];

afterEach(() => {
  for (const mounted of mountedApps.splice(0)) mounted.dispose();
});

function createTestAppContext(runtimeId: string, appId: string) {
  const runtime = createTestRuntime({ id: runtimeId });
  registerTestSynWare(runtime, { schemaVersion: 1, version: "1.0.0", id: appId, title: appId });
  const mounted = mountTestSynWareRuntime(runtime, appId);
  mountedApps.push(mounted);
  return createSynWareContextValue(mounted.runtime);
}

function Probe() {
  const app = useSynWare();
  return <output>{`${app.appId}:${app.runtimeInfo.id}`}</output>;
}

it("resolves the nearest app and runtime instance", () => {
  const outer = createTestAppContext("runtime:outer", "outer-app");
  const inner = createTestAppContext("runtime:inner", "memo-journal");

  render(
    <SynWareProvider value={outer}>
      <SynWareProvider value={inner}>
        <Probe />
      </SynWareProvider>
    </SynWareProvider>,
  );

  expect(screen.getByText("memo-journal:runtime:inner")).toBeTruthy();
});

it("projects mounted outer navigation through the typed route transition result", async () => {
  const runtime = createTestRuntime({ id: "runtime:typed-navigation" });
  registerTestSynWare(runtime, { schemaVersion: 1, version: "1.0.0", id: "navigation-source", title: "Navigation source" });
  registerTestSynWare(runtime, { schemaVersion: 1, version: "1.0.0", id: "navigation-target", title: "Navigation target" });
  runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
  const mounted = mountTestSynWareRuntime(runtime, "navigation-source");
  mountedApps.push(mounted);
  const context = createSynWareContextValue(mounted.runtime);

  const transition = context.navigation.openRoute("/navigation-target", { source: "typed-navigation-test", syncRoute: false });
  await expect(transition.result).resolves.toMatchObject({
    outcome: "settled",
    committed: true,
    postCommit: "completed",
    route: { pathname: "/navigation-target", kind: "app", appId: "navigation-target" },
  });
  expect(transition).toEqual(expect.objectContaining({ retry: expect.any(Function), replace: expect.any(Function) }));
  await runtime.dispose("typed navigation test complete");
});

it("projects canonical programmatic query and nested not-found failures as typed outer navigation outcomes", async () => {
  const runtime = createTestRuntime({ id: "runtime:typed-navigation-errors" });
  registerTestSynWare(runtime, { schemaVersion: 1, version: "1.0.0", id: "navigation-source", title: "Navigation source" });
  const routes = defineSynWareRoutes({
    id: "navigation.query.target",
    routes: [{
      name: "query-target",
      path: "",
      query: { page: routeQuery.integer({ defaultValue: 1, min: 1, max: 5 }) },
      children: [{ name: "query-target.item", path: "item/:itemId" }],
    }],
  } as const);
  registerTestSynWare(runtime, createSynWare({
    manifest: {
      schemaVersion: 1,
      id: "navigation-query-target",
      version: "1.0.0",
      title: "Navigation query target",
      routes: [{ path: "/navigation-query", primary: true, match: "prefix" }],
      permissions: ["app.open.public"],
    },
    root: () => null,
    routes,
  }));
  runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
  const mounted = mountTestSynWareRuntime(runtime, "navigation-source");
  mountedApps.push(mounted);
  const context = createSynWareContextValue(mounted.runtime);

  await expect(context.navigation.openRoute("/navigation-query?page=2x").result).resolves.toMatchObject({
    outcome: "invalid-query",
    committed: false,
    code: "route-invalid-query",
  });
  await expect(context.navigation.openRoute("/navigation-query/unknown").result).resolves.toMatchObject({
    outcome: "not-found",
    committed: false,
    code: "route-not-found",
  });
  await runtime.dispose("typed navigation error test complete");
});

it("does not expose the privileged runtime object to app code", () => {
  const app = createTestAppContext("runtime:private", "memo-journal");

  expect(app).not.toHaveProperty("runtime");
  expect(app.runtimeInfo).toEqual(expect.objectContaining({
    id: "runtime:private",
  }));
  expect(app.runtimeInfo).not.toHaveProperty("presentation");
  expect(Object.keys(app.presentation).sort()).toEqual(["getSnapshot", "subscribe"]);
  expect(app.commands).not.toHaveProperty("registry");
  expect(app.windows).not.toHaveProperty("manager");
  expect(app.drag).not.toHaveProperty("manager");
  expect(app.colourPanel).not.toHaveProperty("ownerToken");
  const runtime = createTestRuntime({ id: "runtime:outgoing-presentation" });
  const outgoingApp = registerTestSynWare(runtime, { schemaVersion: 1, version: "1.0.0", id: "outgoing-presentation", title: "Outgoing presentation" });
  const responder = runtime.responders.register({
    id: `application:${outgoingApp.id}`,
    kind: "application",
    parentId: "runtime",
    scopeId: `application:${outgoingApp.id}`,
  });
  const mounted = mountTestSynWareRuntime(runtime, outgoingApp.id);
  mountedApps.push(mounted);
  const context = createSynWareContextValue(mounted.runtime);
  const expected = {
    online: context.runtimeInfo.online,
    locale: context.runtimeInfo.locale,
    timeZone: context.runtimeInfo.timeZone,
  };

  responder.dispose({ cascade: true });

  expect(mounted.runtime.signal.aborted).toBe(true);
  expect(() => mounted.runtime.platform.online()).toThrow(/revoked|capability|Abort/i);
  expect(context.runtimeInfo.online).toBe(expected.online);
  expect(context.runtimeInfo.locale).toBe(expected.locale);
  expect(context.runtimeInfo.timeZone).toBe(expected.timeZone);
});

it("creates one stable explicit context for a mounted app session", () => {
  const runtime = createTestRuntime({ id: "runtime:mounted" });
  const app = registerTestSynWare(runtime, { schemaVersion: 1, version: "1.0.0", id: "mounted-app", title: "Mounted App" });
  const responder = runtime.responders.register({
    id: "application:mounted-app",
    kind: "application",
    parentId: "workspace",
    scopeId: "application:mounted-app",
  });
  const contexts: unknown[] = [];

  function MountedProbe() {
    const context = useSynWare();
    contexts.push(context);
    return <output>{`${context.appId}:${context.runtimeInfo.id}`}</output>;
  }

  const view = render(
    <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={siteBranding}>
      <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:mounted-app">
        <MountedProbe />
      </SynWareRuntimeMount>
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>,
  );

  expect(screen.getByText("mounted-app:runtime:mounted")).toBeTruthy();
  view.rerender(
    <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={siteBranding}>
      <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:mounted-app">
        <MountedProbe />
      </SynWareRuntimeMount>
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>,
  );
  expect(contexts).toHaveLength(2);
  expect(contexts[1]).toBe(contexts[0]);

  const equivalentBranding = Object.freeze({ ...siteBranding });
  view.rerender(
    <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={equivalentBranding}>
      <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:mounted-app">
        <MountedProbe />
      </SynWareRuntimeMount>
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>,
  );
  expect(contexts).toHaveLength(3);
  expect(contexts[2]).toBe(contexts[0]);

  const changedBranding = Object.freeze({ ...siteBranding, name: "Changed context fixture" });
  view.rerender(
    <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={changedBranding}>
      <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:mounted-app">
        <MountedProbe />
      </SynWareRuntimeMount>
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>,
  );
  expect(contexts).toHaveLength(4);
  expect(contexts[3]).not.toBe(contexts[0]);
  expect((contexts[3] as ReturnType<typeof useSynWare>).branding.name).toBe("Changed context fixture");

  view.unmount();
  responder.dispose({ cascade: true });
});

it("resolves only declared, host-provided app-scoped services and fails closed otherwise", () => {
  const runtime = createTestRuntime({ id: "runtime:declared-service" });
  const definition = createSynWare({
    manifest: {
      schemaVersion: 1,
      id: "com.syndromatic.service-example",
      version: "1.0.0",
      title: "Service example",
      services: [{ id: "com.syndromatic.search", required: true, minimumVersion: "1.0.0" }],
      permissions: ["clipboard.read"],
    },
    root: () => null,
  });
  const app = runtime.apps.register(createSynWareBundle(definition));
  if (!app) throw new Error("The service test app did not register.");
  runtime.services.register({
    id: "com.syndromatic.search",
    version: "2.0.0",
    requiredPermissions: ["clipboard.read"],
    createAppClient({ appId, permissions }) {
      return Object.freeze({ appId, permissions: Object.freeze([...permissions]), search: () => "ok" });
    },
  });
  const mounted = mountTestSynWareRuntime(runtime, app.id);
  const context = createSynWareContextValue(mounted.runtime);

  expect(context.services.optional(defineSynWareServiceToken<{ readonly appId: string; readonly permissions: readonly string[]; search(): string }>({ id: "com.syndromatic.search", minimumVersion: "1.0.0" }))).toEqual({
    available: true,
    client: expect.objectContaining({ appId: app.id, permissions: ["clipboard.read"] }),
    denial: null,
  });
  expect(context.services.optional(defineSynWareServiceToken({ id: "com.syndromatic.missing" }))).toEqual(expect.objectContaining({
    available: false,
    client: null,
    denial: expect.objectContaining({ code: "unavailable" }),
  }));
  expect(context.services.optional(defineSynWareServiceToken({ id: "com.syndromatic.search", minimumVersion: "3.0.0" }))).toEqual(expect.objectContaining({
    available: false,
    client: null,
    denial: expect.objectContaining({ code: "unavailable" }),
  }));
    runtime.policy.registerPolicy("deny-search", (request, decision) =>
      request.app?.id === app.id ? { ...decision, allowed: false, decision: "deny" } : decision,
    );
  expect(context.services.optional(defineSynWareServiceToken({ id: "com.syndromatic.search" }))).toEqual(expect.objectContaining({
    available: false,
    client: null,
    denial: expect.objectContaining({ code: "denied" }),
  }));

  mounted.dispose();
});

it("enforces full SemVer precedence and keeps the stricter caller requirement", () => {
  const runtime = createTestRuntime({ id: "runtime:semver" });
  const definition = createSynWare({
    manifest: {
      schemaVersion: 1,
      id: "com.syndromatic.semver-example",
      version: "1.0.0",
      title: "SemVer example",
      services: [{ id: "com.syndromatic.semver-service", required: true, minimumVersion: "1.0.0-beta.1" }],
    },
    root: () => null,
  });
  const app = runtime.apps.register(createSynWareBundle(definition));
  if (!app) throw new Error("The SemVer test app did not register.");
  const register = (version: string) => runtime.services.register({
    id: "com.syndromatic.semver-service",
    version,
    createAppClient: () => Object.freeze({ version }),
  });
  const mounted = mountTestSynWareRuntime(runtime, app.id);
  const context = createSynWareContextValue(mounted.runtime);

  register("1.0.0-alpha.9");
  expect(context.services.optional(defineSynWareServiceToken({ id: "com.syndromatic.semver-service" }))).toMatchObject({ available: false });
  register("1.0.0-beta.2");
  expect(context.services.optional(defineSynWareServiceToken({ id: "com.syndromatic.semver-service" }))).toMatchObject({ available: true });
  expect(context.services.optional(defineSynWareServiceToken({ id: "com.syndromatic.semver-service", minimumVersion: "1.0.0" }))).toMatchObject({ available: false });
  register("1.0.0");
  expect(context.services.optional(defineSynWareServiceToken({ id: "com.syndromatic.semver-service" }))).toMatchObject({ available: true });
  register("1.0.0+build.7");
  expect(context.services.optional(defineSynWareServiceToken({ id: "com.syndromatic.semver-service", minimumVersion: "1.0.0+build.99" }))).toMatchObject({ available: true });

  mounted.dispose();
});

it("keeps an enormous caller service minimum stricter at the mounted resolution boundary", () => {
  const runtime = createTestRuntime({ id: "runtime:semver-exact-service-boundary" });
  const lower = "9007199254740992.0.0";
  const higher = "9007199254740993.0.0";
  const definition = createSynWare({
    manifest: {
      schemaVersion: 1,
      id: "com.syndromatic.exact-semver-service",
      version: "1.0.0",
      title: "Exact SemVer service",
      services: [{ id: "com.syndromatic.exact-semver-provider", required: true, minimumVersion: lower }],
    },
    root: () => null,
  });
  const app = runtime.apps.register(createSynWareBundle(definition));
  if (!app) throw new Error("The exact SemVer app did not register.");
  runtime.services.register({
    id: "com.syndromatic.exact-semver-provider",
    version: lower,
    createAppClient: () => Object.freeze({ version: lower }),
  });
  const mounted = mountTestSynWareRuntime(runtime, app.id);
  const context = createSynWareContextValue(mounted.runtime);

  expect(context.services.optional(defineSynWareServiceToken({ id: "com.syndromatic.exact-semver-provider", minimumVersion: lower }))).toMatchObject({
    available: true,
    client: expect.objectContaining({ version: lower }),
    denial: null,
  });
  expect(context.services.optional(defineSynWareServiceToken({ id: "com.syndromatic.exact-semver-provider", minimumVersion: higher }))).toMatchObject({
    available: false,
    client: null,
    denial: expect.objectContaining({ code: "unavailable" }),
  });

  mounted.dispose();
});

it("keeps explicit mounted runtime identities exact for ordinary and Diagnostics apps", () => {
  const ordinaryRuntime = createTestRuntime({ id: "runtime:ordinary-identity" });
  const diagnosticsRuntime = createTestRuntime({ id: "runtime:diagnostics-identity" });
  registerTestSynWare(ordinaryRuntime, { schemaVersion: 1, version: "1.0.0", id: "ordinary-identity", title: "Ordinary identity" });
  registerTestSynWare(diagnosticsRuntime, diagnosticsApp);
  const ordinary = mountTestSynWareRuntime(ordinaryRuntime, "ordinary-identity");
  const diagnostics = mountTestSynWareRuntime(diagnosticsRuntime, "diagnostics");

  expect(createSynWareContextValue(ordinary.runtime).runtimeInfo.id).toBe("runtime:ordinary-identity");
  expect(createSynWareContextValue(diagnostics.runtime).runtimeInfo.id).toBe("runtime:diagnostics-identity");
  expect(diagnostics.runtime.diagnostics.getReport()).toMatchObject({
    runtimeId: "runtime:diagnostics-identity",
    appId: "diagnostics",
  });

  ordinary.dispose();
  diagnostics.dispose();
});

it("projects app-namespaced environment clients without crossing runtime or app boundaries", () => {
  const firstRuntime = createTestRuntime({ id: "runtime:environment-first" });
  const secondRuntime = createTestRuntime({ id: "runtime:environment-second" });
  const sharedDefinition = { schemaVersion: 1, version: "1.0.0", id: "environment-shared", title: "Environment Shared" } as const;
  registerTestSynWare(firstRuntime, sharedDefinition);
  registerTestSynWare(secondRuntime, sharedDefinition);
  registerTestSynWare(firstRuntime, { schemaVersion: 1, version: "1.0.0", id: "environment-other", title: "Environment Other" });

  const first = mountTestSynWareRuntime(firstRuntime, "environment-shared");
  const sameAppSecondMount = mountTestSynWareRuntime(firstRuntime, "environment-shared", "application:environment-shared:second");
  const otherApp = mountTestSynWareRuntime(firstRuntime, "environment-other");
  const separateHost = mountTestSynWareRuntime(secondRuntime, "environment-shared");
  mountedApps.push(first, sameAppSecondMount, otherApp, separateHost);

  const firstContext = createSynWareContextValue(first.runtime);
  const sameAppContext = createSynWareContextValue(sameAppSecondMount.runtime);
  const otherAppContext = createSynWareContextValue(otherApp.runtime);
  const separateHostContext = createSynWareContextValue(separateHost.runtime);

  firstContext.persistence.setPreference("draft-mode", "compact");

  expect(sameAppContext.persistence.getPreference("draft-mode", "regular")).toBe("compact");
  expect(otherAppContext.persistence.getPreference("draft-mode", "regular")).toBe("regular");
  expect(separateHostContext.persistence.getPreference("draft-mode", "regular")).toBe("regular");
  expect(firstContext.scheduler).not.toHaveProperty("platform");
  expect(firstContext.identity).not.toHaveProperty("store");
  expect(firstContext).not.toHaveProperty("runtime");
  expect(firstContext).not.toHaveProperty("state");
  expect(firstContext).not.toHaveProperty("platform");
  expect(firstContext).not.toHaveProperty("settings");
});

it("cancels scheduler callbacks at mount disposal while retaining stable read-only snapshots", () => {
  vi.useFakeTimers();
  try {
    const runtime = createTestRuntime({ id: "runtime:environment-cancellation" });
    registerTestSynWare(runtime, { schemaVersion: 1, version: "1.0.0", id: "environment-cancellation", title: "Environment cancellation" });
    const mounted = mountTestSynWareRuntime(runtime, "environment-cancellation");
    const context = createSynWareContextValue(mounted.runtime);
    const callback = vi.fn();

    const completed = context.scheduler.setTimeout(callback, 1);
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(completed.dispose()).toBe(false);

    const timeout = context.scheduler.setTimeout(callback, 25);
    const firstWorkArea = context.workArea.getSnapshot();
    const firstIdentity = context.identity.getSnapshot();
    const firstSettings = context.settingsAvailability.getSnapshot();

    expect(context.workArea.getSnapshot()).toBe(firstWorkArea);
    expect(context.identity.getSnapshot()).toBe(firstIdentity);
    expect(context.settingsAvailability.getSnapshot()).toBe(firstSettings);

    mounted.dispose("environment test disposed");
    vi.advanceTimersByTime(30);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(timeout.dispose()).toBe(false);
    expect(context.workArea.getSnapshot()).toBe(firstWorkArea);
    expect(context.identity.getSnapshot()).toBe(firstIdentity);
    expect(context.settingsAvailability.getSnapshot()).toBe(firstSettings);
  } finally {
    vi.useRealTimers();
  }
});

it("fails closed for undeclared environment capabilities", async () => {
  const runtime = createTestRuntime({ id: "runtime:environment-denial" });
  registerTestSynWare(runtime, { schemaVersion: 1, version: "1.0.0", id: "environment-denial", title: "Environment denial" });
  const mounted = mountTestSynWareRuntime(runtime, "environment-denial");
  mountedApps.push(mounted);
  const context = createSynWareContextValue(mounted.runtime);

  await expect(context.notifications.post({ title: "Denied", body: "No notification entitlement" }))
    .rejects.toThrow(/declared|capability|notification/i);
});

it("delivers declared notification actions only while their mounted client remains live", async () => {
  const runtime = createTestRuntime({ id: "runtime:environment-notification-actions" });
  const definition = createSynWare({
    manifest: {
      schemaVersion: 1,
      id: "com.syndromatic.environment-notification",
      version: "1.0.0",
      title: "Environment notification",
      permissions: ["notifications.post"],
    },
    root: () => null,
  });
  const app = runtime.apps.register(createSynWareBundle(definition));
  if (!app) throw new Error("The notification action app did not register.");
  const mounted = mountTestSynWareRuntime(runtime, app.id);
  const context = createSynWareContextValue(mounted.runtime);
  const listener = vi.fn();
  const unsubscribe = context.notifications.subscribeActions(listener);

  const notificationId = await context.notifications.post({
    title: "Action",
    body: "Mounted action delivery",
    actionIds: ["open"],
  });
  const rawActionId = `${app.id}:application:${app.id}:open`;

  await expect(runtime.notifications.invokeAction(notificationId, rawActionId)).resolves.toMatchObject({ status: "completed" });
  expect(listener).toHaveBeenCalledWith({ notificationId, actionId: "open" });

  mounted.dispose();
  await expect(runtime.notifications.invokeAction(notificationId, rawActionId)).resolves.toMatchObject({ status: "unavailable" });
  unsubscribe();
});
