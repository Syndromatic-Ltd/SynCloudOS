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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function cssFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? cssFiles(file) : entry.name.endsWith(".css") ? [file] : [];
  });
}

describe("explicit theme resource ownership", () => {
  it.each(["Atmo"])("keeps every %s CSS resource local and present", (theme) => {
    const root = path.resolve("src/Themes", `${theme}.scostheme`, "Contents", "Resources");
    const files = cssFiles(root);
    expect(files.length).toBeGreaterThan(0);
    let references = 0;
    for (const file of files) {
      const css = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        // Generated inline SVGs legitimately contain nested `url(%23id)` paint
        // references. Remove the enclosing data URL before looking for file
        // resources so those SVG-local fragments are not mistaken for paths.
        .replace(/url\(\s*(["'])data:[\s\S]*?\1\s*\)/g, 'url("")');
      const urls = [...css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)].map((match) => match[1]);
      const imports = [...css.matchAll(/@import\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const url of [...urls, ...imports]) {
        if (url.startsWith("data:") || url.startsWith("#")) continue;
        references++;
        expect(url, file).not.toMatch(/^(?:\/|https?:)/);
        const resolved = path.resolve(path.dirname(file), url.split(/[?#]/)[0]);
        expect(path.relative(root, resolved), `${file}: ${url}`).not.toMatch(/^\.\.(?:[\\/]|$)/);
        expect(existsSync(resolved), `${file}: ${url}`).toBe(true);
        // Canonical Atmo is raster-free: the SystemAlert nine-slices, its last
        // exception, are traced into CSS (their PNGs stay as manifest-only assets).
        if (theme === "Atmo" && ["atmo.css", "atmo-structure.css"].includes(path.basename(file))) expect(url, `${file}: canonical Atmo consumes no raster resources`).not.toMatch(/\.(?:png|jpe?g|gif|webp)(?:$|[?#])/i);
      }
    }
    if (theme !== "Atmo") expect(references).toBeGreaterThan(0);
  });

  it("keeps canonical Atmo self-contained and its controls raster-free", () => {
    for (const file of ["src/NSE/Themes/Atmo/index.ts", ...cssFiles("src/Themes/Atmo.scostheme/Contents/Resources")]) {
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(source, file).not.toMatch(/AtmoHeritage|AtmoOnyx|AppearanceAssets|\/assets\/nse\/atmo\/|--av-|data-atmo-render/);
    }
    for (const obsolete of ["src/NSE/Atmo", "src/NSE/Appearances", "src/NSE/AppearanceAssets"]) {
      expect(existsSync(obsolete), obsolete).toBe(false);
    }
  });
});
