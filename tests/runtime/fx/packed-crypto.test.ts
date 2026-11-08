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
const HMAC = C.CRFXHMAC(C.CRFXSHA384), mac = new HMAC(key); mac.update(input);
check(await HMAC.isValidAuthenticationCode(await mac.finalize(), input, key));
const HKDF = C.CRFXHKDF(C.CRFXSHA512), prk = await HKDF.extract(key, input);
check((await HKDF.expand(prk, input, 33)).bitCount === 264);
const sealed = await C.CRFXAES.GCM.seal(input, key, new C.CRFXAES.GCM.Nonce());
check((await C.CRFXAES.GCM.open(new C.CRFXAES.GCM.SealedBox(sealed.combined!), key)).isEqual(input));
const signing = new C.CRFXP256.Signing.PrivateKey(false);
const publicKey = new C.CRFXP256.Signing.PublicKey({ derRepresentation: await signing.publicKey.derRepresentation });
check(await publicKey.isValidSignature(new C.CRFXP256.Signing.ECDSASignature({ derRepresentation: (await signing.signature(input)).derRepresentation }), input));
const a = new C.CRFXCurve25519.KeyAgreement.PrivateKey(), b = new C.CRFXCurve25519.KeyAgreement.PrivateKey();
const secret = await a.sharedSecretFromKeyAgreement(b.publicKey);
check(C.CRFXSharedSecret["=="](secret, await b.sharedSecretFromKeyAgreement(a.publicKey)));
check((await secret.x963DerivedSymmetricKey(C.CRFXSHA256, input, 32)).bitCount === 256);
check(!("generate" in C.CRFXSymmetricKey) && !("CRFXCapabilities" in C));
console.log("CryptoKit packed declarations and runtime passed");
`;
  writeFileSync(join(consumer.root, "specimen.ts"), specimen);
  writeFileSync(join(consumer.root, "negative.ts"), `
import { NSEData } from "@syndromatic/syncloudos/foundation";
import { CRFXSHA256, CRFXHMAC, CRFXSymmetricKey, CRFXP256, CRFXP384 } from "@syndromatic/syncloudos/fx/crypto";
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
`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: false, lib: ["ES2022", "DOM"], outDir: "out" }, files: ["specimen.ts", "negative.ts"] }));
  runNode(["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], consumer.root);
  expect(runNode(["out/specimen.js"], consumer.root)).toContain("CryptoKit packed declarations and runtime passed");
  const registry = JSON.parse(readFileSync("docs/framework/appkit-counterparts.json", "utf8"));
  for (const name of declarations.matchAll(/(?:class|interface|function) (CRFX\w+)/g)) expect(appkitCounterpartFor(name[1], registry), name[1]).toBeTruthy();
}, 120_000);
