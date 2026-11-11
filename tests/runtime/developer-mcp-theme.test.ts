import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scaffoldTheme, validateTheme } from "../../scripts/developer-mcp/themes.mjs";
import { assertReviewedPackageFiles } from "../../scripts/synware/sdk-package-manifest.mjs";

const repository = resolve(import.meta.dirname, "../..");
const contract = JSON.parse(readFileSync(resolve(repository, "tooling/nse-theme-contract.json"), "utf8"));
const atmo = JSON.parse(readFileSync(resolve(repository, "src/Themes/Atmo.scostheme/Contents/Theme.json"), "utf8"));
const partCount = Object.values(contract.controls as Record<string, { parts: string[] }>).reduce((total, control) => total + control.parts.length, 0);
let project: string;
beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "syncloudos-theme-test-"));
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "theme-consumer" }));
  const installed = join(project, "node_modules/@syndromatic/syncloudos");
  mkdirSync(join(installed, "tooling"), { recursive: true });
  writeFileSync(join(installed, "package.json"), JSON.stringify({ name: "@syndromatic/syncloudos", version: "1.0.0-beta.2" }));
  cpSync(resolve(repository, "tooling/nse-theme-contract.json"), join(installed, "tooling/nse-theme-contract.json"));
  mkdirSync(join(installed, "themes/Atmo.scostheme/Contents"), { recursive: true });
  cpSync(resolve(repository, "src/Themes/Atmo.scostheme/Contents/Theme.json"), join(installed, "themes/Atmo.scostheme/Contents/Theme.json"));
});
afterEach(() => rmSync(project, { recursive: true, force: true }));
const scaffold = (displayName = "Dusk", extra = {}) => scaffoldTheme({ projectRoot: project, bundleIdentifier: `com.example.${displayName.toLowerCase()}`, displayName, ...extra });
const css = (name = "Dusk") => join(project, `src/Themes/${name}.scostheme/Contents/Resources/theme.css`);

describe("developer MCP .scostheme bundles", () => {
  it("ships the theme contract as a reviewed tooling resource", () => {
    expect(() => assertReviewedPackageFiles(["tooling/nse-theme-contract.json"])).not.toThrow();
    expect(() => assertReviewedPackageFiles(["tooling/arbitrary-theme.json"])).toThrow(/unreviewed/u);
  });
  it("scaffolds a complete bundle that validates, with every part listed as undrawn", async () => {
    const result = await scaffold();
    expect(result.createdPaths).toEqual(["src/Themes/Dusk.scostheme/Contents/Info.ts", "src/Themes/Dusk.scostheme/Contents/Theme.json", "src/Themes/Dusk.scostheme/Contents/Resources/theme.css"]);
    const definition = JSON.parse(readFileSync(join(project, "src/Themes/Dusk.scostheme/Contents/Theme.json"), "utf8"));
    expect(definition.colours.light).toEqual(atmo.colours.light);
    expect(definition.colours.dark).toEqual(atmo.colours.dark);
    expect(definition.navigation).toEqual(atmo.navigation);
    expect(definition.presentation).toEqual(atmo.presentation);
    expect(readFileSync(join(project, "src/Themes/Dusk.scostheme/Contents/Info.ts"), "utf8")).toMatch(/Replace every colour/u);
    const stylesheet = readFileSync(css(), "utf8");
    for (const [control, entry] of Object.entries(contract.controls as Record<string, { parts: string[] }>)) {
      expect(stylesheet).toContain(`/* ${control}`);
      for (const part of entry.parts) expect(stylesheet).toContain(`[data-nse-control="${control}"] [data-nse-part="${part}"] {}`);
    }
    const validation = await validateTheme({ projectRoot: project, path: "src/Themes/Dusk.scostheme" });
    expect(validation.errors).toEqual([]);
    expect(validation.ok).toBe(true);
    expect(validation.coverage).toEqual({ drawn: 0, total: partCount });
    expect(validation.warnings).toHaveLength(partCount);
    expect(validation.warnings).toContainEqual(expect.objectContaining({ rule: "theme.undrawn-part", part: "button.bezel" }));
  });
  it("counts a part as drawn once a rule with declarations names it", async () => {
    await scaffold();
    writeFileSync(css(), readFileSync(css(), "utf8").replace('[data-nse-control="button"] [data-nse-part="bezel"] {}', '[data-nse-control="button"] [data-nse-part="bezel"] { background: #20242c; }'));
    const validation = await validateTheme({ projectRoot: project, path: "src/Themes/Dusk.scostheme" });
    expect(validation.ok).toBe(true);
    expect(validation.coverage.drawn).toBe(1);
    expect(validation.warnings.map(warning => warning.part)).not.toContain("button.bezel");
  });
  it("reports private classes, hard limits and unknown hooks as errors", async () => {
    await scaffold();
    const original = readFileSync(css(), "utf8");
    const cases: Array<[string, string]> = [
      [".nse-button { color: #fff; }", "idiom.theme-private-class"],
      ['[data-nse-control="button"][data-nse-focused] { outline: none; }', "idiom.theme-limit"],
      ['[data-nse-control="button"] [data-nse-part="title"] { font-size: 30px; }', "theme.typography"],
      ['[data-nse-control="button"][data-nse-made-up] { color: #fff; }', "theme.css-selector"],
    ];
    for (const [rule, expected] of cases) {
      writeFileSync(css(), `${original}\n${rule}\n`);
      const validation = await validateTheme({ projectRoot: project, path: "src/Themes/Dusk.scostheme" });
      expect(validation.ok, rule).toBe(false);
      expect(validation.errors.map(error => error.rule), rule).toContain(expected);
    }
  });
  it("refuses overwrite, escape, symlink and non-bundle targets", async () => {
    await scaffold("Safe");
    await expect(scaffold("Safe")).rejects.toThrow(/exists/u);
    await expect(scaffold("Escape", { directory: "../outside" })).rejects.toThrow(/inside/u);
    await expect(scaffoldTheme({ projectRoot: project, bundleIdentifier: "Not An Identifier", displayName: "Bad" })).rejects.toThrow(/reverse-DNS/u);
    mkdirSync(join(project, "actual"));
    symlinkSync(join(project, "actual"), join(project, "linked"), "junction");
    await expect(scaffold("Link", { directory: "linked" })).rejects.toThrow(/symbolic/u);
    await expect(validateTheme({ projectRoot: project, path: "linked/Link.scostheme" })).rejects.toThrow(/symbolic/u);
    await expect(validateTheme({ projectRoot: project, path: "src/Themes" })).rejects.toThrow(/\.scostheme/u);
  });
});
