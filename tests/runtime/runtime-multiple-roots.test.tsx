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

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createElement, useRef } from "react";
import { RuntimeInputBoundary, SynCloudOSProvider, useRuntimeSelector, useKernelSynCloudOS } from "../../src/SynCloudOSReact";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { WebspringController } from "../../src/Webspring/WebspringController";
import { defineWebspring } from "../../src/Webspring/Webspring";
import { createTestBundle, createTestRuntime } from "./helpers";

type LauncherApp = { readonly bundleIdentifier: string; readonly displayName: string; readonly route: string };

/** A launcher's button at its plainest: it opens and previews its app through the actions it is given. */
function LauncherButton({ app, onOpen, onHoverStart }: {
  app: LauncherApp;
  onOpen: (appId: string, route?: string) => unknown;
  onHoverStart?: (appId: string) => void;
}) {
  return createElement("button", {
    type: "button",
    "aria-label": `Open ${app.displayName}`,
    onClick: () => { void onOpen(app.bundleIdentifier, app.route); },
    onMouseEnter: () => onHoverStart?.(app.bundleIdentifier),
  }, app.displayName);
}

const webspring = defineWebspring({
  manifest: {
    schemaVersion: 1,
    bundleIdentifier: "com.example.multiple-roots",
    version: "1.0.0",
    displayName: "Multiple roots fixture",
    webspringShell: {
      views: [{ id: "test", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
      defaults: { desktop: "test", tablet: "test", mobile: "test" },
      homeRoute: "/",
      branding: { name: { key: "site.name", fallback: "Multiple roots fixture" } },
    },
  },
  components: { test: () => null },
});

afterEach(() => cleanup());

function Probe({ label, runtime }: { label: string; runtime: SynCloudOSRuntime }) {
  const renders = useRef(0);
  renders.current += 1;
  const current = useKernelSynCloudOS();
  const route = useRuntimeSelector((snapshot) => snapshot.application.routePath);
  return createElement("output", {
    "data-testid": label,
    "data-runtime": current.runtimeId,
    "data-renders": renders.current,
    "data-route": route,
  }, runtime.runtimeId);
}

function RuntimeMutationControls({ appId }: { appId: string }) {
  const runtime = useKernelSynCloudOS();
  return createElement("button", {
    type: "button",
    onClick: () => {
      runtime.settings.set("soundEnabled", false);
      runtime.appearance.set("dark");
      runtime.systemUI.preferences.open("appearance");
      runtime.events.publish("test.root.action", { appId }, appId);
    },
  }, `Mutate ${appId}`);
}

describe("multiple runtime React roots", () => {
  it("projects optional account state and opens the provider chooser without selecting a method", async () => {
    const runtime = createTestRuntime({ authenticationPolicy: "optional" });
    let snapshot = { status: "anonymous" as const, methods: [{ id: "google", label: "Google" }], profile: null, expiresAt: null, error: null };
    const signIn = async () => { throw new Error("controller must not select a provider"); };
    const authentication = {
      sessionAdapter: { id: "test", read: async () => null, subscribe: () => () => undefined, end: async () => undefined, dispose: () => undefined },
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      refresh: async () => snapshot,
      signIn,
      signOut: async () => undefined,
      dispose: () => undefined,
    };
    const controller = new WebspringController(runtime, webspring, undefined, { policy: "optional", service: authentication });
    expect(controller.model(runtime.store.getSnapshot(), "desktop").account).toEqual({ kind: "signIn", label: "Sign In" });
    await expect(controller.actions.requestSignIn()).resolves.toEqual({ status: "completed" });
    expect(runtime.statechart.getCurrentState()).toBe("locked.loginWindow");
    snapshot = { status: "authenticated", methods: [{ id: "google", label: "Google" }], profile: { subject: "issuer|subject", roles: [], name: "Person" }, expiresAt: Date.now() + 10_000, error: null };
    expect(controller.model(runtime.store.getSnapshot(), "desktop").account).toEqual({ kind: "account", label: "Person", signOutLabel: "Log Out" });
  });
  it("updates only the provider-owned root when one runtime changes", () => {
    const first = createTestRuntime({ id: "runtime:root:first" });
    const second = createTestRuntime({ id: "runtime:root:second" });
    render(createElement("main", null,
      createElement(SynCloudOSProvider, { runtime: first }, createElement(Probe, { label: "first", runtime: first })),
      createElement(SynCloudOSProvider, { runtime: second }, createElement(Probe, { label: "second", runtime: second })),
    ));

    expect(screen.getByTestId("first").getAttribute("data-runtime")).toBe("runtime:root:first");
    expect(screen.getByTestId("second").getAttribute("data-runtime")).toBe("runtime:root:second");
    expect(screen.getByTestId("first").getAttribute("data-renders")).toBe("1");
    expect(screen.getByTestId("second").getAttribute("data-renders")).toBe("1");

    act(() => {
      first.store.mutate((draft) => { draft.application.routePath = "/first-only"; });
    });

    expect(screen.getByTestId("first").getAttribute("data-route")).toBe("/first-only");
    expect(screen.getByTestId("first").getAttribute("data-renders")).toBe("2");
    expect(screen.getByTestId("second").getAttribute("data-route")).toBe("/");
    expect(screen.getByTestId("second").getAttribute("data-renders")).toBe("1");
  });

  it("routes Webspring button interactions to the nearest runtime", () => {
    const first = createTestRuntime({ id: "runtime:webspring:first" });
    const second = createTestRuntime({ id: "runtime:webspring:second" });
    const firstApp = first.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.first-app" }));
    const secondApp = second.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.second-app" }));
    expect(firstApp).not.toBeNull();
    expect(secondApp).not.toBeNull();
    const firstController = new WebspringController(first, webspring, undefined);
    const secondController = new WebspringController(second, webspring, undefined);
    const firstModelApp = firstController.model(first.store.getSnapshot(), "desktop").apps[0]!;
    const secondModelApp = secondController.model(second.store.getSnapshot(), "desktop").apps[0]!;

    render(createElement("main", null,
      createElement(SynCloudOSProvider, { runtime: first }, createElement(LauncherButton, {
        app: firstModelApp,
        onOpen: firstController.actions.openApp,
        onHoverStart: firstController.actions.previewApp,
      })),
      createElement(SynCloudOSProvider, { runtime: second }, createElement(LauncherButton, {
        app: secondModelApp,
        onOpen: secondController.actions.openApp,
        onHoverStart: secondController.actions.previewApp,
      })),
    ));

    fireEvent.mouseEnter(screen.getByRole("button", { name: /Open First App/i }));

    expect(first.webspring.getSnapshot().hoveredAppId).toBe("com.example.first-app");
    expect(second.webspring.getSnapshot().hoveredAppId).toBeNull();
  });

  it("isolates Webspring routing, events, windows, settings, appearance, and system UI across two live roots", async () => {
    const first = createTestRuntime({ id: "runtime:webspring-actions:first" });
    const second = createTestRuntime({ id: "runtime:webspring-actions:second" });
    const firstApp = first.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.first-actions", route: "/first-actions", presentation: "windowedView" }));
    const secondApp = second.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.second-actions", route: "/second-actions", presentation: "windowedView" }));
    expect(firstApp).not.toBeNull();
    expect(secondApp).not.toBeNull();
    first.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    second.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const firstController = new WebspringController(first, webspring, undefined);
    const secondController = new WebspringController(second, webspring, undefined);
    const firstModelApp = firstController.model(first.store.getSnapshot(), "desktop").apps[0]!;
    const secondModelApp = secondController.model(second.store.getSnapshot(), "desktop").apps[0]!;

    render(createElement("main", null,
      createElement(SynCloudOSProvider, { runtime: first },
        createElement(RuntimeInputBoundary, null,
          createElement(LauncherButton, { app: firstModelApp, onOpen: firstController.actions.openApp }),
          createElement(RuntimeMutationControls, { appId: firstApp!.bundleIdentifier }),
        ),
      ),
      createElement(SynCloudOSProvider, { runtime: second },
        createElement(RuntimeInputBoundary, null,
          createElement(LauncherButton, { app: secondModelApp, onOpen: secondController.actions.openApp }),
          createElement(RuntimeMutationControls, { appId: secondApp!.bundleIdentifier }),
        ),
      ),
    ));

    fireEvent.click(screen.getByRole("button", { name: /Open First Actions/i }));

    await waitFor(() => {
      expect(first.store.getSnapshot().application.routePath).toBe("/first-actions");
      expect(first.windows.list()).toHaveLength(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Mutate com.example.first-actions" }));
    expect(second.store.getSnapshot().application.routePath).toBe("/");
    expect(first.events.getHistory().some((event) => event.type === "test.root.action")).toBe(true);
    expect(second.events.getHistory().some((event) => event.type === "test.root.action")).toBe(false);
    expect(first.windows.list()).toHaveLength(1);
    expect(second.windows.list()).toEqual([]);
    expect(first.settings.get().soundEnabled).toBe(false);
    expect(second.settings.get().soundEnabled).toBe(true);
    expect(first.appearance.get()).toBe("dark");
    expect(second.appearance.get()).toBe("auto");
    expect(first.systemUI.getSnapshot().preferencesPane).toBe("appearance");
    expect(second.systemUI.getSnapshot()).toEqual({ preferencesPane: null, aboutAppId: null, logOutOpen: false, returnDecision: null });

    const firstRoot = document.querySelector('[data-syncloudos-runtime-id="runtime:webspring-actions:first"]');
    const secondRoot = document.querySelector('[data-syncloudos-runtime-id="runtime:webspring-actions:second"]');
    expect(firstRoot?.getAttribute("data-mode")).toBe("dark");
    expect(secondRoot?.getAttribute("data-mode")).toBe("light");
  });
});
