# VideoFX phase 4 report

Implemented new AVPictureInPictureController and AVRouteDetector analogues, browser presentation adapter, mounted client, component-scoped presentation hook, and SCContentFilter-shaped element target value. Added optional capture-session filtering through the browser adapter, VideoCaptureService and useVideo. Only the private session-owned already-granted display track can be filtered; no public raw tracks.

## Integration contracts

- `createMountedVideoPresentationClient(adapter,mountSignal,permissions,authorise?)`; permissions are video.pictureInPicture and video.route. Client supports capabilities(target), createPictureInPictureController(target,signal?), createRouteDetector(target,signal?).
- Root SCOS/context: `videoPresentation: VFXVideoPresentationClient`, hook export useVideoPresentation.
- New public exports required from VideoFX/public.ts: VFXContentFilter value, VFXPictureInPictureController, VFXVideoPresentationClient, VFXVideoPresentationCapabilities, VFXPresentationAuthorizationStatus; VFXRouteDetector and VFXRouteConnectionState.
- Browser adapter constructed with `(document|null,{RestrictionTarget?,CropTarget?})`; requires explicit host injection, no global reads.
- Pass browser presentation adapter as second argument to BrowserVideoCaptureAdapter.
- VideoCaptureServiceSessionOptions new `reauthoriseElement?:()=>boolean` threaded into host.createSession third argument. MountedVideoClient must supply callback requiring BOTH video.capture.display and video.capture.element and expose guarded optional setContentFilter forwarding. After its policy commit became clean, this agent added the dual permission callback and forwarding.
- Root architecture: register mountedVideoPresentationClient resource-scope host seam per existing patterns. Its adapter contract is structural VFXVideoPresentationAdapter in VFXPictureInPictureController.ts, not exported from the public barrel; no concrete platform import. Undefined adapter supports SSR/fake unavailable capability queries and rejects factories with NotSupportedError.
- Root owns NSERoutePickerView: detector capabilities.remotePlayback, areRoutesAvailable:boolean|null, connectionState, authorizationStatus/requestAuthorization, startDiscovery/stopDiscovery, subscribe(listener):remove, prompt(),dispose(). Availability stays unknown until watch callback.

## Validation

Initial test collection briefly blocked by shared tsconfig JSON edit, then RED on absent implementations. Element capture meaningful RED: missing session setContentFilter. Focused final run: video-presentation, video-element-capture, existing video-capture = 19/19 passing. Both full and authoring typechecks currently fail on concurrent policy/phase5 integration diagnostics (full also expected missing network/videoPresentation SCOS context). Local implicit-any diagnostic in service fixed. Architecture currently stops on missing phase5 alias registrations, root-owned. No browser/human device or real chooser acceptance claimed.

## Ownership

Only brief-owned new presentation files, tests, clean capture files authorized by root, and clean video.md were changed. The mountedVideoClient policy work was committed before this agent added guarded forwarding. Commits use --only explicit paths to avoid consuming others' staging.

Follow-up: shared policy commit 6a7f91a observed with mountedVideoClient clean; mounted permission forwarding added and tested. createMountedVideoPresentationClient now accepts undefined adapter. Full typecheck and authoring remain blocked solely by root shared facade integration; architecture blocked phase5 missing alias registrations.
