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
import { createTestBundle, createTestRuntime } from "./helpers";
import type { IdentitySessionAdapterSnapshot } from "../../src/SynCloudOS/Identity/identitySessionTypes";

function identityAdapter() {
  let ended = false;
  const listeners = new Set<(snapshot: IdentitySessionAdapterSnapshot | null) => void>();
  return {
    id: "identity:test",
    read: async () => ({ id: "session:test", subjectId: "person:test", state: "active" as const, claims: { displayName: "Test Person", email: "person@example.com", roles: "member" } }),
    subscribe: (listener: (snapshot: IdentitySessionAdapterSnapshot | null) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    end: async () => { ended = true; listeners.forEach((listener) => listener(null)); },
    dispose: () => undefined,
    wasEnded: () => ended,
    expire: () => listeners.forEach((listener) => listener(null)),
  };
}

describe("instance-owned login service", () => {
  it("lets an authentication-disabled runtime open an explicitly public app without a session", async () => {
    const runtime = createTestRuntime({
      authenticationPolicy: "disabled",
      initialBundles: [
        createTestBundle({
          id: "public-without-session",
          route: "/public-without-session",
          policy: { public: true },
        }),
      ],
    });
    await runtime.boot({ initialPathname: "/" });

    expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(false);
    expect(runtime.policy.getAccessMode()).toBe("mixed");
    await expect(runtime.routes.openRoute("/public-without-session", {
      source: "public-route-test",
      syncRoute: false,
    }).result).resolves.toMatchObject({
      status: "completed",
      committed: true,
      value: { kind: "app", appId: "public-without-session" },
    });
    expect(runtime.store.getSnapshot()).toMatchObject({
      application: { activeAppId: "public-without-session", routePath: "/public-without-session" },
      lifecycle: { "public-without-session": "active" },
    });
    await runtime.dispose({ reason: "public route test cleanup", inFlight: "cancel" });
  });

  it("projects only its configured identity and revokes it through the adapter", async () => {
    const adapter = identityAdapter();
    const runtime = createTestRuntime({ identity: { sessionAdapter: adapter } });
    const other = createTestRuntime();
    await runtime.boot({ initialPathname: "/" });
    expect(runtime.store.getSnapshot().loginServices).toMatchObject({ isAuthorised: true, status: "unlocked", synId: "person@example.com", displayName: "Test Person" });
    expect(other.store.getSnapshot().loginServices.isAuthorised).toBe(false);
    await runtime.login.lock();
    expect(adapter.wasEnded()).toBe(true);
    expect(runtime.store.getSnapshot().loginServices).toMatchObject({ isAuthorised: false, status: "locked", synId: null });
  });

  it("removes protected app authority immediately when the server session expires", async () => {
    const adapter = identityAdapter();
    const runtime = createTestRuntime({
      authenticationPolicy: "required",
      identity: { sessionAdapter: adapter },
      initialBundles: [createTestBundle({ id: "protected", route: "/protected" })],
    });
    await runtime.boot({ initialPathname: "/protected" });
    expect(runtime.store.getSnapshot()).toMatchObject({ application: { activeAppId: "protected" }, lifecycle: { protected: "active" } });
    adapter.expire();
    expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(false);
    await vi.waitFor(() => expect(runtime.store.getSnapshot()).toMatchObject({
      lifecycle: { protected: "suspended" },
      statechart: { currentState: "locked.loginWindow" },
    }));
  });

  it("keeps an explicit unauthorised Webspring entry presentation-only across revalidation", async () => {
    let session: IdentitySessionAdapterSnapshot | null = null;
    const listeners = new Set<(snapshot: IdentitySessionAdapterSnapshot | null) => void>();
    const adapter = {
      id: "identity:presentation-override",
      read: async () => session,
      subscribe: (listener: (snapshot: IdentitySessionAdapterSnapshot | null) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      end: async () => undefined,
      dispose: () => listeners.clear(),
      publish(next: IdentitySessionAdapterSnapshot | null) {
        session = next;
        listeners.forEach((listener) => listener(next));
      },
    };
    const runtime = createTestRuntime({
      authenticationPolicy: "required",
      identity: { sessionAdapter: adapter },
      initialBundles: [createTestBundle({ id: "presentation-protected", route: "/presentation-protected" })],
    });
    await runtime.boot({ initialPathname: "/" });
    expect(runtime.statechart.getCurrentState()).toBe("locked.loginWindow");

    runtime.statechart.gotoState("active.webspring");
    await runtime.identity.session.refresh();

    expect(runtime.statechart.getCurrentState()).toBe("active.webspring");
    expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(false);
    await expect(runtime.routes.openRoute("/presentation-protected", {
      source: "webspring-controller",
      context: { launcher: "WebspringHost", siteName: "Syndromatic" },
    }).result).resolves.toMatchObject({ status: "failed", error: { code: "route-unauthorised" } });
    expect(runtime.errors.getLatest()).toMatchObject({
      code: "UNRECOVERABLE_LOGIN_SESSION_MISMATCH",
      title: "Syndromatic has unexpectedly stopped.",
      appId: "presentation-protected",
      packageName: "PresentationProtected.app",
    });
    expect(runtime.errors.getLatest()?.technicalDetails).toContain(
      "App: Presentation Protected (presentation-protected)",
    );
    expect(runtime.errors.getLatest()?.technicalDetails).toContain("Statechart: active.webspring");
    expect(runtime.errors.getLatest()?.technicalDetails).toContain("Session authority: not authorised");
    await runtime.identity.session.refresh();
    expect(runtime.store.getSnapshot()).toMatchObject({
      application: { activeAppId: null },
      statechart: { currentState: "active.webspring" },
    });

    adapter.publish({
      id: "session:override-cleared",
      subjectId: "person:override-cleared",
      state: "active",
      claims: { roles: "member" },
    });
    expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(true);
    adapter.publish(null);
    expect(runtime.statechart.getCurrentState()).toBe("locked.loginWindow");
  });

  it("owns logout as one operation that supersedes route work and commits a locked root state", async () => {
    let releaseLoad!: () => void;
    const delayedLoad = new Promise<void>((resolve) => { releaseLoad = resolve; });
    const runtime = createTestRuntime({
      initialBundles: [
        createTestBundle({ id: "current-app", route: "/current" }),
        createTestBundle({ id: "delayed-app", route: "/delayed" }, {
          loadModule: async () => {
            await delayedLoad;
            return { default: () => null };
          },
        }),
      ],
    });
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    await runtime.routes.openRoute("/current", { source: "setup", syncRoute: false }).result;
    const route = runtime.routes.openRoute("/delayed", { source: "race", syncRoute: false });
    await Promise.resolve();

    const logout = runtime.logOut({ reason: "test-logout" });
    releaseLoad();

    await expect(route.result).resolves.toMatchObject({ status: "cancelled", committed: false });
    await expect(logout.result).resolves.toMatchObject({ status: "completed", committed: true });
    expect(runtime.store.getSnapshot()).toMatchObject({
      loginServices: { isAuthorised: false, status: "locked" },
      lifecycle: { "current-app": "suspended", "delayed-app": "registered" },
      application: { activeAppId: null, currentAppId: null, routePath: "/" },
      statechart: { currentState: "locked.loginWindow" },
    });
    expect(runtime.windows.list()).toEqual([]);
  });

  it("establishes the irreversible checkpoint before logout state becomes observable", async () => {
    const runtime = createTestRuntime();
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    const observedCommitStates: boolean[] = [];
    const unsubscribe = runtime.store.subscribe(() => {
      if (runtime.store.getSnapshot().loginServices.isAuthorised) return;
      const operation = runtime.operations.inspectPending().find((record) => (
        record.kind === "session.logout" && record.phase === "committing"
      ));
      if (operation) observedCommitStates.push(operation.committed);
    });

    await runtime.logOut({ reason: "checkpoint-order" }).result;
    unsubscribe();

    expect(observedCommitStates.length).toBeGreaterThan(0);
    expect(observedCommitStates).not.toContain(false);
  });
});
