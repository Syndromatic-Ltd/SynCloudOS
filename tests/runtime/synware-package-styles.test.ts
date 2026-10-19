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

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { assertSdkNodeLoadableChunksImportNoCss, sdkNeutralStyleModuleSource, sdkNodeLoadableChunks, sdkPackageStyles } from "../../scripts/synware/sdk-package-styles.mjs";

describe("installed SDK stylesheet ownership", () => {

  it("externalises vector paint so unused theme resources are not downloaded with CSS", async () => {
    const root = mkdtempSync(join(tmpdir(), "synware-vector-styles-"));
    try {
      mkdirSync(join(root, "src"));
      mkdirSync(join(root, "public"));
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M0 0h8v8H0z"/></svg>';
      writeFileSync(join(root, "src/paint.css"), `.paint { background: url('data:image/svg+xml,${encodeURIComponent(svg)}'); }`);
      writeFileSync(join(root, "src/neutral.css"), '@import "./paint.css";\n');
      const neutralEntry = join(root, "src/neutral.js");
      writeFileSync(neutralEntry, sdkNeutralStyleModuleSource(join(root, "src/neutral.css"), neutralEntry));
      const result = await build({
        root, configFile: false, logLevel: "silent", base: "./", publicDir: false,
        plugins: [sdkPackageStyles({ themeNames: [], frameworkPublicDirectory: join(root, "public") })],
        build: { write: false, cssCodeSplit: true, assetsInlineLimit: 0,
          lib: { entry: { "nse/styles": neutralEntry }, formats: ["es"], fileName: (_format, name) => `${name}.js` },
          rollupOptions: { output: { assetFileNames: "assets/[name]-[hash][extname]" } },
        },
      });
      const output = (Array.isArray(result) ? result[0] : result).output;
      const css = output.filter(file => file.type === "asset" && file.fileName.endsWith(".css")).map(file => String(file.source)).join("\n");
      expect(css).not.toContain("data:image/svg+xml");
      const image = output.find(file => file.type === "asset" && file.fileName.endsWith(".svg"));
      expect(image?.type === "asset" && String(image.source)).toBe(svg);
      expect(css).toContain(image?.fileName.split("/").at(-1));
      expect(css).toContain(".svg?no-inline");
      for (const file of output) {
        if (file.type !== "asset") continue;
        const target = join(root, "package", file.fileName);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.source);
      }
      writeFileSync(join(root, "consumer.js"), 'import "./package/nse/styles.css";');
      const consumer = await build({
        root, configFile: false, logLevel: "silent", publicDir: false,
        build: { write: false, rollupOptions: { input: join(root, "consumer.js") } },
      });
      const consumed = (Array.isArray(consumer) ? consumer[0] : consumer).output;
      expect(consumed.filter(file => file.type === "asset" && file.fileName.endsWith(".css"))
        .map(file => String(file.source)).join("\n")).not.toContain("data:image/svg+xml");
      expect(consumed.map(file => file.fileName)).toEqual(expect.arrayContaining([expect.stringMatching(/\.svg$/u)]));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("keeps app topbar disclosure paint owned by explicit themes", () => {
    const chrome = readFileSync(join(process.cwd(), "src/NSE/Windows/Chrome/nse-chrome.css"), "utf8");
    expect(chrome).not.toContain("/assets/nse/atmo/");
    expect(chrome).toContain("var(--nse-app-topbar-title-arrow-image, none)");

    for (const stylesheet of [
      "src/NSE/Themes/Atmo/Resources/atmo.css",
    ]) {
      expect(readFileSync(join(process.cwd(), stylesheet), "utf8"), stylesheet)
        .toContain("--nse-app-topbar-title-arrow-image");
    }
  });

  it("keeps the root stylesheet neutral and attaches selected theme CSS to its entry", async () => {
    const root = mkdtempSync(join(tmpdir(), "synware-package-styles-"));
    try {
      mkdirSync(join(root, "src"));
      mkdirSync(join(root, "public/assets/textures"), { recursive: true });
      writeFileSync(join(root, "src/neutral.css"), '@import "./material.css";\n');
      writeFileSync(join(root, "src/theme.css"), '[data-nse-appearance="sample"] { color: red; }');
      writeFileSync(
        join(root, "src/material.css"),
        '.semantic { display: flex; }\n.nested-material { background-image: url("/assets/textures/nested surface.png"); }',
      );
      writeFileSync(
        join(root, "src/host.css"),
        '.webspring-view-host { display: contents; background-image: url("/assets/textures/framework texture.png"); }',
      );
      writeFileSync(join(root, "public/assets/textures/framework texture.png"), "framework-texture");
      writeFileSync(join(root, "public/assets/textures/nested surface.png"), "nested-surface");
      const neutralEntry = join(root, "src/neutral-entry.js");
      writeFileSync(neutralEntry, sdkNeutralStyleModuleSource(join(root, "src/neutral.css"), neutralEntry));
      writeFileSync(join(root, "src/core.js"), "export const shared = {};");
      writeFileSync(join(root, "src/theme.js"), 'import "./theme.css"; export { shared } from "./core.js";');
      writeFileSync(join(root, "src/browser.js"), 'import "./host.css"; export { shared } from "./core.js"; export const loadShell = () => import("./shell.js");');
      writeFileSync(join(root, "src/shell.js"), 'import "./shell.css"; export const shell = true;');
      writeFileSync(join(root, "src/shell.css"), '.optional-shell { color: blue; }');
      const result = await build({ root, configFile: false, logLevel: "silent", base: "./",
        publicDir: false,
        plugins: [sdkPackageStyles({
          themeNames: ["nse/themes/sample"],
          publicStyleEntries: { "browser/styles.css": "browser" },
          frameworkPublicDirectory: join(root, "public"),
        })],
        build: { write: false, cssCodeSplit: true, minify: false, assetsInlineLimit: 0, sourcemap: true,
          lib: { entry: { nse: join(root, "src/core.js"), browser: join(root, "src/browser.js"), "nse/styles": neutralEntry, "nse/themes/sample": join(root, "src/theme.js") }, formats: ["es"], fileName: (_format, name) => `${name}.js` },
          rollupOptions: { output: { assetFileNames: "assets/[name]-[hash][extname]" } },
        },
      });
      const output = (Array.isArray(result) ? result[0] : result).output;
      const lazyShell = output.find(file => file.type === "chunk" && file.isDynamicEntry);
      expect(lazyShell?.type === "chunk" && lazyShell.code).toMatch(/import\s+["'][^"']+\.css["']/);
      expect(lazyShell?.type === "chunk" && lazyShell.map?.mappings).toMatch(/^;/);
      const shellMap = output.find(file => file.type === "asset" && file.fileName === `${lazyShell?.fileName}.map`);
      expect(shellMap?.type === "asset" && JSON.parse(String(shellMap.source)).mappings).toMatch(/^;/);
      const shellCss = output.find(file => file.type === "asset" && file.fileName.endsWith(".css") && String(file.source).includes(".optional-shell"));
      const browserStyles = output.find(file => file.fileName === "browser/styles.css");
      expect(browserStyles?.type === "asset" && String(browserStyles.source)).not.toContain(shellCss?.fileName ?? "missing-shell-css");
      const entry = output.find((file) => file.fileName === "nse/themes/sample.js");
      expect(entry?.type === "chunk" && entry.code).toMatch(/import\s+["'][^"']+\.css["']/);
      const core = output.find((file) => file.fileName === "nse.js");
      expect(core?.type === "chunk" && core.code).not.toMatch(/import\s+["'][^"']+\.css["']/);
      // Node loads the browser entry, so its CSS ships only through browser/styles.css.
      const browserEntry = output.find((file) => file.fileName === "browser.js");
      expect(browserEntry?.type === "chunk" && browserEntry.code).not.toMatch(/import\s+["'][^"']+\.css["']/);
      const neutral = output.find((file) => file.fileName === "nse/styles.css");
      expect(neutral?.type).toBe("asset");
      const rootCss = output.filter((file) => file.type === "asset" && file.fileName.endsWith(".css") && String(file.source).includes(".semantic"));
      expect(rootCss).toHaveLength(1);
      expect(rootCss[0].type === "asset" && String(rootCss[0].source)).not.toContain("sample");
      expect(output.some((file) => file.fileName === "nse/themes/sample/styles.css")).toBe(true);
      const hostStyles = output.find((file) => file.fileName === "browser/styles.css");
      expect(hostStyles?.type).toBe("asset");
      expect(hostStyles?.type === "asset" && String(hostStyles.source)).toMatch(/@import\s+["'][^"']+\.css["']/u);
      const ownedCss = output.find((file) => file.type === "asset" && file.fileName.endsWith(".css") && String(file.source).includes(".webspring-view-host"));
      expect(ownedCss).toBeTruthy();
      expect(hostStyles?.type === "asset" && String(hostStyles.source)).toContain(ownedCss?.fileName ?? "missing-owned-css");
      expect(ownedCss?.type === "asset" && String(ownedCss.source)).not.toContain("/assets/textures/framework");
      const emittedTexture = output.find((file) => file.type === "asset" && String(file.source) === "framework-texture");
      expect(emittedTexture?.type).toBe("asset");
      expect(emittedTexture?.type === "asset" && String(emittedTexture.source)).toBe("framework-texture");
      expect(ownedCss?.type === "asset" && String(ownedCss.source))
        .toMatch(/url\(["']\.\/framework%20texture-[A-Za-z0-9_-]+\.png["']\)/u);
      expect(rootCss[0]?.type === "asset" && String(rootCss[0].source)).not.toContain("/assets/textures/nested");
      const nestedTexture = output.find((file) => file.type === "asset" && String(file.source) === "nested-surface");
      expect(nestedTexture?.type).toBe("asset");
      expect(rootCss[0]?.type === "asset" && String(rootCss[0].source))
        .toMatch(/url\(["']\.\/nested%20surface-[A-Za-z0-9_-]+\.png["']\)/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("keeps CSS imports out of every chunk Node reaches from a code entry", () => {
    const chunk = (fileName: string, code: string, imports: string[] = [], isEntry = false) =>
      ({ type: "chunk", fileName, code, imports, isEntry });
    const output = {
      "fx/media.js": chunk("fx/media.js", 'export * from "./chunks/shared.js";', ["chunks/shared.js"], true),
      "chunks/shared.js": chunk("chunks/shared.js", 'export const shared = () => import("./shell.js");'),
      "chunks/shell.js": chunk("chunks/shell.js", 'import "../assets/shell.css";\nexport const shell = true;'),
      "nse/themes/sample.js": chunk("nse/themes/sample.js", 'import "../../assets/theme.css";\nexport * from "../chunks/shared.js";', ["chunks/shared.js"], true),
    };
    const themes = new Set(["nse/themes/sample.js"]);
    expect([...sdkNodeLoadableChunks(output, themes)].sort()).toEqual(["chunks/shared.js", "fx/media.js"]);
    expect(() => assertSdkNodeLoadableChunksImportNoCss(output, themes)).not.toThrow();

    output["chunks/shared.js"].code = 'import "../assets/shared.css";\n' + output["chunks/shared.js"].code;
    expect(() => assertSdkNodeLoadableChunksImportNoCss(output, themes)).toThrow(/chunks\/shared\.js/u);
  });

  it("fails the build when Node-loadable CSS is in no published stylesheet", async () => {
    const root = mkdtempSync(join(tmpdir(), "synware-unpublished-styles-"));
    try {
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src/neutral.css"), '.semantic { display: flex; }');
      writeFileSync(join(root, "src/orphan.css"), '.orphan { color: red; }');
      const neutralEntry = join(root, "src/neutral-entry.js");
      writeFileSync(neutralEntry, 'import "./neutral.css";');
      writeFileSync(join(root, "src/media.js"), 'import "./orphan.css"; export const media = true;');
      await expect(build({ root, configFile: false, logLevel: "silent", base: "./", publicDir: false,
        plugins: [sdkPackageStyles({ themeNames: [], frameworkPublicDirectory: join(root, "public") })],
        build: { write: false, cssCodeSplit: true,
          lib: { entry: { "fx/media": join(root, "src/media.js"), "nse/styles": neutralEntry }, formats: ["es"], fileName: (_format, name) => `${name}.js` },
        },
      })).rejects.toThrow(/fx\/media\.js is Node-loadable but its CSS is in no published stylesheet/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
