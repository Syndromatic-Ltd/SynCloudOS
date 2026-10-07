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

import { expect, it, vi } from "vitest";
import type {
  LUFXIndexBackend,
  LUFXIndexBackendMutation,
  LUFXIndexBackendMutationResult,
  LUFXIndexBackendSnapshot,
} from "../../../src/FX/LuminaFX/LUFXIndexBackend";
import { LUFXSearchableItem, type LUFXVisibility } from "../../../src/FX/LuminaFX/LUFXSearchableItem";
import { LuminaIndexService, type LuminaIndexBackendFactory } from "../../../src/SynCloudOS/LuminaFX/LuminaIndexService";
import { LuminaEligibilityRegistry } from "../../../src/SynCloudOS/LuminaFX/LuminaEligibility";
import { LUFXHostService, type LUFXHostPolicyPort } from "../../../src/SynCloudOS/LuminaFX/LUFXHostService";
import { createSynCloudOSHostContribution } from "../../../src/SynCloudOS/HostContributions/hostContribution";
import { createSynWareContextValue } from "../../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import {
  createTestBundle,
  createTestRuntime,
  createTestRuntimeEnvironment,
  installTestHostContributions,
  mountTestSynWareRuntime,
} from "../helpers";

class SnapshotBackend implements LUFXIndexBackend {
  disposed = false;
  constructor(
    readonly items: LUFXIndexBackendSnapshot["items"],
    readonly beforeSnapshot?: () => Promise<void>,
  ) {}
  async mutate(mutation: LUFXIndexBackendMutation): Promise<LUFXIndexBackendMutationResult> {
    return { mutationId: mutation.mutationId, checkpoint: { generation: 1, revision: 1 }, replayed: false };
  }
  async snapshot(signal?: AbortSignal): Promise<LUFXIndexBackendSnapshot> {
    signal?.throwIfAborted();
    await this.beforeSnapshot?.();
    signal?.throwIfAborted();
    if (this.disposed) throw new DOMException("disposed", "AbortError");
    return { state: "ready", schemaVersion: 1, checkpoint: { generation: 1, revision: 1 }, items: this.items };
  }
  dispose(): void { this.disposed = true; }
}

interface SharedBackendState {
  readonly items: Map<string, LUFXSearchableItem>;
  generation: number;
  revision: number;
}

class SharedBackend implements LUFXIndexBackend {
  #disposed = false;
  constructor(readonly state: SharedBackendState) {}

