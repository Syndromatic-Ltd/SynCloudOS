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

import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { synWareSdkEntries } from "./sdk-entries.mjs";

// Internal build policy, never a portable SDK entry or runtime dependency.
const hostEntries = new Set(["browser", "sdk/animation-host"]);
const privateHostNames = new Set([
  "SourceListFrameProvider", "SourceListFrameContextValue", "useSourceListFrame",
  "NSEWindowSurfaceRequest", "NSEWindowSurfaceDismissResult", "NSEWindowSurfaceErrorContext",
  "useOptionalNSEWindowSurfaceBridge", "WindowManager", "WindowController", "NSEWindowController",
  "nseRegistry",
]);
const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function forbiddenName(name, entry) {
  if (/^(?:NSEEditor|SynCloudOSNSEEditor|useNSEEditor|createNSEEditor|nseEditor)/u.test(name)) return "retired-editor";
  if (name.includes("Specimen") || name === "nseControlVariantCount") return "fixture";
  if (/^(?:PortfolioCollection|portfolioCollections)/u.test(name)) return "product";
  if (!hostEntries.has(entry) && (privateHostNames.has(name)
    || /^(?:NSEWindowSurfaceBridge|SynWareProvider|SynWareRuntimeMount|SystemAlert|NSESystemAlert)/u.test(name))) return "host";
  return undefined;
}

function aliasChain(symbol, checker) {
  const chain = [];
  const seen = new Set();
  const pending = [symbol];
  while (pending.length) {
    symbol = pending.pop();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    chain.push(symbol);
    if (symbol.flags & ts.SymbolFlags.Alias) {
      pending.push(checker.getImmediateAliasedSymbol(symbol) ?? checker.getAliasedSymbol(symbol));
      continue;
    }
    // Follow declaration identities only. Compound types, object members and
    // computed expressions remain ordinary component contracts, not alias edges.
    for (const declaration of symbol.declarations ?? []) {
      let reference;
      if (ts.isTypeAliasDeclaration(declaration)) {
        let type = declaration.type;
        while (ts.isParenthesizedTypeNode(type)) type = type.type;
        if (ts.isTypeReferenceNode(type)) reference = type.typeName;
        else if (ts.isTypeQueryNode(type)) reference = type.exprName;
      } else if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        let initializer = declaration.initializer;
        while (ts.isParenthesizedExpression(initializer)) initializer = initializer.expression;
        if (ts.isIdentifier(initializer) || ts.isPropertyAccessExpression(initializer)) reference = initializer;
      }
      if (reference) pending.push(checker.getSymbolAtLocation(reference));
    }
  }
  return chain;
}

