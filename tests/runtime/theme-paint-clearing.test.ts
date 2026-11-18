/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import * as cssTree from "css-tree";
import { describe, expect, it } from "vitest";
import { paintProperties } from "../../scripts/synware/paint-properties.mjs";
import { scopeThemeCSS } from "../../scripts/synware/theme-loading.mjs";

const bundleIdentifier = "com.example.paint";
const button = '[data-nse-control="button"]';
const bezel = '[data-nse-part="bezel"]';

function scopedRules(source: string) {
  const css = scopeThemeCSS(source, bundleIdentifier);
  const layer = cssTree.parse(css).children.first;
  if (layer?.type !== "Atrule" || !layer.block) throw new Error("Missing theme layer");
  expect(cssTree.generate(layer.prelude!)).toBe("nse.theme");
  const scope = layer.block.children.first;
  if (scope?.type !== "Atrule" || !scope.block) throw new Error("Missing theme scope");
  expect(scope.name).toBe("scope");
  return scope.block.children.toArray();
}

describe("theme paint clearing", () => {
  it("emits a nested clear layer for a drawn part", () => {
    const [clear, drawing] = scopedRules(button + " " + bezel + " { background: red }");
    expect(clear).toMatchObject({ type: "Atrule", name: "layer" });
    if (clear.type !== "Atrule" || drawing.type !== "Rule") throw new Error("Missing draw and clear rules");
    expect(cssTree.generate(clear.prelude!)).toBe("clear");
    const clearRule = clear.block?.children.first;
    if (clearRule?.type !== "Rule") throw new Error("Missing clear rule");
    const selector = cssTree.generate(drawing.prelude);
    expect(cssTree.generate(clearRule.prelude)).toBe([selector, selector + "::before", selector + "::after"].join(","));
    const resets = clearRule.block.children.toArray().filter(declaration => declaration.type === "Declaration");
    const values = Object.fromEntries(resets.map(declaration => [declaration.property, cssTree.generate(declaration.value)]));
    for (const property of paintProperties) expect(values[property], property).toBe("initial");
    for (const property of ["font", "line-height", "letter-spacing", "word-spacing", "text-transform"]) {
      expect(values[property], property).toBe("unset");
    }
  });

  it("carries the same state gates as the theme drawing", () => {
    const [clear, drawing] = scopedRules(button + "[data-nse-selected] " + bezel + " { background: red }");
    if (clear.type !== "Atrule" || drawing.type !== "Rule") throw new Error("Missing draw and clear rules");
    const selectors = cssTree.generate(clear.block!);
    expect(selectors).toContain(cssTree.generate(drawing.prelude));
    expect(selectors).toContain(".nse\\:selected");
    for (const state of ["highlighted", "hovered", "focused", "enabled\\=false", "key-window\\=false", "state\\=on", "state\\=mixed"]) {
      expect(selectors).toContain(":not(.nse\\:" + state + ")");
    }
    expect(selectors).not.toContain(":not(.nse\\:selected)");
  });

  it("skips legacy and modern pseudo-elements and :scope alone", () => {
    const rules = scopedRules(button + " " + bezel + "::before, " + button + " " + bezel + ":after, :scope { background: red }");
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ type: "Rule" });
  });

  it("does not clear a selector with only an ancestor hook", () => {
    const rules = scopedRules(button + " [data-nse-role] { background: red }");
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ type: "Rule" });
  });

  it("leaves the theme's own declaration outside the clear layer", () => {
    const [clear, drawing] = scopedRules(button + " " + bezel + " { background: red }");
    expect(clear).toMatchObject({ type: "Atrule", name: "layer" });
    expect(drawing).toMatchObject({ type: "Rule" });
    expect(cssTree.generate(drawing)).toContain("{background:red}");
  });

  it("keeps a part-only clear inside the same conditional and control scope as its drawing", () => {
    const [clear, drawing] = scopedRules("@media (min-width: 42px) { " + bezel + " { background: red } }");
    expect(clear).toMatchObject({ type: "Atrule", name: "layer" });
    expect(drawing).toMatchObject({ type: "Atrule", name: "media" });
    expect(cssTree.generate(clear)).toContain("@media (min-width:42px){@scope ([data-nse-control]) to ([data-nse-control]){");
    expect(cssTree.generate(clear)).toContain(":scope");
    expect(cssTree.generate(clear)).toContain("::after");
  });

  it("wraps app theme paint and clearing at app theme boundaries when requested", () => {
    const css = scopeThemeCSS(':scope[data-nse-colour-scheme-resolved="dark"] [data-nse-control="tab-view"] [data-nse-part="cell"] { background: red }', bundleIdentifier, {
      layer: "nse.app-theme",
      boundary: "data-nse-app-theme",
    });
    expect(css).toContain("@layer nse.app-theme");
    expect(css).toContain('@scope ([data-nse-app-theme="com.example.paint"]) to ([data-nse-app-theme]:not([data-nse-app-theme="com.example.paint"]), [data-nse-system-surface])');
    expect(css).toContain(') to ([data-nse-control]:not([data-nse-control="button"][data-nse-part="cell"])) {');
    expect(css).toContain(":where(:scope,:scope *)");
    expect(css).toContain('.nse\\:colour-scheme-resolved\\=dark[data-nse-app-theme="com.example.paint"]');
    expect(css).toContain("@layer clear");
  });
});
