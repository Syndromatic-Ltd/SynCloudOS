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

// @vitest-environment jsdom

import React, { StrictMode, useEffect, useLayoutEffect } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostSiteBrandingProvider } from "../../src/SynCloudOSReact";
import { SynWareRuntimeMount } from "../../src/SynCloudOS/AppSDK/SynWareRuntimeMount";
import { createSynWare } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { defineSynWareRoutes } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import {
  RouteOutlet,
  SynWareRouteSessionProvider,
  useRoutePresentation,
} from "../../src/SynCloudOS/AppSDK/RouteOutlet";
import { useRouteData } from "../../src/SynCloudOS/AppSDK/hooks/useRouteData";
import { createAppRouteSession } from "../../src/SynCloudOS/Routing/AppRouteSession";
import { createRouteModuleLoader } from "../../src/SynCloudOS/Routing/RouteModuleLoader";
import { getRuntimeSettlement } from "../../src/SynCloudOS/Testing/runtimeSettlement";
import type { SynWareRouteLazyModule } from "../../src/SynCloudOS/Routing/appRouteTypes";
import { createTestRuntime, registerTestSynWare } from "./helpers";

const dataProbeGraph = defineSynWareRoutes({ id: "route-data-types", routes: [{ name: "com.example.music", path: "" }] });
// Compile-only public inference probes; executed by the focused TypeScript check.
function useRouteDataTypeProbe() {
  const node = useRouteData(dataProbeGraph, "com.example.music");
  // @ts-expect-error A data view is bound to names declared by its graph.
  useRouteData(dataProbeGraph, "foreign");
  if (node?.state === "loading") {
    // @ts-expect-error Loading is not fabricated ready data.
    node.data;
  }
  if (node?.state === "ready") {
    // @ts-expect-error Loader data still requires domain narrowing.
    const data: string = node.data;
    return data;
  }
}

