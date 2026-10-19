#!/usr/bin/env node
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

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { synWareSdkEntries, synWareSdkGeneratedStyles, synWareSdkStyles, synWarePackageName } from "./sdk-entries.mjs";
import react from "@vitejs/plugin-react";
import {
  assertReviewedPackageFiles, assertSdkSourceUnchanged, assertTwelveFxPackageExports,
  captureSdkSourceFingerprint, createSdkPackageManifest, fingerprintSdkFiles, sdkDirectoryFiles,
} from "./sdk-package-manifest.mjs";
import { sdkNeutralStyleModuleSource, sdkPackageStyles } from "./sdk-package-styles.mjs";
import { sdkBrowserDependencies } from "./sdk-browser-dependencies.mjs";
import { assertPublicApiBoundaries } from "./public-api-boundaries.mjs";
import { writeDeveloperSdkData, writeDeveloperMcpPackage } from "../developer-mcp/build-package.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const outputRoot = resolve(repositoryRoot, ".artifacts/synapp-sdk");
const declarationRoot = resolve(outputRoot, "declarations");
const packageRoot = resolve(outputRoot, "packages");
const archiveRoot = resolve(outputRoot, "archives");

// Include the notices of packages actually incorporated into the distributable.
// Worker-only libraries and the precompiled manifest helpers are included too.
function bundledDependencyNotices() {
  return {
    name: "syncloudos-bundled-dependency-notices",
    generateBundle() {
      const roots = new Set(["ajv", "ajv-formats", "pdfjs-dist", "woff2-encoder"]
        .map(name => resolve(repositoryRoot, "node_modules", name)));
      for (const id of this.getModuleIds()) {
        if (id.includes("\0")) continue;
        const clean = id.replaceAll("\\", "/").split("?")[0];
        const marker = "/node_modules/";
        const index = clean.lastIndexOf(marker);
        if (index < 0) continue;
        const parts = clean.slice(index + marker.length).split("/");
        const count = parts[0].startsWith("@") ? 2 : 1;
        roots.add(clean.slice(0, index + marker.length) + parts.slice(0, count).join("/"));
      }
      const records = [];
      const emittedNotices = new Map();
      const recordedPackages = new Set();
      const missingNotices = [];
      for (const root of [...roots].sort()) {
        const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
        const slug = manifest.name.replaceAll("@", "").replaceAll("/", "-");
        const packageKey = `${manifest.name}@${manifest.version}`;
        const noticeDirectory = `${slug}-${manifest.version}`;
        let noticeRoot = root;
        const noticeFiles = directory => readdirSync(directory, { withFileTypes: true })
          .filter(entry => entry.isFile() && /^(?:(?:MIT|APACHE|BSD)[.-])?(?:LICEN[CS]E|COPYING|NOTICE)(?:[.-].*)?$/iu.test(entry.name)
            && !entry.name.endsWith(".json")).map(entry => entry.name);
        let notices = noticeFiles(noticeRoot);
        if (!notices.length) {
          noticeRoot = resolve(repositoryRoot, "licenses/dependencies", slug);
          notices = existsSync(noticeRoot) ? noticeFiles(noticeRoot) : [];
        }
        if (!notices.length) { missingNotices.push(manifest.name); continue; }
        const files = [];
        for (const notice of notices.sort()) {
          const fileName = `licenses/dependencies/${noticeDirectory}/${notice}`;
          const source = readFileSync(resolve(noticeRoot, notice));
          const digest = createHash("sha256").update(source).digest("hex");
          const previous = emittedNotices.get(fileName);
          if (previous && previous !== digest) throw new Error(`Conflicting upstream notice: ${fileName}`);
          if (!previous) this.emitFile({ type: "asset", fileName, source });
          emittedNotices.set(fileName, digest);
          files.push(fileName);
        }
        if (!recordedPackages.has(packageKey)) {
          records.push({ name: manifest.name, version: manifest.version, license: manifest.license, notices: files });
          recordedPackages.add(packageKey);
        }
      }
      if (missingNotices.length) throw new Error(`Bundled dependencies need reviewed upstream notices: ${missingNotices.join(", ")}`);
      records.sort((a, b) => a.name.localeCompare(b.name, "en") || a.version.localeCompare(b.version, "en"));
      this.emitFile({ type: "asset", fileName: "licenses/dependencies.json", source: JSON.stringify(records, null, 2) + "\n" });
    },
  };
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runDeclarationBuild() {
  const tsc = resolve(repositoryRoot, "node_modules/typescript/bin/tsc");
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.sdk.json"], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
}
async function bundle({ entry, packageDirectory, themeNames }) {
  const escapedPackageName = synWarePackageName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const browserDependencies = sdkBrowserDependencies(repositoryRoot);
  const publicAliases = [
    ...browserDependencies.aliases,
    ...Object.entries(synWareSdkEntries).map(([name, source]) => ({
      find: new RegExp(`^${escapedPackageName}/${name}$`, "u"),
      replacement: resolve(repositoryRoot, source),
    })),
    ...Object.entries(synWareSdkStyles).map(([name, source]) => ({
      find: new RegExp(`^${escapedPackageName}/${name}$`, "u"),
      replacement: resolve(repositoryRoot, source),
    })),
    {
      find: new RegExp(`^${escapedPackageName}/nse/styles\\.css$`, "u"),
      replacement: resolve(repositoryRoot, "src/NSE/public/styles.css"),
    },
  ];
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build({
      configFile: false,
      base: "./",
      publicDir: false,
      mode: "production",
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      resolve: { alias: publicAliases },
      esbuild: { jsxDev: false },
      plugins: [react(), bundledDependencyNotices(), sdkPackageStyles({
        themeNames,
        publicStyleEntries: synWareSdkGeneratedStyles,
        frameworkPublicDirectory: resolve(repositoryRoot, "public"),
      })],
      build: {
      emptyOutDir: false,
      copyPublicDir: false,
      // Portable consumers must receive framework-owned icons, textures and
      // other binary resources as normal package assets. Keeping them out of
      // data URLs preserves inspectable resource ownership and avoids turning
      // shared NSE styles/chunks into multi-megabyte base64 blobs.
      assetsInlineLimit: 0,
      outDir: packageDirectory,
      sourcemap: true,
      cssCodeSplit: true,
      lib: {
        entry,
        formats: ["es"],
        fileName: (_format, entryName) => `${entryName}.js`,
      },
      rollupOptions: {
        external: browserDependencies.external,
        output: {
          sourcemapExcludeSources: false,
          banner: "/*! SynCloudOS: AGPL-3.0-or-later; SynWare SDK source: Apache-2.0. See LICENSE, NOTICE and licenses/. */",
          // Keep the runtime entry itself in a stable chunk without pulling its
          // entire transitive dependency graph (including AppSDK/AJV) into
          // otherwise independent public entries such as fx/graphics.
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            const moduleId = id.replaceAll("\\", "/");
            if (
              moduleId.endsWith("/src/SynCloudOS/SynCloudOS.ts")
              || moduleId.endsWith("/src/SynCloudOS/Runtime/createSynCloudOS.ts")
            ) {
              return "syncloudos-runtime";
            }
            return undefined;
          },
          chunkFileNames: ({ name }) => {
            const safeName = name.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
            return `chunks/${safeName || "chunk"}-[hash].js`;
          },
          assetFileNames: (asset) => {
            const name = (asset.names?.[0] ?? "asset").replace(/\.[^.]+$/u, "").replace(/[^A-Za-z0-9_-]+/gu, "-");
            return `assets/${name}-[hash][extname]`;
          },
        },
      },
      },
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

function packageFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === "package.json" && prefix === "") return [];
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return packageFiles(resolve(directory, entry.name), relative);
      return entry.isFile() ? [relative] : [];
    })
    .sort();
}

