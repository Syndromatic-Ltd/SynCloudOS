import { expect, it } from "vitest";
import * as XR from "../../../src/FX/XRFX/public";
import { AFXTransform3D } from "../../../src/FX/AnimationFX/AFXTransform3D";
import { NSEUUID } from "../../../src/Foundation/NSEUUID";
it("exports real ARKit classes and Apple options without browser aliases", () => {
  for (const name of ["XRFXSession", "XRFXConfiguration", "XRFXWorldTrackingConfiguration", "XRFXOrientationTrackingConfiguration", "XRFXFrame", "XRFXCamera", "XRFXAnchor", "XRFXRaycastQuery", "XRFXRaycastResult", "XRFXError"]) expect(Reflect.get(XR, name)).toBeTypeOf("function");
  for (const name of ["XRFXClient", "XRFXCapabilities", "XRFXSessionMode", "XRFXReferenceSpace", "XRFXAuthorizationStatus", "XRFXConfigurationOptions"]) expect(name in XR).toBe(false);
  expect(() => new XR.XRFXSession()).toThrow(/application bundle/);
  expect(Reflect.get(XR, "XRFXRunOptions")).toBeUndefined();
  expect(Reflect.get(XR, "XRFXSessionRunOptions")).toEqual({ resetTracking: 1, removeExistingAnchors: 2, stopTrackedRaycasts: 4, resetSceneReconstruction: 8 });
});
it("uses Apple configuration defaults and Foundation anchor identifiers", () => {
  const configuration = new XR.XRFXWorldTrackingConfiguration();
  expect(configuration).toBeInstanceOf(XR.XRFXConfiguration);
  expect(configuration.worldAlignment).toBe("gravity"); expect(configuration.isLightEstimationEnabled).toBe(true);
  const anchor = new XR.XRFXAnchor("Marker", AFXTransform3D.translation(2, 3, 4));
  expect(anchor.identifier).toBeInstanceOf(NSEUUID); expect(anchor.name).toBe("Marker");
  expect(anchor.transform.transformPoint({ x: 1, y: 2, z: 3 })).toEqual({ x: 3, y: 5, z: 7 });
  const query = new XR.XRFXRaycastQuery({ x: 0, y: 1, z: 2 }, { x: 0, y: 0, z: -1 }, "estimatedPlane", "any");
  expect(query.target).toBe("estimatedPlane"); expect(query.targetAlignment).toBe("any"); expect(Object.isFrozen(query.origin)).toBe(true);
  expect(() => new XR.XRFXRaycastQuery({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, "estimatedPlane", "any")).toThrow(XR.XRFXError);
});
