import type { AFXTransform3D } from "../AnimationFX/AFXTransform3D";
import type { XRFXAnchor } from "./XRFXAnchor";
import type { XRFXRaycastTarget } from "./XRFXRaycastTarget";
import type { XRFXRaycastTargetAlignment } from "./XRFXRaycastTargetAlignment";
/** ARRaycastResult. Native hit results are copied within their frame callback. */
export class XRFXRaycastResult {
  declare readonly worldTransform: AFXTransform3D;
  declare readonly anchor: XRFXAnchor | null;
  declare readonly target: XRFXRaycastTarget;
  declare readonly targetAlignment: XRFXRaycastTargetAlignment;
  private constructor() {}
}
