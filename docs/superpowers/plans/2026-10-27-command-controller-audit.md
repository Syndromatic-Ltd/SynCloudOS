# Command/controller hardening audit — 27 October 2026

Scope: the paired `webspring-folders/framework` and `site` checkouts. Changes stay local; the site consumes a checksum-verified SDK archive. This is a bounded audit and repair, not completion of the proposed 6E authoring migration.

## Design authority

- [6B conventions and app-bound SCOS](../../../../specs/2026-10-19-6b-conventions-scos-design.md): applications declare behavior; the framework owns composition and runtime plumbing.
- [6C class layer](../../../../specs/2026-10-19-6c-appkit-class-layer-design.md): application/window/view-controller containment, actions, validation and observable state, retaining React views.
- [6E research](../../../plans/2026-10-24-cocoa-authoring-6e/research-and-baseline.md) and [design](../../../plans/2026-10-24-cocoa-authoring-6e/design.md): Cocoa target-action, shared availability, structural ownership and cooperative cancellation. Its proposed decorators, descriptors, construction and task APIs remain separate work.
- Current [commands](../../framework/commands-responders-undo.md), [controllers](../../framework/controllers.md), [applications](../../framework/applications.md) and [authentication](../../framework/authentication.md) define the implemented contracts.

App authors keep ordinary `@action`, `validate<Name>()`, `@observable` and action-bearing controls/menu items. No app-level focus scheduler, presentation-generation accounting or new public API was added.

## Reproduced and repaired

| Boundary | Failure and framework repair |
| --- | --- |
| Completed local sign-in | Navigation API interception retained the anonymous runtime after the cookie changed. Verify a direct return to the requested path before navigating and publish identity before authentication UI subscribers. External provider redirects retain their normal navigation. |
| Identity reads/end | Delayed reads or logout completions could overwrite newer adapter authority. Fence async completions across newer operations and notifications; retain material authorization revocation and identical-session stability. |
| Pending authentication checks | A superseded adapter read returned null just because UI status was checking; checking also removed expiry. Keep last-confirmed identity and its expiry until a server decision, successful logout or expiry replaces it. |
| Sign-in ordering | Passive focus checks could cancel explicit pending sign-in. Apply the existing explicit-logout ordering discipline to sign-in; newer explicit operations still supersede old work. |
| Repeat login | Logout cleared provider descriptors and left the gate without buttons. Preserve known methods while clearing identity; the next login verifies fresh authority. |
| Application sessions across logout | Suspending only the active app retained class controllers after their windows and service subscriptions were revoked. Terminate every open app through its normal lifecycle before ending identity; honour termination vetoes and save failures. A later login constructs fresh app resources. The two-cycle browser journey exposed this after the initial one-cycle repair. |
| Cancelled lifecycle operations | Uncommitted launches and committed closes could retain class sessions if hooks were cancelled/skipped/stalled. Operation-owned cleanup now releases abandoned initial sessions and closed sessions while preserving committed active apps and pre-commit vetoes. Commit-aware abort handling waits for synchronous lifecycle-state publication when cancellation arrives inside the operation's committed notification. |
| Disposed action targets | Disposed controllers retained executable actions. Bind registrations to owner lifetime, check liveness at validation/execution, and notify managed views on disposal. |
| Application-dependent validation | Window actions ignored observable application changes. Observe recorded ownership ancestors and remove all subscriptions with the binding; never discover ancestry through arbitrary app getters. |
| Invalid validators | A declared non-callable validator silently enabled its action. Diagnose at binding/refresh and fail closed if later corrupted. Absent validators retain normal default availability. |
| Hot refresh | Partial registration failures left a partially updated responder. Apply all-or-nothing cleanup to refresh as well as initial binding. |
| Payload shape | Function.length classified default/rest parameters as parameterless. Distinguish empty runtime method declarations; preserve explicit schemas and ordinary parameterless payload rejection. |
| Cached availability | Custom senders ignored clicks before availability repaint. Freshly validate the actual payload and prepare canonical dispatch; do not use cached UI as the admission decision. Hidden/denied/disabled/stale UI actions remain unavailable. |
| Popup focus restoration | Unconditional awaiting made synchronous validation stale during the sender's own closing commit. Preserve synchronous completion and keep genuine asynchronous validation fenced. Pin the validated target to the canonical acceptance; retain command-registry, binding, owner and exact one-shot ticket checks. Changed targets and declarations remain rejected. |
| Nested picker/menu ancestry | Picker, listbox and callback-menu defaults bypassed the owning class controller and used application modal ancestry. Inherit the existing internal controller context like ordinary popups. Production-host regressions exercise callbacks inside a modal without explicit focus provenance. |
| Visibility during preparation | Review reproduced an action becoming hidden between fresh presentation validation and final preparation. Keep that validation's hidden fact on the opaque one-shot acceptance through the mounted projection; UI senders reject it. Menu/toolbar preparation also respects hidden, while direct API admission retains enabled/denied semantics. No public authoring API was added. |
| Late sender callbacks | Async completion could commit a value/selection after unmount/rebinding. Recheck the sender lease after execution and suppress obsolete UI callbacks. |
| Validation resources | Successful refresh leaked parent abort listeners. Always release completed validation leases; repeated-refresh tests check balanced listener cleanup. |
| Radio availability/navigation | Command-denied options remained interactive; review caught keyboard navigation targeting them after the initial fix. Share effective availability with arrows and the group's tab stop, including when the selected option becomes disabled. |
| Disposed construction owners | Disposed/releasing scopes accepted new controllers. Reject acquisition before subclass field side effects, including acquisition during teardown. |
| Content replacement | Rejected adoption corrupted a window's content pointer. Adopt before committing the pointer; rejected assignments preserve prior content, ownership and snapshot. |
| Exclusive containment | Two windows, or a window and a parent view, could claim one controller. Track root containment separately from initial lifetime ownership and reject conflicting claims. |
| Failed construction | Framework-controlled constructors leaked acquired scopes/resources on failure. Roll back all cleanup steps and preserve the original construction error. |
| Disposal observers | Throwing teardown left managed views mounted. Notify from a finally boundary and continue disposing owned resources despite individual failures. |
| Overlay teardown | Aborted owners still requested obsolete popup state updates during React insertion cleanup. Skip UI dismissal/restoration/re-registration and React store notifications once the owner signal aborts; synchronous manager/controller authority cleanup still runs. Nested picker and menu regressions assert the warning is absent. |
| Publisher creation focus | A 60 ms timer selected the current mutable title ref after creation, even after another control claimed focus. Replace it with an observable canvas intent bound to post/session identity and consumed once at the matching view's layout commit. Respect a newer focus owner and clear the intent when the view leaves. A deterministic clock regression caught the old late call. |