  async mutate(mutation: LUFXIndexBackendMutation, signal?: AbortSignal): Promise<LUFXIndexBackendMutationResult> {
    signal?.throwIfAborted();
    if (this.#disposed) throw new DOMException("disposed", "AbortError");
    if (mutation.kind === "upsert") this.state.items.set(mutation.item.id, LUFXSearchableItem.fromJSON(mutation.item));
    else if (mutation.kind === "delete") this.state.items.delete(mutation.itemId);
    else for (const [id, item] of this.state.items) if (item.domain === mutation.domain) this.state.items.delete(id);
    this.state.generation += 1;
    this.state.revision += 1;
    return {
      mutationId: mutation.mutationId,
      checkpoint: { generation: this.state.generation, revision: this.state.revision },
      replayed: false,
    };
  }

  async snapshot(signal?: AbortSignal): Promise<LUFXIndexBackendSnapshot> {
    signal?.throwIfAborted();
    if (this.#disposed) throw new DOMException("disposed", "AbortError");
    return {
      state: "ready",
      schemaVersion: 1,
      checkpoint: { generation: this.state.generation, revision: this.state.revision },
      items: [...this.state.items.values()].map((item) => item.toJSON()),
    };
  }

  dispose(): void { this.#disposed = true; }
}

function searchable(id: string, title: string, visibility: LUFXVisibility = "eligible-donation", revision = "r1") {
  return new LUFXSearchableItem({
    id,
    domain: "journal.entry",
    contentType: "text/journal",
    title,
    body: `${title} body`,
    visibility,
    revision,
    activation: { version: 1, kind: "named-route", routeName: "journal.entry", parameters: { id } },
  });
}

function policySubject(id = "person-one") {
  return {
    user: Object.freeze({
      id,
      displayName: id,
      role: "betaTester" as const,
      isAuthenticated: true,
      isAnonymous: false,
    }),
    role: "betaTester" as const,
    capabilities: ["lumina.eligible-query"],
    isAuthenticated: true,
  };
}

function createHarness(backends: Record<string, SnapshotBackend>) {
  let subject = policySubject();
  let stateListener: (() => void) | null = null;
  let policyAllowed = true;
  let destinationInstalled = true;
  const indexes = new LuminaIndexService({
    create(ownerKey) {
      const backend = backends[ownerKey];
      if (!backend) throw new DOMException(`missing backend ${ownerKey}`, "NotFoundError");
      return new SnapshotBackend(backend.items, backend.beforeSnapshot);
    },
  } satisfies LuminaIndexBackendFactory);
  const eligibility = new LuminaEligibilityRegistry();
  const policy: LUFXHostPolicyPort = {
    getCurrentSubject: () => subject,
    authorise: vi.fn(() => ({ allowed: policyAllowed })),
  };
  const routes = {
    getAppForRoute: vi.fn((pathname: string) => pathname.startsWith("/journal") ? { id: "com.syndromatic.journal" } : null),
    openRoute: vi.fn((pathname: string, options: any = {}) => {
      const controller = new AbortController();
      let cancelled = false;
      return {
        operationId: "route-operation",
        correlationId: options.correlationId ?? "route-correlation",
        signal: controller.signal,
        cancel() { cancelled = true; controller.abort(new DOMException("cancelled", "AbortError")); },
        result: Promise.resolve().then(async () => {
          if (cancelled) return { status: "cancelled", committed: false, reason: "cancelled" } as const;
          await options.hostBeforeCommit?.({ signal: controller.signal, correlationId: options.correlationId ?? "route-correlation" });
          if (cancelled || controller.signal.aborted) return { status: "cancelled", committed: false, reason: "cancelled" } as const;
          return {
            status: "completed",
            committed: true,
            value: {
              runtimeId: "runtime-one",
              requestedPath: pathname,
              pathname,
              kind: "app",
              appId: "com.syndromatic.journal",
              presentationSettlementId: "presentation-one",
            },
            postCommit: "completed",
            issues: [],
            skipped: [],
          } as const;
        }),
      };
    }),
  };
  const presentationSettlements = {
    get: vi.fn((id: string) => id === "presentation-one"
      ? { id, result: Promise.resolve({ status: "completed", roles: ["content"] } as const), completeRole: () => true, cancel: vi.fn() }
      : null),
  };
  const service = new LUFXHostService({
    runtimeId: "runtime-one",
    indexes,
    eligibility,
    policy,
    subscribeState(listener) { stateListener = listener; return () => { if (stateListener === listener) stateListener = null; }; },
    apps: { getApp: (appId: string) => destinationInstalled && appId === "com.syndromatic.journal" ? { id: appId } : null },
    routes,
    presentationSettlements,
    randomUUID: () => "activation-correlation",
  });
  return {
    service,
    eligibility,
    policy,
    routes,
    presentationSettlements,
    setPolicyAllowed(next: boolean) { policyAllowed = next; },
    setDestinationInstalled(next: boolean) { destinationInstalled = next; },
    setSubject(next: ReturnType<typeof policySubject>) { subject = next; stateListener?.(); },
  };
}

it("filters private and revoked content before privileged ranking and invalidates delivered batches", async () => {
  const published = searchable("published", "Published Journal Note");
  const draft = searchable("draft", "Private Journal Note", "app-only");
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend([published.toJSON(), draft.toJSON()]),
  });
  const unregister = harness.service.registerDomain({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    destinationAppId: "com.syndromatic.journal",
    routeName: "journal.entry",
    resolve: ({ item }) => ({ pathname: `/journal?post=${encodeURIComponent(item.id)}` }),
  });
  harness.service.setEligibility({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    itemId: "published",
    revision: "r1",
    eligible: true,
  });

  const batch = await harness.service.queryEligible({ text: "Journal Note" });
  expect(batch.results.map((entry) => entry.item.id)).toEqual(["published"]);
  expect(JSON.stringify(batch)).not.toContain("Private Journal Note");
  const suggestions = await harness.service.suggestEligible({ text: "Journal" });
  expect(JSON.stringify(suggestions)).not.toContain("Private Journal Note");
  expect(harness.service.filterCurrent(batch).results).toHaveLength(1);

  harness.service.setEligibility({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    itemId: "published",
    revision: "r1",
    eligible: false,
  });
  expect(harness.service.filterCurrent(batch).results).toHaveLength(0);
  unregister();
  harness.service.dispose();
});

it("rejects a privileged query whose eligibility generation changes while snapshots are in flight", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const published = searchable("published", "Published Journal Note");
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend([published.toJSON()], () => gate),
  });
  harness.service.registerDomain({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    destinationAppId: "com.syndromatic.journal",
    routeName: "journal.entry",
    resolve: ({ item }) => ({ pathname: `/journal?post=${encodeURIComponent(item.id)}` }),
  });
  harness.service.setEligibility({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    itemId: "published",
    revision: "r1",
    eligible: true,
  });

  const pending = harness.service.queryEligible({ text: "Published" });
  harness.service.setEligibility({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    itemId: "published",
    revision: "r1",
    eligible: false,
  });
  release();
  await expect(pending).rejects.toMatchObject({ name: "InvalidStateError" });
  harness.service.dispose();
});

