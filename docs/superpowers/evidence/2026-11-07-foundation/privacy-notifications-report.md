# Notification privacy integration

The notification bridge now uses the same privacy user identity as mounted FX: `identity:${subjectId}` for an active canonical identity session, otherwise the current configuration-profile user id. Issued notification authority ends on a session id, principal or state change, a legacy login identity change, a managed app restriction, or mount cancellation. Saved consent is retained for the original user.

`applicationSystemServices.ts:35` binds the owner; `:69` creates the canonical notification scope; `:79` preserves passive inspection after local denial; `:91` wraps remote registration in a privacy lease. A remote registration needs this app's existing local consent and the native origin grant. Consent withdrawal aborts a pending association request. Same-identity unregistration remains available after local withdrawal and removes only the app association, without unsubscribing the shared origin subscription.

The PWA owner's adapter contract and protocol were preserved. No service worker, server configuration, native adapter or push protocol changes were made in this slice. No public API or UI was added, and no control was invented.

## Verification

- Red: 13 real-runtime/jsdom integration cases, 10 failed and 3 passed. Failures proved the incorrect user keys, stale identity/session/profile authority, stale permission result and pending push-association defects before this fix. See `privacy-notifications-red.log`.
- Green: 3 focused files, 28 tests passed: notification privacy, PWA system services and canonical mounted privacy/session integration. See `privacy-notifications-green.log`.
- `npx tsc -b --pretty false` passed. See `privacy-notifications-typecheck.log`.
- Architecture scan: only the known `src/FrameworkTests/Windows/WindowManagementFixture.tsx:29` private NSEPopover import remained. See `privacy-notifications-boundaries.log`.
- Scoped diff whitespace check passed.

These tests use the actual runtime, privacy store and browser notification adapter, with browser permission, service-worker registration and fetch seams. They do not prove a physical browser permission prompt, service-worker delivery, a real push service, VAPID cryptographic acceptance or server-side authorisation. Native PushManager work may not be cancellable; an abort prevents subsequent framework association/delivery, and an already-accepted server mutation cannot be rolled back by the client. Server-side enforcement and delivery remain the host's responsibility.

The parent job owns the final SDK build/package checks, full suite, site adoption and live UI evidence.
