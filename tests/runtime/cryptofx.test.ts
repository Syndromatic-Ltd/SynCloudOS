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

import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac, diffieHellman, createPrivateKey, createPublicKey, hkdfSync, verify } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { NSEData } from "../../src/Foundation/NSEData";
import * as C from "../../src/FX/CryptoFX/public";
const data = (s: string) => NSEData.from(new TextEncoder().encode(s));
const hex = (s: string) => NSEData.from(Uint8Array.from(s.match(/../g) ?? [], x => parseInt(x, 16)));
const zeros = (n: number) => NSEData.from(new Uint8Array(n));
const show = (d: NSEData) => Buffer.from(d.bytes).toString("hex");
const bytes = (v: { withUnsafeBytes<T>(body: (value: NSEData) => T): T }) => v.withUnsafeBytes(value => value);
const hashVectors = {
  sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  sha384: "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
  sha512: "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
  sha1: "a9993e364706816aba3e25717850c26c9cd0d89d",
};
const hmacVectors = {
  sha256: "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
  sha384: "afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6",
  sha512: "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
};
afterEach(() => vi.unstubAllGlobals());

describe("CryptoKit hash values", () => {
  for (const [name, algorithm, size] of [["CRFXSHA256", "sha256", 32], ["CRFXSHA384", "sha384", 48], ["CRFXSHA512", "sha512", 64], ["CRFXInsecureSHA1", "sha1", 20]] as const) {
    it(`${name} returns a typed digest and supports incremental updates`, async () => {
      const Hash = C[name], value = await Hash.hash(data("abc"));
      expect(value).toBeInstanceOf(Hash.Digest);
      expect(Hash.Digest.byteCount).toBe(size);
      expect(show(bytes(value))).toBe(hashVectors[algorithm]);
      expect(value.description).toContain(show(bytes(value)));
      expect(Array.from(value)).toEqual(Array.from(bytes(value).bytes));
      expect(Hash.Digest["=="](value, await Hash.hash(data("abc")))).toBe(true);
      expect(Hash.Digest["=="](value, await Hash.hash(data("abd")))).toBe(false);
      const stream = new Hash(); stream.update(data("a")); stream.update(data("bc"));
      expect(Hash.Digest["=="](await stream.finalize(), value)).toBe(true);
      expect(Hash.Digest["=="](await new Hash().finalize(), await Hash.hash(zeros(0)))).toBe(true);
    });
  }
  it("selects HMAC by hash type and matches RFC 4231", async () => {
    const key = new C.CRFXSymmetricKey(hex("0b".repeat(20)));
    for (const [Hash, algorithm] of [[C.CRFXSHA256, "sha256"], [C.CRFXSHA384, "sha384"], [C.CRFXSHA512, "sha512"]] as const) {
      const HMAC = C.CRFXHMAC(Hash), code = await HMAC.authenticationCode(data("Hi There"), key);
      expect(code).toBeInstanceOf(C.CRFXHashedAuthenticationCode);
      expect(show(bytes(code))).toBe(hmacVectors[algorithm]);
      const hmac = new HMAC(key); hmac.update(data("Hi ")); hmac.update(data("There"));
      expect(C.CRFXHashedAuthenticationCode["=="](await hmac.finalize(), code)).toBe(true);
      expect(await HMAC.isValidAuthenticationCode(code, data("Hi There"), key)).toBe(true);
      expect(await HMAC.isValidAuthenticationCode(bytes(code), data("wrong"), key)).toBe(false);
    }
  });
  it("matches RFC 5869 extract, expand and deriveKey", async () => {
    const HKDF = C.CRFXHKDF(C.CRFXSHA256), key = new C.CRFXSymmetricKey(hex("0b".repeat(22)));
    const salt = hex("000102030405060708090a0b0c"), info = hex("f0f1f2f3f4f5f6f7f8f9"), prk = await HKDF.extract(key, salt);
    expect(show(bytes(prk))).toBe("077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5");
    const result = await HKDF.expand(prk, info, 42);
    expect(show(bytes(result))).toBe("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
    expect(C.CRFXSymmetricKey["=="](await HKDF.deriveKey(key, salt, info, 42), result)).toBe(true);
    expect((await HKDF.deriveKey(key, 32)).bitCount).toBe(256);
    expect((await HKDF.expand(prk, null, 0)).bitCount).toBe(0);
    await expect(HKDF.expand(prk, null, 8161)).rejects.toMatchObject({ code: "incorrectParameterSize" });
  });
  it("uses constructor-based key sizes and copies key bytes", () => {
    const input = new Uint8Array(32).fill(7), key = new C.CRFXSymmetricKey(NSEData.from(input)); input.fill(0);
    expect(bytes(key).bytes[0]).toBe(7);
    expect(new C.CRFXSymmetricKey(C.CRFXSymmetricKeySize.bits192).bitCount).toBe(192);
    expect(new C.CRFXSymmetricKey(new C.CRFXSymmetricKeySize(64)).bitCount).toBe(64);
    expect(() => new C.CRFXSymmetricKeySize(7)).toThrow(C.CRFXError);
    expect("generate" in C.CRFXSymmetricKey).toBe(false);
    expect("rawRepresentation" in key).toBe(false);
  });
});
describe("AES-GCM and unsupported cryptography", () => {
  it("matches NIST AES-GCM and restores both sealed-box initializers", async () => {
    const key = new C.CRFXSymmetricKey(zeros(16)), nonce = new C.CRFXAESGCMNonce(zeros(12));
    const box = await C.CRFXAES.GCM.seal(zeros(16), key, nonce);
    expect(show(box.ciphertext)).toBe("0388dace60b6a392f328c2b971b2fe78");
    expect(show(box.tag)).toBe("ab6e47d42cec13bdf53a67b21257bddf");
    expect(box.nonce).toBeInstanceOf(C.CRFXAESGCMNonce);
    const restored = new C.CRFXAESGCMSealedBox(box.combined!);
    expect((await C.CRFXAES.GCM.open(restored, key)).isEqual(zeros(16))).toBe(true);
    expect(new C.CRFXAESGCMSealedBox(nonce, box.ciphertext, box.tag).combined!.isEqual(box.combined!)).toBe(true);
    await expect(C.CRFXAES.GCM.open(restored, key, data("wrong"))).rejects.toMatchObject({ code: "authenticationFailure" });
    const longer = await C.CRFXAES.GCM.seal(data("long nonce"), key, new C.CRFXAESGCMNonce(zeros(16)));
    expect(longer.combined).toBeNull();
    expect((await C.CRFXAES.GCM.open(longer, key)).isEqual(data("long nonce"))).toBe(true);
  });
  it("reports Apple error cases for malformed input and unavailable providers", async () => {
    expect(() => new C.CRFXAESGCMNonce(zeros(11))).toThrow(C.CRFXError);
    expect(() => new C.CRFXAESGCMSealedBox(zeros(27))).toThrow(C.CRFXError);
    await expect(C.CRFXAES.GCM.seal(data("x"), new C.CRFXSymmetricKey(zeros(3)))).rejects.toMatchObject({ code: "incorrectKeySize" });
    await expect(C.CRFXChaChaPoly.seal(data("x"), new C.CRFXSymmetricKey(zeros(32)))).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
    await expect(C.CRFXInsecure.MD5.hash(data("x"))).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
    vi.stubGlobal("crypto", undefined);
    await expect(C.CRFXSHA256.hash(data("abc"))).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
  });
});
for (const [Curve, name, width, algorithm] of [[() => C.CRFXP256, "P256", 32, "sha256"], [() => C.CRFXP384, "P384", 48, "sha384"], [() => C.CRFXP521, "P521", 66, "sha512"]] as const) {
  describe(name, () => {
    it("signs with typed raw/DER signatures and interoperates with Node", async () => {
      const curve = Curve(), key = new curve.Signing.PrivateKey(false), message = data("signature"), signature = await key.signature(message);
      expect(signature).toBeInstanceOf(curve.Signing.ECDSASignature);
      expect(signature.rawRepresentation.count).toBe(width * 2);
      const decoded = new curve.Signing.ECDSASignature({ derRepresentation: signature.derRepresentation });
      expect(decoded.rawRepresentation.isEqual(signature.rawRepresentation)).toBe(true);
      expect(await key.publicKey.isValidSignature(decoded, message)).toBe(true);
      expect(await key.publicKey.isValidSignature(decoded, data("changed"))).toBe(false);
      expect(verify(algorithm, Buffer.from(message.bytes), await key.publicKey.pemRepresentation, Buffer.from(signature.derRepresentation.bytes))).toBe(true);
      await expect(key.signature(await C.CRFXSHA256.hash(message))).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
      expect(() => new curve.Signing.ECDSASignature({ derRepresentation: hex("3006020180020101") })).toThrow(C.CRFXError);
      expect(() => new curve.Signing.ECDSASignature({ rawRepresentation: zeros(3) })).toThrow(C.CRFXError);
    });
    it("roundtrips Apple's key representations and imports external keys", async () => {
      const curve = Curve(), original = new curve.Signing.PrivateKey(false), message = data("representations");
      for (const representation of ["rawRepresentation", "x963Representation", "derRepresentation", "pemRepresentation"] as const) {
        const restored = new curve.Signing.PrivateKey({ [representation]: await original[representation] } as never);
        expect((await restored.rawRepresentation).isEqual(await original.rawRepresentation)).toBe(true);
        expect(await original.publicKey.isValidSignature(await restored.signature(message), message)).toBe(true);
      }
      for (const representation of ["rawRepresentation", "x963Representation", "derRepresentation", "pemRepresentation", "compressedRepresentation"] as const) {
        const restored = new curve.Signing.PublicKey({ [representation]: await original.publicKey[representation] } as never);
        expect(await restored.isValidSignature(await original.signature(message), message)).toBe(true);
      }
      expect(createPublicKey(createPrivateKey(await original.pemRepresentation)).export({ format: "der", type: "spki" })).toEqual(Buffer.from((await original.publicKey.derRepresentation).bytes));
      const compactKey = new curve.Signing.PrivateKey(), compact = await compactKey.publicKey.compactRepresentation;
      expect(compact?.count).toBe(width);
      const restored = new curve.Signing.PublicKey({ compactRepresentation: compact! });
      expect(await restored.isValidSignature(await compactKey.signature(message), message)).toBe(true);
    });
    it("derives matching ECDH secrets, HKDF and X9.63 keys", async () => {
      const curve = Curve(), a = new curve.KeyAgreement.PrivateKey(false), b = new curve.KeyAgreement.PrivateKey(false);
      const peer = new curve.KeyAgreement.PublicKey({ derRepresentation: await b.publicKey.derRepresentation });
      const left = await a.sharedSecretFromKeyAgreement(peer), right = await b.sharedSecretFromKeyAgreement(a.publicKey);
      expect(C.CRFXSharedSecret["=="](left, right)).toBe(true);
      expect(left.description).toBe("SharedSecret: " + show(bytes(left)));
      expect(Buffer.from(bytes(left).bytes)).toEqual(diffieHellman({ privateKey: createPrivateKey(await a.pemRepresentation), publicKey: createPublicKey(await b.publicKey.pemRepresentation) }));
      const hkdf = await left.hkdfDerivedSymmetricKey(C.CRFXSHA256, data("salt"), data("info"), 32);
      expect(C.CRFXSymmetricKey["=="](hkdf, await right.hkdfDerivedSymmetricKey(C.CRFXSHA256, data("salt"), data("info"), 32))).toBe(true);
      const x963 = await left.x963DerivedSymmetricKey(C.CRFXSHA256, data("info"), 48);
      const expected = Buffer.concat([1, 2].map(n => createHash("sha256").update(Buffer.from(bytes(left).bytes)).update(Buffer.from([0, 0, 0, n])).update("info").digest())).subarray(0, 48);
      expect(Buffer.from(bytes(x963).bytes)).toEqual(expected);
      expect("rawRepresentation" in left).toBe(false);
    });
  });
}
describe("Curve25519", () => {
  it("supports Ed25519 raw keys, signatures and X25519 agreement", async () => {
    const key = new C.CRFXCurve25519.Signing.PrivateKey({ rawRepresentation: hex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60") });
    expect(show(await key.publicKey.rawRepresentation)).toBe("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    const signature = await key.signature(zeros(0));
    expect(show(signature)).toBe("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b");
    const publicKey = new C.CRFXCurve25519.Signing.PublicKey({ rawRepresentation: await key.publicKey.rawRepresentation });
    expect(await publicKey.isValidSignature(signature, zeros(0))).toBe(true);
    const a = new C.CRFXCurve25519.KeyAgreement.PrivateKey(), b = new C.CRFXCurve25519.KeyAgreement.PrivateKey();
    const restored = new C.CRFXCurve25519.KeyAgreement.PrivateKey({ rawRepresentation: await a.rawRepresentation });
    expect(C.CRFXSharedSecret["=="](await restored.sharedSecretFromKeyAgreement(b.publicKey), await b.sharedSecretFromKeyAgreement(a.publicKey))).toBe(true);
  });
});
it("exports per-type counterparts and keeps browser types internal", () => {
  const registry = JSON.parse(readFileSync("docs/framework/appkit-counterparts.json", "utf8"));
  expect("CRFXCapabilities" in C).toBe(false);
  for (const name of Object.keys(C)) {
    expect(registry.frameworkCounterparts[name], name).toBeTruthy();
    expect(readFileSync(`src/FX/CryptoFX/${name}.ts`, "utf8")).not.toMatch(/\b(?:CryptoKey|SubtleCrypto|NSEDataConvertible|AbortSignal|ReadableStream)\b/);
  }
  expect(readFileSync("src/FX/CryptoFX/public.ts", "utf8")).not.toMatch(/(?:class|function|interface)\s+CRFX/);
  expect(readdirSync("src/FX/CryptoFX")).not.toContain("CRFXCrypto.ts");
});

it("keeps hash finalization a snapshot and supports zero-length HMAC/HKDF inputs", async () => {
  const hash = new C.CRFXSHA256(); hash.update(data("a")); const first = await hash.finalize(); hash.update(data("b"));
  expect(C.CRFXSHA256Digest["=="](first, await C.CRFXSHA256.hash(data("a")))).toBe(true);
  expect(C.CRFXSHA256Digest["=="](await hash.finalize(), await C.CRFXSHA256.hash(data("ab")))).toBe(true);
  for (const [Hash, algorithm] of [[C.CRFXSHA256, "sha256"], [C.CRFXSHA384, "sha384"], [C.CRFXSHA512, "sha512"], [C.CRFXInsecure.SHA1, "sha1"]] as const) {
    const code = await C.CRFXHMAC(Hash).authenticationCode(zeros(0), new C.CRFXSymmetricKey(zeros(0)));
    expect(show(bytes(code))).toBe(createHmac(algorithm, Buffer.alloc(0)).digest("hex"));
    const derived = await C.CRFXHKDF(Hash).deriveKey(new C.CRFXSymmetricKey(data("input")), null, null, 53);
    expect(Buffer.from(bytes(derived).bytes)).toEqual(Buffer.from(hkdfSync(algorithm, "input", "", "", 53)));
  }
});

it("rejects malformed signatures, keys and mismatched agreement types with CRFXError", async () => {
  expect(() => new C.CRFXP256SigningECDSASignature(null as never)).toThrow(C.CRFXError);
  expect(() => new C.CRFXP256SigningPublicKey({} as never)).toThrow(C.CRFXError);
  const signing = new C.CRFXP256SigningPrivateKey(false);
  await expect(signing.publicKey.isValidSignature(null as never, data("x"))).rejects.toBeInstanceOf(C.CRFXError);
  await expect(new C.CRFXP256SigningPrivateKey({ rawRepresentation: zeros(31) }).rawRepresentation).rejects.toMatchObject({ code: "incorrectKeySize" });
  await expect(new C.CRFXP256SigningPublicKey({ rawRepresentation: zeros(64) }).rawRepresentation).rejects.toBeInstanceOf(C.CRFXError);
  await expect(new C.CRFXP256SigningPublicKey({ compressedRepresentation: hex("04" + "00".repeat(32)) }).rawRepresentation).rejects.toBeInstanceOf(C.CRFXError);
  const agreement = new C.CRFXP256KeyAgreementPrivateKey(false);
  await expect(agreement.sharedSecretFromKeyAgreement(signing.publicKey as never)).rejects.toMatchObject({ code: "invalidParameter" });
  await expect(agreement.sharedSecretFromKeyAgreement(new C.CRFXP384KeyAgreementPrivateKey(false).publicKey as never)).rejects.toMatchObject({ code: "invalidParameter" });
  const signature = await signing.signature(data("x"));
  await expect(signing.publicKey.isValidSignature(signature, await C.CRFXSHA256.hash(data("x")))).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
});

it("preserves ChaChaPoly values while failing unsupported cryptographic operations", async () => {
  const nonce = new C.CRFXChaChaPoly.Nonce(zeros(12));
  const box = new C.CRFXChaChaPoly.SealedBox(nonce, data("cipher"), zeros(16));
  expect(new C.CRFXChaChaPoly.SealedBox(box.combined).ciphertext.isEqual(box.ciphertext)).toBe(true);
  expect(Array.from(nonce)).toHaveLength(12);
  expect(() => new C.CRFXChaChaPoly.Nonce(zeros(13))).toThrow(C.CRFXError);
  await expect(C.CRFXChaChaPoly.open(box, new C.CRFXSymmetricKey(zeros(32)))).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
  const md5 = new C.CRFXInsecure.MD5(); md5.update(data("x"));
  await expect(md5.finalize()).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
});

it("fails the literal equality member when the constant-time primitive is unavailable", async () => {
  vi.resetModules();
  const { CRFXSymmetricKey } = await import("../../src/FX/CryptoFX/CRFXSymmetricKey");
  const { NSEData: Data } = await import("../../src/Foundation/NSEData");
  const key = new CRFXSymmetricKey(Data.from(new Uint8Array(16)));
  vi.stubGlobal("WebAssembly", undefined);
  expect(() => CRFXSymmetricKey["=="](key, key)).toThrow(expect.objectContaining({ code: "underlyingCoreCryptoError" }));
});

it("retains constructor and derived-public-key rejection until an Apple member is awaited", async () => {
  const unhandled: unknown[] = [];
  const observe = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", observe);
  try {
    vi.stubGlobal("crypto", { subtle: { generateKey: () => Promise.reject(new DOMException("Unavailable algorithm", "NotSupportedError")) } });
    const signing = new C.CRFXP256.Signing.PrivateKey();
    const agreement = new C.CRFXCurve25519.KeyAgreement.PrivateKey();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(unhandled).toEqual([]);
    await expect(signing.rawRepresentation).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
    await expect(signing.publicKey.rawRepresentation).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
    await expect(signing.signature(data("x"))).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
    await expect(agreement.publicKey.rawRepresentation).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
  } finally { process.off("unhandledRejection", observe); }
});
