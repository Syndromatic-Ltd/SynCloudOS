import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { readThemeBundle, discoverThemeBundles, assertThemeFileNames } from "../../scripts/synware/theme-bundles.mjs";
import { themeStylesheet } from "../../scripts/synware/theme-loading.mjs";
const valid = resolve(import.meta.dirname, "../fixtures/themes/Valid.scostheme");
let directory: string, bundle: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "scos-bundle-")); bundle = join(directory, "Paper.scostheme"); cpSync(valid, bundle, { recursive: true }); });
afterEach(() => rmSync(directory, { recursive: true, force: true }));
const write = (file: string, value: string) => { const path = join(bundle, "Contents", file); mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, value); };
describe("static .scostheme bundles", () => {
  it("accepts a complete static bundle and freezes its theme recursively", () => {
    const value = readThemeBundle(bundle); expect(value.theme.bundleIdentifier).toBe("com.example.paper");
    for (const item of [value.theme, value.theme.colours, value.theme.colours.light, value.theme.navigation.compact, value.theme.presentation, value.theme.images]) expect(Object.isFrozen(item)).toBe(true);
    expect(discoverThemeBundles(directory).map((entry: any) => entry.theme.bundleIdentifier)).toEqual(["com.example.paper"]);
  });
  it("rejects explicit regular and large hit-target minima below 24px", () => {
    for (const size of ["regular", "large"]) {
      for (const property of ["min-width", "min-height", "min-inline-size", "min-block-size"]) {
        write("Resources/theme.css", `[data-nse-control="button"][data-nse-control-size="${size}"] { ${property}: 23.5px; }`);
        expect(() => readThemeBundle(bundle)).toThrow(/theme.css.*hit-target-limit/);
      }
    }
  });
  it("keeps Atmo's source-only motion allowance out of theme bundles", () => {
    write("Info.ts", 'export default { bundleIdentifier: "com.syndromatic.atmo", displayName: "Atmo", version: "1.0.0", themeContractVersion: 1 };');
    write("Resources/atmo-structure.controls.css", '[data-nse-control="button"] { transition: opacity 180ms; }');
    expect(() => readThemeBundle(bundle)).toThrow(/atmo-structure.controls.css.*motion/u);
  });
  it("accepts the former Atmo-only selectors in an authored theme through public hooks", () => {
    write("Resources/theme.css", `
      [data-nse-control="box"] > [data-nse-part="title"][data-nse-role="legend"],
      [data-nse-control="window"] [data-nse-part="document"],
      [data-nse-control="progress-indicator"][data-nse-suspended="true"] > [data-nse-part="image"],
      [data-nse-control="progress-indicator"][data-nse-style="bar"][data-nse-indeterminate="true"][data-nse-motion="static"] [data-nse-part="fill"],
      [data-nse-control="menu"][data-nse-part="surface"][data-nse-overlay-state="closing"] { color: red; }
    `);
    expect(readThemeBundle(bundle).stylesheets).toHaveLength(1);
  });
  it("accepts typography on contract parts", () => {
    write("Resources/theme.css", '[data-nse-control="button"] [data-nse-part="title"] { font: 600 14px/1.3 system-ui; font-variant-numeric: tabular-nums; line-height: 1.5; letter-spacing: .04em; word-spacing: .1em; text-transform: uppercase; }');
    expect(readThemeBundle(bundle).stylesheets).toHaveLength(1);
  });

  it("loads package-local WOFF2 fonts from an imported stylesheet", () => {
    write("Resources/fonts/paper.woff2", "wOF2");
    write("Resources/fonts/faces.css", '@font-face { font-family: "Paper Test"; src: url("./paper.woff2?v=1") format("woff2"); font-weight: 500; font-display: swap; }');
    write("Resources/theme.css", '@import "./fonts/faces.css"; [data-nse-control="button"] { font-family: "Paper Test"; }');
    const theme = readThemeBundle(bundle);
    expect(theme.files).toContain(join(bundle, "Contents/Resources/fonts/paper.woff2"));
    const css = themeStylesheet(theme, (file: string) => "/theme-assets/" + basename(file));
    expect(css).toContain("@font-face");
    expect(css).toContain("url(/theme-assets/paper.woff2?v=1)");
    expect(css).toContain('font-family:"Paper Test"');
  });

  it.each([
    'local("Installed Font")',
    'url(https://example.invalid/font.woff2)',
    'url(../../../external.woff2)',
    'url(data:font/woff2;base64,d09GMg==)',
    'url(./missing.woff2)',
    'url(./art.png)',
    'var(--font-file)',
  ])("rejects an invalid font src of %s", value => {
    writeFileSync(join(directory, "external.woff2"), "wOF2");
    write("Resources/art.png", "not a font");
    write("Resources/theme.css", `@font-face { font-family: "Paper Test"; src: ${value}; }`);
    expect(() => readThemeBundle(bundle)).toThrow(/theme.css.*(?:font|package-local|escapes)/iu);
  });

  it.each(["ttf", "otf", "woff"])("rejects a %s resource", extension => {
    write(`Resources/paper.${extension}`, "");
    expect(() => readThemeBundle(bundle)).toThrow(/static-resources/u);
  });

  it("still rejects @keyframes in authored themes", () => {
    write("Resources/theme.css", '@keyframes move { from { opacity: 0; } to { opacity: 1; } }');
    expect(() => readThemeBundle(bundle)).toThrow(/css-at-rule.*keyframes/u);
  });

  const cases: [string, RegExp][] = [
    ["unknown keys", /Theme.json.*unknown|unknown.*Theme.json/i],
    ["identity duplication", /Theme.json.*unknown|unknown.*Theme.json/i],
    ["unknown colours", /Theme.json.*colour|colour.*Theme.json/i],
    ["missing dark colours", /Theme.json.*labelColour|labelColour.*Theme.json/],
    ["bad placement", /Theme.json.*placement|placement.*Theme.json/i],
    ["executable file", /run.js.*static|static.*run.js/i],
    ["TypeScript resource", /run.ts.*static|static.*run.ts/i],
    ["executable Info", /Info.ts.*static|Info.ts.*execut/i],
    ["path traversal", /theme.css.*local|theme.css.*escap|escap.*theme.css/i],
    ["missing image", /Theme.json.*missing|missing.*Theme.json/i],
    ["missing resolution", /Theme.json.*2x|2x.*Theme.json/],
    ["SVG script", /image.svg.*SVG|SVG.*image.svg/i],
    ["SVG handler", /image.svg.*SVG|SVG.*image.svg/i],
    ["SVG external reference", /image.svg.*SVG|SVG.*image.svg/i],
    ["private selectors", /theme.css.*selector|selector.*theme.css/i],
    ["app selectors", /theme.css.*selector|selector.*theme.css/i],
    ["unknown hooks", /theme.css.*control|control.*theme.css/i],
    ["motion", /theme.css.*motion|motion.*theme.css/i],
    ["focus removal", /theme.css.*focus|focus.*theme.css/i],
    ["semantic hiding", /theme.css.*semantic|semantic.*theme.css/i],
    ["oversized slice", /theme.css.*slice|slice.*theme.css/i],
    ["cyclic imports", /theme.css.*cycl|cycl.*theme.css/i],
    ["external import", /theme.css.*local|local.*theme.css/i]
  ];
  for (const [name, message] of cases) it(`rejects ${name} with a file-specific rule`, () => {
    cpSync(resolve(import.meta.dirname, "../fixtures/themes/Rejected-" + name.replaceAll(" ", "-") + ".scostheme"), bundle, { recursive: true });
    expect(() => readThemeBundle(bundle)).toThrow(message);
  });
  it("rejects a file over the PR #1 size limit", () => { const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/themes/oversized-resource.json"), "utf8")); write("Resources/large.txt", ""); truncateSync(join(bundle, "Contents/Resources/large.txt"), fixture.bytes); expect(() => readThemeBundle(bundle)).toThrow(/large.txt.*size|size.*large.txt/i); });
  it("rejects aggregate resources over PR #1's bundle size limit", () => { const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/themes/bundle-limits.json"), "utf8")); for (let index = 0; index < fixture.totalFiles; index++) { write("Resources/large-" + index + ".txt", ""); truncateSync(join(bundle, "Contents/Resources/large-" + index + ".txt"), fixture.totalFileBytes); } expect(() => readThemeBundle(bundle)).toThrow(/large.*size|size.*large/i); });
  it("rejects too many resource files", () => { const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/themes/bundle-limits.json"), "utf8")); for (let index = 0; index < fixture.count; index++) write("Resources/count-" + index + ".txt", ""); expect(() => readThemeBundle(bundle)).toThrow(/count.*limit|limit.*count/i); });
  it("rejects directory depth over PR #1's limit with its path", () => { const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/themes/bundle-limits.json"), "utf8")); write("Resources/" + Array(fixture.depth).fill("nested").join("/") + "/end.txt", ""); expect(() => readThemeBundle(bundle)).toThrow(/nested.*depth|depth.*nested/i); });
  it("rejects symbolic links", () => { symlinkSync(directory, join(bundle, JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/themes/symbolic-link.json"), "utf8")).path), "junction"); expect(() => readThemeBundle(bundle)).toThrow(/symbolic.*linked|linked.*symbolic/i); });
  it("rejects case-colliding resource names on all platforms", () => { expect(() => assertThemeFileNames(JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/themes/case-collision.json"), "utf8")).names)).toThrow(/case collision/i); });
  it("rejects duplicate discovered bundle identifiers", () => { cpSync(valid, join(directory, "Other.scostheme"), { recursive: true }); expect(() => discoverThemeBundles(directory)).toThrow(/duplicate.*com.example.paper/i); });
});
