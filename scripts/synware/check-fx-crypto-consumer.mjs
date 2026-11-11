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

import assert from "node:assert/strict";
import { createECDH, createPrivateKey } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { createInstalledConsumer, runNode } from "./installed-consumer.mjs";

// Real browser-worker acceptance for the independently installed CryptoFX framework.
const consumer = createInstalledConsumer(process.cwd(), "synware-crypto-browser-");
const field = (tag, bytes) => Buffer.concat([Buffer.from(bytes.length < 128 ? [tag, bytes.length] : bytes.length < 256 ? [tag, 0x81, bytes.length] : [tag, 0x82, bytes.length >>> 8, bytes.length & 255]), bytes]);
const sequence = (...parts) => field(0x30, Buffer.concat(parts));
const adjacent = (value, change) => { const result = Buffer.from(value); for (let i = result.length - 1; i >= 0; i--) { const n = result[i] + change; result[i] = n & 255; if (n >= 0 && n < 256) break; } return result; };
// Deterministic fixtures use native EC point generation. Only public-coordinate negation
// is used to construct an adversarial point; no private EC arithmetic is implemented here.
const privateImportFixtures = Object.fromEntries([
  ["prime256v1", "P-256", 32, "06082a8648ce3d030107", "ffffffff00000001000000000000000000000000ffffffffffffffffffffffff", "ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"],
  ["secp384r1", "P-384", 48, "06052b81040022", "fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffff", "ffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973"],
  ["secp521r1", "P-521", 66, "06052b81040023", "01" + "ff".repeat(65), "01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409"],
].map(([curve, crv, width, oid, prime, order]) => {
  const scalar = Buffer.alloc(width); scalar[width - 1] = 1;
  const point = createECDH(curve).setPrivateKey(scalar).getPublicKey(), boundary = Buffer.from(order, "hex");
  const encode = (secret, publicPoint) => {
    const sec1 = sequence(Buffer.from([2, 1, 1]), field(4, secret), field(0xa0, Buffer.from(oid, "hex")), field(0xa1, field(3, Buffer.concat([Buffer.from([0]), publicPoint]))));
    const der = sequence(Buffer.from([2, 1, 0]), sequence(Buffer.from("06072a8648ce3d0201", "hex"), Buffer.from(oid, "hex")), field(4, sec1));
    return { raw: secret.toString("base64"), point: publicPoint.toString("base64"), x963: Buffer.concat([publicPoint, secret]).toString("base64"), der: der.toString("base64"), sec1: sec1.toString("base64") };
  };
  const negative = Buffer.from(point), y = BigInt("0x" + point.subarray(1 + width).toString("hex"));
  Buffer.from((BigInt("0x" + prime) - y).toString(16).padStart(width * 2, "0"), "hex").copy(negative, 1 + width);
  const different = createECDH(curve).setPrivateKey(adjacent(scalar, 1)).getPublicKey(), offCurve = Buffer.alloc(point.length); offCurve[0] = 4;
  const positive = [scalar, adjacent(boundary, -1)].map(secret => {
    const publicPoint = createECDH(curve).setPrivateKey(secret).getPublicKey();
    const key = createPrivateKey({ format: "jwk", key: { kty: "EC", crv, d: secret.toString("base64url"), x: publicPoint.subarray(1, 1 + width).toString("base64url"), y: publicPoint.subarray(1 + width).toString("base64url") } });
    return { ...encode(secret, publicPoint), der: key.export({ type: "pkcs8", format: "der" }).toString("base64"), sec1: key.export({ type: "sec1", format: "der" }).toString("base64") };
  });
  return [width, { positive, badPoints: [different, negative, offCurve].map(publicPoint => encode(scalar, publicPoint)), badScalars: [Buffer.alloc(width), boundary, adjacent(boundary, 1)].map(secret => encode(secret, point)) }];
}));
const scalarOneFixtures = Object.fromEntries(Object.entries(privateImportFixtures).map(([width, fixture]) => [width, fixture.positive[0].der]));
writeFileSync(join(consumer.root, "worker.ts"), `
import { NSEData } from "@syndromatic/syncloudos/foundation";
import { CRFXSHA256, CRFXSymmetricKey, CRFXAES, CRFXChaChaPoly, CRFXError, CRFXP256, CRFXP384, CRFXP521, CRFXSymmetricKeySize, CRFXSharedSecret, CRFXSHA256Digest, CRFXHMAC, CRFXHKDF } from "@syndromatic/syncloudos/fx/crypto";
const scalarOneFixtures: Record<number, string> = ${JSON.stringify(scalarOneFixtures)};
const privateImportFixtures = ${JSON.stringify(privateImportFixtures)};
(async () => {
  const data = NSEData.from(new TextEncoder().encode("CRFX worker"));
  const scalarOnlyPublicPoints = [];
  let privateImportChecks = 0;
  const key = new CRFXSymmetricKey(CRFXSymmetricKeySize.bits256);
  const rejected = async (body: () => unknown, code: string, message?: string) => {
    try { await body(); } catch (error) { if (error instanceof CRFXError && error.code === code && (!message || error.message === message)) return; throw error; }
    throw new Error("Missing CRFXError: " + code);
  };
  await rejected(() => new CRFXSymmetricKey({ copyingWithZeroing: data }), "underlyingCoreCryptoError");
  await rejected(() => new CRFXSymmetricKey(CRFXSymmetricKeySize.bits256, () => { throw new Error("Unexpected callback"); }), "underlyingCoreCryptoError");
  for (const Cipher of [CRFXAES.GCM, CRFXChaChaPoly]) {
    await rejected(() => Cipher.sealInPlace(data, key, new Cipher.Nonce(), null, data), "underlyingCoreCryptoError");
    await rejected(() => Cipher.openInPlace(data, key, new Cipher.Nonce(), null, data), "underlyingCoreCryptoError");
  }
  await rejected(() => CRFXHKDF(CRFXSHA256).deriveKey(key, null, null, data), "underlyingCoreCryptoError");
  await rejected(() => CRFXHKDF(CRFXSHA256).expand(data, null, data), "underlyingCoreCryptoError");
  await rejected(() => CRFXAES.GCM.seal(data, null as never), "invalidParameter");
  let nested = new Uint8Array([5, 0]);
  for (let i = 1; i < 11; i++) nested = new Uint8Array([0x30, nested.length, ...nested]);
  for (const [Key, label] of [[CRFXP256.Signing.PublicKey, "PUBLIC KEY"], [CRFXP256.Signing.PrivateKey, "PRIVATE KEY"]] as const) {
    for (const representation of [{ derRepresentation: NSEData.from(nested) }, { pemRepresentation: "-----BEGIN " + label + "-----\\n" + NSEData.from(nested).base64EncodedString() + "\\n-----END " + label + "-----" }]) {
      await rejected(() => new Key(representation).rawRepresentation, "invalidParameter", "DER nesting exceeds the maximum depth of 10.");
    }
  }
  const box = await CRFXAES.GCM.seal(data, key);
  if (!(await CRFXAES.GCM.open(box, key)).isEqual(data)) throw new Error("AES failed");
  const signing = new CRFXP256.Signing.PrivateKey();
  if (!await signing.publicKey.isValidSignature(await signing.signature(data), data)) throw new Error("ECDSA failed");
  const a = new CRFXP256.KeyAgreement.PrivateKey(), b = new CRFXP256.KeyAgreement.PrivateKey();
  if (!CRFXSharedSecret["=="](await a.sharedSecretFromKeyAgreement(b.publicKey), await b.sharedSecretFromKeyAgreement(a.publicKey))) throw new Error("ECDH failed");
  const hash = new CRFXSHA256(); hash.update(data);
  if (!CRFXSHA256Digest["=="](await hash.finalize(), await CRFXSHA256.hash(data))) throw new Error("Hash mismatch");
  const HMAC = CRFXHMAC(CRFXSHA256), code = await HMAC.authenticationCode(data, key);
  if (!code.description.startsWith("HMAC with SHA256: ")) throw new Error("HMAC description failed");
  if (!await HMAC.isValidAuthenticationCode(code, data, key)) throw new Error("HMAC failed");
  const chunk = NSEData.from(new Uint8Array([120])), stream = new CRFXSHA256(), mac = new HMAC(key);
  for (let i = 0; i < 150_000; i++) { stream.update(chunk); mac.update(chunk); }
  const complete = NSEData.from(new Uint8Array(150_000).fill(120));
  if (!CRFXSHA256Digest["=="](await stream.finalize(), await CRFXSHA256.hash(complete))) throw new Error("Streaming hash failed");
  if (!await HMAC.isValidAuthenticationCode(await mac.finalize(), complete, key)) throw new Error("Streaming HMAC failed");
  if ((await CRFXHKDF(CRFXSHA256).deriveKey(key, 32)).bitCount !== 256) throw new Error("HKDF failed");
  for (const Curve of [CRFXP256, CRFXP384, CRFXP521]) {
    const width = Curve === CRFXP256 ? 32 : Curve === CRFXP384 ? 48 : 66;
    const scalar = new Uint8Array(width); scalar[width - 1] = 1;
    const fixture = privateImportFixtures[width];
    const representations = (value: { raw: string; x963: string; der: string; sec1: string }) => [
      { rawRepresentation: NSEData.fromBase64(value.raw) }, { x963Representation: NSEData.fromBase64(value.x963) },
      { derRepresentation: NSEData.fromBase64(value.der) }, { pemRepresentation: "-----BEGIN PRIVATE KEY-----\\n" + value.der + "\\n-----END PRIVATE KEY-----" },
      { derRepresentation: NSEData.fromBase64(value.sec1) }, { pemRepresentation: "-----BEGIN EC PRIVATE KEY-----\\n" + value.sec1 + "\\n-----END EC PRIVATE KEY-----" },
    ];
    for (const Kind of [Curve.Signing, Curve.KeyAgreement]) {
      for (const value of fixture.positive) {
        for (const [index, input] of representations(value).entries()) {
          const key = new Kind.PrivateKey(input);
          if (!(await key.rawRepresentation).isEqual(NSEData.fromBase64(value.raw))) throw new Error("Private scalar round trip failed");
          if (index && (!(await key.publicKey.x963Representation).isEqual(NSEData.fromBase64(value.point)) || !(await key.x963Representation).isEqual(NSEData.fromBase64(value.x963)))) throw new Error("Supplied X9.63 point was lost");
          privateImportChecks++;
        }
      }
      for (const value of fixture.badPoints) for (const input of representations(value).slice(1)) { await rejected(() => new Kind.PrivateKey(input).rawRepresentation, "invalidParameter"); privateImportChecks++; }
      for (const value of fixture.badScalars) for (const input of representations(value)) { await rejected(() => new Kind.PrivateKey(input).rawRepresentation, "invalidParameter"); privateImportChecks++; }
      const x963 = NSEData.fromBase64(fixture.positive[0].x963).bytes;
      for (const malformed of [x963.slice(1), new Uint8Array([2, ...x963.slice(1)])]) { await rejected(() => new Kind.PrivateKey({ x963Representation: NSEData.from(malformed) }).rawRepresentation, "incorrectParameterSize"); privateImportChecks++; }
    }
    const directSigning = new Curve.Signing.PrivateKey({ x963Representation: NSEData.fromBase64(fixture.positive[0].x963) });
    if (!await directSigning.publicKey.isValidSignature(await directSigning.signature(data), data)) throw new Error("Direct X9.63 signing failed");
    const directAgreement = new Curve.KeyAgreement.PrivateKey({ x963Representation: NSEData.fromBase64(fixture.positive[0].x963) });
    const agreementPeer = new Curve.KeyAgreement.PrivateKey({ x963Representation: NSEData.fromBase64(fixture.positive[1].x963) });
    if (!CRFXSharedSecret["=="](await directAgreement.sharedSecretFromKeyAgreement(agreementPeer.publicKey), await agreementPeer.sharedSecretFromKeyAgreement(directAgreement.publicKey))) throw new Error("Direct X9.63 agreement failed");
    const scalarOnly = new Curve.Signing.PrivateKey({ rawRepresentation: NSEData.from(scalar) });
    if (!(await scalarOnly.rawRepresentation).isEqual(NSEData.from(scalar))) throw new Error("Native scalar export fallback failed");
    let pointState = "available";
    try {
      const x963 = await scalarOnly.x963Representation;
      if (!x963.isEqual(NSEData.from(new Uint8Array([...(await scalarOnly.publicKey.x963Representation).bytes, ...scalar])))) throw new Error("Scalar-only point mismatch");
    } catch (error) {
      if (!(error instanceof CRFXError) || error.code !== "underlyingCoreCryptoError") throw error;
      await rejected(() => scalarOnly.x963Representation, "underlyingCoreCryptoError");
      await rejected(() => scalarOnly.publicKey.rawRepresentation, "underlyingCoreCryptoError");
      pointState = "unavailable";
    }
    scalarOnlyPublicPoints.push({ width, state: pointState });
    const fullPoint = new Curve.Signing.PrivateKey({ derRepresentation: NSEData.fromBase64(scalarOneFixtures[width]) });
    if (!(await fullPoint.rawRepresentation).isEqual(NSEData.from(scalar))) throw new Error("Full-point scalar width failed");
    for (const original of [new Curve.Signing.PrivateKey(false), fullPoint]) {
      const raw = await original.rawRepresentation, x963 = await original.x963Representation;
      if (raw.count !== width || x963.count !== 1 + 3 * width) throw new Error("Native EC representation width failed: " + width + "/" + raw.count + "/" + x963.count);
      if (!x963.isEqual(NSEData.from(new Uint8Array([...(await original.publicKey.x963Representation).bytes, ...raw.bytes])))) throw new Error("EC coordinate padding failed");
      const restored = new Curve.Signing.PrivateKey({ rawRepresentation: raw });
      const sig = await restored.signature(data);
      const publicKey = new Curve.Signing.PublicKey({ compressedRepresentation: await original.publicKey.compressedRepresentation });
      if (!await publicKey.isValidSignature(new Curve.Signing.ECDSASignature({ derRepresentation: sig.derRepresentation }), data)) throw new Error("Curve representation failed");
    }
    for (const Kind of [Curve.Signing, Curve.KeyAgreement]) {
      const privateKey = new Kind.PrivateKey(false);
      const trailingPublic = NSEData.from(new Uint8Array([...(await privateKey.publicKey.derRepresentation).bytes, 0]));
      const trailingPrivate = NSEData.from(new Uint8Array([...(await privateKey.derRepresentation).bytes, 0]));
      await rejected(() => new Kind.PublicKey({ derRepresentation: trailingPublic }).rawRepresentation, "invalidParameter");
      await rejected(() => new Kind.PrivateKey({ derRepresentation: trailingPrivate }).rawRepresentation, "invalidParameter");
    }
  }
  postMessage({ hash: CRFXSHA256Digest.byteCount, hasDocument: typeof document !== "undefined", scalarOnlyPublicPoints, privateImportChecks });
})().catch(error => postMessage({ error: String(error) }));
`);
writeFileSync(join(consumer.root, "entry.ts"), `
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
(globalThis as any).result = new Promise((resolve, reject) => {
  worker.onmessage = event => { worker.terminate(); resolve(event.data); };
  worker.onerror = event => reject(new Error(event.message));
});
`);
writeFileSync(join(consumer.root, "index.html"), '<script type="module" src="/entry.ts"></script>');
writeFileSync(join(consumer.root, "vite.config.mjs"), 'export default { build: { outDir: "dist" } };');
runNode(["node_modules/vite/bin/vite.js", "build"], consumer.root);
const directory = join(consumer.root, "dist");
const results = [];
for (const [engine, launcher] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await launcher.launch({ headless: true });
  try {
    const context = await browser.newContext();
    // Synthetic secure origin: all resources are fulfilled locally, with no server/listening port.
    await context.route("https://cryptofx.invalid/**", route => {
      const relative = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//u, "") || "index.html";
      if (relative.includes("..")) return route.fulfill({ status: 400 });
      try { return route.fulfill({ contentType: relative.endsWith(".js") ? "text/javascript" : "text/html", body: readFileSync(join(directory, relative)) }); }
      catch { return route.fulfill({ status: 404 }); }
    });
    const page = await context.newPage();
    await page.goto("https://cryptofx.invalid/");
    const result = await page.evaluate(() => globalThis.result);
    assert.equal(result.error, undefined, `${engine}: ${result.error}`);
    assert.equal(result.hasDocument, false);
    assert.equal(result.hash, 32);
    assert.equal(result.scalarOnlyPublicPoints.length, 3);
    assert.equal(result.privateImportChecks, 282);
    if (engine !== "firefox") assert(result.scalarOnlyPublicPoints.every(item => item.state === "available"), `${engine}: scalar-only public point unexpectedly unavailable`);
    results.push({ engine, ...result });
  } finally { await browser.close(); }
}
const output = resolve(process.env.CRFX_BROWSER_EVIDENCE_PATH ?? "docs/superpowers/evidence/2026-11-08-fx-fidelity/crypto-installed-browser.json");
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, JSON.stringify({ archiveSHA256: consumer.archiveSha256, results }, null, 2) + "\n");
console.log(JSON.stringify(results));

