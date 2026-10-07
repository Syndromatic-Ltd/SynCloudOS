/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { synWareSdkEntries } from "../../scripts/synware/sdk-entries.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const guardPath = resolve(repositoryRoot, "scripts/synware/public-api-boundaries.mjs");

async function guard() {
  expect(existsSync(guardPath), "The internal SDK public API guard must exist").toBe(true);
  return import("../../scripts/synware/public-api-boundaries.mjs");
}

function fixture(files: Record<string, string>, entries: Record<string, string> = { sdk: "src/sdk.ts" }) {
  const root = resolve(repositoryRoot, "tests/fixtures/virtual-public-api-boundaries");
  const sources = new Map(Object.entries(files).map(([path, source]) => [resolve(root, path), source]));
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noLib: true,
    types: [],
    baseUrl: root,
    paths: Object.fromEntries(Object.entries(entries).map(([entry, path]) => [
      `@syndromatic/syncloudos/${entry}`, [path],
    ])),
  };
  const host = ts.createCompilerHost(options);
  host.fileExists = (path) => sources.has(resolve(path));
  host.readFile = (path) => sources.get(resolve(path));
  host.directoryExists = (path) => [...sources.keys()].some((file) => file.startsWith(resolve(path) + "/") || file.startsWith(resolve(path) + "\\"));
  host.getSourceFile = (path, languageVersion) => {
    const source = host.readFile(path);
    return source === undefined ? undefined : ts.createSourceFile(path, source, languageVersion, true);
  };
  host.getCurrentDirectory = () => root;
  const program = ts.createProgram(Object.values(entries).map((path) => resolve(root, path)), options, host);
  return { program, repositoryRoot: root, entries };
}

