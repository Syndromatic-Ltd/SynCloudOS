import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { readThemeBundle } from "../../scripts/synware/theme-bundles.mjs";
const root = resolve(import.meta.dirname, "../../src/Themes/Atmo.scostheme");
describe("Atmo's public theme bundle", () => {
  it("is a valid static bundle with Atmo's existing navigation and presentation", () => {
    const bundle = readThemeBundle(root);
    expect(bundle.theme.bundleIdentifier).toBe("com.syndromatic.atmo");
    expect(bundle.theme.navigation).toEqual({ compact: { placement: "block-end", flow: "overlay" }, regular: { placement: "source-list", flow: "in-flow" } });
    expect(bundle.theme.presentation).toEqual({ login: "ornamented", notifications: "sliced-3d", materialLighting: "on" });
  });
  it("draws through public hooks and contains no fonts, motion or executable resources", () => {
    const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);
    for (const file of files(root)) {
      if (file.endsWith("Info.ts")) continue;
      expect(file).not.toMatch(/\.(?:tsx?|jsx?|mjs|cjs|woff2?|ttf|otf)$/u);
      if (!file.endsWith(".css")) continue;
      expect(readFileSync(file, "utf8")).not.toMatch(/\.nse-[a-z]|@(?:keyframes|font-face)|\b(?:animation|transition|font-family|font-size|font-weight|line-height)\s*:/u);
    }
  });
});
