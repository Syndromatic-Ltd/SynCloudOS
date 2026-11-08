import { NSEApplication } from "@syndromatic/syncloudos";
import { XRFXSession, XRFXWorldTrackingConfiguration, XRFXOrientationTrackingConfiguration, XRFXAnchor, XRFXRaycastQuery, XRFXError, type XRFXSessionDelegate } from "@syndromatic/syncloudos/fx/xr";
export { XRFXSession, XRFXWorldTrackingConfiguration, XRFXOrientationTrackingConfiguration, XRFXAnchor, XRFXRaycastQuery, XRFXError };
export async function afterAwait(delegate: XRFXSessionDelegate) { await Promise.resolve(); const session = new XRFXSession(); session.delegate = delegate; return session; }
export function afterTimer(delegate: XRFXSessionDelegate) { return new Promise<XRFXSession>(resolve => setTimeout(() => { const session = new XRFXSession(); session.delegate = delegate; resolve(session); }, 0)); }
export function thirdParty(delegate: XRFXSessionDelegate, callback: (create: () => XRFXSession) => void) { callback(() => { const session = new XRFXSession(); session.delegate = delegate; return session; }); }
export default class XRApplication extends NSEApplication {}
