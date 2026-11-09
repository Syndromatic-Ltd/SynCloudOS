import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deriveNSEAppearanceContract, writeDeveloperSdkData } from "../../scripts/developer-mcp/build-package.mjs";
import { scaffoldTheme, validateTheme } from "../../scripts/developer-mcp/themes.mjs";

const repository = resolve(import.meta.dirname, "../..");
let project: string;
let contract: ReturnType<typeof deriveNSEAppearanceContract>;
beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "syncloudos-theme-test-"));
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "theme-consumer" }));
  const installed = join(project, "node_modules/@syndromatic/syncloudos");
  mkdirSync(join(installed, "tooling"), { recursive: true });
  writeFileSync(join(installed, "package.json"), JSON.stringify({ name: "@syndromatic/syncloudos", version: "1.0.0-beta.2" }));
  contract = deriveNSEAppearanceContract(repository);
  writeFileSync(join(installed, "tooling/nse-appearance-contract.json"), JSON.stringify(contract));
});
afterEach(() => rmSync(project, { recursive: true, force: true }));

describe("developer MCP neutral theme provisioning", () => {
  it("requires positive appearance and scheme attributes on the same provider", async () => {
    await scaffoldTheme({ projectRoot: project, name: "Scoped" });
    const path = join(project, "src/Themes/scoped/styles.css");
    const original = readFileSync(path, "utf8");
    for (const selector of ['[data-nse-appearance="scoped"] [data-nse-colour-scheme-resolved=', ':not([data-nse-appearance="scoped"])[data-nse-colour-scheme-resolved=', '[data-nse-appearance="scoped"], [data-nse-colour-scheme-resolved=']) {
      writeFileSync(path, original.replaceAll('[data-nse-appearance="scoped"][data-nse-colour-scheme-resolved=', selector));
      expect((await validateTheme({ projectRoot: project, path: "src/Themes/scoped" })).ok).toBe(false);
    }
    writeFileSync(path, original);
    expect((await validateTheme({ projectRoot: project, path: "src/Themes/scoped" })).ok).toBe(true);
  });
  it("validates theme-local colour variables, fallbacks, unresolved variables and cycles", async () => {
    await scaffoldTheme({ projectRoot: project, name: "Variables" });
    const path = join(project, "src/Themes/variables/styles.css");
    const original = readFileSync(path, "utf8");
    writeFileSync(path, original.replace(/(--nse-app-background:)\s*[^;]+;/u, '$1 var(--paper); --paper: white;'));
    expect((await validateTheme({ projectRoot: project, path: "src/Themes/variables" })).ok).toBe(true);
    writeFileSync(path, original.replace(/(--nse-app-background:)\s*[^;]+;/u, '$1 var(--absent, Canvas);'));
    expect((await validateTheme({ projectRoot: project, path: "src/Themes/variables" })).ok).toBe(true);
    for (const value of ['var(--absent)', 'var(--nse-app-background)']) {
      writeFileSync(path, original.replace(/(--nse-app-background:)\s*[^;]+;/u, `$1 ${value};`));
      expect((await validateTheme({ projectRoot: project, path: "src/Themes/variables" })).ok).toBe(false);
    }
  });
  it("rejects recoverable CSS syntax errors and unclosed blocks", async () => {
    await scaffoldTheme({ projectRoot: project, name: "Syntax" });
    const path = join(project, "src/Themes/syntax/styles.css");
    const original = readFileSync(path, "utf8");
    for (const css of [original + '\n.x { ??? }', original.replace(/\}\s*$/u, '')]) {
      writeFileSync(path, css);
      expect((await validateTheme({ projectRoot: project, path: "src/Themes/syntax" })).findings).toContainEqual(expect.objectContaining({ rule: "theme.stylesheet" }));
    }
    writeFileSync(path, original);
    expect((await validateTheme({ projectRoot: project, path: "src/Themes/syntax" })).ok).toBe(true);
  });
  it("matches runtime trimming when checking duplicate recipes", async () => {
    await scaffoldTheme({ projectRoot: project, name: "Recipes" });
    const path = join(project, "src/Themes/recipes/theme.json");
    const definition = JSON.parse(readFileSync(path, "utf8"));
    definition.recipes = [{ slot: "button", recipeId: "one" }, { slot: " button ", recipeId: "two" }];
    writeFileSync(path, JSON.stringify(definition));
    expect((await validateTheme({ projectRoot: project, path })).findings).toContainEqual(expect.objectContaining({ rule: "theme.duplicate-recipe" }));
  });
  it("derives both schemes from neutral source and packages the same contract", async () => {
    const neutral = readFileSync(join(repository, "src/NSE/Appearance/nse-appearance.css"), "utf8");
    expect(contract.values.length).toBeGreaterThan(0);
    expect(contract.values.map((value: { name: string }) => value.name)).toContain("--nse-app-background");
    expect(contract.values.every((value: { name: string }) => !value.name.includes("atmo"))).toBe(true);
    for (const value of contract.values) {
      expect(neutral).toContain(value.name);
      expect(value.defaults.light).toBeTypeOf("string");
      expect(value.defaults.dark).toBeTypeOf("string");
    }
    const sdk = join(project, "packed-sdk");
    await writeDeveloperSdkData({ repositoryRoot: repository, directory: sdk, commit: "test", source: { sha256: "test" } });
    expect(JSON.parse(readFileSync(join(sdk, "tooling/nse-appearance-contract.json"), "utf8"))).toEqual(contract);
  });

  it("scaffolds every light and dark value for a custom theme that validates without Atmo", async () => {
    const result = await scaffoldTheme({ projectRoot: project, name: "Paper Studio" });
    expect(result.createdPaths).toEqual(["src/Themes/paper-studio/theme.json", "src/Themes/paper-studio/appearance.ts", "src/Themes/paper-studio/styles.css"]);
    const css = readFileSync(join(project, "src/Themes/paper-studio/styles.css"), "utf8");
    expect(css).not.toContain("atmo");
    expect(css).toContain('[data-nse-appearance="paper-studio"]');
    for (const value of contract.values) expect(css.split(value.name + ":")).toHaveLength(3);
    const checked = await validateTheme({ projectRoot: project, path: "src/Themes/paper-studio" });
    expect(checked.ok).toBe(true);
    expect(checked.findings).toEqual([]);
    expect(checked.checkedValues).toBe(contract.values.length * 2);
    expect(readFileSync(join(project, "src/Themes/paper-studio/appearance.ts"), "utf8")).toContain('@syndromatic/syncloudos/nse/appearance');
  });

  it("reports every missing scheme value", async () => {
    await scaffoldTheme({ projectRoot: project, name: "Incomplete" });
    writeFileSync(join(project, "src/Themes/incomplete/styles.css"), '[data-nse-appearance="incomplete"][data-nse-colour-scheme-resolved="light"] { --nse-app-background: white; }');
    const result = await validateTheme({ projectRoot: project, path: "src/Themes/incomplete/theme.json" });
    expect(result.ok).toBe(false);
    expect(result.findings.filter((finding: { rule: string }) => finding.rule === "theme.missing-value")).toHaveLength(contract.values.length * 2 - 1);
    expect(result.findings).toContainEqual(expect.objectContaining({ value: "--nse-app-background", scheme: "dark", severity: "error" }));
  });

  it("reports malformed colours and accepts a different legitimate colour palette", async () => {
    await scaffoldTheme({ projectRoot: project, name: "Ink" });
    const path = join(project, "src/Themes/ink/styles.css");
    let css = readFileSync(path, "utf8");
    css = css.replace(/(--nse-app-background:\s*)[^;]+;/u, "$1definitely-not-a-colour;");
    writeFileSync(path, css);
    expect((await validateTheme({ projectRoot: project, path: "src/Themes/ink" })).findings).toContainEqual(expect.objectContaining({ rule: "theme.malformed-value", value: "--nse-app-background", scheme: "light" }));
    writeFileSync(path, css.replace("definitely-not-a-colour", "Canvas"));
    expect((await validateTheme({ projectRoot: project, path: "src/Themes/ink" })).ok).toBe(true);
  });

  it("validates runtime definition fields and duplicate recipes without executing modules", async () => {
    await scaffoldTheme({ projectRoot: project, name: "Broken" });
    const path = join(project, "src/Themes/broken/theme.json");
    writeFileSync(path, JSON.stringify({ id: "Bad ID", displayName: "", recipes: [{ slot: "x", recipeId: "x" }, { slot: "x", recipeId: "x" }], stylesheet: "styles.css" }));
    const result = await validateTheme({ projectRoot: project, path });
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding: { rule: string }) => finding.rule)).toEqual(expect.arrayContaining(["theme.definition", "theme.duplicate-recipe"]));
    writeFileSync(path, JSON.stringify({ id: 12, displayName: "Numeric", stylesheet: "styles.css" }));
    const numeric = await validateTheme({ projectRoot: project, path });
    expect(numeric.findings).toContainEqual(expect.objectContaining({ rule: "theme.definition" }));
    expect(numeric.findings.some((finding: { rule: string }) => finding.rule === "theme.stylesheet")).toBe(false);
  });

  it("refuses overwrite, escape and symlink targets", async () => {
    await scaffoldTheme({ projectRoot: project, name: "Safe" });
    await expect(scaffoldTheme({ projectRoot: project, name: "Safe" })).rejects.toThrow(/exists/u);
    await expect(scaffoldTheme({ projectRoot: project, name: "Escape", directory: "../outside" })).rejects.toThrow(/inside/u);
    mkdirSync(join(project, "actual"));
    symlinkSync(join(project, "actual"), join(project, "linked"), "junction");
    await expect(scaffoldTheme({ projectRoot: project, name: "Link", directory: "linked/theme" })).rejects.toThrow(/symbolic/u);
    await expect(validateTheme({ projectRoot: project, path: "linked" })).rejects.toThrow(/symbolic/u);
  });
});
