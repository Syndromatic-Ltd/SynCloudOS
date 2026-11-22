# CryptoFX

CryptoFX gives you hashing, message authentication, key derivation, authenticated encryption, signing and key agreement over immutable Foundation `NSEData`. Use it whenever you need to protect or verify bytes in an app or a worker. Its type layout follows CryptoKit, so Swift code ports across with few surprises.

Import from `@syndromatic/syncloudos/fx/crypto`. Browser key handles, algorithm strings and adapters stay private.

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

CryptoFX needs no permission. It has no mounted session, authorisation status, capabilities object or permission request, because it only processes the bytes you pass in. A missing secure context, an unavailable algorithm or blocked WebAssembly is reported as a failed operation. It runs in workers without the DOM.

## Hashes, MACs and key derivation

`CRFXSHA256`, `CRFXSHA384` and `CRFXSHA512` each have `byteCount`, `blockByteCount`, a typed `Digest`, a static `hash(data)`, and instance `update(data)` and `finalize()`. Because the browser cannot hash incrementally, `update` keeps immutable copies and `finalize` hashes a snapshot; later updates do not change a digest you already have. Digests have a static `byteCount`, a hex `description`, byte iteration and `withUnsafeBytes(body)`.

`CRFXHMAC(Hash)` and `CRFXHKDF(Hash)` take a hash type and return a class specialised for it. The HMAC class has static `authenticationCode` and `isValidAuthenticationCode`, and you can also construct it with a key and call `update` and `finalize`. Codes are `CRFXHashedAuthenticationCode` values with `byteCount`, `description`, iteration and `withUnsafeBytes`.

The HKDF class has `extract`, `expand` and `deriveKey`. `extract` returns a typed authentication code. In `deriveKey(key, salt, info, count)`, pass `null` to leave out the salt or info; `deriveKey(key, count)` leaves out both. Output is capped at 255 digest blocks, and a larger count throws `incorrectParameterSize`.

`CRFXDigest`, `CRFXHashFunction` and `CRFXMessageAuthenticationCode` are the interfaces these types implement. `CRFXHashFunction` is an interface, not a string of algorithm names.

## Symmetric keys

`new CRFXSymmetricKey(data)` imports bytes, and `new CRFXSymmetricKey(size)` generates secure random bytes. `CRFXSymmetricKeySize` offers `bits128`, `bits192` and `bits256`, or `new CRFXSymmetricKeySize(bitCount)`. Keys expose `bitCount`, `bytes` and `withUnsafeBytes`. There is no `generate` or `rawRepresentation`.

## Comparing values

Equality is a static method named `==`:

```ts
Type["=="](lhs, rhs)
```

JavaScript's `==` operator cannot be overloaded, and there is no `isEqual` alias. Digests, authentication codes, symmetric keys and shared secrets compare through an internal WebAssembly XOR/OR reduction whose loop count and memory addresses depend only on the public length. It never exits early on a mismatch, and it zeroes its working storage afterwards. If the host blocks WebAssembly, comparisons throw `CRFXError` with code `underlyingCoreCryptoError`. This guards against timing leaks in the comparison itself, not against every host or hardware side channel.

## Byte access and mutation

`withUnsafeBytes` hands your callback a defensive `NSEData` copy, not a pointer, and `bytes` likewise returns Foundation bytes. Nothing exposes a mutable view into private key storage. JavaScript and browser-provider memory cannot promise secure-memory lifetimes or erase every copy of a secret.

A few members take an output buffer to fill or a buffer to change in place. Immutable `NSEData` cannot support that, so each of these fails with `underlyingCoreCryptoError` before calling your callback or touching any data:

