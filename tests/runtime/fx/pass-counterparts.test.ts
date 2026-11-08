import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import * as Pass from "../../../src/FX/PassFX/public";
import { appkitCounterpartFor } from "../../../scripts/developer-mcp/lookup.mjs";
const names = ["PaymentRequest", "PaymentSummaryItem", "PaymentSummaryItemType", "PaymentNetwork", "MerchantCapability", "ContactField", "ShippingMethod", "PaymentAuthorizationController", "PaymentAuthorizationControllerDelegate", "Payment", "PaymentToken", "PaymentMethod", "PaymentMethodType", "Contact", "PaymentAuthorizationResult", "PaymentAuthorizationStatus", "Error"];
it("maps every Pass runtime/type export and its sole Foundation dependency", () => {
  const mapping = JSON.parse(readFileSync("docs/framework/appkit-counterparts.json", "utf8"));
  expect(Object.keys(Pass).sort()).toEqual(names.filter(name => !name.endsWith("Delegate")).map(name => `PKFX${name}`).sort());
  for (const name of names) expect(appkitCounterpartFor(`PKFX${name}`, mapping)).toBe(name === "Error" ? "PKPassKitError" : `PK${name}`);
  expect(appkitCounterpartFor("NSEPersonNameComponents", mapping)).toBe("NSPersonNameComponents");
  const program = ts.createProgram(["src/FX/PassFX/public.ts"], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, skipLibCheck: true }); const checker = program.getTypeChecker(); const file = program.getSourceFile("src/FX/PassFX/public.ts")!;
  expect(checker.getExportsOfModule(checker.getSymbolAtLocation(file)!).map(symbol => symbol.name).sort()).toEqual(names.map(name => `PKFX${name}`).sort());
});
