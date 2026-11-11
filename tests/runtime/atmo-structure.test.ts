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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as cssTree from "css-tree";
import { atmoBundleFiles, atmoStructureFile, atmoStructurePaintCSS } from "../fixtures/atmoStylesheets";

const read = (path: string) => readFileSync(path, "utf8");

describe("Atmo control structure", () => {
  it("loads control structure ahead of Atmo.scostheme, and every bundle file through theme.css", () => {
    const entry = read("src/NSE/Appearance/atmo-theme.css");
    expect(entry.indexOf('"../Structure/controls.css"')).toBeGreaterThanOrEqual(0);
    expect(entry.indexOf('"../Structure/controls.css"')).toBeLessThan(entry.indexOf('"../../Themes/Atmo.scostheme/Contents/Resources/theme.css"'));
    expect(atmoBundleFiles.length).toBeGreaterThan(10);
    expect(read("src/NSE/Appearance/atmo.ts")).toContain('import "./atmo-theme.css";');
  });

  it("keeps control structure in Atmo's layer and scope, with no raster paint", () => {
    const css = read(atmoStructureFile);
    expect(css).not.toMatch(/url\(/u);
    const layers: string[] = [];
    cssTree.walk(cssTree.parse(css), { visit: "Atrule", enter(node) { if (node.name === "layer" && node.block) layers.push(cssTree.generate(node.prelude!)); } });
    expect(layers).toEqual(["nse.atmo"]);
    expect(css).toContain("@scope ([data-nse-theme]) to ([data-nse-theme])");
  });

  it("draws only through contract hooks: no framework class or element selector in the bundle", () => {
    for (const file of atmoBundleFiles) {
      cssTree.walk(cssTree.parse(read(file)), { visit: "Rule", enter(rule) {
        cssTree.walk(rule.prelude, (node) => {
          if (node.type === "ClassSelector" || node.type === "IdSelector") expect.fail(`${file}: ${cssTree.generate(rule.prelude)}`);
        });
      } });
    }
  });

  it("owns the geometry tokens the toggle, slider, progress and disclosure need", () => {
    const structure = atmoStructurePaintCSS();
    for (const token of ["--nse-atmo-toggle-width", "--nse-atmo-toggle-height", "--nse-atmo-slider-thumb-size", "--nse-atmo-progress-cap-compensation", "--nse-atmo-divider-arrow-size"]) {
      expect(structure).toMatch(new RegExp(`${token}:\\s*[^;n]`, "u"));
    }
  });

  it("sizes the presented action sheet to its content", () => {
    const declarations: Record<string, string> = {};
    cssTree.walk(cssTree.parse(read(atmoStructureFile)), { visit: "Rule", enter(rule) {
      if (!cssTree.generate(rule.prelude).includes('[data-nse-overlay-kind="action-sheet"][data-nse-presentation="sheet"]')) return;
      rule.block.children.forEach(child => { if (child.type === "Declaration") declarations[child.property] = cssTree.generate(child.value); });
    } });
    expect(declarations).toMatchObject({ inset: "0", "inline-size": "fit-content", "block-size": "fit-content", margin: "auto" });
  });
});
