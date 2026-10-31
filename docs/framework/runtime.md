# The runtime and the host

The SynCloudOS runtime is the kernel every other layer stands on. A host creates it, boots it, hands your applications scoped sessions and disposes of it when the page ends. Most developers meet the runtime through `mountSynCloudOS`, which builds and owns one for you.

## What the runtime provides

| Service | Role |
| --- | --- |
| Statechart | Tracks the application lifecycle (launch, active, suspended, closed) and the shell's own states. Transitions are explicit and observable. |
| Commands and responders | Dispatch typed commands along the responder chain. See [commands, responders and undo](commands-responders-undo.md). |
| Undo | Owns undo histories for the application and for each document. |
| Documents | Live editing sessions with autosave, recovery, versions and conflicts. See [documents](documents.md). |
| Windows | Ordering, key and main state, restoration and compact presentation. See [windows](windows.md). |
| Services | A registry of host services with availability, versions and permissions. |
| PolicyKit | Decides whether a subject may take an action, from roles, capabilities and access modes. |
| Locale | Locale bundles, formatting and translation. |
| Persistence | Namespaced preferences and durable storage. |
| Scheduler | An injectable clock and frame scheduler, so time is testable. |

## Mount a runtime

`mountSynCloudOS` renders the shell into a page element and returns a handle to dispose it.

```tsx
import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/browser/styles.css";
import "@syndromatic/syncloudos/webspring/styles.css";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";

const host = await mountSynCloudOS({
  element: document.getElementById("root")!,
  authentication: "disabled",
});

window.addEventListener("pagehide", () => void host.dispose("page hidden"));
```

The options are:

