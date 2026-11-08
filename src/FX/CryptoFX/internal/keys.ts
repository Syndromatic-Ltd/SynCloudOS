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

import { NSEData } from "../../../Foundation/NSEData";
import type { CRFXDigest } from "../CRFXDigest";
import { CRFXSharedSecret } from "../CRFXSharedSecret";
import { CRFXError } from "../CRFXError";
import { concat, copy, makeValue, operation, provider, unhex, unsupported } from "./bytes";
import { canonicalDer, der, derSequence, fromBase64url, parseDer, parsePem, pem, sequence } from "./encoding";
import { compactable, curves, uncompress, type Curve } from "./curves";

type Representation = "rawRepresentation" | "x963Representation" | "compressedRepresentation" | "compactRepresentation" | "derRepresentation" | "pemRepresentation";
type Input = Partial<Record<Exclude<Representation, "pemRepresentation">, NSEData>> & { pemRepresentation?: string };
type Kind = "signing" | "agreement";
type State = { curve: Curve | "Curve25519"; kind: Kind; privateKey: boolean; key: Promise<CryptoKey> };
const keys = new WeakMap<object, State>();
function state(value: object): State { const found = keys.get(value); if (!found) throw new CRFXError("invalidParameter", "Invalid key."); return found; }
function retain(value: object, entry: State): void { keys.set(value, entry); void entry.key.catch(() => {}); }
function algorithm(curve: State["curve"], kind: Kind): EcKeyImportParams | Algorithm {
  return curve === "Curve25519" ? { name: kind === "signing" ? "Ed25519" : "X25519" } : { name: kind === "signing" ? "ECDSA" : "ECDH", namedCurve: curves[curve].name };
}
function inputEntry(input: Input): [Representation, NSEData | string] {
  if (!input || typeof input !== "object") throw new CRFXError("invalidParameter");
  const names = Object.keys(input) as Representation[];
  if (names.length !== 1 || !["rawRepresentation", "x963Representation", "compressedRepresentation", "compactRepresentation", "derRepresentation", "pemRepresentation"].includes(names[0])) throw new CRFXError("invalidParameter", "Supply exactly one Apple key representation.");
  const name = names[0], value = input[name];
  if (name === "pemRepresentation" ? typeof value !== "string" : !(value instanceof NSEData)) throw new CRFXError("invalidParameter");
  return [name, value!];
}
function ecAlgorithmIdentifier(curve: Curve): Uint8Array<ArrayBuffer> { return sequence(unhex("06072a8648ce3d0201"), unhex(curves[curve].oid)); }
function validateScalar(bytes: Uint8Array, curve: Curve): void {
  if (bytes.length !== curves[curve].size) throw new CRFXError("incorrectKeySize");
  const order = unhex(curves[curve].n);
  let nonzero = 0, borrow = 0;
  // Fixed-width integer input validation only: no private BigInt or elliptic-curve arithmetic.
  for (let i = bytes.length - 1; i >= 0; i--) { nonzero |= bytes[i]; borrow = ((bytes[i] - order[i] - borrow) >> 8) & 1; }
  if (nonzero === 0 || borrow === 0) throw new CRFXError("invalidParameter", "Private scalar must be greater than zero and less than the curve order.");
}
function wrapScalar(bytes: Uint8Array, curve: Curve, publicPoint?: Uint8Array): Uint8Array<ArrayBuffer> {
  const fields = [unhex("020101"), der(4, bytes)];
  if (publicPoint) fields.push(der(0xa1, der(3, concat(Uint8Array.of(0), publicPoint))));
  return sequence(unhex("020100"), ecAlgorithmIdentifier(curve), der(4, sequence(...fields)));
}
function requireEncoding(condition: boolean): void { if (!condition) throw new CRFXError("invalidParameter", "Invalid key DER encoding."); }
function hasEncoding(node: ReturnType<typeof parseDer> | undefined, expected: Uint8Array): boolean {
  if (!node) return false;
  const encoded = der(node.tag, node.bytes);
  // These comparisons inspect public algorithm/version metadata, never secret key bytes.
  return encoded.length === expected.length && encoded.every((byte, index) => byte === expected[index]);
}
function validateSec1(bytes: Uint8Array, curve: Curve): Uint8Array | undefined {
  const parts = derSequence(bytes);
  requireEncoding(hasEncoding(parts[0], unhex("020101")) && parts[1]?.tag === 4);
  validateScalar(parts[1].bytes, curve);
  let index = 2;
  let point: Uint8Array | undefined;
  if (parts[index]?.tag === 0xa0) requireEncoding(hasEncoding(canonicalDer(parts[index++].bytes), unhex(curves[curve].oid)));
  if (parts[index]?.tag === 0xa1) {
    const publicKey = canonicalDer(parts[index++].bytes);
    requireEncoding(publicKey.tag === 3 && publicKey.bytes[0] === 0);
    point = publicKey.bytes.slice(1);
  }
  requireEncoding(index === parts.length);
  return point;
}
function ensurePkcs8(bytes: Uint8Array, curve: Curve): Uint8Array<ArrayBuffer> {
  const parts = derSequence(bytes);
  // CryptoKit accepts both SEC1 and PKCS8; each nested encoding must be consumed completely.
  if (parts[1]?.tag === 4) {
    validateSec1(bytes, curve);
    return sequence(unhex("020100"), ecAlgorithmIdentifier(curve), der(4, bytes));
  }
  requireEncoding(hasEncoding(parts[0], unhex("020100")) && hasEncoding(parts[1], ecAlgorithmIdentifier(curve)) && parts[2]?.tag === 4);
  requireEncoding(parts.length === 3 || (parts.length === 4 && parts[3].tag === 0xa0));
  validateSec1(parts[2].bytes, curve);
  return new Uint8Array(bytes);
}
function validateSpki(bytes: Uint8Array, curve: Curve): void {
  const parts = derSequence(bytes);
  requireEncoding(parts.length === 2 && hasEncoding(parts[0], ecAlgorithmIdentifier(curve)) && parts[1].tag === 3 && parts[1].bytes[0] === 0);
}
function ecInteger(bytes: Uint8Array, width: number): Uint8Array<ArrayBuffer> {
  if (!bytes.length || bytes.length > width) unsupported("The native EC integer has an invalid field width.");
  const result = new Uint8Array(width);
  result.set(bytes, width - bytes.length);
  return result;
}
async function publicFromPrivate(key: CryptoKey, curve: State["curve"], kind: Kind): Promise<CryptoKey> {
  const jwk = await provider().subtle.exportKey("jwk", key);
  delete jwk.d; delete jwk.key_ops; delete jwk.alg;
  return provider().subtle.importKey("jwk", jwk, algorithm(curve, kind), true, kind === "signing" ? ["verify"] : []);
}
async function validatePrivatePoint(key: CryptoKey, curve: Curve, kind: Kind, encoded: Uint8Array<ArrayBuffer>, point: Uint8Array): Promise<void> {
  const cryptography = provider(), subtle = cryptography.subtle, algorithm = { name: "ECDSA", namedCurve: curves[curve].name };
  // Agreement keys keep their ECDH handle/usages. A temporary native signing handle checks
  // the exact supplied point, including y's sign; ECDH shared-x equality cannot do that.
  const signingKey = kind === "signing" ? key : await subtle.importKey("pkcs8", encoded, algorithm, false, ["sign"]);
  const verifyingKey = await subtle.importKey("raw", new Uint8Array(point), algorithm, false, ["verify"]);
  const challenge = cryptography.getRandomValues(new Uint8Array(32));
  const signatureAlgorithm = { name: "ECDSA", hash: curves[curve].hash };
  const signature = await subtle.sign(signatureAlgorithm, signingKey, challenge);
  if (!await subtle.verify(signatureAlgorithm, verifyingKey, signature, challenge)) throw new CRFXError("invalidParameter", "Private and public key representations disagree.");
}
export function initPrivate(value: object, curve: State["curve"], kind: Kind, input?: boolean | Input): void {
  const alg = algorithm(curve, kind), usage: KeyUsage[] = kind === "signing" ? ["sign"] : ["deriveBits"];
  let selected: [Representation, NSEData | string] | undefined;
  if (typeof input !== "boolean" && input !== undefined) selected = inputEntry(input);
  const key = operation(async () => {
    if (!selected) {
      for (let attempt = 0; attempt < 128; attempt++) {
        const pair = await provider().subtle.generateKey(alg, true, kind === "signing" ? ["sign", "verify"] : ["deriveBits"]) as CryptoKeyPair;
        if (curve === "Curve25519" || input === false || compactable(new Uint8Array(await provider().subtle.exportKey("raw", pair.publicKey)), curve)) return pair.privateKey;
      }
      return unsupported("Unable to generate a compact-representable key.");
    }
    const [format, encoded] = selected;
    let raw = format === "pemRepresentation" ? copy(parsePem(encoded as string, true)) : copy(encoded as NSEData);
    let expectedPublic: Uint8Array | undefined;
    if (curve === "Curve25519") {
      if (format !== "rawRepresentation" || raw.length !== 32) throw new CRFXError("incorrectParameterSize");
      raw = concat(unhex(kind === "signing" ? "302e020100300506032b657004220420" : "302e020100300506032b656e04220420"), raw);
    } else {
      const size = curves[curve].size;
      if (format === "x963Representation") {
        if (raw.length !== 1 + size * 3 || raw[0] !== 4) throw new CRFXError("incorrectParameterSize");
        expectedPublic = raw.slice(0, 1 + size * 2); raw = raw.slice(1 + size * 2);
      }
      if (format === "rawRepresentation" || format === "x963Representation") {
        validateScalar(raw, curve);
        raw = wrapScalar(raw, curve, expectedPublic);
      } else if (format === "derRepresentation" || format === "pemRepresentation") {
        raw = ensurePkcs8(raw, curve);
        expectedPublic = validateSec1(derSequence(raw)[2].bytes, curve);
      }
      else throw new CRFXError("invalidParameter");
    }
    try {
      const imported = await provider().subtle.importKey("pkcs8", raw, alg, true, usage);
      if (expectedPublic && curve !== "Curve25519") await validatePrivatePoint(imported, curve, kind, raw, expectedPublic);
      return imported;
    } catch (error) {
      if (expectedPublic && (error as { name?: unknown } | null)?.name === "DataError") throw new CRFXError("invalidParameter", "Invalid private/public key representation.", 0, { cause: error });
      throw error;
    }
  });
  retain(value, { curve, kind, privateKey: true, key });
}
export function attachPublic<T extends object>(type: { prototype: T }, owner: object): T {
  const entry = state(owner), value = Object.create(type.prototype) as T;
  retain(value, { ...entry, privateKey: false, key: operation(async () => publicFromPrivate(await entry.key, entry.curve, entry.kind)) });
  return Object.freeze(value);
}
export function initPublic(value: object, curve: State["curve"], kind: Kind, input: Input): void {
  const [format, encoded] = inputEntry(input);
  const raw = format === "pemRepresentation" ? copy(parsePem(encoded as string, false)) : copy(encoded as NSEData);
  retain(value, { curve, kind, privateKey: false, key: operation(async () => {
    let bytes = raw;
    const alg = algorithm(curve, kind), usage: KeyUsage[] = kind === "signing" ? ["verify"] : [];
    if (format === "derRepresentation" || format === "pemRepresentation") {
      if (curve === "Curve25519") throw new CRFXError("invalidParameter");
      validateSpki(bytes, curve);
      return provider().subtle.importKey("spki", bytes, alg, true, usage);
    }
    if (curve === "Curve25519") {
      if (format !== "rawRepresentation" || bytes.length !== 32) throw new CRFXError("incorrectParameterSize");
    } else {
      const size = curves[curve].size;
      if (format === "rawRepresentation") {
        if (bytes.length !== size * 2) throw new CRFXError("incorrectParameterSize");
        bytes = concat(Uint8Array.of(4), bytes);
      } else if (format === "compressedRepresentation" || format === "compactRepresentation") bytes = uncompress(bytes, curve, format === "compactRepresentation");
      else if (format !== "x963Representation") throw new CRFXError("invalidParameter");
      if (bytes.length !== 1 + size * 2 || bytes[0] !== 4) throw new CRFXError("incorrectParameterSize");
    }
    return provider().subtle.importKey("raw", bytes, alg, true, usage);
  }) });
}
export function representation(value: object, format: Exclude<Representation, "pemRepresentation">): Promise<NSEData | null> {
  const entry = state(value);
  return operation(async () => {
    const key = await entry.key;
    if (format === "derRepresentation") return NSEData.from(await provider().subtle.exportKey(entry.privateKey ? "pkcs8" : "spki", key));
    if (entry.privateKey) {
      let jwk: JsonWebKey;
      try { jwk = await provider().subtle.exportKey("jwk", key); }
      catch (error) {
        if (entry.curve === "Curve25519" || format !== "rawRepresentation") throw error;
        // A provider may retain the private scalar while lacking the public point needed for JWK.
        const pkcs8 = ensurePkcs8(new Uint8Array(await provider().subtle.exportKey("pkcs8", key)), entry.curve);
        const sec1 = derSequence(derSequence(pkcs8)[2].bytes);
        return NSEData.from(ecInteger(sec1[1].bytes, curves[entry.curve].size));
      }
      // NIST EC JWK fields are unsigned integers; some providers omit leading zero bytes.
      // Curve25519 fields are octet strings and must never receive numeric padding.
      const scalar = entry.curve === "Curve25519" ? fromBase64url(jwk.d!) : ecInteger(fromBase64url(jwk.d!), curves[entry.curve].size);
      if (format === "rawRepresentation") return NSEData.from(scalar);
      if (format === "x963Representation" && entry.curve !== "Curve25519") return NSEData.from(concat(Uint8Array.of(4), ecInteger(fromBase64url(jwk.x!), curves[entry.curve].size), ecInteger(fromBase64url(jwk.y!), curves[entry.curve].size), scalar));
      throw new CRFXError("invalidParameter");
    }
    const raw = new Uint8Array(await provider().subtle.exportKey("raw", key));
    if (entry.curve === "Curve25519" || format === "x963Representation") return NSEData.from(raw);
    if (format === "rawRepresentation") return NSEData.from(raw.slice(1));
    if (format === "compressedRepresentation") return NSEData.from(concat(Uint8Array.of(2 + (raw[raw.length - 1] & 1)), raw.slice(1, 1 + curves[entry.curve].size)));
    return compactable(raw, entry.curve) ? NSEData.from(raw.slice(1, 1 + curves[entry.curve].size)) : null;
  });
}
export async function pemRepresentation(value: object): Promise<string> { return pem((await representation(value, "derRepresentation"))!, state(value).privateKey ? "PRIVATE KEY" : "PUBLIC KEY"); }
export function sign(value: object, data: NSEData | CRFXDigest): Promise<NSEData> {
  return operation(async () => {
    if (!(data instanceof NSEData)) return unsupported("Signing an already-computed digest is unavailable in the cryptographic provider.");
    const input = copy(data), entry = state(value);
    if (!entry.privateKey || entry.kind !== "signing") throw new CRFXError("invalidParameter");
    const alg = entry.curve === "Curve25519" ? { name: "Ed25519" } : { name: "ECDSA", hash: curves[entry.curve].hash };
    return NSEData.from(await provider().subtle.sign(alg, await entry.key, input));
  });
}
export function verify(value: object, signature: NSEData, data: NSEData | CRFXDigest): Promise<boolean> {
  return operation(async () => {
    if (!(data instanceof NSEData)) return unsupported("Verifying an already-computed digest is unavailable in the cryptographic provider.");
    const input = copy(data), sig = copy(signature), entry = state(value);
    if (entry.privateKey || entry.kind !== "signing") throw new CRFXError("invalidParameter");
    const alg = entry.curve === "Curve25519" ? { name: "Ed25519" } : { name: "ECDSA", hash: curves[entry.curve].hash };
    return provider().subtle.verify(alg, await entry.key, sig, input);
  });
}
export function agree(value: object, publicValue: object): Promise<CRFXSharedSecret> {
  return operation(async () => {
    const entry = state(value), peer = state(publicValue);
    if (!entry.privateKey || peer.privateKey || entry.kind !== "agreement" || peer.kind !== "agreement" || entry.curve !== peer.curve) throw new CRFXError("invalidParameter");
    const shared = await provider().subtle.deriveBits({ name: entry.curve === "Curve25519" ? "X25519" : "ECDH", public: await peer.key }, await entry.key, entry.curve === "Curve25519" ? 256 : curves[entry.curve].size * 8);
    return makeValue(CRFXSharedSecret, NSEData.from(shared));
  });
}
