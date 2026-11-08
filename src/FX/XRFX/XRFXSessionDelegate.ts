import type { XRFXSession } from "./XRFXSession";
import type { XRFXFrame } from "./XRFXFrame";
import type { XRFXAnchor } from "./XRFXAnchor";
import type { XRFXError } from "./XRFXError";
/** ARSessionDelegate, including the admitted ARSessionObserver methods. */
export interface XRFXSessionDelegate {
  sessionDidUpdateFrame?(session: XRFXSession, frame: XRFXFrame): void;
  sessionDidAddAnchors?(session: XRFXSession, anchors: readonly XRFXAnchor[]): void;
  sessionDidUpdateAnchors?(session: XRFXSession, anchors: readonly XRFXAnchor[]): void;
  sessionDidRemoveAnchors?(session: XRFXSession, anchors: readonly XRFXAnchor[]): void;
  sessionDidFailWithError?(session: XRFXSession, error: XRFXError): void;
  sessionWasInterrupted?(session: XRFXSession): void;
  sessionInterruptionEnded?(session: XRFXSession): void;
}
