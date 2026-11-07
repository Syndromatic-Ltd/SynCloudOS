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

import { existsSync, realpathSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { auditSynWareFXCapabilities } from "./audit-capability-usage.mjs";
import { parse as parseCss, walk as walkCss } from "css-tree";
import { synWareSdkEntries, synWareSdkGeneratedStyles, synWareSdkStyles, synWarePackageName } from "./sdk-entries.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const synWareRoot = resolve(repositoryRoot, "src/SynWare");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".css"]);
const legacyManifestKeys = new Set([
  ["spring", "board"].join(""),
  "window",
  "requiredServices",
  "optionalServices",
  "notifications",
  "seo",
  "policy",
  "bundleId",
  "id",
  "title",
  "shortName",
  "description",
  "route",
  "presentation",
  "type",
  "name",
  "devOnly",
  "about",
]);

function normalise(path) {
  return path.replaceAll("\\", "/");
}

const assetExtensions = new Set([
  ".avif",
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".json",
  ".less",
  ".mp3",
  ".mp4",
  ".otf",
  ".png",
  ".sass",
  ".scss",
  ".svg",
  ".ttf",
  ".txt",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

function canonicalPath(path) {
  const resolved = resolve(path);
  let ancestor = resolved;
  const suffix = [];
  while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) { suffix.unshift(basename(ancestor)); ancestor = dirname(ancestor); }
  const physical = existsSync(ancestor) ? resolve(realpathSync.native(ancestor), ...suffix) : resolved;
  return normalise(physical).toLowerCase();
}

function isWithin(root, path) {
  const canonicalRoot = canonicalPath(root);
  const canonicalTarget = canonicalPath(path);
  return canonicalTarget === canonicalRoot || canonicalTarget.startsWith(`${canonicalRoot}/`);
}

function relativeSource(root, path) {
  return normalise(relative(root, path));
}

function walk(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function importReferences(source, sourcePath) {
  const references = [];
  if (sourcePath.endsWith(".css")) {
    walkCss(parseCss(source, { positions: true }), function (node) {
      if (node.type === "Url" || (node.type === "String" && this.atrule?.name === "import")) {
        references.push({ kind: "static", specifier: node.value, expression: node.value,
          line: node.loc?.start.line ?? 1, column: node.loc?.start.column ?? 1 });
      }
    });
    return references;
  }
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
  const add = (expression, kind, node = expression) => {
    if (!expression || !ts.isStringLiteralLike(expression)) return;
    references.push({
      kind,
      specifier: expression.text,
      expression: expression.getText(file),
      line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      column: file.getLineAndCharacterOfPosition(node.getStart(file)).character + 1,
    });
  };
  const visit = (node) => {
    // A loader extracted into a value can hide a later computed call. Keep these
    // APIs directly callable so their arguments remain inside this audit boundary.
    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      ts.isMetaProperty(node.expression) && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
      const name = ts.isPropertyAccessExpression(node) ? node.name.text :
        node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : null;
      if (name === null || ["glob", "globEager", "resolve"].includes(name)) {
        const position = file.getLineAndCharacterOfPosition(node.getStart(file));
        references.push({ kind: "loader-reference", specifier: node.getText(file), expression: node.getText(file),
          literal: false, line: position.line + 1, column: position.character + 1 });
      }
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier, "static");
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal, "static");
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, "static");
    }
    const callee = ts.isCallExpression(node) ? node.expression : null;
    const memberCall = callee && (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee));
    const member = memberCall ? ts.isPropertyAccessExpression(callee) ? callee.name.text :
      callee.argumentExpression && ts.isStringLiteralLike(callee.argumentExpression) ? callee.argumentExpression.text : null : null;
    const isRequire = callee && (ts.isIdentifier(callee) && callee.text === "require" ||
      memberCall && ts.isIdentifier(callee.expression) && callee.expression.text === "require");
    const metaCall = memberCall && ts.isMetaProperty(callee.expression);
    const isGlob = metaCall && (member === "glob" || member === "globEager" || member === null);
    const isResolve = metaCall && member === "resolve";
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || isRequire || isGlob || isResolve)) {
      const expression = node.arguments[0];
      const isLiteral = Boolean(expression && ts.isStringLiteralLike(expression) && !(metaCall && member === null));
      const position = expression ?? node;
      const location = file.getLineAndCharacterOfPosition(position.getStart(file));
      references.push({
        kind: isGlob && member !== null ? "glob" : "dynamic",
        specifier: isLiteral ? expression.text : expression ? expression.getText(file) : null,
        expression: expression?.getText(file) ?? "",
        line: location.line + 1,
        column: location.character + 1,
        literal: isLiteral,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return references;
}

function appRootFor(context, path) {
  if (!isWithin(context.synWareRoot, path)) return null;
  const parts = normalise(relative(context.synWareRoot, path)).split("/");
  const appPart = parts.find((part) => part.endsWith(".app"));
  return appPart ? resolve(context.synWareRoot, appPart) : null;
}

function createAuditContext(root) {
  const configuredSynWarePath = resolve(root, "tsconfig.synware.json");
  const configPath = existsSync(configuredSynWarePath)
    ? configuredSynWarePath
    : ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  const config = configPath
    ? ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, resolve(root), undefined, configPath)
    : { options: {} };
  return {
    repositoryRoot: resolve(root),
    synWareRoot: resolve(root, "src/SynWare"),
    synCloudOSRoot: resolve(root, "src/SynCloudOS"),
    nseRoot: resolve(root, "src/NSE"),
    webspringRoot: resolve(root, "src/Webspring"),
    compilerOptions: config.options,
  };
}

function resolveImport(context, sourcePath, specifier) {
  const result = ts.resolveModuleName(specifier, sourcePath, context.compilerOptions, ts.sys);
  return result.resolvedModule?.resolvedFileName ?? null;
}

function isExactOnDiskPath(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) return false;
  const physical = realpathSync.native(resolved);
  return normalise(resolved) === normalise(physical);
}

