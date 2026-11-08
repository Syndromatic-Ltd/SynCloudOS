# CryptoFX

CryptoFX (`@syndromatic/syncloudos/fx/crypto`) follows the CryptoKit types and members below. Public byte arguments are immutable Foundation `NSEData`. Each public type has its own source file; `public.ts` only re-exports types. Browser cryptographic handles, algorithm strings and adapters are private.

```ts
import { NSEData } from "@syndromatic/syncloudos/foundation";
import {
  CRFXAES, CRFXSHA256, CRFXSHA256Digest, CRFXHMAC, CRFXHKDF,
  CRFXSymmetricKey, CRFXSymmetricKeySize, CRFXP256,
} from "@syndromatic/syncloudos/fx/crypto";

const data = NSEData.from(new TextEncoder().encode("hello"));
const key = new CRFXSymmetricKey(CRFXSymmetricKeySize.bits256);
const box = await CRFXAES.GCM.seal(data, key);
const restored = await CRFXAES.GCM.open(new CRFXAES.GCM.SealedBox(box.combined!), key);
const hash = new CRFXSHA256(); hash.update(data);
const digest = await hash.finalize();
const matches = CRFXSHA256Digest["=="](digest, await CRFXSHA256.hash(data));
const HMAC = CRFXHMAC(CRFXSHA256);
const mac = new HMAC(key); mac.update(data);
const valid = await HMAC.isValidAuthenticationCode(await mac.finalize(), data, key);
const HKDF = CRFXHKDF(CRFXSHA256);
const derived = await HKDF.deriveKey(key, null, data, 32);
const signing = new CRFXP256.Signing.PrivateKey();
const signature = await signing.signature(data);
const verified = await signing.publicKey.isValidSignature(signature, data);
```

## Types and byte access

- `CRFXSHA256`, `CRFXSHA384`, and `CRFXSHA512` have `byteCount`, `blockByteCount`, their typed `Digest`, `hash(data)`, `update(data)` and `finalize()`. Digests expose their static `byteCount`, hex `description`, byte iteration and `withUnsafeBytes(body)`. Updates accumulate immutable copies because the browser has no incremental hash operation. Finalisation computes a snapshot; later updates do not alter that digest.
- `CRFXHMAC(Hash)` and `CRFXHKDF(Hash)` select a CryptoKit hash type. The result is the specialised class, corresponding to Swift `HMAC<Hash>` and `HKDF<Hash>`. HMAC has static `authenticationCode` and `isValidAuthenticationCode`, plus constructor-based `update`/`finalize`. Codes are `CRFXHashedAuthenticationCode`, with `byteCount`, `description`, iteration and `withUnsafeBytes`.
- HKDF has `extract`, `expand`, and `deriveKey`. `extract` returns a typed authentication code. Supply `null` to omit salt or info in the full `deriveKey(key, salt, info, count)` overload; `deriveKey(key, count)` omits both. Output is limited to 255 digest blocks.
- `new CRFXSymmetricKey(data)` imports bytes; `new CRFXSymmetricKey(size)` generates secure random bytes. `CRFXSymmetricKeySize` provides `bits128`, `bits192`, `bits256`, `new CRFXSymmetricKeySize(bitCount)` and `bitCount`. Keys expose `bitCount`, `bytes` and `withUnsafeBytes`; they have no invented `generate` or `rawRepresentation` member.
- `CRFXDigest`, `CRFXHashFunction` and `CRFXMessageAuthenticationCode` are the corresponding protocols. The former string-union `CRFXHashFunction` has been deleted; its name now denotes Apple's actual protocol, never an algorithm string.

Swift `static func ==` is represented literally as `Type["=="](lhs, rhs)`. JavaScript's `==` operator is not overloaded, and there is no `isEqual` alias on CryptoKit values. Digest, authentication-code, symmetric-key and shared-secret comparisons use an internal WebAssembly XOR/OR reduction whose loop count and addresses depend only on the public length. There is no data-dependent early exit; comparison storage is zeroed after use. If the host blocks this primitive, comparisons fail with `CRFXError.underlyingCoreCryptoError`. This does not claim immunity to host or hardware side channels.

`withUnsafeBytes` passes a defensive `NSEData` value rather than a native pointer. `bytes` similarly maps Apple's `RawSpan` to Foundation bytes. No mutable view into private key storage is exposed. JavaScript/native-provider memory cannot provide Swift's secure-memory lifetime or guaranteed erasure of all copies.

Apple's mutation contracts remain explicit, but immutable Foundation bytes cannot fulfil them. Each member below throws or rejects with `CRFXError.underlyingCoreCryptoError` before invoking a callback or changing data:

