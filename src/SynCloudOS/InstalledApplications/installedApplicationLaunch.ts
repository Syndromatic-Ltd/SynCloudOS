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

import type { SynWareManifestV1 } from "../AppSDK/manifest/manifestTypes";
export interface InstalledApplicationLaunch {
  readonly targetURL?: string;
  readonly files?: readonly { getFile(): Promise<File> }[];
  readonly sharedItems?: { readonly title?: string; readonly text?: string; readonly url?: string; readonly files: readonly File[] };
}
export interface InstalledApplicationLaunchPort {
  readonly origin: string;
  readonly base: string;
  readonly signal: AbortSignal;
  launch(appId: string, route: string): Promise<unknown>;
  openDocument(request: { readonly typeId: string; readonly withContentsOf: Blob; readonly applicationId: string; readonly signal: AbortSignal }): Promise<unknown>;
  openURLs(appId: string, urls: readonly URL[], context?: { readonly sharedItems?: InstalledApplicationLaunch["sharedItems"]; readonly shortcutItemType?: string }): void | Promise<void>;
}
const within = (path: string, scope: string) => path === scope || path.startsWith(scope.endsWith("/") ? scope : `${scope}/`);
/** Browser delivery enters LaunchServices, NSDocumentController and the app delegate in that order. */
export async function routeInstalledApplicationLaunch(launch: InstalledApplicationLaunch, apps: readonly SynWareManifestV1[], port: InstalledApplicationLaunchPort): Promise<void> {
  port.signal.throwIfAborted();
  const url = new URL(launch.targetURL ?? port.base, port.origin);
  if (url.origin !== port.origin) throw new TypeError("An application launch must stay on the host origin.");
  const path = `/${url.pathname.slice(port.base.replace(/\/$/u, "").length).replace(/^\//u, "")}`;
  const candidates = apps.filter(app => app.routes?.some(route => within(path, route.path))).sort((a,b) => Math.max(...b.routes!.map(route => route.path.length))-Math.max(...a.routes!.map(route => route.path.length)));
  const app = candidates[0];
  if (!app) return;
  const protocol = url.searchParams.get("scos-protocol");
  const openedURL = protocol ? new URL(protocol) : url;
  if (protocol && !app.urlTypes?.some(type => type.schemes.includes(openedURL.protocol.slice(0,-1)))) throw new TypeError("The app did not declare this protocol.");
  const shortcut = url.searchParams.get("scos-shortcut");
  if (shortcut && !app.shortcutItems?.some(item => item.type === shortcut)) throw new TypeError("The app did not declare this shortcut.");
  if (!launch.files?.length && !protocol && !shortcut && !launch.sharedItems && !url.searchParams.has("scos-notification")
    && !app.linkCapture?.paths.some(capture => within(path, capture))) return;
  await port.launch(app.bundleIdentifier, path + url.search);
  port.signal.throwIfAborted();
  for (const handle of launch.files ?? []) {
    const file = await handle.getFile();
    port.signal.throwIfAborted();
    const types = app.documentTypes?.filter(type => type.mimeTypes?.includes(file.type) || type.extensions?.some(extension => file.name.toLowerCase().endsWith(`.${extension.replace(/^\./u, "").toLowerCase()}`))) ?? [];
    if (types.length !== 1) throw new TypeError("The launched file needs exactly one declared document type.");
    await port.openDocument({ typeId: types[0].id, withContentsOf: file, applicationId: app.bundleIdentifier, signal: port.signal });
  }
  if (!(launch.files?.length)) await port.openURLs(app.bundleIdentifier, [openedURL], { sharedItems: launch.sharedItems, shortcutItemType: shortcut ?? undefined });
}

export const shortcutCommandIdentifier = (appId: string, type: string) => `webspring.shortcut.${appId}.${type}`;
