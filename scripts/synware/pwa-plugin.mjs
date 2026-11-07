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

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseManifest } from "./manifest-source.mjs";
import { createWebAppManifests } from "../../src/SynCloudOS/InstalledApplications/webAppManifest.mjs";
import { createServiceWorkerSource } from "../../src/SynCloudOS/InstalledApplications/serviceWorker.mjs";

/** Hooks shared with the discovery plugin, so the runtime owns the only worker. */
export function installedApplicationBuild(config, discovery) {
  const base = config.base?.startsWith("/") ? config.base.replace(/\/?$/u, "/") : "/";
  const shellInfo = discovery.shell ? resolve(dirname(discovery.shell.entryPath), "Info.ts") : null;
  const shell = shellInfo && existsSync(shellInfo) ? parseManifest(shellInfo) : null;
  const apps = discovery.bundles.filter(bundle => !discovery.applications || discovery.applications.some(id => id.toLowerCase() === bundle.bundleIdentifier.toLowerCase())).map(bundle => bundle.manifest);
  const manifests = createWebAppManifests({ shell, apps, base });
  const receiptPath = resolve(config.root, "vendor/framework-receipt.json");
  const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, "utf8")) : { commit: "source", sourceSha256: "source" };
  const version = createHash("sha256").update(JSON.stringify({ receipt, manifests })).digest("hex");
  const configuration = { base, receipt: version, manifests, assets: [`${base}index.html`, ...manifests.flatMap(record => record.manifest.icons.map(icon => icon.src))], development: config.command !== "build" };
  return {
    configuration,
    tags(path = "/") {
      if (!manifests.length) return [];
      const chosen = manifests.filter(record => path === record.manifest.scope || path.startsWith(record.manifest.scope.endsWith("/") ? record.manifest.scope : `${record.manifest.scope}/`)).sort((a,b) => b.manifest.scope.length-a.manifest.scope.length)[0];
      return [
        ...(chosen ? [{ tag: "link", attrs: { rel: "manifest", href: `${base}${chosen.fileName}` }, injectTo: "head" }] : []),
        { tag: "meta", attrs: { name: "syncloudos-installation", content: JSON.stringify(configuration) }, injectTo: "head" },
      ];
    },
    middleware(request, response, next) {
      const path = (request.url ?? "").split("?")[0];
      const record = manifests.find(record => path === `${base}${record.fileName}`);
      if (record) { response.setHeader("Content-Type", "application/manifest+json"); response.end(JSON.stringify(record.manifest)); return; }
      if (manifests.length && path === `${base}syncloudos-sw.js`) {
        response.setHeader("Content-Type", "text/javascript"); response.setHeader("Cache-Control", "no-cache"); response.setHeader("Service-Worker-Allowed", base);
        response.end(createServiceWorkerSource(configuration)); return;
      }
      next();
    },
    emit(context, bundle) {
      if (!manifests.length) return;
      const assets = [...new Set([...configuration.assets, ...Object.keys(bundle).filter(name => !name.endsWith(".map")).map(name => `${base}${name}`)])];
      const version = createHash("sha256").update(configuration.receipt).update(JSON.stringify(assets.map(name => [name, bundle[name.slice(base.length)]?.code ?? bundle[name.slice(base.length)]?.source ?? "public"]))).digest("hex");
      for (const record of manifests) context.emitFile({ type: "asset", fileName: record.fileName, source: JSON.stringify(record.manifest, null, 2) });
      context.emitFile({ type: "asset", fileName: "syncloudos-sw.js", source: createServiceWorkerSource({ ...configuration, receipt: version, assets, development: false }) });
    },
  };
}
