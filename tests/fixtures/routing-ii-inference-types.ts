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

import { defineSynWareRoutes, type SynWareNamedRouteTarget, type SynWareRouteGraph, type SynWareRouteQueryForName } from "../../src/SynCloudOS/AppSDK/defineSynWareRoutes";
import type { SynWareRouter } from "../../src/SynCloudOS/AppSDK/hooks/useRouter";
import type { SynCloudOSRouteTransitionHandle } from "../../src/SynCloudOS/Routing/RouteTransition";
import { routeQuery } from "../../src/SynCloudOS/Routing/routeQuery";

// Branching siblings are essential: a single-child chain hid the regression.
const graph = defineSynWareRoutes({
  id: "routing.inference",
  routes: [
    { name: "music", path: "music", query: { region: routeQuery.enum(["uk", "us"], { defaultValue: "uk" }) }, children: [
      { name: "music.index", index: true },
      { name: "music.home", path: "home" },
      { name: "music.artist", path: "artist/:artistId", query: { bio: routeQuery.boolean({ defaultValue: false }) }, children: [
        { name: "music.artist.index", index: true },
        { name: "music.artist.album", path: "album/:albumId", query: { view: routeQuery.enum(["summary", "tracks"], { defaultValue: "summary" }) } },
      ] },
      { name: "music.album", path: "album/:albumId" },
      { name: "music.search", path: "search", query: {
        q: routeQuery.string({ defaultValue: "", alias: "term" }),
        page: routeQuery.integer({ defaultValue: 1 }),
        tags: routeQuery.array(routeQuery.string({ defaultValue: "" }), { defaultValue: [], maxItems: 3 }),
      } },
      { name: "music.layout", children: [
        { name: "music.playlist", path: "playlist/:playlistId" },
        { name: "music.files", path: "files/*segments" },
      ] },
    ] },
    { name: "settings", path: "settings", children: [
      { name: "settings.home", index: true },
      { name: "settings.profile", path: "profile/:profileId" },
    ] },
  ],
});

declare const router: SynWareRouter<typeof graph.routes>;
const transition: SynCloudOSRouteTransitionHandle = router.transitionTo({ name: "music.artist.album", params: { artistId: "justice", albumId: "cross" }, query: { region: "us", bio: true, view: "tracks" } });
const replacement: SynCloudOSRouteTransitionHandle = router.replaceWith({ name: "music.search", query: { q: "air", page: 2, tags: ["electronic"], region: "uk" } });
void transition;
void replacement;
graph.urlFor({ name: "music.album", params: { albumId: "cross" } });
graph.urlFor({ name: "music.artist.index", params: { artistId: "justice" }, query: { bio: true } });
graph.urlFor({ name: "music.playlist", params: { playlistId: "favourites" }, query: { region: "us" } });
graph.urlFor({ name: "music.files", params: { segments: ["albums", "cross"] } });
graph.urlFor({ name: "music.home", params: {}, query: { region: "uk" } });
graph.urlFor({ name: "music.index" });
graph.urlFor({ name: "music.search", query: {} });
graph.bind("/app", "music").urlFor({ name: "music.search", query: { page: 2 } });
graph.urlFor({ name: "settings.home", params: {}, query: {} });
// Runtime-erased graphs cannot promise literal inference; their recognizer and
// URL generator still validate dynamic targets at runtime.
declare const dynamicGraph: SynWareRouteGraph;
dynamicGraph.urlFor({ name: "dynamic.record", params: { id: "record" }, query: { page: 2 } });
dynamicGraph.urlFor({ name: "dynamic.home" });
const registeredGraph: SynWareRouteGraph = graph;
registeredGraph.urlFor({ name: "music.album", params: { albumId: "cross" } });
declare const dynamicRouter: SynWareRouter;
dynamicRouter.transitionTo({ name: "dynamic.record", params: { id: "record" }, query: { page: 2 } });
dynamicRouter.transitionTo({ name: "dynamic.home" });
router.isActive({ name: "music.artist", params: { artistId: "justice" } });
void router.preload({ name: "music.album", params: { albumId: "cross" } }, { data: false });

type AlbumQuery = SynWareRouteQueryForName<typeof graph.routes, "music.artist.album">;
const albumQuery: AlbumQuery = { region: "uk", bio: false, view: "tracks" };
const region: "uk" | "us" = albumQuery.region;
const bio: boolean = albumQuery.bio;
const view: "summary" | "tracks" = albumQuery.view;
void [region, bio, view];
type MixedTarget = SynWareNamedRouteTarget<typeof graph.routes, "music.home" | "music.artist.album" | "music.search">;
const mixed: MixedTarget = { name: "music.artist.album", params: { artistId: "justice", albumId: "cross" }, query: { view: "tracks" } };
router.transitionTo(mixed);

