# Authorisation, entitlements and privacy

SynCloudOS separates application declarations, site access, named administrative rights and device consent. Authentication supplies identity; authorisation decides what that identity and application may do through framework entry points.

| Question | Owner | Host or application API |
| --- | --- | --- |
| Which device/service capabilities does this app declare? | The canonical `Info.ts` declaration and launch admission | `entitlements`; optional `runtime.policy.requiredEntitlements` |
| May this subject open this app or route? | The site's configuration profile | `configurationProfile` at boot; `runtime.configurationProfiles` |
| May this subject perform a privileged host action? | Authorization Services named rights | `runtime.authorization.copyRights(...)` |
| Has this app been allowed to use this privacy service? | One runtime-owned privacy store, plus the browser's own permission | Per-FX `getAuthorizationStatus()` and explicit request methods; `runtime.privacy` for host management |
| Who has signed in? | The configured authentication service and its server | [Authentication](authentication.md); optional [AuthenticationServices passkeys](authentication-services.md) |

These are cooperative framework checks. Applications and runtime share a JavaScript realm and origin: page code can bypass a framework call and reach browser APIs, storage or the network directly. Entitlements are not an operating-system sandbox, a hidden launcher is not protection for downloaded code, and a browser role is not server authority. Browser permissions, secure-context rules and Permissions Policy remain browser-enforced. Every protected server resource must independently authenticate its request and check its required permission.

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

The runtime validates the declaration, checks required entitlements before launch and captures an immutable set for the mounted application. Mounted clients reuse that captured authority; changing an author's array later cannot add access to an existing mount. A missing declaration is not repaired by browser permission or by granting the signed-in role a device capability.

`runtime.policy.requiredEntitlements` expresses an additional launch requirement: each name must appear in the captured bundle entitlements. A missing entry denies launch before application code runs. The declaration still does not prompt the user or grant browser access. Existing capability names remain names such as `location.read`, `video.capture.camera`, `bluetooth.access` and `contacts.select`; use each [FX guide](fx/README.md) for its exact list.

Entitlements and role capabilities answer different questions. DocumentStore operations, for example, can also require capabilities held by the current role. Declaring a name in a bundle does not generally grant the person that role capability. The explicit single-application host without authentication has its documented convenience profile for declared `documentStore.*` operations; a supplied site profile retains its own rules.

## Site configuration profiles

Pass a `SynCloudOSConfigurationProfile` as `configurationProfile` to the browser host. Its `roles`, `anonymousRole`, `resolveRole` and optional access-class mapping describe site policy. The framework reserves the `system` role; a site cannot declare it and a signed-in session never resolves to it. An undeclared role falls back to the configured anonymous role.

The runtime service is `runtime.configurationProfiles`. Application access intent remains in the manifest's **`runtime.policy`** block: `public`, `requiresLogin`, `requiredRoles`, `requiredCapabilities`, `requiredAccessClasses` and `requiredEntitlements`. The boot option's singular name and the runtime service's plural name do not change that manifest key.

Supported deployment access modes are `fullyLocked`, `webspringVisibleAppProtected`, `public`, `mixed`, `developer` and `enterprisePrivate`. The high-level authentication policy contributes the boot mode. A host that owns the runtime can inspect or change the mode through `getAccessMode()` and `setAccessMode(...)`; invalid mode names are rejected. Caller request metadata cannot weaken the boot mode. Login, role, access-class and capability requirements run before action-specific decisions, including system-app launch.

`authorise(request)` evaluates and audits an enforced check. `evaluate(request)` and `explain(request)` are dry inspections and do not append an audit entry. Registered restrictions can narrow an allowed decision, but cannot turn a denial into permission or rewrite its action, subject or resource. They receive isolated, frozen request data. A throwing restriction or throwing result accessor denies the action and records a generic failure without retaining the exception's contents. Unknown actions require an explicit extension capability; a misspelt administrative right never becomes an extension right.

Host-issued subject grants are opaque and bound to the issuing runtime. An ordinary `subject`, `origin` or `source` field is descriptive, not authority. Revocation and runtime disposal stop honouring issued grants. Applications receive scoped clients, not this host evaluator or the grant issuer.

## Authorization Services named rights

`SCAuthorization` owns three named rights:

- `runtime.mutate` for privileged runtime configuration;
- `diagnostics.view` for system diagnostics;
- `plugin.register` for registering host plugins.

The role's configuration profile must grant the exact right. In host code that already owns a runtime:

