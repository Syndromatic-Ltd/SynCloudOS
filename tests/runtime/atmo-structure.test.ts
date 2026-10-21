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

const structurePath = "src/Themes/Atmo.scostheme/Contents/Resources/atmo-structure.css";
const read = (path: string) => readFileSync(path, "utf8");
const scope = ':where([data-nse-theme="com.syndromatic.atmo"])';
const tooltipScope = ':where([data-nse-theme="com.syndromatic.atmo"], [data-nse-theme="com.syndromatic.atmo"] *)';
const tooltipSelector = `.nse-tooltip[data-nse-control="tooltip"]${tooltipScope}`;
const tooltipArrowSelector = `.nse-tooltip${tooltipScope} > .nse-tooltip-arrow`;
const compactSelector = (selector: string) => cssTree.generate(cssTree.parse(selector, { context: "selector" }));
function declarationsFor(selector: string, path = structurePath) {
  const declarations: Record<string, string> = {};
  cssTree.walk(cssTree.parse(read(path)), (node) => {
    if (node.type !== "Rule" || cssTree.generate(node.prelude) !== compactSelector(selector)) return;
    node.block.children.forEach((child) => {
      if (child.type === "Declaration") declarations[child.property] = cssTree.generate(child.value);
    });
  });
  return declarations;
}


describe("Atmo control structure", () => {
  it("is imported ahead of the paint layer by the Atmo theme entry", () => {
    const atmo = read("src/Themes/Atmo.scostheme/Contents/styles.css");
    expect(atmo.indexOf('"./Resources/atmo-structure.css"')).toBeGreaterThanOrEqual(0);
    expect(atmo.indexOf('"./Resources/atmo-structure.css"')).toBeLessThan(atmo.indexOf('"./Resources/atmo.css"'));
  });

  it("carries no raster paint and adds no specificity", () => {
    const css = read(structurePath);
    expect(css).not.toMatch(/url\(/u);
    const unscoped: string[] = [];
    let keyframesDepth = 0;
    cssTree.walk(cssTree.parse(css), {
      enter(node: cssTree.CssNode) {
        if (node.type === "Atrule" && /keyframes$/iu.test(node.name)) keyframesDepth += 1;
        if (node.type !== "Rule" || keyframesDepth > 0) return;
        for (const selector of cssTree.generate(node.prelude).split(/,(?![^(]*\))/u)) {
          // Ordinary overlays scope their own resolved appearance; tooltips
          // also support an ancestor scope. Both forms keep appearance inside
          // zero-specificity :where(), including portalled tooltip surfaces.
          const compact = scope.replace(/, /gu, ",");
          const trimmed = selector.trim();
          const selfScoped = /^\.[\w-]+/u.exec(trimmed)?.[0];
          const tooltipScoped = [tooltipSelector, tooltipArrowSelector].some((allowed) => compactSelector(allowed) === trimmed);
          if (!trimmed.startsWith(compact) && !(selfScoped && trimmed.startsWith(`${selfScoped}${compact}`)) && !tooltipScoped) unscoped.push(selector);
        }
      },
      leave(node: cssTree.CssNode) {
        if (node.type === "Atrule" && /keyframes$/iu.test(node.name)) keyframesDepth -= 1;
      },
    });
    expect(unscoped).toEqual([]);
  });


  it("owns the geometry tokens the toggle, slider, progress and disclosure need", () => {
    const structure = read(structurePath);
    for (const token of ["--nse-atmo-toggle-width", "--nse-atmo-toggle-height", "--nse-atmo-slider-thumb-size", "--nse-atmo-progress-cap-compensation", "--nse-atmo-divider-arrow-size"]) {
      expect(structure).toMatch(new RegExp(`${token}:\\s*[^;n]`, "u"));
    }
  });


  it("frames the generic menu engine and listbox popups on their surfaces", () => {
    const structure = read(structurePath);
    const atmo = read("src/Themes/Atmo.scostheme/Contents/Resources/atmo.css");
    expect(structure).toContain(`.nse-overlay-popup${scope}:is(.nse-overlay-popup--menu, .nse-overlay-popup--submenu, .nse-overlay-popup--context-menu)`);
    expect(structure).toContain(`.nse-overlay-popup${scope}.nse-overlay-popup--listbox`);
    // The application menu carries its own surface; the generic frame skips it
    // so it is never drawn twice.
    expect(atmo).toContain('.nse-overlay-popup[data-nse-theme="com.syndromatic.atmo"]:is(.nse-overlay-popup--menu, .nse-overlay-popup--submenu, .nse-overlay-popup--context-menu):not(.nse-overlay-popup--application-menu)::after');
    expect(atmo).toContain('.nse-overlay-popup[data-nse-theme="com.syndromatic.atmo"].nse-overlay-popup--listbox::before');
  });

  it("owns the popup panel, tooltip and popover-window families", () => {
    const structure = read(structurePath);
    const atmo = read("src/Themes/Atmo.scostheme/Contents/Resources/atmo.css");
    expect(structure).toContain(`.nse-overlay-popup${scope}:is(.nse-overlay-popup--popover, .nse-overlay-popup--action-sheet)`);
    expect(declarationsFor(`.nse-overlay-popup${scope}[data-nse-overlay-kind="action-sheet"][data-nse-presentation="sheet"]`)).toMatchObject({
      inset: "0", "inline-size": "fit-content", "block-size": "fit-content", margin: "auto",
    });
    expect(declarationsFor(tooltipSelector)).toMatchObject({ position: "fixed", isolation: "isolate", padding: "5px 10px 6px" });
    expect(declarationsFor(tooltipArrowSelector)).toMatchObject({ position: "absolute", "inline-size": "9px", "block-size": "9px", transform: "rotate(45deg)" });
    for (const edge of ["block-end", "block-start"]) expect(structure).toContain(`.nse-window-view--popover[data-window-arrow-edge="${edge}"]::before`);
    for (const alignment of ["start", "center", "end"]) expect(structure).toContain(`.nse-window-view--popover[data-window-arrow-alignment="${alignment}"]::before`);
    expect(atmo).toContain('.nse-overlay-popup[data-nse-theme="com.syndromatic.atmo"]:is(.nse-overlay-popup--popover, .nse-overlay-popup--action-sheet)::before');
    expect(declarationsFor('.nse-tooltip:is([data-nse-theme="com.syndromatic.atmo"], [data-nse-theme="com.syndromatic.atmo"] *)::before', "src/Themes/Atmo.scostheme/Contents/Resources/atmo.css")).toMatchObject({
      content: '""', position: "absolute", inset: "0", "pointer-events": "none", "border-radius": "7px",
    });
    expect(atmo).toContain('[data-nse-theme="com.syndromatic.atmo"] .nse-window-view.nse-window-view--popover::before');
  });
});
