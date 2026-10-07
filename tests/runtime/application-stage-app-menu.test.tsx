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

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SynCloudOSAppInfo } from "../../src/SynCloudOS/AppInfo/appInfoTypes";
import { useResolvedMode as useScopedResolvedMode } from "../../src/SynCloudOS/Appearance/useAppearance";
import { clearOwnedResponderAnchor, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { useSynWare, useSynWareQuickSwitchTrigger } from "../../src/SynCloudOS/AppSDK";
import { createInMemoryNSETextOwner, plainNSETextContent, NSETextCommands, NSETextView, TextEditingSession } from "@syndromatic/syncloudos/nse/text";
import { NSEHierarchyStack, NSENavigationStackController, NSETabBarController } from "../../src/NSE/Navigation";
import { useNSEDeferredDisposal, type NSEDisposalScheduler } from "../../src/NSE/NSE";
import { createSynWare, ResponderScope, useSynWareLocalisedStrings } from "@syndromatic/syncloudos/sdk";
import { ApplicationStageView } from "../../src/Webspring/ApplicationStageView";
import { NSESidebar, NSESourceListScene } from "../../src/NSE/Navigation/SourceList";
import { authoriseTestRuntime, createTestBundle, createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime } from "./helpers";
import { HostSiteBrandingProvider } from "../../src/SynCloudOSReact";

const stageSiteBranding = Object.freeze({
  name: "Stage fixture", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null,
  compactLogoUrl: null, logoAlt: "Stage fixture",
});


const fixtureDisposalScheduler: NSEDisposalScheduler = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
};



vi.mock("../../src/Webspring/webspringLocale", () => ({
  useWebspringLocale: () => ({
    appName: (app: SynCloudOSAppInfo, variant = "display") =>
      variant === "window" ? app.window.title : app.displayName,
    t: (_key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) =>
        params && key in params ? String(params[key]) : match
      )
  })
}));

