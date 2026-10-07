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
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import { createMountedSynWareRouteState } from "../../src/SynCloudOS/AppSDK/hooks/useSynWareRouteState";
import type { SynWareRouter } from "../../src/SynCloudOS/AppSDK/hooks/useSynWareRouter";
import { QueryValidationError, routeQuery } from "../../src/SynCloudOS/Routing/routeQuery";

function fixture(href = "/library/item/air?q=old&page=3&tab=details#selection") {
  const graph = defineSynWareRoutes({ id: "query.client", routes: [{ name: "library", path: "",
    query: { q: routeQuery.string({ defaultValue: "" }), page: routeQuery.integer({ defaultValue: 1 }) },
    children: [{ name: "library.item", path: "item/:id", query: { tab: routeQuery.enum(["summary", "details"] as const, { defaultValue: "summary" }) } }],
  }] } as const).bind("/library", "library");
  const recognition = graph.recognize(href);
  if (recognition.kind !== "match") throw new Error("fixture route missing");
  const transitionTo = vi.fn();
  const replaceWith = vi.fn();
  const router = { getSnapshot: () => ({ revision: 1, status: "ready", route: recognition }),
    urlFor: graph.urlFor, transitionTo, replaceWith, subscribe: vi.fn(() => () => undefined),
  } as unknown as SynWareRouter<typeof graph.routes>;
  const absolute = vi.fn((path: string) => new URL(path, "https://library.example").href);
  return { client: createMountedSynWareRouteState(graph, "library", router, absolute), transitionTo, replaceWith, absolute };
}

describe("mounted named-route query projection", () => {
  it("replaces its complete query scope while preserving descendant state and fragment", () => {
    const { client, transitionTo, replaceWith } = fixture();
    expect(client.getQuery()).toEqual({ q: "old", page: 3 });
    expect(client.getQuery()).toBe(client.getQuery());
    client.pushQuery({ q: "new" });
    expect(transitionTo).toHaveBeenCalledWith({ name: "library.item", params: { id: "air" }, query: { q: "new", tab: "details" }, hash: "#selection" });
    client.replaceQuery({});
    expect(replaceWith).toHaveBeenCalledWith({ name: "library.item", params: { id: "air" }, query: { tab: "details" }, hash: "#selection" });
  });

  it("generates a canonical named URL through the host absolute-origin projection", () => {
    const { client, absolute } = fixture();
    expect(client.createUrl({ q: "Air & Sea" })).toBe("https://library.example/library/item/air?q=Air+%26+Sea&tab=details#selection");
    expect(absolute).toHaveBeenCalledWith("/library/item/air?q=Air+%26+Sea&tab=details#selection");
    expect(() => client.createUrl({ foreign: "value" } as never)).toThrow(/Unknown query key/);
  });

  it("does not cache an invalid query as a successful default snapshot", () => {
    const { client } = fixture("/library/item/air?page=bad");
    expect(() => client.getQuery()).toThrow(QueryValidationError);
    expect(() => client.getQuery()).toThrow(QueryValidationError);
  });
});