/** Inspect exported values, types and module namespaces, not arbitrary object/type members. */
export function inspectPublicApiBoundaries({ program, repositoryRoot, entries = synWareSdkEntries }) {
  const checker = program.getTypeChecker();
  const violations = [];
  const sourcePath = (declaration) => relative(repositoryRoot, declaration.getSourceFile().fileName).replaceAll("\\", "/");
  // Follow public data/callback types as well as aliases. A renamed wrapper can
  // otherwise leak a backend through nested props, parameters or return values.
  function backendDeclaration(type, seen = new Set()) {
    if (!type || seen.has(type)) return undefined;
    seen.add(type);
    const symbols = [type.symbol, type.aliasSymbol].filter(Boolean);
    for (const symbol of symbols) {
      const declaration = symbol.declarations?.find(declaration => /(?:^|\/)node_modules\/(?:@tiptap|prosemirror[^/]*)\//u.test(declaration.getSourceFile().fileName.replaceAll("\\", "/")));
      if (declaration) return declaration;
    }
    if (symbols.some(symbol => symbol.declarations?.some(declaration => /(?:\/typescript\/lib\/lib\.|\/@types\/react(?:-dom)?\/)/u.test(declaration.getSourceFile().fileName.replaceAll("\\", "/"))))) return undefined;
    const children = [...(type.types ?? []), ...(type.aliasTypeArguments ?? [])];
    if (type.flags & ts.TypeFlags.Object && type.objectFlags & ts.ObjectFlags.Reference) children.push(...checker.getTypeArguments(type));
    for (const signature of [...type.getCallSignatures(), ...type.getConstructSignatures()]) {
      children.push(checker.getReturnTypeOfSignature(signature));
      for (const parameter of signature.getParameters()) if (parameter.valueDeclaration ?? parameter.declarations?.[0]) children.push(checker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration ?? parameter.declarations[0]));
    }
    for (const property of checker.getPropertiesOfType(type)) {
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (!declaration || property.name.startsWith("#") || declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword)) continue;
      children.push(checker.getTypeOfSymbolAtLocation(property, declaration));
    }
    for (const child of children) { const found = backendDeclaration(child, seen); if (found) return found; }
    return undefined;
  }

  for (const [entry, path] of Object.entries(entries)) {
    const source = program.getSourceFile(resolve(repositoryRoot, path));
    const root = source && checker.getSymbolAtLocation(source);
    const report = (exportName, symbolName, reason, declaration) => violations.push({
      entry, exportName, symbolName, reason, source: declaration ? sourcePath(declaration) : path,
    });
    if (!root) {
      report("*", "<missing public module>", "unresolved");
      continue;
    }

    // An unresolved export-star would otherwise disappear from the symbol list.
    const checkedModules = new Set();
    function checkExportResolution(module) {
      if (checkedModules.has(module)) return;
      checkedModules.add(module);
      for (const declaration of module.declarations ?? []) {
        const statements = ts.isSourceFile(declaration) ? declaration.statements
          : ts.isModuleDeclaration(declaration) && declaration.body && ts.isModuleBlock(declaration.body)
            ? declaration.body.statements : [];
        for (const statement of statements) {
          if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
          const target = checker.getSymbolAtLocation(statement.moduleSpecifier);
          if (!target) report("*", statement.moduleSpecifier.getText(), "unresolved", statement);
          else checkExportResolution(aliasChain(target, checker).at(-1));
        }
      }
    }
    checkExportResolution(root);

    function inspect(symbol, exportName, activeModules) {
      const chain = aliasChain(symbol, checker);
      const target = chain.at(-1);
      const declaration = target.valueDeclaration ?? target.declarations?.[0];
      if (declaration && !(target.flags & ts.SymbolFlags.Module)) {
        const type = target.flags & ts.SymbolFlags.Type ? checker.getDeclaredTypeOfSymbol(target) : checker.getTypeOfSymbolAtLocation(target, declaration);
        const backend = backendDeclaration(type);
        if (backend) { report(exportName, backend.name?.getText() ?? "<backend type>", "backend", backend); return; }
      }
      for (const owner of chain) {
        // Named default declarations retain their identity even if the export is "default".
        // A source-file module symbol is named by its path, not by a public API identifier.
        const declarations = owner.declarations ?? [];
        const names = [...(declarations.some(ts.isSourceFile) ? [] : [owner.name]), ...declarations.flatMap((declaration) =>
          declaration.name && ts.isIdentifier(declaration.name) ? [declaration.name.text] : [])];
        for (const name of names) {
          const reason = forbiddenName(name, entry);
          if (reason) {
            report(exportName, name, reason, owner.declarations?.[0]);
            return;
          }
        }
      }
      if (entry !== "sdk/testing") {
        const testingOwner = chain.flatMap((owner) => owner.declarations ?? []).find((declaration) =>
          sourcePath(declaration).startsWith("src/SynCloudOS/AppSDK/testing/"));
        if (testingOwner) {
          report(exportName, target.name, "testing", testingOwner);
          return;
        }
      }
      // Compiler intrinsics such as undefined have no source declaration.
      // A missing import/export alias target is still an unresolved API edge.
      if (!symbol.declarations?.length || chain.some((owner) =>
        owner.flags & ts.SymbolFlags.Alias && !checker.getAliasedSymbol(owner).declarations?.length)) {
        report(exportName, symbol.name, "unresolved", symbol.declarations?.[0]);
        return;
      }
      for (const module of chain.filter((owner) => owner.flags & ts.SymbolFlags.Module)) {
        if (activeModules.has(module)) continue;
        const next = new Set(activeModules).add(module);
        for (const child of checker.getExportsOfModule(module)) inspect(child, `${exportName}.${child.name}`, next);
      }
    }
    for (const symbol of checker.getExportsOfModule(root)) inspect(symbol, symbol.name, new Set([root]));
  }
  return violations.sort((left, right) => `${left.entry}:${left.exportName}:${left.reason}`.localeCompare(`${right.entry}:${right.exportName}:${right.reason}`));
}

/** Reject before fingerprinting, declaration emission, bundling or output cleanup. */
export function assertPublicApiBoundaries(repositoryRoot = defaultRepositoryRoot) {
  const configPath = resolve(repositoryRoot, "tsconfig.sdk.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = config.error ? undefined : ts.parseJsonConfigFileContent(config.config, ts.sys, repositoryRoot, undefined, configPath);
  const errors = config.error ? [config.error] : parsed.errors;
  if (errors.length) throw new TypeError(`Cannot inspect SDK public API boundaries:\n${errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n")}`);
  const program = ts.createProgram({
    rootNames: [...new Set([...parsed.fileNames, ...Object.values(synWareSdkEntries).map((path) => resolve(repositoryRoot, path))])],
    options: { ...parsed.options, noEmit: true, emitDeclarationOnly: false, incremental: false },
  });
  const violations = inspectPublicApiBoundaries({ program, repositoryRoot });
  if (violations.length) {
    throw new TypeError(`SDK public API boundary violations:\n${violations.map(({ entry, exportName, symbolName, reason, source }) =>
      `- ${entry}: ${exportName} exposes ${symbolName} (${reason}; ${source})`).join("\n")}`);
  }
}
