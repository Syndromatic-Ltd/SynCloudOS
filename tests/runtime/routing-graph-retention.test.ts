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

import { afterEach, describe, expect, it } from "vitest";
import { createSynWare, createSynWareBundle } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { createTestRuntime } from "./helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.dispose(); });

function graphBundle(id: string) {
  const routes = defineSynWareRoutes({ id: `retention.${id}`, routes: [{ name: id, path: "", children: [
    { name: `${id}.detail`, path: "detail/:itemId" },
  ] }] } as const);
  return createSynWareBundle(createSynWare({
    manifest: { schemaVersion: 1, id, version: "1.0.0", title: id, routes: [{ path: `/${id}`, primary: true, match: "prefix" }], permissions: ["app.open.public"] },
    root: () => null,
    routes,
  }));
}

describe("route graph ownership after unregister", () => {
  it("does not retain graph owners for applications that were unregistered", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    for (let cycle = 0; cycle < 12; cycle++) {
      const id = `retained-${cycle}`;
      runtime.apps.register(graphBundle(id));
      await runtime.bundles.loadBundle(id);
      await expect(runtime.routes.routeGraph.preload(id, `/${id}/detail/7`, new AbortController().signal))
        .resolves.toMatchObject({ status: "ready" });
      expect(runtime.routes.routeGraph.diagnostics().retainedApplications).toBeGreaterThanOrEqual(1);
      await runtime.apps.unregister(id);
    }
    expect(runtime.routes.routeGraph.diagnostics().retainedApplications).toBe(0);
  });

  it("keeps the graph of a registered application across repeated visits", async () => {
    const runtime = createTestRuntime();
    runtimes.push(runtime);
    runtime.store.mutate((draft) => { draft.loginServices.isAuthorised = true; });
    runtime.apps.register(graphBundle("kept"));
    await runtime.bundles.loadBundle("kept");
    for (let visit = 0; visit < 3; visit++)
      await runtime.routes.routeGraph.preload("kept", `/kept/detail/${visit}`, new AbortController().signal);
    expect(runtime.routes.routeGraph.diagnostics().retainedApplications).toBe(1);
  });
});
