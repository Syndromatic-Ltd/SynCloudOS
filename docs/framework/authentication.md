# Authentication

Authentication in SynCloudOS has two halves. A small browser service tracks the signed-in session and drives the sign-in interface. A server handler owns identity: it talks to your OpenID Connect provider, validates tokens, issues sessions and enforces permissions. The browser never stores provider tokens, never accepts a role from the page and never treats a `VITE_` variable as a secret.

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
- With `"disabled"` or `"optional"` (string or object), the primary bundle declares `runtime.policy.public` in its manifest, because it launches before anyone signs in.
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

You configure providers on the server. The server describes each one with an `AuthenticationMethod`: an `id`, the complete button `label` and an optional `iconUrl`, which must be root relative or HTTPS. `/auth/methods` publishes this description, and the sign-in window draws a button for each method without special cases for any provider.

The handler supports one configured OIDC issuer, with client credentials and an admission policy that you supply. A provider that speaks only OAuth, without OIDC, needs a server adapter of its own beyond a new label and icon.

When an error appears in the sign-in window, the window plays the HapticsFX error pattern once. Clearing the error re-arms the feedback for the next failed attempt. Vibration and audio follow the user's feedback settings and the browser's capabilities.

## Custom sign-in view

Pass a component as `loginComponent` when the site needs its own presentation. It receives data and actions as props and has no access to the runtime, to passwords or to tokens.

```tsx
import type { AuthenticationViewProps } from "@syndromatic/syncloudos/auth";

export function SiteLogin({ methods = [], authenticationStatus, onMethodSignIn, onCancel }: AuthenticationViewProps) {
  return (
    <section aria-label="Sign in">
      <p>{authenticationStatus}</p>
      {methods.map((method) => (
        <button key={method.id} onClick={() => onMethodSignIn?.(method.id)}>
          {method.iconUrl ? <img src={method.iconUrl} alt="" /> : null}
          {method.label}
        </button>
      ))}
      {onCancel ? <button onClick={onCancel}>Cancel</button> : null}
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

## PolicyKit and roles

Server authentication decides who someone is. PolicyKit, inside the runtime, decides what the framework lets them do: launch an application, open a route, post a notification or use a service. It enforces at the framework's own entry points. It is not a sandbox against hostile scripts in the page, which can reach the DOM, storage and network directly, so data that needs protection stays behind the server.

Roles belong to your host. A policy profile lists the roles, the capabilities of each, the role of an anonymous visitor and how a session maps to a role:

```ts
import { mountSynCloudOS, type SynCloudOSPolicyProfile } from "@syndromatic/syncloudos/browser";

const galleryPolicy: SynCloudOSPolicyProfile = {
  id: "atelier",
  roles: {
    visitor: ["webspring.display", "route.open.public", "app.open.public"],
    member: ["webspring.display", "route.open.public", "app.open.public", "app.open.protected"],
    curator: ["webspring.display", "route.open.public", "app.open.public", "app.open.protected", "runtime.configure"],
  },
  anonymousRole: "visitor",
  resolveRole: (session, claimedRole) =>
    !session.isAuthorised ? "visitor" : claimedRole === "curator" ? "curator" : "member",
};

await mountSynCloudOS({
  element: document.getElementById("root")!,
  policyProfile: galleryPolicy,
});
```

A role the profile resolves but did not declare falls back to the anonymous role. The role `system` belongs to the framework, so a profile cannot declare it and a session never resolves to it. Applications never receive the policy engine, and a request's origin, source and subject fields never grant anything: PolicyKit evaluates the subject that it derives from the runtime's own login and identity services.

## Limits

The framework runs in the browser with a client side router. It makes no promise of server side rendering, server rendered metadata, search indexing or offline authentication equivalent to a native app.
