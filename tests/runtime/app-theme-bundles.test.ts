/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readThemeBundle } from "../../scripts/synware/theme-bundles.mjs";
import { synCloudOS } from "../../scripts/synware/vite-plugin.mjs";

const identifier = "com.example.run.chrome";
const css = '[data-nse-control="tab-view"] [data-nse-part="cell"][data-nse-selected] { background: red }';
const systemFixture = resolve(import.meta.dirname, "../fixtures/themes/Valid.scostheme");
const roots: string[] = [];

function temp() {
  const root = mkdtempSync(join(tmpdir(), "syncloudos-app-theme-"));
  roots.push(root);
  return root;
}

function appTheme(root = temp(), source = css) {
  const bundle = join(root, "RunChrome.scostheme");
  const contents = join(bundle, "Contents");
  mkdirSync(join(contents, "Resources"), { recursive: true });
  writeFileSync(join(contents, "Info.ts"), 'export default { bundleIdentifier: "' + identifier +
    '", displayName: "Run Chrome", version: "1.0.0", themeContractVersion: 1 };');
  writeFileSync(join(contents, "Resources/theme.css"), source);
  return bundle;
}

function project() {
  const root = temp();
  const contents = join(root, "src/SynWare/Run.app/Contents");
  mkdirSync(contents, { recursive: true });
  writeFileSync(join(contents, "Info.ts"), 'export default { bundleIdentifier: "com.example.run", displayName: "Run", version: "1.0.0" };');
  writeFileSync(join(contents, "index.tsx"), 'import { themes } from "virtual:syncloudos/themes"; export default function Run() { return themes["' + identifier + '"].displayName; }');
  return { root, bundle: appTheme(join(contents, "Resources")) };
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("app themes", () => {
  it("accepts a chrome-only app theme", () => {
    const bundle = readThemeBundle(appTheme(), { kind: "app" });
    expect(bundle.theme).toEqual({ kind: "app", bundleIdentifier: identifier, displayName: "Run Chrome", version: "1.0.0" });
    expect(Object.isFrozen(bundle.theme)).toBe(true);
  });

  it("rejects Theme.json in an app theme", () => {
    const bundle = appTheme();
    cpSync(join(systemFixture, "Contents/Theme.json"), join(bundle, "Contents/Theme.json"));
    expect(() => readThemeBundle(bundle, { kind: "app" })).toThrow(/Theme\.json.*colours.*navigation.*presentation.*images/i);
  });

  it("rejects a control outside appThemeControls and lists the allowed controls", () => {
    const bundle = appTheme(temp(), '[data-nse-control="slider"] { background: red }');
    expect(() => readThemeBundle(bundle, { kind: "app" })).toThrow(/slider.*window.*app-view-chrome.*toolbar.*tab-view.*popover/i);
  });

  it.each([
    '[data-nse-part="bezel"]',
    '[data-nse-control="window"] + [data-nse-part="cell"]',
    ':scope',
    ':is([data-nse-control="tab-view"], [data-nse-part="cell"])',
    '[data-nse-part="cell"]:not([data-nse-control="tab-view"])',
  ])("rejects a selector outside an allowed control (%s)", selector => {
    const bundle = appTheme(temp(), selector + " { background: red }");
    expect(() => readThemeBundle(bundle, { kind: "app" })).toThrow(/allowed control/i);
  });

  it("accepts a part inside an allowed control", () => {
    const bundle = appTheme(temp(), '[data-nse-control="tab-view"] [data-nse-part="cell"][data-nse-role="tab"] { background: red }');
    expect(readThemeBundle(bundle, { kind: "app" }).stylesheets).toHaveLength(1);
  });

  it("accepts alternatives that all have an allowed control ancestor", () => {
    const bundle = appTheme(temp(), ':where([data-nse-control="tab-view"], [data-nse-control="toolbar-item"]) [data-nse-part="cell"] { background: red }');
    expect(readThemeBundle(bundle, { kind: "app" }).stylesheets).toHaveLength(1);
  });

  it("rejects an unhooked drawing subject even with an allowed ancestor", () => {
    const bundle = appTheme(temp(), '[data-nse-control="window"] * { background: red }');
    expect(() => readThemeBundle(bundle, { kind: "app" })).toThrow(/target a control or part/i);
  });

  it("rejects class selectors in app themes", () => {
    const bundle = appTheme(temp(), '[data-nse-control="window"] .title { background: red }');
    expect(() => readThemeBundle(bundle, { kind: "app" })).toThrow(/use contract hooks only/i);
  });

  it("produces no coverage warnings for a partial app theme", () => {
    const warn = vi.spyOn(console, "warn");
    try {
      expect(readThemeBundle(appTheme(), { kind: "app" }).theme.kind).toBe("app");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("discovers bundles inside app Resources and generates scoped CSS and immutable metadata", async () => {
    const { root } = project();
    const plugin = synCloudOS({ webspringEntry: false });
    await plugin.configResolved({ root, command: "serve" });
    const source = plugin.load("\0virtual:syncloudos/themes");
    expect(source).toContain('virtual:syncloudos/theme-style/' + identifier + '.css');
    const script = source.replace(/^import.*;$/gm, "").replace("export const themes", "const themes");
    const registry = new Function("builtInAtmo", script + "; return themes;")({});
    expect(registry[identifier]).toEqual({ kind: "app", bundleIdentifier: identifier, displayName: "Run Chrome", version: "1.0.0" });
    expect(Object.isFrozen(registry[identifier])).toBe(true);
    const scoped = plugin.load("\0virtual:syncloudos/theme-style/" + identifier + ".css");
    expect(scoped).toContain("@layer nse.app-theme");
    expect(scoped).toContain('@scope ([data-nse-app-theme="' + identifier + '"]) to ([data-nse-app-theme]:not([data-nse-app-theme="' +
      identifier + '"]), [data-nse-system-surface])');
    expect(scoped).toContain("@layer clear");
  });

  it("rejects duplicate identifiers across system and app themes", async () => {
    const { root } = project();
    const system = join(root, "src/Themes/System.scostheme");
    cpSync(systemFixture, system, { recursive: true });
    writeFileSync(join(system, "Contents/Info.ts"), 'export default { bundleIdentifier: "' + identifier +
      '", displayName: "System Theme", version: "1.0.0", themeContractVersion: 1 };');
    const plugin = synCloudOS({ webspringEntry: false });
    await expect(plugin.configResolved({ root, command: "serve" })).rejects.toThrow(/Duplicate theme identifier.*com\.example\.run\.chrome/i);
  });

  it("keeps a whole theme and its required Theme.json", () => {
    expect(readThemeBundle(systemFixture).theme.colours.light).toBeDefined();
    expect(() => readThemeBundle(appTheme())).toThrow(/Theme\.json/i);
  });
});
