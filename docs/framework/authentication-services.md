# AuthenticationServices: optional passkeys

AuthenticationServices lets an application register and use platform passkeys through `ASAuthorizationController`, with credential providers, registration and assertion requests, and a delegate. It's imported separately from system authentication. Importing it doesn't inspect the browser, start authentication, add listeners or show a prompt, and an application that doesn't import it carries no passkey code.

A passkey proves to a relying-party server that the user holds a credential. Neither a browser credential nor an `ASAuthorization` is a verified identity or a system session. An application can use the API with its own service without turning on system sign-in, and a site can add a passkey method to its existing `AuthenticationService`.

## Application sign-in

```ts
import { NSEData, type NSEDataConvertible } from "@syndromatic/syncloudos/foundation";
import {
  ASAuthorizationController,
  ASAuthorizationPlatformPublicKeyCredentialProvider,
} from "@syndromatic/syncloudos/authentication-services";

export async function assertionForApplicationServer(challenge: NSEDataConvertible) {
  const provider = new ASAuthorizationPlatformPublicKeyCredentialProvider("accounts.example.com");
  const request = provider.createCredentialAssertionRequest(challenge);
  const controller = new ASAuthorizationController([request]);
  try {
    const authorization = await controller.performRequests();
    return authorization.credential.toJSON();
  } finally {
    controller.dispose();
  }
}
```

The application gets a fresh challenge from its own server, calls this function in response to a user action, and sends the returned standard WebAuthn JSON back to that server. Only the server's response decides whether the user is signed in to the application's account. SynCloudOS stores no private keys and no credential database.

Registration uses the same controller:

```ts
export async function registrationForApplicationServer(
  challenge: NSEDataConvertible,
  userID: NSEDataConvertible,
  userName: string,
) {
  const provider = new ASAuthorizationPlatformPublicKeyCredentialProvider("accounts.example.com", "Example Accounts");
  const request = provider.createCredentialRegistrationRequest(challenge, userName, userID);
  const controller = new ASAuthorizationController([request]);
  try {
    return (await controller.performRequests()).credential.toJSON();
  } finally {
    controller.dispose();
  }
}
```

`userID` is an opaque user handle from your server, 1 to 64 bytes long. Challenges and credential IDs can't be empty. Byte inputs can be `NSEData`, `Uint8Array` or `ArrayBuffer` and are copied, and every byte value returned is an immutable `NSEData`. Request options are copied too, so changing an input array afterwards can't change the request.

Registration defaults to a platform authenticator, discoverable credentials (`residentKey: "required"`), required user verification, no attestation and the ES256 and RS256 algorithms. Request options can set the display name, allowed and excluded credentials, the user-verification preference and a browser timeout in milliseconds. The browser still enforces its own capability and relying-party rules. A browser without a platform authenticator may report the request as unavailable or cancelled, and the framework can't guarantee support on every browser and device.

## Controller and delegate

The controller takes exactly one registration or assertion request, because WebAuthn runs one ceremony per browser call. `authorizationRequests` is a copy of the array you passed. `performRequests(signal?)` returns a promise and also calls one of the optional delegate methods:

- `authorizationControllerDidCompleteWithAuthorization(controller, authorization)`;
- `authorizationControllerDidCompleteWithError(controller, error)`.

`ASAuthorizationError.code` is `unknown`, `canceled`, `invalidResponse`, `notHandled` or `failed`. An insecure context or an unsupported relying party fails before the browser is asked, where that can be detected. A cancellation or denial in the browser becomes `canceled`, without the browser's error details. A missing or malformed credential becomes `invalidResponse`.

`cancel()`, an aborted signal or `dispose()` stops delivery at once, even if an injected browser port ignores the signal, and a late result never reaches the success delegate. A controller runs one ceremony at a time, and a second call while one is running rejects. Dispose the controller after use. For hosts and tests, you can inject an `ASAuthorizationBrowserPort`; by default the controller looks up `navigator.credentials` when a ceremony starts.

An assertion credential contains `credentialID`, `rawClientDataJSON`, `rawAuthenticatorData`, `signature` and a nullable `userID`. A registration contains `credentialID`, `rawClientDataJSON`, `rawAttestationObject` and its transports. `credential.toJSON()` encodes the standard WebAuthn response fields as unpadded base64url. Neither request asks for extensions, so the extension results in the JSON are empty.

## One more system sign-in provider

`createPasskeyAuthentication`, exported only from `@syndromatic/syncloudos/auth/passkey`, wraps an existing `AuthenticationService`. It keeps that service's identity handling, expiry, cross-tab notifications, log-out and server session checks. Its method is `{ id: "passkey", label: "Sign in with a passkey" }` unless you pass `method`. Other method IDs go straight to the wrapped service, so OIDC sign-in still works.

```ts
import { createHttpAuthentication } from "@syndromatic/syncloudos/auth";
import {
  createPasskeyAuthentication,
  type PasskeyAuthenticationOptions,
} from "@syndromatic/syncloudos/auth/passkey";

export function authenticationWithPasskeys(
  relyingPartyIdentifier: string,
  beginAssertion: PasskeyAuthenticationOptions["beginAssertion"],
  verifyAssertion: PasskeyAuthenticationOptions["verifyAssertion"],
) {
  return createPasskeyAuthentication({
    service: createHttpAuthentication(),
    relyingPartyIdentifier,
    beginAssertion,
    verifyAssertion,
  });
}
```

The site supplies two operations, both backed by its server:

1. `beginAssertion({ returnPath, signal })` obtains a fresh server challenge and returns the provider's assertion request for the configured relying party.
2. `verifyAssertion(credential, { returnPath, signal })` sends `credential.toJSON()` to the server. The server verifies it, establishes its normal HttpOnly session cookie and returns success.

After verification, the wrapper calls the wrapped service's `refresh()`, and sign-in completes only if the server then reports `authenticated` with a profile. A successful browser assertion or verification callback on its own never signs anyone in. The wrapper exposes the same `sessionAdapter` as the wrapped service, and afterwards navigates to the validated local return path (a host can pass its own `navigate`). Pass the returned service as `authentication: { policy: "optional" | "required", service }`.

By default the wrapper disposes the wrapped service when it's disposed; set `disposesService: false` if something else owns it. Cancelling, disposing or starting another sign-in aborts the pending ceremony, and a late result then neither refreshes the session nor navigates. Cancelling a request can't undo a change the server has already accepted, so session creation, revocation and competing requests must follow the server's own transaction rules.

The built-in OIDC server handler isn't a WebAuthn relying party. A site that offers passkeys must provide its own endpoints for challenges, verification and credential storage. Those endpoints must protect against cross-origin requests, check the expected origin and relying-party ID, bind each challenge to one use with an expiry, check that the credential belongs to the user, and verify user verification and the signature. This API doesn't relax any of those checks or deploy a server for you.

## Verification scope

The framework's tests cover copied requests, `NSEData` results, malformed responses, refusal outside a secure context, cancellation and delegate calls, using an injected credential port. The sign-in method tests run the real HTTP authentication service against an in-memory server and check that a refused or missing server session leaves nobody signed in. They don't test real platform authenticators, browser prompts, relying-party servers or devices. The module adds no interface of its own; the standard sign-in view draws the passkey method alongside the others.
