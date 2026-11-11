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

import { createECDH, createPrivateKey } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NSEData } from "../../src/Foundation/NSEData";
import * as C from "../../src/FX/CryptoFX/public";
import { der, derSequence, sequence } from "../../src/FX/CryptoFX/internal/encoding";
import { curves } from "../../src/FX/CryptoFX/internal/curves";

const specifications = [
  ["P256", C.CRFXP256, "prime256v1", 32, "ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"],
  ["P384", C.CRFXP384, "secp384r1", 48, "ffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973"],
  ["P521", C.CRFXP521, "secp521r1", 66, "01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409"],
] as const;

function fixture(name: keyof typeof curves, nativeCurve: string, width: number, selectedScalar?: Buffer) {
  const scalar = selectedScalar ?? Buffer.alloc(width); if (!selectedScalar) scalar[width - 1] = 1;
  const other = Buffer.alloc(width); other[width - 1] = 2;
  const point = createECDH(nativeCurve).setPrivateKey(scalar).getPublicKey();
  const different = createECDH(nativeCurve).setPrivateKey(other).getPublicKey();
  const negative = Buffer.from(point);
  // Negation uses public coordinates only, solely to construct the hostile test fixture.
  const y = BigInt("0x" + point.subarray(1 + width).toString("hex"));
  Buffer.from((BigInt("0x" + curves[name].p) - y).toString(16).padStart(width * 2, "0"), "hex").copy(negative, 1 + width);
  const native = createPrivateKey({ format: "jwk", key: { kty: "EC", crv: curves[name].name, d: scalar.toString("base64url"), x: point.subarray(1, 1 + width).toString("base64url"), y: point.subarray(1 + width).toString("base64url") } });
  const pkcs8 = native.export({ type: "pkcs8", format: "der" }), sec1 = native.export({ type: "sec1", format: "der" });
  const pem = (value: Uint8Array, label: string) => `-----BEGIN ${label}-----\n${Buffer.from(value).toString("base64")}\n-----END ${label}-----`;
  const representations = (selected: Uint8Array) => {
    const replacePoint = (encoded: Buffer) => {
      expect(encoded.subarray(-point.length)).toEqual(point);
      const result = Buffer.from(encoded); result.set(selected, result.length - point.length); return result;
    };
    const pkcs8Value = replacePoint(pkcs8), sec1Value = replacePoint(sec1);
    return [
      { x963Representation: NSEData.from(Buffer.concat([selected, scalar])) },
      { derRepresentation: NSEData.from(pkcs8Value) }, { pemRepresentation: pem(pkcs8Value, "PRIVATE KEY") },
      { derRepresentation: NSEData.from(sec1Value) }, { pemRepresentation: pem(sec1Value, "EC PRIVATE KEY") },
    ];
  };
  const scalarRepresentations = (value: Uint8Array) => {
    const inner = derSequence(sec1), updatedSec1 = sequence(...inner.map((field, index) => index === 1 ? der(4, value) : der(field.tag, field.bytes)));
    const outer = derSequence(pkcs8), updatedPkcs8 = sequence(...outer.map((field, index) => index === 2 ? der(4, updatedSec1) : der(field.tag, field.bytes)));
    return [{ rawRepresentation: NSEData.from(value) }, { x963Representation: NSEData.from(Buffer.concat([point, value])) },
      { derRepresentation: NSEData.from(updatedPkcs8) }, { pemRepresentation: pem(updatedPkcs8, "PRIVATE KEY") },
      { derRepresentation: NSEData.from(updatedSec1) }, { pemRepresentation: pem(updatedSec1, "EC PRIVATE KEY") }];
  };
  return { scalar, point, different, negative, representations, scalarRepresentations };
}

function adjacent(value: Buffer, increment: 1 | -1): Buffer {
  const result = Buffer.from(value);
  for (let i = result.length - 1; i >= 0; i--) { const changed = result[i] + increment; result[i] = changed & 255; if (changed >= 0 && changed < 256) break; }
  return result;
}

