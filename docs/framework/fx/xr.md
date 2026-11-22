# XRFX

XRFX runs augmented-reality sessions: it tracks the device's camera pose, places anchors in the world and casts rays against detected surfaces. In a browser it runs on WebXR. The session, configuration, frame and anchor model will feel familiar if you have used ARKit.

Import from `@syndromatic/syncloudos/fx/xr` and declare `xr.session` in the application manifest. The application compiler supplies privately attributed classes, so `new XRFXSession()` binds to the mounted app's session. Constructing the unbound base class throws an error saying it must be used from an application bundle. Constructing a session, or asking whether a configuration is supported, never prompts for consent or opens hardware.

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
// Defaults to true, which the browser adapter cannot honour.
configuration.isLightEstimationEnabled = false;
const supported = await XRFXWorldTrackingConfiguration.isSupported;
// In a later user-action handler, so the browser's user activation is still live:
if (supported) session.run(configuration);
// Later:
session.pause();
// Resuming needs explicit permission to reset tracking:
session.run(configuration, XRFXSessionRunOptions.resetTracking | XRFXSessionRunOptions.removeExistingAnchors);
```

In a component, `useXR()` from `@syndromatic/syncloudos/sdk` returns an `XRFXSession` owned by that component. It survives React StrictMode's effect replay and stops when the component unmounts. Set its delegate and queue, then call `run` from a user action.

Every privileged call checks the manifest, host authorisation, app consent and the app session's lifetime. Revocation or app termination ends the session for good, including queued delegate work and pending requests; after access is granted again you need a new session. A native permission refusal overrides saved consent.

## API

| Member | Behaviour |
| --- | --- |
| `XRFXSession.delegate`, `delegateQueue` | An `XRFXSessionDelegate` whose methods take the session first, delivered as `DFXQueue` work. A `null` queue means the app's main queue. |
| `currentFrame`, `configuration` | The latest immutable frame and a copy of the running configuration. Both start as `null`. |
| `run(configuration, options?)`, `pause()` | Return `void`. Failures to start or pause arrive through `sessionDidFailWithError`. |
| `add(anchor)`, `remove(anchor)` | Return `void`. The native anchor is created during a later frame, and failures arrive through the delegate. |
| `raycast(query)` | Returns `Promise<readonly XRFXRaycastResult[]>`, because browser hit-test setup and the next frame are asynchronous. Rejects with `requestFailed` if the session is not running. |
| `XRFXSessionRunOptions` | Bit flags: `resetTracking`, `removeExistingAnchors`, `stopTrackedRaycasts`, `resetSceneReconstruction`. `resetSceneReconstruction` fails with `unsupportedConfiguration`. There is no tracked-raycast API. |
| `XRFXConfiguration` | Abstract base with `worldAlignment` (default `gravity`), `isLightEstimationEnabled` (default `true`) and a static `isSupported`. Use a concrete subclass. |
| `XRFXWorldTrackingConfiguration`, `XRFXOrientationTrackingConfiguration` | Static `isSupported` is a `Promise<boolean>`, because browser support negotiation is asynchronous. It does not promise every configuration property will work. |
| `XRFXWorldAlignment` | `gravity`, `gravityAndHeading` or `camera`. `gravityAndHeading` fails with `unsupportedConfiguration`. |
| `XRFXFrame` | `timestamp` in seconds, `camera` and `anchors`. |
| `XRFXCamera` | `transform` and `projectionMatrix` as immutable column-major `AFXTransform3D` values, plus `trackingState`. |
| `XRFXTrackingState`, `XRFXTrackingStateReason` | Browser frames report `notAvailable`, because WebXR does not expose tracking-quality information. |
| `XRFXAnchor` | `new XRFXAnchor(transform)` or `new XRFXAnchor(name, transform)`. Has `identifier` (an `NSEUUID`), `name` and `transform`. |
| `XRFXRaycastQuery` | `new XRFXRaycastQuery(origin, direction, target, targetAlignment)` with immutable 3D vectors. |
| `XRFXRaycastTarget`, `XRFXRaycastTargetAlignment` | The browser supports `estimatedPlane` with `any` alignment only. |
| `XRFXRaycastResult` | `worldTransform`, `anchor`, `target` and `targetAlignment`. Results never invent a plane anchor or classification. |
| `XRFXError` | Error domain `ARErrorDomain`, with a `code` such as `cameraUnauthorized`, `unsupportedConfiguration`, `sensorUnavailable` or `requestFailed`. |

The delegate can implement `sessionDidUpdateFrame`, `sessionDidAddAnchors`, `sessionDidUpdateAnchors`, `sessionDidRemoveAnchors`, `sessionDidFailWithError`, `sessionWasInterrupted` and `sessionInterruptionEnded`. Frame and anchor data are copied while the browser callback is still valid, before the Dispatch delivery. Changing or pausing a run invalidates callbacks from the old run, and suspending the queue does not hold on to a native frame.

## Browser behaviour

World tracking runs as an immersive AR session and orientation tracking as an inline session. `gravity` alignment uses WebXR's local reference space; `camera` uses the viewer space. Compass heading and light estimation cannot be guaranteed and fail explicitly, so set `isLightEstimationEnabled` to `false` before running. If the browser supplies no pose or projection, no camera frame is produced. XRFX creates and releases the WebGL layer with the native session and does not expose a renderer.

Running the same configuration again keeps the current session. Changing the configuration, or resuming after `pause()`, needs `resetTracking`, because the browser cannot carry tracking across a new native session. If that would drop existing anchors, also pass `removeExistingAnchors`; without it the call fails with `unsupportedConfiguration`.

Creating a native anchor needs a supported anchor feature and a rigid transform. Otherwise the session reports `unsupportedConfiguration`; anchors are never simulated. Removing an anchor while its creation is pending discards the late result.

Raycast results are copied in their native frame, and the hit-test source is cancelled before the promise settles. Plane-specific targets or alignments fail with `unsupportedConfiguration`. There is no `XRFXPlaneAnchor`, because the adapter has no plane-detection path.

If the browser ends the session on its own, XRFX frees its slot, clears the current run and frame, and invalidates queued and in-flight work. There is no "session ended" delegate method; start again with `resetTracking`. Native sessions, layers, anchors and hit-test sources that arrive after cancellation are released without affecting a replacement session, and ownership is rechecked whenever one crosses an asynchronous hand-off. A browser denial is recorded before conversion at setup, frame, anchor, raycast and finalisation. Real devices also need compatible hardware, HTTPS, a permissions policy that allows XR, and user activation.

## Not included

XRFX does not cover VR, face or body tracking, scene reconstruction, world maps, collaboration or persistent anchors, and it has not been accepted on native hardware. Older client and factory, capability and status, mode and reference-space, and browser-options APIs have been removed with no aliases; use the classes above or `useXR()`.
