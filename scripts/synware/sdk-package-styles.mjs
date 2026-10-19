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
import { dirname, posix, relative, resolve, sep } from "node:path";

const normalise = (value) => value.replaceAll("\\", "/");
const specifier = (from, to) => {
  const path = posix.relative(posix.dirname(from), to);
  return path.startsWith(".") ? path : `./${path}`;
};

function rewriteFrameworkAssetUrls(source, sourcePath, publicDirectory) {
  if (!source.includes("/assets/")) return source;
  return source.replace(/url\(\s*(["']?)(\/assets\/[^"'()]+)\1\s*\)/gu, (match, quote, rawUrl) => {
    const hashIndex = rawUrl.indexOf("#");
    const withoutHash = hashIndex < 0 ? rawUrl : rawUrl.slice(0, hashIndex);
    const hash = hashIndex < 0 ? "" : rawUrl.slice(hashIndex);
    const queryIndex = withoutHash.indexOf("?");
    const pathname = queryIndex < 0 ? withoutHash : withoutHash.slice(0, queryIndex);
    const query = queryIndex < 0 ? "" : withoutHash.slice(queryIndex + 1);
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new TypeError(`SDK stylesheet ${sourcePath} contains an invalid framework asset URL: ${rawUrl}`);
    }
    const assetPath = resolve(publicDirectory, `.${decoded}`);
    if (assetPath !== publicDirectory && !assetPath.startsWith(`${publicDirectory}${sep}`)) {
      throw new TypeError(`SDK stylesheet ${sourcePath} escapes the framework public directory: ${rawUrl}`);
    }
    if (!existsSync(assetPath)) {
      throw new TypeError(`SDK stylesheet ${sourcePath} references a missing framework asset: ${rawUrl}`);
    }
    let moduleRelative = normalise(relative(dirname(sourcePath), assetPath));
    if (!moduleRelative.startsWith(".")) moduleRelative = `./${moduleRelative}`;
    const delimiter = quote || '"';
    const suffix = `?no-inline${query ? `&${query}` : ""}${hash}`;
    return `url(${delimiter}${moduleRelative}${suffix}${delimiter})`;
  });
}

export function sdkNeutralStyleModuleSource(stylesheetPath, entryPath) {
  const source = readFileSync(stylesheetPath, "utf8");
  const importPattern = /^\s*@import\s+["']([^"']+)["']\s*;\s*$/gmu;
  const imports = [...source.matchAll(importPattern)];
  const residual = source
    .replace(importPattern, "")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .trim();
  if (residual.length > 0) {
    throw new TypeError(`SDK neutral stylesheet ${stylesheetPath} must contain only comments and @import rules.`);
  }
  if (imports.length === 0) throw new TypeError(`SDK neutral stylesheet ${stylesheetPath} contains no imports.`);
  return `${imports.map((match) => {
    const specifierText = match[1];
    if (!specifierText.startsWith(".")) {
      throw new TypeError(`SDK neutral stylesheet ${stylesheetPath} contains a non-relative import: ${specifierText}`);
    }
    const imported = resolve(dirname(stylesheetPath), specifierText);
    if (!existsSync(imported)) throw new TypeError(`SDK neutral stylesheet import does not exist: ${imported}`);
    let moduleRelative = normalise(relative(dirname(entryPath), imported));
    if (!moduleRelative.startsWith(".")) moduleRelative = `./${moduleRelative}`;
    return `import ${JSON.stringify(moduleRelative)};`;
  }).join("\n")}\n`;
}

const cssImportPattern = /(?:^|[;\n])\s*import\s*["'][^"']+\.css["']/u;

/**
 * Chunks Node loads when it imports an SDK entry: every chunk statically
 * reachable from a code entry. Theme entries are the only entries that
 * select styles by import, so they are excluded; dynamic imports are browser
 * load boundaries and are not followed.
 */
export function sdkNodeLoadableChunks(output, themeEntryFiles) {
  const loadable = new Set();
  const pending = Object.values(output)
    .filter((chunk) => chunk.type === "chunk" && chunk.isEntry && !themeEntryFiles.has(chunk.fileName))
    .map((chunk) => chunk.fileName);
  while (pending.length) {
    const fileName = pending.pop();
    const chunk = output[fileName];
    if (loadable.has(fileName) || chunk?.type !== "chunk") continue;
    loadable.add(fileName);
    pending.push(...chunk.imports);
  }
  return loadable;
}

/** Fail the build when Node could reach a stylesheet import from a code entry. */
export function assertSdkNodeLoadableChunksImportNoCss(output, themeEntryFiles) {
  const offenders = [...sdkNodeLoadableChunks(output, themeEntryFiles)]
    .filter((fileName) => cssImportPattern.test(output[fileName].code));
  if (offenders.length) {
    throw new Error(`SDK chunks reachable from Node-loadable entries must not import CSS: ${offenders.sort().join(", ")}.`);
  }
}

/** Preserve per-module CSS ownership after Vite extracts library styles. */
export function sdkPackageStyles({ themeNames, publicStyleEntries = {}, frameworkPublicDirectory = undefined }) {
  let publicDirectory;
  return {
    name: "synware-sdk-package-styles",
    enforce: "pre",
    configResolved(config) {
      const configuredPublicDirectory = frameworkPublicDirectory ?? config.publicDir;
      if (typeof configuredPublicDirectory !== "string" || configuredPublicDirectory.length === 0) {
        throw new TypeError("SynWare SDK packaging requires an explicit framework public directory.");
      }
      publicDirectory = resolve(configuredPublicDirectory);
    },
    transform(source, id) {
      const sourcePath = id.split("?", 1)[0];
      if (!sourcePath.endsWith(".css")) return null;
      let rewritten = rewriteFrameworkAssetUrls(source, sourcePath, publicDirectory);
      // Theme vectors are paint resources, not stylesheet text. Keeping them
      // separate lets browsers fetch only the control states actually painted.
      rewritten = rewritten.replace(/url\(\s*(["'])(data:image\/svg\+xml(?:;charset=utf-8)?,[\s\S]*?)\1\s*\)/gu,
        (_match, _quote, dataUrl) => {
          const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
          const reference = this.emitFile({ type: "asset", name: "nse-vector.svg", source: svg });
          // Preserve this boundary through the consuming application's build too.
          return `url("__VITE_ASSET__${reference}__?no-inline")`;
        });
      return rewritten === source ? null : { code: rewritten, map: null };
    },
    generateBundle(_options, output) {
      const cssFor = (fileName, visited = new Set()) => {
        if (visited.has(fileName)) return [];
        visited.add(fileName);
        const chunk = output[fileName];
        if (chunk?.type !== "chunk") return [];
        return [...new Set([
          ...chunk.imports.flatMap((dependency) => cssFor(dependency, visited)),
          ...(chunk.viteMetadata?.importedCss ?? []),
        ])];
      };
      const published = new Set();
      const publishStyles = (fileName, dependencies) => {
        const styles = [...new Set(dependencies)];
        if (styles.length === 0) throw new Error(`SDK stylesheet ${fileName} has no emitted inputs.`);
        if (output[fileName]) throw new Error(`SDK stylesheet collision at ${fileName}.`);
        for (const style of styles) published.add(style);
        this.emitFile({ type: "asset", fileName, source: styles.map((dependency) =>
          `@import ${JSON.stringify(specifier(fileName, dependency))};`).join("\n") + "\n" });
      };
      const prependStyleImports = (chunk, styles) => {
        if (!styles.length) return;
        chunk.code = styles.map(css =>
          `import ${JSON.stringify(specifier(chunk.fileName, css))};`).join("\n") + "\n" + chunk.code;
        if (chunk.map) {
          chunk.map.mappings = ";".repeat(styles.length) + chunk.map.mappings;
          const mapAsset = output[`${chunk.fileName}.map`];
          if (mapAsset?.type === "asset") mapAsset.source = chunk.map.toString();
        }
      };
      const neutral = cssFor("nse/styles.js");
      if (neutral.length === 0) throw new Error("Expected the neutral NSE style entry to own emitted CSS.");
      publishStyles("nse/styles.css", neutral);
      delete output["nse/styles.js"];
      for (const [fileName, entryName] of Object.entries(publicStyleEntries)) {
        publishStyles(fileName, cssFor(`${entryName}.js`));
      }
      const themeEntryFiles = new Set(themeNames.map((name) => `${name}.js`));
      for (const name of themeNames) {
        const entryFile = `${name}.js`;
        const styles = cssFor(entryFile);
        publishStyles(`${name}/styles.css`, styles);
        const chunk = output[entryFile];
        if (chunk?.type !== "chunk") throw new Error(`SDK theme entry ${entryFile} was not emitted.`);
        // Importing a theme selects its styles, including those of shared chunks.
        prependStyleImports(chunk, styles);
      }
      // Vite library builds extract CSS without retaining its JS import.
      // Node loads code entries and their static graph, so that CSS reaches
      // browsers only through the published stylesheets. Chunks behind a
      // dynamic import (the Webspring shell App) load only in browsers and keep
      // owning their CSS, so it is fetched when the shell is mounted.
      const nodeLoadable = sdkNodeLoadableChunks(output, themeEntryFiles);
      for (const chunk of Object.values(output)) {
        if (chunk.type !== "chunk" || themeEntryFiles.has(chunk.fileName)) continue;
        const styles = [...(chunk.viteMetadata?.importedCss ?? [])];
        if (!nodeLoadable.has(chunk.fileName)) {
          prependStyleImports(chunk, styles);
          continue;
        }
        const unpublished = styles.filter((style) => !published.has(style));
        if (unpublished.length) {
          throw new Error(`SDK chunk ${chunk.fileName} is Node-loadable but its CSS is in no published stylesheet: ${unpublished.join(", ")}.`);
        }
      }
      assertSdkNodeLoadableChunksImportNoCss(output, themeEntryFiles);
    },
  };
}
