import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { deriveNSEThemeContract } from "../../scripts/synware/build-theme-contract.mjs";
import { readThemeBundle, validateThemeCSS } from "../../scripts/synware/theme-bundles.mjs";
const root = resolve(import.meta.dirname, "../../src/Themes/Atmo.scostheme");
describe("Atmo's public theme bundle", () => {
  it("is a valid static bundle with Atmo's existing navigation and presentation", () => {
    const bundle = readThemeBundle(root);
    expect(bundle.theme.bundleIdentifier).toBe("com.syndromatic.atmo");
    expect(bundle.theme.navigation).toEqual({ compact: { placement: "block-end", flow: "overlay" }, regular: { placement: "source-list", flow: "in-flow" } });
    expect(bundle.theme.presentation).toEqual({ login: "ornamented", notifications: "sliced-3d", materialLighting: "on" });
  }, 30_000); // Validates every Atmo stylesheet against the contract, which takes about 5 s.
  it("draws through public hooks and contains no bundled fonts or executable resources", () => {
    const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)]);
    for (const file of files(root)) {
      if (file.endsWith("Info.ts")) continue;
      expect(file).not.toMatch(/\.(?:tsx?|jsx?|mjs|cjs|woff2?|ttf|otf)$/u);
      if (!file.endsWith(".css")) continue;
      expect(readFileSync(file, "utf8")).not.toMatch(/\.nse-[a-z]|@font-face/u);
    }
  });
  it("applies the public selector contract even to Atmo's motion stylesheet", () => {
    const file = resolve(root, "Contents/Resources/atmo-structure.controls.css");
    const contract = deriveNSEThemeContract(resolve(import.meta.dirname, "../.."));
    for (const selector of ["legend", "[data-suspended]", "[data-variant]", "[data-state]", "[data-motion]"]) {
      expect(() => validateThemeCSS(`:scope ${selector} { color: red; }`, { file, root, contract })).toThrow(/css-selector/u);
    }
  });
});
