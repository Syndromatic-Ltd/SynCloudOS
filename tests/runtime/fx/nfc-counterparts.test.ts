import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import * as NFC from "../../../src/FX/NFCFX/public";
import { appkitCounterpartFor } from "../../../scripts/developer-mcp/lookup.mjs";
const names = ["ReaderSession", "NDEFReaderSession", "NDEFReaderSessionDelegate", "NDEFTag", "NDEFStatus", "NDEFMessage", "NDEFPayload", "TypeNameFormat", "ReaderError"];
it("maps every NFC runtime and type export to its CoreNFC counterpart", () => {
  const mapping = JSON.parse(readFileSync("docs/framework/appkit-counterparts.json", "utf8"));
  expect(Object.keys(NFC).sort()).toEqual(names.filter(name => !["NDEFReaderSessionDelegate", "NDEFTag"].includes(name)).map(name => `NFX${name}`).sort());
  for (const name of names) expect(appkitCounterpartFor(`NFX${name}`, mapping)).toBe(`NFC${name}`);
  const program = ts.createProgram(["src/FX/NFCFX/public.ts"], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, skipLibCheck: true }); const checker = program.getTypeChecker(); const file = program.getSourceFile("src/FX/NFCFX/public.ts")!;
  expect(checker.getExportsOfModule(checker.getSymbolAtLocation(file)!).map(symbol => symbol.name).sort()).toEqual(names.map(name => `NFX${name}`).sort());
});