| Apple contract | CryptoFX member | Result |
| --- | --- | --- |
| `SymmetricKey.init(copyingWithZeroing:)` | `new CRFXSymmetricKey({ copyingWithZeroing: data })` | Synchronous error; no source-zeroing guarantee |
| `SymmetricKey.init(size:initializingWith:)` | `new CRFXSymmetricKey(size, initializingWith)` | Synchronous error; `(output: NSEData) => void` callback is never invoked |
| AES.GCM / ChaChaPoly `seal(inPlace:using:nonce:authenticating:tag:)` | `Cipher.sealInPlace(message, key, nonce, authenticating, tag)` | Rejected `Promise<void>`; no in-place message or tag mutation |
| AES.GCM / ChaChaPoly `open(inPlace:using:nonce:authenticating:tag:)` | `Cipher.openInPlace(message, key, nonce, authenticating, tag)` | Rejected `Promise<void>`; no in-place message mutation |
| HKDF `deriveKey(inputKeyMaterial:salt:info:output:)` | `HKDF.deriveKey(key, salt, info, output)` with `NSEData` output | Rejected `Promise<void>` |
| HKDF `expand(pseudoRandomKey:info:into:)` | `HKDF.expand(prk, info, into)` with `NSEData` output | Rejected `Promise<void>` |

Pass `null` for omitted authentication data, salt or info in these positional signatures. The `inPlace` label distinguishes mutation from sealed-box operations; HKDF overloads distinguish the output byte count from the Foundation output value. No replacement output value or mutable-byte contract is invented.

## Authenticated encryption

`CRFXAES.GCM.seal(data, key, nonce?, authenticating?)` and `open(box, key, authenticating?)` use 128-, 192- or 256-bit keys and a 16-byte tag. `CRFXAESGCMNonce` supports random construction or `new CRFXAESGCMNonce(data)` with at least 12 bytes. Never reuse a nonce with the same key.

`CRFXAESGCMSealedBox` has `constructor(combined)` and `constructor(nonce, ciphertext, tag)`. Its `nonce` is typed, and its `ciphertext` and `tag` are `NSEData`. `combined` is nonce–ciphertext–tag only for a 12-byte nonce; it is `null` for other nonce lengths, matching CryptoKit. Nonstandard nonce lengths may also be rejected by an individual native provider.

`CRFXChaChaPoly` and its `Nonce`/`SealedBox` types exist. Value construction and parsing work; `seal` and `open` fail with `CRFXError.underlyingCoreCryptoError` because the browser provider does not expose ChaCha20-Poly1305.

## Signing, key agreement and representations

`CRFXP256`, `CRFXP384`, `CRFXP521` and `CRFXCurve25519` expose their actual `Signing` and `KeyAgreement` namespaces, with separate `PrivateKey` and `PublicKey` classes. Private constructors generate keys. NIST private constructors also take `compactRepresentable` (default true); `false` disables the compact-point restriction. Representation initialisers use their Swift argument label, for example `new CRFXP256.Signing.PrivateKey({ rawRepresentation: data })`.

| Key | Representation properties and initialisers |
| --- | --- |
| P256/P384/P521 public | `rawRepresentation` (x‖y), `x963Representation` (0x04‖x‖y), `compressedRepresentation`, `compactRepresentation`, `derRepresentation` (SPKI), `pemRepresentation` |
| P256/P384/P521 private | `rawRepresentation` (scalar), `x963Representation` (0x04‖x‖y‖scalar), `derRepresentation` (PKCS8), `pemRepresentation`; imports also accept SEC1 DER / EC PRIVATE KEY PEM |
| Curve25519 public/private | `rawRepresentation` only, as CryptoKit provides |

NIST DER and PEM imports validate complete canonical SPKI, PKCS8 and nested SEC1 encodings before native import. Trailing bytes, noncanonical lengths or integers, and unexpected fields fail with `CRFXError.invalidParameter`, including private-key payloads embedded inside PKCS8.

NIST private imports validate `0 < scalar < curve order` before native import for raw, X9.63, SEC1/PKCS8 and PEM representations. Supplied X9.63 public points are retained in the native encoding. Any supplied private-key public point, including one inside DER or PEM, must agree with the scalar: a fresh internal CSPRNG challenge is signed and verified through native ECDSA operations. Agreement keys retain their ECDH handle and usages; their consistency check uses a temporary native signing handle. Mismatched, negated or malformed supplied points fail with `CRFXError.invalidParameter`. No private elliptic-curve arithmetic or public-point recovery is performed.

NIST private scalar and coordinate exports preserve their fixed 32-, 48- or 66-byte widths even when the native provider omits leading zero bytes. If native JWK export fails, `rawRepresentation` extracts the scalar from a validated native PKCS8/SEC1 export. This is a format conversion; Curve25519 octet strings are not numerically padded. In the tested Firefox provider, scalar-only imports can export that private scalar but lack native public-point information: private `x963Representation` and the derived public key's representations then fail with `CRFXError.underlyingCoreCryptoError`. A native key imported with its public point can provide those representations. No private elliptic-curve arithmetic is used to recover missing public points.

