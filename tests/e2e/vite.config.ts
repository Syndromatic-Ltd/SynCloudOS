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

import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { synCloudOS } from "../../scripts/synware/vite-plugin.mjs";
import { discoverThemeBundles } from "../../scripts/synware/theme-bundles.mjs";
import { themeModuleSource, themeStylesheet } from "../../scripts/synware/theme-loading.mjs";
const themeFixtureRoot = resolve(import.meta.dirname, "fixtures/theme-nesting");
const themeFixturePlugin = synCloudOS({ webspringEntry: false, themesDirectory: "Themes" });
const configureThemes = themeFixturePlugin.configResolved;
themeFixturePlugin.configResolved = function(config) { return configureThemes.call(this, { ...config, root: themeFixtureRoot }); };
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { synWareSdkEntries, synWareSdkGeneratedStyles, synWarePackageName } from "../../scripts/synware/sdk-entries.mjs";

function paintReplacementTheme(): Plugin {
  const moduleId = "virtual:theme-paint-replacement/themes";
  const stylePrefix = "virtual:theme-paint-replacement/style/";
  const directory = resolve(import.meta.dirname, "fixtures/theme-paint-replacement/Themes");
  const toImport = (path: string) => "/@fs/" + normalizePath(path);
  return {
    name: "theme-paint-replacement",
    resolveId(id) {
      if (id === moduleId || id.startsWith(stylePrefix)) return "\0" + id;
    },
    load(id) {
      if (id !== "\0" + moduleId && !id.startsWith("\0" + stylePrefix)) return;
      const bundles = discoverThemeBundles(directory);
      if (id === "\0" + moduleId) {
        const selected = new Set(bundles.map(bundle => bundle.theme.bundleIdentifier));
        return themeModuleSource(bundles, selected, toImport, stylePrefix);
      }
      const identifier = id.slice(stylePrefix.length + 1, -4);
      const bundle = bundles.find(candidate => candidate.theme.bundleIdentifier === identifier);
      if (!bundle) throw new Error("Unknown replacement fixture theme: " + identifier);
      return themeStylesheet(bundle, toImport);
    },
  };
}

// Native framework fixtures have no dependency on the website bootstrap or worker.
export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  resolve: { alias: [
    ...Object.entries(synWareSdkEntries).map(([entry, source]) => ({
      find: new RegExp("^" + synWarePackageName + (entry === "index" ? "" : "/" + entry) + "$"), replacement: resolve(import.meta.dirname, "../..", source),
    })),
    // sdk:build assembles these public host styles with their module-relative assets.
    ...Object.keys(synWareSdkGeneratedStyles).map(entry => ({
      find: new RegExp("^" + synWarePackageName + "/" + entry.replaceAll(".", "\\.") + "$"),
      replacement: resolve(import.meta.dirname, "../../.artifacts/synapp-sdk/packages/syncloudos", entry),
    })),
  ] },
  plugins: [react(), themeFixturePlugin, paintReplacementTheme(), {
    name: "framework-fixture-pages",
    configureServer(server) {
      const pdfReaderWorker = readFileSync(resolve(import.meta.dirname, "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"));
      server.middlewares.use((request, response, next) => {
        // Serve the real reader worker unchanged; Vite's computed-import
        // transform otherwise injects a development WebSocket into this worker.
        // The ?url module still goes through Vite's normal URL transformation.
        if (request.method === "GET" && request.url === "/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs") {
          response.setHeader("Content-Type", "text/javascript");
          response.end(pdfReaderWorker);
          return;
        }
        // Vite injects its HMR client into development workers. Playwright
        // Firefox cannot match that worker WebSocket to a tracked request
        // (FFPage._onWebSocketOpened asserts and ends the test). Forbid
        // connections for the parser worker's own script only; its code,
        // imports, messages, transfers and termination stay native.
        if (request.url?.includes("/src/FX/GraphicsFX/pdf/pdf-document.worker.ts?worker_file")) {
          response.setHeader("Content-Security-Policy", "connect-src 'none'");
        }
        const pathname = request.url?.split("?")[0];
        if (pathname === "/" || pathname?.startsWith("/__framework-tests/")) {
          request.url = "/tests/e2e/framework-host.html";
        }
        next();
      });
    },
  }],
  server: { host: "127.0.0.1" },
});
