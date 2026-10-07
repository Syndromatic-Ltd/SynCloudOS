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
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { synWareSdkEntries, synWarePackageName } from "../../../../scripts/synware/sdk-entries.mjs";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const owned = [
  "examples/TextSystem.app/Contents/Info.ts",
  "examples/TextSystem.app/Contents/model.ts",
  "examples/TextSystem.app/Contents/layout.ts",
  "examples/TextSystem.app/Contents/example.ts",
  "examples/TextSystem.app/Contents/image.ts",
  "examples/TextSystem.app/Host/bootstrap.tsx",
  "examples/TextSystem.app/Contents/view.tsx",
  "examples/TextSystem.app/Contents/index.tsx",
  "tests/e2e/fixtures/custom-text-surface.tsx",
  "tests/e2e/custom-text-surface.spec.ts",
  "tests/integration/text-system-example.test.ts",
].map(path => resolve(root, path));
const paths = Object.fromEntries(Object.entries(synWareSdkEntries).map(([entry, source]) => [synWarePackageName + "/" + entry, [source]]));
const program = ts.createProgram([...owned, resolve(root, "src/FX/TextFX/textBackendTypes.d.ts")], {
  noEmit: true, strict: true, skipLibCheck: true, module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX, types: ["vite/client", "node"], baseUrl: root, paths,
});
// Resolve the public dependency graph, request diagnostics only for the listed lane files.
const diagnostics = owned.flatMap(path => {
  const file = program.getSourceFile(path);
  if (!file) throw new Error("Missing owned source: " + path);
  return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)];
});
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: path => path, getCurrentDirectory: () => root, getNewLine: () => "\n",
}));
console.log(`Owned-file diagnostics: ${diagnostics.length} over ${owned.length} files; no emit/global check.`);
process.exitCode = diagnostics.length ? 1 : 0;
