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

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import policy from "../../scripts/quality/architecture-boundaries.json";
import {
  discoverRepositoryFiles,
  discoverTypeScriptFiles,
  validateIdentityCookieBoundary,
  validateImportEdges,
  validateRuntimeBrowserGlobals,
  validateGlobalKeyboardListeners,
} from "../../scripts/quality/architecture-boundaries.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root: string, path: string, content: string) {
  const absolute = join(root, ...path.split("/"));
  mkdirSync(dirname(absolute), {
    recursive: true,
  });
  writeFileSync(absolute, content, "utf8");
}

function fixturePolicy() {
  return {
    schemaVersion: 1,
    controlledSources: ["src/**"],
    exclusions: [],
    aliases: [
      { find: "@runtime", replacement: "src/SynCloudOS" },
      { find: "@vite", replacement: "src/SynCloudOS" },
    ],
    identityCookieBoundary: {
      allowed: [
        "src/SynCloudOS/PlatformAdapters/BrowserIdentityCookieAdapter.ts",
        "src/SynCloudOS/PlatformAdapters/identityCookieAdapterTypes.ts",
        "src/SynCloudOS/Identity/**",
        "src/SynCloudOS/LoginServices/**",
      ],
    },
    runtimeGlobalBoundary: {
      roots: ["src/SynCloudOS/**", "src/main.tsx"],
      allowed: ["src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts"],
      globals: [
        "window",
        "document",
        "globalThis",
        "navigator",
        "history",
        "location",
        "screen",
        "visualViewport",
        "matchMedia",
        "localStorage",
        "sessionStorage",
        "Notification",
        "setTimeout",
        "clearTimeout",
        "requestAnimationFrame",
        "cancelAnimationFrame",
      ],
    },
    layers: [
      {
        id: "runtime",
        include: ["src/SynCloudOS/**"],
        mayImportLayers: ["runtime"],
        mayImportEntrypoints: {},
      },
      {
        id: "nse",
        include: ["src/NSE/**"],
        mayImportLayers: ["nse", "runtime"],
        mayImportEntrypoints: {
          runtime: ["src/SynCloudOS/SynCloudOS.ts"],
        },
      },
      {
        id: "webspring",
        include: ["src/Webspring/**"],
        mayImportLayers: ["webspring", "runtime", "nse"],
        mayImportEntrypoints: {
          runtime: ["src/SynCloudOS/SynCloudOS.ts"],
          nse: ["src/NSE/NSE.ts"],
        },
      },
      {
        id: "synapps",
        include: ["src/SynWare/**"],
        mayImportLayers: ["synapps", "nse"],
        mayImportEntrypoints: {
          nse: ["src/NSE/NSE.ts"],
        },
      },
    ],
    temporaryAllowlist: [],
  };
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "boundaries-boundaries-"));
  temporaryRoots.push(root);
  write(
    root,
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@runtime/*": ["src/SynCloudOS/*"] },
      },
      include: ["src"],
    }),
  );
  write(
    root,
    "vite.config.ts",
    'export default { resolve: { alias: { "@vite": resolve("src/SynCloudOS") } } };\n',
  );
  write(root, "src/SynCloudOS/SynCloudOS.ts", "export const runtime = 1;\n");
  write(root, "src/SynCloudOS/internal.ts", "export const internal = 1;\n");
  write(
    root,
    "src/SynCloudOS/Runtime/defaultRuntime.ts",
    "export const defaultRuntime = 1;\n",
  );
  write(root, "src/NSE/NSE.ts", "export const nse = 1;\n");
  write(
    root,
    "src/SynWare/Foo.app/Contents/index.ts",
    "export const app = 1;\n",
  );
  return root;
}

describe("architecture dependency boundaries", () => {
  it("keeps Chronosphere presentation independent of runtime and app context", () => {
    const root = createFixture();
    write(root, "src/NSE/Chronosphere/hostComposition.ts", "export const view = 1;\n");
    write(root, "src/SynCloudOS/AppSDK/SynWareContext.ts", "export const context = 1;\n");
    write(root, "src/SynCloudOS/AppSDK/Chronosphere/public.ts", 'export { view } from "../../../NSE/Chronosphere/hostComposition";\n');
    const candidate = fixturePolicy();
    candidate.layers = structuredClone(policy.layers);
    expect(validateImportEdges({ root, policy: candidate }).errors).toEqual([]);

    write(root, "src/NSE/Chronosphere/bad.ts", 'import { context } from "../../SynCloudOS/AppSDK/SynWareContext";\n');
    write(root, "src/SynCloudOS/runtime-presentation.ts", 'import { view } from "../NSE/Chronosphere/hostComposition";\n');
    expect(validateImportEdges({ root, policy: candidate }).errors).toEqual(expect.arrayContaining([
      expect.stringContaining("src/NSE/Chronosphere/bad.ts:1 -> src/SynCloudOS/AppSDK/SynWareContext.ts"),
      expect.stringContaining("src/SynCloudOS/runtime-presentation.ts:1 -> src/NSE/Chronosphere/hostComposition.ts"),
    ]));
  });

  it("permits browser globals only in named document and responsiveness adapters", () => {
    const root = createFixture();
    write(root, "src/SynCloudOS/PlatformAdapters/BrowserDocumentAssetEnvironment.ts", "export const browser = window;\n");
    write(root, "src/SynCloudOS/PlatformAdapters/browserResponsiveness.worker.ts", "export const browser = globalThis;\n");
    write(root, "src/SynCloudOS/PlatformAdapters/unapproved.ts", "export const browser = window;\n");
    const candidate = fixturePolicy();
    candidate.runtimeGlobalBoundary = structuredClone(policy.runtimeGlobalBoundary);
    expect(validateRuntimeBrowserGlobals({ root, policy: candidate })).toEqual([
      expect.stringContaining("src/SynCloudOS/PlatformAdapters/unapproved.ts:1 accesses browser global window"),
    ]);
  });

  it("uses the shared TypeScript AST scanner for raw keyboard aliases and wrappers", () => {
    const fixtures = [
      "raw-keyboard-direct.ts.fixture",
      "raw-keyboard-alias.ts.fixture",
      "raw-keyboard-constant.ts.fixture",
      "raw-keyboard-wrapper.ts.fixture",
      "raw-keyboard-destructured-alias.ts.fixture",
      "raw-keyboard-bind-alias.ts.fixture",
      "raw-keyboard-arrow-wrapper.ts.fixture",
      "raw-keyboard-transitive-remove.ts.fixture",
      "raw-keyboard-call-alias.ts.fixture",
      "raw-keyboard-apply-alias.ts.fixture",
      "raw-keyboard-reflect-apply.ts.fixture",
    ];
    const errors = validateGlobalKeyboardListeners({
      root: process.cwd(),
      files: fixtures.map((fixture) => `tests/fixtures/architecture-boundaries/${fixture}`),
    });
    for (const fixture of fixtures) {
      expect(errors.some((error) => error.startsWith(`tests/fixtures/architecture-boundaries/${fixture}:`)), fixture).toBe(true);
    }
    expect(validateGlobalKeyboardListeners({ root: process.cwd(), files: ["tests/fixtures/architecture-boundaries/react-keyboard-allowed.tsx.fixture"] })).toEqual([]);
  });
  it("detects aliased, commented, exported, dynamic, type, and require bypasses", () => {
    const root = createFixture();
    write(
      root,
      "src/NSE/aliased.ts",
      [
        'import /* comment */ { internal as renamed } from "@runtime/internal";',
        'import { internal as viteAliased } from "@vite/internal";',
        'import type { Internal as InternalType } from "@runtime/internal";',
        'export { internal } from "../SynCloudOS/internal";',
        'export type { Internal } from "../SynCloudOS/internal";',
        'const lazy = import("../SynCloudOS/internal");',
        'const common = require("../SynCloudOS/internal");',
      ].join("\n"),
    );

    const result = validateImportEdges({
      root,
      policy: fixturePolicy(),
    });

    expect(result.errors).toHaveLength(7);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "src/NSE/aliased.ts:1 -> src/SynCloudOS/internal.ts",
        ),
        expect.stringContaining(
          "src/NSE/aliased.ts:6 -> src/SynCloudOS/internal.ts",
        ),
        expect.stringContaining(
          "src/NSE/aliased.ts:7 -> src/SynCloudOS/internal.ts",
        ),
      ]),
    );
  });

  it("rejects non-static imports, requires, and import.meta.glob bypasses", () => {
    const root = createFixture();
    write(
      root,
      "src/NSE/computed.ts",
      [
        'const path = "../SynCloudOS/internal";',
        "const dynamic = import(path);",
        "const common = require(path);",
        'const modules = import.meta.glob("../SynCloudOS/*.ts");',
      ].join("\n"),
    );

    const result = validateImportEdges({
      root,
      policy: fixturePolicy(),
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("src/NSE/computed.ts:2 non-static import"),
        expect.stringContaining("src/NSE/computed.ts:3 non-static require"),
        expect.stringContaining(
          "src/NSE/computed.ts:4 -> src/SynCloudOS/internal.ts",
        ),
      ]),
    );
  });

  it("requires every controlled source and resolved target to have one layer", () => {
    const root = createFixture();
    write(
      root,
      "src/Unknown/helper.ts",
      "export const helper = true;\n",
    );
    write(
      root,
      "src/NSE/unknown.ts",
      'import { helper } from "../Unknown/helper";\n',
    );

    const result = validateImportEdges({
      root,
      policy: fixturePolicy(),
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "unclassified controlled source src/Unknown/helper.ts",
        expect.stringContaining(
          "src/NSE/unknown.ts:1 resolves to unclassified controlled target src/Unknown/helper.ts",
        ),
      ]),
    );
  });

  it("rejects repository-local resolved targets even when they sit outside controlledSources", () => {
    const root = createFixture();
    write(root, "tests/secret.ts", "export const secret = true;\n");
    write(
      root,
      "src/NSE/leak.ts",
      'import { secret } from "../../tests/secret";\n',
    );

    expect(validateImportEdges({ root, policy: fixturePolicy() }).errors).toContain(
      "src/NSE/leak.ts:1 resolves to unclassified repository target tests/secret.ts",
    );
  });

  it("requires the repository source-tree coverage anchor", () => {
    const root = createFixture();
    const candidate = fixturePolicy();
    candidate.controlledSources = ["src/NSE/NSE.ts"];

    expect(validateImportEdges({ root, policy: candidate }).errors).toContain(
      "controlledSources must include required anchor src/**",
    );
  });

  it("requires policy aliases to exactly match safe tsconfig and Vite aliases", () => {
    const root = createFixture();
    const missing = fixturePolicy();
    missing.aliases = [];
    expect(validateImportEdges({ root, policy: missing }).errors).toEqual(
      expect.arrayContaining([
        "policy aliases are missing configured alias @runtime -> src/SynCloudOS",
        "policy aliases are missing configured alias @vite -> src/SynCloudOS",
      ]),
    );

    const unknown = fixturePolicy();
    unknown.aliases.push({ find: "@runtime/internal", replacement: "../outside" });
    expect(validateImportEdges({ root, policy: unknown }).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("unknown or conflicting boundary alias @runtime/internal"),
        expect.stringContaining("replacement escapes the repository"),
      ]),
    );
  });

  it("rejects configured aliases that shadow one another", () => {
    const root = createFixture();
    write(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@runtime/*": ["src/SynCloudOS/*"],
            "@runtime/internal/*": ["src/SynCloudOS/Runtime/*"],
          },
        },
        include: ["src"],
      }),
    );

    expect(validateImportEdges({ root, policy: fixturePolicy() }).errors).toContain(
      "configured alias shadowing or conflict @runtime and @runtime/internal",
    );
  });

  it("accepts exact package entry aliases with a separately mapped testing subpath", () => {
    const root = createFixture();
    write(
      root,
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@syndromatic/syncloudos/sdk": ["src/SynCloudOS/AppSDK/sdkPackageEntry.ts"],
            "@syndromatic/syncloudos/sdk/testing": ["src/SynCloudOS/AppSDK/testing/sdkPackageEntry.ts"],
          },
        },
        include: ["src"],
      }),
    );
    write(
      root,
      "vite.config.ts",
      'export default { resolve: { alias: { "@syndromatic/syncloudos/sdk/testing": resolve("src/SynCloudOS/AppSDK/testing/sdkPackageEntry.ts"), "@syndromatic/syncloudos/sdk": resolve("src/SynCloudOS/AppSDK/sdkPackageEntry.ts") } } };\n',
    );
    write(root, "src/SynCloudOS/AppSDK/sdkPackageEntry.ts", "export const sdk = 1;\n");
    write(root, "src/SynCloudOS/AppSDK/testing/sdkPackageEntry.ts", "export const testing = 1;\n");
    write(
      root,
      "src/SynCloudOS/Runtime/testEntry.ts",
      'import { testing } from "@syndromatic/syncloudos/sdk/testing";\nexport { testing };\n',
    );
    const candidate = fixturePolicy();
    candidate.aliases = [
      { find: "@syndromatic/syncloudos/sdk", replacement: "src/SynCloudOS/AppSDK/sdkPackageEntry.ts" },
      { find: "@syndromatic/syncloudos/sdk/testing", replacement: "src/SynCloudOS/AppSDK/testing/sdkPackageEntry.ts" },
    ];

    expect(validateImportEdges({ root, policy: candidate }).errors).toEqual([]);
  });

  it("fails closed when rg discovery has no matches or exits unexpectedly", () => {
    const noMatches = () => {
      const error = new Error("no matches") as Error & { status?: number };
      error.status = 1;
      throw error;
    };
    const broken = () => {
      const error = new Error("rg unavailable") as Error & { status?: number };
      error.status = 2;
      throw error;
    };

    expect(() => discoverTypeScriptFiles(createFixture(), noMatches)).toThrow(
      "rg TypeScript discovery returned no files",
    );
    expect(() => discoverRepositoryFiles(createFixture(), broken)).toThrow(
      "rg repository discovery failed",
    );
    expect(
      validateImportEdges({
        root: createFixture(),
        policy: fixturePolicy(),
        rgRunner: noMatches,
      }).errors,
    ).toContain("boundary discovery failed: rg TypeScript discovery returned no files");
    expect(
      validateImportEdges({
        root: createFixture(),
        policy: fixturePolicy(),
        rgRunner: broken,
      }).errors,
    ).toContainEqual(
      expect.stringContaining("boundary discovery failed: rg TypeScript discovery failed"),
    );
  });

  it("excludes transient generated artifacts from repository discovery", () => {
    let observed: string[] = [];
    const capture = (_command: string, args: string[]) => {
      observed = args;
      return "src/NSE/NSE.ts\n";
    };

    discoverRepositoryFiles(createFixture(), capture);

    expect(observed).toContain("!.artifacts/**");
  });

  it("rejects a zero-coverage repository despite the src anchor", () => {
    const root = mkdtempSync(join(tmpdir(), "boundaries-boundaries-empty-"));
    temporaryRoots.push(root);
    write(root, "tsconfig.json", "{}\n");
    write(root, "vite.config.ts", "export default {};\n");
    const candidate = fixturePolicy();
    candidate.aliases = [];

    expect(validateImportEdges({ root, policy: candidate }).errors).toContain(
      "controlled source anchor src/** has no discovered TypeScript files",
    );
  });

  it("rejects resolved module targets outside the repository", () => {
    const root = createFixture();
    const outside = join(dirname(root), `${basename(root)}-outside.ts`);
    temporaryRoots.push(outside);
    writeFileSync(outside, "export const secret = true;\n", "utf8");
    write(
      root,
      "src/NSE/outside.ts",
      'import { secret } from "../../../' + basename(outside, ".ts") + '";\n',
    );

    expect(validateImportEdges({ root, policy: fixturePolicy() }).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "src/NSE/outside.ts:1 resolves outside repository target ../",
        ),
      ]),
    );
  });

  it("expands supported local Vite assets and rejects private-app glob imports", () => {
    const root = createFixture();
    write(
      root,
      "src/SynWare/Foo.app/Contents/private.json",
      '{"private":true}\n',
    );
    write(
      root,
      "src/Webspring/private-assets.ts",
      'const privateAssets = import.meta.glob("../SynWare/*/Contents/*.json", { eager: true });\n',
    );

    expect(validateImportEdges({ root, policy: fixturePolicy() }).errors).toContainEqual(
      expect.stringContaining(
        "src/Webspring/private-assets.ts:1 -> src/SynWare/Foo.app/Contents/private.json",
      ),
    );
  });

  it("expands an explicit brace set of supported local Vite asset types", () => {
    const root = createFixture();
    write(root, "src/NSE/assets/example.png", "png");
    write(root, "src/NSE/assets/example.svg", "<svg />");
    write(
      root,
      "src/NSE/brace-assets.ts",
      'const assets = import.meta.glob("./assets/*.{png,svg}", { eager: true, query: "?url", import: "default" });\n',
    );

    expect(validateImportEdges({ root, policy: fixturePolicy() }).errors).toEqual([]);
  });

  it("rejects escaping, unsupported, zero-match, and dynamic glob patterns/options", () => {
    const root = createFixture();
    write(
      root,
      "src/NSE/globs.ts",
      [
        'const escaping = import.meta.glob("../../../outside/*.json");',
        'const unsupported = import.meta.glob("./*.exe");',
        'const empty = import.meta.glob("./missing/*.json");',
        'const options = { eager: true };',
        'const dynamicOptions = import.meta.glob("./*.json", options);',
      ].join("\n"),
    );

    expect(validateImportEdges({ root, policy: fixturePolicy() }).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("src/NSE/globs.ts:1 import.meta.glob pattern escapes"),
        expect.stringContaining("src/NSE/globs.ts:2 import.meta.glob uses an unsupported asset type"),
        expect.stringContaining("src/NSE/globs.ts:3 import.meta.glob resolves no repository assets"),
        expect.stringContaining("src/NSE/globs.ts:5 import.meta.glob options must be a static supported object"),
      ]),
    );
  });

  it("selects the most-specific layer independent of declaration order", () => {
    const root = createFixture();
    write(
      root,
      "src/NSE/DateTime/specific.ts",
      'import { runtime } from "../../SynCloudOS/SynCloudOS";\n',
    );
    const candidate = fixturePolicy();
    candidate.layers.push({
      id: "datetime",
      include: ["src/NSE/DateTime/**"],
      mayImportLayers: ["datetime", "runtime"],
      mayImportEntrypoints: {
        runtime: ["src/SynCloudOS/SynCloudOS.ts"],
      },
    });

    expect(validateImportEdges({ root, policy: candidate }).errors).toEqual([]);
  });

  it("rejects equally specific overlapping classifications", () => {
    const root = createFixture();
    const candidate = fixturePolicy();
    candidate.layers.push({
      id: "nse-copy",
      include: ["src/NSE/**"],
      mayImportLayers: ["nse-copy"],
      mayImportEntrypoints: {},
    });

    expect(validateImportEdges({ root, policy: candidate }).errors).toContain(
      "ambiguous boundary classification for src/NSE/NSE.ts: nse, nse-copy",
    );
  });

  it("keeps host-only AppSDK seams out of the public AppSDK and SynWare import graph", () => {
    const root = createFixture();
    write(root, "src/SynCloudOS/privateHost.ts", "export interface PrivateHostPort {}\n");
    write(
      root,
      "src/SynCloudOS/AppSDK/host/runtimePorts.ts",
      'export type { PrivateHostPort } from "../../privateHost";\n',
    );
    write(root, "src/SynCloudOS/AppSDK/publicValue.ts", "export const publicValue = 1;\n");
    write(
      root,
      "src/SynCloudOS/AppSDK/sdkPackageEntry.ts",
      'export { publicValue } from "./publicValue";\n',
    );
    write(
      root,
      "src/SynWare/Foo.app/Contents/index.ts",
      'import { publicValue } from "../../../SynCloudOS/AppSDK/sdkPackageEntry"; void publicValue;\n',
    );

    const candidate = fixturePolicy();
    candidate.layers.push(
      {
        id: "app-sdk-host",
        include: ["src/SynCloudOS/AppSDK/host/**"],
        mayImportLayers: ["app-sdk-host", "runtime"],
        mayImportEntrypoints: {
          runtime: ["src/SynCloudOS/privateHost.ts"],
        },
      },
      {
        id: "app-sdk",
        include: ["src/SynCloudOS/AppSDK/**"],
        mayImportLayers: ["app-sdk"],
        mayImportEntrypoints: {},
      },
    );
    candidate.layers.find((layer) => layer.id === "synapps")!.mayImportLayers.push("app-sdk");
    candidate.layers.find((layer) => layer.id === "synapps")!.mayImportEntrypoints = {
      "app-sdk": ["src/SynCloudOS/AppSDK/sdkPackageEntry.ts"],
    };

    expect(validateImportEdges({ root, policy: candidate }).errors).toEqual([]);

    write(
      root,
      "src/SynCloudOS/AppSDK/sdkPackageEntry.ts",
      'export type { PrivateHostPort } from "./host/runtimePorts";\n',
    );
    expect(validateImportEdges({ root, policy: candidate }).errors).toContainEqual(
      expect.stringContaining(
        "src/SynCloudOS/AppSDK/sdkPackageEntry.ts:1 -> src/SynCloudOS/AppSDK/host/runtimePorts.ts",
      ),
    );
  });

  it("uses the committed policy to reject direct and indirect public AppSDK host re-exports", () => {
    const root = createFixture();
    write(
      root,
      "src/SynCloudOS/AppSDK/SynWareRuntimeMount.tsx",
      "export interface SynWareRuntimeMountProps {}\n",
    );
    write(
      root,
      "src/SynCloudOS/AppSDK/portableBridge.ts",
      'export type { SynWareRuntimeMountProps } from "./SynWareRuntimeMount";\n',
    );
    write(
      root,
      "src/SynCloudOS/AppSDK/sdkPackageEntry.ts",
      [
        'export type { SynWareRuntimeMountProps } from "./SynWareRuntimeMount";',
        'export type { SynWareRuntimeMountProps as IndirectMountProps } from "./portableBridge";',
      ].join("\n"),
    );

    const candidate = fixturePolicy();
    candidate.layers = structuredClone(policy.layers);
    const errors = validateImportEdges({ root, policy: candidate });
    expect(errors.errors).toEqual(expect.arrayContaining([
      expect.stringContaining(
        "src/SynCloudOS/AppSDK/sdkPackageEntry.ts:1 -> src/SynCloudOS/AppSDK/SynWareRuntimeMount.tsx",
      ),
      expect.stringContaining(
        "src/SynCloudOS/AppSDK/portableBridge.ts:1 -> src/SynCloudOS/AppSDK/SynWareRuntimeMount.tsx",
      ),
    ]));
  });

  it("rejects default-runtime, SynWare-private, and raw-runtime imports", () => {
    const root = createFixture();
    write(
      root,
      "src/NSE/default.ts",
      'import { defaultRuntime } from "../SynCloudOS/Runtime/defaultRuntime";\n',
    );
    write(
      root,
      "src/Webspring/private.ts",
      'import { app } from "../SynWare/Foo.app/Contents/index";\n',
    );
    write(
      root,
      "src/SynWare/Foo.app/Contents/bad.ts",
      'import { internal } from "../../../SynCloudOS/internal";\n',
    );

    const result = validateImportEdges({
      root,
      policy: fixturePolicy(),
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "src/NSE/default.ts:1 -> src/SynCloudOS/Runtime/defaultRuntime.ts",
        ),
        expect.stringContaining(
          "src/Webspring/private.ts:1 -> src/SynWare/Foo.app/Contents/index.ts",
        ),
        expect.stringContaining(
          "src/SynWare/Foo.app/Contents/bad.ts:1 -> src/SynCloudOS/internal.ts",
        ),
      ]),
    );
  });

  it("rejects aliased, destructured, computed, and constant browser-global access in runtime code", () => {
    const root = createFixture();
    write(
      root,
      "src/SynCloudOS/Runtime/browser-globals.ts",
      [
        "const browserWindow = window;",
        "const { setTimeout: schedule } = globalThis;",
        "const property = \"matchMedia\";",
        "const media = window[property];",
        "const { localStorage } = window;",
        "const browserNavigator = navigator;",
        "history.pushState({}, \"\", location.pathname);",
        "export type BrowserShape = Window;",
        "void browserWindow; void schedule; void media; void localStorage;",
      ].join("\n"),
    );

    const errors = validateRuntimeBrowserGlobals({
      root,
      policy: fixturePolicy(),
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("browser-globals.ts:1 accesses browser global window"),
        expect.stringContaining("browser-globals.ts:2 accesses browser global globalThis"),
        expect.stringContaining("browser-globals.ts:4 accesses browser global window"),
        expect.stringContaining("browser-globals.ts:5 accesses browser global window"),
        expect.stringContaining("browser-globals.ts:6 accesses browser global navigator"),
        expect.stringContaining("browser-globals.ts:7 accesses browser global history"),
        expect.stringContaining("browser-globals.ts:7 accesses browser global location"),
      ]),
    );
    expect(errors.some((error) => error.includes(":8 accesses browser global Window"))).toBe(false);
  });

  it("permits only the explicit browser environment authority root and respects lexical bindings", () => {
    const root = createFixture();
    write(root, "src/SynCloudOS/PlatformAdapters/browser.ts", "export const value = window.location.href;\n");
    write(root, "src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts", "export const value = window.location.href;\n");
    write(root, "src/main.tsx", "document.title = window.location.pathname;\n");
    write(root, "src/SynCloudOS/Runtime/local-document.ts", "const document = { title: \"runtime owned\" }; export const value = document.title;\n");

    const errors = validateRuntimeBrowserGlobals({ root, policy: fixturePolicy() });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("src/SynCloudOS/PlatformAdapters/browser.ts:1 accesses browser global window"),
      expect.stringContaining("src/main.tsx:1 accesses browser global document"),
      expect.stringContaining("src/main.tsx:1 accesses browser global window"),
    ]));
    expect(errors).not.toEqual(expect.arrayContaining([
      expect.stringContaining("BrowserRuntimeEnvironment.ts"),
      expect.stringContaining("local-document.ts"),
    ]));
  });

  it("confines cookie access and cookie adapter contracts to identity/service seams", () => {
    const root = createFixture();
    write(root, "src/SynCloudOS/PlatformAdapters/BrowserIdentityCookieAdapter.ts", "export const value = document.cookie;\n");
    write(root, "src/SynCloudOS/PlatformAdapters/identityCookieAdapterTypes.ts", "export interface IdentityCookieAdapter {}\n");
    write(root, "src/SynCloudOS/Identity/IdentityService.ts", "export const value = \"Cookie\";\n");
    write(root, "src/SynCloudOS/Runtime/leak.ts", "export const value = document[\"cookie\"];\n");
    write(root, "src/NSE/leak.ts", 'import type { IdentityCookieAdapter } from "../SynCloudOS/PlatformAdapters/identityCookieAdapterTypes";\n');

    const errors = validateIdentityCookieBoundary({ root, policy: fixturePolicy() });
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("src/SynCloudOS/Runtime/leak.ts:1 accesses cookie data"),
      expect.stringContaining("src/NSE/leak.ts:1 imports identityCookieAdapterTypes"),
    ]));
    expect(errors).not.toEqual(expect.arrayContaining([
      expect.stringContaining("src/SynCloudOS/PlatformAdapters/BrowserIdentityCookieAdapter.ts"),
      expect.stringContaining("src/SynCloudOS/Identity/IdentityService.ts"),
    ]));
  });

  it("rejects an allowlist entry as soon as its exact edge disappears", () => {
    const root = createFixture();
    write(
      root,
      "src/NSE/temporary.ts",
      'import { internal } from "../SynCloudOS/internal";\n',
    );
    const candidate = fixturePolicy();
    candidate.temporaryAllowlist.push({
      source: "src/NSE/temporary.ts",
      target: "src/SynCloudOS/internal.ts",
      reason: "Fixture edge is temporary.",
      expires: "2999-01-01",
    });

    expect(validateImportEdges({ root, policy: candidate }).errors).toEqual([]);

    write(root, "src/NSE/temporary.ts", "export const clean = true;\n");

    expect(validateImportEdges({ root, policy: candidate }).errors).toContain(
      "stale temporary allowlist edge src/NSE/temporary.ts -> src/SynCloudOS/internal.ts",
    );
  });

  it("rejects wildcard, undated and expired temporary allowlist entries", () => {
    const root = createFixture();
    const candidate = fixturePolicy();
    candidate.temporaryAllowlist.push(
      {
        source: "src/NSE/**",
        target: "src/SynCloudOS/internal.ts",
        reason: "Invalid broad exception.",
        expires: "2000-01-01",
      },
      {
        source: "src/NSE/undated.ts",
        target: "src/SynCloudOS/internal.ts",
        reason: "Missing expiry.",
      },
    );

    const result = validateImportEdges({ root, policy: candidate });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "temporary allowlist entries require exact source and target files",
        "expired temporary allowlist edge src/NSE/** -> src/SynCloudOS/internal.ts (expired 2000-01-01)",
        "temporary allowlist edge src/NSE/undated.ts -> src/SynCloudOS/internal.ts needs a reason and an expires date (YYYY-MM-DD)",
      ]),
    );
  });

  it("keeps devtools runtime access behind exact public seams", () => {
    const devtools = policy.layers.find(({ id }) => id === "devtools");
    expect(devtools?.mayImportEntrypoints.runtime).toBeDefined();
    expect(
      devtools?.mayImportEntrypoints.runtime.every(
        (entrypoint) =>
          !entrypoint.includes("*") && /\.[cm]?[jt]sx?$/.test(entrypoint),
      ),
    ).toBe(true);
    const inspectorDebt = policy.temporaryAllowlist.filter(
      ({ source }: { source: string }) => source.startsWith("src/SynCloudOS/Inspector/"),
    );
    expect(inspectorDebt).toHaveLength(0);
    expect(
      inspectorDebt.every(
        ({ source, target }) =>
          !source.includes("*") &&
          !target.includes("*") &&
          target.startsWith("src/SynCloudOS/"),
      ),
    ).toBe(true);
  });

  it("returns deterministic policy errors instead of throwing", () => {
    for (const candidate of [
      null,
      {},
      { schemaVersion: 1, layers: [null], temporaryAllowlist: null },
      {
        schemaVersion: 1,
        controlledSources: null,
        exclusions: {},
        layers: [{ id: "broken", include: null }],
        temporaryAllowlist: [{}],
      },
      {
        ...fixturePolicy(),
        layers: [
          {
            ...fixturePolicy().layers[0],
            mayImportLayers: 42,
          },
        ],
      },
    ]) {
      expect(() =>
        validateImportEdges({ root: createFixture(), policy: candidate as never }),
      ).not.toThrow();
      expect(
        validateImportEdges({
          root: createFixture(),
          policy: candidate as never,
        }).errors.length,
      ).toBeGreaterThan(0);
    }

  });

});
