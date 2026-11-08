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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { createInstalledConsumer, runNode } from "./installed-consumer.mjs";

// Real browser-worker acceptance for the independently installed CryptoFX framework.
const consumer = createInstalledConsumer(process.cwd(), "synware-crypto-browser-");
writeFileSync(join(consumer.root, "worker.ts"), `
import { NSEData } from "@syndromatic/syncloudos/foundation";
import { CRFXSHA256, CRFXSymmetricKey, CRFXAES, CRFXChaChaPoly, CRFXError, CRFXP256, CRFXP384, CRFXP521, CRFXSymmetricKeySize, CRFXSharedSecret, CRFXSHA256Digest, CRFXHMAC, CRFXHKDF } from "@syndromatic/syncloudos/fx/crypto";
(async () => {
  const data = NSEData.from(new TextEncoder().encode("CRFX worker"));
  const key = new CRFXSymmetricKey(CRFXSymmetricKeySize.bits256);
  const rejected = async (body: () => unknown, code: string) => {
    try { await body(); } catch (error) { if (error instanceof CRFXError && error.code === code) return; throw error; }
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
    const original = new Curve.Signing.PrivateKey(false);
    const restored = new Curve.Signing.PrivateKey({ rawRepresentation: await original.rawRepresentation });
    const sig = await restored.signature(data);
    const publicKey = new Curve.Signing.PublicKey({ compressedRepresentation: await original.publicKey.compressedRepresentation });
    if (!await publicKey.isValidSignature(new Curve.Signing.ECDSASignature({ derRepresentation: sig.derRepresentation }), data)) throw new Error("Curve representation failed");
    for (const Kind of [Curve.Signing, Curve.KeyAgreement]) {
      const privateKey = new Kind.PrivateKey(false);
      const trailingPublic = NSEData.from(new Uint8Array([...(await privateKey.publicKey.derRepresentation).bytes, 0]));
      const trailingPrivate = NSEData.from(new Uint8Array([...(await privateKey.derRepresentation).bytes, 0]));
      await rejected(() => new Kind.PublicKey({ derRepresentation: trailingPublic }).rawRepresentation, "invalidParameter");
      await rejected(() => new Kind.PrivateKey({ derRepresentation: trailingPrivate }).rawRepresentation, "invalidParameter");
    }
  }
  postMessage({ hash: CRFXSHA256Digest.byteCount, hasDocument: typeof document !== "undefined" });
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
    results.push({ engine, ...result });
  } finally { await browser.close(); }
}
const output = resolve(process.env.CRFX_BROWSER_EVIDENCE_PATH ?? "docs/superpowers/evidence/2026-11-08-fx-fidelity/crypto-installed-browser.json");
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, JSON.stringify({ archiveSHA256: consumer.archiveSha256, results }, null, 2) + "\n");
console.log(JSON.stringify(results));

