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

import { describe, expect, it, vi } from "vitest";
import { normalizeRoutePath } from "../../src/SynCloudOS/Routing/routeNormalization";
import { createRuntimeController } from "../../src/SynCloudOS/Runtime/RuntimeController";
import { createRuntimeHarness, createTestBundle, createTestRuntime } from "./helpers";

describe("lifecycle launch and activation authority", () => {
  it("enforces authorisation and launch policy for direct lifecycle launch and activation", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.restricted", route: "/restricted" })],
    });
    const loadModule = vi.spyOn(runtime.bundles.getBundle("com.example.restricted")!, "loadModule");

    await expect(runtime.lifecycle.launch("com.example.restricted", { reason: "locked" }).result).resolves.toMatchObject({
      status: "failed",
      committed: false,
      error: { code: "lifecycle-unauthorised" },
    });
    expect(loadModule).not.toHaveBeenCalled();

    runtime.store.mutate((draft) => {
      draft.loginServices.isAuthorised = true;
      draft.lifecycle["com.example.restricted"] = "suspended";
    });
    runtime.policy.registerPolicy("deny-restricted", (request, decision) =>
      request.app?.bundleIdentifier === "com.example.restricted" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );

    await expect(runtime.lifecycle.activate("com.example.restricted", { reason: "policy" }).result).resolves.toMatchObject({
      status: "failed",
      committed: false,
      error: { code: "lifecycle-denied" },
    });
    await expect(runtime.lifecycle.launch("com.example.restricted", { reason: "policy" }).result).resolves.toMatchObject({
      status: "failed",
      committed: false,
      error: { code: "lifecycle-denied" },
    });
    expect(loadModule).not.toHaveBeenCalled();

  });

  it("does not let the public AppManager launch path bypass canonical lifecycle access", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.facade-restricted", route: "/facade-restricted" })],
    });
    const { AppManagerController } = createRuntimeHarness(runtime);
    const manager = AppManagerController.getManagerForApp("com.example.facade-restricted");
    const loadModule = vi.spyOn(runtime.bundles.getBundle("com.example.facade-restricted")!, "loadModule");

    await expect(manager.getReady()).rejects.toThrow(/authorised|required/i);
    await expect(manager.launch()).rejects.toThrow(/authorised|required/i);
    expect(loadModule).not.toHaveBeenCalled();
    expect(runtime.store.getSnapshot()).toMatchObject({
      lifecycle: { "com.example.facade-restricted": "registered" },
      application: { activeAppId: null },
    });

    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    runtime.policy.registerPolicy("deny-facade", (request, decision) =>
      request.app?.bundleIdentifier === "com.example.facade-restricted" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );

    await expect(manager.launch()).rejects.toThrow(/policy denied/i);
    expect(runtime.store.getSnapshot()).toMatchObject({
      lifecycle: { "com.example.facade-restricted": "registered" },
      application: { activeAppId: null },
    });

    runtime.store.mutate((draft) => { draft.lifecycle["com.example.facade-restricted"] = "ready"; });
    expect(manager.resume("registered-policy")).toBe(false);
    expect(runtime.store.getSnapshot().application.activeAppId).toBeNull();
  });

  it("does not let Lifecycle.transition activate a prepared app without lifecycle access", () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.lifecycle-facade", route: "/lifecycle-facade" })],
    });

    expect(runtime.lifecycle.transition("com.example.lifecycle-facade", "loading", { source: "test" })).toMatchObject({ ok: true });
    expect(runtime.lifecycle.transition("com.example.lifecycle-facade", "ready", { source: "test" })).toMatchObject({ ok: true });
    expect(runtime.lifecycle.transition("com.example.lifecycle-facade", "active", { source: "test" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/authorised|required/i),
    });
    expect(runtime.store.getSnapshot().lifecycle["com.example.lifecycle-facade"]).toBe("ready");

    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    runtime.policy.registerPolicy("deny-transition", (request, decision) =>
      request.app?.bundleIdentifier === "com.example.lifecycle-facade" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );
    expect(runtime.lifecycle.transition("com.example.lifecycle-facade", "active", { source: "test" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/policy denied/i),
    });
    expect(runtime.store.getSnapshot().lifecycle["com.example.lifecycle-facade"]).toBe("ready");
  });

  it("does not commit a cancelled lazy bundle or its module lifecycle hooks", async () => {
    let releaseLoad!: () => void;
    const moduleHook = vi.fn();
    const pendingLoad = new Promise<void>((resolve) => { releaseLoad = resolve; });
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.lazy-cancel" }, {
        loadModule: async () => {
          await pendingLoad;
          return {
            default: () => null,
            lifecycleHooks: { applicationWillLaunch: moduleHook },
          };
        },
      })],
    });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });

    const handle = runtime.lifecycle.launch("com.example.lazy-cancel", { reason: "cancel-before-commit" });
    await Promise.resolve();
    handle.cancel("user-cancelled");
    releaseLoad();

    await expect(handle.result).resolves.toMatchObject({ status: "cancelled", committed: false });
    await Promise.resolve();
    expect(runtime.bundles.getLoadedBundle("com.example.lazy-cancel")).toBeNull();
    expect(runtime.bundles.getLifecycleHook("com.example.lazy-cancel", "applicationWillLaunch")).toBeNull();
    expect(moduleHook).not.toHaveBeenCalled();
  });

  it("rejects unsafe, cross-origin, and malformed public route inputs without coercing them into internal routes", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.portfolio", route: "/portfolio" })],
    });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });

    for (const requestedPath of [
      "javascript:/portfolio",
      "https://untrusted.example/portfolio?from=external#top",
      "http://[malformed",
    ]) {
      let handle!: ReturnType<typeof runtime.routes.openRoute>;
      expect(() => { handle = runtime.routes.openRoute(requestedPath, { source: "hostile-input", syncRoute: false }); }).not.toThrow();
      await expect(handle.result).resolves.toMatchObject({
        status: "failed",
        committed: false,
        error: { code: "route-invalid-input" },
      });
      expect(runtime.store.getSnapshot().application.routePath).toBe("/");
    }
  });

  it("classifies malformed absolute input as invalid rather than same-origin", () => {
    expect(normalizeRoutePath("http://[malformed", {
      baseOrigin: "https://syncloudos.example",
    })).toMatchObject({
      inputKind: "invalidInput",
      matchMode: "none",
      routeableInternally: false,
      rejectionReason: expect.stringMatching(/malformed absolute/i),
    });
  });

  it("turns an uncoercible public route value into a typed failure without throwing", async () => {
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.portfolio", route: "/portfolio" })],
    });
    const hostileInput = {
      [Symbol.toPrimitive]() {
        throw new Error("route input must not be coerced outside the normalizer");
      },
    };

    let handle!: ReturnType<typeof runtime.routes.openRoute>;
    expect(() => {
      handle = (runtime.routes.openRoute as (input: unknown, options?: unknown) => ReturnType<typeof runtime.routes.openRoute>)(hostileInput, {
        source: "hostile-input",
        syncRoute: false,
      });
    }).not.toThrow();
    await expect(handle.result).resolves.toMatchObject({
      status: "failed",
      committed: false,
      error: { code: "route-invalid-input" },
    });
    expect(runtime.routes.resolveRoute(hostileInput as never)).toMatchObject({
      kind: "notFound",
      diagnostics: expect.objectContaining({ inputKind: "invalidInput", routeableInternally: false }),
    });
  });

  it("does not erase an unrelated same-branch mutation when an asynchronous transaction rolls back", async () => {
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    const runtime = createTestRuntime();
    const Runtime = createRuntimeController(runtime);

    const transaction = Runtime.transaction("same-branch-rollback", async (context) => {
      context.mutate((draft) => { draft.webspring.selectedAppId = "owned-selection"; });
      await paused;
      throw new Error("rollback");
    });
    await Promise.resolve();
    expect(runtime.store.getSnapshot().webspring.selectedAppId).toBe("owned-selection");
    runtime.store.mutate((draft) => { draft.webspring.hoveredAppId = "unrelated-hover"; });
    release();

    await expect(transaction).resolves.toBeUndefined();
    expect(runtime.store.getSnapshot().webspring).toMatchObject({
      selectedAppId: null,
      hoveredAppId: "unrelated-hover",
    });
  });

  it("rolls back only its changed leaf after replacing a shared branch concurrently", async () => {
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    const runtime = createTestRuntime();
    const Runtime = createRuntimeController(runtime);

    const transaction = Runtime.transaction("branch-replacement-rollback", async (context) => {
      context.mutate((draft) => {
        draft.webspring = {
          ...draft.webspring,
          selectedAppId: "owned-selection",
        };
        expect(draft.webspring.selectedAppId).toBe("owned-selection");
      });
      await paused;
      throw new Error("rollback");
    });
    await Promise.resolve();
    expect(runtime.store.getSnapshot().webspring.selectedAppId).toBe("owned-selection");
    runtime.store.mutate((draft) => { draft.webspring.hoveredAppId = "unrelated-hover"; });
    release();

    await expect(transaction).resolves.toBeUndefined();
    expect(runtime.store.getSnapshot().webspring).toMatchObject({
      selectedAppId: null,
      hoveredAppId: "unrelated-hover",
    });
  });

  it("keeps locale resources and preferences isolated per runtime and disposes only their owner", async () => {
    const first = createTestRuntime({ id: "locale-first" });
    const second = createTestRuntime({ id: "locale-second" });
    first.locale.hydrate();
    second.locale.hydrate();
    first.locale.registerTranslations("synapps.shared", "fr-FR", { title: "Premier" });
    second.locale.registerTranslations("synapps.shared", "fr-FR", { title: "Deuxieme" });

    first.locale.setLocale("fr-FR");
    second.locale.setLocale("fr-FR");

    expect(first.locale.t("title", undefined, "synapps.shared")).toBe("Premier");
    expect(second.locale.t("title", undefined, "synapps.shared")).toBe("Deuxieme");
    expect(first.persistence.getPreference("localeServices.explicitLocale", null)).toBe("fr-FR");
    expect(second.persistence.getPreference("localeServices.explicitLocale", null)).toBe("fr-FR");

    await expect(first.dispose({ reason: "locale-owner-disposed", inFlight: "cancel" })).resolves.toMatchObject({ status: "disposed" });
    expect(first.locale.registerTranslations("synapps.shared", "fr-FR", { leaked: "no" })).toBe(false);
    first.locale.setLocale("de-DE");
    expect(first.persistence.getPreference("localeServices.explicitLocale", null)).toBe("fr-FR");
    expect(second.locale.t("title", undefined, "synapps.shared")).toBe("Deuxieme");
    expect(second.locale.registerTranslations("synapps.shared", "fr-FR", { extra: "still-live" })).toBe(true);
    expect(second.locale.t("extra", undefined, "synapps.shared")).toBe("still-live");
  });

  it("keeps a delayed logout authoritative when a normal route is requested before the locked commit", async () => {
    let releaseSuspend!: () => void;
    const runtime = createTestRuntime({
      initialBundles: [
        createTestBundle({ bundleIdentifier: "com.example.current", route: "/current" }, {
          lifecycleHooks: {
            suspend: {
              will: () => new Promise<void>((resolve) => { releaseSuspend = resolve; }),
            },
          } as never,
        }),
        createTestBundle({ bundleIdentifier: "com.example.next", route: "/next" }),
      ],
    });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    await runtime.routes.openRoute("/current", { source: "setup", syncRoute: false }).result;

    const logout = runtime.logOut({ reason: "authoritative" });
    await vi.waitFor(() => expect(releaseSuspend).toBeTypeOf("function"));
    const displacedRoute = runtime.routes.openRoute("/next", { source: "during-logout", syncRoute: false });

    await expect(displacedRoute.result).resolves.toMatchObject({
      status: "failed",
      committed: false,
      error: { code: "session-logout-pending" },
    });
    releaseSuspend();
    await expect(logout.result).resolves.toMatchObject({ status: "completed", committed: true });
    expect(runtime.store.getSnapshot()).toMatchObject({
      loginServices: { isAuthorised: false },
      application: { activeAppId: null, routePath: "/" },
      statechart: { currentState: "locked.loginWindow" },
    });
  });
});
