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

import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const inspectedRoots = [resolve(repositoryRoot, "src"), resolve(repositoryRoot, "tests")];
const sourceExtensions = new Set([".ts", ".tsx"]);

const forbiddenRuntimeValues = new Set([
  "SynCloudOS",
  "RuntimeStore",
  "RuntimeController",
  "ApplicationState",
  "AppsController",
  "AppManagerController",
  "AppLifecycle",
  "AppRegistry",
  "BootManager",
  "BundleLoader",
  "DocumentStore",
  "ErrorManager",
  "EventBus",
  "Identity",
  "Inspector",
  "LaunchServices",
  "Lifecycle",
  "LocaleServices",
  "LoginServices",
  "NotificationCenter",
  "PermissionManager",
  "Persistence",
  "PluginRegistry",
  "PolicyKit",
  "ResponsiveModeManager",
  "RouteManager",
  "ServiceRegistry",
  "SettingsService",
  "AppearanceService",
  "Statechart",
  "WorkspaceController",
  "WebspringState",
  "WebspringChoreography",
]);

const forbiddenRuntimeModules = /\/(?:SynCloudOS|Runtime\/(?:RuntimeStore|RuntimeController|transactions|run)|Appearance\/appearanceService|ApplicationState\/ApplicationState|AppsController\/AppsController|AppManager\/(?:AppManagerController|AppLifecycle)|AppRegistry\/AppRegistry|BootManager\/BootManager|BundleLoader\/BundleLoader|Choreography\/WebspringChoreography|DocumentStore\/DocumentStore|ErrorManager\/(?:ErrorManager|SynCloudOSGlobalWatchdog)|EventBus\/EventBus|Identity\/Identity|Inspector\/Inspector|LaunchServices\/LaunchServices|Lifecycle\/Lifecycle|LocaleServices\/LocaleServices|LoginServices\/LoginServices|NotificationCenter\/NotificationCenter|PermissionManager\/PermissionManager|Persistence\/Persistence|PluginRegistry\/PluginRegistry|PolicyKit\/PolicyKit|ResponsiveModeManager\/ResponsiveModeManager|RouteManager\/RouteManager|ServiceRegistry\/ServiceRegistry|Settings\/settingsService|Statechart\/Statechart|WebspringState\/WebspringState|WindowManager\/WindowManager|WorkspaceController\/WorkspaceController)$/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function displayPath(path: string): string {
  return relative(repositoryRoot, path).replaceAll("\\", "/");
}

function normaliseModuleIdentity(importerPath: string, modulePath: string): string {
  const normalisedSpecifier = modulePath.replaceAll("\\", "/");
  if (!normalisedSpecifier.startsWith(".")) return normalisedSpecifier.replace(/\.(?:[cm]?tsx?|jsx?)$/, "");
  const absoluteImporter = isAbsolute(importerPath) ? importerPath : resolve(repositoryRoot, importerPath);
  return relative(repositoryRoot, resolve(dirname(absoluteImporter), normalisedSpecifier))
    .replaceAll("\\", "/")
    .replace(/\.(?:[cm]?tsx?|jsx?)$/, "")
    .replace(/\/index$/, "");
}

function importTargetsForbiddenRuntime(importerPath: string, modulePath: string): boolean {
  return forbiddenRuntimeModules.test(normaliseModuleIdentity(importerPath, modulePath));
}

function importTargetsDiagnosticDefault(importerPath: string, modulePath: string): boolean {
  return normaliseModuleIdentity(importerPath, modulePath) === "src/SynCloudOS/Runtime/defaultRuntime";
}

function mayImportDiagnosticDefault(path: string): boolean {
  const shownPath = isAbsolute(path) ? displayPath(path) : path.replaceAll("\\", "/");
  return !shownPath.startsWith("src/")
    || shownPath === "src/main.tsx"
    || shownPath.startsWith("src/SynCloudOS/Developer/");
}

