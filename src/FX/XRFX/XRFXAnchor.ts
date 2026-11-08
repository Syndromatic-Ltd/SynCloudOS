import { NSEUUID } from "../../Foundation/NSEUUID";
import { AFXTransform3D } from "../AnimationFX/AFXTransform3D";
import { XRFXError } from "./XRFXError";
/** ARAnchor. Immutable world-space transform with a Foundation UUID. */
export class XRFXAnchor {
  readonly identifier = new NSEUUID();
  readonly name: string | null;
  readonly transform: AFXTransform3D;
  constructor(transform: AFXTransform3D);
  constructor(name: string, transform: AFXTransform3D);
  constructor(nameOrTransform: string | AFXTransform3D, transform?: AFXTransform3D) {
    this.name = typeof nameOrTransform === "string" ? nameOrTransform : null;
    this.transform = typeof nameOrTransform === "string" ? transform! : nameOrTransform;
    if (!(this.transform instanceof AFXTransform3D)) throw new XRFXError("invalidConfiguration", "An anchor requires an AFXTransform3D.");
    Object.freeze(this);
  }
}
