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

import { describe, expect, it } from "vitest";
import { createTestRuntime } from "./helpers";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { createAppRouteSession } from "../../src/SynCloudOS/Routing/AppRouteSession";

type SessionRecord = {
  id: string;
  subjectId: string;
  state: "active" | "locked" | "expired";
  claims: Record<string, string | boolean | number>;
  expiresAt?: number;
};

function createTestIdentitySessionAdapter(initial: SessionRecord | null) {
  let current = initial;
  const listeners = new Set<(snapshot: SessionRecord | null) => void>();
  let ended = false;
  return {
    id: "test-identity-session",
    read: async () => current,
    subscribe(listener: (snapshot: SessionRecord | null) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    end: async () => {
      ended = true;
      current = null;
      listeners.forEach((listener) => listener(null));
    },
    dispose: () => undefined,
    publish(snapshot: SessionRecord | null) {
      current = snapshot;
      listeners.forEach((listener) => listener(snapshot));
    },
    wasEnded: () => ended,
  };
}

describe("instance-owned identity session service", () => {
  it("does not revoke route authority when a focus recheck reports the identical session", async () => {
    const value: SessionRecord = { id: "session:one", subjectId: "person:one", state: "active", claims: { role: "staff", enabled: true }, expiresAt: 5000 };
    const adapter = createTestIdentitySessionAdapter(value);
    const read = adapter.read;
    // The HTTP adapter publishes the response and also returns it from read.
    adapter.read = async () => { const next = await read(); adapter.publish(next); return next; };
    const runtime = createTestRuntime({ identity: { sessionAdapter: adapter } });
    const revisions: number[] = [];
    runtime.identity.session.subscribe(() => revisions.push(runtime.identity.session.getRevision()));
    await runtime.identity.session.refresh();
    expect(revisions).toEqual([1]);
    const generation = runtime.routes.routeGraph.getAuthorizationGeneration();
    await runtime.identity.session.refresh();
    adapter.publish({ ...value, claims: { enabled: true, role: "staff" } });
    expect(runtime.routes.routeGraph.getAuthorizationGeneration()).toBe(generation);
    expect(revisions).toEqual([1]);
    await runtime.dispose("identity recheck test");
  });

  it.each([
    { id: "session:two" }, { subjectId: "person:two" }, { state: "locked" as const },
    { state: "expired" as const }, { claims: { role: "guest" } }, { expiresAt: 6000 },
  ])("still revokes authority for a material session change: %j", async change => {
    const value: SessionRecord = { id: "session:one", subjectId: "person:one", state: "active", claims: { role: "staff" }, expiresAt: 5000 };
    const adapter = createTestIdentitySessionAdapter(value);
    const runtime = createTestRuntime({ identity: { sessionAdapter: adapter } });
    await runtime.identity.session.refresh();
    const generation = runtime.routes.routeGraph.getAuthorizationGeneration();
    adapter.publish({ ...value, ...change });
    expect(runtime.routes.routeGraph.getAuthorizationGeneration()).toBeGreaterThan(generation);
    const changed = runtime.identity.session.getRevision();
    adapter.publish(null);
    expect(runtime.identity.session.getRevision()).toBeGreaterThan(changed);
    await runtime.dispose("identity authority test");
  });

  it("reflects adapter session changes without performing authentication", async () => {
    const adapter = createTestIdentitySessionAdapter({
      id: "session:one",
      subjectId: "person:one",
      state: "active",
      claims: {},
    });
    const runtime = createTestRuntime({ identity: { sessionAdapter: adapter } });
    const observed: Array<string | null> = [];
    const unsubscribe = runtime.identity.session.subscribe((snapshot) => {
      observed.push(snapshot?.id ?? null);
    });

    await runtime.identity.session.refresh();
    adapter.publish(null);
    expect(observed).toEqual(["session:one", null]);
    expect(runtime.identity.session).not.toHaveProperty("signInWithPassword");
    expect(runtime.identity.session.getSnapshot()).toBeNull();
    unsubscribe();
  });

  it("namespaces snapshots by runtime and forwards explicit end to the adapter", async () => {
    const adapter = createTestIdentitySessionAdapter({
      id: "session:two",
      subjectId: "person:two",
      state: "active",
      claims: { tier: "team" },
    });
    const runtime = createTestRuntime({ id: "runtime:identity:one", identity: { sessionAdapter: adapter } });
    const other = createTestRuntime({ id: "runtime:identity:two" });

    const snapshot = await runtime.identity.session.refresh();
    expect(snapshot).toMatchObject({ runtimeId: runtime.runtimeId, id: "session:two" });
    expect(other.identity.session.getSnapshot()).toBeNull();
    await runtime.identity.session.end({ reason: "user-requested" });
    expect(adapter.wasEnded()).toBe(true);
    expect(runtime.identity.session.getSnapshot()).toBeNull();
  });

  it("leaves the configured login gate only after a verified live session arrives", async () => {
    const adapter = createTestIdentitySessionAdapter(null);
    const runtime = createTestRuntime({ authenticationPolicy: "required", identity: { sessionAdapter: adapter } });
    await runtime.boot({ initialPathname: "/" });
    expect(runtime.statechart.getCurrentState()).toBe("locked.loginWindow");
    adapter.publish({ id: "session:verified", subjectId: "person:verified", state: "active", claims: {} });
    expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(true);
    expect(runtime.statechart.getCurrentState()).toBe("active.webspring");
    adapter.publish(null);
    expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(false);
    expect(runtime.statechart.getCurrentState()).toBe("locked.loginWindow");
    await runtime.dispose();
  });
});

import { createHttpAuthentication } from "../../src/SynCloudOS/Authentication";

describe("HTTP authentication adapter", () => {
  it("keeps a mounted route across browser focus rechecks and revokes it when roles change", async () => {
    const events = new EventTarget();
    let roles = ["staff"];
    const authentication = createHttpAuthentication({
      eventTarget: events, now: () => 1000, setTimeout: () => 0, clearTimeout: () => undefined,
      fetch: async input => Response.json(String(input).endsWith("/methods") ? { methods: [] }
        : { authenticated: true, profile: { subject: "test-person", roles }, expiresAt: 5000 }),
    });
    const runtime = createTestRuntime({ identity: { sessionAdapter: authentication.sessionAdapter } });
    await runtime.identity.session.refresh();
    const graph = defineSynWareRoutes({ id: "focus-test", routes: [{ name: "library", path: "" }] }).bind("/library", "library");
    const session = createAppRouteSession({
      graph, getBundleGeneration: () => 1, getSessionId: () => "library",
      getAuthorizationGeneration: runtime.routes.routeGraph.getAuthorizationGeneration,
      subscribeAuthorityChanges: listener => runtime.identity.session.subscribe(listener),
      createLoaderServices: () => ({ require() { throw new Error("Unexpected service"); }, optional() { throw new Error("Unexpected service"); } }),
      routeDataTimeoutMs: 500, setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const focus = async () => {
      const finished = new Promise<void>(resolve => {
        const release = authentication.subscribe(() => {
          if (authentication.getSnapshot().status === "authenticated") { release(); resolve(); }
        });
      });
      events.dispatchEvent(new Event("focus"));
      await finished;
    };
    try {
      const route = graph.recognize("/library");
      if (route.kind !== "match") throw new Error("Missing fixture route");
      await session.commit(route, { operationId: "open-library" });
      const ready = session.getSnapshot();
      await focus();
      expect(session.getSnapshot()).toBe(ready);
      roles = ["guest"];
      await focus();
      expect(session.getSnapshot()).toMatchObject({ status: "idle", route: null });
    } finally {
      await session.disposeAsync();
      authentication.dispose();
      await runtime.dispose("focus revalidation test");
    }
  });

  it("projects a valid cookie session and expires it without browser assertions", async () => {
    let timer: (() => void) | null = null;
    const fetcher = async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).endsWith("/methods")
      ? { methods: [{ id: "google", label: "Continue with Google" }] }
      : { authenticated: true, profile: { subject: "issuer|subject", roles: ["member"], email: "person@example.com" }, expiresAt: 2_000 }), { status: 200 });
    const authentication = createHttpAuthentication({ fetch: fetcher, now: () => 1_000, setTimeout: (callback) => { timer = callback; return 1; }, clearTimeout: () => undefined });
    await expect(authentication.refresh()).resolves.toMatchObject({ status: "authenticated", profile: { subject: "issuer|subject" } });
    await expect(authentication.sessionAdapter.read()).resolves.toMatchObject({ subjectId: "issuer|subject", state: "active" });
    expect(timer).not.toBeNull();
    (timer as unknown as () => void)();
    expect(authentication.getSnapshot()).toMatchObject({ status: "expired", profile: null });
  });

  it("rejects invalid and failed responses and recovers failed sign-in from pending", async () => {
    let mode: "invalid" | "anonymous" | "start" = "invalid";
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (mode === "invalid") return new Response("unavailable", { status: 503 });
      if (url.endsWith("/methods")) return new Response(JSON.stringify({ methods: [{ id: "google", label: "Google" }] }), { status: 200 });
      if (url.endsWith("/session")) return new Response(JSON.stringify({ authenticated: false }), { status: 200 });
      return new Response(JSON.stringify({ error: "Provider unavailable" }), { status: 503 });
    };
    const authentication = createHttpAuthentication({ fetch: fetcher });
    await expect(authentication.refresh()).resolves.toMatchObject({ status: "error" });
    mode = "anonymous";
    await expect(authentication.refresh()).resolves.toMatchObject({ status: "anonymous" });
    await expect(authentication.signIn("google", "//outside.example")).rejects.toThrow(/local/);
    mode = "start";
    await expect(authentication.signIn("google", "/journal")).rejects.toThrow("Provider unavailable");
    expect(authentication.getSnapshot()).toMatchObject({ status: "error", error: "Provider unavailable" });
  });

  it("rejects malformed provider artwork and recovers when the descriptor is valid", async () => {
    let iconUrl: unknown = { url: "/assets/provider.svg" };
    const authentication = createHttpAuthentication({
      fetch: async (input) => Response.json(String(input).endsWith("/methods")
        ? { methods: [{ id: "example", label: "Sign in", iconUrl }] }
        : { authenticated: false }),
    });
    try {
      await expect(authentication.refresh()).resolves.toMatchObject({ status: "error", methods: [] });
      iconUrl = "/assets/provider.svg";
      await expect(authentication.refresh()).resolves.toMatchObject({ status: "anonymous", error: null });
    } finally {
      authentication.dispose();
    }
  });

  it("preserves a confirmed session when logout fails and broadcasts successful logout", async () => {
    let failLogout = true;
    const posted: unknown[] = [];
    const channel = { postMessage: (value: unknown) => posted.push(value), close: () => undefined, onmessage: null as ((event: MessageEvent) => void) | null };
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/methods")) return new Response(JSON.stringify({ methods: [{ id: "google", label: "Google" }] }), { status: 200 });
      if (url.endsWith("/session")) return new Response(JSON.stringify({ authenticated: true, profile: { subject: "issuer|subject", roles: [] }, expiresAt: Date.now() + 60_000 }), { status: 200 });
      return failLogout ? new Response(JSON.stringify({ error: "logout failed" }), { status: 503 }) : new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const authentication = createHttpAuthentication({ fetch: fetcher, createBroadcastChannel: () => channel });
    await authentication.refresh();
    await expect(authentication.signOut()).rejects.toThrow("logout failed");
    expect(authentication.getSnapshot()).toMatchObject({ status: "authenticated", profile: { subject: "issuer|subject" }, error: "logout failed" });
    failLogout = false;
    await authentication.signOut();
    expect(authentication.getSnapshot().status).toBe("anonymous");
    expect(posted).toEqual([{ type: "session-changed" }]);
  });
});
