import { afterEach, expect, it, vi } from "vitest";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { routeQuery } from "../../src/SynCloudOS/Routing/routeQuery";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { installControllerServices, controllerServicesFor } from "../../src/SynCloudOS/AppSDK/controllerServices";
import { createTestRuntime, createTestRuntimeEnvironment, authoriseTestRuntime, registerTestSynWare, mountTestSynWareRuntime } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [], mounts: ReturnType<typeof mountTestSynWareRuntime>[] = [], releases: Array<() => void> = [];
afterEach(async () => {
  for (const release of releases.splice(0).reverse()) release();
  for (const mount of mounts.splice(0)) mount.dispose("route observation test complete");
  for (const runtime of runtimes.splice(0)) await runtime.dispose("route observation test complete");
  vi.restoreAllMocks();
});
async function fixture() {
  const appId = "com.example.route-observation";
  const graph = defineSynWareRoutes({ id: "reader", routes: [{ name: "reader", path: "", query: { post: routeQuery.string({ defaultValue: "" }) } }] } as const);
  const runtime = authoriseTestRuntime(createTestRuntime({ environment: createTestRuntimeEnvironment() })); runtimes.push(runtime);
  registerTestSynWare(runtime, { manifest: { schemaVersion: 1, bundleIdentifier: appId, version: "1.0.0", displayName: "Generated reader", routes: [{ path: "/observation", primary: true }] }, routes: graph, root: () => null });
  const loaded = await runtime.bundles.loadBundle(appId), mountedGraph = loaded.definition.routes!;
  const recognize = (post: string) => { const value = mountedGraph.recognize(post ? `/observation?post=${post}` : "/observation"); if (value.kind !== "match") throw new Error("Generated route missing"); return value; };
  let committed = recognize("");
  // Supply only committed route-owner facts. The store, readiness service,
  // native-activity owner and scoped production clients are real.
  vi.spyOn(runtime.routes.routeGraph, "current").mockImplementation(() => committed);
  const mounted = mountTestSynWareRuntime(runtime, appId); mounts.push(mounted);
  const context = createSynWareContextValue(mounted.runtime); installControllerServices(context, runtime);
  const routes = controllerServicesFor(context).routes, client = routes.state(graph, "reader");
  return { runtime, mounted, context, routes, client, commit(post: string) { committed = recognize(post); runtime.store.mutate(draft => { draft.application.routePath = `${committed.pathname}${committed.search}${committed.hash}`; }); } };
}

it("keeps route and query observers silent during real native/job readiness publications", async () => {
  const f = await fixture(), route = vi.fn(), query = vi.fn(), store = vi.fn();
  releases.push(f.routes.subscribe(route), f.client.subscribe(query), f.runtime.store.subscribe(store));
  const issued = f.client.getQuery(), readiness = f.runtime.updateReadiness.getSnapshot();
  let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; }); releases.push(finish);
  const pending = f.runtime.nativeActivity.track(() => gate);
  expect(f.runtime.updateReadiness.getSnapshot().counts.nativeOperations).toBe(1);
  expect(f.runtime.updateReadiness.getSnapshot()).not.toBe(readiness);
  const job = f.runtime.jobs.tryAdmit({ owner: "generated-reader", kind: "fixture" })!; releases.push(() => job.release());
  expect(f.runtime.updateReadiness.getSnapshot().counts.activeJobs).toBe(1);
  job.release(); finish(); await pending;
  expect(store).toHaveBeenCalled(); expect(f.runtime.updateReadiness.getSnapshot().counts).toMatchObject({ nativeOperations: 0, activeJobs: 0 });
  expect(f.client.getQuery()).toBe(issued); expect(route).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
});

it("notifies every subscriber once for a real committed route even when an earlier observer reads or publishes reentrantly", async () => {
  const f = await fixture(), raw = vi.fn(), queries: string[] = []; let nested = false;
  releases.push(f.routes.subscribe(() => {
    raw(f.client.getQuery().post);
    if (!nested) { nested = true; const job = f.runtime.jobs.tryAdmit({ owner: "route-observer", kind: "fixture" })!; job.release(); }
  }));
  releases.push(f.client.subscribe(() => queries.push(f.client.getQuery().post)));
  f.commit("first"); expect(raw).toHaveBeenCalledTimes(1); expect(queries).toEqual(["first"]);
  // A separately committed recognition of the same URL is a real revision,
  // unlike an unrelated store event. Do not deduplicate only by query values.
  f.commit("first"); expect(raw).toHaveBeenCalledTimes(2); expect(queries).toEqual(["first", "first"]);
  f.commit("second"); expect(raw).toHaveBeenCalledTimes(3); expect(queries).toEqual(["first", "first", "second"]);
});

it("releases route observers on unsubscribe or mount retirement and keeps departing query reads at their last issued value", async () => {
  const f = await fixture(), retired = vi.fn(), current = vi.fn();
  const stop = f.client.subscribe(retired); stop(); stop();
  const before = f.runtime.store.listenerCount(); f.client.subscribe(current);
  f.commit("first"); expect(retired).not.toHaveBeenCalled(); expect(current).toHaveBeenCalledOnce();
  const issued = f.client.getQuery(); f.mounted.dispose("generated mount replaced");
  expect(f.runtime.store.listenerCount()).toBeLessThanOrEqual(before);
  f.commit("second"); expect(current).toHaveBeenCalledOnce(); expect(f.client.getQuery()).toBe(issued);
  const late = vi.fn(); f.routes.subscribe(late); f.commit("third"); expect(late).not.toHaveBeenCalled();
});
