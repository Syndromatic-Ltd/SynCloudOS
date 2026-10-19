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

import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, relative, dirname, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "vite";
import { sdkPackageStyles } from "../../scripts/synware/sdk-package-styles.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const areas = ["FX", "NSE", "SynCloudOS", "SynCloudOSReact", "Webspring"];
function sources(directory, extension = /\.tsx?$/) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sources(path, extension) : extension.test(path) ? [path] : [];
  });
}

test("framework source does not fetch assets from the consumer origin root", () => {
  const offenders = areas.flatMap((area) => sources(resolve(root, "src", area)))
    .filter((path) => {
      let source = readFileSync(path, "utf8");
      // Unused legacy configuration, not a framework resource fetch.
      if (relative(root, path).replaceAll("\\", "/") === "src/SynCloudOS/Config/Config.ts") {
        source = source.replace('assetBaseUrl: "/assets"', "");
      }
      return /["'`]\/assets(?:\/|["'`])/.test(source);
    })
    .map((path) => relative(root, path));
  assert.deepEqual(offenders, []);
});

test("all authored CSS asset URLs rewrite to existing framework-owned resources", () => {
  const plugin = sdkPackageStyles({ themeNames: [], frameworkPublicDirectory: resolve(root, "public") });
  plugin.configResolved({ publicDir: false });
  const stripUrls = (source) => source.replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/g, "url()");
  const stylesheets = areas.flatMap((area) => sources(resolve(root, "src", area), /\.css$/));
  let count = 0;
  for (const path of stylesheets) {
    const source = readFileSync(path, "utf8");
    const rewritten = plugin.transform.call({ emitFile: () => "vector-resource" }, source, path)?.code ?? source;
    assert.equal(stripUrls(rewritten), stripUrls(source), `CSS declarations changed: ${path}`);
    for (const match of source.matchAll(/url\(\s*["']?(\/assets\/[^"'()]+)["']?\s*\)/g)) {
      count++;
      assert.ok(!/url\(\s*["']?\/assets\//.test(rewritten), `unrewritten asset: ${path}: ${match[1]}`);
    }
    for (const match of rewritten.matchAll(/url\(\s*["']?([^"'()]+\?no-inline)["']?\s*\)/g)) {
      const asset = fileURLToPath(new URL(match[1], pathToFileURL(path)));
      assert.ok(readFileSync(asset).length > 0, `missing or empty package resource: ${asset}`);
    }
  }
  assert.ok(count > 0, "the real CSS asset rewrite must be exercised");
});

test("CSS-only package emits browser runtime rules and relocatable artwork", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "syncloudos-css-portability-"));
  try {
    const stylesheets = areas.flatMap((area) => sources(resolve(root, "src", area), /\.css$/))
      .filter((path) => /url\(\s*["']?\/assets\//.test(readFileSync(path, "utf8")));
    const neutralEntry = resolve(directory, "neutral.ts");
    const browserEntry = resolve(directory, "browser.ts");
    const importCss = (path) => `import ${JSON.stringify(path.replaceAll("\\", "/"))};`;
    writeFileSync(neutralEntry, stylesheets.map(importCss).join("\n"));
    writeFileSync(browserEntry, importCss(resolve(root, "src/SynCloudOS/styles/runtime.css")));
    const result = await build({
      root, configFile: false, publicDir: false, base: "./", logLevel: "silent",
      plugins: [sdkPackageStyles({
        themeNames: [], publicStyleEntries: { "browser/styles.css": "browser" },
        frameworkPublicDirectory: resolve(root, "public"),
      })],
      build: {
        write: false, copyPublicDir: false, assetsInlineLimit: 0, cssCodeSplit: true,
        lib: { entry: { "nse/styles": neutralEntry, browser: browserEntry }, formats: ["es"], fileName: (_, name) => `${name}.js` },
        rollupOptions: { output: { assetFileNames: "assets/[name]-[hash][extname]" } },
      },
    });
    const output = new Map((Array.isArray(result) ? result[0] : result).output.map((item) => [item.fileName, item]));
    const packageBase = new URL("https://example.invalid/nested/relocated-package/");
    const collected = new Set();
    function cssAt(file) {
      if (collected.has(file)) return "";
      collected.add(file);
      const asset = output.get(file);
      assert.equal(asset?.type, "asset", `missing packaged CSS: ${file}`);
      const source = String(asset.source);
      const resolveAsset = (specifier) => {
        const url = new URL(specifier, new URL(file, packageBase));
        assert.ok(url.href.startsWith(packageBase.href), `asset escaped relocated package: ${url}`);
        const target = decodeURIComponent(url.pathname.slice(packageBase.pathname.length));
        assert.ok(output.has(target), `missing emitted resource: ${target}`);
        return target;
      };
      for (const match of source.matchAll(/url\(\s*["']?([^"'()]+)["']?\s*\)/g)) {
        if (!match[1].startsWith("data:") && !match[1].startsWith("#")) resolveAsset(match[1]);
      }
      return source + [...source.matchAll(/@import\s+"([^"]+)"/g)]
        .map((match) => cssAt(resolveAsset(match[1]))).join("\n");
    }
    const browser = cssAt("browser/styles.css");
    assert.match(browser, /\.syncloudos-login-gate/);
    assert.match(browser, /\.syncloudos-login-backdrop/);
    assert.match(browser, /prefers-reduced-motion/);
    cssAt("nse/styles.css");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("browser runtime owns the generic runtime stylesheet", () => {
  const runtime = readFileSync(resolve(root, "src/SynCloudOSReact/browserRuntime.tsx"), "utf8");
  assert.ok(/import\s+["']\.\.\/SynCloudOS\/styles\/runtime\.css["']/.test(runtime));
});

test("framework artwork survives an isolated Vite library build and relocation without public files", async () => {
  const modules = [
    "src/SynCloudOS/Resources/frameworkAssets.ts",
    "src/NSE/SystemUI/LoginWindow/loginWindowAssets.ts",
  ];
  const directory = mkdtempSync(resolve(tmpdir(), "syncloudos-asset-portability-"));
  const entry = resolve(directory, "framework-assets-probe.ts");
  try {
    writeFileSync(entry, modules.map((path, index) =>
      `export * as module${index} from ${JSON.stringify(resolve(root, path).replaceAll("\\", "/"))};`).join("\n"));
    // Only resource leaf modules: this does not run or overwrite the SDK build.
    const result = await build({
      root, configFile: false, publicDir: false, base: "./", logLevel: "silent",
      build: {
        write: false, copyPublicDir: false, assetsInlineLimit: 0,
        lib: { entry, formats: ["es"], fileName: () => "resources.mjs" },
        rollupOptions: { output: { assetFileNames: "assets/[name]-[hash][extname]" } },
      },
    });
    const output = (Array.isArray(result) ? result[0] : result).output;
    for (const item of output) {
      const target = resolve(directory, item.fileName);
      assert.ok(target.startsWith(directory + sep));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, item.type === "chunk" ? item.code : item.source);
    }
    const built = await import(pathToFileURL(resolve(directory, "resources.mjs")).href);
    const urls = new Set();
    function visit(value) {
      if (typeof value === "string" && value.startsWith("file:")) urls.add(value);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    }
    visit(built);
    const originals = new Map();
    for (const module of modules) {
      const source = readFileSync(resolve(root, module), "utf8");
      const references = [
        ...source.matchAll(/new URL\("([^"]+)"\s*,\s*import\.meta\.url\)/g),
        ...source.matchAll(/import\s+\w+\s+from\s+"([^"]+\?url[^\"]*)"/g),
      ];
      for (const match of references) {
        const resource = fileURLToPath(new URL(match[1], pathToFileURL(resolve(root, module))));
        originals.set(resource, readFileSync(resource));
      }
    }
    assert.ok(urls.size > 0, "framework resource URLs must be exported and emitted");
    assert.equal(originals.size, urls.size);
    const emitted = [...urls].map((url) => {
      const path = fileURLToPath(url);
      assert.ok(path.startsWith(directory + sep), `resource escaped the relocated package: ${url}`);
      assert.ok(!url.includes("?no-inline"), "build-only query must be removed");
      return readFileSync(path);
    });
    for (const [path, bytes] of originals) {
      assert.ok(emitted.some((asset) => asset.equals(bytes)), `original artwork changed or was omitted: ${path}`);
    }
  } finally {
    // directory is the absolute task-specific directory returned by mkdtempSync.
    rmSync(directory, { recursive: true, force: true });
  }
});
