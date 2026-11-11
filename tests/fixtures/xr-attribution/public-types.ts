import { createSynCloudOSHostContribution } from "@syndromatic/syncloudos/browser";
import { createDeterministicRuntimeEnvironment } from "@syndromatic/syncloudos/sdk/testing";
import { SCOS as RootSCOS } from "@syndromatic/syncloudos";
import { SCOS, useXR, useSCOS, type SynWareContextValue } from "@syndromatic/syncloudos/sdk";
import { XRFXSession, XRFXConfiguration, XRFXWorldTrackingConfiguration, XRFXOrientationTrackingConfiguration, XRFXFrame, XRFXCamera, XRFXAnchor, XRFXRaycastQuery, XRFXRaycastResult, XRFXError, XRFXSessionRunOptions, XRFXWorldAlignment, XRFXRaycastTarget, XRFXRaycastTargetAlignment, XRFXTrackingState, XRFXTrackingStateReason, type XRFXSessionDelegate } from "@syndromatic/syncloudos/fx/xr";
import { NSEUUID } from "@syndromatic/syncloudos/foundation";
import { AFXTransform3D } from "@syndromatic/syncloudos/fx/animation";
import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
const session = new XRFXSession(); const hook: XRFXSession = useXR(); session.delegateQueue = DFXQueue.main; session.delegateQueue = null;
const configuration = new XRFXWorldTrackingConfiguration(); const base: XRFXConfiguration = configuration; const supported: Promise<boolean> = XRFXWorldTrackingConfiguration.isSupported; const orientation = new XRFXOrientationTrackingConfiguration();
configuration.worldAlignment = XRFXWorldAlignment.gravity; configuration.isLightEstimationEnabled = false; const result: void = session.run(configuration, XRFXSessionRunOptions.resetTracking | XRFXSessionRunOptions.removeExistingAnchors); session.pause();
const anchor = new XRFXAnchor("marker", AFXTransform3D.translation(1, 2, 3)); const identifier: NSEUUID = anchor.identifier; session.add(anchor); session.remove(anchor);
const query = new XRFXRaycastQuery({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, XRFXRaycastTarget.estimatedPlane, XRFXRaycastTargetAlignment.any);
const hits: Promise<readonly XRFXRaycastResult[]> = session.raycast(query); const camera: XRFXCamera | undefined = session.currentFrame?.camera; const state: XRFXTrackingState = XRFXTrackingState.limited(XRFXTrackingStateReason.initializing);
const delegate: XRFXSessionDelegate = {
  sessionDidUpdateFrame(sender, frame) { const selected: XRFXSession = sender; const snapshot: XRFXFrame = frame; const transform: AFXTransform3D = frame.camera.transform; void [selected, snapshot, transform]; },
  sessionDidAddAnchors(sender, anchors) { const value: XRFXAnchor = anchors[0]!; void [sender, value]; },
  sessionDidUpdateAnchors(sender, anchors) { void [sender, anchors]; }, sessionDidRemoveAnchors(sender, anchors) { void [sender, anchors]; },
  sessionDidFailWithError(sender, error) { const failure: XRFXError = error; void [sender, failure]; }, sessionWasInterrupted(sender) { void sender; }, sessionInterruptionEnded(sender) { void sender; },
}; session.delegate = delegate; void [hook, base, supported, orientation, result, identifier, hits, camera, state];
// @ts-expect-error The base configuration is abstract.
new XRFXConfiguration();
// @ts-expect-error Camera construction is session-owned.
new XRFXCamera();
// @ts-expect-error No browser client remains on SCOS.
useSCOS().xr;
// @ts-expect-error No root SCOS client.
RootSCOS.xr;
// @ts-expect-error No SDK SCOS client.
SCOS.xr;
// @ts-expect-error No public context transport.
type Hidden = SynWareContextValue["xr"];
createSynCloudOSHostContribution("xr-boundary", "installed-test", environment => {
  // @ts-expect-error No public environment transport.
  environment.xr;
  return {};
});
// @ts-expect-error No public test environment transport.
createDeterministicRuntimeEnvironment().environment.xr;
// @ts-expect-error Narrow test controls cannot create a native session.
createDeterministicRuntimeEnvironment().adapters.xr.start();
// @ts-expect-error Browser options do not configure ARKit classes.
new XRFXWorldTrackingConfiguration({ mode: "immersive-vr" });
// @ts-expect-error No authorization invention.
session.getAuthorizationStatus();
// @ts-expect-error No factory or disposal alias.
session.dispose();
// @ts-expect-error Removed browser-shaped client.
import type { XRFXClient } from "@syndromatic/syncloudos/fx/xr";
// @ts-expect-error Removed capability object.
import type { XRFXCapabilities } from "@syndromatic/syncloudos/fx/xr";
// @ts-expect-error Removed authorization type.
import type { XRFXAuthorizationStatus } from "@syndromatic/syncloudos/fx/xr";
// @ts-expect-error Removed browser mode.
import type { XRFXSessionMode } from "@syndromatic/syncloudos/fx/xr";
// @ts-expect-error Removed browser reference space.
import type { XRFXReferenceSpace } from "@syndromatic/syncloudos/fx/xr";
// @ts-expect-error Removed browser options.
import type { XRFXConfigurationOptions } from "@syndromatic/syncloudos/fx/xr";
