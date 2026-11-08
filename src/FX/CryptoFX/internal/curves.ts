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

import { CRFXError } from "../CRFXError";
import { concat, hex, unhex } from "./bytes";

export const curves = {
  P256: { name: "P-256", size: 32, hash: "SHA-256", oid: "06082a8648ce3d030107", p: "ffffffff00000001000000000000000000000000ffffffffffffffffffffffff", b: "5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b" },
  P384: { name: "P-384", size: 48, hash: "SHA-384", oid: "06052b81040022", p: "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffff", b: "b3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aef" },
  P521: { name: "P-521", size: 66, hash: "SHA-512", oid: "06052b81040023", p: "01" + "ff".repeat(65), b: "0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00" },
} as const;
export type Curve = keyof typeof curves;
export function compactable(raw: Uint8Array, curve: Curve): boolean {
  const y = BigInt("0x" + hex(raw.slice(1 + curves[curve].size))), p = BigInt("0x" + curves[curve].p);
  return y <= p - y;
}
// Only public point encodings are handled here. No private scalar arithmetic.
export function uncompress(bytes: Uint8Array, curve: Curve, compact: boolean): Uint8Array<ArrayBuffer> {
  const c = curves[curve];
  if (bytes.length !== c.size + (compact ? 0 : 1)) throw new CRFXError("incorrectParameterSize");
  if (!compact && bytes[0] !== 2 && bytes[0] !== 3) throw new CRFXError("invalidParameter");
  const xBytes = compact ? bytes : bytes.slice(1), x = BigInt("0x" + hex(xBytes)), p = BigInt("0x" + c.p), b = BigInt("0x" + c.b);
  if (x >= p) throw new CRFXError("invalidParameter");
  const rhs = ((x * x % p * x - 3n * x + b) % p + p) % p;
  let power = (p + 1n) / 4n, base = rhs, y = 1n;
  while (power) { if (power & 1n) y = y * base % p; base = base * base % p; power >>= 1n; }
  if (y * y % p !== rhs) throw new CRFXError("invalidParameter", "Invalid elliptic-curve point.");
  if (compact ? y > p - y : Number(y & 1n) !== bytes[0] - 2) y = p - y;
  return concat(Uint8Array.of(4), xBytes, unhex(y.toString(16).padStart(c.size * 2, "0")));
}
