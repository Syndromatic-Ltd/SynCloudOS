#!/usr/bin/env node
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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import ts from "typescript";
import { synWarePackageName, synWareSdkEntries, synWareSdkGeneratedStyles, synWareSdkStyles } from "./sdk-entries.mjs";
import { auditSynWareImports } from "./audit-sdk-imports.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const governedSynWareRoot = resolve(repositoryRoot, "src/SynWare");
const schema = JSON.parse(readFileSync(resolve(repositoryRoot, "src/SynCloudOS/AppSDK/manifest/synapp-manifest.schema.json"), "utf8"));
const validateManifest = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

function unwrap(expression) {
  return ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression)
    ? unwrap(expression.expression)
    : expression;
}

function literalValue(expression, sourceFile, seen = new Set()) {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) throw new TypeError(`Manifest identifier "${node.text}" is recursive.`);
    const declaration = sourceFile.statements
      .flatMap((statement) => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
      .find((candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === node.text);
    if (!declaration?.initializer) throw new TypeError(`Manifest identifier "${node.text}" must resolve to a static declaration.`);
    const nextSeen = new Set(seen);
    nextSeen.add(node.text);
    return literalValue(declaration.initializer, sourceFile, nextSeen);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => {
    if (ts.isSpreadElement(element)) throw new TypeError("Manifest arrays cannot use spread expressions.");
    return literalValue(element, sourceFile, seen);
  });
  if (ts.isObjectLiteralExpression(node)) {
    const value = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || !property.name) throw new TypeError("Manifest objects must contain only plain property assignments.");
      const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)
        ? property.name.text
        : null;
      if (!key) throw new TypeError("Manifest property names must be static.");
      value[key] = literalValue(property.initializer, sourceFile, seen);
    }
    return value;
  }
  throw new TypeError("Info.ts must export a static manifest literal.");
}

export function parseManifest(path) {
  const sourceText = readFileSync(path, "utf8");
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const assignment = source.statements.find(ts.isExportAssignment);
  if (!assignment) throw new TypeError("Info.ts must use an export default manifest literal.");
  return literalValue(assignment.expression, source);
}

export function validateImports(path) {
  const sourceText = readFileSync(path, "utf8");
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = source.statements.filter(ts.isImportDeclaration).map((statement) => statement.moduleSpecifier.text);
  const externalImports = imports.filter((specifier) => !specifier.startsWith("."));
  const repositoryPackage = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  const reviewedApplicationDependencies = new Set(["react", "react-dom", "framer-motion"]);
  const packageRoot = (specifier) => specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/", 1)[0];
  const permitted = new Set([
    "react",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    ...Object.keys(synWareSdkEntries).filter((entry) => entry !== "sdk/testing").map((entry) => `${synWarePackageName}/${entry}`),
    `${synWarePackageName}/nse/styles.css`,
    ...Object.keys(synWareSdkStyles).map((entry) => `${synWarePackageName}/${entry}`),
    ...Object.keys(synWareSdkGeneratedStyles).map((entry) => `${synWarePackageName}/${entry}`),
  ]);
  const unsupported = externalImports.filter((specifier) => {
    if (permitted.has(specifier)) return false;
    const dependency = packageRoot(specifier);
    return !reviewedApplicationDependencies.has(dependency) || !repositoryPackage.dependencies?.[dependency];
  });
  if (unsupported.length > 0) throw new TypeError(`Contents/index.tsx imports unsupported package(s): ${unsupported.join(", ")}.`);
  if (/\.\.\/.*src\//u.test(sourceText) || /[A-Za-z]:\\/u.test(sourceText)) {
    throw new TypeError("Contents/index.tsx must not include source-tree or absolute local paths.");
  }
}

export function validateSynWareDirectory(targetArgument, boundaryAudit) {
  const target = resolve(targetArgument);
  const manifestPath = resolve(target, "Contents/Info.ts");
  const entryPath = resolve(target, "Contents/index.tsx");
  const localePath = resolve(target, "Contents/Resources/Localised/Base.locale/Localisable.strings");
  if (![manifestPath, entryPath, localePath].every(existsSync)) {
    return {
      directory: target,
      id: null,
      ok: false,
      error: "A SynWare requires Contents/Info.ts, Contents/index.tsx, and a Base locale bundle.",
    };
  }
  try {
    const manifest = parseManifest(manifestPath);
    if (!validateManifest(manifest)) {
      const errors = validateManifest.errors?.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ") ?? "unknown schema failure";
      throw new TypeError(`Manifest does not satisfy the checked-in V1 schema: ${errors}`);
    }
    validateImports(entryPath);
    if (target.startsWith(governedSynWareRoot + "/") || target.startsWith(governedSynWareRoot + "\\")) {
      const prefix = target.replaceAll("\\", "/") + "/";
      const violations = (boundaryAudit ?? auditSynWareImports(repositoryRoot)).internalImports.filter((violation) =>
        resolve(repositoryRoot, violation.file).replaceAll("\\", "/").startsWith(prefix));
      if (violations.length) throw new TypeError(violations.map((violation) => `${violation.location}: ${violation.reason}`).join("\n"));
    }
    return { directory: target, id: manifest.id, ok: true, error: null };
  } catch (error) {
    return {
      directory: target,
      id: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function discoverSynWareDirectories(root = governedSynWareRoot) {
  const resolvedRoot = resolve(root);
  if (!existsSync(resolvedRoot)) return [];
  return readdirSync(resolvedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
    .map((entry) => resolve(resolvedRoot, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function resultSortKey(result) {
  return result.id ?? basename(result.directory);
}

export function validateSynWareDirectories(root = governedSynWareRoot) {
  const boundaryAudit = resolve(root) === governedSynWareRoot ? auditSynWareImports(repositoryRoot) : undefined;
  const results = discoverSynWareDirectories(root)
    .map((directory) => validateSynWareDirectory(directory, boundaryAudit))
    .sort((left, right) => resultSortKey(left).localeCompare(resultSortKey(right)));
  const valid = results.filter((result) => result.ok).length;
  const invalid = results.length - valid;
  return { root: resolve(root), results, valid, invalid, ok: invalid === 0 };
}

function writeResult(result, stdout, stderr, aggregate) {
  if (result.ok) {
    stdout.write(`validated ${result.id}\n`);
    return;
  }
  const prefix = aggregate ? `invalid ${basename(result.directory)}: ` : "";
  stderr.write(`${prefix}${result.error}\n`);
}

export function main(arguments_ = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const [targetArgument] = arguments_;
  if (targetArgument) {
    const result = validateSynWareDirectory(targetArgument);
    writeResult(result, stdout, stderr, false);
    return result.ok ? 0 : 1;
  }

  if (!existsSync(governedSynWareRoot)) {
    stderr.write("usage: validate-synware.mjs <SynWare app or directory of apps>\nThis repository has no src/SynWare of its own to validate.\n");
    return 2;
  }
  const aggregate = validateSynWareDirectories();
  for (const result of aggregate.results) writeResult(result, stdout, stderr, true);
  stdout.write(`summary: ${aggregate.valid} valid, ${aggregate.invalid} invalid\n`);
  return aggregate.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
