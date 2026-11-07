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
export async function routeInstalledApplicationLaunch(launch: InstalledApplicationLaunch, apps: readonly SynWareManifestV1[], port: InstalledApplicationLaunchPort): Promise<boolean> {
  port.signal.throwIfAborted();
  const url = new URL(launch.targetURL ?? port.base, port.origin);
  if (url.origin !== port.origin) throw new TypeError("An application launch must stay on the host origin.");
  const deployment = port.base.replace(/\/$/u, "");
  if (deployment && url.pathname !== deployment && !url.pathname.startsWith(`${deployment}/`)) throw new TypeError("An application launch must stay inside the deployment base.");
  const path = url.pathname.slice(deployment.length) || "/";
  const matchLength = (app: SynWareManifestV1) => Math.max(-1, ...(app.routes ?? []).filter(route => route.match === "prefix" ? within(path, route.path) : path === route.path).map(route => route.path.length));
  const candidates = apps.filter(app => matchLength(app) >= 0).sort((a,b) => matchLength(b)-matchLength(a));
  const app = candidates[0];
  if (!app) return false;
  const protocol = url.searchParams.get("scos-protocol");
  const openedURL = protocol ? new URL(protocol) : url;
  if (protocol && !app.urlTypes?.some(type => type.schemes.includes(openedURL.protocol.slice(0,-1)))) throw new TypeError("The app did not declare this protocol.");
  const shortcut = url.searchParams.get("scos-shortcut");
  if (shortcut && !app.shortcutItems?.some(item => item.type === shortcut)) throw new TypeError("The app did not declare this shortcut.");
  if (!launch.files?.length && !protocol && !shortcut && !launch.sharedItems && !url.searchParams.has("scos-notification")
    && !app.linkCapture?.paths.some(capture => within(path, capture))) return false;
  await port.launch(app.bundleIdentifier, installedApplicationRoute(path + url.search, apps));
  port.signal.throwIfAborted();
  for (const handle of launch.files ?? []) {
    const file = await handle.getFile();
    port.signal.throwIfAborted();
    const types = app.documentTypes?.filter(type => type.mimeTypes?.includes(file.type) || type.extensions?.some(extension => file.name.toLowerCase().endsWith(`.${extension.replace(/^\./u, "").toLowerCase()}`))) ?? [];
    if (types.length !== 1) throw new TypeError("The launched file needs exactly one declared document type.");
    await port.openDocument({ typeId: types[0].id, withContentsOf: file, applicationId: app.bundleIdentifier, signal: port.signal });
  }
  if (!(launch.files?.length)) await port.openURLs(app.bundleIdentifier, [openedURL], { sharedItems: launch.sharedItems, shortcutItemType: shortcut ?? undefined });
  return true;
}

export const shortcutCommandIdentifier = (appId: string, type: string) => `webspring.shortcut.${appId}.${type}`;

/** Host launch arguments are not application route-query values. */
export function installedApplicationRoute(href: string, apps: readonly SynWareManifestV1[]): string {
  const url = new URL(href, "https://syncloudos.invalid");
  for (const key of ["scos-protocol", "scos-share", "scos-shortcut", "scos-notification", "scos-action"]) url.searchParams.delete(key);
  const target = apps.find(app => app.shareTarget?.method === "GET" && app.shareTarget.action === url.pathname)?.shareTarget;
  if (target) for (const name of [target.params.title, target.params.text, target.params.url]) if (name) url.searchParams.delete(name);
  return `${url.pathname}${url.search}${url.hash}`;
}