const routeSessions: ReturnType<typeof createAppRouteSession>[] = [];
afterEach(async () => {
  cleanup();
  for (const session of routeSessions.splice(0)) await session.disposeAsync();
  document.body.innerHTML = "";
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fixture(options: {
  artistLoad?: () => unknown | Promise<unknown>;
  albumLoad?: (albumId: string) => unknown | Promise<unknown>;
  albumThrowsRender?: boolean;
  asynchronousModules?: boolean;
  albumBoundary?: boolean;
  artistError?: boolean;
  artistErrorThrows?: boolean;
  albumLazy?: () => Promise<SynWareRouteLazyModule>;
  albumDeactivate?: () => Promise<void>;
} = {}) {
  const playerMount = vi.fn();
  const artistMount = vi.fn();
  const albumMount = vi.fn();
  const artistErrorRender = vi.fn();
  const Music = () => {
    useEffect(() => { playerMount(); }, []);
    return <section data-testid="player">Player<RouteOutlet /></section>;
  };
  const Artist = () => {
    useEffect(() => { artistMount(); }, []);
    const node = useRouteData(routeGraph, "music.artist.album");
    return <section data-testid="artist">Artist<output data-testid="album-state">{node?.state ?? "absent"}</output><RouteOutlet /></section>;
  };
  const Album = ({ routeData }: { routeData?: unknown }) => {
    useEffect(() => { albumMount(); }, []);
    if (options.albumThrowsRender) throw new Error("album-render-failed");
    return <div data-testid="album">{routeData && typeof routeData === "object" && "title" in routeData ? String(routeData.title) : String(routeData)}</div>;
  };
  const ArtistLoading = () => <div data-testid="artist-loading" aria-busy="true">Loading artist</div>;
  const AlbumLoading = () => <div data-testid="album-loading" aria-busy="true">Loading album</div>;
  const AlbumError = ({ error, retry }: { error: unknown; retry(): void }) => (
    <div role="alert">
      {error instanceof Error ? error.message : String(error)}
      <button onClick={retry}>Retry album</button>
    </div>
  );
  const ParentError = ({ error, retry }: { error: unknown; retry(): void }) => (
    <div data-testid="parent-error" role="alert">{error instanceof Error ? error.message : String(error)}<button onClick={retry}>Retry parent</button></div>
  );
  const ArtistError = ({ error, retry }: { error: unknown; retry(): void }) => {
    artistErrorRender();
    if (options.artistErrorThrows) throw new Error("artist-boundary-render-failed");
    return <div data-testid="artist-error" role="alert">{error instanceof Error ? error.message : String(error)}<button onClick={retry}>Retry artist</button></div>;
  };
  const routeGraph = defineSynWareRoutes({
    id: "routing.outlets",
    routes: [{
      name: "com.example.music",
      path: "",
      component: Music,
      errorComponent: ParentError,
      children: [{
        name: "music.artist",
        path: "artist/:artistId",
        component: Artist,
        loadingComponent: ArtistLoading,
        errorComponent: options.artistError ? ArtistError : undefined,
        load: options.artistLoad ? () => options.artistLoad!() : async () => "artist-ready",
        children: [{
          name: "music.artist.album",
          path: "album/:albumId",
          component: options.albumLazy ? undefined : Album,
          lazy: options.albumLazy,
          deactivate: options.albumDeactivate,
          loadingComponent: options.albumBoundary === false ? undefined : AlbumLoading,
          errorComponent: options.albumThrowsRender || options.albumBoundary === false ? undefined : AlbumError,
          load: ({ params }) => options.albumLoad
            ? options.albumLoad(params.albumId as string)
            : Promise.resolve(`album:${String(params.albumId)}`),
        }],
      }],
    }],
  } as const).bind("/music", "com.example.music");
  const modules = createRouteModuleLoader({ getBundleGeneration: () => 1 });
  const session = createAppRouteSession({
    graph: routeGraph,
    getBundleGeneration: () => 1,
    getAuthorizationGeneration: () => 1,
    getSessionId: () => "session:music",
    createLoaderServices: () => Object.freeze({
      require() { throw new Error("Undeclared test service."); },
      optional() { throw new Error("Undeclared test service."); },
    }),
    ...(options.asynchronousModules || options.albumLazy ? { resolveRouteDefinition: (definition: Parameters<NonNullable<Parameters<typeof createAppRouteSession>[0]["resolveRouteDefinition"]>>[0], signal: AbortSignal) => modules.resolveDefinition(definition, { signal }) } : {}),
    routeDataTimeoutMs: 500,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  routeSessions.push(session);
  return { routeGraph, session, playerMount, artistMount, albumMount, artistErrorRender };
}

describe("Routing II React outlets", () => {
  it("uses the nearest ancestor loading view in the child outlet without remounting committed parents", async () => {
    const nextAlbum = deferred<string>();
    const { routeGraph, session, playerMount, artistMount } = fixture({ albumBoundary: false, albumLoad: id => id === "next" ? nextAlbum.promise : "first" });
    const first = routeGraph.recognize("/music/artist/air/album/first");
    const next = routeGraph.recognize("/music/artist/air/album/next");
    if (first.kind !== "match" || next.kind !== "match") throw new Error("fixture route missing");
    await session.commit(first, { operationId: "first" });
    const acknowledge = vi.fn();
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session} onRenderRevision={acknowledge}><RouteOutlet /></SynWareRouteSessionProvider>);
    const player = screen.getByTestId("player");
    const artist = screen.getByTestId("artist");
    acknowledge.mockClear();
    let pending!: ReturnType<typeof session.commit>;
    await act(async () => { pending = session.commit(next, { operationId: "next" }); await Promise.resolve(); });
    expect(screen.getByTestId("artist-loading").closest('[data-testid="artist"]')).toBe(artist);
    expect(screen.getByTestId("album-state").textContent).toBe("loading");
    expect(acknowledge).not.toHaveBeenCalled();
    await act(async () => { nextAlbum.resolve("second"); await pending; });
    expect(screen.getByTestId("player")).toBe(player);
    expect(screen.getByTestId("artist")).toBe(artist);
    expect(playerMount).toHaveBeenCalledTimes(1);
    expect(artistMount).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith(session.getSnapshot().revision);
    session.dispose();
  });

  it("inherits loading presentation while a real lazy route module is pending", async () => {
    const chunk = deferred<SynWareRouteLazyModule>();
    const { routeGraph, session } = fixture({ albumBoundary: false, albumLazy: () => chunk.promise });
    const target = routeGraph.recognize("/music/artist/air/album/lazy");
    if (target.kind !== "match") throw new Error("fixture route missing");
    let pending!: ReturnType<typeof session.commit>;
    await act(async () => { pending = session.commit(target, { operationId: "lazy" }); await Promise.resolve(); });
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session}><RouteOutlet /></SynWareRouteSessionProvider>);
    expect(await screen.findByTestId("artist-loading")).not.toBeNull();
    await act(async () => { chunk.resolve({ component: () => <div data-testid="lazy-ready">Imported child</div> }); await pending; });
    expect(screen.getByTestId("lazy-ready").textContent).toBe("Imported child");
    session.dispose();
  });

  it("presents pending child data while the previous route's bounded cleanup is still running", async () => {
    const cleanup = deferred<void>();
    const { routeGraph, session } = fixture({ albumBoundary: false, albumDeactivate: () => cleanup.promise });
    const first = routeGraph.recognize("/music/artist/air/album/first");
    const next = routeGraph.recognize("/music/artist/air/album/next");
    if (first.kind !== "match" || next.kind !== "match") throw new Error("fixture route missing");
    await session.commit(first, { operationId: "first" });
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session}><RouteOutlet /></SynWareRouteSessionProvider>);
    let pending!: ReturnType<typeof session.commit>;
    await act(async () => { pending = session.commit(next, { operationId: "next" }); await Promise.resolve(); });
    try {
      expect(screen.getByTestId("album-state").textContent).toBe("loading");
      expect(screen.getByTestId("artist-loading")).not.toBeNull();
    } finally {
      await act(async () => { cleanup.resolve(); await pending; });
    }
  });

  it("retains prior child data until replacement is ready (session integration gap)", async () => {
    const nextAlbum = deferred<string>();
    const dispose = vi.fn();
    const { routeGraph, session } = fixture({ albumLoad: id => id === "next" ? nextAlbum.promise : { title: "first", dispose } });
    const first = routeGraph.recognize("/music/artist/air/album/first");
    const next = routeGraph.recognize("/music/artist/air/album/next");
    if (first.kind !== "match" || next.kind !== "match") throw new Error("fixture route missing");
    await session.commit(first, { operationId: "first" });
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session}><RouteOutlet /></SynWareRouteSessionProvider>);
    let pending!: ReturnType<typeof session.commit>;
    await act(async () => { pending = session.commit(next, { operationId: "next" }); await Promise.resolve(); });
    try {
      expect(dispose).not.toHaveBeenCalled();
      expect(screen.getByTestId("album").textContent).toBe("first");
    } finally {
      await act(async () => { nextAlbum.resolve("second"); await pending; });
    }
  });

  it("does not acknowledge a terminal snapshot superseded during the React commit", async () => {
    const album = deferred<string>();
    const { routeGraph, session } = fixture({ albumLoad: id => id === "next" ? album.promise : "first" });
    const first = routeGraph.recognize("/music/artist/air/album/first");
    const next = routeGraph.recognize("/music/artist/air/album/next");
    if (first.kind !== "match" || next.kind !== "match") throw new Error("fixture route missing");
    await session.commit(first, { operationId: "first" });
    const oldRevision = session.getSnapshot().revision;
    const nextRoute = next;
    const acknowledge = vi.fn();
    let pending!: ReturnType<typeof session.commit>;
    function SupersedeOnCommit() {
      useLayoutEffect(() => { pending = session.commit(nextRoute, { operationId: "newer" }); }, []);
      return <RouteOutlet />;
    }
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session} onRenderRevision={acknowledge}><SupersedeOnCommit /></SynWareRouteSessionProvider>);
    expect(acknowledge).not.toHaveBeenCalledWith(oldRevision);
    await act(async () => { album.resolve("next"); await pending; });
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith(session.getSnapshot().revision);
    session.dispose();
  });

  it("acknowledges a replacement session even when its revision restarts at one", async () => {
    const first = fixture();
    const next = fixture();
    const firstTarget = first.routeGraph.recognize("/music/artist/air/album/cross");
    const nextTarget = next.routeGraph.recognize("/music/artist/air/album/cross");
    if (firstTarget.kind !== "match" || nextTarget.kind !== "match") throw new Error("fixture route missing");
    await first.session.commit(firstTarget, { operationId: "first" });
    await first.session.commit(firstTarget, { operationId: "second" });
    await next.session.commit(nextTarget, { operationId: "new-session" });
    const acknowledge = vi.fn();
    const view = render(<SynWareRouteSessionProvider graph={first.routeGraph} session={first.session} onRenderRevision={acknowledge}><RouteOutlet /></SynWareRouteSessionProvider>);
    acknowledge.mockClear();
    view.rerender(<SynWareRouteSessionProvider graph={next.routeGraph} session={next.session} onRenderRevision={acknowledge}><RouteOutlet /></SynWareRouteSessionProvider>);
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith(next.session.getSnapshot().revision);
  });

  it.each(["loader", "lazy-import", "lazy-render"] as const)("inherits the nearest error view for a %s failure and routes retry through the host", async failure => {
    const childError = new Error(`child-${failure}-failed`);
    const { routeGraph, session, playerMount, artistMount } = fixture({
      albumBoundary: false,
      artistError: true,
      albumLoad: failure === "loader" ? async () => { throw childError; } : undefined,
      albumLazy: failure === "lazy-import" ? async () => { throw childError; }
        : failure === "lazy-render" ? async () => ({ component() { throw childError; } }) : undefined,
    });
    const target = routeGraph.recognize("/music/artist/air/album/cross");
    if (target.kind !== "match") throw new Error("fixture route missing");
    await session.commit(target, { operationId: `error:${failure}` });
    const retry = vi.fn();
    const sessionRetry = vi.fn(session.retry);
    const observedSession = { ...session, retry: sessionRetry };
    const report = vi.fn();
    const acknowledge = vi.fn(revision => {
      expect(screen.getByTestId("artist-error").textContent).toContain(childError.message);
      expect(revision).toBe(session.getSnapshot().revision);
      if (failure === "lazy-render") expect(report).toHaveBeenCalledWith(revision, childError);
    });
    render(<SynWareRouteSessionProvider graph={routeGraph} session={observedSession} retry={retry} onRenderRevision={acknowledge} onRenderError={report}><RouteOutlet /></SynWareRouteSessionProvider>);
    expect(screen.getByTestId("artist-error").textContent).toContain(childError.message);
    expect(screen.getByTestId("artist")).not.toBeNull();
    expect(screen.getByTestId("player")).not.toBeNull();
    expect(playerMount).toHaveBeenCalledTimes(1);
    expect(artistMount).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("parent-error")).toBeNull();
    expect(acknowledge).toHaveBeenCalledTimes(1);
    if (failure !== "lazy-render") expect(report).not.toHaveBeenCalled();
    await act(async () => screen.getByRole("button", { name: "Retry artist" }).click());
    expect(retry).toHaveBeenCalledTimes(1);
    expect(sessionRetry).not.toHaveBeenCalled();
    session.dispose();
  });

  it("bubbles a failing inherited error presentation past its declaring route", async () => {
    const { routeGraph, session } = fixture({ albumBoundary: false, artistError: true, artistErrorThrows: true, albumLoad: async () => { throw new Error("loader-failed"); } });
    const route = routeGraph.recognize("/music/artist/air/album/cross");
    if (route.kind !== "match") throw new Error("fixture route missing");
    await session.commit(route, { operationId: "fallback-failed" });
    const report = vi.fn();
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session} onRenderError={report}><RouteOutlet /></SynWareRouteSessionProvider>);
    expect(screen.getByTestId("parent-error").textContent).toContain("artist-boundary-render-failed");
    expect(screen.getByTestId("player")).not.toBeNull();
    expect(report).toHaveBeenCalledWith(session.getSnapshot().revision, expect.objectContaining({ message: "artist-boundary-render-failed" }));
    session.dispose();
  });

  it("remounts only the route whose relevant parameters change", async () => {
    const { routeGraph, session, playerMount, artistMount } = fixture();
    const air = routeGraph.recognize("/music/artist/air/album/cross");
    const justice = routeGraph.recognize("/music/artist/justice/album/cross");
    if (air.kind !== "match" || justice.kind !== "match") throw new Error("fixture route missing");
    await session.commit(air, { operationId: "air" });
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session}><RouteOutlet /></SynWareRouteSessionProvider>);
    await act(async () => { await session.commit(justice, { operationId: "justice" }); });
    expect(playerMount).toHaveBeenCalledTimes(1);
    expect(artistMount).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("preserves the private absolute URL projection through outlet presentation", async () => {
    const { routeGraph, session } = fixture();
    const route = routeGraph.recognize("/music");
    if (route.kind !== "match") throw new Error("fixture route missing");
    await session.commit(route, { operationId: "absolute-url" });
    const Url = () => <output data-testid="absolute">{useRoutePresentation().absoluteUrl?.("/music#player")}</output>;
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session} absoluteUrl={href => `https://music.example${href}`}><Url /><RouteOutlet /></SynWareRouteSessionProvider>);
    expect(screen.getByTestId("absolute").textContent).toBe("https://music.example/music#player");
    session.dispose();
  });

  it("retains already loaded parent identity while the next child is genuinely pending", async () => {
    const nextAlbum = deferred<string>();
    const { routeGraph, session, playerMount, artistMount } = fixture({ asynchronousModules: true, albumLoad: id => id === "next" ? nextAlbum.promise : "first" });
    const first = routeGraph.recognize("/music/artist/air/album/first");
    const next = routeGraph.recognize("/music/artist/air/album/next");
    if (first.kind !== "match" || next.kind !== "match") throw new Error("fixture missing");
    await session.commit(first, { operationId: "first" });
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session}><RouteOutlet /></SynWareRouteSessionProvider>);
    let pending!: Promise<unknown>;
    await act(async () => { pending = session.commit(next, { operationId: "next" }); await Promise.resolve(); });
    expect(screen.getByTestId("player")).not.toBeNull();
    expect(screen.getByTestId("artist")).not.toBeNull();
    expect(screen.getByTestId("album-loading")).not.toBeNull();
    expect(playerMount).toHaveBeenCalledTimes(1);
    expect(artistMount).toHaveBeenCalledTimes(1);
    await act(async () => { nextAlbum.resolve("second"); await pending; });
    expect(playerMount).toHaveBeenCalledTimes(1);
    expect(artistMount).toHaveBeenCalledTimes(1);
  });

  it("keeps parent route components mounted across child moves", async () => {
    const { routeGraph, session, playerMount, artistMount } = fixture();
    const cross = routeGraph.recognize("/music/artist/justice/album/cross");
    const discovery = routeGraph.recognize("/music/artist/justice/album/discovery");
    if (cross.kind !== "match" || discovery.kind !== "match") throw new Error("fixture route missing");
    await session.commit(cross, { operationId: "op:cross" });
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session}><RouteOutlet /></SynWareRouteSessionProvider>);
    expect(screen.getByTestId("album").textContent).toContain("album:cross");
    expect(playerMount).toHaveBeenCalledTimes(1);
    expect(artistMount).toHaveBeenCalledTimes(1);

    await act(async () => {
      await session.commit(discovery, { operationId: "op:discovery" });
    });
    expect(screen.getByTestId("album").textContent).toContain("album:discovery");
    expect(playerMount).toHaveBeenCalledTimes(1);
    expect(artistMount).toHaveBeenCalledTimes(1);
  });

  it("progresses from parent loading to child loading without stealing focus", async () => {
    const artist = deferred<string>();
    const album = deferred<string>();
    const { routeGraph, session } = fixture({
      artistLoad: () => artist.promise,
      albumLoad: () => album.promise,
    });
    const target = routeGraph.recognize("/music/artist/justice/album/cross");
    if (target.kind !== "match") throw new Error("fixture route missing");
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const load = session.commit(target, { operationId: "op:loading" });
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session}><RouteOutlet /></SynWareRouteSessionProvider>);
    expect(screen.getByTestId("artist-loading")).not.toBeNull();
    expect(document.activeElement).toBe(input);

    await act(async () => { artist.resolve("artist-ready"); await Promise.resolve(); });
    expect(screen.getByTestId("album-loading")).not.toBeNull();
    expect(document.activeElement).toBe(input);

    await act(async () => { album.resolve("album-ready"); await load; });
    expect(screen.getByTestId("album").textContent).toContain("album-ready");
    input.remove();
  });

  it("keeps committed parents alive when a child loader fails and exposes an accessible retry", async () => {
    let fail = true;
    const { routeGraph, session } = fixture({
      albumLoad: async (albumId) => {
        if (fail) throw new Error("album-load-failed");
        return `album:${albumId}`;
      },
    });
    const target = routeGraph.recognize("/music/artist/justice/album/cross");
    if (target.kind !== "match") throw new Error("fixture route missing");
    await session.commit(target, { operationId: "op:error" });
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session}><RouteOutlet /></SynWareRouteSessionProvider>);
    expect(screen.getByTestId("player")).not.toBeNull();
    expect(screen.getByTestId("artist")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("album-load-failed");

    fail = false;
    await act(async () => {
      screen.getByRole("button", { name: "Retry album" }).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect((await screen.findByTestId("album")).textContent).toContain("album:cross");
  });

  it("bubbles a render exception to the nearest ancestor error boundary", async () => {
    const { routeGraph, session } = fixture({ albumThrowsRender: true });
    const target = routeGraph.recognize("/music/artist/justice/album/cross");
    if (target.kind !== "match") throw new Error("fixture route missing");
    await session.commit(target, { operationId: "op:render-error" });
    render(<SynWareRouteSessionProvider graph={routeGraph} session={session}><RouteOutlet /></SynWareRouteSessionProvider>);
    expect(screen.getByTestId("parent-error").textContent).toContain("album-render-failed");
  });

  it("acknowledges each render revision once under StrictMode", async () => {
    const acknowledge = vi.fn();
    const { routeGraph, session } = fixture();
    const target = routeGraph.recognize("/music/artist/justice/album/cross");
    if (target.kind !== "match") throw new Error("fixture route missing");
    await session.commit(target, { operationId: "op:strict" });

    render(
      <StrictMode>
        <SynWareRouteSessionProvider graph={routeGraph} session={session} onRenderRevision={acknowledge}>
          <RouteOutlet />
        </SynWareRouteSessionProvider>
      </StrictMode>,
    );
    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith(session.getSnapshot().revision);
  });

  it("mounts the production SynWare route session around host-rendered app content", async () => {
    const runtime = createTestRuntime({ id: "runtime:routing-ii-mounted-outlet" });
    const priorHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const graph = defineSynWareRoutes({
      id: "routing.mounted.outlet",
      routes: [{
        name: "com.example.music",
        path: "",
        children: [{
          name: "music.artist",
          path: "artist/:artistId",
          component: ({ route }) => <div data-testid="mounted-route">Artist {String(route.params.artistId)}</div>,
        }],
      }],
    } as const);
    const definition = createSynWare({
      manifest: {
        schemaVersion: 1,
        bundleIdentifier: "com.example.music",
        version: "1.0.0",
        displayName: "Music",
        routes: [{ path: "/music", match: "prefix", primary: true }],
      },
      root: () => <RouteOutlet />,
      routes: graph,
    });
    const app = registerTestSynWare(runtime, definition);
    window.history.replaceState({}, "", "/music/artist/air");
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
    await expect(runtime.routes.openRoute("/music/artist/air").result).resolves.toMatchObject({ status: "completed", committed: true });
    const branding = Object.freeze({
      name: "Routing test host",
      logoAlt: "",
      logoUrl: null,
      lightLogoUrl: null,
      darkLogoUrl: null,
      compactLogoUrl: null,
    });

    const view = render(
      <HostSiteBrandingProvider value={branding}>
        <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:com.example.music">
          <RouteOutlet />
        </SynWareRuntimeMount>
      </HostSiteBrandingProvider>,
    );

    expect((await screen.findByTestId("mounted-route")).textContent).toContain("Artist air");
    view.unmount();
    await runtime.dispose("routing-ii-mounted-outlet-complete");
    window.history.replaceState({}, "", priorHref);
  });

  it("keeps runtime settlement pending for real mounted route cleanup after unmount", async () => {
    const runtime = createTestRuntime({ id: "runtime:routing-ii-mounted-cleanup" });
    const priorHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const cleaning = deferred<void>();
    const cleanupGate = deferred<void>();
    const dispose = vi.fn(() => { cleaning.resolve(); return cleanupGate.promise; });
    const graph = defineSynWareRoutes({ id: "routing.mounted.cleanup", routes: [{
      name: "com.example.music",
      path: "",
      load: () => ({ dispose }),
      component: () => <div data-testid="mounted-cleanup-route">Mounted cleanup route</div>,
    }] });
    const definition = createSynWare({
      manifest: { schemaVersion: 1, bundleIdentifier: "com.example.music", version: "1.0.0", displayName: "Music",
        routes: [{ path: "/music", match: "prefix", primary: true }] },
      root: () => <RouteOutlet />,
      routes: graph,
    });
    const app = registerTestSynWare(runtime, definition);
    window.history.replaceState({}, "", "/music");
    runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
    const registry = getRuntimeSettlement(runtime);
    let view: ReturnType<typeof render> | undefined;
    try {
      await expect(runtime.routes.openRoute("/music").result).resolves.toMatchObject({ status: "completed", committed: true });
      view = render(
        <HostSiteBrandingProvider value={{ name: "Routing cleanup host", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null }}>
          <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:com.example.music"><RouteOutlet /></SynWareRuntimeMount>
        </HostSiteBrandingProvider>,
      );
      expect(await screen.findByTestId("mounted-cleanup-route")).not.toBeNull();
      view.unmount(); view = undefined;
      await cleaning.promise;
      expect(dispose).toHaveBeenCalledOnce();
      expect(registry.getState().pending).toEqual(expect.arrayContaining([
        expect.objectContaining({ owner: "route-session", kind: "cleanup", label: "com.example.music" }),
      ]));
      let settled = false;
      const receipt = registry.settled({ timeoutMs: 1000 }).then(result => { settled = true; return result; });
      for (let turn = 0; turn < 20; turn++) await Promise.resolve();
      expect(settled).toBe(false);
      cleanupGate.resolve();
      await expect(receipt).resolves.toMatchObject({ status: "settled" });
    } finally {
      view?.unmount();
      cleanupGate.resolve();
      await runtime.dispose("routing-ii-mounted-cleanup-complete");
      window.history.replaceState({}, "", priorHref);
    }
  });

  it("retries an inherited child error through the mounted host operation and rechecks parent guards", async () => {
    const runtime = createTestRuntime({ id: "runtime:routing-ii-outlet-retry" });
    const priorHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    let view: ReturnType<typeof render> | undefined;
    let blocked = false;
    let failed = true;
    const parentGuard = vi.fn(() => blocked ? { outcome: "block", reason: "locked" } as const : { outcome: "allow" } as const);
    const childLoad = vi.fn(() => { if (failed) throw new Error("album unavailable"); return "album restored"; });
    const mounts = vi.fn();
    const Music = () => { useEffect(() => { mounts(); }, []); return <section data-testid="retry-player"><RouteOutlet /></section>; };
    const graph = defineSynWareRoutes({ id: "mounted.retry", routes: [{ name: "com.example.music", path: "", component: Music, beforeEnter: parentGuard,
      errorComponent: ({ error, retry }) => <div role="alert">{String(error)}<button onClick={retry}>Retry route</button></div>,
      children: [{ name: "album", path: "album/:id", load: childLoad, component: ({ routeData }) => <div data-testid="retry-album">{String(routeData)}</div> }],
    }] });
    const definition = createSynWare({ manifest: { schemaVersion: 1, bundleIdentifier: "com.example.music", version: "1.0.0", displayName: "Music",
      routes: [{ path: "/music", match: "prefix", primary: true }], services: [{ id: "routing", required: true }], permissions: ["app.open.public"] },
      root: () => <RouteOutlet />, routes: graph });
    const app = registerTestSynWare(runtime, definition);
    const href = "/music/album/cross?view=tracks#details";
    const open = vi.spyOn(runtime.routes, "openRoute");
    try {
      runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
      const first = runtime.routes.openRoute(href);
      await first.result;
      view = render(
        <HostSiteBrandingProvider value={{ name: "Music", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null }}>
          <SynWareRuntimeMount runtime={runtime} app={app} responderId="application:com.example.music"><RouteOutlet /></SynWareRuntimeMount>
        </HostSiteBrandingProvider>,
      );
      expect((await screen.findByRole("alert")).textContent).toContain("album unavailable");
      expect(childLoad).toHaveBeenCalledTimes(1);
      const player = screen.getByTestId("retry-player");
      blocked = true;
      await act(async () => { screen.getByRole("button", { name: "Retry route" }).click(); await Promise.resolve(); });
      await waitFor(() => expect(parentGuard).toHaveBeenCalledTimes(2));
      const denied = open.mock.results.at(-1);
      if (denied?.type !== "return") throw new Error("The mounted retry must invoke RouteManager.");
      await expect(denied.value.result).resolves.toMatchObject({ status: "failed", committed: false });
      expect(denied.value.operationId).not.toBe(first.operationId);
      expect(childLoad).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("retry-player")).toBe(player);
      blocked = false;
      failed = false;
      await act(async () => { screen.getByRole("button", { name: "Retry route" }).click(); await Promise.resolve(); });
      expect((await screen.findByTestId("retry-album")).textContent).toBe("album restored");
      const recovered = open.mock.results.at(-1);
      if (recovered?.type !== "return") throw new Error("The mounted retry must invoke RouteManager.");
      await expect(recovered.value.result).resolves.toMatchObject({ status: "completed", postCommit: "completed", committed: true });
      expect(recovered.value.operationId).not.toBe(denied.value.operationId);
      expect(parentGuard).toHaveBeenCalledTimes(3);
      expect(childLoad).toHaveBeenCalledTimes(2);
      expect(mounts).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenLastCalledWith(href, expect.objectContaining({ historyMode: "replace", context: expect.objectContaining({ routeRetry: true }) }));
    } finally {
      view?.unmount();
      await runtime.dispose("routing-ii-outlet-retry-complete");
      window.history.replaceState({}, "", priorHref);
    }
  });
});