function createAppInfo(topBar: "standard" | "custom" | "none" = "standard"): SynCloudOSAppInfo {
  return {
    id: "test-app",
    displayName: "Test App",
    shortName: "Test",
    packageName: "com.test.app",
    frame: {
      layout: "defacto",
      material: "standard",
      rightSlot: "userInfo",
      smoothSurface: "off",
      sourceList: undefined,
      topBar
    },
    icon: { src: "/test.png" },
    isDisabled: false,
    notifications: { badgeCount: 0, showsNotifications: false },
    presentation: "appView",
    route: "/test",
    window: {
      chrome: "system",
      defaultHeight: 720,
      defaultWidth: 960,
      minHeight: 400,
      minWidth: 400,
      resizable: true,
      title: "Test App"
    }
  } as SynCloudOSAppInfo;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderFrame(beforeRender?: (runtime: ReturnType<typeof createTestRuntime>) => void) {
  const runtime = authoriseTestRuntime(createTestRuntime());
  runtime.apps.registerBundle(createTestBundle({ id: "test-app", displayName: "Test App", route: "/test" }));
  runtime.statechart.gotoState("active.application.active");
  beforeRender?.(runtime);
  render(
    <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={stageSiteBranding}>
      <ApplicationStageView
        app={createAppInfo()}
        lifecycle="ready"
        stage={{ appId: "test-app", id: "application-stage:test-app", title: "Test App", isFocused: true, zIndex: 10 }}
      />
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>
  );
  return runtime;
}

function ApplicationStageHierarchyFixture() {
  const [tabs] = React.useState(() => new NSETabBarController<React.ReactNode>({
    id: "stage-hierarchy-tabs",
    destinations: [
      { id: "home", label: "Home", accessibleLabel: "Home destination", icon: { kind: "template", name: "home" } },
      { id: "library", label: "Library", accessibleLabel: "Library destination", icon: { kind: "template", name: "library" } },
    ],
  }));
  const [stack] = React.useState(() => new NSENavigationStackController({
    id: "stage-hierarchy-stack",
    rootDestinationId: "home",
    destinationIds: ["home", "library"],
  }));
  const navigationResources = React.useMemo(() => ({
    dispose() {
      stack.dispose();
      tabs.dispose();
    },
  }), [stack, tabs]);
  useNSEDeferredDisposal(navigationResources, fixtureDisposalScheduler);
  return (
    <section>
      <button data-testid="stage-open-library" type="button" onClick={() => { void stack.push("library"); }}>Open Library destination</button>
      <NSEHierarchyStack
        controller={tabs}
        stackController={stack}
        applicationChrome={{ ownerId: "test-app:application-hierarchy" }}
        rootTitle="Test App"
        title="Library destination"
        aria-label="Stage hierarchy fixture"
      />
    </section>
  );
}

function CustomQuickSwitchTitleFixture() {
  const quickSwitch = useSynWareQuickSwitchTrigger();
  if (!quickSwitch) return <p>QuickSwitch unavailable</p>;
  return (
    <button
      type="button"
      aria-expanded={quickSwitch.open}
      onClick={quickSwitch.toggle}
    >
      {quickSwitch.label}
    </button>
  );
}

describe("ApplicationStageView app menu", () => {
  it("owns source-list identity, destination title and a single footer, and drops the top rail on compact displays", async () => {
    let viewport = { width: 1440, height: 900 };
    const listeners = new Set<(snapshot: typeof viewport) => void>();
    const runtime = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), layoutViewport: { getSnapshot: () => viewport, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } } } });
    function SourceListFixture() {
      const traits = React.useSyncExternalStore(runtime.presentationTraits.subscribe, runtime.presentationTraits.getSnapshot, runtime.presentationTraits.getSnapshot);
      return <NSESourceListScene title="Buttons" compact={traits.horizontalSizeClass === "compact"} sidebar={<NSESidebar sections={[]} />} status={{ rail: "25 sections" }}><input aria-label="Live draft" defaultValue="Draft" /></NSESourceListScene>;
    }
    runtime.apps.registerBundle(createTestBundle({ id: "test-app", route: "/test" }, {
      loadModule: async () => ({ default: SourceListFixture }),
    }));
    await runtime.bundles.loadBundle("test-app");
    const app = { ...createAppInfo(), frame: { ...createAppInfo().frame, material: "metal" as const, sourceList: { minWidth: 220, maxWidth: 320, defaultWidth: 254, railLabel: "NSE Gallery" } } };
    const fixture = () => <SynCloudOSProvider runtime={runtime}><HostSiteBrandingProvider value={stageSiteBranding}><ApplicationStageView app={app} lifecycle="active" stage={{ appId: "test-app", id: "application-stage:test-app", title: "Test App", isFocused: true, zIndex: 10 }} /></HostSiteBrandingProvider></SynCloudOSProvider>;
    const view = render(fixture());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Buttons" })).toBeTruthy());
    expect(view.container.querySelector('.nse-app-topbar-metal-rail-content')?.textContent).toContain("NSE Gallery");
    expect(view.container.querySelectorAll(".nse-app-topbar")).toHaveLength(1);
    expect(view.container.querySelectorAll("footer")).toHaveLength(1);
    const draft = screen.getByRole("textbox", { name: "Live draft" });
    fireEvent.change(draft, { target: { value: "Retained" } });
    viewport = { width: 390, height: 844 };
    listeners.forEach(listener => listener(viewport));
    await waitFor(() => expect(view.container.querySelector('.nse-app-topbar')?.getAttribute('data-has-rail')).toBe("false"));
    expect(view.container.querySelector("footer")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Live draft" })).toBe(draft);
    viewport = { width: 1440, height: 900 };
    listeners.forEach(listener => listener(viewport));
    await waitFor(() => expect(view.container.querySelector('.nse-app-topbar')?.getAttribute('data-has-rail')).toBe("true"));
    expect((draft as HTMLInputElement).value).toBe("Retained");
  });
  it("projects the shell-owned QuickSwitch action and subscribed open state into custom app chrome", async () => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle(
      { id: "test-app", displayName: "Test App", route: "/test" },
      { loadModule: async () => ({ default: CustomQuickSwitchTitleFixture }) },
    ));
    await runtime.bundles.loadBundle("test-app");
    runtime.statechart.gotoState("active.application.active");
    const onQuickSwitchRequest = vi.fn();
    const frame = (open: boolean) => (
      <HostSiteBrandingProvider value={stageSiteBranding}>
      <SynCloudOSProvider runtime={runtime}>
        <ApplicationStageView
          app={createAppInfo("custom")}
          lifecycle="active"
          quickSwitchOpen={open}
          onQuickSwitchRequest={onQuickSwitchRequest}
          stage={{ appId: "test-app", id: "application-stage:test-app", title: "Test App", isFocused: true, zIndex: 10 }}
        />
      </SynCloudOSProvider>
      </HostSiteBrandingProvider>
    );
    const view = render(frame(false));

    const open = await screen.findByRole("button", { name: "Open QuickSwitch" });
    expect(open.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(open);
    expect(onQuickSwitchRequest).toHaveBeenCalledTimes(1);

    view.rerender(frame(true));
    const close = await screen.findByRole("button", { name: "Close QuickSwitch" });
    expect(close.getAttribute("aria-expanded")).toBe("true");
  });

  it("projects a pushed hierarchy into the one shared top bar and restores its source focus through Back", async () => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle(
      { id: "test-app", displayName: "Test App", route: "/test" },
      { loadModule: async () => ({ default: ApplicationStageHierarchyFixture }) },
    ));
    await runtime.bundles.loadBundle("test-app");
    runtime.statechart.gotoState("active.application.active");

    render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={stageSiteBranding}>
        <ApplicationStageView
          app={createAppInfo()}
          lifecycle="active"
          stage={{ appId: "test-app", id: "application-stage:test-app", title: "Test App", isFocused: true, zIndex: 10 }}
        />
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    );

    const open = await screen.findByTestId("stage-open-library");
    expect(document.querySelectorAll(".nse-app-topbar")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Test App" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Back to / })).toBeNull();
    open.focus();
    expect(document.activeElement).toBe(open);
    fireEvent.click(open);
    const back = await screen.findByRole("button", { name: "Back to Home destination" });
    expect(document.querySelectorAll(".nse-app-topbar")).toHaveLength(1);
    expect(screen.queryByText("Back", { selector: ".nse-hierarchy-stack button" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Return to Webspring" })).toBeNull();
    expect(screen.queryByRole("button", { name: "User Info" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Library destination" })).toBeTruthy();

    fireEvent.click(back);
    await waitFor(() => expect(document.activeElement).toBe(open));
  });

  it("keeps the shared hierarchy chrome controller live through StrictMode effect replay", async () => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle(
      { id: "test-app", displayName: "Test App", route: "/test" },
      { loadModule: async () => ({ default: ApplicationStageHierarchyFixture }) },
    ));
    await runtime.bundles.loadBundle("test-app");
    runtime.statechart.gotoState("active.application.active");

    render(
      <React.StrictMode>
        <SynCloudOSProvider runtime={runtime}>
          <HostSiteBrandingProvider value={stageSiteBranding}>
          <ApplicationStageView
            app={createAppInfo()}
            lifecycle="active"
            stage={{ appId: "test-app", id: "application-stage:test-app", title: "Test App", isFocused: true, zIndex: 10 }}
          />
          </HostSiteBrandingProvider>
        </SynCloudOSProvider>
      </React.StrictMode>,
    );

    const open = await screen.findByTestId("stage-open-library");
    fireEvent.click(open);
    expect(await screen.findByRole("button", { name: "Back to Home destination" })).toBeTruthy();
  });

  it.each(["custom", "none"] as const)("does not synthesise stage chrome for a %s-frame application claim", async (topBar) => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle(
      { id: "test-app", displayName: "Test App", route: "/test" },
      { loadModule: async () => ({ default: ApplicationStageHierarchyFixture }) },
    ));
    await runtime.bundles.loadBundle("test-app");
    runtime.statechart.gotoState("active.application.active");

    render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={stageSiteBranding}>
        <ApplicationStageView
          app={createAppInfo(topBar)}
          lifecycle="active"
          stage={{ appId: "test-app", id: `application-stage:test-app:${topBar}`, title: "Test App", isFocused: true, zIndex: 10 }}
        />
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    );

    fireEvent.click(await screen.findByTestId("stage-open-library"));
    await waitFor(() => expect(document.querySelectorAll(".nse-app-topbar")).toHaveLength(0));
    expect(screen.queryByRole("button", { name: "Back to Home destination" })).toBeNull();
  });

  it("does not prepaint an outgoing 3D pose when reduced motion is active", () => {
    const runtime = createTestRuntime();
    runtime.settings.set("motion", "reduced");
    runtime.apps.registerBundle(createTestBundle({ id: "test-app", displayName: "Test App", route: "/test" }));
    runtime.statechart.gotoState("active.application.active");

    render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={stageSiteBranding}>
        <ApplicationStageView
          app={createAppInfo()}
          lifecycle="active"
          multiSwitchId="switch:reduced-motion"
          multiSwitchRole="outgoing"
          stage={{ appId: "test-app", id: "application-stage:test-app", title: "Test App", isFocused: true, zIndex: 10 }}
        />
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    );

    const surface = document.querySelector<HTMLElement>('.webspring-app-view-surface[data-multiswitch-role="outgoing"]');
    expect(surface).not.toBeNull();
    expect(surface?.style.transform).toBe("");
  });

  it("does not invalidate focus state when an inactive responder releases an anchor", () => {
    const runtime = createTestRuntime();
    runtime.focus.setActiveAnchors({
      applicationResponderId: "application:active",
      windowResponderId: "window:active",
      workspaceResponderId: "workspace",
      webspringResponderId: "webspring",
      runtimeResponderId: "runtime",
    });
    const generation = runtime.focus.getGeneration();

    clearOwnedResponderAnchor(runtime, "window", "window:inactive");

    expect(runtime.focus.getGeneration()).toBe(generation);
    expect(runtime.focus.getActiveAnchors().windowResponderId).toBe("window:active");
  });

  it("owns the live control-document-window-application responder chain and clears stale anchors", async () => {
    const runtime = createTestRuntime();
    let liveSession: TextEditingSession | undefined;
    function LiveTextConsumer() {
      const app = useSynWare();
      const [text] = React.useState(() => {
        const owner = createInMemoryNSETextOwner({ content: plainNSETextContent("Live") });
        const session = new TextEditingSession({ id: "session:live", documentId: "document:live", owner });
        return { owner, session, commands: new NSETextCommands({ session }) };
      });
      liveSession = text.session;
      React.useEffect(() => {
        const registration = app.commands.register({
          id: "test-app.select-all", responderId: "editor:live", scope: "focused",
          title: { key: "test.select-all", fallback: "Select All" },
          payload: { parse: (value: unknown) => value === undefined ? { ok: true, value } : { ok: false, issues: ["No payload is accepted."] } },
          defaultKeyBindings: [], undo: { kind: "none" },
          validate: () => ({ enabled: text.commands.validate("text.selectAll").enabled }),
          execute: ({ signal }: { signal: AbortSignal }) => text.commands.execute("text.selectAll", undefined, { signal }),
        });
        return () => { registration.dispose(); text.commands.dispose(); text.session.dispose(); text.owner.dispose(); };
      }, [app, text]);
      return <ResponderScope responderId="document:live" kind="document" scopeId="scope:document:live">
        <ResponderScope responderId="editor:live" kind="control" scopeId="scope:editor:live">
          <div onFocus={() => { app.responders.requestFocus("editor:live"); }}>
            <NSETextView session={text.session} label="Live document" />
          </div>
        </ResponderScope>
      </ResponderScope>;
    }
    const bundle = createTestBundle({ id: "test-app", route: "/test" });
    runtime.apps.registerBundle({
      ...bundle,
      loadModule: async () => ({ default: createSynWare({ manifest: bundle.synWareManifest!, root: LiveTextConsumer }) }),
    });
    await runtime.bundles.loadBundle("test-app");
    const frame = (stageId: string) => (
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={stageSiteBranding}>
        <ApplicationStageView
          key={stageId}
          app={createAppInfo()}
          lifecycle="active"
          stage={{ appId: "test-app", id: stageId, title: "Test App", isFocused: true, zIndex: 10 }}
        />
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>
    );
    const view = render(frame("window-one"));
    const editor = await screen.findByRole("textbox");
    fireEvent.focus(editor);
    expect(runtime.responders.resolveChain().map(({ id }) => id)).toEqual([
      "editor:live", "document:live", "application:test-app", "workspace", "webspring", "runtime",
    ]);
    expect(new Set(runtime.responders.resolveChain().map(({ id }) => id)).size).toBe(6);
    expect(await runtime.commands.validate("test-app.select-all", undefined, { source: "menu" })).toMatchObject({ enabled: true, responderId: "editor:live" });
    expect(await runtime.commands.dispatch("test-app.select-all", undefined, { source: "menu" })).toMatchObject({ status: "executed", responderId: "editor:live" });
    expect(liveSession!.getSnapshot().selection.range).toEqual({ location: 0, length: 4 });

    view.rerender(frame("window-two"));
    fireEvent.focus(await screen.findByRole("textbox"));
    expect(runtime.responders.resolveChain().map(({ id }) => id)).toEqual([
      "editor:live", "document:live", "application:test-app", "workspace", "webspring", "runtime",
    ]);
    expect(runtime.responders.has("application:test-app")).toBe(true);
    expect(await runtime.commands.dispatch("test-app.select-all", undefined, { source: "menu" })).toMatchObject({ status: "executed", responderId: "editor:live" });
    expect(liveSession!.getSnapshot().selection.range).toEqual({ location: 0, length: 4 });

    view.unmount();
    expect(liveSession!.getSnapshot().disposed).toBe(true);
    expect(await runtime.commands.dispatch("test-app.select-all", undefined, { source: "menu" })).toMatchObject({ status: "unhandled" });
    expect(runtime.focus.getActiveAnchors()).toEqual({
      workspaceResponderId: "workspace",
      webspringResponderId: "webspring",
      runtimeResponderId: "runtime",
    });
  });
  it("keeps the loaded app mounted when staging hands off to the launch animation", async () => {
    const runtime = createTestRuntime();
    runtime.apps.registerBundle(createTestBundle(
      { id: "test-app", route: "/test" },
      { loadModule: async () => ({ default: () => <p>Loaded application</p> }) }
    ));
    await runtime.bundles.loadBundle("test-app");
    runtime.store.mutate((draft) => {
      draft.webspring.launchingAppId = "test-app";
      draft.webspring.launchTransitionId = "launch-test";
      draft.webspring.launchPhase = "launching";
    });

    render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={stageSiteBranding}>
        <ApplicationStageView
          app={createAppInfo()}
          lifecycle="active"
          stage={{ appId: "test-app", id: "application-stage:test-app", title: "Test App", isFocused: true, zIndex: 10 }}
        />
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>
    );

    expect(screen.getByText("Loaded application")).toBeTruthy();
  });

  it("opens the canonical top-right NSE command menu instead of the temporary User Info error path", async () => {
    renderFrame();

    fireEvent.click(screen.getByRole("button", { name: "User Info" }));

    expect(await screen.findByRole("menuitem", { name: "About Test App" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Preferences" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Log Out" })).toBeTruthy();
    expect(document.querySelector('[data-nse-overlay-kind="menu"]')?.getAttribute("data-placement")).toBe("viewport-block-start-inline-end");
    expect(document.querySelector('[data-nse-application-menu="true"]')).toBeTruthy();
  });

  it("keeps the explicit application About target after Escape dismisses and reopens the menu", async () => {
    const validations: unknown[] = [];
    const runtime = renderFrame((configuredRuntime) => {
      const validateMany = configuredRuntime.commands.validateMany.bind(configuredRuntime.commands);
      vi.spyOn(configuredRuntime.commands, "validateMany").mockImplementation(async (requests, options) => {
        validations.push(requests.map((request) => ({ commandId: request.commandId, payload: request.payload })));
        return validateMany(requests, options);
      });
    });
    const trigger = screen.getByRole("button", { name: "User Info" });

    fireEvent.click(trigger);
    const firstMenu = await screen.findByRole("menu");
    const firstAbout = await screen.findByRole("menuitem", { name: "About Test App" });
    await waitFor(() => expect(firstAbout.getAttribute("aria-disabled")).not.toBe("true"));

    fireEvent.keyDown(firstMenu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(runtime.apps.getApp("test-app")).not.toBeNull();

    fireEvent.click(trigger);
    const reopenedAbout = await screen.findByRole("menuitem", { name: "About Test App" });
    await waitFor(() => expect(reopenedAbout.getAttribute("aria-disabled")).not.toBe("true"));
    expect(validations).toEqual([
      expect.arrayContaining([expect.objectContaining({ commandId: "application.showAbout", payload: { appId: "test-app" } })]),
      expect.arrayContaining([expect.objectContaining({ commandId: "application.showAbout", payload: { appId: "test-app" } })]),
    ]);
    expect((reopenedAbout as HTMLButtonElement).disabled).toBe(false);
  });

  it("composes application responder ownership into the transformed stage root", () => {
    renderFrame();

    const frame = document.querySelector<HTMLElement>(".webspring-app-view-frame");
    expect(frame?.dataset.syncloudosResponderId).toBe("application:test-app");
    expect(frame?.dataset.syncloudosRuntimeOwner).toBeTruthy();
    expect(frame?.parentElement?.dataset.syncloudosResponderId).toBeUndefined();
  });

  it("mounts the registered-owner clients only through useSynWare, without a runtime render prop", async () => {
    const runtime = authoriseTestRuntime(createTestRuntime());
    let receivedProps: Record<string, unknown> | null = null;
    let contextRuntime: Record<string, unknown> | null = null;
    runtime.apps.registerBundle(createTestBundle(
      { id: "test-app", route: "/test" },
      {
        loadModule: async () => ({
          default: (props: Record<string, unknown>) => {
            receivedProps = props;
            const app = useSynWare();
            contextRuntime = app as unknown as Record<string, unknown>;
            return <button type="button" onClick={() => {
              void app.pasteboards.find
                .write([{ type: "text/plain", value: "app-scoped" }]);
            }}>Write scoped pasteboard</button>;
          },
        }),
      },
    ));
    await runtime.bundles.loadBundle("test-app");

    render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={stageSiteBranding}>
        <ApplicationStageView
          app={createAppInfo()}
          lifecycle="active"
          stage={{ appId: "test-app", id: "application-stage:test-app", title: "Test App", isFocused: true, zIndex: 10 }}
        />
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    );

    await screen.findByRole("button", { name: "Write scoped pasteboard" });
    expect(receivedProps).not.toHaveProperty("runtime");
    for (const forbiddenKernelSurface of [
      "runtime", "environment", "store", "policy", "apps", "transfers", "dispose",
    ]) {
      expect(contextRuntime?.[forbiddenKernelSurface]).toBeUndefined();
    }
    expect(contextRuntime?.documents).not.toBe(runtime.documents);
    expect(contextRuntime?.windows).not.toBe(runtime.windows);
    expect(contextRuntime?.images).not.toBe(runtime.images);
    expect(contextRuntime?.audio).not.toBe(runtime.audio);
    expect(contextRuntime?.animations).not.toBe(runtime.animations);
    expect(contextRuntime?.tracking).not.toBe(runtime.tracking);
    expect(Reflect.get(contextRuntime?.commands as object, "dispose")).toBeUndefined();
    expect(Reflect.get(contextRuntime?.documents as object, "documentStore")).toBeUndefined();
    expect(contextRuntime?.pasteboards).not.toBe(runtime.pasteboards);
    expect(Reflect.get(contextRuntime?.pasteboards as object, "forLease")).toBeUndefined();
    expect(Reflect.get(contextRuntime?.pasteboards as object, "dispose")).toBeUndefined();
    expect(contextRuntime?.drag).toEqual(expect.objectContaining({ endpoint: expect.any(Function) }));
    expect((contextRuntime?.drag as { manager: unknown }).manager).not.toBe(runtime.drag);
    expect(Reflect.get(contextRuntime?.webContent as object, "closeOwner")).toBeUndefined();
    expect(Reflect.get(contextRuntime?.webContent as object, "dispose")).toBeUndefined();
    expect(Reflect.get(contextRuntime?.locale as object, "hydrate")).toBeUndefined();
    expect(Reflect.get(contextRuntime?.locale as object, "registerBundleLocaleResources")).toBeUndefined();
    expect(Reflect.get(contextRuntime?.locale as object, "registerTranslations")).toBeUndefined();
    expect(Reflect.get(contextRuntime?.locale as object, "t")).toEqual(expect.any(Function));
    expect((contextRuntime?.pasteboards as { find: { snapshot(signal?: AbortSignal): Promise<unknown> } }).find.snapshot)
      .toEqual(expect.any(Function));

    fireEvent.click(screen.getByRole("button", { name: "Write scoped pasteboard" }));
    await waitFor(() => expect(runtime.pasteboards.find.snapshot()).toEqual([
      { type: "text/plain", value: "app-scoped" },
    ]));
  });

  it("permanently revokes the StrictMode probe and replaced stage facade generations", async () => {
    const runtime = authoriseTestRuntime(createTestRuntime());
    type ScopedFacade = {
      readonly drag: { endpoint(): unknown };
    };
    let current: ScopedFacade | null = null;
    runtime.apps.registerBundle(createTestBundle(
      { id: "test-app", route: "/test" },
      { loadModule: async () => ({ default: () => {
        current = useSynWare() as unknown as ScopedFacade;
        return <p>Mounted generation</p>;
      } }) },
    ));
    await runtime.bundles.loadBundle("test-app");
    const frame = (stageId: string) => (
      <React.StrictMode>
        <SynCloudOSProvider runtime={runtime}>
          <HostSiteBrandingProvider value={stageSiteBranding}>
          <ApplicationStageView
            key={stageId}
            app={createAppInfo()}
            lifecycle="active"
            stage={{ appId: "test-app", id: stageId, title: "Test App", isFocused: true, zIndex: 10 }}
          />
          </HostSiteBrandingProvider>
        </SynCloudOSProvider>
      </React.StrictMode>
    );
    const view = render(frame("stage:first"));
    await screen.findByText("Mounted generation");
    const stale = current;
    if (!stale) throw new Error("The first mounted facade was not captured.");

    view.rerender(frame("stage:replacement"));
    await screen.findByText("Mounted generation");
    const fresh = current;
    if (!fresh || fresh === stale) throw new Error("The replacement mounted facade was not captured.");
    expect(() => stale.drag.endpoint()).toThrow(/Runtime transfer authority is no longer live/);
    expect(fresh.drag.endpoint()).toEqual(expect.objectContaining({ appId: "test-app" }));

    view.unmount();
    expect(() => fresh.drag.endpoint()).toThrow(/Runtime transfer authority is no longer live/);
  });

  it("keeps read-only subscription snapshots renderable through stage teardown while revoking transfers", async () => {
    const runtime = authoriseTestRuntime(createTestRuntime());
    type ScopedFacade = {
      readonly drag: { endpoint(): unknown };
      readonly appearance: {
        subscribe(listener: () => void): () => void;
        resolved(): string;
      };
      readonly locale: {
        t(key: string, params?: Record<string, string | number | boolean | null>, namespace?: string): string;
        subscribe(listener: () => void): () => void;
        getSnapshot(): { readonly activeLocale: string; readonly dictionaryVersion: number };
        getActiveLocale(): string;
      };
    };
    let captured: ScopedFacade | null = null;
    runtime.apps.registerBundle(createTestBundle(
      { id: "test-app", route: "/test" },
      {
        loadModule: async () => ({
          default: () => {
            const app = useSynWare();
            captured = app as unknown as ScopedFacade;
            const locale = useSynWareLocalisedStrings("test-app", app.locale);
            const mode = app.appearance.resolved();
            return <p>{locale.t("title", "Mounted title")} {mode}</p>;
          },
        }),
      },
    ));
    await runtime.bundles.loadBundle("test-app");
    const view = render(
      <SynCloudOSProvider runtime={runtime}>
        <HostSiteBrandingProvider value={stageSiteBranding}>
        <ApplicationStageView
          app={createAppInfo()}
          lifecycle="active"
          stage={{ appId: "test-app", id: "application-stage:test-app", title: "Test App", isFocused: true, zIndex: 10 }}
        />
        </HostSiteBrandingProvider>
      </SynCloudOSProvider>,
    );

    await screen.findByText(/Mounted title/);
    const stale = captured;
    if (!stale) throw new Error("The mounted facade was not captured.");
    expect(() => view.unmount()).not.toThrow();
    expect(() => stale.drag.endpoint()).toThrow(/Runtime transfer authority is no longer live/);
  });

  it("keeps cached presentation reads available to an outgoing render after its mount capability is revoked", () => {
    const runtime = authoriseTestRuntime(createTestRuntime());
    runtime.apps.registerBundle(createTestBundle({ id: "test-app", route: "/test" }));
    const mount = mountTestSynWareRuntime(runtime, "test-app");

    function OutgoingPresentation() {
      const [revision, setRevision] = React.useState(0);
      const locale = useSynWareLocalisedStrings("test-app", mount.runtime.locale);
      const mode = useScopedResolvedMode(mount.runtime);
      return <button type="button" onClick={() => setRevision((value) => value + 1)}>
        {locale.t("title", "Mounted title")} {mode} {revision}
      </button>;
    }

    render(<OutgoingPresentation />);
    const refresh = screen.getByRole("button", { name: /Mounted title light 0/ });
    const snapshotAtRevocation = mount.runtime.state.getSnapshot();
    mount.dispose(new DOMException("Application stage entered its visual exit.", "AbortError"));
    runtime.store.mutate((draft) => {
      draft.application.routePath = "/outgoing-frame-must-not-observe-this";
    });

    expect(mount.runtime.state.getSnapshot()).toBe(snapshotAtRevocation);
    expect(() => fireEvent.click(refresh)).not.toThrow();
    expect(screen.getByRole("button", { name: /Mounted title light 1/ })).toBeTruthy();
    expect(() => mount.runtime.drag.endpoint()).toThrow(/Runtime transfer authority is no longer live/);
  });

  it("requests the system-owned confirmation without logging out immediately", async () => {
    const runtime = renderFrame();
    const openRoute = vi.spyOn(runtime.routes, "openRoute");

    fireEvent.click(screen.getByRole("button", { name: "User Info" }));
    const logOut = await screen.findByRole("menuitem", { name: "Log Out" });
    await waitFor(() => expect(logOut.getAttribute("aria-disabled")).not.toBe("true"));
    fireEvent.click(logOut);

    await waitFor(() => expect(runtime.systemUI.getSnapshot().logOutOpen).toBe(true));
    expect(runtime.statechart.getCurrentState()).not.toBe("locked.loginWindow");
    expect(openRoute).not.toHaveBeenCalled();
  });

  it("opens runtime-owned About and always-enabled system Preferences without an app placeholder", async () => {
    const runtime = renderFrame();

    fireEvent.click(screen.getByRole("button", { name: "User Info" }));
    const about = await screen.findByRole("menuitem", { name: "About Test App" });
    await waitFor(() => expect(about.getAttribute("aria-disabled")).not.toBe("true"));
    fireEvent.click(about);
    await waitFor(() => expect(runtime.systemUI.getSnapshot().aboutAppId).toBe("test-app"));

    fireEvent.click(screen.getByRole("button", { name: "User Info" }));
    const preferences = await screen.findByRole("menuitem", { name: /Preferences/ });
    await waitFor(() => expect(preferences.getAttribute("aria-disabled")).not.toBe("true"));
    expect(screen.queryByText("This app does not provide preferences.")).toBeNull();
    fireEvent.click(preferences);
    await waitFor(() => expect(runtime.systemUI.getSnapshot().preferencesPane).toBe(""));
  });
});
