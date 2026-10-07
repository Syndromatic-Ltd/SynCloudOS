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

import {
  defineSynWareRoutes,
  type AppNavigationOptions,
  type AppNavigationRoute,
  type AppNavigationTransitionHandle,
  type AppNavigationTransitionResult,
} from "../../src/SynCloudOS/AppSDK";

const navigationOptions: AppNavigationOptions = { historyMode: "replace" };
const navigationRoute: AppNavigationRoute = { pathname: "/music", kind: "app", appId: "music" };
declare const navigationTransition: AppNavigationTransitionHandle;
const navigationResult: Promise<AppNavigationTransitionResult> = navigationTransition.result;
void navigationOptions;
void navigationRoute;
void navigationResult;

const routes = defineSynWareRoutes({
  id: "routing.types",
  routes: [{
    name: "music",
    path: "",
    children: [{
      name: "music.artist",
      path: "artist/:artistId",
      children: [{
        name: "music.artist.album",
        path: "album/:albumId",
      }],
    }],
  }],
} as const);

routes.urlFor({
  name: "music.artist.album",
  params: { artistId: "justice", albumId: "cross" },
});

// @ts-expect-error artistId is inherited from the parent branch and required.
routes.urlFor({ name: "music.artist.album", params: { albumId: "cross" } });

// @ts-expect-error unknown route names are rejected by the graph type.
routes.urlFor({ name: "music.unknown", params: {} });
