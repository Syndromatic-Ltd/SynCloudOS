import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import * as D from "../../../src/FX/DispatchFX/public";
import { appkitCounterpartFor } from "../../../scripts/developer-mcp/lookup.mjs";
import { synWareSdkEntries } from "../../../scripts/synware/sdk-entries.mjs";
import { assertFxPackageExports, requiredFxFamilies } from "../../../scripts/synware/sdk-package-manifest.mjs";

const expected = {
  DFXTime: "DispatchTime", DFXWallTime: "DispatchWallTime", DFXTimeInterval: "DispatchTimeInterval",
  DFXTimeoutResult: "DispatchTimeoutResult", DFXQoS: "DispatchQoS", DFXQoSClass: "DispatchQoS.QoSClass",
  DFXQueueAttributes: "DispatchQueue.Attributes", DFXQueueAutoreleaseFrequency: "DispatchQueue.AutoreleaseFrequency",
  DFXWorkItemFlags: "DispatchWorkItemFlags", DFXSpecificKey: "DispatchSpecificKey",
  DFXSourceTimerFlags: "DispatchSource.TimerFlags", DFXSourceMemoryPressureEvent: "DispatchSource.MemoryPressureEvent",
  DFXObject: "DispatchObject", DFXQueue: "DispatchQueue", DFXPredicate: "DispatchPredicate", dispatchPrecondition: "dispatchPrecondition",
  DFXWorkItem: "DispatchWorkItem", DFXGroup: "DispatchGroup", DFXSemaphore: "DispatchSemaphore",
};
it("maps every public Dispatch export through developer MCP counterpart lookup", () => {
  const map = JSON.parse(readFileSync("docs/framework/appkit-counterparts.json", "utf8"));
  expect(Object.keys(D).sort()).toEqual(Object.keys(expected).sort());
  for (const [name, apple] of Object.entries(expected)) expect(appkitCounterpartFor(name, map), name).toBe(apple);
});
it("registers the canonical SDK entry and generated package export policy", () => {
  expect(synWareSdkEntries["fx/dispatch"]).toBe("src/FX/DispatchFX/public.ts");
  expect(requiredFxFamilies).toContain("dispatch");
  const exports = Object.fromEntries(requiredFxFamilies.map(family => [`./fx/${family}`, { types: `./fx/${family}.d.ts`, import: `./fx/${family}.js` }]));
  exports["./fx/video/webm"] = { types: "./fx/video/webm.d.ts", import: "./fx/video/webm.js" };
  expect(() => assertFxPackageExports(exports)).not.toThrow();
});
it("keeps the public entry exclusively explicit re-exports without private helpers", () => {
  const text = readFileSync("src/FX/DispatchFX/public.ts", "utf8");
  const source = ts.createSourceFile("public.ts", text, ts.ScriptTarget.Latest, true);
  expect(source.statements.length).toBe(Object.keys(expected).length);
  for (const node of source.statements) {
    expect(ts.isExportDeclaration(node)).toBe(true);
    expect(node.getText()).not.toContain("internal/");
  }
});

it("publishes only mapped Apple types and keeps private storage out of declarations", () => {
  const path = "src/FX/DispatchFX/public.ts";
  const declarations: string[] = [];
  const program = ts.createProgram([path], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, types: [], skipLibCheck: true,
    declaration: true, emitDeclarationOnly: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(path)!;
  const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(source)!);
  expect(exports.map(symbol => symbol.name).sort()).toEqual(Object.keys(expected).sort());
  expect(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  const result = program.emit(undefined, (path, text) => {
    if (!path.includes("/internal/")) declarations.push(text);
  });
  expect(result.emitSkipped).toBe(false);
  const text = declarations.join("\n");
  expect(text).not.toMatch(/(?:initialiseInterval|safeDistance|maximumNanoseconds|clientError|ScheduledJob|BrowserYieldHost|postTask|executionStack|queueState)/);
  const privateImports = [...text.matchAll(/from\s+["']([^"']*internal\/[^"']+)["']/g)].map(match => match[1]);
  expect(privateImports).toEqual(["./internal/work", "./internal/work", "./internal/work"]);
  expect(text).not.toMatch(/(?:workItemState|groupState|blockingRules|mainThreadWait|drainJobs|registerGroupJob)/);
  expect(text).toMatch(/class DFXWorkItem<R = unknown>/);
  expect(text).toMatch(/class DFXGroup extends DFXObject/);
  expect(text).toMatch(/class DFXSemaphore extends DFXObject/);
  expect(text).not.toMatch(/(?:BrowserHost|createRootScheduler|rootScheduler|prepareWork|ConsoleTask|PredicateKind)/);
  expect(text).toMatch(/readonly rawValue: bigint/);
  expect(text).toMatch(/readonly uptimeNanoseconds: number/);
  expect(text).toMatch(/class DFXWallTime[\s\S]*?private constructor\(\)/);
});
