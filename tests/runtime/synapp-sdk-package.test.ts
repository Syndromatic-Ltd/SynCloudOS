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

// @vitest-environment jsdom

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { forwardRef, memo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineWebspring, defineWidget, type WebspringViewProps } from "../../src/Webspring/public";

const repositoryRoot = process.cwd();
const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  mkdirSync(join(repositoryRoot, ".artifacts"), { recursive: true });
  const directory = mkdtempSync(join(repositoryRoot, ".artifacts", "synware-external-"));
  temporaryDirectories.push(directory);
  return directory;
}

function npmCli() {
  return process.env.npm_execpath ?? resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
}

function runNpm(args: readonly string[], cwd: string) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.toLowerCase() === "npm_config_allow_scripts") delete environment[key];
  }
  return execFileSync(process.execPath, [npmCli(), ...args], { cwd, env: environment, encoding: "utf8", stdio: "pipe" });
}

function buildPackedSdk(environment: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(process.execPath, ["scripts/synware/build-sdk.mjs"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
  });
  if (result.status !== 0) throw new Error(`SynWare SDK package build failed:\n${result.stdout}\n${result.stderr}`);
}

function sourceExports(path: string) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) => (
    ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)
      ? statement.exportClause.elements.map((element) => element.name.text)
      : []
  ));
}

function directoryFiles(directory: string, prefix = ""): readonly string[] {
  return readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? directoryFiles(directory, path) : [path];
  });
}

function staticSourceGraph(entry: string): readonly string[] {
  const visited = new Set<string>();
  const visit = (path: string) => {
    if (visited.has(path)) return;
    visited.add(path);
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith(".")) continue;
      const target = resolve(dirname(path), specifier);
      const resolvedPath = [target, `${target}.ts`, `${target}.tsx`, join(target, "index.ts"), join(target, "index.tsx")].find(existsSync);
      if (resolvedPath) visit(resolvedPath);
    }
  };
  visit(entry);
  return [...visited];
}

function waitForSelector(root: ParentNode, selector: string): Promise<Element> {
  const current = root.querySelector(selector);
  if (current) return Promise.resolve(current);
  const { promise, resolve } = Promise.withResolvers<Element>();
  const observer = new MutationObserver(() => {
    const match = root.querySelector(selector);
    if (!match) return;
    observer.disconnect();
    resolve(match);
  });
  observer.observe(root, { childList: true, subtree: true });
  return promise;
}

