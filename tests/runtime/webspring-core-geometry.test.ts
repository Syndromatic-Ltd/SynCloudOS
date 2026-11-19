import { expect, it } from "vitest";
import * as projection from "../../src/SynCloudOS/WebspringState/webspringStateProjection";
import * as webspring from "../../src/Webspring/public";
import { validateSynWareManifest } from "../../src/SynCloudOS/AppSDK/manifest";
import { createTestRuntime } from "./helpers";

// The dial's geometry and selector belong to the site's launcher, not the framework.
it("keeps no dial geometry in the layout projection", () => {
  for (const name of ["WEBSPRING_STAGE", "DESKTOP_DIAL_ITEM_LIMIT", "getDialPoint", "getDesktopDialAngles", "getDesktopWebspringSlots", "getDesktopWebspringSlotForApp"]) {
    expect(projection, name).not.toHaveProperty(name);
  }
});

it("publishes no dial geometry from Webspring", () => {
  for (const name of ["WEBSPRING_STAGE", "getDesktopWebspringLayout", "stagePointStyle", "getWebspringSelectorTransform", "resolveWebspringOrbPresentation"]) {
    expect(webspring, name).not.toHaveProperty(name);
  }
});

it("keeps no dial selector state in the runtime's Webspring snapshot", () => {
  const state = createTestRuntime().store.getSnapshot().webspring;
  for (const key of ["activeIndicatorId", "selectorAngle", "selectorPosition", "lowerShelfMode", "hoverLabelAppId"]) {
    expect(state, key).not.toHaveProperty(key);
  }
});

it("rejects a manifest that places its app on the dial", () => {
  const result = validateSynWareManifest({ schemaVersion: 1, bundleIdentifier: "com.example.dial", version: "1.0.0", displayName: "Dial", webspring: { order: 1, selectorAngle: 90 } });
  expect(result.ok).toBe(false);
  expect(result.ok ? [] : result.errors).toContainEqual(expect.objectContaining({ path: "/webspring/selectorAngle", code: "unknown-key" }));
});
