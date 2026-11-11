import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readThemeBundle, discoverThemeBundles, assertThemeFileNames } from "../../scripts/synware/theme-bundles.mjs";
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
  const cases: [string, RegExp][] = [
    ["unknown keys", /Theme.json.*unknown|unknown.*Theme.json/i],
    ["identity duplication", /Theme.json.*unknown|unknown.*Theme.json/i],
    ["unknown colours", /Theme.json.*colour|colour.*Theme.json/i],
    ["missing dark colours", /Theme.json.*labelColour|labelColour.*Theme.json/],
    ["bad placement", /Theme.json.*placement|placement.*Theme.json/i],
    ["executable file", /run.js.*static|static.*run.js/i],
    ["TypeScript resource", /run.ts.*static|static.*run.ts/i],
    ["font resource", /font.woff2.*static|static.*font.woff2/i],
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
    ["typography", /theme.css.*typography|typography.*theme.css/i],
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
