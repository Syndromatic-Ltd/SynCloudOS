/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import * as cssTree from "css-tree";
import { expect, it } from "vitest";
import { isPaintProperty, userAgentResetValues } from "../../scripts/synware/paint-properties.mjs";

const root = resolve(import.meta.dirname, "../..");

function frameworkPaintCounts() {
  const counts: Record<string, number> = {};
  for (const entry of readdirSync(join(root, "src"), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".css")) continue;

    const path = join(entry.parentPath, entry.name);
    const file = relative(root, path).split(sep).join("/");
    if (file.startsWith("src/Themes/") || file.split("/").some(part => part.endsWith(".app"))) continue;

    const layers: string[] = [];
    let count = 0;
    cssTree.walk(cssTree.parse(readFileSync(path, "utf8")), {
      enter(node) {
        if (node.type === "Atrule" && node.name.toLowerCase() === "layer" && node.block) {
          layers.push(node.prelude ? cssTree.generate(node.prelude) : "");
        }
        if (node.type !== "Declaration" || !isPaintProperty(cssTree.ident.decode(node.property))) return;

        const layer = layers.join(".");
        const isStructure = layer === "nse.structure" || layer.startsWith("nse.structure.");
        const isReset = userAgentResetValues.includes(cssTree.generate(node.value).toLowerCase());
        if (!isStructure || !isReset) count++;
      },
      leave(node) {
        if (node.type === "Atrule" && node.name.toLowerCase() === "layer" && node.block) layers.pop();
      },
    });
    if (count > 0) counts[file] = count;
  }
  return counts;
}

it("framework CSS draws no paint", () => {
  expect(frameworkPaintCounts()).toEqual({});
});

it("NSE structure CSS declares no typography or motion", () => {
  const directory = join(root, "src", "NSE", "Structure");
  const violations: string[] = [];
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".css")) continue;
    const path = join(entry.parentPath, entry.name);
    const file = relative(directory, path);
    cssTree.walk(cssTree.parse(readFileSync(path, "utf8"), { positions: true }), node => {
      const name = node.type === "Declaration" ? cssTree.ident.decode(node.property).toLowerCase() : "";
      const property = name.replace(/^-(?:webkit|moz|ms|o)-/u, "");
      if (/^(?:(?:font|transition|animation)(?:-|$)|(?:line-height|letter-spacing|word-spacing|text-transform)$)/u.test(property)
        || (node.type === "Atrule" && /^(?:-webkit-)?keyframes$/iu.test(node.name))) {
        violations.push(`${file}:${node.loc?.start.line} ${name || "@keyframes"}`);
      }
    });
  }
  expect(violations).toEqual([]);
});
