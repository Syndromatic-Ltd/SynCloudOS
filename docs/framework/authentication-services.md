# AuthenticationServices: optional passkeys

AuthenticationServices exposes platform passkeys through `ASAuthorizationController`, following Apple's providers, registration/assertion requests and delegate. It is a separate import from system authentication. Importing the module does not inspect the browser, start authentication, install listeners or prompt. A site with `authentication: "disabled"` and an app that does not import this entry carries no passkey code.

Passkeys prove possession of a credential to a relying-party **server**. Neither a browser credential nor an `ASAuthorization` is a verified identity or a system session. Applications may use the API for their own service without enabling system sign-in. Alternatively a site can explicitly compose a passkey method with its existing OIDC/local `AuthenticationService`.

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

The application obtains a fresh challenge from its own server, calls this function in response to a user action, and sends the returned standard WebAuthn JSON to that server. Only the server's response determines whether its application account is signed in. SynCloudOS stores neither private keys nor a relying-party credential database.

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

`userID` is an opaque server-generated user handle of 1–64 bytes. Challenges and credential IDs must be nonempty. `NSEData`, `Uint8Array` and `ArrayBuffer` are accepted; inputs are copied. All returned byte values are immutable `NSEData`. Request option objects are captured, so modifying an input array or a later browser bridge cannot modify the request.

Registration defaults to a platform authenticator, discoverable credentials (`residentKey: "required"`), user verification (`"required"`), no attestation and ES256/RS256 algorithms. Optional request options supply the display name, allowed/excluded credentials, user-verification preference and a browser timeout in milliseconds. Capability and relying-party restrictions are still enforced by the browser. Browsers without a platform authenticator can report the request as unavailable or cancelled; the framework does not promise cross-browser or physical-device support.

## Controller and delegate

The portable controller accepts exactly one registration or assertion request because WebAuthn exposes one ceremony per native call. `authorizationRequests` is a captured array. `performRequests(signal?)` returns a promise and also invokes one optional delegate completion:

- `authorizationControllerDidCompleteWithAuthorization(controller, authorization)`;
- `authorizationControllerDidCompleteWithError(controller, error)`.

`ASAuthorizationError.code` is `unknown`, `canceled`, `invalidResponse`, `notHandled` or `failed`. Insecure contexts and unsupported relying parties fail before native access where detectable. Native cancellation/denial maps to `canceled`; native error details are not copied into the public error. A null or malformed credential maps to `invalidResponse`.

`cancel()`, an aborted caller signal or `dispose()` stops delivery immediately, even when an injected native port ignores the signal. Late native results never call the success delegate. A controller supports one in-flight ceremony; a second concurrent call rejects. Dispose it after use. The optional `ASAuthorizationBrowserPort` is an injectable host/test seam; the default discovers `navigator.credentials` lazily when a ceremony starts.

An assertion credential contains `credentialID`, `rawClientDataJSON`, `rawAuthenticatorData`, `signature` and nullable `userID`. A registration contains `credentialID`, `rawClientDataJSON`, `rawAttestationObject` and transports. `credential.toJSON()` encodes the standard WebAuthn response fields as unpadded base64url. Neither request opts into extensions; its JSON extension result is empty.

## One more system sign-in provider

`createPasskeyAuthentication` is exported only by `@syndromatic/syncloudos/auth/passkey`. It composes an existing `AuthenticationService`; it does not replace its identity adapter, expiry, broadcasts, logout or server session checks. The default method is `{ id: "passkey", label: "Sign in with a passkey" }`. Other method IDs pass straight through to the existing service, so OIDC and local sign-in remain available.

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

The site supplies two server-backed operations:

1. `beginAssertion({ returnPath, signal })` obtains a fresh server challenge and returns the provider's assertion request for the configured relying party.
2. `verifyAssertion(credential, { returnPath, signal })` sends `credential.toJSON()` to the server. The server verifies it, establishes its normal HttpOnly session cookie and returns success.

After verification the composition calls the existing service's `refresh()`. Sign-in completes only if that server refresh returns `authenticated` with a profile. A successful browser assertion or a successful verification callback alone cannot establish runtime authority. The wrapper exposes the **same** `sessionAdapter` object as its base service. It then navigates to the validated local return path (a host may inject `navigate`). Supply the returned service through `authentication: { policy: "optional" | "required", service }`.

The composition owns and disposes its base service by default; set `disposesService: false` only when another host owns that lifetime. Cancellation/disposal/superseding sign-in aborts the pending ceremony and prevents a late client result from refreshing identity or navigating. Network cancellation cannot retract a mutation already accepted by a server: server session creation, revocation and competing requests must follow the server's own transaction rules.

The built-in OIDC server handler does not implement a WebAuthn relying party. A passkey-enabled site must provide its own challenge, verification and credential-storage endpoints, with same-origin mutation protection, expected origin and RP ID, challenge binding/expiry/single-use, credential ownership, user verification and signature verification. This API does not weaken those checks, deploy a server or enable passkeys on the Syndromatic site automatically.

## Verification scope

Focused tests exercise captured requests, Foundation byte results, malformed responses, secure-context refusal, cancellation and delegate completion through an injected credential port. Provider tests use the real HTTP authentication service against an in-memory HTTP fixture and prove that a refused/absent server session leaves identity empty. Those tests do not prove platform authenticator, browser prompt, real relying-party or physical-device acceptance. No UI is added by this module; the existing NSE sign-in view draws the extra configured method.
