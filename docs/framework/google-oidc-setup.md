# Google sign-in setup

This guide connects the [server authentication handler](authentication.md#server-handler) to Google as the OpenID Connect provider, on Cloudflare Workers with a D1 database for sessions. Use a dedicated test Worker and a dedicated test database while you follow it, and keep real credentials out of source control.

## Plan the origin

Choose the HTTPS origin that serves the Worker, for example `https://login-test.example.com`. `PUBLIC_ORIGIN` holds that origin without a path or a trailing slash. Google will redirect back to:

```text
${PUBLIC_ORIGIN}/auth/callback
```

The handler requests the scopes `openid email profile` and authenticates to Google's token endpoint with the client secret in the request body.

## Configure Google

1. In a dedicated Google Cloud project, configure the OAuth consent screen in testing mode.
2. Add two test users: one address that your allowlist will accept, and one that it will reject. Both must be test users so that either can reach the consent step. The server allowlist is what admits or refuses them afterwards.
3. Create an OAuth client of type **Web application**.
4. Add `${PUBLIC_ORIGIN}/auth/callback` as an authorised redirect URI.
5. Note the client ID and keep the client secret private.

## Configure the Worker

A minimal `wrangler.jsonc` for the test Worker sets the public values and the database binding:

```jsonc
{
  "name": "login-test",
  "main": "src/worker.ts",
  "compatibility_date": "2025-01-01",
  "vars": {
    "OIDC_ISSUER": "https://accounts.google.com",
    "OIDC_CLIENT_ID": "<Google web client ID>",
    "PUBLIC_ORIGIN": "https://login-test.example.com"
  },
  "d1_databases": [
    {
      "binding": "AUTH_DB",
      "database_name": "login-test-auth",
      "database_id": "<database ID>",
      "migrations_dir": "migrations"
    }
  ]
}
```

Write the Worker as shown in the [authentication guide](authentication.md#server-handler), and route `/auth/*` to `auth.fetch`.

## Create the session database

The handler stores hashed sessions and short lived sign-in transactions. Save this as `migrations/0001_auth.sql`:

```sql
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  profile TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_transactions (
  state_hash TEXT PRIMARY KEY,
  browser_binding_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  pkce_verifier TEXT NOT NULL,
  return_path TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
```

Then create the database, apply the migration and store the secrets. The `secret put` commands prompt for their values, so nothing lands in your shell history:

```bash
npx wrangler d1 create login-test-auth
# Copy the returned ID into wrangler.jsonc, then:
npx wrangler d1 migrations apply login-test-auth --remote
npx wrangler secret put OIDC_CLIENT_SECRET
npx wrangler secret put AUTH_ALLOWED_EMAILS
```

Set `AUTH_ALLOWED_EMAILS` to the accepted address only, as a comma separated list. `AUTH_DB` is a Worker binding and never reaches the browser. For local development, an ignored `.dev.vars` file holds the same values for `wrangler dev`.

## Roles

The default allowlist policy assigns the `member` role. Map that role to the permissions your application needs through your policy profile and the handler's `permissionCheck`. Signing in with Google grants no more than that mapping gives.

## Verify

After you deploy to the test Worker with `npx wrangler deploy`, confirm each of these:

- The accepted account signs in and receives a Secure, HttpOnly session cookie.
- The rejected account is denied after Google authentication.
- A missing, expired or revoked cookie is denied.
- Expiry holds on the server, so shorten `sessionLifetimeMs` in a test configuration and check that a request after that time fails.
- Logout clears and revokes the session.
- A return URL that points to another origin is rejected.
- Direct requests to protected APIs still require the right permission.

References: [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server), [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/) and [Cloudflare Workers Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/).
