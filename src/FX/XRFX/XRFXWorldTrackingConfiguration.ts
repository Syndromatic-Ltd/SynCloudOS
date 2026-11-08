import { fxAttributedClass } from "../../SynCloudOS/fxRuntimeContracts";
import { XRFXConfiguration } from "./XRFXConfiguration";
import { xrSupport } from "./internal/xrSupport";
/** ARWorldTrackingConfiguration. Browser support negotiation makes isSupported asynchronous. */
export class XRFXWorldTrackingConfiguration extends XRFXConfiguration {
  static override get isSupported(): Promise<boolean> { return xrSupport(this, "world"); }
}
Object.defineProperty(XRFXWorldTrackingConfiguration, fxAttributedClass, { value: true });
