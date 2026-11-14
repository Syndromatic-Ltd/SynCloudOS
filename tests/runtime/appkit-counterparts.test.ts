import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { appkitCounterpartFor } from "../../scripts/developer-mcp/lookup.mjs";
import { collectSrcNSEDeclarations, internalAppkitCounterpartFor } from "../../scripts/quality/nse-internal-names.mjs";
import { synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";

interface CounterpartMap {
  readonly members: Readonly<Record<string, string>>;
  readonly derivedSuffixes: readonly string[];
  readonly internalDerivedSuffixes?: readonly string[];
  readonly counterparts: Readonly<Record<string, string | { readonly none: string; readonly replacement?: string }>>;
  readonly internalCounterparts?: Readonly<Record<string, string>>;
}

const APPKIT_COUNTERPART_PATTERN = /^(?:NS|AV|CA|CG|CT|WK|@IB|UndoManager$|OperationQueue$|UserDefaults$|Date$)/u;

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
      if (typeof value === "string") expect(value, name).toMatch(APPKIT_COUNTERPART_PATTERN);
      else expect(value.none.length, name).toBeGreaterThan(10);
    }
  });

  it("every NSE-prefixed declaration in src has an AppKit counterpart", () => {
    for (const [name, value] of Object.entries(map.internalCounterparts ?? {})) {
      expect(typeof value, name).toBe("string");
      expect(value, name).toMatch(APPKIT_COUNTERPART_PATTERN);
    }
    const declared = [...new Set(collectSrcNSEDeclarations().map((entry) => entry.name))].sort();
    expect(declared).toEqual(expect.arrayContaining(["NSEView", "NSEViewController", "NSEWindow"]));
    const missing = declared.filter((name) => internalAppkitCounterpartFor(name, map) === undefined);
    // Ceiling pinned at Task 22; Task 23 lowers this per family until missing.length === 0.
    expect(missing.length).toBeLessThanOrEqual(98);
  });

  it("records the NSImage named lookup and both template name constants", () => {
    expect(map.members).toMatchObject({
      "NSEImage.named": "NSImage.init(named:)",
      "NSEImage.goBackTemplateName": "NSImage.goBackTemplateName",
      "NSEImage.goForwardTemplateName": "NSImage.goForwardTemplateName",
    });
  });

  it("derives a type's counterpart from its class", () => {
    expect(appkitCounterpartFor("NSEImage", map)).toBe("NSImage");
    expect(appkitCounterpartFor("NSEButtonProps", map)).toBe("NSButton");
    expect(appkitCounterpartFor("NSETabViewControllerSnapshot", map)).toBe("NSTabViewController");
    expect(appkitCounterpartFor("NSEColourWell", map)).toBe("NSColorWell");
    expect(appkitCounterpartFor("NSETabBarProps", map)).toBeUndefined();
    expect(appkitCounterpartFor("NSEUnknownThing", map)).toBeUndefined();
    expect(internalAppkitCounterpartFor("NSEColourPanelProvider", map)).toBe("NSColorPanel");
  });
});
