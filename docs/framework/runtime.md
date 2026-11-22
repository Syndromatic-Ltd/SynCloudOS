# The runtime and the host

The SynCloudOS runtime is the layer every other part of the framework runs on. A host creates it, boots it, hands your applications scoped sessions and disposes of it when the page ends. Most of the time you meet the runtime through `mountSynCloudOS`, which builds and owns one for you.

## What the runtime provides

| Service | Role |
| --- | --- |
| Statechart | Tracks the application lifecycle (launch, active, suspended, closed) and the shell's own states. Transitions are explicit and observable. |
| Commands and responders | Dispatch typed commands along the responder chain. See [commands, responders and undo](commands-responders-undo.md). |
| Undo | Owns undo histories for the application and for each document. |
| Documents | Live editing sessions with autosave, recovery, versions and conflicts. See [documents](documents.md). |
| Windows | Ordering, key and main state, restoration and compact presentation. See [windows](windows.md). |
| Services | A registry of host services with availability, versions and permissions. |
| Entitlements | Validates bundle capability declarations and admits the immutable set before the application launches. |
| Configuration profiles | Applies the site's rules for app visibility, login, roles and access classes. |
| Authorization Services | Checks named host rights through `runtime.authorization.copyRights(...)`. |
| Privacy | Owns the per-user, per-app service choices that FX authorisation and Privacy & Security use. |
| Locale | Locale bundles, formatting and translation. |
| Persistence | Namespaced preferences and durable storage. |
| Scheduler | An injectable clock and frame scheduler, so time is testable. |

## Mount a runtime

