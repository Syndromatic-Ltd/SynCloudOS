# FX device-family fidelity rebuild

Status: completed within the approved scope. All nine families, option A, DispatchFX Tasks 1–6, hooks and Gallery are committed. Final framework implementation is `5286513`; final site is `c74d8c2`, adopting that implementation through the prescribed clean checkout. Typechecks, architecture, installed development/HMR and packed checks pass. All 413 site Vitest tests and 24 Node tests pass. Chromium desktop/phone light/dark acceptance and ten captures are complete. The once-only full framework run remains honestly recorded as 8,205 passed / 8 failed; all affected checks subsequently passed after correction/investigation. Physical-backend limits and approved exclusions are below. Earlier progress and superseded proof stages are retained as history. [PLAN.md](PLAN.md) records the completed gates.

The framework began at `c50049b` on `fix/blind-rewrite-friction`; the site began at `35d43ac` on `prerelease`. Both repositories had no tracked modifications. Existing untracked evidence and `site/vite.claude-5199.config.mts` were preserved. Only the authorised 5199 site preview was restarted for final acceptance. The only additional worktree is the prescribed temporary detached SDK-adoption checkout, removed after safely deleting its junction. No push or branch creation occurred. A test-harness protected-port incident is recorded in the final development-binding evidence; it did not change any existing service.

## Foundation zlib correction

Commit: `de51ac9` — `Foundation: encode zlib as raw DEFLATE`.

Files: `src/Foundation/internal/compression.ts`, `tests/runtime/foundation-data.test.ts`, `tests/runtime/compression-fx.test.ts` (the old family test was subsequently replaced during the CompressionFX rebuild).

The internal `zlib` format changed from browser `deflate` (RFC 1950 wrapped) to `deflate-raw` (RFC 1951). Both new regressions failed before the correction: output had a zlib header, and a fixed raw stored-block vector failed with an incorrect-header error. After the correction, all 39 focused data/compression tests passed. Framework and site `npx tsc -b` exited 0 before the commit.

The regression identifies a valid CMF/FLG header independently of compression level, decodes the output with Node's independent `inflateRawSync`, and decompresses the fixed byte vector `01 05 00 fa ff 68 65 6c 6c 6f` to `hello`. This avoids a round-trip-only test that could preserve the same bug in both directions.

Authority: [Apple COMPRESSION_ZLIB](https://developer.apple.com/documentation/compression/compression_zlib), [Algorithm.zlib](https://developer.apple.com/documentation/compression/algorithm/zlib).

## CompressionFX — Compression

Commit: `d0a16e9` — `FX: mirror Compression filters and algorithm types`.

### Files

Old public implementation: `src/FX/CompressionFX/CPFXCompression.ts` (deleted), `src/FX/CompressionFX/public.ts` (re-export entry retained).

New public files: `src/FX/CompressionFX/CPFXAlgorithm.ts`, `CPFXFilterOperation.ts`, `CPFXFilterError.ts`, `CPFXInputFilter.ts`, `CPFXOutputFilter.ts`. The entry now only re-exports these five types. Private codec validation/error translation lives in `src/FX/CompressionFX/internal/filterCodec.ts`.

Foundation changes: `src/Foundation/internal/compression.ts` now gives `NSEDataCompressionAlgorithm` precisely Foundation's `lzfse`, `lz4`, `lzma`, `zlib` cases. The internal codec factory is shared with CompressionFX, whose separate enum includes Compression's `brotli` and `lzbitmap`.

Migrated active consumers: `src/SynCloudOS/InstalledApplications/capabilityReport.ts`, `scripts/synware/create-synware.mjs`, `scripts/synware/check-fx-compression-consumer.mjs`, `tests/runtime/foundation-data.test.ts`, `tests/runtime/foundation-packed-consumer.test.ts`, `docs/framework/foundation.md`, `docs/framework/fx/compression.md`, `docs/framework/fx/README.md`. `tests/runtime/compression-fx.test.ts` was replaced by `tests/runtime/compression-apple-flow.test.ts`.

Lookup/package metadata: five explicit mappings were added to `docs/framework/appkit-counterparts.json`. The developer MCP reads this registry and the generated SDK declarations dynamically; its source contains no separate CompressionFX name list. The SDK manifest and architecture configuration already point to `src/FX/CompressionFX/public.ts`; that entry path remains correct. The regenerated SDK archive includes only the new export surface. No compatibility names were retained. The site has no CompressionFX consumer to migrate.

### Member mapping

Paths in this table are relative to `src/FX/CompressionFX/` unless stated otherwise.

| Apple type/member | Our type/member | File | Browser support and errors |
| --- | --- | --- | --- |
| `Algorithm.lzfse`, `.lz4`, `.lzma`, `.zlib`, `.brotli`, `.lzbitmap` | `CPFXAlgorithm` with the same cases | `CPFXAlgorithm.ts` | `zlib` uses raw DEFLATE. Brotli depends on host support. Unsupported codecs fail at filter construction with `CPFXFilterError.invalidState`; no silent substitute. |
| `FilterOperation.compress`, `.decompress` | `CPFXFilterOperation.compress`, `.decompress` | `CPFXFilterOperation.ts` | Both supported for implemented codecs. |
| `FilterError.invalidState`, `.invalidData` | `CPFXFilterError.invalidState`, `.invalidData`; thrown error's `code` identifies the case | `CPFXFilterError.ts` | Invalid initialisation/parameters and unavailable codecs use `invalidState`; rejected encoded data and non-empty writes after finalisation use `invalidData`. |
| `InputFilter.init(_:using:bufferCapacity:readingFrom:)` | `new CPFXInputFilter(operation, algorithm, bufferCapacity, readingFrom)` | `CPFXInputFilter.ts` | Read closure receives capacity and returns `NSEData` or null; asynchronous closure permitted. Unsupported codec: `invalidState`. |
| Initialiser default `bufferCapacity = 65536` | Three-argument constructor omitting capacity | `CPFXInputFilter.ts` | Same default. |
| `InputFilter.readData(ofLength:)` | `readData(ofLength)` | `CPFXInputFilter.ts` | Asynchronous. Fills across internal codec chunks, returns a shorter tail then null. Nonpositive/invalid lengths and overlapping reads use `invalidState`. Invalid encoded data uses `invalidData`; caller closure errors propagate. |
| Input closure nil/empty EOF convention | Null or empty `NSEData` ends input | `CPFXInputFilter.ts` | Supported; no public browser stream. |
| `OutputFilter.init(_:using:bufferCapacity:writingTo:)` | `new CPFXOutputFilter(operation, algorithm, bufferCapacity, writingTo)` | `CPFXOutputFilter.ts` | Writes `NSEData` chunks followed by null. Asynchronous closure permitted. Unsupported codec: `invalidState`. |
| Initialiser default `bufferCapacity = 65536` | Three-argument constructor omitting capacity | `CPFXOutputFilter.ts` | Same default. |
| `OutputFilter.write(_:)` | `write(data)` | `CPFXOutputFilter.ts` | Asynchronous backpressure; null or empty data finalises. Non-empty data after finalisation: `invalidData`. |
| `OutputFilter.finalize()` | `finalize()` | `CPFXOutputFilter.ts` | Asynchronous; flushes data and awaits final null callback. Idempotent, with shared completion for concurrent calls. Callback errors propagate. |
| `NSData.CompressionAlgorithm.lzfse`, `.lz4`, `.lzma`, `.zlib` | `NSEDataCompressionAlgorithm` with the same cases | `src/Foundation/internal/compression.ts` | Unsupported Foundation codecs reject; Foundation does not import FX or expose a capability query. |

### Removed names and migrations

Removed exports: `CPFXCapabilities`, `CPFXCapabilitySnapshot`, `CPFXOperation`, `CPFXCompress`, `CPFXDecompress`. Removed members: `CPFXCapabilities.query()`, `CPFXInputFilter.cancel()`, `CPFXOutputFilter.abort()`. Removed non-Apple algorithm cases: `CPFXAlgorithm.gzip`, `.zstd`; `NSEDataCompressionAlgorithm.gzip`, `.brotli`, `.zstd`. `CPFXAlgorithm.brotli` remains a real Compression case.

Capability-report and scaffold consumers now list Apple's algorithm cases without claiming host support. One-shot consumers use Foundation data compression. Runtime, installed worker and strict worker-library specimens use the read/write closure initialisers. Documentation and counterpart lookup describe the new types. The executable source/tests/scripts and current framework guides were searched for the removed names; none remain. Earlier review and evidence documents retain their historical statements.

### Deviations and unsupported behaviour

`readData`, `write` and `finalize` return Promises because browser codec I/O is asynchronous. Read/write callbacks may themselves return Promises for the same reason. These deviations are documented on each member. They add no web-stream type or browser capability object to the public API.

Current Apple documentation includes `Algorithm.lzbitmap`, omitted from the review's enumeration. It is included, following the instruction to use Apple where the review is silent. The browser cannot implement lzfse, lz4, lzma or lzbitmap through its native codecs; constructors retain these cases and fail with `CPFXFilterError.invalidState`. Brotli is constructor-tested through the actual operation, not a public capability query.

Privacy revocation/browser permission denial are not applicable to pure byte filters: Compression has no authorisation API and no live device/application session. No privacy store, launch entitlement or other FX family's authorisation code was changed.

Authority: [Algorithm](https://developer.apple.com/documentation/compression/algorithm), [FilterOperation](https://developer.apple.com/documentation/compression/filteroperation), [FilterError](https://developer.apple.com/documentation/compression/filtererror), [InputFilter](https://developer.apple.com/documentation/compression/inputfilter), [OutputFilter](https://developer.apple.com/documentation/compression/outputfilter), [NSData.CompressionAlgorithm](https://developer.apple.com/documentation/foundation/nsdata/compressionalgorithm). Apple's [Swift Compression overlay](https://github.com/apple/swift/blob/swift-5.1-branch/stdlib/public/Darwin/Compression/Compression.swift#L147) supplies the nil/empty EOF, idempotent finalisation and post-finalisation error semantics that its current short member pages omit.

### Verification and review

- RED: 13 new Apple-flow tests failed against the old public surface. Additional EOF/finalisation regressions reproduced the three review findings before correction.
- GREEN: 100 tests across 5 files passed, including independently installed worker runtime/declarations, all public export counterpart mappings and developer MCP tests. [Log](compression-tests.log).
- Browser worker acceptance: raw zlib passed in Chromium, Firefox and WebKit; each processed 19,456 bytes with no document global. [Results](compression-installed-browser.json), [log](compression-browser.log).
- Both typechecks passed; architecture check reported 1,551 files / 7,058 edges with no violations (baseline: 1,546 / 7,043).
- Independent read-only review found empty-write EOF, idempotent finalisation and the post-finalisation error case; all were corrected. Re-review found no remaining concrete concerns within the reviewed scope.
- A line-ending normalisation mistake briefly emptied eight newly authored/rewritten files. All six implementation files and the guide were restored from the verified SDK build's source maps/docs, and the regression test was restored. Fresh focused tests passed 32/32, framework typecheck exited 0, and `git diff --check` passed before the family commit. Pre-existing files outside the task were unaffected.

## CryptoFX — CryptoKit

Status: DONE. The supplied-point/scalar-import correction and all earlier review corrections pass every assigned gate. Root owns independent re-review and final full-suite/adoption gates.

### Scope and files

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

### API and backend decisions

All public bytes are immutable Foundation `NSEData`; browser handles and algorithm strings are internal. Public classes/protocols each have their own named file. The old string-union `CRFXHashFunction` is gone; the same spelling now denotes Apple's actual HashFunction protocol, not an alias for the old API.

The literal Swift member name `static func ==` is represented as `Type["=="](lhs, rhs)`. JavaScript operators are not overloaded, and CryptoKit values have no `isEqual` alias. Root resolved this naming choice before production implementation. The internal WebAssembly XOR/OR reduction has loop count and memory addresses dependent only on public length, with no secret-dependent early exit; scratch memory is cleared after comparison. If the primitive is blocked, it fails with `CRFXError.underlyingCoreCryptoError`. There is no JavaScript comparison fallback or claim of immunity to host/hardware side channels.

`CRFXHMAC(Hash)` and `CRFXHKDF(Hash)` are the review-approved runtime generic specialisation and return constructor-shaped classes. They are not client/createX factories. Swift read-only pointer/span/ContiguousBytes overloads use copied NSEData according to the Foundation-byte rule. Mutation, output-span and zeroing members remain distinct and explicitly fail where immutable Foundation bytes cannot fulfil the Apple contract. Swift compiler-level Hashable/Sendable conformances do not introduce browser APIs.

Native private scalar imports are wrapped in standards PKCS8 envelopes and passed to the cryptographic provider. No secret-dependent elliptic-curve arithmetic is implemented in JavaScript. Public compressed/compact point decoding uses public-only arithmetic. Apple's own source confirms public raw representation is x‖y, public x963 is 0x04‖x‖y, private x963 adds the scalar, and compact representation requires y ≤ p−y. SEC1 private DER and EC PRIVATE KEY PEM imports are wrapped for the provider; exported private DER is PKCS8 and public DER is SPKI.

Constructors immediately return typed objects and start native work. Each native-key promise and derived-public-key promise retains a rejection handler without replacing the original rejected promise. Unsupported generation therefore does not create unhandled rejection events; awaiting a representation, signature or agreement still observes the error. The `publicKey` property is immediately a typed object. There are no invented readiness members or key-generation factories.

### Unsupported APIs and errors

- ChaChaPoly seal/open, Insecure.MD5 hash/finalize, precomputed-digest ECDSA signing/verification, and immutable Foundation mutation/output/zeroing contracts retain their Apple members and fail with `CRFXError.underlyingCoreCryptoError`. The two SymmetricKey initialisers throw synchronously without invoking the callback; in-place cipher and HKDF output overloads reject `Promise<void>`.
- Missing native algorithms, absent secure context, unsupported imports/representations, or blocked Wasm fail with `CRFXError`; no capability/authorisation API is invented.
- Nonextractable host keys are not accepted through a public browser-key constructor. CryptoKit representation properties require framework-generated/imported extractable native keys. Secure Enclave/nonextractable storage is outside this review's required surface and is not claimed. Native import/export support is conditional on the actual browser provider; Node success alone is not evidence of browser support.
- AES-GCM nonce initialisers accept at least 12 bytes. `combined` is null for non-12-byte nonces. Native hosts may reject a nonstandard nonce even though the value can be constructed.
- Parameter/size failures use Apple's invalidParameter, incorrectParameterSize or incorrectKeySize cases; AES authentication failure uses authenticationFailure. Native failures retain their cause and an underlying marker of −1, which is not presented as a real corecrypto status. wrapFailure and unwrapFailure cases also exist.
- Ed25519/X25519 are supported when exposed by the provider. Missing implementations fail through the same CRFXError boundary, without changing public names.

Browser-forced asynchronous members are individually annotated in source: hash/finalize; HMAC code creation/verification/finalize; HKDF extract/expand/deriveKey; AES seal/open; key representation properties/signature/verification/agreement; SharedSecret HKDF/X9.63 derivation. ChaChaPoly's unsupported backend boundary and the retained AES/ChaCha in-place and HKDF output-span overloads are asynchronous too; they return rejected `Promise<void>` values. Constructor-started native failure is observed through those asynchronous members. All other members remain synchronous.

CryptoFX processes caller-supplied bytes and has no device/session permission, mounted-app service or authorisation state. Session privacy revocation and browser permission denial do not apply. Missing secure context/provider/CSP support is an operation failure, not an authorisation state. No privacy guarantee was weakened. Workers require no DOM. JavaScript/native-provider memory does not promise erasure of every copied secret; the API exposes no mutable view into internal secret storage.

Removed names/signatures: CRFXCapabilities/query, the CRFXHashFunction string union, SymmetricKey.generate, PrivateKey.generate, PublicKey.fromRawRepresentation, SealedBox.fromCombined, raw-data digests/signatures/nonces, public NSEDataConvertible, public CryptoKey constructors, string hash arguments, representation methods replacing Apple properties, and symmetric/shared-secret rawRepresentation. No compatibility aliases remain.

### Sources consulted

Apple documentation was read using its directly readable `https://developer.apple.com/tutorials/data/documentation/cryptokit/<symbol>.md` endpoints:

- [HashFunction](https://developer.apple.com/documentation/cryptokit/hashfunction), [Digest](https://developer.apple.com/documentation/cryptokit/digest), [SHA256](https://developer.apple.com/documentation/cryptokit/sha256), [SHA256Digest](https://developer.apple.com/documentation/cryptokit/sha256digest).
- [HMAC](https://developer.apple.com/documentation/cryptokit/hmac), [HashedAuthenticationCode](https://developer.apple.com/documentation/cryptokit/hashedauthenticationcode), [HKDF](https://developer.apple.com/documentation/cryptokit/hkdf).
- [SymmetricKey](https://developer.apple.com/documentation/cryptokit/symmetrickey), [SymmetricKeySize](https://developer.apple.com/documentation/cryptokit/symmetrickeysize), [SharedSecret](https://developer.apple.com/documentation/cryptokit/sharedsecret).
- [AES.GCM](https://developer.apple.com/documentation/cryptokit/aes/gcm), its Nonce/SealedBox pages and individual nonce-init/combined pages.
- [P256.Signing.PrivateKey](https://developer.apple.com/documentation/cryptokit/p256/signing/privatekey), PublicKey, ECDSASignature and KeyAgreement.PrivateKey pages.
- [P384.Signing.PrivateKey](https://developer.apple.com/documentation/cryptokit/p384/signing/privatekey), [P521.Signing.PrivateKey](https://developer.apple.com/documentation/cryptokit/p521/signing/privatekey).
- [Curve25519.Signing.PrivateKey](https://developer.apple.com/documentation/cryptokit/curve25519/signing/privatekey), PublicKey and KeyAgreement.PrivateKey pages.
- [ChaChaPoly](https://developer.apple.com/documentation/cryptokit/chachapoly), Nonce and SealedBox; [Insecure](https://developer.apple.com/documentation/cryptokit/insecure), SHA1 and MD5; [CryptoKitError](https://developer.apple.com/documentation/cryptokit/cryptokiterror).
- Apple-owned [NISTCurvesKeys_boring.swift](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/Keys/EC/BoringSSL/NISTCurvesKeys_boring.swift) for exact formats/compact rule, [ECDH.swift](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/Key%20Agreement/ECDH.swift) for PKCS8/SEC1/SPKI/PEM behaviour, and [DH.swift](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/Key%20Agreement/DH.swift) for SharedSecret description/equality.

No design-changing Apple/review disagreement was found. The equality-language question was resolved with root against the literal Apple naming rule before implementation.

### Validation

- RED: `npx vitest run tests/runtime/cryptofx.test.ts`: 20/20 failed against the old implementation (`crypto-red.log`). Failure causes were missing typed values, constructors, generic selection and curve surfaces. The proposed test spelling isEqual was changed to root-resolved literal == before production implementation; the underlying missing-digest contract was unchanged.
- Initial GREEN: 20/20 (`crypto-green-initial.log`).
- Malformed-signature RED caught a native TypeError instead of CRFXError (`crypto-edge-red.log`); validation was added at the signature representation boundary. An unavailable-Wasm assertion initially matched an error message instead of its case; the assertion was corrected without a production change.
- SharedSecret.description RED: 3 failures for P256/P384/P521 (`crypto-description-red.log`), followed by source-backed description implementation and GREEN.
- Final focused run: `npx vitest run tests/runtime/cryptofx.test.ts tests/runtime/appkit-counterparts.test.ts`: **30/30 passed**, consisting of 25 Crypto tests and 5 counterpart tests (`crypto-focused.log`). Covers SHA/HMAC/HKDF/AES vectors, streaming snapshots, equality, all EC representations and signatures, Node interoperability, ECDH/HKDF/X9.63, RFC Ed25519 and X25519, malformed input, unavailable primitives, and retained constructor rejections.
- Framework `npx tsc -b --pretty false`: **passed** (`crypto-framework-typecheck.log`).
- Site `npx tsc -b --pretty false`: **passed** against unchanged installed SDK (`crypto-site-typecheck.log`).
- Architecture checker: **1,615 files / 7,329 edges validated** (`crypto-architecture.log`).
- The first SDK declaration build found TS4094 for anonymous HMAC private fields. An explicit constructor-shaped return signature repaired that boundary. The failed build was not used for acceptance. UTF-8 copyright headers were also normalised before the successful frozen-source build.
- `npm run sdk:build`: **passed** (`crypto-sdk-build.log`). Source remained frozen through all subsequent packed checks.
- `npx vitest run tests/runtime/fx/packed-crypto.test.ts`: **1/1 passed** (`crypto-packed.log`). A separately installed immutable archive passed positive/negative declaration checks, runtime operations and dynamic developer-MCP counterparts. Declarations reject browser keys, algorithm strings, raw array byte inputs, old factories and cross-curve types.
- `node scripts/synware/check-fx-crypto-consumer.mjs`: **Chromium, Firefox and WebKit passed** real workers (`crypto-browser.log`, `crypto-installed-browser.json`). Each observed engine covered SHA/HMAC/HKDF/AES/P256 agreement, and P256/P384/P521 private raw import, compressed public import and DER signature verification. No listening server/port was used. Curve25519 and exhaustive representation coverage are Node-tested; browser support beyond this worker specimen is not claimed.
- Final diff review restored two unrelated registry formatting/duplicate-key changes before refreshing the frozen archive and rerunning packed/three-engine checks successfully. After those checks, one whitespace-only blank line was removed from CRFXChaChaPolySealedBox.ts to satisfy staged diff-check. That is the sole behaviour-free source difference from the final packed receipt; root will rebuild committed source before final full-suite/adoption, rather than repeat an entire packed build solely for whitespace.
- The test-only deferred-constructor rejection assertion was added after freezing. The SDK fingerprint explicitly excludes tests/receipts, so source did not drift. Original private and derived-public promises are both checked for no unhandled rejection and later observable CRFXError.
- Full framework/site suites were not run. Root owns the single final serial full-suite run. The site SDK was not adopted.
- C: free space stayed above 218 GB (latest approximately 235 GB), above the 20 GB stop threshold.

### Commit and handoff

Implementation commit: `a17b519` — `FX: Rebuild CryptoFX around CryptoKit types`. This report-only follow-up records that immutable commit. Both repository typechecks and the architecture check passed again immediately before the commit; staged diff-check was clean. Root will independently review the family diff. No full-suite or broader hardware/browser-platform acceptance is implied.

### Independent review correction wave

Correction baseline: `ad9835b`; addresses all four Important and both Minor findings in `crypto-review-findings.md`. Correction commit: `41759e74d057c554130f824e2e848cf4654bbafc` — `FX: Correct CryptoKit contracts and representation validation`. This report-only follow-up records that immutable commit; it changes no SDK-fingerprinted input. No new public type, mutable-byte framework, factory, alias or authorisation contract was introduced. The counterpart registry remains unchanged because every existing public type already has its Apple mapping.

Corrections:

- Retained eight current Apple members: the two SymmetricKey mutation initialisers, AES.GCM and ChaChaPoly in-place seal/open, and the HKDF output/into overloads. Initialisers throw `CRFXError.underlyingCoreCryptoError` before callback invocation or mutation. Methods retain void semantics through rejected `Promise<void>`; their byte arguments remain `NSEData`. Swift `inPlace` is folded into the cipher method name to distinguish the sealed-box operation; HKDF uses typed overloads under Apple's existing names. The callback has Apple's void result, with no invented return-value initialisation contract.
- Added private `concatCollection` and used it for SHA256/384/512, Insecure.SHA1/MD5, HMAC, HKDF and SharedSecret X9.63 chunk/block collections. No array-sized argument list reaches these finalisers. SHA256 and HMAC regression vectors each use 150,000 one-byte updates (150 KB), checked against independent Node hashes. No repeated-native-hash X9.63 stress workload was added.
- Validate complete SPKI, PKCS8 and nested SEC1 structures before native import. The parser rejects trailing data at the outer and embedded boundaries, noncanonical lengths and integers, malformed OIDs/bit strings, unexpected fields and mismatched curve metadata. SEC1-to-PKCS8 wrapping remains supported. Both signing and agreement for P256/P384/P521 exercise malformed DER and PEM; existing positive representation/interoperability tests remain green. The comparison of algorithm/version encodings handles public metadata only.
- Guard AES keys before reading `bitCount`; null, undefined, non-key objects and numbers now reject with `CRFXError.invalidParameter` in both seal and open.
- Correct all five digest descriptions to Apple's `SHA256 digest: ...` / matching hash names. HMAC includes the hash name (`HMAC with SHA256: ...`); per-value metadata is held in a private WeakMap. Complete descriptions are asserted, including SHA1 and the retained MD5 digest value. MD5 hashing itself stays explicitly unsupported.
- Preserved all 409 prior member mappings and added eight missing members, for **417 mappings**, each with support/error information. MD5, ChaChaPoly, digest-signing and immutable-mutation failures are explicit. Framework guidance and report prose use British spelling; Apple's API identifiers are unchanged.

Changed owned files: `CRFXSymmetricKey.ts`, `CRFXAESGCM.ts`, `CRFXChaChaPoly.ts`, `CRFXHKDF.ts`, `CRFXHMAC.ts`, `CRFXHashedAuthenticationCode.ts`, all five hash/finaliser files and their five digest files, `CRFXSharedSecret.ts`, and private `aes.ts`, `bytes.ts`, `encoding.ts`, `hash.ts`, `keys.ts`; plus `tests/runtime/cryptofx-review.test.ts` (new), `tests/runtime/fx/packed-crypto.test.ts`, `scripts/synware/check-fx-crypto-consumer.mjs`, `docs/framework/fx/crypto.md` and this report. Public exports and counterpart type names are unchanged.

Additional Apple sources checked during this wave:

- [SymmetricKey.init(copyingWithZeroing:)](https://developer.apple.com/documentation/cryptokit/symmetrickey/init(copyingwithzeroing:)) and [init(size:initializingWith:)](https://developer.apple.com/documentation/cryptokit/symmetrickey/init(size:initializingwith:)).
- AES.GCM [seal(inPlace:using:nonce:authenticating:tag:)](https://developer.apple.com/documentation/cryptokit/aes/gcm/seal(inplace:using:nonce:authenticating:tag:)) and [open(inPlace:using:nonce:authenticating:tag:)](https://developer.apple.com/documentation/cryptokit/aes/gcm/open(inplace:using:nonce:authenticating:tag:)); corresponding [ChaChaPoly seal](https://developer.apple.com/documentation/cryptokit/chachapoly/seal(inplace:using:nonce:authenticating:tag:)) and [open](https://developer.apple.com/documentation/cryptokit/chachapoly/open(inplace:using:nonce:authenticating:tag:)).
- HKDF [deriveKey(inputKeyMaterial:salt:info:output:)](https://developer.apple.com/documentation/cryptokit/hkdf/derivekey(inputkeymaterial:salt:info:output:)) and [expand(pseudoRandomKey:info:into:)](https://developer.apple.com/documentation/cryptokit/hkdf/expand(pseudorandomkey:info:into:)).
- Apple's [PKCS8PrivateKey parser](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/ASN1/PKCS8PrivateKey.swift) and [SEC1PrivateKey parser](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/ASN1/SEC1PrivateKey.swift), including complete nested parsing and algorithm agreement.
- Review source references for [digest descriptions](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/Digests/Digests.swift#L83) and [HMAC descriptions](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/Message%20Authentication%20Codes/HMAC/HMAC.swift#L217).

Correction evidence:

- RED before source repairs: `npx vitest run tests/runtime/cryptofx-review.test.ts` — **31/31 failed as expected** (`crypto-review-red.log`). Missing members, unsupported-contract mismatches, two reproducible stack overflows, accepted malformed encodings, native AES errors and wrong digest prefixes were observed.
- Complete-description RED: `npx vitest run tests/runtime/cryptofx-review.test.ts -t 'Apple value descriptions'` — **5 failed / 26 skipped**, explicitly observing all five wrong digest prefixes and all four wrong HMAC prefixes (`crypto-review-descriptions-red.log`).
- Value/mutation/streaming/AES GREEN: **19 passed / 12 skipped** (`crypto-review-values-green.log`).
- Final focused GREEN: `npx vitest run tests/runtime/cryptofx.test.ts tests/runtime/cryptofx-review.test.ts tests/runtime/appkit-counterparts.test.ts` — **61/61 passed** across three files (25 original Crypto, 31 review regressions, five counterparts), `crypto-review-focused-final.log`.
- Both `npx tsc -b --pretty false` checks passed (`crypto-review-framework-typecheck.log`, `crypto-review-site-typecheck.log`). Site remained on its existing SDK.
- `node scripts/quality/architecture-boundaries.mjs` passed: **1,615 files / 7,330 edges** (`crypto-review-architecture.log`).

- Frozen-source `npm run sdk:build` passed (`crypto-review-sdk-build.log`). No source, shipped documentation or SDK tooling changed after the freeze.
- `npx vitest run tests/runtime/fx/packed-crypto.test.ts` passed **1/1** (`crypto-review-packed.log`). Positive/negative installed declarations cover the new constructors, immutable NSEData-only arguments, rejected `Promise<void>` output contracts and private hash metadata; installed runtime verifies retained errors, descriptions and trailing-DER rejection.
- `node scripts/synware/check-fx-crypto-consumer.mjs` passed **Chromium, Firefox and WebKit** real workers (`crypto-review-browser.log`, `crypto-review-installed-browser.json`). Alongside the existing vector/representation work, every engine checks all eight mutation failures, 150,000 one-byte SHA256/HMAC updates, malformed AES keys and trailing private/public DER for all NIST signing/agreement types. Synthetic HTTPS routes use no listening port. Environment variable `CRFX_BROWSER_EVIDENCE_PATH` selected the new review receipt without overwriting earlier evidence.
- Frozen archive SHA-256: `564e37f71149e074f53c584e3149a561df37d19386eac4eeac7dd79ff00485c5`.
- Final `git diff --check` and staged diff-check passed before commit. Only explicit owned paths were staged.

Full suites, Gallery migration and site SDK adoption remain root-owned. No port, server, branch, worktree, push or Fusion action occurred. Original untracked evidence was preserved; this wave uses new `crypto-review-*` logs/receipts. C: free space remained approximately 235 GB, safely above the 20 GB stop threshold.

### Targeted DER nesting follow-up

Baseline: `8922ad3`. Follow-up implementation commit: `9e9233f0758379fce8ea228bf55e6cce26bcdfab` — `FX: Bound DER parsing and preserve native EC representations`. This report-only follow-up records that immutable commit without changing SDK-fingerprinted inputs. Independent re-review accepted all six original corrections and identified excessive work while traversing nested constructed DER. The depth correction changes the private parser and its focused/installed/browser regression specimens. The first browser acceptance run then exposed the separate native EC-width issue documented below; root authorised the necessary representation correction and regression coverage. Public members and all 417 mapping rows are unchanged.

Apple's [ASN1 parser](https://github.com/apple/swift-crypto/blob/main/Sources/Crypto/ASN1/ASN1.swift#L300) sets `maximumNodeDepth = 10`, starts the root at depth 1, and checks the limit before parsing a child. CryptoFX now carries node depth with its existing iterative work list and rejects nonempty constructed nodes at depth 10 before `parseDer` can copy an eleventh-level payload. Empty or primitive nodes at depth 10 remain valid. The error is `CRFXError.invalidParameter` with the diagnostic `DER nesting exceeds the maximum depth of 10.`. This preserves the existing parser and public API without a broader redesign.

Five focused regressions cover the ten/eleven-level boundary and 15,000-level public/private DER and PEM imports. The hostile fixture is built with linear work; tests instrument actual Uint8Array slice bytes instead of asserting elapsed time. Each 59,829-byte fixture previously caused 447,532,508 copied bytes. The guard reduces that to 657,899 bytes, within the final 658,119-byte bound: one defensive `NSEData.bytes` copy plus at most ten parsed payload copies. A provisional 10× bound in the first GREEN attempt omitted the Foundation copy; it was corrected to 11×, and the final imports also assert the explicit depth-limit diagnostic. No timing-dependent acceptance threshold is used.

- Expected RED: `npx vitest run tests/runtime/cryptofx-review.test.ts -t 'bounded DER nesting'` — **five failed / 31 skipped** (`crypto-depth-red.log`): the eleventh level was accepted and all four imports exceeded the deterministic copy budget.
- Covering GREEN: `npx vitest run tests/runtime/cryptofx.test.ts tests/runtime/cryptofx-review.test.ts tests/runtime/appkit-counterparts.test.ts` — **66/66 passed** (25 original Crypto, 36 review regressions, five counterparts), `crypto-depth-green.log`.
- Both repository `npx tsc -b --pretty false` checks passed (`crypto-depth-framework-typecheck.log`, `crypto-depth-site-typecheck.log`).
- Architecture checker passed: **1,615 files / 7,330 edges** (`crypto-depth-architecture.log`).

No full suite, site SDK adoption, server/port, worktree/branch, push or unrelated family work was performed. Existing untracked evidence remains preserved. C: free space remained approximately 235 GB.

### Native EC width failure found during depth acceptance

The first frozen depth-only SDK build and packed check passed (`crypto-depth-sdk-build.log`, `crypto-depth-packed.log`, **1/1**), but browser acceptance failed in WebKit with `CRFXError.incorrectKeySize` (`crypto-depth-browser.log`). That failed log was preserved, and acceptance was not retried until the cause was explained. A diagnostic copy outside the SDK fingerprint replaced random EC generation with a fixed test scalar and checked lengths only. It deterministically reported **P256 expected raw width 32, actual 1** (`crypto-depth-diagnostic.log`). No generated private-key bytes were logged.

The native WebKit JWK exporter can omit leading zero octets from unsigned NIST scalar/coordinate fields. `representation()` decoded `jwk.d`, `jwk.x` and `jwk.y` without restoring CryptoKit's fixed field width; subsequently importing the short raw scalar correctly failed the existing length check. This explains why a randomly generated leading-zero scalar could fail the original browser specimen independently of the depth guard.

The additional correction is confined to private `internal/keys.ts`: NIST unsigned big-endian scalar/coordinate exports are padded to 32, 48 or 66 bytes, preserving every value byte. Empty or oversized native numeric fields fail with `CRFXError.underlyingCoreCryptoError`; no truncation occurs. Curve25519/Ed25519 values remain octet strings and bypass numeric normalisation entirely. No public API or mapping count changed.

Regression coverage uses provider-export instrumentation to reproduce shortened numeric JWK fields, with independent Node EC point expectations for deterministic scalar and coordinate leading-zero cases across P256/P384/P521 signing and agreement. It also rejects oversized nonzero d/x/y and preserves zero-prefixed Curve25519 signing/agreement octet strings. The installed and browser specimens now use scalar 1 for each NIST curve and verify raw width, complete X9.63 content and signature round trips; P521 scalar 1 exercises its leading-zero x coordinate deterministically.

- Width RED before source correction: `npx vitest run tests/runtime/cryptofx-review.test.ts -t 'NIST native representation widths'` — **nine failed / two passed / 36 skipped** (`crypto-width-red.log`).
- Final covering GREEN: `npx vitest run tests/runtime/cryptofx.test.ts tests/runtime/cryptofx-review.test.ts tests/runtime/appkit-counterparts.test.ts` — **77/77 passed** (25 original Crypto, 47 review regressions including five depth and eleven width tests, five counterparts), `crypto-depth-width-green.log`.
- Both repository typechecks passed (`crypto-depth-width-framework-typecheck.log`, `crypto-depth-width-site-typecheck.log`).
- Combined architecture check passed (**1,615 files / 7,330 edges**, `crypto-depth-width-architecture.log`); frozen SDK rebuild and installed declarations/runtime passed (`crypto-depth-width-sdk-build.log`, `crypto-depth-width-packed.log`, **1/1**).
- The new deterministic scalar-1 specimen exposed a separate Firefox provider limitation: native `exportKey("jwk")` throws `OperationError` for the imported P256 scalar-1 key. The combined browser failure (`crypto-depth-width-browser.log`) and operation-localised diagnostics (`crypto-width-firefox-diagnostic.log`, `crypto-width-native-operation-diagnostic.log`) are preserved. Instrumentation records operation names, field widths and native error names only. This failure occurs before numeric decoding/padding; it is surfaced through the existing `CRFXError.underlyingCoreCryptoError` boundary. Root requested a bounded native PKCS8 probe before classifying rawRepresentation as unsupported; the probe and correction follow.

### Validated native PKCS8 scalar recovery

The Firefox native PKCS8 probe (`crypto-width-pkcs8-probe.log/json`) succeeded for the same scalar-only keys whose JWK export failed: P256/P384/P521 exported **67/80/98-byte PKCS8** encodings containing the exact **32/48/66-byte private scalar**. None contained a public point. This establishes that raw bytes remain available through another native format while the public-point information needed for private X9.63 and derived-public representations is unavailable for those scalar-only imports.

`rawRepresentation` now retries native PKCS8 export only when NIST JWK export fails. It reuses `ensurePkcs8` and the bounded canonical DER sequence readers, extracts the SEC1 private OCTET STRING, and applies the same fixed-width validation. This is exact native format conversion. It does not derive a public point, perform private elliptic-curve arithmetic, add a public API or change Curve25519 octet strings. Private X9.63 and derived-public representations still reject with `CRFXError.underlyingCoreCryptoError` when the native provider lacks a public point. Those limits are documented in `docs/framework/fx/crypto.md` and the corresponding member rows below; the mapping count remains **417**.

Browser acceptance now separates three cases: the original random key round trips; deterministic scalar-only raw exports with explicit public-point support/error observations; and deterministic scalar-1 PKCS8 fixtures containing their native public points for complete X9.63, width and signature verification. Full-point fixtures are generated by Node's native cryptographic provider in the test harness; no private curve arithmetic is added to the framework or browser. Chromium/WebKit must continue to provide scalar-only public points. Firefox's exact typed point failures are recorded separately instead of treating raw export as unsupported or skipping all deterministic coverage.

- Expected fallback RED: `npx vitest run tests/runtime/cryptofx-review.test.ts -t 'native PKCS8 scalar fallback'` — **seven failed / 47 skipped** (`crypto-pkcs8-fallback-red.log`). Six NIST signing/agreement raw exports failed on unavailable JWK; the malformed native DER case was never reached without the fallback.
- Covering GREEN: `npx vitest run tests/runtime/cryptofx.test.ts tests/runtime/cryptofx-review.test.ts tests/runtime/appkit-counterparts.test.ts` — **84/84 passed** (25 original Crypto, 54 review regressions, five counterparts), `crypto-depth-width-fallback-green.log`.
- Both final repository typechecks passed (`crypto-depth-final-framework-typecheck.log`, `crypto-depth-final-site-typecheck.log`).
- Final architecture check passed: **1,615 files / 7,330 edges** (`crypto-depth-final-architecture.log`).
- Final frozen `npm run sdk:build` passed (`crypto-depth-final-sdk-build.log`); no source/shipped-doc/tooling change followed the freeze.
- Final installed declaration/runtime acceptance passed **1/1** (`crypto-depth-final-packed.log`).
- Final browser worker acceptance passed **Chromium, Firefox and WebKit** (`crypto-depth-final-browser.log`, `crypto-depth-final-installed-browser.json`). Every engine passed the exact depth-limit errors, scalar-only raw export, original random key round trips and full-point scalar-1 X9.63/signature fixtures. Chromium/WebKit reported scalar-only public points available for all three NIST widths; Firefox reported those point-dependent members unavailable for all three and passed the explicit `CRFXError.underlyingCoreCryptoError` assertions. Native raw scalar export remained available in Firefox through PKCS8.
- Final archive SHA-256: `6ea8fc3d76ca127c327344639087fdd9d4570e171e9585ce472af851506e3c4b`.
- Original failed browser runs and all diagnostic receipts were preserved. Final diff and staged diff checks passed; only explicit owned paths were committed. C: free space remained above 234 GB. No full suite, SDK adoption, listening port or unrelated-family action occurred.

### Supplied private-point and scalar-import correction

Baseline: `2dae4ec`. Implementation commit: `267f56a6d7ba8864ec7e2b1f4836cf7dad3d8a32` — `FX: Validate private EC scalars and supplied public points`. This report-only follow-up records that immutable commit without changing SDK-fingerprinted inputs. Targeted re-review cleared the previous corrections but found that X9.63 private-key import discarded the supplied public point before native PKCS8 import. That unnecessarily reproduced Firefox's scalar-only public-point limitation even though the caller supplied the point. Apple's [P256.Signing.PrivateKey.init(x963Representation:)](https://developer.apple.com/documentation/cryptokit/p256/signing/privatekey/init(x963representation:)) is the retained constructor contract.

Read-only native probes preceded implementation:

- `crypto-x963-native-consistency-probe.log/json`: Chromium/WebKit rejected mismatched full-point PKCS8 with native DataError. Firefox accepted mismatched pairs across P256/P384/P521 signing and agreement, proving that import or re-export alone is not a consistency check. Matching native pairs succeeded everywhere; the baseline framework's direct X9.63 constructors failed in Firefox.
- `crypto-x963-exact-point-probe.log/json`: Firefox accepted a supplied negated point; two-sided ECDH shared-x comparison still succeeded, while a temporary native ECDSA sign/verify check rejected it. Matching pairs passed the native ECDSA check for both key kinds in every engine. This ruled out ECDH x equality as an exact-point validation strategy.
- `crypto-scalar-boundary-probe.log/json`: Firefox accepted scalar zero and the curve order in all three NIST curves and both key kinds, exported them through PKCS8 and exposed them as successful framework raw representations. Native signing rejected those invalid scalars. Root authorised the resulting concrete scalar-range correction, including n+1 negatives and 1/n−1 positive controls. No private-key material was printed by these probes; receipts contain operation names, lengths, cases and booleans.

The final correction preserves the X9.63 point as the SEC1 explicit public BIT STRING inside native PKCS8. Optional supplied public points in imported SEC1/PKCS8 and PEM are extracted with the existing bounded canonical readers and validated through the same path. Validation signs a fresh internal 32-byte CSPRNG challenge with the native private key and verifies it against the supplied point. Key-agreement imports keep their ECDH key handle and usages; the check imports a separate temporary native ECDSA signing handle. It neither trusts a re-exported supplied point nor uses shared-x equality, a fixed challenge, Wasm comparison, private elliptic-curve arithmetic or public-point recovery. Mismatches, negated/off-curve points and native DataError on supplied-point inputs become `CRFXError.invalidParameter`.

Every imported NIST private scalar is checked before native import with a fixed-width byte loop against its actual group order: **0 < d < n**. The field prime is not used for this check. There is no private BigInt conversion, data-dependent early exit or private EC arithmetic. The check covers raw, X9.63, SEC1, PKCS8 and PEM scalar paths. Curve25519 octet strings and public APIs are unchanged. Scalar-only valid Firefox keys retain their separately documented native public-point limitation; supplied-point imports no longer discard their usable point.

Regression evidence:

- Complete RED: `npx vitest run tests/runtime/cryptofx-key-import.test.ts` — **18 failed / six positive controls passed** (`crypto-key-import-complete-red.log`). The provider fixture reproduces native point reflection without scalar consistency validation, so mismatched DER/PEM acceptance and loss of supplied X9.63 points are independently exposed. It includes mismatched, negated and off-curve points across five supplied-point formats, plus 0/n/n+1 over all six scalar formats and verifies that invalid scalars never reach native import. Positive 1/n−1 controls are retained.
- CSPRNG RED: `npx vitest run tests/runtime/cryptofx-key-import.test.ts -t 'fresh native CSPRNG'` — **one failed / 24 skipped** (`crypto-key-challenge-red.log`), observing zero CSPRNG draws with the provisional fixed challenge. The final regression proves that two validations sign distinct provider-generated challenge values.
- Covering GREEN: `npx vitest run tests/runtime/cryptofx-key-import.test.ts tests/runtime/cryptofx.test.ts tests/runtime/cryptofx-review.test.ts tests/runtime/appkit-counterparts.test.ts` — **109/109 passed** across four files (25 new import tests, 25 original Crypto tests, 54 prior review regressions, five counterpart tests), `crypto-key-import-final-green.log`.
- Both repository typechecks passed (`crypto-key-import-framework-typecheck.log`, `crypto-key-import-site-typecheck.log`).
- Architecture passed: **1,615 files / 7,330 edges** (`crypto-key-import-architecture.log`).
- Frozen `npm run sdk:build` passed (`crypto-key-import-sdk-build.log`). No SDK-fingerprinted input changed after the freeze.
- Installed packed declarations/runtime passed **1/1** (`crypto-key-import-packed.log`).
- Browser workers passed **Chromium, Firefox and WebKit**, each with **282/282 private-import fixture checks**, plus direct X9.63 signing/agreement and the previous Crypto worker checks (`crypto-key-import-browser.log`, `crypto-key-import-installed-browser.json`). Firefox now preserves and uses directly supplied X9.63 points for both key kinds and every NIST curve. Its separate scalar-only native point limitation is still recorded and asserted.
- Frozen archive SHA-256: `80ce1a99ad57a88ac1fca4984d3f9e51713af17b59c463e50b15d289eceb8b01`.
- Final diff and staged diff checks passed. Prior probe/failure receipts and unrelated untracked files were preserved. No full suite, site adoption, server/port, branch/worktree, push or unrelated-family changes occurred. C: remained above 234 GB.

Owned correction files are `internal/keys.ts`, `internal/curves.ts`, new `tests/runtime/cryptofx-key-import.test.ts`, `tests/runtime/fx/packed-crypto.test.ts`, `scripts/synware/check-fx-crypto-consumer.mjs`, `docs/framework/fx/crypto.md` and this report.

The browser specimen now includes **282 private-import fixture checks per engine** covering direct X9.63, raw, SEC1/PKCS8 and PEM, both key kinds, all three NIST curves, malformed lengths/prefixes, mismatched/negated/off-curve points, invalid scalar boundaries and positive boundaries. It also exercises direct X9.63 signing and bidirectional agreement. The packed installed specimen covers direct X9.63 constructors and zero-scalar errors. Mapping count remains **417**, with no new public type or member.

### Complete file and member mapping

The following inventory binds every member row to its concrete type/file and support/error status. Error case names in the last column are `CRFXError` cases; synchronous value rows describe valid framework-created values. Unsupported operations remain callable and fail explicitly. Swift argument labels use positional methods or the named representation constructor field; explicit null salt/info selects Apple's shorter HKDF overloads.

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

| Apple member | CryptoFX member | File | Support / CRFXError |
| --- | --- | --- | --- |
| `AES.(type)` | `CRFXAES.(type)` | `src/FX/CryptoFX/CRFXAES.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `AES.GCM` | `CRFXAES.GCM` | `src/FX/CryptoFX/CRFXAES.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `AES.GCM.(type)` | `CRFXAESGCM.(type)` | `src/FX/CryptoFX/CRFXAESGCM.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `AES.GCM.Nonce` | `CRFXAESGCM.Nonce` | `src/FX/CryptoFX/CRFXAESGCM.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `AES.GCM.SealedBox` | `CRFXAESGCM.SealedBox` | `src/FX/CryptoFX/CRFXAESGCM.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `AES.GCM.seal(_:using:nonce:)` | `CRFXAESGCM.seal(data,key,nonce)` | `src/FX/CryptoFX/CRFXAESGCM.ts` | Supported asynchronously; malformed input/key: `invalidParameter`/`incorrectKeySize`; provider failure: `underlyingCoreCryptoError`. |
| `AES.GCM.seal(_:using:nonce:authenticating:)` | `CRFXAESGCM.seal(data,key,nonce,authenticating)` | `src/FX/CryptoFX/CRFXAESGCM.ts` | Supported asynchronously; malformed input/key: `invalidParameter`/`incorrectKeySize`; provider failure: `underlyingCoreCryptoError`. |
| `AES.GCM.open(_:using:)` | `CRFXAESGCM.open(box,key)` | `src/FX/CryptoFX/CRFXAESGCM.ts` | Supported asynchronously; malformed input/key: `invalidParameter`/`incorrectKeySize`; tag failure: `authenticationFailure`; import failure: `underlyingCoreCryptoError`. |
| `AES.GCM.open(_:using:authenticating:)` | `CRFXAESGCM.open(box,key,authenticating)` | `src/FX/CryptoFX/CRFXAESGCM.ts` | Supported asynchronously; malformed input/key: `invalidParameter`/`incorrectKeySize`; tag failure: `authenticationFailure`; import failure: `underlyingCoreCryptoError`. |
| `AES.GCM.Nonce.(type)` | `CRFXAESGCMNonce.(type)` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `AES.GCM.Nonce.init()` | `CRFXAESGCMNonce.constructor()` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` | Supported; invalid bytes/size: `invalidParameter`/`incorrectParameterSize`; random generation failure: `underlyingCoreCryptoError`. |
| `AES.GCM.Nonce.init(data:)` | `CRFXAESGCMNonce.constructor(data)` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` | Supported; invalid bytes/size: `invalidParameter`/`incorrectParameterSize`; random generation failure: `underlyingCoreCryptoError`. |
| `AES.GCM.Nonce.count` | `CRFXAESGCMNonce.count` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `AES.GCM.Nonce.bytes` | `CRFXAESGCMNonce.bytes` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `AES.GCM.Nonce.withUnsafeBytes(_:)` | `CRFXAESGCMNonce.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `AES.GCM.Nonce.makeIterator()` | `CRFXAESGCMNonce.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXAESGCMNonce.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `AES.GCM.SealedBox.(type)` | `CRFXAESGCMSealedBox.(type)` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `AES.GCM.SealedBox.init(combined:)` | `CRFXAESGCMSealedBox.constructor(combined)` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` | Supported value parsing; malformed values: `invalidParameter` or `incorrectParameterSize`. |
| `AES.GCM.SealedBox.init(nonce:ciphertext:tag:)` | `CRFXAESGCMSealedBox.constructor(nonce,ciphertext,tag)` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` | Supported value parsing; malformed values: `invalidParameter` or `incorrectParameterSize`. |
| `AES.GCM.SealedBox.nonce` | `CRFXAESGCMSealedBox.nonce` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `AES.GCM.SealedBox.ciphertext` | `CRFXAESGCMSealedBox.ciphertext` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `AES.GCM.SealedBox.tag` | `CRFXAESGCMSealedBox.tag` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `AES.GCM.SealedBox.combined` | `CRFXAESGCMSealedBox.combined` | `src/FX/CryptoFX/CRFXAESGCMSealedBox.ts` | Supported; null when nonce length is not 12 bytes. |
| `ChaChaPoly.(type)` | `CRFXChaChaPoly.(type)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `ChaChaPoly.Nonce` | `CRFXChaChaPoly.Nonce` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `ChaChaPoly.SealedBox` | `CRFXChaChaPoly.SealedBox` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `ChaChaPoly.seal(_:using:nonce:)` | `CRFXChaChaPoly.seal(data,key,nonce)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` | Unsupported native algorithm: rejected `CRFXError.underlyingCoreCryptoError`. |
| `ChaChaPoly.seal(_:using:nonce:authenticating:)` | `CRFXChaChaPoly.seal(data,key,nonce,authenticating)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` | Unsupported native algorithm: rejected `CRFXError.underlyingCoreCryptoError`. |
| `ChaChaPoly.open(_:using:)` | `CRFXChaChaPoly.open(box,key)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` | Unsupported native algorithm: rejected `CRFXError.underlyingCoreCryptoError`. |
| `ChaChaPoly.open(_:using:authenticating:)` | `CRFXChaChaPoly.open(box,key,authenticating)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` | Unsupported native algorithm: rejected `CRFXError.underlyingCoreCryptoError`. |
| `ChaChaPoly.Nonce.(type)` | `CRFXChaChaPolyNonce.(type)` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `ChaChaPoly.Nonce.init()` | `CRFXChaChaPolyNonce.constructor()` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` | Supported; invalid bytes/size: `invalidParameter`/`incorrectParameterSize`; random generation failure: `underlyingCoreCryptoError`. |
| `ChaChaPoly.Nonce.init(data:)` | `CRFXChaChaPolyNonce.constructor(data)` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` | Supported; invalid bytes/size: `invalidParameter`/`incorrectParameterSize`; random generation failure: `underlyingCoreCryptoError`. |
| `ChaChaPoly.Nonce.count` | `CRFXChaChaPolyNonce.count` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `ChaChaPoly.Nonce.bytes` | `CRFXChaChaPolyNonce.bytes` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `ChaChaPoly.Nonce.withUnsafeBytes(_:)` | `CRFXChaChaPolyNonce.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `ChaChaPoly.Nonce.makeIterator()` | `CRFXChaChaPolyNonce.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXChaChaPolyNonce.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `ChaChaPoly.SealedBox.(type)` | `CRFXChaChaPolySealedBox.(type)` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `ChaChaPoly.SealedBox.init(combined:)` | `CRFXChaChaPolySealedBox.constructor(combined)` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` | Supported value parsing; malformed values: `invalidParameter` or `incorrectParameterSize`. |
| `ChaChaPoly.SealedBox.init(nonce:ciphertext:tag:)` | `CRFXChaChaPolySealedBox.constructor(nonce,ciphertext,tag)` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` | Supported value parsing; malformed values: `invalidParameter` or `incorrectParameterSize`. |
| `ChaChaPoly.SealedBox.nonce` | `CRFXChaChaPolySealedBox.nonce` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `ChaChaPoly.SealedBox.ciphertext` | `CRFXChaChaPolySealedBox.ciphertext` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `ChaChaPoly.SealedBox.tag` | `CRFXChaChaPolySealedBox.tag` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `ChaChaPoly.SealedBox.combined` | `CRFXChaChaPolySealedBox.combined` | `src/FX/CryptoFX/CRFXChaChaPolySealedBox.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Curve25519.(type)` | `CRFXCurve25519.(type)` | `src/FX/CryptoFX/CRFXCurve25519.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.Signing` | `CRFXCurve25519.Signing` | `src/FX/CryptoFX/CRFXCurve25519.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.KeyAgreement` | `CRFXCurve25519.KeyAgreement` | `src/FX/CryptoFX/CRFXCurve25519.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.KeyAgreement.(type)` | `CRFXCurve25519KeyAgreement.(type)` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.KeyAgreement.PrivateKey` | `CRFXCurve25519KeyAgreement.PrivateKey` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.KeyAgreement.PublicKey` | `CRFXCurve25519KeyAgreement.PublicKey` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.KeyAgreement.PrivateKey.(type)` | `CRFXCurve25519KeyAgreementPrivateKey.(type)` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.KeyAgreement.PrivateKey.init(rawRepresentation:)` | `CRFXCurve25519KeyAgreementPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `Curve25519.KeyAgreement.PrivateKey.rawRepresentation` | `CRFXCurve25519KeyAgreementPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `Curve25519.KeyAgreement.PrivateKey.init()` | `CRFXCurve25519KeyAgreementPrivateKey.constructor()` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `Curve25519.KeyAgreement.PrivateKey.publicKey` | `CRFXCurve25519KeyAgreementPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` | Immediate typed public key; deferred generation/import failure remains observable through asynchronous key members. |
| `Curve25519.KeyAgreement.PrivateKey.sharedSecretFromKeyAgreement(with:)` | `CRFXCurve25519KeyAgreementPrivateKey.sharedSecretFromKeyAgreement(publicKey)` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPrivateKey.ts` | Supported asynchronously when native algorithm exists; unavailable provider: `underlyingCoreCryptoError`; malformed/mismatched values: `invalidParameter`. |
| `Curve25519.KeyAgreement.PublicKey.(type)` | `CRFXCurve25519KeyAgreementPublicKey.(type)` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPublicKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.KeyAgreement.PublicKey.init(rawRepresentation:)` | `CRFXCurve25519KeyAgreementPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `Curve25519.KeyAgreement.PublicKey.rawRepresentation` | `CRFXCurve25519KeyAgreementPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXCurve25519KeyAgreementPublicKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `Curve25519.Signing.(type)` | `CRFXCurve25519Signing.(type)` | `src/FX/CryptoFX/CRFXCurve25519Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.Signing.PrivateKey` | `CRFXCurve25519Signing.PrivateKey` | `src/FX/CryptoFX/CRFXCurve25519Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.Signing.PublicKey` | `CRFXCurve25519Signing.PublicKey` | `src/FX/CryptoFX/CRFXCurve25519Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.Signing.PrivateKey.(type)` | `CRFXCurve25519SigningPrivateKey.(type)` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.Signing.PrivateKey.init(rawRepresentation:)` | `CRFXCurve25519SigningPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `Curve25519.Signing.PrivateKey.rawRepresentation` | `CRFXCurve25519SigningPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `Curve25519.Signing.PrivateKey.init()` | `CRFXCurve25519SigningPrivateKey.constructor()` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `Curve25519.Signing.PrivateKey.publicKey` | `CRFXCurve25519SigningPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` | Immediate typed public key; deferred generation/import failure remains observable through asynchronous key members. |
| `Curve25519.Signing.PrivateKey.signature(for:) (data)` | `CRFXCurve25519SigningPrivateKey.signature(data)` | `src/FX/CryptoFX/CRFXCurve25519SigningPrivateKey.ts` | Supported asynchronously when native algorithm exists; unavailable provider: `underlyingCoreCryptoError`; malformed/mismatched values: `invalidParameter`. |
| `Curve25519.Signing.PublicKey.(type)` | `CRFXCurve25519SigningPublicKey.(type)` | `src/FX/CryptoFX/CRFXCurve25519SigningPublicKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Curve25519.Signing.PublicKey.init(rawRepresentation:)` | `CRFXCurve25519SigningPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXCurve25519SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `Curve25519.Signing.PublicKey.rawRepresentation` | `CRFXCurve25519SigningPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXCurve25519SigningPublicKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `Curve25519.Signing.PublicKey.isValidSignature(_:for:) (data)` | `CRFXCurve25519SigningPublicKey.isValidSignature(signature,data)` | `src/FX/CryptoFX/CRFXCurve25519SigningPublicKey.ts` | Supported asynchronously when native algorithm exists; unavailable provider: `underlyingCoreCryptoError`; malformed/mismatched values: `invalidParameter`. |
| `Digest.(type)` | `CRFXDigest.(type)` | `src/FX/CryptoFX/CRFXDigest.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `Digest.byteCount` | `conforming digest type.byteCount` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` (and each named digest file) | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `Digest.description` | `CRFXDigest.description` | `src/FX/CryptoFX/CRFXDigest.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `Digest.withUnsafeBytes(_:)` | `CRFXDigest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXDigest.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `Digest.Sequence.makeIterator()` | `CRFXDigest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXDigest.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `Digest.==(_:_:) (Self or Data)` | `conforming digest type["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` (and each named digest file) | Supported constant-time primitive; unavailable Wasm: `underlyingCoreCryptoError`; malformed values: `invalidParameter`. |
| `CryptoKitError.(type)` | `CRFXError.(type)` | `src/FX/CryptoFX/CRFXError.ts` | Supported Apple error class/case; no operation performed by the case constant. |
| `CryptoKitError.incorrectKeySize` | `CRFXError.incorrectKeySize` | `src/FX/CryptoFX/CRFXError.ts` | Supported Apple error class/case; no operation performed by the case constant. |
| `CryptoKitError.invalidParameter` | `CRFXError.invalidParameter` | `src/FX/CryptoFX/CRFXError.ts` | Supported Apple error class/case; no operation performed by the case constant. |
| `CryptoKitError.incorrectParameterSize` | `CRFXError.incorrectParameterSize` | `src/FX/CryptoFX/CRFXError.ts` | Supported Apple error class/case; no operation performed by the case constant. |
| `CryptoKitError.underlyingCoreCryptoError` | `CRFXError.underlyingCoreCryptoError` | `src/FX/CryptoFX/CRFXError.ts` | Supported Apple error class/case; no operation performed by the case constant. |
| `CryptoKitError.authenticationFailure` | `CRFXError.authenticationFailure` | `src/FX/CryptoFX/CRFXError.ts` | Supported Apple error class/case; no operation performed by the case constant. |
| `CryptoKitError.wrapFailure` | `CRFXError.wrapFailure` | `src/FX/CryptoFX/CRFXError.ts` | Supported Apple error class/case; no operation performed by the case constant. |
| `CryptoKitError.unwrapFailure` | `CRFXError.unwrapFailure` | `src/FX/CryptoFX/CRFXError.ts` | Supported Apple error class/case; no operation performed by the case constant. |
| `HKDF.(type)` | `CRFXHKDF.(type)` | `src/FX/CryptoFX/CRFXHKDF.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `HKDF.HKDF<H> specialisation` | `CRFXHKDF.CRFXHKDF(Hash)` | `src/FX/CryptoFX/CRFXHKDF.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HKDF.deriveKey(inputKeyMaterial:outputByteCount:)` | `CRFXHKDF.specialised deriveKey(key,count)` | `src/FX/CryptoFX/CRFXHKDF.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HKDF.deriveKey(inputKeyMaterial:salt:info:outputByteCount:)` | `CRFXHKDF.specialised deriveKey(key,salt,info,count)` | `src/FX/CryptoFX/CRFXHKDF.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HKDF.deriveKey(inputKeyMaterial:salt:outputByteCount:)` | `CRFXHKDF.specialised deriveKey(key,salt,null,count)` | `src/FX/CryptoFX/CRFXHKDF.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HKDF.deriveKey(inputKeyMaterial:info:outputByteCount:)` | `CRFXHKDF.specialised deriveKey(key,null,info,count)` | `src/FX/CryptoFX/CRFXHKDF.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HKDF.extract(inputKeyMaterial:salt:)` | `CRFXHKDF.specialised extract(key,salt)` | `src/FX/CryptoFX/CRFXHKDF.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HKDF.expand(pseudoRandomKey:info:outputByteCount:)` | `CRFXHKDF.specialised expand(prk,info,count)` | `src/FX/CryptoFX/CRFXHKDF.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HMAC.(type)` | `CRFXHMAC.(type)` | `src/FX/CryptoFX/CRFXHMAC.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `HMAC.HMAC<H> specialisation` | `CRFXHMAC.CRFXHMAC(Hash)` | `src/FX/CryptoFX/CRFXHMAC.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HMAC.init(key:)` | `CRFXHMAC.specialised constructor(key)` | `src/FX/CryptoFX/CRFXHMAC.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HMAC.authenticationCode(for:using:)` | `CRFXHMAC.specialised authenticationCode(data,key)` | `src/FX/CryptoFX/CRFXHMAC.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HMAC.isValidAuthenticationCode(_:authenticating:using:)` | `CRFXHMAC.specialised isValidAuthenticationCode(code,data,key)` | `src/FX/CryptoFX/CRFXHMAC.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HMAC.update(data:)` | `CRFXHMAC.specialised update(data)` | `src/FX/CryptoFX/CRFXHMAC.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HMAC.finalize()` | `CRFXHMAC.specialised finalize()` | `src/FX/CryptoFX/CRFXHMAC.ts` | Supported for native hash types; malformed inputs: `invalidParameter`/size cases; unavailable hash/provider (including MD5): `underlyingCoreCryptoError`. |
| `HashFunction.(type)` | `CRFXHashFunction.(type)` | `src/FX/CryptoFX/CRFXHashFunction.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `HashFunction.update(data:)` | `CRFXHashFunction.update(data)` | `src/FX/CryptoFX/CRFXHashFunction.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `HashFunction.finalize()` | `CRFXHashFunction.finalize()` | `src/FX/CryptoFX/CRFXHashFunction.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `HashedAuthenticationCode.(type)` | `CRFXHashedAuthenticationCode.(type)` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `HashedAuthenticationCode.byteCount` | `CRFXHashedAuthenticationCode.byteCount` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `HashedAuthenticationCode.description` | `CRFXHashedAuthenticationCode.description` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `HashedAuthenticationCode.withUnsafeBytes(_:)` | `CRFXHashedAuthenticationCode.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `HashedAuthenticationCode.Sequence.makeIterator()` | `CRFXHashedAuthenticationCode.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `HashedAuthenticationCode.==(_:_:) (Self or Data)` | `CRFXHashedAuthenticationCode.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXHashedAuthenticationCode.ts` | Supported constant-time primitive; unavailable Wasm: `underlyingCoreCryptoError`; malformed values: `invalidParameter`. |
| `Insecure.(type)` | `CRFXInsecure.(type)` | `src/FX/CryptoFX/CRFXInsecure.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.SHA1` | `CRFXInsecure.SHA1` | `src/FX/CryptoFX/CRFXInsecure.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.SHA1Digest` | `CRFXInsecure.SHA1Digest` | `src/FX/CryptoFX/CRFXInsecure.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.MD5` | `CRFXInsecure.MD5` | `src/FX/CryptoFX/CRFXInsecure.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.MD5Digest` | `CRFXInsecure.MD5Digest` | `src/FX/CryptoFX/CRFXInsecure.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.MD5.(type)` | `CRFXInsecureMD5.(type)` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.MD5.init()` | `CRFXInsecureMD5.constructor()` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Insecure.MD5.Digest` | `CRFXInsecureMD5.Digest` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.MD5.byteCount` | `CRFXInsecureMD5.byteCount` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Insecure.MD5.blockByteCount` | `CRFXInsecureMD5.blockByteCount` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Insecure.MD5.hash(data:)` | `CRFXInsecureMD5.hash(data)` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` | Unsupported native MD5: rejected `CRFXError.underlyingCoreCryptoError`. |
| `Insecure.MD5.update(data:)` | `CRFXInsecureMD5.update(data)` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` | Supported buffered immutable update; malformed data: `invalidParameter`. |
| `Insecure.MD5.finalize()` | `CRFXInsecureMD5.finalize()` | `src/FX/CryptoFX/CRFXInsecureMD5.ts` | Unsupported native MD5: rejected `CRFXError.underlyingCoreCryptoError`. |
| `Insecure.MD5Digest.(type)` | `CRFXInsecureMD5Digest.(type)` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.MD5Digest.byteCount` | `CRFXInsecureMD5Digest.byteCount` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` | Value member implemented; public MD5 production remains unavailable (`underlyingCoreCryptoError`). |
| `Insecure.MD5Digest.description` | `CRFXInsecureMD5Digest.description` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` | Value member implemented; public MD5 production remains unavailable (`underlyingCoreCryptoError`). |
| `Insecure.MD5Digest.withUnsafeBytes(_:)` | `CRFXInsecureMD5Digest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` | Value member implemented; public MD5 production remains unavailable (`underlyingCoreCryptoError`). |
| `Insecure.MD5Digest.Sequence.makeIterator()` | `CRFXInsecureMD5Digest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` | Value member implemented; public MD5 production remains unavailable (`underlyingCoreCryptoError`). |
| `Insecure.MD5Digest.==(_:_:) (Self or Data)` | `CRFXInsecureMD5Digest.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXInsecureMD5Digest.ts` | Supported constant-time primitive; unavailable Wasm: `underlyingCoreCryptoError`; malformed values: `invalidParameter`. |
| `Insecure.SHA1.(type)` | `CRFXInsecureSHA1.(type)` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.SHA1.init()` | `CRFXInsecureSHA1.constructor()` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Insecure.SHA1.Digest` | `CRFXInsecureSHA1.Digest` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.SHA1.byteCount` | `CRFXInsecureSHA1.byteCount` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Insecure.SHA1.blockByteCount` | `CRFXInsecureSHA1.blockByteCount` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Insecure.SHA1.hash(data:)` | `CRFXInsecureSHA1.hash(data)` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` | Supported asynchronously; malformed data: `invalidParameter`; unavailable provider: `underlyingCoreCryptoError`. |
| `Insecure.SHA1.update(data:)` | `CRFXInsecureSHA1.update(data)` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` | Supported buffered immutable update; malformed data: `invalidParameter`. |
| `Insecure.SHA1.finalize()` | `CRFXInsecureSHA1.finalize()` | `src/FX/CryptoFX/CRFXInsecureSHA1.ts` | Supported asynchronously; malformed data: `invalidParameter`; unavailable provider: `underlyingCoreCryptoError`. |
| `Insecure.SHA1Digest.(type)` | `CRFXInsecureSHA1Digest.(type)` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `Insecure.SHA1Digest.byteCount` | `CRFXInsecureSHA1Digest.byteCount` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Insecure.SHA1Digest.description` | `CRFXInsecureSHA1Digest.description` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Insecure.SHA1Digest.withUnsafeBytes(_:)` | `CRFXInsecureSHA1Digest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Insecure.SHA1Digest.Sequence.makeIterator()` | `CRFXInsecureSHA1Digest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `Insecure.SHA1Digest.==(_:_:) (Self or Data)` | `CRFXInsecureSHA1Digest.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXInsecureSHA1Digest.ts` | Supported constant-time primitive; unavailable Wasm: `underlyingCoreCryptoError`; malformed values: `invalidParameter`. |
| `MessageAuthenticationCode.(type)` | `CRFXMessageAuthenticationCode.(type)` | `src/FX/CryptoFX/CRFXMessageAuthenticationCode.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `MessageAuthenticationCode.byteCount` | `CRFXMessageAuthenticationCode.byteCount` | `src/FX/CryptoFX/CRFXMessageAuthenticationCode.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `MessageAuthenticationCode.withUnsafeBytes(_:)` | `CRFXMessageAuthenticationCode.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXMessageAuthenticationCode.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `MessageAuthenticationCode.Sequence.makeIterator()` | `CRFXMessageAuthenticationCode.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXMessageAuthenticationCode.ts` | Protocol contract; support/error behaviour belongs to the concrete conforming type. |
| `P256.(type)` | `CRFXP256.(type)` | `src/FX/CryptoFX/CRFXP256.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.Signing` | `CRFXP256.Signing` | `src/FX/CryptoFX/CRFXP256.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.KeyAgreement` | `CRFXP256.KeyAgreement` | `src/FX/CryptoFX/CRFXP256.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.KeyAgreement.(type)` | `CRFXP256KeyAgreement.(type)` | `src/FX/CryptoFX/CRFXP256KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.KeyAgreement.PrivateKey` | `CRFXP256KeyAgreement.PrivateKey` | `src/FX/CryptoFX/CRFXP256KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.KeyAgreement.PublicKey` | `CRFXP256KeyAgreement.PublicKey` | `src/FX/CryptoFX/CRFXP256KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.KeyAgreement.PrivateKey.(type)` | `CRFXP256KeyAgreementPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.KeyAgreement.PrivateKey.init(rawRepresentation:)` | `CRFXP256KeyAgreementPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Supported asynchronous native import; pre-native scalar range failure: `invalidParameter`; wrong width: `incorrectKeySize`; unavailable native provider: `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PrivateKey.rawRepresentation` | `CRFXP256KeyAgreementPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Supported asynchronously at fixed NIST width; unavailable JWK falls back to validated native PKCS8 scalar export; unavailable native formats: `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PrivateKey.init(x963Representation:)` | `CRFXP256KeyAgreementPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PrivateKey.x963Representation` | `CRFXP256KeyAgreementPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Supported with native public-point information; scalar-only imports lacking that point reject with `underlyingCoreCryptoError`. No private point-recovery algorithm is used. |
| `P256.KeyAgreement.PrivateKey.init(derRepresentation:)` | `CRFXP256KeyAgreementPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PrivateKey.derRepresentation` | `CRFXP256KeyAgreementPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.KeyAgreement.PrivateKey.init(pemRepresentation:)` | `CRFXP256KeyAgreementPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PrivateKey.pemRepresentation` | `CRFXP256KeyAgreementPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.KeyAgreement.PrivateKey.init(compactRepresentable:)` | `CRFXP256KeyAgreementPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PrivateKey.publicKey` | `CRFXP256KeyAgreementPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Immediate typed public key; deferred generation/import failure remains observable through asynchronous key members. |
| `P256.KeyAgreement.PrivateKey.sharedSecretFromKeyAgreement(with:)` | `CRFXP256KeyAgreementPrivateKey.sharedSecretFromKeyAgreement(publicKey)` | `src/FX/CryptoFX/CRFXP256KeyAgreementPrivateKey.ts` | Supported asynchronously when native algorithm exists; unavailable provider: `underlyingCoreCryptoError`; malformed/mismatched values: `invalidParameter`. |
| `P256.KeyAgreement.PublicKey.(type)` | `CRFXP256KeyAgreementPublicKey.(type)` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.KeyAgreement.PublicKey.init(rawRepresentation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PublicKey.rawRepresentation` | `CRFXP256KeyAgreementPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.KeyAgreement.PublicKey.init(x963Representation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PublicKey.x963Representation` | `CRFXP256KeyAgreementPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.KeyAgreement.PublicKey.init(derRepresentation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PublicKey.derRepresentation` | `CRFXP256KeyAgreementPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.KeyAgreement.PublicKey.init(pemRepresentation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PublicKey.pemRepresentation` | `CRFXP256KeyAgreementPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.KeyAgreement.PublicKey.init(compressedRepresentation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PublicKey.compressedRepresentation` | `CRFXP256KeyAgreementPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.KeyAgreement.PublicKey.init(compactRepresentation:)` | `CRFXP256KeyAgreementPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.KeyAgreement.PublicKey.compactRepresentation` | `CRFXP256KeyAgreementPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP256KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.Signing.(type)` | `CRFXP256Signing.(type)` | `src/FX/CryptoFX/CRFXP256Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.Signing.PrivateKey` | `CRFXP256Signing.PrivateKey` | `src/FX/CryptoFX/CRFXP256Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.Signing.PublicKey` | `CRFXP256Signing.PublicKey` | `src/FX/CryptoFX/CRFXP256Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.Signing.ECDSASignature` | `CRFXP256Signing.ECDSASignature` | `src/FX/CryptoFX/CRFXP256Signing.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `P256.Signing.ECDSASignature.(type)` | `CRFXP256SigningECDSASignature.(type)` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.Signing.ECDSASignature.init(rawRepresentation:)` | `CRFXP256SigningECDSASignature.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P256.Signing.ECDSASignature.rawRepresentation` | `CRFXP256SigningECDSASignature.rawRepresentation` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P256.Signing.ECDSASignature.init(derRepresentation:)` | `CRFXP256SigningECDSASignature.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P256.Signing.ECDSASignature.derRepresentation` | `CRFXP256SigningECDSASignature.derRepresentation` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P256.Signing.ECDSASignature.withUnsafeBytes(_:)` | `CRFXP256SigningECDSASignature.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXP256SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P256.Signing.PrivateKey.(type)` | `CRFXP256SigningPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.Signing.PrivateKey.init(rawRepresentation:)` | `CRFXP256SigningPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Supported asynchronous native import; pre-native scalar range failure: `invalidParameter`; wrong width: `incorrectKeySize`; unavailable native provider: `underlyingCoreCryptoError`. |
| `P256.Signing.PrivateKey.rawRepresentation` | `CRFXP256SigningPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Supported asynchronously at fixed NIST width; unavailable JWK falls back to validated native PKCS8 scalar export; unavailable native formats: `underlyingCoreCryptoError`. |
| `P256.Signing.PrivateKey.init(x963Representation:)` | `CRFXP256SigningPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P256.Signing.PrivateKey.x963Representation` | `CRFXP256SigningPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Supported with native public-point information; scalar-only imports lacking that point reject with `underlyingCoreCryptoError`. No private point-recovery algorithm is used. |
| `P256.Signing.PrivateKey.init(derRepresentation:)` | `CRFXP256SigningPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P256.Signing.PrivateKey.derRepresentation` | `CRFXP256SigningPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.Signing.PrivateKey.init(pemRepresentation:)` | `CRFXP256SigningPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P256.Signing.PrivateKey.pemRepresentation` | `CRFXP256SigningPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.Signing.PrivateKey.init(compactRepresentable:)` | `CRFXP256SigningPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.Signing.PrivateKey.publicKey` | `CRFXP256SigningPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Immediate typed public key; deferred generation/import failure remains observable through asynchronous key members. |
| `P256.Signing.PrivateKey.signature(for:) (data or Digest)` | `CRFXP256SigningPrivateKey.signature(data)` | `src/FX/CryptoFX/CRFXP256SigningPrivateKey.ts` | Data supported asynchronously; Digest overload rejects `CRFXError.underlyingCoreCryptoError`. Malformed values: `invalidParameter`; invalid signatures return false. |
| `P256.Signing.PublicKey.(type)` | `CRFXP256SigningPublicKey.(type)` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P256.Signing.PublicKey.init(rawRepresentation:)` | `CRFXP256SigningPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.Signing.PublicKey.rawRepresentation` | `CRFXP256SigningPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.Signing.PublicKey.init(x963Representation:)` | `CRFXP256SigningPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.Signing.PublicKey.x963Representation` | `CRFXP256SigningPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.Signing.PublicKey.init(derRepresentation:)` | `CRFXP256SigningPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.Signing.PublicKey.derRepresentation` | `CRFXP256SigningPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.Signing.PublicKey.init(pemRepresentation:)` | `CRFXP256SigningPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.Signing.PublicKey.pemRepresentation` | `CRFXP256SigningPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.Signing.PublicKey.init(compressedRepresentation:)` | `CRFXP256SigningPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.Signing.PublicKey.compressedRepresentation` | `CRFXP256SigningPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.Signing.PublicKey.init(compactRepresentation:)` | `CRFXP256SigningPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P256.Signing.PublicKey.compactRepresentation` | `CRFXP256SigningPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P256.Signing.PublicKey.isValidSignature(_:for:) (data or Digest)` | `CRFXP256SigningPublicKey.isValidSignature(signature,data)` | `src/FX/CryptoFX/CRFXP256SigningPublicKey.ts` | Data supported asynchronously; Digest overload rejects `CRFXError.underlyingCoreCryptoError`. Malformed values: `invalidParameter`; invalid signatures return false. |
| `P384.(type)` | `CRFXP384.(type)` | `src/FX/CryptoFX/CRFXP384.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.Signing` | `CRFXP384.Signing` | `src/FX/CryptoFX/CRFXP384.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.KeyAgreement` | `CRFXP384.KeyAgreement` | `src/FX/CryptoFX/CRFXP384.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.KeyAgreement.(type)` | `CRFXP384KeyAgreement.(type)` | `src/FX/CryptoFX/CRFXP384KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.KeyAgreement.PrivateKey` | `CRFXP384KeyAgreement.PrivateKey` | `src/FX/CryptoFX/CRFXP384KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.KeyAgreement.PublicKey` | `CRFXP384KeyAgreement.PublicKey` | `src/FX/CryptoFX/CRFXP384KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.KeyAgreement.PrivateKey.(type)` | `CRFXP384KeyAgreementPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.KeyAgreement.PrivateKey.init(rawRepresentation:)` | `CRFXP384KeyAgreementPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Supported asynchronous native import; pre-native scalar range failure: `invalidParameter`; wrong width: `incorrectKeySize`; unavailable native provider: `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PrivateKey.rawRepresentation` | `CRFXP384KeyAgreementPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Supported asynchronously at fixed NIST width; unavailable JWK falls back to validated native PKCS8 scalar export; unavailable native formats: `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PrivateKey.init(x963Representation:)` | `CRFXP384KeyAgreementPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PrivateKey.x963Representation` | `CRFXP384KeyAgreementPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Supported with native public-point information; scalar-only imports lacking that point reject with `underlyingCoreCryptoError`. No private point-recovery algorithm is used. |
| `P384.KeyAgreement.PrivateKey.init(derRepresentation:)` | `CRFXP384KeyAgreementPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PrivateKey.derRepresentation` | `CRFXP384KeyAgreementPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.KeyAgreement.PrivateKey.init(pemRepresentation:)` | `CRFXP384KeyAgreementPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PrivateKey.pemRepresentation` | `CRFXP384KeyAgreementPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.KeyAgreement.PrivateKey.init(compactRepresentable:)` | `CRFXP384KeyAgreementPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PrivateKey.publicKey` | `CRFXP384KeyAgreementPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Immediate typed public key; deferred generation/import failure remains observable through asynchronous key members. |
| `P384.KeyAgreement.PrivateKey.sharedSecretFromKeyAgreement(with:)` | `CRFXP384KeyAgreementPrivateKey.sharedSecretFromKeyAgreement(publicKey)` | `src/FX/CryptoFX/CRFXP384KeyAgreementPrivateKey.ts` | Supported asynchronously when native algorithm exists; unavailable provider: `underlyingCoreCryptoError`; malformed/mismatched values: `invalidParameter`. |
| `P384.KeyAgreement.PublicKey.(type)` | `CRFXP384KeyAgreementPublicKey.(type)` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.KeyAgreement.PublicKey.init(rawRepresentation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PublicKey.rawRepresentation` | `CRFXP384KeyAgreementPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.KeyAgreement.PublicKey.init(x963Representation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PublicKey.x963Representation` | `CRFXP384KeyAgreementPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.KeyAgreement.PublicKey.init(derRepresentation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PublicKey.derRepresentation` | `CRFXP384KeyAgreementPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.KeyAgreement.PublicKey.init(pemRepresentation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PublicKey.pemRepresentation` | `CRFXP384KeyAgreementPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.KeyAgreement.PublicKey.init(compressedRepresentation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PublicKey.compressedRepresentation` | `CRFXP384KeyAgreementPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.KeyAgreement.PublicKey.init(compactRepresentation:)` | `CRFXP384KeyAgreementPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.KeyAgreement.PublicKey.compactRepresentation` | `CRFXP384KeyAgreementPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP384KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.Signing.(type)` | `CRFXP384Signing.(type)` | `src/FX/CryptoFX/CRFXP384Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.Signing.PrivateKey` | `CRFXP384Signing.PrivateKey` | `src/FX/CryptoFX/CRFXP384Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.Signing.PublicKey` | `CRFXP384Signing.PublicKey` | `src/FX/CryptoFX/CRFXP384Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.Signing.ECDSASignature` | `CRFXP384Signing.ECDSASignature` | `src/FX/CryptoFX/CRFXP384Signing.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `P384.Signing.ECDSASignature.(type)` | `CRFXP384SigningECDSASignature.(type)` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.Signing.ECDSASignature.init(rawRepresentation:)` | `CRFXP384SigningECDSASignature.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P384.Signing.ECDSASignature.rawRepresentation` | `CRFXP384SigningECDSASignature.rawRepresentation` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P384.Signing.ECDSASignature.init(derRepresentation:)` | `CRFXP384SigningECDSASignature.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P384.Signing.ECDSASignature.derRepresentation` | `CRFXP384SigningECDSASignature.derRepresentation` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P384.Signing.ECDSASignature.withUnsafeBytes(_:)` | `CRFXP384SigningECDSASignature.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXP384SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P384.Signing.PrivateKey.(type)` | `CRFXP384SigningPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.Signing.PrivateKey.init(rawRepresentation:)` | `CRFXP384SigningPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Supported asynchronous native import; pre-native scalar range failure: `invalidParameter`; wrong width: `incorrectKeySize`; unavailable native provider: `underlyingCoreCryptoError`. |
| `P384.Signing.PrivateKey.rawRepresentation` | `CRFXP384SigningPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Supported asynchronously at fixed NIST width; unavailable JWK falls back to validated native PKCS8 scalar export; unavailable native formats: `underlyingCoreCryptoError`. |
| `P384.Signing.PrivateKey.init(x963Representation:)` | `CRFXP384SigningPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P384.Signing.PrivateKey.x963Representation` | `CRFXP384SigningPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Supported with native public-point information; scalar-only imports lacking that point reject with `underlyingCoreCryptoError`. No private point-recovery algorithm is used. |
| `P384.Signing.PrivateKey.init(derRepresentation:)` | `CRFXP384SigningPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P384.Signing.PrivateKey.derRepresentation` | `CRFXP384SigningPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.Signing.PrivateKey.init(pemRepresentation:)` | `CRFXP384SigningPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P384.Signing.PrivateKey.pemRepresentation` | `CRFXP384SigningPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.Signing.PrivateKey.init(compactRepresentable:)` | `CRFXP384SigningPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.Signing.PrivateKey.publicKey` | `CRFXP384SigningPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Immediate typed public key; deferred generation/import failure remains observable through asynchronous key members. |
| `P384.Signing.PrivateKey.signature(for:) (data or Digest)` | `CRFXP384SigningPrivateKey.signature(data)` | `src/FX/CryptoFX/CRFXP384SigningPrivateKey.ts` | Data supported asynchronously; Digest overload rejects `CRFXError.underlyingCoreCryptoError`. Malformed values: `invalidParameter`; invalid signatures return false. |
| `P384.Signing.PublicKey.(type)` | `CRFXP384SigningPublicKey.(type)` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P384.Signing.PublicKey.init(rawRepresentation:)` | `CRFXP384SigningPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.Signing.PublicKey.rawRepresentation` | `CRFXP384SigningPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.Signing.PublicKey.init(x963Representation:)` | `CRFXP384SigningPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.Signing.PublicKey.x963Representation` | `CRFXP384SigningPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.Signing.PublicKey.init(derRepresentation:)` | `CRFXP384SigningPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.Signing.PublicKey.derRepresentation` | `CRFXP384SigningPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.Signing.PublicKey.init(pemRepresentation:)` | `CRFXP384SigningPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.Signing.PublicKey.pemRepresentation` | `CRFXP384SigningPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.Signing.PublicKey.init(compressedRepresentation:)` | `CRFXP384SigningPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.Signing.PublicKey.compressedRepresentation` | `CRFXP384SigningPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.Signing.PublicKey.init(compactRepresentation:)` | `CRFXP384SigningPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P384.Signing.PublicKey.compactRepresentation` | `CRFXP384SigningPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P384.Signing.PublicKey.isValidSignature(_:for:) (data or Digest)` | `CRFXP384SigningPublicKey.isValidSignature(signature,data)` | `src/FX/CryptoFX/CRFXP384SigningPublicKey.ts` | Data supported asynchronously; Digest overload rejects `CRFXError.underlyingCoreCryptoError`. Malformed values: `invalidParameter`; invalid signatures return false. |
| `P521.(type)` | `CRFXP521.(type)` | `src/FX/CryptoFX/CRFXP521.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.Signing` | `CRFXP521.Signing` | `src/FX/CryptoFX/CRFXP521.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.KeyAgreement` | `CRFXP521.KeyAgreement` | `src/FX/CryptoFX/CRFXP521.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.KeyAgreement.(type)` | `CRFXP521KeyAgreement.(type)` | `src/FX/CryptoFX/CRFXP521KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.KeyAgreement.PrivateKey` | `CRFXP521KeyAgreement.PrivateKey` | `src/FX/CryptoFX/CRFXP521KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.KeyAgreement.PublicKey` | `CRFXP521KeyAgreement.PublicKey` | `src/FX/CryptoFX/CRFXP521KeyAgreement.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.KeyAgreement.PrivateKey.(type)` | `CRFXP521KeyAgreementPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.KeyAgreement.PrivateKey.init(rawRepresentation:)` | `CRFXP521KeyAgreementPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Supported asynchronous native import; pre-native scalar range failure: `invalidParameter`; wrong width: `incorrectKeySize`; unavailable native provider: `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PrivateKey.rawRepresentation` | `CRFXP521KeyAgreementPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Supported asynchronously at fixed NIST width; unavailable JWK falls back to validated native PKCS8 scalar export; unavailable native formats: `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PrivateKey.init(x963Representation:)` | `CRFXP521KeyAgreementPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PrivateKey.x963Representation` | `CRFXP521KeyAgreementPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Supported with native public-point information; scalar-only imports lacking that point reject with `underlyingCoreCryptoError`. No private point-recovery algorithm is used. |
| `P521.KeyAgreement.PrivateKey.init(derRepresentation:)` | `CRFXP521KeyAgreementPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PrivateKey.derRepresentation` | `CRFXP521KeyAgreementPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.KeyAgreement.PrivateKey.init(pemRepresentation:)` | `CRFXP521KeyAgreementPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PrivateKey.pemRepresentation` | `CRFXP521KeyAgreementPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.KeyAgreement.PrivateKey.init(compactRepresentable:)` | `CRFXP521KeyAgreementPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PrivateKey.publicKey` | `CRFXP521KeyAgreementPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Immediate typed public key; deferred generation/import failure remains observable through asynchronous key members. |
| `P521.KeyAgreement.PrivateKey.sharedSecretFromKeyAgreement(with:)` | `CRFXP521KeyAgreementPrivateKey.sharedSecretFromKeyAgreement(publicKey)` | `src/FX/CryptoFX/CRFXP521KeyAgreementPrivateKey.ts` | Supported asynchronously when native algorithm exists; unavailable provider: `underlyingCoreCryptoError`; malformed/mismatched values: `invalidParameter`. |
| `P521.KeyAgreement.PublicKey.(type)` | `CRFXP521KeyAgreementPublicKey.(type)` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.KeyAgreement.PublicKey.init(rawRepresentation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PublicKey.rawRepresentation` | `CRFXP521KeyAgreementPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.KeyAgreement.PublicKey.init(x963Representation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PublicKey.x963Representation` | `CRFXP521KeyAgreementPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.KeyAgreement.PublicKey.init(derRepresentation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PublicKey.derRepresentation` | `CRFXP521KeyAgreementPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.KeyAgreement.PublicKey.init(pemRepresentation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PublicKey.pemRepresentation` | `CRFXP521KeyAgreementPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.KeyAgreement.PublicKey.init(compressedRepresentation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PublicKey.compressedRepresentation` | `CRFXP521KeyAgreementPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.KeyAgreement.PublicKey.init(compactRepresentation:)` | `CRFXP521KeyAgreementPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.KeyAgreement.PublicKey.compactRepresentation` | `CRFXP521KeyAgreementPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP521KeyAgreementPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.Signing.(type)` | `CRFXP521Signing.(type)` | `src/FX/CryptoFX/CRFXP521Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.Signing.PrivateKey` | `CRFXP521Signing.PrivateKey` | `src/FX/CryptoFX/CRFXP521Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.Signing.PublicKey` | `CRFXP521Signing.PublicKey` | `src/FX/CryptoFX/CRFXP521Signing.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.Signing.ECDSASignature` | `CRFXP521Signing.ECDSASignature` | `src/FX/CryptoFX/CRFXP521Signing.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `P521.Signing.ECDSASignature.(type)` | `CRFXP521SigningECDSASignature.(type)` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.Signing.ECDSASignature.init(rawRepresentation:)` | `CRFXP521SigningECDSASignature.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P521.Signing.ECDSASignature.rawRepresentation` | `CRFXP521SigningECDSASignature.rawRepresentation` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P521.Signing.ECDSASignature.init(derRepresentation:)` | `CRFXP521SigningECDSASignature.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P521.Signing.ECDSASignature.derRepresentation` | `CRFXP521SigningECDSASignature.derRepresentation` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P521.Signing.ECDSASignature.withUnsafeBytes(_:)` | `CRFXP521SigningECDSASignature.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXP521SigningECDSASignature.ts` | Supported canonical raw/DER value; malformed input: `invalidParameter` or `incorrectParameterSize`. |
| `P521.Signing.PrivateKey.(type)` | `CRFXP521SigningPrivateKey.(type)` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.Signing.PrivateKey.init(rawRepresentation:)` | `CRFXP521SigningPrivateKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Supported asynchronous native import; pre-native scalar range failure: `invalidParameter`; wrong width: `incorrectKeySize`; unavailable native provider: `underlyingCoreCryptoError`. |
| `P521.Signing.PrivateKey.rawRepresentation` | `CRFXP521SigningPrivateKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Supported asynchronously at fixed NIST width; unavailable JWK falls back to validated native PKCS8 scalar export; unavailable native formats: `underlyingCoreCryptoError`. |
| `P521.Signing.PrivateKey.init(x963Representation:)` | `CRFXP521SigningPrivateKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P521.Signing.PrivateKey.x963Representation` | `CRFXP521SigningPrivateKey.x963Representation` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Supported with native public-point information; scalar-only imports lacking that point reject with `underlyingCoreCryptoError`. No private point-recovery algorithm is used. |
| `P521.Signing.PrivateKey.init(derRepresentation:)` | `CRFXP521SigningPrivateKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P521.Signing.PrivateKey.derRepresentation` | `CRFXP521SigningPrivateKey.derRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.Signing.PrivateKey.init(pemRepresentation:)` | `CRFXP521SigningPrivateKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Supplied point retained and checked by fresh native ECDSA challenge; invalid scalar, mismatched/negated point or malformed encoding: `invalidParameter`/size cases; native unavailability: `underlyingCoreCryptoError`. |
| `P521.Signing.PrivateKey.pemRepresentation` | `CRFXP521SigningPrivateKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Supported asynchronous representation; native failure: `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.Signing.PrivateKey.init(compactRepresentable:)` | `CRFXP521SigningPrivateKey.constructor(compactRepresentable = true)` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.Signing.PrivateKey.publicKey` | `CRFXP521SigningPrivateKey.publicKey` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Immediate typed public key; deferred generation/import failure remains observable through asynchronous key members. |
| `P521.Signing.PrivateKey.signature(for:) (data or Digest)` | `CRFXP521SigningPrivateKey.signature(data)` | `src/FX/CryptoFX/CRFXP521SigningPrivateKey.ts` | Data supported asynchronously; Digest overload rejects `CRFXError.underlyingCoreCryptoError`. Malformed values: `invalidParameter`; invalid signatures return false. |
| `P521.Signing.PublicKey.(type)` | `CRFXP521SigningPublicKey.(type)` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `P521.Signing.PublicKey.init(rawRepresentation:)` | `CRFXP521SigningPublicKey.constructor({ rawRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.Signing.PublicKey.rawRepresentation` | `CRFXP521SigningPublicKey.rawRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.Signing.PublicKey.init(x963Representation:)` | `CRFXP521SigningPublicKey.constructor({ x963Representation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.Signing.PublicKey.x963Representation` | `CRFXP521SigningPublicKey.x963Representation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.Signing.PublicKey.init(derRepresentation:)` | `CRFXP521SigningPublicKey.constructor({ derRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.Signing.PublicKey.derRepresentation` | `CRFXP521SigningPublicKey.derRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.Signing.PublicKey.init(pemRepresentation:)` | `CRFXP521SigningPublicKey.constructor({ pemRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.Signing.PublicKey.pemRepresentation` | `CRFXP521SigningPublicKey.pemRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.Signing.PublicKey.init(compressedRepresentation:)` | `CRFXP521SigningPublicKey.constructor({ compressedRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.Signing.PublicKey.compressedRepresentation` | `CRFXP521SigningPublicKey.compressedRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.Signing.PublicKey.init(compactRepresentation:)` | `CRFXP521SigningPublicKey.constructor({ compactRepresentation })` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Typed construction starts native work; malformed representations: `invalidParameter`/size cases; native failure deferred as `underlyingCoreCryptoError`. |
| `P521.Signing.PublicKey.compactRepresentation` | `CRFXP521SigningPublicKey.compactRepresentation` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Supported from supplied/generated native public points; a derived public key whose scalar-only native key lacks a public point rejects with `underlyingCoreCryptoError`; unavailable compact representation is null. |
| `P521.Signing.PublicKey.isValidSignature(_:for:) (data or Digest)` | `CRFXP521SigningPublicKey.isValidSignature(signature,data)` | `src/FX/CryptoFX/CRFXP521SigningPublicKey.ts` | Data supported asynchronously; Digest overload rejects `CRFXError.underlyingCoreCryptoError`. Malformed values: `invalidParameter`; invalid signatures return false. |
| `SHA256.(type)` | `CRFXSHA256.(type)` | `src/FX/CryptoFX/CRFXSHA256.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SHA256.init()` | `CRFXSHA256.constructor()` | `src/FX/CryptoFX/CRFXSHA256.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA256.Digest` | `CRFXSHA256.Digest` | `src/FX/CryptoFX/CRFXSHA256.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SHA256.byteCount` | `CRFXSHA256.byteCount` | `src/FX/CryptoFX/CRFXSHA256.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA256.blockByteCount` | `CRFXSHA256.blockByteCount` | `src/FX/CryptoFX/CRFXSHA256.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA256.hash(data:)` | `CRFXSHA256.hash(data)` | `src/FX/CryptoFX/CRFXSHA256.ts` | Supported asynchronously; malformed data: `invalidParameter`; unavailable provider: `underlyingCoreCryptoError`. |
| `SHA256.update(data:)` | `CRFXSHA256.update(data)` | `src/FX/CryptoFX/CRFXSHA256.ts` | Supported buffered immutable update; malformed data: `invalidParameter`. |
| `SHA256.finalize()` | `CRFXSHA256.finalize()` | `src/FX/CryptoFX/CRFXSHA256.ts` | Supported asynchronously; malformed data: `invalidParameter`; unavailable provider: `underlyingCoreCryptoError`. |
| `SHA256Digest.(type)` | `CRFXSHA256Digest.(type)` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SHA256Digest.byteCount` | `CRFXSHA256Digest.byteCount` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA256Digest.description` | `CRFXSHA256Digest.description` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA256Digest.withUnsafeBytes(_:)` | `CRFXSHA256Digest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA256Digest.Sequence.makeIterator()` | `CRFXSHA256Digest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA256Digest.==(_:_:) (Self or Data)` | `CRFXSHA256Digest.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSHA256Digest.ts` | Supported constant-time primitive; unavailable Wasm: `underlyingCoreCryptoError`; malformed values: `invalidParameter`. |
| `SHA384.(type)` | `CRFXSHA384.(type)` | `src/FX/CryptoFX/CRFXSHA384.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SHA384.init()` | `CRFXSHA384.constructor()` | `src/FX/CryptoFX/CRFXSHA384.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA384.Digest` | `CRFXSHA384.Digest` | `src/FX/CryptoFX/CRFXSHA384.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SHA384.byteCount` | `CRFXSHA384.byteCount` | `src/FX/CryptoFX/CRFXSHA384.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA384.blockByteCount` | `CRFXSHA384.blockByteCount` | `src/FX/CryptoFX/CRFXSHA384.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA384.hash(data:)` | `CRFXSHA384.hash(data)` | `src/FX/CryptoFX/CRFXSHA384.ts` | Supported asynchronously; malformed data: `invalidParameter`; unavailable provider: `underlyingCoreCryptoError`. |
| `SHA384.update(data:)` | `CRFXSHA384.update(data)` | `src/FX/CryptoFX/CRFXSHA384.ts` | Supported buffered immutable update; malformed data: `invalidParameter`. |
| `SHA384.finalize()` | `CRFXSHA384.finalize()` | `src/FX/CryptoFX/CRFXSHA384.ts` | Supported asynchronously; malformed data: `invalidParameter`; unavailable provider: `underlyingCoreCryptoError`. |
| `SHA384Digest.(type)` | `CRFXSHA384Digest.(type)` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SHA384Digest.byteCount` | `CRFXSHA384Digest.byteCount` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA384Digest.description` | `CRFXSHA384Digest.description` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA384Digest.withUnsafeBytes(_:)` | `CRFXSHA384Digest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA384Digest.Sequence.makeIterator()` | `CRFXSHA384Digest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA384Digest.==(_:_:) (Self or Data)` | `CRFXSHA384Digest.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSHA384Digest.ts` | Supported constant-time primitive; unavailable Wasm: `underlyingCoreCryptoError`; malformed values: `invalidParameter`. |
| `SHA512.(type)` | `CRFXSHA512.(type)` | `src/FX/CryptoFX/CRFXSHA512.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SHA512.init()` | `CRFXSHA512.constructor()` | `src/FX/CryptoFX/CRFXSHA512.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA512.Digest` | `CRFXSHA512.Digest` | `src/FX/CryptoFX/CRFXSHA512.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SHA512.byteCount` | `CRFXSHA512.byteCount` | `src/FX/CryptoFX/CRFXSHA512.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA512.blockByteCount` | `CRFXSHA512.blockByteCount` | `src/FX/CryptoFX/CRFXSHA512.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA512.hash(data:)` | `CRFXSHA512.hash(data)` | `src/FX/CryptoFX/CRFXSHA512.ts` | Supported asynchronously; malformed data: `invalidParameter`; unavailable provider: `underlyingCoreCryptoError`. |
| `SHA512.update(data:)` | `CRFXSHA512.update(data)` | `src/FX/CryptoFX/CRFXSHA512.ts` | Supported buffered immutable update; malformed data: `invalidParameter`. |
| `SHA512.finalize()` | `CRFXSHA512.finalize()` | `src/FX/CryptoFX/CRFXSHA512.ts` | Supported asynchronously; malformed data: `invalidParameter`; unavailable provider: `underlyingCoreCryptoError`. |
| `SHA512Digest.(type)` | `CRFXSHA512Digest.(type)` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SHA512Digest.byteCount` | `CRFXSHA512Digest.byteCount` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA512Digest.description` | `CRFXSHA512Digest.description` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA512Digest.withUnsafeBytes(_:)` | `CRFXSHA512Digest.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA512Digest.Sequence.makeIterator()` | `CRFXSHA512Digest.[Symbol.iterator]()` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SHA512Digest.==(_:_:) (Self or Data)` | `CRFXSHA512Digest.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSHA512Digest.ts` | Supported constant-time primitive; unavailable Wasm: `underlyingCoreCryptoError`; malformed values: `invalidParameter`. |
| `SharedSecret.(type)` | `CRFXSharedSecret.(type)` | `src/FX/CryptoFX/CRFXSharedSecret.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SharedSecret.description` | `CRFXSharedSecret.description` | `src/FX/CryptoFX/CRFXSharedSecret.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SharedSecret.withUnsafeBytes(_:)` | `CRFXSharedSecret.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXSharedSecret.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SharedSecret.==(_:_:) (Self or Data)` | `CRFXSharedSecret.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSharedSecret.ts` | Supported constant-time primitive; unavailable Wasm: `underlyingCoreCryptoError`; malformed values: `invalidParameter`. |
| `SharedSecret.hkdfDerivedSymmetricKey(using:salt:sharedInfo:outputByteCount:)` | `CRFXSharedSecret.hkdfDerivedSymmetricKey(Hash,salt,sharedInfo,count)` | `src/FX/CryptoFX/CRFXSharedSecret.ts` | Supported asynchronously; invalid output size: `incorrectParameterSize`; unsupported hash/provider: `underlyingCoreCryptoError`. |
| `SharedSecret.x963DerivedSymmetricKey(using:sharedInfo:outputByteCount:)` | `CRFXSharedSecret.x963DerivedSymmetricKey(Hash,sharedInfo,count)` | `src/FX/CryptoFX/CRFXSharedSecret.ts` | Supported asynchronously; invalid output size: `incorrectParameterSize`; unsupported hash/provider: `underlyingCoreCryptoError`. |
| `SymmetricKey.(type)` | `CRFXSymmetricKey.(type)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SymmetricKey.init(data:)` | `CRFXSymmetricKey.constructor(data)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` | Supported defensive copy; malformed data: `invalidParameter`. |
| `SymmetricKey.init(size:)` | `CRFXSymmetricKey.constructor(size)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` | Supported secure random generation; unavailable provider: `underlyingCoreCryptoError`. |
| `SymmetricKey.bitCount` | `CRFXSymmetricKey.bitCount` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SymmetricKey.bytes` | `CRFXSymmetricKey.bytes` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SymmetricKey.withUnsafeBytes(_:)` | `CRFXSymmetricKey.withUnsafeBytes(body)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SymmetricKey.==(_:_:)` | `CRFXSymmetricKey.["=="](lhs,rhs)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` | Supported constant-time primitive; unavailable Wasm: `underlyingCoreCryptoError`; malformed values: `invalidParameter`. |
| `SymmetricKeySize.(type)` | `CRFXSymmetricKeySize.(type)` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` | Exported type/namespace; concrete operation support and errors are listed separately. |
| `SymmetricKeySize.init(bitCount:)` | `CRFXSymmetricKeySize.constructor(bitCount)` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` | Supported byte-aligned size; invalid size: `incorrectKeySize`. |
| `SymmetricKeySize.bits128` | `CRFXSymmetricKeySize.bits128` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SymmetricKeySize.bits192` | `CRFXSymmetricKeySize.bits192` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SymmetricKeySize.bits256` | `CRFXSymmetricKeySize.bits256` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SymmetricKeySize.bitCount` | `CRFXSymmetricKeySize.bitCount` | `src/FX/CryptoFX/CRFXSymmetricKeySize.ts` | Supported synchronous value/constant; caller callbacks retain their own thrown errors. |
| `SymmetricKey.init(copyingWithZeroing:)` | `CRFXSymmetricKey.constructor({ copyingWithZeroing })` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` | Unsupported mutation/zeroing: `CRFXError.underlyingCoreCryptoError`; no callback or mutation. Initialisers throw; methods reject `Promise<void>`. |
| `SymmetricKey.init(size:initializingWith:)` | `CRFXSymmetricKey.constructor(size,initializingWith)` | `src/FX/CryptoFX/CRFXSymmetricKey.ts` | Unsupported mutation/zeroing: `CRFXError.underlyingCoreCryptoError`; no callback or mutation. Initialisers throw; methods reject `Promise<void>`. |
| `AES.GCM.seal(inPlace:using:nonce:authenticating:tag:)` | `CRFXAESGCM.sealInPlace(message,key,nonce,authenticating,tag)` | `src/FX/CryptoFX/CRFXAESGCM.ts` | Unsupported mutation/zeroing: `CRFXError.underlyingCoreCryptoError`; no callback or mutation. Initialisers throw; methods reject `Promise<void>`. |
| `AES.GCM.open(inPlace:using:nonce:authenticating:tag:)` | `CRFXAESGCM.openInPlace(message,key,nonce,authenticating,tag)` | `src/FX/CryptoFX/CRFXAESGCM.ts` | Unsupported mutation/zeroing: `CRFXError.underlyingCoreCryptoError`; no callback or mutation. Initialisers throw; methods reject `Promise<void>`. |
| `ChaChaPoly.seal(inPlace:using:nonce:authenticating:tag:)` | `CRFXChaChaPoly.sealInPlace(message,key,nonce,authenticating,tag)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` | Unsupported mutation/zeroing: `CRFXError.underlyingCoreCryptoError`; no callback or mutation. Initialisers throw; methods reject `Promise<void>`. |
| `ChaChaPoly.open(inPlace:using:nonce:authenticating:tag:)` | `CRFXChaChaPoly.openInPlace(message,key,nonce,authenticating,tag)` | `src/FX/CryptoFX/CRFXChaChaPoly.ts` | Unsupported mutation/zeroing: `CRFXError.underlyingCoreCryptoError`; no callback or mutation. Initialisers throw; methods reject `Promise<void>`. |
| `HKDF.deriveKey(inputKeyMaterial:salt:info:output:)` | `CRFXHKDF(Hash).deriveKey(key,salt,info,output)` | `src/FX/CryptoFX/CRFXHKDF.ts` | Unsupported mutation/zeroing: `CRFXError.underlyingCoreCryptoError`; no callback or mutation. Initialisers throw; methods reject `Promise<void>`. |
| `HKDF.expand(pseudoRandomKey:info:into:)` | `CRFXHKDF(Hash).expand(prk,info,into)` | `src/FX/CryptoFX/CRFXHKDF.ts` | Unsupported mutation/zeroing: `CRFXError.underlyingCoreCryptoError`; no callback or mutation. Initialisers throw; methods reject `Promise<void>`. |

HashFunction’s static/constructor side is represented by the hash-type constructor contract used by HMAC/HKDF/SharedSecret; TypeScript instance interfaces cannot declare static members. It requires `new()`, `hash(data)`, `byteCount` and `blockByteCount` in `src/FX/CryptoFX/internal/hash.ts`, and each concrete hash file implements those Apple members. The exported protocol describes `update` and `finalize` on an instance.

Independent final review of `267f56a` and `dd86dbc`: **spec compliance PASS; task quality PASS; no remaining concrete findings**. The complete correction history and native probes are preserved above.

## Crypto specialisation identity correction

Commit `a99ba91` — `FX: preserve Crypto hash specialisation identity`.

Files: `src/FX/CryptoFX/CRFXHMAC.ts`, `src/FX/CryptoFX/CRFXHKDF.ts`, `tests/runtime/cryptofx-review.test.ts`. Each factory now uses a WeakMap keyed by the hash class and returns exactly one class for each specialisation. The public member mapping above is unchanged. HKDF retains its private constructor and all browser-forced asynchronous signatures.

Nine regressions cover repeated class identity, different hash classes including classes registered to the same algorithm, unsupported hashes, and HMAC `instanceof` across independent call sites. The new cases first reproduced five failures, then all nine passed. The relevant three-file Crypto group passed 113 tests; framework and site typechecks and diff checks passed. Independent review: spec compliance PASS, quality PASS, no actionable findings.

## Rejected infrastructure and revised plan

Commit `59edf3a` — `FX: revert ambient attribution and plan per-app FX entries` reverses `79fa0ab`, `1e4f90a`, `4722c02`, `5cedae2`, `e94cea2` and `d3255ce`, preserving history. No ambient context, branded execution record, application process authority, hosting context, NSE bridge or callback propagation mechanism remains. No rejected helper was kept. That ambient-carrier Dispatch proposal and callback wrapping remain cancelled. The owner subsequently approved a distinct GCD performance core, Tasks 1–6 of the immutable Dispatch documents, after option A.

The audited uncommitted changes were the coordinator's PLAN and the worker's handler-cleanup regression additions. Those were restored before reverting. The other named task-2 production/evidence paths had no uncommitted changes. All unrelated untracked files, the site preview config and the accepted family work remain intact. Immediately after the revert, comparison with `82a9357` showed only the three Crypto identity files and the revised PLAN; the only source changes were the identity correction. A search of `src` and `scripts` found no references to the removed ambient/process modules or `DFXQueue`.

The owner's replacement model is per-app FX entry modules generated from the existing app-aware Vite resolver. Commit `cd839c5` implements the private binder, lazy pinned session resolution, per-app virtual modules, HMR invalidation and packed generator/runtime resources. Its detailed files, decisions and verification are recorded in [option-a-implementation.md](option-a-implementation.md). Attributed base classes reject unbound construction; per-app subclasses keep base `instanceof` and work after await, timers and callbacks. Binding/import does not resolve a session. Future family classes still need their actual flows, Apple-shaped errors, privacy checks and terminal resource cleanup.

## Option A compilation contract — owner resolution

The full source-backed assessment is [option-a-feasibility.md](option-a-feasibility.md).

| Required route | Result |
| --- | --- |
| Site first-party `.app` source in one Vite build | The existing importer containment and bundle identifier now select a per-app FX virtual module. Resolver and discovery/HMR tests cover this route. |
| Framework fixtures and test host | A real plugin-compiled `.app` fixture uses the unchanged test host API and the allowed runtime contract, including pre-service construction and awaited/timer/callback operations. Actual family flows follow in their own tasks. |
| Packed third-party consumer built with the plugin | The immutable installed consumer proves class identity, compiled app binding, copy isolation and the existing 6e fixture with the plugin enabled. |
| General installed/precompiled BundleLoader route | Plugin-built chunks retain compiled bindings. Non-plugin/base modules remain supported except attributed construction, which fails clearly. Separate SDK copies find no session in their registry and receive the family error. No provenance or registry-sharing mechanism is added. |

The exact fourth-route gap is contractual. `SynCloudOSBundleModuleLoader` is a zero-argument function returning an application module (`src/SynCloudOS/BundleLoader/bundleTypes.ts:65`). `BundleLoader.ts:332–359` calls it and then captures the evaluated result; it receives no import graph to compile. `src/SynCloudOSReact/browserRuntime.tsx:277–313` accepts and forwards those callbacks unchanged. `src/SynCloudOSReact/projectComposition.ts:39–56` and `docs/framework/getting-started.md:142–146` expressly support hosts without the Vite plugin. These paths neither require app-aware compilation nor establish a shared host SDK/session-registry graph.

A manifest cannot rewrite lexical references in built code; the initial audit therefore stopped under the earlier gate. The owner has now resolved the contract: attributed FX requires plugin compilation, while non-plugin modules support pure APIs and fail attributed base construction. Importing bound classes never resolves a session; construction or first privileged use does, with SCOS ambiguity behaviour. There is no BundleLoader provenance check, cross-SDK deduplication or registry sharing. This resolution permits implementation to continue without a workaround.

Option A verification: 97 focused tests in 9 files; 5 final resolver/fingerprint tests; 1 source compiled-fixture test; 1 outer immutable packed test containing 2 app/copy tests, the 6e authoring test and emitted PWA execution. Both repository typechecks and the SDK build passed. Architecture validated 1,619 files / 7,343 edges without a policy exception. The private attribution helpers are not public SDK exports. The initial packed PWA check exposed a missing fixture opt-in; the corrected fixture passed the complete check. No new production provenance or test-host API was added.

Independent focused review of `7962d3e..cd839c5`: spec compliance PASS, quality approved, no correctness/API fidelity findings. The remaining real-family error mapping, port capture, cleanup and compiled flows are explicitly deferred to their own implementation tasks. The generator's packaged TypeScript dependency was checked separately and is present.

## DispatchFX in-realm core

The owner's immutable design and plan are committed with the first Dispatch task. Only Tasks 1–6 are authorised here. The file/member mapping, task checks, commits and deviations are maintained in [the Dispatch evidence plan](../2026-11-08-dispatchfx/PLAN.md) and [the API reference](../../../framework/fx/dispatch.md). The general number representation applies to uptime; wall `rawValue` uses bigint to retain its unsigned clock encoding without losing epoch precision. Private interval payloads remain absent from the entry and public declarations.

Task 1 is committed as `a23c342` — `FX: add DispatchFX value types and entry`. It adds twelve mapped runtime values, runtime/TypeScript export checks and private-storage declaration checks. Fifteen focused tests, both typechecks and architecture (1,634 files / 7,365 edges) pass. The review found a wall-clock range error: Apple reserves two clock-tag bits, so finite wall epochs end at `2^62−2`, with overflow at `2^62−1`. Two regressions reproduced the error before correction. The corrected raw encodings keep wall tag `11`; the independent recheck approves both spec and quality. The README table placement was also corrected. Owner documents retain their original SHA-256 hashes. Queues, groups, sources and per-app lifetime remain pending at this point.

Task 2 is committed as `7da380c` — `FX: add DispatchFX queues and root scheduler`. It adds Object/Queue/Predicate/precondition APIs, private scheduling/execution/work helpers, and a neutral Foundation extraction of the existing host-yield implementation. Seventy-eight tests across five files pass, including 52 queue tests and affected host-yield/text-layout checks. Both typechecks and architecture (1,645 files / 7,415 edges) pass. The queue cases include target gates, barriers, suspension, specifics, QoS flags and relative priorities, host-hop promotion, the atomic 5 ms slice, non-reentrant main items, one-time error/thenable reporting and synchronous concurrentPerform. Three review regressions reproduced and corrected main-queue suspension, an inactive-ancestor retarget discarding its saved prefix, and unreachable leaf work reserving an independent target. The focused recheck approves spec and quality. No application binding, worker performance or future Group/WorkItem overload is claimed yet.

Task 3 is committed as `a2b753c` — `FX: add DispatchFX sync with deadlock detection and QoS override`. It adds value-returning synchronous execution, bounded predecessor draining, queue/target ownership detection, scoped priority boosts and error/frame cleanup. Thirty-one sync tests and the 52 queue tests are included in the 109-test, six-file focused pass. Both typechecks and architecture (1,647 files / 7,425 edges) pass. Primary Apple headers also establish nullable default targets and main/global target no-ops; those corrections have RED/GREEN coverage. The review found a distributive type conditional admitting PromiseLike unions. Ten compile cases reproduced it; the corrected guard preserves synchronous inference and the existing runtime thenable check. The focused recheck approves spec and quality. No worker runtime was added: the planned internal in-flight stub tests the guard only.

Task 4 is committed as `4d30014` — `FX: add DispatchFX work items, groups and semaphores`. It adds the three mapped classes, private state/blocking/notification helpers and actual deferred queue overloads. Forty-eight new cases join all 109 prior cases: 157 tests in seven files pass, as do both typechecks and architecture (1,655 files / 7,485 edges). WorkItem cancellation, first-completion notifications, auto/manual group counts, main-thread timeout/trap rules and registered predecessor drains are exercised. The class has an inferred-only TypeScript return parameter to enforce constructor work typing without a factory or result property. The review's continuously re-enrolling group reproduced a browser hang; a Group-only 5 ms drain bound now returns through the pinned timeout/trap policy with pending work retained. Atomic items and fixed WorkItem/sync drains retain their semantics. The focused recheck approves spec and quality, with no remaining findings.

Task 5 is committed as `02f5729` — `FX: add DispatchFX asyncAfter and sources`. It adds both-clock delayed work, the Source class and six protocol interfaces, internal concrete subclasses and timer/data state. Thirty-three new cases join all 157 prior cases: 190 tests in eight files, both typechecks and architecture (1,670 files / 7,576 edges) pass. Timers retain their original phase and missed-expiration count; overlapping leeway windows share host timers and strict entries remain separate. Wall arithmetic uses bigint before host conversion; long delays are bounded and rechecked. Source lifecycle, nullable/WorkItem handlers, queue ordering and cancellation are exercised. The runtime has only memory sampling, so pressure events remain dormant. The review's handler replacement mismatch is corrected by atomic pending-invocation rebinding of body, QoS, flags, trace and WorkItem association; running invocations retain their snapshot. The focused recheck approves spec and quality.

Task 6 is committed as `8d517c4` — `FX: bind DispatchFX queues to their application`. Forty files implement the app-bound entry and terminal exact-session lifetime, including queue/source/work-item/group/semaphore cleanup and an internal system binding. The private `dispatchQueueForSession(selectedSession).main` route retains an already-selected device session without resolving its app ID again. Imports do not resolve sessions; fresh queue lookups follow SCOS selection and old handles remain pinned. Tests include registry removal, overlapping sessions, relaunch, ambiguity, source cancellation handlers and compiled app construction after await, timers and callbacks. All 190 earlier tests remain within the final 258-test / 16-file focused pass. Both typechecks and architecture (1,674 files / 7,617 edges) pass.

Both immutable packed consumers pass (2 tests / 2 files), including the real Dispatch entry, strict installed declarations, production/PWA execution, separate SDK-copy isolation and post-proof resource integrity. The exact committed source bytes produce archive SHA256 `b520ef53deaec913223047805cea276065a32dfa68cf109f6e5d79c63b7c4a0b`; the committed receipt and exhaustive member/file/deviation mapping are in the Dispatch evidence directory. The real production proof exposed duplicate Windows slash spellings for one runtime file. The resolver now returns its existing canonical display path, with a RED/GREEN regression; no cross-copy registry sharing or SDK deduplication was introduced. New-file line endings were corrected before rebuilding and rerunning the packed proof.

The first Task 6 review found two Important defects: child queues could execute through ended targets, and lifetime callbacks retained completed WorkItems. The combined regressions reproduced ten failures. The final implementation guards every saved target lifetime, updates subscriptions for inactive retargeting and retains only weak, pending notification cleanup registrations. Completed reusable WorkItems no longer accumulate in the live session. The correction passes 30 dedicated lifetime tests; both immutable packed consumers include actual compiled-app stale-target regressions. Independent re-review: **spec compliance PASS, task quality approved, no remaining findings**.

Optional deletion of diagnostic installation `C:/Users/Kavish Krishnakumar/AppData/Local/Temp/dispatch-attribution-packed-z3BPQk` was rejected by execution policy with the reason “blocked by policy”. It remains; no bypass or retry was attempted, and free space stayed above 255 GB. This folder is separate from the prescribed final adoption checkout.

## NetworkFX fidelity evidence - 8 November 2026

Commit: 3c197869240af3cf594bd04087e6ca70b3f7cdb4 — FX: rebuild NetworkFX with attributed Apple path monitors.

Independent focused review: spec compliance PASS, task quality approved, no remaining findings.

### Scope and provenance

Worktree: `C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/framework`, branch `fix/blind-rewrite-friction`. Starting reviewed commit: `8d517c4f43946eac23b8de46424fd48d0f71b98a`. Option A and Dispatch 1-6 were already complete. Root owns PLAN/REPORT. No other family implementation, site source, protected config, Fusion, branches, pushes, stashes, worktrees or servers were changed.

Apple primary pages were read directly as Markdown from developer.apple.com on this date: [NWPathMonitor](https://developer.apple.com/documentation/network/nwpathmonitor), [NWPath](https://developer.apple.com/documentation/network/nwpath), [NWInterface](https://developer.apple.com/documentation/network/nwinterface), [NWError](https://developer.apple.com/documentation/network/nwerror), [NWPath.Status](https://developer.apple.com/documentation/network/nwpath/status-swift.enum), [NWPath.UnsatisfiedReason](https://developer.apple.com/documentation/network/nwpath/unsatisfiedreason-swift.enum), [NWInterface.InterfaceType](https://developer.apple.com/documentation/network/nwinterface/interfacetype), and Monitor cancel/currentPath. The browser search connector identified the pages but could not fetch their Markdown content type; direct HTTPS fetched the primary Markdown successfully.

### Public export and member mapping

Seven named public exports; each is a real runtime value. The three case objects also export their same-named TypeScript union types. The counterpart test enumerates actual module exports via both runtime import and the TypeScript checker and requires the exact mapping. public.ts contains re-exports only.

All files in this table are under src/FX/NetworkFX.

| Apple type/member | Our type/member | File | Support/error |
|---|---|---|---|
| NWPathMonitor.init(), init(requiredInterfaceType:), init(prohibitedInterfaceTypes:) | NWFXPathMonitor constructor overloads | NWFXPathMonitor.ts | Real attributed class, passively captures one app session; EACCES for denied launch entitlement, ENXIO/ EINVAL/ ECANCELED for missing/ambiguous/ended session. |
| NWPathMonitor.pathUpdateHandler | NWFXPathMonitor.pathUpdateHandler | NWFXPathMonitor.ts | Nullable handler; initial and update events execute as Dispatch items and recheck lifetime/access at delivery. |
| NWPathMonitor.currentPath | NWFXPathMonitor.currentPath | NWFXPathMonitor.ts | Latest delivered actual Path; ENOTSUP before first observation, fails after cancellation/revocation. |
| NWPathMonitor.queue, start(queue:) | NWFXPathMonitor.queue, start(queue) | NWFXPathMonitor.ts | Readonly queue, null before start; null/omitted start queue uses the selected app main queue. Repeated live start is idempotent. Required/prohibited filters need observed transport or fail ENOTSUP. |
| NWPathMonitor.cancel() | NWFXPathMonitor.cancel() | NWFXPathMonitor.ts | Terminal, idempotent cancellation; removes native subscription, drops pending delivery. |
| NWPath.status | NWFXPath.status | NWFXPath.ts | Coarse browser online satisfied/unsatisfied hint; does not establish endpoint reachability. |
| NWPath.unsatisfiedReason | NWFXPath.unsatisfiedReason | NWFXPath.ts | Observed reason or ENOTSUP; filtering a known excluded transport produces notAvailable. |
| NWPath.availableInterfaces | NWFXPath.availableInterfaces | NWFXPath.ts | Actual issued Interface instances only; browser inability to enumerate names/indices gives ENOTSUP. |
| NWPath.isExpensive | NWFXPath.isExpensive | NWFXPath.ts | Explicit cellular or reliable metered observation; otherwise ENOTSUP. |
| NWPath.isConstrained | NWFXPath.isConstrained | NWFXPath.ts | Save-Data mapping; missing observation gives ENOTSUP. |
| NWPath.supportsIPv4, supportsIPv6, supportsDNS | NWFXPath.supportsIPv4, supportsIPv6, supportsDNS | NWFXPath.ts | Actual host routing/configuration observations only; browser adapter supplies none, so all three throw ENOTSUP. |
| NWPath.usesInterfaceType(_:) | NWFXPath.usesInterfaceType(type) | NWFXPath.ts | Actual observed transports only; unknown transport gives ENOTSUP. |
| NWInterface.type, name, index | NWFXInterface.type, name, index | NWFXInterface.ts | Frozen issued class instance without public initializer; browser adapter never fabricates interfaces. |
| NWPath.Status cases | NWFXPathStatus value/type | NWFXPathStatus.ts | Frozen satisfied, unsatisfied, requiresConnection cases; browser emits first two only. |
| NWPath.UnsatisfiedReason cases | NWFXPathUnsatisfiedReason value/type | NWFXPathUnsatisfiedReason.ts | Frozen notAvailable, cellularDenied, wifiDenied, localNetworkDenied, vpnInactive; current primary docs include vpnInactive. |
| NWInterface.InterfaceType cases | NWFXInterfaceType value/type | NWFXInterfaceType.ts | Frozen other, wifi, cellular, wiredEthernet, loopback. Effective speed never establishes transport. |
| NWError.posix, dns, tls, wifiAware | NWFXError.posix, dns, tls, wifiAware | NWFXError.ts | Associated numeric cases use static constructors and readonly code/error. Darwin POSIX values: EACCES 13, ENOTSUP 45, ECANCELED 89, ENXIO 6, EINVAL 22, EMFILE 24, EIO 5. |

NWPath and NWInterface are Swift structures; immutable TypeScript classes provide the required runtime identities without host snapshot initializers. The agreed member list is implemented. Connection/listener APIs, gateways/endpoints, new link-quality members, async iterator and ethernetChannel are outside this pass.

### Authority, lifetime and browser decisions

- Network has no consent API. Attribution remains necessary because network.read is an existing launch entitlement and host access/lifetime must remain mandatory. No authorization enum, capability object, public client or factory is introduced.
- Context-construction timing is retained. createSynWareContextValue already obtains private environment clients; it now associates its frozen context with its Network port before publishing the SCOS session. No early-process/services infrastructure was added.
- Construction uses Option A createFXSessionBinding through fxRuntimeContracts. The base class reports the plugin/application-bundle requirement. Missing/ambiguous/ended sessions use NWFXError. A captured session cannot move to another runtime.
- Object.defineProperty installs the attributed marker; no public computed static member exposes metadata. ECMAScript private fields keep runtime metadata/context/port imports out of class declarations.
- The private port tracks an access generation. Runtime observers cover store, configuration profiles and canonical identity. Existing injected test permission/policy gates expose internal observation for deterministic false-then-true tests. Access loss immediately cancels subscriptions and invalidates older instances; restoration cannot validate an older generation.
- Active monitors observe observeFXSessionEnd and access loss. Registry removal without abort is terminal. Native callbacks and Dispatch closures each recheck access and cancellation. The eight-monitor bound remains for active native observations; construction starts no subscription.
- The hook binds to its actual React context's registered session, even when another runtime mounts the same app ID. Its private per-class binding is nonambient. useInsertionEffect owns actual unmount/context replacement; layout replay does not cancel the terminal monitor. Discarded render instances acquire no native subscriptions.
- currentPath throws ENOTSUP until the first queued observation rather than inventing an initial route. It rejects reads after cancellation/revocation. Paths update just before handlers. The affected member documents this timing limitation.
- Save-Data maps to isConstrained. Explicit cellular maps to expensive; otherwise a reliable metered boolean is used. Unknown cost, constrained state, interface enumeration, IP routing, DNS or unsatisfied reason throws ENOTSUP on the Apple member. No probes, polling or background network requests were added.
- Filtering an observed but excluded transport gives unsatisfied/notAvailable and empty allowed transports/interfaces. If filtering becomes unobservable, the monitor fails terminally and discards older queued paths.

### Removed names and migrated consumers

Removed public NWFXAuthorizationStatus, NWFXCapabilities, NWFXPathClient; removed NWFXNetworkPathAdapter from the former public class module. Removed authorizationStatus, requestAuthorization, capabilities, createMonitor, dispose, and callback-taking start(listener) from the public Network surface. Removed path interfaceType, effectiveType, downlinkMegabitsPerSecond, roundTripTimeMilliseconds, saveData, source.

Removed SynWareContextValue.network, bound/unbound SCOSFacade.network forwarders, and the frozen context's network property. Deleted mountedNetworkClient.ts and its factory, replacing it with private mountedNetworkPort. Internal MountedAppEnvironmentClients.network now holds NetworkPort. SynCloudOSRuntimeEnvironment no longer has a networkPaths property; native adapters are held in a private WeakMap keyed by the environment object.

Migrated useNetwork to a real monitor; browser observations; old Network tests; strict packed public type probe; empty-entry package gate; network.md and FX README; counterpart JSON/developer lookup verification. Existing SDK/compiler registration already points at NetworkFX/public.ts; no new subpath or alias was needed. Architecture configuration replaces the deleted mountedNetworkClient path with mountedNetworkPort; no exception was added.

Site deferral: sibling site remains on prerelease with its old installed SDK and passes its typecheck. `site/src/SynWare/NSEControlGallery.app/Contents/Gallery/FXCapabilitiesSection.tsx` lines 71-79 still use old useNetwork/createMonitor/start(listener) and render interfaceType/effectiveType/saveData. Migrate atomically with final SDK adoption/Gallery work: construct a fresh NWFXPathMonitor on each Start, assign pathUpdateHandler, start on queue/default, cancel on stop/unmount, catch unsupported Apple observations. Terminal monitors cannot restart after Stop. No shim was added. Gallery browser validation remains with that adoption task.

### Verification receipts

- network-initial-red.log: both original RED failures reproduced (missing constructor; stale false-to-true callback).
- network-adapter-red.log: five expected browser/package runtime gate failures before migration.
- network-hook-red.log: old frozen facade could not accept pathUpdateHandler.
- network-plugin-red.log: actual fixture exposed the missing fake Network port; sensitive test-host gates also correctly required explicit allow.
- network-counterparts-red.log: missing NWInterface mapping.
- network-edge-red.log: four expected failures for terminal unobservable-filter update, invalid filter, vpnInactive and wifiAware; resolved without weakening assertions.
- network-core-green.log: 20 tests in four files before final edge additions.
- network-hook-green.log: StrictMode root, two layout setups, one native subscription, immediate actual-unmount cleanup, another same-app runtime present.
- network-plugin-first-green.log: two source-entry plugin-compiled app tests passed using the normal test-host API.
- network-focused.log: 95 tests across 13 files passed, covering Network, context/SCOS/test-host, Option A and Dispatch app binding.
- network-framework-typecheck.log and network-site-typecheck.log: both repository npx tsc -b checks passed.
- network-architecture.log: 1,682 files / 7,655 edges validated without exceptions.
- network-sdk-build.log is NOT an acceptance receipt: initial build correctly rejected its changed-source fingerprint after final byte cleanup. Windows writes initially introduced CRLF/ANSI bytes in rewritten Network files; these were repaired to UTF-8/LF before replacement build. Large integration files retain narrow Network hunks. Both staged and working diff checks passed, including every new file, before replacement build. Source/shipped-doc/build inputs then froze.

The final frozen-byte checks and commit receipt are recorded below.

#### Public host boundary correction after focused review

Review of 91eda3e found an Important rule-1 violation: the existing `/browser` export `createSynCloudOSHostContribution(id, source, prepare)` inferred a full `SynCloudOSRuntimeEnvironment` for prepare's argument, whose optional networkPaths member exposed NetworkPathAdapter.currentPath/subscribe and NetworkPathSnapshot. A second real public route was `/sdk/testing.createDeterministicRuntimeEnvironment().environment.networkPaths`. The earlier direct Network/SCOS declaration checks did not cover these signatures. The initial host-visibility caveat is superseded by this correction.

The adapter is now privately associated with its environment identity in `src/FX/NetworkFX/internal/networkPort.ts` using a WeakMap. `SynCloudOSRuntimeEnvironment.networkPaths` is deleted entirely, rather than hidden behind one callback alias. `createBrowserRuntimeEnvironment` and the deterministic testing environment register the same native adapters in that private association without putting a property on their returned objects. The mounted runtime uses networkAdapterFor(runtime.environment), then the existing mountedNetworkPort authority path. InstalledApplications/capabilityReport uses the same internal lookup. No generic host callback or other family contract was narrowed or redesigned. Context-to-authorized-port association, permission/generation checks, exact-session queues, and native subscription teardown are unchanged.

Both confirmed inferred routes are therefore closed, including indexed type extraction. Runtime tests also check that the key is absent on browser/test/contribution environment objects while private observations still deliver and dispose. Public testing retains only its intended Network control: allow/deny/fail/reset, setStatus and activeMonitorCount, with no native currentPath/subscribe surface. The public-types fixture additionally rejects Network factories through root SCOS, SDK SCOS, SynWareContextValue and test-host appContext, and confirms positive unrelated environment.now and fake setStatus typing.

`network-boundary-installed-red.log` proves the old immutable installed SDK failed the strict regression with four TS2578 unused-expect-error errors, specifically the direct/indexed browser callback and exported testing environment routes. `network-boundary-runtime-red.log` proves both old environment objects exposed the property. The fixed source compile uses the same strict fixture and the normal source ambient declarations; no diagnostics are filtered or suppressed. The final immutable installed check repeats that exact fixture against `/browser`, `/sdk/testing`, `/sdk`, root and Network entry declarations.

Raw module-load scans can still include unrelated runtime declarations because existing fontAccess or host files contain internal signatures. They are not used as a substitute for the inferred-public-signature regression. No Network adapter remains on the environment model to extract through those signatures. The public Network class graph remains seven type files plus public.d.ts with no private metadata, port or browser-fact API.

#### Initial acceptance before boundary review (superseded below)

- network-focused-final.log: **95/95 tests, 13/13 files**, passed on final staged source bytes.
- network-framework-typecheck-final.log: **npx tsc -b passed** after byte cleanup. Site's unchanged installed SDK remains covered by network-site-typecheck.log.
- network-sdk-build-final.log: SDK archive build passed against the frozen input fingerprint.
- network-packed.log: **1/1 packed integration test passed**, including **2/2 actual installed plugin-compiled app tests**, Vite production build, actual family entry import, one attribution runtime graph, strict installed TypeScript probe, declaration checks and post-proof SDK resource integrity.
- network-installed.json: archive SHA-256 `0fe9addc76709ec8bf15b5698e5f6d743d49569c98c87da3fb0e53d59d9f13d4`; source SHA-256 `a5608b2de269050653950fc76aec9fa911b3ddd38b2cead2523be2846ca4b74d`; resources SHA-256 `862eadd708d2999b71354e6628c519517ca5f38db19509687bda0c4d3ab80262`. Consumer installed outside repository without links; temporary consumer cleaned by the standard harness.
- Full suite deliberately not run; final serial acceptance belongs to root after all families.
- Last C: measurement: 274,058,117,120 bytes free, comfortably above the 20 GB floor.

Commit: one explicit-path commit titled **FX: rebuild NetworkFX with attributed Apple path monitors**. Exact SHA and staged inventory are returned to root and written in network-commit.txt after committing; this avoids a self-referential commit hash in its own content. The commit contains only the inventory below and this evidence file.

### Exhaustive file inventory

The list below is the explicit-path source/test/doc inventory. This evidence file is also included. Root PLAN/REPORT and unrelated untracked evidence are excluded. New runtime files are Error/Interface/three cases, three internal helpers and mountedNetworkPort. Path/Monitor/public replace their old interface-only contents. New tests are seven network-* files and the five fixture files; existing networkPaths/package-gate tests are migrated. The two inherited RED files now exercise actual implementations; network-revocation-red no longer imports the deleted factory.
- docs/framework/appkit-counterparts.json
- docs/framework/fx/README.md
- docs/framework/fx/network.md
- scripts/quality/architecture-boundaries.json
- scripts/synware/installed-consumer.mjs
- src/FX/NetworkFX/NWFXError.ts
- src/FX/NetworkFX/NWFXInterface.ts
- src/FX/NetworkFX/NWFXInterfaceType.ts
- src/FX/NetworkFX/NWFXPath.ts
- src/FX/NetworkFX/NWFXPathMonitor.ts
- src/FX/NetworkFX/NWFXPathStatus.ts
- src/FX/NetworkFX/NWFXPathUnsatisfiedReason.ts
- src/FX/NetworkFX/internal/networkPort.ts
- src/FX/NetworkFX/internal/networkSessionBindings.ts
- src/FX/NetworkFX/internal/pathValues.ts
- src/FX/NetworkFX/public.ts
- src/SynCloudOS/AppSDK/appContextTypes.ts
- src/SynCloudOS/AppSDK/appRuntimeFacade.ts
- src/SynCloudOS/AppSDK/createSynWareContextValue.ts
- src/SynCloudOS/AppSDK/hooks/useNetwork.ts
- src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts
- src/SynCloudOS/AppSDK/mountedNetworkClient.ts
- src/SynCloudOS/AppSDK/mountedNetworkPort.ts
- src/SynCloudOS/AppSDK/scos/scosFacade.ts
- src/SynCloudOS/AppSDK/testing/fakeAdapters.ts
- src/SynCloudOS/AppSDK/testing/testHostTypes.ts
- src/SynCloudOS/PlatformAdapters/BrowserNetworkPathAdapter.ts
- src/SynCloudOS/Runtime/runtimeInstanceTypes.ts
- tests/fixtures/network-attribution/consumer.test.tsx
- tests/fixtures/network-attribution/src/SynWare/First.app/Contents/Info.ts
- tests/fixtures/network-attribution/src/SynWare/First.app/Contents/index.tsx
- tests/fixtures/network-attribution/vitest.config.mjs
- tests/runtime/fx/network-apple.test.ts
- tests/runtime/fx/network-counterparts.test.ts
- tests/runtime/fx/network-hook.test.tsx
- tests/runtime/fx/network-packed.test.ts
- tests/runtime/fx/network-revocation-red.test.ts
- tests/runtime/fx/networkPaths.test.ts
- tests/runtime/fx/phase5-package-gate.test.ts

#### Boundary correction final acceptance

The family commit is amended to retain one Network commit. Earlier archive hashes above describe the superseded pre-review artifact, not the boundary-corrected build.

- `network-boundary-installed-red.log`: strict old installed SDK fails with exactly four TS2578 unused-expect-error errors for direct/indexed callback and testing environment adapter routes.
- `network-boundary-runtime-red.log` then `network-boundary-runtime-green.log`: both runtime property-exposure regressions fail before, then **2/2 pass** with internal adapter delivery/disposal retained.
- `network-boundary-source-types.log`: **1/1 pass**, the same strict public-types fixture compiled against source entries and the repository's normal ambient declarations.
- `network-boundary-focused.log`: **111/111 tests in 18/18 files pass**, including the original Network/Option A/Dispatch/context tests plus boundary regressions and host-contribution integration.
- `network-boundary-plugin.log`: **2/2 source plugin-compiled .app tests pass** after private association, including awaited/timer/callback construction, permission revocation/restoration, stale delivery rejection and teardown.
- `network-boundary-framework-typecheck.log`, `network-boundary-site-typecheck.log`: both repository **npx tsc -b pass**. Root confirmed no site source/test/script use of networkPaths or adapter types requiring migration.
- `network-boundary-architecture.log`: **1,682 files / 7,658 edges validated**, no exceptions.
- All 12 amendment files were staged and UTF-8/LF validated; both working and staged diff checks passed before the single boundary-correction SDK freeze/rebuild. Disk remained over 274 billion bytes free.

- `network-boundary-sdk-build.log`: the single boundary-correction rebuild **passed** on the staged, frozen inputs; no source, shipped-documentation or build-input changes followed it.
- `network-boundary-packed.log`: **2/2 packed tests passed**, comprising the real installed plugin .app flow (2/2 nested tests, await/timer/callback/denial/revocation/teardown), production bundle/import/declaration/resource checks, and the new strict installed browser/testing/root/SDK inference regression. The same four directives that were unused in RED are now required type errors. Installed package resources remained immutable after both consumers.
- `network-boundary-declaration-graph.json`: root, /sdk, /sdk/testing, /browser and /fx/network declaration graphs each contain **zero Network internal modules**; semantic checker also confirms no networkPaths property on the inferred contribution environment. This complements the actual-signature compiler tests.
- Corrected immutable archive SHA-256: `16b694bccb3fc8402f62c3de25754591558f2582932576f5528d8214cad4db90`.
- Corrected source fingerprint: `feaf64f24db11553d2418a3f30052a7762e78cd787cf1e3f925d2df56189e507`.
- Corrected resources fingerprint: `43c47a3b1ca147906a253dec3a25b0bc7056de8b5b248b5a60fdbfda6ef1118d`.
- Working/staged diff checks pass again before amendment. The fingerprint is compared after amendment as well; evidence-only edits are outside SDK inputs. The amended family commit includes 45 explicit files, and its exact SHA is recorded in network-commit.txt and returned to root.

No Network public-host declaration caveat remains. Gallery still waits for final SDK adoption, and full-suite acceptance remains intentionally deferred to the final serial family gate.

Additional files for the boundary correction:

- src/SynCloudOS/InstalledApplications/capabilityReport.ts - migrate only its Network adapter lookup.
- src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts - privately associate browser adapter; no public environment field.
- tests/fixtures/network-attribution/public-types.ts - strict actual inferred public routes across browser/testing/root/SDK.
- tests/runtime/fx/network-host-boundary.test.ts - missing environment key, retained native delivery/disposal and contribution callback coverage.
- tests/runtime/fx/network-public-types.test.ts - compile the strict fixture against source SDK entries with normal ambient declarations.

## SpeechFX fidelity evidence - 8 November 2026

Commit: b74335291fc41fa9a7e1b5af23b680a109c00180 — FX: rebuild SpeechFX with attributed Apple recognition tasks.

Independent scoped re-review: spec compliance PASS, task quality approved, no remaining Critical, Important or Minor findings. Current acceptance: 154 focused tests / 22 files, source compiled app 2/2, installed-package checks 3/3, both typechecks and architecture 1,700 / 7,743.

### Scope and authority

Framework worktree: `C:/Users/Kavish Krishnakumar/Developer/SynCloudOS-Workspace/.worktrees/webspring-folders/framework`, branch `fix/blind-rewrite-friction`. Reviewed base: `3c197869240af3cf594bd04087e6ca70b3f7cdb4` (Network). Option A and Dispatch 1-6 were prerequisites. Root owns main PLAN/REPORT. This change implements Speech only and the necessary private runtime, hook, test-host, consumer, documentation and package gates. No other family implementation, site source/config, Fusion, server, protected port, branch, push, stash or extra worktree was changed.

Apple primary documentation was read directly as Markdown over HTTPS after the search connector could not fetch text/markdown: [SFSpeechRecognizer](https://developer.apple.com/documentation/speech/sfspeechrecognizer), [recognitionTask result handler](https://developer.apple.com/documentation/speech/sfspeechrecognizer/recognitiontask(with:resulthandler:)), [authorizationStatus](https://developer.apple.com/documentation/speech/sfspeechrecognizer/authorizationstatus()), [request](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest), [audio-buffer request](https://developer.apple.com/documentation/speech/sfspeechaudiobufferrecognitionrequest), [task](https://developer.apple.com/documentation/speech/sfspeechrecognitiontask), [task state](https://developer.apple.com/documentation/speech/sfspeechrecognitiontaskstate), [task hint](https://developer.apple.com/documentation/speech/sfspeechrecognitiontaskhint), [recognizer delegate](https://developer.apple.com/documentation/speech/sfspeechrecognizerdelegate), [task delegate](https://developer.apple.com/documentation/speech/sfspeechrecognitiontaskdelegate), [segment](https://developer.apple.com/documentation/speech/sftranscriptionsegment), and the individual isCancelled/isFinishing/shouldReportPartialResults pages. These confirm partial results default true, synchronous task return with asynchronous callbacks, sender-first delegate signatures and source-driven audio input.

### Complete admitted Apple member mapping

All files below are under `src/FX/SpeechFX`. Twelve runtime exports and two interface-only exports are enumerated through the runtime import and TypeScript symbol checker; every export is in appkit-counterparts.json and developer-MCP lookup tests. The three enum objects also provide same-named TypeScript union types. public.ts contains re-exports only.

| Apple type/member | SpeechFX member | File | Support/error |
|---|---|---|---|
| SFSpeechRecognizer.init(), init(locale:) | new SPFXSpeechRecognizer(locale?) | SPFXSpeechRecognizer.ts | Real private attributed subclass; passive selected-session binding. Base constructor explains plugin/application bundle requirement. Absent/ambiguous/ended sessions give SPFXError. |
| SFSpeechRecognizer.supportedLocales() | static supportedLocales(): ReadonlySet<Intl.Locale> | SPFXSpeechRecognizer.ts | Native Locale representation; capable port returns actual supported set. Browser enumeration throws NSCocoaErrorDomain/3328, never guesses from navigator languages. |
| SFSpeechRecognizer.authorizationStatus() | static authorizationStatus() | SPFXSpeechRecognizer.ts | Apple's four cases; shared app consent plus observed browser state. Origin grant alone leaves notDetermined. Saved consent cannot defeat denial. |
| SFSpeechRecognizer.requestAuthorization(handler) | static requestAuthorization(handler): void | SPFXSpeechRecognizer.ts | Speech-only authorization on capable ports; current browser adapter returns restricted without acquisition. Handler queued on selected main. Pending native authorization aborts on policy/privacy/session loss; stale grants stay invalid after regrant. Completed refusal is delivered as denied, not self-cancelled. |
| SFSpeechRecognizer.isAvailable, locale, supportsOnDeviceRecognition | same properties | SPFXSpeechRecognizer.ts | Intl.Locale is the standard Locale value because NSELocale does not exist. Browser isAvailable=false because supplied sources cannot be recognized; on-device=false. |
| SFSpeechRecognizer.delegate | delegate | SPFXSpeechRecognizer.ts | Nullable protocol, actual native availability observations, selected-session main delivery. |
| SFSpeechRecognizer.recognitionTask(with:resultHandler:), recognitionTask(with:delegate:) | recognitionTask(request, resultHandler), recognitionTask(request, delegate) | SPFXSpeechRecognizer.ts | Real task, two overloads. Result/error ordering is (result or null, error or null). Partial/final callbacks and full delegate flow run on capable ports. Unsupported sources report task SPFXError without microphone substitution. |
| SFSpeechRecognizerDelegate.speechRecognizer(_:availabilityDidChange:) | speechRecognizerAvailabilityDidChange(recognizer, available) | SPFXSpeechRecognizerDelegate.ts | Sender first. |
| SFSpeechRecognizerAuthorizationStatus | SPFXSpeechRecognizerAuthorizationStatus | SPFXSpeechRecognizerAuthorizationStatus.ts | notDetermined, restricted, denied, authorized. |
| SFSpeechRecognitionRequest.shouldReportPartialResults, requiresOnDeviceRecognition, taskHint, contextualStrings, addsPunctuation | same properties on abstract SPFXSpeechRecognitionRequest | SPFXSpeechRecognitionRequest.ts | Defaults true/false/unspecified/[]/false. Captured into native request. On-device guarantee unavailable produces SPFXError/3328. |
| SFSpeechRecognitionTaskHint | SPFXSpeechRecognitionTaskHint | SPFXSpeechRecognitionTaskHint.ts | unspecified, dictation, search, confirmation. |
| SFSpeechAudioBufferRecognitionRequest.append(AVAudioPCMBuffer), appendAudioSampleBuffer(CMSampleBuffer), endAudio() | append(AUFXAudioPCMBuffer), appendAudioSampleBuffer(MEFXSampleBuffer), endAudio() | SPFXSpeechAudioBufferRecognitionRequest.ts | Existing AudioFX/MediaFX types. Owned PCM/sample copies are delivered intact; ready audio sample data required. Caller closing its sample cannot invalidate appended audio. Request is single-use, bounded to 256 pending buffers and 64 MiB input. Native sample copies close at task completion/cancel. |
| SFSpeechAudioBufferRecognitionRequest.nativeAudioFormat | nativeAudioFormat: AUFXAudioFormat | SPFXSpeechAudioBufferRecognitionRequest.ts | Actual capable service format after asynchronous attachment; earlier/browser read throws SPFXError/3328. |
| SFSpeechURLRecognitionRequest.init(url:), url | new SPFXSpeechURLRecognitionRequest(URL), url | SPFXSpeechURLRecognitionRequest.ts | Standard owned URL value; capable port receives it. Browser task fails SPFXError/3328, without URL fetching or substituted capture. |
| SFSpeechRecognitionTask.state, isFinishing, isCancelled, error, finish(), cancel() | same members on issued SPFXSpeechRecognitionTask | SPFXSpeechRecognitionTask.ts | No public initializer or promise. finish permits final delivery; cancel terminally drops queued results. starting lasts through asynchronous acquisition. Native teardown may complete cancellation synchronously. |
| SFSpeechRecognitionTaskState | SPFXSpeechRecognitionTaskState | SPFXSpeechRecognitionTaskState.ts | starting, running, finishing, canceling, completed. |
| SFSpeechRecognitionTaskDelegate.speechRecognitionDidDetectSpeech, speechRecognitionTaskFinishedReadingAudio | same names | SPFXSpeechRecognitionTaskDelegate.ts | Sender first, speech detection/reading completion. |
| SFSpeechRecognitionTaskDelegate.speechRecognitionTask(_:didHypothesizeTranscription:), (_:didFinishRecognition:), (_:didFinishSuccessfully:), (_:didProcessAudioDuration:) | speechRecognitionTaskDidHypothesizeTranscription, speechRecognitionTaskDidFinishRecognition, speechRecognitionTaskDidFinishSuccessfully, speechRecognitionTaskDidProcessAudioDuration | SPFXSpeechRecognitionTaskDelegate.ts | Sender first, actual immutable transcription/final result/success/audio duration; final recognition precedes completion. |
| SFSpeechRecognitionTaskDelegate.speechRecognitionTaskWasCancelled | same name | SPFXSpeechRecognitionTaskDelegate.ts | One cancellation notification while authority remains; revoked owners receive no stale deliveries. |
| SFSpeechRecognitionResult.bestTranscription, transcriptions, isFinal | same properties | SPFXSpeechRecognitionResult.ts | Immutable issued class; native observations copied before queueing. |
| SFTranscription.formattedString, segments | same properties | SPFXTranscription.ts | Immutable issued transcription with actual segments; no invented aggregate confidence. |
| SFTranscriptionSegment.substring, substringRange, timestamp, duration, confidence, alternativeSubstrings | same properties | SPFXTranscriptionSegment.ts | Foundation NSERange in UTF-16 units; real timings/confidence/alternatives, validated and copied. Browser never fabricates them. |
| Speech NSError failures | SPFXError.domain, code, localizedDescription | SPFXError.ts | NSError-shaped class, mapped to NSError. Unsupported=NSCocoaErrorDomain/3328; authorization=kAFAssistantErrorDomain/1700; cancellation=216; generic service failure=203; unavailable app binding=1101. No DOMException/browser types in public Speech API. |

Apple's OperationQueue-valued recognizer.queue is explicitly omitted by owner decision: NSEOperationQueue does not exist and DispatchQueue is not substituted publicly. The admitted member list, not all newer/legacy Apple Speech functionality, defines this pass; no language-model or deprecated interaction/voice-analysis API was added.

### Private ownership and decisions

- Recognition consumes the supplied audio source. The current browser adapter has no backend for either admitted source, so both fail with SPFXError. isAvailable remains false; no fake timing, locale support or on-device claim is emitted. Following review, authorization is Speech-only: the current adapter reports unavailable/restricted without constructing recognition, capturing a microphone, transmitting audio or granting app consent. Capable internal services retain full authorization. This describes the current adapter rather than permanent browser-platform limits.
- No NSELocale exists. The owner accepted Intl.Locale/ReadonlySet<Intl.Locale> for Speech, alongside existing Foundation formatter string-locale conventions. Standard URL and NSERange, existing AUFXAudioPCMBuffer/AUFXAudioFormat and MEFXSampleBuffer are reused. No Foundation family was added.
- Constructors and static operations use createFXSessionBinding/fxAttributedClass only through fxRuntimeContracts. Object.defineProperty attaches attribution without a public computed-symbol declaration. Selected sessions are terminal. Callback defaults use dispatchQueueForSession(selectedSession).main; no ambient lookup or unbound main getter.
- Environment adapters live in a private WeakMap. A second private WeakMap associates the existing frozen app context with its mounted Speech port before session registration. No old client is retained on SynWareContextValue, SCOSFacade or SynCloudOSRuntimeEnvironment, including inferred browser contribution and testing environment signatures.
- Mounted authority combines launch entitlements, host policy, shared privacy, native observed denial and captured generations. Policy/store/session changes release native work. Pending authorization binds its privacy generation before awaiting native permission; policy loss also aborts its operation controller. Revocation followed by regrant cannot restore pending results. Late-produced native sessions are cancelled before dropping them, without cancelling replacement resources.
- Native and queued delivery both check lifetime/access. A recognizer ownership predicate also guards already-completed task deliveries queued before a component unmount. The hook returns the actual class and uses useInsertionEffect for true unmount, preserving StrictMode replay.
- SynWareRuntimeMount adds branding through a context copy. The hook resolves a unique matching app session by the exact mount AbortSignal plus runtime identity (or original context identity), never first/latest. Multiple exact matches fail SPFXError. Another mount with a duplicate configured runtime ID but distinct signal cannot be selected. Tests cover both this branded clone and the real mounted host path.
- The analogous previously committed Network hook still uses object-only matching; this investigation was reported to root and reserved for the authorised aggregate hooks phase. No Network source was changed.
- createSynWareTestHost's signature and exported entry remain unchanged. Its existing controls had no Speech service. The owner authorised narrow adapters.speech allow/deny/test-transcript controls plus counters for actual installed proof; these expose formattedString/isFinal, not private adapter/session/event types. Source/internal tests supply full timing and segment observations. Other families' controls and implementations were preserved.

### Removed public contracts and every consumer route

Deleted SPFXAuthorizationStatus, SPFXCapabilities and SPFXSpeechClient; replaced interface-only recognizer/request/task/result/transcription definitions with separate classes/protocols/enums. Removed public getCapabilities, getAuthorizationStatus, instance requestAuthorization, createRecognizer, dispose, request locale/reportsPartialResults/continuous/maximumAlternatives/signal, task.result promise and transcription.confidence. No aliases remain. Negative type tests intentionally mention removed names to prove rejection.

Deleted mountedSpeechClient.ts. Added mountedSpeechPort and private Speech internals. Migrated appRuntimeFacade, createSynWareContextValue, mountedEnvironmentClientRegistry, appContextTypes, SCOS bound/unbound projections, runtime environment type, BrowserRuntimeEnvironment, InstalledApplications capability report and BrowserSpeechAdapter. useSpeech now returns the real attributed recognizer.

Migrated phase5 browser Speech tests, mounted hook tests, shared privacy coverage, strict installed consumer probe and empty-entry package gate. Speech privacy cases formerly in the generic factory table now live as public-class authorization/task/ownership regressions in speech-flow.test.ts; unrelated family cases remain intact. Contacts-only hook coverage remains in phase5-speech-contacts-hooks.test.tsx; Speech has its real-context StrictMode tests. Updated phase5-packed.ts's installed type probe; created dedicated installed Speech .app and public-boundary fixtures. Added every new public counterpart/developer lookup assertion. Existing sdk-entries, sdk-package-manifest and compiler family routing already register fx/speech, so no extra entry or alias was needed.

Updated speech.md, FX README and authorization docs. Source/test/script searches find no remaining live old Speech consumer names (the AudioFX synthesis client is unrelated). Site `prerelease` has no SPFX/useSpeech/recognitionTask consumer in src/tests; its Gallery “Speech” example is AudioFX synthesis. Final Gallery/adoption may add the new recognition demonstration and must respect unsupported web sources. Site's existing SDK remains unchanged and its typecheck passes. No interim compatibility shim was created.

### Initial verification and regression history

- speech-initial-red.log: 2 expected missing-runtime-class failures; actual Apple exports/attribution then passed.
- speech-browser-red.log: 7 expected missing source/authorization adapter member failures; migrated browser tests now pass without substituting capture.
- speech-hook-red.log: queued completed result leaked after unmount; owner delivery guard fixes it.
- speech-branding-context-red.log: real branding-copy lookup failure reproduced; clone-safe exact mount lookup passes.
- speech-hook-ambiguity-red.log: first-match selection reached the wrong port instead of reporting ambiguity; unique-match check fixes it.
- speech-plugin-red.log: 2 genuine compiled .app failures for absent deterministic Speech control; narrow private fake association enables full flow.
- speech-package-red.log: 3 missing counterpart/runtime/package-probe failures; mappings and installed gate migrated.
- speech-unavailable-red.log: pending grant resurfaced after revoke/regrant, and unavailable source suppressed its error callback; privacy-generation-before-await and explicit unsupported-task failure paths fix both.
- speech-sample-red.log: supplied sample reused caller-owned object; independent copy/terminal cleanup fixes it.
- speech-authorization-abort-red.log: pending native authorization was not aborted by policy loss; per-operation controller now aborts immediately.
- speech-flow-red.log was an early broad contract run after the class scaffold and already passed; despite its filename it is not presented as RED evidence.
- speech-lifetime-green.log: 46/46 tests in 4 files after privacy, branding and owner-lifetime repairs.
- speech-boundary-green.log: 4/4 in 3 files, including source strict public signature compilation and runtime environment property absence.
- speech-sample-green.log: 22/22 in 2 files; final authorization-abort-green.log: 21/21 flow tests.
- speech-focused.log: **152/152 tests in 22/22 files pass**, covering Speech, shared privacy, actual mounted hooks, context/SCOS/test-host, app attribution, Dispatch binding, browser runtime and host contributions.
- speech-plugin-final.log: **2/2 actual plugin-compiled .app tests pass** after native await/timer/callback, including authorization, supplied PCM, real class results, denial, revocation/replacement, true teardown.
- speech-framework-typecheck.log and speech-site-typecheck.log: **both repository npx tsc -b --pretty false checks pass**; site branch remains prerelease and tracked status clean.
- speech-architecture.log: **1,700 files / 7,742 edges validated**, no exceptions.
- C: free space measured 274,422,050,816 bytes before build, above 20 GB throughout.
- Full suite intentionally not run; final serial acceptance belongs to root after all families.

### Staged bytes and SDK freeze

58 explicit owned source/test/doc paths were staged; each working file was byte-compared against its index object. Main PLAN/REPORT, unrelated evidence, .superpowers and site config are excluded. Source/shipped-doc/build inputs froze before SDK build. The SDK fingerprint explicitly excludes tests/receipts. A subsequent stronger whitespace split found three newly generated fixture files at Windows-default CRLF; only those new tests were normalized to LF and restaged before installed proof. No SDK fingerprint input changed, and the SDK build's frozen-input assertion passed.

The pre-existing phase5-mounted.test.tsx is wholly CRLF in HEAD (56/56 lines), so its original format was preserved (57/57 after the narrow edit). Byte checks confirm no CRCRLF and no trailing spaces/tabs. For all other 57 owned paths run ordinary `git diff --check -- <explicit paths>` and `git diff --cached --check -- <explicit paths>`. For this single pre-existing CRLF path run `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff [--cached] --check -- tests/runtime/fx/phase5-mounted.test.tsx`. Both staged and working split checks pass. No git configuration or gitattributes changes were made.

speech-sdk-build.log records the successful single SDK rebuild on those frozen inputs. Final immutable installed proof and commit receipts follow below.

### Exhaustive file inventory

This inventory has 58 explicit paths plus this evidence file. The original Speech recognizer/public files are replaced; mountedSpeechClient is deleted; all other new/modified ownership is listed. No wildcard staging was used.

- docs/framework/appkit-counterparts.json
- docs/framework/authorization.md
- docs/framework/fx/README.md
- docs/framework/fx/speech.md
- scripts/quality/architecture-boundaries.json
- scripts/synware/installed-consumer.mjs
- src/FX/SpeechFX/SPFXError.ts
- src/FX/SpeechFX/SPFXSpeechAudioBufferRecognitionRequest.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionRequest.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionResult.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionTask.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionTaskDelegate.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionTaskHint.ts
- src/FX/SpeechFX/SPFXSpeechRecognitionTaskState.ts
- src/FX/SpeechFX/SPFXSpeechRecognizer.ts
- src/FX/SpeechFX/SPFXSpeechRecognizerAuthorizationStatus.ts
- src/FX/SpeechFX/SPFXSpeechRecognizerDelegate.ts
- src/FX/SpeechFX/SPFXSpeechURLRecognitionRequest.ts
- src/FX/SpeechFX/SPFXTranscription.ts
- src/FX/SpeechFX/SPFXTranscriptionSegment.ts
- src/FX/SpeechFX/internal/audioRequests.ts
- src/FX/SpeechFX/internal/speechPort.ts
- src/FX/SpeechFX/internal/speechSessionBindings.ts
- src/FX/SpeechFX/internal/speechTasks.ts
- src/FX/SpeechFX/internal/transcriptionValues.ts
- src/FX/SpeechFX/public.ts
- src/SynCloudOS/AppSDK/appContextTypes.ts
- src/SynCloudOS/AppSDK/appRuntimeFacade.ts
- src/SynCloudOS/AppSDK/createSynWareContextValue.ts
- src/SynCloudOS/AppSDK/hooks/useSpeech.ts
- src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts
- src/SynCloudOS/AppSDK/mountedSpeechClient.ts
- src/SynCloudOS/AppSDK/mountedSpeechPort.ts
- src/SynCloudOS/AppSDK/scos/scosFacade.ts
- src/SynCloudOS/AppSDK/testing/fakeAdapters.ts
- src/SynCloudOS/AppSDK/testing/testHostTypes.ts
- src/SynCloudOS/InstalledApplications/capabilityReport.ts
- src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts
- src/SynCloudOS/PlatformAdapters/BrowserSpeechAdapter.ts
- src/SynCloudOS/Runtime/runtimeInstanceTypes.ts
- tests/fixtures/speech-attribution/consumer.test.tsx
- tests/fixtures/speech-attribution/public-types.ts
- tests/fixtures/speech-attribution/src/SynWare/First.app/Contents/Info.ts
- tests/fixtures/speech-attribution/src/SynWare/First.app/Contents/index.tsx
- tests/fixtures/speech-attribution/vitest.config.mjs
- tests/runtime/fx/phase5-mounted.test.tsx
- tests/runtime/fx/phase5-package-gate.test.ts
- tests/runtime/fx/phase5-packed.test.ts
- tests/runtime/fx/phase5-speech-contacts-hooks.test.tsx
- tests/runtime/fx/phase5-speech.test.ts
- tests/runtime/fx/speech-apple.test.ts
- tests/runtime/fx/speech-counterparts.test.ts
- tests/runtime/fx/speech-flow.test.ts
- tests/runtime/fx/speech-hook.test.tsx
- tests/runtime/fx/speech-host-boundary.test.ts
- tests/runtime/fx/speech-packed.test.ts
- tests/runtime/fx/speech-public-types.test.ts
- tests/runtime/privacy-new-fx.test.ts

### Initial frozen artifact acceptance (superseded by review correction below)

- speech-sdk-build.log: the single SDK build passed its frozen-source assertion. No production source, shipped documentation or build-input edits followed freeze.
- speech-packed.log: **3/3 installed tests in 3/3 files pass** (speech-packed, phase5-packed, packed-fx). Speech includes **2/2 nested actual installed plugin .app flow tests**, after await/timer/callback, supplied audio, authorization, denial, stale revocation/replacement and teardown. Vite production build/import and one shared attribution-runtime module also pass. The consumer is independently npm-installed outside the repository without links and is removed by the existing harness.
- Strict installed public-types.ts compiles with skipLibCheck:false against /browser, /sdk/testing, /sdk, root, /foundation, /fx/audio and /fx/speech. Removed names and inferred adapter extraction are required type errors; positive real class/delegate/request/task/Foundation usage compiles.
- Actual emitted declaration graphs from root, /sdk, /sdk/testing, /browser and /fx/speech each reach **zero Speech internal modules**. Direct class declaration text has no internal ports, attribution symbols, browser fields, old clients or promises. Runtime probes reject private package paths and inspect actual family exports.
- Installed SDK resource integrity remains identical after the real app, production bundle/import, strict typing and graph proofs. A final captureSdkSourceFingerprint comparison matches the built archive after proof.
- Archive SHA-256: `3385175b7faa597e7efd5bdef4c0a9f1d132cf9cdcdfdd10790938d74b7e548a`.
- Source SHA-256: `b799d0d9aa99b044998339fd25f94067115a19f1e43f2c6bf32018e4832f0887`.
- Resources SHA-256: `689d5d6cf278711523017659d8f45c6240fd2edbc4bacf3fb35d7b852b85047f`.
- C: free after proof: 274,372,628,480 bytes. Site SDK adoption/Gallery and physical browser acceptance remain deferred as scoped; no unsupported-source support claim is made.

Commit: one explicit-path commit titled **FX: rebuild SpeechFX with attributed Apple recognition tasks**. It contains the 58 listed paths plus this evidence file. Exact SHA is written to speech-commit.txt after commit and returned to root, avoiding a self-referential hash. Root PLAN/REPORT and unrelated files remain outside it.

### Review correction: Speech-only authorization and authoritative refusal

Review of initial commit 6940da82064c1541398ffc4a1c6c354f5770cbbf found an Important bug: a native NotAllowedError normalized to SPFXError could leave a prior grant intact and cause the public requestAuthorization callback to report authorized. A raw refusal could also revoke the completed request's own lease and lose its denied completion. Root additionally identified that starting browser microphone recognition merely to authorize was incompatible with Apple's source-free Speech authorization and could acquire/transmit audio outside an AudioFX capture request. Both findings supersede the initial authorization implementation and acceptance above.

The current BrowserSpeechAdapter now has **no native recognition constructor, browser-window options, event handlers or microphone-start code**. authorizationStatus and requestAuthorization return unavailable internally (public restricted); an already-ended request owner still fails with SPFXError cancellation. A request does not grant app consent. No AudioFX permission/capture flow or new microphone API was added. Its source requests remain explicit unsupported failures. Documentation states a limitation of this current adapter, not that all browser implementations are permanently incapable.

Capable private services retain the full authorization flow. createMountedSpeechPort detects raw NotAllowedError and already-normalized SPFXError(kAFAssistantErrorDomain, 1700) inside the native request operation. It returns a denied result into PrivacyApplicationPort.requestAuthorization before further normalization. The existing shared denial path records decision/browserStatus denied and releases the completed request lease before revoking active resources. Thus the public completion reports denied exactly once, subsequent authorizationStatus stays denied despite the adapter's previous granted status, and running tasks are cancelled. The captured generation and ended-operation checks still precede committing the result, so pending refusals/grants do not bypass revocation or revive after regrant.

Five unintended copyright changes are restored from Â© to © in hooks/useSpeech.ts, BrowserSpeechAdapter.ts, phase5-package-gate.test.ts, phase5-speech-contacts-hooks.test.tsx and privacy-new-fx.test.ts. Exact UTF-8 byte checks compare each restored header line to the reviewed Network parent 3c19786. All other bytes in those header-only corrections are preserved; there is no encoding-driven broad rewrite.

Correction inventory (12 existing owned paths; no additional public exports or new host API):

- docs/framework/authorization.md
- docs/framework/fx/speech.md
- docs/superpowers/evidence/2026-11-08-fx-fidelity/speech-evidence.md
- src/SynCloudOS/AppSDK/hooks/useSpeech.ts (header only)
- src/SynCloudOS/AppSDK/mountedSpeechPort.ts
- src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts
- src/SynCloudOS/PlatformAdapters/BrowserSpeechAdapter.ts
- tests/runtime/fx/phase5-package-gate.test.ts (header only)
- tests/runtime/fx/phase5-speech-contacts-hooks.test.tsx (header only)
- tests/runtime/fx/phase5-speech.test.ts
- tests/runtime/fx/speech-flow.test.ts
- tests/runtime/privacy-new-fx.test.ts (header only)

Exact covering command: `npx vitest run tests/runtime/fx/phase5-speech.test.ts tests/runtime/fx/speech-flow.test.ts`.

- speech-review-red.log: **5 failed / 24 passed, 2 files**. Three browser failures prove the old passive status and authorization requests instantiate native recognition. Two capable-port tests start from a saved grant and prove raw denial loses its completion while normalized denial incorrectly reports authorized.
- speech-review-green.log: **29/29 passed, 2 files** after both fixes.
- speech-review-covering.log: **30/30 passed, 2 files**, including an additional public-browser regression showing restricted completion/status, shared decision remaining prompt, browserStatus unavailable and zero recognition-start calls. Full capable flow, real buffers/segments/delegates, policy/privacy/session teardown and stale-generation tests remain intact. Removed browser capture tests covered the now-deleted behavior; cancellation/service denial guarantees remain exercised through capable private ports.
- speech-review-focused.log: **154/154 tests, 22/22 files pass** with the same full focused file set listed in speech-focused.log. This includes every new covering regression plus shared privacy, hooks, actual mounted path, public types, attribution, Dispatch, host/context/browser integration.
- speech-review-plugin.log: exact command `npx vitest run --config tests/fixtures/speech-attribution/vitest.config.mjs`; **2/2 actual plugin-compiled .app tests pass**.
- speech-review-framework-typecheck.log and speech-review-site-typecheck.log: exact command `npx tsc -b --pretty false` in each repository; **both exit 0**. Site remains prerelease with no tracked changes or SDK adoption.
- speech-review-architecture.log: exact command `node scripts/quality/architecture-boundaries.mjs`; **1,700 files / 7,743 edges validated**.

The 12 correction paths were explicitly staged and every file byte-compared with the index before SDK freeze. Default working/staged whitespace checks apply to all normal files; the previously committed wholly-CRLF phase5-mounted.test.tsx alone uses the documented cr-at-eol check. The full intended amended diff against 3c19786 passes the same split, and that test remains ordinary CRLF without CRCRLF or trailing blanks. Root PLAN/REPORT and review evidence outside this file are excluded from staging. The correction performs one replacement SDK rebuild; the final immutable proof is recorded next. No full suite, other family implementation, site config, server or protected-port operation was added.

#### Review correction final frozen acceptance

- `npm run sdk:build` → speech-review-sdk-build.log: **exit 0**, one replacement SDK rebuild, frozen-source assertion passed. No production source, shipped documentation, fixture or build input changed after this correction freeze.
- `npx vitest run tests/runtime/fx/speech-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → speech-review-packed.log: **3/3 tests, 3/3 files passed**, exit 0. This repeats the immutable installed actual-entry proof, including **2/2 nested compiled .app flow tests**, after await/timer/callback, full capable audio/result flow, denied access, stale replacement and teardown.
- The repeated installed proof also passes Vite production bundle/import checks, strict public types with skipLibCheck:false, exact runtime class exports, blocked private package routes and one shared attribution runtime. Actual declaration graphs for root, /sdk, /sdk/testing, /browser and /fx/speech again each contain **zero Speech internal modules**. Installed resources remain byte-identical after proof.
- Corrected archive SHA-256: `6f25d1417457125aba2002d66c36a52008c38f282af26d6b35d974c1dfebe9b6`.
- Corrected source SHA-256: `3ca899baa8042f50b31bd70c35953aa7ab9f164ccc6887e992302ec5e73915bb`.
- Corrected resources SHA-256: `e13c15ca15aac936d1ee95b4f966207af14bcf56d60f4fcf2c57c279a950192a`.
- speech-review-installed.json and speech-installed.json identify this corrected artifact; the initial hashes above are superseded. captureSdkSourceFingerprint still matches after all installed checks and is rechecked after amendment.
- Default/scoped whitespace checks and exact staged-byte comparisons pass again before amendment. All five restored copyright lines are byte-equal to the pre-Speech parent. Last measured C: free space was 274,354,896,896 bytes, above the 20 GB floor.
- One Speech commit is retained by amending 6940da8 with only these 12 explicit paths. The revised SHA is written to speech-commit.txt and speech-review-commit.txt and returned to root for scoped independent re-review. Main PLAN/REPORT remain root-owned and unstaged. Full suite/site adoption/physical capable-service testing remain deferred; current browser authorization performs no capture.

## ContactsFX fidelity rebuild evidence

Commit: b0861c5d9ef44448bc3cc8d8d833e205b159a7d2 — FX: rebuild ContactsFX with attributed contacts and NSE picker.

Independent scoped re-review: spec compliance PASS, task quality approved. No remaining Critical/Important finding; existing SDK Rollup warnings remain in the aggregate ledger. Current checks: 177 focused tests / 24 files, covering 23/23, source compiled app 2/2, installed-package checks 3/3, both typechecks and architecture 1,721 / 7,828.

Base: `b74335291fc41fa9a7e1b5af23b680a109c00180` (reviewed Speech). Worktree `framework`, branch `fix/blind-rewrite-friction`; sibling site `prerelease` remains on its previous installed SDK. Root owns PLAN/REPORT. No other family implementation, site config, Fusion, branch/worktree, server, protected port, push, or stash changed.

### Authority and decisions

Read the extracted contacts-task-brief.md, family-task-constraints.md and the review's ten rules/Contacts member list. Consulted Apple's live documentation JSON for CNContact, CNContactStore, CNContactFetchRequest, CNLabeledValue, CNPostalAddress, CNContactFormatter, CNError.Code, CNContactTypeKey, CNContactPickerViewController and CNContactPickerDelegate. Canonical URLs are linked in docs/framework/fx/contacts.md.

- Real Apple classes, one per file; delegate/key-descriptor protocols are interfaces; public.ts contains only explicit named re-exports. Attributed constructors use committed fxRuntimeContracts helpers with private class metadata, pinned sessions and terminal instances. No public factory, capability object, browser options/types, signal parameters, compatibility aliases, inverse formatter or new Foundation subsystem was added.
- Browser selection is limited to the contacts chosen for that request. CNContactStore.requestAccess never opens a picker or claims database authorization. Its completion is queued `(false, CNFXError)`; synchronous database members fail explicitly and never read a picker cache. Static statuses use Apple's cases; only limited is reported after selection, never database authorized. Empty selection cancels without recording a consent grant.
- CNContactPickerViewController genuinely extends NSEViewController. Binding resolves before `super`, and the selected mount signal supplies the inherited NSE owner lifetime. This fixes real after-await construction without ambient ownership. Registry removal is separately observed. Existing NSE presentation adopts it normally, initiates the browser chooser synchronously through a private WeakMap, and suppresses a duplicate host sheet. No public native-present hook, new presentation style, raw UI or artwork. Architecture adds an exact ContactsUI class layer whose only NSE entries are NSEViewController and the private association; only the FX layer admits that class. Host rendering reaches the association through the existing private NSE host interop.
- Shared consent still precedes native access. A pending app-consent prompt may consume browser activation; it is never bypassed. Already authorized action-handler presentation reaches the chooser in the same synchronous activation boundary. Browser secure-context/support and actual native permission are independent constraints.
- Raw NotAllowedError reaches Privacy.request before CNFXError normalization, so refusal replaces a saved grant. Cross-realm DOMException names/messages are read structurally. The deterministic native Contacts denial maps its fake SecurityError to NotAllowedError; actual browser SecurityError continues to represent context/policy restrictions and is not rewritten as a user's refusal.
- Captured generations invalidate pending and queued results through revoke/regrant or replacement. Policy/entitlement loss, signal abort and session registry removal terminate active pickers. Delegates use the exact selected session's main Dispatch queue and recheck authority at delivery. Browser Contact Picker exposes no cancellable session/resource handle: there is no late native handle to release, and dismissal cannot close the browser-owned dialog. Old contact values are dropped while replacements remain unaffected.
- Native display names have no reliable decomposition: preserve the first complete display name in givenName; familyName remains empty/unavailable. No inverse formatter. Native labels are unknown and remain null. Contact/labeled identifiers are NSString-shaped strings, generated for the snapshot and stable across copies, never device database identifiers. No UUID/URL/bytes counterpart is needed for this member set.
- Labeled email/phone/postal values are real classes with immutable arrays/copies. Address lines become street; region/city/dependentLocality/postalCode/country-code map directly. Browser data lacks localized country/sub-administrative-area values. Full-name formatting is a documented given/family-order subset; phonetic formatting fails featureNotAvailable. Other full Apple subsystem features outside the admitted member list (database writes, change tracking, vCards, contact-property delegates) are not claimed.
- CNKeyDescriptor is Apple's marker protocol; key strings and opaque formatter descriptors are validated privately. Fetch request supports predicate via existing NSEPredicate, keysToFetch, mutableObjects, unifyResults and sortOrder. The unimplemented enumeration stop-pointer uses `{ value: boolean }`; no new Foundation machinery.
- useContacts returns a real per-app CNFXContactStore. Exact unique context/mount signal plus runtime/app identity matches the reviewed Speech pattern; no first/latest selection. Insertion lifetime survives StrictMode effect replay and cancels queued completions at actual unmount. Suspended renders perform no native work. Real branded host context, competing mount signals and ambiguous matching aliases are covered. The unrelated known Network hook gap remains for aggregate acceptance.

### Export mapping (all runtime and type exports)

| Apple | SynCloudOS | Owning file |
|---|---|---|
| `CNContactStore` | `CNFXContactStore` | `src/FX/ContactsFX/CNFXContactStore.ts` |
| `CNContact` | `CNFXContact` | `src/FX/ContactsFX/CNFXContact.ts` |
| `CNMutableContact` | `CNFXMutableContact` | `src/FX/ContactsFX/CNFXMutableContact.ts` |
| `CNContactPickerViewController` | `CNFXContactPickerViewController` | `src/FX/ContactsFX/CNFXContactPickerViewController.ts` |
| `CNLabeledValue` | `CNFXLabeledValue` | `src/FX/ContactsFX/CNFXLabeledValue.ts` |
| `CNPhoneNumber` | `CNFXPhoneNumber` | `src/FX/ContactsFX/CNFXPhoneNumber.ts` |
| `CNPostalAddress` | `CNFXPostalAddress` | `src/FX/ContactsFX/CNFXPostalAddress.ts` |
| `CNContactFormatter` | `CNFXContactFormatter` | `src/FX/ContactsFX/CNFXContactFormatter.ts` |
| `CNContactFetchRequest` | `CNFXContactFetchRequest` | `src/FX/ContactsFX/CNFXContactFetchRequest.ts` |
| `CNError` | `CNFXError` | `src/FX/ContactsFX/CNFXError.ts` |
| `CNAuthorizationStatus` | `CNFXAuthorizationStatus` | `src/FX/ContactsFX/CNFXAuthorizationStatus.ts` |
| `CNEntityType` | `CNFXEntityType` | `src/FX/ContactsFX/CNFXEntityType.ts` |
| `CNContactType` | `CNFXContactType` | `src/FX/ContactsFX/CNFXContactType.ts` |
| `CNContactFormatterStyle` | `CNFXContactFormatterStyle` | `src/FX/ContactsFX/CNFXContactFormatterStyle.ts` |
| `CNContactSortOrder` | `CNFXContactSortOrder` | `src/FX/ContactsFX/CNFXContactSortOrder.ts` |
| `CNContactPickerDelegate` | `CNFXContactPickerDelegate` | `src/FX/ContactsFX/CNFXContactPickerDelegate.ts` |
| `CNKeyDescriptor` | `CNFXKeyDescriptor` | `src/FX/ContactsFX/CNFXKeyDescriptor.ts` |
| `CNContactIdentifierKey` | `CNFXContactIdentifierKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactTypeKey` | `CNFXContactTypeKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactGivenNameKey` | `CNFXContactGivenNameKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactFamilyNameKey` | `CNFXContactFamilyNameKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactOrganizationNameKey` | `CNFXContactOrganizationNameKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactEmailAddressesKey` | `CNFXContactEmailAddressesKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactPhoneNumbersKey` | `CNFXContactPhoneNumbersKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNContactPostalAddressesKey` | `CNFXContactPostalAddressesKey` | `src/FX/ContactsFX/CNFXContactKeys.ts` |
| `CNLabelHome` | `CNFXLabelHome` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelWork` | `CNFXLabelWork` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelOther` | `CNFXLabelOther` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberMobile` | `CNFXLabelPhoneNumberMobile` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberiPhone` | `CNFXLabelPhoneNumberiPhone` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberMain` | `CNFXLabelPhoneNumberMain` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberHomeFax` | `CNFXLabelPhoneNumberHomeFax` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberWorkFax` | `CNFXLabelPhoneNumberWorkFax` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberOtherFax` | `CNFXLabelPhoneNumberOtherFax` | `src/FX/ContactsFX/CNFXLabels.ts` |
| `CNLabelPhoneNumberPager` | `CNFXLabelPhoneNumberPager` | `src/FX/ContactsFX/CNFXLabels.ts` |

### Members and availability

- CNFXContact: identifier, contactType, givenName, familyName, organizationName, emailAddresses, phoneNumbers, postalAddresses, isKeyAvailable, copy and mutableCopy. CNFXMutableContact adds setters for every supported field except identifier. Default empty values are distinguished from unavailable data by isKeyAvailable.
- CNFXContactStore: no-argument constructor; static authorizationStatus(entityType); requestAccess(entityType, completion); unifiedContacts(predicate, keysToFetch); enumerateContacts(fetchRequest, block). Database access is authorizationDenied when refused, otherwise featureNotAvailable. Ended attribution uses CNFXError.communicationError. Invalid entity type uses validationTypeMismatch.
- CNFXContactPickerViewController: no-argument constructor, delegate, displayedPropertyKeys and inherited NSE presentation/disposal. Delegate sender-first methods: contactPickerDidSelectContact, contactPickerDidSelectContacts and contactPickerDidCancel. Plural method determines multi-selection. Async cancellation/failure uses Apple's cancellation delegate when live, with no invented error delegate; revocation/termination drops callbacks.
- CNFXLabeledValue: label, value, identifier, settingLabel, settingValue and settingLabelValue preserve immutable identity. CNFXPhoneNumber: stringValue. CNFXPostalAddress: street, subLocality, city, subAdministrativeArea, state, postalCode, country, isoCountryCode. CNFXContactFormatter: style, static/instance string, descriptorForRequiredKeys. CNFXContactFetchRequest: constructor(keysToFetch), mutable keysToFetch/predicate/mutableObjects/unifyResults/sortOrder. Unsupported key descriptors: unauthorizedKeys. Unsupported phonetic/browser fields: featureNotAvailable. Native failures normalize to the CNErrorDomain error wrapper.

### Removed names and consumer migration

Removed CNFXContactDescriptor, CNFXCapabilities, CNFXContactProperty, CNFXContactRequest, CNFXContactsClient, getCapabilities, getAuthorizationStatus, createContactStore, browser-shaped requestAccess, displayNames, store/request picker constructor and standalone zero-argument picker.present. The inherited NSE `present(controller, animator)` remains legitimate. Deleted mountedContactsClient.ts; replaced it with private mountedContactsPort.ts.

Removed factory reachability from SynWareContextValue, bound/unbound SCOS, inferred browser runtime environment, runtime environment types and testing declaration graphs. Mounted environment registry retains only private service types; context and environment associations are WeakMaps. Browser/test environments privately associate their adapter; test adapters expose deterministic controls without select/native handles. System capability report reads the private association. SDK's existing contacts entry remains stable, now class-based and explicit; all counterpart/developer lookup mappings updated.

Migrated existing adapter, actual runtime authority, hook/StrictMode, mounted SDK, packed six-family and shared-privacy consumers. The old generic Contacts branch in privacy-new-fx tested a nonexistent persistent browser-authorization/dispose contract; its five guarantees are preserved in Contacts-specific flow/UI/adapter tests (passive no-consent, pre-denial, grant/revoke, native denial after saved grant, pending stale suppression). Other families' test branches stay intact. Site source search found no direct Contacts consumers; site adoption/Gallery remain deferred with no shim.

### Test-first and investigation record

- contacts-initial-red.log: 2/2 tests fail for absent class/value surface; implemented values then fixed the independently exposed class import cycle through a private mutable-constructor registry.
- contacts-flow-red.log: missing private Contacts service module plus the still-missing store class; flow test specification preceded service/picker implementation.
- contacts-hook-red.log: 2/2 tests fail on the old factory facade; new real-object/exact-mount hook passes.
- contacts-migration-green.log is an INTERMEDIATE FAILED RUN despite its filename: 32 passed / 2 failed; migrated real-runtime tests still expected Promise rejection whereas native NSE needs synchronous preflight errors. Corrected assertions; contacts-authority-green.log is 2/2 passed.
- contacts-nse-green.log is an INTERMEDIATE FAILED RUN despite its filename: 18 passed / 1 failed. The failing shared-consent regression exposed cross-realm DOMException normalization; structural error access fixed it. Ordinary NSE tests passed throughout. contacts-ui-mapping-green.log: 3/3 passed.
- contacts-plugin-first.log: plugin rejected star exports, so public.ts now uses explicit named re-exports. contacts-plugin-green.log is an INTERMEDIATE FAILED RUN: 0/2 passed because NSE ambient ownership was unavailable after await. The constructor now uses the selected mount's ownerSignal. contacts-plugin-ownership.log: 1/2 passed; native denial fixture used SecurityError, which correctly was not persisted as user refusal. Corrected only the deterministic native-denial mapping. contacts-plugin-final.log: 2/2 passed.
- contacts-boundary-first.log: 2 passed / 1 failed for missing counterpart mappings; added every runtime/type export mapping. Public source types and host boundary checks already passed.
- contacts-empty-red.log: 12 passed / 1 failed because empty selection incorrectly reported limited; empty native results now cancel before Privacy.request can record a grant. contacts-empty-green.log: 13/13 passed. Additional passive/no-consent/pre-denial preservation regression: contacts-privacy-final.log 14/14 passed.

### Pre-freeze verification

- contacts-focused.log: `npx vitest run` with the 24 focused/affected paths printed in that log, **171/171 tests, 24/24 files, exit 0**. Includes API/flow/consent/native presentation, normal NSE presentation, real branded hook/mounted authority, complete counterpart/public source boundaries, attribution/plugin transforms, Dispatch binding, Speech shared-context regressions, browser/host environment and class test host. Subsequent one-test privacy preservation addition passes in contacts-privacy-final.log (14/14 flow).
- contacts-framework-typecheck.log and contacts-site-typecheck.log: exact `npx tsc -b --pretty false` in framework and sibling site, **both exit 0**. No full framework suite.
- contacts-architecture.log and contacts-architecture-narrow.log: `node scripts/quality/architecture-boundaries.mjs`, **1,721 files / 7,828 edges validated**.
- Source Unicode/line-ending audit before SDK freeze restored accidental Windows write_text CRLF to the original LF or new-file LF. Existing pre-family CRLF is retained only in phase5-mounted.test.tsx and checked with a scoped cr-at-eol rule; all remaining owned files use the default whitespace check. UTF-8 strictly decoded, no CRCRLF or mojibake copyright sequence; staged bytes must equal worktree bytes. A transient Windows file-open failure during this local normalization succeeded on immediate isolated retry; no test/compiler failure remains unresolved.
- Last C: free space: 274,264,899,584 bytes (above 20 GB).

### Exhaustive owned inventory

The following 65 implementation/documentation/test paths are the complete family delta; this evidence file is additional. Existing unrelated PLAN/REPORT and untracked evidence are excluded.

- `docs/framework/appkit-counterparts.json`
- `docs/framework/authorization.md`
- `docs/framework/fx/README.md`
- `docs/framework/fx/contacts.md`
- `scripts/quality/architecture-boundaries.json`
- `src/FX/ContactsFX/CNFXAuthorizationStatus.ts`
- `src/FX/ContactsFX/CNFXContact.ts`
- `src/FX/ContactsFX/CNFXContactFetchRequest.ts`
- `src/FX/ContactsFX/CNFXContactFormatter.ts`
- `src/FX/ContactsFX/CNFXContactFormatterStyle.ts`
- `src/FX/ContactsFX/CNFXContactKeys.ts`
- `src/FX/ContactsFX/CNFXContactPickerDelegate.ts`
- `src/FX/ContactsFX/CNFXContactPickerViewController.ts`
- `src/FX/ContactsFX/CNFXContactSortOrder.ts`
- `src/FX/ContactsFX/CNFXContactStore.ts`
- `src/FX/ContactsFX/CNFXContactType.ts`
- `src/FX/ContactsFX/CNFXEntityType.ts`
- `src/FX/ContactsFX/CNFXError.ts`
- `src/FX/ContactsFX/CNFXKeyDescriptor.ts`
- `src/FX/ContactsFX/CNFXLabeledValue.ts`
- `src/FX/ContactsFX/CNFXLabels.ts`
- `src/FX/ContactsFX/CNFXMutableContact.ts`
- `src/FX/ContactsFX/CNFXPhoneNumber.ts`
- `src/FX/ContactsFX/CNFXPostalAddress.ts`
- `src/FX/ContactsFX/internal/contactValues.ts`
- `src/FX/ContactsFX/internal/contactsPort.ts`
- `src/FX/ContactsFX/internal/contactsSessionBindings.ts`
- `src/FX/ContactsFX/internal/keyDescriptors.ts`
- `src/FX/ContactsFX/public.ts`
- `src/NSE/Application/NSEViewController.ts`
- `src/NSE/Application/nativePresentation.ts`
- `src/NSE/applicationHostInterop.ts`
- `src/SynCloudOS/AppHosting/applicationHosting.tsx`
- `src/SynCloudOS/AppSDK/appContextTypes.ts`
- `src/SynCloudOS/AppSDK/appRuntimeFacade.ts`
- `src/SynCloudOS/AppSDK/createSynWareContextValue.ts`
- `src/SynCloudOS/AppSDK/hooks/useContacts.ts`
- `src/SynCloudOS/AppSDK/mountedContactsClient.ts`
- `src/SynCloudOS/AppSDK/mountedContactsPort.ts`
- `src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts`
- `src/SynCloudOS/AppSDK/scos/scosFacade.ts`
- `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`
- `src/SynCloudOS/AppSDK/testing/testHostTypes.ts`
- `src/SynCloudOS/InstalledApplications/capabilityReport.ts`
- `src/SynCloudOS/PlatformAdapters/BrowserContactsAdapter.ts`
- `src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts`
- `src/SynCloudOS/Runtime/runtimeInstanceTypes.ts`
- `tests/fixtures/contacts-attribution/consumer.test.tsx`
- `tests/fixtures/contacts-attribution/public-types.ts`
- `tests/fixtures/contacts-attribution/src/SynWare/First.app/Contents/Info.ts`
- `tests/fixtures/contacts-attribution/src/SynWare/First.app/Contents/index.tsx`
- `tests/fixtures/contacts-attribution/vitest.config.mjs`
- `tests/runtime/fx/contacts-apple.test.ts`
- `tests/runtime/fx/contacts-counterparts.test.ts`
- `tests/runtime/fx/contacts-flow.test.ts`
- `tests/runtime/fx/contacts-host-boundary.test.ts`
- `tests/runtime/fx/contacts-packed.test.ts`
- `tests/runtime/fx/contacts-presentation.test.tsx`
- `tests/runtime/fx/contacts-public-types.test.ts`
- `tests/runtime/fx/phase5-contacts.test.ts`
- `tests/runtime/fx/phase5-mounted.test.tsx`
- `tests/runtime/fx/phase5-packed.test.ts`
- `tests/runtime/fx/phase5-real-authority.test.ts`
- `tests/runtime/fx/phase5-speech-contacts-hooks.test.tsx`
- `tests/runtime/privacy-new-fx.test.ts`

### Initial frozen SDK acceptance (superseded by review correction)

- `npm run sdk:build` → contacts-sdk-build.log: **exit 0**, the single staged/frozen SDK rebuild. Source fingerprint assertion passed. The build reports the existing runtime/browser circular-chunk warnings; actual installed entry/runtime execution below passes. No implementation, shipped documentation or build-input bytes changed after freeze.
- `npx vitest run tests/runtime/fx/contacts-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → contacts-packed.log: **3/3 tests, 3/3 files, exit 0**. The Contacts proof contains **2/2 nested actual installed plugin `.app` tests**, constructing after await/timer/callback, selecting real class values through NSE presentation, refusing database authorization, exercising saved-consent native denial, policy revoke/regrant replacement and teardown.
- The independent consumer is npm-installed outside the repository with no link back to source. Vite production build and import tests pass; exactly one shared attribution-runtime module is present. The actual Contacts entry has all 33 runtime exports; hidden ports, factories, attribution markers, native presentation association and private package routes are absent/blocked.
- Strict installed `public-types.ts` passes with skipLibCheck:false. The declaration graphs from root, `/sdk`, `/sdk/testing`, `/browser`, and `/fx/contacts` each contain **zero Contacts internal modules**. Direct class declarations contain no private ports, attribution metadata, old clients, browser options, request signals or invented promises.
- Installed resource hashes remain identical after app behavior, production build/import, type and declaration-graph proof. contacts-installed.json records the result. A subsequent `node scripts/synware/installed-consumer.mjs --verify` → contacts-frozen-verification.json reports currentSourceMatches true (that command verifies identity only; behavioral acceptance is the installed test above).
- Archive SHA-256: `f75ce77d1622578b157381ed76aa0b3e2b0cf0664e676f838918c2bd07a42bd8`.
- Source SHA-256: `fdfbe256f21a434c25e545d49e62adcdfdbe59db6f2e5d7f256f287859123f65`.
- Resources SHA-256: `fe069bcfc6b9fefd0b67e9da52b0cc9d36186c9ba21b28d83339bf3b011f017f`.
- C: free after independent installations: 273,969,455,104 bytes. Physical-device/native-dialog acceptance, complete locale-specific name formatting, final site SDK adoption/Gallery and aggregate full-suite acceptance remain deferred as scoped.
- Browser contacts retain CNContact's default person contactType; the web picker provides no authoritative organization/person classification. This is a default value, not inferred native contact metadata. Mutable local contacts can explicitly select organization. No device database identity or full native classification is claimed.

Commit uses one explicit-path `FX:` commit titled **FX: rebuild ContactsFX with attributed contacts and NSE picker**. Exact SHA is recorded after commit in contacts-commit.txt and returned to root, avoiding a self-referential hash.


### Review correction: picker observer cleanup and store-only revocation

Scoped review of initial commit `44bf3a081f412943c75044ee02648e09b7bcd97b` found two Important bugs (contacts-review-findings.md). The picker constructor and presentation each registered a session-end callback, overwriting the first disposer. Ordinary selection/cancellation/dismissal therefore left one callback retaining the picker and its delegate until app end. Separately, store-only requestAccess queued a completion without registering the mounted port's privacy generation invalidation; revoke/regrant before the first picker, or after a prior resource was revoked, could deliver that stale completion.

The picker now owns exactly the constructor's session-end registration. Presentation does not replace it. Disposal invokes and clears both the session and access disposers. Regression cases complete selection, cancel selection and dismiss a pending picker, then unregister the still-live app session: none can invoke the disposed picker again. The real plugin fixture additionally observes successfully completed pickers through actual host teardown and proves they receive no further disposal callback.

The private ContactsPort now has bindAccessLifetime(generation), which asserts captured authority and binds the existing shared privacy lifetime lease. CNContactStore.requestAccess uses this path before queueing its unavailable-database completion. It does not call Privacy.request/requestAuthorization, ask for consent, open a native picker, mark consent granted, or add public members. A later privacy revocation invalidates the captured generation even when no picker has ever existed. After a prior revocation, a fresh store reacquires the observation lease independently of native selection. Old completions remain invalid after regrant while a newly created store can deliver its own featureNotAvailable completion. The observation retains only the mounted port, not a queued store callback; the existing app signal releases it at teardown.

Correction inventory (7 existing owned paths; public API/NSE integration unchanged):

- src/FX/ContactsFX/CNFXContactPickerViewController.ts
- src/FX/ContactsFX/CNFXContactStore.ts
- src/FX/ContactsFX/internal/contactsPort.ts
- src/SynCloudOS/AppSDK/mountedContactsPort.ts
- tests/runtime/fx/contacts-flow.test.ts
- tests/fixtures/contacts-attribution/consumer.test.tsx
- docs/superpowers/evidence/2026-11-08-fx-fidelity/contacts-evidence.md

Verification before the correction freeze:

- `npx vitest run tests/runtime/fx/contacts-flow.test.ts` → contacts-review-red.log: **5 failed / 14 passed**. Three failures observe leaked post-disposal session callbacks; two observe stale store-only completions after revoke/regrant (fresh app and previously revoked picker resource).
- `npx vitest run tests/runtime/fx/contacts-flow.test.ts tests/runtime/fx/contacts-presentation.test.tsx tests/runtime/fx/phase5-speech-contacts-hooks.test.tsx` → contacts-review-covering.log: **23/23 passed in 3/3 files**. Native presentation, consent sequencing and real-object StrictMode/unmount remain covered.
- Full required 24-file focused command printed in contacts-review-focused.log: **177/177 tests, 24/24 files, exit 0**. This is the original focused group with the complete passive pre-denial and five review regressions now included, preserving normal NSE presentation and the other reviewed-family context/binding checks.
- `npx vitest run --config tests/fixtures/contacts-attribution/vitest.config.mjs` → contacts-review-plugin.log: **2/2 passed**, including the added actual host-teardown disposal observation.
- `npx tsc -b --pretty false` in framework and sibling site → contacts-review-framework-typecheck.log / contacts-review-site-typecheck.log: **both exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` → contacts-review-architecture.log: **1,721 files / 7,828 edges validated**.
- All correction files preserve explicit UTF-8 and LF, with default whitespace checking. The whole intended amended family diff retains its single pre-existing CRLF exception in phase5-mounted.test.tsx, checked only with scoped cr-at-eol. Exact staged/worktree byte comparison precedes the single correction SDK rebuild. No other family or root PLAN/REPORT is staged.
- The SDK's existing Rollup circular-chunk/execution-order warnings remain recorded for aggregate triage. They are not fixed by this scope and build logs are not claimed pristine.

#### Correction frozen acceptance

- `npm run sdk:build` → contacts-review-sdk-build.log: **exit 0**, one correction rebuild after staging/freezing. Existing Rollup warnings remain visible; no source/shipped-documentation/build-input changes followed the correction freeze.
- `npx vitest run tests/runtime/fx/contacts-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → contacts-review-packed.log: **3/3 tests in 3/3 files, exit 0**. This repeats the independent installed actual-entry proof, including **2/2 nested real plugin `.app` flow tests** with the new completed-picker disposal observation at actual host teardown.
- Strict installed public types, production bundle/import behavior, all 33 runtime exports, blocked private paths, one shared attribution-runtime module and resource integrity all pass again. Actual declaration graphs from root, `/sdk`, `/sdk/testing`, `/browser`, and `/fx/contacts` again reach **zero Contacts internal modules**. The Contacts declaration entry hash is unchanged: `db78581e8a77b072621fe0fe389b3ba508616c39b14c1a851d564027211b0177`.
- `node scripts/synware/installed-consumer.mjs --verify` → contacts-review-frozen-verification.json: **currentSourceMatches true** after the installed checks. Behavioral acceptance is recorded separately by the installed test; the verifier checks immutable identity.
- Corrected archive SHA-256: `0098af7d67e7384ebe98e5d4963d4f6afb563a5e2cb86bca716578ebcdb35577`.
- Corrected source SHA-256: `230f7a3043649a973ba5e29989edf5c53490b19df46b93bb1e066889eed881cb`.
- Corrected resources SHA-256: `5c22c3eebe977b16b35ab4287e936f3def0860bd4cbd7e9acd0cf25587e929a4`.
- contacts-review-installed.json and contacts-installed.json identify this corrected archive; the initial hashes earlier in this report are superseded. All seven corrected paths are again checked for exact index/worktree bytes, explicit UTF-8, LF and default whitespace before amendment. The complete amended family diff passes the existing narrowly scoped CRLF check for phase5-mounted.test.tsx.
- C: free after reproof: 274,118,037,504 bytes. Site remains unchanged on its previous installed SDK. No full suite, other family, new public/native UI route or bundler refactor was introduced.
- The initial own Contacts commit 44bf3a0 is amended with only these seven paths. The new SHA is written to contacts-commit.txt and contacts-review-commit.txt after amendment and returned for scoped independent re-review. Root PLAN/REPORT remain unstaged.

## PassFX fidelity rebuild evidence

Commit: 62fd7af65d5ffdd397959937b9ae8c6884b75c56 — FX: rebuild PassFX with attributed PassKit payment objects.

Independent scoped re-review: spec compliance PASS, task quality approved, no remaining Critical/Important findings. Existing SDK warning remains aggregate debt. Current checks: 191 focused tests / 23 files, covering 44/44, source compiled app 3/3, installed checks 3/3 with nested app 3/3, both typechecks and architecture 1,742 / 7,914.

Base: `b0861c5d9ef44448bc3cc8d8d833e205b159a7d2` on framework `fix/blind-rewrite-friction`. Sibling site remains `prerelease` with its old installed SDK. Scope: approved PassKit member subset only, with the genuine Foundation name-component and payment-method-type dependencies. Root owns PLAN/REPORT; no other family implementation, Fusion, server, branch, worktree or preview configuration changed.

### Decisions and Apple authority

Consulted Apple primary documentation on 2026-11-08: [controller](https://developer.apple.com/documentation/passkit/pkpaymentauthorizationcontroller), [request](https://developer.apple.com/documentation/passkit/pkpaymentrequest), [summary item](https://developer.apple.com/documentation/passkit/pkpaymentsummaryitem), [delegate](https://developer.apple.com/documentation/passkit/pkpaymentauthorizationcontrollerdelegate), [payment](https://developer.apple.com/documentation/passkit/pkpayment), [token](https://developer.apple.com/documentation/passkit/pkpaymenttoken), [method](https://developer.apple.com/documentation/passkit/pkpaymentmethod), [method type](https://developer.apple.com/documentation/passkit/pkpaymentmethodtype), [contact](https://developer.apple.com/documentation/passkit/pkcontact), [result](https://developer.apple.com/documentation/passkit/pkpaymentauthorizationresult), [status](https://developer.apple.com/documentation/passkit/pkpaymentauthorizationstatus), [network](https://developer.apple.com/documentation/passkit/pkpaymentnetwork), [merchant capability](https://developer.apple.com/documentation/passkit/pkmerchantcapability), [contact field](https://developer.apple.com/documentation/passkit/pkcontactfield), [shipping method](https://developer.apple.com/documentation/passkit/pkshippingmethod), [PKPassKitError.Code](https://developer.apple.com/documentation/passkit/pkpasskiterror/code), [NSPersonNameComponents](https://developer.apple.com/documentation/foundation/nspersonnamecomponents), and [merchant validation](https://developer.apple.com/documentation/applepayontheweb/providing-merchant-validation). Apple Markdown endpoints were fetched directly after the web connector could not consume text/markdown.

Apple Pay on the Web requires a merchant-validation event, a merchant-server request to Apple's validation URL, and a single-use merchant session passed back to the native session. Those values cannot be inferred from the approved request/two-delegate subset. Root explicitly approved the faithful unsupported production branch: BrowserPaymentAdapter always returns false from network/general availability and fails presentation, rather than inventing gateway options or silently claiming Apple Pay support. Its insecure-context SecurityError is classified as native denial before conversion into PKFXError. Complete positive payment flow is a deterministic private-port proof, never a real financial transaction.

The owner-approved exclusion remains: PKFXPaymentButton, PKFXPaymentButtonType and PKFXPaymentButtonStyle await artwork. No control, artwork, custom sheet, Wallet/pass subsystem, merchant-session update delegate, recurring-payment subsystem, native merchant configuration or browser gateway API was added.

Foundation had NSEData and NSEDecimalNumber but no person-name component value. Root authorized the small genuine NSEPersonNameComponents counterpart, exported through Foundation and mapped in developer lookup. Contacts' existing CNFXPhoneNumber/CNFXPostalAddress/CNFXContact are reused. No guessed split of display names occurs. PKFXPaymentMethodType is the actual type required by PKPaymentMethod.type.

### Complete Apple -> public member -> file mapping

All Pass public files live under `src/FX/PassFX/`; each named export is in its own same-named `.ts` file. `public.ts` contains only re-exports. Runtime/type exports are exhaustively checked by TypeScript symbol inspection and developer-MCP counterpart lookup: 16 runtime exports and one delegate interface. Every enum/option value also has its matching type export. Foundation dependency lives in `src/Foundation/NSEPersonNameComponents.ts`.

| Apple | Ours/file | Members | Support/error mapping |
|---|---|---|---|
| PKPaymentRequest | PKFXPaymentRequest | merchantIdentifier, countryCode, currencyCode, supportedNetworks, merchantCapabilities, paymentSummaryItems, requiredBillingContactFields, requiredShippingContactFields, shippingMethods, applicationData | Mutable request values copied at controller construction; invalid values fail invalidDataError. |
| PKPaymentSummaryItem | PKFXPaymentSummaryItem | init(label, amount, type=final); label, amount: NSEDecimalNumber, type | Exact Foundation decimal retained and validated via decimal toString, never Number. |
| PKPaymentSummaryItemType | PKFXPaymentSummaryItemType | final, pending | Runtime constants and type union. |
| PKPaymentNetwork | PKFXPaymentNetwork | Current documented network constants, including visa/masterCard/amex | Runtime constants/type union; existence makes no capability claim. |
| PKMerchantCapability | PKFXMerchantCapability | threeDSecure, emv, credit, debit, instantFundsOut | Option bits; no gateway configuration. |
| PKContactField | PKFXContactField | emailAddress, name, phoneNumber, phoneticName, postalAddress | Runtime constants/type union; request uses ReadonlySet. |
| PKShippingMethod | PKFXShippingMethod | inherits summary item; identifier, detail | No unrelated delivery-date subsystem added. |
| PKPaymentAuthorizationController | PKFXPaymentAuthorizationController | init(paymentRequest), static canMakePayments()/canMakePayments(usingNetworks), delegate, present(completion), dismiss(completion) | Real attributed class; selected-session main queue; production availability false/presentation unknownError; entitled capable-port flow proven. |
| PKPaymentAuthorizationControllerDelegate | PKFXPaymentAuthorizationControllerDelegate | paymentAuthorizationControllerDidAuthorizePayment(controller,payment,handler), paymentAuthorizationControllerDidFinish(controller) | Interface; sender first; handler takes PKFXPaymentAuthorizationResult and single-use result snapshot. |
| PKPayment | PKFXPayment | token, billingContact, shippingContact, shippingMethod | System-supplied read-only properties; no complete/details/methodName/payer fields. |
| PKPaymentToken | PKFXPaymentToken | paymentMethod, transactionIdentifier, paymentData: NSEData | Read-only immutable Foundation token data; no SPC/browser credential projection. |
| PKPaymentMethod | PKFXPaymentMethod | displayName, network, type, billingAddress: CNFXContact\|null | Read-only system attributes; Wallet pass subsystem excluded. |
| PKPaymentMethodType | PKFXPaymentMethodType | unknown, debit, credit, prepaid, store, eMoney | Small genuine enum dependency required by PKPaymentMethod.type. |
| PKContact | PKFXContact | emailAddress, name, phoneNumber, postalAddress, supplementarySubLocality | Reuses CNFXPhoneNumber/CNFXPostalAddress; name uses Foundation counterpart. |
| PKPaymentAuthorizationResult | PKFXPaymentAuthorizationResult | init(status, errors), status, errors | Handler value copied at invocation before queued delivery. |
| PKPaymentAuthorizationStatus | PKFXPaymentAuthorizationStatus | success, failure, invalidBillingPostalAddress, invalidShippingPostalAddress, invalidShippingContact, pinRequired, pinIncorrect, pinLockout | Apple status cases; this is payment-result status, never privacy authorization. |
| PKPassKitError | PKFXError | domain PKPassKitErrorDomain; code/message | unknownError, invalidDataError, unsupportedVersionError, invalidSignature, notEntitledError; actual Apple error counterpart rather than nonexistent PKError. |
| NSPersonNameComponents | NSEPersonNameComponents | namePrefix, givenName, middleName, familyName, nameSuffix, nickname, phoneticRepresentation, copy() | One Foundation class with nullable explicit components and value copy; no formatter, parser or other subsystem. |

### Runtime authority and lifecycle

Option A uses the committed fxRuntimeContracts binding/attribution helpers, selected-session DispatchFX main queue, and private WeakMap port associations. No FX file directly imports AppSDK or PlatformAdapters. Binding/import does not resolve sessions; controller construction resolves once and pins the chosen session. Missing/ended/ambiguous sessions use PKFXError; unbound base construction keeps the plugin/application-bundle message. No public computed-symbol member leaks attribution into declarations.

The launch payment.request entitlement and host authorization remain mandatory. Existing shared native-denial and resource lifetime tracking are preserved without a public privacy enum or consent method. Native NotAllowedError is recorded by the shared store before error normalization, including over saved grant. A captured generation remains invalid after revoke/regrant, policy/entitlement restoration and replacement presentation. Native response release is scoped to its old sheet: unfinished/late responses finish with failure once, and the replacement sheet remains live.

The native port opens synchronously before any main-queue hop when the existing shared host gate permits it; any existing host consent prompt still follows the shared gate's async contract. present completion, authorized-payment delegate, later merchant handler work, finish delegate and dismiss completion are selected-session queue work with delivery checks. The merchant result is copied when the handler is called. A handler can be used once. Dismiss is terminal. Registry removal and signal abortion both end resources. The controller installs session/access observers once on first work and releases them exactly once; idle/abandoned hook renders install no native resource subscriptions. Queue-only idle dismissal binds the privacy generation before enqueueing, so pre-native revocation also drops it.

usePayment(request) returns an actual attributed controller and uses the existing insertion-effect ownership pattern. StrictMode effect setup/cleanup replay does not terminate the retained object, true unmount does. Hook selection matches the actual context or its branding clone by shared lifetime signal and runtime ID, demands exactly one matching session, and rejects duplicate configured-runtime-ID aliases.

### Removed APIs and every migrated consumer

Removed public names: PKFXAuthorizationStatus, PKFXPaymentCompletion, PKFXPaymentData, PKFXPaymentValue, PKFXCapabilities, PKFXPaymentMethodData, PKFXPaymentRequestDescriptor, PKFXPaymentClient. Removed browser members: request descriptor constructor, string amount/pending flag, paymentMethodData/supportedMethods, requestPayerName/requestPayerEmail/requestPayerPhone, requestId/methodName/details/payerName/payerEmail/payerPhone, payment.complete, controller getAuthorizationStatus/canMakePayments instance/promise present/dispose, client getCapabilities/createAuthorizationController, SCOS.payment, SynWareContextValue.payment and RuntimeEnvironment.payment. No aliases remain.

- public.ts moved all true classes/protocols/enums into individual files; old internal/paymentData.ts and AppSDK/mountedPaymentClient.ts deleted.
- appRuntimeFacade, mountedEnvironmentClientRegistry, createSynWareContextValue and runtime/context types now use private adapter/environment/context associations. scosFacade removes both bound and unbound factories. BrowserRuntimeEnvironment associates its private unsupported adapter; InstalledApplications/capabilityReport now reports the genuine passive boolean query.
- usePayment now takes a request and returns the real controller. phase5-mounted and phase5-packed migrated accordingly.
- fakeAdapters/testHostTypes expose payment state controls, never a native open/client. The actual `.app` fixture proves allowed native-port presentation, real typed payment graph, handler/result completion, live policy loss, teardown, and native denial.
- The old phase5 payment hook test is replaced by pass-hook: StrictMode plus true unmount, native response failure, suspended render, branding clone, exact session ambiguity. phase5-payment now verifies explicit unsupported/insecure browser paths. Old gateway/SPC descriptor and WebAuthn credential tests represent removed browser-only behavior and are retired, not shimmed.
- payment's old generic privacy-new-fx probe is moved to the Apple controller flow: passive inspection, predenial, missing entitlement/host policy, saved-grant native denial, revocation/regrant, live/late release and replacement lifetime are covered in pass-flow and the real `.app` consumer. The other family probes remain unchanged.
- docs/framework/fx/pass.md, fx/README.md, authorization.md and synware-manifest.md remove incorrect client/privacy claims and document the supported subset and browser failure. appkit-counterparts.json and developer lookup cover every public export; SDK fx/pass entry already points at public.ts and remains correct.
- Repository/site source scans found no current site PKFX/usePayment caller to edit. The sibling site's installed SDK intentionally stays old until final adoption/Gallery work. That final gate must consume this new request/controller/hook surface with explicit production unavailability and no compatibility shim. No site files changed here.

### TDD and verification before SDK freeze

- pass-initial-red.log: four expected failures for absent classes/value types.
- pass-flow-red.log: new private runtime route not implemented yet; after implementation pass-core-green.log: 17/17.
- pass-hook-boundary-red.log: three expected real-object/exact-session/private-environment failures. pass-hook-boundary-green.log: 20/20 across core/hook/boundary.
- pass-counterparts-red.log: expected missing mapping; source migration group later 19/19.
- pass-handler-red.log: later merchant handler incorrectly executed immediately; also the first observer-count probe included Dispatch's own main-queue observer. The probe was narrowed to the controller observer installed before first queue creation. pass-handler-green.log: 17/17 with native handler execution on selected main queue and exact controller-owned observer release.
- pass-result-red.log: mutation of a handler result before queue delivery changed authorization; snapshot fix gives pass-result-green.log: 18/18.
- Final focused command is printed in pass-focused.log: `npx vitest run` over 23 named Pass/affected privacy, attribution, Dispatch, runtime environment, test-host, Foundation decimal and prior Contacts/Speech files. **183/183 tests in 23/23 files, exit 0.** No full framework suite.
- `npx vitest run --config tests/fixtures/pass-attribution/vitest.config.mjs` -> pass-plugin.log: **2/2, exit 0**, native await/timer/callback plugin flow through the existing class test host.
- `npx tsc -b --pretty false` in framework -> pass-framework-typecheck.log: **exit 0**.
- Same command in sibling site -> pass-site-typecheck.log: **exit 0**, current installed SDK untouched.
- `node scripts/quality/architecture-boundaries.mjs` -> pass-architecture.log: **1,742 files / 7,914 edges validated, exit 0**.
- UTF-8/format audit -> pass-format-audit.json: all owned files decoded strictly, no BOM, replacement characters or copyright mojibake. Existing LF files stay LF; existing pass.md and phase5-mounted.test.tsx retain their original CRLF. New source/tests/fixtures are LF. Default whitespace checks apply to all other paths; only these two proven legacy CRLF paths use the narrowly scoped cr-at-eol check. No global whitespace setting is changed.
- C: remained above 274 GB free, exceeding the 20 GB floor.

### Exhaustive file inventory

The following explicit paths are the complete family commit scope (A=new, M=modified, D=deleted). `pass-owned-paths.json` is the machine-readable staging list. Parent PLAN/REPORT and all unrelated artifacts remain unstaged.

- M `docs/framework/appkit-counterparts.json`
- M `docs/framework/authorization.md`
- M `docs/framework/fx/README.md`
- M `docs/framework/fx/pass.md`
- M `docs/framework/synware-manifest.md`
- A `docs/superpowers/evidence/2026-11-08-fx-fidelity/pass-evidence.md`
- M `scripts/quality/architecture-boundaries.json`
- A `src/FX/PassFX/PKFXContact.ts`
- A `src/FX/PassFX/PKFXContactField.ts`
- A `src/FX/PassFX/PKFXError.ts`
- A `src/FX/PassFX/PKFXMerchantCapability.ts`
- A `src/FX/PassFX/PKFXPayment.ts`
- A `src/FX/PassFX/PKFXPaymentAuthorizationController.ts`
- A `src/FX/PassFX/PKFXPaymentAuthorizationControllerDelegate.ts`
- A `src/FX/PassFX/PKFXPaymentAuthorizationResult.ts`
- A `src/FX/PassFX/PKFXPaymentAuthorizationStatus.ts`
- A `src/FX/PassFX/PKFXPaymentMethod.ts`
- A `src/FX/PassFX/PKFXPaymentMethodType.ts`
- A `src/FX/PassFX/PKFXPaymentNetwork.ts`
- A `src/FX/PassFX/PKFXPaymentRequest.ts`
- A `src/FX/PassFX/PKFXPaymentSummaryItem.ts`
- A `src/FX/PassFX/PKFXPaymentSummaryItemType.ts`
- A `src/FX/PassFX/PKFXPaymentToken.ts`
- A `src/FX/PassFX/PKFXShippingMethod.ts`
- D `src/FX/PassFX/internal/paymentData.ts`
- A `src/FX/PassFX/internal/paymentPort.ts`
- A `src/FX/PassFX/internal/paymentRequestSnapshot.ts`
- A `src/FX/PassFX/internal/paymentSessionBindings.ts`
- A `src/FX/PassFX/internal/paymentValues.ts`
- M `src/FX/PassFX/public.ts`
- A `src/Foundation/NSEPersonNameComponents.ts`
- M `src/Foundation/public.ts`
- M `src/SynCloudOS/AppSDK/appContextTypes.ts`
- M `src/SynCloudOS/AppSDK/appRuntimeFacade.ts`
- M `src/SynCloudOS/AppSDK/createSynWareContextValue.ts`
- M `src/SynCloudOS/AppSDK/hooks/usePayment.ts`
- M `src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts`
- D `src/SynCloudOS/AppSDK/mountedPaymentClient.ts`
- A `src/SynCloudOS/AppSDK/mountedPaymentPort.ts`
- M `src/SynCloudOS/AppSDK/scos/scosFacade.ts`
- M `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`
- M `src/SynCloudOS/AppSDK/testing/testHostTypes.ts`
- M `src/SynCloudOS/InstalledApplications/capabilityReport.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserPaymentAdapter.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts`
- M `src/SynCloudOS/Runtime/runtimeInstanceTypes.ts`
- A `tests/fixtures/pass-attribution/consumer.test.tsx`
- A `tests/fixtures/pass-attribution/public-types.ts`
- A `tests/fixtures/pass-attribution/src/SynWare/First.app/Contents/Info.ts`
- A `tests/fixtures/pass-attribution/src/SynWare/First.app/Contents/index.tsx`
- A `tests/fixtures/pass-attribution/vitest.config.mjs`
- A `tests/runtime/fx/pass-apple.test.ts`
- A `tests/runtime/fx/pass-counterparts.test.ts`
- A `tests/runtime/fx/pass-flow.test.ts`
- A `tests/runtime/fx/pass-hook.test.tsx`
- A `tests/runtime/fx/pass-host-boundary.test.ts`
- A `tests/runtime/fx/pass-packed.test.ts`
- A `tests/runtime/fx/pass-public-types.test.ts`
- M `tests/runtime/fx/phase5-mounted.test.tsx`
- M `tests/runtime/fx/phase5-packed.test.ts`
- D `tests/runtime/fx/phase5-payment-hook.test.tsx`
- M `tests/runtime/fx/phase5-payment.test.ts`
- M `tests/runtime/privacy-new-fx.test.ts`

### Frozen SDK and commit record

All source, shipped documentation, tests and fixture bytes are finalized before explicit staging and the single SDK build. The immutable actual-entry installed proof must run `pass-packed.test.ts`, `phase5-packed.test.ts` and `packed-fx.test.ts`; it installs outside the repository, executes the real compiled `.app` flows, checks strict public types, checks one attribution runtime instance, rejects source links/private subpaths, traverses root/sdk/testing/browser/fx-pass declaration graphs for any Pass internal module, and verifies installed resource integrity. Exact result, archive/source/resource hashes and the final commit are appended here after those gates; machine receipts are pass-installed.json, pass-frozen-verification.json and pass-commit.txt.


#### Final frozen proof (completed)

- Single `npm run sdk:build` -> pass-sdk-build.log: **exit 0**. Existing Rollup circular chunk warning `browser -> syncloudos-runtime -> browser` remains an aggregate ledger item; no unrelated refactor. No implementation/shipped-documentation/build-input bytes changed after the freeze.
- `npx vitest run tests/runtime/fx/pass-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` -> pass-packed.log: **3/3 tests in 3/3 files, exit 0**. Pass's installed actual-entry specimen additionally runs **2/2 nested real plugin .app flow tests**. It proves both production bundle/import behavior and strict installed TypeScript, all 16 runtime exports, the Foundation name-component copy, real payment/token/method/contact/NSEData values, blocked private subpaths and one shared attribution runtime module.
- Actual declaration graph traversal from package root, `/sdk`, `/sdk/testing`, `/browser` and `/fx/pass` reaches **zero PassFX internal modules in every graph**. Direct emitted public declarations contain no private ports, browser descriptors, legacy factories, attribution symbols or host/runtime imports. Installed resource bytes remain intact after all proof work.
- `node scripts/synware/installed-consumer.mjs --verify` -> pass-frozen-verification.json: **currentSourceMatches true**, separately from the installed behavioral proof. Post-commit verification is written to pass-postcommit-verification.json.
- Archive SHA-256: `d353ce812db6392513450db8763749079fbdd371d41921071cacb240ef80e0bd`.
- Frozen source SHA-256: `a261a449e6edbcfe3c64ca12efcdf2ee38aad361efac40ea5705d4af28b4e96a`.
- Installed resources SHA-256: `6ec3aeabe575156269997039a60ced1895e885a3c9f2f947410a116ed149051e`.
- Pass JS entry SHA-256: `40a79117b17228aa21776c9ca3645ff172e4810e8b8374ecb4d2bbe48181a62a`.
- Pass declaration entry SHA-256: `c6fca9c197a7bdfbd39a9b3cd328e9065568ea5e265689110bda4a4a1594902e`.
- Explicit staging covered exactly **63 owned paths**, preserving root PLAN/REPORT and unrelated files. Default nonlegacy and scoped legacy-CRLF staged checks pass; index/worktree bytes match (pass-staged-checks.json).

The single explicit-path family commit is titled **FX: rebuild PassFX with attributed PassKit payment objects**. Its exact SHA is written immediately afterward to pass-commit.txt and returned to root, avoiding a self-referential hash inside committed evidence. Site adoption/Gallery and physical/native payment acceptance remain deferred; the production transport explicitly remains unavailable, and payment button/type/style remain excluded.


### Review correction: native completion denial

Review of initial commit `3126f575b7b09aa94c4fa001cbbf2e25e58799b7` found one Important issue (pass-review-findings.md): the native response completion boundary converted rejection into PKFXError before recording native denial. An existing shared grant could therefore continue to authorize availability and another presentation. A synchronous native completion throw bypassed error conversion as well.

The completion boundary now awaits native finish in a try/catch, classifies NotAllowedError/SecurityError while its captured generation and operation signal are still current, records authoritative shared browser denial, and only then converts to PKFXError. Shared local choice deliberately remains granted; browserStatus/authorizationStatus become denied, matching the existing privacy observation contract. That observation immediately invalidates resource generations and callbacks. Changing the saved local choice back to granted does not override native denial. Completion's successful awaited return also rechecks access and its operation signal.

A completion from an already dismissed, revoked, unmounted or ended operation cannot change shared state or release a replacement sheet. The current generation and operation signal must both match before recording a new native observation. Ended operations still fail with PKFXError and their queued callbacks remain suppressed. A native response is completed only once even when completion denial triggers revocation/cleanup.

Correction ownership is limited to these six original family paths:

- `src/SynCloudOS/AppSDK/mountedPaymentPort.ts`: classified synchronous and asynchronous completion errors with the captured-lifetime guard.
- `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`: existing payment deny control can also deny native completion; no public test or Apple API was added.
- `tests/runtime/fx/pass-flow.test.ts`: eight regressions covering both raw denial names, saved grant/shared availability/generation, queued idle-dismiss/finish callbacks, synchronous conversion, and delayed denial after dismissal or revoke/regrant while a replacement completes successfully.
- `tests/fixtures/pass-attribution/consumer.test.tsx`: actual plugin app runs both presentation-denial and completion-denial flows; the native control is restored afterward to prove the shared denial is authoritative.
- `tests/runtime/fx/pass-packed.test.ts`: requires all three actual installed app scenarios and records that count.
- This evidence file.

Correction TDD and pre-freeze validation:

- `npx vitest run tests/runtime/fx/pass-flow.test.ts` -> pass-review-red.log: **4 failed / 22 passed**, reproducing the two missing shared-denial cases and two raw synchronous exceptions. All four replacement-isolation cases already pass and constrain the correction.
- `npx vitest run tests/runtime/fx/pass-flow.test.ts tests/runtime/fx/pass-hook.test.tsx tests/runtime/fx/phase5-payment.test.ts tests/runtime/privacy-store.test.ts` -> pass-review-covering.log: **44/44 in 4/4 files, exit 0**.
- The actual `.app` completion-denial fixture first fails availability (`true` instead of `false`) in pass-review-plugin-red.log: **1 failed / 2 passed**. The private native fake completion then honors the already-existing deny control. Final `npx vitest run --config tests/fixtures/pass-attribution/vitest.config.mjs` -> pass-review-plugin.log: **3/3, exit 0**.
- Complete original 23-file focused command is printed in pass-review-focused.log, including all eight new regressions: **191/191 tests, 23/23 files, exit 0**.
- Framework and sibling site `npx tsc -b --pretty false` -> pass-review-framework-typecheck.log / pass-review-site-typecheck.log: **both exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` -> pass-review-architecture.log: **1,742 files / 7,914 edges validated**.
- All six correction files preserve strict UTF-8 and original LF, with no BOM/mojibake. Default working/staged whitespace checks and exact index/worktree bytes are verified before the one correction freeze/build. The full original family diff retains the same two narrowly scoped legacy CRLF files and no new CRLF file.

The single correction SDK rebuild and installed proof follow the frozen six-path staging. Their final receipts and amended SHA are recorded below. This section supersedes the initial build hashes/counts above once the correction proof completes. No public authorization enum, new gateway/merchant flow, financial transaction or unrelated bundler change is introduced.


#### Correction frozen proof and amendment

- One correction `npm run sdk:build` -> pass-review-sdk-build.log: **exit 0**. The existing browser/syncloudos-runtime circular-chunk warning remains visible and unchanged in scope.
- `npx vitest run tests/runtime/fx/pass-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` -> pass-review-packed.log: **3/3 in 3/3 files, exit 0**. Pass's independently installed actual-entry test runs **3/3 real plugin app scenarios**, including native completion denial followed by restoring the fake native control; shared denial still blocks availability/new presentation and drops the queued finish delegate.
- Strict installed types, production bundle/import behavior, all 16 runtime exports, one shared attribution runtime, blocked private paths, and installed resource integrity pass. All five root/sdk/testing/browser/fx-pass declaration graphs again reach **zero Pass internals**. The public Pass declaration entry hash remains unchanged, confirming no public signature was added or changed.
- `node scripts/synware/installed-consumer.mjs --verify` -> pass-review-frozen-verification.json: **currentSourceMatches true**. This identity check is separate from the three installed behavioral proofs above.
- Corrected archive SHA-256: `6cebecdf307674abf7b25296fc916aa171e48a7e2d052db48ee3f9ada210bf4b`.
- Corrected source SHA-256: `4be1b1eee2ddab004a0ed9ec2388c46c80299421db00356125e73e91c60a5068`.
- Corrected resources SHA-256: `71c57f2c519d1bf15884b563763b752edc9368b70be79c987b4b598f751fd1f4`.
- Corrected Pass JS entry SHA-256: `813de7f5b1a8153ad16353fd4ffb5823be328978c75e2472c30ec7ef8c046a08`.
- Unchanged Pass declaration entry SHA-256: `c6fca9c197a7bdfbd39a9b3cd328e9065568ea5e265689110bda4a4a1594902e`.

The initial family commit 3126f57 is amended with only the six correction paths listed above. Its new exact SHA is recorded in pass-review-commit.txt and pass-commit.txt and returned for scoped re-review. Post-amend verification is pass-review-postcommit-verification.json. Root PLAN/REPORT and unrelated files remain unstaged. The full family still touches the same 63 paths; no source bytes changed after the correction freeze.

## NFCFX fidelity evidence — 8 November 2026

Commit: 7da1fa16991294d97aa9b7c6f53c641385c679df — FX: rebuild NFCFX with attributed CoreNFC reader sessions.

Independent focused review: spec compliance PASS, task quality approved, no Critical/Important findings. Current checks: focused 87/87, affected hosts 22/22, source compiled app 3/3, installed checks 3/3, both typechecks and architecture 1,754 / 7,968. Test readability and existing SDK warnings are retained in the aggregate Minor ledger.

Base: `62fd7af65d5ffdd397959937b9ae8c6884b75c56` (reviewed Pass prerequisite), framework branch `fix/blind-rewrite-friction`. NFC only. The parent owns PLAN/REPORT; neither is staged here. Sibling site branch `prerelease` remains on its installed SDK. No branch, push, stash, new worktree, server, protected-port operation or unrelated family implementation was changed.

### Authority and decisions

Read nfc-task-brief.md, family-task-constraints.md and the review's ten rules. Apple sources consulted directly:

- https://developer.apple.com/documentation/corenfc/nfcndefreadersession (initializer delegate, queue, invalidateAfterFirstRead; connect completion; polling)
- https://developer.apple.com/documentation/corenfc/nfcreadersession-swift.class (abstract base, readingAvailable, delegate and sessionQueue)
- https://developer.apple.com/documentation/corenfc/nfcndefreadersessiondelegate (required invalidation callback and optional detect/activity callbacks)
- https://developer.apple.com/documentation/corenfc/nfcndeftag (status/capacity/error; message/error; write/error and lock/error completion signatures)
- https://developer.apple.com/documentation/corenfc/nfcndefpayload (Foundation byte fields, URI and text helpers; tuple locale result)
- https://developer.apple.com/documentation/corenfc/nfcreadererror-swift.struct (Apple reader/tag/session error cases)
- https://developer.apple.com/documentation/corenfc/nfctypenameformat and nfcndefmessage/length.
- Web NFC parsing algorithm, https://w3c.github.io/web-nfc/, and current Chromium NdefMessageUtils.java, https://chromium.googlesource.com/chromium/src/+/lkgr/services/device/nfc/android/java/src/org/chromium/device/nfc/NdefMessageUtils.java (snapshot nfc-chromium-ndef.java). Chromium copies MIME/external type strings and opaque payloads, splits text into exact ASCII lang and unchanged body, and expands URI records through Android toUri().

Routine decisions follow Apple and preserve privacy. Owner-requested default queue is the selected app's Dispatch main queue for null/omitted queue, rather than Apple's fresh internal serial queue for nil. No app-ID reselection occurs during delivery. Default invalidateAfterFirstRead is true; callers use positional `(delegate, null, false)` for a continuing reader. Successful first message or explicit tag read delivers before terminal first-read invalidation. The required invalidation callback is checked at construction. An already-connected tag connect is a queued no-op. The abstract base is represented by an abstract TypeScript class.

All byte values use NSEData. Global URL and Intl.Locale are the available Foundation-equivalent values; there is no NSELocale to invent. `wellKnownTypeTextPayload()` returns Apple's tuple as `[string|null, Intl.Locale|null]`. Missing language decodes to null locale; malformed matching well-known payloads throw NFC errors, and a nonmatching record type returns null values. Independent vectors cover URI prefix 0x02, UTF-8 status/language/body, UTF-16BE BOM/body, malformed prefixes/language/encodings and unpaired Unicode surrogate rejection. Original bytes are never validated by roundtrip alone.

### Public Apple → framework → file mapping

All files below are under `src/FX/NFCFX/`; public.ts contains only re-exports. All nine runtime/type root names are mapped in appkit-counterparts.json and verified through developer MCP lookup plus the TypeScript export graph. Seven are runtime exports; the delegate/tag protocols are type-only. The inline `NFXReaderError["code"]` union carries `NFCReaderError.Code` cases, following the established framework error-class pattern.

| Apple → framework/file | Members and behavior |
|---|---|
| NFCReaderSession → NFXReaderSession.ts | Abstract base; static readingAvailable; delegate, sessionQueue, isReady, alertMessage, begin, invalidate. Availability is passive and scoped to selected app authority. |
| NFCNDEFReaderSession → NFXNDEFReaderSession.ts | `(delegate, queue?, invalidateAfterFirstRead?)`; inherits the above. begin starts asynchronously, DidBecomeActive and all callbacks use Dispatch; connect(tag, completionHandler) retains Apple completion semantics; restartPolling retires old tag references; invalidate is terminal. |
| NFCNDEFReaderSessionDelegate → NFXNDEFReaderSessionDelegate.ts | readerSessionDidInvalidateWithError required; readerSessionDidBecomeActive, readerSessionDidDetectNDEFs and readerSessionDidDetectTags optional, sender first. Tag delegate takes precedence. |
| NFCNDEFTag → NFXNDEFTag.ts | isAvailable; queryNDEFStatus(status, capacity, error), readNDEF(message, error), writeNDEF(message, completion), writeLock(completion), on sessionQueue. Native private capable ports prove full live operation sequence. Unconnected tags give readerTransceiveErrorTagNotConnected. |
| NFCNDEFStatus → NFXNDEFStatus.ts | notSupported/readWrite/readOnly; separate byte capacity. |
| NFCNDEFMessage → NFXNDEFMessage.ts | records and unchunked encoded length; defensive asynchronous record snapshots. |
| NFCNDEFPayload → NFXNDEFPayload.ts | constructor(format, type, identifier, payload); typeNameFormat and three NSEData fields; static/instance URI and text helpers, mutable Apple value surface. |
| NFCTypeNameFormat → NFXTypeNameFormat.ts | Numeric empty/nfcWellKnown/media/absoluteURI/nfcExternal/unknown/unchanged values. |
| NFCReaderError → NFXReaderError.ts | errorDomain, code and Apple's reader/session/tag cases; no authorization or browser error enum. Native raw denial is classified before conversion. |

### Browser support and explicit errors

`BrowserNFCAdapter` delivers real scan messages. It does not expose public browser record/reader/message types. Web NFC has no addressed connection, capacity query or identity-safe write/lock operation: its detected protocol objects are unavailable, connect gives readerErrorUnsupportedFeature, and session tag operations before a connection give readerTransceiveErrorTagNotConnected. The underlying addressed transport operations also fail unsupported. Neither browser write nor makeReadOnly is called as an unsafe substitute; a cached event message is never passed off as a fresh readNDEF result.

`alertMessage` cannot be displayed in native Web NFC UI. Getter returns the initial empty value; setter throws readerErrorUnsupportedFeature. invalidate(errorMessage) still ends scanning and reports unsupported native text via its required invalidation delegate. No UI or artwork was invented.

Supported browser fields are lossless projections for compliant records, with exact source limitations:

| Browser record | Returned NDEF fields / refusal |
|---|---|
| text | TNF 1, T; rebuild only status encoding bit + ASCII language length (reserved bit 6 is zero in a compliant record), preserve native language casing and text body/BOM bytes. Never normalize via Intl.Locale or re-encode text. Spec utf-16be and Chromium utf-16 both restore the same original encoding bit without modifying the body. Unsupported encoding/malformed metadata fails. Language may be empty. |
| mime | TNF 2, exact exposed ASCII media type bytes and opaque DataView byte-range payload. |
| smart-poster | TNF 1, Sp, opaque original payload. No nested decode/re-serialization. |
| external | TNF 4, exact valid exposed ASCII type and opaque payload. Unsupported names fail. |
| unknown / empty | TNF 5 / 0 with validated fields. |
| url / absolute-url | readerErrorUnsupportedFeature: browser URI expansion/normalization loses original prefix/type bytes. Author-created URI helpers remain supported. |

Browser identifiers must roundtrip losslessly through UTF-8 and contain no replacement characters; non-UTF-8/opaque identifiers cannot be recovered and fail. Physical chunk framing is not exposed by Web NFC; the API uses logical records and computes unchunked length. Text reserved-bit violations discarded by the browser itself cannot be reconstructed; support is explicitly limited to compliant records. Readingerror becomes readerTransceiveErrorTagResponseError. No hardware, native permission UI or physical interoperability acceptance is claimed.

### Private authority, lifetime and hook ownership

- Internal files `nfcPort.ts`, `nfcSessionBindings.ts` and `ndefEncoding.ts` hold native contracts, association/binding and encoding helpers. `mountedNFCPort.ts` owns per-app permission and immutable launch entitlement checks (`nfc.read`, separately `nfc.write`), native refusal and captured generations.
- Context/environment private WeakMap associations replace the old factory. Public SCOS, SynWareContextValue, runtime environment, browser contribution environment and test environment have no NFC adapter/client. The capability-report consumer now uses the private association and Apple's readingAvailable name.
- Each reader pins the exact selected FXAppSession; queue selection uses dispatchQueueForSession(selectedSession).main. observeFXSessionEnd catches registry removal as well as abort. Queued work rechecks captured generation, session and access, including error completions before begin. Every reader access/session observer is installed once and released once. Dispatch's independent per-session queue observer is owned by Dispatch.
- Every native open/connect/status/read/write/lock/restart/finalization boundary preserves NotAllowedError/SecurityError before Apple conversion. Current denial revokes shared access even after a saved grant. Stale denial after revoke/regrant cannot revoke a replacement. Late native handles are closed exactly once and only by their old owner. Reentrant synchronous finalization denial is covered.
- useNFC(delegate, queue?, invalidateAfterFirstRead?) returns the actual class, binds exact context or branding clone by mount signal plus configured runtime ID, rejects ambiguous duplicates, and uses insertion-effect cleanup so StrictMode replay cannot revive an ended instance. Uncommitted/suspended renders remain passive; actual unmount drops deliveries and closes resources.
- Narrow existing test-host NFC controls were necessary for actual installed plugin proofs: allow/deny (existing generic control shape), emitText and activeSessionCount. Native ports remain private. No createSynWareTestHost implementation/API flow was changed.

### Removed names and migrated consumers

Deleted NFXAuthorizationStatus, NFXCapabilities, NFXNDEFPayloadDescriptor, NFXNDEFReading, NFXNFCClient, createMountedNFCClient and the mountedNFCClient.ts file. Removed scan/write/makeReadOnly/dispose browser surface, createReaderSession, public AbortSignal/overwrite, recordType/mediaType/id/encoding/lang/data descriptors, SCOS.nfc and context/environment.nfc factory exposure. No aliases or shims.

Migrated app runtime/context assembly, mounted registry, browser runtime, deterministic adapters, SCOS facade, useNFC, capability report, public docs, counterpart map, phase5 mounted/packed/browser/hook tests. The old generic privacy tests' five NFC authorization-client cases are replaced by 29 focused reader/tag lifetime cases and three compiled app flows; Bluetooth/XR tests retain their original behavior. Negative public type tests intentionally mention removed names to prove rejection. Developer MCP lookup consumes the changed counterpart map; SDK entry/manifest already maps fx/nfc to public.ts and requires no new route.

The site typecheck passes with its old installed SDK; no current NFC consumer source was found by the scoped source search. Gallery/new adoption remains the parent's later task. No compatibility API is retained to bridge that deferral.

### Test-first and pre-freeze verification

- nfc-values-red.log: initial API/helper shape, 3 failures. nfc-flow-red.log records missing new private flow modules. nfc-browser-red.log: 9 old-adapter failures. nfc-hook-boundary-red.log: 3 old-hook/public-host failures. nfc-plugin-red.log: 3 missing test-control failures. nfc-counterparts-red.log: missing counterpart mapping.
- nfc-byte-ui-red.log: 3 failures for byte normalization and silent native UI; nfc-core-green.log: 30 tests after correction.
- nfc-lifetime-red.log: native invalidation reentrancy reproduced; observer test was corrected to exclude Dispatch's separately owned constructor-time queue observer. nfc-lifetime-green.log: 26 passes.
- nfc-fidelity-edge-red.log: already-connected no-op and locale-free decoding failures; nfc-fidelity-edge-green.log: 32 passes. nfc-first-read-red.log proves explicit tag read auto-invalidation regression before repair.
- `npx vitest run tests/runtime/fx/nfc-apple.test.ts tests/runtime/fx/nfc-flow.test.ts tests/runtime/fx/nfc-counterparts.test.ts tests/runtime/fx/nfc-public-types.test.ts tests/runtime/fx/nfc-host-boundary.test.ts tests/runtime/fx/phase5-nfc.test.ts tests/runtime/fx/phase5-nfc-hook.test.tsx tests/runtime/fx/phase5-mounted.test.tsx tests/runtime/fx/phase5-counterparts.test.ts tests/runtime/fx/app-attribution.test.ts tests/runtime/fx/app-attribution-plugin.test.ts tests/runtime/privacy-new-fx.test.ts tests/runtime/privacy-store.test.ts` → nfc-focused.log: **87/87, 13 files, exit 0**. Includes strict source public declarations and all runtime/type counterpart exports.
- Affected host command printed in nfc-affected-host.log: browser runtime, browser contributions, host integration/composition, class test host, attribution package resources: **22/22, 6 files, exit 0**.
- `npx vitest run --config tests/fixtures/nfc-attribution/vitest.config.mjs` → nfc-plugin.log: three real compiled app scenarios (full flow plus native read/finalization denial).
- Framework and sibling site `npx tsc -b --pretty false` → nfc-framework-typecheck.log / nfc-site-typecheck.log: both exit 0.
- `node scripts/quality/architecture-boundaries.mjs` → nfc-architecture.log: **1,754 files / 7,968 edges validated**.
- nfc-chromium-encoding-red.log: 1 failing independent-vector case proves Chromium utf-16 label handling was initially missing; final focused run includes both native labels without changing bytes.
- No full suite was run. C: free space before freeze exceeds 273 GB (20 GB floor).

### Exhaustive owned file inventory

- M `docs/framework/appkit-counterparts.json`
- M `docs/framework/fx/nfc.md`
- A `docs/superpowers/evidence/2026-11-08-fx-fidelity/nfc-evidence.md`
- A `src/FX/NFCFX/NFXNDEFMessage.ts`
- A `src/FX/NFCFX/NFXNDEFPayload.ts`
- A `src/FX/NFCFX/NFXNDEFReaderSession.ts`
- A `src/FX/NFCFX/NFXNDEFReaderSessionDelegate.ts`
- A `src/FX/NFCFX/NFXNDEFStatus.ts`
- A `src/FX/NFCFX/NFXNDEFTag.ts`
- A `src/FX/NFCFX/NFXReaderError.ts`
- A `src/FX/NFCFX/NFXReaderSession.ts`
- A `src/FX/NFCFX/NFXTypeNameFormat.ts`
- A `src/FX/NFCFX/internal/ndefEncoding.ts`
- A `src/FX/NFCFX/internal/nfcPort.ts`
- A `src/FX/NFCFX/internal/nfcSessionBindings.ts`
- M `src/FX/NFCFX/public.ts`
- M `src/SynCloudOS/AppSDK/appContextTypes.ts`
- M `src/SynCloudOS/AppSDK/appRuntimeFacade.ts`
- M `src/SynCloudOS/AppSDK/createSynWareContextValue.ts`
- M `src/SynCloudOS/AppSDK/hooks/useNFC.ts`
- M `src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts`
- D `src/SynCloudOS/AppSDK/mountedNFCClient.ts`
- A `src/SynCloudOS/AppSDK/mountedNFCPort.ts`
- M `src/SynCloudOS/AppSDK/scos/scosFacade.ts`
- M `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`
- M `src/SynCloudOS/AppSDK/testing/testHostTypes.ts`
- M `src/SynCloudOS/InstalledApplications/capabilityReport.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserNFCAdapter.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts`
- M `src/SynCloudOS/Runtime/runtimeInstanceTypes.ts`
- A `tests/fixtures/nfc-attribution/consumer.test.tsx`
- A `tests/fixtures/nfc-attribution/public-types.ts`
- A `tests/fixtures/nfc-attribution/src/SynWare/First.app/Contents/Info.ts`
- A `tests/fixtures/nfc-attribution/src/SynWare/First.app/Contents/index.tsx`
- A `tests/fixtures/nfc-attribution/vitest.config.mjs`
- A `tests/runtime/fx/nfc-apple.test.ts`
- A `tests/runtime/fx/nfc-counterparts.test.ts`
- A `tests/runtime/fx/nfc-flow.test.ts`
- A `tests/runtime/fx/nfc-host-boundary.test.ts`
- A `tests/runtime/fx/nfc-packed.test.ts`
- A `tests/runtime/fx/nfc-public-types.test.ts`
- M `tests/runtime/fx/phase5-mounted.test.tsx`
- M `tests/runtime/fx/phase5-nfc-hook.test.tsx`
- M `tests/runtime/fx/phase5-nfc.test.ts`
- M `tests/runtime/fx/phase5-packed.test.ts`
- M `tests/runtime/privacy-new-fx.test.ts`

### Freeze, installed proof and commit

All source, tests, fixture bytes and shipped documentation are finalized before explicit staging and a single SDK build. Existing CRLF remains only in the two original CRLF owned files (NFC guide, phase5 mounted test); new files use LF. Strict UTF-8, no BOM/mojibake, scoped working/staged whitespace checks and index/worktree identity are audited in nfc-format-audit.json / nfc-staged-checks.json. Root PLAN/REPORT and unrelated files remain unstaged.

The frozen proof runs nfc-packed.test.ts, phase5-packed.test.ts and packed-fx.test.ts against an immutable independently installed archive, including three actual plugin .app scenarios, production bundling/import, strict installed public types, all seven NFC runtime exports and both protocol exports, one shared attribution runtime, blocked private subpaths, and complete root/sdk/sdk-testing/browser/fx-nfc declaration graph traversal with zero NFC private modules. Receipts and exact commit SHA are appended after those gates; no source bytes may change without a fresh build/proof.


#### Pre-emission build boundary correction

The first SDK build attempt (nfc-sdk-build-initial-red.log) stopped at the public API guard **before fingerprinting, declaration emission, bundling or output cleanup**. The optional merged `NFXReaderError.Code` type namespace caused the guard to inspect TypeScript's declaration-less synthetic `prototype` export as an unresolved API edge. `nfc-boundary-namespace-red.log` reproduces it directly through the real guard. The error uses the same inline code-union pattern as existing PKFXError/CNFXError; public types refer to `NFXReaderError["code"]`. No error case changes, extra export, alias, guard weakening or bundler edit. The public types test now calls the actual SDK boundary inspector. A fresh staged-byte audit, relevant checks and one successful SDK build/proof follow this repair; the first attempt produced no new SDK archive.


#### Final successful frozen proof

- Fresh successful `npm run sdk:build` → nfc-sdk-build.log: **exit 0**. Existing Rollup circular-chunk/execution-order warnings remain visible and are already carried by the aggregate minor-findings ledger; no unrelated bundler refactor. This follows the pre-emission guard failure recorded above, so there was one successful SDK archive build after the repair freeze.
- `npx vitest run tests/runtime/fx/nfc-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → nfc-packed.log: **3/3 tests, 3 files, exit 0**. NFC's independent installed actual-entry test additionally runs **3/3 nested plugin app scenarios** (full tag flow and authoritative raw read/finalization denial).
- Installed production bundle/import behavior, strict installed TypeScript, all seven runtime exports, both protocols, shared attribution runtime identity, blocked private package paths and resource integrity pass. Root, sdk, sdk/testing, browser and fx/nfc declaration graphs each reach **zero NFCFX internal modules**; emitted public class declarations contain no private attribution symbols/ports/browser record types.
- `node scripts/synware/installed-consumer.mjs --verify` → nfc-frozen-verification.json: **currentSourceMatches true**. This is separate from the actual installed behavior proof. Every frozen source/test/shipped-documentation SHA-256 still matches its staged bytes after the proof; no source bytes changed after the repaired freeze.
- Archive SHA-256: `a46f3c44fd0d4d99e2ea624217fe4cfceb1fa7e255cc46017fb323f33c830ba1`.
- Frozen source SHA-256: `4ff35831ae2e68b9b94236dfa33b4ab0ac85fd800f28327d6069ac5ac1419061`.
- Resources SHA-256: `31b292c0bf6f3695c455d5ab96bbc3374253260230ce2aed49c610f3211af3bc`.
- Exact NFC entry hashes and the five graph counts are in nfc-installed.json. The explicit-path family commit is **FX: rebuild NFCFX with attributed CoreNFC reader sessions**; its exact SHA is written immediately afterward to nfc-commit.txt and returned to the parent, avoiding a self-referential hash in committed evidence. Post-commit identity verification is nfc-postcommit-verification.json.
- Exactly 46 owned paths are staged. Root PLAN/REPORT, unrelated source/untracked evidence, and the site remain outside the commit. C: remains above 273 GB free. Physical NFC acceptance and final Gallery/SDK adoption remain deferred.

## BluetoothFX fidelity evidence — 8 November 2026

Commit accepted after correction: `aaa69c0752f22f09445aa2554267b32122b41bf1`. Independent re-review: spec PASS, quality approved; no Critical/Important findings. Root verified all 56 frozen implementation/test/shipped-document paths and deletion against committed Git objects and independently hashed the final archive (`bluetooth-root-acceptance.json`). The 57th owned path is the evidence receipt itself. Final gates: covering64/4, focused103/14, affected22/6, sourceapp3/3, packed3/3 including installedapp3/3; both typechecks and architecture1,774/8,073 pass.

Implemented from approved base `7da1fa16991294d97aa9b7c6f53c641385c679df` in the shared framework worktree on `fix/blind-rewrite-friction`. This family owns only the 57 paths listed below. Root PLAN/REPORT and unrelated evidence remain outside the commit. No branches, pushes, servers, site configuration, Fusion, or unreviewed family implementation changes.

### Authority and API mapping

The authoritative family review and owner correction require CoreBluetooth's delegate/queue/options ordering and sender-first delegates. Primary references: [CBCentralManager](https://developer.apple.com/documentation/corebluetooth/cbcentralmanager), [CBPeripheral](https://developer.apple.com/documentation/corebluetooth/cbperipheral), [CBPeripheralDelegate](https://developer.apple.com/documentation/corebluetooth/cbperipheraldelegate), [CBUUID](https://developer.apple.com/documentation/corebluetooth/cbuuid), [NSUUID](https://developer.apple.com/documentation/foundation/nsuuid), and Apple's own CoreBluetooth SDK header.

RSSI was investigated separately: the current Apple didDiscover web documentation describes a measured number but omits the unavailable sentinel; IOBluetooth's +127 documentation alone was deliberately not used as evidence for CoreBluetooth. The primary Apple-authored `CBCentralManager.h` in the macOS 11.3 SDK explicitly says at lines 275–277 that **127 is reserved and indicates RSSI was not available** for `centralManager:didDiscoverPeripheral:advertisementData:RSSI:`. The same header defines delegate/queue/options at lines 114–129. A verbatim header copy is `bluetooth-apple-CBCentralManager.h`; [its mirrored source](https://raw.githubusercontent.com/phracker/MacOSX-SDKs/master/MacOSX11.3.sdk/System/Library/Frameworks/CoreBluetooth.framework/Versions/A/Headers/CBCentralManager.h) preserves Apple's copyright and API comments. The transport uses 127 as unavailable, never as a measured signal. readRSSI reports the unavailable number together with an explicit operationNotSupported error.

Each following file is under `src/FX/BluetoothFX/` unless noted. `public.ts` only re-exports. Every runtime and protocol/type export is covered by the TypeScript checker plus developer-MCP counterpart lookup; there are 14 runtime exports and two delegate interfaces.

| Apple → ours | File | Exact admitted members and behavior |
| --- | --- | --- |
| CBManager → BTFXManager | BTFXManager.ts | Abstract state; static authorization. Attribution is private runtime metadata. No public capability or authorization request object. |
| CBManagerState → BTFXManagerState | BTFXManagerState.ts | unknown, resetting, unsupported, unauthorized, poweredOff, poweredOn. Browser state remains unknown until a real availability answer; API existence alone does not fabricate radio power. |
| CBManagerAuthorization → BTFXManagerAuthorization | BTFXManagerAuthorization.ts | notDetermined, restricted, denied, allowedAlways. Shared app privacy is authoritative; entitlement/policy restriction is restricted. |
| CBCentralManager → BTFXCentralManager | BTFXCentralManager.ts | constructor(delegate?, queue?, options?), delegate, state, isScanning, scanForPeripherals(withServices, options), stopScan, connect(peripheral, options), cancelPeripheralConnection, retrievePeripherals(withIdentifiers), retrieveConnectedPeripherals(withServices). Queue selection uses dispatchQueueForSession(exactSelectedSession).main. System-wide retrieval and nonempty native options throw operationNotSupported. Local retrieval returns only this central's discovered, consented identifiers. |
| CBCentralManagerDelegate → BTFXCentralManagerDelegate | BTFXCentralManagerDelegate.ts | Required centralManagerDidUpdateState; optional centralManagerDidDiscoverPeripheral(central, peripheral, advertisementData, rssi), centralManagerDidConnect, centralManagerDidFailToConnect, centralManagerDidDisconnectPeripheral. All sender first; error is BTFXError or null. |
| CBPeripheral → BTFXPeripheral | BTFXPeripheral.ts | identifier: NSEUUID; name; state; delegate; services; discoverServices; discoverIncludedServices; discoverCharacteristics; discoverDescriptors; readValue(characteristic) / readValue(descriptor); writeValue(data, characteristic, type) / writeValue(data, descriptor); setNotifyValue; readRSSI; maximumWriteValueLength. Methods return void and update properties/delegates, with no read/write promises. Included-service/RSSI failures use their delegate. MTU/maximum length throws operationNotSupported. |
| CBPeripheralState → BTFXPeripheralState | BTFXPeripheralState.ts | disconnected, connecting, connected, disconnecting. |
| CBPeripheralDelegate → BTFXPeripheralDelegate | BTFXPeripheralDelegate.ts | peripheralDidDiscoverServices; peripheralDidDiscoverIncludedServicesForService; peripheralDidDiscoverCharacteristicsForService; peripheralDidDiscoverDescriptorsForCharacteristic; peripheralDidUpdateValueForCharacteristic; peripheralDidUpdateValueForDescriptor; peripheralDidWriteValueForCharacteristic; peripheralDidWriteValueForDescriptor; peripheralDidUpdateNotificationStateForCharacteristic; peripheralDidReadRSSI. Sender first in every method. |
| CBAttribute → BTFXAttribute | BTFXAttribute.ts | Abstract superclass, readonly uuid: BTFXUUID. |
| CBService → BTFXService | BTFXService.ts | uuid, peripheral, isPrimary, nullable characteristics and includedServices. Actual instances created only by discovery. |
| CBCharacteristic → BTFXCharacteristic | BTFXCharacteristic.ts | uuid, service, value: NSEData or null, properties, isNotifying, nullable descriptors. Copies values; no exposed native wrapper. |
| CBCharacteristicProperties → BTFXCharacteristicProperties | BTFXCharacteristicProperties.ts | Apple option bits: broadcast 1, read 2, writeWithoutResponse 4, write 8, notify 16, indicate 32, authenticatedSignedWrites 64, extendedProperties 128, notifyEncryptionRequired 256, indicateEncryptionRequired 512. |
| CBCharacteristicWriteType → BTFXCharacteristicWriteType | BTFXCharacteristicWriteType.ts | withResponse, withoutResponse. No success write delegate for withoutResponse, matching Apple. |
| CBDescriptor → BTFXDescriptor | BTFXDescriptor.ts | uuid, characteristic, nullable value. Foundation bytes, string or number; browser native DataView does not escape. Standard UUID 2901 decodes UTF-8; 2900/2902/2903 decode little-endian unsigned 16-bit number; other descriptor values remain NSEData. |
| CBUUID → BTFXUUID | BTFXUUID.ts | Constructor overloads from 16/32/128-bit strings, NSEData and NSEUUID; uuidString, data, isEqual. Bluetooth base-UUID equality and immutable snapshots. Invalid strings/lengths use invalidParameters. Browser service aliases are not accepted. |
| CBError → BTFXError | BTFXError.ts | CBErrorDomain; unknown, invalidParameters, invalidHandle, notConnected, outOfSpace, operationCancelled, connectionTimeout, peripheralDisconnected, uuidNotAllowed, alreadyAdvertising, connectionFailed, connectionLimitReached, unknownDevice, operationNotSupported, peerRemovedPairingInformation, encryptionTimedOut, tooManyLEPairedDevices. Raw denial is recorded before conversion; no invented permission error case. |
| NSUUID → NSEUUID | src/Foundation/NSEUUID.ts and public.ts | Required dependency was absent in the repository; owner authorized a minimal genuine immutable Foundation value. Random/default, canonical string and 16-byte initializers, uppercase uuidString, getBytes, isEqual, copy. Defensive byte copies; invalid input throws. No new identity subsystem. |

The admission list does not add peripheral advertising/server roles, background scanning, restoration, pairing administration or L2CAP. The framework's existing prefix and enum representation conventions remain intact.

### Browser limits and decisions

- Web Bluetooth's chooser is one scan and yields one chosen peripheral. The adapter maps each requested UUID to an alternative service filter, preserving Apple's any-service semantics. A null UUID list accepts a device without inventing service grants. GATT service access remains limited to what the chooser/browser granted.
- Advertisement data is an empty dictionary. Device names, requested filters and subsequently discovered services are not presented as advertisement packet observations. RSSI is the documented CoreBluetooth unavailable sentinel, and readRSSI returns operationNotSupported through its delegate.
- The public synchronous scan method cannot return the browser chooser's promise, and CoreBluetooth has no scan-error delegate. Cancel/rejection stops scanning with no discovery; no false peripheral or invented scan delegate is created. Current native denial still revokes shared access. Unsupported state/options fail synchronously before presenting a chooser. This asynchronous browser limitation is documented per member.
- retrievePeripherals synchronously returns this central's authorized discovered cache. It never calls browser getDevices or elevates origin-level grants into app consent. System-wide retrieveConnectedPeripherals fails explicitly. Persistent/cross-process identifier recovery is not claimed.
- Opaque browser IDs are keys in a private per-Bluetooth-object map to new NSEUUID values. They are never cast or parsed as UUIDs. Stable mapping is scoped to the current browser Bluetooth object's process lifetime.
- Native browser GATT objects are shared per device. Private serialization holds the next connection until a retired pending connect resolves and the old native handle is disconnected. This prevents old cleanup from disconnecting a replacement connection. Other controllable native ports preserve their own exact handle ownership too.
- No guessed MTU or maximum write size. Included-service discovery and RSSI measurement fail with Apple-shaped errors. Nonempty manager/scan/connect options fail rather than silently dropping native semantics.
- Notifications are generation-bound. Late enable after a newer disable is explicitly stopped again; late enable after a newer enable cannot stop the replacement. Disabling/disconnecting removes listeners.

### Attribution, consent, queues and hooks

`internal/bluetoothPort.ts`, `bluetoothBindings.ts` and `bluetoothObjects.ts` contain all private associations, transports, metadata and object records. The mounted authority lives in `mountedBluetoothPort.ts`. Existing private environment/context association timing is used before session registration; no ambient app selection, early-service infrastructure or public port factory was added.

Central construction pins the exact selected FXAppSession. Constructor-time state and later queued successes/errors recheck session identity and captured access generation. `observeFXSessionEnd` catches registry removal and abort; access/session/state observers are installed once and released once. Dispatch's per-session main queue owns its separate observer. Revocation, policy/entitlement loss or selected-session end is terminal for the old manager even after consent is restored. Native late successes and failures are dropped; stale raw denial cannot revoke a replacement. Both pending success and rejection are tested for scan, connect, services, characteristics, descriptors, characteristic/descriptor read/write, notify and disconnect. Current native SecurityError/NotAllowedError at every boundary is recorded through privacy.observe before conversion, including disconnect finalization. Connected native handles are released before dropping.

`useBluetooth` returns the actual attributed class. A private deferred-construction marker activates its observers only when React commits through insertion effect, making discarded StrictMode renders passive. Actual unmount disposes the terminal manager. Exact-context matching also supports branding clones by signal plus configured runtime ID; ambiguous duplicate exact mounts are rejected. Another runtime with the same configured ID but different signal is not selected. No old facade or revival shim remains.

A narrow existing test-host control was added: allow/deny/fail/interrupt via the existing generic control plus emitValue and activeConnectionCount. Its native transport is private. createSynWareTestHost's implementation and public entry flow were unchanged. The actual plugin `.app` fixture constructs its attributed central after native await, a timer and callback, then performs the full central/peripheral/service/characteristic/descriptor read/write/notification/disconnect flow and tests native read/disconnect refusal after saved consent.

### Removed API and migrated consumers

Deleted BTFXAuthorizationStatus, BTFXCapabilities, BTFXPeripheralRequest, BTFXBluetoothClient, createMountedBluetoothClient and mountedBluetoothClient.ts. Removed old capability/status/requestAuthorization/createCentralManager/dispose API, browser filters/optionalServices/acceptAllDevices/AbortSignal, string peripheral identifier, isConnected and promise methods on peripheral/service/characteristic. No aliases.

Migrated runtime environment construction, private mounted registry, runtime facade, context assembly, SCOS facade, useBluetooth, capability report, deterministic test adapters/control types, the installed SDK strict type probe and runtime-entry gate, counterpart/developer-MCP lookup, browser tests, mounted/hook tests, generic privacy regression coverage and packed tests. The old six Bluetooth client-based generic privacy cases are replaced by the 48-case central/port flow suite plus native/browser and compiled app tests; XR generic tests retain their behavior. Negative public type tests intentionally mention deleted names. SDK entry/manifest already maps fx/bluetooth to public.ts, so no alias or new subpath is needed.

A scoped search found no current BTFX/useBluetooth/SCOS.bluetooth consumer in the sibling site's src tree. Its old installed SDK typecheck passes. Final SDK adoption and Gallery rewriting belong to the parent aggregate task; no interim shim was added. Physical hardware and native chooser UI acceptance remain unclaimed.

### Test-first and pre-freeze verification

- bluetooth-values-red.log: 3 missing-class/value failures. bluetooth-flow-red.log: 20 missing-class flow failures. bluetooth-browser-red.log: 4 missing scan transport failures. bluetooth-hook-red.log: 2 facade/ambiguity failures. bluetooth-boundary-red.log: 3 public environment/runtime-entry/probe failures. bluetooth-plugin-red.log: 3 missing narrow test-control failures. bluetooth-public-first.log: counterpart mapping failure, while source public types already passed.
- bluetooth-initial-state-red.log reproduced a constructor state callback lost when chooser consent completed before queue drain; repaired while preserving revocation generation checks.
- bluetooth-notify-red.log reproduced a late native notification enable surviving a newer disable; repaired with desired-state/generation checks and replacement-enable protection.
- bluetooth-availability-red.log reproduced an environment-long browser availability listener; observer-counted attachment now removes it exactly once with the last central observer.
- Full focused command is recorded at the top of bluetooth-focused.log: **96/96 tests, 14 files, exit 0**. Includes source TypeScript/public API boundary guard and all runtime/type counterpart exports.
- Affected host command in bluetooth-affected-host.log: browser runtime, contributions, host integration/composition, class test host and attribution package resources: **22/22, 6 files, exit 0**.
- `npx vitest run --config tests/fixtures/bluetooth-attribution/vitest.config.mjs` → bluetooth-plugin.log: **3/3 real compiled app scenarios**.
- Framework and sibling site `npx tsc -b --pretty false` → bluetooth-framework-typecheck.log and bluetooth-site-typecheck.log: both exit 0. Site retains its old SDK.
- `node scripts/quality/architecture-boundaries.mjs` → bluetooth-architecture.log: **1,774 files / 8,073 edges validated**.
- No full suite. C: has over 273 GB free, above the 20 GB floor.

### Exact file inventory

- M `docs/framework/appkit-counterparts.json`
- M `docs/framework/fx/bluetooth.md`
- A `docs/superpowers/evidence/2026-11-08-fx-fidelity/bluetooth-evidence.md`
- M `scripts/synware/installed-consumer.mjs`
- A `src/FX/BluetoothFX/BTFXAttribute.ts`
- A `src/FX/BluetoothFX/BTFXCentralManager.ts`
- A `src/FX/BluetoothFX/BTFXCentralManagerDelegate.ts`
- A `src/FX/BluetoothFX/BTFXCharacteristic.ts`
- A `src/FX/BluetoothFX/BTFXCharacteristicProperties.ts`
- A `src/FX/BluetoothFX/BTFXCharacteristicWriteType.ts`
- A `src/FX/BluetoothFX/BTFXDescriptor.ts`
- A `src/FX/BluetoothFX/BTFXError.ts`
- A `src/FX/BluetoothFX/BTFXManager.ts`
- A `src/FX/BluetoothFX/BTFXManagerAuthorization.ts`
- A `src/FX/BluetoothFX/BTFXManagerState.ts`
- A `src/FX/BluetoothFX/BTFXPeripheral.ts`
- A `src/FX/BluetoothFX/BTFXPeripheralDelegate.ts`
- A `src/FX/BluetoothFX/BTFXPeripheralState.ts`
- A `src/FX/BluetoothFX/BTFXService.ts`
- A `src/FX/BluetoothFX/BTFXUUID.ts`
- A `src/FX/BluetoothFX/internal/bluetoothBindings.ts`
- A `src/FX/BluetoothFX/internal/bluetoothObjects.ts`
- A `src/FX/BluetoothFX/internal/bluetoothPort.ts`
- M `src/FX/BluetoothFX/public.ts`
- A `src/Foundation/NSEUUID.ts`
- M `src/Foundation/public.ts`
- M `src/SynCloudOS/AppSDK/appContextTypes.ts`
- M `src/SynCloudOS/AppSDK/appRuntimeFacade.ts`
- M `src/SynCloudOS/AppSDK/createSynWareContextValue.ts`
- M `src/SynCloudOS/AppSDK/hooks/useBluetooth.ts`
- D `src/SynCloudOS/AppSDK/mountedBluetoothClient.ts`
- A `src/SynCloudOS/AppSDK/mountedBluetoothPort.ts`
- M `src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts`
- M `src/SynCloudOS/AppSDK/scos/scosFacade.ts`
- M `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`
- M `src/SynCloudOS/AppSDK/testing/testHostTypes.ts`
- M `src/SynCloudOS/InstalledApplications/capabilityReport.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserBluetoothAdapter.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts`
- M `src/SynCloudOS/Runtime/runtimeInstanceTypes.ts`
- A `tests/fixtures/bluetooth-attribution/consumer.test.tsx`
- A `tests/fixtures/bluetooth-attribution/public-types.ts`
- A `tests/fixtures/bluetooth-attribution/src/SynWare/First.app/Contents/Info.ts`
- A `tests/fixtures/bluetooth-attribution/src/SynWare/First.app/Contents/index.tsx`
- A `tests/fixtures/bluetooth-attribution/vitest.config.mjs`
- A `tests/runtime/fx/bluetooth-apple.test.ts`
- A `tests/runtime/fx/bluetooth-counterparts.test.ts`
- A `tests/runtime/fx/bluetooth-flow.test.ts`
- A `tests/runtime/fx/bluetooth-host-boundary.test.ts`
- A `tests/runtime/fx/bluetooth-packed.test.ts`
- A `tests/runtime/fx/bluetooth-public-types.test.ts`
- A `tests/runtime/fx/phase5-bluetooth-hook.test.tsx`
- M `tests/runtime/fx/phase5-bluetooth.test.ts`
- M `tests/runtime/fx/phase5-mounted.test.tsx`
- M `tests/runtime/fx/phase5-package-gate.test.ts`
- M `tests/runtime/fx/phase5-packed.test.ts`
- M `tests/runtime/privacy-new-fx.test.ts`

### Freeze and installed proof

All implementation, tests, fixtures and shipped documentation are finalized before explicit-path staging. Six original CRLF files retain their original line endings and headers: Bluetooth guide, Bluetooth public barrel, useBluetooth, browser Bluetooth adapter, original browser test and phase5 mounted test. New files use LF. Strict UTF-8 decoding, BOM/mojibake rejection, working/staged whitespace checks (cr-at-eol only for those six legacy paths), and staged/worktree byte identity are recorded in bluetooth-format-audit.json and bluetooth-staged-checks.json. The source/test/document hashes are frozen in bluetooth-frozen-inputs.json before a single successful SDK build and immutable independent installed proof.

Installed proof and exact commit receipts are appended only after those gates succeed. No frozen source bytes may change without rebuilding/reproving. Root PLAN/REPORT and unrelated files are never staged. Existing Rollup circular-chunk warnings, if emitted, remain in the aggregate warning ledger; there is no unrelated bundler or readability cleanup.

#### Successful frozen SDK and installed proof

- `npm run sdk:build` → bluetooth-sdk-build.log: **exit 0**, one build after final explicit staging. Existing Rollup circular-chunk/execution-order warnings remain visible for the aggregate ledger; no bundler changes.
- `npx vitest run tests/runtime/fx/bluetooth-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → bluetooth-packed.log: **3/3 tests, 3 files, exit 0**. Bluetooth's independent installed actual-entry proof additionally runs **3/3 nested plugin app scenarios**, including full GATT flow and native read/disconnect denial after consent.
- The package installs independently outside the repository, with immutable archive integrity, no linking or source alias, a real plugin-transformed production app bundle/import, strict installed TypeScript and a single shared attribution runtime. All fourteen Bluetooth runtime exports, both protocol exports and Foundation UUID value behavior are validated.
- Root, SDK, SDK/testing, browser and fx/bluetooth declaration graph traversals each reach **zero BluetoothFX internal modules**. Public class declarations have no private attribution symbol, port/native transport or browser client/request/signal/promise API. Private package subpath imports fail with ERR_PACKAGE_PATH_NOT_EXPORTED. Installed resources still match the immutable manifest after the proof.
- `node scripts/synware/installed-consumer.mjs --verify` → bluetooth-frozen-verification.json: **currentSourceMatches true**, separately from the actual installed behavior proof. Every frozen source/test/shipped-document hash still matches the staged bytes. Evidence-only receipt text is outside the SDK source fingerprint.
- Archive SHA-256: `f293918fb397e9c0c59a80596c0f32acea4f3a83c2be7f80cacddbd54b11a0ab`.
- Frozen source SHA-256: `27f4ee1e52831f9570a6c4c66927162613060d0d1b955ec4b47cf981b1901669`.
- Resources SHA-256: `8d2775b2908699ae7fffa984b00be403f9ca0ac6e808f3fbc922bb9dd24e9a08`.
- Entry-specific JS/declaration hashes and all five graph counts are in bluetooth-installed.json. The explicit-path commit message is **FX: rebuild BluetoothFX with attributed CoreBluetooth classes**. Its exact SHA is written to bluetooth-commit.txt and returned immediately afterward, avoiding a self-referential hash in committed evidence. Post-commit frozen identity is recorded in bluetooth-postcommit-verification.json.
- Exactly 57 owned files are committed. Root PLAN/REPORT, unrelated files and site work remain outside the commit. C: remains above 273 GB free. Physical hardware acceptance, full serial suite and final Gallery/SDK adoption remain with the parent aggregate work.

### Independent review correction wave

Review of the initial unshared commit `7a6321eb97829bba521ea6e2f1688267f5198973` identified three Important lifetime findings. They are repaired together before amending that commit; this correction freeze supersedes the initial SDK receipt above.

1. **Denied construction and later privacy withdrawal:** `PrivacyStore.bindResource` refuses a lease while denied, so the central previously had no privacy transition observer. The Bluetooth mounted runtime now includes `runtime.privacy.subscribe` in its independently owned access observation. `mountedBluetoothPort` tracks authorization changes and retires captured generations on withdrawal even when no resource lease was acquired, or a previous lease was revoked. Constructor behavior remains passive while denied. Successful grant does not terminate that manager; current-state delivery is described below.
2. **Stale spontaneous disconnect:** the native disconnect path captures its new peripheral generation and rechecks it inside queued delegate work. Reconnection before queue drain invalidates that old callback, equivalent to explicit cancellation.
3. **Retained notification state:** each peripheral records characteristics with pending/active notification requests. Both disconnect paths retire notification flags and generations for the old connection only, including a retained characteristic after service rediscovery. Late old notification callbacks cannot change a replacement; new connection notification state remains intact.

The owner also requested a related state-flow check before another SDK freeze. It reproduced missed `centralManagerDidUpdateState` callbacks after denied construction became granted, both before and after the first queue drain. The mounted port now propagates changes to manager state from privacy access observation as well as native availability. The central coalesces pending state notifications and reads the current state at delivery, guarded by its selected session and access generation. The obsolete captured-authorization equality filter is removed. This gives unauthorized → poweredOn delivery on a grant while still dropping all work from a revoked terminal instance.

Touched connect/disconnect, subscription, invalidation, notification and error-handling blocks were expanded for readability as requested by the Minor review. No unrelated formatting, APIs or implementations changed. The correction touches seven existing source/test files plus this evidence file; the complete original 57-file family ownership is unchanged. Exact correction paths are `bluetooth-review-amend-paths.json`.

#### Correction test evidence and final source gates

- `bluetooth-review-red.log`: **4 failing regressions**, reproducing denied-construction terminality, queued spontaneous disconnect, and retained notification flags for explicit and spontaneous disconnects; 48 earlier tests remained green.
- `bluetooth-review-green.log`: **52/52** central/port flow cases after the three repairs. Retained-characteristic coverage includes rediscovery before disconnect and a live replacement afterwards.
- `bluetooth-review-runtime-route-red.log`: the stable real mounted-runtime regression fails when only `runtime.privacy.subscribe` is temporarily removed; source was restored immediately. This validates the actual host wiring instead of only the unit fixture. The integration setup awaits canonical identity refresh, matching the existing privacy integration fixture; its earlier premature-mount test setup was corrected without changing production identity behavior.
- `bluetooth-review-state-red.log`: **2 failures** for denied → grant state delivery, before and after the first state callback.
- `npx vitest run tests/runtime/fx/bluetooth-flow.test.ts tests/runtime/fx/bluetooth-host-boundary.test.ts tests/runtime/fx/phase5-bluetooth-hook.test.tsx tests/runtime/fx/phase5-bluetooth.test.ts` → `bluetooth-review-covering.log`: **64/64, 4 files, exit 0**.
- Full focused command printed in `bluetooth-review-focused.log`: **103/103, 14 files, exit 0**. This includes all source public types, public-boundary inspection, counterparts, hook and privacy regression gates.
- Affected host command printed in `bluetooth-review-affected-host.log`: **22/22, 6 files, exit 0**.
- `npx vitest run --config tests/fixtures/bluetooth-attribution/vitest.config.mjs` → `bluetooth-review-plugin.log`: **3/3 actual compiled application scenarios, exit 0**.
- Framework and old-SDK sibling site `npx tsc -b --pretty false` → `bluetooth-review-framework-typecheck.log` and `bluetooth-review-site-typecheck.log`: **both exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` → `bluetooth-review-architecture.log`: **1,774 files / 8,073 edges validated**.

The correction is explicitly staged only after these source gates. UTF-8, original six CRLF paths, new LF paths, scoped working/staged whitespace and exact index/worktree bytes are audited again in `bluetooth-review-format-audit.json` and `bluetooth-review-staged-checks.json`. All implementation/test/shipped-document bytes are frozen in `bluetooth-review-frozen-inputs.json` before one fresh SDK build and the same three immutable installed gates. No source changes are permitted during the overlapping read-only review. New package/commit receipts follow those gates.

#### Approved correction and replacement immutable receipt

The frozen correction re-review passed with no remaining Critical/Important findings. No implementation, test or shipped-document bytes changed during that review or the subsequent package proof.

- One fresh correction `npm run sdk:build` → `bluetooth-review-sdk-build.log`: **exit 0**. Earlier initial receipt remains historical; this archive supersedes it. Existing SDK cycle warnings remain in the aggregate ledger.
- `npx vitest run tests/runtime/fx/bluetooth-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → `bluetooth-review-packed.log`: **3/3 packed gates, 3 files, exit 0**, including **3/3 nested actual installed Bluetooth app scenarios**.
- Independent production bundling/import, strict installed types, all public exports, Foundation UUID behavior, shared attribution runtime identity, blocked private paths and unchanged installed resource inventory pass. All five declaration graphs again reach **zero Bluetooth private modules**.
- `bluetooth-review-installed.json` contains the corrected archive/entry/resource hashes and graph counts. `bluetooth-review-frozen-verification.json` reports **currentSourceMatches true**. All corrected frozen source/test/shipped-document hashes match working and index bytes before amendment.
- Corrected archive SHA-256: `4c2b793119e0a4aed910a3d69228cbf4eb0813137dea1143b8e102f7af9e20a9`.
- Corrected source SHA-256: `82011b34063a5997d0b29b670f9251767eadfd4ce1b560950229c78b88f5eb6e`.
- Corrected resources SHA-256: `bcd9542c866d0c9111bcbd3175663cdcf9e8decc2f8697121e92bcf5dc48a5b8`.
- The original unshared Bluetooth commit is amended with the same FX commit message after these gates. Exact amended SHA is recorded in `bluetooth-review-commit.txt`; `bluetooth-review-postcommit-verification.json` verifies the committed bytes and current source fingerprint. The family still owns exactly 57 committed paths; only eight paths changed in this review wave. Root PLAN/REPORT and unrelated files remain unstaged.

## XRFX fidelity evidence — 8 November 2026

Accepted commit: `4d354379c4f865e7e3d013f585d88e7efb7e8c09`. Final focused re-review: spec PASS, quality approved; no remaining Critical/Important findings. Root independently verified57 frozen implementation/test/shipped-document files plus1 deletion against committed Git objects and hashed the archive (`xr-root-acceptance.json`); the59th owned path is evidence. Final focused94/14, affected22/6, compiled.app3/3, packed3/3 including installed.app3/3, both typechecks and architecture1,795/8,169 pass. Initial and intermediate archives are superseded by the final5d4d57e0 archive below.

Starting commit: `aaa69c0752f22f09445aa2554267b32122b41bf1` (accepted Bluetooth). Worktree: `webspring-folders/framework`, branch `fix/blind-rewrite-friction`. This pass owns XRFX and necessary runtime/hook/test/SDK/document integration only. Root PLAN/REPORT, unrelated files, `.superpowers`, the sibling site's old SDK and protected preview configuration remain outside the commit. No server, branch, worktree, push, VR, payment button, Fusion access or raw Gallery video work was performed.

### Source authority and member mapping

Apple's ARKit documentation was read directly on 8 November 2026: [ARSession](https://developer.apple.com/documentation/arkit/arsession), [delegateQueue](https://developer.apple.com/documentation/arkit/arsession/delegatequeue), [RunOptions](https://developer.apple.com/documentation/arkit/arsession/runoptions), [ARConfiguration](https://developer.apple.com/documentation/arkit/arconfiguration), [WorldAlignment](https://developer.apple.com/documentation/arkit/arconfiguration/worldalignment-swift.enum), [ARRaycastQuery](https://developer.apple.com/documentation/arkit/arraycastquery), [Target](https://developer.apple.com/documentation/arkit/arraycastquery/target-swift.enum), [TargetAlignment](https://developer.apple.com/documentation/arkit/arraycastquery/targetalignment-swift.enum), [ARRaycastResult](https://developer.apple.com/documentation/arkit/arraycastresult), [TrackingState](https://developer.apple.com/documentation/arkit/arcamera/trackingstate-swift.enum), and [ARError.Code](https://developer.apple.com/documentation/arkit/arerror/code). The web reader rejected Apple's Markdown content type; direct HTTPS fetches of Apple's linked `.md` pages supplied the declarations and descriptions.

All class filenames below are under `src/FX/XRFX/`. Every public runtime/type export has an exact counterpart in `docs/framework/appkit-counterparts.json`, also consumed by the developer MCP lookup. There are sixteen runtime exports and one protocol-only export. `public.ts` contains re-exports only.

| Apple member | Our member | Owning file |
| --- | --- | --- |
| `ARSession.init()` | `new XRFXSession()` | `XRFXSession.ts` |
| `ARSession.delegate`, `.delegateQueue` | `delegate`, `delegateQueue: DFXQueue | null` | `XRFXSession.ts` |
| `ARSession.currentFrame`, `.configuration` | `currentFrame`, `configuration` | `XRFXSession.ts` |
| `ARSession.run(_:options:)`, `.pause()` | `run(configuration, options)`, `pause()` | `XRFXSession.ts` |
| `ARSession.add(anchor:)`, `.remove(anchor:)` | `add(anchor)`, `remove(anchor)` | `XRFXSession.ts` |
| `ARSession.raycast(_:)` | `raycast(query): Promise<readonly XRFXRaycastResult[]>` | `XRFXSession.ts` |
| `ARSessionDelegate.session(_:didUpdate:)` frame | `sessionDidUpdateFrame(session, frame)` | `XRFXSessionDelegate.ts` |
| `ARSessionDelegate.session(_:didAdd:)` anchors | `sessionDidAddAnchors(session, anchors)` | `XRFXSessionDelegate.ts` |
| `ARSessionDelegate.session(_:didUpdate:)` anchors | `sessionDidUpdateAnchors(session, anchors)` | `XRFXSessionDelegate.ts` |
| `ARSessionDelegate.session(_:didRemove:)` | `sessionDidRemoveAnchors(session, anchors)` | `XRFXSessionDelegate.ts` |
| `ARSessionObserver.session(_:didFailWithError:)` | `sessionDidFailWithError(session, error)` | `XRFXSessionDelegate.ts` |
| `ARSessionObserver.sessionWasInterrupted(_:)` | `sessionWasInterrupted(session)` | `XRFXSessionDelegate.ts` |
| `ARSessionObserver.sessionInterruptionEnded(_:)` | `sessionInterruptionEnded(session)` | `XRFXSessionDelegate.ts` |
| `ARConfiguration.isSupported`, `.worldAlignment`, `.isLightEstimationEnabled` | Same members on abstract `XRFXConfiguration` | `XRFXConfiguration.ts` |
| `ARWorldTrackingConfiguration.isSupported` | `XRFXWorldTrackingConfiguration.isSupported: Promise<boolean>` | `XRFXWorldTrackingConfiguration.ts` |
| `AROrientationTrackingConfiguration.isSupported` | `XRFXOrientationTrackingConfiguration.isSupported: Promise<boolean>` | `XRFXOrientationTrackingConfiguration.ts` |
| `ARConfiguration.WorldAlignment.gravity`, `.gravityAndHeading`, `.camera` | Same cases on `XRFXWorldAlignment` | `XRFXWorldAlignment.ts` |
| `ARSession.RunOptions.resetTracking`, `.removeExistingAnchors`, `.stopTrackedRaycasts`, `.resetSceneReconstruction` | Same cases on `XRFXSessionRunOptions`, bit values 1/2/4/8 | `XRFXSessionRunOptions.ts` |
| `ARFrame.timestamp`, `.camera`, `.anchors` | Same members on `XRFXFrame` | `XRFXFrame.ts` |
| `ARCamera.transform`, `.projectionMatrix`, `.trackingState` | Same members; both matrices are `AFXTransform3D` | `XRFXCamera.ts` |
| `ARCamera.TrackingState.notAvailable`, `.normal`, `.limited(_:)` | Same cases on `XRFXTrackingState` | `XRFXTrackingState.ts` |
| `ARCamera.TrackingState.Reason.initializing`, `.excessiveMotion`, `.insufficientFeatures`, `.relocalizing` | Same cases on `XRFXTrackingStateReason` | `XRFXTrackingStateReason.ts` |
| `ARAnchor.init(transform:)`, `.init(name:transform:)` | `new XRFXAnchor(transform)`, `new XRFXAnchor(name, transform)` | `XRFXAnchor.ts` |
| `ARAnchor.identifier`, `.name`, `.transform` | Same members; identifier reuses Foundation `NSEUUID` | `XRFXAnchor.ts` |
| `ARRaycastQuery.init(origin:direction:allowing:alignment:)` | `new XRFXRaycastQuery(origin, direction, target, targetAlignment)` | `XRFXRaycastQuery.ts` |
| `ARRaycastQuery.origin`, `.direction`, `.target`, `.targetAlignment` | Same members | `XRFXRaycastQuery.ts` |
| `ARRaycastQuery.Target.existingPlaneGeometry`, `.existingPlaneInfinite`, `.estimatedPlane` | Same cases on `XRFXRaycastTarget` | `XRFXRaycastTarget.ts` |
| `ARRaycastQuery.TargetAlignment.horizontal`, `.vertical`, `.any` | Same cases on `XRFXRaycastTargetAlignment` | `XRFXRaycastTargetAlignment.ts` |
| `ARRaycastResult.worldTransform`, `.anchor`, `.target`, `.targetAlignment` | Same members; immutable snapshots | `XRFXRaycastResult.ts` |
| `ARError.errorDomain`, `.code` | `XRFXError.errorDomain = ARErrorDomain`, `.code` with Apple's documented cases | `XRFXError.ts` |

### Behavior, unsupported promises and decisions

Option A attribution is reused through `fxRuntimeContracts`, with private stable per-app subclasses. No ambient state, public factory, shim, FX-to-AppSDK/PlatformAdapters import or public static symbol member was added. Construction pins a unique selected session; the object remains terminal after selected registry removal, signal abort or privacy/access withdrawal. Delegates use actual `DFXQueue` work and `dispatchQueueForSession(selectedSession).main` for a null queue. Every queued delivery checks the captured run/access generation and selected session again.

`XRFXConfiguration` remains abstract. Concrete classes keep Apple's `gravity` and light-estimation-enabled defaults. Static support is asynchronous because the browser query is asynchronous; it is passive and does not imply app consent or support for every configuration property. Static query observers are released on completion or selected-session end; a late refusal cannot poison a replacement.

World tracking privately maps to immersive AR and orientation tracking to inline. Gravity uses native local coordinates and camera alignment uses viewer coordinates. `gravityAndHeading`, enabled light estimation and `resetSceneReconstruction` fail with `XRFXError(unsupportedConfiguration)`. No compass alignment, lighting estimate, native tracking confidence or plane classification is invented. Snapshot cameras report `notAvailable` because the native API does not expose ARKit tracking quality. Missing pose/projection observations produce no fabricated frame. The other Apple tracking-state cases/reasons remain real Apple-shaped values for the admitted type contract.

`run`, `pause`, `add`, and `remove` retain Apple's void/delegate shape. Native acquisition and failures are asynchronous. A repeated identical active configuration preserves its native session. A changed or resumed configuration requires explicit `resetTracking`; losing known anchors also requires `removeExistingAnchors`. Unsupported preservation fails rather than silently discarding state. A failed first acquisition clears pending-run state so it can be retried. `stopTrackedRaycasts` has no active tracked-raycast objects to stop because that API is outside the admitted list.

Actual native anchor creation occurs inside the browser frame callback; non-rigid transforms or absent anchor support produce `unsupportedConfiguration`. Anchor identifiers are real `NSEUUID`s. Native anchor creation finishing after cancellation/removal is deleted, and cannot delete a replacement creation. Actual native tracked anchors supply anchor snapshots. No plane-detection adapter path is admitted, therefore `XRFXPlaneAnchor` is excluded as the brief permits. No fake planes or VR configuration exists.

`raycast(query)` is necessarily asynchronous for hit-test-source acquisition plus the next frame. Only `estimatedPlane` and `any` alignment are supported. Plane-specific targets/alignment fail with `unsupportedConfiguration`. Result matrices are copied during the native callback; source cancellation completes before results settle, so cancellation refusal remains authoritative. No plane anchor/classification is fabricated. Translation, rotation and projection conversion are tested independently through known transformed points, in addition to immutability after source-array mutation and expired native getters.

`cameraUnauthorized` represents raw SecurityError/NotAllowedError or missing launch authority. `sensorUnavailable` represents missing native support/rendering or the mounted session limit. `invalidConfiguration` covers invalid matrices/query/options. `requestFailed` represents ended ownership, cancellation, requests before running and duplicate pending anchor creation. Raw native refusal is observed through the existing privacy path before conversion at acquisition, add/remove, raycast, frame callback and pause/finalization boundaries. Cleanup continues even if hit-source cancellation refuses during pause. Stale refusal is scoped to the old operation and cannot revoke a replacement.

The mounted host observes `runtime.privacy.subscribe` independently of `bindResource`, protecting denied construction and subsequent withdrawals before any native use. Each class owns one access and one selected-session observer; activation does not overwrite releases. Resource leases and native handles are released once. The hook defers activation until insertion-effect commit, so discarded StrictMode renders remain passive; replay retains the real class and genuine unmount ends it. Exact context, branding clones and duplicate-runtime ambiguity are covered.

### Removed names and migrated consumers

Deleted `XRFXClient`, `XRFXCapabilities`, `XRFXAuthorizationStatus`, `XRFXSessionMode`, `XRFXReferenceSpace`, `XRFXConfigurationOptions`, `createMountedXRClient`, and `mountedXRClient.ts`. Deleted the old `getCapabilities`, `getAuthorizationStatus`, instance `isSupported`, listener argument to `run`, public `dispose`, string anchor identifiers, `viewerTransform`, array transforms, mode/reference-space/feature options and public SCOS/context/runtime-environment `.xr` factory. Negative type/API tests intentionally retain these names as forbidden assertions. The host-private mounted association retains its private `xr` slot; no public declaration graph may reach that transport.

Migrated context assembly, SCOS facade, runtime facade/types, mounted service association, browser runtime construction, capability report, hook, deterministic test adapters and controls, shared privacy regressions, source/plugin fixtures, immutable installed consumer, public type probe and runtime entry gate, counterpart lookup, phase-5 mounted/packed checks and shipped XR documentation. The SDK entry and manifest already map `fx/xr` to the public barrel, so no alias or new subpath was added. Existing meaningful privacy cases were rewritten to the new boundary, not skipped. A scoped search of sibling `site/src` found no current XR consumer; its old-SDK typecheck passes. Gallery/adoption and physical hardware acceptance remain parent aggregate work.

### Tests and pre-freeze gates

- `xr-initial-red.log`: 27 missing-class/flow failures before production implementation.
- `xr-browser-red.log`: 8 missing transport failures before native rewrite.
- `xr-boundary-red.log`: 4 actual-class/ambiguity/private-environment failures before hook/runtime migration.
- `xr-plugin-red.log`: 3 missing actual test-host XR control failures before adding the narrow private adapter.
- `xr-edge-red.log`: 4 regressions for option preservation, pending anchor removal, hit-cancellation refusal and support completion after registry removal; then `xr-edge-green.log`: 38/38.
- `xr-counterparts-red.log`: missing runtime enums and counterpart exports; `xr-package-red.log`: missing installed session runtime gate/probe. `xr-public-green.log`: all source type/counterpart/gate tests pass.
- `xr-runtime-route-red.log`: removing only the real XR route's privacy subscription makes the denied → grant → withdrawal test fail. The exact source bytes were restored immediately; no production privacy weakening remains.
- `xr-finalization-red.log`: hit cancellation refusal initially prevented native cleanup; `xr-finalization-green.log`: 39/39 core/native cases after cleanup continues and propagates the refusal.
- `xr-retry-red.log`: dead pending-run retry failed; `xr-retry-green.log`: 31/31 flow cases. The stale-query setup was corrected to a fresh privacy fixture because a previous native denial correctly survives an app-only regrant.
- Focused command is printed at the top of `xr-focused.log`: **85/85 tests, 14 files, exit 0**. It covers values, full session/delegate flow, all raw operation boundaries, pending resolve/reject after revoke/regrant/replacement, queued stale frames/errors, subscription ownership, hook lifecycle, actual mounted privacy routing, attribution and shared privacy.
- Affected host command is printed in `xr-affected-host.log`: **22/22 tests, 6 files, exit 0** (browser environment/contributions, host integration/composition, class test host, attribution package resources).
- `npx vitest run --config tests/fixtures/xr-attribution/vitest.config.mjs` → `xr-plugin.log`: **3/3 actual plugin-compiled .app scenarios**. Constructors after native await, timer and callback perform complete frame/camera/anchor/raycast flows; native raycast/pause refusal overrides saved consent.
- Framework and sibling old-SDK site `npx tsc -b --pretty false` → `xr-framework-typecheck.log` and `xr-site-typecheck.log`: **both exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` → `xr-architecture.log`: **1,795 files / 8,169 edges validated**.
- `xr-covering.log` confirms a final **32/32 tests, 2 files** covering flow and public types after the private support-observer ordering check; framework typecheck and architecture gates were repeated successfully. No full framework suite was run. C: remains over 254 GB free, above the 20 GB floor.

### Exact file inventory

- M `docs/framework/appkit-counterparts.json`
- M `docs/framework/fx/README.md`
- M `docs/framework/fx/xr.md`
- A `docs/superpowers/evidence/2026-11-08-fx-fidelity/xr-evidence.md`
- M `scripts/quality/architecture-boundaries.json`
- M `scripts/synware/installed-consumer.mjs`
- A `src/FX/XRFX/XRFXAnchor.ts`
- A `src/FX/XRFX/XRFXCamera.ts`
- A `src/FX/XRFX/XRFXConfiguration.ts`
- A `src/FX/XRFX/XRFXError.ts`
- A `src/FX/XRFX/XRFXFrame.ts`
- A `src/FX/XRFX/XRFXOrientationTrackingConfiguration.ts`
- A `src/FX/XRFX/XRFXRaycastQuery.ts`
- A `src/FX/XRFX/XRFXRaycastResult.ts`
- A `src/FX/XRFX/XRFXRaycastTarget.ts`
- A `src/FX/XRFX/XRFXRaycastTargetAlignment.ts`
- A `src/FX/XRFX/XRFXSessionRunOptions.ts`
- A `src/FX/XRFX/XRFXSession.ts`
- A `src/FX/XRFX/XRFXSessionDelegate.ts`
- A `src/FX/XRFX/XRFXTrackingState.ts`
- A `src/FX/XRFX/XRFXTrackingStateReason.ts`
- A `src/FX/XRFX/XRFXWorldAlignment.ts`
- A `src/FX/XRFX/XRFXWorldTrackingConfiguration.ts`
- A `src/FX/XRFX/internal/xrBindings.ts`
- A `src/FX/XRFX/internal/xrObjects.ts`
- A `src/FX/XRFX/internal/xrPort.ts`
- A `src/FX/XRFX/internal/xrSupport.ts`
- M `src/FX/XRFX/public.ts`
- M `src/SynCloudOS/AppSDK/appContextTypes.ts`
- M `src/SynCloudOS/AppSDK/appRuntimeFacade.ts`
- M `src/SynCloudOS/AppSDK/createSynWareContextValue.ts`
- M `src/SynCloudOS/AppSDK/hooks/useXR.ts`
- M `src/SynCloudOS/AppSDK/mountedEnvironmentClientRegistry.ts`
- D `src/SynCloudOS/AppSDK/mountedXRClient.ts`
- A `src/SynCloudOS/AppSDK/mountedXRPort.ts`
- M `src/SynCloudOS/AppSDK/scos/scosFacade.ts`
- M `src/SynCloudOS/AppSDK/testing/fakeAdapters.ts`
- M `src/SynCloudOS/AppSDK/testing/testHostTypes.ts`
- M `src/SynCloudOS/InstalledApplications/capabilityReport.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment.ts`
- M `src/SynCloudOS/PlatformAdapters/BrowserXRAdapter.ts`
- M `src/SynCloudOS/Runtime/runtimeInstanceTypes.ts`
- A `tests/fixtures/xr-attribution/consumer.test.tsx`
- A `tests/fixtures/xr-attribution/public-types.ts`
- A `tests/fixtures/xr-attribution/src/SynWare/First.app/Contents/Info.ts`
- A `tests/fixtures/xr-attribution/src/SynWare/First.app/Contents/index.tsx`
- A `tests/fixtures/xr-attribution/vitest.config.mjs`
- M `tests/runtime/fx/phase5-mounted.test.tsx`
- M `tests/runtime/fx/phase5-package-gate.test.ts`
- M `tests/runtime/fx/phase5-packed.test.ts`
- A `tests/runtime/fx/phase5-xr-hook.test.tsx`
- M `tests/runtime/fx/phase5-xr.test.ts`
- A `tests/runtime/fx/xr-apple.test.ts`
- A `tests/runtime/fx/xr-counterparts.test.ts`
- A `tests/runtime/fx/xr-flow.test.ts`
- A `tests/runtime/fx/xr-host-boundary.test.ts`
- A `tests/runtime/fx/xr-packed.test.ts`
- A `tests/runtime/fx/xr-public-types.test.ts`
- M `tests/runtime/privacy-new-fx.test.ts`

### Frozen source and package proof

All 59 owned paths are explicitly staged after source/test/shipped-document gates. Original line endings, strict UTF-8, no BOM/mojibake, scoped working/staged whitespace, and working/index byte identity are audited in `xr-format-audit.json` and `xr-staged-checks.json`. `xr-frozen-inputs.json` records every frozen implementation/test/shipped-document hash. Root PLAN/REPORT and unrelated files are not staged. A single SDK build and independent immutable installed proof run after the frozen milestone. Any source correction invalidates those receipts and requires a new freeze/build/proof.

The exact final FX commit SHA is recorded in `xr-commit.txt` and the parent's final report, avoiding a self-referential hash inside this committed evidence. Successful archive/entry/graph receipts and committed-byte verification will be appended after the frozen package gates.

### Independent review correction wave

The first frozen archive (`9a4dd370b330505b4e307dd555e9fb4854fe27ec00078d817180ef69e165dbbb`, source `ca24a57908b371a2bf3f409350ec450b3555f19e79ceeb324da03782122fddc6`, resources `0fde456eaa5c8b00f6d1446895e344b914c3b5ef30cd2185757284fc0ea70404`) passed one SDK build and all three immutable packed gates, including three nested installed application scenarios. It is superseded by this correction; no commit used that draft receipt.

The combined review identified two Important findings and the implementation audit identified a precise asynchronous resource handoff race. All are corrected together before a replacement freeze:

1. **Option-set naming:** Apple's primary documentation declares `ARSession.RunOptions` with preciseIdentifier `c:@E@ARSessionRunOptions`. The framework prefix rule therefore yields `XRFXSessionRunOptions`, now used by its filename, class signatures, barrel, tests, strict installed consumer, guide and counterpart mapping. The draft shorter name is removed with no alias; only a negative export assertion retains it.
2. **Spontaneous native end:** the browser previously disposed its local layer but did not release the mounted session slot or clear the real session's active-run state. A private `ended` callback now carries the actual native lifecycle through the mounted port to `XRFXSession`. It removes only that run's slot, invalidates queued/in-flight frame/raycast/anchor work, clears current run/frame state and permits explicit tracking-reset restart. The native-ended transport is not paused/ended again, and old callbacks cannot affect a replacement. No invented public `sessionDidEnd` delegate is added. End during startup handoff is covered.
3. **Resource ownership handoff:** abort could run after `browserDeviceOperation` resolved but before `start` assigned its session/layer field. Since stop had already cached an empty close, the late assignment leaked. The adapter now checks stopped/signal state while each acquired handle is still a local value and releases that exact value before dropping it. Native-session and render-layer microtask-gap regressions use resolve → queued abort → awaiting continuation, rather than only abort-before-resolution.

`xr-review-red.log` reproduced **8 failures** before these changes (43 previous tests remained green). `xr-review-green.log` confirms **51/51 tests across 3 files**. Natural-end coverage includes three consecutive starts beyond the two-slot limit, queued stale frames, old rejection/duplicate end isolation, pending raycast invalidation, end during startup and exact-once layer cleanup. The plugin fixture is extended with the narrow test-only `endSessions` control and exercises three consecutive natural-end/restart cycles through the actual compiled `.app`. `xr-review-plugin-red.log` records the missing-control failure before its addition.

All implementation changes remain within the original 59 owned paths, with the option-set filename replaced. The original six CRLF files retain their newline convention. Final correction source gates, encoding/index audit, frozen hashes, package proof and exact commit verification follow below. No additional feature or polish work was introduced.

#### Corrected source gates and replacement freeze

- `xr-review-focused.log`: **92/92 tests, 14 files, exit 0**; full command is printed at the top of the log.
- `xr-review-affected-host.log`: **22/22 tests, 6 files, exit 0**, covering the same affected public runtime/host integrations.
- `npx vitest run --config tests/fixtures/xr-attribution/vitest.config.mjs` → `xr-review-plugin.log`: **3/3 real compiled application scenarios, exit 0**, now including repeated natural-end/restart flow.
- Framework and old-SDK sibling site `npx tsc -b --pretty false` → `xr-review-framework-typecheck.log`, `xr-review-site-typecheck.log`: **both exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` → `xr-review-architecture.log`: **1,795 files / 8,169 edges validated**.

The corrected 59-path inventory is `xr-owned-paths.json`. `xr-review-format-audit.json`, `xr-review-staged-checks.json` and `xr-review-frozen-inputs.json` replace the first freeze's byte receipts. A fresh SDK build and immutable installed proof will use only these corrected bytes; read-only re-review overlaps that proof. The packed declaration/runtime assertions explicitly reject the old draft option-set name as well as the original browser-shaped API. No source changes are permitted after this replacement freeze.

#### Final natural-end refusal correction

The second candidate archive (`a168c07ddb907477a053fae9767e26bccd73a7c113781fe2f1ba0e8d1d864896`, source `62c2743a2690cfa0089cfec1b408a292614f7e5df02a468b5d6c8a3535ef40b7`, resources `bb515db422238e8f8c050f4de8984475f99f1a6487e06b8f6aab8f0f495620dd`) also passed its single build and all three immutable gates. Final review found one remaining Important privacy issue: natural-end cleanup could reject with a native refusal after the private ended callback had already retired authority, and the adapter swallowed that rejection. This second candidate is superseded as well; no draft candidate was committed.

The final correction changes only the browser adapter, its direct regression test, and this evidence. Natural-end finalization is synchronous because it does not call native `end()`. Its raw cleanup refusal now travels through the existing failure/privacy path synchronously before `ended` retires authority. Closing state is published before cleanup or callbacks, preserving exact-once cleanup when privacy withdrawal re-enters stop. Normal natural end still immediately invalidates old work. A fresh grant and replacement started before old cleanup microtasks drain remain isolated from the old refusal and resources.

`xr-native-end-denial-red.log` reproduces **2 failures** with saved granted consent, a pending native hit source and SecurityError from cancellation on native end. The replacement variant restores native/app consent and starts the new run before old cleanup microtasks drain. `xr-native-end-denial-green.log` then passes **53/53 tests, 3 files**, including the exact native/privacy path and the actual host boundary.

Final source gates on these bytes:

- `xr-final-focused.log`: **94/94 tests, 14 files, exit 0**; command printed in the log.
- `xr-final-affected-host.log`: **22/22 tests, 6 files, exit 0**.
- `xr-final-plugin.log`: **3/3 real compiled application scenarios, exit 0**.
- `xr-final-framework-typecheck.log`, `xr-final-site-typecheck.log`: framework and old-SDK site `npx tsc -b --pretty false`, **both exit 0**.
- `xr-final-architecture.log`: **1,795 files / 8,169 edges validated**.

The final 59-path source/index freeze is recorded in `xr-final-format-audit.json`, `xr-final-staged-checks.json` and `xr-final-frozen-inputs.json`. These supersede earlier freeze receipts. Only this final fingerprint is eligible for the accepted immutable proof and commit.

### Approved final immutable receipt and commit

The final focused re-review is **PASS / Approved**, with no remaining Critical, Important or Minor findings. No source/test/shipped-document bytes changed during re-review or final package proof.

- `npm run sdk:build` → `xr-final-sdk-build.log`: **exit 0**, one build for the final freeze. The two superseded candidate freezes are documented above. Existing SDK circular-chunk/execution-order warnings remain in the aggregate warning ledger; this family made no bundler changes.
- `npx vitest run tests/runtime/fx/xr-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → `xr-final-packed.log`: **3/3 packed gates, 3 files, exit 0**, including **3/3 nested actual installed XR application scenarios**.
- Independent installation outside the repository, production bundle/import, strict installed TypeScript, sixteen runtime exports and the protocol, actual Foundation UUID/AFX matrix types, and shared attribution-runtime identity pass. The original browser API and draft shorter option-set spelling have no aliases.
- All five actual declaration graphs (`index`, `sdk`, `sdk/testing`, `browser`, `fx/xr`) reach **zero XR internal, mounted transport or browser adapter modules**. Private package subpaths remain blocked. Installed resource integrity remains unchanged after proof.
- `xr-final-installed.json` contains exact archive/entry/declaration/resource hashes and graph counts. `xr-final-frozen-verification.json` reports **currentSourceMatches true**, separately from the actual installed behavior proof. Frozen source/test/shipped-document hashes still match both working and index bytes.
- Final archive SHA-256: `5d4d57e0566f91f7c5a78d3a1159d503cee3181ef4e8d5b794648d3b31400fd4`.
- Final SDK source SHA-256: `ced5ae1aec20711ecc072e297ac43ca3cc71ca0d75652859213109e8d50a01cd`.
- Final resources SHA-256: `9b1bc3d4dee2e1cc48e543d33ff380576320df09341c5cb537a6bd51f7f712a5`.
- Final owned-source freeze SHA-256: `1a3c4e17173048d0e5158cb07ec1a9980ceb1178f230cf80bb3e4b4e0a5ada4a`.

The approved explicit-path commit is **FX: rebuild XRFX with attributed ARKit classes**. `xr-commit.txt` records its exact SHA; `xr-postcommit-verification.json` verifies the committed 59-path byte inventory and final SDK source fingerprint. This evidence file is included in that commit, so its own final commit hash is kept in the companion receipt rather than embedded self-referentially. Root PLAN/REPORT, unrelated files and sibling site work remain unstaged. Full serial framework acceptance, final SDK adoption/Gallery work and physical-device validation remain with the parent aggregate task. C: remains over 254 GB free.

## Aggregate FX hooks evidence — 8 November 2026

Accepted commit: `f2cd9dfc268fd700f3ee3b9d375c5f5f09a3689a`. Scoped review: spec PASS / quality approved, with the aggregate assertion limitation recorded in the Minor ledger. Root independently verifies all9 frozen implementation/test paths and archive hash against committed Git objects (`hooks-root-acceptance.json`). Full focused276/41, actual runtime4/4, compiled.app3/3, packed3/3 with nestedapp3/3 and eleven public declaration graphs reaching zero reviewed-family private modules; both required typechecks and architecture1,795/8,169 pass. Supplemental helper diagnostics are disclosed separately below.

Base: accepted XR commit `4d354379c4f865e7e3d013f585d88e7efb7e8c09`, framework `fix/blind-rewrite-friction`. Scope is the seven reviewed families' hook integration. The sibling site retains its previously installed SDK. No family implementation or public class member changed.

### Correction and audit

`SynWareRuntimeMount` adds host branding by spreading its registered context. `useNetwork` previously searched for exact context object identity with `.find`, so the actual mounted hook threw `notRunning`; the direct-context unit fixture missed that production path. It also failed to reject duplicate exact registrations.

The correction follows the already accepted Speech, Contacts, Pass, NFC, Bluetooth and XR hooks: filter the selected app's registrations for exact context identity or matching mount signal plus configured runtime identity; require exactly one match; pin that registration for the object's lifetime. Signal identity distinguishes simultaneous runtimes even when their configured IDs collide. More than one exact match returns `NWFXError.posix(22)` and no match returns `NWFXError.posix(6)`. Existing terminal binding and insertion-effect cleanup remain intact.

All seven conveniences create actual subclasses of the same cached per-app class used by compiled imports. No new helper, facade, public factory, capability object, alias or dispose method was introduced. Insertion lifetime avoids terminal cancellation during StrictMode layout/effect replay. Bluetooth and XR defer lifecycle activation until insertion commit; the other constructors remain passive. Existing family generations, selected-session end observation, privacy refusal handling and resource-release logic were inspected and retained.

| Hook | Actual Apple-shaped result | Lifecycle evidence retained |
|---|---|---|
| `useNetwork()` | `NWPathMonitor` → `NWFXPathMonitor` | Passive construction; one start across replay; queued path suppression, access restoration cannot revive cancelled monitors, native release on actual unmount/session removal. |
| `useSpeech()` | `SFSpeechRecognizer` → `SPFXSpeechRecognizer` | Existing task/delegate generation checks, replay, final-result suppression on cleanup, passive suspended render. |
| `useContacts()` | `CNContactStore` → `CNFXContactStore` | Existing queued access-completion suppression, terminal store, privacy generation and picker tests. |
| `usePayment(request)` | `PKPaymentAuthorizationController` → `PKFXPaymentAuthorizationController` | Existing pending presentation cleanup, stale authorization finalization and terminal controller. The real hook name is `usePayment`; `usePass` is not added. |
| `useNFC(delegate, queue, invalidateAfterFirstRead)` | `NFCNDEFReaderSession` → `NFXNDEFReaderSession`, also `NFXReaderSession` | Existing pending scan release, delegate generation checks, invalidation and terminal session. |
| `useBluetooth(delegate, queue, options)` | `CBCentralManager` → `BTFXCentralManager`, also `BTFXManager` | Deferred activation, existing stale discovery/connection tests, exact owner cleanup, no discarded-render subscription. |
| `useXR()` | `ARSession` → `XRFXSession` | Deferred activation, existing late-session release/natural-end/privacy tests, exact owner cleanup, no discarded-render subscription. |

The new real-runtime test mounts two fully branded `SynWareRuntimeMount` trees with the same app ID and the same configured runtime ID. Both hooks start their own native Network observations, survive two StrictMode setup passes, and return instances of both their compiled-app-equivalent bound classes and public bases. Unmounting one tree releases only its observation and suppresses its queued update; the other continues receiving its own path. All seven old objects remain terminal after unmount. A suspended-render case proves all seven constructors install no component-owned abort subscriptions and perform no native operation. Dispatch's independently owned per-session main queue is initialized before measuring constructor subscriptions.

The real-runtime fixture uses ordinary identity refresh and the accepted optional-authentication public-app test configuration, matching the Bluetooth host-boundary fixture. No production authorization check or entitlement was weakened. The compiled fixture uses the existing `createSynWare` definition helper from `sdk/testing`, not the application SDK entry, and the existing test host; no testing API was added.

### Files and removals

Owned paths, exhaustive:

- M `src/SynCloudOS/AppSDK/hooks/useNetwork.ts` — unique clone-safe exact-mount selection; unchanged public signature.
- M `tests/runtime/fx/network-hook.test.tsx` — reject duplicate exact mounted registrations.
- A `tests/runtime/fx/hooks-runtime-mount.test.tsx` — two real branded runtimes, all seven class identities, StrictMode, owner-specific actual unmount, passive discarded renders.
- M `tests/runtime/fx/phase5-bluetooth-hook.test.tsx` — remove unused obsolete `SCOS.bluetooth.createCentralManager` mock.
- M `tests/runtime/fx/phase5-xr-hook.test.tsx` — remove unused obsolete `SCOS.xr.createSession` mock.
- M `tests/fixtures/network-attribution/src/SynWare/First.app/Contents/index.tsx` — compiled `NetworkHookProbe` with the actual `useNetwork` import.
- M `tests/fixtures/network-attribution/consumer.test.tsx` — real compiled hook returns the imported bound class and base class, survives replay, and drops queued delivery on true unmount.
- M `tests/runtime/fx/network-packed.test.ts` — existing consumer scenario count changes from two to three; no assertion removed.
- A `tests/runtime/fx/hooks-packed.test.ts` — independently installed immutable compiled fixture, production bundle/import/shared-runtime identity, all seven hook signatures and eleven public declaration graphs.
- A `docs/superpowers/evidence/2026-11-08-fx-fidelity/hooks-evidence.md` — this evidence.

No Apple class or protocol was added, removed, renamed or altered. No counterpart or developer lookup mapping changes are needed. Public SCOS/context factories for all seven families were already removed by the accepted family commits. The two dead test mocks above were the remaining obsolete hook setup. Active source/framework-guide/tooling searches find no old positive consumer; the remaining installed-consumer occurrence explicitly rejects removed XR exports. Negative type/export assertions and historical evidence retain removal names intentionally. `speechSynthesis` belongs to the separate AudioFX family and is unchanged.

### Test-first and source gates

- `npx vitest run tests/runtime/fx/hooks-runtime-mount.test.tsx tests/runtime/fx/network-hook.test.tsx` → `hooks-selection-red.log`: **3 failing / 1 passing** before the correction: two real-mount `notRunning` failures and the missing ambiguity rejection.
- Same targeted runtime files → `hooks-runtime-green.log`: **4/4 tests, 2 files, exit 0** after the correction and normal fixture identity bootstrap.
- Focused seven-family flow/lifecycle/host/public-declaration integration command is recorded verbatim on line 1 of `hooks-focused.log`: **276/276 tests, 41 files, exit 0**. This includes all seven focused hook files, existing privacy/revocation and stale-work tests, public type boundaries, mounted SDK integration and the new real-mount regressions. No full framework suite was run.
- `npx vitest run --config tests/fixtures/network-attribution/vitest.config.mjs` → `hooks-plugin-green.log`: **3/3 compiled application scenarios, exit 0**, covering after-await, timer and callback construction, denial, and hook identity/replay/unmount.
- Framework `npx tsc -b --pretty false` → `hooks-framework-typecheck.log`: **exit 0**.
- Old-SDK sibling site `npx tsc -b --pretty false` → `hooks-site-typecheck.log`: **exit 0**.
- `node scripts/quality/architecture-boundaries.mjs` → `hooks-architecture.log`: **1,795 files / 8,169 edges validated, exit 0**.

An extra direct TypeScript check of the new test/fixture files also exposed pre-existing diagnostics in the shared, normally uncompiled `tests/runtime/helpers.ts` plus an inferred recursive fixture type in the new test. The new fixture now has an explicit return type. `hooks-test-types-final.log` records **20 baseline helper diagnostics / 20 current diagnostics / zero new diagnostic code-locations / zero owned-file diagnostics**, comparing diagnostic file, location, length and code (TypeScript displays two union-property orders differently between entrypoints). `hooks-final-runtime.log` confirms the final typed test bytes still pass **4/4 tests**. This extra check does not replace either passing repository typecheck or the strict installed consumer check.

### Frozen proof and commit

All implementation and test paths are staged explicitly after the source gates. `hooks-format-audit.json`, `hooks-staged-checks.json` and `hooks-frozen-inputs.json` record strict UTF-8, original line-ending preservation, scoped whitespace checks, source/index equality and immutable hashes. Root PLAN/REPORT and all unrelated paths remain unstaged. No implementation/test/shipped-document byte may change during review or the SDK build/proof.

The final immutable proof uses `npm run sdk:build`, then `npx vitest run tests/runtime/fx/hooks-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts`. Results and archive/source/resource hashes are appended after proof. The final `FX:` commit SHA is recorded in `hooks-commit.txt` and the parent report rather than embedded self-referentially in this committed evidence. Final full-suite acceptance and Gallery/SDK adoption remain with the parent task. No server, branch, push, stash, worktree, Fusion, protected port or site configuration operation occurred. C: remains over 250 GB free.

#### Final immutable proof

- `npm run sdk:build` → `hooks-sdk-build.log`: **exit 0**, one build after freeze. Existing SDK circular-chunk/execution-order warnings were not changed by this hook correction.
- `npx vitest run tests/runtime/fx/hooks-packed.test.ts tests/runtime/fx/phase5-packed.test.ts tests/runtime/fx/packed-fx.test.ts` → `hooks-packed.log`: **3/3 packed gates, 3 files, exit 0**, including **3/3 nested actual compiled installed application scenarios**.
- `hooks-installed.json`: independent installation outside the repository, no links, actual plugin transformation and production bundling/import, one shared attribution runtime, all seven hook return signatures under strict installed TypeScript, and unchanged installed resource integrity. All **eleven** declaration roots (`index`, `sdk`, `sdk/testing`, `browser` and the seven family entries) reach **zero** private family, mounted-port/client or browser-adapter modules.
- `hooks-frozen-verification.json`: **currentSourceMatches true**. No implementation/test/shipped-document bytes changed after the freeze.
- Archive SHA-256: `c3b2fa369b26da1cf0cf533a40284a2e8671977c79828a59767ab0d986e20306`.
- SDK source SHA-256: `26cc6f90c8eb3cc663668253651e8da8f8bc01fd887b33785b43e061644ecf5e`.
- SDK resources SHA-256: `fb5ab5b91fe9a090083228545e5cec319b44ad1d6f68af3328ac7a667b6df73f`.
- Nine-path implementation/test freeze SHA-256: `beefedbaa76804e65132b98951ef715942bf4739870eadcb9be55622d6236ce9`.

Only this unshipped evidence document is updated after proof to record its outcome. Final review disposition, explicit-path commit receipt and committed-byte/source verification are recorded with the aggregate handoff.

#### Independent review and explicit-path commit

Independent review: **PASS / Approved**, no Critical or Important finding. One minor evidence qualification is retained: the aggregate real-mount test establishes a working Network observation before cleanup, while its other six cleanup assertions use broad throws or `isAvailable === false` without establishing an operational native prestate. Those assertions alone do not prove live-resource cleanup for the other families; their existing focused hook/flow/privacy tests in the passing 276-test run supply that evidence. The aggregate adds real branding, duplicate-runtime selection, class identity, replay and discarded-render coverage rather than replacing those family tests.

The supplemental TypeScript experiment's 20 helper diagnostics are unchanged from the hook base; the shared helper bytes also match `c500`. They are outside the required repository `tsc -b` scope, and there are zero diagnostics in the owned files. Both required repository typechecks passed; no shared helper refactor was made.

The explicit ten-path commit is **FX: verify hook ownership across branded runtime mounts**. `hooks-commit.txt` records the actual SHA; `hooks-postcommit-verification.json` records the committed owned-path hashes and final SDK/source identity checks. `hooks-final-format-audit.json` records the final evidence and source/test bytes. Only the unshipped evidence gained these final review/receipt paragraphs after proof; all nine frozen implementation/test paths remain byte-identical. Root PLAN/REPORT and unrelated files remain outside the commit.

## Gallery and final acceptance

All nine families and hooks are committed and reviewed. Site commit `ff0b460e2aaa67382311735f975d31f894fb2a65` migrates the Gallery using existing NSE controls, Foundation data/money and the new class/delegate flows. The canonical Pass hook is `usePayment`. Audio, Location and the complete Video example retain their original bytes; reproducible AST extraction and canonical hashes are recorded in [gallery-preservation-recipe.json](gallery-preservation-recipe.json). The raw video line remains unchanged. [gallery-evidence.md](gallery-evidence.md) gives the complete site inventory, protected hashes, review correction and test evidence.

Framework `baacfd06742b86405d1142d5636d42bfcce89ed6` corrects throwing session-end observers so all live sessions are stopped, stale Dispatch work is rejected and independent capability queries remain isolated. It also migrates stale independent Dispatch entry lists and corrects architecture paths/documentation. [final-fix-evidence.md](final-fix-evidence.md) records the reviewed nine-path source freeze, 766 covering tests and four immutable packed proofs.

The prescribed clean detached checkout adoption of `baacfd0` produced archive `61999236adfaad4b23694182d48ad1931956fe6ae1ee75e13a845a9c5b035a48`, with 2,630 resources and source fingerprint `00451c7747dddc2a6bb477801c03a2d2146f4065e5acb9ddec9ed4303491f9bb`. The junction was deleted using `.Delete()` without recursion; the original framework Vitest was verified before and after removal of the temporary worktree. See [site-adoption-cleanup.json](site-adoption-cleanup.json).

Actual Chromium acceptance then found a development-only SDK graph split: Vite optimised the public Pass entry while the generated app module imported the binder directly. The two private class markers differed, so the binding returned the unbound class and `canMakePayments()` threw. Production bundles and Vitest had not exposed it. Installed Chromium investigation established two additional details: the excluded SDK's CommonJS React DOM peer needs explicit optimisation for its named `flushSync` export, and direct custom resolution bypasses Vite's version query, loading both `fx-attribution-runtime.js?v=...` and the same file without a query. The plugin correction keeps the SDK package outside pre-bundling, includes `react-dom` and delegates the private runtime path to Vite's normal resolver. The fixture retains ordinary discovery and its existing React optimisation settings, and uses the documented React host plugin for application hot registration. No global symbols, registry sharing, public factory or Gallery workaround is introduced.

The actual independently installed Chromium development test passed in **39.75 s** against source fingerprint `e4d9730c74e9a29ed2e309cdd71f1dc5d5ad37d36f805958ccfd8999cf953eea`, archive `b46e41f273adfa7aa885dc1fbcc3b85a1efc5ef98aa8e7561f964a9551bd58ae`. It proves strict installed fixture types; direct payment availability; three constructions after await, in a timer and in a callback; shared SCOS preferences, base/bound identities and main queue; React and React DOM actually optimised; no optimised SDK entry; exactly one runtime URL; method HMR preserving the live page/application; terminal session disposal; and installed resource integrity. The final Vite server log is empty. Initial failed/harness iterations and the earlier build warnings remain recorded in [dev-binding-fix-evidence.md](dev-binding-fix-evidence.md); the immutable accepted receipt is [dev-binding-final-dev-installed.json](dev-binding-final-dev-installed.json). Repeat site adoption and Gallery captures follow the final source commit.

Clean adoption of `a4a929f` completed as site `236ddf5f456db02dd4fdbd3a9b83d77e4cd09158`: archive `6b05b89ada8534c9140ea29294f2531d63b888460121f842db95d3d850554b5c`, the same `e4d973…` source, 2,630 resources, passing site typecheck, **413/413 tests in 62 files (36.77 s)** and **24/24 Node tests**. [dev-final-site-adoption-cleanup.json](dev-final-site-adoption-cleanup.json) records safe junction deletion and original Vitest checks before/after checkout removal.

Actual 5199 acceptance then exposed an additional host configuration case absent from the initial installed fixture: the protected preview config explicitly includes SDK root/subpath entries in `optimizeDeps.include`. Vite treats those explicit includes as stronger than exclusion, splitting the optimised SDK hooks from raw FX request classes and crashing payment request validation. The config remains byte-identical (SHA-256 `96d07f488ce95a809bfe2a218057c7f0fc0be1b7ba50ff7f3816de904d286409`). [gallery-host-include-diagnostic.json](gallery-host-include-diagnostic.json) preserves this failure.

Commit `4be4c68c41763ed44ca1009a8f5295ebc2057e8f` removes only SDK root/slash-subpath entries from the host's manual includes before Vite merges arrays, preserving unrelated prefixes and libraries. Its real Vite-resolved configuration RED and installed Chromium RED reproduce the conflict (the latter rejects duplicate NSEApplication class identity). The corrected installed host case passes **1/1 in 35.92 s**, retaining ordinary dependency discovery, explicit conflicting host includes, strict types, shared class/session identity, all three async construction contexts, live page/application HMR and terminal disposal. **75/75 focused tests, both typechecks, architecture 1,795 / 8,169 and the remaining 3/3 packed gates (129.95 s)** pass. Root independently verifies all five frozen paths and matching immutable receipt, source `59ea253b4b3dbe26ede99ac05ba7fa73736e1a2a073ac7e66ad146ee35848ae7`, archive `9b8f666d409b95ce174977f341f58cbb156a26350c7bd0da72909b85cdd052a5`. See [dev-host-include-root-acceptance.json](dev-host-include-root-acceptance.json) and [dev-host-include-dev-installed.json](dev-host-include-dev-installed.json). No Gallery, privacy or protected-config workaround is introduced. Final clean adoption and actual Gallery captures follow this source commit.

Site `10404a9904726bc37bd0ca2f86421a57d0191c5e` adopts `4be4c68` through the same exact safe checkout/junction process, archive `5aeb8135d0227f576913fcf17e0b46d1b206c6f29a92e44dc28c0b32c2de7ac2`, matching `59ea253…` source and 2,630 resources. Typecheck, **413/413 Vitest tests / 62 files (36.16 s)** and **24/24 Node tests** pass. [host-final-site-adoption-cleanup.json](host-final-site-adoption-cleanup.json) records cleanup and original Vitest preservation.

Actual startup then exposed the fixture's remaining difference from the protected development host: it explicitly optimised `react-dom/client`, while the real host did not. With SDK pre-bundling now correctly absent, raw React DOM client could not supply `createRoot`. [gallery-react-peer-diagnostic.json](gallery-react-peer-diagnostic.json) records the page error and zero optimised SDK requests. Scanning emitted SDK JavaScript identifies four React peer imports: `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`; its only other external JavaScript package is ESM `oauth4webapi`, plus a HarfBuzz WASM URL asset.

Commit `5286513ee77b3e384c1b8347c3546d0d605b977e` explicitly optimises those four actual CommonJS entries. Its fixture now uses SDK-only manual includes, ordinary discovery and the actual `[synCloudOS, react]` plugin order. The exact `createRoot` startup failure was reproduced RED. Corrected real installed Chromium passes **1/1 in 37.02 s**, proving all four peer requests are optimised, zero SDK entries optimised, host SDK includes removed, strict installed types, all three async construction contexts, shared session/class identity, live page/application HMR, terminal disposal and resource integrity. **75/75 focused tests, both typechecks, architecture and final packed 3/3 (117.55 s)** pass. Source is `a99970151f276d4bdd65e9fd2450aac9b1e3b82520f09a497b01eb998a9959f0`, archive `b0d6a6a298c6347834463bc84d6fb1f9a04dd4538b9005fdecd101ac190410bc`; [dev-sdk-peers-dev-installed.json](dev-sdk-peers-dev-installed.json) and [dev-sdk-peers-root-acceptance.json](dev-sdk-peers-root-acceptance.json) pin the proof. The protected config remains unchanged. Final clean adoption and Gallery captures follow this source commit.


## Verification results

### Final adoption and browser acceptance

Final framework implementation: `5286513ee77b3e384c1b8347c3546d0d605b977e`; final site: `c74d8c24167357a09118a8c16b6254983bb47a10`. Site adoption commit `6857d2bc9fe9b16286d2c2af8c7a0cfdadcb589c` pins archive `eb4fe13bac3036d077e0b8558b7e7f2ccbf2545c6e4993f1ddedea2750170d9e`, source `a99970151f276d4bdd65e9fd2450aac9b1e3b82520f09a497b01eb998a9959f0`, with **2,630 verified resources**. The temporary checkout was clean/detached at that exact commit; its junction was deleted with `.Delete()`, original framework Vitest verified before worktree removal and again afterwards. [peer-final-site-adoption-cleanup.json](peer-final-site-adoption-cleanup.json) records the successful cleanup.

The final phone pass found the last result under compact navigation. Commit `c74d8c2` adds `data-nse-navigation-scroll-surface="true"` to the existing Gallery `NSEScrollView`, activating NSE's existing trailing-clearance contract. It adds no control, artwork, appearance override or pixel constant. The real 390×844 RED capture placed the result below the bar; GREEN places its bottom at **709.61 px**, above the bar's **762 px** top. Both phone appearances were inspected. [gallery-phone-clearance.json](gallery-phone-clearance.json) retains the before/after evidence.

Final site `npx tsc -b` exits 0. Full Vitest: **413/413 tests / 62 files, 35.95 s**. Full Node: **24/24 tests**. These are the final one-attribute-clearance bytes, on the adopted SDK; raw logs are `gallery-clearance-typecheck.log`, `gallery-clearance-full.log`, `gallery-clearance-node.log`. The prior adopted-site run also passed 413/62 (36.51 s) and 24 Node tests before that UI correction.

[gallery-browser-acceptance.json](gallery-browser-acceptance.json) records **four final viewport/appearance states**, **14 final recorded actions**, ten hashed captures and their limits. Chromium **1440×900** and **390×844**, DPR 1, light/dark have no horizontal document or button overflow. All thirteen displayed groups were inspected; all **34 rendered buttons** use the existing NSE button class, and the one existing raw video remains. Appearance was selected through the existing Settings control. AES-GCM/SHA-256 and raw-DEFLATE round trips verify on desktop and phone, including repeat runs. Network starts/stops; leaving with an active monitor and reopening returns a stopped session. Speech, Contacts, Pass, NFC and XR produce readable framework errors for unavailable/restricted services. Bluetooth's chooser was invoked without selecting a peripheral; leaving/reopening resets its state. Pairing and physical device operations remain unverified, covered by deterministic ports rather than claimed as hardware acceptance.

Final browser evidence has **zero page errors, zero console errors, zero failed requests and zero optimised SDK requests**. Four Chromium GPU `ReadPixels` performance warnings during capture remain recorded; this is not a warning-free-log claim. Existing SDK circular-chunk warnings, baseline helper typing debt and deferred readability findings remain in the ledger. Protected preview configuration SHA-256 remains `96d07f488ce95a809bfe2a218057c7f0fc0be1b7ba50ff7f3816de904d286409`, unedited and unstaged. The FX Gallery source remains SHA-256 `b6e86c197f022721d92e72f238f2012bafd37a95092e52a38d20668872186209`; protected Audio/Location/Video hashes still pass. All recorded disk checkpoints exceed 20 GB; the final audit has **272,435,347,456 bytes free**. Only the authorised 5199 preview was restarted; the earlier unintended brief test-owned 5173 binding and corrected pre-listen guard are explicitly retained in the development evidence. No existing protected-port service was stopped or changed.

Accepted commit index (earlier rejected infrastructure remains in history and is explicitly reverted above):

| Area | Commits |
| --- | --- |
| Foundation raw DEFLATE | `de51ac9` |
| Compression | `d0a16e9` |
| Crypto implementation, review corrections and identity | `a17b519`, `ad9835b`, `41759e7`, `8922ad3`, `9e9233f`, `2dae4ec`, `267f56a`, `dd86dbc`, `cf97e85`, `a99ba91` |
| Documentation/scaffold migration guards | `982ab04`, `82a9357` |
| Revert, feasibility and option A | `59edf3a`, `7962d3e`, `cd839c5` |
| Dispatch Tasks 1–6 | `a23c342`, `7da380c`, `a2b753c`, `4d30014`, `02f5729`, `8d517c4` |
| Network / Speech / Contacts | `3c19786`, `b743352`, `b0861c5` |
| Pass / NFC / Bluetooth / XR | `62fd7af`, `7da1fa1`, `aaa69c0`, `4d35437` |
| Hooks and final integration corrections | `f2cd9df`, `baacfd0` |
| Final Vite development graph, host includes and peer corrections | `a4a929f`, `4be4c68`, `5286513` |
| Site Gallery and initial adoption | `ff0b460` |
| Site development/host/peer adoptions and compact clearance | `236ddf5`, `10404a9`, `6857d2b`, `c74d8c2` |

Final and earlier integration acceptance records (the committed acceptance summary also pins hashes of raw execution logs retained locally without altering their native bytes):

| Gate | Result | Evidence |
| --- | --- | --- |
| Required once-only serial framework suite on `f2cd9df` | 991 files: 988 passed / 3 failed; 8,213 tests: 8,205 passed / 8 failed; 2,227.98 s | `framework-final-full.log`, `framework-final-full.json` |
| Failed-run investigation | Seven stale Dispatch fixture-list failures corrected, without changing production guards. One initial Chromium navigation timeout passed unchanged-source warm and fresh-cache reruns, then all six browser cases passed; no timeout/assertion changes | `final-fix-evidence.md` and full-run JSON |
| Final integration corrections on `baacfd0` | 50/50 focused tests in 4 files; 766/766 covering tests in 86 files; 4/4 immutable packed gates | `final-fix-evidence.md`, `final-fix-*-installed.json` |
| Development graph correction on `a4a929f` | 74/74 focused tests in 8 files; actual independently installed Chromium/HMR 1/1, 39.75 s; remaining production packed gates 3/3, 127.66 s; both typechecks and architecture pass | `dev-binding-fix-evidence.md`, `dev-binding-final-dev-installed.json`, `dev-binding-root-acceptance.json` |
| Final peer correction on `5286513` | 75/75 focused tests; exact-host installed Chromium/HMR 1/1, 37.02 s; packed gates 3/3, 117.55 s; both typechecks and architecture pass | `dev-sdk-peers-root-acceptance.json`, `dev-sdk-peers-dev-installed.json` |
| Final site and Chromium | Typecheck exit 0; 413/413 tests / 62 files, 35.95 s; 24/24 Node tests; four viewport/appearance checks, ten captures | `gallery-browser-acceptance.json`, final-clearance logs |
| Framework typecheck / architecture | Exit 0; 1,795 files / 8,169 edges validated | `final-fix-framework-typecheck.log`, `final-fix-architecture.log` |
| Adopted site typecheck | Exit 0 | `site-adopted-typecheck.log` |
| Full adopted site suite | 413/413 Vitest tests in 62 files, 22.44 s; 24/24 Node tests | `site-final-full.log`, `site-final-node.log` |
| Gallery behaviour and preservation | 12/12 focused runtime tests; 3/3 Node contracts; exact protected function hashes retained | `gallery-evidence.md`, `gallery-preservation-recipe.json` |

The complete framework run remains a failed run. The later focused, covering and packed gates establish the investigated corrections; they are not represented as another green complete run. The owner required one full serial run, which was performed. Hardware-dependent backend support remains limited to the documented browser implementation; test ports do not prove physical-device compatibility.

The supplemental direct test-file TypeScript experiment has 20 unchanged shared-helper diagnostics and zero owned-file diagnostics; ordinary repository typechecks pass. Existing SDK circular-chunk/execution-order warnings and minor readability findings remain disclosed in [minor-findings.md](minor-findings.md).

- Crypto identity correction: 9 new tests pass; the relevant three-file Crypto group passes 113 tests. Both repository typechecks and independent review pass.
- After the infrastructure revert: framework and site `npx tsc -b --pretty false` exit 0. Focused ownership/application/singleton verification passes 31 tests across 3 files. `node scripts/quality/architecture-boundaries.mjs` passes with 1,615 files / 7,330 edges. Diff checks pass.
- Accepted family evidence remains above: Compression packed/lookup group 100 tests, focused follow-up 32; Crypto's prior focused/native probes and packed consumer, including 282 private-import cases per browser engine. Those runs predate the latest identity correction and are not claimed as new final acceptance.
- Historical full framework serial run: 927 files / 7,735 tests passed, 3 files / 3 tests failed (930 files / 7,738 total). All three failures were subsequently corrected in `cf97e85`, `982ab04` and `82a9357`; targeted Crypto/singleton 110, shuffled Crypto 25 and docs/scaffold 10 passed. This historical full run remains a failed run; no new final full-suite success is claimed.
- Historical full site suite on its unchanged installed SDK: 61 Vitest files / 401 tests plus 21 Node tests passed. This does not validate adoption of the rebuilt SDK.
- C: stayed above 234 GB during this revision; no low-space stop occurred. No push, branch, extra worktree, junction or preview restart occurred. Ports 5173, 5210 and 5387 and the untracked site preview config were preserved.

The historical results above predate the final acceptance summary and do not replace it. Final SDK correction, clean adoption, site checks and Chromium acceptance are complete. No tests were added for reversible report/plan edits.

## Screenshots

Primary captures, refreshed after the final UI correction:

| Viewport | Light | Dark |
| --- | --- | --- |
| Desktop 1440×900 | [Capture](gallery-desktop-light.png) | [Capture](gallery-desktop-dark.png) |
| Phone 390×844 | [Capture](gallery-phone-light.png) | [Capture](gallery-phone-dark.png) |

Supplementary reviewed captures: [desktop speech/errors](gallery-desktop-light-middle.png), [desktop devices](gallery-desktop-light-devices.png), [desktop data results](gallery-desktop-light-results.png), [phone wrapped errors](gallery-phone-light-errors.png), [phone light results](gallery-phone-light-results.png), [phone dark results](gallery-phone-dark-results.png). Exact bytes and SHA-256 hashes are in the browser acceptance JSON. These are Chromium viewport checks, not physical-phone or hardware-backend certification.

## Decisions made without stopping

- Keep one SDK module graph in development through the owning plugin: reject SDK manual pre-bundling includes, resolve the private runtime through Vite, and optimise its four actual React peer imports. The exact-host fixture provides no React dependency list of its own. This preserves private symbols, NSE/class identity, shared sessions and HMR without changing the protected site config or sharing registries across SDK copies.
- Identify the Gallery's existing NSEScrollView with the canonical navigation-scroll marker. NSE then supplies compact bottom-bar clearance; the app adds no control, artwork, CSS appearance override or guessed inset.
- Apply the owner's plugin-required attribution contract to installed/PWA chunks and fail base attributed construction in non-plugin code. Keep current test-host classes/definitions; compile real .app fixtures and allow internal binder calls in unit tests.
- Omit SFSpeechRecognizer.queue because its actual type is Foundation OperationQueue and NSEOperationQueue does not exist. No Dispatch substitute is invented.
- Foundation has no NSELocale and its formatters currently use locale identifier strings. Speech uses the standard Intl.Locale value to preserve locale structure without adding another Foundation API in this pass; this representation is documented on its locale members. Existing AUFX/MEFX buffer types, NSERange and URL supply the other source/range/value types. Browser speech recognition cannot consume supplied buffers and must fail rather than substituting microphone capture.
- Speech authorization does not start microphone recognition. The current browser adapter cannot perform Speech-only native authorization and returns unavailable/restricted without capture or an app-consent grant. Capable private ports retain full authorization; raw and normalized native refusal is recorded by shared privacy before Apple-shaped error conversion.
- PassKit's approved request/delegate surface has no web merchant-validation/session configuration. The current browser adapter therefore reports unsupported presentation rather than adding a gateway API. PKContact requires Foundation name components; the missing small NSEPersonNameComponents value counterpart is added with Apple fields/copying, while Contacts phone/postal values are reused. Payment-button artwork/type/style remain excluded.
- NFC byte access must not claim canonicalised data is the original scanned payload when browser normalisation has lost information. Unrecoverable byte members fail with NFXReaderError; semantic URI/text helpers may use actual observations. Unsupported native alert-message presentation also fails explicitly, with no added UI or artwork.
- Foundation had no UUID value counterpart. Bluetooth adds the small genuine NSEUUID type and keeps opaque browser device-ID mapping private and stable; an opaque browser ID is never cast into a UUID or presented as a hardware identifier.
- CoreBluetooth's Apple-authored CBCentralManager.h explicitly documents RSSI127 as unavailable at discovery (retained MacOSX11.3 header lines276–277). The browser discovery sentinel uses this CoreBluetooth authority, rather than inventing a measurement or inferring from IOBluetooth.
- `DFXQueue.sync(flags, work)` follows the owner's positional argument correction: its sole defaulted flags parameter stays positional. The plan's `{ flags? }` shorthand does not create an extra compatibility overload.
- Dispatch targets accept null according to Apple's headers and reset to the appropriate default global root. This differs from the main-queue default for device delegates. Global/main queue target changes are no-ops, as in Apple's object implementation.
- `DFXWorkItem<R = unknown>` uses an inferred TypeScript parameter solely to check constructor callback return types. TypeScript constructors cannot introduce their own generic; this retains a real class and rejects known PromiseLike return unions. It adds no result property or factory, and bare WorkItem values remain interoperable.
- A Group wait attempts one cooperative 5 ms drain slice between atomic items before using the browser's timeout/trap policy. Dynamically enrolled successors otherwise make a finite-returning producer hang even an expired wait. Remaining jobs stay scheduled; fixed WorkItem and sync predecessor graphs remain unsliced. This browser limit is documented on the member.
- DispatchSource's own omitted/null queue uses the global default according to Apple's overlay. This is distinct from the main defaults in the device delegate APIs. A memory-pressure source stays dormant because the current runtime exposes sampling without a pressure signal; it never derives pressure events from samples.
- Dispatch in this job is Tier 0, Tasks 1–6 only. Worker pools, closure conversion, Tier 2, benchmarks, framework adoption and App Nap are deferred. `dispatchPrecondition` keeps Apple's name. Omit fd/Mach/POSIX-signal/process sources, DispatchIO, DispatchData, DispatchWorkloop, Combine SchedulerTimeType and DispatchWallTime(timespec:).

## Open owner questions

- Resolved: the compilation contract and authentic DFXQueue dependency are approved. Families take queues after delegates positionally, with null/omitted queues defaulting to main as Apple documents; callbacks run as queue items.
- `PKFXPaymentButton` remains pending artwork approval and is excluded.
- WebXR immersive VR has no ARKit counterpart; it remains outside XRFX pending an owner decision about any separate visionOS work.
- Gallery's existing raw video preview remains unchanged; LocationFX, MotionFX, MIDIFX and other unreviewed families remain untouched. These exclusions are decided and do not pause this job.

## Post-review corrections (Claude, 9 November 2026)

- `NWFXPathMonitor.start(queue)` now requires its queue, as Apple's `start(queue:)` does; a missing or null queue throws `NWFXError` (EINVAL).
- `NFXNDEFReaderSession` with a null or omitted queue now creates its own serial Dispatch queue, as Apple's initializer does, replacing the main-queue default from the earlier steer.
- `BTFXCentralManagerDelegate` now uses the selector-derived names consistently: `centralManagerDidConnectPeripheral` and `centralManagerDidFailToConnectPeripheral`.
- Error prose uses British spelling ("authorise", "authorisation"); API names keep Apple's spelling.
- The plugin warns, naming each entry, when it removes SDK entries from a host's `optimizeDeps.include`.
- The 72 family and DispatchFX files with overlong lines were reformatted with Prettier 3.3.3 in a separate, behaviour-free commit.
