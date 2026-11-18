import ts from "typescript";
import { resolve } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { inspectPublicApiBoundaries } from "../../../scripts/synware/public-api-boundaries.mjs";
import { synWareSdkEntries } from "../../../scripts/synware/sdk-entries.mjs";

// One program checks every family's public-types probe; building one per family cost about 18 s each.
const families = [
  { name: "Bluetooth", fixture: "bluetooth-attribution", entry: ["fx/bluetooth", "src/FX/BluetoothFX/public.ts"] },
  { name: "Contacts", fixture: "contacts-attribution" },
  { name: "Network", fixture: "network-attribution" },
  { name: "NFC", fixture: "nfc-attribution", entry: ["fx/nfc", "src/FX/NFCFX/public.ts"] },
  { name: "Pass", fixture: "pass-attribution" },
  { name: "Speech", fixture: "speech-attribution" },
  { name: "XR", fixture: "xr-attribution", entry: ["fx/xr", "src/FX/XRFX/public.ts"] },
] as const;

let program: ts.Program;
const fixturePath = (fixture: string) => resolve(`tests/fixtures/${fixture}/public-types.ts`);
const format = (diagnostics: readonly ts.Diagnostic[]) => ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: name => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" });

beforeAll(() => {
  const config = ts.readConfigFile("tsconfig.app.json", ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const paths = Object.fromEntries(Object.entries(synWareSdkEntries).map(([name, source]) => [name === "index" ? "@syndromatic/syncloudos" : `@syndromatic/syncloudos/${name}`, [resolve(source as string)]]));
  program = ts.createProgram([...families.map(family => fixturePath(family.fixture)), ...parsed.fileNames.filter(name => name.endsWith(".d.ts"))], { ...parsed.options, incremental: false, composite: false, noEmit: true, paths });
}, 60_000);

it("compiles the shared declarations and every probe without errors", () => {
  expect(format([...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics(), ...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()])).toBe("");
}, 60_000);

for (const family of families) it(`rejects ${family.name} adapter inference through browser, testing, root and SDK public routes`, () => {
  const file = program.getSourceFile(fixturePath(family.fixture));
  expect(file).toBeDefined();
  expect(format(ts.getPreEmitDiagnostics(program, file))).toBe("");
  if ("entry" in family) expect(inspectPublicApiBoundaries({ program, repositoryRoot: process.cwd(), entries: { [family.entry[0]]: family.entry[1] } })).toEqual([]);
}, 30_000);
