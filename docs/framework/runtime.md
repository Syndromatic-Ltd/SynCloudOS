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

Primary contracts: [Web Share](https://www.w3.org/TR/web-share/), [HTML user activation](https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation), [File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access). This slice does not add file sharing, a broad capability catalogue, service workers, push or hardware permissions.
