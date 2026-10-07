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

import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { normalizeRoutePath } from "../../src/SynCloudOS/Routing/routeNormalization";
import { createTestRuntime } from "./helpers";

const repositoryRoot = process.cwd();
const forbiddenGlobals = new Set([
  "window",
  "document",
  "globalThis",
  "navigator",
  "localStorage",
  "sessionStorage",
  "history",
  "location",
  "matchMedia",
  "screen",
  "visualViewport",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "setTimeout",
  "clearTimeout",
  "ResizeObserver",
  "IntersectionObserver",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

function declarationName(node: ts.Identifier) {
  const parent = node.parent;
  return (
    (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent)
      || ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)
      || ts.isImportClause(parent) || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent))
    && parent.name === node
  );
}

function nonReferencePropertyName(node: ts.Identifier) {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node)
    || (ts.isPropertyAssignment(parent) && parent.name === node)
    || (ts.isPropertySignature(parent) && parent.name === node)
    || (ts.isPropertyDeclaration(parent) && parent.name === node)
    || (ts.isMethodDeclaration(parent) && parent.name === node)
    || (ts.isMethodSignature(parent) && parent.name === node)
    || (ts.isBindingElement(parent) && (parent.propertyName === node || parent.name === node))
  );
}

function inspectSourceBrowserGlobals(source: ts.SourceFile, path: string, checker?: ts.TypeChecker) {
  const findings: string[] = [];
  const visit = (node: ts.Node) => {
    const symbol = ts.isIdentifier(node) ? checker?.getSymbolAtLocation(node) : undefined;
    const isProjectLocal = symbol?.declarations?.some((declaration) => !declaration.getSourceFile().isDeclarationFile) ?? false;
    if (
      ts.isIdentifier(node)
      && forbiddenGlobals.has(node.text)
      && !isProjectLocal
      && !declarationName(node)
      && !nonReferencePropertyName(node)
    ) {
      const location = source.getLineAndCharacterOfPosition(node.getStart(source));
      findings.push(`${path}:${location.line + 1}:${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

export function inspectBrowserGlobals(path: string, text: string) {
  const fixturePath = resolve(repositoryRoot, path);
  const compilerOptions: ts.CompilerOptions = {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.Latest,
  };
  const normalizedFixturePath = fixturePath.replaceAll("\\", "/").toLowerCase();
  const isFixturePath = (fileName: string) =>
    fileName.replaceAll("\\", "/").toLowerCase() === normalizedFixturePath;
  const fixtureText = `${text}\nexport {};`;
  const host = ts.createCompilerHost(compilerOptions, true);
  const fixture = ts.createSourceFile(
    fixturePath,
    fixtureText,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    isFixturePath(fileName)
      ? fixture
      : getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (fileName) => isFixturePath(fileName) || fileExists(fileName);
  const readFile = host.readFile.bind(host);
  host.readFile = (fileName) => isFixturePath(fileName) ? fixtureText : readFile(fileName);
  const programme = ts.createProgram([fixturePath], compilerOptions, host);
  const source = programme.getSourceFiles().find((candidate) => isFixturePath(candidate.fileName));
  if (!source) throw new Error(`Could not create fixture source ${path}`);
  return inspectSourceBrowserGlobals(source, path, programme.getTypeChecker());
}

describe("browser-global runtime boundary", () => {
  it("keeps browser globals behind explicit platform adapters", () => {
    const root = resolve(repositoryRoot, "src/SynCloudOS");
    const ambientAuthorityRoots = new Set([
      resolve(root, "PlatformAdapters", "BrowserRuntimeEnvironment.ts"),
      resolve(root, "PlatformAdapters", "BrowserAuthenticationEnvironment.ts"),
      resolve(root, "PlatformAdapters", "BrowserPointerAdapter.ts"),
      resolve(root, "PlatformAdapters", "browserPointerAdapterTypes.ts"),
      resolve(root, "PlatformAdapters", "AUFXAudioWorkletTransport.ts"),
      resolve(root, "PlatformAdapters", "BrowserHapticsAdapter.ts"),
      resolve(root, "PlatformAdapters", "BrowserTestingClock.ts"),
      resolve(root, "PlatformAdapters", "BrowserAudioFileAdapter.ts"),
      resolve(root, "PlatformAdapters", "BrowserDocumentAssetEnvironment.ts"),
      resolve(root, "PlatformAdapters", "BrowserVideoDecoder.ts"),
      resolve(root, "PlatformAdapters", "BrowserVideoEncoder.ts"),
      resolve(root, "PlatformAdapters", "BrowserWebGPUImageProcessingBackend.ts"),
      resolve(root, "PlatformAdapters", "image-processing.worker.ts"),
      resolve(root, "PlatformAdapters", "lumina-index.worker.ts"),
      resolve(root, "PlatformAdapters", "video-processing.worker.ts"),
      resolve(root, "PlatformAdapters", "browserResponsiveness.worker.ts"),
    ]);
    const serverRoot = `${resolve(root, "Server")}${sep}`;
    const paths = sourceFiles(root)
      .filter((path) => !ambientAuthorityRoots.has(path) && !path.startsWith(serverRoot));
    const programme = ts.createProgram(paths, { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.Latest });
    const checker = programme.getTypeChecker();
    const findings = paths.flatMap((path) => {
      const source = programme.getSourceFile(path);
      return source
        ? inspectSourceBrowserGlobals(source, relative(repositoryRoot, path).replaceAll("\\", "/"), checker)
        : [];
    });
    expect(findings).toEqual([]);
  }, 90_000);

  it("keeps the Webspring surfaces behind the injected runtime environment", () => {
    const paths = [
      "src/Webspring/ApplicationStageLayer.tsx",
      "src/Webspring/ApplicationStageHost.tsx",
      "src/Webspring/ApplicationStageView.tsx",
      "src/Webspring/Contents/Views/WebspringBoardView/WebspringBoardView.tsx",
      "src/Webspring/WindowLayer/WindowLayer.tsx",
      "src/Webspring/WindowLayer/WindowHost.tsx",
      "src/Webspring/WindowLayer/useWindowMoveResize.ts",
    ];
    const findings = paths.flatMap((path) => inspectBrowserGlobals(path, readFileSync(resolve(repositoryRoot, path), "utf8")));
    expect(findings).toEqual([]);
  }, 90_000);

  it("rejects executable globals without matching strings, comments, property names, or local records", () => {
    expect(inspectBrowserGlobals("fixture.ts", [
      'const record = { window: "window document globalThis" };',
      "function localWindow(window: { document: unknown }) { return window.document; }",
      "// window.location must not be matched in comments",
      "globalThis.window.location.assign('/');",
      'const browser = globalThis["window"];',
      'browser["document"].body.append(record.window);',
      "const { document: body } = record;",
      "document.body.append(body);",
      "const { document: browserDocument } = window;",
      "window.location.assign('/outside');",
    ].join("\n"))).toEqual([
      "fixture.ts:4:globalThis",
      "fixture.ts:5:globalThis",
      "fixture.ts:8:document",
      "fixture.ts:9:window",
      "fixture.ts:10:window",
    ]);
  });

  it("does not permit the removed ambient BrowserGlobals bridge through imports or aliases", () => {
    const root = resolve(repositoryRoot, "src/SynCloudOS");
    const imports = sourceFiles(root).flatMap((path) => {
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      const findings: string[] = [];
      const visit = (node: ts.Node) => {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          /(?:^|\/)BrowserGlobals(?:\.[^/]*)?$/u.test(node.moduleSpecifier.text)
        ) {
          findings.push(relative(repositoryRoot, path).replaceAll("\\", "/"));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      return findings;
    });
    expect(imports).toEqual([]);
  });
  it("keeps runtime settlement infrastructure independent of Webspring owner modules and role literals", () => {
    const root = resolve(repositoryRoot, "src/SynCloudOS");
    const coreDirectories = ["Runtime", "AnimationFX", "Operations"].map((directory) => resolve(root, directory));
    const imports = coreDirectories.flatMap((directory) => sourceFiles(directory).flatMap((path) => {
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      const findings: string[] = [];
      const visit = (node: ts.Node) => {
        if (
          ts.isImportDeclaration(node)
          && ts.isStringLiteral(node.moduleSpecifier)
          && /(?:^|\/)Webspring(?:\/|$)/u.test(node.moduleSpecifier.text)
        ) {
          findings.push(relative(repositoryRoot, path).replaceAll("\\", "/"));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      return findings;
    }));
    expect(imports).toEqual([]);

    const roleLiterals = [
      "applicationExit",
      "shellReturn",
      "launchCover",
      "incoming",
      "outgoing",
      "application-enter",
      "webspring-shell",
      "webspring-shell-return",
      "webspring-return",
      "webspring-launch",
      "multi-switch",
    ];
    const roleFindings = coreDirectories.flatMap((directory) => sourceFiles(directory).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return roleLiterals.filter((literal) => source.includes(`"${literal}"`)).map((literal) => (
        `${relative(repositoryRoot, path).replaceAll("\\", "/")}:${literal}`
      ));
    }));
    expect(roleFindings).toEqual([]);
  });

  it("does not expose removed presentation-report diagnostics or methods", async () => {
    const runtime = createTestRuntime();
    expect(runtime.animations).not.toHaveProperty("reportPresentationCompletion");
    expect(runtime.animations.diagnostics()).not.toHaveProperty("presentationReportCount");
    await runtime.dispose({ reason: "test", inFlight: "cancel" });
  });
  it("removes the obsolete NSE animation facade and stylesheet boundary", () => {
    const namespace = readFileSync(resolve(repositoryRoot, "src/NSE/NSE.ts"), "utf8");
    const appearance = readFileSync(resolve(repositoryRoot, "src/NSE/public/appearance.ts"), "utf8");
    const styles = readFileSync(resolve(repositoryRoot, "src/NSE/public/styles.css"), "utf8");
    expect(namespace).not.toMatch(/\bAnimationFX\b/u);
    expect(appearance).not.toMatch(/\b(?:AnimationFX|useAnimationFX)\b/u);
    expect(styles).not.toMatch(/AnimationFX|nse-fx-|--nse-animationfx-/u);
  });

  it("normalizes same-origin absolute routes against an injected origin", () => {
    expect(normalizeRoutePath("https://syncloudos.example/Portfolio/?tab=work#hero", {
      baseOrigin: "https://syncloudos.example",
    })).toMatchObject({
      pathname: "/portfolio",
      search: "?tab=work",
      hash: "#hero",
      href: "/portfolio?tab=work#hero",
      isSameOrigin: true,
      isCrossOrigin: false,
      routeableInternally: true,
      baseOrigin: "https://syncloudos.example",
    });
  });
});