it("invalidates privileged visibility when the runtime subject changes", async () => {
  const published = searchable("published", "Published Journal Note");
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend([published.toJSON()]),
  });
  harness.service.registerDomain({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    destinationAppId: "com.syndromatic.journal",
    routeName: "journal.entry",
    resolve: ({ item }) => ({ pathname: `/journal?post=${encodeURIComponent(item.id)}` }),
  });
  harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: true });
  const batch = await harness.service.queryEligible({ text: "Published" });
  expect(batch.results).toHaveLength(1);

  harness.setSubject(policySubject("person-two"));
  expect(harness.service.filterCurrent(batch).results).toHaveLength(0);
  harness.service.dispose();
});

it("activates only a current eligible named route and waits for presentation settlement", async () => {
  const published = searchable("published", "Published Journal Note");
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend([published.toJSON()]),
  });
  harness.service.registerDomain({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    destinationAppId: "com.syndromatic.journal",
    routeName: "journal.entry",
    resolve: ({ item }) => ({ pathname: `/journal?post=${encodeURIComponent(item.id)}` }),
  });
  harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: true });
  const batch = await harness.service.queryEligible({ text: "Published" });

  const result = await harness.service.activate(batch.results[0]!.reference);
  expect(result).toMatchObject({ status: "activated", committed: true, correlationId: "activation-correlation" });
  expect(harness.routes.openRoute).toHaveBeenCalledWith("/journal?post=published", expect.objectContaining({ source: "lumina" }));
  expect(harness.presentationSettlements.get).toHaveBeenCalledWith("presentation-one");
  harness.service.dispose();
});

it("does not report activation when eligibility is revoked before route commit", async () => {
  const published = searchable("published", "Published Journal Note");
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend([published.toJSON()]),
  });
  let releaseResolver!: () => void;
  const resolverGate = new Promise<void>((resolve) => { releaseResolver = resolve; });
  harness.service.registerDomain({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    destinationAppId: "com.syndromatic.journal",
    routeName: "journal.entry",
    resolve: async ({ item }) => {
      await resolverGate;
      return { pathname: `/journal?post=${encodeURIComponent(item.id)}` };
    },
  });
  harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: true });
  const batch = await harness.service.queryEligible({ text: "Published" });

  const activation = harness.service.activate(batch.results[0]!.reference);
  harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: false });
  releaseResolver();
  await expect(activation).resolves.toMatchObject({ status: "stale", committed: false });
  expect(harness.routes.openRoute).not.toHaveBeenCalled();
  harness.service.dispose();
});

