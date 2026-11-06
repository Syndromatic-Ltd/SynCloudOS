import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { appkitCounterpartFor } from "../../scripts/developer-mcp/lookup.mjs";
import { synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";

interface CounterpartMap {
  readonly derivedSuffixes: readonly string[];
  readonly counterparts: Readonly<Record<string, string | { readonly none: string; readonly replacement?: string }>>;
}

const map = JSON.parse(readFileSync(resolve("docs/framework/appkit-counterparts.json"), "utf8")) as CounterpartMap;

/** Every NSE name a public SDK entry exports, aliases resolved to the name the entry gives them. */
function publicNSENames(): readonly string[] {
  const sources = [...new Set(Object.values(synWareSdkEntries).filter((path) => /\.tsx?$/u.test(path)))].map((path) => resolve(path));
  const program = ts.createProgram(sources, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const names = new Set<string>();
  for (const path of sources) {
    const source = program.getSourceFile(path);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) continue;
    for (const symbol of checker.getExportsOfModule(module)) if (/^NSE[A-Z]/u.test(symbol.name)) names.add(symbol.name);
  }
  return [...names].sort();
}

describe("NSE names are AppKit names", () => {
  const names = publicNSENames();

  it("gives every public NSE export an AppKit counterpart, or says why it has none", () => {
    expect(names.length).toBeGreaterThan(400);
    const missing = names.filter((name) => appkitCounterpartFor(name, map) === undefined);
    // Add the new name to docs/framework/appkit-counterparts.json with its AppKit counterpart. An NSE
    // name with no counterpart needs { "none": reason }: see "NSE names are AppKit names" in AGENTS.md.
    expect(missing).toEqual([]);
  });

  it("lists no name the SDK no longer exports", () => {
    const exported = new Set(names);
    expect(Object.keys(map.counterparts).filter((name) => !exported.has(name))).toEqual([]);
  });

  it("names a counterpart or a reason for each entry", () => {
    for (const [name, value] of Object.entries(map.counterparts)) {
      if (typeof value === "string") expect(value, name).toMatch(/^(?:NS|CA|CG|CT|WK|@IB|UndoManager$|OperationQueue$|UserDefaults$|Date$)/u);
      else expect(value.none.length, name).toBeGreaterThan(10);
    }
  });

  it("derives a type's counterpart from its class", () => {
    expect(appkitCounterpartFor("NSEButtonProps", map)).toBe("NSButton");
    expect(appkitCounterpartFor("NSETabViewControllerSnapshot", map)).toBe("NSTabViewController");
    expect(appkitCounterpartFor("NSEColourWell", map)).toBe("NSColorWell");
    expect(appkitCounterpartFor("NSETabBarProps", map)).toMatchObject({ replacement: "NSTabViewController" });
    expect(appkitCounterpartFor("NSEUnknownThing", map)).toBeUndefined();
  });
});
