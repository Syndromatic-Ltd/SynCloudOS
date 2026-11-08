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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { applicationSessionFor } from "../AppHosting/runtimeEntry";
import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type { InstalledApplicationLaunchPort } from "./installedApplicationLaunch";
/** Preserve the kernel route operation's settlement and the receiver's actual lifetime. */
export function createInstalledApplicationRuntimePort(runtime: SynCloudOSRuntime, origin: string, base: string): InstalledApplicationLaunchPort {
  return {
    origin, base, signal: runtime.signal,
    async launch(appId, route) {
      const result = await runtime.routes.openRoute(route, { signal: runtime.signal, source: "installed-application" }).result;
      runtime.signal.throwIfAborted();
      if (result.status !== "completed" || result.value.kind !== "app" || normalizeBundleIdentifier(result.value.appId) !== normalizeBundleIdentifier(appId)) throw new Error("The launched application's route was refused or opened another application.");
    },
    openDocument: request => runtime.documents.openDocument(request),
    async openURLs(appId, urls, context) {
      const app = applicationSessionFor(runtime, appId)?.app;
      if (!app || app.isDisposed) throw new Error("The receiving application is no longer available.");
      const handler = app.delegate?.applicationOpen;
      if (!handler && (context?.sharedItems || urls.some(url => !["http:", "https:"].includes(url.protocol) || url.searchParams.has("scos-action")))) throw new Error("The receiving application must implement applicationOpen for this item.");
      await handler?.call(app.delegate, app, urls, context);
    },
  };
}
