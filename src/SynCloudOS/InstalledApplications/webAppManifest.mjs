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

const origin = "https://syncloudos.invalid";
export function localPath(value, base = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) throw new TypeError("An installation path must be an origin-relative path.");
  const url = new URL(value, origin);
  if (url.origin !== origin || url.hash || url.pathname !== value.split("?")[0]) throw new TypeError("An installation path must be canonical.");
  return `${base.replace(/\/$/u, "")}${url.pathname}${url.search}`;
}
const within = (path, scope) => path === scope || path.startsWith(scope.endsWith("/") ? scope : `${scope}/`);
/** Pure build-time projection. The shell and every application opt in independently. */
export function createWebAppManifests({ shell, apps = [], base = "/" } = {}) {
  const records = [];
  for (const info of [shell, ...apps].filter(Boolean)) {
    if (!info.webApp) continue;
    const declaration = info.webApp;
    const scope = localPath(declaration.scope, base);
    const start = localPath(declaration.startURL, base);
    if (!within(start.split("?")[0], scope)) throw new TypeError("The start URL must lie inside the declared install scope.");
    if (info !== shell && !info.routes?.some(route => within(declaration.scope, route.path))) throw new TypeError("An app install scope must lie inside its declared route.");
    if (!declaration.icons?.length) throw new TypeError("An installed application requires icons.");
    const members = info === shell ? apps : [info];
    const manifest = {
      id: scope, name: info.displayName, short_name: declaration.shortName ?? info.displayName,
      scope, start_url: start, display: "standalone", display_override: ["window-controls-overlay", "standalone"],
      ...(declaration.description ? { description: declaration.description } : {}),
      ...(declaration.themeColour ? { theme_color: declaration.themeColour } : {}),
      ...(declaration.backgroundColour ? { background_color: declaration.backgroundColour } : {}),
      icons: declaration.icons.map(icon => ({ ...icon, src: localPath(icon.src, base) })),
    };
    const fileHandlers = [], protocolHandlers = [], shortcuts = [];
    const shareTargets = [];
    for (const member of members) {
      const action = localPath(member.routes?.find(route => route.primary)?.path ?? member.routes?.[0]?.path ?? "/", base);
      if (!within(action, scope)) continue;
      for (const type of member.documentTypes ?? []) {
        if (!type.mimeTypes?.length || !type.extensions?.length) continue;
        fileHandlers.push({ action, name: type.displayName ?? type.id, accept: Object.fromEntries(type.mimeTypes.map(mime => [mime, type.extensions.map(extension => extension.startsWith(".") ? extension : `.${extension}`)])) });
      }
      for (const type of member.urlTypes ?? []) for (const scheme of type.schemes) {
        if (!/^(web\+[a-z]+|mailto|tel)$/u.test(scheme)) throw new TypeError("The protocol must be a browser-supported scheme.");
        protocolHandlers.push({ protocol: scheme, url: `${action}?scos-protocol=%s` });
      }
      for (const item of member.shortcutItems ?? []) {
        const url = new URL(localPath(item.url, base), origin);
        if (!within(url.pathname, scope)) throw new TypeError("A shortcut must lie inside the install scope.");
        url.searchParams.set("scos-shortcut", item.type);
        shortcuts.push({ name: item.title, ...(item.subtitle ? { description: item.subtitle } : {}), url: `${url.pathname}${url.search}` });
      }
      if (member.linkCapture) {
        for (const path of member.linkCapture.paths) if (!within(localPath(path, base), scope)) throw new TypeError("Captured links must lie inside the install scope.");
        manifest.launch_handler = { client_mode: member.linkCapture.clientMode ?? "navigate-existing" };
        manifest.handle_links = "preferred";
      }
      if (member.shareTarget) shareTargets.push(member.shareTarget);
    }
    if (fileHandlers.length) manifest.file_handlers = fileHandlers;
    if (protocolHandlers.length) manifest.protocol_handlers = protocolHandlers;
    if (shortcuts.length) manifest.shortcuts = shortcuts;
    const target = info.shareTarget ?? (shareTargets.length === 1 ? shareTargets[0] : undefined);
    if (shareTargets.length > 1 && !info.shareTarget) throw new TypeError("A desktop install has one share target; declare the chosen receiver on Webspring Info.ts.");
    if (target) {
      const action = localPath(target.action, base);
      if (!within(action, scope)) throw new TypeError("The share target must lie inside the install scope.");
      manifest.share_target = { ...target, action };
    }
    records.push({ bundleIdentifier: info.bundleIdentifier, fileName: `syncloudos-${encodeURIComponent(info.bundleIdentifier)}.webmanifest`, manifest, members });
  }
  return records;
}