```ts
const result = runtime.authorization.copyRights(["plugin.register"], {
  source: "ExamplePluginInstaller",
  origin: "runtime",
});
if (!result.allowed) {
  throw new DOMException("Plugin registration is not authorised.", "SecurityError");
}
```

`copyRights` checks each distinct requested right and returns `allowed`, `grantedRights` and an audited decision for each. The whole request succeeds only when every right is granted. Empty requests and unknown rights are denied. This result is an observation of a check, not a durable authority token. Plugin registration performs its own named-right check; omitting caller options never silently elevates a visitor to the system role.

These services belong to trusted host/runtime code. The handle returned by `mountSynCloudOS` exposes disposal, not a runtime escape hatch for applications.

## Per-framework privacy

Each mounted FX client owns its authorisation status and explicit request methods. They use the same runtime privacy store, keyed by **user, application and service**. The store keeps the app's choice (`prompt`, `granted` or `denied`) separate from its last browser observation (`unknown`, `prompt`, `granted`, `denied` or `unavailable`).

Passive capability/status queries do not prompt or grant app consent. An origin permission granted to one application therefore still reports `prompt` for a new app until it has made an explicit successful request. A browser denial remains authoritative even when the local app choice is allowed. APIs without lasting browser permission, such as a contact picker or payment sheet, can continue to require a browser prompt on every request.

Use the framework's existing request operation: LocationFX `current()`/`watch()`, SpeechFX `SPFXSpeechRecognizer.requestAuthorization(handler)`, BluetoothFX `requestAuthorization(...)`, ContactsFX `CNFXContactPickerViewController` presented through NSE, or the corresponding capture, NFC, payment and XR operation. Bluetooth's request returns a peripheral; it is not a status value. Retrieving existing origin Bluetooth grants requires prior app consent and does not create it. Speech authorization does not start recognition or acquire a microphone. The current browser Speech adapter has no Speech-only authorization operation and reports restricted; it does not grant app consent. SpeechFX audio-buffer and URL requests cannot be substituted with browser microphone recognition; unavailable sources fail with SPFXError. Contacts store `requestAccess(entityType, completion)` does not open a picker and reports the unavailable database; selection remains limited to the contacts the user chooses. Availability alone never establishes access.

Requests check the app choice before native access. Successful requests record app consent. Revoking consent or ending the mounted owner cancels pending requests and releases bound watches, managers and sessions; late results and callbacks cannot restore access. Stopping or disposing native work remains possible after revocation. Privacy records use the runtime's namespaced persistence when available; browser permission itself is not stored or manufactured by this database.

The host reads records with `runtime.privacy.getSnapshot()`, observes them with `subscribe`, and manages choices with `setAuthorization(scope, decision)` or `revoke(scope)`. These host controls change only the app gate. They cannot grant a permission in the browser's site settings.

Webspring's **System Preferences → Privacy & Security** pane presents the current user's real records, grouped by application and service. Its Atmo-drawn NSE switches change app access; **Ask again** resets the app choice to `prompt`. Turning access off stops active requests and sessions. A browser refusal must be changed in the browser's own site settings. The empty pane means no app has checked or requested privacy access for that user.

## Authentication and optional passkeys

Authentication remains optional. A site using `authentication: "disabled"` needs no sign-in service. An app may use passkeys for its own server without enabling system sign-in.

Passkeys have two separate opt-in entries:

- `@syndromatic/syncloudos/authentication-services`: `ASAuthorizationController`, platform public-key credential providers, registration/assertion requests and delegate completion;
- `@syndromatic/syncloudos/auth/passkey`: a provider composition that adds passkeys beside an existing OIDC/local `AuthenticationService`.

Neither is re-exported by the default application, browser or authentication entry. Import and configure them only where used. App-server passkeys return credential evidence for that server to verify. System passkeys require relying-party verification followed by a confirmed session from the existing authentication service; a browser assertion alone never signs someone into the system. See [AuthenticationServices](authentication-services.md) for the API, cancellation contract and server responsibilities.

## Diagnostic audit and its limits

The audit records checked actions, outcomes/reasons, subject and access-class summaries, resource, origin/source, matched/missing role, capability and access-class requirements, and evaluation trace. Inspection returns copies. It is a bounded, clearable runtime diagnostic history: by default at most 200 decisions and 512 KiB, with oversized traces projected. It is neither durable server audit nor tamper-proof evidence.

Credential-bearing context fields and URL credentials/query/fragment data are redacted from diagnostic summaries. Runtime decisions do not prove a hardware action occurred, that a page used the framework, or that a server accepted the operation. Server access logs and resource checks remain separate. Use `authorise` at enforcement sites; a dry `evaluate` is not evidence that access was enforced.