| Member | Result |
| --- | --- |
| `new CRFXSymmetricKey({ copyingWithZeroing: data })` | Throws synchronously. The source is not zeroed. |
| `new CRFXSymmetricKey(size, initializingWith)` | Throws synchronously. The `(output: NSEData) => void` callback never runs. |
| `CRFXAES.GCM.sealInPlace(message, key, nonce, authenticating, tag)`, and the `CRFXChaChaPoly` equivalent | Rejects. The message and tag are not changed. |
| `CRFXAES.GCM.openInPlace(message, key, nonce, authenticating, tag)`, and the `CRFXChaChaPoly` equivalent | Rejects. The message is not changed. |
| `HKDF.deriveKey(key, salt, info, output)` with an `NSEData` output | Rejects. |
| `HKDF.expand(prk, info, into)` with an `NSEData` output | Rejects. |

Pass `null` for authentication data, salt or info you want to leave out. The HKDF overloads are told apart by whether the last argument is a byte count or an `NSEData`.

## Authenticated encryption

`CRFXAES.GCM.seal(data, key, nonce?, authenticating?)` and `CRFXAES.GCM.open(box, key, authenticating?)` accept 128-, 192- or 256-bit keys and use a 16-byte tag. Build a nonce with `new CRFXAES.GCM.Nonce()` for a random one, or `new CRFXAESGCMNonce(data)` with at least 12 bytes. Never reuse a nonce with the same key; a wrong tag fails with `authenticationFailure`.

`CRFXAESGCMSealedBox` (also `CRFXAES.GCM.SealedBox`) can be constructed from `combined` bytes or from `nonce, ciphertext, tag`. Its `nonce` is typed, and `ciphertext` and `tag` are `NSEData`. `combined` is nonce, ciphertext and tag concatenated, but only for a 12-byte nonce; for any other length it is `null`. Some browser providers also reject non-standard nonce lengths.

`CRFXChaChaPoly`, with its `Nonce` and `SealedBox` types, can build and parse values, but `seal` and `open` fail with `underlyingCoreCryptoError` because browsers do not provide ChaCha20-Poly1305.

## Signing and key agreement

`CRFXP256`, `CRFXP384`, `CRFXP521` and `CRFXCurve25519` each have `Signing` and `KeyAgreement` namespaces containing separate `PrivateKey` and `PublicKey` classes. Constructing a private key with no argument generates one. The NIST private-key constructors also accept a boolean, `compactRepresentable`, which defaults to `true`; pass `false` to lift the compact-point restriction. To import, pass an object naming the representation, for example `new CRFXP256.Signing.PrivateKey({ rawRepresentation: data })`.

