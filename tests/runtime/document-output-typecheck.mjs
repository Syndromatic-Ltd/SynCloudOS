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

// Check only output-owned source/test files. Do not emit or diagnose other workers' modules.
const owned = [
  "src/SynCloudOS/Documents/documentOutputTypes.ts",
  "src/SynCloudOS/Documents/DocumentOutputPreparation.ts",
  "src/SynCloudOS/Documents/documentOutputPrint.ts",
  "tests/runtime/document-output-snapshot.test.ts",
  "tests/runtime/document-output-pdf.test.ts",
  "tests/runtime/document-output-print.test.ts",
  "tests/runtime/document-output-document-state.test.ts",
  "tests/e2e/custom-text-output.spec.ts",
  "tests/e2e/fixtures/custom-text-output-browser.ts",
];
const config = ts.readConfigFile("tsconfig.app.json", ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram([...owned, "src/vite-env.d.ts"], { ...parsed.options, noEmit: true, composite: false, incremental: false });
const diagnostics = owned.flatMap(path => {
  const source = program.getSourceFile(path);
  if (!source) throw new Error(`Missing output-owned file: ${path}`);
  return [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)];
});
if (diagnostics.length) console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: path => path, getNewLine: () => "\n",
}));
console.log(`Output-owned TypeScript diagnostics: ${diagnostics.length}; checked ${owned.length} files; no emit.`);
process.exitCode = diagnostics.length ? 1 : 0;
