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
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { createInstalledConsumer, runNode } from "./installed-consumer.mjs";

// Real browser-worker acceptance for the independently installed CryptoFX framework.
const consumer = createInstalledConsumer(process.cwd(), "synware-crypto-browser-");
writeFileSync(join(consumer.root, "worker.ts"), `
import { NSEData } from "@syndromatic/syncloudos/foundation";
import { CRFXSHA256, CRFXSymmetricKey, CRFXAES, CRFXP256, CRFXCapabilities } from "@syndromatic/syncloudos/fx/crypto";
(async () => {
  const data = NSEData.from(new TextEncoder().encode("CRFX worker"));
  if (!CRFXCapabilities.query().webCrypto) throw new Error("WebCrypto unavailable");
  const key = CRFXSymmetricKey.generate();
  const box = await CRFXAES.GCM.seal(data, key);
  if (!(await CRFXAES.GCM.open(box, key)).isEqual(data)) throw new Error("AES failed");
  const signing = await CRFXP256.Signing.PrivateKey.generate();
  if (!await signing.publicKey.isValidSignature(await signing.signature(data), data)) throw new Error("ECDSA failed");
  const a = await CRFXP256.KeyAgreement.PrivateKey.generate(), b = await CRFXP256.KeyAgreement.PrivateKey.generate();
  if (!(await a.sharedSecretFromKeyAgreement(b.publicKey)).rawRepresentation.isEqual((await b.sharedSecretFromKeyAgreement(a.publicKey)).rawRepresentation)) throw new Error("ECDH failed");
  postMessage({ hash: (await CRFXSHA256.hash(data)).count, hasDocument: typeof document !== "undefined" });
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
const server = createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\//u, "") || "index.html";
  if (relative.includes("..")) { response.writeHead(400).end(); return; }
  try { response.setHeader("content-type", relative.endsWith(".js") ? "text/javascript" : "text/html"); response.end(readFileSync(join(directory, relative))); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const results = [];
try {
  for (const [engine, launcher] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await launcher.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const result = await page.evaluate(() => globalThis.result);
      assert.equal(result.error, undefined, `${engine}: ${result.error}`);
      assert.equal(result.hasDocument, false);
      assert.equal(result.hash, 32);
      results.push({ engine, ...result });
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
const output = resolve("docs/superpowers/evidence/2026-11-07-foundation/fx-phase4-crypto-installed-browser.json");
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, JSON.stringify({ archiveSHA256: consumer.archiveSha256, results }, null, 2) + "\n");
console.log(JSON.stringify(results));

