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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { createTestRuntime } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose({ reason: "deadline test", inFlight: "cancel" }); });
function fixture() {
  let entered = false;
  const routes = defineSynWareRoutes({ id: "remote.notes", routes: [{ name: "notes", path: "", beforeEnter: () => { entered = true; return new Promise<void>(() => {}); } }] } as const);
  const definition = createSynWare({ manifest: { schemaVersion: 1, id: "notes", version: "1.0.0", title: "Notes", routes: [{ path: "/notes", primary: true }], permissions: ["app.open.public"] }, root: () => null, routes });
  const runtime = createTestRuntime({ initialBundles: [createSynWareBundle(definition)], lifecycleHookTimeoutMs: 100 });
  runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
  runtimes.push(runtime);
  return { runtime, entered: () => entered };
}
describe("canonical route deadline recovery", () => {
  it("captures a stalled app preparation without publishing its route", async () => {
    const { runtime } = fixture();
    const result = await runtime.routes.openRoute("/notes", { syncRoute: false }).result;
    expect(result).toMatchObject({ status: "failed", committed: false });
    expect(runtime.errors.getLatest()).toMatchObject({ code: "APP_NOT_RESPONDING", appId: "notes", context: { phase: "route-preparation", reason: "operation-timeout" } });
    expect(runtime.store.getSnapshot().application.routePath).toBe("/");
  });
  it("does not report user cancellation as an app timeout", async () => {
    const { runtime, entered } = fixture();
    const route = runtime.routes.openRoute("/notes", { syncRoute: false });
    await vi.waitFor(() => expect(entered()).toBe(true), { interval: 5 });
    route.cancel("user cancelled");
    expect(await route.result).toMatchObject({ status: "cancelled", committed: false });
    expect(runtime.errors.getHistory()).toEqual([]);
  });
});
