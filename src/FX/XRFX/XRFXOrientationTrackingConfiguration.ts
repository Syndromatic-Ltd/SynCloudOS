import { fxAttributedClass } from "../../SynCloudOS/fxRuntimeContracts";
import { XRFXConfiguration } from "./XRFXConfiguration";
import { xrSupport } from "./internal/xrSupport";
/** AROrientationTrackingConfiguration. Browser support negotiation makes isSupported asynchronous. */
export class XRFXOrientationTrackingConfiguration extends XRFXConfiguration {
  static override get isSupported(): Promise<boolean> { return xrSupport(this, "orientation"); }
}
Object.defineProperty(XRFXOrientationTrackingConfiguration, fxAttributedClass, { value: true });
