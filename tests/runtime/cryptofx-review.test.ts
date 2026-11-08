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

import { createHash, createHmac, createPrivateKey } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NSEData } from "../../src/Foundation/NSEData";
import * as C from "../../src/FX/CryptoFX/public";
import { makeValue } from "../../src/FX/CryptoFX/internal/bytes";
import { der, parseDer, sequence } from "../../src/FX/CryptoFX/internal/encoding";

const data = (text: string) => NSEData.from(new TextEncoder().encode(text));
const zeros = (size: number) => NSEData.from(new Uint8Array(size));
const hex = (value: { withUnsafeBytes<T>(body: (bytes: NSEData) => T): T }) => value.withUnsafeBytes(bytes => Buffer.from(bytes.bytes).toString("hex"));
const unsupported = { code: "underlyingCoreCryptoError" };

describe("CryptoKit mutation contracts on immutable Foundation bytes", () => {
  it("retains copyingWithZeroing without falsely promising to erase immutable bytes", () => {
    const input = data("secret");
    expect(() => new C.CRFXSymmetricKey({ copyingWithZeroing: input })).toThrow(expect.objectContaining(unsupported));
    expect(input.isEqual(data("secret"))).toBe(true);
  });
  it("retains initializingWith without invoking a callback with an unusable output span", () => {
    const callback = vi.fn((_output: NSEData): void => {});
    expect(() => new C.CRFXSymmetricKey(C.CRFXSymmetricKeySize.bits256, callback)).toThrow(expect.objectContaining(unsupported));
    expect(callback).not.toHaveBeenCalled();
  });
  for (const [name, Cipher] of [["AES.GCM", C.CRFXAES.GCM], ["ChaChaPoly", C.CRFXChaChaPoly]] as const) {
    for (const method of ["sealInPlace", "openInPlace"] as const) {
      it(`${name}.${method} retains its void contract and rejects immutable mutation`, async () => {
        const input = data("message"), tag = zeros(16), key = new C.CRFXSymmetricKey(zeros(32));
        expect(typeof Cipher[method]).toBe("function");
        await expect(Cipher[method](input, key, new Cipher.Nonce(), null, tag)).rejects.toMatchObject(unsupported);
        expect(input.isEqual(data("message"))).toBe(true);
        expect(tag.isEqual(zeros(16))).toBe(true);
      });
    }
  }
  it("retains HKDF deriveKey output without returning a replacement key", async () => {
    const output = zeros(32), key = new C.CRFXSymmetricKey(data("input"));
    await expect(C.CRFXHKDF(C.CRFXSHA256).deriveKey(key, null, null, output)).rejects.toMatchObject(unsupported);
    expect(output.isEqual(zeros(32))).toBe(true);
  });
  it("retains HKDF expand into without returning a replacement key", async () => {
    const output = zeros(32);
    await expect(C.CRFXHKDF(C.CRFXSHA256).expand(data("prk"), null, output)).rejects.toMatchObject(unsupported);
    expect(output.isEqual(zeros(32))).toBe(true);
  });
});

describe("many small streaming updates", () => {
  it("hashes 150,000 one-byte SHA256 updates without a spread argument limit", async () => {
    const hash = new C.CRFXSHA256(), chunk = data("x");
    for (let i = 0; i < 150_000; i++) hash.update(chunk);
    expect(hex(await hash.finalize())).toBe(createHash("sha256").update("x".repeat(150_000)).digest("hex"));
  });
  it("authenticates 150,000 one-byte HMAC updates without a spread argument limit", async () => {
    const HMAC = C.CRFXHMAC(C.CRFXSHA256), hmac = new HMAC(new C.CRFXSymmetricKey(data("key"))), chunk = data("x");
    for (let i = 0; i < 150_000; i++) hmac.update(chunk);
    expect(hex(await hmac.finalize())).toBe(createHmac("sha256", "key").update("x".repeat(150_000)).digest("hex"));
  });
});