it("settles revoked activation while a trusted resolver ignores abort forever", async () => {
  const published = searchable("published", "Published Journal Note");
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend([published.toJSON()]),
  });
  let resolverSignal: AbortSignal | undefined;
  const resolve = vi.fn(({ signal }: { signal: AbortSignal }) => {
    resolverSignal = signal;
    return new Promise<never>(() => undefined);
  });
  try {
    harness.service.registerDomain({
      ownerAppId: "com.syndromatic.publisher",
      domain: "journal.entry",
      destinationAppId: "com.syndromatic.journal",
      routeName: "journal.entry",
      resolve,
    });
    harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: true });
    const reference = (await harness.service.queryEligible({ text: "Published" })).results[0]!.reference;
    const activation = harness.service.activate(reference);
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));

    harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: false });
    const outcome = await Promise.race([activation, new Promise<null>((done) => setTimeout(() => done(null), 100))]);
    expect(outcome).toMatchObject({ status: "stale", committed: false });
    expect(resolverSignal?.aborted).toBe(true);
    expect(harness.routes.openRoute).not.toHaveBeenCalled();
  } finally {
    harness.service.dispose();
  }
});

it("releases its index and settles when a revoked snapshot ignores abort forever", async () => {
  const published = searchable("published", "Published Journal Note");
  let blockSnapshot = false;
  const backend = new SnapshotBackend([published.toJSON()], () => blockSnapshot ? new Promise<never>(() => undefined) : Promise.resolve());
  const harness = createHarness({ "com.syndromatic.publisher": backend });
  const dispose = vi.spyOn(SnapshotBackend.prototype, "dispose");
  try {
    harness.service.registerDomain({
      ownerAppId: "com.syndromatic.publisher",
      domain: "journal.entry",
      destinationAppId: "com.syndromatic.journal",
      routeName: "journal.entry",
      resolve: ({ item }) => ({ pathname: `/journal?post=${encodeURIComponent(item.id)}` }),
    });
    harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: true });
    const reference = (await harness.service.queryEligible({ text: "Published" })).results[0]!.reference;
    const before = dispose.mock.calls.length;
    blockSnapshot = true;
    const activation = harness.service.activate(reference);
    await vi.waitFor(() => expect(dispose.mock.calls.length).toBe(before));

    harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: false });
    const outcome = await Promise.race([activation, new Promise<null>((done) => setTimeout(() => done(null), 100))]);
    expect(outcome).toMatchObject({ status: "stale", committed: false });
    expect(dispose.mock.calls.length).toBe(before + 1);
    expect(harness.routes.openRoute).not.toHaveBeenCalled();
  } finally {
    harness.service.dispose();
    dispose.mockRestore();
  }
});

it("removes already delivered privileged results when PolicyKit revokes eligible-query authority", async () => {
  const published = searchable("published", "Published Journal Note");
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend([published.toJSON()]),
  });
  harness.service.registerDomain({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    destinationAppId: "com.syndromatic.journal",
    routeName: "journal.entry",
    resolve: ({ item }) => ({ pathname: `/journal?post=${encodeURIComponent(item.id)}` }),
  });
  harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: true });
  const batch = await harness.service.queryEligible({ text: "Published" });
  expect(batch.results).toHaveLength(1);

  harness.setPolicyAllowed(false);
  expect(harness.service.filterCurrent(batch).results).toHaveLength(0);
  await expect(harness.service.queryEligible({ text: "Published" })).rejects.toMatchObject({ name: "SecurityError" });
  harness.service.dispose();
});

