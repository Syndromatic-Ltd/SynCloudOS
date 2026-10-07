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
import { createSynWare } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";

const Root = () => null;

function musicGraph(lazy = vi.fn(async () => ({ component: Root }))) {
  return defineSynWareRoutes({
    id: "music.routes",
    routes: [{
      name: "music",
      path: "",
      component: Root,
      children: [
        { name: "music.home", path: "home", component: Root },
        {
          name: "music.artist",
          path: "artist/:artistId",
          lazy,
          children: [{
            name: "music.artist.album",
            path: "album/:albumId",
            component: Root,
          }],
        },
        { name: "music.album", path: "album/:albumId", component: Root },
        { name: "music.track", path: "track/:trackId", component: Root },
        { name: "music.static", path: "browse/featured", component: Root },
        { name: "music.dynamic", path: "browse/:genre", component: Root },
        { name: "music.splat", path: "files/*segments", component: Root },
      ],
    }],
  } as const);
}

describe("Routing II immutable route graph", () => {
  it("recognizes and generates full paths without loading route code", () => {
    const lazy = vi.fn(async () => ({ component: Root }));
    const graph = musicGraph(lazy).bind("/music");

    const match = graph.recognize("/music/artist/justice/album/cross");
    expect(match).toMatchObject({
      kind: "match",
      name: "music.artist.album",
      branch: ["music", "music.artist", "music.artist.album"],
      params: { artistId: "justice", albumId: "cross" },
      pathname: "/music/artist/justice/album/cross",
    });
    expect(graph.urlFor({
      name: "music.artist.album",
      params: { artistId: "justice", albumId: "cross" },
    })).toBe("/music/artist/justice/album/cross");
    expect(lazy).not.toHaveBeenCalled();
  });

  it("ranks static above dynamic above terminal splat independent of declaration order", () => {
    const graph = musicGraph().bind("/music");

    expect(graph.recognize("/music/browse/featured")).toMatchObject({ kind: "match", name: "music.static" });
    expect(graph.recognize("/music/browse/ambient")).toMatchObject({
      kind: "match",
      name: "music.dynamic",
      params: { genre: "ambient" },
    });
    expect(graph.recognize("/music/files/live/sets/2026")).toMatchObject({
      kind: "match",
      name: "music.splat",
      params: { segments: ["live", "sets", "2026"] },
    });
  });

  it("round-trips unicode and encoded percent literals exactly once", () => {
    const graph = musicGraph().bind("/music");
    const unicode = graph.urlFor({ name: "music.track", params: { trackId: "Déjà Vu %" } });
    expect(unicode).toBe("/music/track/D%C3%A9j%C3%A0%20Vu%20%25");
    expect(graph.recognize(unicode)).toMatchObject({
      kind: "match",
      name: "music.track",
      params: { trackId: "Déjà Vu %" },
    });
  });

  it("round-trips a valid reserved-looking named parameter without dropping it", () => {
    const graph = defineSynWareRoutes({
      id: "reserved-parameter",
      routes: [{ name: "entry", path: "entry/:__proto__", component: Root }],
    } as const).bind("/journal");
    const parameters = Object.fromEntries([["__proto__", "stable-post"]]);
    const pathname = graph.urlFor({ name: "entry", params: parameters });
    expect(pathname).toBe("/journal/entry/stable-post");
    const match = graph.recognize(pathname);
    expect(match).toMatchObject({ kind: "match", name: "entry" });
    if (match.kind !== "match") throw new Error("Expected named-route match.");
    expect(Object.hasOwn(match.params, "__proto__")).toBe(true);
    expect(match.params["__proto__"]).toBe("stable-post");
  });

  it.each([
    "/music/track/%",
    "/music/track/%2F",
    "/music/track/%5C",
    "/music/track/..",
    "/music/files/ok/%2Fescape",
  ])("rejects unsafe or malformed encoded path input: %s", (pathname) => {
    expect(musicGraph().bind("/music").recognize(pathname)).toMatchObject({ kind: "not-found" });
  });

  it("rejects ambiguous graph declarations before component evaluation", () => {
    expect(() => defineSynWareRoutes({
      id: "duplicate-names",
      routes: [
        { name: "same", path: "one", component: Root },
        { name: "same", path: "two", component: Root },
      ],
    })).toThrow(/duplicate route name/i);

    expect(() => defineSynWareRoutes({
      id: "equal-specificity",
      routes: [{
        name: "root",
        path: "",
        children: [
          { name: "root.a", path: "artist/:id", component: Root },
          { name: "root.b", path: "artist/:other", component: Root },
        ],
      }],
    })).toThrow(/ambiguous/i);

    expect(() => defineSynWareRoutes({
      id: "duplicate-param",
      routes: [{
        name: "root",
        path: ":id",
        children: [{ name: "root.child", path: "child/:id", component: Root }],
      }],
    })).toThrow(/parameter/i);
  });

  it("captures a graph in createSynWare and binds the manifest ownership base", () => {
    const routes = musicGraph();
    const definition = createSynWare({
      manifest: {
        schemaVersion: 1,
        id: "music-app",
        version: "1.0.0",
        title: "Music",
        routes: [{ path: "/music", primary: true, match: "prefix" }],
      },
      routes,
      root: Root,
    });

    expect(Object.isFrozen(definition.routes)).toBe(true);
    expect(definition.routes?.recognize("/music/album/cross")).toMatchObject({
      kind: "match",
      name: "music.album",
      params: { albumId: "cross" },
    });
  });

  it("synthesizes one immutable root for definitions without a graph", () => {
    const definition = createSynWare({
      manifest: {
        schemaVersion: 1,
        id: "graphless",
        version: "1.0.0",
        title: "Graphless",
        routes: [{ path: "/graphless", primary: true }],
      },
      root: Root,
    });

    expect(definition.routes?.recognize("/graphless")).toMatchObject({
      kind: "match",
      branch: ["graphless"],
      pathname: "/graphless",
    });
  });
});
