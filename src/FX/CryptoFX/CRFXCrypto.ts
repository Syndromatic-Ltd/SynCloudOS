/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { NSEData, type NSEDataConvertible } from "../../Foundation/NSEData";
export type CRFXHashFunction = "SHA-256" | "SHA-384" | "SHA-512";
function validateHash(algorithm: CRFXHashFunction): void {
  if (!["SHA-256", "SHA-384", "SHA-512"].includes(algorithm)) throw new TypeError("CryptoFX supports SHA-256, SHA-384 and SHA-512.");
}
const copy = (value: NSEDataConvertible): Uint8Array<ArrayBuffer> => new Uint8Array(NSEData.from(value).bytes);
function cryptoProvider(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error("CryptoFX requires WebCrypto in a secure context.");
  return globalThis.crypto;
}
export class CRFXCapabilities {
  static query(): Readonly<{ webCrypto: boolean; secureRandom: boolean }> {
    return Object.freeze({ webCrypto: !!globalThis.crypto?.subtle, secureRandom: typeof globalThis.crypto?.getRandomValues === "function" });
  }
}
export class CRFXSymmetricKey {
  readonly #data: NSEData;
  constructor(data: NSEDataConvertible) { this.#data = NSEData.from(data); Object.freeze(this); }
  static generate(bitCount = 256): CRFXSymmetricKey {
    if (!Number.isSafeInteger(bitCount) || bitCount <= 0 || bitCount % 8 || bitCount > 524288) throw new RangeError("Key size must be a positive whole byte size, at most 65536 bytes.");
    return new CRFXSymmetricKey(cryptoProvider().getRandomValues(new Uint8Array(bitCount / 8)));
  }
  get bitCount(): number { return this.#data.count * 8; }
  get rawRepresentation(): NSEData { return NSEData.from(this.#data); }
}
async function hash(data: NSEDataConvertible, algorithm: CRFXHashFunction): Promise<NSEData> { return NSEData.from(await cryptoProvider().subtle.digest(algorithm, copy(data))); }
export class CRFXSHA256 { static hash(data: NSEDataConvertible): Promise<NSEData> { return hash(data, "SHA-256"); } }
export class CRFXSHA384 { static hash(data: NSEDataConvertible): Promise<NSEData> { return hash(data, "SHA-384"); } }
export class CRFXSHA512 { static hash(data: NSEDataConvertible): Promise<NSEData> { return hash(data, "SHA-512"); } }
async function hmacKey(key: CRFXSymmetricKey, algorithm: CRFXHashFunction): Promise<CryptoKey> {
  validateHash(algorithm);
  return cryptoProvider().subtle.importKey("raw", copy(key.rawRepresentation), { name: "HMAC", hash: algorithm }, false, ["sign", "verify"]);
}
export class CRFXHMAC {
  static async authenticationCode(data: NSEDataConvertible, key: CRFXSymmetricKey, algorithm: CRFXHashFunction = "SHA-256"): Promise<NSEData> {
    const bytes = copy(data); return NSEData.from(await cryptoProvider().subtle.sign("HMAC", await hmacKey(key, algorithm), bytes));
  }
  static async isValidAuthenticationCode(code: NSEDataConvertible, data: NSEDataConvertible, key: CRFXSymmetricKey, algorithm: CRFXHashFunction = "SHA-256"): Promise<boolean> {
    const mac = copy(code), bytes = copy(data); return cryptoProvider().subtle.verify("HMAC", await hmacKey(key, algorithm), mac, bytes);
  }
}
export class CRFXHKDF {
  static async deriveKey(inputKeyMaterial: CRFXSymmetricKey, salt: NSEDataConvertible, info: NSEDataConvertible, outputByteCount: number, algorithm: CRFXHashFunction = "SHA-256"): Promise<CRFXSymmetricKey> {
    validateHash(algorithm);
    const maximum = 255 * ({ "SHA-256": 32, "SHA-384": 48, "SHA-512": 64 }[algorithm]);
    if (!Number.isSafeInteger(outputByteCount) || outputByteCount <= 0 || outputByteCount > maximum) throw new RangeError("HKDF output exceeds the selected hash limit.");
    const parameters = { name: "HKDF", hash: algorithm, salt: copy(salt), info: copy(info) };
    const key = await cryptoProvider().subtle.importKey("raw", copy(inputKeyMaterial.rawRepresentation), "HKDF", false, ["deriveBits"]);
    return new CRFXSymmetricKey(await cryptoProvider().subtle.deriveBits(parameters, key, outputByteCount * 8));
  }
}
export class CRFXAESGCMSealedBox {
  readonly nonce: NSEData; readonly ciphertext: NSEData; readonly tag: NSEData;
  constructor(nonce: NSEDataConvertible, ciphertext: NSEDataConvertible, tag: NSEDataConvertible) {
    this.nonce = NSEData.from(nonce); this.ciphertext = NSEData.from(ciphertext); this.tag = NSEData.from(tag);
    if (this.nonce.count !== 12 || this.tag.count !== 16) throw new RangeError("AES-GCM requires a 12-byte nonce and a 16-byte tag.");
    Object.freeze(this);
  }
  get combined(): NSEData { const result = new Uint8Array(12 + this.ciphertext.count + 16); result.set(this.nonce.bytes); result.set(this.ciphertext.bytes, 12); result.set(this.tag.bytes, result.length - 16); return NSEData.from(result); }
  static fromCombined(data: NSEDataConvertible): CRFXAESGCMSealedBox { const bytes = copy(data); if (bytes.length < 28) throw new RangeError("Truncated sealed box."); return new CRFXAESGCMSealedBox(bytes.slice(0, 12), bytes.slice(12, -16), bytes.slice(-16)); }
}
async function aesKey(key: CRFXSymmetricKey): Promise<CryptoKey> {
  if (![128, 192, 256].includes(key.bitCount)) throw new RangeError("AES key must contain 128, 192, or 256 bits.");
  return cryptoProvider().subtle.importKey("raw", copy(key.rawRepresentation), "AES-GCM", false, ["encrypt", "decrypt"]);
}
class CRFXAESGCM {
  static readonly SealedBox = CRFXAESGCMSealedBox;
  static async seal(data: NSEDataConvertible, key: CRFXSymmetricKey, options: { nonce?: NSEDataConvertible; authenticating?: NSEDataConvertible } = {}): Promise<CRFXAESGCMSealedBox> {
    const bytes = copy(data), iv = options.nonce ? copy(options.nonce) : cryptoProvider().getRandomValues(new Uint8Array(12));
    if (iv.length !== 12) throw new RangeError("AES-GCM requires a 12-byte nonce.");
    const parameters = { name: "AES-GCM", iv, additionalData: copy(options.authenticating ?? new Uint8Array()), tagLength: 128 };
    const result = new Uint8Array(await cryptoProvider().subtle.encrypt(parameters, await aesKey(key), bytes));
    return new CRFXAESGCMSealedBox(iv, result.slice(0, -16), result.slice(-16));
  }
  static async open(box: CRFXAESGCMSealedBox, key: CRFXSymmetricKey, authenticating: NSEDataConvertible = new Uint8Array()): Promise<NSEData> {
    const bytes = new Uint8Array(box.ciphertext.count + 16); bytes.set(box.ciphertext.bytes); bytes.set(box.tag.bytes, box.ciphertext.count);
    const parameters = { name: "AES-GCM", iv: copy(box.nonce), additionalData: copy(authenticating), tagLength: 128 };
    return NSEData.from(await cryptoProvider().subtle.decrypt(parameters, await aesKey(key), bytes));
  }
}
export class CRFXAES { static readonly GCM = CRFXAESGCM; }
export class CRFXSharedSecret {
  readonly #data: NSEData;
  constructor(data: NSEDataConvertible) { this.#data = NSEData.from(data); Object.freeze(this); }
  get rawRepresentation(): NSEData { return NSEData.from(this.#data); }
  hkdfDerivedSymmetricKey(salt: NSEDataConvertible, sharedInfo: NSEDataConvertible, outputByteCount: number, algorithm: CRFXHashFunction = "SHA-256"): Promise<CRFXSymmetricKey> { return CRFXHKDF.deriveKey(new CRFXSymmetricKey(this.#data), salt, sharedInfo, outputByteCount, algorithm); }
}
function requireP256PublicKey(key: CryptoKey, algorithmName: "ECDSA" | "ECDH"): void {
  // Intrinsic accessors brand-check across realms and cannot be spoofed by own properties.
  const prototype = globalThis.CryptoKey?.prototype;
  if (!prototype) throw new TypeError("A genuine WebCrypto public key is required.");
  let type: KeyType, algorithm: EcKeyAlgorithm, usages: readonly KeyUsage[];
  try {
    type = Object.getOwnPropertyDescriptor(prototype, "type")!.get!.call(key);
    algorithm = Object.getOwnPropertyDescriptor(prototype, "algorithm")!.get!.call(key);
    usages = Object.getOwnPropertyDescriptor(prototype, "usages")!.get!.call(key);
  } catch { throw new TypeError("A genuine WebCrypto public key is required."); }
  const validUsages = algorithmName === "ECDSA" ? usages.length === 1 && usages[0] === "verify" : usages.length === 0;
  if (type !== "public" || algorithm.name !== algorithmName || algorithm.namedCurve !== "P-256" || !validUsages)
    throw new TypeError(`Expected a P-256 ${algorithmName} public key with public-key usages.`);
}
export class CRFXP256SigningPublicKey {
  readonly #key: CryptoKey;
  constructor(key: CryptoKey) { requireP256PublicKey(key, "ECDSA"); this.#key = key; Object.freeze(this); }
  static async fromRawRepresentation(data: NSEDataConvertible): Promise<CRFXP256SigningPublicKey> { return new CRFXP256SigningPublicKey(await cryptoProvider().subtle.importKey("raw", copy(data), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"])); }
  async rawRepresentation(): Promise<NSEData> { return NSEData.from(await cryptoProvider().subtle.exportKey("raw", this.#key)); }
  async isValidSignature(signature: NSEDataConvertible, data: NSEDataConvertible): Promise<boolean> { return cryptoProvider().subtle.verify({ name: "ECDSA", hash: "SHA-256" }, this.#key, copy(signature), copy(data)); }
}
export class CRFXP256SigningPrivateKey {
  readonly #key: CryptoKey; readonly publicKey: CRFXP256SigningPublicKey;
  private constructor(pair: CryptoKeyPair) { this.#key = pair.privateKey; this.publicKey = new CRFXP256SigningPublicKey(pair.publicKey); Object.freeze(this); }
  static async generate(): Promise<CRFXP256SigningPrivateKey> { return new CRFXP256SigningPrivateKey(await cryptoProvider().subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"])); }
  async signature(data: NSEDataConvertible): Promise<NSEData> { return NSEData.from(await cryptoProvider().subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.#key, copy(data))); }
}
const agreementKeys = new WeakMap<CRFXP256KeyAgreementPublicKey, CryptoKey>();
export class CRFXP256KeyAgreementPublicKey {
  constructor(key: CryptoKey) { requireP256PublicKey(key, "ECDH"); agreementKeys.set(this, key); Object.freeze(this); }
  static async fromRawRepresentation(data: NSEDataConvertible): Promise<CRFXP256KeyAgreementPublicKey> { return new CRFXP256KeyAgreementPublicKey(await cryptoProvider().subtle.importKey("raw", copy(data), { name: "ECDH", namedCurve: "P-256" }, true, [])); }
  async rawRepresentation(): Promise<NSEData> { return NSEData.from(await cryptoProvider().subtle.exportKey("raw", agreementKeys.get(this)!)); }
}
export class CRFXP256KeyAgreementPrivateKey {
  readonly #key: CryptoKey; readonly publicKey: CRFXP256KeyAgreementPublicKey;
  private constructor(pair: CryptoKeyPair) { this.#key = pair.privateKey; this.publicKey = new CRFXP256KeyAgreementPublicKey(pair.publicKey); Object.freeze(this); }
  static async generate(): Promise<CRFXP256KeyAgreementPrivateKey> { return new CRFXP256KeyAgreementPrivateKey(await cryptoProvider().subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])); }
  async sharedSecretFromKeyAgreement(publicKey: CRFXP256KeyAgreementPublicKey): Promise<CRFXSharedSecret> { const key = agreementKeys.get(publicKey); if (!key) throw new TypeError("Expected a P256 key-agreement public key."); return new CRFXSharedSecret(await cryptoProvider().subtle.deriveBits({ name: "ECDH", public: key }, this.#key, 256)); }
}
export class CRFXP256 {
  static readonly Signing = Object.freeze({ PrivateKey: CRFXP256SigningPrivateKey, PublicKey: CRFXP256SigningPublicKey });
  static readonly KeyAgreement = Object.freeze({ PrivateKey: CRFXP256KeyAgreementPrivateKey, PublicKey: CRFXP256KeyAgreementPublicKey });
}

