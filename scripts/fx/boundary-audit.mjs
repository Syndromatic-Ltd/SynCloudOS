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

import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";

export const retiredFxSymbols = Object.freeze([
  "NSEBezierPath", "NSEGraphicsContext", "NSEGradient", "NSEColour",
  "NSEAnimation", "NSEAnimationContext", "NSEViewAnimation",
  "NSEHaptics", "AppSoundClient", "AppSoundHandle", "useSynWareSound",
  "NSEImageResource", "AppImageResource", "NSETextContainer", "NSETypesetter",
]);
const retired = new Set(retiredFxSymbols);
const oldRoute = /(?:\/nse\/animation$|(?:^|\/)NSE\/(?:Graphics\/(?:NSEBezierPath|NSEGraphicsContext|NSEGradient|graphicsTypes|displayListAuthority)(?:\.|$)|Haptics(?:\/|$))|(?:^|\/)Sound(?:\/|$))/u;

/** Parse executable syntax, excluding comments and durable historical evidence. */
export function inspectFxBoundary(file, source) {
  if (!/^(?:src|scripts)\//u.test(file.replaceAll("\\", "/"))) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];
  const report = (node, message) => {
    const { line, character } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    findings.push({ file, line: line + 1, column: character + 1, message });
  };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (oldRoute.test(node.moduleSpecifier.text)) report(node, `Retired FX route: ${node.moduleSpecifier.text}`);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg) && oldRoute.test(arg.text)) report(node, `Retired FX route: ${arg.text}`);
    }
    if ((ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && (retired.has(node.name.text) || (node.propertyName && retired.has(node.propertyName.text)))) {
      report(node, `Retired FX symbol: ${node.propertyName?.text ?? node.name.text}`);
    }
    if ((ts.isVariableDeclaration(node) || ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name && ts.isIdentifier(node.name) && retired.has(node.name.text)) {
      report(node, `Retired FX declaration: ${node.name.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return findings;
}

export function auditFxTree(root) {
  const findings = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) findings.push(...inspectFxBoundary(relative(root, path), readFileSync(path, "utf8")));
    }
  };
  walk(resolve(root, "src"));
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const findings = auditFxTree(process.cwd());
  for (const finding of findings) console.log(`${finding.file}:${finding.line}:${finding.column}: ${finding.message}`);
  console.log(`${findings.length} remaining executable cutover findings.`);
  process.exitCode = findings.length ? 1 : 0;
}
