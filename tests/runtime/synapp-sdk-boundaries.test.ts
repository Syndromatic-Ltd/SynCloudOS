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

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

async function loadAuditSynWareImports() {
  const module = await import("../../scripts/synware/audit-sdk-imports.mjs");
  return module.auditSynWareImports;
}

it("loads the SynWare boundary audit through Vite-compatible ESM", async () => {
  const source = readFileSync("scripts/synware/audit-sdk-imports.mjs", "utf8");
  expect(source).not.toMatch(/^#!/u);

  const auditSynWareImports = await loadAuditSynWareImports();
  expect(auditSynWareImports).toEqual(expect.any(Function));
});


it("rejects a fabricated null root only in a first-party SynWare entry", async () => {
  const auditSynWareImports = await loadAuditSynWareImports();
  const root = mkdtempSync(join(tmpdir(), "synapp-sdk-audit-root-"));
  try {
    const contents = join(root, "src", "SynWare", "Placeholder.app", "Contents");
    mkdirSync(contents, { recursive: true });
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@syndromatic/syncloudos/sdk": ["src/SynCloudOS/AppSDK/sdkPackageEntry.ts"] } },
    }));
    const sdk = join(root, "src", "SynCloudOS", "AppSDK");
    mkdirSync(sdk, { recursive: true });
    writeFileSync(join(sdk, "sdkPackageEntry.ts"), "export const createSynWare = (definition) => definition;\n");
    writeFileSync(join(contents, "index.tsx"), [
      'import { createSynWare } from "@syndromatic/syncloudos/sdk";',
      'export default createSynWare({ manifest: { schemaVersion: 1, id: "placeholder", version: "1.0.0", title: "Placeholder" }, root: () => null });',
    ].join("\n"));

    const audit = auditSynWareImports(root);

    expect(audit.fabricatedRoots).toEqual([
      expect.objectContaining({
        file: "src/SynWare/Placeholder.app/Contents/index.tsx",
        reason: expect.stringContaining("fabricated null root"),
      }),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("keeps mounted presentation capability read-only and separate from manifest metadata", () => {
  const client = readFileSync("src/SynCloudOS/AppSDK/appClientTypes.ts", "utf8");
  const context = readFileSync("src/SynCloudOS/AppSDK/appContextTypes.ts", "utf8");
  const facade = readFileSync("src/SynCloudOS/AppSDK/appRuntimeFacade.ts", "utf8");
  expect(client).toContain("interface AppPresentationClient");
  expect(client).toContain("getSnapshot(): SynCloudOSPresentationTraits");
  expect(context).toContain("readonly presentation: AppPresentationClient");
  expect(context).not.toContain("readonly presentation: \"desktop\"");
  expect(facade).not.toMatch(/runtime\.state\.(?:responsive)/);
});


it("fails closed for aliases, side-effect and dynamic imports into a private SynWare boundary", async () => {
  const auditSynWareImports = await loadAuditSynWareImports();
  const root = mkdtempSync(join(tmpdir(), "synapp-sdk-audit-"));
  try {
    const contents = join(root, "src", "SynWare", "Example.app", "Contents");
    const privateContents = join(root, "src", "SynWare", "Private.app", "Contents");
    mkdirSync(contents, { recursive: true });
    mkdirSync(privateContents, { recursive: true });
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@private/*": ["src/SynWare/Private.app/Contents/*"] } },
    }));
    writeFileSync(join(contents, "index.ts"), [
      'import "@private/secret";',
      'export { secret } from "@private/secret";',
      'void import("@private/secret");',
      'import "../../../Webspring/private";',
      'import "../../../NSE/Registry";',
      'import "../../Private.app/Contents";',
    ].join("\n"));
    writeFileSync(join(privateContents, "secret.ts"), "export const secret = true;\n");
    writeFileSync(join(privateContents, "index.ts"), "export { secret } from \"./secret\";\n");
    mkdirSync(join(root, "src", "Webspring"), { recursive: true });
    writeFileSync(join(root, "src", "Webspring", "private.ts"), "export {};\n");
    mkdirSync(join(root, "src", "NSE", "Registry"), { recursive: true });
    writeFileSync(join(root, "src", "NSE", "Registry", "index.ts"), "export {};\n");

    const audit = auditSynWareImports(root);

    expect(audit.internalImports).toHaveLength(6);
    expect(audit.internalImports.filter((violation) => violation.reason === "private cross-SynWare Contents import")).toHaveLength(4);
    expect(audit.internalImports).toContainEqual(expect.objectContaining({ reason: "Platform source import is forbidden; use a public SynWare SDK entry point" }));
    expect(audit.internalImports).toContainEqual(expect.objectContaining({ reason: "Platform source import is forbidden; use a public SynWare SDK entry point" }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("reports every non-literal dynamic import and rejects unresolved or wrong-case SDK paths", async () => {
  const auditSynWareImports = await loadAuditSynWareImports();
  const root = mkdtempSync(join(tmpdir(), "synapp-sdk-audit-dynamic-"));
  try {
    const contents = join(root, "src", "SynWare", "Example.app", "Contents");
    const sdk = join(root, "src", "SynCloudOS", "AppSDK");
    mkdirSync(contents, { recursive: true });
    mkdirSync(sdk, { recursive: true });
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@sdk/*": ["src/SynCloudOS/AppSDK/*"],
          "@missing/*": ["src/SynWare/Missing.app/Contents/*"],
        },
      },
    }));
    writeFileSync(join(sdk, "index.ts"), "export const sdk = true;\n");
    writeFileSync(join(contents, "index.ts"), [
      'import "../../../SynCloudOS/AppSDK";',
      'import "@sdk/index";',
      'import "../../../SynCloudOS/appsdk";',
      'import "@sdk/INDEX";',
      'import "@missing/not-found";',
      'const moduleName = "../../../SynCloudOS/AppSDK";',
      "void import(moduleName);",
      'void import(`../../../SynCloudOS/AppSDK/${moduleName}`);',
      'void import("../../../SynCloudOS/AppSDK" + "/index");',
      'void import(resolveModule("../../../SynCloudOS/AppSDK"));',
      'void import("@external-package/literal");',
      'void import("../../../SynCloudOS/AppSDK");',
    ].join("\n"));

    const audit = auditSynWareImports(root);
    const dynamicViolations = audit.internalImports.filter((violation) =>
      violation.reason.includes("non-literal dynamic import"),
    );
    const platformDenial = "Platform source import is forbidden; use a public SynWare SDK entry point";
    const unresolvedDenial = "unresolved internal-looking module specifier; resolve it or use a documented external package";
    const wrongCaseDenial = existsSync(join(sdk, "INDEX.ts")) ? platformDenial : unresolvedDenial;

    expect(audit.internalImports).toHaveLength(10);
    expect(dynamicViolations).toHaveLength(4);
    expect(dynamicViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: 7, reason: expect.stringContaining("non-literal dynamic import") }),
      expect.objectContaining({ line: 8, reason: expect.stringContaining("non-literal dynamic import") }),
      expect.objectContaining({ line: 9, reason: expect.stringContaining("non-literal dynamic import") }),
      expect.objectContaining({ line: 10, reason: expect.stringContaining("non-literal dynamic import") }),
    ]));
    expect(dynamicViolations.every((violation) =>
      typeof violation.file === "string" &&
      typeof violation.location === "string" &&
      typeof violation.reason === "string",
    )).toBe(true);

    expect(audit.internalImports).toEqual(expect.arrayContaining([
      expect.objectContaining({
        specifier: "../../../SynCloudOS/appsdk",
        reason: "Platform source import is forbidden; use a public SynWare SDK entry point",
      }),
      expect.objectContaining({
        specifier: "@sdk/INDEX",
        line: 4,
        reason: wrongCaseDenial,
      }),
      expect.objectContaining({
        specifier: "@missing/not-found",
        reason: unresolvedDenial,
      }),
    ]));
    expect(audit.internalImports).toEqual(expect.arrayContaining([
      expect.objectContaining({ specifier: "../../../SynCloudOS/AppSDK", reason: platformDenial }),
      expect.objectContaining({ specifier: "@sdk/index", reason: platformDenial }),
    ]));
    expect(audit.internalImports).not.toContainEqual(expect.objectContaining({ specifier: "@external-package/literal" }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
