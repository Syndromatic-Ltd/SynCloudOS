// @vitest-environment jsdom
import React, { useEffect, useState } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEArrayController } from "../../src/NSE/Controllers";
import { createSynWare } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { useSynWare } from "../../src/SynCloudOS/AppSDK/SynWareContext";
import { useSynWareCommands } from "../../src/SynCloudOS/AppSDK/hooks/useSynWareCommands";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { RouteOutlet } from "../../src/SynCloudOS/AppSDK/RouteOutlet";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { mountSynCloudOS, type MountedSynCloudOSHost, type MountSynCloudOSOptions } from "../../src/SynCloudOSReact/browserRuntime";
import { WebspringController } from "../../src/Webspring/WebspringController";
import { defineWebspring } from "../../src/Webspring/public";

vi.mock("../../src/SynCloudOS/Runtime/createSynCloudOS", { spy: true });
vi.mock("../../src/Webspring/WebspringController", { spy: true });
const id = "com.example.application-host";
const mounts: MountedSynCloudOSHost[] = [];
const elements: HTMLElement[] = [];
const sessions: ReturnType<typeof useSynWare>[] = [];
const aborted = vi.fn();
const sessionControllers: NSEArrayController<string, string>[] = [];
const executed = vi.fn();
function Application() {
  const app = useSynWare();
  useSynWareCommands([{ id: `${app.appId}.probe`, title: "Probe", execute: executed,
    defaultKeyBindings: [{ key: "F8", modifiers: [], scope: "application", repeat: "ignore" }] }]);
  useEffect(() => {
    sessions.push(app);
    app.signal.addEventListener("abort", aborted, { once: true });
  }, [app]);
  // A session-owned controller the app never disposes itself.
  const [accounts] = useState(() => new NSEArrayController<string, string>({ id: "session-accounts", content: ["current"], getId: (value) => value, ownerSignal: app.signal }));
  useEffect(() => { sessionControllers.push(accounts); }, [accounts]);
  return <button data-testid="application" onClick={() => app.lifecycle.closeSelf()}>Close application</button>;
}
const bundle = createSynWare({ manifest: {
  schemaVersion: 1, id, version: "1.0.0", title: "Application host",
  routes: [{ path: "/application", primary: true }],
  runtime: { presentation: "windowedView", policy: { public: true, requiresLogin: false } },
}, root: Application });
const shell = defineWebspring({ manifest: {
  schemaVersion: 1, id: "com.example.application-shell", version: "1.0.0", title: "Shell",
  webspringShell: { views: [{ id: "site", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }], defaults: { desktop: "site", tablet: "site", mobile: "site" }, homeRoute: "/", branding: { name: { key: "site.name", fallback: "Shell" } } },
}, components: { site: () => <div data-testid="shell">Shell</div> } });
function element() { const value = document.createElement("div"); document.body.append(value); elements.push(value); return value; }
function applicationOptions(target: Element, overrides: object = {}) {
  return { element: target, bundles: [bundle], application: { id }, authentication: "disabled", ...overrides } as unknown as MountSynCloudOSOptions;
}
async function mount(target = element(), overrides: object = {}) {
  let host!: MountedSynCloudOSHost;
  await act(async () => { host = await mountSynCloudOS(applicationOptions(target, overrides)); });
  mounts.push(host);
  return { host, element: target, runtime: vi.mocked(createSynCloudOS).mock.results.at(-1)!.value };
}
afterEach(async () => {
  for (const host of mounts.splice(0)) await act(async () => { await host.dispose("test-cleanup"); });
  for (const target of elements.splice(0)) target.remove();
  sessions.length = 0; sessionControllers.length = 0; vi.clearAllMocks(); window.history.replaceState(null, "", "/");
});
const secondaryId = "com.example.secondary";
function Secondary() {
  const app = useSynWare();
  return <button data-testid="secondary" onClick={() => app.lifecycle.closeSelf()}>Quit secondary</button>;
}
const secondary = createSynWare({ manifest: {
  schemaVersion: 1, id: secondaryId, version: "1.0.0", title: "Secondary",
  routes: [{ path: "/secondary", primary: true }],
  runtime: { presentation: "windowedView", policy: { public: true, requiresLogin: false } },
}, root: Secondary });
const privateBundle = createSynWare({ manifest: { ...bundle.manifest, runtime: { presentation: "windowedView" } }, root: Application });
/** A browser authentication service whose single method signs in at once. */
function authenticationService() {
  let session: { id: string; subjectId: string; state: "active"; claims: Readonly<Record<string, string>> } | null = null;
  const sessionListeners = new Set<(value: typeof session) => void>();
  const listeners = new Set<() => void>();
  let snapshot = { status: "anonymous", methods: [{ id: "test", label: "Test" }], profile: null as null | { subject: string; roles: string[]; name: string }, expiresAt: null, error: null };
  const publish = () => { sessionListeners.forEach(listener => listener(session)); listeners.forEach(listener => listener()); };
  return {
    sessionAdapter: {
      id: "test",
      read: async () => session,
      subscribe(listener: (value: typeof session) => void) { sessionListeners.add(listener); return () => { sessionListeners.delete(listener); }; },
      end: async () => { session = null; snapshot = { ...snapshot, status: "anonymous", profile: null }; publish(); },
      dispose: () => undefined,
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh: async () => snapshot,
    async signIn() {
      session = { id: "session", subjectId: "person", state: "active", claims: { displayName: "Person" } };
      snapshot = { ...snapshot, status: "authenticated", profile: { subject: "person", roles: [], name: "Person" } };
      publish();
    },
    signOut: async () => undefined,
    dispose: () => undefined,
  };
}
describe("application-only browser host", () => {
  it("launches the real app fullscreen from / without a shell or primary window", async () => {
    window.history.replaceState(null, "", "/");
    const { element: target, runtime } = await mount();
    expect(target.querySelector('[data-testid="application"]')).not.toBeNull();
    expect(target.querySelector('[data-syncloudos-application-host]')).not.toBeNull();
    expect(target.querySelector(".webspring-host, .webspring-board, .webspring-app-view-frame")).toBeNull();
    expect(WebspringController).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
    expect(runtime.lifecycle.getState(id)).toBe("active");
    expect(runtime.apps.getApp(id)?.presentation).toBe("appView");
    expect(runtime.windows.list({ applicationId: id })).toHaveLength(0);
    expect(sessions.at(-1)?.appId).toBe(id);
    expect(runtime.focus.getActiveAnchors().applicationResponderId).toBe(`application:${id}`);
  });
  it("closes without respawning and releases its mounted session", async () => {
    const { element: target, runtime } = await mount();
    const session = sessions.at(-1)!;
    await act(async () => { fireEvent.click(target.querySelector("button")!); });
    expect(runtime.lifecycle.getState(id)).toBe("closed");
    expect(session.signal.aborted).toBe(true);
    expect(aborted).toHaveBeenCalled();
    expect(sessionControllers.at(-1)?.isDisposed).toBe(true);
    expect(sessionControllers.at(-1)?.disposalReason).toBe("application-closed");
    expect(target.querySelector('[data-testid="application"]')).toBeNull();
    await act(async () => { await Promise.resolve(); });
    expect(runtime.lifecycle.getState(id)).toBe("closed");
    expect(WebspringController).not.toHaveBeenCalled();
  });
  it("loads a discovered bundle through the production loader", async () => {
    const load = vi.fn(async () => ({ default: bundle }));
    const { runtime, element: target } = await mount(element(), { bundles: [{
      manifest: bundle.manifest, modulePath: "./Application.app/Contents/index.tsx", loadModule: load,
    }] });
    expect(load).toHaveBeenCalledTimes(1);
    expect(target.querySelector('[data-testid="application"]')).not.toBeNull();
    expect(runtime.apps.getApp(id)?.presentation).toBe("appView");
    expect(runtime.windows.list({ applicationId: id })).toHaveLength(0);
    expect(WebspringController).not.toHaveBeenCalled();
  });
  it("disposes and remounts with a fresh app session", async () => {
    const first = await mount();
    const session = sessions.at(-1)!;
    await act(async () => { expect((await first.host.dispose()).status).toBe("disposed"); });
    expect(session.signal.aborted).toBe(true);
    expect(first.element.childElementCount).toBe(0);
    const second = await mount(first.element);
    expect(second.runtime).not.toBe(first.runtime);
    expect(sessions.at(-1)?.signal.aborted).toBe(false);
    expect(second.element.querySelector('[data-testid="application"]')).not.toBeNull();
  });
  it("persists app preferences across disposal and a new runtime mount", async () => {
    const first = await mount();
    const app = sessions.at(-1)!;
    expect(app.persistence.setPreference("volume", 0.7)).toBe(true);
    expect(app.persistence.setPreference("quality", "high")).toBe(true);
    await act(async () => { expect((await first.host.dispose()).status).toBe("disposed"); });
    const second = await mount(first.element);
    const restored = sessions.at(-1)!;
    expect(second.runtime).not.toBe(first.runtime);
    expect(restored.persistence.getPreference("volume", 0.2)).toBe(0.7);
    expect(restored.persistence.getPreference("quality", "medium")).toBe("high");
  });
  it("does not inherit another application host's preferences", async () => {
    const first = await mount();
    expect(sessions.at(-1)!.persistence.setPreference("volume", 0.4)).toBe(true);
    await act(async () => { await first.host.dispose(); });
    const otherId = "com.example.other-host";
    const other = createSynWare({ manifest: { ...bundle.manifest, id: otherId }, root: Application });
    await mount(first.element, { bundles: [other], application: { id: otherId } });
    expect(sessions.at(-1)!.appId).toBe(otherId);
    expect(sessions.at(-1)!.persistence.getPreference("volume", 0.9)).toBe(0.9);
    expect(sessions.at(-1)!.persistence.setPreference("volume", 0.8)).toBe(true);
    await act(async () => { await mounts.at(-1)!.dispose(); });
    await mount(first.element);
    expect(sessions.at(-1)!.persistence.getPreference("volume", 0.9)).toBe(0.4);
  });
  it("preserves an explicit internal host persistence namespace", async () => {
    const namespace = "tests:application-host-explicit";
    await mount(element(), { persistenceNamespace: namespace });
    expect(sessions.at(-1)!.persistence.setPreference("explicit", "saved")).toBe(true);
    expect(window.localStorage.getItem(`${namespace}:${id}:explicit`)).toBe('"saved"');
  });
  it("routes keyboard commands through the real application responder", async () => {
    const { element: target } = await mount();
    await act(async () => { fireEvent.keyDown(target.querySelector("button")!, { key: "F8", code: "F8" }); });
    expect(executed).toHaveBeenCalledTimes(1);
    expect(executed.mock.calls[0]![0]).toMatchObject({ source: "keyboard", responderId: `application:${id}` });
  });
  it("presents explicitly requested shared NSE panels through their real window owner", async () => {
    // jsdom has no Canvas2D backend; exercise the panel's real unavailable-backend path.
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    try {
      const { runtime, element: target } = await mount();
      await act(async () => {
        expect((await sessions.at(-1)!.commands.dispatch<{ status: string }>("system.showColours")).status).toBe("executed");
      });
      expect(runtime.windows.list().some(({ record }: { record: { title: string } }) => record.title === "Colours")).toBe(true);
      expect(target.querySelector('[data-nse-control="colour-panel"]')).not.toBeNull();
      expect(WebspringController).not.toHaveBeenCalled();
    } finally { canvas.mockRestore(); }
  });
  it("retains a suspended app without relaunching it and restores the same session on activation", async () => {
    const { runtime, element: target } = await mount();
    const session = sessions.at(-1)!;
    await act(async () => { expect((await runtime.lifecycle.suspend(id).result).status).toBe("completed"); });
    expect(target.querySelector<HTMLElement>("[data-syncloudos-application-host]")!.hidden).toBe(true);
    expect(session.signal.aborted).toBe(false);
    await act(async () => { expect((await runtime.lifecycle.activate(id).result).status).toBe("completed"); });
    expect(target.querySelector<HTMLElement>("[data-syncloudos-application-host]")!.hidden).toBe(false);
    expect(sessions.at(-1)).toBe(session);
  });
  it("boots a nested app route and handles browser traversal to the root alias", async () => {
    const graph = defineSynWareRoutes({ id: "application-routes", routes: [
      { name: "home", path: "", component: () => <p data-testid="home-route">Home</p> },
      { name: "detail", path: "detail", component: () => <p data-testid="detail-route">Detail</p> },
    ] });
    const routed = createSynWare({ manifest: { ...bundle.manifest, routes: [{ path: "/application", primary: true, match: "prefix" }] },
      root: () => <><Application /><RouteOutlet /></>, routes: graph });
    window.history.replaceState(null, "", "/application/detail");
    const { runtime, element: target } = await mount(element(), { bundles: [routed] });
    expect(target.querySelector('[data-testid="detail-route"]')).not.toBeNull();
    await act(async () => {
      window.history.replaceState(null, "", "/?probe=1#anchor");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(runtime.store.getSnapshot().application.routePath).toBe("/application"));
    expect(target.querySelector('[data-testid="home-route"]')).not.toBeNull();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?probe=1");
    expect(WebspringController).not.toHaveBeenCalled();
  });
  it("captures app render errors without a Webspring recovery control or automatic retry", async () => {
    const render = vi.fn(() => { throw new Error("Application render failure"); });
    const logging = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { runtime, element: target } = await mount(element(), { bundles: [createSynWare({ manifest: bundle.manifest, root: render })] });
      expect(runtime.errors.getLatest()?.appId).toBe(id);
      expect(target.querySelector('[role="alertdialog"], [role="alert"]')).not.toBeNull();
      expect(target.textContent).not.toContain("Return to Webspring");
      const calls = render.mock.calls.length;
      await act(async () => { await Promise.resolve(); });
      expect(render).toHaveBeenCalledTimes(calls);
    } finally { logging.mockRestore(); }
  });
  it("shows shell-free bootstrap recovery and permits a fresh mount after a bad route", async () => {
    const target = element();
    window.history.replaceState(null, "", "/missing-route");
    await act(async () => {
      await expect(mountSynCloudOS(applicationOptions(target))).rejects.toThrow(/Initial route/i);
    });
    expect(target.querySelector('[role="alertdialog"], [role="alert"]')).not.toBeNull();
    expect(target.textContent).toContain("Reload");
    expect(target.textContent).not.toContain("Return to Webspring");
    expect(vi.mocked(createSynCloudOS).mock.results.at(-1)!.value.signal.aborted).toBe(true);
    window.history.replaceState(null, "", "/");
    await mount(target);
    expect(target.querySelector('[data-testid="application"]')).not.toBeNull();
    expect(WebspringController).not.toHaveBeenCalled();
  });
  it("rejects missing, mixed, malformed and unknown modes and bundles the host cannot present", async () => {
    expect(() => mountSynCloudOS({ element: element() } as MountSynCloudOSOptions)).toThrow(/shell.*application|application.*shell/i);
    expect(() => mountSynCloudOS(applicationOptions(element(), { shell }))).toThrow(/exactly one|mutually exclusive/i);
    expect(() => mountSynCloudOS(applicationOptions(element(), { application: { id: " " } }))).toThrow(/application.*id/i);
    expect(() => mountSynCloudOS(applicationOptions(element(), { application: { id, frame: "windowed" } }))).toThrow(/application\.frame/);
    expect(() => mountSynCloudOS(applicationOptions(element(), { shellResources: {} }))).toThrow(/shell resources/i);
    await expect(mountSynCloudOS(applicationOptions(element(), { application: { id: "com.example.unknown" } }))).rejects.toThrow(/not registered|unknown application/i);
    const fullscreenOther = createSynWare({ manifest: { schemaVersion: 1, id: "com.example.other", version: "1.0.0", title: "Other",
      routes: [{ path: "/other", primary: true }] }, root: () => null });
    await expect(mountSynCloudOS(applicationOptions(element(), { bundles: [bundle, fullscreenOther] }))).rejects.toThrow(/com\.example\.other.*appView/);
    const reserved = createSynWare({ manifest: { ...bundle.manifest, routes: [{ path: "/", primary: true }] }, root: Application });
    await expect(mountSynCloudOS(applicationOptions(element(), { bundles: [reserved] })).then(host => {
      mounts.push(host); return host;
    })).rejects.toThrow(/non-root entry route/i);
    const reservedSecondary = createSynWare({ manifest: { ...secondary.manifest, routes: [{ path: "/", primary: true }] }, root: Secondary });
    await expect(mountSynCloudOS(applicationOptions(element(), { bundles: [bundle, reservedSecondary] }))).rejects.toThrow(/com\.example\.secondary.*non-root entry route/i);
  });
  it("presents the login window before the app launches when sign-in is required", async () => {
    const service = authenticationService();
    const { runtime, element: target } = await mount(element(), { bundles: [privateBundle], authentication: { policy: "required", service } });
    expect(document.querySelector(".nse-login-window")).not.toBeNull();
    expect(target.querySelector('[data-testid="application"]')).toBeNull();
    expect(runtime.lifecycle.getState(id)).toBe("registered");
    expect(sessions).toHaveLength(0);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Test" })); });
    await waitFor(() => expect(target.querySelector('[data-testid="application"]')).not.toBeNull());
    expect(runtime.lifecycle.getState(id)).toBe("active");
    expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(true);
    await waitFor(() => expect(document.querySelector(".nse-login-window")).toBeNull());
  });
  it("runs the app signed out under optional sign-in and offers sign-in and Log Out from Preferences", async () => {
    const service = authenticationService();
    const { runtime, element: target } = await mount(element(), { authentication: { policy: "optional", service } });
    const session = sessions.at(-1)!;
    expect(target.querySelector('[data-testid="application"]')).not.toBeNull();
    expect(document.querySelector(".nse-login-window")).toBeNull();
    await act(async () => { runtime.systemUI.preferences.open("account"); });
    expect(screen.getAllByText("Not Signed In").length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Sign In" })); });
    // Signing in suspends the app behind the login window; cancelling resumes the same session.
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    expect(runtime.lifecycle.getState(id)).toBe("suspended");
    await act(async () => { fireEvent.click(cancel); });
    await waitFor(() => expect(runtime.lifecycle.getState(id)).toBe("active"));
    expect(sessions.at(-1)).toBe(session);
    expect(session.signal.aborted).toBe(false);
    await act(async () => { runtime.systemUI.preferences.open("account"); });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Sign In" })); });
    const method = await screen.findByRole("button", { name: "Test" });
    await act(async () => { fireEvent.click(method); });
    await waitFor(() => expect(runtime.lifecycle.getState(id)).toBe("active"));
    expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(true);
    expect(sessions.at(-1)).toBe(session);
    await act(async () => { runtime.systemUI.preferences.open("account"); });
    expect((await screen.findAllByText("Person")).length).toBeGreaterThan(0);
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Log Out" })); });
    expect(await screen.findByRole("alertdialog", { name: /log out/i })).not.toBeNull();
  });
  it("never offers Log Out when the host has no authentication", async () => {
    const { runtime } = await mount();
    await act(async () => { runtime.systemUI.session.requestLogOut(); });
    expect(screen.queryByRole("alertdialog", { name: /log out/i })).toBeNull();
    expect(runtime.systemUI.getSnapshot().logOutOpen).toBe(false);
    await act(async () => { runtime.systemUI.preferences.open(); });
    expect(screen.queryByText("Account")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign In" })).toBeNull();
  });
  it("opens another registered application in a window over the primary and returns when it closes", async () => {
    const { runtime, element: target } = await mount(element(), { bundles: [bundle, secondary] });
    const session = sessions.at(-1)!;
    await act(async () => { expect((await session.navigation.openRoute("/secondary").result).committed).toBe(true); });
    expect(document.querySelector('[data-testid="secondary"]')).not.toBeNull();
    expect(runtime.windows.list({ applicationId: secondaryId })).toHaveLength(1);
    expect(window.location.pathname).toBe("/secondary");
    const primary = target.querySelector<HTMLElement>("[data-syncloudos-application-host]")!;
    // The primary stays in view behind the window, at rest.
    expect(primary.hidden).toBe(false);
    expect(primary.hasAttribute("inert")).toBe(true);
    expect(runtime.lifecycle.getState(id)).toBe("suspended");
    const [secondaryWindow] = runtime.windows.list({ applicationId: secondaryId });
    await act(async () => { await runtime.commands.dispatch("window.close", { windowControllerId: secondaryWindow!.id }, { source: "toolbar" }); });
    await waitFor(() => expect(runtime.lifecycle.getState(id)).toBe("active"));
    expect(document.querySelector('[data-testid="secondary"]')).toBeNull();
    expect(primary.hasAttribute("inert")).toBe(false);
    expect(sessions.at(-1)).toBe(session);
    // A secondary that quits itself also hands the page back to the primary.
    await act(async () => { await session.navigation.openRoute("/secondary").result; });
    expect(runtime.lifecycle.getState(id)).toBe("suspended");
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Quit secondary" })); });
    await waitFor(() => expect(runtime.lifecycle.getState(id)).toBe("active"));
    expect(runtime.lifecycle.getState(secondaryId)).toBe("closed");
    expect(sessions.at(-1)).toBe(session);
  });
  it("fills the page by default and keeps the declared frame when asked", async () => {
    const fullscreen = await mount();
    expect(fullscreen.runtime.apps.getApp(id)?.presentation).toBe("appView");
    expect(fullscreen.runtime.apps.getApp(id)?.frame.topBar).toBe("none");
    await act(async () => { await fullscreen.host.dispose(); });
    const declared = await mount(element(), { application: { id, frame: "declared" } });
    expect(declared.runtime.apps.getApp(id)?.presentation).toBe("windowedView");
    expect(declared.runtime.windows.list({ applicationId: id })).toHaveLength(1);
    expect(declared.element.querySelector("[data-syncloudos-application-host]")).toBeNull();
    expect(document.querySelector('[data-testid="application"]')).not.toBeNull();
    expect(WebspringController).not.toHaveBeenCalled();
  });
  it("shows the app's quit surface and reopens a new session only when asked", async () => {
    const { runtime, element: target } = await mount();
    const first = sessions.at(-1)!;
    await act(async () => { fireEvent.click(target.querySelector('[data-testid="application"]')!); });
    const surface = screen.getByRole("main", { name: "Application host" });
    expect(surface.querySelector("img")?.getAttribute("src")).toBe(runtime.apps.getApp(id)?.icon.src);
    const reopen = within(surface).getByRole("button", { name: "Reopen" });
    expect(document.activeElement).toBe(reopen);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(runtime.lifecycle.getState(id)).toBe("closed");
    await act(async () => { fireEvent.click(reopen); });
    await waitFor(() => expect(runtime.lifecycle.getState(id)).toBe("active"));
    expect(target.querySelector('[data-testid="application"]')).not.toBeNull();
    expect(screen.queryByRole("main", { name: "Application host" })).toBeNull();
    expect(sessions.at(-1)).not.toBe(first);
    expect(sessions.at(-1)!.signal.aborted).toBe(false);
    expect(runtime.statechart.getCurrentState()).toBe("active.application.active");
  });
  it("preserves the existing shell host", async () => {
    const target = element();
    await act(async () => { mounts.push(await mountSynCloudOS({ element: target, shell, authentication: "disabled" })); });
    expect(WebspringController).toHaveBeenCalled();
    expect(target.querySelector('[data-testid="shell"]')).not.toBeNull();
    expect(vi.mocked(createSynCloudOS).mock.calls.at(-1)![0].persistenceNamespace).toBeUndefined();
  });
  it("never offers Log Out in a Webspring host without authentication", async () => {
    await act(async () => { mounts.push(await mountSynCloudOS({ element: element(), shell, authentication: "disabled" })); });
    const runtime = vi.mocked(createSynCloudOS).mock.results.at(-1)!.value;
    await act(async () => { runtime.systemUI.session.requestLogOut(); });
    expect(screen.queryByRole("alertdialog", { name: /log out/i })).toBeNull();
    expect(runtime.systemUI.getSnapshot().logOutOpen).toBe(false);
  });
  it("confirms Log Out in a Webspring host with authentication", async () => {
    await act(async () => { mounts.push(await mountSynCloudOS({ element: element(), shell, authentication: { policy: "optional", service: authenticationService() } as never })); });
    const runtime = vi.mocked(createSynCloudOS).mock.results.at(-1)!.value;
    await act(async () => { runtime.systemUI.session.requestLogOut(); });
    expect(await screen.findByRole("alertdialog", { name: /log out/i })).not.toBeNull();
  });
});
