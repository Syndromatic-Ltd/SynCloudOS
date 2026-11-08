/** ARConfiguration.WorldAlignment. Compass alignment is unavailable in the browser adapter. */
export const XRFXWorldAlignment = Object.freeze({ gravity: "gravity", gravityAndHeading: "gravityAndHeading", camera: "camera" } as const);
export type XRFXWorldAlignment = typeof XRFXWorldAlignment[keyof typeof XRFXWorldAlignment];
