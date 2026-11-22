# Authorisation, entitlements and privacy

Authentication tells SynCloudOS who someone is. Authorisation decides what that person and each application may do. This page covers the four separate parts of that decision: what an application declares, which applications and routes a site lets each role open, named administrative rights, and the user's consent for each device service.

| Question | Owner | Host or application API |
| --- | --- | --- |
| Which device/service capabilities does this app declare? | The canonical `Info.ts` declaration and launch admission | `entitlements`; optional `runtime.policy.requiredEntitlements` |
| May this subject open this app or route? | The site's configuration profile | `configurationProfile` at boot; `runtime.configurationProfiles` |
| May this subject perform a privileged host action? | Authorization Services named rights | `runtime.authorization.copyRights(...)` |
| Has this app been allowed to use this privacy service? | One runtime-owned privacy store, plus the browser's own permission | Per-FX `getAuthorizationStatus()` and explicit request methods; `runtime.privacy` for host management |
| Who has signed in? | The configured authentication service and its server | [Authentication](authentication.md); optional [AuthenticationServices passkeys](authentication-services.md) |

These checks only work for code that goes through the framework. Applications and the runtime share one JavaScript realm and origin, so page code can skip a framework call and reach browser APIs, storage or the network directly. Entitlements aren't an operating system sandbox, hiding an application from the launcher doesn't protect its downloaded code, and a role in the browser carries no weight on the server. The browser itself still enforces its permissions, secure-context rules and Permissions Policy. Every protected server resource must authenticate the request and check the permission itself.

In this page, `runtime` is the framework's runtime object. No package entry exports it and `mountSynCloudOS` doesn't return it, so these services are for framework and host code. A site sets policy through the `configurationProfile` mount option, and users manage consent in System Preferences.

## Info.ts entitlements

Declare device and service capability names in `entitlements`:

```ts
export default {
  bundleIdentifier: "com.example.field-notes",
  displayName: "Field Notes",
  version: "1.0.0",
  routes: [{ path: "/field-notes", primary: true }],
  entitlements: ["location.read", "location.request"],
  runtime: { policy: { public: true } },
} as const;
```

The runtime validates the declaration, checks required entitlements before launch and keeps an immutable copy for the mounted application, so changing the array later can't add access to a running application. If an entitlement isn't declared, neither a browser permission nor a role's device capability makes up for it.

`runtime.policy.requiredEntitlements` adds a launch requirement: each name must also appear in `entitlements`, or the application is refused before any of its code runs. Declaring an entitlement never prompts the user or grants browser access. Entitlement names look like `location.read`, `video.capture.camera`, `bluetooth.access` and `contacts.select`; each [FX guide](fx/README.md) lists its own.

Entitlements and role capabilities answer different questions. Document store operations, for example, can also need a capability that the current role holds, and declaring a name in `Info.ts` doesn't give the user's role that capability. The exception is a single-application host without authentication, whose built-in profile allows the `documentStore.*` operations the application declares. A site profile you supply keeps its own rules.

## Site configuration profiles

Pass a `SynCloudOSConfigurationProfile` as `configurationProfile` to `mountSynCloudOS`. Its `roles`, `anonymousRole`, `resolveRole` and optional access-class mapping describe the site's policy. The framework reserves the `system` role, so a site can't declare it and a signed-in session never resolves to it. A role the profile doesn't declare falls back to the anonymous role.

Inside the runtime, the service is `runtime.configurationProfiles`. Each application states its own access needs in the manifest's `runtime.policy` block: `public`, `requiresLogin`, `requiredRoles`, `requiredCapabilities`, `requiredAccessClasses` and `requiredEntitlements`.

The access modes are `fullyLocked`, `webspringVisibleAppProtected`, `public`, `mixed`, `developer` and `enterprisePrivate`. The authentication policy sets the mode at boot. Runtime code can read or change it with `getAccessMode()` and `setAccessMode(...)`, which rejects unknown names, but nothing in a request can weaken it. Login, role, access-class and capability requirements are checked before any decision specific to the action, including launching a system application.

`authorise(request)` enforces a check and records it in the audit. `evaluate(request)` and `explain(request)` only inspect, and add nothing to the audit. Registered restrictions can narrow an allowed decision, but can't turn a denial into permission or change its action, subject or resource, and they receive a frozen copy of the request. If a restriction throws, the action is denied and the audit records a generic failure without the exception's contents. An unknown action needs an explicit extension capability, so a misspelt administrative right never becomes an extension right.

Subject grants issued by the host are opaque and only valid for the runtime that issued them, and they stop working when revoked or when the runtime is disposed. A plain `subject`, `origin` or `source` field only describes a request and never grants anything. Applications get scoped clients, never this evaluator or the grant issuer.

## Named rights

`SCAuthorization`, exported from `@syndromatic/syncloudos/browser` with `SCAuthorizationRights`, defines three named rights:

- `runtime.mutate` for privileged runtime configuration;
- `diagnostics.view` for system diagnostics;
- `plugin.register` for registering host plugins.

