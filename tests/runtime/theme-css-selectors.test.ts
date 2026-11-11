import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateThemeCSS } from "../../scripts/synware/theme-bundles.mjs";
const contract = JSON.parse(readFileSync(resolve("tooling/nse-theme-contract.json"), "utf8"));
const validate = (selector: string) => validateThemeCSS(selector + " { background: white; }", { file: resolve("theme.css"), root: process.cwd(), contract });
describe("contract selector anchoring", () => {
  it("accepts a control's nested state predicates", () => { expect(() => validate('[data-nse-control="button"]:not([data-nse-highlighted])')).not.toThrow(); });
  it("accepts part alternatives within a control", () => { expect(() => validate('[data-nse-control="button"] :is([data-nse-part="title"], [data-nse-part="image"])')).not.toThrow(); });
  it("accepts alternative anchored controls", () => { expect(() => validate(':is([data-nse-control="button"], [data-nse-control="slider"])')).not.toThrow(); });
  it("rejects a negative predicate as the only anchor", () => { expect(() => validate(':not([data-nse-control="button"])')).toThrow(/selector/); });
  it("rejects an unanchored universal alternative", () => { expect(() => validate(':is([data-nse-control="button"], *)')).toThrow(/selector/); });
});
