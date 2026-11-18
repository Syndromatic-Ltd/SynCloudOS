/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import * as cssTree from "css-tree";
import { expect, it } from "vitest";
import { isPaintProperty, userAgentResetValues } from "../../scripts/synware/paint-properties.mjs";
import ratchet from "./framework-paint-ratchet.json";

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
  expect(frameworkPaintCounts()).toEqual(ratchet);
});

it("the ratchet only shrinks to zero", () => {
  for (const [file, count] of Object.entries(ratchet)) {
    expect(Number.isInteger(count) && count > 0, file).toBe(true);
  }
});
