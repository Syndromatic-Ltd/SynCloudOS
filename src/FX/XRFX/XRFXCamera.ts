import type { AFXTransform3D } from "../AnimationFX/AFXTransform3D";
import type { XRFXTrackingState } from "./XRFXTrackingState";
/** ARCamera. Immutable snapshot captured while native frame access is valid. */
export class XRFXCamera {
  declare readonly transform: AFXTransform3D;
  declare readonly projectionMatrix: AFXTransform3D;
  declare readonly trackingState: XRFXTrackingState;
  private constructor() {}
}