it("maps route denial, committed route failure and presentation timeout without reporting activation", async () => {
  const published = searchable("published", "Published Journal Note");
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend([published.toJSON()]),
  });
  harness.service.registerDomain({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    destinationAppId: "com.syndromatic.journal",
    routeName: "journal.entry",
    resolve: ({ item }) => ({ pathname: `/journal?post=${encodeURIComponent(item.id)}` }),
  });
  harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: true });
  const reference = (await harness.service.queryEligible({ text: "Published" })).results[0]!.reference;

  harness.routes.openRoute.mockReturnValueOnce({
    operationId: "route-denied",
    correlationId: "route-denied-correlation",
    signal: new AbortController().signal,
    cancel: vi.fn(),
    result: Promise.resolve({
      status: "failed",
      committed: false,
      phase: "validating",
      error: { code: "route-denied", name: "RouteDenied", message: "denied", phase: "validating" },
    }),
  } as any);
  await expect(harness.service.activate(reference)).resolves.toMatchObject({ status: "denied", committed: false, correlationId: "route-denied-correlation" });

  harness.routes.openRoute.mockReturnValueOnce({
    operationId: "route-postcommit-failure",
    correlationId: "route-postcommit-correlation",
    signal: new AbortController().signal,
    cancel: vi.fn(),
    result: Promise.resolve({
      status: "completed",
      committed: true,
      value: { runtimeId: "runtime-one", requestedPath: "/journal", pathname: "/journal", kind: "app", appId: "com.syndromatic.journal" },
      postCommit: "failed",
      issues: [{ phase: "did", message: "loader failed" }],
      skipped: [],
    }),
  } as any);
  await expect(harness.service.activate(reference)).resolves.toMatchObject({ status: "route-error", committed: true, correlationId: "route-postcommit-correlation" });

  harness.presentationSettlements.get.mockReturnValueOnce({
    id: "presentation-one",
    result: Promise.resolve({ status: "timed-out", pendingRoles: ["content"] }),
    completeRole: vi.fn(),
    cancel: vi.fn(),
  } as any);
  await expect(harness.service.activate(reference)).resolves.toMatchObject({ status: "presentation-timeout", committed: true });
  harness.service.dispose();
});

it("reports unavailable for an uninstalled destination and stale for deleted or cross-runtime references", async () => {
  const records = [searchable("published", "Published Journal Note").toJSON()];
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend(records),
  });
  harness.service.registerDomain({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    destinationAppId: "com.syndromatic.journal",
    routeName: "journal.entry",
    resolve: ({ item }) => ({ pathname: `/journal?post=${encodeURIComponent(item.id)}` }),
  });
  harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: true });
  const reference = (await harness.service.queryEligible({ text: "Published" })).results[0]!.reference;

  harness.setDestinationInstalled(false);
  await expect(harness.service.activate(reference)).resolves.toMatchObject({ status: "unavailable", committed: false });
  harness.setDestinationInstalled(true);
  await expect(harness.service.activate({ ...reference, runtimeId: "runtime-two" })).resolves.toMatchObject({ status: "stale", committed: false });
  records.splice(0, records.length);
  await expect(harness.service.activate(reference)).resolves.toMatchObject({ status: "stale", committed: false });
  harness.service.dispose();
});

it("cancels committed presentation settlement and returns stale when eligibility changes after route commit", async () => {
  const published = searchable("published", "Published Journal Note");
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend([published.toJSON()]),
  });
  harness.service.registerDomain({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    destinationAppId: "com.syndromatic.journal",
    routeName: "journal.entry",
    resolve: ({ item }) => ({ pathname: `/journal?post=${encodeURIComponent(item.id)}` }),
  });
  harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: true });
  const reference = (await harness.service.queryEligible({ text: "Published" })).results[0]!.reference;

  let settle!: (value: { status: "cancelled"; reason: string; pendingRoles: string[] }) => void;
  const result = new Promise<{ status: "cancelled"; reason: string; pendingRoles: string[] }>((resolve) => { settle = resolve; });
  const cancel = vi.fn((reason = "cancelled") => settle({ status: "cancelled", reason, pendingRoles: ["content"] }));
  harness.presentationSettlements.get.mockReturnValueOnce({ id: "presentation-one", result, completeRole: vi.fn(), cancel } as any);

  const activation = harness.service.activate(reference);
  await vi.waitFor(() => expect(harness.presentationSettlements.get).toHaveBeenCalledWith("presentation-one"));
  harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: false });
  await expect(activation).resolves.toMatchObject({ status: "stale", committed: true });
  expect(cancel).toHaveBeenCalled();
  harness.service.dispose();
});