function configuredAliasPrefixes(compilerOptions) {
  const paths = compilerOptions?.paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) return [];
  return Object.keys(paths)
    .map((alias) => alias.replace(/\/\*$/u, ""))
    .filter((alias) => alias.length > 0);
}

function isConfiguredAlias(compilerOptions, specifier) {
  const aliases = configuredAliasPrefixes(compilerOptions);
  const loweredSpecifier = specifier.toLowerCase();
  return aliases.some((alias) => {
    const loweredAlias = alias.toLowerCase();
    return loweredSpecifier === loweredAlias || loweredSpecifier.startsWith(`${loweredAlias}/`);
  });
}

function isInternalLookingSpecifier(context, specifier) {
  if (!specifier) return false;
  if (specifier.startsWith(".") || specifier.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(specifier)) return true;
  if (isConfiguredAlias(context.compilerOptions, specifier)) return true;
  if (specifier.startsWith("@/") || specifier.startsWith("~/") || specifier.startsWith("#")) return true;

  const baseUrl = context.compilerOptions?.baseUrl;
  if (typeof baseUrl === "string" && specifier.includes("/")) {
    const firstSegment = specifier.split("/")[0];
    if (firstSegment && existsSync(resolve(baseUrl, firstSegment))) return true;
  }
  if (specifier.includes("/")) {
    const firstSegment = specifier.split("/")[0];
    if (firstSegment && existsSync(resolve(context.repositoryRoot, "src", firstSegment))) return true;
    if (/^@(app|internal|nse|runtime|src|syncal|syncloudos|webspring)(?:\/|$)/iu.test(specifier)) return true;
  }
  return false;
}