| Option | Purpose |
| --- | --- |
| `element` | The page element that receives the shell. |
| `composition` | Explicit project composition for hosts without the Vite plugin. The plugin injects its discovered project when this is omitted. |
| `bundles` | The SynWare bundles to register. Each is a definition or a discovered descriptor. The [Vite plugin](getting-started.md#enable-folder-discovery) generates the list for you. |
| `shell` | The [Webspring](webspring.md) definition. |
| `shellResources` | Icons, strings and other resources for the shell. |
| `authentication` | `"disabled"` for open sites, or an [authentication configuration](authentication.md). |
| `policyProfile` | Your host's role taxonomy. See [Policy](#policy). |
| `contributions` | Host contributions, described below. |
| `deploymentBasePath` | A URL prefix when the site lives below the domain root, such as `/product/`. Routes inside the runtime stay rooted at `/`. |

`dispose(reason)` resolves with a report of the teardown. Disposal is idempotent, and the runtime aborts its signal first, so every registered task can stop before its resources are released. During hot module replacement, call `host.dispose()` from `import.meta.hot?.dispose`.

Application close revokes mounted capability signals before observers see the terminal `closed` state. Revocation follows close approval; a refused close or suspension does not revoke the application's remaining mounts. An exit presentation may retain hidden content, but its old capabilities stay revoked. Reopening obtains fresh mounts.

## Ownership

Each runtime owns its store, services, queues and registries. Two runtimes on one page share nothing, which makes tests and embedded previews straightforward. Applications never hold the runtime. They receive the session described in the [SDK guide](synware-sdk.md), which projects only the capabilities the application is entitled to.

The host supplies the environment: viewport geometry, safe areas, input services, storage and the clock. Code inside the runtime reads those through injected adapters, so it behaves the same in a browser, a test host and an embedded frame.

### Document-store locking

Low-level hosts may supply `SynCloudOSRuntimeConfig.documentStoreLock`, using the
existing `SynCloudOSDocumentStoreLock` contract. A trusted host contribution may
supply the same field in its `runtimeConfig`. The supplied lock takes precedence
over the browser Web Locks adapter and must coordinate **every writer sharing
the backing persistence**, not merely one runtime instance. Conditional writes
remain unavailable when neither lock is present; they never degrade to an
unchecked write.

Large browser DocumentStore snapshots retain repeated image/media strings once
in a private lossless string-table representation. Every document, revision,
version and idempotency receipt is retained; public snapshot import/export stays
at schema 2. Existing snapshots are read without migration or data deletion and
compact automatically on the next successful write. The private storage envelope
uses a higher schema discriminator so older writers refuse it rather than
overwriting unfamiliar data. Reference expansion is bounded and malformed compact
snapshots are rejected. Unique data can still exceed the browser's storage quota;
that failure reports full/unavailable storage, not a missing lock, and does not
replace the prior saved document.

The portable test host owns isolated persistence and a real per-name exclusive
queue for that store. Its local queue is not a cross-context lock for a shared
browser or server store.

### Editing published DocumentStore records

An existing `saveDraft` call can retain publication when its input explicitly
sets `publishState` to the same `"published"` or `"unlisted"` state as the current
canonical record. This edits the live record with one mutation and one new
storage version, without an intermediate draft or a second `publish` write.
The operation requires both the existing draft-write authorization and the
existing publish authorization, including the kind's publish permissions.
Authorization denial leaves the record, version history and idempotency records
unchanged and emits no save event.

Publication is retained only for that explicit state match. A new record,
a request to change between published and unlisted, or an omitted publication
state continues to stage a draft; initial publication and publication-state
changes use `publish`. Omitted `publishedAt` and `canonicalUrl` fields retain
their existing values, while explicit input values replace them.

The usual `ifMatch` and persistence-lock requirements apply to the single save.
A stale ETag or rejected conditional persistence write preserves the previous
published record. Hosts should use this save contract for live-content edits
instead of composing a draft save followed by republishing.


## Policy

PolicyKit checks every privileged action, such as launching an application, opening a route, using a service, posting a notification or entering the shell. A decision comes from three inputs:

- the subject's **role**, resolved from the signed-in session by your policy profile
- the subject's **capabilities**, granted by the role and by the session's access class
- the **access mode** of the host, one of `fullyLocked`, `webspringVisibleAppProtected`, `public`, `mixed`, `developer` or `enterprisePrivate`

An application states what it needs in its manifest `runtime.policy` block: `public`, `requiresLogin`, `requiredCapabilities` and `requiredAccessClasses`. A `SynCloudOSPolicyProfile` defines the roles your host has, the capabilities of each, the anonymous role and how a session maps to a role.

```ts
import type { SynCloudOSPolicyProfile } from "@syndromatic/syncloudos/browser";

export const policyProfile: SynCloudOSPolicyProfile = {
  id: "example",
  roles: {
    guest: ["app.open.public"],
    member: ["app.open.public", "app.open.members"],
    admin: ["*"],
  },
  anonymousRole: "guest",
  resolveRole: (session) => (session.isAuthorised ? "member" : "guest"),
};
```

A role the profile did not declare falls back to `anonymousRole`, so an unknown claim never widens access. The wildcard `"*"` grants every capability.

## Host contributions

A host contribution lets a deployment add services, document types, storage adapters, policy and seed data to a runtime before it boots. Create one with `createSynCloudOSHostContribution(id, source, prepare)` and pass the list through the `contributions` option. Each contribution installs through narrow ports and returns a cleanup that the runtime calls at disposal, so a contribution can never outlive its runtime.

## Constrained devices

Each runtime watches capability signals from its environment: logical processors, approximate device memory, the data saver preference, connection quality, long main thread tasks and memory warnings. It never inspects device models or user agents. On a constrained host it runs one heavy job at a time, lowers its cache budget and stops speculative prefetching. Brief bursts do not trip the policy, and brief recovery does not lift it. The policy leaves accessibility settings alone, so reduced motion remains the user's choice.

## Accessibility across presentations

The host keeps focus, route announcements and keyboard ownership at the runtime boundary, in desktop, tablet and mobile presentations alike. Application code reads geometry and safe areas from the presentation traits, and never from ambient globals.

`ScreenService` owns the host geometry sample. `geometryState` is `current` when its layout, visible viewport and work area form a finite, positive usable sample; `retained` when a temporary invalid measurement has kept the last complete valid sample; and `unavailable` before any valid sample exists. A missing visual viewport API uses layout bounds. An invalid visual measurement does not mean that API is missing. Initial unavailable geometry is not rendered as a miniature placeholder window. Restored windows still load through their normal controller lifecycle and become presentable when geometry arrives.

Content-bound presentation traits carry the same `geometryState`, also retaining their last valid content bounds through invalid content measurements. `safeAreaAvailability` is `available`, `unavailable` or `unknown`: measured zero insets are different from unavailable measurements. The browser adapter explicitly reports `unavailable`; CSS surfaces continue to own their `env(safe-area-inset-*)` padding. Existing external host adapters that omit `RuntimeWorkAreaSnapshot.safeAreaAvailability` report `unknown` until they declare whether the supplied insets are measurements. Valid legacy inset numbers remain available as compatibility values, without an availability claim. An adapter that declares unavailable or supplies invalid insets yields zero inset values with unavailable metadata. Do not subtract those insets again from a host-provided work area.

Regular and wide windows whose normal height exceeds the usable visual/work intersection receive a temporarily fitted presentation height. This also covers a regular-width viewport reduced by keyboard-shaped occlusion. Their normal bounds and minimum size remain unchanged, so a later larger viewport restores the normal frame. Existing deliberate positioning remains in effect when the normal height fits. Read these presentation values through the owning window/view controller; do not persist the fitted frame as a new normal size merely because the viewport changed.

WindowHost supplies its controller-owned zoom state to the presentation projection. Zoomed frames follow the current usable work area while normal bounds stay in the controller. Restoration preserves zoom/minimised intent even when initial geometry is unavailable; it does not write the placeholder rectangle into the restored window's normal bounds.

## Capability status and explicit save/share actions

`SCOS.share.getStatus(request?)` and `SCOS.filePanels.getStatus()` project facts from their existing services. They separate effective availability, provider (`native`, `browser-input`, `download`, `none`), current transient activation and unknown browser permission. They do not request permission, open native UI or create a second permission authority. Inspection uses PolicyKit evaluation; explicit actions use PolicyKit admission and manifest declarations. Newly exposed file write/export authority requires `file.write`. Read-only file input retains its existing manifest contract.

`SCOS.share.perform(request, ownerSignal)` distinguishes `shared`, `cancelled`, `unsupported`, `denied`, `aborted`, `invalid` and `failed`. A fulfilled native promise means platform handoff, not proof of delivery to a recipient. `NotAllowedError` alone does not prove a persistent user permission denial; browser refusal remains a distinct reason. The legacy `share()` convenience method retains its shared/cancelled result and exception behavior, including its old unsupported-to-cancelled mapping; new actions should use `perform`. Native `Navigator.share` and `canShare` keep their receiver. Invocation begins before the first await. Unknown activation observation is not manufactured into either a grant or a denial; the native API remains authoritative. Caller abort fences late outcomes but cannot close an OS share sheet, so its busy lease remains until native settlement.

Permissions Policy introspection is advisory only for features that the implementation recognizes. Some native-share browsers return false and an unrecognized-feature warning for `web-share` through their legacy inspector. That result is unknown, not a policy denial. A recognized explicit policy denial is respected, and the native API still enforces the browser's actual policy.

The browser environment supplies the existing File System Access and download adapters to mounted file panels. Ordinary read-only input retains its portable behavior. Select a save target in the original user action, then serialize content and write through that target with the controller's owner signal. Unavailability may choose a permitted fallback; cancellation or browser/runtime denial must not dispatch a second chooser or download. Persistent-only requests never degrade to a download. Native picker cancellation is different from owner interruption. A download target is one-shot, caller/mount scoped, and has no readable location or overwrite identity; exported means a download was dispatched, not that a file is durable on disk. Export must not mark a document clean as if it were Save As.

Native save pickers expose no trustworthy new-versus-existing bit. Their returned handle is conservatively treated as existing: `fail-if-exists` stays protective, and `confirm-replace` requires caller confirmation. Browser grants/handles are not persisted by this integration. Targets recheck owner and PolicyKit before writing, release references on completion, abort partial native writes through the existing adapter and clean temporary download anchors/object URLs. Cancellation after dispatch cannot retract an OS/browser operation; do not automatically retry an uncertain export.

`AppShareRequest.files` accepts a nonempty readonly array of already prepared `File` objects. Prepare any asynchronous export before enabling the Share action, and cancel preparation when its document/owner changes; do not await serialization inside the gesture. No file handles, promises or lazy producers are accepted. The service brand-checks Files across windows, snapshots/freezes the array and dictionary, and passes that same normalized payload to the full native `canShare` check and `share`. A files-only probe must also succeed, so an older implementation cannot accept a title while ignoring the files. Missing/false/throwing file capability checks return `unsupported`; invalid or empty lists return `invalid`. Undefined optional fields remain omitted.

The existing manifest, PolicyKit, live scope, caller signal, activation and native busy lease apply equally to files. Caller abort cannot retract an OS sheet or make a second share admissible before native settlement. Cancellation or refusal never strips the files and retries text, copies to a clipboard, dispatches a download or sends to a guessed recipient. A caller may separately offer an explicit export action after an initial unsupported outcome. Native handoff still is not recipient delivery. Browser inventory/status tests and injected native contract tests do not establish real OS chooser completion.

Primary contracts: [Web Share](https://www.w3.org/TR/web-share/), [HTML user activation](https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation), [File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access). No broad capability catalogue, service worker, push or hardware permission is added here.

## Observational update readiness

This first contract is on the source host-framework surface (`NSE` and `SynCloudOS` facades). It is not exported from the curated application-authoring SDK. The app SDK remains unchanged; a future app-facing contribution API requires a separate host integration design.

`NSEUpdateReadinessController` is an owned presentation controller for **facts only**. Create it with an application/window/view-controller owner (or that owner's signal), a random per-host `clientInstance`, a bounded `hostBuild`, and an observable `UpdateReadinessInventory`. It has no save, discard, close, reload, activation or permission method. `getSnapshot()` reads the cached immutable projection; `inspect()` synchronously re-reads existing authorities before collecting evidence. Every authority or membership event advances its generation, even when an already-dirty owner remains dirty.

The host must explicitly establish complete coverage of `documents`, `editing`, `tasks` and `native`. An absent inventory, absent coverage, failed subscription, throwing/invalid provider or revoked source returns `unknown`. Do not label an empty domain covered merely because a provider is unavailable. `documentUpdateReadiness` reads the existing document state/dirty revision/unsaved authority; pending synchronization remains conservatively dirty. It does not read models, settle participants or claim that an autosave is current or durable. `textSessionUpdateReadiness` reads existing marked composition, and `editingControllerUpdateReadiness` reads existing transactions. Sources for queued/in-flight recovery writes, synchronization and other tasks must come from the actual service owners. These adapters alone do not prove complete application-host coverage.

`NativeOperationActivity` is optional service-owned instrumentation. Supply the same host-owned activity source to the native share/picker boundary and the host inventory. The boundary tracks the **underlying native promise** before any caller-abort race, so caller completion or cancellation cannot make pending OS UI appear idle. It covers only explicitly instrumented invocations; the normal runtime does not automatically wire it or advertise complete native coverage. Owner abort makes its facts unknown, and late settlement cannot revive a disposed readiness controller. Native file writes and every other outstanding owner task also require real task coverage before a host can declare that domain covered.

`observeUpdateReadiness` collects two short-lived rounds of evidence with the existing runtime environment's timer/UUID ports. The host transport must target an exact owned registration/scope/script, enumerate browser-owned in-scope clients including uncontrolled ones, validate message source and use a fresh private MessageChannel for each exact participant. It must close ports when its supplied signal aborts. Nonces, observer instance, protocol, expected host build, unique client instance and generation are checked; malformed/private extra fields, missing clients, deadlines, membership changes, new owners or intervening edits defer. Only protocol/build/random host instance/generation and coarse blocker categories cross this boundary, never document IDs, titles, models, accounts or private URLs.

The result is `ready-at-observation` or `defer`, always with `activationAuthorized: false`. It is not an admission token, durable acknowledgement, atomic client-membership lock or promise that no edit can follow. A worker/observer restart invalidates its incomplete handshake. The core observation contract adds no root registration, cache, schema migration, automatic reload or forced worker takeover. The host diagnostics integration described below now projects its observations into RuntimeStore. Natural waiting activation remains a browser lifecycle behavior. A future host UI may present these observations through its existing root/settings controller and RuntimeStore projection; actual rollout needs reviewed inventory/service coverage and compatibility decisions first.

## Host update diagnostics in Settings

The source host now derives `runtime.updateReadiness` from published document membership, canonical document state, operation membership, runtime job admission, application-window membership, identity/disposal transitions and the runtime-owned native activity source. Its immutable snapshot is projected to `RuntimeStore.updateReadiness`. Readiness is transient: it is not persisted in preferences, and a historical store snapshot cannot restore update authority.

The existing Webspring System Preferences registry includes an `updates` pane. It displays known dirty/saving/conflicted documents, pending observed operations/jobs/native promises, exact incomplete domains, build restrictions and historical participant observations. Its actions only inspect facts. There is no Update-now, activation, reload, install, save/discard or close action. The regular preference-pane hide/replacement contract also applies to `updates`.

Every current host domain remains explicitly partial until its missing service-owner census exists. Published documents include hidden/windowless documents, but not unpublished admission or cleanup. Operations may logically cancel before hooks/effects finish; managed tasks do not census underlying services. Picker/share completion does not cover later file writes, permissions, clipboard, persistence or media work. Zero observed counts must not be interpreted as quiescence. The detailed owner inventory is retained with implementation evidence.

Native share and browser file-panel factories receive a per-runtime `NativeOperationActivity`; no shared environment port is mutated. Leases follow actual native promises through caller cancellation, and native invocation rechecks the caller after synchronous activity observers. The old uninstrumented environment port remains a compatibility fallback with an explicit coverage gap. Job admission now offers a readonly subscription; cancellation of an admitted job retains its charge until the actual owner releases its lease. Phase/geometry notifications that do not change membership do not create readiness store churn.

Host contributions may provide the captured `runtimeConfig.updateReadiness` options: a bounded `hostBuild`, a restrictive compatibility flag, and an optional owned readonly participant inspector. The inspector must validate its exact scope/script/client/ports and release work when its supplied signal aborts. It is never discovered or registered automatically. Results have strict coarse shape and always carry `activationAuthorized: false`; local work, account or window-membership changes invalidate them, and they expire after a bounded lifetime. A ready observation of inspected participants cannot make incomplete local coverage ready.

The implementation deliberately supplies no compatible-target assertion, worker registration, cache policy, storage migration or production updater. Ordinary app authoring still receives no kernel/runtime readiness escape hatch. A production installed/offline host needs the missing owner-local evidence, compatible old/new assets and schemas, exact public-shell scope/cache allowlist and separately reviewed update admission. Phase 4A's credentialed Windows WebKit cache gate remains unresolved and separate from these cache-free diagnostics.

The native RuntimeStore folds readiness through one owned internal publication slot before its existing public notification. The public batching, no-op mutation and structural-sharing contracts are unchanged: an outer batch publishes once, with current derived facts already present for subscribers. The readiness observer never performs a second store write from that publication. An alternate store without this boundary, or an additional observer while another publisher owns it, receives the explicit `runtime-store-publication` gap and cannot take over the slot. Its direct observations still defer; it does not write a competing store projection. The owning lease is released with the readiness service and cleared by store disposal.


### Explicit browser playback presentation and screen wake intent

Mounted applications can call `SCOS.audio.present(handle.id, { metadata: { title: "Generated preview" }, commands: { play: "com.example.player.play", pause: "com.example.player.pause" } }, controller.ownerSignal)` for an already-owned sound handle. Retain and dispose the returned presentation lease with the controller. A new presentation from that mount replaces the previous one. Metadata is explicitly authored text (title, optional artist/album); the service never derives private document metadata, loads artwork or fetches remote images. Consider the visibility of OS media surfaces before providing text.

Playback remains owned by AudioService. The browser integration observes its state, finite position, duration and rate; it does not create a second player. Declared play/pause/stop and optional seek command IDs dispatch through existing mounted command validation with the existing `system` source. Seek payloads are owned `{ time: seconds }` records. Play actions must use the usual scoped activation token; validation or browser activation can still refuse them. Unsupported individual actions are omitted. Snapshot `actions` means browser handler registration succeeded, not that a command is currently enabled or OS controls are visible.

One eligible foreground presentation owns the page's Media Session. Existing runtime DOM ownership, key-window/app lifecycle, document visibility and focus determine eligibility. Ambiguous runtime evidence defers every candidate. Losing foreground clears metadata, handlers and position and cancels pending command dispatch; re-entering may restore an existing live presentation. Handle release, controller signal cancellation, mount retirement, account change and runtime disposal retire it. Browser selection across tabs and lock-screen/OS controls remain browser decisions. Other host code must not independently write the same page-global Media Session.

`SCOS.video.present(coordinator, { metadata: { title: "AnimationFX showcase" }, commands: { play: "com.example.player.playMedia", pause: "com.example.player.pauseMedia" } }, currentMountSignal)` uses that same arbiter for an exact live coordinator issued by this mounted video client. Foreign, fabricated and disposed coordinators are rejected. Only play/pause commands are supported for this looping-video projection; no finite duration/position, dummy sound handle, artwork or playback timer is created. AVPresentationCoordinator remains the timeline/worklet authority and publishes existing playback facts after transport acknowledgement. Pending/failed transport is not projected as completed playback. Controller actions must be idempotent and use the existing coordinator path and validation. An attempt's cancellation retires its lease; stale native callbacks cannot address its replacement. MediaFX clocks and AUFX recording/graphs retain their existing responsibilities.

`SCOS.screenWakeLock.request("Reading this document", controller.ownerSignal)` is a separate explicit app/user action returning a lease. No lock is requested at construction, playback start, subscription, visibility return or global boot. Its observable states distinguish requesting, held, releasing, released, revoked, unsupported, deferred and failed; failures expose only a bounded error name, not an invented permission decision. Visible foreground ownership is required. Loss of visibility/focus/ownership, caller cancellation, account change and disposal release it; return requires a fresh explicit request. Release fences pending acquisition and releases late sentinels. Independent leases own independent native sentinels; a failed release remains observable and can be retried. Native acquisition/release promises join the existing NativeOperationActivity ledger, including cleanup after that ledger ends.

A retained 6C controller can outlive a presentation mount. Its old native leases and sound handles remain revoked; acquire current leases in the current mount rather than reusing retired handles. Use the current view mount signal when a lease should follow that presentation, or the controller owner signal as an additional upper bound. Documents requiring cross-presentation continuity need persistent application/window document authority, not an outgoing stage mount's temporary reference lease.

The retained controller's lazy FX facade follows the current mounted client binding; replacing that binding does not revive its retired ports, while replaying the same binding preserves its facade. Cosmetic presentation cleanup also releases a completed native fill when its handle is cancelled. Completion remains settled as completed; clearing that held effect does not produce another settlement. A model-only presentation state supersedes the preceding effect even when it has no enter animation, and an older completion cannot settle a replacement presentation.

Controller route subscriptions observe the committed route snapshot, rather than every RuntimeStore publication. Readiness/native-operation/job changes still publish their own facts without replaying an unchanged route or its restoration/provider work. Each listener advances its own observed snapshot before invoking application code, so an earlier listener's read or reentrant unrelated publication cannot duplicate or suppress another listener's real route event. A genuinely committed recognition, including a new recognition of the same URL, remains observable. Unsubscription and mount retirement end that observation without reviving departing query state.

Both clients are optional browser integrations without service-worker registration, caching, activation, notifications, capture or backend configuration. Wake lock requires browser support, a secure context and permission/policy/OS approval; the OS can revoke it. Unit and injected-browser ports verify ownership and lifecycle, not native installation, OS media controls, physical folding or universal wake-lock support. The installed/offline host rollout and credentialed WebKit gate remain separate decisions.
