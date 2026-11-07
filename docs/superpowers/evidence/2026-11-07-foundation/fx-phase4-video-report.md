# VideoFX phase 4 report

Implemented new AVPictureInPictureController and AVRouteDetector analogues, browser presentation adapter, mounted client, component-scoped presentation hook, and SCContentFilter-shaped element target value. Added optional capture-session filtering through the browser adapter, VideoCaptureService and useVideo. Only the private session-owned already-granted display track can be filtered; no public raw tracks.

## Integration contracts

- `createMountedVideoPresentationClient(adapter,mountSignal,permissions,authorise?)`; permissions are video.pictureInPicture and video.route. Client supports capabilities(target), createPictureInPictureController(target,signal?), createRouteDetector(target,signal?).
- Root SCOS/context: `videoPresentation: VFXVideoPresentationClient`, hook export useVideoPresentation.
- New public exports required from VideoFX/public.ts: VFXContentFilter value, VFXPictureInPictureController, VFXVideoPresentationClient, VFXVideoPresentationCapabilities, VFXPresentationAuthorizationStatus; VFXRouteDetector and VFXRouteConnectionState.
- Browser adapter constructed with `(document|null,{RestrictionTarget?,CropTarget?})`; requires explicit host injection, no global reads.
- Pass browser presentation adapter as second argument to BrowserVideoCaptureAdapter.
- VideoCaptureServiceSessionOptions new `reauthoriseElement?:()=>boolean` threaded into host.createSession third argument. MountedVideoClient must supply callback requiring BOTH video.capture.display and video.capture.element and expose guarded optional setContentFilter forwarding. That file remains dirty from policy work; this agent has not touched it yet.
- Root architecture: register new mountedVideoPresentationClient host seam import and host-only presentation-adapter import according to existing patterns.
- Root owns NSERoutePickerView: detector capabilities.remotePlayback, areRoutesAvailable:boolean|null, connectionState, authorizationStatus/requestAuthorization, startDiscovery/stopDiscovery, subscribe(listener):remove, prompt(),dispose(). Availability stays unknown until watch callback.

## Validation

Initial test collection briefly blocked by shared tsconfig JSON edit, then RED on absent implementations. Element capture meaningful RED: missing session setContentFilter. Focused final run: video-presentation, video-element-capture, existing video-capture = 17/17 passing. Both full and authoring typechecks currently fail on concurrent policy/phase5 integration diagnostics (full also expected missing network/videoPresentation SCOS context). Local implicit-any diagnostic in service fixed. Architecture currently stops on missing phase5 alias registrations, root-owned. No browser/human device or real chooser acceptance claimed.

## Ownership

Only brief-owned new presentation files, tests, clean capture files authorized by root, and clean video.md were changed. Policy-owned dirty mountedVideoClient has not been overwritten. Commits use --only explicit paths to avoid consuming others' staging.