| Key | Representations |
| --- | --- |
| P256/P384/P521 public | `rawRepresentation` (x‖y), `x963Representation` (0x04‖x‖y), `compressedRepresentation`, `compactRepresentation`, `derRepresentation` (SPKI), `pemRepresentation` |
| P256/P384/P521 private | `rawRepresentation` (the scalar), `x963Representation` (0x04‖x‖y‖scalar), `derRepresentation` (PKCS #8), `pemRepresentation`. Imports also accept SEC1 DER and `EC PRIVATE KEY` PEM. |
| Curve25519 public and private | `rawRepresentation` only |

Coordinates and scalars are 32, 48 or 66 bytes wide for P256, P384 and P521, and exports keep that width even when the browser drops leading zero bytes. The compact public representation is the x coordinate when y ≤ p − y, and `null` otherwise. Compressed points are decoded using public-only arithmetic.

### Import validation

NIST DER and PEM imports check the complete SPKI, PKCS #8 and nested SEC1 encodings before handing them to the browser. Trailing bytes, non-canonical lengths or integers, and unexpected fields fail with `invalidParameter`, including inside a PKCS #8 private-key payload.

Private-key imports check that 0 < scalar < curve order for raw, X9.63, SEC1, PKCS #8 and PEM input. The scalar reaches the browser wrapped in a standard PKCS #8 envelope; a host that cannot import that encoding fails with `CRFXError`. CryptoFX performs no private-key arithmetic in JavaScript.

When you supply a public point alongside a private key (including inside DER or PEM), CryptoFX checks that the two belong together by signing and verifying a fresh random challenge with the browser's ECDSA. Key-agreement keys keep their ECDH handle and use a temporary signing handle for this check. Mismatched, negated or malformed points fail with `invalidParameter`. Supplied X9.63 public points are kept in their native encoding.

If the browser cannot export a private key as JWK, `rawRepresentation` extracts the scalar from a validated PKCS #8 or SEC1 export. Curve25519 octet strings are not padded. Firefox can export the scalar of a scalar-only import but has no public point for it, so the private `x963Representation` and the derived public key's representations fail with `underlyingCoreCryptoError`. Import the key with its public point to get those representations.

### Signatures

NIST signing returns a curve-specific `ECDSASignature`, for example `CRFXP256.Signing.ECDSASignature`. Construct one with `{ rawRepresentation }` or `{ derRepresentation }`, and read either property back. Raw signatures are fixed-width r‖s, and DER is canonical ASN.1. `signature(data)` and `publicKey.isValidSignature(signature, data)` hash with SHA-256, SHA-384 or SHA-512 to match the curve. An invalid signature returns `false`. The overloads that take a precomputed digest exist but fail with `underlyingCoreCryptoError`, because the browser cannot sign or verify a digest without hashing it again. Curve25519 signatures (Ed25519) are plain `NSEData`.

### Shared secrets

`sharedSecretFromKeyAgreement` returns a `CRFXSharedSecret` with `description`, `withUnsafeBytes`, a static `==`, `hkdfDerivedSymmetricKey(Hash, salt, sharedInfo, count)` and `x963DerivedSymmetricKey(Hash, sharedInfo, count)`. You cannot construct one from bytes, and it has no `rawRepresentation`. Curve25519 key agreement uses X25519. Some hosts lack Ed25519 or X25519, in which case those methods fail with `CRFXError`.

## Legacy hashes

`CRFXInsecure.SHA1` works, for compatibility with older formats. `CRFXInsecure.MD5` and its digest type exist, but hashing fails with `underlyingCoreCryptoError` because browsers do not implement MD5.

## Asynchronous members

Browser cryptography is asynchronous, so these members return promises:

| Member | Returns |
| --- | --- |
| SHA `hash`, `finalize` | `Promise` of the typed digest |
| HMAC `authenticationCode`, `finalize`; `isValidAuthenticationCode` | `Promise<CRFXHashedAuthenticationCode>`; `Promise<boolean>` |
| HKDF `deriveKey`, `expand`; `extract` | `Promise<CRFXSymmetricKey>`; `Promise<CRFXHashedAuthenticationCode>` |
| AES-GCM `seal`; `open` (and ChaCha-Poly, which always rejects) | `Promise` of the sealed box; `Promise<NSEData>` |
| Key representation properties | `Promise<NSEData>`, `Promise<NSEData \| null>` or `Promise<string>` |
| Private-key `signature`; public-key `isValidSignature` | `Promise` of the typed signature or `NSEData`; `Promise<boolean>` |
| `sharedSecretFromKeyAgreement` | `Promise<CRFXSharedSecret>` |
| Shared-secret HKDF and X9.63 derivation | `Promise<CRFXSymmetricKey>` |
| In-place seal and open; HKDF output-buffer overloads | `Promise<void>`, always rejected with `underlyingCoreCryptoError` |

Constructors are ordinary constructors. They start key generation or import in the background, and the first representation or operation you await reports any failure. `publicKey` is available as a typed object straight away. There are no `generate`, `fromRawRepresentation` or `fromCombined` factories.

## Errors

`CRFXError` has a `code` of `incorrectKeySize`, `invalidParameter`, `incorrectParameterSize`, `underlyingCoreCryptoError`, `authenticationFailure`, `wrapFailure` or `unwrapFailure`; each is also available as a static string such as `CRFXError.invalidParameter`. Malformed parameters use the matching code, and a bad AES tag is `authenticationFailure`. Failures inside the browser provider keep the original error as `cause` and set the numeric `error` field to −1, which simply marks a backend failure.