/** Emulate a provider that needs supplied points and reflects them without validating d against Q. */
function reflectingProvider() {
  const nativeImport = crypto.subtle.importKey.bind(crypto.subtle), nativeExport = crypto.subtle.exportKey.bind(crypto.subtle);
  const points = new WeakMap<CryptoKey, Uint8Array>(), missing = new WeakSet<CryptoKey>();
  const imports = vi.spyOn(crypto.subtle, "importKey").mockImplementation((async (format: KeyFormat, input: BufferSource | JsonWebKey, algorithm: AlgorithmIdentifier, extractable: boolean, usages: KeyUsage[]) => {
    let supplied: Uint8Array | undefined, nativeInput = input;
    if (format === "pkcs8") {
      const fields = derSequence(new Uint8Array(input as ArrayBuffer)), inner = derSequence(fields[2].bytes);
      const publicField = inner.find(field => field.tag === 0xa1);
      if (publicField) supplied = derSequence(sequence(publicField.bytes))[0].bytes.slice(1);
      // Node would reject the inconsistent pair. Import the scalar separately while retaining
      // the claimed public point for JWK re-export, reproducing the permissive native behaviour.
      nativeInput = sequence(der(fields[0].tag, fields[0].bytes), der(fields[1].tag, fields[1].bytes), der(4, sequence(...inner.filter(field => field.tag !== 0xa1).map(field => der(field.tag, field.bytes)))));
    }
    const key = await nativeImport(format as "raw", nativeInput as BufferSource, algorithm, extractable, usages);
    if (format === "pkcs8") { if (supplied) points.set(key, supplied); else missing.add(key); }
    return key;
  }) as SubtleCrypto["importKey"]);
  const exports = vi.spyOn(crypto.subtle, "exportKey").mockImplementation((async (format: KeyFormat, key: CryptoKey) => {
    if (format !== "jwk") return nativeExport(format as "raw", key);
    if (missing.has(key)) throw new DOMException("Native public point unavailable", "OperationError");
    const jwk = await nativeExport("jwk", key), point = points.get(key);
    if (point) { const width = (point.length - 1) / 2; jwk.x = Buffer.from(point.subarray(1, 1 + width)).toString("base64url"); jwk.y = Buffer.from(point.subarray(1 + width)).toString("base64url"); }
    return jwk;
  }) as SubtleCrypto["exportKey"]);
  return () => { imports.mockRestore(); exports.mockRestore(); };
}

describe("private EC supplied-point consistency", () => {
  it("uses a fresh native CSPRNG challenge for every exact-point validation", async () => {
    const values = fixture("P256", "prime256v1", 32), input = values.representations(values.point)[0];
    let draws = 0;
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation((array => {
      new Uint8Array(array!.buffer, array!.byteOffset, array!.byteLength).fill(++draws);
      return array;
    }) as Crypto["getRandomValues"]);
    const signatures = vi.spyOn(crypto.subtle, "sign");
    try {
      await new C.CRFXP256.Signing.PrivateKey(input).rawRepresentation;
      await new C.CRFXP256.Signing.PrivateKey(input).rawRepresentation;
      expect(draws).toBe(2);
      expect(new Uint8Array(signatures.mock.calls[0][2] as Uint8Array)).toEqual(new Uint8Array(32).fill(1));
      expect(new Uint8Array(signatures.mock.calls[1][2] as Uint8Array)).toEqual(new Uint8Array(32).fill(2));
    } finally { random.mockRestore(); signatures.mockRestore(); }
  });
  for (const [name, Curve, nativeCurve, width, order] of specifications) {
    for (const kind of ["Signing", "KeyAgreement"] as const) {
      it(`${name}.${kind} preserves valid supplied points in X9.63, DER and PEM`, async () => {
        const values = fixture(name, nativeCurve, width), restore = reflectingProvider();
        try {
          for (const input of values.representations(values.point)) {
            const key = new Curve[kind].PrivateKey(input);
            expect((await key.rawRepresentation).bytes).toEqual(new Uint8Array(values.scalar));
            expect((await key.publicKey.x963Representation).bytes).toEqual(new Uint8Array(values.point));
          }
        } finally { restore(); }
      });
      it(`${name}.${kind} rejects reflected mismatched, negated and off-curve supplied points`, async () => {
        const values = fixture(name, nativeCurve, width), offCurve = new Uint8Array(1 + width * 2); offCurve[0] = 4;
        const restore = reflectingProvider();
        try {
          for (const point of [values.different, values.negative, offCurve]) {
            for (const input of values.representations(point)) await expect.soft(new Curve[kind].PrivateKey(input).rawRepresentation).rejects.toMatchObject({ code: "invalidParameter" });
          }
        } finally { restore(); }
      });
      it(`${name}.${kind} rejects 0, n and n+1 before native import across all scalar formats`, async () => {
        const values = fixture(name, nativeCurve, width), boundary = Buffer.from(order, "hex"), imports = vi.spyOn(crypto.subtle, "importKey");
        try {
          for (const scalar of [Buffer.alloc(width), boundary, adjacent(boundary, 1)]) {
            for (const input of values.scalarRepresentations(scalar)) await expect.soft(new Curve[kind].PrivateKey(input).rawRepresentation).rejects.toMatchObject({ code: "invalidParameter" });
          }
          expect(imports).not.toHaveBeenCalled();
        } finally { imports.mockRestore(); }
      });
      it(`${name}.${kind} accepts 1 and n-1 across all scalar formats`, async () => {
        for (const scalar of [undefined, adjacent(Buffer.from(order, "hex"), -1)]) {
          const values = fixture(name, nativeCurve, width, scalar);
          for (const input of values.scalarRepresentations(values.scalar)) expect((await new Curve[kind].PrivateKey(input).rawRepresentation).bytes).toEqual(new Uint8Array(values.scalar));
        }
      });
    }
  }
});
