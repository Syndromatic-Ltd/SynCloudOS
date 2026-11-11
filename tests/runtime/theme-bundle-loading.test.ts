import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { build } from "vite";
import { synCloudOS } from "../../scripts/synware/vite-plugin.mjs";
import { themeModuleSource, scopeThemeCSS } from "../../scripts/synware/theme-loading.mjs";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function project() {
  const root = mkdtempSync(join(tmpdir(), "scos-theme-loading-")); roots.push(root); mkdirSync(join(root, "src"));
  writeFileSync(join(root, "index.html"), '<script type="module" src="/src/main.ts"></script>');
  for (const name of ["paper", "unused"]) { const bundle = join(root, "src/Themes", name + ".scostheme"); cpSync(resolve(import.meta.dirname, "../fixtures/themes/Valid.scostheme"), bundle, { recursive: true }); writeFileSync(join(bundle, "Contents/Info.ts"), `export default { bundleIdentifier: "com.example.${name}", displayName: "${name}", version: "1.0.0", themeContractVersion: 1 };`); writeFileSync(join(bundle, "Contents/Resources/theme.css"), `[data-nse-control="button"] [data-nse-part="bezel"] { --${name}-marker: 1; background: white; }`); }
  return root;
}
describe("theme loading", () => {
  it("generates valid JavaScript for images with resolution variants", () => {
    const theme = { bundleIdentifier: "com.example.image", images: { Back: { files: { "1x": "Resources/back.svg", "2x": "Resources/back@2x.svg" }, pointSize: { width: 16, height: 16 }, template: true } } };
    const code = themeModuleSource([{ theme, bundlePath: "/theme" }], new Set(), (file: string) => file, "virtual:theme/");
    const executable = code.replace(/^import.*;$/gm, "").replace("export const themes", "const themes");
    const images = Object.freeze({});
    const registry = new Function("builtInAtmo", "image0", "image1", executable + "; return themes;")(images, "/back.svg", "/back@2x.svg");
    expect(registry[theme.bundleIdentifier].images.Back.files["2x"]).toBe("/back@2x.svg");
    expect(Object.isFrozen(registry[theme.bundleIdentifier].images.Back.files)).toBe(true);
    expect(() => registry["com.example.unknown"]).toThrow("Unknown theme");
  });
  it("bounds foreign nested themes and keeps unspecified states on Atmo", () => {
    const css = scopeThemeCSS('[data-nse-control="button"] [data-nse-part="bezel"] { background: white; }', "com.example.paper");
    expect(css).toContain('@layer nse.theme'); expect(css).toContain('@scope ([data-nse-theme="com.example.paper"]) to ([data-nse-theme]:not([data-nse-theme="com.example.paper"]))');
    expect(css).toContain(":not([data-nse-highlighted])");
  });
  it("emits only statically referenced themes' CSS in a real Vite build", async () => {
    const root = project(); writeFileSync(join(root, "src/main.ts"), 'import { themes } from "virtual:syncloudos/themes"; console.log(themes["com.example.paper"]);');
    const result = await build({ configFile: false, root, logLevel: "silent", plugins: [synCloudOS({ webspringEntry: false })], resolve: { alias: { "@syndromatic/syncloudos/nse/themes/atmo": resolve(import.meta.dirname, "../../src/NSE/Appearance/atmo.ts") } }, build: { write: false, minify: false } });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => "output" in result ? result.output : []);
    const css = outputs.filter(output => output.type === "asset" && output.fileName.endsWith(".css")).map(output => String(output.source)).join("\n");
    expect(css).toContain("--paper-marker"); expect(css).not.toContain("--unused-marker"); expect(css).toContain("nse.atmo");
  }, 30_000);
  it("disables discovery when themesDirectory is false", async () => { const root = project(); const plugin = synCloudOS({ webspringEntry: false, themesDirectory: false }); await plugin.configResolved({ root, command: "serve" }); const code = plugin.load("\0virtual:syncloudos/themes"); expect(code).not.toContain("com.example.paper"); });
});
