# CryptoFX fidelity implementation report

Status: implementation and all assigned validation complete; explicit-path commit pending.

## Scope and files

Baseline: `d0a16e9` on `fix/blind-rewrite-friction`. CryptoFX only. No other family, site Gallery, SDK adoption, server/port, branch, push or Fusion changes. Existing untracked evidence was preserved. Root owns independent review and the final full suites.

Old family files: `src/FX/CryptoFX/CRFXCrypto.ts` (deleted) and `src/FX/CryptoFX/public.ts` (rewritten as re-exports only). The complete new/current file inventory and member map follow below.

Active consumers and metadata changed:

- `src/SynCloudOS/InstalledApplications/capabilityReport.ts`: removed the invented Crypto capability-query row; CryptoKit has no capabilities API.
- `tests/runtime/cryptofx.test.ts`: replaced old factories/string algorithms/raw digests/browser-key tests with the CryptoKit contract.
- `tests/runtime/fx/packed-crypto.test.ts`: independently installed SDK declarations/runtime and dynamic developer-MCP counterpart specimen.
- `scripts/synware/check-fx-crypto-consumer.mjs`: migrated worker APIs and replaced its test server with a synthetic HTTPS Playwright route, without a listening port.
- `docs/framework/fx/crypto.md` and `docs/framework/fx/README.md`: authoring guidance and precise limitations.
- `docs/framework/appkit-counterparts.json`: every public Crypto type/protocol maps to its Apple counterpart.

Architecture aliases, SDK entries and TypeScript paths already point to `src/FX/CryptoFX/public.ts`; they needed no path changes. Developer MCP derives declarations and counterparts dynamically, and the packed test exercises that mechanism. A search of active framework scaffolds/examples found no other old Crypto consumers. Historical evidence/reviews were not rewritten. Site Gallery intentionally retains its old SDK/API until root's final adoption.

## API and backend decisions

All public bytes are immutable Foundation `NSEData`; browser handles and algorithm strings are internal. Public classes/protocols each have their own named file. The old string-union `CRFXHashFunction` is gone; the same spelling now denotes Apple's actual HashFunction protocol, not an alias for the old API.

The literal Swift member name `static func ==` is represented as `Type["=="](lhs, rhs)`. JavaScript operators are not overloaded, and CryptoKit values have no `isEqual` alias. Root resolved this naming choice before production implementation. The internal WebAssembly XOR/OR reduction has loop count and memory addresses dependent only on public length, with no secret-dependent early exit; scratch memory is cleared after comparison. If the primitive is blocked, it fails with `CRFXError.underlyingCoreCryptoError`. There is no JavaScript comparison fallback or claim of immunity to host/hardware side channels.

`CRFXHMAC(Hash)` and `CRFXHKDF(Hash)` are the review-approved runtime generic specialization and return constructor-shaped classes. They are not client/createX factories. Swift pointer/span/ContiguousBytes members use copied NSEData according to the Foundation-byte rule. Swift compiler-level Hashable/Sendable conformances do not introduce browser APIs.

Native private scalar imports are wrapped in standards PKCS8 envelopes and passed to the cryptographic provider. No secret-dependent elliptic-curve arithmetic is implemented in JavaScript. Public compressed/compact point decoding uses public-only arithmetic. Apple's own source confirms public raw representation is x‖y, public x963 is 0x04‖x‖y, private x963 adds the scalar, and compact representation requires y ≤ p−y. SEC1 private DER and EC PRIVATE KEY PEM imports are wrapped for the provider; exported private DER is PKCS8 and public DER is SPKI.

Constructors immediately return typed objects and start native work. Each native-key promise and derived-public-key promise retains a rejection handler without replacing the original rejected promise. Unsupported generation therefore does not create unhandled rejection events; awaiting a representation, signature or agreement still observes the error. The `publicKey` property is immediately a typed object. There are no invented readiness members or key-generation factories.

## Unsupported APIs and errors

- ChaChaPoly seal/open, Insecure.MD5 hash/finalize, and precomputed-digest ECDSA signing/verification retain their Apple members and fail with `CRFXError.underlyingCoreCryptoError`.
- Missing native algorithms, absent secure context, unsupported imports/representations, or blocked Wasm fail with `CRFXError`; no capability/authorization API is invented.
- Nonextractable host keys are not accepted through a public browser-key constructor. CryptoKit representation properties require framework-generated/imported extractable native keys. Secure Enclave/nonextractable storage is outside this review's required surface and is not claimed. Native import/export support is conditional on the actual browser provider; Node success alone is not evidence of browser support.
- AES-GCM nonce initializers accept at least 12 bytes. `combined` is null for non-12-byte nonces. Native hosts may reject a nonstandard nonce even though the value can be constructed.
- Parameter/size failures use Apple's invalidParameter, incorrectParameterSize or incorrectKeySize cases; AES authentication failure uses authenticationFailure. Native failures retain their cause and an underlying marker of −1, which is not presented as a real corecrypto status. wrapFailure and unwrapFailure cases also exist.
- Ed25519/X25519 are supported when exposed by the provider. Missing implementations fail through the same CRFXError boundary, without changing public names.

Browser-forced asynchronous members are individually annotated in source: hash/finalize; HMAC code creation/verification/finalize; HKDF extract/expand/deriveKey; AES seal/open; key representation properties/signature/verification/agreement; SharedSecret HKDF/X9.63 derivation. ChaChaPoly's unsupported backend boundary is asynchronous too. Constructor-started native failure is observed through those asynchronous members. All other members remain synchronous.

CryptoFX processes caller-supplied bytes and has no device/session permission, mounted-app service or authorization state. Session privacy revocation and browser permission denial do not apply. Missing secure context/provider/CSP support is an operation failure, not an authorization state. No privacy guarantee was weakened. Workers require no DOM. JavaScript/native-provider memory does not promise erasure of every copied secret; the API exposes no mutable view into internal secret storage.

Removed names/signatures: CRFXCapabilities/query, the CRFXHashFunction string union, SymmetricKey.generate, PrivateKey.generate, PublicKey.fromRawRepresentation, SealedBox.fromCombined, raw-data digests/signatures/nonces, public NSEDataConvertible, public CryptoKey constructors, string hash arguments, representation methods replacing Apple properties, and symmetric/shared-secret rawRepresentation. No compatibility aliases remain.

## Sources consulted

Apple documentation was read using its directly readable `https://developer.apple.com/tutorials/data/documentation/cryptokit/<symbol>.md` endpoints:

