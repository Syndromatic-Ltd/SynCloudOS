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

import { createECDH, createHash, createHmac, createPrivateKey } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NSEData } from "../../src/Foundation/NSEData";
import * as C from "../../src/FX/CryptoFX/public";
import { makeValue } from "../../src/FX/CryptoFX/internal/bytes";
import { canonicalDer, der, parseDer, sequence } from "../../src/FX/CryptoFX/internal/encoding";

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

describe("bounded DER nesting", () => {
  // Build the hostile fixture in linear work, without repeatedly copying subtrees.
  const nested = (depth: number): Uint8Array => {
    const headers: Uint8Array[] = [];
    let length = 2;
    for (let level = 1; level < depth; level++) {
      const header = length < 128 ? Uint8Array.of(0x30, length)
        : length < 256 ? Uint8Array.of(0x30, 0x81, length)
        : Uint8Array.of(0x30, 0x82, length >>> 8, length & 255);
      headers.push(header); length += header.length;
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (let i = headers.length - 1; i >= 0; i--) { result.set(headers[i], offset); offset += headers[i].length; }
    result.set([5, 0], offset);
    return result;
  };
  it("accepts ten node levels and rejects the eleventh before child parsing", () => {
    expect(() => canonicalDer(nested(10))).not.toThrow();
    expect(() => canonicalDer(nested(11))).toThrow(expect.objectContaining({ code: "invalidParameter", message: "DER nesting exceeds the maximum depth of 10." }));
  });
  for (const visibility of ["Public", "Private"] as const) {
    for (const format of ["DER", "PEM"] as const) {
      it(`bounds copied bytes for 15,000-level ${visibility.toLowerCase()} ${format} imports`, async () => {
        const encoded = nested(15_000), Key = visibility === "Public" ? C.CRFXP256.Signing.PublicKey : C.CRFXP256.Signing.PrivateKey;
        const label = `${visibility.toUpperCase()} KEY`;
        const input = format === "DER" ? { derRepresentation: NSEData.from(encoded) }
          : { pemRepresentation: `-----BEGIN ${label}-----\n${Buffer.from(encoded).toString("base64")}\n-----END ${label}-----` };
        const original = Uint8Array.prototype.slice;
        let copiedBytes = 0;
        const copies = vi.spyOn(Uint8Array.prototype, "slice").mockImplementation(function(this: Uint8Array, start, end) {
          const result = original.call(this, start, end); copiedBytes += result.byteLength; return result;
        });
        try {
          await expect(new Key(input).rawRepresentation).rejects.toMatchObject({ code: "invalidParameter", message: "DER nesting exceeds the maximum depth of 10." });
          // One defensive NSEData.bytes read plus at most ten parsed node payloads.
          expect(copiedBytes).toBeLessThanOrEqual(encoded.byteLength * 11);
        } finally { copies.mockRestore(); }
      });
    }
  }
});

describe("NIST native representation widths", () => {
  for (const [Curve, curve, width, scalars] of [
    [C.CRFXP256, "prime256v1", 32, [1, 379, 43]],
    [C.CRFXP384, "secp384r1", 48, [1, 197, 176]],
    [C.CRFXP521, "secp521r1", 66, [1, 2]],
  ] as const) {
    for (const kind of ["Signing", "KeyAgreement"] as const) {
      it(`${curve}.${kind} restores fixed-width scalar and coordinate representations`, async () => {
        const original = crypto.subtle.exportKey.bind(crypto.subtle);
        const exports = vi.spyOn(crypto.subtle, "exportKey").mockImplementation((async (format: KeyFormat, key: CryptoKey) => {
          if (format !== "jwk") return original(format as "raw", key);
          const jwk = await original("jwk", key);
          if (jwk.kty === "EC") for (const field of ["d", "x", "y"] as const) {
            if (jwk[field] === undefined) continue;
            const bytes = Buffer.from(jwk[field], "base64url");
            let start = 0; while (start < bytes.length - 1 && bytes[start] === 0) start++;
            jwk[field] = bytes.subarray(start).toString("base64url");
          }
          return jwk;
        }) as SubtleCrypto["exportKey"]);
        try {
          for (const number of scalars) {
            const scalar = Buffer.alloc(width); scalar.writeUInt32BE(number, width - 4);
            const point = createECDH(curve).setPrivateKey(scalar).getPublicKey();
            const key = new Curve[kind].PrivateKey({ rawRepresentation: NSEData.from(scalar) });
            expect.soft((await key.rawRepresentation).bytes).toEqual(new Uint8Array(scalar));
            expect.soft((await key.x963Representation).bytes).toEqual(new Uint8Array(Buffer.concat([point, scalar])));
          }
        } finally { exports.mockRestore(); }
      });
    }
  }
  for (const field of ["d", "x", "y"] as const) {
    it(`rejects an over-width nonzero native ${field} instead of truncating it`, async () => {
      const key = new C.CRFXP256.Signing.PrivateKey(false);
      await key.publicKey.rawRepresentation;
      const original = crypto.subtle.exportKey.bind(crypto.subtle);
      const exports = vi.spyOn(crypto.subtle, "exportKey").mockImplementation((async (format: KeyFormat, native: CryptoKey) => {
        if (format !== "jwk") return original(format as "raw", native);
        const jwk = await original("jwk", native);
        jwk[field] = Buffer.concat([Buffer.from([1]), Buffer.from(jwk[field]!, "base64url")]).toString("base64url");
        return jwk;
      }) as SubtleCrypto["exportKey"]);
      try { await expect(field === "d" ? key.rawRepresentation : key.x963Representation).rejects.toMatchObject({ code: "underlyingCoreCryptoError" }); }
      finally { exports.mockRestore(); }
    });
  }
  for (const kind of ["Signing", "KeyAgreement"] as const) {
    it(`preserves zero-prefixed Curve25519.${kind} octet strings`, async () => {
      const seed = zeros(32), key = new C.CRFXCurve25519[kind].PrivateKey({ rawRepresentation: seed });
      expect((await key.rawRepresentation).isEqual(seed)).toBe(true);
    });
  }
});

describe("native PKCS8 scalar fallback", () => {
  for (const [Curve, width] of [[C.CRFXP256, 32], [C.CRFXP384, 48], [C.CRFXP521, 66]] as const) {
    for (const kind of ["Signing", "KeyAgreement"] as const) {
      it(`recovers ${width}-byte ${kind} raw data when native JWK export has no public point`, async () => {
        const scalar = new Uint8Array(width); scalar[width - 1] = 1;
        const key = new Curve[kind].PrivateKey({ rawRepresentation: NSEData.from(scalar) });
        await key.publicKey.rawRepresentation;
        const encoded = (await key.derRepresentation).bytes, top = parseDer(encoded), version = parseDer(top.bytes), algorithm = parseDer(top.bytes, version.end), octet = parseDer(top.bytes, algorithm.end);
        const sec1 = parseDer(octet.bytes), sec1Version = parseDer(sec1.bytes), secret = parseDer(sec1.bytes, sec1Version.end);
        const withoutPoint = sequence(top.bytes.slice(0, algorithm.end), der(4, sequence(sec1.bytes.slice(0, secret.end))));
        const original = crypto.subtle.exportKey.bind(crypto.subtle);
        const exports = vi.spyOn(crypto.subtle, "exportKey").mockImplementation((async (format: KeyFormat, native: CryptoKey) => {
          if (format === "jwk") throw new DOMException("Public point unavailable", "OperationError");
          if (format === "pkcs8") return withoutPoint.buffer;
          return original(format as "raw", native);
        }) as SubtleCrypto["exportKey"]);
        try {
          expect((await key.rawRepresentation).bytes).toEqual(scalar);
          await expect(key.x963Representation).rejects.toMatchObject({ code: "underlyingCoreCryptoError" });
        } finally { exports.mockRestore(); }
      });
    }
  }
  it("rejects trailing data in the native fallback export through the bounded DER validator", async () => {
    const key = new C.CRFXP256.Signing.PrivateKey(false);
    await key.publicKey.rawRepresentation;
    const malformed = new Uint8Array([...(await key.derRepresentation).bytes, 0]);
    const original = crypto.subtle.exportKey.bind(crypto.subtle);
    const exports = vi.spyOn(crypto.subtle, "exportKey").mockImplementation((async (format: KeyFormat, native: CryptoKey) => {
      if (format === "jwk") throw new DOMException("Public point unavailable", "OperationError");
      if (format === "pkcs8") return malformed.buffer;
      return original(format as "raw", native);
    }) as SubtleCrypto["exportKey"]);
    try { await expect(key.rawRepresentation).rejects.toMatchObject({ code: "invalidParameter" }); }
    finally { exports.mockRestore(); }
  });
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
