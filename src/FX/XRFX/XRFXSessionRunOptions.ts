/** ARSession.RunOptions. Scene reconstruction is unsupported. */
export const XRFXSessionRunOptions = Object.freeze({
  resetTracking: 1,
  removeExistingAnchors: 2,
  stopTrackedRaycasts: 4,
  resetSceneReconstruction: 8,
} as const);
export type XRFXSessionRunOptions = number;
