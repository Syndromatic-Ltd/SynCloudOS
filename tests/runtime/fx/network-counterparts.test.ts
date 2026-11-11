import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import * as Network from "../../../src/FX/NetworkFX/public";
import { appkitCounterpartFor } from "../../../scripts/developer-mcp/lookup.mjs";
const counterparts = { NWFXPathMonitor: "NWPathMonitor", NWFXPath: "NWPath", NWFXInterface: "NWInterface", NWFXPathStatus: "NWPath.Status", NWFXPathUnsatisfiedReason: "NWPath.UnsatisfiedReason", NWFXInterfaceType: "NWInterface.InterfaceType", NWFXError: "NWError" };
it("maps every Network runtime and type export to Apple and exposes no browser/client concepts", () => {
  const mapping = JSON.parse(readFileSync("docs/framework/appkit-counterparts.json", "utf8"));
  expect(Object.keys(Network).sort()).toEqual(Object.keys(counterparts).sort());
  for (const [name, apple] of Object.entries(counterparts)) expect(appkitCounterpartFor(name, mapping)).toBe(apple);
  const program = ts.createProgram(["src/FX/NetworkFX/public.ts"], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, skipLibCheck: true });
  const checker = program.getTypeChecker(); const file = program.getSourceFile("src/FX/NetworkFX/public.ts")!;
  expect(checker.getExportsOfModule(checker.getSymbolAtLocation(file)!).map(symbol => symbol.name).sort()).toEqual(Object.keys(counterparts).sort());
  for (const cases of [Network.NWFXPathStatus, Network.NWFXInterfaceType, Network.NWFXPathUnsatisfiedReason]) expect(Object.isFrozen(cases)).toBe(true);
  expect(Object.values(Network.NWFXPathStatus)).toEqual(["satisfied", "unsatisfied", "requiresConnection"]);
  expect(Object.values(Network.NWFXPathUnsatisfiedReason)).toEqual(["notAvailable", "cellularDenied", "wifiDenied", "localNetworkDenied", "vpnInactive"]);
  expect(Object.values(Network.NWFXInterfaceType)).toEqual(["other", "wifi", "cellular", "wiredEthernet", "loopback"]);
});

it("represents Apple NWError associated values without DOMException names", () => {
  for (const caseName of ["posix", "dns", "tls", "wifiAware"] as const) { const error = Network.NWFXError[caseName](13); expect(error).toBeInstanceOf(Network.NWFXError); expect(error.code).toBe(caseName); expect(error.error).toBe(13); }
});
