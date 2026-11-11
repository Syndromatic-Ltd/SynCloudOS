# XRFX

XRFX exposes ARKit classes through `@syndromatic/syncloudos/fx/xr`. Declare `xr.session` in the application manifest. The application compiler supplies stable, privately attributed classes; `new XRFXSession()` selects and pins the mounted application's session. The unbound base constructor reports that it must be used from an application bundle. Construction and configuration support queries never request consent or open native hardware.

```ts
import {
  XRFXSession, XRFXWorldTrackingConfiguration, XRFXSessionRunOptions,
} from "@syndromatic/syncloudos/fx/xr";

const session = new XRFXSession();
session.delegate = {
  sessionDidUpdateFrame(sender, frame) {
    console.log(frame.timestamp, frame.camera.transform, frame.anchors);
  },
  sessionDidFailWithError(sender, error) {
    console.error(error.code, error.message);
  },
};
const configuration = new XRFXWorldTrackingConfiguration();
// Apple defaults this property to true; the browser cannot provide its promise.
configuration.isLightEstimationEnabled = false;
const supported = await XRFXWorldTrackingConfiguration.isSupported;
// In a subsequent user-action handler, so browser activation remains live:
if (supported) session.run(configuration);
// Later:
session.pause();
// Reacquisition requires explicit permission to reset native tracking:
session.run(configuration, XRFXSessionRunOptions.resetTracking | XRFXSessionRunOptions.removeExistingAnchors);
```

`useXR()` returns an actual component-owned `XRFXSession`. It survives React StrictMode effect replay and stops on genuine unmount. Set its delegate and queue, then call `run` from an explicit user action. Each privileged call checks the manifest, host authorization, application consent and the selected session lifetime. Revocation or application termination ends the old instance permanently, including queued delegate work and pending requests; regrant permits a new instance. Native permission refusal overrides saved consent.

| Apple member | XRFX member | Behavior |
| --- | --- | --- |
| `ARSession.delegate`, `delegateQueue` | `XRFXSession.delegate`, `delegateQueue` | Sender-first `XRFXSessionDelegate`; actual `DFXQueue` work. `null` uses the selected application's main queue. |
| `ARSession.currentFrame`, `configuration` | Same members | Current immutable snapshot and copied concrete configuration, initially `null`. |
| `ARSession.run(_:options:)`, `pause()` | `run(configuration, options)`, `pause()` | Return `void`; acquisition and pause failures use `sessionDidFailWithError`. |
| `ARSession.add(anchor:)`, `remove(anchor:)` | `add(anchor)`, `remove(anchor)` | Return `void`; actual native anchor creation happens during a frame and failures use the delegate. |
| `ARSession.raycast(_:)` | `raycast(query)` | Returns `Promise<readonly XRFXRaycastResult[]>` because browser hit-test setup and the next frame are asynchronous. |
| `ARSession.RunOptions` | `XRFXSessionRunOptions` | `resetTracking`, `removeExistingAnchors`, `stopTrackedRaycasts`, `resetSceneReconstruction`. The last fails with `unsupportedConfiguration`; no tracked-raycast API is admitted. |
| `ARConfiguration` | Abstract `XRFXConfiguration` | `worldAlignment`, `isLightEstimationEnabled`, static `isSupported`. Use a concrete subclass. |
| `ARWorldTrackingConfiguration`, `AROrientationTrackingConfiguration` | `XRFXWorldTrackingConfiguration`, `XRFXOrientationTrackingConfiguration` | Static `isSupported` is `Promise<boolean>` because browser support negotiation is asynchronous. It does not promise support for every configuration property. |
| `ARConfiguration.WorldAlignment` | `XRFXWorldAlignment` | `gravity`, `gravityAndHeading`, `camera`. Defaults to `gravity`; compass alignment fails with `unsupportedConfiguration`. |
| `ARFrame` | `XRFXFrame` | `timestamp` in seconds, `camera`, `anchors`. |
| `ARCamera` | `XRFXCamera` | `transform`, `projectionMatrix` as immutable column-major `AFXTransform3D`; `trackingState`. |
| `ARCamera.TrackingState`, `.Reason` | `XRFXTrackingState`, `XRFXTrackingStateReason` | Apple's cases and limited reasons; browser snapshots report `notAvailable` because WebXR does not expose ARKit tracking-quality observations. |
| `ARAnchor` | `XRFXAnchor` | `new XRFXAnchor(transform)` or `new XRFXAnchor(name, transform)`, `identifier: NSEUUID`, `name`, `transform`. |
| `ARRaycastQuery` | `XRFXRaycastQuery` | `(origin, direction, target, targetAlignment)` with immutable 3D vectors. |
| `ARRaycastQuery.Target`, `.TargetAlignment` | `XRFXRaycastTarget`, `XRFXRaycastTargetAlignment` | Apple cases; the browser supports `estimatedPlane` with `any` alignment only. |
| `ARRaycastResult` | `XRFXRaycastResult` | `worldTransform`, `anchor`, `target`, `targetAlignment`; results do not invent a plane anchor or classification. |
| `ARError` | `XRFXError` | Apple's error domain and cases, including `cameraUnauthorized`, `unsupportedConfiguration`, `sensorUnavailable`, `requestFailed`. |

The delegate protocol includes `sessionDidUpdateFrame`, `sessionDidAddAnchors`, `sessionDidUpdateAnchors`, `sessionDidRemoveAnchors`, `sessionDidFailWithError`, `sessionWasInterrupted` and `sessionInterruptionEnded`. Every callback carries the sending session first. Frame and anchor data are copied while the browser callback is valid, before Dispatch delivery. Changing or pausing a run invalidates callbacks from the old run. Queue suspension does not retain a native frame.

The private browser adapter maps world tracking to immersive AR and orientation tracking to inline sessions. `gravity` requests the native local coordinate space; `camera` requests the viewer coordinate space. Compass heading and light estimation cannot be promised and fail explicitly. The default Apple light-estimation value remains `true`, so turn it off for this adapter. Missing pose/projection data yields no fabricated camera frame. A compatible WebGL layer is owned and released with its native session; XRFX exposes no renderer.

A repeated identical active configuration preserves its session. Changing configuration or resuming after pause requires `resetTracking`, because the browser cannot preserve tracking through native-session reacquisition. If existing anchors would be lost, also request `removeExistingAnchors`; otherwise the operation fails with `unsupportedConfiguration`. Native anchor creation requires a supported anchor feature and a rigid transform. Unsupported anchor creation reports `unsupportedConfiguration`; it is never simulated. Removing an anchor while creation is pending invalidates and deletes that late result.

Raycast results are copied in their native frame and their hit-test source is cancelled before completion. Plane-specific targets or alignments fail with `unsupportedConfiguration`; no `XRFXPlaneAnchor` is exported because this adapter has no admitted plane-detection observation path. VR has no ARKit counterpart and is excluded. Face/body tracking, scene reconstruction, world maps, collaboration, persistent anchors and native hardware acceptance are outside this family pass.

A spontaneous native session end releases its mounted slot, clears current run/frame state and invalidates queued or in-flight work. Restart with explicit `resetTracking`; no invented public end delegate is exposed. Native sessions, render layers, anchors and hit-test sources that arrive after cancellation are released without ending a replacement session. Ownership is checked again when a native session or layer crosses an asynchronous handoff. Browser denial is recorded before conversion at setup, frame, anchor, raycast and finalization boundaries. Native devices still require compatible hardware, HTTPS, permissions policy and user activation.

The removed client/factory, capability/status, mode/reference-space and browser-options APIs have no aliases. Application code uses the classes above or `useXR()`.
