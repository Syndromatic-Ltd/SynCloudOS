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

import { describe, expect, it } from "vitest";
import { NSEData } from "../../src/Foundation/NSEData";
import { CRFXSHA256, CRFXSHA384, CRFXSHA512, CRFXHMAC, CRFXHKDF, CRFXSymmetricKey, CRFXAES, CRFXP256, CRFXCapabilities } from "../../src/FX/CryptoFX/public";
const bytes = (s: string) => new TextEncoder().encode(s);
const hex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], x => parseInt(x, 16));
const show = (d: NSEData) => Array.from(d.bytes, x => x.toString(16).padStart(2, "0")).join("");
describe("CryptoFX WebCrypto values", () => {
  it("matches SHA known answers", async () => {
    expect(show(await CRFXSHA256.hash(bytes("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(show(await CRFXSHA384.hash(bytes("abc")))).toBe("cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7");
    expect(show(await CRFXSHA512.hash(bytes("abc")))).toBe("ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f");
  });
  it("matches RFC 4231 HMAC and verifies", async () => {
    const key = new CRFXSymmetricKey(new Uint8Array(20).fill(11));
    const mac = await CRFXHMAC.authenticationCode(bytes("Hi There"), key);
    expect(show(mac)).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
    expect(await CRFXHMAC.isValidAuthenticationCode(mac, bytes("Hi There"), key)).toBe(true);
    expect(await CRFXHMAC.isValidAuthenticationCode(mac, bytes("wrong"), key)).toBe(false);
  });
  it("matches RFC 5869 HKDF case 1", async () => {
    const key = await CRFXHKDF.deriveKey(new CRFXSymmetricKey(new Uint8Array(22).fill(11)), hex("000102030405060708090a0b0c"), hex("f0f1f2f3f4f5f6f7f8f9"), 42);
    expect(show(key.rawRepresentation)).toBe("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
  });
  it("matches NIST AES-GCM and rejects modified authentication", async () => {
    const key = new CRFXSymmetricKey(new Uint8Array(16));
    const sealed = await CRFXAES.GCM.seal(new Uint8Array(16), key, { nonce: new Uint8Array(12) });
    expect(show(sealed.ciphertext)).toBe("0388dace60b6a392f328c2b971b2fe78");
    expect(show(sealed.tag)).toBe("ab6e47d42cec13bdf53a67b21257bddf");
    expect((await CRFXAES.GCM.open(sealed, key)).count).toBe(16);
    await expect(CRFXAES.GCM.open(sealed, key, bytes("modified"))).rejects.toThrow();
  });
  it("signs, verifies, exports, and agrees P256 secrets", async () => {
    const a = await CRFXP256.Signing.PrivateKey.generate();
    const signature = await a.signature(bytes("message"));
    expect(await a.publicKey.isValidSignature(signature, bytes("message"))).toBe(true);
    expect(await a.publicKey.isValidSignature(signature, bytes("wrong"))).toBe(false);
    const imported = await CRFXP256.Signing.PublicKey.fromRawRepresentation(await a.publicKey.rawRepresentation());
    expect(await imported.isValidSignature(signature, bytes("message"))).toBe(true);
    const x = await CRFXP256.KeyAgreement.PrivateKey.generate(), y = await CRFXP256.KeyAgreement.PrivateKey.generate();
    const one = await x.sharedSecretFromKeyAgreement(y.publicKey), two = await y.sharedSecretFromKeyAgreement(x.publicKey);
    expect(one.rawRepresentation.isEqual(two.rawRepresentation)).toBe(true);
    expect((await one.hkdfDerivedSymmetricKey(new Uint8Array(), new Uint8Array(), 32)).bitCount).toBe(256);
  });
  it("copies bytes and reports worker-safe capability without DOM", async () => {
    const input = new Uint8Array(16).fill(1), key = new CRFXSymmetricKey(input); input.fill(2);
    const copy = key.rawRepresentation.bytes as Uint8Array; copy.fill(3);
    expect(key.rawRepresentation.bytes[0]).toBe(1);
    expect(CRFXCapabilities.query().webCrypto).toBe(true);
    expect(CRFXSymmetricKey.generate(256).bitCount).toBe(256);
    expect(() => CRFXSymmetricKey.generate(7)).toThrow();
  });
});

it("validates sealed boxes and key sizes, and preserves combined values", async () => {
  const key = CRFXSymmetricKey.generate();
  const box = await CRFXAES.GCM.seal(bytes("secret"), key, { authenticating: bytes("header") });
  const restored = CRFXAES.GCM.SealedBox.fromCombined(box.combined);
  expect(show(await CRFXAES.GCM.open(restored, key, bytes("header")))).toBe(show(NSEData.from(bytes("secret"))));
  const tampered = new Uint8Array(box.combined.bytes); tampered[tampered.length - 1] ^= 1;
  await expect(CRFXAES.GCM.open(CRFXAES.GCM.SealedBox.fromCombined(tampered), key, bytes("header"))).rejects.toThrow();
  expect(() => CRFXAES.GCM.SealedBox.fromCombined(new Uint8Array(27))).toThrow();
  await expect(CRFXAES.GCM.seal(bytes("x"), new CRFXSymmetricKey(new Uint8Array(3)))).rejects.toThrow();
  await expect(CRFXAES.GCM.seal(bytes("x"), key, { nonce: new Uint8Array(11) })).rejects.toThrow();
  await expect(CRFXHKDF.deriveKey(key, bytes(""), bytes(""), 8161)).rejects.toThrow();
  await expect(CRFXP256.Signing.PublicKey.fromRawRepresentation(new Uint8Array(65))).rejects.toThrow();
  const x = await CRFXP256.KeyAgreement.PrivateKey.generate(), y = await CRFXP256.KeyAgreement.PrivateKey.generate();
  const imported = await CRFXP256.KeyAgreement.PublicKey.fromRawRepresentation(await y.publicKey.rawRepresentation());
  expect((await x.sharedSecretFromKeyAgreement(imported)).rawRepresentation.isEqual((await y.sharedSecretFromKeyAgreement(x.publicKey)).rawRepresentation)).toBe(true);
});


it("snapshots async input before suspension and reports unavailable crypto", async () => {
  const input = bytes("abc"), result = CRFXSHA256.hash(input); input.fill(0);
  expect(show(await result)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    expect(CRFXCapabilities.query()).toEqual({ webCrypto: false, secureRandom: false });
    await expect(CRFXSHA256.hash(bytes("abc"))).rejects.toThrow("requires WebCrypto");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});
