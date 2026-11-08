import type { AFXPoint3D } from "../AnimationFX/AFXTransform3D";
import type { XRFXRaycastTarget } from "./XRFXRaycastTarget";
import type { XRFXRaycastTargetAlignment } from "./XRFXRaycastTargetAlignment";
import { XRFXError } from "./XRFXError";
/** ARRaycastQuery.init(origin:direction:allowing:alignment:). */
export class XRFXRaycastQuery {
  readonly origin: AFXPoint3D;
  readonly direction: AFXPoint3D;
  constructor(origin: AFXPoint3D, direction: AFXPoint3D, readonly target: XRFXRaycastTarget, readonly targetAlignment: XRFXRaycastTargetAlignment) {
    if (![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z].every(Number.isFinite) || !Math.hypot(direction.x, direction.y, direction.z) || !["existingPlaneGeometry", "existingPlaneInfinite", "estimatedPlane"].includes(target) || !["horizontal", "vertical", "any"].includes(targetAlignment)) throw new XRFXError("invalidConfiguration", "A raycast requires finite vectors, a nonzero direction and valid target options.");
    this.origin = Object.freeze({ ...origin }); this.direction = Object.freeze({ ...direction }); Object.freeze(this);
  }
}
