/** ARError: errors from session configuration, sensors and requests. */
export class XRFXError extends Error {
  static readonly errorDomain = "ARErrorDomain";
  constructor(
    readonly code:
      | "requestFailed"
      | "cameraUnauthorized"
      | "fileIOFailed"
      | "insufficientFeatures"
      | "invalidCollaborationData"
      | "invalidConfiguration"
      | "invalidReferenceImage"
      | "invalidReferenceObject"
      | "invalidWorldMap"
      | "microphoneUnauthorized"
      | "objectMergeFailed"
      | "sensorFailed"
      | "sensorUnavailable"
      | "unsupportedConfiguration"
      | "worldTrackingFailed"
      | "geoTrackingFailed"
      | "geoTrackingNotAvailableAtLocation"
      | "locationUnauthorized"
      | "highResolutionFrameCaptureFailed"
      | "highResolutionFrameCaptureInProgress",
    message: string = code,
  ) {
    super(message);
    this.name = "XRFXError";
  }
}