The NIST coordinate widths are 32, 48 and 66 bytes. Compact public representation is the x coordinate when y ≤ p−y; otherwise it is `null`. Compressed public points are decoded with public-only arithmetic. Private scalar import is passed to the native provider inside a standards-based PKCS8 envelope; no private-key arithmetic is implemented in JavaScript. A host unable to import that encoding fails with `CRFXError`.

NIST signing returns a curve-specific `ECDSASignature`, with `constructor({ rawRepresentation })`, `constructor({ derRepresentation })` and both representation properties. Raw signatures are fixed-width r‖s; DER encoding is canonical ASN.1. `signature(data)` and `publicKey.isValidSignature(signature, data)` use SHA-256, SHA-384 or SHA-512 for the corresponding curve. Their digest overloads exist but fail with `CRFXError.underlyingCoreCryptoError`: the browser provider cannot sign or verify an already-computed digest without hashing it again. Curve25519 signatures are `NSEData` (Ed25519).

Key agreement returns `CRFXSharedSecret`, which has `description`, `withUnsafeBytes`, literal `==`, `hkdfDerivedSymmetricKey(Hash, salt, sharedInfo, count)` and `x963DerivedSymmetricKey(Hash, sharedInfo, count)`. It has no public byte constructor or invented `rawRepresentation`. Curve25519 agreement uses X25519. Individual hosts may lack Ed25519/X25519; the exposed methods then fail with `CRFXError`.

`CRFXInsecure.SHA1` is available for compatibility. `CRFXInsecure.MD5` and its digest type exist; hashing/finalisation fail with `CRFXError.underlyingCoreCryptoError` because the browser provider has no MD5.

## Asynchronous members and errors

The browser-forced asynchronous members are annotated in every type's source:

| Apple member | CryptoFX asynchronous result |
| --- | --- |
| SHA hash / finalize | `Promise<typed Digest>` |
| HMAC authenticationCode / isValidAuthenticationCode / finalize | `Promise<HashedAuthenticationCode>` / `Promise<boolean>` |
| HKDF deriveKey / extract / expand | `Promise<SymmetricKey>` / `Promise<HashedAuthenticationCode>` |
| AES.GCM seal / open; ChaChaPoly backend boundary | `Promise<SealedBox>` / `Promise<NSEData>` |
| Key representation properties | `Promise<NSEData>`, `Promise<NSEData | null>` or `Promise<string>` |
| Private-key signature; public-key isValidSignature | `Promise<typed signature or NSEData>` / `Promise<boolean>` |
| Private-key sharedSecretFromKeyAgreement | `Promise<SharedSecret>` |
| SharedSecret HKDF / X9.63 derivation | `Promise<SymmetricKey>` |
| AES.GCM / ChaChaPoly in-place seal/open; HKDF output-span overloads | `Promise<void>` rejected with `CRFXError.underlyingCoreCryptoError` |

Constructors are real constructors. They start native generation/import internally; the first awaited representation or operation observes any asynchronous failure. The `publicKey` property is a typed key object immediately. No `generate`, `fromRawRepresentation`, `fromCombined` or client factory remains.

`CRFXError` uses CryptoKitError's `incorrectKeySize`, `invalidParameter`, `incorrectParameterSize`, `underlyingCoreCryptoError`, `authenticationFailure`, `wrapFailure`, and `unwrapFailure` cases. Backend failures retain their cause and use an underlying error value of −1; that is a backend failure marker, not a claim to a native corecrypto status. Malformed parameters are rejected with the corresponding CryptoKit case; a bad AES tag is `authenticationFailure`. Invalid signatures return `false` as Apple's verification method does.

CryptoFX is a direct, permission-free library. It has no mounted session, authorisation enum, capabilities object or permission request. Session privacy revocation and browser permission denial therefore do not apply: these algorithms process caller-supplied bytes without device access. Missing secure context, unavailable algorithms or blocked WebAssembly are operation failures, not authorisation states. It runs in workers without the DOM.

Sources: [CryptoKit](https://developer.apple.com/documentation/cryptokit), [HashFunction](https://developer.apple.com/documentation/cryptokit/hashfunction), [HMAC](https://developer.apple.com/documentation/cryptokit/hmac), [HKDF](https://developer.apple.com/documentation/cryptokit/hkdf), [AES.GCM](https://developer.apple.com/documentation/cryptokit/aes/gcm), [P256](https://developer.apple.com/documentation/cryptokit/p256), [CryptoKitError](https://developer.apple.com/documentation/cryptokit/cryptokiterror), and Apple's [swift-crypto EC implementation](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/Keys/EC/BoringSSL/NISTCurvesKeys_boring.swift).
