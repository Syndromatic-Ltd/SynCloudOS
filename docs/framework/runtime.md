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
import { bundles, shell, shellResources } from "virtual:syncloudos/composition";

const host = await mountSynCloudOS({
  element: document.getElementById("root")!,
  bundles,
  shell,
  shellResources,
  authentication: "disabled",
});

window.addEventListener("pagehide", () => void host.dispose("page hidden"));
```

The options are:

| Option | Purpose |
| --- | --- |
| `element` | The page element that receives the shell. |
| `bundles` | The SynWare bundles to register. Each is a definition or a discovered descriptor. The [Vite plugin](getting-started.md#add-the-vite-plugin) generates the list for you. |
| `shell` | The [Webspring](webspring.md) definition. |
| `shellResources` | Icons, strings and other resources for the shell. |
| `authentication` | `"disabled"` for open sites, or an [authentication configuration](authentication.md). |
| `policyProfile` | Your host's role taxonomy. See [Policy](#policy). |
| `contributions` | Host contributions, described below. |
| `deploymentBasePath` | A URL prefix when the site lives below the domain root, such as `/product/`. Routes inside the runtime stay rooted at `/`. |

`dispose(reason)` resolves with a report of the teardown. Disposal is idempotent, and the runtime aborts its signal first, so every registered task can stop before its resources are released. During hot module replacement, call `host.dispose()` from `import.meta.hot?.dispose`.

## Ownership

Each runtime owns its store, services, queues and registries. Two runtimes on one page share nothing, which makes tests and embedded previews straightforward. Applications never hold the runtime. They receive the session described in the [SDK guide](synware-sdk.md), which projects only the capabilities the application is entitled to.

The host supplies the environment: viewport geometry, safe areas, input services, storage and the clock. Code inside the runtime reads those through injected adapters, so it behaves the same in a browser, a test host and an embedded frame.

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