Every repair has a failing-before-fix regression. The independent review's radio-navigation and hidden-custom-action findings were reproduced and corrected.

## Activation paths inspected

Action registration and `useAction`; push/tool buttons; text/checkbox/radio/search senders; picker candidates; visible/overflow segments; command menus/submenus/context menus; configured toolbar buttons and toolbar overflow; app-menu ancestry; class application/window/view responders; canonical command preparation, dispatch, failure and cancellation.

Earlier menu/toolbar repairs remain: standard UI reacquires current presentation, while direct stale controller calls fail closed. Menu dismissal/reopen and changed command/payload/target fences remain. Picker candidates prepare their own payload instead of inheriting the current option's disabled state. Command errors/cancellation do not become successful value commits. Existing post-await authorization and command-outcome fences remain.

## Remaining boundaries

A raw nested JavaScript `new Root()` does not establish a separate ambient scope for its resource fields. Those fields need `owner: this`; `addChild(ControllerClass)` creates a managed child scope. Passing an owner only to Root does not retarget its fields. The base class cannot infer arbitrary derived-constructor return/throw boundaries. Raw direct constructors caught by app code have the same rollback limit. Tests record the limit and the explicit-owner remedy; no heuristic or new factory pretends to solve it.

Application promises still need cooperative cancellation and owner checks before later mutations. Suppressing obsolete sender callbacks does not imply forced cancellation, arbitrary-effect rollback, Swift actors or complete AppKit parity.

Production OIDC and physical-device/GPU acceptance need their own environments. Local acceptance uses the preview founder method and ordinary app UI. `/__dev/login` remains local preview infrastructure. Dirty package provenance remains explicit; release checks are not weakened.

## Validation

The final framework run passed 28 shared authentication/action/controller/control/overlay/lifecycle suites, **491 tests**, with no insertion-effect warning. Independent review found no remaining blockers after the radio-navigation, hidden-at-preparation, nested callback ancestry and commit-notification cancellation corrections. The paired site passed **8 Node and 219 Vitest tests** and its production build, including the created-title focus regression. Installed package provenance and browser journeys are recorded in the implementation plan and site HANDOFF after execution.