function rewriteDeclarationSpecifiers(directory, typesRoot = directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      rewriteDeclarationSpecifiers(path, typesRoot);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".d.ts")) continue;
    const source = readFileSync(path, "utf8");
    const rewritten = source.replace(/((?:from|import)\s*\(?\s*["'])(\.{1,2}(?:\/[^"']+)?|src\/(?:FX|NSE|SynCloudOS|SynCloudOSReact|Webspring)\/[^"']+)(["'])/gu, (_match, before, specifier, after) => {
      // Package-scoped source metadata can make TypeScript infer baseUrl imports.
      // Installed declarations must resolve within their own relocated type tree.
      let portable = specifier;
      if (specifier.startsWith("src/")) {
        portable = relative(dirname(path), resolve(typesRoot, specifier.slice(4))).replaceAll("\\", "/");
        if (!portable.startsWith(".")) portable = `./${portable}`;
      }
      if (/\.json$/u.test(portable)) return `${before}${portable}${after}`;
      const extensionless = portable.replace(/\.[cm]?js$/u, "");
      const directDeclaration = resolve(dirname(path), `${extensionless}.d.ts`);
      const indexDeclaration = resolve(dirname(path), extensionless, "index.d.ts");
      if (existsSync(directDeclaration)) return `${before}${extensionless}.js${after}`;
      if (existsSync(indexDeclaration)) return `${before}${extensionless}/index.js${after}`;
      if (specifier.startsWith("src/")) throw new TypeError(`Missing installed declaration target: ${specifier}`);
      return `${before}${portable}${after}`;
    });
    if (rewritten !== source) writeFileSync(path, rewritten, "utf8");
  }
}