The configuration profile must grant the exact right to the role. In code that holds the runtime:

```ts
const result = runtime.authorization.copyRights(["plugin.register"], {
  source: "ExamplePluginInstaller",
  origin: "runtime",
});
if (!result.allowed) {
  throw new DOMException("Plugin registration is not authorised.", "SecurityError");
}
```

`copyRights` checks each distinct right requested and returns `allowed`, `grantedRights` and an audited decision for each. The request succeeds only if every right is granted, and empty requests and unknown rights are denied. The result records a check; it isn't a token you can keep and reuse. Plugin registration makes its own named-right check, and leaving out the caller options never quietly promotes a visitor to the system role.

These services are for trusted framework and host code. The handle `mountSynCloudOS` returns only disposes the host; it gives nobody access to the runtime.

## Per-framework privacy

Each mounted FX client has its own authorisation status and request methods, and they all share one privacy store, keyed by user, application and service. The store keeps the user's choice for the application (`prompt`, `granted` or `denied`) separate from what the browser last reported (`unknown`, `prompt`, `granted`, `denied` or `unavailable`).

Checking capability or status never prompts or grants consent. So when the browser has already granted a permission to the site for one application, another application still reports `prompt` until it makes a successful request of its own. A browser denial always wins, even if the user allowed the application. APIs with no lasting browser permission, such as a contact picker or payment sheet, may prompt on every request.

Request access through each framework's own operation: LocationFX `current()` and `watch()`, SpeechFX `SPFXSpeechRecognizer.requestAuthorization(handler)`, BluetoothFX `requestAuthorization(...)`, ContactsFX's `CNFXContactPickerViewController` presented through NSE, or the matching capture, NFC, payment or XR operation. Some behave differently:

- Bluetooth's request returns a peripheral, not a status. Retrieving devices the site was already granted needs the application's consent first and doesn't create it.
- Speech authorisation doesn't start recognition or open the microphone. The browser adapter has no speech-only permission, so it reports restricted and grants nothing. Audio-buffer and URL recognition requests can't fall back to microphone recognition; unavailable sources fail with `SPFXError`.
- The contact store's `requestAccess(entityType, completion)` doesn't open a picker and reports that the database is unavailable. Applications only ever see the contacts the user picks.
- PassFX has no authorisation status or privacy API. Its controller relies on the `payment.request` entitlement, host policy, and browser denial and lifetime checks. In browsers, presenting it currently fails with `PKFXError`, because the request can't yet configure merchant validation.

A capability being available never means access is granted.

A request checks the user's choice before asking the browser, and a successful request records consent. Revoking consent, or the application ending, cancels pending requests and releases watches, managers and sessions bound to it, and late results and callbacks can't restore access. You can still stop or dispose browser work after revocation. Privacy records persist in the runtime's own storage namespace when one is available. The store never records or invents browser permissions.

Inside the runtime, `runtime.privacy.getSnapshot()` reads the records, `subscribe` watches them, and `setAuthorization(scope, decision)` and `revoke(scope)` change a choice. These change only the user's choice for the application, never the browser's site settings. See [Per-application privacy authorisation](privacy.md) for how the store works.

The Privacy & Security pane in Webspring's System Preferences shows the current user's records, grouped by application and service. Its switches turn an application's access on or off, and Ask again resets the choice to `prompt`. Turning access off stops active requests and sessions. A refusal by the browser has to be changed in the browser's own site settings. An empty pane means no application has checked or requested access for that user.

## Authentication and optional passkeys

Authentication is optional. A site with `authentication: "disabled"` needs no sign-in service, and an application can use passkeys with its own server without system sign-in.

Passkeys have two separate entries that you import only if you need them:

- `@syndromatic/syncloudos/authentication-services`: `ASAuthorizationController`, platform public-key credential providers, registration/assertion requests and delegate completion;
- `@syndromatic/syncloudos/auth/passkey`: `createPasskeyAuthentication`, which adds a passkey method to an existing `AuthenticationService`.

Neither is re-exported from the application, browser or authentication entries. Passkeys for an application's own server return a credential for that server to verify. System passkey sign-in needs the relying party to verify the credential and then the authentication service to confirm a session; a browser assertion alone never signs anyone in. See [AuthenticationServices](authentication-services.md) for the API, cancellation and the server's responsibilities.

## Diagnostic audit and its limits

The audit records each checked action with its outcome and reason, summaries of the subject and access class, the resource, origin and source, which role, capability and access-class requirements matched or were missing, and the evaluation trace. Reading it returns copies. It's a bounded diagnostic history that can be cleared: by default at most 200 decisions and 512 KiB, with long traces shortened. It isn't a durable server audit log or tamper-proof evidence.

Context fields that carry credentials, and the credentials, query and fragment of URLs, are removed from the summaries. A runtime decision doesn't prove that a device was used, that a page went through the framework, or that a server accepted the operation; server access logs and checks are separate. Call `authorise` where you enforce access, because an `evaluate` call isn't evidence that access was enforced.