export function inspectRuntimeSingletonSource(path: string, text: string): string[] {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const errors: string[] = [];
  const shownPath = path.startsWith(repositoryRoot) ? displayPath(path) : path;

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const clause = node.importClause;
      const modulePath = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : "";
      const bindings = clause.namedBindings;
      if (!clause.isTypeOnly && importTargetsDiagnosticDefault(path, modulePath) && !mayImportDiagnosticDefault(path)) {
        errors.push(`${shownPath} imports diagnostic default module ${modulePath}`);
      } else if (!clause.isTypeOnly && clause.name && importTargetsForbiddenRuntime(path, modulePath)) {
        errors.push(`${shownPath} imports forbidden runtime default ${clause.name.text}`);
      }
      if (!clause.isTypeOnly && bindings && ts.isNamespaceImport(bindings) && importTargetsForbiddenRuntime(path, modulePath)) {
        errors.push(`${shownPath} imports forbidden runtime namespace ${bindings.name.text}`);
      }
      if (!clause.isTypeOnly && bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (element.isTypeOnly) continue;
          const importedName = element.propertyName?.text ?? element.name.text;
          if (forbiddenRuntimeValues.has(importedName)) {
            errors.push(`${shownPath} imports singleton value ${importedName}`);
          }
        }
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        if (importTargetsDiagnosticDefault(path, argument.text) && !mayImportDiagnosticDefault(path)) {
          errors.push(`${shownPath} dynamically imports diagnostic default module ${argument.text}`);
        } else if (importTargetsForbiddenRuntime(path, argument.text)) {
          errors.push(`${shownPath} dynamically imports forbidden runtime module ${argument.text}`);
        }
      }
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        if (importTargetsDiagnosticDefault(path, argument.text) && !mayImportDiagnosticDefault(path)) {
          errors.push(`${shownPath} requires diagnostic default module ${argument.text}`);
        } else if (importTargetsForbiddenRuntime(path, argument.text)) {
          errors.push(`${shownPath} requires forbidden runtime module ${argument.text}`);
        }
      }
    }

    if (ts.isVariableStatement(node) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && forbiddenRuntimeValues.has(declaration.name.text)) {
          errors.push(`${shownPath} exports singleton value ${declaration.name.text}`);
        }
      }
    }

    if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
      const modulePath = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : "";
      if (modulePath && importTargetsDiagnosticDefault(path, modulePath) && !mayImportDiagnosticDefault(path)) {
        errors.push(`${shownPath} re-exports diagnostic default module ${modulePath}`);
      } else if (!node.exportClause && modulePath && importTargetsForbiddenRuntime(path, modulePath)) {
        errors.push(`${shownPath} re-exports forbidden runtime module ${modulePath}`);
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          if (element.isTypeOnly) continue;
          const exportedName = element.propertyName?.text ?? element.name.text;
          if (forbiddenRuntimeValues.has(exportedName)) {
            errors.push(`${shownPath} re-exports singleton value ${exportedName}`);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(source);
  return errors;
}

describe("runtime singleton boundary", () => {
  it("has no deprecated singleton compatibility helpers or reset calls", () => {
    const deprecatedPatterns = [
      ["load", "Runtime", "Modules"].join(""),
      ["legacy", "Runtime", "Compatibility"].join(""),
      ["vi", ".", "reset", "Modules"].join(""),
    ];
    const inspected = [
      ...inspectedRoots,

    ];
    const offenders = inspected.flatMap(sourceFiles).flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return deprecatedPatterns
        .filter((pattern) => text.includes(pattern))
        .map((pattern) => `${displayPath(path)} contains ${pattern}`);
    });
    expect(offenders).toEqual([]);
  });

  it("has no singleton exports or value consumers in production and tests", () => {
    const errors = inspectedRoots.flatMap(sourceFiles).flatMap((path) => (
      inspectRuntimeSingletonSource(path, readFileSync(path, "utf8"))
    ));
    expect(errors).toEqual([]);
  }, 60_000);

  it("rejects adversarial value imports while allowing types, classes, and factories", () => {
    expect(inspectRuntimeSingletonSource("fixture/value.ts", [
      'import { RuntimeStore as store } from "./SynCloudOS/Runtime/RuntimeStore";',
      'import * as policy from "./SynCloudOS/PolicyKit/PolicyKit";',
      'export { EventBus as Events } from "./SynCloudOS/EventBus/EventBus";',
      'export const AppearanceService = {};',
      'void import("./SynCloudOS/Runtime/transactions");',
    ].join("\n"))).toEqual([
      "fixture/value.ts imports singleton value RuntimeStore",
      "fixture/value.ts imports forbidden runtime namespace policy",
      "fixture/value.ts re-exports singleton value EventBus",
      "fixture/value.ts exports singleton value AppearanceService",
      "fixture/value.ts dynamically imports forbidden runtime module ./SynCloudOS/Runtime/transactions",
    ]);

    expect(inspectRuntimeSingletonSource("fixture/legitimate.ts", [
      'import type { RuntimeStore } from "./SynCloudOS/Runtime/RuntimeStore";',
      'import { SynCloudOSRuntimeStore, createRuntimeStore } from "./SynCloudOS/Runtime/RuntimeStore";',
      'import { createPolicyKit } from "./SynCloudOS/PolicyKit/PolicyKit";',
      'export type { EventBus } from "./SynCloudOS/EventBus/EventBus";',
    ].join("\n"))).toEqual([]);
  });

  it("resolves every relative spelling and rejects default imports and export stars", () => {
    expect(inspectRuntimeSingletonSource("src/SynCloudOS/Runtime/fixture.ts", [
      'import { clearDefaultSynCloudOSRuntime } from "./defaultRuntime";',
    ].join("\n"))).toEqual([
      "src/SynCloudOS/Runtime/fixture.ts imports diagnostic default module ./defaultRuntime",
    ]);

    expect(inspectRuntimeSingletonSource("src/SynCloudOS/Feature/fixture.ts", [
      'export { getDefaultSynCloudOSRuntime } from "../Runtime/defaultRuntime";',
      'void import("../Runtime/defaultRuntime");',
      'require("../Runtime/defaultRuntime");',
    ].join("\n"))).toEqual([
      "src/SynCloudOS/Feature/fixture.ts re-exports diagnostic default module ../Runtime/defaultRuntime",
      "src/SynCloudOS/Feature/fixture.ts dynamically imports diagnostic default module ../Runtime/defaultRuntime",
      "src/SynCloudOS/Feature/fixture.ts requires diagnostic default module ../Runtime/defaultRuntime",
    ]);

    expect(inspectRuntimeSingletonSource("src/fixture.ts", [
      'import RuntimeStore from "./SynCloudOS/Runtime/RuntimeStore";',
      'export * from "./SynCloudOS/EventBus/EventBus";',
    ].join("\n"))).toEqual([
      "src/fixture.ts imports forbidden runtime default RuntimeStore",
      "src/fixture.ts re-exports forbidden runtime module ./SynCloudOS/EventBus/EventBus",
    ]);
  });

  it("keeps runtime construction independent of diagnostic default authority", () => {
    const constructorSource = readFileSync(
      resolve(repositoryRoot, "src/SynCloudOS/Runtime/createSynCloudOS.ts"),
      "utf8",
    );
    expect(constructorSource).not.toContain(["./", "default", "Runtime"].join(""));
  });

  it("keeps diagnostic-default imports within the explicit exposure boundary", () => {
    const offenders = sourceFiles(resolve(repositoryRoot, "src"))
      .flatMap((path) => inspectRuntimeSingletonSource(path, readFileSync(path, "utf8")))
      .filter((error) => error.includes("diagnostic default module"));
    expect(offenders).toEqual([]);
  });
});