function assertNoLeakage(directory) {
  for (const file of packageFiles(directory)) {
    if (!/\.(?:js|mjs|ts|mts|css|json|md|map)$/u.test(file)) continue;
    const text = readFileSync(resolve(directory, file), "utf8");
    // PDF.js's Emscripten codec uses this fixed virtual filesystem home; it is not a build-machine path.
    let pathScanText = /^assets\/(?:pdf\.worker\.min|pdf-document\.worker)-[A-Za-z0-9_-]+\.js$/u.test(file)
      ? text.replaceAll('HOME:"/home/web_user"', 'HOME:"<wasm-virtual-home>"')
      : text;
    if (file.endsWith(".map")) {
      const map = JSON.parse(text);
      if (map.version !== 3 || !Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)
        || map.sources.length !== map.sourcesContent.length || map.sourcesContent.some(source => typeof source !== "string")) {
        throw new TypeError(`SDK source map must embed its original sources: ${file}.`);
      }
      if ([map.sourceRoot ?? "", ...map.sources].some(path => typeof path !== "string" || /^(?:[A-Za-z]:[\\/]|[\\/])/u.test(path))) {
        throw new TypeError(`SDK source map leaked an absolute local path in ${file}.`);
      }
      // Original source text can contain path examples. Only map metadata
      // describes build inputs and must not expose a build-machine path.
      pathScanText = JSON.stringify({ sourceRoot: map.sourceRoot, sources: map.sources });
    }
    if (pathScanText.includes(repositoryRoot) || /(?:^|[^A-Za-z])(?:[A-Za-z]:\\|\/Users\/|\/home\/)/u.test(pathScanText)) {
      throw new TypeError(`SDK package leaked an absolute local path in ${file}.`);
    }
  }
}

function writePackage({ directory, name, exports, dependencies = undefined }) {
  const licenseDirectory = resolve(directory, "licenses");
  mkdirSync(licenseDirectory, { recursive: true });
  for (const [source, target] of [
    ["src/FX/TextFX/vendor/LICENSE.harfbuzzjs", "harfbuzzjs.txt"],
    ["src/FX/TextFX/vendor/provenance.json", "harfbuzzjs-provenance.json"],
    ["node_modules/pdfjs-dist/LICENSE", "pdfjs-dist.txt"],
    ["node_modules/woff2-encoder/LICENSE", "woff2-encoder.txt"],
    ["node_modules/woff2-encoder/LICENSE-THIRD-PARTY", "woff2-third-party.txt"],
  ]) cpSync(resolve(repositoryRoot, source), resolve(licenseDirectory, target));
  for (const file of ["LICENSE", "NOTICE", "THIRD_PARTY.md", "ARTWORK.md"]) cpSync(resolve(repositoryRoot, file), resolve(directory, file));
  cpSync(resolve(repositoryRoot, "licenses"), resolve(directory, "licenses"), { recursive: true });
  mkdirSync(resolve(directory, "sdk"), { recursive: true });
  for (const file of ["LICENSE", "NOTICE", "package.json"]) {
    cpSync(resolve(repositoryRoot, "src/SynCloudOS/AppSDK", file), resolve(directory, "sdk", file));
  }
  writeFileSync(resolve(directory, "README.md"), `# SynCloudOS\n\nSynCloudOS 1.0 Public Beta, the web application framework for TypeScript and React 19.\n\nInstall ${name}; import app capabilities from ${name}/sdk and NSE from ${name}/nse or its documented framework entry points. Import ${name}/nse/styles.css once for portable NSE controls. Browser hosts that call mountSynCloudOS must also import ${name}/browser/styles.css for application-stage layout/chrome. Use mountSynCloudOS({ element, bundles, application: { id, frame } }) for one primary application without Webspring, or provide shell for the existing Webspring host. The application and shell modes are mutually exclusive. Configure Vite with synCloudOS({ webspringEntry: false }) for application mode. The primary fills the page (frame "fullscreen", the default) or keeps its manifest's presentation (frame "declared"); other registered bundles must present in windows and open from the primary through their routes. Every bundle declares a non-root entry route; the host maps / to the primary's route without redirecting. Authentication accepts the same policies and service object as Webspring: "required" presents the system login window before the primary launches, "optional" offers sign-in and Log Out in Preferences > Account, and "disabled" never offers Log Out. When the primary quits the host shows its icon, name and a Reopen button that starts a new session; it never relaunches on its own. Webspring hosts additionally import ${name}/webspring/styles.css for the Board launcher and shell views. All entry points share one module graph, including React contexts.\n\nFramework-owned resources referenced by public package entries are emitted with the package and remain module-relative when a consumer bundles them. Concrete NSE themes remain explicit imports, so consumers ship only the theme resources they select.\n`, "utf8");
  const files = packageFiles(directory);
  assertReviewedPackageFiles(files);
  const repositoryManifest = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  const peerDependencies = {
    react: repositoryManifest.dependencies?.react,
    "react-dom": repositoryManifest.dependencies?.["react-dom"],
  };
  if (Object.values(peerDependencies).some((version) => typeof version !== "string" || version.length === 0)) {
    throw new TypeError("SynWare SDK packages require explicit React and ReactDOM dependency ranges.");
  }
  writeFileSync(resolve(directory, "package.json"), `${JSON.stringify(createSdkPackageManifest({ name, exports, files, peerDependencies, dependencies }), null, 2)}\n`, "utf8");
  assertNoLeakage(directory);
}