describe("SDK build public API boundaries", () => {
  it("rejects retired umbrella editor APIs even under a new public alias", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/private.ts": "export interface NSEEditorController { editor: unknown }",
      "src/sdk.ts": "export type { NSEEditorController as NewTextController } from './private';",
    });
    expect(inspectPublicApiBoundaries(input)).toEqual([expect.objectContaining({ exportName: "NewTextController", reason: "retired-editor" })]);
  });
  it("rejects vendor backend types nested in a public text view contract", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "node_modules/@tiptap/core/index.d.ts": "export interface Editor { vendor: true }",
      "src/sdk.ts": "import type { Editor } from '../node_modules/@tiptap/core/index'; export interface TextViewProps { controller: { ready(editor: Editor): void } }",
    });
    expect(inspectPublicApiBoundaries(input)).toEqual([expect.objectContaining({ exportName: "TextViewProps", reason: "backend" })]);
  });
  it("accepts every actual public entry in sdk-entries", async () => {
    const { assertPublicApiBoundaries } = await guard();
    expect(Object.keys(synWareSdkEntries)).toContain("sdk/testing");
    expect(() => assertPublicApiBoundaries(repositoryRoot)).not.toThrow();
  }, 60_000);

  it.each([
    "NSEStandardWindowSpecimen", "NSEStandardWindowSpecimenProps", "nseControlVariantCount",
    "PortfolioCollectionSnapshot", "PortfolioCollectionsClient", "portfolioCollectionsServiceToken",
    "SourceListFrameProvider", "SourceListFrameContextValue", "useSourceListFrame",
    "NSEWindowSurfaceBridge", "NSEWindowSurfaceBridgeProvider", "NSEWindowSurfaceRequest",
    "NSEWindowSurfaceDismissResult", "NSEWindowSurfaceErrorContext", "useOptionalNSEWindowSurfaceBridge",
    "WindowManager", "WindowController", "NSEWindowController", "SynWareProvider", "SynWareProviderProps",
    "SynWareRuntimeMount", "SynWareRuntimeMountProps", "nseRegistry",
    "SystemAlert", "SystemAlertAssetCache", "NSESystemAlert", "NSESystemAlertError",
  ])("rejects an aliased type export of %s from an ordinary entry", async (name) => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/owner.ts": `export interface ${name} { readonly value: string; }`,
      "src/middle.ts": `export type { ${name} as renamed } from './owner';`,
      "src/sdk.ts": "export type { renamed as publicContract } from './middle';",
    });
    expect(inspectPublicApiBoundaries(input)).toEqual([
      expect.objectContaining({ entry: "sdk", exportName: "publicContract", symbolName: name }),
    ]);
  });

  it("finds wildcard and namespace leaks through cyclic reexports and preserves the alias path", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/owner.ts": "export const nseControlVariantCount = 4; export * from './middle';",
      "src/middle.ts": "export { nseControlVariantCount as hiddenCount } from './owner';",
      "src/sdk.ts": "export * as controls from './middle';",
    });
    expect(inspectPublicApiBoundaries(input)).toEqual([
      expect.objectContaining({ entry: "sdk", exportName: "controls.hiddenCount", symbolName: "nseControlVariantCount" }),
    ]);
  });

  it("catches forbidden intermediate aliases even when the declaration has a generic name", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    expect(inspectPublicApiBoundaries(fixture({
      "src/owner.ts": "export const harmless = 1;",
      "src/middle.ts": "export { harmless as SystemAlertFactory } from './owner';",
      "src/sdk.ts": "export { SystemAlertFactory as factory } from './middle';",
    }))).toEqual([expect.objectContaining({ exportName: "factory", symbolName: "SystemAlertFactory" })]);
  });

  it("rejects a direct imported host type declaration alias with no semantic errors", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/owner.ts": "export interface SourceListFrameContextValue { readonly value: string; }",
      "src/sdk.ts": "import type { SourceListFrameContextValue } from './owner'; export type FrameConfiguration = SourceListFrameContextValue;",
    });
    expect(input.program.getSemanticDiagnostics()).toEqual([]);
    expect(inspectPublicApiBoundaries(input)).toEqual([
      expect.objectContaining({ entry: "sdk", exportName: "FrameConfiguration", symbolName: "SourceListFrameContextValue", reason: "host" }),
    ]);
  });

  it("rejects a direct imported fixture value declaration alias with no semantic errors", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/owner.ts": "export const nseControlVariantCount = 4;",
      "src/sdk.ts": "import { nseControlVariantCount } from './owner'; export const controlCount = nseControlVariantCount;",
    });
    expect(input.program.getSemanticDiagnostics()).toEqual([]);
    expect(inspectPublicApiBoundaries(input)).toEqual([
      expect.objectContaining({ entry: "sdk", exportName: "controlCount", symbolName: "nseControlVariantCount", reason: "fixture" }),
    ]);
  });

  it("follows qualified type aliases across intermediate declarations and reexports", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/owner.ts": "export interface SourceListFrameContextValue { readonly value: string; }",
      "src/middle.ts": "import type * as host from './owner'; type Frame = host.SourceListFrameContextValue; export type Settings = Frame;",
      "src/sdk.ts": "export type { Settings as FrameConfiguration } from './middle';",
    });
    expect(input.program.getSemanticDiagnostics()).toEqual([]);
    expect(inspectPublicApiBoundaries(input)).toEqual([
      expect.objectContaining({ exportName: "FrameConfiguration", symbolName: "SourceListFrameContextValue" }),
    ]);
  });

  it("follows property-access value aliases across intermediate declarations and reexports", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/owner.ts": "export const nseControlVariantCount = 4;",
      "src/middle.ts": "import * as gallery from './owner'; const tally = gallery.nseControlVariantCount; export const count = tally;",
      "src/sdk.ts": "export { count as controlCount } from './middle';",
    });
    expect(input.program.getSemanticDiagnostics()).toEqual([]);
    expect(inspectPublicApiBoundaries(input)).toEqual([
      expect.objectContaining({ exportName: "controlCount", symbolName: "nseControlVariantCount" }),
    ]);
  });

  it("finds forbidden intermediate declaration names and terminates value alias cycles", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/sdk.ts": "export var controlCount = internal; var internal = nseControlVariantCount; var nseControlVariantCount = controlCount;",
    });
    expect(input.program.getSemanticDiagnostics()).toEqual([]);
    expect(inspectPublicApiBoundaries(input)).toEqual([
      expect.objectContaining({ exportName: "controlCount", symbolName: "nseControlVariantCount" }),
    ]);
  });

  it("terminates benign type and value declaration alias cycles", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    expect(inspectPublicApiBoundaries(fixture({
      "src/sdk.ts": "export type First = Second; type Second = First; export var first = second; var second = first;",
    }))).toEqual([]);
  });

  it.each([
    ["export type FrameConfiguration = (owner.SourceListFrameContextValue);", "FrameConfiguration", "SourceListFrameContextValue"],
    ["export const controlCount = (owner.nseControlVariantCount);", "controlCount", "nseControlVariantCount"],
    ["export type ControlCount = typeof owner.nseControlVariantCount;", "ControlCount", "nseControlVariantCount"],
  ])("follows transparent direct declaration aliases: %s", async (declaration, exportName, symbolName) => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/owner.ts": "export interface SourceListFrameContextValue { readonly value: string; } export const nseControlVariantCount = 4;",
      "src/sdk.ts": `import * as owner from './owner'; ${declaration}`,
    });
    expect(input.program.getSemanticDiagnostics()).toEqual([]);
    expect(inspectPublicApiBoundaries(input)).toEqual([
      expect.objectContaining({ exportName, symbolName }),
    ]);
  });

  it("accepts direct generic aliases and compiler intrinsic values without source declarations", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/sdk.ts": [
        "interface CollectionSnapshot { readonly size: number; }",
        "export type LibrarySnapshot = CollectionSnapshot;",
        "const collectionServiceToken = 1; export const token = collectionServiceToken;",
        "export const emptyValue = undefined; export type EmptyValue = typeof undefined;",
      ].join("\n"),
    });
    expect(input.program.getSemanticDiagnostics()).toEqual([]);
    expect(inspectPublicApiBoundaries(input)).toEqual([]);
  });

  it("preserves scoped testing ownership through direct variable aliases", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/SynCloudOS/AppSDK/testing/fake.ts": "export const createFakeWindowClient = () => ({});",
      "src/testing.ts": "import { createFakeWindowClient } from './SynCloudOS/AppSDK/testing/fake'; export const makeFakeWindow = createFakeWindowClient;",
      "src/sdk.ts": "import { makeFakeWindow } from '@syndromatic/syncloudos/sdk/testing'; export const makeWindow = makeFakeWindow;",
    }, { "sdk/testing": "src/testing.ts", sdk: "src/sdk.ts" });
    expect(input.program.getSemanticDiagnostics()).toEqual([]);
    expect(inspectPublicApiBoundaries(input)).toEqual([
      expect.objectContaining({ entry: "sdk", exportName: "makeWindow", reason: "testing" }),
    ]);
  });

  it("does not traverse arbitrary object members or compound type contents", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/owner.ts": "export interface SourceListFrameContextValue { readonly value: string; } export const nseControlVariantCount = 4;",
      "src/sdk.ts": [
        "import { nseControlVariantCount, type SourceListFrameContextValue } from './owner';",
        "export interface ComponentProps { readonly frame: SourceListFrameContextValue; }",
        "export type ComponentOptions = { readonly frame: SourceListFrameContextValue; };",
        "export type OptionalFrame = SourceListFrameContextValue | undefined;",
        "export const componentDefaults = { count: nseControlVariantCount };",
        "export const computeCount = () => nseControlVariantCount;",
      ].join("\n"),
    });
    expect(input.program.getSemanticDiagnostics()).toEqual([]);
    expect(inspectPublicApiBoundaries(input)).toEqual([]);
  });

  it("allows generic collection APIs and unrelated providers", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    expect(inspectPublicApiBoundaries(fixture({
      "src/sdk.ts": [
        "export interface CollectionSnapshot { readonly items: string[]; }",
        "export interface NSECollectionViewProviderProps { readonly value: string; }",
        "export class NSEArrayController {}",
        "export const AppearanceProvider = 1;",
        "export const collectionServiceToken = 1;",
      ].join("\n"),
    }))).toEqual([]);
  });

  it("classifies exported symbols rather than their module filenames", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    expect(inspectPublicApiBoundaries(fixture({
      "src/Specimen/collections.ts": "export interface CollectionSnapshot { readonly size: number; }",
      "src/sdk.ts": "export * as collections from './Specimen/collections';",
    }))).toEqual([]);
  });

  it("rejects runtime leakage through multiple wildcard barrels", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    expect(inspectPublicApiBoundaries(fixture({
      "src/owner.ts": "export const nseControlVariantCount = 4;",
      "src/middle.ts": "export * from './owner';",
      "src/sdk.ts": "export * from './middle';",
    }))).toEqual([
      expect.objectContaining({ entry: "sdk", exportName: "nseControlVariantCount", reason: "fixture" }),
    ]);
  });

  it("rejects a forbidden named default declaration behind a generic alias", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    expect(inspectPublicApiBoundaries(fixture({
      "src/owner.ts": "export default class GallerySpecimen {}",
      "src/sdk.ts": "export { default as Demo } from './owner';",
    }))).toEqual([
      expect.objectContaining({ entry: "sdk", exportName: "Demo", symbolName: "GallerySpecimen" }),
    ]);
  });

  it.each(["browser", "sdk/animation-host"])("allows host wiring only at the explicit %s host entry", async (entry) => {
    const { inspectPublicApiBoundaries } = await guard();
    const files = {
      "src/host.ts": "export class WindowController {} export const SourceListFrameProvider = 1;",
      "src/entry.ts": "export * from './host';",
    };
    expect(inspectPublicApiBoundaries(fixture(files, { [entry]: "src/entry.ts" }))).toEqual([]);
    expect(inspectPublicApiBoundaries(fixture(files, { "browser/custom": "src/entry.ts" }))).toHaveLength(2);
  });

  it.each(["browser", "sdk/animation-host", "sdk/testing"])("does not exempt product contracts or gallery fixtures at %s", async (entry) => {
    const { inspectPublicApiBoundaries } = await guard();
    expect(inspectPublicApiBoundaries(fixture({
      "src/entry.ts": "export const GallerySpecimen = 1; export interface PortfolioCollectionsClient {}",
    }, { [entry]: "src/entry.ts" }))).toHaveLength(2);
  });

  it("permits scoped fake test support in sdk/testing but catches renamed leakage through public package roots", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    const input = fixture({
      "src/SynCloudOS/AppSDK/testing/fake.ts": "export const createFakeWindowClient = () => ({});",
      "src/testing.ts": "export { createFakeWindowClient } from './SynCloudOS/AppSDK/testing/fake';",
      "src/sdk.ts": "export { createFakeWindowClient as makeWindow } from '@syndromatic/syncloudos/sdk/testing';",
    }, { "sdk/testing": "src/testing.ts", sdk: "src/sdk.ts" });
    expect(inspectPublicApiBoundaries(input)).toEqual([
      expect.objectContaining({ entry: "sdk", exportName: "makeWindow", reason: "testing" }),
    ]);
  });

  it("does not permit raw host machinery in sdk/testing", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    expect(inspectPublicApiBoundaries(fixture({
      "src/entry.ts": "export class WindowManager {}",
    }, { "sdk/testing": "src/entry.ts" }))).toEqual([
      expect.objectContaining({ entry: "sdk/testing", exportName: "WindowManager", reason: "host" }),
    ]);
  });

  it("fails closed for a missing public root or unresolved wildcard export", async () => {
    const { inspectPublicApiBoundaries } = await guard();
    expect(inspectPublicApiBoundaries(fixture({}))).toEqual([
      expect.objectContaining({ entry: "sdk", reason: "unresolved" }),
    ]);
    expect(inspectPublicApiBoundaries(fixture({ "src/sdk.ts": "export * from './missing';" }))).toEqual([
      expect.objectContaining({ entry: "sdk", reason: "unresolved" }),
    ]);
    expect(inspectPublicApiBoundaries(fixture({
      "src/sdk.ts": "import { hidden } from './missing'; export const publicValue = hidden;",
    }))).toEqual([
      expect.objectContaining({ entry: "sdk", exportName: "publicValue", reason: "unresolved" }),
    ]);
  });

  it("rejects a leaking build before fingerprinting or any build/output side effects", async () => {
    const buildPath = resolve(repositoryRoot, "scripts/synware/build-sdk.mjs");
    const source = readFileSync(buildPath, "utf8").replaceAll("import.meta.url", JSON.stringify(pathToFileURL(buildPath).href));
    const failure = new TypeError("SDK public API boundary violation: nseControlVariantCount");
    const assertPublicApiBoundaries = vi.fn(() => { throw failure; });
    const captureSdkSourceFingerprint = vi.fn(() => ({}));
    const buildWork = vi.fn(() => { throw new Error("Build work must not start after boundary rejection"); });
    const modules: Record<string, unknown> = {
      "node:child_process": { execFileSync: buildWork },
      "node:fs": Object.fromEntries(["cpSync", "existsSync", "mkdirSync", "readdirSync", "readFileSync", "renameSync", "rmSync", "writeFileSync"].map((name) => [name, buildWork])),
      "node:crypto": { createHash: buildWork },
      "node:path": { dirname, resolve },
      "node:url": { fileURLToPath },
      vite: { build: buildWork },
      "@vitejs/plugin-react": { default: buildWork },
      "./sdk-entries.mjs": { synWareSdkEntries },
      "./sdk-package-manifest.mjs": { captureSdkSourceFingerprint },
      "./sdk-package-styles.mjs": {},
      "./public-api-boundaries.mjs": { assertPublicApiBoundaries },
    };
    let stderr = "";
    const sandbox = {
      URL,
      exports: {},
      require: (name: string) => { expect(Object.hasOwn(modules, name)).toBe(true); return modules[name]; },
      process: { execPath: process.execPath, env: {}, exitCode: 0, stderr: { write: (value: string) => { stderr += value; } } },
    };
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(compiled, sandbox);
    await Promise.resolve();
    expect(assertPublicApiBoundaries).toHaveBeenCalledWith(repositoryRoot);
    expect(captureSdkSourceFingerprint).not.toHaveBeenCalled();
    expect(buildWork).not.toHaveBeenCalled();
    expect(stderr).toContain(failure.message);
    expect(sandbox.process.exitCode).toBe(1);
  });
});