function isAssetSpecifier(specifier) {
  if (typeof specifier !== "string") return false;
  const pathname = specifier.split(/[?#]/u, 1)[0];
  return assetExtensions.has(extname(pathname).toLowerCase());
}

function importViolation(context, sourcePath, reference, reason) {
  const file = relativeSource(context.repositoryRoot, sourcePath);
  return {
    file,
    location: `${file}:${reference.line}:${reference.column}`,
    line: reference.line,
    column: reference.column,
    specifier: reference.specifier,
    expression: reference.expression,
    reason,
  };
}

function auditImports(context, files) {
  const violations = [];
  for (const sourcePath of files) {
    const source = readFileSync(sourcePath, "utf8");
    const sourceAppRoot = appRootFor(context, sourcePath);
    const sourceIsHostIntegration = relativeSource(context.repositoryRoot, sourcePath) === "src/SynWare/hostContributions.ts";
    for (const reference of importReferences(source, sourcePath)) {
      if (reference.kind === "loader-reference") {
        violations.push(importViolation(context, sourcePath, reference, "Module loaders must be called directly with audited literal specifiers"));
        continue;
      }
      if (reference.kind === "glob") {
        const globTarget = reference.literal && reference.specifier.startsWith("./") && !reference.specifier.includes("..")
          ? resolve(sourcePath, "..", reference.specifier.split(/[?*{[]/u)[0]) : null;
        if (!globTarget || !isWithin(sourceAppRoot ?? context.synWareRoot, globTarget)) {
          violations.push(importViolation(context, sourcePath, reference, "Glob imports must target literal app-owned resources"));
        }
        continue;
      }
      if (reference.kind === "dynamic" && !reference.literal) {
        violations.push(importViolation(
          context,
          sourcePath,
          reference,
          "non-literal dynamic import() must use a literal module specifier",
        ));
        continue;
      }

      if (reference.specifier === synWarePackageName || reference.specifier.startsWith(synWarePackageName + "/")) {
        const entry = reference.specifier === synWarePackageName ? "index" : reference.specifier.slice(synWarePackageName.length + 1);
        if (entry === "sdk/testing" || entry === "index" && reference.specifier !== synWarePackageName || (entry !== "nse/styles.css" && !Object.hasOwn(synWareSdkEntries, entry) && !Object.hasOwn(synWareSdkStyles, entry) && !Object.hasOwn(synWareSdkGeneratedStyles, entry))) {
          violations.push(importViolation(context, sourcePath, reference, "Unsupported production SynWare SDK entry point"));
          continue;
        }
      }
      if (reference.specifier.startsWith("/src/") || reference.specifier.startsWith("/@fs/") || /^[A-Za-z]:[\\/]/u.test(reference.specifier)) {
        violations.push(importViolation(context, sourcePath, reference, "Absolute source imports are forbidden in SynWare"));
        continue;
      }
      const target = resolveImport(context, sourcePath, reference.specifier);
      if (!target) {
        if (reference.specifier === `${synWarePackageName}/nse/styles.css` || Object.hasOwn(synWareSdkStyles, reference.specifier.slice(synWarePackageName.length + 1)) || Object.hasOwn(synWareSdkGeneratedStyles, reference.specifier.slice(synWarePackageName.length + 1))) continue;
        // The root and explicit theme styles are public package assets.
        const relativeTarget = reference.specifier.startsWith(".")
          ? resolve(sourcePath, "..", reference.specifier.split(/[?#]/u)[0]) : null;
        const relativeAppRoot = relativeTarget ? appRootFor(context, relativeTarget) : null;
        if (sourceAppRoot && relativeAppRoot && canonicalPath(sourceAppRoot) !== canonicalPath(relativeAppRoot)) {
          violations.push(importViolation(context, sourcePath, reference, "private cross-SynWare Contents import"));
          continue;
        }
        if (!sourceIsHostIntegration && relativeTarget && !isWithin(context.synWareRoot, relativeTarget)) {
          violations.push(importViolation(context, sourcePath, reference,
            "Platform source import is forbidden; use a public SynWare SDK entry point"));
          continue;
        }
        if (isInternalLookingSpecifier(context, reference.specifier) && !isAssetSpecifier(reference.specifier)) {
          violations.push(importViolation(
            context,
            sourcePath,
            reference,
            "unresolved internal-looking module specifier; resolve it or use a documented external package",
          ));
        }
        continue;
      }
      const targetAppRoot = appRootFor(context, target);
      if (sourceAppRoot && targetAppRoot && canonicalPath(sourceAppRoot) !== canonicalPath(targetAppRoot)) {
        violations.push(importViolation(context, sourcePath, reference, "private cross-SynWare Contents import"));
        continue;
      }
      const publicEntry = Object.entries(synWareSdkEntries).find(([entry, source]) =>
        reference.specifier === (entry === "index" ? synWarePackageName : synWarePackageName + "/" + entry) &&
        canonicalPath(target) === canonicalPath(resolve(context.repositoryRoot, source)));
      if (publicEntry && publicEntry[0] !== "sdk/testing") continue;
      if (!sourceIsHostIntegration && !isWithin(context.synWareRoot, target) && !normalise(target).includes("/node_modules/")) {
        violations.push(importViolation(context, sourcePath, reference,
          "Platform source import is forbidden; use a public SynWare SDK entry point"));
      }

    }
  }
  return violations;
}

function propertyName(property) {
  const name = property.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
  return null;
}

function manifestPropertyNames(source, sourcePath) {
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
  const manifests = [];
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const names = node.properties.map(propertyName).filter((name) => name !== null);
      if (names.includes("schemaVersion") || names.includes("bundleIdentifier")) manifests.push(new Set(names));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return manifests;
}

function auditManifests(context, files) {
  const legacy = [];
  const undeclaredCapabilities = [];
  for (const path of files.filter((file) => normalise(file).endsWith("/Info.ts"))) {
    const source = readFileSync(path, "utf8");
    const file = relativeSource(context.repositoryRoot, path);
    for (const properties of manifestPropertyNames(source, path)) {
      for (const key of legacyManifestKeys) {
        if (properties.has(key)) legacy.push({ file, key, reason: "legacy manifest key" });
      }
    }
    if (/\bservices\s*:\s*\[\s*\]/u.test(source)) undeclaredCapabilities.push({ file, reason: "services must declare requested capabilities" });
  }
  return { legacy, undeclaredCapabilities };
}

/** First-party visual entries cannot be callable null placeholders. Headless
 * SDK test definitions remain valid; this guard covers only project entries. */
function auditFabricatedRoots(context, files) {
  const fabricatedRoots = [];
  const isEntry = (path) => /\/Contents\/index\.tsx?$/iu.test(normalise(path));
  const isNullExpression = (node) => node?.kind === ts.SyntaxKind.NullKeyword;
  const returnsOnlyNull = (node) => {
    if (ts.isArrowFunction(node) && isNullExpression(node.body)) return true;
    if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node) && !ts.isFunctionDeclaration(node)) return false;
    if (!ts.isBlock(node.body) || node.body.statements.length !== 1) return false;
    const [statement] = node.body.statements;
    return Boolean(statement && ts.isReturnStatement(statement) && isNullExpression(statement.expression));
  };

  for (const path of files.filter(isEntry)) {
    const source = readFileSync(path, "utf8");
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const roots = new Map();
    const rememberFunctions = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name) roots.set(node.name.text, node);
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        roots.set(node.name.text, node.initializer);
      }
      ts.forEachChild(node, rememberFunctions);
    };
    rememberFunctions(file);
    const rootIsFabricated = (node, seen = new Set()) => {
      if (returnsOnlyNull(node)) return true;
      if (!ts.isIdentifier(node) || seen.has(node.text)) return false;
      seen.add(node.text);
      const resolved = roots.get(node.text);
      return resolved ? rootIsFabricated(resolved, seen) : false;
    };
    for (const node of file.statements) {
      const root = ts.isExportAssignment(node) && !node.isExportEquals ? node.expression
        : ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? node : null;
      if (root && rootIsFabricated(root)) {
        const position = file.getLineAndCharacterOfPosition(root.getStart(file));
        fabricatedRoots.push({
          file: relativeSource(context.repositoryRoot, path),
          location: `${relativeSource(context.repositoryRoot, path)}:${position.line + 1}:${position.character + 1}`,
          line: position.line + 1,
          column: position.character + 1,
          reason: "first-party application entry has a fabricated null root",
        });
      }
    }
  }
  return fabricatedRoots;
}

export const synWareSourceExtensions = Object.freeze([...sourceExtensions]);

export function createSynWareAuditContext(root = repositoryRoot) {
  return createAuditContext(root);
}

export function walkSynWareSourceFiles(root) {
  return walk(resolve(root)).sort((left, right) => normalise(left).localeCompare(normalise(right)));
}

export function collectSynWareImportReferences(source, sourcePath) {
  return importReferences(source, sourcePath);
}

export function resolveSynWareImport(context, sourcePath, specifier) {
  return resolveImport(context, sourcePath, specifier);
}

export function relativeSynWareSource(root, path) {
  return relativeSource(root, path);
}

export function canonicalSynWarePath(path) {
  return canonicalPath(path);
}

export function isSynWarePathWithin(root, path) {
  return isWithin(root, path);
}

export function synWareAppRootFor(context, path) {
  return appRootFor(context, path);
}

export function isSynWareAssetSpecifier(specifier) {
  return isAssetSpecifier(specifier);
}

export function auditSynWareImports(root = repositoryRoot) {
  const context = createAuditContext(root);
  const sourceRoot = context.synWareRoot;
  const files = walk(sourceRoot);
  const manifests = auditManifests(context, files);
  return Object.freeze({
    internalImports: Object.freeze(auditImports(context, files)),
    legacyManifestKeys: Object.freeze(manifests.legacy),
    undeclaredCapabilities: Object.freeze([...manifests.undeclaredCapabilities, ...auditSynWareFXCapabilities(root).fxViolations]),
    fabricatedRoots: Object.freeze(auditFabricatedRoots(context, files)),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  // The project whose src/SynWare is audited: the one named, or this repository.
  const projectRoot = resolve(process.argv[2] ?? repositoryRoot);
  if (!existsSync(resolve(projectRoot, "src/SynWare"))) {
    process.stderr.write(`usage: audit-sdk-imports.mjs [project]\nNo src/SynWare in ${projectRoot}; name the project whose SynWare to audit.\n`);
    process.exit(2);
  }
  const audit = auditSynWareImports(projectRoot);
  const violations = [
    ...audit.internalImports,
    ...audit.legacyManifestKeys,
    ...audit.undeclaredCapabilities,
    ...audit.fabricatedRoots,
  ];
  if (violations.length > 0) {
    process.stderr.write(`${JSON.stringify(audit, null, 2)}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("SynWare SDK boundary audit passed: zero violations.\n");
  }
}
