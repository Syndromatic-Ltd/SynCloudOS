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
import { createAppRouteSession } from "../../src/SynCloudOS/Routing/AppRouteSession";
import {
  QueryValidationError,
  parseRouteQuery,
  routeQuery,
  serializeRouteQuery,
} from "../../src/SynCloudOS/Routing/routeQuery";

describe("Routing II typed query state", () => {
  it("serializes deterministically, prunes defaults, and preserves repeated-array order", () => {
    const schema = {
      sort: routeQuery.enum(["recent", "popular"] as const, { defaultValue: "recent" }),
      q: routeQuery.string({ defaultValue: "", alias: "query", maxLength: 40 }),
      page: routeQuery.integer({ defaultValue: 1, min: 1, max: 20 }),
      tags: routeQuery.array(routeQuery.string({ defaultValue: "", maxLength: 12 }), {
        defaultValue: [] as readonly string[],
        maxItems: 3,
      }),
    } as const;

    expect(serializeRouteQuery(schema, {
      sort: "recent",
      q: "justice",
      page: 2,
      tags: ["french", "house"],
    })).toBe("?page=2&query=justice&tags=french&tags=house");

    const parsed = parseRouteQuery(schema, "?tags=french&tags=house&page=2&query=justice");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected valid query");
    expect(parsed.value).toEqual({
      sort: "recent",
      q: "justice",
      page: 2,
      tags: ["french", "house"],
    });
  });

  it("rejects duplicate scalars and non-canonical numbers, integers and enums", () => {
    const schema = {
      page: routeQuery.integer({ defaultValue: 1, min: 1, max: 9 }),
      gain: routeQuery.number({ defaultValue: 1, min: 0, max: 2 }),
      view: routeQuery.enum(["art", "tracks"] as const, { defaultValue: "art" }),
      explicit: routeQuery.boolean({ defaultValue: false }),
    } as const;

    for (const input of [
      "?page=2&page=3",
      "?page=2x",
      "?page=1.5",
      "?gain=NaN",
      "?gain=Infinity",
      "?gain=3",
      "?view=grid",
      "?explicit=1",
    ]) {
      const parsed = parseRouteQuery(schema, input);
      expect(parsed.ok, input).toBe(false);
    }
  });

  it("enforces bounded arrays and custom codec round trips", () => {
    const schema = {
      ids: routeQuery.array(routeQuery.integer({ defaultValue: 0, min: 0, max: 99 }), {
        defaultValue: [] as readonly number[],
        maxItems: 2,
      }),
      mode: routeQuery.custom<Readonly<{ name: string }>>({
        id: "mode-name-v1",
        defaultValue: Object.freeze({ name: "default" }),
        parse(values) {
          if (values.length !== 1 || !values[0]?.startsWith("m:")) throw new TypeError("invalid-mode");
          return Object.freeze({ name: values[0].slice(2) });
        },
        serialize(value) {
          return [`m:${value.name}`];
        },
        equals(left, right) {
          return left.name === right.name;
        },
      }),
    } as const;

    expect(parseRouteQuery(schema, "?ids=1&ids=2").ok).toBe(true);
    expect(parseRouteQuery(schema, "?ids=1&ids=2&ids=3").ok).toBe(false);
    expect(serializeRouteQuery(schema, { ids: [2, 1], mode: { name: "vinyl" } }))
      .toBe("?ids=2&ids=1&mode=m%3Avinyl");
    const roundTrip = parseRouteQuery(schema, "?mode=m%3Avinyl");
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok) expect(roundTrip.value.mode).toEqual({ name: "vinyl" });
  });

  it("rejects active-branch alias collisions when the graph is declared", () => {
    expect(() => defineSynWareRoutes({
      id: "routing.query.alias",
      routes: [{
        name: "music",
        path: "",
        query: { search: routeQuery.string({ defaultValue: "", alias: "q" }) },
        children: [{
          name: "music.album",
          path: "album/:albumId",
          query: { queue: routeQuery.string({ defaultValue: "", alias: "q" }) },
        }],
      }],
    } as const)).toThrow(/query alias.*q.*collision/i);
  });

  it("recognizes typed query and hash, while invalid browser query stays local and typed", () => {
    const graph = defineSynWareRoutes({
      id: "routing.query.graph",
      routes: [{
        name: "music",
        path: "",
        children: [{
          name: "music.search",
          path: "search",
          query: {
            q: routeQuery.string({ defaultValue: "", maxLength: 20, refresh: "route" }),
            page: routeQuery.integer({ defaultValue: 1, min: 1, max: 10, refresh: "route" }),
          },
        }],
      }],
    } as const).bind("/music", "music");

    const valid = graph.recognize("/music/search?q=justice&page=2#tracks");
    expect(valid.kind).toBe("match");
    if (valid.kind !== "match") throw new Error("missing route");
    expect(valid.queryStatus).toBe("valid");
    expect(valid.query).toEqual({ q: "justice", page: 2 });
    expect(valid.hash).toBe("#tracks");
    expect(graph.urlFor({ name: "music.search", query: { q: "air", page: 1 }, hash: "albums" }))
      .toBe("/music/search?q=air#albums");

    const invalid = graph.recognize("/music/search?page=2x");
    expect(invalid.kind).toBe("match");
    if (invalid.kind !== "match") throw new Error("missing route");
    expect(invalid.queryStatus).toBe("invalid");
    expect(invalid.query).toEqual({});
    expect(invalid.queryIssues?.[0]?.key).toBe("page");

    expect(() => graph.urlFor({ name: "music.search", query: { q: "air", page: 99 } }))
      .toThrow(QueryValidationError);
  });

  it("refreshes only query-dependent loaders without replacing the route session", async () => {
    const load = vi.fn(({ query }: { query: Readonly<Record<string, unknown>> }) => query.q);
    const graph = defineSynWareRoutes({
      id: "routing.query.session",
      routes: [{
        name: "music",
        path: "",
        children: [{
          name: "music.search",
          path: "search",
          query: {
            q: routeQuery.string({ defaultValue: "", refresh: "route" }),
            sort: routeQuery.enum(["recent", "popular"] as const, { defaultValue: "recent", refresh: "none" }),
          },
          load,
        }],
      }],
    } as const).bind("/music", "music");
    const session = createAppRouteSession({
      graph,
      getBundleGeneration: () => 1,
      getAuthorizationGeneration: () => 1,
      getSessionId: () => "session:music",
      createLoaderServices: () => Object.freeze({ resolve: () => null }),
      routeDataTimeoutMs: 100,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });

    const justice = graph.recognize("/music/search?q=justice&sort=recent");
    const justicePopular = graph.recognize("/music/search?q=justice&sort=popular");
    const air = graph.recognize("/music/search?q=air&sort=popular");
    if (justice.kind !== "match" || justicePopular.kind !== "match" || air.kind !== "match") throw new Error("fixture route missing");

    await session.commit(justice, { operationId: "query:justice" });
    await session.commit(justicePopular, { operationId: "query:sort" });
    await session.commit(air, { operationId: "query:air" });

    expect(load).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().route?.query).toEqual({ q: "air", sort: "popular" });
  });

  it("publishes invalid typed browser query locally without starting route data", async () => {
    const load = vi.fn(async () => "should-not-load");
    const graph = defineSynWareRoutes({
      id: "routing.query.invalid-session",
      routes: [{
        name: "music",
        path: "",
        query: { page: routeQuery.integer({ defaultValue: 1, min: 1, max: 5 }) },
        load,
      }],
    } as const).bind("/music", "music");
    const route = graph.recognize("/music?page=2x");
    if (route.kind !== "match") throw new Error("fixture route missing");
    const session = createAppRouteSession({
      graph,
      getBundleGeneration: () => 1,
      getAuthorizationGeneration: () => 1,
      getSessionId: () => "session:music",
      createLoaderServices: () => Object.freeze({ resolve: () => null }),
      routeDataTimeoutMs: 100,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });

    await expect(session.commit(route, { operationId: "query:invalid" }))
      .resolves.toMatchObject({ status: "error", code: "route-invalid-query", committed: true });
    expect(load).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ status: "error" });
  });
});
