# CryptoFX phase 4 report

Implemented the approved standalone WebCrypto family in the shared framework worktree. Scope is limited to CryptoFX sources, runtime tests, guide, installed consumer script and prefixed evidence. Shared registries and site adoption remain with root.

## API

The `src/FX/CryptoFX/public.ts` entry exports `CRFXHashFunction`, `CRFXCapabilities`, `CRFXSymmetricKey`, `CRFXSHA256`, `CRFXSHA384`, `CRFXSHA512`, `CRFXHMAC`, `CRFXHKDF`, `CRFXAES`, `CRFXAESGCMSealedBox`, `CRFXSharedSecret`, `CRFXP256`, and four explicit P256 signing/agreement public/private key classes.

CRFXAES.GCM provides seal/open and SealedBox; CRFXP256.Signing and KeyAgreement expose their corresponding key classes. P256 private keys are non-extractable. Public keys use SEC1 uncompressed raw point encoding; ECDSA signatures use WebCrypto IEEE P1363 encoding. AES-GCM combined encoding is the CryptoKit-shaped 12-byte nonce, ciphertext and 16-byte tag layout. All byte input boundaries copy NSEDataConvertible immediately; all byte outputs use immutable NSEData. No homemade cryptography, DOM, React, runtime or upward imports. Capabilities query reports API availability; individual operations remain the definitive algorithm support check. This pure data framework needs no device permission, client or hook.

## Validation

- RED: focused Vitest failed resolving the absent CryptoFX public entry before implementation (`fx-phase4-crypto-red.log`).
- GREEN: 8 focused runtime tests pass (`fx-phase4-crypto-green.log`): SHA-256/384/512 published digests; RFC 4231 HMAC; RFC 5869 HKDF; NIST AES-GCM ciphertext/tag; wrong additional data and modified tag rejection; ECDSA correct/wrong-message verification and public-key import; ECDH shared-secret equality and public-key import; derived key length; key/nonce/tag/combined/output validation; defensive copies and asynchronous input snapshot; unavailable-WebCrypto capability/error behaviour.
- `npx.cmd tsc -b --pretty false`: exit 0 (`fx-phase4-crypto-typecheck.log`).
- `npx.cmd tsc -p tests/types/tsconfig.authoring-6e.json --noEmit`: exit 0 (`fx-phase4-crypto-authoring.log`).
- `node scripts/quality/architecture-boundaries.mjs`: exit 1; sole reported failure is outside ownership: `src/FrameworkTests/Windows/WindowManagementFixture.tsx:29 -> src/NSE/Overlays/NSEPopover.tsx: devtools must use a public nse entrypoint` (`fx-phase4-crypto-boundaries.log`). No unrelated edits made.
- `node --check scripts/synware/check-fx-crypto-consumer.mjs`: exit 0.

The installed consumer script bundles a real module worker from the independently installed archive and checks WebCrypto availability, SHA byte count, AES round-trip, P256 signing and ECDH equality in Chromium, Firefox and WebKit. This script is ready for root to run after SDK registry integration/build; it has not been run against an archive here. Source runtime tests are not browser-worker acceptance evidence.

## Integration required from root

1. Add SDK entry `fx/crypto` pointing at `src/FX/CryptoFX/public.ts`, with standalone data-framework ownership and no runtime counterpart/client/hook.
2. Add matching package subpath export and shared framework/product/docs registries according to adjacent standalone FX entries.
3. Link `docs/framework/fx/crypto.md` from the FX documentation index.
4. Build/package SDK; run `node scripts/synware/check-fx-crypto-consumer.mjs` (writes `fx-phase4-crypto-installed-browser.json`), broader suite and site adoption.

## Constraints and concerns

Browser WebCrypto requires a secure context and algorithm availability may vary. Caller-supplied AES nonces must never repeat with a key; random generation is the default. JavaScript cannot guarantee memory erasure. Symmetric key/raw shared secret export is explicit; P256 private-key import/export and native Secure Enclave are outside this scope. No native or physical-device acceptance claimed.

## Commits

`db872f3` — FX: add standalone WebCrypto-backed CryptoFX (sources, tests, guide, consumer and validation logs). A subsequent report-only commit records this SHA.

