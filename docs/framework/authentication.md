# Authentication

This guide covers signing people in to a SynCloudOS site. Authentication has two halves. A browser service tracks the session the server has confirmed and drives sign-in. A server handler talks to the OpenID Connect provider, validates tokens, owns session identity and roles, and enforces permissions on your resources. Provider tokens and client secrets stay on the server, and anything in a `VITE_` variable is public. [Authorisation](authorization.md) covers the separate questions of application access, administrative rights, entitlements and device consent.

## Choose a policy

The `authentication` option of `mountSynCloudOS` (type `AuthenticationInput`) takes a policy string or a configuration object:

| Value | Behaviour |
| --- | --- |
| `"disabled"` (the default) | A public site. No authentication service exists and no authentication requests are made. |
| `"optional"` | The policy alone, with no service. The runtime applies the optional policy, but nothing can sign in: the shell's account action stays pending and the sign-in window reports "Authentication is not configured." |
| `"required"` | The policy alone, with no service. The runtime applies the required policy and presents the sign-in window, which reports "Authentication is not configured." and cannot be completed. |
| `{ policy: "optional", service }` | Public content stays available, and the shell offers a Sign In action backed by `service`. |
| `{ policy: "required", service, loginComponent? }` | Protected content waits for a confirmed session. The shell keeps the requested route locally and presents the sign-in window until the session is authenticated. |

The strings `"optional"` and `"required"` create no authentication service, make no `/auth/*` requests and produce no session. Use them when you want the policy in place before the backend exists. To let people sign in, pass the object form with a `service`, normally from `createHttpAuthentication` (below). `"disabled"` is the only string that needs nothing more.

### Prerequisites

