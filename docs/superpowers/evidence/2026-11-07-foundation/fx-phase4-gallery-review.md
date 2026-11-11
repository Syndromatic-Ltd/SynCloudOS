# Phase 4 gallery source review

Reviewed pending site `src/SynWare/NSEControlGallery.app/Contents/Gallery/FXCapabilitiesSection.tsx`, `catalogue.ts`, `sections.ts` and `Info.ts` against current framework source APIs. Read-only review; no site source modified and no suites run. The installed gallery SDK is known stale until root adoption and is not treated as evidence of API defects.

Paths below are relative to the site worktree unless marked framework.

## Concrete findings

1. **P2 — unavailable/denied presentation authority can crash the entire capabilities section.** `FXCapabilitiesSection.tsx:92` creates both presentation controllers in an effect without catching synchronous factory errors. Current framework `mountedVideoPresentationClient.ts` deliberately throws NotSupportedError when the host port is absent, and SecurityError when entitlement/profile authority is denied. Those are supported states. They bypass the gallery status field because the exception occurs in the effect, rather than inside a command handler. Probe current client capabilities, catch construction failures, clean up any partially created controller and keep unaffected examples visible. Absence of a particular browser PiP API with a present adapter already returns a controller with false capabilities; the failure here is unavailable host/denied authority, not merely Chromium lacking an API.

2. **P2 — asynchronously discovered route availability never updates the example status.** `FXCapabilitiesSection.tsx:109` reads areRoutesAvailable only once when startDiscovery resolves. The browser's watch ID promise can resolve before its availability callback, so the message becomes “Waiting for route availability.” permanently even when a later callback reports routes. VideoExample never subscribes to the detector. Subscribe to its state/availability changes and derive status from the current snapshot; preserve the real-gesture prompt path. NSERoutePickerView independently subscribes for its own connection/enablement state, but that does not update this sibling status field.

3. **P2 — display sharing lacks an in-gallery stop action and state observation.** `FXCapabilitiesSection.tsx:110` starts capture; `:111-112` only apply/clear filters. There is no command that ends display capture while staying on the section, and the component never subscribes to capture state. Clearing a filter keeps sharing active, including when the user merely intended to finish the demo. Stopping via browser chrome leaves the last “Display capture is active” text unchanged and filtering commands enabled. Add explicit stop/restart ownership UI, observe the session state and gate capture/filter actions using active state plus display/elementRestriction/elementCrop capability flags. The capture hook's cleanup does correctly dispose the private display stream on section exit; this is missing interactive ownership/state feedback, not an unmount leak. Since dispose is terminal for this hook-issued session, restarting needs a fresh session owner/remounted capture subcomponent rather than reusing a disposed object.

4. **P3 — normal Stop speech is subsequently shown as an error.** `FXCapabilitiesSection.tsx:42` stops speech and sets “Stopped.”; the outstanding speak promise's rejection handler at `:39` then runs in a microtask and overwrites it with AbortError, which the framework intentionally uses for cancellation. This makes a successful ordinary stop appear to fail. Track operation identity and treat a user-requested AbortError as cancellation status; stale earlier utterance completions should not replace the latest command's message.

## Checked without additional findings

- `catalogue.ts:18` destination id/category/API names match `sections.ts:18`; the effects category exists. `Info.ts:22` declares the used speech/session/presentation/display/element/network/location entitlements. Crypto correctly requires no device entitlement. No audio.record entitlement is needed for category-only use.
- Action UI uses real NSEButton, NSEStackView, NSETextField and NSERoutePickerView. The raw div/video are presentation targets, not substitute button controls.
- Presentation-controller creation occurs in a passive effect after useVideoPresentation's layout-effect lifetime is established; it does not call the facade during render. Hook/effect identity is stable with the current source implementation.
- Preparation owns its canvas stream and stops previous tracks before replacement and on effect cleanup. It does not expose the host-owned display capture stream to app code. useVideo owns the separate display capture and aborts late acquisition on unmount.
- PiP and remote chooser calls remain directly in user click handlers, without an awaited setup before the native activation-sensitive call. Location.current and network monitoring use current names and units; network cost remains explicitly unknown. Crypto uses NSEData byte inputs/outputs and current AES.GCM/SHA APIs.

No installed-package, real-browser visual, physical route, microphone, location or display-capture acceptance is claimed by this source review.

## Authorised gallery remediation

Root subsequently authorised fixes in FXCapabilitiesSection.tsx only; the original findings above describe the reviewed pre-fix state.

- PiP/route factories are caught independently. Partial route ownership is disposed if subscription setup fails; a missing feature no longer suppresses the other examples. Feature errors appear in status text.
- Route snapshot subscription drives late availability/connection changes and unsupported-state feedback. Chooser errors remain visible even after discovery has begun.
- Display capture now has a component-owned raw SDK capture-session ref with subscription. “Stop capture” removes the old subscription, disposes the private session/late acquisition, and creates a fresh passive owner so capture can restart. Effect cleanup unsubscribes/disposes the current owner on section exit. Browser-ended sharing updates status. Capture and filter buttons respect state plus display/element capabilities.
- Filter application explicitly rejects missing optional setContentFilter with NotSupportedError; no optional-call no-op remains. Clearing a filter explains that sharing stays active. Capture operation generations suppress stale start/filter status after a stop/restart.
- Speech operation generation changes before Stop; cancelled earlier speech cannot overwrite the successful stopped status. Unmount also invalidates prior speech callbacks.
- Local preview construction now checks 2D/captureStream support and reports NotSupportedError rather than dereferencing a missing context.

Validation: TypeScript transpileModule of the exact edited TSX source reports zero syntax diagnostics. `npm.cmd run check` in the site ran and failed against the known old installed archive: missing phase-4 exports/subpaths/setCategory/filter capability flags plus ongoing entitlements/configuration-profile API migration. This is not an adopted-SDK typecheck pass. Root retains installed SDK adoption, actual site typecheck/tests/screenshots and commit. No site commit or other site source edit was made by this agent.