// @ts-expect-error unknown route names cannot widen the graph.
graph.urlFor({ name: "music.unknown" });
// @ts-expect-error a sibling's parameterless route cannot make album params optional.
graph.urlFor({ name: "music.album" });
// @ts-expect-error contextual album requires its inherited artistId.
graph.urlFor({ name: "music.artist.album", params: { albumId: "cross" } });
// @ts-expect-error contextual album requires its own albumId.
graph.urlFor({ name: "music.artist.album", params: { artistId: "justice" } });
// @ts-expect-error inherited parameters remain required on an index route.
graph.urlFor({ name: "music.artist.index" });
// @ts-expect-error pathless layouts cannot erase child parameters.
graph.urlFor({ name: "music.playlist" });
// @ts-expect-error a different top-level branch's parameter must not match.
graph.urlFor({ name: "music.album", params: { profileId: "person" } });
// @ts-expect-error wrong parameter names, even alongside required ones.
graph.urlFor({ name: "music.album", params: { albumId: "cross", artistId: "justice" } });
// @ts-expect-error ordinary parameters require strings.
graph.urlFor({ name: "music.album", params: { albumId: 42 } });
// @ts-expect-error ordinary parameters do not accept splat arrays.
graph.urlFor({ name: "music.album", params: { albumId: ["cross"] } });
// @ts-expect-error splats require segment arrays rather than a raw path.
graph.urlFor({ name: "music.files", params: { segments: "albums/cross" } });
// @ts-expect-error parameterless routes reject invented params.
graph.urlFor({ name: "music.home", params: { albumId: "cross" } });
// @ts-expect-error codecs preserve query value types across sibling routes.
graph.urlFor({ name: "music.search", query: { page: "2" } });
// @ts-expect-error unknown query keys cannot silently pass through {}.
graph.urlFor({ name: "music.search", query: { unknown: "value" } });
// @ts-expect-error URL aliases are not logical query property names.
graph.urlFor({ name: "music.search", query: { term: "air" } });
// @ts-expect-error sibling query schemas must not leak into search.
graph.urlFor({ name: "music.search", query: { view: "tracks" } });
// @ts-expect-error parent routes cannot acquire a child's query keys.
graph.urlFor({ name: "music.artist", params: { artistId: "justice" }, query: { view: "tracks" } });
// @ts-expect-error inherited enum query values stay narrow.
graph.urlFor({ name: "music.artist.album", params: { artistId: "justice", albumId: "cross" }, query: { region: "eu" } });
// @ts-expect-error inherited boolean query values stay boolean.
graph.urlFor({ name: "music.artist.album", params: { artistId: "justice", albumId: "cross" }, query: { bio: "true" } });
// @ts-expect-error a child enum only accepts its declared literals.
graph.urlFor({ name: "music.artist.album", params: { artistId: "justice", albumId: "cross" }, query: { view: "grid" } });
// @ts-expect-error array codecs preserve their element type.
graph.urlFor({ name: "music.search", query: { tags: [1] } });
// @ts-expect-error a branch without a query schema accepts no arbitrary query keys.
graph.urlFor({ name: "settings.home", query: { q: "air" } });
// @ts-expect-error querying another root does not inherit Music's query.
graph.urlFor({ name: "settings.profile", params: { profileId: "person" }, query: { region: "uk" } });
// @ts-expect-error the exported parsed query shape still requires all defaults.
const incompleteQuery: AlbumQuery = { region: "uk" };
void incompleteQuery;
// @ts-expect-error the exported parsed query shape rejects unrelated fields.
const wrongQuery: AlbumQuery = { region: "uk", bio: false, view: "tracks", page: 2 };
void wrongQuery;
// @ts-expect-error explicit union route names retain discriminated required params.
const missingMixedParams: MixedTarget = { name: "music.artist.album" };
void missingMixedParams;
// @ts-expect-error an explicit name union cannot transfer sibling query capabilities.
const wrongMixedQuery: MixedTarget = { name: "music.home", query: { page: 2 } };
void wrongMixedQuery;
// @ts-expect-error caller-supplied generic name unions must not bypass required params.
router.transitionTo<"music.home" | "music.album">({ name: "music.album" });
// @ts-expect-error a union-typed discriminator must be narrowed before supplying branch-specific params.
router.transitionTo({ name: Math.random() ? "music.home" : "music.album" });
// @ts-expect-error the mounted transition facade shares graph parameter validation.
router.transitionTo({ name: "music.artist.album", params: { albumId: "cross" } });
// @ts-expect-error mounted replace shares query value validation.
router.replaceWith({ name: "music.search", query: { page: "2" } });
// @ts-expect-error mounted urlFor shares exact parameter names.
router.urlFor({ name: "music.home", params: { albumId: "cross" } });
// @ts-expect-error active-state tests still require parameters.
router.isActive({ name: "music.album" });
// @ts-expect-error preload is not an escape from query validation.
router.preload({ name: "music.search", query: { view: "tracks" } });

export {};
