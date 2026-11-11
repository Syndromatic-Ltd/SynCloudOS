# Authentication

Authentication in SynCloudOS has two halves. A browser service tracks the server-confirmed public session and drives sign-in. The server handler talks to the OpenID Connect provider, validates tokens, owns session identity and roles, and enforces resource permissions. Provider tokens and client secrets stay on the server. A `VITE_` variable is public configuration. [Authorisation](authorization.md) separately governs app access, administrative rights, entitlements and device consent.

## Choose a policy

The `authentication` option of `mountSynCloudOS` (type `AuthenticationInput`) takes a policy string or a configuration object:

| Value | Behaviour |
| --- | --- |
| `"disabled"` (the default) | A public site. No authentication service exists and no authentication requests are made. |
| `"optional"` | The policy alone, with no service. The runtime applies the optional policy, but nothing can sign in: the shell's account action stays pending and the sign-in window reports "Authentication is not configured." |
| `"required"` | The policy alone, with no service. The runtime applies the required policy and presents the sign-in window, which reports "Authentication is not configured." and cannot be completed. |
| `{ policy: "optional", service }` | Public content stays available, and the shell offers a Sign In action backed by `service`. |
| `{ policy: "required", service, loginComponent? }` | Protected content waits for a confirmed session. The shell keeps the requested route locally and presents the sign-in window until the session is authenticated. |

The shorthand strings `"optional"` and `"required"` construct no authentication service, no `/auth/*` requests and no session. They suit a host that wants the policy applied before its backend exists. To let people actually sign in, pass the object form with a `service`, normally from `createHttpAuthentication` (below). `"disabled"` is the only string that needs no further setup.

### Prerequisites