- [HashFunction](https://developer.apple.com/documentation/cryptokit/hashfunction), [Digest](https://developer.apple.com/documentation/cryptokit/digest), [SHA256](https://developer.apple.com/documentation/cryptokit/sha256), [SHA256Digest](https://developer.apple.com/documentation/cryptokit/sha256digest).
- [HMAC](https://developer.apple.com/documentation/cryptokit/hmac), [HashedAuthenticationCode](https://developer.apple.com/documentation/cryptokit/hashedauthenticationcode), [HKDF](https://developer.apple.com/documentation/cryptokit/hkdf).
- [SymmetricKey](https://developer.apple.com/documentation/cryptokit/symmetrickey), [SymmetricKeySize](https://developer.apple.com/documentation/cryptokit/symmetrickeysize), [SharedSecret](https://developer.apple.com/documentation/cryptokit/sharedsecret).
- [AES.GCM](https://developer.apple.com/documentation/cryptokit/aes/gcm), its Nonce/SealedBox pages and individual nonce-init/combined pages.
- [P256.Signing.PrivateKey](https://developer.apple.com/documentation/cryptokit/p256/signing/privatekey), PublicKey, ECDSASignature and KeyAgreement.PrivateKey pages.
- [P384.Signing.PrivateKey](https://developer.apple.com/documentation/cryptokit/p384/signing/privatekey), [P521.Signing.PrivateKey](https://developer.apple.com/documentation/cryptokit/p521/signing/privatekey).
- [Curve25519.Signing.PrivateKey](https://developer.apple.com/documentation/cryptokit/curve25519/signing/privatekey), PublicKey and KeyAgreement.PrivateKey pages.
- [ChaChaPoly](https://developer.apple.com/documentation/cryptokit/chachapoly), Nonce and SealedBox; [Insecure](https://developer.apple.com/documentation/cryptokit/insecure), SHA1 and MD5; [CryptoKitError](https://developer.apple.com/documentation/cryptokit/cryptokiterror).
- Apple-owned [NISTCurvesKeys_boring.swift](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/Keys/EC/BoringSSL/NISTCurvesKeys_boring.swift) for exact formats/compact rule, [ECDH.swift](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/Key%20Agreement/ECDH.swift) for PKCS8/SEC1/SPKI/PEM behavior, and [DH.swift](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/Key%20Agreement/DH.swift) for SharedSecret description/equality.

No design-changing Apple/review disagreement was found. The equality-language question was resolved with root against the literal Apple naming rule before implementation.

## Validation

- RED: `npx vitest run tests/runtime/cryptofx.test.ts`: 20/20 failed against the old implementation (`crypto-red.log`). Failure causes were missing typed values, constructors, generic selection and curve surfaces. The proposed test spelling isEqual was changed to root-resolved literal == before production implementation; the underlying missing-digest contract was unchanged.
- Initial GREEN: 20/20 (`crypto-green-initial.log`).
- Malformed-signature RED caught a native TypeError instead of CRFXError (`crypto-edge-red.log`); validation was added at the signature representation boundary. An unavailable-Wasm assertion initially matched an error message instead of its case; the assertion was corrected without a production change.
- SharedSecret.description RED: 3 failures for P256/P384/P521 (`crypto-description-red.log`), followed by source-backed description implementation and GREEN.
- Final focused run: `npx vitest run tests/runtime/cryptofx.test.ts tests/runtime/appkit-counterparts.test.ts`: **30/30 passed**, consisting of 25 Crypto tests and 5 counterpart tests (`crypto-focused.log`). Covers SHA/HMAC/HKDF/AES vectors, streaming snapshots, equality, all EC representations and signatures, Node interoperability, ECDH/HKDF/X9.63, RFC Ed25519 and X25519, malformed input, unavailable primitives, and retained constructor rejections.
- Framework `npx tsc -b --pretty false`: **passed** (`crypto-framework-typecheck.log`).
- Site `npx tsc -b --pretty false`: **passed** against unchanged installed SDK (`crypto-site-typecheck.log`).
- Architecture checker: **1,615 files / 7,329 edges validated** (`crypto-architecture.log`).
- The first SDK declaration build found TS4094 for anonymous HMAC private fields. An explicit constructor-shaped return signature repaired that boundary. The failed build was not used for acceptance. UTF-8 copyright headers were also normalized before the successful frozen-source build.
- `npm run sdk:build`: **passed** (`crypto-sdk-build.log`). Source remained frozen through all subsequent packed checks.
- `npx vitest run tests/runtime/fx/packed-crypto.test.ts`: **1/1 passed** (`crypto-packed.log`). A separately installed immutable archive passed positive/negative declaration checks, runtime operations and dynamic developer-MCP counterparts. Declarations reject browser keys, algorithm strings, raw array byte inputs, old factories and cross-curve types.
- `node scripts/synware/check-fx-crypto-consumer.mjs`: **Chromium, Firefox and WebKit passed** real workers (`crypto-browser.log`, `crypto-installed-browser.json`). Each observed engine covered SHA/HMAC/HKDF/AES/P256 agreement, and P256/P384/P521 private raw import, compressed public import and DER signature verification. No listening server/port was used. Curve25519 and exhaustive representation coverage are Node-tested; browser support beyond this worker specimen is not claimed.
- Final diff review restored two unrelated registry formatting/duplicate-key changes before refreshing the frozen archive and rerunning packed/three-engine checks successfully. After those checks, one whitespace-only blank line was removed from CRFXChaChaPolySealedBox.ts to satisfy staged diff-check. That is the sole behavior-free source difference from the final packed receipt; root will rebuild committed source before final full-suite/adoption, rather than repeat an entire packed build solely for whitespace.
- The test-only deferred-constructor rejection assertion was added after freezing. The SDK fingerprint explicitly excludes tests/receipts, so source did not drift. Original private and derived-public promises are both checked for no unhandled rejection and later observable CRFXError.
- Full framework/site suites were not run. Root owns the single final serial full-suite run. The site SDK was not adopted.
- C: free space stayed above 218 GB (latest approximately 235 GB), above the 20 GB stop threshold.

## Commit and handoff

Commit pending final explicit-path staging and diff check. Root will independently review the family diff. No full-suite or broader hardware/browser-platform acceptance is implied.

## Complete file and member mapping

The following generated inventory binds every member row to its concrete type/file. Swift argument labels use positional methods or the named representation constructor field; explicit null salt/info selects Apple's shorter HKDF overloads.

Family files:

- `src/FX/CryptoFX/CRFXAES.ts`
- `src/FX/CryptoFX/CRFXAESGCM.ts`
- `src/FX/CryptoFX/CRFXAESGCMNonce.ts`
- `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts`
- `src/FX/CryptoFX/CRFXChaChaPoly.ts`
- `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts`
- `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts`
- `src/FX/CryptoFX/CRFXCurve25519.ts`
- `src/FX/CryptoFX/CRFXCurve25519KeyAgreement.ts`
- `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts`
- `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPublicKey.ts`
- `src/FX/CryptoFX/CRFXCurve25519Signing.ts`
- `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts`
- `src/FX/CryptoFX/CRFXCurve25519SigningPublicKey.ts`
- `src/FX/CryptoFX/CRFXDigest.ts`
- `src/FX/CryptoFX/CRFXError.ts`
- `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts`
- `src/FX/CryptoFX/CRFXHashFunction.ts`
- `src/FX/CryptoFX/CRFXHKDF.ts`
- `src/FX/CryptoFX/CRFXHMAC.ts`
- `src/FX/CryptoFX/CRFXInsecure.ts`
- `src/FX/CryptoFX/CRFXInsecureMD5.ts`
- `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts`
- `src/FX/CryptoFX/CRFXInsecureSHA1.ts`
- `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts`
- `src/FX/CryptoFX/CRFXMessageAuthenticationCode.ts`
- `src/FX/CryptoFX/CRFXP256.ts`
- `src/FX/CryptoFX/CRFXP256KeyAgreement.ts`
- `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts`
- `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts`
- `src/FX/CryptoFX/CRFXP256Signing.ts`
- `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts`
- `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts`
- `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts`
- `src/FX/CryptoFX/CRFXP384.ts`
- `src/FX/CryptoFX/CRFXP384KeyAgreement.ts`
- `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts`
- `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts`
- `src/FX/CryptoFX/CRFXP384Signing.ts`
- `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts`
- `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts`
- `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts`
- `src/FX/CryptoFX/CRFXP521.ts`
- `src/FX/CryptoFX/CRFXP521KeyAgreement.ts`
- `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts`
- `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts`
- `src/FX/CryptoFX/CRFXP521Signing.ts`
- `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts`
- `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts`
- `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts`
- `src/FX/CryptoFX/CRFXSHA256.ts`
- `src/FX/CryptoFX/CRFXSHA256Digest.ts`
- `src/FX/CryptoFX/CRFXSHA384.ts`
- `src/FX/CryptoFX/CRFXSHA384Digest.ts`
- `src/FX/CryptoFX/CRFXSHA512.ts`
- `src/FX/CryptoFX/CRFXSHA512Digest.ts`
- `src/FX/CryptoFX/CRFXSharedSecret.ts`
- `src/FX/CryptoFX/CRFXSymmetricKey.ts`
- `src/FX/CryptoFX/CRFXSymmetricKeySize.ts`
- `src/FX/CryptoFX/internal/aes.ts`
- `src/FX/CryptoFX/internal/bytes.ts`
- `src/FX/CryptoFX/internal/curves.ts`
- `src/FX/CryptoFX/internal/encoding.ts`
- `src/FX/CryptoFX/internal/hash.ts`
- `src/FX/CryptoFX/internal/keys.ts`
- `src/FX/CryptoFX/public.ts`

| Apple member | CryptoFX member | File |
| --- | --- | --- |
| `AES.(type)` | `CRFXAES.(type)` | `src/FX/CryptoFX/CRFXAES.ts` |
| `AES.GCM` | `CRFXAES.GCM` | `src/FX/CryptoFX/CRFXAES.ts` |
| `AES.GCM.(type)` | `CRFXAESGCM.(type)` | `src/FX/CryptoFX/CRFXAESGCM.ts` |
| `AES.GCM.Nonce` | `CRFXAESGCM.Nonce` | `src/FX/CryptoFX/CRFXAESGCM.ts` |
| `AES.GCM.SealedBox` | `CRFXAESGCM.SealedBox` | `src/FX/CryptoFX/CRFXAESGCM.ts` |
| `AES.GCM.seal(_:using:nonce:)` | `CRFXAESGCM.seal(data,key,nonce)` | `src/FX/CryptoFX/CRFXAESGCM.ts` |
| `AES.GCM.seal(_:using:nonce:authenticating:)` | `CRFXAESGCM.seal(data,key,nonce,authenticating)` | `src/FX/CryptoFX/CRFXAESGCM.ts` |
| `AES.GCM.open(_:using:)` | `CRFXAESGCM.open(box,key)` | `src/FX/CryptoFX/CRFXAESGCM.ts` |
| `AES.GCM.open(_:using:authenticating:)` | `CRFXAESGCM.open(box,key,authenticating)` | `src/FX/CryptoFX/CRFXAESGCM.ts` |
| `AES.GCM.Nonce.(type)` | `CRFXAESGCMNonce.(type)` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` |
| `AES.GCM.Nonce.init()` | `CRFXAESGCMNonce.constructor()` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` |
| `AES.GCM.Nonce.init(data:)` | `CRFXAESGCMNonce.constructor(data)` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` |
| `AES.GCM.Nonce.count` | `CRFXAESGCMNonce.count` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` |
| `AES.GCM.Nonce.bytes` | `CRFXAESGCMNonce.bytes` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` |
| `AES.GCM.Nonce.withUnsafeBytes(_:)` | `CRFXAESGCMNonce.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` |
| `AES.GCM.Nonce.makeIterator()` | `CRFXAESGCMNonce.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` |
| `AES.GCM.SealedBox.(type)` | `CRFXAESGCMSealedBox.(type)` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` |
| `AES.GCM.SealedBox.init(combined:)` | `CRFXAESGCMSealedBox.constructor(combined)` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` |
| `AES.GCM.SealedBox.init(nonce:ciphertext:tag:)` | `CRFXAESGCMSealedBox.constructor(nonce,ciphertext,tag)` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` |
| `AES.GCM.SealedBox.nonce` | `CRFXAESGCMSealedBox.nonce` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` |
| `AES.GCM.SealedBox.ciphertext` | `CRFXAESGCMSealedBox.ciphertext` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` |
| `AES.GCM.SealedBox.tag` | `CRFXAESGCMSealedBox.tag` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` |
| `AES.GCM.SealedBox.combined` | `CRFXAESGCMSealedBox.combined` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` |
| `ChaChaPoly.(type)` | `CRFXChaChaPoly.(type)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` |
| `ChaChaPoly.Nonce` | `CRFXChaChaPoly.Nonce` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` |
| `ChaChaPoly.SealedBox` | `CRFXChaChaPoly.SealedBox` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` |
| `ChaChaPoly.seal(_:using:nonce:)` | `CRFXChaChaPoly.seal(data,key,nonce)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` |
| `ChaChaPoly.seal(_:using:nonce:authenticating:)` | `CRFXChaChaPoly.seal(data,key,nonce,authenticating)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` |
| `ChaChaPoly.open(_:using:)` | `CRFXChaChaPoly.open(box,key)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` |
| `ChaChaPoly.open(_:using:authenticating:)` | `CRFXChaChaPoly.open(box,key,authenticating)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` |
| `ChaChaPoly.Nonce.(type)` | `CRFXChaChaPolyNonce.(type)` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` |
| `ChaChaPoly.Nonce.init()` | `CRFXChaChaPolyNonce.constructor()` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` |
| `ChaChaPoly.Nonce.init(data:)` | `CRFXChaChaPolyNonce.constructor(data)` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` |
| `ChaChaPoly.Nonce.count` | `CRFXChaChaPolyNonce.count` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` |
| `ChaChaPoly.Nonce.bytes` | `CRFXChaChaPolyNonce.bytes` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` |
| `ChaChaPoly.Nonce.withUnsafeBytes(_:)` | `CRFXChaChaPolyNonce.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` |
| `ChaChaPoly.Nonce.makeIterator()` | `CRFXChaChaPolyNonce.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` |
| `ChaChaPoly.SealedBox.(type)` | `CRFXChaChaPolySealedBox.(type)` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` |
| `ChaChaPoly.SealedBox.init(combined:)` | `CRFXChaChaPolySealedBox.constructor(combined)` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` |
| `ChaChaPoly.SealedBox.init(nonce:ciphertext:tag:)` | `CRFXChaChaPolySealedBox.constructor(nonce,ciphertext,tag)` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` |
| `ChaChaPoly.SealedBox.nonce` | `CRFXChaChaPolySealedBox.nonce` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` |
| `ChaChaPoly.SealedBox.ciphertext` | `CRFXChaChaPolySealedBox.ciphertext` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` |
| `ChaChaPoly.SealedBox.tag` | `CRFXChaChaPolySealedBox.tag` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` |
| `ChaChaPoly.SealedBox.combined` | `CRFXChaChaPolySealedBox.combined` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` |
| `Curve25519.(type)` | `CRFXCurve25519.(type)` | `src/FX/CryptoFX/CRFXCurve25519.ts` |
| `Curve25519.Signing` | `CRFXCurve25519.Signing` | `src/FX/CryptoFX/CRFXCurve25519.ts` |
| `Curve25519.KeyAgreement` | `CRFXCurve25519.KeyAgreement` | `src/FX/CryptoFX/CRFXCurve25519.ts` |
| `Curve25519.KeyAgreement.(type)` | `CRFXCurve25519KeyAgreement.(type)` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreement.ts` |
| `Curve25519.KeyAgreement.PrivateKey` | `CRFXCurve25519KeyAgreement.PrivateKey` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreement.ts` |
| `Curve25519.KeyAgreement.PublicKey` | `CRFXCurve25519KeyAgreement.PublicKey` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreement.ts` |
| `Curve25519.KeyAgreement.PrivateKey.(type)` | `CRFXCurve25519KeyAgreementPrivateKey.(type)` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` |
| `Curve25519.KeyAgreement.PrivateKey.init(rawRepresentation:)` | `CRFXCurve25519KeyAgreementPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` |
| `Curve25519.KeyAgreement.PrivateKey.rawRepresentation` | `CRFXCurve25519KeyAgreementPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` |
| `Curve25519.KeyAgreement.PrivateKey.init()` | `CRFXCurve25519KeyAgreementPrivateKey.constructor()` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` |
| `Curve25519.KeyAgreement.PrivateKey.publicKey` | `CRFXCurve25519KeyAgreementPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` |
| `Curve25519.KeyAgreement.PrivateKey.sharedSecretFromKeyAgreement(with:)` | `CRFXCurve25519KeyAgreementPrivateKey.sharedSecretFromKeyAgreement(publicKey)` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` |
| `Curve25519.KeyAgreement.PublicKey.(type)` | `CRFXCurve25519KeyAgreementPublicKey.(type)` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPublicKey.ts` |
| `Curve25519.KeyAgreement.PublicKey.init(rawRepresentation:)` | `CRFXCurve25519KeyAgreementPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPublicKey.ts` |
| `Curve25519.KeyAgreement.PublicKey.rawRepresentation` | `CRFXCurve25519KeyAgreementPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPublicKey.ts` |
| `Curve25519.Signing.(type)` | `CRFXCurve25519Signing.(type)` | `src/FX/CryptoFX/CRFXCurve25519Signing.ts` |
| `Curve25519.Signing.PrivateKey` | `CRFXCurve25519Signing.PrivateKey` | `src/FX/CryptoFX/CRFXCurve25519Signing.ts` |
| `Curve25519.Signing.PublicKey` | `CRFXCurve25519Signing.PublicKey` | `src/FX/CryptoFX/CRFXCurve25519Signing.ts` |
| `Curve25519.Signing.PrivateKey.(type)` | `CRFXCurve25519SigningPrivateKey.(type)` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` |
| `Curve25519.Signing.PrivateKey.init(rawRepresentation:)` | `CRFXCurve25519SigningPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` |
| `Curve25519.Signing.PrivateKey.rawRepresentation` | `CRFXCurve25519SigningPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` |
| `Curve25519.Signing.PrivateKey.init()` | `CRFXCurve25519SigningPrivateKey.constructor()` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` |
| `Curve25519.Signing.PrivateKey.publicKey` | `CRFXCurve25519SigningPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` |
| `Curve25519.Signing.PrivateKey.signature(for:) (data)` | `CRFXCurve25519SigningPrivateKey.signature(data)` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` |
| `Curve25519.Signing.PublicKey.(type)` | `CRFXCurve25519SigningPublicKey.(type)` | `src/FX/CryptoFX/CRFXCurve25519SigningPublicKey.ts` |
| `Curve25519.Signing.PublicKey.init(rawRepresentation:)` | `CRFXCurve25519SigningPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXCurve25519SigningPublicKey.ts` |
| `Curve25519.Signing.PublicKey.rawRepresentation` | `CRFXCurve25519SigningPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXCurve25519SigningPublicKey.ts` |
| `Curve25519.Signing.PublicKey.isValidSignature(_:for:) (data)` | `CRFXCurve25519SigningPublicKey.isValidSignature(signature,data)` | `src/FX/CryptoFX/CRFXCurve25519SigningPublicKey.ts` |
| `Digest.(type)` | `CRFXDigest.(type)` | `src/FX/CryptoFX/CRFXDigest.ts` |
| `Digest.byteCount` | `conforming digest type.byteCount` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` (and each named digest file) |
| `Digest.description` | `CRFXDigest.description` | `src/FX/CryptoFX/CRFXDigest.ts` |
| `Digest.withUnsafeBytes(_:)` | `CRFXDigest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXDigest.ts` |
| `Digest.Sequence.makeIterator()` | `CRFXDigest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXDigest.ts` |
| `Digest.==(_:_:) (Self or Data)` | `conforming digest type["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` (and each named digest file) |
| `CryptoKitError.(type)` | `CRFXError.(type)` | `src/FX/CryptoFX/CRFXError.ts` |
| `CryptoKitError.incorrectKeySize` | `CRFXError.incorrectKeySize` | `src/FX/CryptoFX/CRFXError.ts` |
| `CryptoKitError.invalidParameter` | `CRFXError.invalidParameter` | `src/FX/CryptoFX/CRFXError.ts` |
| `CryptoKitError.incorrectParameterSize` | `CRFXError.incorrectParameterSize` | `src/FX/CryptoFX/CRFXError.ts` |
| `CryptoKitError.underlyingCoreCryptoError` | `CRFXError.underlyingCoreCryptoError` | `src/FX/CryptoFX/CRFXError.ts` |
| `CryptoKitError.authenticationFailure` | `CRFXError.authenticationFailure` | `src/FX/CryptoFX/CRFXError.ts` |
| `CryptoKitError.wrapFailure` | `CRFXError.wrapFailure` | `src/FX/CryptoFX/CRFXError.ts` |
| `CryptoKitError.unwrapFailure` | `CRFXError.unwrapFailure` | `src/FX/CryptoFX/CRFXError.ts` |
| `HKDF.(type)` | `CRFXHKDF.(type)` | `src/FX/CryptoFX/CRFXHKDF.ts` |
| `HKDF.HKDF<H> specialization` | `CRFXHKDF.CRFXHKDF(Hash)` | `src/FX/CryptoFX/CRFXHKDF.ts` |
| `HKDF.deriveKey(inputKeyMaterial:outputByteCount:)` | `CRFXHKDF.specialized deriveKey(key,count)` | `src/FX/CryptoFX/CRFXHKDF.ts` |
| `HKDF.deriveKey(inputKeyMaterial:salt:info:outputByteCount:)` | `CRFXHKDF.specialized deriveKey(key,salt,info,count)` | `src/FX/CryptoFX/CRFXHKDF.ts` |
| `HKDF.deriveKey(inputKeyMaterial:salt:outputByteCount:)` | `CRFXHKDF.specialized deriveKey(key,salt,null,count)` | `src/FX/CryptoFX/CRFXHKDF.ts` |
| `HKDF.deriveKey(inputKeyMaterial:info:outputByteCount:)` | `CRFXHKDF.specialized deriveKey(key,null,info,count)` | `src/FX/CryptoFX/CRFXHKDF.ts` |
| `HKDF.extract(inputKeyMaterial:salt:)` | `CRFXHKDF.specialized extract(key,salt)` | `src/FX/CryptoFX/CRFXHKDF.ts` |
| `HKDF.expand(pseudoRandomKey:info:outputByteCount:)` | `CRFXHKDF.specialized expand(prk,info,count)` | `src/FX/CryptoFX/CRFXHKDF.ts` |
| `HMAC.(type)` | `CRFXHMAC.(type)` | `src/FX/CryptoFX/CRFXHMAC.ts` |
| `HMAC.HMAC<H> specialization` | `CRFXHMAC.CRFXHMAC(Hash)` | `src/FX/CryptoFX/CRFXHMAC.ts` |
| `HMAC.init(key:)` | `CRFXHMAC.specialized constructor(key)` | `src/FX/CryptoFX/CRFXHMAC.ts` |
| `HMAC.authenticationCode(for:using:)` | `CRFXHMAC.specialized authenticationCode(data,key)` | `src/FX/CryptoFX/CRFXHMAC.ts` |
| `HMAC.isValidAuthenticationCode(_:authenticating:using:)` | `CRFXHMAC.specialized isValidAuthenticationCode(code,data,key)` | `src/FX/CryptoFX/CRFXHMAC.ts` |
| `HMAC.update(data:)` | `CRFXHMAC.specialized update(data)` | `src/FX/CryptoFX/CRFXHMAC.ts` |
| `HMAC.finalize()` | `CRFXHMAC.specialized finalize()` | `src/FX/CryptoFX/CRFXHMAC.ts` |
| `HashFunction.(type)` | `CRFXHashFunction.(type)` | `src/FX/CryptoFX/CRFXHashFunction.ts` |
| `HashFunction.update(data:)` | `CRFXHashFunction.update(data)` | `src/FX/CryptoFX/CRFXHashFunction.ts` |
| `HashFunction.finalize()` | `CRFXHashFunction.finalize()` | `src/FX/CryptoFX/CRFXHashFunction.ts` |
| `HashedAuthenticationCode.(type)` | `CRFXHashedAuthenticationCode.(type)` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` |
| `HashedAuthenticationCode.byteCount` | `CRFXHashedAuthenticationCode.byteCount` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` |
| `HashedAuthenticationCode.description` | `CRFXHashedAuthenticationCode.description` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` |
| `HashedAuthenticationCode.withUnsafeBytes(_:)` | `CRFXHashedAuthenticationCode.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` |
| `HashedAuthenticationCode.Sequence.makeIterator()` | `CRFXHashedAuthenticationCode.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` |
| `HashedAuthenticationCode.==(_:_:) (Self or Data)` | `CRFXHashedAuthenticationCode.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` |
| `Insecure.(type)` | `CRFXInsecure.(type)` | `src/FX/CryptoFX/CRFXInsecure.ts` |
| `Insecure.SHA1` | `CRFXInsecure.SHA1` | `src/FX/CryptoFX/CRFXInsecure.ts` |
| `Insecure.SHA1Digest` | `CRFXInsecure.SHA1Digest` | `src/FX/CryptoFX/CRFXInsecure.ts` |
| `Insecure.MD5` | `CRFXInsecure.MD5` | `src/FX/CryptoFX/CRFXInsecure.ts` |
| `Insecure.MD5Digest` | `CRFXInsecure.MD5Digest` | `src/FX/CryptoFX/CRFXInsecure.ts` |
| `Insecure.MD5.(type)` | `CRFXInsecureMD5.(type)` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` |
| `Insecure.MD5.init()` | `CRFXInsecureMD5.constructor()` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` |
| `Insecure.MD5.Digest` | `CRFXInsecureMD5.Digest` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` |
| `Insecure.MD5.byteCount` | `CRFXInsecureMD5.byteCount` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` |
| `Insecure.MD5.blockByteCount` | `CRFXInsecureMD5.blockByteCount` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` |
| `Insecure.MD5.hash(data:)` | `CRFXInsecureMD5.hash(data)` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` |
| `Insecure.MD5.update(data:)` | `CRFXInsecureMD5.update(data)` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` |
| `Insecure.MD5.finalize()` | `CRFXInsecureMD5.finalize()` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` |
| `Insecure.MD5Digest.(type)` | `CRFXInsecureMD5Digest.(type)` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` |
| `Insecure.MD5Digest.byteCount` | `CRFXInsecureMD5Digest.byteCount` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` |
| `Insecure.MD5Digest.description` | `CRFXInsecureMD5Digest.description` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` |
| `Insecure.MD5Digest.withUnsafeBytes(_:)` | `CRFXInsecureMD5Digest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` |
| `Insecure.MD5Digest.Sequence.makeIterator()` | `CRFXInsecureMD5Digest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` |
| `Insecure.MD5Digest.==(_:_:) (Self or Data)` | `CRFXInsecureMD5Digest.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` |
| `Insecure.SHA1.(type)` | `CRFXInsecureSHA1.(type)` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` |
| `Insecure.SHA1.init()` | `CRFXInsecureSHA1.constructor()` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` |
| `Insecure.SHA1.Digest` | `CRFXInsecureSHA1.Digest` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` |
| `Insecure.SHA1.byteCount` | `CRFXInsecureSHA1.byteCount` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` |
| `Insecure.SHA1.blockByteCount` | `CRFXInsecureSHA1.blockByteCount` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` |
| `Insecure.SHA1.hash(data:)` | `CRFXInsecureSHA1.hash(data)` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` |
| `Insecure.SHA1.update(data:)` | `CRFXInsecureSHA1.update(data)` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` |
| `Insecure.SHA1.finalize()` | `CRFXInsecureSHA1.finalize()` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` |
| `Insecure.SHA1Digest.(type)` | `CRFXInsecureSHA1Digest.(type)` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` |
| `Insecure.SHA1Digest.byteCount` | `CRFXInsecureSHA1Digest.byteCount` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` |
| `Insecure.SHA1Digest.description` | `CRFXInsecureSHA1Digest.description` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` |
| `Insecure.SHA1Digest.withUnsafeBytes(_:)` | `CRFXInsecureSHA1Digest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` |
| `Insecure.SHA1Digest.Sequence.makeIterator()` | `CRFXInsecureSHA1Digest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` |
| `Insecure.SHA1Digest.==(_:_:) (Self or Data)` | `CRFXInsecureSHA1Digest.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` |
| `MessageAuthenticationCode.(type)` | `CRFXMessageAuthenticationCode.(type)` | `src/FX/CryptoFX/CRFXMessageAuthenticationCode.ts` |
| `MessageAuthenticationCode.byteCount` | `CRFXMessageAuthenticationCode.byteCount` | `src/FX/CryptoFX/CRFXMessageAuthenticationCode.ts` |
| `MessageAuthenticationCode.withUnsafeBytes(_:)` | `CRFXMessageAuthenticationCode.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXMessageAuthenticationCode.ts` |
| `MessageAuthenticationCode.Sequence.makeIterator()` | `CRFXMessageAuthenticationCode.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXMessageAuthenticationCode.ts` |
| `P256.(type)` | `CRFXP256.(type)` | `src/FX/CryptoFX/CRFXP256.ts` |
| `P256.Signing` | `CRFXP256.Signing` | `src/FX/CryptoFX/CRFXP256.ts` |
| `P256.KeyAgreement` | `CRFXP256.KeyAgreement` | `src/FX/CryptoFX/CRFXP256.ts` |
| `P256.KeyAgreement.(type)` | `CRFXP256KeyAgreement.(type)` | `src/FX/CryptoFX/CRFXP256KeyAgreement.ts` |
| `P256.KeyAgreement.PrivateKey` | `CRFXP256KeyAgreement.PrivateKey` | `src/FX/CryptoFX/CRFXP256KeyAgreement.ts` |
| `P256.KeyAgreement.PublicKey` | `CRFXP256KeyAgreement.PublicKey` | `src/FX/CryptoFX/CRFXP256KeyAgreement.ts` |
| `P256.KeyAgreement.PrivateKey.(type)` | `CRFXP256KeyAgreementPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.init(rawRepresentation:)` | `CRFXP256KeyAgreementPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.rawRepresentation` | `CRFXP256KeyAgreementPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.init(x963Representation:)` | `CRFXP256KeyAgreementPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.x963Representation` | `CRFXP256KeyAgreementPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.init(derRepresentation:)` | `CRFXP256KeyAgreementPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.derRepresentation` | `CRFXP256KeyAgreementPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.init(pemRepresentation:)` | `CRFXP256KeyAgreementPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.pemRepresentation` | `CRFXP256KeyAgreementPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.init(compactRepresentable:)` | `CRFXP256KeyAgreementPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.publicKey` | `CRFXP256KeyAgreementPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PrivateKey.sharedSecretFromKeyAgreement(with:)` | `CRFXP256KeyAgreementPrivateKey.sharedSecretFromKeyAgreement(publicKey)` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` |
| `P256.KeyAgreement.PublicKey.(type)` | `CRFXP256KeyAgreementPublicKey.(type)` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.init(rawRepresentation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.rawRepresentation` | `CRFXP256KeyAgreementPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.init(x963Representation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.x963Representation` | `CRFXP256KeyAgreementPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.init(derRepresentation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.derRepresentation` | `CRFXP256KeyAgreementPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.init(pemRepresentation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.pemRepresentation` | `CRFXP256KeyAgreementPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.init(compressedRepresentation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.compressedRepresentation` | `CRFXP256KeyAgreementPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.init(compactRepresentation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.KeyAgreement.PublicKey.compactRepresentation` | `CRFXP256KeyAgreementPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` |
| `P256.Signing.(type)` | `CRFXP256Signing.(type)` | `src/FX/CryptoFX/CRFXP256Signing.ts` |
| `P256.Signing.PrivateKey` | `CRFXP256Signing.PrivateKey` | `src/FX/CryptoFX/CRFXP256Signing.ts` |
| `P256.Signing.PublicKey` | `CRFXP256Signing.PublicKey` | `src/FX/CryptoFX/CRFXP256Signing.ts` |
| `P256.Signing.ECDSASignature` | `CRFXP256Signing.ECDSASignature` | `src/FX/CryptoFX/CRFXP256Signing.ts` |
| `P256.Signing.ECDSASignature.(type)` | `CRFXP256SigningECDSASignature.(type)` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` |
| `P256.Signing.ECDSASignature.init(rawRepresentation:)` | `CRFXP256SigningECDSASignature.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` |
| `P256.Signing.ECDSASignature.rawRepresentation` | `CRFXP256SigningECDSASignature.rawRepresentation` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` |
| `P256.Signing.ECDSASignature.init(derRepresentation:)` | `CRFXP256SigningECDSASignature.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` |
| `P256.Signing.ECDSASignature.derRepresentation` | `CRFXP256SigningECDSASignature.derRepresentation` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` |
| `P256.Signing.ECDSASignature.withUnsafeBytes(_:)` | `CRFXP256SigningECDSASignature.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` |
| `P256.Signing.PrivateKey.(type)` | `CRFXP256SigningPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.init(rawRepresentation:)` | `CRFXP256SigningPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.rawRepresentation` | `CRFXP256SigningPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.init(x963Representation:)` | `CRFXP256SigningPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.x963Representation` | `CRFXP256SigningPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.init(derRepresentation:)` | `CRFXP256SigningPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.derRepresentation` | `CRFXP256SigningPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.init(pemRepresentation:)` | `CRFXP256SigningPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.pemRepresentation` | `CRFXP256SigningPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.init(compactRepresentable:)` | `CRFXP256SigningPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.publicKey` | `CRFXP256SigningPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PrivateKey.signature(for:) (data or Digest)` | `CRFXP256SigningPrivateKey.signature(data)` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` |
| `P256.Signing.PublicKey.(type)` | `CRFXP256SigningPublicKey.(type)` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.init(rawRepresentation:)` | `CRFXP256SigningPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.rawRepresentation` | `CRFXP256SigningPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.init(x963Representation:)` | `CRFXP256SigningPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.x963Representation` | `CRFXP256SigningPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.init(derRepresentation:)` | `CRFXP256SigningPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.derRepresentation` | `CRFXP256SigningPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.init(pemRepresentation:)` | `CRFXP256SigningPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.pemRepresentation` | `CRFXP256SigningPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.init(compressedRepresentation:)` | `CRFXP256SigningPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.compressedRepresentation` | `CRFXP256SigningPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.init(compactRepresentation:)` | `CRFXP256SigningPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.compactRepresentation` | `CRFXP256SigningPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P256.Signing.PublicKey.isValidSignature(_:for:) (data or Digest)` | `CRFXP256SigningPublicKey.isValidSignature(signature,data)` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` |
| `P384.(type)` | `CRFXP384.(type)` | `src/FX/CryptoFX/CRFXP384.ts` |
| `P384.Signing` | `CRFXP384.Signing` | `src/FX/CryptoFX/CRFXP384.ts` |
| `P384.KeyAgreement` | `CRFXP384.KeyAgreement` | `src/FX/CryptoFX/CRFXP384.ts` |
| `P384.KeyAgreement.(type)` | `CRFXP384KeyAgreement.(type)` | `src/FX/CryptoFX/CRFXP384KeyAgreement.ts` |
| `P384.KeyAgreement.PrivateKey` | `CRFXP384KeyAgreement.PrivateKey` | `src/FX/CryptoFX/CRFXP384KeyAgreement.ts` |
| `P384.KeyAgreement.PublicKey` | `CRFXP384KeyAgreement.PublicKey` | `src/FX/CryptoFX/CRFXP384KeyAgreement.ts` |
| `P384.KeyAgreement.PrivateKey.(type)` | `CRFXP384KeyAgreementPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.init(rawRepresentation:)` | `CRFXP384KeyAgreementPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.rawRepresentation` | `CRFXP384KeyAgreementPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.init(x963Representation:)` | `CRFXP384KeyAgreementPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.x963Representation` | `CRFXP384KeyAgreementPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.init(derRepresentation:)` | `CRFXP384KeyAgreementPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.derRepresentation` | `CRFXP384KeyAgreementPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.init(pemRepresentation:)` | `CRFXP384KeyAgreementPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.pemRepresentation` | `CRFXP384KeyAgreementPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.init(compactRepresentable:)` | `CRFXP384KeyAgreementPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.publicKey` | `CRFXP384KeyAgreementPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PrivateKey.sharedSecretFromKeyAgreement(with:)` | `CRFXP384KeyAgreementPrivateKey.sharedSecretFromKeyAgreement(publicKey)` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` |
| `P384.KeyAgreement.PublicKey.(type)` | `CRFXP384KeyAgreementPublicKey.(type)` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.init(rawRepresentation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.rawRepresentation` | `CRFXP384KeyAgreementPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.init(x963Representation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.x963Representation` | `CRFXP384KeyAgreementPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.init(derRepresentation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.derRepresentation` | `CRFXP384KeyAgreementPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.init(pemRepresentation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.pemRepresentation` | `CRFXP384KeyAgreementPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.init(compressedRepresentation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.compressedRepresentation` | `CRFXP384KeyAgreementPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.init(compactRepresentation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.KeyAgreement.PublicKey.compactRepresentation` | `CRFXP384KeyAgreementPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` |
| `P384.Signing.(type)` | `CRFXP384Signing.(type)` | `src/FX/CryptoFX/CRFXP384Signing.ts` |
| `P384.Signing.PrivateKey` | `CRFXP384Signing.PrivateKey` | `src/FX/CryptoFX/CRFXP384Signing.ts` |
| `P384.Signing.PublicKey` | `CRFXP384Signing.PublicKey` | `src/FX/CryptoFX/CRFXP384Signing.ts` |
| `P384.Signing.ECDSASignature` | `CRFXP384Signing.ECDSASignature` | `src/FX/CryptoFX/CRFXP384Signing.ts` |
| `P384.Signing.ECDSASignature.(type)` | `CRFXP384SigningECDSASignature.(type)` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` |
| `P384.Signing.ECDSASignature.init(rawRepresentation:)` | `CRFXP384SigningECDSASignature.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` |
| `P384.Signing.ECDSASignature.rawRepresentation` | `CRFXP384SigningECDSASignature.rawRepresentation` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` |
| `P384.Signing.ECDSASignature.init(derRepresentation:)` | `CRFXP384SigningECDSASignature.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` |
| `P384.Signing.ECDSASignature.derRepresentation` | `CRFXP384SigningECDSASignature.derRepresentation` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` |
| `P384.Signing.ECDSASignature.withUnsafeBytes(_:)` | `CRFXP384SigningECDSASignature.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` |
| `P384.Signing.PrivateKey.(type)` | `CRFXP384SigningPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.init(rawRepresentation:)` | `CRFXP384SigningPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.rawRepresentation` | `CRFXP384SigningPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.init(x963Representation:)` | `CRFXP384SigningPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.x963Representation` | `CRFXP384SigningPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.init(derRepresentation:)` | `CRFXP384SigningPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.derRepresentation` | `CRFXP384SigningPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.init(pemRepresentation:)` | `CRFXP384SigningPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.pemRepresentation` | `CRFXP384SigningPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.init(compactRepresentable:)` | `CRFXP384SigningPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.publicKey` | `CRFXP384SigningPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PrivateKey.signature(for:) (data or Digest)` | `CRFXP384SigningPrivateKey.signature(data)` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` |
| `P384.Signing.PublicKey.(type)` | `CRFXP384SigningPublicKey.(type)` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.init(rawRepresentation:)` | `CRFXP384SigningPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.rawRepresentation` | `CRFXP384SigningPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.init(x963Representation:)` | `CRFXP384SigningPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.x963Representation` | `CRFXP384SigningPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.init(derRepresentation:)` | `CRFXP384SigningPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.derRepresentation` | `CRFXP384SigningPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.init(pemRepresentation:)` | `CRFXP384SigningPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.pemRepresentation` | `CRFXP384SigningPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.init(compressedRepresentation:)` | `CRFXP384SigningPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.compressedRepresentation` | `CRFXP384SigningPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.init(compactRepresentation:)` | `CRFXP384SigningPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.compactRepresentation` | `CRFXP384SigningPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P384.Signing.PublicKey.isValidSignature(_:for:) (data or Digest)` | `CRFXP384SigningPublicKey.isValidSignature(signature,data)` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` |
| `P521.(type)` | `CRFXP521.(type)` | `src/FX/CryptoFX/CRFXP521.ts` |
| `P521.Signing` | `CRFXP521.Signing` | `src/FX/CryptoFX/CRFXP521.ts` |
| `P521.KeyAgreement` | `CRFXP521.KeyAgreement` | `src/FX/CryptoFX/CRFXP521.ts` |
| `P521.KeyAgreement.(type)` | `CRFXP521KeyAgreement.(type)` | `src/FX/CryptoFX/CRFXP521KeyAgreement.ts` |
| `P521.KeyAgreement.PrivateKey` | `CRFXP521KeyAgreement.PrivateKey` | `src/FX/CryptoFX/CRFXP521KeyAgreement.ts` |
| `P521.KeyAgreement.PublicKey` | `CRFXP521KeyAgreement.PublicKey` | `src/FX/CryptoFX/CRFXP521KeyAgreement.ts` |
| `P521.KeyAgreement.PrivateKey.(type)` | `CRFXP521KeyAgreementPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.init(rawRepresentation:)` | `CRFXP521KeyAgreementPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.rawRepresentation` | `CRFXP521KeyAgreementPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.init(x963Representation:)` | `CRFXP521KeyAgreementPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.x963Representation` | `CRFXP521KeyAgreementPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.init(derRepresentation:)` | `CRFXP521KeyAgreementPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.derRepresentation` | `CRFXP521KeyAgreementPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.init(pemRepresentation:)` | `CRFXP521KeyAgreementPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.pemRepresentation` | `CRFXP521KeyAgreementPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.init(compactRepresentable:)` | `CRFXP521KeyAgreementPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.publicKey` | `CRFXP521KeyAgreementPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PrivateKey.sharedSecretFromKeyAgreement(with:)` | `CRFXP521KeyAgreementPrivateKey.sharedSecretFromKeyAgreement(publicKey)` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` |
| `P521.KeyAgreement.PublicKey.(type)` | `CRFXP521KeyAgreementPublicKey.(type)` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.init(rawRepresentation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.rawRepresentation` | `CRFXP521KeyAgreementPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.init(x963Representation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.x963Representation` | `CRFXP521KeyAgreementPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.init(derRepresentation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.derRepresentation` | `CRFXP521KeyAgreementPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.init(pemRepresentation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.pemRepresentation` | `CRFXP521KeyAgreementPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.init(compressedRepresentation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.compressedRepresentation` | `CRFXP521KeyAgreementPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.init(compactRepresentation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.KeyAgreement.PublicKey.compactRepresentation` | `CRFXP521KeyAgreementPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` |
| `P521.Signing.(type)` | `CRFXP521Signing.(type)` | `src/FX/CryptoFX/CRFXP521Signing.ts` |
| `P521.Signing.PrivateKey` | `CRFXP521Signing.PrivateKey` | `src/FX/CryptoFX/CRFXP521Signing.ts` |
| `P521.Signing.PublicKey` | `CRFXP521Signing.PublicKey` | `src/FX/CryptoFX/CRFXP521Signing.ts` |
| `P521.Signing.ECDSASignature` | `CRFXP521Signing.ECDSASignature` | `src/FX/CryptoFX/CRFXP521Signing.ts` |
| `P521.Signing.ECDSASignature.(type)` | `CRFXP521SigningECDSASignature.(type)` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` |
| `P521.Signing.ECDSASignature.init(rawRepresentation:)` | `CRFXP521SigningECDSASignature.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` |
| `P521.Signing.ECDSASignature.rawRepresentation` | `CRFXP521SigningECDSASignature.rawRepresentation` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` |
| `P521.Signing.ECDSASignature.init(derRepresentation:)` | `CRFXP521SigningECDSASignature.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` |
| `P521.Signing.ECDSASignature.derRepresentation` | `CRFXP521SigningECDSASignature.derRepresentation` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` |
| `P521.Signing.ECDSASignature.withUnsafeBytes(_:)` | `CRFXP521SigningECDSASignature.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` |
| `P521.Signing.PrivateKey.(type)` | `CRFXP521SigningPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.init(rawRepresentation:)` | `CRFXP521SigningPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.rawRepresentation` | `CRFXP521SigningPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.init(x963Representation:)` | `CRFXP521SigningPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.x963Representation` | `CRFXP521SigningPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.init(derRepresentation:)` | `CRFXP521SigningPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.derRepresentation` | `CRFXP521SigningPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.init(pemRepresentation:)` | `CRFXP521SigningPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.pemRepresentation` | `CRFXP521SigningPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.init(compactRepresentable:)` | `CRFXP521SigningPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.publicKey` | `CRFXP521SigningPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PrivateKey.signature(for:) (data or Digest)` | `CRFXP521SigningPrivateKey.signature(data)` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` |
| `P521.Signing.PublicKey.(type)` | `CRFXP521SigningPublicKey.(type)` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.init(rawRepresentation:)` | `CRFXP521SigningPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.rawRepresentation` | `CRFXP521SigningPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.init(x963Representation:)` | `CRFXP521SigningPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.x963Representation` | `CRFXP521SigningPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.init(derRepresentation:)` | `CRFXP521SigningPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.derRepresentation` | `CRFXP521SigningPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.init(pemRepresentation:)` | `CRFXP521SigningPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.pemRepresentation` | `CRFXP521SigningPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.init(compressedRepresentation:)` | `CRFXP521SigningPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.compressedRepresentation` | `CRFXP521SigningPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.init(compactRepresentation:)` | `CRFXP521SigningPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.compactRepresentation` | `CRFXP521SigningPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `P521.Signing.PublicKey.isValidSignature(_:for:) (data or Digest)` | `CRFXP521SigningPublicKey.isValidSignature(signature,data)` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` |
| `SHA256.(type)` | `CRFXSHA256.(type)` | `src/FX/CryptoFX/CRFXSHA256.ts` |
| `SHA256.init()` | `CRFXSHA256.constructor()` | `src/FX/CryptoFX/CRFXSHA256.ts` |
| `SHA256.Digest` | `CRFXSHA256.Digest` | `src/FX/CryptoFX/CRFXSHA256.ts` |
| `SHA256.byteCount` | `CRFXSHA256.byteCount` | `src/FX/CryptoFX/CRFXSHA256.ts` |
| `SHA256.blockByteCount` | `CRFXSHA256.blockByteCount` | `src/FX/CryptoFX/CRFXSHA256.ts` |
| `SHA256.hash(data:)` | `CRFXSHA256.hash(data)` | `src/FX/CryptoFX/CRFXSHA256.ts` |
| `SHA256.update(data:)` | `CRFXSHA256.update(data)` | `src/FX/CryptoFX/CRFXSHA256.ts` |
| `SHA256.finalize()` | `CRFXSHA256.finalize()` | `src/FX/CryptoFX/CRFXSHA256.ts` |
| `SHA256Digest.(type)` | `CRFXSHA256Digest.(type)` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` |
| `SHA256Digest.byteCount` | `CRFXSHA256Digest.byteCount` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` |
| `SHA256Digest.description` | `CRFXSHA256Digest.description` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` |
| `SHA256Digest.withUnsafeBytes(_:)` | `CRFXSHA256Digest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` |
| `SHA256Digest.Sequence.makeIterator()` | `CRFXSHA256Digest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` |
| `SHA256Digest.==(_:_:) (Self or Data)` | `CRFXSHA256Digest.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` |
| `SHA384.(type)` | `CRFXSHA384.(type)` | `src/FX/CryptoFX/CRFXSHA384.ts` |
| `SHA384.init()` | `CRFXSHA384.constructor()` | `src/FX/CryptoFX/CRFXSHA384.ts` |
| `SHA384.Digest` | `CRFXSHA384.Digest` | `src/FX/CryptoFX/CRFXSHA384.ts` |
| `SHA384.byteCount` | `CRFXSHA384.byteCount` | `src/FX/CryptoFX/CRFXSHA384.ts` |
| `SHA384.blockByteCount` | `CRFXSHA384.blockByteCount` | `src/FX/CryptoFX/CRFXSHA384.ts` |
| `SHA384.hash(data:)` | `CRFXSHA384.hash(data)` | `src/FX/CryptoFX/CRFXSHA384.ts` |
| `SHA384.update(data:)` | `CRFXSHA384.update(data)` | `src/FX/CryptoFX/CRFXSHA384.ts` |
| `SHA384.finalize()` | `CRFXSHA384.finalize()` | `src/FX/CryptoFX/CRFXSHA384.ts` |
| `SHA384Digest.(type)` | `CRFXSHA384Digest.(type)` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` |
| `SHA384Digest.byteCount` | `CRFXSHA384Digest.byteCount` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` |
| `SHA384Digest.description` | `CRFXSHA384Digest.description` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` |
| `SHA384Digest.withUnsafeBytes(_:)` | `CRFXSHA384Digest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` |
| `SHA384Digest.Sequence.makeIterator()` | `CRFXSHA384Digest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` |
| `SHA384Digest.==(_:_:) (Self or Data)` | `CRFXSHA384Digest.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` |
| `SHA512.(type)` | `CRFXSHA512.(type)` | `src/FX/CryptoFX/CRFXSHA512.ts` |
| `SHA512.init()` | `CRFXSHA512.constructor()` | `src/FX/CryptoFX/CRFXSHA512.ts` |
| `SHA512.Digest` | `CRFXSHA512.Digest` | `src/FX/CryptoFX/CRFXSHA512.ts` |
| `SHA512.byteCount` | `CRFXSHA512.byteCount` | `src/FX/CryptoFX/CRFXSHA512.ts` |
| `SHA512.blockByteCount` | `CRFXSHA512.blockByteCount` | `src/FX/CryptoFX/CRFXSHA512.ts` |
| `SHA512.hash(data:)` | `CRFXSHA512.hash(data)` | `src/FX/CryptoFX/CRFXSHA512.ts` |
| `SHA512.update(data:)` | `CRFXSHA512.update(data)` | `src/FX/CryptoFX/CRFXSHA512.ts` |
| `SHA512.finalize()` | `CRFXSHA512.finalize()` | `src/FX/CryptoFX/CRFXSHA512.ts` |
| `SHA512Digest.(type)` | `CRFXSHA512Digest.(type)` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` |
| `SHA512Digest.byteCount` | `CRFXSHA512Digest.byteCount` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` |
| `SHA512Digest.description` | `CRFXSHA512Digest.description` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` |
| `SHA512Digest.withUnsafeBytes(_:)` | `CRFXSHA512Digest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` |
| `SHA512Digest.Sequence.makeIterator()` | `CRFXSHA512Digest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` |
| `SHA512Digest.==(_:_:) (Self or Data)` | `CRFXSHA512Digest.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` |
| `SharedSecret.(type)` | `CRFXSharedSecret.(type)` | `src/FX/CryptoFX/CRFXSharedSecret.ts` |
| `SharedSecret.description` | `CRFXSharedSecret.description` | `src/FX/CryptoFX/CRFXSharedSecret.ts` |
| `SharedSecret.withUnsafeBytes(_:)` | `CRFXSharedSecret.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXSharedSecret.ts` |
| `SharedSecret.==(_:_:) (Self or Data)` | `CRFXSharedSecret.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSharedSecret.ts` |
| `SharedSecret.hkdfDerivedSymmetricKey(using:salt:sharedInfo:outputByteCount:)` | `CRFXSharedSecret.hkdfDerivedSymmetricKey(Hash,salt,sharedInfo,count)` | `src/FX/CryptoFX/CRFXSharedSecret.ts` |
| `SharedSecret.x963DerivedSymmetricKey(using:sharedInfo:outputByteCount:)` | `CRFXSharedSecret.x963DerivedSymmetricKey(Hash,sharedInfo,count)` | `src/FX/CryptoFX/CRFXSharedSecret.ts` |
| `SymmetricKey.(type)` | `CRFXSymmetricKey.(type)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` |
| `SymmetricKey.init(data:)` | `CRFXSymmetricKey.constructor(data)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` |
| `SymmetricKey.init(size:)` | `CRFXSymmetricKey.constructor(size)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` |
| `SymmetricKey.bitCount` | `CRFXSymmetricKey.bitCount` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` |
| `SymmetricKey.bytes` | `CRFXSymmetricKey.bytes` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` |
| `SymmetricKey.withUnsafeBytes(_:)` | `CRFXSymmetricKey.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` |
| `SymmetricKey.==(_:_:)` | `CRFXSymmetricKey.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` |
| `SymmetricKeySize.(type)` | `CRFXSymmetricKeySize.(type)` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` |
| `SymmetricKeySize.init(bitCount:)` | `CRFXSymmetricKeySize.constructor(bitCount)` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` |
| `SymmetricKeySize.bits128` | `CRFXSymmetricKeySize.bits128` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` |
| `SymmetricKeySize.bits192` | `CRFXSymmetricKeySize.bits192` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` |
| `SymmetricKeySize.bits256` | `CRFXSymmetricKeySize.bits256` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` |
| `SymmetricKeySize.bitCount` | `CRFXSymmetricKeySize.bitCount` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` |

HashFunction’s static/constructor side is represented by the hash-type constructor contract used by HMAC/HKDF/SharedSecret; TypeScript instance interfaces cannot declare static members. It requires `new()`, `hash(data)`, `byteCount` and `blockByteCount` in `src/FX/CryptoFX/internal/hash.ts`, and each concrete hash file implements those Apple members. The exported protocol describes `update` and `finalize` on an instance.