describe("complete canonical key encodings", () => {
  const append = (bytes: Uint8Array) => Uint8Array.from([...bytes, 0, 0, 0]);
  const pem = (bytes: Uint8Array, label: string) => `-----BEGIN ${label}-----\n${Buffer.from(bytes).toString("base64")}\n-----END ${label}-----`;
  for (const [curve, Curve] of [["P256", C.CRFXP256], ["P384", C.CRFXP384], ["P521", C.CRFXP521]] as const) {
    for (const kind of ["Signing", "KeyAgreement"] as const) {
      it(`${curve}.${kind} rejects trailing or noncanonical SPKI in DER and PEM`, async () => {
        const Key = Curve[kind], key = new Key.PrivateKey(false);
        const valid = (await key.publicKey.derRepresentation).bytes;
        const top = parseDer(valid), alg = parseDer(top.bytes);
        const noncanonicalAlgorithm = Uint8Array.from([0x30, 0x81, alg.bytes.length, ...alg.bytes]);
        const malformed = [append(valid), sequence(noncanonicalAlgorithm, top.bytes.slice(alg.end)), der(0x30, append(top.bytes))];
        for (const bytes of malformed) {
          await expect(new Key.PublicKey({ derRepresentation: NSEData.from(bytes) }).rawRepresentation).rejects.toMatchObject({ code: "invalidParameter" });
          await expect(new Key.PublicKey({ pemRepresentation: pem(bytes, "PUBLIC KEY") }).rawRepresentation).rejects.toMatchObject({ code: "invalidParameter" });
        }
      });
      it(`${curve}.${kind} rejects trailing or noncanonical PKCS8 and nested SEC1`, async () => {
        const Key = Curve[kind], key = new Key.PrivateKey(false), valid = (await key.derRepresentation).bytes;
        const top = parseDer(valid), version = parseDer(top.bytes), algorithm = parseDer(top.bytes, version.end), octet = parseDer(top.bytes, algorithm.end);
        const sec1 = parseDer(octet.bytes), sec1Version = parseDer(sec1.bytes);
        const noncanonicalVersion = Uint8Array.of(2, 2, 0, 1);
        const wrap = (inner: Uint8Array) => sequence(top.bytes.slice(0, algorithm.end), der(4, inner));
        const malformed = [append(valid), wrap(append(octet.bytes)), wrap(der(0x30, append(sec1.bytes))), wrap(sequence(noncanonicalVersion, sec1.bytes.slice(sec1Version.end)))];
        for (const bytes of malformed) {
          await expect(new Key.PrivateKey({ derRepresentation: NSEData.from(bytes) }).rawRepresentation).rejects.toMatchObject({ code: "invalidParameter" });
          await expect(new Key.PrivateKey({ pemRepresentation: pem(bytes, "PRIVATE KEY") }).rawRepresentation).rejects.toMatchObject({ code: "invalidParameter" });
        }
        const sec1Bytes = createPrivateKey({ key: Buffer.from(valid), type: "pkcs8", format: "der" }).export({ type: "sec1", format: "der" });
        await expect(new Key.PrivateKey({ derRepresentation: NSEData.from(append(sec1Bytes)) }).rawRepresentation).rejects.toMatchObject({ code: "invalidParameter" });
        await expect(new Key.PrivateKey({ pemRepresentation: pem(append(sec1Bytes), "EC PRIVATE KEY") }).rawRepresentation).rejects.toMatchObject({ code: "invalidParameter" });
      });
    }
  }
});

describe("AES malformed key errors", () => {
  for (const malformed of [null, undefined, {}, 42]) {
    it(`rejects ${String(malformed)} keys with CRFXError in seal and open`, async () => {
      const input = data("message"), key = new C.CRFXSymmetricKey(zeros(16)), box = await C.CRFXAES.GCM.seal(input, key);
      await expect(C.CRFXAES.GCM.seal(input, malformed as never)).rejects.toMatchObject({ name: "CRFXError", code: "invalidParameter" });
      await expect(C.CRFXAES.GCM.open(box, malformed as never)).rejects.toMatchObject({ name: "CRFXError", code: "invalidParameter" });
    });
  }
});

describe("Apple value descriptions", () => {
  for (const [Hash, name] of [[C.CRFXSHA256, "SHA256"], [C.CRFXSHA384, "SHA384"], [C.CRFXSHA512, "SHA512"], [C.CRFXInsecureSHA1, "SHA1"]] as const) {
    it(`${name} digest and HMAC descriptions retain Apple's complete prefix`, async () => {
      const digest = await Hash.hash(data("abc"));
      expect.soft(digest.description).toBe(`${name} digest: ${createHash(name.toLowerCase()).update("abc").digest("hex")}`);
      const code = await C.CRFXHMAC(Hash).authenticationCode(data("abc"), new C.CRFXSymmetricKey(data("key")));
      expect(code.description).toBe(`HMAC with ${name}: ${createHmac(name.toLowerCase(), "key").update("abc").digest("hex")}`);
    });
  }
  it("retains the MD5 digest description even though the native hash operation is unavailable", () => {
    const raw = NSEData.from(createHash("md5").update("abc").digest());
    expect(makeValue(C.CRFXInsecureMD5Digest, raw).description).toBe("MD5 digest: 900150983cd24fb0d6963f7d28e17f72");
  });
});
