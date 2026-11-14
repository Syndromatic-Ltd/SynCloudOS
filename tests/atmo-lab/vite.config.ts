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

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { synCloudOS } from "../../scripts/synware/vite-plugin.mjs";
import { synWarePackageName, synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";

// Atmo Lab: the frozen theme on the left, the working tree on the right, in one server.
const root = resolve(import.meta.dirname, "../..");
const labRoot = resolve(import.meta.dirname);
const baseRef = (process.env.ATMO_LAB_BASE ?? readFileSync(resolve(labRoot, "BASE"), "utf8")).trim();
const baselineRoot = resolve(root, ".artifacts/atmo-lab", `baseline-${baseRef}`);
const mirroredLab = resolve(baselineRoot, "tests/atmo-lab");
const snapshotPaths = ["src", "tests/fixtures", "tests/e2e/fixtures/theme-baseline", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json"];

// The baseline is a read-only export of BASE, so committing our work never moves it.
function ensureBaseline() {
  if (existsSync(resolve(baselineRoot, "tsconfig.app.json"))) return;
  mkdirSync(baselineRoot, { recursive: true });
  const archive = resolve(baselineRoot, "baseline.tar");
  execFileSync("git", ["-c", "core.longpaths=true", "archive", "--format=tar", "-o", archive, baseRef, ...snapshotPaths], { cwd: root, stdio: "inherit" });
  // Relative paths: GNU tar on Windows reads "C:" as a remote host.
  execFileSync("tar", ["-xf", "baseline.tar"], { cwd: baselineRoot, stdio: "inherit" });
  rmSync(archive);
}

// Specimens are mirrored into the snapshot so both sides render the same pages against their own source.
const mirrorable = (file: string) => /\.(tsx?|css|html)$/.test(file) && !file.endsWith("vite.config.ts");
function mirrorFile(file: string) {
  const target = resolve(mirroredLab, relative(labRoot, file));
  mkdirSync(resolve(target, ".."), { recursive: true });
  cpSync(file, target);
}
function mirrorAll(directory = labRoot) {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
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
  },
};

// Same theme-plugin setup as the e2e harness; Atmo's own CSS is imported directly by the frames.
const themeFixtureRoot = resolve(root, "tests/e2e/fixtures/theme-nesting");
const themes = synCloudOS({ webspringEntry: false, themesDirectory: "Themes" });
const configureThemes = themes.configResolved;
themes.configResolved = function (config: unknown) { return configureThemes.call(this, { ...(config as object), root: themeFixtureRoot }); };

export default defineConfig({
  root,
  plugins: [react(), themes, atmoLab],
  optimizeDeps: { entries: ["tests/atmo-lab/index.html", "tests/atmo-lab/frame.html"] },
  server: { host: "127.0.0.1", port: 5391, strictPort: true, fs: { allow: [root] } },
});
