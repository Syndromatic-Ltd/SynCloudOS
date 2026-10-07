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
import { resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

const files = ["InspectorView.tsx", "inspectorTypes.ts", "inspectorProjection.ts", "inspectorOwnerSources.ts", "redactInspectorSnapshot.ts", "inspectorDevHost.ts", "inspectorDevEntry.ts", "inspectorLocalization.ts"];

it("mounts the private Inspector from the canonical SynWare host with real settlement and mounted-route correlation", () => {
  const source = readFileSync("src/SynCloudOS/AppSDK/SynWareRuntimeMount.tsx", "utf8");
  expect(source).toContain('import { DevInspectorRegion } from "../../SynCloudOSReact/DevInspectorRegion"');
  expect(source).toContain("getRuntimeSettlement(runtime)");
  expect(source).toContain("runtime.routes.mountedRoutes.current(app.id)");
  expect(source).toContain("routeSession.getSnapshot()");
  expect(source).toContain("settlement={inspectorSettlement}");
  expect(source).toContain("routes={inspectorRoutes}");
});


it("typechecks the Inspector source dependency closure without emitting package artifacts", () => {
  const config = ts.readConfigFile("tsconfig.app.json", ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const program = ts.createProgram([...files.map(file => resolve("src/SynCloudOS/Inspector", file)), resolve("src/SynCloudOSReact/DevInspectorRegion.tsx")], {
    ...parsed.options, noEmit: true, incremental: false, types: ["vite/client", "emscripten"],
  });
  const errors = ts.getPreEmitDiagnostics(program);
  expect(errors.map(error => `${error.file?.fileName}:${error.start}: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`)).toEqual([]);
}, 60_000);

it("keeps private host imports out of shared runtime, app and SDK source entries", () => {
  const imports: string[] = [];
  const inspect = (directory: string) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, item.name);
      if (item.isDirectory()) inspect(file);
      else if (/\.[cm]?[jt]sx?$/.test(item.name)) {
        const source = readFileSync(file, "utf8");
        if (file.replaceAll("\\", "/").includes("/SynCloudOS/Inspector/")) continue;
        const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
        const devCondition = (node: ts.Expression): boolean => node.getText(ast) === "import.meta.env.DEV"
          || ts.isParenthesizedExpression(node) && devCondition(node.expression)
          || ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && (devCondition(node.left) || devCondition(node.right));
        const guarded = (node: ts.Node): boolean => {
          for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
            if (ts.isIfStatement(parent) && parent.thenStatement === child && devCondition(parent.expression)) return true;
          }
          return false;
        };
        const visit = (node: ts.Node) => {
          const dynamic = ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
          const target = dynamic ? node.arguments[0] : ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier : undefined;
          if (target && ts.isStringLiteral(target)) {
            if (/\/(?:inspectorDevHost|InspectorView)(?:\.[jt]sx?)?$/.test(target.text)) imports.push(file);
            if (/\/inspectorDevEntry(?:\.[jt]sx?)?$/.test(target.text) && !(dynamic && guarded(node))) imports.push(file);
          }
          ts.forEachChild(node, visit);
        };
        visit(ast);
      }
    }
  };
  inspect("src");
  expect(imports).toEqual([]);
});