- `"disabled"` needs no backend.
- The object form with `createHttpAuthentication` needs a server that answers the same-origin `/auth/methods`, `/auth/session`, `/auth/start` and `/auth/logout` endpoints: use the [server handler](#server-handler) and an OIDC provider.
- With `"disabled"`, nobody can sign in, so the host opens the primary application publicly; it needs no `runtime.policy.public`. A primary that declares `runtime.policy.requiresLogin` fails to mount, since nobody could ever open it.
- With `"optional"` (string or object), the primary bundle declares `runtime.policy.public` in its manifest, because it launches before anyone signs in.
- With `"required"`, the sign-in window is presented before the primary application launches. The `application: { id }` host accepts the same `authentication` values as the Webspring shell; see [Getting started](getting-started.md#mount-one-application).

In a single-application host the **Account** pane of Preferences, Sign In and Log Out live in the application menu. A primary that fills the page has no system top bar, so it must declare `applicationMenu: { trigger: "content" }` and render a button with `useApplicationMenuTrigger()`; with `"optional"` or `"required"` authentication, mounting rejects without it. See [Mount one application in Getting started](getting-started.md#mount-one-application).

Optional sign-in offers **Cancel**, including when no authentication service is configured. Cancelling returns to the presentation that requested sign-in: the Board remains on the Board, while a single-application host resumes its existing application session, route and content. It does not create or authorise a session. Required sign-in has no Cancel action.

The service reports one of `disabled`, `checking`, `anonymous`, `authenticating`, `authenticated`, `expired` and `error`. Disposing the host disposes the service you supplied.

## Browser service

`createHttpAuthentication` from `@syndromatic/syncloudos/auth` builds the service. It calls the same-origin endpoints `/auth/methods`, `/auth/session`, `/auth/start` and `/auth/logout` with cookie credentials, and it revalidates on startup, on focus and on notifications from other tabs.

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

The authentication UI's `checking` or `authenticating` status describes a request, not a new
identity decision. The last verified identity remains authoritative until the server replaces
it, logout succeeds, or its existing expiry timer fires. Overlapping reads cannot overwrite a
newer adapter notification. Identity changes reach the runtime before UI subscribers receive
the completed authentication status.

If `/auth/start` completes sign-in and returns the exact requested local return path, the client
verifies `/auth/session` before navigating there. Browser Navigation API routing can retain the
current document; successful sign-in must therefore update that runtime without relying on a
reload. A missing or invalid session fails sign-in. External provider redirects retain their
normal navigation flow, and passive browser rechecks cannot supersede a pending explicit sign-in.

Explicit logout terminates all open applications, including suspended ones, through their
normal lifecycle before locking the runtime and ending server identity. Termination vetoes or
save failures stop logout while the login session is still authorised. A later login launches
fresh application/controller resources instead of reusing subscriptions from revoked windows.

You configure providers on the server. The server describes each one with an `AuthenticationMethod`: an `id`, the complete button `label` and an optional `iconUrl`, which must be root relative or HTTPS. `/auth/methods` publishes this description, and the sign-in window draws a button for each method without special cases for any provider.

The handler supports one configured OIDC issuer, with client credentials and an admission policy that you supply. A provider that speaks only OAuth, without OIDC, needs a server adapter of its own beyond a new label and icon.

When an error appears in the sign-in window, the window plays the HapticsFX error pattern once. Clearing the error re-arms the feedback for the next failed attempt. Vibration and audio follow the user's feedback settings and the browser's capabilities.

## Optional passkeys

Passkeys are separate, opt-in [AuthenticationServices](authentication-services.md) APIs. `@syndromatic/syncloudos/authentication-services` exports the `ASAuthorizationController` provider/request/delegate surface for an application's own relying-party server. `@syndromatic/syncloudos/auth/passkey` exports `createPasskeyAuthentication`, which composes one more method with an existing OIDC/local system service.

Neither entry is re-exported by the ordinary `auth`, browser or application entry. An app that does not import passkeys carries no passkey API; a site with authentication disabled constructs no authentication service. Applications may still explicitly use passkeys for their own server without enabling system sign-in.

The relying-party server verifies returned credentials. System passkeys then refresh the existing authentication service and complete only after it confirms an authenticated session. A browser assertion or successful callback alone never creates runtime identity. The built-in OIDC handler does not supply a WebAuthn relying-party database or verifier; those endpoints remain an explicit host integration.

## Custom sign-in view

Pass a component as `loginComponent` when the site needs its own presentation. It receives data and actions as props and has no access to the runtime, to passwords or to tokens.

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

`@syndromatic/syncloudos/server/auth` targets Cloudflare Workers, and any runtime with the standard `Request` and `Response` types can use it.

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

The handler performs OIDC discovery and the authorization code flow with PKCE. It binds state and nonce to the browser, validates the ID token's signature and claims, applies your admission policy, stores hashed sessions and supports revocation. The browser receives only the public profile and the expiry time.

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

Data that must stay private is authorised on the server. A decision made in the browser never substitutes for it.

### Admission and roles

`createEmailAllowlistAdmissionPolicy` admits an explicit list of addresses and gives them the `member` role. Implement `AuthAdmissionPolicy` for other rules, and pass `permissionCheck` to `createAuthHandler` to map roles to permissions.

### Configuration

The Worker reads its settings from server-side variables and bindings: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, an optional `OIDC_CLIENT_SECRET`, `PUBLIC_ORIGIN`, an allowlist and a database binding for the session store. Keep them out of `VITE_` variables, HTML, browser bundles, fixtures and logs. Session lifetime defaults to eight hours, and `sessionLifetimeMs` and `transactionLifetimeMs` adjust it.

[Google OIDC setup](google-oidc-setup.md) walks through a complete deployment with Google as the provider.

## Configuration profiles and roles

Server authentication establishes identity. The site configuration profile governs app/route access and role requirements. `runtime.authorization` checks administrative named rights; `Info.ts.entitlements` declares application capabilities; per-FX status and request methods use `runtime.privacy` for per-app consent. These checks run at cooperative framework entry points in the same JavaScript realm. They cannot sandbox hostile page code. Protected server resources must independently authenticate and authorise each request; downloaded assets must contain no secrets. See [Authorisation](authorization.md) for the trust boundary and audit limits.

Roles belong to your host. A configuration profile lists the roles, the capabilities of each, the role of an anonymous visitor and how a session maps to a role:

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

A role the profile resolves but did not declare falls back to the anonymous role. The role `system` belongs to the framework, so a profile cannot declare it and a session never resolves to it. Applications never receive the policy engine, and a request's origin, source and subject fields never grant anything: `runtime.configurationProfiles` evaluates the subject that it derives from the runtime's own login and identity services.

## Limits

The framework runs in the browser with a client side router. It makes no promise of server side rendering, server rendered metadata, search indexing or offline authentication equivalent to a native app.
