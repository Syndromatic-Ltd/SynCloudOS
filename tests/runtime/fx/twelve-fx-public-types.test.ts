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

import { resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";
import * as consumers from "../../../scripts/synware/installed-consumer.mjs";

function checkProbe(probe: string, injectRuntimeLeak = false) {
  const root = resolve("tests/fixtures/virtual-twelve-fx-public-types.ts");
  const context = resolve("src/SynCloudOS/AppSDK/appContextTypes.ts");
  const config = ts.parseJsonConfigFileContent(ts.readConfigFile("tsconfig.app.json", ts.sys.readFile).config, ts.sys, process.cwd());
  const options = { ...config.options, incremental: false, noEmit: true };
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile.bind(host);
  host.readFile = file => {
    if (resolve(file) === root) return probe;
    const source = originalRead(file);
    return injectRuntimeLeak && resolve(file) === context
      ? source?.replace("export interface SynWareContextValue {", "export interface SynWareContextValue { readonly runtime: unknown;")
      : source;
  };
  const program = ts.createProgram([root, resolve("src/vite-env.d.ts"), resolve("src/FX/TextFX/textBackendTypes.d.ts")], options, host);
  const file = program.getSourceFile(root);
  expect(file).toBeDefined();
  // This source-side gate deliberately isolates the authored probe. The installed
  // runner checks the entire emitted declaration graph with skipLibCheck:false.
  return program.getSemanticDiagnostics(file).map(diagnostic => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  }));
}

it("accepts twelve public roots and token inference while rejecting host authority and private imports", () => {
  expect(consumers.createSdkPublicTypeProbe).toBeTypeOf("function");
  const probe = consumers.createSdkPublicTypeProbe();
  expect(checkProbe(probe)).toEqual([]);
}, 60_000);

it("fails the same public probe if a raw runtime property leaks into the app context", () => {
  expect(consumers.createSdkPublicTypeProbe).toBeTypeOf("function");
  expect(checkProbe(consumers.createSdkPublicTypeProbe(), true)).toEqual([
    expect.objectContaining({ code: 2578, message: expect.stringContaining("Unused '@ts-expect-error'") }),
  ]);
}, 60_000);
