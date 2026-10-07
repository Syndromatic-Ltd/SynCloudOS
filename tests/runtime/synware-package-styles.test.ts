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
import { join } from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { sdkNeutralStyleModuleSource, sdkPackageStyles } from "../../scripts/synware/sdk-package-styles.mjs";

describe("installed SDK stylesheet ownership", () => {

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
      writeFileSync(join(root, "src/browser.js"), 'import "./host.css"; export { shared } from "./core.js";');
      const result = await build({ root, configFile: false, logLevel: "silent", base: "./",
        publicDir: false,
        plugins: [sdkPackageStyles({
          themeNames: ["nse/themes/sample"],
          publicStyleEntries: { "browser/styles.css": "browser" },
          frameworkPublicDirectory: join(root, "public"),
        })],
        build: { write: false, cssCodeSplit: true, minify: false, assetsInlineLimit: 0,
          lib: { entry: { nse: join(root, "src/core.js"), browser: join(root, "src/browser.js"), "nse/styles": neutralEntry, "nse/themes/sample": join(root, "src/theme.js") }, formats: ["es"], fileName: (_format, name) => `${name}.js` },
          rollupOptions: { output: { assetFileNames: "assets/[name]-[hash][extname]" } },
        },
      });
      const output = (Array.isArray(result) ? result[0] : result).output;
      const entry = output.find((file) => file.fileName === "nse/themes/sample.js");
      expect(entry?.type === "chunk" && entry.code).toMatch(/import\s+["'][^"']+\.css["']/);
      const core = output.find((file) => file.fileName === "nse.js");
      expect(core?.type === "chunk" && core.code).not.toMatch(/import\s+["'][^"']+\.css["']/);
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
});
