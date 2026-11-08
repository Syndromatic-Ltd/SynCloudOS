import type { XRFXTrackingStateReason } from "./XRFXTrackingStateReason";
/** ARCamera.TrackingState. Native pose availability does not establish ARKit tracking quality. */
export type XRFXTrackingState = "notAvailable" | "normal" | Readonly<{ limited: XRFXTrackingStateReason }>;
export const XRFXTrackingState = Object.freeze({ notAvailable: "notAvailable", normal: "normal", limited: (reason: XRFXTrackingStateReason): XRFXTrackingState => Object.freeze({ limited: reason }) } as const);