`mountSynCloudOS` renders the shell into a page element and returns a handle that disposes it.

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
| `composition` | An explicit project composition for hosts without the Vite plugin. When you leave it out, the plugin supplies the discovered project. |
| `bundles` | The SynWare bundles to register. Each is a definition or a discovered descriptor. The [Vite plugin](getting-started.md#enable-folder-discovery) generates the list for you. |
| `shell` | The [Webspring](webspring.md) definition. |
| `application` | `{ bundleIdentifier, frame? }` to host one application without a shell. `frame` is `"fullscreen"` (the default) or `"declared"`. You can pass `shell` or `application`, not both. |
| `shellResources` | Icons, strings and other resources for the shell. |
| `authentication` | `"disabled"` for open sites, or an [authentication configuration](authentication.md). |
| `configurationProfile` | Your host's role taxonomy and access-class mapping. See [Authorisation](authorization.md). |
| `contributions` | Host contributions, described below. |
| `theme` | The `NSETheme` that paints the shell, windows and controls. Defaults to Atmo. |
| `fonts` | A host-owned [font declaration](managed-fonts.md) and its resource URLs. |
| `about` | Host-owned legal attribution (`copyright`, `trademark`, `tagline`) for each application's standard About panel. |
| `push` | Public push registration configuration. Private VAPID keys stay on the server. |
| `deploymentBasePath` | A URL prefix when the site lives below the domain root, such as `/product/`. Routes inside the runtime stay rooted at `/`. |

`dispose(reason)` resolves with a report of the teardown. Disposal is idempotent. The runtime aborts its signal first, so every registered task can stop before its resources are released. During hot module replacement, call `host.dispose()` from `import.meta.hot?.dispose`.

When an application closes, the runtime revokes its mounted capability signals before observers see the terminal `closed` state. Revocation happens only after the close is approved: a refused close, or a suspension, leaves the application's mounts in place. An exit animation may keep hidden content on screen, but its old capabilities stay revoked, and reopening the application gets fresh mounts.

## Ownership

Each runtime owns its store, services, queues and registries. Two runtimes on one page share nothing, which keeps tests and embedded previews simple. Applications never hold the runtime. They receive the session described in the [SDK guide](synware-sdk.md), which exposes only the capabilities the application is entitled to.

The host supplies the environment: viewport geometry, safe areas, input services, storage and the clock. Code inside the runtime reads these through injected adapters, so it behaves the same in a browser, a test host and an embedded frame.

### Document-store locking

A low-level host can supply `SynCloudOSRuntimeConfig.documentStoreLock`, which implements the `SynCloudOSDocumentStoreLock` contract. A trusted host contribution can supply the same field in its `runtimeConfig`. The supplied lock takes precedence over the browser's Web Locks adapter, and it must coordinate every writer that shares the backing persistence, not just one runtime. When neither lock is present, conditional writes are unavailable; they never fall back to an unchecked write.

Large browser DocumentStore snapshots store repeated image and media strings once, in a private lossless string table. Every document, revision, version and idempotency receipt is kept, and public snapshot import and export stay at schema 2. Existing snapshots load without migration or data loss and compact on the next successful write. The private storage envelope uses a higher schema number, so an older writer refuses it instead of overwriting data it doesn't understand. Reference expansion is bounded, and malformed compact snapshots are rejected.

Compaction doesn't raise the browser's storage quota. If unique data exceeds it, the write reports full or unavailable storage (not a missing lock) and the previously saved document stays in place.

The portable test host owns isolated persistence and a real per-name exclusive queue for that store. That queue is local; it is not a lock across contexts for a shared browser or server store.

### Editing published DocumentStore records

`saveDraft` can edit a live record in place. If its input sets `publishState` to the record's current state (`"published"` or `"unlisted"`), the save keeps the record published: one mutation and one new storage version, with no intermediate draft and no second `publish` write. The call needs both draft-write and publish authorisation, including the kind's publish permissions. If authorisation is denied, the record, its version history and its idempotency records are left unchanged and no save event is emitted.

Only that exact state match keeps publication. A new record, a change between published and unlisted, or an input without a publication state still stages a draft, and you use `publish` for first publication and state changes. Omitted `publishedAt` and `canonicalUrl` keep their current values; values you pass replace them.

The usual `ifMatch` and persistence-lock rules apply to the save. A stale ETag, or a rejected conditional write, leaves the previous published record in place. Use this for live-content edits instead of saving a draft and republishing.

## Policy

Authorisation has separate owners:

- `Info.ts` `entitlements` declares the application's device and service capabilities. Launch admission validates and captures them.
- A site configuration profile governs access to apps and routes.
- `SCAuthorization` checks the named host rights `runtime.mutate`, `diagnostics.view` and `plugin.register`.
- Each FX framework's status and request methods combine the application's privacy choice with the browser's permission, through one runtime privacy store.

[Authorisation, entitlements and privacy](authorization.md) covers the full split.

The host option is `configurationProfile`, typed as `SynCloudOSConfigurationProfile`, and the runtime service is `runtime.configurationProfiles`. An application's access requirements stay in its manifest's `runtime.policy` block: `public`, `requiresLogin`, `requiredRoles`, `requiredCapabilities`, `requiredAccessClasses` and `requiredEntitlements`.

```ts
import type { SynCloudOSConfigurationProfile } from "@syndromatic/syncloudos/browser";

export const configurationProfile: SynCloudOSConfigurationProfile = {
  id: "example",
  roles: {
    guest: ["app.open.public"],
    member: ["app.open.public", "app.open.members"],
    admin: ["app.open.public", "app.open.members", "runtime.mutate", "diagnostics.view", "plugin.register"],
  },
  anonymousRole: "guest",
  resolveRole: (session, claimedRole) =>
    !session.isAuthorised ? "guest" : claimedRole === "admin" ? "admin" : "member",
};
```

A role the profile doesn't declare falls back to `anonymousRole`. The `system` role is reserved for authority the host issues explicitly; sessions never resolve to it. The wildcard `"*"` grants every capability, so use it only on purpose.

A host that owns a runtime uses `runtime.authorization.copyRights([...])` for administrative rights and `runtime.privacy` for privacy records and revocation. Applications get neither; they use their mounted clients. The handle that `mountSynCloudOS` returns exposes disposal, not the runtime.

These checks cooperate within the page. They don't sandbox hostile JavaScript or protect static application assets. Every protected server endpoint must authenticate its own requests and check resource permissions. The runtime audit is a bounded diagnostic history, not durable or tamper-proof security evidence.

## Host contributions

A host contribution lets a deployment add services, document types, storage adapters, policy and seed data to a runtime before it boots. Create one with `createSynCloudOSHostContribution(id, source, prepare)` from `@syndromatic/syncloudos/browser` and pass the list through the `contributions` option. The `id` is a short lowercase identifier and `source` a non-empty description of where it came from. Each contribution installs through narrow ports and returns a cleanup that the runtime calls at disposal, so a contribution never outlives its runtime. In a plugin project you can write the same thing as a [discovered integration](project-structure.md#integrations).

## Constrained devices

Each runtime watches its environment's capability signals: logical processors, approximate device memory, the data saver preference, connection quality, long main-thread tasks and memory warnings. It never inspects device models or user agents. On a constrained host it runs one heavy job at a time, lowers its cache budget and stops speculative prefetching. A brief burst doesn't trigger the policy, and a brief recovery doesn't lift it. The policy leaves accessibility settings alone, so reduced motion remains the user's choice.

## Accessibility across presentations

The host keeps focus, route announcements and keyboard ownership at the runtime boundary, in desktop, tablet and mobile presentations alike. Application code reads geometry and safe areas from the presentation traits, never from ambient globals.

### Geometry state

`ScreenService` owns the host's geometry sample. Its `geometryState` is one of:

- `current`: the layout, visible viewport and work area form a finite, positive, usable sample.
- `retained`: a temporary invalid measurement arrived, so the last complete valid sample is kept.
- `unavailable`: no valid sample exists yet.

If the browser has no visual viewport API, layout bounds are used instead; an invalid visual measurement is not treated as a missing API. While the initial geometry is unavailable, windows aren't drawn as miniature placeholders. Restored windows still load through their normal controller lifecycle and appear once geometry arrives.

Content-bound presentation traits carry the same `geometryState` and also keep their last valid content bounds through invalid measurements.

### Safe areas

`safeAreaAvailability` is `available`, `unavailable` or `unknown`, because a measured zero inset is different from no measurement at all. The browser adapter reports `unavailable`, and CSS surfaces keep their own `env(safe-area-inset-*)` padding. An external host adapter that omits `RuntimeWorkAreaSnapshot.safeAreaAvailability` reports `unknown` until it declares whether its insets are measurements; valid inset numbers from such adapters stay available for compatibility, without an availability claim. An adapter that declares `unavailable`, or supplies invalid insets, produces zero insets marked unavailable. Don't subtract insets again from a work area the host has already reduced.

### Fitted and zoomed windows

When a regular or wide window's normal height is taller than the usable area (the intersection of the visual viewport and the work area), it gets a temporary fitted height. This includes a regular-width viewport shrunk by an on-screen keyboard. The window's normal bounds and minimum size don't change, so a larger viewport later restores its normal frame, and a deliberate position stays in effect whenever the normal height fits. Read these values through the owning window or view controller, and don't save the fitted frame as a new normal size just because the viewport changed.

The window host passes each controller's zoom state to the presentation. A zoomed frame follows the current usable work area while the normal bounds stay in the controller. Restoration keeps zoomed and minimised intent even when the initial geometry is unavailable, and never writes a placeholder rectangle into a restored window's normal bounds.

## Capability status and explicit save and share actions

`SCOS.share.getStatus(request?)` and `SCOS.filePanels.getStatus()` report facts from their services. They separate effective availability, the provider (`native`, `browser-input`, `download` or `none`), current transient activation and an unknown browser permission. They never request permission, open native UI or act as a second permission authority. Status inspection uses configuration-profile evaluation; the actions themselves use configuration-profile admission and manifest declarations. Writing or exporting files needs the `file.write` entitlement. Read-only file input keeps its existing manifest contract.

### Sharing

`SCOS.share.perform(request, signal?)` resolves to `shared`, `cancelled`, `unsupported`, `denied`, `aborted`, `invalid` or `failed`. A `shared` result means the platform accepted the handoff, not that a recipient received anything. A browser `NotAllowedError` on its own doesn't prove a persistent permission denial, so browser refusal is reported as its own reason. The older `share()` method still returns only `"shared"` or `"cancelled"` (mapping unsupported to cancelled) and keeps its exception behaviour; use `perform` for new code.

The service calls the native `navigator.share` and `canShare` with their receiver intact, and starts the call before its first `await` so the user activation still counts. It never turns an unknown activation into a grant or a denial; the native API decides. Aborting your signal stops late outcomes reaching you, but it can't close an operating-system share sheet, so the share stays busy until the native call settles.

Permissions Policy introspection is advisory, and only for features the browser recognises. Some browsers that support native sharing return `false` and an unrecognised-feature warning for `web-share` through their legacy inspector; the service treats that as unknown, not as a policy denial. A recognised explicit denial is respected, and the native API still enforces the browser's actual policy.

`AppShareRequest.files` takes a non-empty read-only array of prepared `{ name, mimeType, data: NSEDataConvertible, lastModified? }` records. Prepare asynchronous exports before you enable Share, and don't await serialisation inside the gesture. The service copies the bytes, builds native `File` objects privately, freezes the array and dictionary, and passes that same payload to `canShare` and `share`. A files-only probe must also succeed. Missing, false or throwing file capability checks return `unsupported`; an invalid or empty list returns `invalid`. Handles, promises, lazy producers and raw `File` input are not accepted, and undefined optional fields stay omitted.

The manifest, configuration profile, live scope, caller signal, activation and native busy state apply to files in the same way. Cancellation or refusal never quietly retries without the files, copies to the clipboard, starts a download or sends to a guessed recipient. If sharing is `unsupported`, you can offer a separate, explicit export action. Browser status tests and injected native contract tests don't prove that a real operating-system chooser completed.

### Save targets

In the browser, mounted file panels use the File System Access and download adapters. Ordinary read-only input keeps its portable behaviour. To save, choose the target during the original user action, then serialise the content and write through that target with the controller's owner signal.

- If a target is unavailable, the panel may choose a permitted fallback. Cancellation or a browser or runtime denial must never trigger a second chooser or a download.
- Requests that need a persistent location never fall back to a download.
- Cancelling the native picker is different from the owner being interrupted.
- A download target is one-shot and scoped to the caller and mount. It has no readable location or overwrite identity, and "exported" means a download was started, not that a file is safely on disk. An export must not mark a document clean the way Save As does.

Native save pickers don't reliably say whether the chosen file is new, so the returned handle is treated as an existing file: `fail-if-exists` stays protective, and `confirm-replace` needs the caller's confirmation. Browser grants and handles are not persisted. Targets recheck the owner and the configuration profile before writing, release references when done, abort partial native writes through the adapter, and clean up temporary download anchors and object URLs. Cancelling after dispatch can't retract a browser or operating-system operation, so don't automatically retry an export whose outcome is uncertain.

The relevant specifications are [Web Share](https://www.w3.org/TR/web-share/), [HTML user activation](https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation) and [File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access). None of this adds a capability catalogue, service worker, push or hardware permission.

## Playback presentation and screen wake

These are optional browser integrations. They don't register a service worker, cache, activate updates, send notifications, capture media or need backend configuration.

### Audio

For a sound handle your mount already owns, call:

```ts
const lease = SCOS.audio.present(handle.id, {
  metadata: { title: "Generated preview" },
  commands: { play: "com.example.player.play", pause: "com.example.player.pause" },
}, controller.ownerSignal);
```

Keep the returned lease with the controller and dispose of it with the controller. A new presentation from the same mount replaces the previous one. Metadata is text you write (a title, and optionally artist and album); the service never derives it from private document data, loads artwork or fetches remote images. Think about what the operating system's media controls will show before you supply it.

Playback stays with the audio service. The browser integration observes its state, finite position, duration and rate; it doesn't create a second player. The declared play, pause and stop commands (and optional seek) dispatch through normal command validation with the `system` source. Seek payloads are `{ time: seconds }` records. Play actions use the usual scoped activation token, so validation or the browser can still refuse them. Actions the browser doesn't support are left out. A snapshot's `actions` lists the handlers the browser registered, not which commands are currently enabled or whether operating-system controls are visible.

One eligible foreground presentation owns the page's Media Session. Eligibility comes from runtime DOM ownership, key window and app lifecycle, document visibility and focus, and ambiguous evidence defers every candidate. Losing the foreground clears metadata, handlers and position and cancels pending command dispatch; regaining it can restore a live presentation. Releasing the handle, cancelling the controller signal, retiring the mount, changing account or disposing the runtime ends the presentation. The browser still decides which tab's session the operating-system controls follow. No other host code should write to the same page-wide Media Session.

### Video

```ts
SCOS.video.present(coordinator, {
  metadata: { title: "AnimationFX showcase" },
  commands: { play: "com.example.player.playMedia", pause: "com.example.player.pauseMedia" },
}, currentMountSignal);
```

`SCOS.video.present` uses the same arbiter for a live `VFXPresentationCoordinator` that this mounted video client issued. Foreign, fabricated and disposed coordinators are rejected. Only play and pause are supported, because this presentation is for looping video: it creates no duration or position, no dummy sound handle, no artwork and no playback timer. The coordinator remains the authority for the timeline and publishes playback facts only after the transport acknowledges them, so a pending or failed transport never appears as playing. Make the controller actions idempotent and route them through the coordinator. Cancelling an attempt retires its lease, and stale native callbacks can't reach its replacement. MediaFX clocks and AudioFX recording and graphs are unaffected.

### Screen wake lock

`SCOS.screenWakeLock.request("Reading this document", controller.ownerSignal)` returns a lease. Request it only from an explicit user action: nothing requests a lock at construction, playback start, subscription, return to visibility or boot. The lease's observable state is `requesting`, `held`, `releasing`, `released`, `revoked`, `unsupported`, `deferred` or `failed`, and a failure exposes only a bounded error name rather than a guessed permission decision.

The lock needs visible foreground ownership. Losing visibility, focus or ownership, cancelling your signal, changing account or disposing the runtime releases it, and getting it back takes a new explicit request. Releasing also cancels a pending acquisition. Each lease owns its own native sentinel, and a failed release stays observable so you can retry it. Wake lock needs browser support, a secure context and approval from permissions, policy and the operating system, which can revoke it at any time.

### Leases and retained controllers

A retained view or window controller can outlive the mount it was presented in. Its old native leases and sound handles stay revoked, so acquire new leases in the current mount instead of reusing retired handles. Use the current view's mount signal when a lease should follow that presentation, and the controller's owner signal as an outer bound. A document that must continue across presentations needs persistent application or window document ownership, not the temporary lease of an outgoing stage mount.

The retained controller's FX facade follows the current mounted client. Replacing the client doesn't revive the old one's ports, and remounting the same client keeps the facade.

Controller route subscriptions see committed route changes only, not every RuntimeStore publication. Each listener tracks its own last snapshot before your code runs, so one listener's reads or unrelated publications can't duplicate or swallow another listener's route event. A real new recognition, even of the same URL, is still delivered. Unsubscribing or retiring the mount ends the observation.

Unit tests and injected browser ports verify ownership and lifecycle. They don't verify native installation, operating-system media controls, physical folding or wake-lock support on every device.

## Update readiness diagnostics

The runtime can report whether the page has unsaved or in-flight work that would make an update unsafe. This is a diagnostic: it never performs an update, and its results always carry `activationAuthorized: false`.

### Host update diagnostics in Settings

The host derives `runtime.updateReadiness` from published document membership, document state, operation membership, runtime job admission, application windows, identity and disposal changes, and a runtime-owned native activity source. The snapshot is projected to `RuntimeStore.updateReadiness`. Readiness is transient: it isn't saved in preferences, and an old store snapshot can't restore it.

Webspring's System Preferences includes an Updates pane (`updates`). It shows dirty, saving and conflicted documents; pending operations, jobs and native calls; the domains not yet covered; build restrictions; and earlier participant observations. It only inspects. There's no Update Now, activate, reload, install, save, discard or close action. You can hide or replace the pane like any other preference pane.

Every host domain is still reported as partial until its owner can account for all its work. For example, published documents include hidden and windowless documents but not documents still being admitted or cleaned up; operations can cancel before their hooks finish; managed tasks don't count work inside the services they call; and a completed picker or share doesn't cover the file write, clipboard, persistence or media work that follows. A count of zero does not mean the page is idle.

A host contribution can supply `runtimeConfig.updateReadiness`: a bounded `hostBuild`, a restrictive compatibility flag and an optional owned participant inspector. The inspector must validate its exact scope, script, client and ports, and stop when its signal aborts. It is never discovered or registered automatically. Its results have a strict coarse shape, expire after a bounded time, and are invalidated by local work and by account or window changes. A ready observation from participants can't make incomplete local coverage ready.

The store folds readiness into its normal publication, so an outer batch publishes once with readiness already current, and the readiness observer never writes to the store a second time. A store without this publication slot (or a second observer while another owns it) gets the `runtime-store-publication` gap and defers instead of writing a competing projection.

### Source-level readiness APIs

`NSEUpdateReadinessController` and its helpers belong to the host framework source (the `NSE` and `SynCloudOS` facades). They are not exported from the application SDK.

`NSEUpdateReadinessController` presents readiness facts and has no save, discard, close, reload, activation or permission method. Create it with an owner (an application, window controller or view controller, or that owner's signal), a random per-host `clientInstance`, a bounded `hostBuild` and an observable `UpdateReadinessInventory`. `getSnapshot()` returns the cached immutable projection; `inspect()` re-reads the underlying sources synchronously first. Every source or membership event advances the generation, even when an owner that was already dirty stays dirty.

The host must declare complete coverage of `documents`, `editing`, `tasks` and `native`. A missing inventory or coverage, a failed subscription, a throwing or invalid provider, or a revoked source returns `unknown`; don't mark an empty domain as covered just because its provider is unavailable. The adapters read existing state without changing it:

- `documentUpdateReadiness` reads document state, dirty revision and unsaved status. Pending synchronisation counts as dirty. It doesn't claim an autosave is current or durable.
- `textSessionUpdateReadiness` reads marked (in-progress) text composition.
- `editingControllerUpdateReadiness` reads open editing transactions.

Recovery writes, synchronisation and other tasks must be reported by the services that own them; these adapters alone don't prove complete coverage.

`NativeOperationActivity` is optional instrumentation for native calls. Give the same activity source to the native share and picker boundary and to the host inventory. The boundary tracks the underlying native promise before any caller abort, so cancelling doesn't make pending operating-system UI look idle. It covers only the calls it instruments. Each runtime gives its native share and file-panel factories their own activity source; the older uninstrumented port remains as a fallback and is reported as a coverage gap.

`observeUpdateReadiness` collects two short rounds of evidence from other clients, using the runtime's timer and UUID ports. The host transport must target an exact owned registration, scope and script; enumerate in-scope clients, including uncontrolled ones; validate message sources; use a fresh private `MessageChannel` per participant; and close ports when its signal aborts. Malformed messages, missing clients, deadlines, membership changes, new owners or edits in between all defer. Only the protocol, build, random host instance, generation and coarse blocker categories cross this boundary, never document IDs, titles, models, accounts or private URLs.

The result is `ready-at-observation` or `defer`. It isn't an admission token, a durable acknowledgement, a lock on client membership or a promise that no edit will follow, and restarting a worker or observer invalidates an unfinished handshake. The framework adds no worker registration, cache policy, schema migration, automatic reload or forced worker takeover. A production installed or offline host still needs owner-level evidence, compatible old and new assets and schemas, an exact cache allowlist and a separately reviewed update decision.

### Document work

`DocumentController.activity` is a read-only source of immutable, revisioned counts of document admission, recovery and cleanup stages. Counts describe outstanding stages, not unique requests or documents. The controller tracks queued admission and actual commit separately, so a logical cancellation can't hide an adapter read or resource cleanup that is still running. Every document the controller creates reports through this source. Recovery counts include scheduled timers, queued and running writes and removals, and a structural close is tracked until its cleanup promise settles, even after the document leaves published membership. Observing never saves, discards, cancels, settles or closes anything.

With this source the host can mark controller-owned document admission as observed and drop the recovery-cleanup gap for those owners. Editing, terminal and window ownership, operation callbacks, application lifecycle, private jobs, native writes, general persistence and service or media work still have gaps, and documents constructed outside the controller aren't counted. Zero counts don't mean the page is idle, recovery data doesn't prove the latest edits are durable, and participant observations stay historical. Update decisions still defer, with activation disabled.
