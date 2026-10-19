/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";
import { errorCatalogue } from "../../src/SynCloudOS/ErrorManager/errorCatalogue";

const root = resolve(import.meta.dirname, "../..");
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}
function diagnosticCodes(source: string, path: string): Set<string> {
  const codes = new Set<string>();
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const literalCodes = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) && /^[A-Z][A-Z0-9_]+$/u.test(node.text)) codes.add(node.text);
    else if (ts.isConditionalExpression(node)) {
      literalCodes(node.whenTrue);
      literalCodes(node.whenFalse);
    } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) literalCodes(node.expression);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === "code") literalCodes(node.initializer);
    // Lifecycle codes can also be constants passed into a shared guard.
    if (ts.isStringLiteralLike(node) && /^[A-Z][A-Z0-9_]*_DISPOSED$/u.test(node.text)) codes.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return codes;
}

it("catalogues every stable diagnostic code literal throughout src, including conditional branches", () => {
  const known = new Set(errorCatalogue.map(entry => entry.code));
  expect(known.size).toBe(errorCatalogue.length);
  for (const path of sourceFiles(resolve(root, "src"))) {
    if (path.endsWith("errorCatalogue.ts")) continue;
    for (const code of diagnosticCodes(readFileSync(path, "utf8"), path)) expect(known.has(code), `${path}: ${code}`).toBe(true);
  }
  expect(Object.isFrozen(errorCatalogue)).toBe(true);
  expect(errorCatalogue.every(Object.isFrozen)).toBe(true);
});

it("keeps the documented code table exactly matched to the offline catalogue", () => {
  const documentation = readFileSync(resolve(root, "docs/framework/errors.md"), "utf8");
  const codes = [...documentation.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gmu)].map(match => match[1]);
  expect(codes.sort()).toEqual(errorCatalogue.map(entry => entry.code).sort());
  for (const entry of errorCatalogue) {
    if (entry.docs) expect(existsSync(resolve(root, entry.docs.split("#")[0]!)), `${entry.code}: ${entry.docs}`).toBe(true);
  }
});