function packPackage(directory) {
  const npmCli = process.env.npm_execpath ?? resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  const packed = JSON.parse(execFileSync(process.execPath, [npmCli, "pack", "--json", "--ignore-scripts"], {
    cwd: directory,
    encoding: "utf8",
  }));
  const record = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
  const filename = record?.filename;
  if (typeof filename !== "string") throw new TypeError("npm pack did not return an archive filename.");
  const temporary = resolve(directory, filename);
  const bytes = readFileSync(temporary);
  const archiveSha256 = createHash("sha256").update(bytes).digest("hex");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (record.integrity !== integrity) throw new Error("npm pack archive integrity disagrees with the written bytes.");
  const immutableName = filename.replace(/\.tgz$/u, `-${archiveSha256}.tgz`);
  const target = resolve(archiveRoot, immutableName);
  if (existsSync(target)) {
    if (hashFile(target) !== archiveSha256) throw new Error("Existing content-addressed SDK archive was modified.");
    rmSync(temporary);
  } else renameSync(temporary, target);
  return { archive: `archives/${immutableName}`, archiveSha256, integrity };
}

function commitHash() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

async function main() {
  assertPublicApiBoundaries(repositoryRoot);
  const source = captureSdkSourceFingerprint(repositoryRoot);
  const commit = commitHash();
  // Preserve published archives and receipts. Only scratch package/declaration output is replaced.
  for (const directory of [declarationRoot, packageRoot]) {
    if (dirname(directory) !== outputRoot) throw new Error("Refusing SDK cleanup outside its output root.");
    rmSync(directory, { recursive: true, force: true });
  }
  mkdirSync(packageRoot, { recursive: true });
  mkdirSync(archiveRoot, { recursive: true });
  runDeclarationBuild();

  const directory = resolve(packageRoot, "syncloudos");
  mkdirSync(directory, { recursive: true });
  const neutralStyleEntry = resolve(outputRoot, "neutral-styles-entry.mjs");
  writeFileSync(
    neutralStyleEntry,
    sdkNeutralStyleModuleSource(resolve(repositoryRoot, "src/NSE/public/styles.css"), neutralStyleEntry),
    "utf8",
  );
  const themeEntryNames = new Set(Object.keys(synWareSdkStyles).map((name) => name.replace(/\/styles\.css$/u, "")));
  const frameworkEntries = Object.fromEntries(Object.entries(synWareSdkEntries)
    .map(([name, source]) => [name, resolve(repositoryRoot, source)]));
  // One graph preserves React context identity. CSS is attached only to the
  // chunks that own it; importing NSE alone does not select any theme.
  await bundle({ entry: { ...frameworkEntries, "nse/styles": neutralStyleEntry }, packageDirectory: directory, themeNames: [...themeEntryNames] });
  const typesDirectory = resolve(directory, "types");
  cpSync(declarationRoot, typesDirectory, {
    recursive: true,
    // Meaningful browser fixtures stay in the source test tree, not the installed framework.
    filter: source => !source.replaceAll("\\", "/").includes("/FrameworkTests"),
  });
  rewriteDeclarationSpecifiers(typesDirectory);
  const exports = {};
  for (const [name, source] of Object.entries(synWareSdkEntries)) {
    const emittedDeclaration = resolve(typesDirectory, source.replace(/^src\//u, "").replace(/\.tsx?$/u, ".d.ts"));
    if (!existsSync(emittedDeclaration)) throw new Error(`SDK entry ${name} has no emitted declaration: ${emittedDeclaration}`);
    const declaration = `${name}.d.ts`;
    mkdirSync(dirname(resolve(directory, declaration)), { recursive: true });
    const depth = name.split("/").length - 1;
    const prefix = depth ? "../".repeat(depth) : "./";
    writeFileSync(resolve(directory, declaration), `export * from "${prefix}types/${source.replace(/^src\//u, "").replace(/\.tsx?$/u, ".js")}";\n`, "utf8");
    exports[`./${name}`] = { types: `./${declaration}`, import: `./${name}.js` };
  }
  exports["./nse/styles.css"] = "./nse/styles.css";
  for (const name of Object.keys(synWareSdkStyles)) exports[`./${name}`] = `./${name}`;
  for (const name of Object.keys(synWareSdkGeneratedStyles)) exports[`./${name}`] = `./${name}`;
  mkdirSync(resolve(typesDirectory, "NSE/Typography"), { recursive: true });
  for (const extension of ["mjs", "d.mts"]) cpSync(resolve(repositoryRoot, `src/NSE/Typography/fontDeclaration.${extension}`), resolve(typesDirectory, `NSE/Typography/fontDeclaration.${extension}`));
  writeFileSync(resolve(directory, "vite.mjs"), readFileSync(resolve(repositoryRoot, "scripts/synware/vite-plugin.mjs"), "utf8").replace("../../src/NSE/Typography/fontDeclaration.mjs", "./types/NSE/Typography/fontDeclaration.mjs"));
  cpSync(resolve(repositoryRoot, "scripts/synware/bundle-paths.mjs"), resolve(directory, "bundle-paths.mjs"));
  cpSync(resolve(repositoryRoot, "scripts/synware/vite-plugin.d.mts"), resolve(typesDirectory, "vite.d.mts"));
  exports["./vite"] = { types: "./types/vite.d.mts", import: "./vite.mjs" };
  if (!existsSync(resolve(directory, "nse/styles.css"))) throw new Error("SynWare SDK did not emit its required NSE stylesheet.");
  for (const name of Object.keys(synWareSdkGeneratedStyles)) {
    if (!existsSync(resolve(directory, name))) throw new Error(`SynWare SDK did not emit required package stylesheet ${name}.`);
  }
  const repositoryManifest = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  // These libraries occur in emitted public declarations even when runtime code is bundled.
  const dependencies = Object.fromEntries(["@floating-ui/dom", "@tiptap/pm", "framer-motion", "harfbuzzjs", "oauth4webapi", "pdf-lib", "woff2-encoder"].map((name) => [name, repositoryManifest.dependencies[name]]));
  assertTwelveFxPackageExports(exports);
  await writeDeveloperSdkData({ repositoryRoot, directory, commit, source });
  writePackage({ directory, name: synWarePackageName, exports, dependencies });
  const resources = fingerprintSdkFiles(directory, sdkDirectoryFiles(directory));
  const artifact = packPackage(directory);
  const mcpDirectory = resolve(packageRoot, "syncloudos-developer-mcp");
  const sdkVersion = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")).version;
  const mcpPackage = writeDeveloperMcpPackage({ repositoryRoot, directory: mcpDirectory, sdkVersion });
  assertNoLeakage(mcpDirectory);
  const developerMcp = { package: mcpPackage.name, version: sdkVersion, ...packPackage(mcpDirectory) };
  const entries = Object.fromEntries(Object.keys(synWareSdkEntries).map((name) => [
    `${synWarePackageName}/${name}`,
    { archive: artifact.archive, index: hashFile(resolve(directory, `${name}.js`)), types: hashFile(resolve(directory, `${name}.d.ts`)) },
  ]));
  assertSdkSourceUnchanged(source, captureSdkSourceFingerprint(repositoryRoot));
  if (commitHash() !== commit) throw new Error("SDK HEAD changed during build; no manifest published.");
  const manifest = { schemaVersion: 2, commit, package: synWarePackageName, ...artifact, source, resources, entries, developerMcp };
  const pendingManifest = resolve(outputRoot, `build-manifest.${process.pid}.tmp`);
  writeFileSync(pendingManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  renameSync(pendingManifest, resolve(outputRoot, "build-manifest.json"));
  process.stdout.write(`built SynWare SDK archives at ${archiveRoot}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
