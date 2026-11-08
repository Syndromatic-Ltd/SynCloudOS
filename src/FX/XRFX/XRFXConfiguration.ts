import type { XRFXWorldAlignment } from "./XRFXWorldAlignment";
/** ARConfiguration. Instantiate a concrete tracking configuration. */
export abstract class XRFXConfiguration {
  worldAlignment: XRFXWorldAlignment = "gravity";
  /** Apple defaults to true. The browser adapter rejects enabled light estimation. */
  isLightEstimationEnabled = true;
  /** Browser support negotiation is asynchronous; this base configuration is never runnable. */
  static get isSupported(): Promise<boolean> { return Promise.resolve(false); }
}
