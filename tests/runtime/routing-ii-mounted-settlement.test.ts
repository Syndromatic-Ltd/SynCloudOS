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
import { createMountedRouteParticipant } from "../../src/SynCloudOS/Routing/MountedRouteSettlement";
import { createAppRouteSession } from "../../src/SynCloudOS/Routing/AppRouteSession";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";

function fixture() {
  const graph = defineSynWareRoutes({ id: "settlement", routes: [{ name: "music", path: "", load: () => "data" }] }).bind("/music", "music");
  const route = graph.recognize("/music");
  if (route.kind !== "match") throw new Error("missing test route");
  const createServices = vi.fn(() => ({ resolve: <T,>() => null as T }));
  const clock = { setTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay), clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };
  const session = createAppRouteSession({ graph, getBundleGeneration: () => 1, getAuthorizationGeneration: () => 1,
    getSessionId: () => "mounted", createLoaderServices: createServices, routeDataTimeoutMs: 100, ...clock });
  const mount = new AbortController();
  const participant = createMountedRouteParticipant({ session, signal: mount.signal, ...clock });
  return { participant, session, mount, route, createServices };
}

describe("canonical mounted route settlement", () => {
  it("keeps the real operation pending until its terminal revision renders, and deduplicates reattachment", async () => {
    const { participant, session, route, createServices } = fixture();
    const request = { operationId: "route.open:actual", route, signal: new AbortController().signal };
    const done = vi.fn();
    const result = participant.loadAndRender(request).then(done);
    const duplicate = participant.loadAndRender(request);
    await vi.waitFor(() => expect(session.getSnapshot().status).toBe("ready"));
    expect(createServices).toHaveBeenCalledTimes(1);
    expect(createServices.mock.calls[0]?.[0]).toMatchObject({ operationId: "route.open:actual" });
    expect(done).not.toHaveBeenCalled();
    participant.acknowledge(session.getSnapshot().revision);
    await Promise.all([result, duplicate]);
    expect(done).toHaveBeenCalledOnce();
    session.dispose();
  });

  it("cancels render waiting on revocation without accepting a late acknowledgement", async () => {
    const { participant, session, mount, route } = fixture();
    const result = participant.loadAndRender({ operationId: "route.open:revoked", route, signal: new AbortController().signal });
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(session.getSnapshot().status).toBe("ready"));
    mount.abort();
    participant.acknowledge(session.getSnapshot().revision);
    await rejected;
    session.dispose();
  });
});
