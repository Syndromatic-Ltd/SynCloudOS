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

import { createBrowserRoutePlatform } from "../PlatformAdapters/BrowserRoutePlatform";
import type { SynCloudOSOpenRouteOptions } from "../RouteManager/routeTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

/** Browser-facing client seam for runtime-owned route operations. */
export function openSynCloudOSRuntimeRoute(
  runtime: SynCloudOSRuntime,
  pathname: string,
  options: SynCloudOSOpenRouteOptions = {},
) {
  const handle = runtime.routes.openRoute(pathname, options);
  if (options.syncRoute !== false) {
    void handle.result.then((result) => {
      if (result.status === "completed" && (result.value.kind === "app" || result.value.kind === "webspring")) {
        createBrowserRoutePlatform(runtime.environment).syncRoute(pathname);
      }
    });
  }
  return handle;
}