function waitForText(root: ParentNode, text: string): Promise<void> {
  if (root.textContent?.includes(text)) return Promise.resolve();
  const { promise, resolve } = Promise.withResolvers<void>();
  const observer = new MutationObserver(() => {
    if (!root.textContent?.includes(text)) return;
    observer.disconnect();
    resolve();
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return promise;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("portable SynWare SDK packages", () => {
  it("keeps the public page entry limited to the controller contract", () => {
    expect(sourceExports(resolve(repositoryRoot, "src/NSE/public/page.ts")).sort()).toEqual([
      "NSEPageController", "NSEPageControllerOptions", "NSEPageControllerSnapshot",
      "NSEPageControllerSpineLocation", "NSEPageControllerTransitionStyle",
    ].sort());
  });

  it("pins the removal of the old navigation, source-list and sliding-pane exports", () => {
    const removed = ["NSEPageHeader", "NSEAdaptiveNavigationController", "NSETabBarController", "NSETabBar", "NSETabBarOverflowList", "NSENavigationStackController", "NSEHierarchyStack", "NSESourceListScene", "NSESidebar", "NSEStatusBar", "NSESlidingPane", "NSESlidingPanes", "createNSETabSelectionRestoration"];
    for (const entry of ["src/NSE/sdkPackageEntry.ts", "src/NSE/public/controls.ts", "src/NSE/public/layout.ts", "src/SynCloudOS/AppSDK/rootPackageEntry.ts"]) {
      const names = sourceExports(resolve(repositoryRoot, entry));
      expect(names.filter(name => removed.some(old => name === old || name.startsWith(`${old}Props`) || name.startsWith(`${old}Options`) || name.startsWith(`${old}Snapshot`)))).toEqual([]);
    }
    expect(sourceExports(resolve(repositoryRoot, "src/NSE/sdkPackageEntry.ts"))).toEqual(expect.arrayContaining(["NSETabViewController", "NSETabViewItem", "NSESplitViewController", "NSESplitViewItem"]));
  });

  it("captures shell view components without invoking author-owned values", () => {
    let componentCalls = 0;
    const WebsiteView = () => {
      componentCalls += 1;
      return null;
    };
    let componentGetterCalls = 0;
    const components = Object.defineProperty({}, "website", {
      enumerable: true,
      get() {
        componentGetterCalls += 1;
        return WebsiteView;
      },
    });
    const manifest = {
      schemaVersion: 1,
      bundleIdentifier: "com.example.webspring",
      version: "1.0.0",
      displayName: "Example Webspring",
      webspringShell: {
        views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
        defaults: { desktop: "website", tablet: "website", mobile: "website" },
        homeRoute: "/",
        branding: { name: { key: "site.name", fallback: "Example" } },
      },
    } as const;

    expect(() => defineWebspring({ manifest, components: components as never })).toThrow(/accessor/iu);
    expect(componentGetterCalls).toBe(0);
    const definition = defineWebspring({ manifest, components: { website: WebsiteView } });
    expect(definition.components.website).toBe(WebsiteView);
    expect(componentCalls).toBe(0);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.manifest.webspringShell.views)).toBe(true);
    const news = defineWidget({ id: "news", title: "News", load: () => [], view: () => null, whenEmpty: "hide" });
    const widgets = [news];
    const widgetDefinition = defineWebspring({ manifest, components: { website: WebsiteView }, widgets });
    widgets.length = 0;
    expect(widgetDefinition.widgets).toEqual([news]);
    expect(Object.isFrozen(widgetDefinition.widgets)).toBe(true);
    expect("content" in widgetDefinition).toBe(false);
    const MemoWebsiteView = memo(WebsiteView);
    const ForwardWebsiteView = forwardRef<HTMLElement, WebspringViewProps>(() => null);
    expect(defineWebspring({ manifest, components: { website: MemoWebsiteView } }).components.website).toBe(MemoWebsiteView);
    expect(defineWebspring({ manifest, components: { website: ForwardWebsiteView } }).components.website).toBe(ForwardWebsiteView);
    expect(componentCalls).toBe(0);
  });

  it("rejects inconsistent shell view bindings during capture", () => {
    const WebsiteView = () => null;
    const manifest = {
      schemaVersion: 1,
      bundleIdentifier: "com.example.webspring",
      version: "1.0.0",
      displayName: "Example Webspring",
      webspringShell: {
        views: [{ id: "website", presentations: ["desktop"], mode: "launcher" }],
        defaults: { desktop: "website", tablet: "website", mobile: "website" },
        homeRoute: "/",
        branding: { name: { key: "site.name" } },
      },
    } as const;

    expect(() => defineWebspring({ manifest, components: {} })).toThrow(/missing.*website/iu);
    expect(() => defineWebspring({ manifest, components: { website: WebsiteView, extra: WebsiteView } })).toThrow(/extra/iu);
    expect(() => defineWebspring({
      manifest: {
        ...manifest,
        webspringShell: {
          ...manifest.webspringShell,
          views: [
            ...manifest.webspringShell.views,
            { id: "website", presentations: ["mobile"], mode: "launcher" as const },
          ],
        },
      },
      components: { website: WebsiteView },
    })).toThrow(/duplicate.*website/iu);
    expect(() => defineWebspring({ manifest, components: { website: WebsiteView } })).toThrow(/tablet.*website/iu);
  });

  it("compiles, bundles and mounts a genuinely external consumer against packed public exports", async () => {
    const consoleError = vi.spyOn(console, "error");
    buildPackedSdk({ ...process.env, NODE_ENV: "test" });
    const buildManifest = JSON.parse(readFileSync(join(repositoryRoot, ".artifacts", "synapp-sdk", "build-manifest.json"), "utf8"));
    const appSdkArchive = join(repositoryRoot, ".artifacts", "synapp-sdk", buildManifest.entries["@syndromatic/syncloudos/sdk"].archive);
    const nseArchive = join(repositoryRoot, ".artifacts", "synapp-sdk", buildManifest.entries["@syndromatic/syncloudos/nse"].archive);
    expect(existsSync(appSdkArchive)).toBe(true);
    expect(existsSync(nseArchive)).toBe(true);
    expect(nseArchive).toBe(appSdkArchive);
    const packageManifest = JSON.parse(readFileSync(join(repositoryRoot, ".artifacts", "synapp-sdk", "packages", "syncloudos", "package.json"), "utf8"));
    expect(packageManifest.name).toBe("@syndromatic/syncloudos");
    expect(packageManifest.exports["./nse/styles.css"]).toBe("./nse/styles.css");
    expect(packageManifest.exports["./browser/styles.css"]).toBe("./browser/styles.css");
    expect(packageManifest.exports["./webspring/styles.css"]).toBe("./webspring/styles.css");
    expect(packageManifest.exports["./webspring"]).toEqual({ types: "./webspring.d.ts", import: "./webspring.js" });
    expect(packageManifest.exports["./browser"]).toEqual({ types: "./browser.d.ts", import: "./browser.js" });
    expect(packageManifest.exports["./auth"]).toEqual({ types: "./auth.d.ts", import: "./auth.js" });
    expect(packageManifest.exports["./vite"]).toEqual({ types: "./types/vite.d.mts", import: "./vite.mjs" });
    expect(Object.keys(packageManifest.exports).every((key) => !key.includes("*"))).toBe(true);
    expect(packageManifest.exports["./nse/animation"]).toBeUndefined();
    // nse/styles.css is a list of @imports of the bundled assets; the drawing layer's rule ships in one of them.
    const packagedNSEStyles = join(repositoryRoot, ".artifacts", "synapp-sdk", "packages", "syncloudos", "nse", "styles.css");
    const packagedNSEStylesheet = readFileSync(packagedNSEStyles, "utf8");
    const importedNSEStyles = [...packagedNSEStylesheet.matchAll(/@import "([^"]+)";/g)].map((match) => readFileSync(join(dirname(packagedNSEStyles), match[1]!), "utf8"));
    expect([packagedNSEStylesheet, ...importedNSEStyles].join("\n")).toContain("[data-nse-view-drawing-layer]");
    // Two published stylesheets list the theme. Imported from script they become imports of the same files, so the theme loads once.
    // Plain Node loads the packaged plugin, as a consumer's Vite does.
    const stylesheetFiles = (entry: string): string[] => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", [
      `const { synCloudOS } = await import(${JSON.stringify(pathToFileURL(join(repositoryRoot, ".artifacts", "synapp-sdk", "packages", "syncloudos", "vite.mjs")).href)});`,
      `const plugin = [synCloudOS({ webspringEntry: false })].flat().find(candidate => candidate.name === "syncloudos:project");`,
      `const id = plugin.resolveId("@syndromatic/syncloudos/${entry}/styles.css", "/consumer/src/main.tsx");`,
      `console.log(JSON.stringify([...plugin.load(id).matchAll(/import "([^"]+)";/gu)].map(match => match[1])));`,
    ].join("\n")], { cwd: repositoryRoot, encoding: "utf8" }));
    const browserFiles = stylesheetFiles("browser");
    const sharedTheme = browserFiles.filter((file) => /\/assets\/atmo-[^/]+\.css$/u.test(file));
    expect(sharedTheme.length).toBe(1);
    expect(stylesheetFiles("webspring")).toContain(sharedTheme[0]);
    expect(browserFiles.every((file) => existsSync(file))).toBe(true);
    const viewDeclarations = readFileSync(join(repositoryRoot, ".artifacts", "synapp-sdk", "packages", "syncloudos", "types", "NSE", "Views", "NSEView.d.ts"), "utf8");
    expect(viewDeclarations).toMatch(/draw\?:.*GFXContext/u);
    expect(viewDeclarations).toContain("NSEViewLayerContentsPlacement");
    expect(existsSync(join(repositoryRoot, ".artifacts", "synapp-sdk", "packages", "syncloudos", "types", "NSE", "Graphics", "NSEGraphicsView.d.ts"))).toBe(false);
    expect(packageManifest.exports["."]).toEqual({ types: "./index.d.ts", import: "./index.js" });
    expect(directoryFiles(join(repositoryRoot, ".artifacts", "synapp-sdk", "packages", "syncloudos"))
      .filter((path) => /^chunks\/(?:FrameworkTestHost|inspectorDev(?:Entry|Host))-/u.test(path))).toEqual([]);
    const emittedRouterDeclaration = readFileSync(join(
      repositoryRoot,
      ".artifacts",
      "synapp-sdk",
      "packages",
      "syncloudos",
      "types",
      "SynCloudOS",
      "AppSDK",
      "hooks",
      "useRouter.d.ts",
    ), "utf8");
    expect(emittedRouterDeclaration).not.toMatch(/AppRouteSession|MountedSynWareRouter|createMountedSynWareRouter/u);
    const emittedSdkDeclaration = readFileSync(join(
      repositoryRoot,
      ".artifacts",
      "synapp-sdk",
      "packages",
      "syncloudos",
      "types",
      "SynCloudOS",
      "AppSDK",
      "sdkPackageEntry.d.ts",
    ), "utf8");
    expect(emittedSdkDeclaration).not.toMatch(/from\s+["']\.\.\/SynCloudOS\.js["']/u);

    const expectedPeerDependencies = {
      react: JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).dependencies.react,
      "react-dom": JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")).dependencies["react-dom"],
    };
    expect(packageManifest.peerDependencies).toEqual(expectedPeerDependencies);

    const fixture = temporaryDirectory();
    writeFileSync(join(fixture, "package.json"), `${JSON.stringify({ name: "external-synware-fixture", private: true, type: "module" }, null, 2)}\n`, "utf8");
    writeFileSync(join(fixture, ".npmrc"), "allow-scripts=\naudit=false\nfund=false\n", "utf8");
    runNpm([
      "install",
      "--offline",
      "--package-lock=false",
      appSdkArchive,
      `file:${join(repositoryRoot, "node_modules", "react")}`,
      `file:${join(repositoryRoot, "node_modules", "react-dom")}`,
      `file:${join(repositoryRoot, "node_modules", "scheduler")}`,
      `file:${join(repositoryRoot, "node_modules", "@types", "react")}`,
      `file:${join(repositoryRoot, "node_modules", "@types", "react-dom")}`,
    ], fixture);
    const installedPackage = join(fixture, "node_modules", "@syndromatic", "syncloudos");
    expect(sourceExports(join(installedPackage, "types", "NSE", "public", "page.d.ts")).sort()).toEqual([
      "NSEPageController", "NSEPageControllerOptions", "NSEPageControllerSnapshot",
      "NSEPageControllerSpineLocation", "NSEPageControllerTransitionStyle",
    ].sort());
    expect(JSON.parse(readFileSync(join(installedPackage, "package.json"), "utf8")).license).toBe("AGPL-3.0-or-later AND Apache-2.0");
    expect(JSON.parse(readFileSync(join(installedPackage, "sdk", "package.json"), "utf8")).license).toBe("Apache-2.0");
    expect(readFileSync(join(installedPackage, "LICENSE"), "utf8")).toBe(readFileSync(join(repositoryRoot, "LICENSE"), "utf8"));
    for (const file of ["LICENSE", "NOTICE"]) {
      expect(readFileSync(join(installedPackage, "sdk", file), "utf8")).toBe(readFileSync(join(repositoryRoot, "src", "SynCloudOS", "AppSDK", file), "utf8"));
    }
    writeFileSync(join(fixture, "shared-identity.mjs"), `import assert from "node:assert/strict";
import * as nse from "@syndromatic/syncloudos/nse";
import * as controls from "@syndromatic/syncloudos/nse/controls";
import * as layout from "@syndromatic/syncloudos/nse/layout";
import * as appearance from "@syndromatic/syncloudos/nse/appearance";
import * as page from "@syndromatic/syncloudos/nse/page";
import * as webspring from "@syndromatic/syncloudos/webspring";
import * as browser from "@syndromatic/syncloudos/browser";
import * as auth from "@syndromatic/syncloudos/auth";
assert.equal("AnimationFX" in nse, false);
assert.equal("useAnimationFX" in nse, false);
assert.equal(typeof nse.NSEView, "function");
assert.equal(typeof nse.NSEShadow, "function");
assert.deepEqual(Object.keys(page), ["NSEPageController"]);
for (const removed of ["NSEPage", "NSEPageEvent", "NSEPageHandle", "NSEPageProps", "useNSEPage", "getNSEPagePreset", "nsePagePresets", "nsePageMaterialPresets"]) {
  assert.equal(removed in page, false);
  assert.equal(removed in nse, false);
}
for (const removed of ["NSERoundedBox", "NSEShadowView", "NSESmoothSurface", "NSEAnimationDefaults", "NSEAnimationEnvironmentProvider", "useNSEAnimationEnvironment", "NSEPresence", "NSEPresenceBoundary", "useNSEPresenceExiting", "NSELayoutView", "useNSEPresentation", "nseTransformStyle", "compileNSEPresentation"]) {
  assert.equal(removed in nse, false);
  assert.equal(removed in controls, false);
}
for (const removed of ["NSEGraphicsView", "convertPointToGFXDisplayList"]) assert.equal(removed in nse, false);
for (const internal of ["NSEViewDrawingEnvironmentContext", "NSEViewDisplayList", "ViewDrawingEnvironmentContext", "ViewDisplayList"]) assert.equal(internal in nse, false);
assert.equal("AnimationFX" in appearance, false);
assert.equal("useAnimationFX" in appearance, false);
assert.equal(typeof nse.NSEStackView, "function");
assert.equal(nse.NSEStackView, layout.NSEStackView);
assert.equal(nse.NSEAppearanceProvider, appearance.NSEAppearanceProvider);
assert.deepEqual(Object.keys(webspring), [
  "WEBSPRING_DRAG_FOLDER_CATCH_MARGIN",
  "WEBSPRING_DRAG_FOLDER_REST_MS",
  "WEBSPRING_DRAG_MERGE_REST_MS",
  "WEBSPRING_DRAG_REORDER_REST_MS",
  "WEBSPRING_DRAG_SPRING_OPEN_MS",
  "WEBSPRING_STAGE",
  "WebspringBoardView",
  "WebspringDragProxy",
  "WebspringFolderTile",
  "WebspringIconArtwork",
  "WebspringIconEffect",
  "WebspringLaunchDim",
  "WebspringSurface",
  "WebspringWidgetShelf",
  "captureWebspringDragArtworkRects",
  "captureWebspringDragReorderSlots",
  "createIntegrationContribution",
  "createWebspringBoardView",
  "createWebspringDragArbiter",
  "createWebspringFolderSplitPresentation",
  "defineIntegration",
  "definePreferencePane",
  "defineWebspring",
  "defineWidget",
  "getDesktopWebspringLayout",
  "getWebspringDragGrabOffset",
  "getWebspringDragReorderTargetFromPoint",
  "getWebspringRadialExitForIcon",
  "getWebspringSelectorTransform",
  "integrationOwners",
  "isDefinedWebspring",
  "isDefinedWebspringWidget",
  "isIntegrationDefinition",
  "isPreferencePaneDefinition",
  "resolveWebspringIconPresentation",
  "resolveWebspringLaunchDimMotion",
  "resolveWebspringOrbPresentation",
  "stagePointStyle",
  "useWebspringDragProxyPosition",
  "useWebspringFolderAppearance",
  "useWebspringHapticEngine",
  "useWebspringMotion",
  "webspringIconSprings",
  "webspringSurfaceStyle",
  "withDiscoveredWebspringItems",
]);
assert.deepEqual(Object.keys(browser), [
  "BrowserImageProcessingWorker",
  "BrowserWebGPUImageProcessingBackend",
  "InMemoryDocumentAdapter",
  "IndexedDBDocumentRecoveryStore",
  "SCAuthorization",
  "SCAuthorizationRights",
  "createBrowserAcceleratedImageProcessingPipeline",
  "createBrowserImageProcessingPipeline",
  "createBrowserImageProcessingWorkerBackend",
  "createBrowserWebGPUImageProcessingBackend",
  "createDocumentAssetSaveCoordinator",
  "createDocumentAssetStorageAdapter",
  "createInMemoryDocumentAssetStore",
  "createIndexedDBDocumentAssetStore",
  "createRegisteredFontResourceLoader",
  "createSynCloudOSHostContribution",
  "fontResourceMimeTypeForPath",
  "mountSynCloudOS",
  "trustSynWareBundleForCanonicalHost",
]);
assert.deepEqual(Object.keys(auth), ["createHttpAuthentication", "googleAuthenticationMethod"]);
assert.equal("ASAuthorizationController" in browser, false);
assert.equal("createPasskeyAuthentication" in auth, false);
for (const privatePath of ["nse/NSE", "nse/private", "sdk/internal/runtime", "types/SynCloudOS/Runtime/RuntimeStore.js"]) {
  await assert.rejects(import("@syndromatic/syncloudos/" + privatePath), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
}
`, "utf8");
    execFileSync(process.execPath, ["shared-identity.mjs"], { cwd: fixture, stdio: "pipe" });
    writeFileSync(join(fixture, "tsconfig.json"), `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: false,
        noEmit: true,
      },
      include: ["src"],
    }, null, 2)}\n`, "utf8");
    const sourceDirectory = join(fixture, "src");
    mkdirSync(sourceDirectory, { recursive: true });
    writeFileSync(join(sourceDirectory, "page-contract.ts"), `import {
  NSEPageController,
  type NSEPageControllerOptions,
  type NSEPageControllerSnapshot,
  type NSEPageControllerSpineLocation,
  type NSEPageControllerTransitionStyle,
} from "@syndromatic/syncloudos/nse/page";

const spine: NSEPageControllerSpineLocation = "mid";
const style: NSEPageControllerTransitionStyle = "pageCurl";
const options: NSEPageControllerOptions = { transitionStyle: style, spineLocation: spine };
const pages = new NSEPageController(options);
const snapshot: NSEPageControllerSnapshot = pages.getSnapshot();
const progress: number = snapshot.turnProgress;
const direction: "forward" | "backward" | null = snapshot.turnDirection;
void [progress, direction];
// @ts-expect-error The standalone curl component has been removed.
import { NSEPage } from "@syndromatic/syncloudos/nse/page";
// @ts-expect-error Curl events are private engine details.
import type { NSEPageEvent } from "@syndromatic/syncloudos/nse/page";
// @ts-expect-error Imperative curl handles are private engine details.
import type { NSEPageHandle } from "@syndromatic/syncloudos/nse/page";
// @ts-expect-error Curl leaf props are private engine details.
import type { NSEPageProps } from "@syndromatic/syncloudos/nse/page";
// @ts-expect-error Curl presets are private engine details.
import type { NSEPagePreset } from "@syndromatic/syncloudos/nse/page";
// @ts-expect-error Curl hooks are private engine details.
import { useNSEPage } from "@syndromatic/syncloudos/nse/page";
`, "utf8");
    writeFileSync(join(sourceDirectory, "index.tsx"), "import {\n  useSCOS,\n  useCommands,\n  useDocument,\n  usePersistence,\n  useScheduler,\n  useService,\n  defineSynWareServiceToken,\n  useTrustedClient,\n  useWindow,\n} from \"@syndromatic/syncloudos/sdk\";\nimport {\n  createDeterministicScheduler,\n  createSynWare,\n  createFakeCapabilityPort,\n  createSynWareTestHost,\n  type SynWareFakeWebContentOperation,\n  type SynWareTestDisposalReport,\n} from \"@syndromatic/syncloudos/sdk/testing\";\nimport { WebspringWidgetShelf, defineWebspring, defineWidget, type LocalisedText, type WebspringViewProps } from \"@syndromatic/syncloudos/webspring\";\nimport { mountSynCloudOS } from \"@syndromatic/syncloudos/browser\";\nimport { createRoot } from \"react-dom/client\";\nimport {\n  NSEAnimationContext,\n  NSEStackItem,\n  NSEStackView,\n  NSETableView,\n  useNSETraitCollection,\n  useNSEArrayController,\n} from \"@syndromatic/syncloudos/nse\";\n\nfunction AnimationEnvironmentProbe({ label }: { label: string }) {\n  const environment = useNSETraitCollection();\n  return <span data-animation-root={label} data-reduced-motion={String(environment.reducedMotion)} />;\n}\n\nexport function mountAnimationRoots(firstElement: Element, secondElement: Element) {\n  const firstRoot = createRoot(firstElement);\n  const secondRoot = createRoot(secondElement);\n  firstRoot.render(<AnimationEnvironmentProbe label=\"first\" />);\n  secondRoot.render(<AnimationEnvironmentProbe label=\"second\" />);\n  const original = NSEAnimationContext.current;\n  let scoped = false;\n  NSEAnimationContext.runAnimationGroup(context => {\n    context.duration = 0.37;\n    scoped = NSEAnimationContext.current === context && context.duration === 0.37;\n  });\n  return {\n    contextGrouping: scoped && NSEAnimationContext.current === original,\n    dispose() {\n      firstRoot.unmount();\n      secondRoot.unmount();\n    },\n  };\n}\n\nconst manifest = {\n  schemaVersion: 1,\n  bundleIdentifier: \"com.example.external.fixture\",\n  version: \"0.1.0\",\n  displayName: \"External Fixture\",\n  routes: [{ path: \"/external\", primary: true }],\n  commands: [{ id: \"com.example.external.fixture.save\", title: \"Save\" }],\n  services: [{ id: \"com.example.external.search\", required: false }],\n  documentTypes: [{ id: \"com.example.external.document\", extensions: [\"fixture\"] }],\n  runtime: { policy: { public: true } },\n  webspring: { visible: true, order: 1 },\n} as const;\n\nconst externalSearchToken = defineSynWareServiceToken({ id: \"com.example.external.search\" });\n\nfunction ExternalFixture() {\n  const app = useSCOS();\n  if (\"resolve\" in app.services || \"routeState\" in app) throw new Error(\"Retired public API leaked into the installed SDK.\");\n  const persistence = usePersistence();\n  const scheduler = useScheduler();\n  const documents = useDocument();\n  const window = useWindow();\n  const trusted = useTrustedClient();\n  const service = useService(externalSearchToken);\n  useCommands([{\n    id: \"com.example.external.fixture.save\",\n    title: \"Save\",\n    payload: { description: \"No payload\", parse: (value) => value === undefined ? { ok: true, value } : { ok: false, issues: [\"No payload\"] } },\n    execute: () => undefined,\n  }]);\n  const everyClientCategory = [\n    app.lifecycle, app.commands, app.responders, app.undo, app.documents, app.windows,\n    app.pasteboards, app.drag, app.colourPanel, app.audio, app.services,\n    app.navigation, app.locale, app.appearance, documents.workspaceDocuments, persistence, scheduler, window.snapshot, service.available,\n    trusted.diagnostics, trusted.conformance,\n  ];\n  if (false) {\n    void app.lifecycle.closeSelf();\n    void app.commands.createPayload(\"fixture\", true);\n    void app.responders.getFocusedResponderId();\n    void app.undo.get({} as never);\n    void app.documents.workspaceDocuments.getDocument;\n    void app.windows.getSnapshot();\n    void app.pasteboards;\n    void app.drag.endpoint();\n    void app.colourPanel.getSnapshot();\n    void app.audio.play;\n    void app.services.optional(externalSearchToken);\n    // @ts-expect-error String service lookup is retired from the installed public SDK.\n    void app.services.resolve(\"com.example.external.search\");\n    // @ts-expect-error Required acquisition accepts a token.\n    void app.services.require(\"com.example.external.search\");\n    // @ts-expect-error Raw query state is retired; use a mounted named graph.\n    void app.routeState.getQuery();\n    void app.navigation.openRoute;\n    void app.locale.getActiveLocale();\n    void app.appearance.resolved();\n    void trusted.diagnostics?.refreshConformanceSnapshot();\n    void trusted.conformance?.registerAppearanceFact({ slot: \"fixture\", status: \"covered\" });\n  }\n  return <NSEStackView\n    aria-label=\"External SDK fixture\"\n    orientation=\"horizontal\"\n    distribution=\"gravity-areas\"\n    alignment=\"centre\"\n    availableSize={240}\n    spacing={8}\n    edgeInsets={{ inlineStart: 4, inlineEnd: 4, blockStart: 2, blockEnd: 2 }}\n    overflowPolicy=\"menu\"\n    overflowLabel=\"More fixture actions\"\n    resizeObserverFactory={() => null}\n    frameScheduler={{ requestFrame: () => 0, cancelFrame: () => undefined }}\n    reducedMotion\n    onOverflowChange={(ids) => { void ids; }}\n  >\n    <NSEStackItem id=\"summary\" minimumSize={48} preferredSize={120} maximumSize={180} weight={2} gravity=\"leading\" spacingAfter={4} overflowLabel=\"Fixture summary\" onOverflowActivate={() => undefined}>Clients: {everyClientCategory.length}; Brand: {app.branding.name}</NSEStackItem>\n    <NSEStackItem id=\"records\" minimumSize={48} preferredSize={96} maximumSize={144} weight={1} visibilityPriority={10} detachedWhenHidden gravity=\"trailing\" overflowLabel=\"Fixture records\" onOverflowActivate={() => undefined}>\n      <FixtureRecords />\n    </NSEStackItem>\n  </NSEStackView>;\n}\n\nfunction FixtureRecords() {\n  const records = useNSEArrayController<string, string>({ id: \"fixture:records\", content: [\"one\", \"two\"], getId: (item) => item });\n  return <NSETableView aria-label=\"Fixture records\" headerHidden rowHeight={24} adapter={{ controller: records, idForItem: (item) => item, labelForItem: (item) => item }} columns={[{ id: \"record\", title: \"Record\", value: (item: string) => item, width: { min: 48, ideal: 96, max: 144 } }]} />;\n}\n\nconst news = defineWidget({\n  id: \"news\",\n  title: \"News\",\n  load: async () => [\"Public content\"],\n  view: ({ data }) => <ul>{data.map((title) => <li key={title}>{title}</li>)}</ul>,\n  whenEmpty: \"hide\",\n});\n\nfunction WebsiteView({ model, applicationOutlet }: WebspringViewProps) {\n  return <main data-logo={model.branding.logoUrl ?? \"\"}>{model.apps.map(({ bundleIdentifier }) => <span key={bundleIdentifier}>{bundleIdentifier}</span>)}{model.widgets.length > 0 ? <WebspringWidgetShelf entries={model.widgets} surface={model.background.shelf} /> : null}{applicationOutlet}</main>;\n}\n\nconst siteName: LocalisedText = { key: \"site.name\", fallback: \"Example\" };\nexport const webspring = defineWebspring({\n  manifest: {\n    schemaVersion: 1,\n    bundleIdentifier: \"com.example.webspring\",\n    version: \"0.1.0\",\n    displayName: \"Example Webspring\",\n    webspringShell: {\n      views: [{ id: \"website\", presentations: [\"desktop\", \"tablet\", \"mobile\"], mode: \"persistent\" }],\n      defaults: { desktop: \"website\", tablet: \"website\", mobile: \"website\" },\n      homeRoute: \"/\",\n      branding: { name: siteName, logo: { resource: \"./Resources/SiteLogo.svg\", alternativeText: { key: \"site.logo\", fallback: \"Example logo\" } } },\n    },\n  },\n  components: { website: WebsiteView },\n  widgets: [news],\n});\nexport const app = createSynWare({ manifest, root: ExternalFixture });\nexport const contactApp = createSynWare({\n  manifest: {\n    schemaVersion: 1,\n    bundleIdentifier: \"com.example.contact\",\n    version: \"0.1.0\",\n    displayName: \"Contact\",\n    routes: [{ path: \"/contact\", primary: true }],\n    presentations: [\"desktop\", \"tablet\", \"mobile\"],\n    runtime: { policy: { public: true } },\n    webspring: { visible: true, order: 2 },\n  },\n  root: () => <p>Contact</p>,\n});\nexport function mountFixture(element: Element) {\n  return mountSynCloudOS({ element, bundles: [app, contactApp], shell: webspring, shellResources: { resourceUrls: { \"./Resources/SiteLogo.svg\": \"/site-logo.svg\" }, fontResourceUrls: { \"./Resources/Site.woff2\": \"/site.woff2\" } } });\n}\nexport function mountFixtureWithoutContact(element: Element) {\n  return mountSynCloudOS({ element, bundles: [app], shell: webspring, shellResources: { resourceUrls: { \"./Resources/SiteLogo.svg\": \"/site-logo.svg\" } } });\n}\nexport const testHost = createSynWareTestHost({ app });\nexport const disposal: Promise<SynWareTestDisposalReport> = testHost.dispose();\nfunction BrandingProbe() {\n  const app = useSCOS();\n  return <output data-branding-name={app.branding.name}>{app.branding.name}</output>;\n}\nconst brandingProbeApp = createSynWare({\n  manifest: {\n    schemaVersion: 1,\n    bundleIdentifier: \"com.example.external.branding-probe\",\n    version: \"0.1.0\",\n    displayName: \"Branding Probe\",\n    routes: [{ path: \"/branding-probe\", primary: true }],\n    runtime: { policy: { public: true } },\n    webspring: { visible: false, order: 3 },\n  },\n  root: BrandingProbe,\n});\nexport async function readBrandingFromMountedApp(container: HTMLElement) {\n  const host = createSynWareTestHost({ app: brandingProbeApp, container, branding: { name: \"Example\", logoUrl: \"/site-logo.svg\", lightLogoUrl: \"/site-logo.svg\", darkLogoUrl: \"/site-logo.svg\", compactLogoUrl: \"/site-logo.svg\", logoAlt: \"Example logo\" } });\n  await host.render();\n  const name = container.querySelector(\"[data-branding-name]\")?.getAttribute(\"data-branding-name\");\n  await host.dispose();\n  if (!name) throw new Error(\"The mounted branding probe did not render a branding name.\");\n  return name;\n}\nconst webContentControl = createFakeCapabilityPort<SynWareFakeWebContentOperation>(createDeterministicScheduler());\nvoid webContentControl.run(\"web-content.load\");\n", "utf8");
    writeFileSync(join(sourceDirectory, "assets.d.ts"), `declare module "*.css";
declare module "*.svg" { const url: string; export default url; }
declare module "*.png" { const url: string; export default url; }
interface ImportMeta { glob(pattern: string, options: { eager: true; query?: string; import?: string }): Record<string, unknown>; }
`, "utf8");
    const consumerConfig = JSON.parse(readFileSync(join(fixture, "tsconfig.json"), "utf8"));
    Object.assign(consumerConfig.compilerOptions, { module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true, allowSyntheticDefaultImports: true });
    writeFileSync(join(fixture, "tsconfig.json"), JSON.stringify(consumerConfig), "utf8");
    const externalCompile = spawnSync(process.execPath, [resolve(repositoryRoot, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], { cwd: fixture, encoding: "utf8" });
    if (externalCompile.status !== 0) {
      throw new Error(`External package fixture failed to compile:\n${externalCompile.stdout}\n${externalCompile.stderr}`);
    }
    writeFileSync(join(sourceDirectory, "retired-manifest.ts"), "import { createSynWare } from \"@syndromatic/syncloudos/sdk/testing\";\n\ncreateSynWare({\n  manifest: {\n    schemaVersion: 1,\n    bundleIdentifier: \"com.example.retired\",\n    version: \"0.1.0\",\n    displayName: \"Retired manifest fixture\",\n    retiredManifestKey: true,\n  },\n  root: () => null,\n});\n", "utf8");
    const retiredManifest = spawnSync(process.execPath, [resolve(repositoryRoot, "node_modules", "typescript", "bin", "tsc"), "--ignoreConfig", "--noEmit", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--jsx", "react-jsx", "--strict", "--skipLibCheck", "false", "retired-manifest.ts"], { cwd: sourceDirectory, encoding: "utf8" });
    expect(retiredManifest.status).not.toBe(0);
    expect(`${retiredManifest.stdout}${retiredManifest.stderr}`).toMatch(/retiredManifestKey|never/iu);
    writeFileSync(join(fixture, "vite.config.mjs"), `export default { build: { outDir: "dist", lib: { entry: { fixture: "src/index.tsx" }, formats: ["es"], fileName: (_format, entryName) => entryName + ".js" }, sourcemap: false } };\n`, "utf8");
    execFileSync(process.execPath, [resolve(repositoryRoot, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "vite.config.mjs"], { cwd: fixture, stdio: "pipe" });
    expect(readdirSync(join(fixture, "dist")).some((file) => file.endsWith(".js"))).toBe(true);
    const consumerEntry = readdirSync(join(fixture, "dist")).find((file) => /^fixture.*\.js$/u.test(file));
    if (!consumerEntry) throw new Error("External consumer build did not emit its fixture entry.");
    const consumerUrl = `${pathToFileURL(join(fixture, "dist", consumerEntry)).href}?run=${Date.now()}`;
    const consumer = await import(/* @vite-ignore */ consumerUrl) as {
      mountFixture(element: Element): Promise<{ dispose(reason?: string): Promise<unknown> }>;
      mountFixtureWithoutContact(element: Element): Promise<{ dispose(reason?: string): Promise<unknown> }>;
      readBrandingFromMountedApp(container: HTMLElement): Promise<string>;
      mountAnimationRoots(firstElement: Element, secondElement: Element): { contextGrouping: boolean; dispose(): void };
    };
    const firstAnimationRoot = document.createElement("div");
    const secondAnimationRoot = document.createElement("div");
    document.body.append(firstAnimationRoot, secondAnimationRoot);
    const animationRoots = consumer.mountAnimationRoots(firstAnimationRoot, secondAnimationRoot);
    await Promise.all([
      waitForSelector(firstAnimationRoot, '[data-animation-root="first"]'),
      waitForSelector(secondAnimationRoot, '[data-animation-root="second"]'),
    ]);
    expect(animationRoots.contextGrouping).toBe(true);
    expect(firstAnimationRoot.querySelector('[data-animation-root="first"]')?.getAttribute("data-reduced-motion")).toBe("false");
    expect(secondAnimationRoot.querySelector('[data-animation-root="second"]')?.getAttribute("data-reduced-motion")).toBe("false");
    animationRoots.dispose();
    firstAnimationRoot.remove();
    secondAnimationRoot.remove();
    expect(consoleError).not.toHaveBeenCalled();
    const element = document.createElement("div");
    document.body.append(element);
    const mounted = await consumer.mountFixture(element);
    await waitForText(element, "Public content");
    expect(mounted.dispose).toEqual(expect.any(Function));
    expect(element.textContent).toContain("com.example.external.fixture");
    expect(element.textContent).toContain("com.example.contact");
    expect(element.textContent).toContain("Public content");
    expect(element.querySelector("main")?.getAttribute("data-logo")).toBe("/site-logo.svg");
    const brandingContainer = document.createElement("div");
    document.body.append(brandingContainer);
    expect(await consumer.readBrandingFromMountedApp(brandingContainer)).toBe("Example");
    brandingContainer.remove();
    expect(consoleError).not.toHaveBeenCalled();
    await mounted.dispose("external consumer test complete");
    const reduced = await consumer.mountFixtureWithoutContact(element);
    await waitForText(element, "com.example.external.fixture");
    expect(element.textContent).toContain("com.example.external.fixture");
    expect(element.textContent).not.toContain("com.example.contact");
    await reduced.dispose("external consumer remove test complete");
    element.remove();

    writeFileSync(join(sourceDirectory, "forbidden.ts"), 'import { runtime } from "@syndromatic/syncloudos/sdk/internal/runtime";\nexport { runtime };\n', "utf8");
    const deepImport = spawnSync(process.execPath, [resolve(repositoryRoot, "node_modules", "typescript", "bin", "tsc"), "--ignoreConfig", "--noEmit", "--module", "NodeNext", "--moduleResolution", "NodeNext", "forbidden.ts"], { cwd: sourceDirectory, encoding: "utf8" });
    expect(deepImport.status).not.toBe(0);
    expect(`${deepImport.stdout}${deepImport.stderr}`).toMatch(/cannot find module|does not exist/iu);
    writeFileSync(join(sourceDirectory, "physical-internal.ts"), 'import type { RuntimeStore } from "@syndromatic/syncloudos/types/SynCloudOS/Runtime/RuntimeStore.js";\nexport type { RuntimeStore };\n', "utf8");
    const physicalInternal = spawnSync(process.execPath, [resolve(repositoryRoot, "node_modules", "typescript", "bin", "tsc"), "--ignoreConfig", "--noEmit", "--module", "NodeNext", "--moduleResolution", "NodeNext", "physical-internal.ts"], { cwd: sourceDirectory, encoding: "utf8" });
    expect(physicalInternal.status).not.toBe(0);
    expect(`${physicalInternal.stdout}${physicalInternal.stderr}`).toMatch(/cannot find module|does not exist/iu);

    expect(consoleError.mock.calls.map((call) => call.map((value) => (
      value instanceof Error ? `${value.name}: ${value.message}\n${value.stack ?? ""}` : String(value)
    )))).toEqual([]);
  }, 300_000);

  it("keeps the PDF library out of what the shell entries load at start-up", () => {
    const packageDirectory = join(repositoryRoot, ".artifacts", "synapp-sdk", "packages", "syncloudos");
    for (const entry of ["index.js", "sdk.js", "nse.js", "webspring.js"]) {
      // Follow static imports only: a dynamic import loads when a PDF is first made.
      const seen = new Set<string>();
      const pending = [join(packageDirectory, entry)];
      while (pending.length) {
        const file = pending.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        const source = readFileSync(file, "utf8");
        for (const match of source.matchAll(/(?:^|[;\n])\s*(?:import|export)\s*(?:[^"'()]*?from\s*)?["'](\.{1,2}\/[^"']+\.js)["']/gu)) {
          pending.push(resolve(dirname(file), match[1]));
        }
      }
      expect(seen.size, entry).toBeGreaterThan(1);
      // The font subset recorder is ours and small; the document and context chunks carry the library.
      expect([...seen].map(file => basename(file)).filter(name => /PDF/u.test(name) && !name.startsWith("GFXPDFFontSubset-")), entry).toEqual([]);
    }
  });

  it("keeps the reviewed runtime entry graph free of privileged exports", () => {
    const exports = [
      ...sourceExports(join(repositoryRoot, "src", "SynCloudOS", "AppSDK", "sdkPackageEntry.ts")),
      ...sourceExports(join(repositoryRoot, "src", "NSE", "sdkPackageEntry.ts")),
    ];
    const forbiddenExports = [
      "SynWareProvider",
      "createSynWareContextValue",
      "createSynWareBundle",
      "SynCloudOSAppModule",
      "SynCloudOSBundleModuleLoader",
      "TrustedSynWareBundle",
      "SynCloudOSDocumentStoreAdapter",
      "SynCloudOSDocumentStoreContext",
      "SynCloudOSDocumentKindMetadata",
      "createFilePanelService",
      "createMediaPanelService",
      "FilePanelAdapter",
      "FilePanelCapability",
      "FilePanelReference",
      "FilePanelResult",
      "FilePanelSaveTarget",
      "OpenPanelRequest",
      "SavePanelRequest",
      "MediaPanelItem",
      "SynCloudOSPolicySubject",
      "SynCloudOSRole",
      "SynWareRuntime",
      "SynWareRuntimeMount",
      "SynCloudOSRuntime",
      "AnimationLayerHost",
      "RuntimeAudioFileService",
      "AudioGraphHostService",
      "HFXHostService",
      "MotionService",
      "RuntimeAudioFilePort",
      "AUFXSystemFeedbackBus",
      "RuntimeStore",
      "AppRegistry",
      "WindowManager",
      "ServiceRegistry",
      "ConformanceInspectorSnapshot",
      "ConformanceInspectorSnapshotOptions",
      "ConformanceInspectorExport",
    ];
    for (const forbiddenExport of forbiddenExports) {
      expect(exports).not.toContain(forbiddenExport);
    }
  });

  it("uses exact portable package aliases and keeps public client contracts host-free", () => {
    const expectedAliases = {
      "@syndromatic/syncloudos": ["./src/SynCloudOS/AppSDK/rootPackageEntry.ts"],
      "@syndromatic/syncloudos/sdk": ["./src/SynCloudOS/AppSDK/sdkPackageEntry.ts"],
      "@syndromatic/syncloudos/sdk/testing": ["./src/SynCloudOS/AppSDK/testing/sdkPackageEntry.ts"],
      "@syndromatic/syncloudos/webspring": ["./src/Webspring/public.ts"],
      "@syndromatic/syncloudos/browser": ["./src/SynCloudOSReact/browser.tsx"],
      "@syndromatic/syncloudos/nse": ["./src/NSE/sdkPackageEntry.ts"],
    };
    const appConfig = JSON.parse(readFileSync(join(repositoryRoot, "tsconfig.app.json"), "utf8"));

    const viteConfig = readFileSync(join(repositoryRoot, "vitest.config.ts"), "utf8");
    const publicClientFiles = [
      "appClientTypes.ts",
      "appEnvironmentClientTypes.ts",
      "appTrustedClientTypes.ts",
    ];

    expect(appConfig.compilerOptions.paths).toMatchObject(expectedAliases);
    expect(Object.keys(appConfig.compilerOptions.paths).every((key) => !key.includes("*"))).toBe(true);
    expect(viteConfig).toMatch(/synWareSdkEntries|synWareAliases/u);
    const browserGraph = staticSourceGraph(join(repositoryRoot, "src", "SynCloudOSReact", "browser.tsx"));
    expect(browserGraph.some((path) => /[\\/](?:SynWare|JournalShared|SynCalShared|PortfolioCollectionsService)(?:[\\/.]|$)/u.test(path))).toBe(false);
    for (const filename of publicClientFiles) {
      const source = readFileSync(join(repositoryRoot, "src", "SynCloudOS", "AppSDK", filename), "utf8");
      expect(source).not.toMatch(/from\s+["'][^"']*(?:appRuntimeTypes|SynCloudOSRuntime|Store|Manager|Adapter|Registry|ConfigurationProfiles)[^"']*["']/u);
      expect(source).not.toMatch(/import(?:\s+type)?\s*\{[^}]*\b(?:SynCloudOSRuntime|Store|Manager|Adapter|Registry|ConfigurationProfiles)\b/u);
    }
  });

  it("keeps mounted runtime hooks out of public barrels", () => {
    const publicBarrels = [
      "src/SynCloudOS/AppSDK/index.ts",
      "src/SynCloudOSReact/SynCloudOSProvider.tsx",
      "src/SynCloudOSReact/index.ts",
    ];
    for (const path of publicBarrels) {
      expect(readFileSync(join(repositoryRoot, path), "utf8")).not.toMatch(/\buseSynWare(?!Context\b)[A-Z]/u);
    }

  });

  it("derives archive declarations from the reviewed public entries instead of open handwritten mirrors", () => {
    buildPackedSdk();
    const packageDirectory = join(repositoryRoot, ".artifacts", "synapp-sdk", "packages", "syncloudos");
    const declaration = [
      readFileSync(join(packageDirectory, "sdk.d.ts"), "utf8"),
      readFileSync(join(packageDirectory, "types", "SynCloudOS", "AppSDK", "sdkPackageEntry.d.ts"), "utf8"),
      readFileSync(join(packageDirectory, "types", "SynCloudOS", "AppSDK", "manifest", "manifestTypes.d.ts"), "utf8"),
      readFileSync(join(packageDirectory, "types", "NSE", "public", "appearance.d.ts"), "utf8"),
    ].join("\n");

    expect(declaration).not.toContain("AppCapabilityClient");
    expect(declaration).not.toMatch(/\bframer-motion\b/iu);
    expect(declaration).not.toMatch(/readonly\s*\[extension:\s*string\]/u);
    expect(declaration).not.toContain("createSynWareContextValue");
    expect(declaration).not.toContain("createSynWareBundle");
    expect(declaration).not.toContain("SynWareRuntimeMount");
    expect(declaration).not.toContain("SynCloudOSRuntime");
    expect(declaration).not.toMatch(/\b(?:AnimationLayerHost|RuntimeAudioFileService|AudioGraphHostService|HFXHostService|MotionService|RuntimeAudioFilePort|AUFXSystemFeedbackBus)\b/u);
    const sourceEntry = readFileSync(join(repositoryRoot, "src", "SynCloudOS", "AppSDK", "sdkPackageEntry.ts"), "utf8");
    const emittedEntry = readFileSync(join(packageDirectory, "types", "SynCloudOS", "AppSDK", "sdkPackageEntry.d.ts"), "utf8");
    const sourceResolver = readFileSync(join(repositoryRoot, "src", "NSE", "Layout", "resolveStackLayout.ts"), "utf8");
    const emittedResolver = readFileSync(join(repositoryRoot, ".artifacts", "synapp-sdk", "packages", "syncloudos", "types", "NSE", "Layout", "resolveStackLayout.d.ts"), "utf8");
    expect(sourceEntry).not.toMatch(/\b(?:createSynWareContextValue|createSynWareBundle|SynWareRuntimeMount|SynCloudOSRuntime|AnimationLayerHost|RuntimeAudioFileService|AudioGraphHostService|HFXHostService|MotionService|RuntimeAudioFilePort|AUFXSystemFeedbackBus)\b/u);
    expect(emittedEntry).not.toMatch(/\b(?:createSynWareContextValue|createSynWareBundle|SynWareRuntimeMount|SynCloudOSRuntime|AnimationLayerHost|RuntimeAudioFileService|AudioGraphHostService|HFXHostService|MotionService|RuntimeAudioFilePort|AUFXSystemFeedbackBus)\b/u);
    expect(sourceResolver).toMatch(/resolveStackLayout\(input: NSEStackLayoutInput\): NSEStackLayoutResult/u);
    expect(emittedResolver).toMatch(/resolveStackLayout\(input: NSEStackLayoutInput\): NSEStackLayoutResult/u);
  }, 300_000);
});
