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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { validateGlobalKeyboardListeners } from "../../scripts/quality/architecture-boundaries.mjs";

const root = process.cwd();
const systemUiRoot = resolve(root, "src/NSE/SystemUI");

describe("NSE SystemUI ownership", () => {

  it("keeps command and system actions behind typed runtime seams", () => {
    const roots = ["src/Webspring", "src/SynCloudOSReact", "src/SynCloudOS/Commands"];
    const files = roots.flatMap((rootPath) => {
      const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path) : [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
      });
      return walk(resolve(root, rootPath));
    });
    const findings: string[] = [];
    const requiredDeclarationFields = new Set(["id", "responderId", "title", "payload", "defaultKeyBindings", "scope", "undo", "execute"]);

    for (const path of files) {
      const shownPath = relative(root, path).replaceAll("\\", "/");
      const source = readFileSync(path, "utf8");
      const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "SynCloudOS") {
          findings.push(`${shownPath}: direct SynCloudOS singleton action`);
        }
        if (shownPath.startsWith("src/SynCloudOSReact/") && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "controller" && ["undo", "redo"].includes(node.expression.name.text)) {
          findings.push(`${shownPath}: direct runtime editor history call`);
        }
        if (shownPath.endsWith("ApplicationStageView.tsx") && ts.isCaseClause(node) && ts.isStringLiteralLike(node.expression) && ["about", "preferences", "logout", "return"].includes(node.expression.text.toLocaleLowerCase())) {
          findings.push(`${shownPath}: raw app-menu system switch`);
        }
        if (ts.isObjectLiteralExpression(node)) {
          const fields = new Set(node.properties.flatMap((property) => {
            if (!ts.isPropertyAssignment(property) && !ts.isMethodDeclaration(property) && !ts.isShorthandPropertyAssignment(property)) return [];
            const name = property.name;
            return name && (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) ? [name.text] : [];
          }));
          if (fields.has("id") && fields.has("responderId") && fields.has("execute")) {
            const missing = [...requiredDeclarationFields].filter((field) => !fields.has(field));
            if (missing.length > 0) findings.push(`${shownPath}: incomplete command declaration missing ${missing.join(", ")}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    expect(findings).toEqual([]);
    expect(validateGlobalKeyboardListeners({ root })).toEqual([]);
  }, 15_000);
});
