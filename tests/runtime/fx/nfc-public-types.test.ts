import ts from "typescript";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { inspectPublicApiBoundaries } from "../../../scripts/synware/public-api-boundaries.mjs";
import { synWareSdkEntries } from "../../../scripts/synware/sdk-entries.mjs";
it("rejects NFC adapter inference through browser, testing, root and SDK public routes", () => {
  const config = ts.readConfigFile("tsconfig.app.json", ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const paths = Object.fromEntries(Object.entries(synWareSdkEntries).map(([name, source]) => [name === "index" ? "@syndromatic/syncloudos" : `@syndromatic/syncloudos/${name}`, [resolve(source as string)]]));
  const program = ts.createProgram([resolve("tests/fixtures/nfc-attribution/public-types.ts"), ...parsed.fileNames.filter(name => name.endsWith(".d.ts"))], { ...parsed.options, incremental: false, composite: false, noEmit: true, paths });
  expect(inspectPublicApiBoundaries({ program, repositoryRoot: process.cwd(), entries: { "fx/nfc": "src/FX/NFCFX/public.ts" } })).toEqual([]);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: name => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" })).toBe("");
}, 30_000);