- `"disabled"` needs no backend.
- The object form with `createHttpAuthentication` needs a server that answers the same-origin `/auth/methods`, `/auth/session`, `/auth/start` and `/auth/logout` endpoints: use the [server handler](#server-handler) and an OIDC provider.
- With `"disabled"`, nobody can sign in, so the host opens the primary application publicly and it doesn't need `runtime.policy.public`. A primary application that declares `runtime.policy.requiresLogin` fails to mount, since nobody could ever open it.
- With `"optional"` (string or object), the primary application must declare `runtime.policy.public` in its manifest, because it launches before anyone signs in.
- With `"required"`, the sign-in window is presented before the primary application launches. The `application: { bundleIdentifier }` host accepts the same `authentication` values as the Webspring shell; see [Getting started](getting-started.md#mount-one-application).

A single-application host uses the same application menu as Webspring. Applications show it in their main menu bar, as an application-menu toolbar item, or both. When authentication is on, the menu offers Sign In or Log Out. See [Mount one application in Getting started](getting-started.md#mount-one-application).

Optional sign-in offers Cancel, even when no authentication service is configured. Cancelling goes back to whatever asked for sign-in: the Board stays on the Board, and a single-application host carries on with the same application, route and content. Cancelling never creates or authorises a session. Required sign-in has no Cancel.

The service reports one of `disabled`, `checking`, `anonymous`, `authenticating`, `authenticated`, `expired` and `error`. Disposing the host disposes the service you supplied.

## Browser service

`createHttpAuthentication` from `@syndromatic/syncloudos/auth` builds the service. It calls the same-origin endpoints `/auth/methods`, `/auth/session`, `/auth/start` and `/auth/logout` with cookies, and checks the session again on startup, when the page gets focus and when another tab signals a change. Each request, with its response body, has 15 seconds by default; set `requestTimeoutMs` to change that.

```ts
import { createHttpAuthentication } from "@syndromatic/syncloudos/auth";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";

const authentication = createHttpAuthentication({
  navigate: (destination) => window.location.assign(destination),
  eventTarget: window,
});

const host = await mountSynCloudOS({
  element: document.getElementById("root")!,
  authentication: { policy: "optional", service: authentication },
});
```

## Sign-in methods

A `checking` or `authenticating` status means a request is in progress, not that the identity has changed. The last verified identity stands until the server replaces it, log-out succeeds or the session expires. A slow response can't overwrite a newer one, and the runtime learns about an identity change before the interface sees the new status.

If `/auth/start` completes sign-in at once and returns the requested local path, the client checks `/auth/session` before navigating there. Because navigation can keep the current document, sign-in updates the running runtime instead of relying on a reload, and a missing or invalid session makes sign-in fail. Redirects to an external provider navigate as usual, and background session checks can't override a sign-in in progress.

Logging out terminates every open application, including suspended ones, through its normal lifecycle, then locks the runtime and ends the server session. If an application refuses to terminate or fails to save, log-out stops and the session stays valid. Signing in again launches applications and controllers afresh instead of reusing anything from the old windows.

You configure providers on the server, which describes each one with an `AuthenticationMethod`: an `id`, the full button `label` and an optional `iconUrl`, which must be root-relative or HTTPS. `/auth/methods` publishes these, and the sign-in window draws a button for each, with no special cases for particular providers.

The handler supports one OIDC issuer, with client credentials and an admission policy that you supply. A provider that supports OAuth but not OIDC needs its own server adapter.

When the sign-in window shows an error, it plays the HapticsFX error pattern once, and again for the next failure after the error clears. Vibration and sound follow the user's feedback settings and what the browser supports.

## Optional passkeys

Passkeys are a separate, opt-in API, described in [AuthenticationServices](authentication-services.md). `@syndromatic/syncloudos/authentication-services` exports `ASAuthorizationController` with its providers, requests and delegate, for use with your application's own relying-party server. `@syndromatic/syncloudos/auth/passkey` exports `createPasskeyAuthentication`, which adds a passkey method to an existing system authentication service.

Neither is re-exported from the `auth`, `browser` or application entries, so an application that doesn't import them carries no passkey code. An application can use passkeys with its own server even when system sign-in is disabled.

The relying-party server verifies the returned credentials. A system passkey sign-in then refreshes the authentication service and completes only once it confirms an authenticated session; a browser assertion or a successful callback alone never signs anyone in. The built-in OIDC handler has no WebAuthn credential store or verifier, so you provide those endpoints yourself.

## Custom sign-in view

Pass a component as `loginComponent` when the site needs its own sign-in view. It receives data and actions as props and can't reach the runtime, passwords or tokens.

```tsx
import type { AuthenticationViewProps } from "@syndromatic/syncloudos/auth";
import { NSEButton } from "@syndromatic/syncloudos/nse/controls";

export function SiteLogin({ methods = [], authenticationStatus, onMethodSignIn, onCancel, cancelLabel }: AuthenticationViewProps) {
  return (
    <section aria-label="Sign in">
      <p>{authenticationStatus}</p>
      {methods.map((method) => (
        <NSEButton key={method.id} title={method.label} onClick={() => onMethodSignIn?.(method.id)} />
      ))}
      {onCancel ? <NSEButton title={cancelLabel ?? "Cancel"} onClick={onCancel} /> : null}
    </section>
  );
}
```

Mount it with `authentication: { policy: "required", service: authentication, loginComponent: SiteLogin }`.

## Server handler

`@syndromatic/syncloudos/server/auth` is written for Cloudflare Workers, and works in any runtime with the standard `Request` and `Response` types.

```ts
import {
  createAuthHandler,
  createEmailAllowlistAdmissionPolicy,
  D1AuthStore,
  type D1Database,
} from "@syndromatic/syncloudos/server/auth";

interface Env {
  OIDC_ISSUER: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET?: string;
  PUBLIC_ORIGIN: string;
  AUTH_ALLOWED_EMAILS: string;
  AUTH_DB: D1Database;
}

export default {
  fetch(request: Request, env: Env) {
    const auth = createAuthHandler({
      config: {
        issuer: env.OIDC_ISSUER,
        clientId: env.OIDC_CLIENT_ID,
        clientSecret: env.OIDC_CLIENT_SECRET,
        publicOrigin: env.PUBLIC_ORIGIN,
        method: { id: "example-oidc", label: "Sign in", iconUrl: "/assets/auth/provider.svg" },
      },
      store: new D1AuthStore(env.AUTH_DB),
      admission: createEmailAllowlistAdmissionPolicy(env.AUTH_ALLOWED_EMAILS.split(",")),
    });
    return auth.fetch(request);
  },
};
```

The handler performs OIDC discovery and the authorisation code flow with PKCE. It binds state and nonce to the browser, validates the ID token's signature and claims, applies your admission policy, stores sessions hashed and supports revocation. The browser receives only the public profile and the expiry time.

### Protect your own routes

`auth.authenticate(request)` returns an `AuthPublicProfile` or `null`, and a missing profile means deny. `auth.protect(permission, handler)` wraps a route so the server checks both the session and the permission before the handler runs:

```ts
import type { AuthHandler } from "@syndromatic/syncloudos/server/auth";

export function profileRoute(auth: AuthHandler) {
  return auth.protect("member", (_request, profile) =>
    Response.json({ subject: profile.subject, roles: profile.roles }),
  );
}
```

Authorise private data on the server; a decision made in the browser is never a substitute.

### Admission and roles

`createEmailAllowlistAdmissionPolicy` admits an explicit list of addresses and gives them the `member` role. Implement `AuthAdmissionPolicy` for other rules, and pass `permissionCheck` to `createAuthHandler` to map roles to permissions.

### Configuration

The Worker reads its settings from server-side variables and bindings: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, an optional `OIDC_CLIENT_SECRET`, `PUBLIC_ORIGIN`, an allowlist and a database binding for the session store. Keep them out of `VITE_` variables, HTML, browser bundles, fixtures and logs. In `config`, `sessionLifetimeMs` sets how long a session lasts (eight hours by default) and `transactionLifetimeMs` how long a sign-in attempt can take (ten minutes by default).

[Google OIDC setup](google-oidc-setup.md) walks through a complete deployment with Google as the provider.

## Configuration profiles and roles

Server authentication establishes who someone is. The site's configuration profile decides which applications and routes each role can open. Separately, `runtime.authorization` checks administrative rights, `entitlements` in `Info.ts` declare what an application can do, and the FX status and request methods use `runtime.privacy` for each application's device consent. All of these checks run inside the page's own JavaScript, so they can't contain hostile code on the page. Protected server resources must authenticate and authorise every request themselves, and nothing you send to the browser should contain secrets. See [Authorisation](authorization.md) for the trust boundary and audit limits.

Your host defines the roles. A configuration profile lists them, the capabilities of each, the role of an anonymous visitor and how a session maps to a role:

```ts
import { mountSynCloudOS, type SynCloudOSConfigurationProfile } from "@syndromatic/syncloudos/browser";

const galleryPolicy: SynCloudOSConfigurationProfile = {
  id: "atelier",
  roles: {
    visitor: ["webspring.display", "route.open.public", "app.open.public"],
    member: ["webspring.display", "route.open.public", "app.open.public", "app.open.protected"],
    curator: ["webspring.display", "route.open.public", "app.open.public", "app.open.protected", "runtime.mutate"],
  },
  anonymousRole: "visitor",
  resolveRole: (session, claimedRole) =>
    !session.isAuthorised ? "visitor" : claimedRole === "curator" ? "curator" : "member",
};

await mountSynCloudOS({
  element: document.getElementById("root")!,
  configurationProfile: galleryPolicy,
});
```

If `resolveRole` returns a role the profile doesn't declare, the anonymous role is used instead. The role `system` belongs to the framework, so a profile can't declare it and a session never resolves to it. Applications never get the policy engine, and the origin, source and subject fields of a request never grant anything: `runtime.configurationProfiles` works out the subject from the runtime's own login and identity services.

## Limits

The framework runs in the browser with a client-side router. It doesn't provide server-side rendering, server-rendered metadata, search indexing, or offline sign-in like a native application's.