it("aborts an in-flight privileged query when the host service is disposed even with a caller signal", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const published = searchable("published", "Published Journal Note");
  const harness = createHarness({
    "com.syndromatic.publisher": new SnapshotBackend([published.toJSON()], () => gate),
  });
  harness.service.registerDomain({
    ownerAppId: "com.syndromatic.publisher",
    domain: "journal.entry",
    destinationAppId: "com.syndromatic.journal",
    routeName: "journal.entry",
    resolve: ({ item }) => ({ pathname: `/journal?post=${encodeURIComponent(item.id)}` }),
  });
  harness.service.setEligibility({ ownerAppId: "com.syndromatic.publisher", domain: "journal.entry", itemId: "published", revision: "r1", eligible: true });
  const caller = new AbortController();
  const pending = harness.service.queryEligible({ text: "Published" }, { signal: caller.signal });
  harness.service.dispose();
  release();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("integrates mounted app ownership, trusted donation, PolicyKit, RouteManager and presentation settlement in one runtime", async () => {
  const states = new Map<string, SharedBackendState>();
  const luminaIndex: LuminaIndexBackendFactory = {
    create(ownerKey) {
      let state = states.get(ownerKey);
      if (!state) {
        state = { items: new Map(), generation: 0, revision: 0 };
        states.set(ownerKey, state);
      }
      return new SharedBackend(state);
    },
  };
  const publisherBase = createTestBundle({ id: "lumina-real-publisher", route: "/lumina-real-publisher" });
  const publisher = Object.freeze({
    ...publisherBase,
    permissions: Object.freeze(["app.open.public", "lumina.index", "lumina.query"]),
    synWareManifest: Object.freeze({
      ...publisherBase.synWareManifest,
      permissions: Object.freeze(["app.open.public", "lumina.index", "lumina.query"]),
    }),
  });
  const reader = createTestBundle({ id: "lumina-real-reader", route: "/lumina-real-reader" });
  const environment = Object.freeze({ ...createTestRuntimeEnvironment(), luminaIndex });
  const runtime = createTestRuntime({
    environment,
    initialBundles: [publisher, reader],
    presentationRolesForRoute: () => ["content"],
    presentationTimeoutMs: 10_000,
  });
  runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
  const contribution = createSynCloudOSHostContribution("lumina-real", "tests/lumina-real", () => ({
    initialBundles: [publisher, reader],
    install(context) {
      context.policy.registerRoleCapabilities({
        roles: ["public", "betaTester", "employee"],
        capabilities: ["lumina.index", "lumina.query", "lumina.eligible-query"],
      });
      context.lumina.registerDomain({
        ownerAppId: "lumina-real-publisher",
        domain: "journal.entry",
        destinationAppId: "lumina-real-reader",
        routeName: "journal.entry",
        resolve: ({ item }) => ({ pathname: `/lumina-real-reader?item=${encodeURIComponent(item.id)}` }),
      });
    },
  }));
  const installation = await installTestHostContributions(runtime, [contribution]);
  const mounted = mountTestSynWareRuntime(runtime, "lumina-real-publisher");
  const index = createSynWareContextValue(mounted.runtime).lumina.createIndex();
  const readerMount = new AbortController();
  const releaseReaderMount = runtime.routes.mountedRoutes.attach("lumina-real-reader", {
    signal: readerMount.signal,
    loadAndRender: async () => undefined,
  });
  try {
    const item = searchable("real-entry", "Runtime Integrated Journal Note");
    await index.upsert(item, "runtime-real-upsert");
    installation.contexts[0]!.lumina.setEligibility({
      ownerAppId: "lumina-real-publisher",
      domain: "journal.entry",
      itemId: item.id,
      revision: item.revision,
      eligible: true,
    });
    const batch = await installation.contexts[0]!.lumina.queryEligible({ text: "Runtime Integrated" });
    expect(batch.results.map((entry) => entry.item.id)).toEqual(["real-entry"]);

    const activation = installation.contexts[0]!.lumina.activate(batch.results[0]!.reference);
    await vi.waitFor(() => expect(runtime.presentationSettlements.inspectPending()).toHaveLength(1));
    const pending = runtime.presentationSettlements.inspectPending()[0] as { id: string };
    expect(runtime.presentationSettlements.get(pending.id)?.completeRole("content")).toBe(true);
    await expect(activation).resolves.toMatchObject({
      status: "activated",
      committed: true,
      appId: "lumina-real-reader",
    });
    expect(runtime.store.getSnapshot().application.activeAppId).toBe("lumina-real-reader");
  } finally {
    releaseReaderMount();
    readerMount.abort();
    index.dispose();
    mounted.dispose("lumina integration test complete");
    await installation.cleanup();
    await runtime.dispose({ reason: "lumina integration test complete", inFlight: "cancel" });
  }
});
