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

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../../scripts/synware/installed-consumer.mjs";
import { appkitCounterpartFor } from "../../../scripts/developer-mcp/lookup.mjs";

it("checks the CryptoKit surface and runtime from the immutable installed SDK", () => {
  const consumer = createInstalledConsumer(process.cwd(), "synware-crypto-fidelity-");
  const declarations = readFileSync(join(consumer.root, "node_modules/@syndromatic/syncloudos/fx/crypto.d.ts"), "utf8");
  expect(declarations).not.toMatch(/\b(?:CryptoKey|SubtleCrypto|NSEDataConvertible|AbortSignal|CRFXCapabilities)\b|"SHA-256"/);
  const specimen = `
import { NSEData } from "@syndromatic/syncloudos/foundation";
import * as C from "@syndromatic/syncloudos/fx/crypto";
const input = NSEData.from(new TextEncoder().encode("packed CryptoKit"));
const check = (condition: boolean) => { if (!condition) throw new Error("Packed crypto assertion failed"); };
const digest: C.CRFXSHA256Digest = await C.CRFXSHA256.hash(input);
check(C.CRFXSHA256Digest["=="](digest, await C.CRFXSHA256.hash(input)));
const hash: C.CRFXHashFunction<C.CRFXSHA256Digest> = new C.CRFXSHA256(); hash.update(input);
check(C.CRFXSHA256Digest["=="](digest, await hash.finalize()));
const key = new C.CRFXSymmetricKey(C.CRFXSymmetricKeySize.bits256);
const unavailable = (operation: () => unknown) => {
  try { operation(); } catch (error) { check(error instanceof C.CRFXError && error.code === "underlyingCoreCryptoError"); return; }
  throw new Error("Expected unavailable immutable mutation");
};
const unavailableAsync = async (operation: Promise<void>) => {
  try { await operation; } catch (error) { check(error instanceof C.CRFXError && error.code === "underlyingCoreCryptoError"); return; }
  throw new Error("Expected unavailable immutable mutation");
};
unavailable(() => new C.CRFXSymmetricKey({ copyingWithZeroing: input }));
unavailable(() => new C.CRFXSymmetricKey(C.CRFXSymmetricKeySize.bits256, (_output: NSEData): void => { throw new Error("Callback must not be invoked"); }));
for (const Cipher of [C.CRFXAES.GCM, C.CRFXChaChaPoly]) {
  const nonce = new Cipher.Nonce();
  await unavailableAsync(Cipher.sealInPlace(input, key, nonce, null, input));
  await unavailableAsync(Cipher.openInPlace(input, key, nonce, null, input));
}
const HMAC = C.CRFXHMAC(C.CRFXSHA384), mac = new HMAC(key); mac.update(input);
check(await HMAC.isValidAuthenticationCode(await mac.finalize(), input, key));
check((await mac.finalize()).description.startsWith("HMAC with SHA384: "));
const HKDF = C.CRFXHKDF(C.CRFXSHA512), prk = await HKDF.extract(key, input);
check((await HKDF.expand(prk, input, 33)).bitCount === 264);
await unavailableAsync(HKDF.deriveKey(key, null, null, input));
await unavailableAsync(HKDF.expand(prk.withUnsafeBytes(bytes => bytes), null, input));
const sealed = await C.CRFXAES.GCM.seal(input, key, new C.CRFXAES.GCM.Nonce());
check((await C.CRFXAES.GCM.open(new C.CRFXAES.GCM.SealedBox(sealed.combined!), key)).isEqual(input));
const signing = new C.CRFXP256.Signing.PrivateKey(false);
const publicKey = new C.CRFXP256.Signing.PublicKey({ derRepresentation: await signing.publicKey.derRepresentation });
check(await publicKey.isValidSignature(new C.CRFXP256.Signing.ECDSASignature({ derRepresentation: (await signing.signature(input)).derRepresentation }), input));
const trailing = NSEData.from(new Uint8Array([...(await signing.publicKey.derRepresentation).bytes, 0]));
try { await new C.CRFXP256.Signing.PublicKey({ derRepresentation: trailing }).rawRepresentation; throw new Error("Accepted trailing DER"); }
catch (error) { check(error instanceof C.CRFXError && error.code === "invalidParameter"); }
let nested = new Uint8Array([5, 0]);
for (let i = 1; i < 11; i++) nested = new Uint8Array([0x30, nested.length, ...nested]);
for (const [Key, label] of [[C.CRFXP256.Signing.PublicKey, "PUBLIC KEY"], [C.CRFXP256.Signing.PrivateKey, "PRIVATE KEY"]] as const) {
  for (const representation of [{ derRepresentation: NSEData.from(nested) }, { pemRepresentation: "-----BEGIN " + label + "-----\\n" + NSEData.from(nested).base64EncodedString() + "\\n-----END " + label + "-----" }]) {
    try { await new Key(representation).rawRepresentation; throw new Error("Accepted excessive DER nesting"); }
    catch (error) { check(error instanceof C.CRFXError && error.code === "invalidParameter" && error.message === "DER nesting exceeds the maximum depth of 10."); }
  }
}
const a = new C.CRFXCurve25519.KeyAgreement.PrivateKey(), b = new C.CRFXCurve25519.KeyAgreement.PrivateKey();
for (const [Curve, width] of [[C.CRFXP256, 32], [C.CRFXP384, 48], [C.CRFXP521, 66]] as const) {
  const scalar = new Uint8Array(width); scalar[width - 1] = 1;
  const key = new Curve.Signing.PrivateKey({ rawRepresentation: NSEData.from(scalar) });
  check((await key.rawRepresentation).isEqual(NSEData.from(scalar)));
  check((await key.x963Representation).isEqual(NSEData.from(new Uint8Array([...(await key.publicKey.x963Representation).bytes, ...scalar]))));
  const x963 = await key.x963Representation;
  for (const Kind of [Curve.Signing, Curve.KeyAgreement]) {
    const restored = new Kind.PrivateKey({ x963Representation: x963 });
    check((await restored.rawRepresentation).isEqual(NSEData.from(scalar)));
    check((await restored.publicKey.x963Representation).isEqual(await key.publicKey.x963Representation));
    try { await new Kind.PrivateKey({ rawRepresentation: NSEData.from(new Uint8Array(width)) }).rawRepresentation; throw new Error("Accepted zero private scalar"); }
    catch (error) { check(error instanceof C.CRFXError && error.code === "invalidParameter"); }
  }
}
const secret = await a.sharedSecretFromKeyAgreement(b.publicKey);
check(C.CRFXSharedSecret["=="](secret, await b.sharedSecretFromKeyAgreement(a.publicKey)));
check((await secret.x963DerivedSymmetricKey(C.CRFXSHA256, input, 32)).bitCount === 256);
check(!("generate" in C.CRFXSymmetricKey) && !("CRFXCapabilities" in C));
console.log("CryptoKit packed declarations and runtime passed");
`;
  writeFileSync(join(consumer.root, "specimen.ts"), specimen);
  writeFileSync(join(consumer.root, "negative.ts"), `
import { NSEData } from "@syndromatic/syncloudos/foundation";
import { CRFXSHA256, CRFXHMAC, CRFXHKDF, CRFXAES, CRFXSymmetricKey, CRFXP256, CRFXP384 } from "@syndromatic/syncloudos/fx/crypto";
// @ts-expect-error Browser hash strings are not hash types.
CRFXHMAC("SHA-256");
// @ts-expect-error Foundation bytes are required.
CRFXSHA256.hash(new Uint8Array());
// @ts-expect-error Invented generate factory was removed.
CRFXSymmetricKey.generate();
// @ts-expect-error Digest equality is the literal Apple operator member.
(await CRFXSHA256.hash(NSEData.from(new Uint8Array()))).isEqual(null);
// @ts-expect-error Private constructors cannot accept browser keys.
new CRFXP256.Signing.PrivateKey({ type: "private", algorithm: { name: "ECDSA" } });
// @ts-expect-error Curve key types are distinct.
const mismatched: InstanceType<typeof CRFXP256.KeyAgreement.PublicKey> = new CRFXP384.KeyAgreement.PrivateKey().publicKey;
void mismatched;
declare const bytes: NSEData, key: CRFXSymmetricKey;
// @ts-expect-error Output-span derivation preserves Apple's void result.
const replacement: Promise<CRFXSymmetricKey> = CRFXHKDF(CRFXSHA256).deriveKey(key, null, null, bytes);
// @ts-expect-error In-place operations cannot accept browser arrays.
CRFXAES.GCM.sealInPlace(new Uint8Array(), key, new CRFXAES.GCM.Nonce(), null, bytes);
// @ts-expect-error Hash metadata stays private.
(await CRFXHMAC(CRFXSHA256).authenticationCode(bytes, key)).hash;
void replacement;
`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: false, lib: ["ES2022", "DOM"], outDir: "out" }, files: ["specimen.ts", "negative.ts"] }));
  runNode(["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], consumer.root);
  expect(runNode(["out/specimen.js"], consumer.root)).toContain("CryptoKit packed declarations and runtime passed");
  const registry = JSON.parse(readFileSync("docs/framework/appkit-counterparts.json", "utf8"));
  for (const name of declarations.matchAll(/(?:class|interface|function) (CRFX\w+)/g)) expect(appkitCounterpartFor(name[1], registry), name[1]).toBeTruthy();
}, 120_000);
