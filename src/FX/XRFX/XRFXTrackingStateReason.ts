/** ARCamera.TrackingState.Reason. The browser adapter never invents these causes. */
export const XRFXTrackingStateReason = Object.freeze({
  initializing: "initializing",
  excessiveMotion: "excessiveMotion",
  insufficientFeatures: "insufficientFeatures",
  relocalizing: "relocalizing",
} as const);
export type XRFXTrackingStateReason = (typeof XRFXTrackingStateReason)[keyof typeof XRFXTrackingStateReason];
