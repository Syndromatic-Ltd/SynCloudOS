/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import ts from "typescript";

function unwrap(expression) {
  return ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression) ? unwrap(expression.expression) : expression;
}
function literalValue(expression, sourceFile, seen = new Set()) {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) throw new TypeError(`Manifest identifier "${node.text}" is recursive.`);
    const declaration = sourceFile.statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : []).find(candidate => ts.isIdentifier(candidate.name) && candidate.name.text === node.text);
    if (!declaration?.initializer) throw new TypeError(`Manifest identifier "${node.text}" must resolve to a static declaration.`);
    return literalValue(declaration.initializer, sourceFile, new Set([...seen, node.text]));
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(element => {
    if (ts.isSpreadElement(element)) throw new TypeError("Manifest arrays cannot use spread expressions.");
    return literalValue(element, sourceFile, seen);
  });
  if (ts.isObjectLiteralExpression(node)) {
    const value = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || !property.name) throw new TypeError("Manifest objects must contain only plain property assignments.");
      const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name) ? property.name.text : null;
      if (!key) throw new TypeError("Manifest property names must be static.");
      Object.defineProperty(value, key, {value:literalValue(property.initializer, sourceFile, seen),enumerable:true});
    }
    return value;
  }
  throw new TypeError("Info.ts must export a static manifest literal.");
}
export function parseManifest(path) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const assignment = source.statements.find(ts.isExportAssignment);
  if (!assignment) throw new TypeError("Info.ts must use an export default manifest literal.");
  return literalValue(assignment.expression, source);
}
/** The repository CLI and installed MCP use this same static parser and schema validator. */
export function createSynWareValidator({ schema, allowedImports, dependencies = {} }) {
  const validateManifest = new Ajv2020({allErrors:true,strict:false}).compile(schema);
  const permitted = new Set(allowedImports);
  function validateImports(path) {
    const text = readFileSync(path, "utf8");
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const external = source.statements.filter(ts.isImportDeclaration).map(statement => statement.moduleSpecifier.text).filter(value => !value.startsWith("."));
    const unsupported = external.filter(value => {
      if (permitted.has(value)) return false;
      const name = value.startsWith("@") ? value.split("/").slice(0,2).join("/") : value.split("/")[0];
      return !["react","react-dom","framer-motion"].includes(name) || !dependencies[name];
    });
    if (unsupported.length) throw new TypeError(`Contents/index.tsx imports unsupported package(s): ${unsupported.join(", ")}.`);
    if (/\.\.\/.*src\//u.test(text) || /[A-Za-z]:\\/u.test(text)) throw new TypeError("Contents/index.tsx must not include source-tree or absolute local paths.");
  }
  function validateDirectory(target) {
    const manifestPath = resolve(target,"Contents/Info.ts"), entryPath = resolve(target,"Contents/index.tsx");
    const findings = [];
    for (const file of [manifestPath,entryPath,resolve(target,"Contents/Resources/Localised/Base.locale/Localisable.strings")]) {
      if (!existsSync(file)) findings.push({file,line:1,rule:"synware.structure",message:"Required SynWare file is missing."});
    }
    let manifest = null;
    if (existsSync(manifestPath)) {
      try {
        manifest = parseManifest(manifestPath);
        if (!validateManifest(manifest)) for (const error of validateManifest.errors ?? []) findings.push({file:manifestPath,line:1,rule:"synware.manifest",message:(error.instancePath || "/") + " " + error.message});
      } catch (error) { findings.push({file:manifestPath,line:1,rule:"synware.manifest",message:error.message}); }
    }
    if (existsSync(entryPath)) {
      try { validateImports(entryPath); }
      catch (error) { findings.push({file:entryPath,line:1,rule:"synware.imports",message:error.message}); }
    }
    return {directory:target,id:manifest?.id ?? null,ok:findings.length === 0,error:findings.map(finding => finding.message).join("; ") || null,findings};
  }
  return {validateDirectory,validateImports};
}
