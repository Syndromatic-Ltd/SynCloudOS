import type { XRFXCamera } from "./XRFXCamera";
import type { XRFXAnchor } from "./XRFXAnchor";
/** ARFrame. Timestamp in seconds; all camera and anchor data are immutable snapshots. */
export class XRFXFrame {
  declare readonly timestamp: number;
  declare readonly camera: XRFXCamera;
  declare readonly anchors: readonly XRFXAnchor[];
  private constructor() {}
}
