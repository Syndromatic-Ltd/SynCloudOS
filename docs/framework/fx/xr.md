# XRFX

XRFX follows ARKit's session, configuration, frame and anchor concepts using WebXR. It is a minimal pose-delivery API, not an ARKit implementation or a renderer. Import `XRFXConfiguration` and the public types from `@syndromatic/syncloudos/fx/xr`; obtain a session with `useXR()` or `useSCOS().xr.createSession(signal?)`.

Declare `xr.session` in `Info.ts` entitlements. The mounted session checks that declaration and host authorisation before starting. Capability inspection and construction never request a native session.

```ts
import { XRFXConfiguration } from "@syndromatic/syncloudos/fx/xr";

const session = useXR();
const configuration = new XRFXConfiguration({ mode: "inline" });
if (await session.isSupported(configuration)) {
  // Run directly from a user action for immersive modes.
  await session.run(configuration, frame => {
    console.log(frame.timestamp, frame.viewerTransform, frame.anchors);
  });
}
await session.pause();
```

| Public API | Role |
| --- | --- |
| `XRFXClient` | `getCapabilities()`, `createSession(signal?)` |
| `XRFXSession` | `getAuthorizationStatus()`, `isSupported(configuration)`, `run(configuration, listener)`, `pause()`, `dispose()` |
| `XRFXConfiguration` | Immutable mode, reference space, required and optional WebXR feature names |
| `XRFXFrame` | Immutable monotonic timestamp in seconds, viewer transform and anchors |
| `XRFXAnchor` | Session-local identifier and transform, or null when tracking is unavailable |
| `XRFXCapabilities` | Secure API presence; native ARKit and native world tracking are not claimed |
| `XRFXSessionMode`, `XRFXReferenceSpace` | Supported WebXR mode and reference-space spellings |
| `XRFXAuthorizationStatus` | `unknown`, `prompt`, `granted`, `denied`, `unavailable` |

Modes are `inline`, `immersive-vr` and `immersive-ar`. The default reference space is `viewer` for inline and `local` for immersive sessions. `isSupported()` asks WebXR for mode support; it does not prove that every requested feature or reference space will work. Required feature failures remain browser errors. A successful `run()` means the browser granted that session, not permanent permission. Status returns to `unknown` when it ends, and to `unavailable` after disposal or on an unsupported host.

Transforms are copied column-major matrices in the requested WebXR reference space. A missing viewer pose is null. Anchor snapshots include only real `trackedAnchors` supplied by WebXR when the anchors feature is available and granted. Identifiers are stable only within this XRFX session. This API does not create anchors, persist them or fabricate anchors from viewer poses.

`pause()` ends the native session; resuming requires another `run()` and can require another browser gesture. Owner disposal cancels frame scheduling and ends the session, including a late native grant after cancellation. The browser host installs an owned WebGL layer on a detached canvas to enable actual frame delivery, and releases its context when the session ends. This API delivers poses and exposes no scene renderer. Frames and poses depend on the browser and device. A host without a compatible layer fails explicitly when starting.

ARKit plane detection, scene reconstruction, face/body tracking, world maps, collaborative sessions, raycasts and persistent anchors are omitted. API presence is never reported as proof that these native features exist. Immersive modes require a compatible runtime/device, HTTPS, permissions policy and user activation.
