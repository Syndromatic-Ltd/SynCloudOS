# CryptoFX

CryptoFX (`@syndromatic/syncloudos/fx/crypto`) provides asynchronous WebCrypto operations with CryptoKit-shaped CRFX names. It is a standalone data framework: no device permission, runtime client, React provider or hook is required. Importing it does not access the DOM or request capabilities. `CRFXCapabilities.query()` reports current WebCrypto and secure-random availability; individual algorithms may still be rejected by the platform. Browsers require a secure context; workers are supported where WebCrypto is available.

All byte inputs accept Foundation `NSEDataConvertible`; byte results use immutable, defensively copied `NSEData`. `CRFXSymmetricKey` and `CRFXSharedSecret` copy imported bytes and expose copied `rawRepresentation` data. JavaScript cannot guarantee secret-memory erasure.

```ts
import { CRFXAES, CRFXSymmetricKey } from "@syndromatic/syncloudos/fx/crypto";
const key = CRFXSymmetricKey.generate(256);
const box = await CRFXAES.GCM.seal(new TextEncoder().encode("hello"), key);
const restored = await CRFXAES.GCM.open(box, key);
```

- `CRFXSHA256.hash(data)`, `CRFXSHA384.hash(data)` and `CRFXSHA512.hash(data)` return digest data.
- `CRFXHMAC.authenticationCode(data, key, hash?)` and `isValidAuthenticationCode(code, data, key, hash?)` use WebCrypto signing and verification. Hash defaults to `"SHA-256"`; SHA-384 and SHA-512 are supported.
- `CRFXHKDF.deriveKey(inputKeyMaterial, salt, info, outputByteCount, hash?)` returns a symmetric key. Output must be positive and no larger than 255 hash-output blocks.
- `CRFXAES.GCM.seal(data, key, { nonce?, authenticating? }?)` generates a random 12-byte nonce unless supplied. Never reuse a nonce with the same key. AES supports 128-, 192- and 256-bit keys and 16-byte authentication tags. `open(box, key, authenticating?)` rejects unauthenticated ciphertext, including incorrect additional data. `CRFXAES.GCM.SealedBox` has nonce, ciphertext and tag data; `combined` uses nonce–ciphertext–tag order and `fromCombined(data)` parses that representation.
- `CRFXP256.Signing.PrivateKey.generate()` creates a non-extractable private key; `.signature(data)` signs with ECDSA and SHA-256. `.publicKey.isValidSignature(signature, data)` verifies. Signatures are 64-byte IEEE P1363 raw r‖s values, not ASN.1 DER.
- `CRFXP256.KeyAgreement.PrivateKey.generate()` creates a non-extractable ECDH private key; `.sharedSecretFromKeyAgreement(peerPublicKey)` returns `CRFXSharedSecret`. Use `.hkdfDerivedSymmetricKey(salt, sharedInfo, outputByteCount, hash?)` before encryption.
- Both P256 public-key classes provide asynchronous `rawRepresentation()` (SEC1 uncompressed point bytes) and static `fromRawRepresentation(data)`. Signing and agreement key classes are distinct. Private-key export/import and native Secure Enclave storage are outside this browser framework.

`CRFXSymmetricKey.generate(bitCount = 256)` uses secure random bytes and permits positive whole-byte sizes up to 65536 bytes. Its constructor accepts existing key material; individual operations validate their own supported sizes. Platform failures propagate as WebCrypto errors; argument shape and size failures use `TypeError` or `RangeError`.

Validation includes NIST AES-GCM, RFC 4231 HMAC and RFC 5869 HKDF vectors, published SHA digests, authentication failures, P256 signing/key agreement, imported public keys and defensive copies. The installed consumer script checks real workers in Chromium, Firefox and WebKit after SDK packaging; browser results are separate from source tests.
