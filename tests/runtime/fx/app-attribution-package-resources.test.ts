import { expect, it } from "vitest";
// @ts-expect-error Plain ESM package policy.
import { assertReviewedPackageFiles } from "../../../scripts/synware/sdk-package-manifest.mjs";
it("admits exactly the private packaged FX runtime and generator resources", () => {
  expect(() => assertReviewedPackageFiles(["fx-attribution-runtime.js", "fx-attribution-runtime.js.map", "fx-app-module-source.mjs"])).not.toThrow();
  expect(() => assertReviewedPackageFiles(["fx-attribution-factory.js"])).toThrow();
});
