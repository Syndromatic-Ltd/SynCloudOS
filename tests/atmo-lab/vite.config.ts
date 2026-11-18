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
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { synCloudOS } from "../../scripts/synware/vite-plugin.mjs";
import { discoverThemeBundles } from "../../scripts/synware/theme-bundles.mjs";
import { themeModuleSource, themeStylesheet } from "../../scripts/synware/theme-loading.mjs";
import { synWarePackageName, synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";

// Atmo Lab: the frozen theme on the left, the working tree on the right, in one server.
const root = resolve(import.meta.dirname, "../..");
const labRoot = resolve(import.meta.dirname);
const workingTreeSpecimens = resolve(labRoot, "working-tree");
const baseRef = (process.env.ATMO_LAB_BASE ?? readFileSync(resolve(labRoot, "BASE"), "utf8")).trim();
const baselineRoot = resolve(root, ".artifacts/atmo-lab", `baseline-${baseRef}`);
const mirroredLab = resolve(baselineRoot, "tests/atmo-lab");
// Prelude is the site's UI face; the lab reads it from the site checkout, never copying it into this repo.
const preludeRoot = resolve(process.env.ATMO_LAB_PRELUDE ?? resolve(root, "../../webspring-folders/site/src/Webspring/Contents/Resources/Fonts/Prelude"));
const snapshotPaths = ["src", "public", "tests/fixtures", "tests/e2e/fixtures/theme-baseline", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json"];

// The baseline is a read-only export of BASE, so committing our work never moves it.
function ensureBaseline() {
  // Art the source names by path lives in public, so an export from before it was included takes just that.
  const missing = existsSync(resolve(baselineRoot, "tsconfig.app.json")) ? snapshotPaths.filter(path => !existsSync(resolve(baselineRoot, path))) : snapshotPaths;
  if (!missing.length) return;
  mkdirSync(baselineRoot, { recursive: true });
  const archive = resolve(baselineRoot, "baseline.tar");
  execFileSync("git", ["-c", "core.longpaths=true", "archive", "--format=tar", "-o", archive, baseRef, ...missing], { cwd: root, stdio: "inherit" });
  // Relative paths: GNU tar on Windows reads "C:" as a remote host.
  execFileSync("tar", ["-xf", "baseline.tar"], { cwd: baselineRoot, stdio: "inherit" });
  rmSync(archive);
}

// Specimens are mirrored into the snapshot so both sides render the same pages against their own source.
const mirrorable = (file: string) => !file.startsWith(workingTreeSpecimens + sep)
  && /\.(tsx?|css|html)$/.test(file) && !file.endsWith("vite.config.ts");
function mirrorFile(file: string) {
  const target = resolve(mirroredLab, relative(labRoot, file));
  mkdirSync(resolve(target, ".."), { recursive: true });
  cpSync(file, target);
}
function mirrorAll(directory = labRoot) {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    if (path === workingTreeSpecimens) continue;
    if (statSync(path).isDirectory()) mirrorAll(path);
    else if (mirrorable(path)) mirrorFile(path);
  }
}

// Package-name imports inside src resolve to the importing side's own source tree.
const packagePrefix = synWarePackageName + "/";
const resolvePackage = (source: string, importer: string | undefined) => {
  if (source !== synWarePackageName && !source.startsWith(packagePrefix)) return null;
  const entry = source === synWarePackageName ? "index" : source.slice(packagePrefix.length);
  const file = (synWareSdkEntries as Record<string, string>)[entry];
  if (!file) return null;
  const side = importer && resolve(importer.split("?")[0]!).startsWith(baselineRoot) ? baselineRoot : root;
  return resolve(side, file);
};

const atmoLab: Plugin = {
  name: "atmo-lab",
  enforce: "pre",
  resolveId(source, importer) {
    return resolvePackage(source, importer);
  },
  config() {
    ensureBaseline();
    mirrorAll();
  },
  configureServer(server) {
    server.watcher.add(labRoot);
    const onChange = (file: string) => {
      const path = resolve(file);
      if (path.startsWith(labRoot) && mirrorable(path)) mirrorFile(path);
    };
    server.watcher.on("change", onChange);
    server.watcher.on("add", onChange);
    server.middlewares.use((request, _response, next) => {
      const pathname = request.url?.split("?")[0];
      if (pathname === "/" || pathname === "/index.html") request.url = "/tests/atmo-lab/index.html";
      next();
    });
    server.middlewares.use("/atmo-lab-fonts", (request, response, next) => {
      const name = decodeURIComponent(request.url?.split("?")[0]?.slice(1) ?? "");
      const file = resolve(preludeRoot, name);
      if (!/^PreludeWGL-[A-Za-z]+\.woff2$/.test(name) || !existsSync(file)) return next();
      response.setHeader("Content-Type", "font/woff2");
      response.setHeader("Cache-Control", "max-age=3600");
      response.end(readFileSync(file));
    });
  },
};

// Same theme-plugin setup as the e2e harness; Atmo's own CSS is imported directly by the frames.
const themeFixtureRoot = resolve(root, "tests/e2e/fixtures/theme-nesting");
const themes = synCloudOS({ webspringEntry: false, themesDirectory: "Themes" });
const configureThemes = themes.configResolved;
themes.configResolved = function (config: unknown) { return configureThemes.call(this, { ...(config as object), root: themeFixtureRoot }); };

const appThemeModule = "virtual:atmo-lab/app-themes";
const appThemeStylePrefix = "virtual:atmo-lab/app-theme-style/";
const toFileImport = (path: string) => "/@fs/" + normalizePath(path);
const appThemes: Plugin = {
  name: "atmo-lab-app-themes",
  resolveId(id) {
    if (id === appThemeModule || id.startsWith(appThemeStylePrefix)) return "\0" + id;
  },
  load(id) {
    if (id !== "\0" + appThemeModule && !id.startsWith("\0" + appThemeStylePrefix)) return;
    const bundles = discoverThemeBundles(resolve(workingTreeSpecimens, "AppThemes"), { kind: "app" });
    for (const bundle of bundles) for (const file of bundle.files) this.addWatchFile(file);
    if (id === "\0" + appThemeModule) {
      const selected = new Set(bundles.map(bundle => bundle.theme.bundleIdentifier));
      return themeModuleSource(bundles, selected, toFileImport, appThemeStylePrefix);
    }
    const identifier = id.slice(appThemeStylePrefix.length + 1, -4);
    const bundle = bundles.find(candidate => candidate.theme.bundleIdentifier === identifier);
    if (!bundle) throw new Error("Unknown Atmo Lab app theme: " + identifier);
    return themeStylesheet(bundle, toFileImport);
  },
};

export default defineConfig({
  root,
  plugins: [react(), themes, appThemes, atmoLab],
  optimizeDeps: { entries: ["tests/atmo-lab/index.html", "tests/atmo-lab/frame.html"] },
  server: { host: "127.0.0.1", port: 5391, strictPort: true, fs: { allow: [root] } },
});
