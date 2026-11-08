import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import * as XR from "../../../src/FX/XRFX/public";
import { appkitCounterpartFor } from "../../../scripts/developer-mcp/lookup.mjs";
const names = {
  XRFXSession: "ARSession", XRFXSessionDelegate: "ARSessionDelegate", XRFXConfiguration: "ARConfiguration", XRFXWorldTrackingConfiguration: "ARWorldTrackingConfiguration", XRFXOrientationTrackingConfiguration: "AROrientationTrackingConfiguration",
  XRFXWorldAlignment: "ARConfiguration.WorldAlignment", XRFXSessionRunOptions: "ARSession.RunOptions", XRFXFrame: "ARFrame", XRFXCamera: "ARCamera", XRFXTrackingState: "ARCamera.TrackingState", XRFXTrackingStateReason: "ARCamera.TrackingState.Reason", XRFXAnchor: "ARAnchor",
  XRFXRaycastQuery: "ARRaycastQuery", XRFXRaycastTarget: "ARRaycastQuery.Target", XRFXRaycastTargetAlignment: "ARRaycastQuery.TargetAlignment", XRFXRaycastResult: "ARRaycastResult", XRFXError: "ARError",
};
it("maps every XR runtime and type export to its exact Apple counterpart", () => {
  const mapping = JSON.parse(readFileSync("docs/framework/appkit-counterparts.json", "utf8"));
  expect(Object.keys(XR).sort()).toEqual(Object.keys(names).filter(name => !name.endsWith("Delegate")).sort());
  for (const [name, counterpart] of Object.entries(names)) expect(appkitCounterpartFor(name, mapping)).toBe(counterpart);
  const program = ts.createProgram(["src/FX/XRFX/public.ts"], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, skipLibCheck: true }); const checker = program.getTypeChecker();
  const file = program.getSourceFile("src/FX/XRFX/public.ts")!; expect(checker.getExportsOfModule(checker.getSymbolAtLocation(file)!).map(symbol => symbol.name).sort()).toEqual(Object.keys(names).sort());
});
